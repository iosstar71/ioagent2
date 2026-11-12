# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 시스템 전체 백업 · 복원 (관리자) — 서버에는 아무것도 남기지 않음 (용량 10MB 제한)

  GET  /api/admin/backup/download   지금 DB 를 백업 파일(.db)로 바로 내려받음 (임시 파일은 곧바로 지움)
  POST /api/admin/backup/upload     내려받아 둔 백업 파일(.db)을 올려 바로 복원 (본문 = 파일 그대로)
       화면은 복원 전에 지금 상태를 먼저 내려받게 함 (system-backup.js)
"""
import datetime
import os
import sqlite3
import tempfile
import urllib.parse

from . import settings
from .common import AuthError
from .settings import DATA_DIR, DB_LOCK
from .store import Store

MAX_UPLOAD = 8 * 1024 * 1024
REQUIRED_TABLES = {"TB_WBS_DATASET", "TB_PROJECT"}


def _admin(h):
    return h._require_user(roles={"SYS_ADMIN"})


def _snapshot_bytes():
    """SQLite 백업 API 로 일관된 사본을 만든 뒤 바이트로 읽고 임시 파일은 지움"""
    fd, tmp = tempfile.mkstemp(suffix=".db", dir=str(DATA_DIR))
    os.close(fd)
    try:
        with DB_LOCK:
            src = Store.connect()
            dst = sqlite3.connect(tmp)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
        with open(tmp, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp)


def download(h):
    try:
        _admin(h)
        data = _snapshot_bytes()
    except AuthError as ae:
        h._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401})
        return
    name = f"pprjmgmt_backup_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    h.send_response(200)
    h.send_header("Content-Type", "application/octet-stream")
    h.send_header("Content-Length", str(len(data)))
    h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(name, safe=""))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(data)


def _valid(path):
    try:
        con = sqlite3.connect(path)
        try:
            if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                return False
            names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            return REQUIRED_TABLES <= names
        finally:
            con.close()
    except sqlite3.Error:
        return False


def upload(h):
    """백업 파일로 바로 복원 — 검사(무결성 · 표 구성)를 통과해야 바꿈"""
    length = int(h.headers.get("Content-Length", 0) or 0)
    tmp = None
    try:
        _admin(h)
        if length <= 0 or length > MAX_UPLOAD:
            raise AuthError("백업 파일 크기가 올바르지 않습니다.", 413)
        fd, tmp = tempfile.mkstemp(suffix=".db", dir=str(DATA_DIR))
        with os.fdopen(fd, "wb") as out:
            left = length
            while left > 0:
                chunk = h.rfile.read(min(1024 * 256, left))
                if not chunk:
                    break
                out.write(chunk)
                left -= len(chunk)
        if left > 0 or not _valid(tmp):
            raise AuthError("Project Mgmt 백업 파일(.db)이 아닙니다.", 400)
        with DB_LOCK:
            src = sqlite3.connect(tmp)
            dst = Store.connect()
            try:
                src.backup(dst)
                dst.execute("DELETE FROM TB_LOCK") if dst.execute("SELECT 1 FROM sqlite_master WHERE name='TB_LOCK'").fetchone() else None
                dst.commit()
            finally:
                src.close()
                dst.close()
        Store.init_schema()
        h._send_json(200, {"ok": True})
    except AuthError as ae:
        h.close_connection = True
        h._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401})
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def usage():
    """프로그램 폴더 사용량 (바이트) — 관리 화면 표시용"""
    total = 0
    for root, _dirs, files in os.walk(settings.BASE_DIR):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def api_usage(h, req):
    _admin(h)
    db = sum(p.stat().st_size for p in DATA_DIR.glob(settings.DB_PATH.name + "*") if p.is_file())
    h._send_json(200, {"ok": True, "total": usage(), "db": db, "limit": 10 * 1024 * 1024})


def api_vacuum(h, req):
    """DB 정리 (지운 자료가 차지하던 공간 반환)"""
    _admin(h)
    with DB_LOCK:
        con = Store.connect()
        try:
            con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            con.execute("VACUUM")
        finally:
            con.close()
    api_usage(h, req)


ROUTES = {
    "/api/admin/usage": api_usage,
    "/api/admin/vacuum": api_vacuum,
}
