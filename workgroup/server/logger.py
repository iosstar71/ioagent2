# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 서버 로그 (날짜별 파일)"""
import datetime
import sys
import threading

from . import settings
from .common import now_str


_log_state = {"file": None, "date": None}
_log_lock = threading.Lock()


def write_server_log(msg):
    formatted = f"[{now_str()}] {msg.rstrip()}\n"
    if settings.LOG_DATE_MODE and settings.LOG_DIR:
        today = datetime.datetime.now().strftime("%Y%m%d")
        try:
            with _log_lock:
                if _log_state["file"] is None or _log_state["date"] != today:
                    if _log_state["file"]:
                        _log_state["file"].close()
                    settings.LOG_DIR.mkdir(parents=True, exist_ok=True)
                    _log_state["file"] = open(settings.LOG_DIR / f"server_{today}.log", "a", encoding="utf-8", buffering=1)
                    _log_state["date"] = today
                _log_state["file"].write(formatted)
        except Exception as e:
            sys.stderr.write(f"[LOG ERROR] {e}\n")
    if not settings.LOG_SILENT_MODE:
        sys.stderr.write(formatted)
        sys.stderr.flush()
