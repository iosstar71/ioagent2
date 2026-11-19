# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 로그인 세션 · 로그인 시도 제한"""
import secrets
import threading
import time

from .settings import SESSION_TTL_SEC
from .common import AuthError
from .security import must_change_password
from .permission import normalize_role
from .store import Store


# ---------------------------------------------------------------------------
# 세션 (메모리 토큰)
# ---------------------------------------------------------------------------
class Sessions:
    _items = {}
    _lock = threading.Lock()

    @classmethod
    def create(cls, user_row):
        token = secrets.token_urlsafe(32)
        info = {
            "empNo": user_row["empNo"],
            "name": user_row.get("name") or user_row["empNo"],
            "role": normalize_role(user_row.get("role")),
            "subsystem": user_row.get("subsystem") or "ALL",
            "dept": user_row.get("dept", ""),
            "lang": user_row.get("lang", "ko"),
            "mustChange": must_change_password(user_row),
            "exp": time.time() + SESSION_TTL_SEC,
        }
        with cls._lock:
            cls._items[token] = info
        return token, info

    @classmethod
    def get(cls, token):
        with cls._lock:
            info = cls._items.get(token or "")
            if not info:
                return None
            if info["exp"] < time.time():
                cls._items.pop(token, None)
                return None
            info["exp"] = time.time() + SESSION_TTL_SEC  # 사용 시 연장
            return info

    @classmethod
    def refresh_user(cls, token):
        """권한 변경이 즉시 반영되도록 매 요청 시 최신 사용자 정보로 갱신"""
        info = cls.get(token)
        if not info:
            return None
        row = next((u for u in Store.get_users() if str(u.get("empNo", "")).lower() == info["empNo"].lower()), None)
        if not row:
            cls.drop(token)
            return None
        info.update({"name": row.get("name") or info["name"], "role": normalize_role(row.get("role")), "dept": row.get("dept", ""),
                     "subsystem": row.get("subsystem") or "ALL", "lang": row.get("lang", info.get("lang", "ko")),
                     "mustChange": must_change_password(row), "projectRoles": row.get("projectRoles") or {}})
        return info

    @classmethod
    def drop(cls, token):
        with cls._lock:
            cls._items.pop(token or "", None)


class LoginThrottle:
    """사번별 연속 실패 5회 시 60초간 로그인/비밀번호 변경 차단 (무차별 대입 방지)"""
    _fails = {}
    _lock = threading.Lock()

    @classmethod
    def check(cls, emp):
        with cls._lock:
            cnt, until = cls._fails.get(emp.lower(), (0, 0))
            if until > time.time():
                raise AuthError(f"로그인 5회 실패로 {int(until - time.time())}초 후 다시 시도할 수 있습니다.", 429)

    @classmethod
    def fail(cls, emp):
        with cls._lock:
            cnt, _ = cls._fails.get(emp.lower(), (0, 0))
            cnt += 1
            cls._fails[emp.lower()] = (0, time.time() + 60) if cnt >= 5 else (cnt, 0)

    @classmethod
    def ok(cls, emp):
        with cls._lock:
            cls._fails.pop(emp.lower(), None)


def public_user(info):
    out = {k: info.get(k) for k in ("empNo", "name", "role", "subsystem", "dept", "lang", "projectId", "baseRole")}
    out["mustChangePassword"] = bool(info.get("mustChange"))
    return out
