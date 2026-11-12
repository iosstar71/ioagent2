# -*- coding: utf-8 -*-
"""[Project Mgmt] 서브시스템 체크아웃 · 체크인 (편집 잠금)

  범위(scope)
    SUB:<서브시스템>  그 서브시스템의 WBS · 요구사항 · 산출물 · VOC (DATASETS 의 part == "system")
    PROJECT          기준정보(프로젝트 기준정보 · 분야/서브시스템 · 표준 산출물) — 다른 사람이 잡고 있을 때만 막음

  규칙 (conf/app.ini [lock])
    lock_mode = required : 서브시스템 자료는 내가 체크아웃해야 저장 / advisory : 남이 잡은 것만 막음 / off : 사용 안 함
    lock_hours = 4       : 유효 시간. 그 사람이 저장 · 불러오기 · 잠금 조회를 할 때마다 다시 연장
  주기 신호(heartbeat) 없음 — 만료는 누군가 요청할 때 계산(lazy). 백그라운드 작업도 없음.

  API (POST)
    /api/locks/list           {}                        → {locks, log, mode, hours}
    /api/locks/checkout       {scopes:[...], memo}      → 잡은 것 · 남이 잡아 못 잡은 것
    /api/locks/checkin        {scopes:[...], memo}      → 내 잠금 해제 (저장은 화면이 먼저 함)
    /api/locks/cancel         {scopes:[...]}            → 내 잠금 해제 (체크아웃 취소)
    /api/locks/force-release  {scopes:[...], reason}    → PM · 시스템관리자, 사유 필수, 기록
  저장(/api/db/save)이 막히면 423 {locked:[{key, part, scope, reason, empNo, name, since, lastAt}]}

"""
import time

from .common import AuthError, now_str
from .permission import can_write
from .settings import DB_LOCK, app_features, load_app_config, BASE_DIR

LOCK_KEYS = ("wbsData", "reqMasterData", "deliverablesData", "vocData")
PROJECT_KEYS = ("projectConfig", "subsystemsMeta", "standardDeliverablesMeta")
PROJECT = "PROJECT"
MANAGER = {"SYS_ADMIN", "PM"}


def settings():
    return app_features(load_app_config(BASE_DIR))["lock"]


def scope_of(key, part):
    if key in LOCK_KEYS:
        return f"SUB:{part}"
    if key in PROJECT_KEYS:
        return PROJECT
    return None


