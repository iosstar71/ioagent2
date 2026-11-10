# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 권한 · 프로젝트 역할 · 저장 단위(파티션) 규칙"""

from .settings import DATASETS, DEFAULT_PROJECT, WHOLE
from .common import ALL_SUBSYSTEM_ROLES, MANAGER_ROLES


def normalize_role(role) -> str:
    r = str(role or "").upper()
    if r in ("SYS_ADMIN", "ADMIN"):
        return "SYS_ADMIN"
    if r == "PM":
        return "PM"
    if r in ("LEAD", "LEADER", "TOTAL_LEAD"):
        return "LEAD"
    return "MEMBER"


def membership(row_or_info, pid):
    """[v3.0.0] 프로젝트 참여 정보: 사용자 행의 projectRoles[프로젝트ID] = {role, subsystem, dept} (있으면 그 프로젝트 사용자)"""
    roles = (row_or_info or {}).get("projectRoles")
    a = roles.get(pid) if isinstance(roles, dict) else None
    return a if isinstance(a, dict) else None


def is_sys_admin(row_or_info):
    return normalize_role((row_or_info or {}).get("baseRole") or (row_or_info or {}).get("role")) == "SYS_ADMIN"


def effective_user(base, project, row=None):
    """[v3.0.0] 사용자 정보는 프로젝트별: 시스템관리자는 모든 프로젝트 관리자, 그 밖에는 그 프로젝트의 참여 정보(역할·담당·부서)"""
    out = dict(base)
    pid = (project or {}).get("id", DEFAULT_PROJECT)
    out["projectId"] = pid
    out["baseRole"] = base.get("role")
    if base.get("role") == "SYS_ADMIN":
        return out
    a = membership(row if row is not None else base, pid)
    if a:
        role = normalize_role(a.get("role"))
        out["role"] = "PM" if role == "SYS_ADMIN" else role
        out["subsystem"] = str(a.get("subsystem") or "ALL")
        if a.get("dept"):
            out["dept"] = a.get("dept")
    else:
        out["role"], out["subsystem"] = "MEMBER", ""
    return out


def can_access_project(base, project):
    """[v3.0.0] 시스템관리자는 모든 프로젝트, 그 밖의 사용자는 참여 중인 프로젝트만"""
    if not project:
        return False
    if base.get("role") == "SYS_ADMIN":
        return True
    return membership(base, project.get("id")) is not None


def project_users_view(users, pid):
    """[v3.0.0] 프로젝트 화면에 보이는 사용자: 시스템관리자 + 이 프로젝트 참여자 (다른 프로젝트 참여 정보는 숨김)"""
    out = []
    for u in users or []:
        if not isinstance(u, dict):
            continue
        if is_sys_admin(u):
            out.append(dict(u, projectRoles={}))
        elif membership(u, pid):
            out.append(dict(u, projectRoles={pid: membership(u, pid)}))
    return out


def clamp_progress(key, value):
    """[v3.0.0] 진척률(계획·실적)은 0~100 만 저장 (화면 입력 검사와 별도로 서버에서도 보정)"""
    if key != "wbsData" or not isinstance(value, list):
        return value
    for t in value:
        if not isinstance(t, dict):
            continue
        for f in ("aProg", "pProg"):
            if f in t:
                try:
                    v = float(t[f] or 0)
                except (TypeError, ValueError):
                    v = 0.0
                t[f] = int(v) if float(v).is_integer() and 0 <= v <= 100 else min(100.0, max(0.0, v))
        if "weight" in t:
            try:
                t["weight"] = max(0.0, float(t["weight"] or 0))
            except (TypeError, ValueError):
                t["weight"] = 0.0
    return value


# ---------------------------------------------------------------------------
# 파티션 (js/data-store.js Partition 과 동일 로직)
# ---------------------------------------------------------------------------
def part_of(key, row):
    field = DATASETS[key]["part"]
    if not field:
        return WHOLE
    v = row.get(field, "") if isinstance(row, dict) else ""
    return "" if v is None else str(v)


def split_parts(key, value):
    field = DATASETS[key]["part"]
    out = {}
    if not field or not isinstance(value, list):
        out[WHOLE] = value
        return out
    for row in value:
        p = part_of(key, row)
        if field == "system":
            out.setdefault(p, []).append(row)
        else:
            out[p] = row
    return out


def merge_parts(key, base, changed):
    field = DATASETS[key]["part"]
    if not field:
        return changed[WHOLE] if WHOLE in changed else base
    base = base if isinstance(base, list) else []
    if field == "system":
        order, groups = [], {}
        for r in base:
            p = part_of(key, r)
            if p not in groups:
                groups[p] = []
                order.append(p)
            groups[p].append(r)
        for p, rows in changed.items():
            if p not in groups:
                order.append(p)
            groups[p] = rows if isinstance(rows, list) else []
        return [r for p in order for r in groups.get(p, [])]
    out, seen = [], set()
    for r in base:
        p = part_of(key, r)
        seen.add(p)
        if p in changed:
            if changed[p]:
                out.append(changed[p])
        else:
            out.append(r)
    for p, row in changed.items():
        if p not in seen and row:
            out.append(row)
    return out


def can_write(user, key, part, row):
    role = user["role"]
    scope = DATASETS[key]["scope"]
    own = str(user.get("subsystem") or "ALL")
    if scope in ("master", "pref"):
        return role in MANAGER_ROLES
    if scope == "users":
        return role in MANAGER_ROLES or str(part).lower() == str(user["empNo"]).lower()
    if scope == "subsystem":
        return role in ALL_SUBSYSTEM_ROLES or own == "ALL" or own == str(part)
    if scope == "weekly":
        if role in ALL_SUBSYSTEM_ROLES:
            return True
        r = row or {}
        return r.get("scope") == "SYS" and (own == "ALL" or own == str(r.get("scopeValue", "")))
    if scope == "shared":
        return True
    if scope == "personal":
        r = row or {}
        return str(r.get("owner", "")).lower() == str(user["empNo"]).lower()
    return False


def own_rows(key, value, revs, user, pid=DEFAULT_PROJECT):
    """[v2.4.0] 개인 데이터(todosData)는 본인 항목과 그 버전 정보만 돌려줌
    [v3.0.0] 사용자 목록은 이 프로젝트의 사용자(시스템관리자 + 참여자)만"""
    if key == "projectUsers" and value is not None:
        rows = project_users_view(value, pid)
        ids = {str(u.get("empNo", "")) for u in rows}
        return rows, {p: v for p, v in (revs or {}).items() if p in ids}
    if DATASETS.get(key, {}).get("scope") != "personal" or not user:
        return value, revs
    me = str(user.get("empNo", "")).lower()
    rows = [r for r in (value or []) if isinstance(r, dict) and str(r.get("owner", "")).lower() == me]
    ids = {str(r.get("id", "")) for r in rows}
    return rows, {p: v for p, v in (revs or {}).items() if p in ids}
