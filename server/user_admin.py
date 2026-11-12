# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 전체 작업자 관리 — 관리자 전용 (전사 시스템의 사용자 관리와 별개)

  POST /api/admin/users/list     전체 사용자 + 프로젝트(서브시스템 목록) — 비밀번호 정보는 내보내지 않음
  POST /api/admin/users/save     {empNo, name, dept, lang, sysAdmin, projectRoles:{프로젝트:{role, subsystem, dept}}, pwdReset, isNew}
  POST /api/admin/users/delete   {empNo}

작업자(작업자 ID · 이름 · 암호)는 하나이고, 프로젝트마다 참여 정보(역할 · 담당 서브시스템 · 부서)를 따로 둡니다.
"""
import re

from .common import AuthError, now_str
from .permission import is_sys_admin, normalize_role
from .settings import DB_LOCK, DEFAULT_PROJECT
from .store import Store

EMP_NO_RE = re.compile(r"^[A-Za-z0-9_.\-]{2,30}$")


def _public(u):
    out = {k: v for k, v in u.items() if k not in ("pwdHash", "pwdTemp")}
    out["sysAdmin"] = is_sys_admin(u)
    out["pwdDefault"] = not u.get("pwdHash")
    out["projectRoles"] = Store._clean_project_roles(u.get("projectRoles"))
    return out


def list_all():
    projects = [{"id": p["id"], "name": p["name"], "status": p["status"], "subsystems": Store.get_subsystem_names(p["id"])}
                for p in Store.list_projects()]
    return {"users": [_public(u) for u in Store.get_users() if isinstance(u, dict)], "projects": projects}


def _update(mutator, who):
    """사용자 목록을 읽어 고친 뒤 저장 (고친 사번의 버전을 올려 다른 화면의 저장 충돌 감지와 맞춤)"""
    with DB_LOCK:
        conn = Store.connect()
        try:
            cur = conn.cursor()
            users, revs = Store._read_dataset(cur, "projectUsers")
            users = users or []
            part = mutator(users)
            revs[part] = {"rev": int((revs.get(part) or {}).get("rev", 0)) + 1, "by": who, "at": now_str()}
            Store._write_dataset(cur, "projectUsers", users, revs, who)
            conn.commit()
        finally:
            conn.close()


def save_user(admin, req):
    emp = str(req.get("empNo") or "").strip()
    if not EMP_NO_RE.match(emp):
        raise AuthError("사번은 영문 · 숫자 · _ . - 로 2~30자여야 합니다.", 400)
    name = str(req.get("name") or "").strip()[:50]
    if not name:
        raise AuthError("이름을 입력하세요.", 400)
    project_ids = {p["id"] for p in Store.list_projects()}
    roles = {k: v for k, v in Store._clean_project_roles(req.get("projectRoles")).items() if k in project_ids}
    for v in roles.values():
        if normalize_role(v["role"]) not in ("PM", "LEAD", "MEMBER"):
            v["role"] = "MEMBER"
    want_admin = bool(req.get("sysAdmin"))
    key = emp.lower()
    if key == "admin":
        want_admin = True
    if key == str(admin["empNo"]).lower() and not want_admin:
        raise AuthError("자기 자신의 시스템관리자 권한은 해제할 수 없습니다.", 400)

    def mutate(users):
        row = next((u for u in users if str(u.get("empNo", "")).lower() == key), None)
        if req.get("isNew") and row is not None:
            raise AuthError(f"이미 등록된 사번입니다: {emp}", 409)
        if row is None:
            row = {"empNo": emp, "pwdHash": "", "lang": "ko"}  # 새 계정: 초기 비밀번호 1234, 첫 로그인 때 변경
            users.append(row)
        row.update({"name": name, "dept": str(req.get("dept") or "")[:100], "projectRoles": roles})
        if req.get("lang") in ("ko", "en"):
            row["lang"] = req["lang"]
        if want_admin:
            row["role"], row["subsystem"] = "SYS_ADMIN", "ALL"
        else:
            first = next(iter(roles.values()), None)
            row["role"] = first["role"] if first else "MEMBER"
            row["subsystem"] = first["subsystem"] if first else "ALL"
        if req.get("pwdReset"):
            row["pwdHash"], row["pwdTemp"] = "", False
        return row["empNo"]

    _update(mutate, admin["empNo"])


def delete_user(admin, emp):
    key = str(emp or "").strip().lower()
    if key == "admin":
        raise AuthError("기본 관리자(admin) 계정은 삭제할 수 없습니다.", 400)
    if key == str(admin["empNo"]).lower():
        raise AuthError("지금 로그인한 계정은 삭제할 수 없습니다.", 400)

    def mutate(users):
        row = next((u for u in users if str(u.get("empNo", "")).lower() == key), None)
        if row is None:
            raise AuthError("사용자를 찾을 수 없습니다.", 404)
        users.remove(row)
        return row["empNo"]

    _update(mutate, admin["empNo"])


# ---- API ----
def api_list(h, req):
    h._require_user(roles={"SYS_ADMIN"}, req=req)
    out = list_all()
    out["ok"] = True
    h._send_json(200, out)


def api_save(h, req):
    admin = h._require_user(roles={"SYS_ADMIN"}, req=req)
    save_user(admin, req)
    h._send_json(200, dict(list_all(), ok=True))


def api_delete(h, req):
    admin = h._require_user(roles={"SYS_ADMIN"}, req=req)
    delete_user(admin, req.get("empNo"))
    h._send_json(200, dict(list_all(), ok=True))


ROUTES = {
    "/api/admin/users/list": api_list,
    "/api/admin/users/save": api_save,
    "/api/admin/users/delete": api_delete,
}
