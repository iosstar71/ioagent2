# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 공통: 오류 형식 · 시각 · 역할 상수"""
import datetime

from .settings import DEFAULT_PROJECT, GLOBAL_KEYS


def dkey(pid, key):
    """데이터셋 저장 키: 기본 프로젝트·공통 데이터는 기존 키 그대로 (v1.0.9 이하 DB 호환), 그 밖은 '프로젝트ID::키'"""
    return key if (key in GLOBAL_KEYS or pid == DEFAULT_PROJECT) else f"{pid}::{key}"


MANAGER_ROLES = {"SYS_ADMIN", "PM"}
ALL_SUBSYSTEM_ROLES = {"SYS_ADMIN", "PM", "LEAD"}
USER_SELF_FIELDS = {"name", "dept", "lang"}


class SecurityError(Exception):
    """보안 정책 위반"""


class AuthError(Exception):
    """인증 필요 / 권한 없음"""

    def __init__(self, message, status=401, code=""):
        super().__init__(message)
        self.status = status
        self.code = code


def now_str():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
