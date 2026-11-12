# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 오류 로그 — 오류만 logs/error.log 하나에 기록 (크기 제한, 용량 초과 방지)
   write_server_log() 로 들어오는 메시지 중 [ERROR] 로 시작하는 것만 남기고 나머지(접속 · 작업 기록)는 버림"""
import sys
import threading

from . import settings
from .common import now_str

_lock = threading.Lock()


def _trim(path):
    """크기 제한을 넘으면 뒤쪽 절반만 남김"""
    try:
        if path.stat().st_size > settings.LOG_MAX_BYTES:
            data = path.read_bytes()[-settings.LOG_MAX_BYTES // 2:]
            cut = data.find(b"\n")
            path.write_bytes(data[cut + 1:] if cut >= 0 else data)
    except OSError:
        pass


def write_server_log(msg):
    if not str(msg).startswith("[ERROR]"):
        return
    line = f"[{now_str()}] {str(msg).rstrip()}\n"
    try:
        with _lock:
            settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
            path = settings.LOG_DIR / "error.log"
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
            _trim(path)
    except OSError as e:
        sys.stderr.write(f"[LOG] {e}\n")
    if settings.LOG_CONSOLE:
        sys.stderr.write(line)
        sys.stderr.flush()
