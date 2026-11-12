# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 프로젝트 Task 정보 초기화 (v3.8.0)

  POST /api/projects/clear-tasks   {ids: [프로젝트 ID, ...]}

프로젝트 기본정보 · 기준정보(분야 · 서브시스템 · SDLC · 공휴일 · 표준 산출물 · 사용자)는 그대로 두고
Task 정보(WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 업무 소통 · 채팅)만 지웁니다.
  - 지우기 전에 data/backups/<프로젝트>_<일시>_before-clear.json 으로 자동 백업
  - 그 Task 에 붙은 첨부파일은 휴지통으로 (보존 기간 동안 되살리기 가능)
  - 권한: 지금 접속한 프로젝트 1개 = 그 프로젝트의 PM · 시스템관리자 / 여러 프로젝트 = 시스템관리자
"""
import datetime
import json

from .common import AuthError, dkey, now_str
from .files import FileStore
from .logger import write_server_log
from .settings import DATA_DIR, DB_LOCK
from .store import Store

TASK_KEYS = ("wbsData", "reqMasterData", "deliverablesData", "weeklyReportsData", "vocData",
             "meetingsData", "noticesData", "communicationsData")
BACKUP_DIR = DATA_DIR / "backups"


def clear_tasks(pid, who):
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    with DB_LOCK:
        conn = Store.connect()
        try:
            cur = conn.cursor()
            before, counts = {}, {}
            for key in TASK_KEYS:
                value, revs = Store._read_dataset(cur, dkey(pid, key))
                before[key] = value or []
                counts[key] = len(value or [])
                # 지운 행의 버전을 올려 둠 → 지우기 전 화면에서 그 행을 다시 저장하려 하면 충돌로 알려 줌
                new_revs = {p: {"rev": int((r or {}).get("rev", 0)) + 1, "by": f"{who} (Task 초기화)", "at": now_str()}
                            for p, r in (revs or {}).items()}
                Store._write_dataset(cur, dkey(pid, key), [], new_revs, who)
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            path = BACKUP_DIR / f"{pid}_{stamp}_before-clear.json"
            path.write_text(json.dumps({"schemaVersion": "IOSTAR_PROJECT_TASKS_v1", "projectId": pid, "createdAt": now_str(),
                                        "createdBy": who, "data": before}, ensure_ascii=False), encoding="utf-8")
            cur.execute("DELETE FROM TB_WBS_CHAT WHERE PROJECT_ID = ?", (pid,))
            Store._write_mirror(cur, TASK_KEYS, pid)
            conn.commit()
        finally:
            conn.close()
    trashed = FileStore.trash_project(pid, who)
    from . import locks
    locks.release_all(pid, who, "Task 초기화")
    write_server_log(f"[PROJECT] Task data cleared {pid} by {who} ({counts}) backup={path.name} files->trash={trashed}")
    return {"id": pid, "counts": counts, "backup": path.name, "filesTrashed": trashed}


def api_clear_tasks(h, req):
    ids = [str(x) for x in (req.get("ids") or []) if str(x)]
    if not ids:
        raise AuthError("초기화할 프로젝트를 고르세요.", 400)
    known = {p["id"] for p in Store.list_projects()}
    missing = [x for x in ids if x not in known]
    if missing:
        raise AuthError(f"프로젝트를 찾을 수 없습니다: {', '.join(missing)}", 404)
    if len(ids) == 1:
        user = h._require_project_manager(ids[0])
    else:
        user = h._require_user(roles={"SYS_ADMIN"}, req=req)
    if user.get("baseRole", user["role"]) != "SYS_ADMIN":
        p = Store.get_project(ids[0])
        if p and p["status"] == "ARCHIVED":
            raise AuthError("사용 중지(보관)된 프로젝트는 시스템관리자만 초기화할 수 있습니다.", 403)
    h._send_json(200, {"ok": True, "results": [clear_tasks(pid, user["empNo"]) for pid in ids]})


ROUTES = {"/api/projects/clear-tasks": api_clear_tasks}