def _schema(cur):
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS TB_LOCK (
          PROJECT_ID TEXT NOT NULL, SCOPE TEXT NOT NULL, EMP_NO TEXT NOT NULL, USER_NAME TEXT,
          ACQUIRED_AT TEXT, LAST_AT TEXT, EXPIRES REAL, MEMO TEXT,
          PRIMARY KEY (PROJECT_ID, SCOPE)
        );
        CREATE TABLE IF NOT EXISTS TB_LOCK_LOG (
          LOG_ID INTEGER PRIMARY KEY AUTOINCREMENT, PROJECT_ID TEXT, SCOPE TEXT, EMP_NO TEXT, USER_NAME TEXT,
          ACTION TEXT, AT TEXT, BY_EMP TEXT, MEMO TEXT
        );
        """
    )


LOG_KEEP = 300  # 프로젝트마다 최근 기록만 보관 (용량)


def _log(cur, pid, scope, emp, name, action, by="", memo=""):
    cur.execute("DELETE FROM TB_LOCK_LOG WHERE PROJECT_ID = ? AND LOG_ID NOT IN (SELECT LOG_ID FROM TB_LOCK_LOG WHERE PROJECT_ID = ? ORDER BY LOG_ID DESC LIMIT ?)",
                (pid, pid, LOG_KEEP - 1))
    cur.execute("INSERT INTO TB_LOCK_LOG (PROJECT_ID, SCOPE, EMP_NO, USER_NAME, ACTION, AT, BY_EMP, MEMO) VALUES (?,?,?,?,?,?,?,?)",
                (pid, scope, emp, name, action, now_str(), by, (memo or "")[:300]))


def _row(r):
    return {"scope": r[1], "empNo": r[2], "name": r[3], "since": r[4], "lastAt": r[5],
            "expiresAt": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r[6])), "memo": r[7] or ""}


def _same(a, b):
    return str(a or "").lower() == str(b or "").lower()


def active(cur, pid):
    """만료된 잠금을 정리하고(기록 남김) 살아 있는 잠금 목록을 돌려줌"""
    _schema(cur)
    now = time.time()
    rows = cur.execute("SELECT PROJECT_ID, SCOPE, EMP_NO, USER_NAME, ACQUIRED_AT, LAST_AT, EXPIRES, MEMO FROM TB_LOCK WHERE PROJECT_ID = ?", (pid,)).fetchall()
    out = {}
    for r in rows:
        if r[6] < now:
            cur.execute("DELETE FROM TB_LOCK WHERE PROJECT_ID = ? AND SCOPE = ?", (pid, r[1]))
            _log(cur, pid, r[1], r[2], r[3], "EXPIRE", "system", "유효 시간 지남")
            continue
        out[r[1]] = r
    return out


def touch(cur, user, pid):
    """이 사용자가 활동함 → 그 사람의 잠금 유효 시간 연장"""
    _schema(cur)
    hours = settings()["hours"]
    cur.execute("UPDATE TB_LOCK SET LAST_AT = ?, EXPIRES = ? WHERE PROJECT_ID = ? AND lower(EMP_NO) = lower(?) AND EXPIRES >= ?",
                (now_str(), time.time() + hours * 3600, pid, user["empNo"], time.time()))


def listing(cur, pid, with_log=True):
    locks = [_row(r) for r in active(cur, pid).values()]
    data = {"locks": sorted(locks, key=lambda x: x["scope"]), "mode": settings()["mode"], "hours": settings()["hours"], "serverTime": now_str()}
    if with_log:
        logs = cur.execute("SELECT SCOPE, EMP_NO, USER_NAME, ACTION, AT, BY_EMP, MEMO FROM TB_LOCK_LOG WHERE PROJECT_ID = ? ORDER BY LOG_ID DESC LIMIT 40", (pid,)).fetchall()
        data["log"] = [{"scope": l[0], "empNo": l[1], "name": l[2], "action": l[3], "at": l[4], "by": l[5], "memo": l[6] or ""} for l in logs]
    return data


def can_take(user, scope):
    if scope == PROJECT:
        return user["role"] in MANAGER or (user["role"] == "LEAD" and str(user.get("subsystem") or "ALL") == "ALL")
    if scope.startswith("SUB:"):
        return can_write(user, "wbsData", scope[4:], None)
    return False


def save_guard(cur, user, pid, changes, bypass=False):
    """저장 전 확인 → 막힌 항목 목록 (빈 목록이면 저장 가능)"""
    cfg = settings()
    if cfg["mode"] == "off":
        return []
    is_admin = user.get("baseRole", user["role"]) == "SYS_ADMIN"
    if bypass and is_admin:
        return []
    locks = active(cur, pid)
    blocked = []
    for key, ch in (changes or {}).items():
        for part in ((ch or {}).get("parts") or {}).keys():
            scope = scope_of(key, part)
            if not scope or not can_write(user, key, part, None):
                continue  # 권한 없는 부분은 기존 권한 검사가 막음 (blocked)
            r = locks.get(scope)
            if r and not _same(r[2], user["empNo"]):
                blocked.append({"key": key, "part": part, "scope": scope, "reason": "LOCKED", "empNo": r[2], "name": r[3], "since": r[4], "lastAt": r[5]})
            elif not r and scope != PROJECT and cfg["mode"] == "required" and not (bypass and user["role"] in MANAGER):
                blocked.append({"key": key, "part": part, "scope": scope, "reason": "CHECKOUT_REQUIRED"})
    return blocked


def release_all(pid, by, reason):
    """프로젝트 초기화 · 복원 · 삭제 때 그 프로젝트 잠금을 모두 해제"""
    with DB_LOCK:
        from .store import Store
        conn = Store.connect()
        try:
            cur = conn.cursor()
            _schema(cur)
            for r in cur.execute("SELECT SCOPE, EMP_NO, USER_NAME FROM TB_LOCK WHERE PROJECT_ID = ?", (pid,)).fetchall():
                _log(cur, pid, r[0], r[1], r[2], "RESET", by, reason)
            cur.execute("DELETE FROM TB_LOCK WHERE PROJECT_ID = ?", (pid,))
            conn.commit()
        finally:
            conn.close()


def _scopes(req):
    out = []
    for s in (req.get("scopes") or []):
        s = str(s or "").strip()[:80]
        if s == PROJECT or (s.startswith("SUB:") and len(s) > 4):
            out.append(s)
    if not out:
        raise AuthError("잠글 범위(서브시스템)를 고르세요.", 400)
    return out


def _run(fn):
    from .store import Store
    with DB_LOCK:
        conn = Store.connect()
        try:
            cur = conn.cursor()
            result = fn(cur)
            conn.commit()
            return result
        finally:
            conn.close()


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
def api_list(h, req):
    info = h._require_user(req=req)

    def go(cur):
        touch(cur, info, info["projectId"])
        return listing(cur, info["projectId"])
    h._send_json(200, dict(ok=True, **_run(go)))


def api_checkout(h, req):
    info = h._require_user(req=req)
    if settings()["mode"] == "off":
        raise AuthError("체크아웃 기능이 꺼져 있습니다. (app.ini [lock] lock_mode)", 400)
    scopes = _scopes(req)
    pid = info["projectId"]
    memo = str(req.get("memo") or "")[:300]

    def go(cur):
        locks = active(cur, pid)
        got, taken, denied = [], [], []
        exp = time.time() + settings()["hours"] * 3600
        for s in scopes:
            if not can_take(info, s):
                denied.append(s)
                continue
            r = locks.get(s)
            if r and not _same(r[2], info["empNo"]):
                taken.append(_row(r))
                continue
            if r:
                cur.execute("UPDATE TB_LOCK SET LAST_AT = ?, EXPIRES = ? WHERE PROJECT_ID = ? AND SCOPE = ?", (now_str(), exp, pid, s))
            else:
                cur.execute("INSERT INTO TB_LOCK VALUES (?,?,?,?,?,?,?,?)", (pid, s, info["empNo"], info.get("name", ""), now_str(), now_str(), exp, memo))
                _log(cur, pid, s, info["empNo"], info.get("name", ""), "CHECKOUT", info["empNo"], memo)
            got.append(s)
        touch(cur, info, pid)
        return dict(got=got, taken=taken, denied=denied, **listing(cur, pid, False))
    res = _run(go)
    h._send_json(200, dict(ok=not res["taken"] and not res["denied"], **res))


def _release(h, req, action):
    info = h._require_user(req=req)
    scopes = _scopes(req)
    pid = info["projectId"]
    memo = str(req.get("memo") or req.get("reason") or "")[:300]
    force = action == "FORCE"
    if force:
        if info["role"] not in MANAGER:
            raise AuthError("강제 해제는 PM · 시스템관리자만 할 수 있습니다.", 403)
        if not memo.strip():
            raise AuthError("강제 해제 사유를 입력하세요.", 400)

    def go(cur):
        locks = active(cur, pid)
        done = []
        for s in scopes:
            r = locks.get(s)
            if not r or (not force and not _same(r[2], info["empNo"])):
                continue
            cur.execute("DELETE FROM TB_LOCK WHERE PROJECT_ID = ? AND SCOPE = ?", (pid, s))
            _log(cur, pid, s, r[2], r[3], action, info["empNo"], memo)
            done.append(s)
        touch(cur, info, pid)
        return dict(released=done, **listing(cur, pid, False))
    res = _run(go)
    h._send_json(200, dict(ok=True, **res))


def api_checkin(h, req):
    _release(h, req, "CHECKIN")


def api_cancel(h, req):
    _release(h, req, "CANCEL")


def api_force(h, req):
    _release(h, req, "FORCE")


ROUTES = {
    "/api/locks/list": api_list,
    "/api/locks/checkout": api_checkout,
    "/api/locks/checkin": api_checkin,
    "/api/locks/cancel": api_cancel,
    "/api/locks/force-release": api_force,
}
