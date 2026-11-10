# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 첨부파일 저장소 (v3.6.0)

정책 (conf/app.ini [files] 에서 바꿀 수 있음)
  - 크기      : 파일 1개 최대 20MB, 프로젝트별 합계 5GB
  - 유형      : 허용 확장자만 (문서 · 이미지 · 압축). 실행 파일은 확장자를 바꿔도 내용으로 거부
  - 저장 위치 : upload/<프로젝트>/<연월>/<임의 이름> — 웹 루트(webapp) 밖, 원래 파일 이름은 DB 에만 기록
  - 버전      : 같은 이름으로 다시 올리면 새 버전, 이전 버전은 최근 10개까지 보관 (넘으면 휴지통)
  - 삭제      : 휴지통으로 이동 → 30일 뒤 자동으로 완전 삭제 (그 전에는 PM · 시스템관리자가 되살릴 수 있음)
  - 권한      : 올리기 · 삭제 = 그 서브시스템을 저장할 수 있는 사람, 내려받기 = 프로젝트 참여자 전체
"""
import datetime
import hashlib
import re
import secrets
import shutil
import time

from .common import MANAGER_ROLES, AuthError, now_str
from .logger import write_server_log
from .permission import can_write
from .settings import (
    DB_LOCK,
    FILE_ALLOWED_EXTENSIONS,
    FILE_KEEP_VERSIONS,
    FILE_MAX_BYTES,
    FILE_OWNER_TYPES,
    FILE_PROJECT_QUOTA_BYTES,
    FILE_TRASH_DAYS,
    UPLOAD_DIR,
)
from .store import Store

OWNER_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
FILE_ID_RE = re.compile(r"^[0-9a-f]{32}$")
# 실행 파일 · 스크립트의 시작 바이트 (확장자를 바꿔 올려도 거부)
BLOCKED_SIGNATURES = (b"MZ", b"\x7fELF", b"#!", b"\xca\xfe\xba\xbe", b"\xcf\xfa\xed\xfe")
COLS = "FILE_ID, PROJECT_ID, OWNER_TYPE, OWNER_ID, SUBSYSTEM, FILE_NAME, FILE_SIZE, SHA256, VERSION, STORED_PATH, UPLOADED_BY, UPLOADED_NAME, UPLOADED_AT, DELETED_AT, DELETED_BY"


def clean_file_name(name):
    """경로 · 제어 문자를 뺀 파일 이름과 확장자"""
    name = str(name or "").replace("\\", "/").split("/")[-1]
    name = "".join(ch for ch in name if ch >= " " and ch not in '<>:"|?*').strip(" .")
    if not name:
        raise AuthError("파일 이름이 올바르지 않습니다.", 400)
    if len(name) > 150:
        raise AuthError("파일 이름이 너무 깁니다. (150자 이하)", 400)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in FILE_ALLOWED_EXTENSIONS:
        raise AuthError(f"올릴 수 없는 파일 유형입니다: .{ext or '(확장자 없음)'}  (허용: {', '.join(sorted(FILE_ALLOWED_EXTENSIONS))})", 415, "FILE_TYPE")
    return name, ext


class FileStore:
    _last_purge = 0.0

    @staticmethod
    def policy():
        return {"maxBytes": FILE_MAX_BYTES, "quotaBytes": FILE_PROJECT_QUOTA_BYTES, "trashDays": FILE_TRASH_DAYS,
                "keepVersions": FILE_KEEP_VERSIONS, "extensions": sorted(FILE_ALLOWED_EXTENSIONS)}

    @classmethod
    def init_schema(cls):
        with DB_LOCK:
            conn = Store.connect()
            try:
                conn.execute("""CREATE TABLE IF NOT EXISTS TB_ATTACH (
                    FILE_ID TEXT PRIMARY KEY, PROJECT_ID TEXT NOT NULL, OWNER_TYPE TEXT NOT NULL, OWNER_ID TEXT NOT NULL,
                    SUBSYSTEM TEXT, FILE_NAME TEXT NOT NULL, FILE_SIZE INTEGER NOT NULL, SHA256 TEXT, VERSION INTEGER NOT NULL,
                    STORED_PATH TEXT NOT NULL, UPLOADED_BY TEXT, UPLOADED_NAME TEXT, UPLOADED_AT TEXT, DELETED_AT TEXT, DELETED_BY TEXT)""")
                conn.execute("CREATE INDEX IF NOT EXISTS IX_ATTACH_OWNER ON TB_ATTACH (PROJECT_ID, OWNER_TYPE, OWNER_ID)")
                conn.commit()
            finally:
                conn.close()
        cls.purge_expired(force=True)

    @staticmethod
    def _row(r):
        return {"id": r[0], "projectId": r[1], "ownerType": r[2], "ownerId": r[3], "system": r[4] or "", "name": r[5], "size": r[6],
                "sha256": r[7], "version": r[8], "path": r[9], "uploadedBy": r[10], "uploadedName": r[11], "uploadedAt": r[12],
                "deletedAt": r[13] or "", "deletedBy": r[14] or ""}

    @staticmethod
    def public(f):
        return {k: v for k, v in f.items() if k not in ("path", "projectId")}

    # ---- 권한 ----
    @staticmethod
    def owner_system(pid, owner_type, owner_id, fallback=""):
        """첨부 대상 행(서버에 저장된 것)의 서브시스템 — 아직 저장 전인 새 행이면 화면이 보낸 값"""
        key = FILE_OWNER_TYPES[owner_type]
        data, _ = Store.load([key], pid)
        for row in data.get(key) or []:
            if str(row.get("fileKey") or "") == owner_id:
                return str(row.get("system") or "")
        return str(fallback or "")

    @classmethod
    def require_write(cls, user, owner_type, owner_id, fallback=""):
        if user.get("projectStatus") == "ARCHIVED" and user.get("baseRole") != "SYS_ADMIN":
            raise AuthError("보관된 프로젝트에는 파일을 올리거나 지울 수 없습니다.", 403)
        system = cls.owner_system(user["projectId"], owner_type, owner_id, fallback)
        if not system or not can_write(user, FILE_OWNER_TYPES[owner_type], system, None):
            raise AuthError(f"담당 서브시스템이 아니어서 첨부파일을 바꿀 수 없습니다. ({system or '서브시스템 없음'})", 403)
        return system

    @staticmethod
    def check_owner(owner_type, owner_id):
        if owner_type not in FILE_OWNER_TYPES or not OWNER_ID_RE.match(str(owner_id or "")):
            raise AuthError("첨부 대상이 올바르지 않습니다.", 400)

    # ---- 조회 ----
    @classmethod
    def get(cls, pid, file_id):
        if not FILE_ID_RE.match(str(file_id or "")):
            return None
        conn = Store.connect()
        try:
            r = conn.execute(f"SELECT {COLS} FROM TB_ATTACH WHERE FILE_ID = ? AND PROJECT_ID = ?", (file_id, pid)).fetchone()
        finally:
            conn.close()
        return cls._row(r) if r else None

    @classmethod
    def list(cls, pid, owner_type=None, owner_id=None, trash=False):
        sql = f"SELECT {COLS} FROM TB_ATTACH WHERE PROJECT_ID = ? AND DELETED_AT IS {'NOT NULL' if trash else 'NULL'}"
        args = [pid]
        if owner_type and owner_id:
            sql += " AND OWNER_TYPE = ? AND OWNER_ID = ?"
            args += [owner_type, owner_id]
        conn = Store.connect()
        try:
            rows = conn.execute(sql + " ORDER BY FILE_NAME COLLATE NOCASE, VERSION DESC", args).fetchall()
        finally:
            conn.close()
        return [cls._row(r) for r in rows]

    @classmethod
    def summary(cls, pid):
        conn = Store.connect()
        try:
            counts = {}
            for t, o, n in conn.execute("SELECT OWNER_TYPE, OWNER_ID, COUNT(DISTINCT LOWER(FILE_NAME)) FROM TB_ATTACH "
                                        "WHERE PROJECT_ID = ? AND DELETED_AT IS NULL GROUP BY OWNER_TYPE, OWNER_ID", (pid,)):
                counts.setdefault(t, {})[o] = n
            used = conn.execute("SELECT COALESCE(SUM(FILE_SIZE), 0) FROM TB_ATTACH WHERE PROJECT_ID = ?", (pid,)).fetchone()[0]
            trash = conn.execute("SELECT COUNT(*) FROM TB_ATTACH WHERE PROJECT_ID = ? AND DELETED_AT IS NOT NULL", (pid,)).fetchone()[0]
        finally:
            conn.close()
        return {"counts": counts, "usedBytes": used, "trashCount": trash}

    # ---- 올리기 ----
    @classmethod
    def save_stream(cls, user, owner_type, owner_id, system, name, stream, length):
        pid = user["projectId"]
        name, _ext = clean_file_name(name)
        if length <= 0:
            raise AuthError("빈 파일은 올릴 수 없습니다.", 400)
        if length > FILE_MAX_BYTES:
            raise AuthError(f"파일이 너무 큽니다. (파일 1개 최대 {FILE_MAX_BYTES // 1024 // 1024}MB)", 413, "FILE_TOO_LARGE")
        if cls.summary(pid)["usedBytes"] + length > FILE_PROJECT_QUOTA_BYTES:
            raise AuthError(f"프로젝트 첨부파일 저장 한도({FILE_PROJECT_QUOTA_BYTES // 1024 // 1024}MB)를 넘습니다. 휴지통을 비우거나 필요 없는 파일을 지우세요.", 413, "FILE_QUOTA")
        file_id = secrets.token_hex(16)
        rel = f"{pid}/{datetime.datetime.now().strftime('%Y%m')}/{file_id}"
        dst = UPLOAD_DIR / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_name(file_id + ".part")
        digest = hashlib.sha256()
        left = length
        first = True
        try:
            with open(tmp, "wb") as out:
                while left > 0:
                    chunk = stream.read(min(65536, left))
                    if not chunk:
                        raise AuthError("파일 전송이 중간에 끊겼습니다. 다시 올리세요.", 400)
                    if first:
                        first = False
                        if chunk.startswith(BLOCKED_SIGNATURES):
                            raise AuthError("실행 파일 · 스크립트는 올릴 수 없습니다.", 415, "FILE_TYPE")
                    digest.update(chunk)
                    out.write(chunk)
                    left -= len(chunk)
            tmp.replace(dst)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
        now = now_str()
        with DB_LOCK:
            conn = Store.connect()
            try:
                cur = conn.cursor()
                key = (pid, owner_type, owner_id, name.lower())
                ver = cur.execute("SELECT COALESCE(MAX(VERSION), 0) FROM TB_ATTACH WHERE PROJECT_ID = ? AND OWNER_TYPE = ? AND OWNER_ID = ? "
                                  "AND LOWER(FILE_NAME) = ?", key).fetchone()[0] + 1
                cur.execute(f"INSERT INTO TB_ATTACH ({COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
                            (file_id, pid, owner_type, owner_id, system, name, length, digest.hexdigest(), ver, rel,
                             user["empNo"], user.get("name", ""), now))
                # 이전 버전은 최근 N개까지만 보관 — 넘는 것은 휴지통으로
                old = cur.execute("SELECT FILE_ID FROM TB_ATTACH WHERE PROJECT_ID = ? AND OWNER_TYPE = ? AND OWNER_ID = ? AND LOWER(FILE_NAME) = ? "
                                  "AND DELETED_AT IS NULL ORDER BY VERSION DESC LIMIT -1 OFFSET ?", key + (FILE_KEEP_VERSIONS,)).fetchall()
                for (fid,) in old:
                    cur.execute("UPDATE TB_ATTACH SET DELETED_AT = ?, DELETED_BY = ? WHERE FILE_ID = ?", (now, "(버전 정리)", fid))
                conn.commit()
            finally:
                conn.close()
        write_server_log(f"[FILE] upload {pid} {owner_type}/{owner_id} '{name}' v{ver} {length:,}B by {user['empNo']}")
        return cls.get(pid, file_id)

    # ---- 삭제 · 복원 ----
    @classmethod
    def _set_deleted(cls, pid, file_id, deleted_at, who):
        with DB_LOCK:
            conn = Store.connect()
            try:
                conn.execute("UPDATE TB_ATTACH SET DELETED_AT = ?, DELETED_BY = ? WHERE FILE_ID = ? AND PROJECT_ID = ?", (deleted_at, who, file_id, pid))
                conn.commit()
            finally:
                conn.close()

    @classmethod
    def trash(cls, user, f):
        cls._set_deleted(f["projectId"], f["id"], now_str(), user["empNo"])
        write_server_log(f"[FILE] trash {f['projectId']} '{f['name']}' v{f['version']} by {user['empNo']}")

    @classmethod
    def restore(cls, user, f):
        cls._set_deleted(f["projectId"], f["id"], None, None)
        write_server_log(f"[FILE] restore {f['projectId']} '{f['name']}' v{f['version']} by {user['empNo']}")

    @classmethod
    def purge(cls, f, who="auto"):
        (UPLOAD_DIR / f["path"]).unlink(missing_ok=True)
        with DB_LOCK:
            conn = Store.connect()
            try:
                conn.execute("DELETE FROM TB_ATTACH WHERE FILE_ID = ?", (f["id"],))
                conn.commit()
            finally:
                conn.close()
        write_server_log(f"[FILE] purge {f['projectId']} '{f['name']}' v{f['version']} by {who}")

    @classmethod
    def purge_expired(cls, force=False):
        """휴지통 보존 기간이 지난 파일을 완전 삭제 (서버 시작 때 + 1시간에 한 번)"""
        if not force and time.time() - cls._last_purge < 3600:
            return 0
        cls._last_purge = time.time()
        limit = (datetime.datetime.now() - datetime.timedelta(days=FILE_TRASH_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
        conn = Store.connect()
        try:
            rows = conn.execute(f"SELECT {COLS} FROM TB_ATTACH WHERE DELETED_AT IS NOT NULL AND DELETED_AT <= ?", (limit,)).fetchall()
        finally:
            conn.close()
        for r in rows:
            cls.purge(cls._row(r))
        return len(rows)

    @classmethod
    def drop_project(cls, pid):
        """프로젝트를 지우면 그 프로젝트의 첨부파일도 모두 삭제"""
        with DB_LOCK:
            conn = Store.connect()
            try:
                conn.execute("DELETE FROM TB_ATTACH WHERE PROJECT_ID = ?", (pid,))
                conn.commit()
            finally:
                conn.close()
        target = (UPLOAD_DIR / pid).resolve()
        if target.parent == UPLOAD_DIR and target.is_dir():
            shutil.rmtree(target, ignore_errors=True)

    @staticmethod
    def open_path(f):
        path = (UPLOAD_DIR / f["path"]).resolve()
        if UPLOAD_DIR not in path.parents or not path.is_file():
            raise AuthError("파일이 저장소에 없습니다. 관리자에게 문의하세요.", 404)
        return path


def manager_only(user):
    if user["role"] not in MANAGER_ROLES:
        raise AuthError("PM · 시스템관리자만 할 수 있습니다.", 403)

