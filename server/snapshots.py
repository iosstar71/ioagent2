# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 프로젝트 복원 지점(스냅샷) — 서버 저장 (v4.0.0)

올리기 · 복원 · 초기화 직전에 화면이 만든 프로젝트 스냅샷을 서버(data/snapshots/<프로젝트>/)에 보관 → 다른 PC 에서도 복원
프로젝트마다 최근 30개 보관. 권한: 그 프로젝트의 PM · 시스템관리자 (시스템관리자는 모든 프로젝트 목록)

  POST /api/snapshots/save {projectId, meta, payload} | list {projectId | all} | get {projectId, id} | delete {projectId, id}
"""
import json
import re

from .common import AuthError
from .settings import DATA_DIR

SNAP_DIR = DATA_DIR / "snapshots"
ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,80}$")
KEEP = 30


def _dir(pid):
    if not ID_RE.match(str(pid or "")):
        raise AuthError("프로젝트가 올바르지 않습니다.", 400)
    return SNAP_DIR / pid


def _file(pid, sid):
    if not ID_RE.match(str(sid or "")):
        raise AuthError("스냅샷 ID 가 올바르지 않습니다.", 400)
    return _dir(pid) / f"{sid}.json"


def _list(pid):
    d = _dir(pid)
    out = []
    if d.exists():
        for p in d.glob("*.json"):
            try:
                with open(p, encoding="utf-8") as f:
                    out.append(json.load(f).get("meta") or {})
            except Exception:
                continue
    return sorted(out, key=lambda m: str(m.get("createdAt", "")), reverse=True)


def api_save(h, req):
    pid = str(req.get("projectId") or "")
    u = h._require_project_manager(pid)
    meta = dict(req.get("meta") or {})
    sid = str(meta.get("id") or "")
    path = _file(pid, sid)
    meta.update({"projectId": pid, "savedBy": u["empNo"]})
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "payload": req.get("payload") or {}}, f, ensure_ascii=False)
    for m in _list(pid)[KEEP:]:
        _file(pid, m.get("id")).unlink(missing_ok=True)
    h._send_json(200, {"ok": True})


def api_list(h, req):
    if req.get("all"):
        h._require_user(roles={"SYS_ADMIN"}, req=req)
        out = []
        if SNAP_DIR.exists():
            for d in SNAP_DIR.iterdir():
                if d.is_dir() and ID_RE.match(d.name):
                    out += _list(d.name)
        out.sort(key=lambda m: str(m.get("createdAt", "")), reverse=True)
        h._send_json(200, {"ok": True, "snapshots": out})
        return
    pid = str(req.get("projectId") or "")
    h._require_project_manager(pid)
    h._send_json(200, {"ok": True, "snapshots": _list(pid)})


def api_get(h, req):
    pid = str(req.get("projectId") or "")
    h._require_project_manager(pid)
    path = _file(pid, req.get("id"))
    if not path.exists():
        raise AuthError("스냅샷을 찾을 수 없습니다.", 404)
    with open(path, encoding="utf-8") as f:
        h._send_json(200, dict(json.load(f), ok=True))


def api_delete(h, req):
    pid = str(req.get("projectId") or "")
    h._require_project_manager(pid)
    _file(pid, req.get("id")).unlink(missing_ok=True)
    h._send_json(200, {"ok": True})


ROUTES = {
    "/api/snapshots/save": api_save,
    "/api/snapshots/list": api_list,
    "/api/snapshots/get": api_get,
    "/api/snapshots/delete": api_delete,
}
