# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 프로젝트 Task 정보 초기화 (관리자)

  POST /api/projects/clear-tasks   {ids: [프로젝트 ID, ...]}

기본정보 · 기준정보 · 작업자는 그대로 두고 Task 정보(WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 소통)만 지웁니다.
지우기 전 자료는 화면이 복원 지점(브라우저)으로 남깁니다 — 서버에는 파일을 남기지 않음 (용량 제한).
"""
from .common import AuthError, dkey, now_str
from .settings import DB_LOCK
from .store import Store

TASK_KEYS = ("wbsData", "reqMasterData", "deliverablesData", "weeklyReportsData", "vocData",
             "meetingsData", "noticesData", "communicationsData")


def clear_tasks(pid, who):
    counts = {}
    with DB_LOCK:
        conn = Store.connect()
        try:
            cur = conn.cursor()
            for key in TASK_KEYS:
                value, revs = Store._read_dataset(cur, dkey(pid, key))
                counts[key] = len(value or [])
                # 지운 행의 버전을 올려 둠 → 지우기 전 화면에서 그 행을 다시 저장하려 하면 충돌로 알려 줌
                new_revs = {p: {"rev": int((r or {}).get("rev", 0)) + 1, "by": f"{who} (Task 초기화)", "at": now_str()}
                            for p, r in (revs or {}).items()}
                Store._write_dataset(cur, dkey(pid, key), [], new_revs, who)
            conn.commit()
        finally:
            conn.close()
    from . import locks
    locks.release_all(pid, who, "Task 초기화")
    return {"id": pid, "counts": counts}


def api_clear_tasks(h, req):
    user = h._require_user(roles={"SYS_ADMIN"}, req=req)
    ids = [str(x) for x in (req.get("ids") or []) if str(x)]
    if not ids:
        raise AuthError("초기화할 프로젝트를 고르세요.", 400)
    known = {p["id"] for p in Store.list_projects()}
    missing = [x for x in ids if x not in known]
    if missing:
        raise AuthError(f"프로젝트를 찾을 수 없습니다: {', '.join(missing)}", 404)
    h._send_json(200, {"ok": True, "results": [clear_tasks(pid, user["empNo"]) for pid in ids]})


ROUTES = {"/api/projects/clear-tasks": api_clear_tasks}
