# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 비밀번호 해시 (PBKDF2)"""
import hashlib
import hmac
import secrets

from . import settings
from .settings import PWD_RECORD_PREFIX, PWD_SALT


def hash_password(plain: str) -> str:
    return hashlib.sha256((plain + PWD_SALT).encode("utf-8")).hexdigest()


DEFAULT_PWD_HASH = hash_password("1234")


def is_pwd_record(value) -> bool:
    return isinstance(value, str) and value.startswith(PWD_RECORD_PREFIX)


def is_client_hash(value) -> bool:
    v = str(value or "")
    return len(v) == 64 and all(c in "0123456789abcdef" for c in v.lower())


def make_pwd_record(client_hash: str, iterations: int = None) -> str:
    it = int(iterations or settings.PBKDF2_ITERATIONS)
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", str(client_hash).lower().encode("ascii"), salt, it)
    return f"{PWD_RECORD_PREFIX}{it}${salt.hex()}${dk.hex()}"


def verify_pwd(stored, client_hash) -> bool:
    """저장값(빈 값=초기 비밀번호 / PBKDF2 레코드 / v1.0.9 이하 SHA-256)과 브라우저 1차 해시 비교 (상수 시간)"""
    ch = str(client_hash or "").lower()
    if not is_client_hash(ch):
        return False
    if not stored:
        return hmac.compare_digest(ch, DEFAULT_PWD_HASH)
    if is_pwd_record(stored):
        try:
            _, it, salt_hex, dk_hex = stored.split("$")
            dk = hashlib.pbkdf2_hmac("sha256", ch.encode("ascii"), bytes.fromhex(salt_hex), int(it))
            return hmac.compare_digest(dk.hex(), dk_hex)
        except (ValueError, TypeError):
            return False
    return hmac.compare_digest(str(stored).lower(), ch)


def must_change_password(row) -> bool:
    """초기 비밀번호(1234) 사용 중이거나 관리자가 지정한 임시 비밀번호이면 첫 로그인 시 변경 필수"""
    return not (row or {}).get("pwdHash") or bool((row or {}).get("pwdTemp"))
