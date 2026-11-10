# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 데이터 저장소 (SQLite)"""
import hmac
import json
import sqlite3
import time

from . import settings
from .settings import (
    DATASETS,
    DATA_DIR,
    DB_LOCK,
    DEFAULT_PROJECT,
    INITIAL_DATA_PATH,
    MIRROR_SCHEMA_VERSION,
    PROJECT_ID_CHARS,
    WHOLE,
)
from .common import AuthError, MANAGER_ROLES, USER_SELF_FIELDS, dkey, now_str
from .security import DEFAULT_PWD_HASH, is_client_hash, is_pwd_record, make_pwd_record, verify_pwd
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
                      DATA_KEY TEXT PRIMARY KEY,
                      JSON_TEXT TEXT,
                      PART_REVS_JSON TEXT,
                      UPDATED_AT TEXT,
                      UPDATED_BY TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_CHAT (
                      MSG_ID TEXT PRIMARY KEY,
                      CHANNEL TEXT DEFAULT '전체',
                      SENDER_NAME TEXT NOT NULL,
                      SENDER_EMP_NO TEXT,
                      USER_ROLE TEXT,
                      MESSAGE TEXT NOT NULL,
                      CREATED_AT TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_CONFIG (
                      PROJECT_ID TEXT PRIMARY KEY DEFAULT 'DEFAULT_PROJ',
                      PROJECT_START_DATE TEXT, PROJECT_END_DATE TEXT, REPORT_DATE TEXT,
                      WEEK_START_DAY INTEGER DEFAULT 5, THEME TEXT DEFAULT 'navy',
                      HOLIDAYS_JSON TEXT, STD_DELIV_JSON TEXT, FULL_CONFIG_JSON TEXT, USERS_JSON TEXT,
                      UPDATED_AT TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_SUBSYSTEM (
                      SUBSYSTEM_CODE TEXT PRIMARY KEY, SUBSYSTEM_NAME TEXT NOT NULL,
                      DOMAIN_NAME TEXT, PROJ_TYPE TEXT, SDLC_CODE TEXT, WEIGHT REAL,
                      PM_NAME TEXT, DESCRIPTION TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_TASK (
                      ROW_SEQ INTEGER PRIMARY KEY, WBS_ID TEXT, LVL INTEGER, SUBSYSTEM_NAME TEXT,
                      TASK_NAME TEXT, WEIGHT REAL, REQ_ID TEXT, PLAN_START TEXT, PLAN_END TEXT,
                      ACT_START TEXT, ACT_END TEXT, PLAN_PROG REAL, ACT_PROG REAL, OUTPUT_NOTE TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_DELIVERABLE (
                      DELIV_ID INTEGER PRIMARY KEY, SUBMIT_ROUND TEXT, SUBSYSTEM_NAME TEXT, PHASE_NAME TEXT,
                      DELIV_NAME TEXT, PLAN_DATE TEXT, ACT_DATE TEXT, STATUS TEXT, MANAGER_NAME TEXT, REMARKS TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_REQ (
                      REQ_ID TEXT, SUBSYSTEM_NAME TEXT, REQ_NAME TEXT, REQ_TYPE TEXT,
                      PRIORITY TEXT, ACCEPT_YN TEXT, STATUS TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_VOC (
                      VOC_ID TEXT, SUBSYSTEM_NAME TEXT, PRIORITY TEXT, VOC_TITLE TEXT, REQUESTER TEXT,
                      REQ_DATE TEXT, TARGET_DATE TEXT, STATUS TEXT, ACTION_NOTE TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_NOTICE (
                      NOTICE_ID TEXT, TITLE TEXT, CONTENT TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                      NOTICE_DATE TEXT, PRIORITY TEXT, IS_PINNED INTEGER DEFAULT 0, VIEW_COUNT INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_COMMUNICATION (
                      COMM_ID TEXT, CHANNEL TEXT, TASK_ID TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                      USER_ROLE TEXT, CONTENT TEXT, POST_DATE TEXT, REPLIES_JSON TEXT
                    );
                    """
                )
                conn.commit()
                cls._bootstrap_datasets(conn)
                cls._upgrade_password_records(conn)
                cls._upgrade_multi_project(conn)
                cls._upgrade_memberships(conn)
            finally:
                conn.close()
        return "SQLite 표준 테이블(TB_WBS_DATASET 외) 확인 및 초기화가 완료되었습니다."

    # ---- [v3.0.0] 사용자 정보 프로젝트별: 지금 접근할 수 있던 프로젝트마다 참여 정보(역할·담당·부서)를 만들어 둠 (1회) ----
    @classmethod
    def _upgrade_memberships(cls, conn):
        cur = conn.cursor()
        if cur.execute("SELECT 1 FROM TB_META WHERE META_KEY = 'membership_v3'").fetchone():
            return
        users, revs = cls._read_dataset(cur, "projectUsers")
        projects = [cls._project_row(r) for r in cur.execute(
            "SELECT PROJECT_ID, PROJECT_NAME, STATUS, RESTRICTED, MEMBERS_JSON, CREATED_AT, CREATED_BY, SORT_ORDER FROM TB_PROJECT").fetchall()]
        changed = False
        for u in users or []:
            if not isinstance(u, dict) or is_sys_admin(u):
                continue
            pr = cls._clean_project_roles(u.get("projectRoles"))
            emp = str(u.get("empNo", "")).lower()
            for p in projects:
                old_access = not p["restricted"] or emp in {str(m).lower() for m in p["members"]}
                if old_access and p["id"] not in pr:
                    role = normalize_role(u.get("role"))
                    pr[p["id"]] = {"role": "PM" if role == "SYS_ADMIN" else role, "subsystem": str(u.get("subsystem") or "ALL")[:50],
                                   "dept": str(u.get("dept") or "")[:100]}
            if pr != u.get("projectRoles"):
                u["projectRoles"] = pr
                changed = True
        if changed:
            cls._write_dataset(cur, "projectUsers", users, revs or {}, "upgrade-v3")
        cur.execute("INSERT OR REPLACE INTO TB_META VALUES ('membership_v3', ?)", (now_str(),))
        conn.commit()

    # ---- [v1.0.10] 여러 프로젝트: 프로젝트 목록 테이블, 채팅 프로젝트 구분, 조회용 미러 테이블에 PROJECT_ID 추가 ----
    @classmethod
    def _upgrade_multi_project(cls, conn):
        cur = conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS TB_PROJECT (
              PROJECT_ID TEXT PRIMARY KEY, PROJECT_NAME TEXT, STATUS TEXT DEFAULT 'ACTIVE',
              RESTRICTED INTEGER DEFAULT 0, MEMBERS_JSON TEXT DEFAULT '[]',
              CREATED_AT TEXT, CREATED_BY TEXT, SORT_ORDER INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS TB_META (META_KEY TEXT PRIMARY KEY, META_VALUE TEXT);
            """
        )
        cols = [r[1] for r in cur.execute("PRAGMA table_info(TB_WBS_CHAT)").fetchall()]
        if "PROJECT_ID" not in cols:
            cur.execute("ALTER TABLE TB_WBS_CHAT ADD COLUMN PROJECT_ID TEXT DEFAULT 'DEFAULT'")
        if not cur.execute("SELECT 1 FROM TB_PROJECT WHERE PROJECT_ID = ?", (DEFAULT_PROJECT,)).fetchone():
            cfg = cls._read_dataset(cur, "projectConfig")[0] or {}
            cur.execute("INSERT INTO TB_PROJECT VALUES (?, ?, 'ACTIVE', 0, '[]', ?, 'system', 0)",
                        (DEFAULT_PROJECT, cfg.get("projectName") or "기본 프로젝트", now_str()))
        row = cur.execute("SELECT META_VALUE FROM TB_META WHERE META_KEY = 'mirror_schema'").fetchone()
        if not row or row[0] != MIRROR_SCHEMA_VERSION:
            # 조회용 미러 테이블은 데이터셋에서 다시 만들 수 있으므로 새 구조로 재생성
            for t in ("TB_WBS_CONFIG", "TB_WBS_SUBSYSTEM", "TB_WBS_TASK", "TB_WBS_DELIVERABLE", "TB_WBS_REQ", "TB_WBS_VOC",
                      "TB_WBS_NOTICE", "TB_WBS_COMMUNICATION"):
                cur.execute(f"DROP TABLE IF EXISTS {t}")
            cur.executescript(
                """
                CREATE TABLE TB_WBS_CONFIG (
                  PROJECT_ID TEXT PRIMARY KEY, PROJECT_START_DATE TEXT, PROJECT_END_DATE TEXT, REPORT_DATE TEXT,
                  WEEK_START_DAY INTEGER DEFAULT 5, THEME TEXT DEFAULT 'navy',
                  HOLIDAYS_JSON TEXT, STD_DELIV_JSON TEXT, FULL_CONFIG_JSON TEXT, USERS_JSON TEXT, UPDATED_AT TEXT
                );
                CREATE TABLE TB_WBS_SUBSYSTEM (
                  PROJECT_ID TEXT, SUBSYSTEM_CODE TEXT, SUBSYSTEM_NAME TEXT NOT NULL, DOMAIN_NAME TEXT, PROJ_TYPE TEXT,
                  SDLC_CODE TEXT, WEIGHT REAL, PM_NAME TEXT, DESCRIPTION TEXT, SORT_ORDER INTEGER DEFAULT 0,
                  PRIMARY KEY (PROJECT_ID, SUBSYSTEM_CODE)
                );
                CREATE TABLE TB_WBS_TASK (
                  PROJECT_ID TEXT, ROW_SEQ INTEGER, WBS_ID TEXT, LVL INTEGER, SUBSYSTEM_NAME TEXT, TASK_NAME TEXT, WEIGHT REAL,
                  REQ_ID TEXT, PLAN_START TEXT, PLAN_END TEXT, ACT_START TEXT, ACT_END TEXT, PLAN_PROG REAL, ACT_PROG REAL,
                  OUTPUT_NOTE TEXT, STATUS TEXT, PRIMARY KEY (PROJECT_ID, ROW_SEQ)
                );
                CREATE TABLE TB_WBS_DELIVERABLE (
                  PROJECT_ID TEXT, DELIV_ID INTEGER, SUBMIT_ROUND TEXT, SUBSYSTEM_NAME TEXT, PHASE_NAME TEXT, DELIV_NAME TEXT,
                  PLAN_DATE TEXT, ACT_DATE TEXT, STATUS TEXT, MANAGER_NAME TEXT, REMARKS TEXT, PRIMARY KEY (PROJECT_ID, DELIV_ID)
                );
                CREATE TABLE TB_WBS_REQ (
                  PROJECT_ID TEXT, REQ_ID TEXT, SUBSYSTEM_NAME TEXT, REQ_NAME TEXT, REQ_TYPE TEXT,
                  PRIORITY TEXT, ACCEPT_YN TEXT, STATUS TEXT, SORT_ORDER INTEGER DEFAULT 0
                );
                CREATE TABLE TB_WBS_VOC (
                  PROJECT_ID TEXT, VOC_ID TEXT, SUBSYSTEM_NAME TEXT, PRIORITY TEXT, VOC_TITLE TEXT, REQUESTER TEXT,
                  REQ_DATE TEXT, TARGET_DATE TEXT, STATUS TEXT, ACTION_NOTE TEXT, SORT_ORDER INTEGER DEFAULT 0
                );
                CREATE TABLE TB_WBS_NOTICE (
                  PROJECT_ID TEXT, NOTICE_ID TEXT, TITLE TEXT, CONTENT TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                  NOTICE_DATE TEXT, PRIORITY TEXT, IS_PINNED INTEGER DEFAULT 0, VIEW_COUNT INTEGER DEFAULT 0
                );
                CREATE TABLE TB_WBS_COMMUNICATION (
                  PROJECT_ID TEXT, COMM_ID TEXT, CHANNEL TEXT, TASK_ID TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                  USER_ROLE TEXT, CONTENT TEXT, POST_DATE TEXT, REPLIES_JSON TEXT
                );
                """
            )
            for (pid,) in cur.execute("SELECT PROJECT_ID FROM TB_PROJECT").fetchall():
                cls._write_mirror(cur, DATASETS.keys(), pid)
            cur.execute("INSERT OR REPLACE INTO TB_META VALUES ('mirror_schema', ?)", (MIRROR_SCHEMA_VERSION,))
        conn.commit()

    # ---- [v1.0.10] v1.0.9 이하 SHA-256 비밀번호 → PBKDF2 레코드로 일괄 전환 (같은 비밀번호로 계속 로그인 가능) ----
    @classmethod
    def _upgrade_password_records(cls, conn):
        cur = conn.cursor()
        users, revs = cls._read_dataset(cur, "projectUsers")
        if not users:
            return
        n = 0
        for u in users:
            if isinstance(u, dict) and u.get("pwdHash") and not is_pwd_record(u["pwdHash"]) and is_client_hash(u["pwdHash"]):
                u["pwdHash"] = make_pwd_record(u["pwdHash"])
                n += 1
        if n:
            cls._write_dataset(cur, "projectUsers", users, revs, "security-upgrade")
            conn.commit()
            write_server_log(f"[SECURITY] Upgraded {n} password record(s) to PBKDF2-SHA256")

    # ---- 최초 기동: v1.0.5 관계형 데이터 이관 또는 초기 데이터 적재 ----
    @classmethod
    def _bootstrap_datasets(cls, conn):
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM TB_WBS_DATASET")
        if cur.fetchone()[0] > 0:
            return
        data = cls._legacy_load(conn)
        source = "migrated from v1.0.5 relational tables"
        if not data.get("wbsData") and not data.get("projectConfig"):
            data, source = {}, "initial_data.json"
            if INITIAL_DATA_PATH.exists():
                try:
                    data = json.loads(INITIAL_DATA_PATH.read_text(encoding="utf-8"))
                except Exception as ex:
                    write_server_log(f"[WARN] Failed to read initial_data.json: {ex}")
        users = data.get("projectUsers") or []
        if not any(str(u.get("empNo", "")).lower() == "admin" for u in users):
            users.insert(0, {"empNo": "admin", "name": "시스템관리자", "role": "SYS_ADMIN", "subsystem": "ALL", "dept": "", "pwdHash": "", "lang": "ko"})
        data["projectUsers"] = users
        for key in DATASETS:
            if key in data:
                cls._write_dataset(cur, key, data[key], {p: {"rev": 1, "by": "bootstrap", "at": now_str()} for p in split_parts(key, data[key])}, "bootstrap")
        conn.commit()
        write_server_log(f"[INIT] Datasets initialized ({source})")

    @staticmethod
    def _legacy_load(conn):
        """v1.0.5 이하 관계형 테이블 + TB_WBS_EXTRA_JSON 에서 데이터 복원"""
        out = {}
        cur = conn.cursor()
        try:
            cur.execute("SELECT FULL_CONFIG_JSON, USERS_JSON, STD_DELIV_JSON, THEME FROM TB_WBS_CONFIG LIMIT 1")
            row = cur.fetchone()
            if row:
                if row[0]:
                    out["projectConfig"] = json.loads(row[0])
                if row[1]:
                    out["projectUsers"] = json.loads(row[1])
                if row[2]:
                    out["standardDeliverablesMeta"] = json.loads(row[2])
                if row[3]:
                    out["theme"] = row[3]
            cur.execute("SELECT SUBSYSTEM_CODE, SUBSYSTEM_NAME, DOMAIN_NAME, PROJ_TYPE, SDLC_CODE, WEIGHT, PM_NAME, DESCRIPTION FROM TB_WBS_SUBSYSTEM ORDER BY SORT_ORDER")
            out["subsystemsMeta"] = [
                {"code": r[0], "name": r[1], "domain": r[2], "type": r[3], "sdlcCode": r[4], "weight": r[5], "pm": r[6], "desc": r[7]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT WBS_ID, LVL, SUBSYSTEM_NAME, TASK_NAME, WEIGHT, REQ_ID, PLAN_START, PLAN_END, ACT_START, ACT_END, PLAN_PROG, ACT_PROG, OUTPUT_NOTE FROM TB_WBS_TASK ORDER BY ROW_SEQ")
            out["wbsData"] = [
                {"id": r[0], "level": r[1], "system": r[2], "name": r[3], "weight": r[4], "reqId": r[5], "pStart": r[6],
                 "pEnd": r[7], "aStart": r[8], "aEnd": r[9], "pProg": r[10], "aProg": r[11], "output": r[12]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT DELIV_ID, SUBMIT_ROUND, SUBSYSTEM_NAME, PHASE_NAME, DELIV_NAME, PLAN_DATE, ACT_DATE, STATUS, MANAGER_NAME, REMARKS FROM TB_WBS_DELIVERABLE ORDER BY DELIV_ID")
            out["deliverablesData"] = [
                {"id": r[0], "round": r[1], "system": r[2], "phase": r[3], "name": r[4], "pDate": r[5], "aDate": r[6], "status": r[7], "manager": r[8], "remarks": r[9]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT REQ_ID, SUBSYSTEM_NAME, REQ_NAME, REQ_TYPE, PRIORITY, ACCEPT_YN, STATUS FROM TB_WBS_REQ ORDER BY SORT_ORDER")
            out["reqMasterData"] = [
                {"id": r[0], "system": r[1], "name": r[2], "type": r[3], "priority": r[4], "accept": r[5], "status": r[6]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT VOC_ID, SUBSYSTEM_NAME, PRIORITY, VOC_TITLE, REQUESTER, REQ_DATE, TARGET_DATE, STATUS, ACTION_NOTE FROM TB_WBS_VOC ORDER BY SORT_ORDER")
            out["vocData"] = [
                {"id": r[0], "system": r[1], "priority": r[2], "title": r[3], "requester": r[4], "reqDate": r[5], "targetDate": r[6], "status": r[7], "action": r[8]}
                for r in cur.fetchall()
            ]
        except sqlite3.Error:
            pass
        try:
            cur.execute("SELECT DATA_KEY, JSON_TEXT FROM TB_WBS_EXTRA_JSON")
            for k, txt in cur.fetchall():
                if k in DATASETS and txt:
                    out[k] = json.loads(txt)
        except sqlite3.Error:
            pass
        return {k: v for k, v in out.items() if v not in (None, [], {})}

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
    def save(cls, user, changes, force=False, pid=DEFAULT_PROJECT):
        """changes = {key: {"parts": {part: rows|row|None}, "base": {part: rev}}}"""
        who = f"{user.get('name', '')}({user['empNo']})"
        blocked = []
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
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
                cls._write_mirror(cur, accepted.keys(), pid)
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
                    cls._write_mirror(cur, ["projectUsers"], dst)
                    conn.commit()
            finally:
                conn.close()
        return copied, skipped

    @classmethod
    def project_members(cls, pid):
        users = cls.get_users()
        return [{"empNo": u.get("empNo"), "name": u.get("name"), **membership(u, pid)} for u in users if not is_sys_admin(u) and membership(u, pid)]

    # ---- 외부 조회용 관계형 미러 테이블 (프로젝트별, PROJECT_ID 컬럼) ----
    @classmethod
    def _write_mirror(cls, cur, keys, pid=DEFAULT_PROJECT):
        keys = set(keys)
        if "projectUsers" in keys or "theme" in keys:
            # 공통 데이터가 바뀌면 모든 프로젝트의 설정 미러(사용자 목록 포함)를 갱신
            pids = [r[0] for r in cur.execute("SELECT PROJECT_ID FROM TB_PROJECT").fetchall()] or [pid]
            for other in pids:
                if other != pid:
                    cls._write_mirror(cur, {"projectConfig"}, other)
            keys.add("projectConfig")
        get = lambda k: (cls._read_dataset(cur, dkey(pid, k))[0] or [])  # noqa: E731
        num = lambda v: float(v or 0) if str(v or "0").replace(".", "", 1).replace("-", "", 1).isdigit() else 0.0  # noqa: E731
        if keys & {"projectConfig", "standardDeliverablesMeta"}:
            cfg = cls._read_dataset(cur, dkey(pid, "projectConfig"))[0] or {}
            theme = cls._read_dataset(cur, "theme")[0] or "navy"
            cur.execute("DELETE FROM TB_WBS_CONFIG WHERE PROJECT_ID = ?", (pid,))
            cur.execute(
                "INSERT INTO TB_WBS_CONFIG VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, cfg.get("projectStartDate", ""), cfg.get("projectEndDate", ""), cfg.get("reportDate", ""),
                 int(cfg.get("weekStartDay", 5) or 5), theme, json.dumps(cfg.get("holidays", []), ensure_ascii=False),
                 json.dumps(get("standardDeliverablesMeta"), ensure_ascii=False), json.dumps(cfg, ensure_ascii=False),
                 json.dumps(Store.public_value("projectUsers", cls._read_dataset(cur, "projectUsers")[0] or []), ensure_ascii=False), now_str()),
            )
        if "subsystemsMeta" in keys:
            cur.execute("DELETE FROM TB_WBS_SUBSYSTEM WHERE PROJECT_ID = ?", (pid,))
            for i, s_ in enumerate(get("subsystemsMeta")):
                code = s_.get("code") or s_.get("name") or f"SYS_{i + 1}"
                cur.execute("INSERT OR REPLACE INTO TB_WBS_SUBSYSTEM VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, code, s_.get("name") or code, s_.get("domain", ""), s_.get("type", "SDLC"), s_.get("sdlcCode", ""),
                             num(s_.get("weight")), s_.get("pm", ""), s_.get("desc", ""), i))
        if "wbsData" in keys:
            cur.execute("DELETE FROM TB_WBS_TASK WHERE PROJECT_ID = ?", (pid,))
            for i, t in enumerate(get("wbsData"), 1):
                cur.execute("INSERT INTO TB_WBS_TASK VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, i, t.get("id", ""), int(t.get("level") or 1), t.get("system", ""), t.get("name", ""),
                             num(t.get("weight")), t.get("reqId", ""), t.get("pStart", ""), t.get("pEnd", ""),
                             t.get("aStart", ""), t.get("aEnd", ""), num(t.get("pProg")), num(t.get("aProg")), t.get("output", ""), t.get("status", "")))
        if "deliverablesData" in keys:
            cur.execute("DELETE FROM TB_WBS_DELIVERABLE WHERE PROJECT_ID = ?", (pid,))
            for i, d in enumerate(get("deliverablesData"), 1):
                cur.execute("INSERT INTO TB_WBS_DELIVERABLE VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, i, d.get("round", ""), d.get("system", ""), d.get("phase", ""), d.get("name", ""), d.get("pDate", ""),
                             d.get("aDate", ""), d.get("status", ""), d.get("manager", ""), d.get("remarks", "")))
        if "reqMasterData" in keys:
            cur.execute("DELETE FROM TB_WBS_REQ WHERE PROJECT_ID = ?", (pid,))
            for i, r in enumerate(get("reqMasterData"), 1):
                cur.execute("INSERT INTO TB_WBS_REQ VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, r.get("id", ""), r.get("system", ""), r.get("name", ""), r.get("type", ""), r.get("priority", ""),
                             r.get("accept", ""), r.get("status", ""), i))
        if "vocData" in keys:
            cur.execute("DELETE FROM TB_WBS_VOC WHERE PROJECT_ID = ?", (pid,))
            for i, v in enumerate(get("vocData"), 1):
                cur.execute("INSERT INTO TB_WBS_VOC VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, v.get("id", ""), v.get("system", ""), v.get("priority", ""), v.get("title", ""), v.get("requester", ""),
                             v.get("reqDate", ""), v.get("targetDate", ""), v.get("status", ""), v.get("action", ""), i))
        if "noticesData" in keys:
            cur.execute("DELETE FROM TB_WBS_NOTICE WHERE PROJECT_ID = ?", (pid,))
            for n in get("noticesData"):
                cur.execute("INSERT INTO TB_WBS_NOTICE VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, str(n.get("id", "")), n.get("title", ""), n.get("content", ""), n.get("author", ""), n.get("authorEmpNo", ""),
                             n.get("date", ""), n.get("priority", ""), 1 if n.get("isPinned") else 0, int(num(n.get("viewCount")))))
        if "communicationsData" in keys:
            cur.execute("DELETE FROM TB_WBS_COMMUNICATION WHERE PROJECT_ID = ?", (pid,))
            for c in get("communicationsData"):
                cur.execute("INSERT INTO TB_WBS_COMMUNICATION VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, str(c.get("id", "")), c.get("channel", ""), str(c.get("taskId", "")), c.get("author", ""), c.get("authorEmpNo", ""),
                             c.get("role", ""), c.get("content", ""), c.get("date", ""), json.dumps(c.get("replies", []), ensure_ascii=False)))

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
                cls._write_mirror(cur, DATASETS.keys(), pid)
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
                for t in ("TB_WBS_CONFIG", "TB_WBS_SUBSYSTEM", "TB_WBS_TASK", "TB_WBS_DELIVERABLE", "TB_WBS_REQ", "TB_WBS_VOC",
                          "TB_WBS_NOTICE", "TB_WBS_COMMUNICATION", "TB_WBS_CHAT"):
                    cur.execute(f"DELETE FROM {t} WHERE PROJECT_ID = ?", (pid,))
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

    # ---- 사용자 등록 / 비밀번호 ----
    @classmethod
    def register_user(cls, new_user, pid=None):
        emp = str(new_user.get("empNo", "")).strip()
        if not emp or len(emp) > 30 or not all(ch.isalnum() or ch in "_.-" for ch in emp):
            raise AuthError("사번은 영문/숫자/_.- 2~30자로 입력하세요.", 400)
        pwd = str(new_user.get("pwdHash", "")).lower()
        if not is_client_hash(pwd) or hmac.compare_digest(pwd, DEFAULT_PWD_HASH):
            raise AuthError("비밀번호 형식이 올바르지 않습니다.", 400)
        row = {
            "empNo": emp,
            "name": str(new_user.get("name", "")).strip()[:50] or emp,
            "role": "MEMBER",  # 자가 등록은 항상 일반 사용자
            "subsystem": str(new_user.get("subsystem", "")).strip()[:50] or "ALL",
            "dept": str(new_user.get("dept", "")).strip()[:100],
            "pwdHash": make_pwd_record(pwd),
            "lang": "en" if new_user.get("lang") == "en" else "ko",
            "registeredAt": now_str(),
        }
        # [v3.0.0] 자가 등록은 로그인 화면에서 고른 프로젝트의 일반 사용자로
        project = cls.get_project(pid) if pid else None
        if not project or project.get("status") == "ARCHIVED":
            raise AuthError("가입할 프로젝트를 선택하세요.", 400)
        row["projectRoles"] = {project["id"]: {"role": "MEMBER", "subsystem": row["subsystem"], "dept": row["dept"]}}
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                users = users or []
                if any(str(u.get("empNo", "")).lower() == emp.lower() for u in users):
                    raise AuthError(f"이미 등록된 사번({emp})입니다.", 409)
                users.append(row)
                revs[emp] = {"rev": int((revs.get(emp) or {}).get("rev", 0)) + 1, "by": f"self-register({emp})", "at": now_str()}
                cls._write_dataset(cur, "projectUsers", users, revs, f"self-register({emp})")
                cls._write_mirror(cur, ["projectUsers"])
                conn.commit()
            finally:
                conn.close()
        return row

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

    @classmethod
    def self_reset_password(cls, emp):
        """[v3.0.2] 로그인 화면 비밀번호 초기화 → 기본값(1234), 다음 로그인 때 변경 필수"""
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                target = next((u for u in (users or []) if str(u.get("empNo", "")).lower() == emp.lower()), None)
                if not target:
                    raise AuthError(f"등록되지 않은 사번({emp})입니다.", 404)
                target["pwdHash"] = ""
                target["pwdTemp"] = False
                target["pwdChangedAt"] = now_str()
                key = target["empNo"]
                revs[key] = {"rev": int((revs.get(key) or {}).get("rev", 0)) + 1, "by": f"password-reset({emp})", "at": now_str()}
                cls._write_dataset(cur, "projectUsers", users, revs, emp)
                conn.commit()
            finally:
                conn.close()

    # ---- 채팅 ----
    @classmethod
    def chat_list(cls, channel, pid=DEFAULT_PROJECT):
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                sql = "SELECT MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT FROM TB_WBS_CHAT"
                if channel == "전체":
                    cur.execute(sql + " WHERE PROJECT_ID = ? ORDER BY CREATED_AT DESC LIMIT 300", (pid,))
                else:
                    cur.execute(sql + " WHERE PROJECT_ID = ? AND CHANNEL = ? ORDER BY CREATED_AT DESC LIMIT 300", (pid, channel))
                rows = list(reversed(cur.fetchall()))
            finally:
                conn.close()
        return [{"id": r[0], "channel": r[1], "senderName": r[2], "senderEmpNo": r[3], "userRole": r[4], "message": r[5], "createdAt": r[6]} for r in rows]

    @classmethod
    def chat_send(cls, user, channel, message, client_id, pid=DEFAULT_PROJECT):
        msg_id = "CHAT-" + str(client_id or int(time.time() * 1000))
        created = now_str()
        with DB_LOCK:
            conn = cls.connect()
            try:
                conn.execute("INSERT OR REPLACE INTO TB_WBS_CHAT (MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT, PROJECT_ID) "
                             "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (msg_id, channel, user["name"], user["empNo"], user["role"], message, created, pid))
                conn.commit()
            finally:
                conn.close()
        return {"id": msg_id, "channel": channel, "senderName": user["name"], "senderEmpNo": user["empNo"],
                "userRole": user["role"], "message": message, "createdAt": created}

    @classmethod
    def chat_clear(cls, pid=DEFAULT_PROJECT):
        with DB_LOCK:
            conn = cls.connect()
            try:
                conn.execute("DELETE FROM TB_WBS_CHAT WHERE PROJECT_ID = ?", (pid,))
                conn.commit()
            finally:
                conn.close()
