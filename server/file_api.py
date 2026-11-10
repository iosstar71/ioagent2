# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 첨부파일 API (v3.6.0)

  POST /api/files/upload?ownerType=&ownerId=&system=&name=   본문 = 파일 내용 그대로 (JSON 아님)
  GET  /api/files/download?id=                               내려받기
  POST /api/files/summary                                    대상별 파일 수 · 사용량 · 정책
  POST /api/files/list     {ownerType, ownerId} | {trash:true}
  POST /api/files/delete   {id}      휴지통으로
  POST /api/files/restore  {id}      되살리기 (PM · 시스템관리자)
  POST /api/files/purge    {id}      완전 삭제 (PM · 시스템관리자)
"""
import shutil
import urllib.parse

from .common import AuthError
from .files import FileStore, manager_only
from .settings import FILE_MAX_BYTES


def _file_of(h, user, req):
    f = FileStore.get(user["projectId"], str(req.get("id") or ""))
    if not f:
        raise AuthError("파일을 찾을 수 없습니다.", 404)
    return f


def upload(h):
    """파일 올리기 — 본문을 디스크로 바로 흘려 저장 (메모리에 통째로 올리지 않음)"""
    q = urllib.parse.parse_qs(urllib.parse.urlparse(h.path).query)
    arg = lambda k: (q.get(k) or [""])[0]  # noqa: E731
    length = int(h.headers.get("Content-Length", 0) or 0)
    try:
        user = h._require_user()
        FileStore.check_owner(arg("ownerType"), arg("ownerId"))
        if length > FILE_MAX_BYTES:
            raise AuthError(f"파일이 너무 큽니다. (파일 1개 최대 {FILE_MAX_BYTES // 1024 // 1024}MB)", 413, "FILE_TOO_LARGE")
        system = FileStore.require_write(user, arg("ownerType"), arg("ownerId"), arg("system"))
        f = FileStore.save_stream(user, arg("ownerType"), arg("ownerId"), system, arg("name"), h.rfile, length)
        FileStore.purge_expired()
        h._send_json(200, {"ok": True, "file": FileStore.public(f)})
    except AuthError as ae:
        h.close_connection = True  # 읽지 않은 본문이 남아 있을 수 있음
        h._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401, "code": ae.code})


def download(h):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(h.path).query)
    try:
        user = h._require_user()
        f = _file_of(h, user, {"id": (q.get("id") or [""])[0]})
        if f["deletedAt"]:
            manager_only(user)
        path = FileStore.open_path(f)
    except AuthError as ae:
        h._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401, "code": ae.code})
        return
    h.send_response(200)
    h.send_header("Content-Type", "application/octet-stream")
    h.send_header("Content-Length", str(path.stat().st_size))
    h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(f["name"], safe=""))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    with open(path, "rb") as src:
        shutil.copyfileobj(src, h.wfile, 65536)


def api_summary(h, req):
    user = h._require_user(req=req)
    FileStore.purge_expired()
    out = FileStore.summary(user["projectId"])
    out.update({"ok": True, "policy": FileStore.policy()})
    h._send_json(200, out)


def api_list(h, req):
    user = h._require_user(req=req)
    if req.get("trash"):
        manager_only(user)
        files = FileStore.list(user["projectId"], trash=True)
    else:
        FileStore.check_owner(req.get("ownerType"), req.get("ownerId"))
        files = FileStore.list(user["projectId"], req.get("ownerType"), req.get("ownerId"))
    h._send_json(200, {"ok": True, "files": [FileStore.public(f) for f in files], "policy": FileStore.policy()})


def api_delete(h, req):
    user = h._require_user(req=req)
    f = _file_of(h, user, req)
    FileStore.require_write(user, f["ownerType"], f["ownerId"], f["system"])
    FileStore.trash(user, f)
    h._send_json(200, {"ok": True})


def api_restore(h, req):
    user = h._require_user(req=req)
    manager_only(user)
    f = _file_of(h, user, req)
    FileStore.restore(user, f)
    h._send_json(200, {"ok": True})


def api_purge(h, req):
    user = h._require_user(req=req)
    manager_only(user)
    f = _file_of(h, user, req)
    if not f["deletedAt"]:
        raise AuthError("휴지통에 있는 파일만 완전 삭제할 수 있습니다.", 400)
    FileStore.purge(f, user["empNo"])
    h._send_json(200, {"ok": True})


ROUTES = {
    "/api/files/summary": api_summary,
    "/api/files/list": api_list,
    "/api/files/delete": api_delete,
    "/api/files/restore": api_restore,
    "/api/files/purge": api_purge,
}
