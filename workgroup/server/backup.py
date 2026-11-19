# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 시스템 전체 백업 · 복원 · 자동 백업 (v4.0.0) — 시스템관리자

백업 파일: data/backups/system_<일시>_<구분>.zip
  manifest.json  — 만든 때 · 구분(manual/auto/before-restore/uploaded) · 첨부 포함 여부 · 버전
  db.sqlite      — 모든 프로젝트 · 사용자 계정 · 공정 유형 · 설정 (SQLite 온라인 백업)
  upload/...     — 첨부파일 (선택)
복원: 복원 직전 상태를 먼저 자동 백업 → DB 를 백업본으로 덮어씀(SQLite backup API) → 첨부가 들어 있으면 첨부 폴더도 바꿈
자동 백업(선택): 켜면 서버가 정해진 간격(시간)마다 만들고 최근 N개만 보관 — 설정은 DB(TB_META 'auto_backup')

  POST /api/admin/backup/list | create {withFiles} | restore {name} | delete {name} | settings {enabled, hours, keep, withFiles}
  GET  /api/admin/backup/download?name=
  POST /api/admin/backup/upload?name=   본문 = zip 파일
"""
import datetime
import json
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import urllib.parse
import zipfile

from . import settings
from .common import AuthError, now_str
from .logger import write_server_log
from .settings import APP_CONFIG, DATA_DIR, DB_LOCK, UPLOAD_DIR
from .store import Store

BACKUP_DIR = DATA_DIR / "backups"
NAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,120}\.(zip|json)$")
MAX_UPLOAD = 4 * 1024 * 1024 * 1024
DEFAULT_AUTO = {"enabled": False, "hours": 24, "keep": 14, "withFiles": False, "last": ""}
_auto_lock = threading.Lock()


def _path(name):
    if not NAME_RE.match(str(name or "")):
        raise AuthError("백업 파일 이름이 올바르지 않습니다.", 400)
    p = (BACKUP_DIR / name).resolve()
    if p.parent != BACKUP_DIR.resolve():
        raise AuthError("백업 파일 이름이 올바르지 않습니다.", 400)
    return p


def _meta_get(key, default):
    conn = Store.connect()
    try:
        row = conn.execute("SELECT META_VALUE FROM TB_META WHERE META_KEY = ?", (key,)).fetchone()
    finally:
        conn.close()
    try:
        return dict(default, **json.loads(row[0])) if row else dict(default)
    except Exception:
        return dict(default)


def _meta_set(key, value):
    with DB_LOCK:
        conn = Store.connect()
        try:
            conn.execute("INSERT OR REPLACE INTO TB_META VALUES (?, ?)", (key, json.dumps(value, ensure_ascii=False)))
            conn.commit()
        finally:
            conn.close()


def auto_settings():
    return _meta_get("auto_backup", DEFAULT_AUTO)


def create(kind="manual", with_files=False, who="system"):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    name = f"system_{stamp}_{kind}.zip"
    path = BACKUP_DIR / name
    n = 1
    while path.exists():
        n += 1
        name = f"system_{stamp}_{kind}_{n}.zip"
        path = BACKUP_DIR / name
    with tempfile.TemporaryDirectory() as tmp:
        db_copy = f"{tmp}/db.sqlite"
        with DB_LOCK:
            src = Store.connect()
            dst = sqlite3.connect(db_copy)
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
        files = 0
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_copy, "db.sqlite")
            if with_files and UPLOAD_DIR.exists():
                for f in sorted(UPLOAD_DIR.rglob("*")):
                    if f.is_file() and not f.name.endswith(".part"):
                        zf.write(f, "upload/" + f.relative_to(UPLOAD_DIR).as_posix())
                        files += 1
            zf.writestr("manifest.json", json.dumps({"app": "IOSTAR-PM", "version": APP_CONFIG.get("version"), "kind": kind, "createdAt": now_str(),
                                                     "createdBy": who, "withFiles": bool(with_files), "files": files}, ensure_ascii=False))
    write_server_log(f"[BACKUP] {name} created ({kind}, files={files}) by {who}")
    return name


def _manifest(path):
    try:
        with zipfile.ZipFile(path) as zf:
            return json.loads(zf.read("manifest.json").decode("utf-8"))
    except Exception:
        return None


def list_backups():
    out = []
    if BACKUP_DIR.exists():
        for p in sorted(BACKUP_DIR.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
            if not p.is_file() or not NAME_RE.match(p.name):
                continue
            if p.suffix == ".zip":
                m = _manifest(p) or {}
                out.append({"name": p.name, "type": "system", "kind": m.get("kind", "?"), "withFiles": bool(m.get("withFiles")), "files": m.get("files", 0),
                            "createdAt": m.get("createdAt", ""), "createdBy": m.get("createdBy", ""), "size": p.stat().st_size, "valid": bool(m)})
            else:  # 프로젝트 Task 초기화 전 자동 저장 (JSON, 내려받기만)
                out.append({"name": p.name, "type": "project-tasks", "kind": "before-clear", "withFiles": False, "files": 0,
                            "createdAt": datetime.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"), "createdBy": "", "size": p.stat().st_size, "valid": True})
    return out


def prune(keep):
    autos = [b for b in list_backups() if b["type"] == "system" and b["kind"] == "auto"]
    for b in autos[max(1, int(keep)):]:
        (BACKUP_DIR / b["name"]).unlink(missing_ok=True)


def restore(name, who):
    path = _path(name)
    if path.suffix != ".zip" or not path.exists():
        raise AuthError("시스템 백업(zip) 파일을 찾을 수 없습니다.", 404)
    m = _manifest(path)
    if not m:
        raise AuthError("IOSTAR-PM 시스템 백업 파일이 아닙니다.", 400)
    before = create("before-restore", with_files=bool(m.get("withFiles")), who=who)
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(path) as zf:
            zf.extract("db.sqlite", tmp)
            src = sqlite3.connect(f"{tmp}/db.sqlite")
            try:
                if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise AuthError("백업 DB 가 손상되어 복원할 수 없습니다.", 400)
                with DB_LOCK:
                    dst = Store.connect()
                    try:
                        src.backup(dst)
                    finally:
                        dst.close()
            finally:
                src.close()
            if m.get("withFiles"):
                old = UPLOAD_DIR.with_name(UPLOAD_DIR.name + "_old")
                shutil.rmtree(old, ignore_errors=True)
                if UPLOAD_DIR.exists():
                    UPLOAD_DIR.rename(old)
                UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                for info in zf.infolist():
                    if info.filename.startswith("upload/") and not info.is_dir():
                        rel = info.filename[len("upload/"):]
                        target = (UPLOAD_DIR / rel).resolve()
                        if UPLOAD_DIR.resolve() not in target.parents:
                            continue
                        target.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(info) as s, open(target, "wb") as d:
                            shutil.copyfileobj(s, d)
                shutil.rmtree(old, ignore_errors=True)
    Store.init_schema()  # 이전 버전 백업이면 표 구조를 맞춤
    _clear_locks(who)
    write_server_log(f"[BACKUP] restored {name} by {who} (before-restore backup: {before})")
    return before


def _clear_locks(who):
    """[Workgroup] 시스템 복원 뒤에는 그 시점의 체크아웃 잠금을 모두 해제"""
    with DB_LOCK:
        conn = Store.connect()
        try:
            cur = conn.cursor()
            from . import locks
            locks._schema(cur)
            cur.execute("DELETE FROM TB_LOCK")
            conn.commit()
        finally:
            conn.close()


def auto_loop():
    """자동 백업 (선택): 켜져 있으면 간격이 지났을 때 만들고 최근 N개만 보관"""
    while True:
        try:
            with _auto_lock:
                cfg = auto_settings()
                if cfg.get("enabled"):
                    last = cfg.get("last") or ""
                    due = True
                    if last:
                        try:
                            due = (datetime.datetime.now() - datetime.datetime.strptime(last, "%Y-%m-%d %H:%M:%S")).total_seconds() >= float(cfg.get("hours", 24)) * 3600
                        except ValueError:
                            due = True
                    if due:
                        create("auto", bool(cfg.get("withFiles")), "auto")
                        cfg["last"] = now_str()
                        _meta_set("auto_backup", cfg)
                        prune(cfg.get("keep", 14))
        except Exception as e:  # pragma: no cover
            write_server_log(f"[BACKUP] auto backup failed: {e}")
        time.sleep(300)


def start_auto():
    threading.Thread(target=auto_loop, name="auto-backup", daemon=True).start()


# ---- API ----
def _admin(h, req=None):
    return h._require_user(roles={"SYS_ADMIN"}, req=req)


def api_list(h, req):
    _admin(h, req)
    h._send_json(200, {"ok": True, "backups": list_backups(), "auto": auto_settings(), "folder": str(BACKUP_DIR)})


def api_create(h, req):
    u = _admin(h, req)
    name = create("manual", bool(req.get("withFiles")), u["empNo"])
    h._send_json(200, {"ok": True, "name": name, "backups": list_backups()})


def api_restore(h, req):
    u = _admin(h, req)
    before = restore(str(req.get("name") or ""), u["empNo"])
    h._send_json(200, {"ok": True, "before": before, "backups": list_backups()})


def api_delete(h, req):
    _admin(h, req)
    _path(str(req.get("name") or "")).unlink(missing_ok=True)
    h._send_json(200, {"ok": True, "backups": list_backups()})


def api_settings(h, req):
    _admin(h, req)
    cfg = auto_settings()
    cfg.update({"enabled": bool(req.get("enabled")), "withFiles": bool(req.get("withFiles")),
                "hours": max(1, min(24 * 30, int(req.get("hours") or 24))), "keep": max(1, min(365, int(req.get("keep") or 14)))})
    _meta_set("auto_backup", cfg)
    h._send_json(200, {"ok": True, "auto": cfg})


def download(h):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(h.path).query)
    try:
        _admin(h)
        path = _path((q.get("name") or [""])[0])
        if not path.exists():
            raise AuthError("백업 파일을 찾을 수 없습니다.", 404)
    except AuthError as ae:
        h._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401})
        return
    h.send_response(200)
    h.send_header("Content-Type", "application/octet-stream")
    h.send_header("Content-Length", str(path.stat().st_size))
    h.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + urllib.parse.quote(path.name, safe=""))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    with open(path, "rb") as f:
        shutil.copyfileobj(f, h.wfile, 1024 * 256)


def upload(h):
    """PC 에 보관한 시스템 백업(zip)을 서버 백업 목록에 올림 (복원은 목록에서)"""
    length = int(h.headers.get("Content-Length", 0) or 0)
    try:
        u = _admin(h)
        if length <= 0 or length > MAX_UPLOAD:
            raise AuthError("백업 파일 크기가 올바르지 않습니다.", 413)
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        name = f"system_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_uploaded.zip"
        path = BACKUP_DIR / name
        left = length
        with open(path, "wb") as out:
            while left > 0:
                chunk = h.rfile.read(min(1024 * 256, left))
                if not chunk:
                    break
                out.write(chunk)
                left -= len(chunk)
        if left > 0 or not _manifest(path):
            path.unlink(missing_ok=True)
            raise AuthError("IOSTAR-PM 시스템 백업(zip) 파일이 아닙니다.", 400)
        write_server_log(f"[BACKUP] uploaded {name} by {u['empNo']}")
        h._send_json(200, {"ok": True, "name": name, "backups": list_backups()})
    except AuthError as ae:
        h.close_connection = True
        h._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401})


ROUTES = {
    "/api/admin/backup/list": api_list,
    "/api/admin/backup/create": api_create,
    "/api/admin/backup/restore": api_restore,
    "/api/admin/backup/delete": api_delete,
    "/api/admin/backup/settings": api_settings,
}
_ = settings
