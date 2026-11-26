# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 감사 로그 (Workgroup) — 누가 · 언제 · 어디서(IP) · 무엇을 했는지

  기록은 서버가 함: 사람 · 시각 · IP 는 세션과 접속 정보로 정하고, 화면이 보내는 값은 '종류 · 범위' 설명에만 씀
  자료 DB 와 다른 파일(data/audit_log.db)에 둠 — 백업 복원 · 데이터 초기화로 지워지지 않게
  화면에서 지우거나 고칠 수 없음. 보관 기간(app.ini [audit] keep_days, 기본 365일)이 지난 줄은 서버가 정리

  POST /api/audit/list       {from, to, emp, kind}  → 기록 (Admin · 그 프로젝트 PM)
  POST /api/audit/download   {kind, target}         → 화면에서 만드는 파일(엑셀 · 워드 · PPT · JSON · CSV) 내려받기 허가 + 기록
                                                       다운로드가 제한된 멤버는 403 DOWNLOAD_BLOCKED
  POST /api/audit/event      {kind: MERGE, target, detail} → 화면에서만 알 수 있는 일(파일 Merge 반영) 기록
"""
import sqlite3
import threading
import time

from . import settings
from .common import AuthError, MANAGER_ROLES, now_str
from .logger import write_server_log

KINDS = {
    "DELETE": "자료 삭제",
    "RESET": "초기화",
    "RESTORE": "백업 복원",
    "MERGE": "파일 Merge 반영",
    "LOCK": "잠금 강제 해제",
    "DOWNLOAD": "다운로드",
    "DOWNLOAD_BLOCKED": "다운로드 거부",
    "LOGIN_FAIL": "로그인 실패 연속",
    "PASSWORD": "암호 초기화",
    "PERMISSION": "권한 · 다운로드 제한 변경",
    "MEMBER": "멤버 추가 · 삭제",
    "BASELINE": "기준선 확정",
}
_LOCK = threading.Lock()
_last_purge = [0.0]
MAX_ROWS = 5000


def keep_days():
    try:
        return max(1, min(3650, int(str(settings.APP_CONFIG.get("keep_days", "365")).strip())))
    except ValueError:
        return 365


def _path():
    return settings.DATA_DIR / "audit_log.db"


def _connect():
    settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_path()), timeout=10)
    conn.execute("""CREATE TABLE IF NOT EXISTS TB_AUDIT_LOG (
        LOG_ID INTEGER PRIMARY KEY AUTOINCREMENT, LOGGED_AT TEXT NOT NULL, EMP_NO TEXT, IP TEXT,
        PROJECT_ID TEXT, KIND TEXT NOT NULL, TARGET TEXT, DETAIL TEXT)""")
    conn.execute("CREATE INDEX IF NOT EXISTS IX_AUDIT_AT ON TB_AUDIT_LOG (LOGGED_AT)")
    return conn


def ip_of(h):
    try:
        return str(h.client_address[0])
    except Exception:
        return ""


def write(kind, emp="", ip="", pid="", target="", detail=""):
    """한 줄 기록. 기록이 실패해도 업무 요청은 막지 않음 (서버 로그에 남김)"""
    if kind not in KINDS:
        kind = "MEMBER" if kind == "USER" else kind
    try:
        with _LOCK:
            conn = _connect()
            try:
                conn.execute("INSERT INTO TB_AUDIT_LOG (LOGGED_AT, EMP_NO, IP, PROJECT_ID, KIND, TARGET, DETAIL) VALUES (?, ?, ?, ?, ?, ?, ?)",
                             (now_str(), str(emp or "")[:60], str(ip or "")[:60], str(pid or "")[:40], kind, str(target or "")[:300], str(detail or "")[:2000]))
                if time.time() - _last_purge[0] > 3600:
                    _last_purge[0] = time.time()
                    conn.execute("DELETE FROM TB_AUDIT_LOG WHERE LOGGED_AT < datetime('now', 'localtime', ?)", (f"-{keep_days()} days",))
                conn.commit()
            finally:
                conn.close()
    except sqlite3.Error as e:
        write_server_log(f"[AUDIT] write failed ({kind} {target}): {e}")


def by(h, info, kind, target="", detail="", pid=None):
    """요청한 사람 · IP 로 기록"""
    write(kind, (info or {}).get("empNo", ""), ip_of(h), pid if pid is not None else (info or {}).get("projectId", ""), target, detail)


def query(pid=None, date_from="", date_to="", emp="", kind=""):
    sql, args = "SELECT LOGGED_AT, EMP_NO, IP, PROJECT_ID, KIND, TARGET, DETAIL FROM TB_AUDIT_LOG WHERE 1=1", []
    if pid is not None:
        sql += " AND (PROJECT_ID = ? OR PROJECT_ID = '')"
        args.append(pid)
    if date_from:
        sql += " AND LOGGED_AT >= ?"
        args.append(str(date_from)[:10])
    if date_to:
        sql += " AND LOGGED_AT < date(?, '+1 day')"
        args.append(str(date_to)[:10])
    if emp:
        sql += " AND lower(EMP_NO) = lower(?)"
        args.append(str(emp)[:60])
    if kind:
        sql += " AND KIND = ?"
        args.append(str(kind)[:30])
    sql += " ORDER BY LOG_ID DESC LIMIT ?"
    args.append(MAX_ROWS)
    with _LOCK:
        conn = _connect()
        try:
            rows = conn.execute(sql, args).fetchall()
        finally:
            conn.close()
    return [{"at": r[0], "emp": r[1], "ip": r[2], "project": r[3], "kind": r[4], "kindName": KINDS.get(r[4], r[4]), "target": r[5], "detail": r[6]} for r in rows]


# ---- 자료 저장 때 서버가 비교해서 찾는 일 (Store.save 가 부름) ----
ROW_KEYS = {"wbsData": "Task", "reqMasterData": "요구사항", "vocData": "VOC", "deliverablesData": "산출물"}


def _row_id(key, r):
    if not isinstance(r, dict):
        return ""
    if key == "deliverablesData":
        return f"{r.get('id', '')}:{r.get('name', '')}"
    return str(r.get("id", ""))


def diff_events(key, before, after, pid):
    """저장 전후 비교 → [(kind, target, detail)]: 사라진 행, 기준선 확정, 멤버 · 권한 변경"""
    out = []
    if key in ROW_KEYS:
        b = {_row_id(key, r) for r in (before or []) if isinstance(r, dict)}
        a = {_row_id(key, r) for r in (after or []) if isinstance(r, dict)}
        gone = sorted(x for x in b - a if x)
        # WBS 는 Task 를 넣고 빼면 번호가 다시 매겨지므로 건수로 판단 (ID 만 바뀐 것은 삭제가 아님)
        if key == "wbsData":
            n = len(before or []) - len(after or [])
            if n > 0:
                out.append(("DELETE", f"{ROW_KEYS[key]} {n}건", ", ".join(gone[:30])))
        elif gone:
            out.append(("DELETE", f"{ROW_KEYS[key]} {len(gone)}건", ", ".join(gone[:30])))
    elif key == "projectConfig" and isinstance(after, dict):
        bl_b = (before or {}).get("baselines") if isinstance(before, dict) else None
        bl_a = after.get("baselines")
        if bl_b and not bl_a:
            out.append(("BASELINE", "기준선 지우기", f"지운 기준선 {len(bl_b)}개"))
        elif isinstance(bl_a, list) and len(bl_a) > len(bl_b or []):
            last = bl_a[-1] if isinstance(bl_a[-1], dict) else {}
            out.append(("BASELINE", f"기준선 {last.get('no', len(bl_a))}", str(last.get("reason") or "")))
    elif key == "projectUsers":
        bm = {str(u.get("empNo", "")).lower(): u for u in (before or []) if isinstance(u, dict)}
        am = {str(u.get("empNo", "")).lower(): u for u in (after or []) if isinstance(u, dict)}

        def mem(u):
            pr = (u or {}).get("projectRoles") or {}
            return pr.get(pid) if isinstance(pr, dict) else None
        for k in sorted(set(bm) | set(am)):
            o, n = mem(bm.get(k)), mem(am.get(k))
            if o is None and n is not None:
                out.append(("MEMBER", k, f"추가 ({n.get('role', '')} · {n.get('subsystem', '')})"))
            elif o is not None and n is None:
                out.append(("MEMBER", k, "삭제"))
            elif o is not None and n is not None:
                ch = []
                if o.get("role") != n.get("role") or o.get("subsystem") != n.get("subsystem"):
                    ch.append(f"역할 {o.get('role')}/{o.get('subsystem')} → {n.get('role')}/{n.get('subsystem')}")
                if bool(o.get("noDownload")) != bool(n.get("noDownload")):
                    ch.append("다운로드 " + ("금지" if n.get("noDownload") else "허용"))
                if ch:
                    out.append(("PERMISSION", k, " · ".join(ch)))
            if (bm.get(k) or {}).get("pwdHash") and am.get(k) is not None and not (am.get(k) or {}).get("pwdHash"):
                out.append(("PASSWORD", k, "기본 암호(1234)로 초기화"))
    return out


# ---- 다운로드 제한 ----
def no_download(info):
    """이 프로젝트에서 다운로드가 제한된 멤버인지 (관리자 · PM 은 제한하지 않음)"""
    return bool(info and info.get("noDownload")) and info.get("role") not in MANAGER_ROLES


def guard_download(h, info, kind_name, target=""):
    """서버가 내보내는 파일(백업 · 첨부) 앞에서: 제한된 멤버면 거부 + 기록"""
    if no_download(info):
        by(h, info, "DOWNLOAD_BLOCKED", kind_name, target)
        raise AuthError("다운로드가 제한된 계정입니다 — PM 에게 요청하세요.", 403, "DOWNLOAD_BLOCKED")
    by(h, info, "DOWNLOAD", kind_name, target)


# ---- API ----
def api_list(h, req):
    info = h._require_user(req=req)
    if info["role"] not in MANAGER_ROLES:
        raise AuthError("감사 로그는 Admin · PM 만 볼 수 있습니다.", 403)
    pid = None if (info.get("baseRole") == "SYS_ADMIN" and req.get("allProjects")) else info["projectId"]
    rows = query(pid, req.get("from") or "", req.get("to") or "", req.get("emp") or "", req.get("kind") or "")
    h._send_json(200, {"ok": True, "rows": rows, "kinds": KINDS, "keepDays": keep_days(), "max": MAX_ROWS})


DOWNLOAD_NAMES = {"excel": "엑셀", "word": "워드", "ppt": "PPT", "json": "JSON 백업", "merge": "파일 Merge", "csv": "감사 로그 CSV", "file": "파일"}


def api_download(h, req):
    info = h._require_user(req=req)
    kind = str(req.get("kind") or "file")
    guard_download(h, info, DOWNLOAD_NAMES.get(kind, "파일"), str(req.get("target") or "")[:300])
    h._send_json(200, {"ok": True})


def api_event(h, req):
    info = h._require_user(req=req)
    kind = str(req.get("kind") or "")
    if kind != "MERGE":
        raise AuthError("기록할 수 없는 종류입니다.", 400)
    by(h, info, kind, str(req.get("target") or "")[:300], str(req.get("detail") or "")[:2000])
    h._send_json(200, {"ok": True})


ROUTES = {
    "/api/audit/list": api_list,
    "/api/audit/download": api_download,
    "/api/audit/event": api_event,
}
