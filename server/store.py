# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 데이터 저장소 (SQLite) — 프로젝트 · 작업자 · 자료(JSON 자료셋 + 부분 리비전)"""
import hmac
import json
import sqlite3

from . import settings
from .settings import (
    DATASETS,
    DATA_DIR,
    DB_LOCK,
    DEFAULT_PROJECT,
    INITIAL_DATA_PATH,
    PROJECT_ID_CHARS,
    WHOLE,
)
from .common import AuthError, MANAGER_ROLES, USER_SELF_FIELDS, dkey, now_str
from .security import DEFAULT_PWD_HASH, is_client_hash, make_pwd_record, verify_pwd
from .permission import (
    can_write,
    clamp_progress,
    is_sys_admin,
    membership,
    merge_parts,
    normalize_role,
    own_rows,
    split_parts,
)
from .logger import write_server_log


# ---------------------------------------------------------------------------
# 저장소
# ---------------------------------------------------------------------------
class Store:
    @staticmethod
    def connect():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(settings.DB_PATH), timeout=10)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    @classmethod
    def init_schema(cls):
        with DB_LOCK:
            conn = cls.connect()
            try:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS TB_WBS_DATASET (
                      DATA_KEY TEXT PRIMARY KEY, JSON_TEXT TEXT, PART_REVS_JSON TEXT, UPDATED_AT TEXT, UPDATED_BY TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_PROJECT (
                      PROJECT_ID TEXT PRIMARY KEY, PROJECT_NAME TEXT, STATUS TEXT DEFAULT 'ACTIVE',
                      RESTRICTED INTEGER DEFAULT 0, MEMBERS_JSON TEXT DEFAULT '[]',
                      CREATED_AT TEXT, CREATED_BY TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_META (META_KEY TEXT PRIMARY KEY, META_VALUE TEXT);
                    """
                )
                conn.commit()
                cls._bootstrap_datasets(conn)
            finally:
                conn.close()
        return "SQLite 표준 테이블(TB_WBS_DATASET 외) 확인 및 초기화가 완료되었습니다."

    # ---- 최초 기동: v1.0.5 관계형 데이터 이관 또는 초기 데이터 적재 ----
    @classmethod
    def _bootstrap_datasets(cls, conn):
        """처음 실행: 빈 기본 프로젝트 + 관리자(admin / 1234, 처음 선택할 때 암호 변경) 하나만"""
        cur = conn.cursor()
        if not cur.execute("SELECT 1 FROM TB_PROJECT WHERE PROJECT_ID = ?", (DEFAULT_PROJECT,)).fetchone():
            cur.execute("INSERT INTO TB_PROJECT VALUES (?, ?, 'ACTIVE', 0, '[]', ?, 'system', 0)", (DEFAULT_PROJECT, "기본 프로젝트", now_str()))
        cur.execute("SELECT COUNT(*) FROM TB_WBS_DATASET")
        if cur.fetchone()[0] > 0:
            conn.commit()
            return
        data = {}
        if INITIAL_DATA_PATH.exists():
            try:
                data = json.loads(INITIAL_DATA_PATH.read_text(encoding="utf-8"))
            except Exception as ex:
                write_server_log(f"[ERROR] initial_data.json: {ex}")
        users = data.get("projectUsers") or []
        if not any(str(u.get("empNo", "")).lower() == "admin" for u in users):
            users.insert(0, {"empNo": "admin", "name": "관리자", "role": "SYS_ADMIN", "subsystem": "ALL", "dept": "", "pwdHash": "", "lang": "ko"})
        data["projectUsers"] = users
        for key in DATASETS:
            if key in data:
                cls._write_dataset(cur, key, data[key], {p: {"rev": 1, "by": "init", "at": now_str()} for p in split_parts(key, data[key])}, "init")
        conn.commit()

    # ---- 데이터셋 입출력 ----
    @staticmethod
    def _read_dataset(cur, key):
        cur.execute("SELECT JSON_TEXT, PART_REVS_JSON FROM TB_WBS_DATASET WHERE DATA_KEY = ?", (key,))
        row = cur.fetchone()
        if not row:
            return None, {}
        value = json.loads(row[0]) if row[0] else None
        revs = json.loads(row[1]) if row[1] else {}
        return value, revs

    @staticmethod
    def _write_dataset(cur, key, value, revs, who):
        cur.execute(
            "INSERT OR REPLACE INTO TB_WBS_DATASET (DATA_KEY, JSON_TEXT, PART_REVS_JSON, UPDATED_AT, UPDATED_BY) VALUES (?, ?, ?, ?, ?)",
            (key, json.dumps(value, ensure_ascii=False), json.dumps(revs, ensure_ascii=False), now_str(), who),
        )

    @staticmethod
    def public_value(key, value):
        """응답에서 비밀번호 해시 제거"""
        if key == "projectUsers" and isinstance(value, list):
            return [{k: v for k, v in dict(u, pwdHash="").items() if k not in ("pwdReset",)} for u in value if isinstance(u, dict)]
        return value

    @classmethod
    def load(cls, keys=None, pid=DEFAULT_PROJECT, user=None):
        keys = [k for k in (keys or DATASETS.keys()) if k in DATASETS]
        data, revs = {}, {}
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                for k in keys:
                    value, r = cls._read_dataset(cur, dkey(pid, k))
                    value, r = own_rows(k, value, r, user, pid)
                    if value is not None:
                        data[k] = cls.public_value(k, value)
                    revs[k] = r
            finally:
                conn.close()
        return data, revs

    @classmethod
    def get_users(cls):
        with DB_LOCK:
            conn = cls.connect()
            try:
                value, _ = cls._read_dataset(conn.cursor(), "projectUsers")
                return value or []
            finally:
                conn.close()

    @classmethod
    def get_subsystem_names(cls, pid=DEFAULT_PROJECT):
        with DB_LOCK:
            conn = cls.connect()
            try:
                value, _ = cls._read_dataset(conn.cursor(), dkey(pid, "subsystemsMeta"))
                return [s.get("name") for s in (value or []) if isinstance(s, dict) and s.get("name")]
            finally:
                conn.close()

    @classmethod
    def save(cls, user, changes, force=False, pid=DEFAULT_PROJECT, guard=None):
        """changes = {key: {"parts": {part: rows|row|None}, "base": {part: rev}}}
        guard(cur) → 막힌 항목 목록 ([Workgroup] 체크아웃 잠금 — server/locks.py). 하나라도 있으면 아무것도 저장하지 않음"""
        who = f"{user.get('name', '')}({user['empNo']})"
        blocked = []
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                if guard:
                    locked = guard(cur)
                    if locked:
                        conn.commit()
                        return {"ok": False, "locked": locked}
                current = {}
                conflicts = []
                accepted = {}
                for key, ch in (changes or {}).items():
                    if key not in DATASETS or not isinstance(ch, dict):
                        continue
                    value, revs = cls._read_dataset(cur, dkey(pid, key))
                    current[key] = (value, revs)
                    server_parts = split_parts(key, value) if value is not None else {}
                    parts = ch.get("parts") or {}
                    base = ch.get("base") or {}
                    ok_parts = {}
                    for p, incoming in parts.items():
                        row_for_perm = incoming if isinstance(incoming, dict) else server_parts.get(p)
                        if DATASETS[key]["scope"] == "weekly" and incoming is None:
                            row_for_perm = server_parts.get(p)
                        if not can_write(user, key, p, row_for_perm if isinstance(row_for_perm, dict) else None):
                            blocked.append(f"{key}[{p}]")
                            continue
                        # 주간보고: 다른 서브시스템 보고서로 바꿔 쓰기 방지 / 할 일: 다른 사람 항목을 내 것으로 덮어쓰기 방지
                        if DATASETS[key]["scope"] in ("weekly", "personal") and isinstance(server_parts.get(p), dict) and not can_write(user, key, p, server_parts.get(p)):
                            blocked.append(f"{key}[{p}]")
                            continue
                        if key == "projectUsers":
                            incoming = cls._sanitize_user_row(user, p, incoming, server_parts.get(p), pid)
                            if incoming == "BLOCK":
                                blocked.append(f"{key}[{p}]")
                                continue
                        server_rev = (revs.get(p) or {}).get("rev", 0)
                        if int(base.get(p, 0) or 0) != int(server_rev) and not force:
                            info = revs.get(p) or {}
                            conflicts.append({"key": key, "part": p, "by": info.get("by", ""), "at": info.get("at", "")})
                        ok_parts[p] = incoming
                    if ok_parts:
                        accepted[key] = ok_parts
                if conflicts and not force:
                    return {"ok": False, "conflict": True, "conflicts": conflicts}

                out_data, out_revs = {}, {}
                for key, ok_parts in accepted.items():
                    value, revs = current[key]
                    merged = clamp_progress(key, merge_parts(key, value, ok_parts))
                    for p in ok_parts:
                        revs[p] = {"rev": int((revs.get(p) or {}).get("rev", 0)) + 1, "by": who, "at": now_str()}
                    cls._write_dataset(cur, dkey(pid, key), merged, revs, who)
                    out_data[key], out_revs[key] = own_rows(key, cls.public_value(key, merged), revs, user, pid)
                    if key == "projectConfig" and isinstance(merged, dict) and merged.get("projectName"):
                        cur.execute("UPDATE TB_PROJECT SET PROJECT_NAME = ? WHERE PROJECT_ID = ?", (str(merged["projectName"])[:100], pid))
                conn.commit()
                return {"ok": True, "data": out_data, "revs": out_revs, "blocked": blocked,
                        "message": f"저장 완료 ({', '.join(out_data.keys()) or '변경 없음'})"}
            finally:
                conn.close()

    @staticmethod
    def _clean_project_roles(value):
        out = {}
        if isinstance(value, dict):
            for k, v in value.items():
                if isinstance(v, dict) and str(k) and set(str(k)) <= PROJECT_ID_CHARS:
                    role = normalize_role(v.get("role"))
                    out[str(k)] = {"role": "PM" if role == "SYS_ADMIN" else role, "subsystem": str(v.get("subsystem") or "ALL")[:50],
                                   "dept": str(v.get("dept") or "")[:100]}
        return out

    @staticmethod
    def _sanitize_user_row(user, part, incoming, stored, pid=DEFAULT_PROJECT):
        """[v3.0.0] 사용자 정보는 프로젝트별 (계정·비밀번호는 하나):
        - 이 프로젝트에서 바뀌는 것은 그 프로젝트의 참여 정보(projectRoles[pid] = 역할·담당·부서)와 이름·언어·비밀번호 초기화뿐
        - 삭제 = 이 프로젝트에서 빼기 (다른 프로젝트 참여가 없으면 계정 삭제)
        - 다른 프로젝트에만 있는 사번은 시스템관리자만 이 프로젝트에 추가 가능 (그 밖에는 [다른 프로젝트에서 복사] 사용)"""
        is_admin = user.get("baseRole", user["role"]) == "SYS_ADMIN"
        manager = user["role"] in MANAGER_ROLES
        stored_admin = is_sys_admin(stored)
        if incoming is None:
            if not manager or str(part).lower() == "admin" or not stored:
                return "BLOCK"
            if stored_admin:
                return None if is_admin else "BLOCK"
            pr = Store._clean_project_roles(stored.get("projectRoles"))
            pr.pop(pid, None)
            if not pr:
                return None  # 마지막 프로젝트에서 빠지면 계정 삭제
            return dict(stored, projectRoles=pr)
        row = dict(incoming)
        if stored and not stored_admin and not membership(stored, pid) and not is_admin:
            return "BLOCK"  # 다른 프로젝트 사용자를 이 프로젝트에서 덮어쓰기 방지
        # 시스템관리자 지정·해제는 시스템관리자만
        want_admin = normalize_role(row.get("role")) == "SYS_ADMIN"
        if not is_admin:
            want_admin = stored_admin
        # 참여 정보: 다른 프로젝트 항목은 보존하고 이 프로젝트 항목만 반영
        pr = dict(Store._clean_project_roles((stored or {}).get("projectRoles")))
        new_pr = Store._clean_project_roles(row.get("projectRoles"))
        row.pop("_new", None)
        if not want_admin:
            if pid in new_pr:
                pr[pid] = new_pr[pid]
            elif stored and pid in pr and manager and isinstance(row.get("projectRoles"), dict):
                pr.pop(pid)  # 이 프로젝트에서 빼기 (참여 정보를 지운 채 저장)
            elif not stored or pid not in pr:
                pr[pid] = {"role": normalize_role(row.get("role")) if normalize_role(row.get("role")) != "SYS_ADMIN" else "MEMBER",
                           "subsystem": str(row.get("subsystem") or "ALL")[:50], "dept": str(row.get("dept") or "")[:100]}
        row["projectRoles"] = pr
        row["role"] = "SYS_ADMIN" if want_admin else (normalize_role(row.get("role")) if is_admin and stored is None else normalize_role((stored or row).get("role")))
        if row["role"] == "SYS_ADMIN" and not want_admin:
            row["role"] = "MEMBER"
        reset = bool(row.pop("pwdReset", False)) and manager
        incoming_pwd = str(row.pop("pwdHash", "") or "")
        row.pop("pwdTemp", None)
        if reset:
            row["pwdHash"] = ""  # 관리자/PM 비밀번호 초기화 → 기본값(1234), 다음 로그인 시 변경 필수
            row["pwdTemp"] = False
        elif manager and is_client_hash(incoming_pwd):
            row["pwdHash"] = make_pwd_record(incoming_pwd)  # 관리자가 지정한 임시 비밀번호
            row["pwdTemp"] = True
        else:
            row["pwdHash"] = (stored or {}).get("pwdHash", "")
            row["pwdTemp"] = bool((stored or {}).get("pwdTemp", False))
        if not manager:
            if not stored:
                return "BLOCK"
            safe = dict(stored)
            for f in USER_SELF_FIELDS:
                if f in row:
                    safe[f] = row[f]
            row = safe
        if str(part).lower() == "admin":
            row["role"] = "SYS_ADMIN"
        return row

    @classmethod
    def copy_users(cls, user, src, dst, emp_nos=None):
        """[v3.0.0] 다른 프로젝트의 사용자(참여 정보: 역할·담당·부서)를 이 프로젝트로 복사. 이미 참여 중인 사용자는 건너뜀"""
        if src == dst:
            raise AuthError("같은 프로젝트에서는 복사할 수 없습니다.", 400)
        wanted = {str(e).lower() for e in emp_nos} if isinstance(emp_nos, list) else None
        copied, skipped = [], []
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                for u in users or []:
                    a = membership(u, src)
                    emp = str(u.get("empNo", ""))
                    if is_sys_admin(u) or not a or (wanted is not None and emp.lower() not in wanted):
                        continue
                    if membership(u, dst):
                        skipped.append(emp)
                        continue
                    u.setdefault("projectRoles", {})[dst] = dict(Store._clean_project_roles({src: a})[src])
                    revs[emp] = {"rev": int((revs.get(emp) or {}).get("rev", 0)) + 1, "by": f"copy({src}->{dst}) {user['empNo']}", "at": now_str()}
                    copied.append(emp)
                if copied:
                    cls._write_dataset(cur, "projectUsers", users, revs, user["empNo"])
                    conn.commit()
            finally:
                conn.close()
        return copied, skipped

    @classmethod
    def project_members(cls, pid):
        users = cls.get_users()
        return [{"empNo": u.get("empNo"), "name": u.get("name"), **membership(u, pid)} for u in users if not is_sys_admin(u) and membership(u, pid)]

    # ---- [v1.0.10] 프로젝트 목록 / 생성 / 수정 / 삭제 ----
    @staticmethod
    def _project_row(r):
        return {"id": r[0], "name": r[1] or r[0], "status": r[2] or "ACTIVE", "restricted": bool(r[3]),
                "members": json.loads(r[4] or "[]"), "createdAt": r[5] or "", "createdBy": r[6] or "", "sort": r[7] or 0}

    @classmethod
    def list_projects(cls):
        with DB_LOCK:
            conn = cls.connect()
            try:
                rows = conn.execute("SELECT PROJECT_ID, PROJECT_NAME, STATUS, RESTRICTED, MEMBERS_JSON, CREATED_AT, CREATED_BY, SORT_ORDER "
                                    "FROM TB_PROJECT ORDER BY SORT_ORDER, CREATED_AT").fetchall()
            finally:
                conn.close()
        return [cls._project_row(r) for r in rows]

    @classmethod
    def get_project(cls, pid):
        return next((p for p in cls.list_projects() if p["id"] == pid), None)

    @classmethod
    def create_project(cls, user, req):
        name = str(req.get("name") or "").strip()[:100]
        if not name:
            raise AuthError("프로젝트 이름을 입력하세요.", 400)
        start = str(req.get("startDate") or "")[:10]
        end = str(req.get("endDate") or "")[:10]
        if not (len(start) == 10 and len(end) == 10 and start <= end):
            raise AuthError("프로젝트 시작일과 종료일을 확인하세요.", 400)
        copy_from = str(req.get("copyFrom") or "")
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                ids = [r[0] for r in cur.execute("SELECT PROJECT_ID FROM TB_PROJECT").fetchall()]
                seq = 1
                while f"P{seq:03d}" in ids:
                    seq += 1
                pid = f"P{seq:03d}"
                src_cfg, src_subs, src_std = {}, [], None
                if copy_from and copy_from in ids:
                    src_cfg = cls._read_dataset(cur, dkey(copy_from, "projectConfig"))[0] or {}
                    src_subs = cls._read_dataset(cur, dkey(copy_from, "subsystemsMeta"))[0] or []
                    src_std = cls._read_dataset(cur, dkey(copy_from, "standardDeliverablesMeta"))[0]
                cfg = {k: v for k, v in src_cfg.items() if k not in ("milestones", "projectName", "projectStartDate", "projectEndDate", "reportDate")}
                cfg.update({"projectName": name, "projectStartDate": start, "projectEndDate": end, "reportDate": start})
                # [v3.0.0] 소통 채널은 프로젝트별: 전체 + 이 프로젝트의 서브시스템
                subs_for_ch = src_subs if req.get("copySubsystems", True) else []
                cfg["channels"] = ["전체"] + [str(x.get("code") or x.get("name")) for x in subs_for_ch if isinstance(x, dict) and (x.get("code") or x.get("name"))]
                data = {
                    "projectConfig": cfg,
                    "subsystemsMeta": src_subs if req.get("copySubsystems", True) else [],
                    "wbsData": [], "deliverablesData": [], "reqMasterData": [], "vocData": [],
                    "noticesData": [], "communicationsData": [], "meetingsData": [], "weeklyReportsData": [], "todosData": [],
                }
                if src_std is not None:
                    data["standardDeliverablesMeta"] = src_std
                for key, value in data.items():
                    cls._write_dataset(cur, dkey(pid, key), value,
                                       {p: {"rev": 1, "by": "create", "at": now_str()} for p in split_parts(key, value)}, user["empNo"])
                members = [user["empNo"]] if req.get("restricted") else []
                cur.execute("INSERT INTO TB_PROJECT VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, ?)",
                            (pid, name, 1 if req.get("restricted") else 0, json.dumps(members), now_str(), user["empNo"], len(ids)))
                # 만든 사람이 시스템관리자가 아니면 새 프로젝트의 PM 으로 지정
                if user.get("baseRole", user["role"]) != "SYS_ADMIN":
                    users, revs = cls._read_dataset(cur, "projectUsers")
                    me = next((u for u in users or [] if str(u.get("empNo", "")).lower() == user["empNo"].lower()), None)
                    if me is not None:
                        me.setdefault("projectRoles", {})[pid] = {"role": "PM", "subsystem": "ALL"}
                        revs[me["empNo"]] = {"rev": int((revs.get(me["empNo"]) or {}).get("rev", 0)) + 1, "by": "create-project", "at": now_str()}
                        cls._write_dataset(cur, "projectUsers", users, revs, user["empNo"])
                conn.commit()
            finally:
                conn.close()
        return cls.get_project(pid)

    @classmethod
    def update_project(cls, pid, req, is_admin):
        p = cls.get_project(pid)
        if not p:
            raise AuthError("프로젝트를 찾을 수 없습니다.", 404)
        name = str(req.get("name") if req.get("name") is not None else p["name"]).strip()[:100] or p["name"]
        status = req.get("status") if req.get("status") in ("ACTIVE", "ARCHIVED") else p["status"]
        restricted = bool(req.get("restricted")) if "restricted" in req else p["restricted"]
        members = req.get("members") if isinstance(req.get("members"), list) else p["members"]
        members = [str(m)[:30] for m in members][:500]
        if pid == DEFAULT_PROJECT:
            restricted, status = False, "ACTIVE"  # 기본 프로젝트는 항상 공개·사용 중
        if status != p["status"] and not is_admin:
            raise AuthError("보관/복원은 시스템관리자만 할 수 있습니다.", 403)
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                cur.execute("UPDATE TB_PROJECT SET PROJECT_NAME = ?, STATUS = ?, RESTRICTED = ?, MEMBERS_JSON = ? WHERE PROJECT_ID = ?",
                            (name, status, 1 if restricted else 0, json.dumps(members, ensure_ascii=False), pid))
                if name != p["name"]:
                    cfg, revs = cls._read_dataset(cur, dkey(pid, "projectConfig"))
                    if isinstance(cfg, dict):
                        cfg["projectName"] = name
                        revs[WHOLE] = {"rev": int((revs.get(WHOLE) or {}).get("rev", 0)) + 1, "by": "rename", "at": now_str()}
                        cls._write_dataset(cur, dkey(pid, "projectConfig"), cfg, revs, "rename")
                conn.commit()
            finally:
                conn.close()
        return cls.get_project(pid)

    @classmethod
    def delete_project(cls, pid):
        if pid == DEFAULT_PROJECT:
            raise AuthError("기본 프로젝트는 삭제할 수 없습니다.", 400)
        if not cls.get_project(pid):
            raise AuthError("프로젝트를 찾을 수 없습니다.", 404)
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM TB_WBS_DATASET WHERE DATA_KEY LIKE ?", (pid + "::%",))
                cur.execute("DELETE FROM TB_PROJECT WHERE PROJECT_ID = ?", (pid,))
                users, revs = cls._read_dataset(cur, "projectUsers")
                changed = False
                for u in users or []:
                    if isinstance(u.get("projectRoles"), dict) and pid in u["projectRoles"]:
                        u["projectRoles"].pop(pid)
                        changed = True
                if changed:
                    cls._write_dataset(cur, "projectUsers", users, revs, "delete-project")
                conn.commit()
            finally:
                conn.close()

    @classmethod
    def change_password(cls, emp, old_hash, new_hash):
        new_hash = str(new_hash or "").lower()
        if not is_client_hash(new_hash):
            raise AuthError("비밀번호 형식이 올바르지 않습니다.", 400)
        if hmac.compare_digest(new_hash, DEFAULT_PWD_HASH) or hmac.compare_digest(new_hash, str(old_hash or "").lower()):
            raise AuthError("초기 비밀번호나 현재 비밀번호와 다른 새 비밀번호를 입력하세요.", 400)
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                target = next((u for u in (users or []) if str(u.get("empNo", "")).lower() == emp.lower()), None)
                if not target:
                    raise AuthError("사용자를 찾을 수 없습니다.", 404)
                if not verify_pwd(target.get("pwdHash"), old_hash):
                    raise AuthError("현재 비밀번호가 일치하지 않습니다.", 403)
                target["pwdHash"] = make_pwd_record(new_hash)
                target["pwdTemp"] = False
                target["pwdChangedAt"] = now_str()
                key = target["empNo"]
                revs[key] = {"rev": int((revs.get(key) or {}).get("rev", 0)) + 1, "by": f"password({emp})", "at": now_str()}
                cls._write_dataset(cur, "projectUsers", users, revs, emp)
                conn.commit()
            finally:
                conn.close()
