#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IOSTAR-PM ver1.2.0 - 다중 사용자 DB 웹 서버 (인증 + 충돌 감지)
================================================================================
[v1.0.6 주요 변경]
1) 인증(Authentication)
   - /api/auth/login 으로 사번 + 비밀번호(SHA-256 해시) 검증 후 세션 토큰 발급
   - 모든 데이터·채팅 API 는 "Authorization: Bearer <token>" 필수 (미인증 401)
   - 신규 사용자 자가 등록(/api/auth/register) → 기본 권한 MEMBER(일반 사용자)
2) 권한(Authorization) - 브라우저(js/data-store.js Permission)와 동일 규칙을 서버에서 재검증
   - SYS_ADMIN / PM : 전체 데이터 저장
   - LEAD(총괄리더)  : 전체 서브시스템 업무 데이터 저장 (기준정보 제외)
   - MEMBER         : 담당 서브시스템 데이터만 저장 (그 외 변경은 거부 → blocked 응답)
3) 동시 저장 충돌 감지
   - 데이터셋을 파티션(서브시스템 / 행 ID / 전체) 단위 리비전으로 관리
   - 클라이언트가 불러온 이후 다른 사용자가 같은 파티션을 저장했으면 409 + 충돌 목록 반환
   - force=true(덮어쓰기) 일 때만 강제 저장
4) 데이터 무손실 저장: 데이터셋 원본 JSON(TB_WBS_DATASET) 기준 저장/조회
   - 외부 조회용 관계형 테이블(TB_WBS_TASK 등)은 저장 시 자동 미러링
   - v1.0.5 이하 DB(관계형 테이블)는 최초 기동 시 자동 이관, 빈 DB는 data/initial_data.json 으로 초기화
5) 보안: 경로 탐색 차단, 서버/DB 파일 직접 다운로드 차단, 보안 헤더, 요청 크기 제한
"""

import argparse
import configparser
import datetime
import hashlib
import hmac
import json
import pathlib
import secrets
import ssl
import sqlite3
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

_THIS_DIR0 = pathlib.Path(__file__).resolve().parent
_BASE0 = _THIS_DIR0 if (_THIS_DIR0 / "index.html").exists() else _THIS_DIR0.parent


def load_app_config(base_dir):
    """[v1.2.0] app.ini 읽기 (tools/app_config.py 와 같은 규칙, 서버 단독 실행을 위해 내장)"""
    cfg = {"product_name": "IOSTAR-PM", "edition": "KR", "version": "1.2.0", "default_lang": "ko",
           "default_ui": "standard", "allow_ui_switch": "1", "default_theme": "electric",
           "host": "0.0.0.0", "port": "8080", "db_file": "wbs_enterprise.db", "log_dir": "logs",
           "cert_file": "certs/server.crt", "key_file": "certs/server.key"}
    path = pathlib.Path(base_dir) / "app.ini"
    if path.exists():
        cp = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
        cp.read(path, encoding="utf-8-sig")
        for section in cp.sections():
            for k, v in cp.items(section):
                cfg[k] = v.strip()
    cfg["default_lang"] = "en" if cfg["default_lang"].lower() == "en" else "ko"
    cfg["edition"] = cfg["edition"].upper()
    if not cfg.get("edition_name"):
        cfg["edition_name"] = {"KR": "", "MAIN": "", "STANDARD": "Standard", "NEO": "Neo"}.get(cfg["edition"], cfg["edition"])
    cfg["default_ui"] = "neo" if str(cfg.get("default_ui", "")).lower() == "neo" else "standard"
    cfg["allow_ui_switch"] = "0" if str(cfg.get("allow_ui_switch", "1")).strip() in ("0", "false", "no") else "1"
    cfg["default_theme"] = cfg["default_theme"].lower() if str(cfg.get("default_theme", "")).lower() in ("electric", "navy", "matte", "dark") else "electric"
    return cfg


APP_CONFIG = load_app_config(_BASE0)
VERSION = "ver" + APP_CONFIG["version"]
APP_NAME = f"{APP_CONFIG['product_name']}{' ' + APP_CONFIG['edition_name'] if APP_CONFIG['edition_name'] else ''} {VERSION}"

# Windows 콘솔 한글 출력 인코딩 안전 처리
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

_THIS_DIR = pathlib.Path(__file__).resolve().parent
BASE_DIR = _THIS_DIR if (_THIS_DIR / "index.html").exists() else _THIS_DIR.parent
DATA_DIR = (BASE_DIR / "data").resolve()
DB_PATH = DATA_DIR / "wbs_enterprise.db"
INITIAL_DATA_PATH = DATA_DIR / "initial_data.json"
MAX_BODY_BYTES = 15 * 1024 * 1024
BLOCKED_URL_PREFIXES = ("/server", "/data", "/logs", "/tools", "/certs", "/python", "/.")
BLOCKED_URL_EXTENSIONS = {".py", ".db", ".sqlite", ".sqlite3", ".accdb", ".mdb", ".sql", ".bat", ".sh", ".env", ".log", ".pem", ".key", ".crt", ".pfx"}

PWD_SALT = "WBS_OFFLINE_SECURITY_SALT_2026"  # js/access-control.js 와 동일 (브라우저 1차 해시용)
# [v1.0.10] 서버 저장 비밀번호: 브라우저가 보낸 1차 해시(SHA-256)를 사용자별 솔트 + PBKDF2-SHA256 으로 다시 해시하여 저장
#   저장 형식: pbkdf2_sha256$<반복 횟수>$<솔트 hex>$<해시 hex>
PBKDF2_ITERATIONS = 600_000
PWD_RECORD_PREFIX = "pbkdf2_sha256$"
# [v1.0.10] 콘텐츠 보안 정책: 프로그램 폴더의 스크립트만 실행 (인라인 스크립트·외부 스크립트 차단)
CSP_POLICY = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
              "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
              "frame-ancestors 'self'; worker-src 'self' blob:")
CSP_PAGES = {"/", "/index.html"}
TLS_ACTIVE = False
EXTRA_ALLOWED_ORIGINS = set()
SESSION_TTL_SEC = 12 * 60 * 60
DB_LOCK = threading.RLock()

# ---------------------------------------------------------------------------
# 데이터셋 정의 (js/data-store.js DataRegistry.DEFS 와 동일하게 유지)
# ---------------------------------------------------------------------------
WHOLE = "*"
DATASETS = {
    "projectConfig":            {"part": None,     "scope": "master"},
    "subsystemsMeta":           {"part": None,     "scope": "master"},
    "standardDeliverablesMeta": {"part": None,     "scope": "master"},
    "projectUsers":             {"part": "empNo",  "scope": "users"},
    "wbsData":                  {"part": "system", "scope": "subsystem"},
    "deliverablesData":         {"part": "system", "scope": "subsystem"},
    "reqMasterData":            {"part": "system", "scope": "subsystem"},
    "vocData":                  {"part": "system", "scope": "subsystem"},
    "noticesData":              {"part": "id",     "scope": "shared"},
    "communicationsData":       {"part": "id",     "scope": "shared"},
    "meetingsData":             {"part": "id",     "scope": "shared"},
    "weeklyReportsData":        {"part": "id",     "scope": "weekly"},
    "todosData":                {"part": "id",     "scope": "personal"},  # [v2.4.0] 사용자별 할 일 (본인만)
    "theme":                    {"part": None,     "scope": "pref"},
}
# [v1.0.10] 여러 프로젝트: 사용자 계정·화면 테마는 모든 프로젝트 공통, 그 밖의 데이터는 프로젝트별 저장
DEFAULT_PROJECT = "DEFAULT"
GLOBAL_KEYS = {"projectUsers", "theme"}
PROJECT_ID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
MIRROR_SCHEMA_VERSION = "2"


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


def hash_password(plain: str) -> str:
    return hashlib.sha256((plain + PWD_SALT).encode("utf-8")).hexdigest()


DEFAULT_PWD_HASH = hash_password("1234")


def is_pwd_record(value) -> bool:
    return isinstance(value, str) and value.startswith(PWD_RECORD_PREFIX)


def is_client_hash(value) -> bool:
    v = str(value or "")
    return len(v) == 64 and all(c in "0123456789abcdef" for c in v.lower())


def make_pwd_record(client_hash: str, iterations: int = None) -> str:
    it = int(iterations or PBKDF2_ITERATIONS)
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


def normalize_role(role) -> str:
    r = str(role or "").upper()
    if r in ("SYS_ADMIN", "ADMIN"):
        return "SYS_ADMIN"
    if r == "PM":
        return "PM"
    if r in ("LEAD", "LEADER", "TOTAL_LEAD"):
        return "LEAD"
    return "MEMBER"


def membership(row_or_info, pid):
    """[v3.0.0] 프로젝트 참여 정보: 사용자 행의 projectRoles[프로젝트ID] = {role, subsystem, dept} (있으면 그 프로젝트 사용자)"""
    roles = (row_or_info or {}).get("projectRoles")
    a = roles.get(pid) if isinstance(roles, dict) else None
    return a if isinstance(a, dict) else None


def is_sys_admin(row_or_info):
    return normalize_role((row_or_info or {}).get("baseRole") or (row_or_info or {}).get("role")) == "SYS_ADMIN"


def effective_user(base, project, row=None):
    """[v3.0.0] 사용자 정보는 프로젝트별: 시스템관리자는 모든 프로젝트 관리자, 그 밖에는 그 프로젝트의 참여 정보(역할·담당·부서)"""
    out = dict(base)
    pid = (project or {}).get("id", DEFAULT_PROJECT)
    out["projectId"] = pid
    out["baseRole"] = base.get("role")
    if base.get("role") == "SYS_ADMIN":
        return out
    a = membership(row if row is not None else base, pid)
    if a:
        role = normalize_role(a.get("role"))
        out["role"] = "PM" if role == "SYS_ADMIN" else role
        out["subsystem"] = str(a.get("subsystem") or "ALL")
        if a.get("dept"):
            out["dept"] = a.get("dept")
    else:
        out["role"], out["subsystem"] = "MEMBER", ""
    return out


def can_access_project(base, project):
    """[v3.0.0] 시스템관리자는 모든 프로젝트, 그 밖의 사용자는 참여 중인 프로젝트만"""
    if not project:
        return False
    if base.get("role") == "SYS_ADMIN":
        return True
    return membership(base, project.get("id")) is not None


def project_users_view(users, pid):
    """[v3.0.0] 프로젝트 화면에 보이는 사용자: 시스템관리자 + 이 프로젝트 참여자 (다른 프로젝트 참여 정보는 숨김)"""
    out = []
    for u in users or []:
        if not isinstance(u, dict):
            continue
        if is_sys_admin(u):
            out.append(dict(u, projectRoles={}))
        elif membership(u, pid):
            out.append(dict(u, projectRoles={pid: membership(u, pid)}))
    return out


def clamp_progress(key, value):
    """[v3.0.0] 진척률(계획·실적)은 0~100 만 저장 (화면 입력 검사와 별도로 서버에서도 보정)"""
    if key != "wbsData" or not isinstance(value, list):
        return value
    for t in value:
        if not isinstance(t, dict):
            continue
        for f in ("aProg", "pProg"):
            if f in t:
                try:
                    v = float(t[f] or 0)
                except (TypeError, ValueError):
                    v = 0.0
                t[f] = int(v) if float(v).is_integer() and 0 <= v <= 100 else min(100.0, max(0.0, v))
        if "weight" in t:
            try:
                t["weight"] = max(0.0, float(t["weight"] or 0))
            except (TypeError, ValueError):
                t["weight"] = 0.0
    return value


# ---------------------------------------------------------------------------
# 파티션 (js/data-store.js Partition 과 동일 로직)
# ---------------------------------------------------------------------------
def part_of(key, row):
    field = DATASETS[key]["part"]
    if not field:
        return WHOLE
    v = row.get(field, "") if isinstance(row, dict) else ""
    return "" if v is None else str(v)


def split_parts(key, value):
    field = DATASETS[key]["part"]
    out = {}
    if not field or not isinstance(value, list):
        out[WHOLE] = value
        return out
    for row in value:
        p = part_of(key, row)
        if field == "system":
            out.setdefault(p, []).append(row)
        else:
            out[p] = row
    return out


def merge_parts(key, base, changed):
    field = DATASETS[key]["part"]
    if not field:
        return changed[WHOLE] if WHOLE in changed else base
    base = base if isinstance(base, list) else []
    if field == "system":
        order, groups = [], {}
        for r in base:
            p = part_of(key, r)
            if p not in groups:
                groups[p] = []
                order.append(p)
            groups[p].append(r)
        for p, rows in changed.items():
            if p not in groups:
                order.append(p)
            groups[p] = rows if isinstance(rows, list) else []
        return [r for p in order for r in groups.get(p, [])]
    out, seen = [], set()
    for r in base:
        p = part_of(key, r)
        seen.add(p)
        if p in changed:
            if changed[p]:
                out.append(changed[p])
        else:
            out.append(r)
    for p, row in changed.items():
        if p not in seen and row:
            out.append(row)
    return out


def can_write(user, key, part, row):
    role = user["role"]
    scope = DATASETS[key]["scope"]
    own = str(user.get("subsystem") or "ALL")
    if scope in ("master", "pref"):
        return role in MANAGER_ROLES
    if scope == "users":
        return role in MANAGER_ROLES or str(part).lower() == str(user["empNo"]).lower()
    if scope == "subsystem":
        return role in ALL_SUBSYSTEM_ROLES or own == "ALL" or own == str(part)
    if scope == "weekly":
        if role in ALL_SUBSYSTEM_ROLES:
            return True
        r = row or {}
        return r.get("scope") == "SYS" and (own == "ALL" or own == str(r.get("scopeValue", "")))
    if scope == "shared":
        return True
    if scope == "personal":
        r = row or {}
        return str(r.get("owner", "")).lower() == str(user["empNo"]).lower()
    return False


def own_rows(key, value, revs, user, pid=DEFAULT_PROJECT):
    """[v2.4.0] 개인 데이터(todosData)는 본인 항목과 그 버전 정보만 돌려줌
    [v3.0.0] 사용자 목록은 이 프로젝트의 사용자(시스템관리자 + 참여자)만"""
    if key == "projectUsers" and value is not None:
        rows = project_users_view(value, pid)
        ids = {str(u.get("empNo", "")) for u in rows}
        return rows, {p: v for p, v in (revs or {}).items() if p in ids}
    if DATASETS.get(key, {}).get("scope") != "personal" or not user:
        return value, revs
    me = str(user.get("empNo", "")).lower()
    rows = [r for r in (value or []) if isinstance(r, dict) and str(r.get("owner", "")).lower() == me]
    ids = {str(r.get("id", "")) for r in rows}
    return rows, {p: v for p, v in (revs or {}).items() if p in ids}


# ---------------------------------------------------------------------------
# 저장소
# ---------------------------------------------------------------------------
class Store:
    @staticmethod
    def connect():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH), timeout=10)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    @classmethod
    def init_schema(cls):
        with DB_LOCK:
            conn = cls.connect()
            try:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS TB_WBS_DATASET (
                      DATA_KEY TEXT PRIMARY KEY,
                      JSON_TEXT TEXT,
                      PART_REVS_JSON TEXT,
                      UPDATED_AT TEXT,
                      UPDATED_BY TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_CHAT (
                      MSG_ID TEXT PRIMARY KEY,
                      CHANNEL TEXT DEFAULT '전체',
                      SENDER_NAME TEXT NOT NULL,
                      SENDER_EMP_NO TEXT,
                      USER_ROLE TEXT,
                      MESSAGE TEXT NOT NULL,
                      CREATED_AT TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_CONFIG (
                      PROJECT_ID TEXT PRIMARY KEY DEFAULT 'DEFAULT_PROJ',
                      PROJECT_START_DATE TEXT, PROJECT_END_DATE TEXT, REPORT_DATE TEXT,
                      WEEK_START_DAY INTEGER DEFAULT 5, THEME TEXT DEFAULT 'navy',
                      HOLIDAYS_JSON TEXT, STD_DELIV_JSON TEXT, FULL_CONFIG_JSON TEXT, USERS_JSON TEXT,
                      UPDATED_AT TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_SUBSYSTEM (
                      SUBSYSTEM_CODE TEXT PRIMARY KEY, SUBSYSTEM_NAME TEXT NOT NULL,
                      DOMAIN_NAME TEXT, PROJ_TYPE TEXT, SDLC_CODE TEXT, WEIGHT REAL,
                      PM_NAME TEXT, DESCRIPTION TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_TASK (
                      ROW_SEQ INTEGER PRIMARY KEY, WBS_ID TEXT, LVL INTEGER, SUBSYSTEM_NAME TEXT,
                      TASK_NAME TEXT, WEIGHT REAL, REQ_ID TEXT, PLAN_START TEXT, PLAN_END TEXT,
                      ACT_START TEXT, ACT_END TEXT, PLAN_PROG REAL, ACT_PROG REAL, OUTPUT_NOTE TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_DELIVERABLE (
                      DELIV_ID INTEGER PRIMARY KEY, SUBMIT_ROUND TEXT, SUBSYSTEM_NAME TEXT, PHASE_NAME TEXT,
                      DELIV_NAME TEXT, PLAN_DATE TEXT, ACT_DATE TEXT, STATUS TEXT, MANAGER_NAME TEXT, REMARKS TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_REQ (
                      REQ_ID TEXT, SUBSYSTEM_NAME TEXT, REQ_NAME TEXT, REQ_TYPE TEXT,
                      PRIORITY TEXT, ACCEPT_YN TEXT, STATUS TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_VOC (
                      VOC_ID TEXT, SUBSYSTEM_NAME TEXT, PRIORITY TEXT, VOC_TITLE TEXT, REQUESTER TEXT,
                      REQ_DATE TEXT, TARGET_DATE TEXT, STATUS TEXT, ACTION_NOTE TEXT, SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_NOTICE (
                      NOTICE_ID TEXT, TITLE TEXT, CONTENT TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                      NOTICE_DATE TEXT, PRIORITY TEXT, IS_PINNED INTEGER DEFAULT 0, VIEW_COUNT INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_COMMUNICATION (
                      COMM_ID TEXT, CHANNEL TEXT, TASK_ID TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                      USER_ROLE TEXT, CONTENT TEXT, POST_DATE TEXT, REPLIES_JSON TEXT
                    );
                    """
                )
                conn.commit()
                cls._bootstrap_datasets(conn)
                cls._upgrade_password_records(conn)
                cls._upgrade_multi_project(conn)
                cls._upgrade_memberships(conn)
            finally:
                conn.close()
        return "SQLite 표준 테이블(TB_WBS_DATASET 외) 확인 및 초기화가 완료되었습니다."

    # ---- [v3.0.0] 사용자 정보 프로젝트별: 지금 접근할 수 있던 프로젝트마다 참여 정보(역할·담당·부서)를 만들어 둠 (1회) ----
    @classmethod
    def _upgrade_memberships(cls, conn):
        cur = conn.cursor()
        if cur.execute("SELECT 1 FROM TB_META WHERE META_KEY = 'membership_v3'").fetchone():
            return
        users, revs = cls._read_dataset(cur, "projectUsers")
        projects = [cls._project_row(r) for r in cur.execute(
            "SELECT PROJECT_ID, PROJECT_NAME, STATUS, RESTRICTED, MEMBERS_JSON, CREATED_AT, CREATED_BY, SORT_ORDER FROM TB_PROJECT").fetchall()]
        changed = False
        for u in users or []:
            if not isinstance(u, dict) or is_sys_admin(u):
                continue
            pr = cls._clean_project_roles(u.get("projectRoles"))
            emp = str(u.get("empNo", "")).lower()
            for p in projects:
                old_access = not p["restricted"] or emp in {str(m).lower() for m in p["members"]}
                if old_access and p["id"] not in pr:
                    role = normalize_role(u.get("role"))
                    pr[p["id"]] = {"role": "PM" if role == "SYS_ADMIN" else role, "subsystem": str(u.get("subsystem") or "ALL")[:50],
                                   "dept": str(u.get("dept") or "")[:100]}
            if pr != u.get("projectRoles"):
                u["projectRoles"] = pr
                changed = True
        if changed:
            cls._write_dataset(cur, "projectUsers", users, revs or {}, "upgrade-v3")
        cur.execute("INSERT OR REPLACE INTO TB_META VALUES ('membership_v3', ?)", (now_str(),))
        conn.commit()

    # ---- [v1.0.10] 여러 프로젝트: 프로젝트 목록 테이블, 채팅 프로젝트 구분, 조회용 미러 테이블에 PROJECT_ID 추가 ----
    @classmethod
    def _upgrade_multi_project(cls, conn):
        cur = conn.cursor()
        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS TB_PROJECT (
              PROJECT_ID TEXT PRIMARY KEY, PROJECT_NAME TEXT, STATUS TEXT DEFAULT 'ACTIVE',
              RESTRICTED INTEGER DEFAULT 0, MEMBERS_JSON TEXT DEFAULT '[]',
              CREATED_AT TEXT, CREATED_BY TEXT, SORT_ORDER INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS TB_META (META_KEY TEXT PRIMARY KEY, META_VALUE TEXT);
            """
        )
        cols = [r[1] for r in cur.execute("PRAGMA table_info(TB_WBS_CHAT)").fetchall()]
        if "PROJECT_ID" not in cols:
            cur.execute("ALTER TABLE TB_WBS_CHAT ADD COLUMN PROJECT_ID TEXT DEFAULT 'DEFAULT'")
        if not cur.execute("SELECT 1 FROM TB_PROJECT WHERE PROJECT_ID = ?", (DEFAULT_PROJECT,)).fetchone():
            cfg = cls._read_dataset(cur, "projectConfig")[0] or {}
            cur.execute("INSERT INTO TB_PROJECT VALUES (?, ?, 'ACTIVE', 0, '[]', ?, 'system', 0)",
                        (DEFAULT_PROJECT, cfg.get("projectName") or "기본 프로젝트", now_str()))
        row = cur.execute("SELECT META_VALUE FROM TB_META WHERE META_KEY = 'mirror_schema'").fetchone()
        if not row or row[0] != MIRROR_SCHEMA_VERSION:
            # 조회용 미러 테이블은 데이터셋에서 다시 만들 수 있으므로 새 구조로 재생성
            for t in ("TB_WBS_CONFIG", "TB_WBS_SUBSYSTEM", "TB_WBS_TASK", "TB_WBS_DELIVERABLE", "TB_WBS_REQ", "TB_WBS_VOC",
                      "TB_WBS_NOTICE", "TB_WBS_COMMUNICATION"):
                cur.execute(f"DROP TABLE IF EXISTS {t}")
            cur.executescript(
                """
                CREATE TABLE TB_WBS_CONFIG (
                  PROJECT_ID TEXT PRIMARY KEY, PROJECT_START_DATE TEXT, PROJECT_END_DATE TEXT, REPORT_DATE TEXT,
                  WEEK_START_DAY INTEGER DEFAULT 5, THEME TEXT DEFAULT 'navy',
                  HOLIDAYS_JSON TEXT, STD_DELIV_JSON TEXT, FULL_CONFIG_JSON TEXT, USERS_JSON TEXT, UPDATED_AT TEXT
                );
                CREATE TABLE TB_WBS_SUBSYSTEM (
                  PROJECT_ID TEXT, SUBSYSTEM_CODE TEXT, SUBSYSTEM_NAME TEXT NOT NULL, DOMAIN_NAME TEXT, PROJ_TYPE TEXT,
                  SDLC_CODE TEXT, WEIGHT REAL, PM_NAME TEXT, DESCRIPTION TEXT, SORT_ORDER INTEGER DEFAULT 0,
                  PRIMARY KEY (PROJECT_ID, SUBSYSTEM_CODE)
                );
                CREATE TABLE TB_WBS_TASK (
                  PROJECT_ID TEXT, ROW_SEQ INTEGER, WBS_ID TEXT, LVL INTEGER, SUBSYSTEM_NAME TEXT, TASK_NAME TEXT, WEIGHT REAL,
                  REQ_ID TEXT, PLAN_START TEXT, PLAN_END TEXT, ACT_START TEXT, ACT_END TEXT, PLAN_PROG REAL, ACT_PROG REAL,
                  OUTPUT_NOTE TEXT, STATUS TEXT, PRIMARY KEY (PROJECT_ID, ROW_SEQ)
                );
                CREATE TABLE TB_WBS_DELIVERABLE (
                  PROJECT_ID TEXT, DELIV_ID INTEGER, SUBMIT_ROUND TEXT, SUBSYSTEM_NAME TEXT, PHASE_NAME TEXT, DELIV_NAME TEXT,
                  PLAN_DATE TEXT, ACT_DATE TEXT, STATUS TEXT, MANAGER_NAME TEXT, REMARKS TEXT, PRIMARY KEY (PROJECT_ID, DELIV_ID)
                );
                CREATE TABLE TB_WBS_REQ (
                  PROJECT_ID TEXT, REQ_ID TEXT, SUBSYSTEM_NAME TEXT, REQ_NAME TEXT, REQ_TYPE TEXT,
                  PRIORITY TEXT, ACCEPT_YN TEXT, STATUS TEXT, SORT_ORDER INTEGER DEFAULT 0
                );
                CREATE TABLE TB_WBS_VOC (
                  PROJECT_ID TEXT, VOC_ID TEXT, SUBSYSTEM_NAME TEXT, PRIORITY TEXT, VOC_TITLE TEXT, REQUESTER TEXT,
                  REQ_DATE TEXT, TARGET_DATE TEXT, STATUS TEXT, ACTION_NOTE TEXT, SORT_ORDER INTEGER DEFAULT 0
                );
                CREATE TABLE TB_WBS_NOTICE (
                  PROJECT_ID TEXT, NOTICE_ID TEXT, TITLE TEXT, CONTENT TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                  NOTICE_DATE TEXT, PRIORITY TEXT, IS_PINNED INTEGER DEFAULT 0, VIEW_COUNT INTEGER DEFAULT 0
                );
                CREATE TABLE TB_WBS_COMMUNICATION (
                  PROJECT_ID TEXT, COMM_ID TEXT, CHANNEL TEXT, TASK_ID TEXT, AUTHOR TEXT, AUTHOR_EMP_NO TEXT,
                  USER_ROLE TEXT, CONTENT TEXT, POST_DATE TEXT, REPLIES_JSON TEXT
                );
                """
            )
            for (pid,) in cur.execute("SELECT PROJECT_ID FROM TB_PROJECT").fetchall():
                cls._write_mirror(cur, DATASETS.keys(), pid)
            cur.execute("INSERT OR REPLACE INTO TB_META VALUES ('mirror_schema', ?)", (MIRROR_SCHEMA_VERSION,))
        conn.commit()

    # ---- [v1.0.10] v1.0.9 이하 SHA-256 비밀번호 → PBKDF2 레코드로 일괄 전환 (같은 비밀번호로 계속 로그인 가능) ----
    @classmethod
    def _upgrade_password_records(cls, conn):
        cur = conn.cursor()
        users, revs = cls._read_dataset(cur, "projectUsers")
        if not users:
            return
        n = 0
        for u in users:
            if isinstance(u, dict) and u.get("pwdHash") and not is_pwd_record(u["pwdHash"]) and is_client_hash(u["pwdHash"]):
                u["pwdHash"] = make_pwd_record(u["pwdHash"])
                n += 1
        if n:
            cls._write_dataset(cur, "projectUsers", users, revs, "security-upgrade")
            conn.commit()
            write_server_log(f"[SECURITY] Upgraded {n} password record(s) to PBKDF2-SHA256")

    # ---- 최초 기동: v1.0.5 관계형 데이터 이관 또는 초기 데이터 적재 ----
    @classmethod
    def _bootstrap_datasets(cls, conn):
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM TB_WBS_DATASET")
        if cur.fetchone()[0] > 0:
            return
        data = cls._legacy_load(conn)
        source = "migrated from v1.0.5 relational tables"
        if not data.get("wbsData") and not data.get("projectConfig"):
            data, source = {}, "initial_data.json"
            if INITIAL_DATA_PATH.exists():
                try:
                    data = json.loads(INITIAL_DATA_PATH.read_text(encoding="utf-8"))
                except Exception as ex:
                    write_server_log(f"[WARN] Failed to read initial_data.json: {ex}")
        users = data.get("projectUsers") or []
        if not any(str(u.get("empNo", "")).lower() == "admin" for u in users):
            users.insert(0, {"empNo": "admin", "name": "시스템관리자", "role": "SYS_ADMIN", "subsystem": "ALL", "dept": "", "pwdHash": "", "lang": "ko"})
        data["projectUsers"] = users
        for key in DATASETS:
            if key in data:
                cls._write_dataset(cur, key, data[key], {p: {"rev": 1, "by": "bootstrap", "at": now_str()} for p in split_parts(key, data[key])}, "bootstrap")
        conn.commit()
        write_server_log(f"[INIT] Datasets initialized ({source})")

    @staticmethod
    def _legacy_load(conn):
        """v1.0.5 이하 관계형 테이블 + TB_WBS_EXTRA_JSON 에서 데이터 복원"""
        out = {}
        cur = conn.cursor()
        try:
            cur.execute("SELECT FULL_CONFIG_JSON, USERS_JSON, STD_DELIV_JSON, THEME FROM TB_WBS_CONFIG LIMIT 1")
            row = cur.fetchone()
            if row:
                if row[0]:
                    out["projectConfig"] = json.loads(row[0])
                if row[1]:
                    out["projectUsers"] = json.loads(row[1])
                if row[2]:
                    out["standardDeliverablesMeta"] = json.loads(row[2])
                if row[3]:
                    out["theme"] = row[3]
            cur.execute("SELECT SUBSYSTEM_CODE, SUBSYSTEM_NAME, DOMAIN_NAME, PROJ_TYPE, SDLC_CODE, WEIGHT, PM_NAME, DESCRIPTION FROM TB_WBS_SUBSYSTEM ORDER BY SORT_ORDER")
            out["subsystemsMeta"] = [
                {"code": r[0], "name": r[1], "domain": r[2], "type": r[3], "sdlcCode": r[4], "weight": r[5], "pm": r[6], "desc": r[7]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT WBS_ID, LVL, SUBSYSTEM_NAME, TASK_NAME, WEIGHT, REQ_ID, PLAN_START, PLAN_END, ACT_START, ACT_END, PLAN_PROG, ACT_PROG, OUTPUT_NOTE FROM TB_WBS_TASK ORDER BY ROW_SEQ")
            out["wbsData"] = [
                {"id": r[0], "level": r[1], "system": r[2], "name": r[3], "weight": r[4], "reqId": r[5], "pStart": r[6],
                 "pEnd": r[7], "aStart": r[8], "aEnd": r[9], "pProg": r[10], "aProg": r[11], "output": r[12]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT DELIV_ID, SUBMIT_ROUND, SUBSYSTEM_NAME, PHASE_NAME, DELIV_NAME, PLAN_DATE, ACT_DATE, STATUS, MANAGER_NAME, REMARKS FROM TB_WBS_DELIVERABLE ORDER BY DELIV_ID")
            out["deliverablesData"] = [
                {"id": r[0], "round": r[1], "system": r[2], "phase": r[3], "name": r[4], "pDate": r[5], "aDate": r[6], "status": r[7], "manager": r[8], "remarks": r[9]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT REQ_ID, SUBSYSTEM_NAME, REQ_NAME, REQ_TYPE, PRIORITY, ACCEPT_YN, STATUS FROM TB_WBS_REQ ORDER BY SORT_ORDER")
            out["reqMasterData"] = [
                {"id": r[0], "system": r[1], "name": r[2], "type": r[3], "priority": r[4], "accept": r[5], "status": r[6]}
                for r in cur.fetchall()
            ]
            cur.execute("SELECT VOC_ID, SUBSYSTEM_NAME, PRIORITY, VOC_TITLE, REQUESTER, REQ_DATE, TARGET_DATE, STATUS, ACTION_NOTE FROM TB_WBS_VOC ORDER BY SORT_ORDER")
            out["vocData"] = [
                {"id": r[0], "system": r[1], "priority": r[2], "title": r[3], "requester": r[4], "reqDate": r[5], "targetDate": r[6], "status": r[7], "action": r[8]}
                for r in cur.fetchall()
            ]
        except sqlite3.Error:
            pass
        try:
            cur.execute("SELECT DATA_KEY, JSON_TEXT FROM TB_WBS_EXTRA_JSON")
            for k, txt in cur.fetchall():
                if k in DATASETS and txt:
                    out[k] = json.loads(txt)
        except sqlite3.Error:
            pass
        return {k: v for k, v in out.items() if v not in (None, [], {})}

    # ---- 데이터셋 입출력 ----
    @staticmethod
    def _read_dataset(cur, key):
        cur.execute("SELECT JSON_TEXT, PART_REVS_JSON FROM TB_WBS_DATASET WHERE DATA_KEY = ?", (key,))
        row = cur.fetchone()
        if not row:
            return None, {}
        value = json.loads(row[0]) if row[0] else None
        revs = json.loads(row[1]) if row[1] else {}
        return value, revs

    @staticmethod
    def _write_dataset(cur, key, value, revs, who):
        cur.execute(
            "INSERT OR REPLACE INTO TB_WBS_DATASET (DATA_KEY, JSON_TEXT, PART_REVS_JSON, UPDATED_AT, UPDATED_BY) VALUES (?, ?, ?, ?, ?)",
            (key, json.dumps(value, ensure_ascii=False), json.dumps(revs, ensure_ascii=False), now_str(), who),
        )

    @staticmethod
    def public_value(key, value):
        """응답에서 비밀번호 해시 제거"""
        if key == "projectUsers" and isinstance(value, list):
            return [{k: v for k, v in dict(u, pwdHash="").items() if k not in ("pwdReset",)} for u in value if isinstance(u, dict)]
        return value

    @classmethod
    def load(cls, keys=None, pid=DEFAULT_PROJECT, user=None):
        keys = [k for k in (keys or DATASETS.keys()) if k in DATASETS]
        data, revs = {}, {}
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                for k in keys:
                    value, r = cls._read_dataset(cur, dkey(pid, k))
                    value, r = own_rows(k, value, r, user, pid)
                    if value is not None:
                        data[k] = cls.public_value(k, value)
                    revs[k] = r
            finally:
                conn.close()
        return data, revs

    @classmethod
    def get_users(cls):
        with DB_LOCK:
            conn = cls.connect()
            try:
                value, _ = cls._read_dataset(conn.cursor(), "projectUsers")
                return value or []
            finally:
                conn.close()

    @classmethod
    def get_subsystem_names(cls, pid=DEFAULT_PROJECT):
        with DB_LOCK:
            conn = cls.connect()
            try:
                value, _ = cls._read_dataset(conn.cursor(), dkey(pid, "subsystemsMeta"))
                return [s.get("name") for s in (value or []) if isinstance(s, dict) and s.get("name")]
            finally:
                conn.close()

    @classmethod
    def save(cls, user, changes, force=False, pid=DEFAULT_PROJECT):
        """changes = {key: {"parts": {part: rows|row|None}, "base": {part: rev}}}"""
        who = f"{user.get('name', '')}({user['empNo']})"
        blocked = []
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                current = {}
                conflicts = []
                accepted = {}
                for key, ch in (changes or {}).items():
                    if key not in DATASETS or not isinstance(ch, dict):
                        continue
                    value, revs = cls._read_dataset(cur, dkey(pid, key))
                    current[key] = (value, revs)
                    server_parts = split_parts(key, value) if value is not None else {}
                    parts = ch.get("parts") or {}
                    base = ch.get("base") or {}
                    ok_parts = {}
                    for p, incoming in parts.items():
                        row_for_perm = incoming if isinstance(incoming, dict) else server_parts.get(p)
                        if DATASETS[key]["scope"] == "weekly" and incoming is None:
                            row_for_perm = server_parts.get(p)
                        if not can_write(user, key, p, row_for_perm if isinstance(row_for_perm, dict) else None):
                            blocked.append(f"{key}[{p}]")
                            continue
                        # 주간보고: 다른 서브시스템 보고서로 바꿔 쓰기 방지 / 할 일: 다른 사람 항목을 내 것으로 덮어쓰기 방지
                        if DATASETS[key]["scope"] in ("weekly", "personal") and isinstance(server_parts.get(p), dict) and not can_write(user, key, p, server_parts.get(p)):
                            blocked.append(f"{key}[{p}]")
                            continue
                        if key == "projectUsers":
                            incoming = cls._sanitize_user_row(user, p, incoming, server_parts.get(p), pid)
                            if incoming == "BLOCK":
                                blocked.append(f"{key}[{p}]")
                                continue
                        server_rev = (revs.get(p) or {}).get("rev", 0)
                        if int(base.get(p, 0) or 0) != int(server_rev) and not force:
                            info = revs.get(p) or {}
                            conflicts.append({"key": key, "part": p, "by": info.get("by", ""), "at": info.get("at", "")})
                        ok_parts[p] = incoming
                    if ok_parts:
                        accepted[key] = ok_parts
                if conflicts and not force:
                    return {"ok": False, "conflict": True, "conflicts": conflicts}

                out_data, out_revs = {}, {}
                for key, ok_parts in accepted.items():
                    value, revs = current[key]
                    merged = clamp_progress(key, merge_parts(key, value, ok_parts))
                    for p in ok_parts:
                        revs[p] = {"rev": int((revs.get(p) or {}).get("rev", 0)) + 1, "by": who, "at": now_str()}
                    cls._write_dataset(cur, dkey(pid, key), merged, revs, who)
                    out_data[key], out_revs[key] = own_rows(key, cls.public_value(key, merged), revs, user, pid)
                    if key == "projectConfig" and isinstance(merged, dict) and merged.get("projectName"):
                        cur.execute("UPDATE TB_PROJECT SET PROJECT_NAME = ? WHERE PROJECT_ID = ?", (str(merged["projectName"])[:100], pid))
                cls._write_mirror(cur, accepted.keys(), pid)
                conn.commit()
                return {"ok": True, "data": out_data, "revs": out_revs, "blocked": blocked,
                        "message": f"저장 완료 ({', '.join(out_data.keys()) or '변경 없음'})"}
            finally:
                conn.close()

    @staticmethod
    def _clean_project_roles(value):
        out = {}
        if isinstance(value, dict):
            for k, v in value.items():
                if isinstance(v, dict) and str(k) and set(str(k)) <= PROJECT_ID_CHARS:
                    role = normalize_role(v.get("role"))
                    out[str(k)] = {"role": "PM" if role == "SYS_ADMIN" else role, "subsystem": str(v.get("subsystem") or "ALL")[:50],
                                   "dept": str(v.get("dept") or "")[:100]}
        return out

    @staticmethod
    def _sanitize_user_row(user, part, incoming, stored, pid=DEFAULT_PROJECT):
        """[v3.0.0] 사용자 정보는 프로젝트별 (계정·비밀번호는 하나):
        - 이 프로젝트에서 바뀌는 것은 그 프로젝트의 참여 정보(projectRoles[pid] = 역할·담당·부서)와 이름·언어·비밀번호 초기화뿐
        - 삭제 = 이 프로젝트에서 빼기 (다른 프로젝트 참여가 없으면 계정 삭제)
        - 다른 프로젝트에만 있는 사번은 시스템관리자만 이 프로젝트에 추가 가능 (그 밖에는 [다른 프로젝트에서 복사] 사용)"""
        is_admin = user.get("baseRole", user["role"]) == "SYS_ADMIN"
        manager = user["role"] in MANAGER_ROLES
        stored_admin = is_sys_admin(stored)
        if incoming is None:
            if not manager or str(part).lower() == "admin" or not stored:
                return "BLOCK"
            if stored_admin:
                return None if is_admin else "BLOCK"
            pr = Store._clean_project_roles(stored.get("projectRoles"))
            pr.pop(pid, None)
            if not pr:
                return None  # 마지막 프로젝트에서 빠지면 계정 삭제
            return dict(stored, projectRoles=pr)
        row = dict(incoming)
        if stored and not stored_admin and not membership(stored, pid) and not is_admin:
            return "BLOCK"  # 다른 프로젝트 사용자를 이 프로젝트에서 덮어쓰기 방지
        # 시스템관리자 지정·해제는 시스템관리자만
        want_admin = normalize_role(row.get("role")) == "SYS_ADMIN"
        if not is_admin:
            want_admin = stored_admin
        # 참여 정보: 다른 프로젝트 항목은 보존하고 이 프로젝트 항목만 반영
        pr = dict(Store._clean_project_roles((stored or {}).get("projectRoles")))
        new_pr = Store._clean_project_roles(row.get("projectRoles"))
        row.pop("_new", None)
        if not want_admin:
            if pid in new_pr:
                pr[pid] = new_pr[pid]
            elif stored and pid in pr and manager and isinstance(row.get("projectRoles"), dict):
                pr.pop(pid)  # 이 프로젝트에서 빼기 (참여 정보를 지운 채 저장)
            elif not stored or pid not in pr:
                pr[pid] = {"role": normalize_role(row.get("role")) if normalize_role(row.get("role")) != "SYS_ADMIN" else "MEMBER",
                           "subsystem": str(row.get("subsystem") or "ALL")[:50], "dept": str(row.get("dept") or "")[:100]}
        row["projectRoles"] = pr
        row["role"] = "SYS_ADMIN" if want_admin else (normalize_role(row.get("role")) if is_admin and stored is None else normalize_role((stored or row).get("role")))
        if row["role"] == "SYS_ADMIN" and not want_admin:
            row["role"] = "MEMBER"
        reset = bool(row.pop("pwdReset", False)) and manager
        incoming_pwd = str(row.pop("pwdHash", "") or "")
        row.pop("pwdTemp", None)
        if reset:
            row["pwdHash"] = ""  # 관리자/PM 비밀번호 초기화 → 기본값(1234), 다음 로그인 시 변경 필수
            row["pwdTemp"] = False
        elif manager and is_client_hash(incoming_pwd):
            row["pwdHash"] = make_pwd_record(incoming_pwd)  # 관리자가 지정한 임시 비밀번호
            row["pwdTemp"] = True
        else:
            row["pwdHash"] = (stored or {}).get("pwdHash", "")
            row["pwdTemp"] = bool((stored or {}).get("pwdTemp", False))
        if not manager:
            if not stored:
                return "BLOCK"
            safe = dict(stored)
            for f in USER_SELF_FIELDS:
                if f in row:
                    safe[f] = row[f]
            row = safe
        if str(part).lower() == "admin":
            row["role"] = "SYS_ADMIN"
        return row

    @classmethod
    def copy_users(cls, user, src, dst, emp_nos=None):
        """[v3.0.0] 다른 프로젝트의 사용자(참여 정보: 역할·담당·부서)를 이 프로젝트로 복사. 이미 참여 중인 사용자는 건너뜀"""
        if src == dst:
            raise AuthError("같은 프로젝트에서는 복사할 수 없습니다.", 400)
        wanted = {str(e).lower() for e in emp_nos} if isinstance(emp_nos, list) else None
        copied, skipped = [], []
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                for u in users or []:
                    a = membership(u, src)
                    emp = str(u.get("empNo", ""))
                    if is_sys_admin(u) or not a or (wanted is not None and emp.lower() not in wanted):
                        continue
                    if membership(u, dst):
                        skipped.append(emp)
                        continue
                    u.setdefault("projectRoles", {})[dst] = dict(Store._clean_project_roles({src: a})[src])
                    revs[emp] = {"rev": int((revs.get(emp) or {}).get("rev", 0)) + 1, "by": f"copy({src}->{dst}) {user['empNo']}", "at": now_str()}
                    copied.append(emp)
                if copied:
                    cls._write_dataset(cur, "projectUsers", users, revs, user["empNo"])
                    cls._write_mirror(cur, ["projectUsers"], dst)
                    conn.commit()
            finally:
                conn.close()
        return copied, skipped

    @classmethod
    def project_members(cls, pid):
        users = cls.get_users()
        return [{"empNo": u.get("empNo"), "name": u.get("name"), **membership(u, pid)} for u in users if not is_sys_admin(u) and membership(u, pid)]

    # ---- 외부 조회용 관계형 미러 테이블 (프로젝트별, PROJECT_ID 컬럼) ----
    @classmethod
    def _write_mirror(cls, cur, keys, pid=DEFAULT_PROJECT):
        keys = set(keys)
        if "projectUsers" in keys or "theme" in keys:
            # 공통 데이터가 바뀌면 모든 프로젝트의 설정 미러(사용자 목록 포함)를 갱신
            pids = [r[0] for r in cur.execute("SELECT PROJECT_ID FROM TB_PROJECT").fetchall()] or [pid]
            for other in pids:
                if other != pid:
                    cls._write_mirror(cur, {"projectConfig"}, other)
            keys.add("projectConfig")
        get = lambda k: (cls._read_dataset(cur, dkey(pid, k))[0] or [])  # noqa: E731
        num = lambda v: float(v or 0) if str(v or "0").replace(".", "", 1).replace("-", "", 1).isdigit() else 0.0  # noqa: E731
        if keys & {"projectConfig", "standardDeliverablesMeta"}:
            cfg = cls._read_dataset(cur, dkey(pid, "projectConfig"))[0] or {}
            theme = cls._read_dataset(cur, "theme")[0] or "navy"
            cur.execute("DELETE FROM TB_WBS_CONFIG WHERE PROJECT_ID = ?", (pid,))
            cur.execute(
                "INSERT INTO TB_WBS_CONFIG VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, cfg.get("projectStartDate", ""), cfg.get("projectEndDate", ""), cfg.get("reportDate", ""),
                 int(cfg.get("weekStartDay", 5) or 5), theme, json.dumps(cfg.get("holidays", []), ensure_ascii=False),
                 json.dumps(get("standardDeliverablesMeta"), ensure_ascii=False), json.dumps(cfg, ensure_ascii=False),
                 json.dumps(Store.public_value("projectUsers", cls._read_dataset(cur, "projectUsers")[0] or []), ensure_ascii=False), now_str()),
            )
        if "subsystemsMeta" in keys:
            cur.execute("DELETE FROM TB_WBS_SUBSYSTEM WHERE PROJECT_ID = ?", (pid,))
            for i, s_ in enumerate(get("subsystemsMeta")):
                code = s_.get("code") or s_.get("name") or f"SYS_{i + 1}"
                cur.execute("INSERT OR REPLACE INTO TB_WBS_SUBSYSTEM VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, code, s_.get("name") or code, s_.get("domain", ""), s_.get("type", "SDLC"), s_.get("sdlcCode", ""),
                             num(s_.get("weight")), s_.get("pm", ""), s_.get("desc", ""), i))
        if "wbsData" in keys:
            cur.execute("DELETE FROM TB_WBS_TASK WHERE PROJECT_ID = ?", (pid,))
            for i, t in enumerate(get("wbsData"), 1):
                cur.execute("INSERT INTO TB_WBS_TASK VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, i, t.get("id", ""), int(t.get("level") or 1), t.get("system", ""), t.get("name", ""),
                             num(t.get("weight")), t.get("reqId", ""), t.get("pStart", ""), t.get("pEnd", ""),
                             t.get("aStart", ""), t.get("aEnd", ""), num(t.get("pProg")), num(t.get("aProg")), t.get("output", ""), t.get("status", "")))
        if "deliverablesData" in keys:
            cur.execute("DELETE FROM TB_WBS_DELIVERABLE WHERE PROJECT_ID = ?", (pid,))
            for i, d in enumerate(get("deliverablesData"), 1):
                cur.execute("INSERT INTO TB_WBS_DELIVERABLE VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, i, d.get("round", ""), d.get("system", ""), d.get("phase", ""), d.get("name", ""), d.get("pDate", ""),
                             d.get("aDate", ""), d.get("status", ""), d.get("manager", ""), d.get("remarks", "")))
        if "reqMasterData" in keys:
            cur.execute("DELETE FROM TB_WBS_REQ WHERE PROJECT_ID = ?", (pid,))
            for i, r in enumerate(get("reqMasterData"), 1):
                cur.execute("INSERT INTO TB_WBS_REQ VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, r.get("id", ""), r.get("system", ""), r.get("name", ""), r.get("type", ""), r.get("priority", ""),
                             r.get("accept", ""), r.get("status", ""), i))
        if "vocData" in keys:
            cur.execute("DELETE FROM TB_WBS_VOC WHERE PROJECT_ID = ?", (pid,))
            for i, v in enumerate(get("vocData"), 1):
                cur.execute("INSERT INTO TB_WBS_VOC VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, v.get("id", ""), v.get("system", ""), v.get("priority", ""), v.get("title", ""), v.get("requester", ""),
                             v.get("reqDate", ""), v.get("targetDate", ""), v.get("status", ""), v.get("action", ""), i))
        if "noticesData" in keys:
            cur.execute("DELETE FROM TB_WBS_NOTICE WHERE PROJECT_ID = ?", (pid,))
            for n in get("noticesData"):
                cur.execute("INSERT INTO TB_WBS_NOTICE VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, str(n.get("id", "")), n.get("title", ""), n.get("content", ""), n.get("author", ""), n.get("authorEmpNo", ""),
                             n.get("date", ""), n.get("priority", ""), 1 if n.get("isPinned") else 0, int(num(n.get("viewCount")))))
        if "communicationsData" in keys:
            cur.execute("DELETE FROM TB_WBS_COMMUNICATION WHERE PROJECT_ID = ?", (pid,))
            for c in get("communicationsData"):
                cur.execute("INSERT INTO TB_WBS_COMMUNICATION VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            (pid, str(c.get("id", "")), c.get("channel", ""), str(c.get("taskId", "")), c.get("author", ""), c.get("authorEmpNo", ""),
                             c.get("role", ""), c.get("content", ""), c.get("date", ""), json.dumps(c.get("replies", []), ensure_ascii=False)))

    # ---- [v1.0.10] 프로젝트 목록 / 생성 / 수정 / 삭제 ----
    @staticmethod
    def _project_row(r):
        return {"id": r[0], "name": r[1] or r[0], "status": r[2] or "ACTIVE", "restricted": bool(r[3]),
                "members": json.loads(r[4] or "[]"), "createdAt": r[5] or "", "createdBy": r[6] or "", "sort": r[7] or 0}

    @classmethod
    def list_projects(cls):
        with DB_LOCK:
            conn = cls.connect()
            try:
                rows = conn.execute("SELECT PROJECT_ID, PROJECT_NAME, STATUS, RESTRICTED, MEMBERS_JSON, CREATED_AT, CREATED_BY, SORT_ORDER "
                                    "FROM TB_PROJECT ORDER BY SORT_ORDER, CREATED_AT").fetchall()
            finally:
                conn.close()
        return [cls._project_row(r) for r in rows]

    @classmethod
    def get_project(cls, pid):
        return next((p for p in cls.list_projects() if p["id"] == pid), None)

    @classmethod
    def create_project(cls, user, req):
        name = str(req.get("name") or "").strip()[:100]
        if not name:
            raise AuthError("프로젝트 이름을 입력하세요.", 400)
        start = str(req.get("startDate") or "")[:10]
        end = str(req.get("endDate") or "")[:10]
        if not (len(start) == 10 and len(end) == 10 and start <= end):
            raise AuthError("프로젝트 시작일과 종료일을 확인하세요.", 400)
        copy_from = str(req.get("copyFrom") or "")
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                ids = [r[0] for r in cur.execute("SELECT PROJECT_ID FROM TB_PROJECT").fetchall()]
                seq = 1
                while f"P{seq:03d}" in ids:
                    seq += 1
                pid = f"P{seq:03d}"
                src_cfg, src_subs, src_std = {}, [], None
                if copy_from and copy_from in ids:
                    src_cfg = cls._read_dataset(cur, dkey(copy_from, "projectConfig"))[0] or {}
                    src_subs = cls._read_dataset(cur, dkey(copy_from, "subsystemsMeta"))[0] or []
                    src_std = cls._read_dataset(cur, dkey(copy_from, "standardDeliverablesMeta"))[0]
                cfg = {k: v for k, v in src_cfg.items() if k not in ("milestones", "projectName", "projectStartDate", "projectEndDate", "reportDate")}
                cfg.update({"projectName": name, "projectStartDate": start, "projectEndDate": end, "reportDate": start})
                # [v3.0.0] 소통 채널은 프로젝트별: 전체 + 이 프로젝트의 서브시스템
                subs_for_ch = src_subs if req.get("copySubsystems", True) else []
                cfg["channels"] = ["전체"] + [str(x.get("code") or x.get("name")) for x in subs_for_ch if isinstance(x, dict) and (x.get("code") or x.get("name"))]
                data = {
                    "projectConfig": cfg,
                    "subsystemsMeta": src_subs if req.get("copySubsystems", True) else [],
                    "wbsData": [], "deliverablesData": [], "reqMasterData": [], "vocData": [],
                    "noticesData": [], "communicationsData": [], "meetingsData": [], "weeklyReportsData": [], "todosData": [],
                }
                if src_std is not None:
                    data["standardDeliverablesMeta"] = src_std
                for key, value in data.items():
                    cls._write_dataset(cur, dkey(pid, key), value,
                                       {p: {"rev": 1, "by": "create", "at": now_str()} for p in split_parts(key, value)}, user["empNo"])
                members = [user["empNo"]] if req.get("restricted") else []
                cur.execute("INSERT INTO TB_PROJECT VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, ?)",
                            (pid, name, 1 if req.get("restricted") else 0, json.dumps(members), now_str(), user["empNo"], len(ids)))
                # 만든 사람이 시스템관리자가 아니면 새 프로젝트의 PM 으로 지정
                if user.get("baseRole", user["role"]) != "SYS_ADMIN":
                    users, revs = cls._read_dataset(cur, "projectUsers")
                    me = next((u for u in users or [] if str(u.get("empNo", "")).lower() == user["empNo"].lower()), None)
                    if me is not None:
                        me.setdefault("projectRoles", {})[pid] = {"role": "PM", "subsystem": "ALL"}
                        revs[me["empNo"]] = {"rev": int((revs.get(me["empNo"]) or {}).get("rev", 0)) + 1, "by": "create-project", "at": now_str()}
                        cls._write_dataset(cur, "projectUsers", users, revs, user["empNo"])
                cls._write_mirror(cur, DATASETS.keys(), pid)
                conn.commit()
            finally:
                conn.close()
        return cls.get_project(pid)

    @classmethod
    def update_project(cls, pid, req, is_admin):
        p = cls.get_project(pid)
        if not p:
            raise AuthError("프로젝트를 찾을 수 없습니다.", 404)
        name = str(req.get("name") if req.get("name") is not None else p["name"]).strip()[:100] or p["name"]
        status = req.get("status") if req.get("status") in ("ACTIVE", "ARCHIVED") else p["status"]
        restricted = bool(req.get("restricted")) if "restricted" in req else p["restricted"]
        members = req.get("members") if isinstance(req.get("members"), list) else p["members"]
        members = [str(m)[:30] for m in members][:500]
        if pid == DEFAULT_PROJECT:
            restricted, status = False, "ACTIVE"  # 기본 프로젝트는 항상 공개·사용 중
        if status != p["status"] and not is_admin:
            raise AuthError("보관/복원은 시스템관리자만 할 수 있습니다.", 403)
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                cur.execute("UPDATE TB_PROJECT SET PROJECT_NAME = ?, STATUS = ?, RESTRICTED = ?, MEMBERS_JSON = ? WHERE PROJECT_ID = ?",
                            (name, status, 1 if restricted else 0, json.dumps(members, ensure_ascii=False), pid))
                if name != p["name"]:
                    cfg, revs = cls._read_dataset(cur, dkey(pid, "projectConfig"))
                    if isinstance(cfg, dict):
                        cfg["projectName"] = name
                        revs[WHOLE] = {"rev": int((revs.get(WHOLE) or {}).get("rev", 0)) + 1, "by": "rename", "at": now_str()}
                        cls._write_dataset(cur, dkey(pid, "projectConfig"), cfg, revs, "rename")
                conn.commit()
            finally:
                conn.close()
        return cls.get_project(pid)

    @classmethod
    def delete_project(cls, pid):
        if pid == DEFAULT_PROJECT:
            raise AuthError("기본 프로젝트는 삭제할 수 없습니다.", 400)
        if not cls.get_project(pid):
            raise AuthError("프로젝트를 찾을 수 없습니다.", 404)
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                cur.execute("DELETE FROM TB_WBS_DATASET WHERE DATA_KEY LIKE ?", (pid + "::%",))
                for t in ("TB_WBS_CONFIG", "TB_WBS_SUBSYSTEM", "TB_WBS_TASK", "TB_WBS_DELIVERABLE", "TB_WBS_REQ", "TB_WBS_VOC",
                          "TB_WBS_NOTICE", "TB_WBS_COMMUNICATION", "TB_WBS_CHAT"):
                    cur.execute(f"DELETE FROM {t} WHERE PROJECT_ID = ?", (pid,))
                cur.execute("DELETE FROM TB_PROJECT WHERE PROJECT_ID = ?", (pid,))
                users, revs = cls._read_dataset(cur, "projectUsers")
                changed = False
                for u in users or []:
                    if isinstance(u.get("projectRoles"), dict) and pid in u["projectRoles"]:
                        u["projectRoles"].pop(pid)
                        changed = True
                if changed:
                    cls._write_dataset(cur, "projectUsers", users, revs, "delete-project")
                conn.commit()
            finally:
                conn.close()

    # ---- 사용자 등록 / 비밀번호 ----
    @classmethod
    def register_user(cls, new_user, pid=None):
        emp = str(new_user.get("empNo", "")).strip()
        if not emp or len(emp) > 30 or not all(ch.isalnum() or ch in "_.-" for ch in emp):
            raise AuthError("사번은 영문/숫자/_.- 2~30자로 입력하세요.", 400)
        pwd = str(new_user.get("pwdHash", "")).lower()
        if not is_client_hash(pwd) or hmac.compare_digest(pwd, DEFAULT_PWD_HASH):
            raise AuthError("비밀번호 형식이 올바르지 않습니다.", 400)
        row = {
            "empNo": emp,
            "name": str(new_user.get("name", "")).strip()[:50] or emp,
            "role": "MEMBER",  # 자가 등록은 항상 일반 사용자
            "subsystem": str(new_user.get("subsystem", "")).strip()[:50] or "ALL",
            "dept": str(new_user.get("dept", "")).strip()[:100],
            "pwdHash": make_pwd_record(pwd),
            "lang": "en" if new_user.get("lang") == "en" else "ko",
            "registeredAt": now_str(),
        }
        # [v3.0.0] 자가 등록은 로그인 화면에서 고른 프로젝트의 일반 사용자로
        project = cls.get_project(pid) if pid else None
        if not project or project.get("status") == "ARCHIVED":
            raise AuthError("가입할 프로젝트를 선택하세요.", 400)
        row["projectRoles"] = {project["id"]: {"role": "MEMBER", "subsystem": row["subsystem"], "dept": row["dept"]}}
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                users = users or []
                if any(str(u.get("empNo", "")).lower() == emp.lower() for u in users):
                    raise AuthError(f"이미 등록된 사번({emp})입니다.", 409)
                users.append(row)
                revs[emp] = {"rev": int((revs.get(emp) or {}).get("rev", 0)) + 1, "by": f"self-register({emp})", "at": now_str()}
                cls._write_dataset(cur, "projectUsers", users, revs, f"self-register({emp})")
                cls._write_mirror(cur, ["projectUsers"])
                conn.commit()
            finally:
                conn.close()
        return row

    @classmethod
    def change_password(cls, emp, old_hash, new_hash):
        new_hash = str(new_hash or "").lower()
        if not is_client_hash(new_hash):
            raise AuthError("비밀번호 형식이 올바르지 않습니다.", 400)
        if hmac.compare_digest(new_hash, DEFAULT_PWD_HASH) or hmac.compare_digest(new_hash, str(old_hash or "").lower()):
            raise AuthError("초기 비밀번호나 현재 비밀번호와 다른 새 비밀번호를 입력하세요.", 400)
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                target = next((u for u in (users or []) if str(u.get("empNo", "")).lower() == emp.lower()), None)
                if not target:
                    raise AuthError("사용자를 찾을 수 없습니다.", 404)
                if not verify_pwd(target.get("pwdHash"), old_hash):
                    raise AuthError("현재 비밀번호가 일치하지 않습니다.", 403)
                target["pwdHash"] = make_pwd_record(new_hash)
                target["pwdTemp"] = False
                target["pwdChangedAt"] = now_str()
                key = target["empNo"]
                revs[key] = {"rev": int((revs.get(key) or {}).get("rev", 0)) + 1, "by": f"password({emp})", "at": now_str()}
                cls._write_dataset(cur, "projectUsers", users, revs, emp)
                conn.commit()
            finally:
                conn.close()

    @classmethod
    def self_reset_password(cls, emp):
        """[v3.0.2] 로그인 화면 비밀번호 초기화 → 기본값(1234), 다음 로그인 때 변경 필수"""
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                users, revs = cls._read_dataset(cur, "projectUsers")
                target = next((u for u in (users or []) if str(u.get("empNo", "")).lower() == emp.lower()), None)
                if not target:
                    raise AuthError(f"등록되지 않은 사번({emp})입니다.", 404)
                target["pwdHash"] = ""
                target["pwdTemp"] = False
                target["pwdChangedAt"] = now_str()
                key = target["empNo"]
                revs[key] = {"rev": int((revs.get(key) or {}).get("rev", 0)) + 1, "by": f"password-reset({emp})", "at": now_str()}
                cls._write_dataset(cur, "projectUsers", users, revs, emp)
                conn.commit()
            finally:
                conn.close()

    # ---- 채팅 ----
    @classmethod
    def chat_list(cls, channel, pid=DEFAULT_PROJECT):
        with DB_LOCK:
            conn = cls.connect()
            try:
                cur = conn.cursor()
                sql = "SELECT MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT FROM TB_WBS_CHAT"
                if channel == "전체":
                    cur.execute(sql + " WHERE PROJECT_ID = ? ORDER BY CREATED_AT DESC LIMIT 300", (pid,))
                else:
                    cur.execute(sql + " WHERE PROJECT_ID = ? AND CHANNEL = ? ORDER BY CREATED_AT DESC LIMIT 300", (pid, channel))
                rows = list(reversed(cur.fetchall()))
            finally:
                conn.close()
        return [{"id": r[0], "channel": r[1], "senderName": r[2], "senderEmpNo": r[3], "userRole": r[4], "message": r[5], "createdAt": r[6]} for r in rows]

    @classmethod
    def chat_send(cls, user, channel, message, client_id, pid=DEFAULT_PROJECT):
        msg_id = "CHAT-" + str(client_id or int(time.time() * 1000))
        created = now_str()
        with DB_LOCK:
            conn = cls.connect()
            try:
                conn.execute("INSERT OR REPLACE INTO TB_WBS_CHAT (MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT, PROJECT_ID) "
                             "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (msg_id, channel, user["name"], user["empNo"], user["role"], message, created, pid))
                conn.commit()
            finally:
                conn.close()
        return {"id": msg_id, "channel": channel, "senderName": user["name"], "senderEmpNo": user["empNo"],
                "userRole": user["role"], "message": message, "createdAt": created}

    @classmethod
    def chat_clear(cls, pid=DEFAULT_PROJECT):
        with DB_LOCK:
            conn = cls.connect()
            try:
                conn.execute("DELETE FROM TB_WBS_CHAT WHERE PROJECT_ID = ?", (pid,))
                conn.commit()
            finally:
                conn.close()


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


# ---------------------------------------------------------------------------
# 로그
# ---------------------------------------------------------------------------
LOG_DATE_MODE = False
LOG_SILENT_MODE = False
LOG_DIR = None
_log_state = {"file": None, "date": None}
_log_lock = threading.Lock()


def write_server_log(msg):
    formatted = f"[{now_str()}] {msg.rstrip()}\n"
    if LOG_DATE_MODE and LOG_DIR:
        today = datetime.datetime.now().strftime("%Y%m%d")
        try:
            with _log_lock:
                if _log_state["file"] is None or _log_state["date"] != today:
                    if _log_state["file"]:
                        _log_state["file"].close()
                    LOG_DIR.mkdir(parents=True, exist_ok=True)
                    _log_state["file"] = open(LOG_DIR / f"server_{today}.log", "a", encoding="utf-8", buffering=1)
                    _log_state["date"] = today
                _log_state["file"].write(formatted)
        except Exception as e:
            sys.stderr.write(f"[LOG ERROR] {e}\n")
    if not LOG_SILENT_MODE:
        sys.stderr.write(formatted)
        sys.stderr.flush()


# ---------------------------------------------------------------------------
# HTTP 핸들러
# ---------------------------------------------------------------------------
class WbsHttpHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt, *args):
        write_server_log(f"{self.address_string()} {fmt % args}")

    def _origin_allowed(self, origin):
        """같은 서버 주소(Host)에서 연 화면만 API 호출 허용 (+ --allow-origin 으로 지정한 주소)"""
        if not origin or origin == "null":
            return False
        if origin in EXTRA_ALLOWED_ORIGINS:
            return True
        host = (self.headers.get("Host") or "").lower()
        return urllib.parse.urlparse(origin).netloc.lower() == host

    def end_headers(self):
        origin = self.headers.get("Origin")
        if self._origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Project-Id")
        if getattr(self, "_csp", False):
            self.send_header("Content-Security-Policy", CSP_POLICY)
        if getattr(self, "_static", False):
            self.send_header("Cache-Control", "no-cache")
        if TLS_ACTIVE:
            self.send_header("Strict-Transport-Security", "max-age=15552000")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _token(self):
        auth = self.headers.get("Authorization", "")
        return auth[7:].strip() if auth.lower().startswith("bearer ") else ""

    def _project_id(self, req=None):
        pid = str((req or {}).get("projectId") or self.headers.get("X-Project-Id") or DEFAULT_PROJECT).strip()
        return pid if pid and len(pid) <= 32 and set(pid) <= PROJECT_ID_CHARS else DEFAULT_PROJECT

    def _require_user(self, roles=None, allow_must_change=False, req=None):
        """로그인 사용자 + 요청한 프로젝트(X-Project-Id)의 역할을 적용한 사용자 정보"""
        base = Sessions.refresh_user(self._token())
        if not base:
            raise AuthError("로그인이 필요합니다. (세션 만료 또는 미인증)", 401)
        if base.get("mustChange") and not allow_must_change:
            raise AuthError("초기 비밀번호 또는 임시 비밀번호를 사용 중입니다. 비밀번호를 변경한 뒤 사용할 수 있습니다.", 403, "MUST_CHANGE_PASSWORD")
        project = Store.get_project(self._project_id(req))
        if not project or not can_access_project(base, project):
            raise AuthError("이 프로젝트에 접근할 권한이 없습니다.", 403, "PROJECT_FORBIDDEN")
        # [v3.0.0] 시스템관리자가 아니면 로그인한 프로젝트에서만 작업
        if base.get("role") != "SYS_ADMIN" and base.get("loginProject") and project["id"] != base["loginProject"]:
            raise AuthError("로그인한 프로젝트에서만 작업할 수 있습니다. 다른 프로젝트는 다시 로그인하세요.", 403, "PROJECT_LOCKED")
        info = effective_user(base, project)
        info["projectStatus"] = project["status"]
        if roles and info["role"] not in roles:
            raise AuthError("이 작업에 대한 권한이 없습니다.", 403)
        return info

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/db/ping":
                self._send_json(200, {"ok": True, "version": VERSION, "message": f"{APP_NAME} DB Server Running", "authRequired": True})
                return
            if path == "/api/chat/messages":
                info = self._require_user()
                channel = urllib.parse.parse_qs(parsed.query).get("channel", ["전체"])[0]
                self._send_json(200, {"ok": True, "messages": Store.chat_list(channel, info["projectId"]), "channel": channel, "serverTime": now_str()})
                return
        except AuthError as ae:
            self._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401, "code": ae.code})
            return
        lower = path.lower()
        if any(lower.startswith(p) for p in BLOCKED_URL_PREFIXES) or pathlib.Path(lower).suffix in BLOCKED_URL_EXTENSIONS:
            self.send_error(403, "Forbidden: Direct access to server or database files is restricted.")
            return
        if path == "/js/app-config.js" and (BASE_DIR / "app.ini").exists():
            self._send_app_config()
            return
        self._csp = path in CSP_PAGES
        self._static = True  # [v3.0.1] 화면 파일은 매번 서버에 확인 (업그레이드 후 이전 화면이 캐시로 남지 않게)
        super().do_GET()

    def _send_app_config(self):
        """app.ini 를 바꾸면 화면 빌드 없이 바로 반영되도록 화면 설정을 즉시 만들어 보냄"""
        c = load_app_config(BASE_DIR)
        data = {"productName": c["product_name"], "edition": c["edition"], "editionName": c["edition_name"],
                "version": c["version"], "defaultLang": c["default_lang"],
                "defaultUi": c["default_ui"], "uiSwitch": c["allow_ui_switch"] == "1", "defaultTheme": c["default_theme"],
                "selfReset": str(c.get("self_password_reset", "1")).strip().lower() not in ("0", "false", "no")}
        body = ("var APP_CONFIG = " + json.dumps(data, ensure_ascii=False) + ";\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        # GET 과 같은 차단 규칙·보안 헤더 적용 (서버·DB·인증서 파일 정보 노출 방지)
        path = urllib.parse.urlparse(self.path).path
        lower = path.lower()
        if lower.startswith("/api/") or any(lower.startswith(p) for p in BLOCKED_URL_PREFIXES) or pathlib.Path(lower).suffix in BLOCKED_URL_EXTENSIONS:
            self.send_error(403, "Forbidden")
            return
        self._csp = path in CSP_PAGES
        super().do_HEAD()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > MAX_BODY_BYTES:
            self._send_json(413, {"ok": False, "message": "요청 데이터 크기가 허용 한도(15MB)를 초과했습니다."})
            return
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8") if length else "{}")
        except Exception:
            self._send_json(400, {"ok": False, "message": "잘못된 JSON 요청 형식입니다."})
            return
        path = urllib.parse.urlparse(self.path).path
        try:
            handler = self.ROUTES.get(path)
            if not handler:
                self._send_json(404, {"ok": False, "message": "알 수 없는 API 경로입니다."})
                return
            handler(self, req)
        except AuthError as ae:
            self._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401,
                                        "code": ae.code, "mustChangePassword": ae.code == "MUST_CHANGE_PASSWORD"})
        except SecurityError as se:
            self._send_json(403, {"ok": False, "message": str(se)})
        except Exception as e:  # pragma: no cover - 예기치 못한 오류
            write_server_log(f"[ERROR] {path}: {e}")
            self._send_json(500, {"ok": False, "message": str(e)})

    # ---- 인증 API ----
    def api_bootstrap(self, req):
        pid = self._project_id(req)
        if not Store.get_project(pid):
            pid = DEFAULT_PROJECT
        cfg, _ = Store.load(["projectConfig"], pid)
        self._send_json(200, {"ok": True, "version": VERSION,
                              "projectName": (cfg.get("projectConfig") or {}).get("projectName", ""),
                              "subsystems": Store.get_subsystem_names(pid)})

    def api_login(self, req):
        emp = str(req.get("empNo", "")).strip()
        pwd_hash = str(req.get("pwdHash", ""))
        LoginThrottle.check(emp)
        row = next((u for u in Store.get_users() if str(u.get("empNo", "")).lower() == emp.lower()), None)
        if not row or not verify_pwd(row.get("pwdHash"), pwd_hash):
            LoginThrottle.fail(emp)
            write_server_log(f"[AUTH] Login failed: {emp} ({self.address_string()})")
            raise AuthError("사번 또는 비밀번호가 일치하지 않습니다.", 401)
        # [v3.0.0] 로그인할 프로젝트: 시스템관리자는 선택하지 않아도 됨, 그 밖에는 참여 중인 프로젝트를 반드시 선택
        login_pid = str(req.get("loginProject") or "").strip()
        project = Store.get_project(login_pid) if login_pid else None
        if is_sys_admin(row):
            login_pid = project["id"] if project else ""
        else:
            if not project:
                LoginThrottle.ok(emp)
                raise AuthError("로그인할 프로젝트를 선택하세요.", 400, "PROJECT_REQUIRED")
            if not membership(row, project["id"]):
                LoginThrottle.ok(emp)
                raise AuthError("선택한 프로젝트의 사용자가 아닙니다. 프로젝트를 확인하세요.", 403, "NOT_PROJECT_MEMBER")
        LoginThrottle.ok(emp)
        token, info = Sessions.create(row)
        if req.get("lang") in ("ko", "en"):
            info["lang"] = req["lang"]
        info["projectRoles"] = row.get("projectRoles") or {}
        info["loginProject"] = login_pid
        write_server_log(f"[AUTH] Login: {info['empNo']} ({info['role']})")
        eff = effective_user(info, Store.get_project(login_pid) if login_pid else None) if login_pid else self._effective_for(info, req)
        self._send_json(200, {"ok": True, "token": token, "user": public_user(eff), "loginProject": login_pid,
                              "projects": self._visible_projects(info)})

    def api_projects_public(self, req):
        """[v3.0.0] 로그인 화면의 프로젝트 선택 목록 (이름만, 보관된 프로젝트 제외)"""
        self._send_json(200, {"ok": True, "projects": [{"id": p["id"], "name": p["name"]} for p in Store.list_projects() if p.get("status") != "ARCHIVED"]})

    def api_projects_copy_users(self, req):
        """[v3.0.0] 다른 프로젝트의 사용자를 지금 프로젝트로 복사 (시스템관리자)"""
        info = self._require_user(roles={"SYS_ADMIN"}, req=req)
        src = str(req.get("fromProject") or "")
        if not Store.get_project(src):
            raise AuthError("복사할 프로젝트를 찾을 수 없습니다.", 404)
        copied, skipped = Store.copy_users(info, src, info["projectId"], req.get("empNos"))
        write_server_log(f"[PROJECT] Users copied {src} -> {info['projectId']}: {len(copied)} by {info['empNo']}")
        self._send_json(200, {"ok": True, "copied": copied, "skipped": skipped})

    def api_projects_members(self, req):
        """[v3.0.0] 다른 프로젝트의 사용자 목록 (복사할 사용자 고르기, 시스템관리자)"""
        self._require_user(roles={"SYS_ADMIN"}, req=req)
        src = str(req.get("fromProject") or "")
        self._send_json(200, {"ok": True, "members": Store.project_members(src)})

    def _visible_projects(self, base):
        # [v3.0.0] 시스템관리자가 아니면 로그인한 프로젝트만 (프로젝트 바꾸기 불가)
        if base.get("role") != "SYS_ADMIN" and base.get("loginProject"):
            return [p for p in Store.list_projects() if p["id"] == base["loginProject"] and can_access_project(base, p)]
        return [p for p in Store.list_projects() if can_access_project(base, p)]

    def _effective_for(self, base, req):
        project = Store.get_project(self._project_id(req))
        if not project or not can_access_project(base, project):
            project = Store.get_project(DEFAULT_PROJECT)
        return effective_user(base, project)

    def api_logout(self, req):
        Sessions.drop(self._token())
        self._send_json(200, {"ok": True})

    def api_me(self, req):
        base = Sessions.refresh_user(self._token())
        if not base:
            raise AuthError("로그인이 필요합니다. (세션 만료 또는 미인증)", 401)
        self._send_json(200, {"ok": True, "user": public_user(dict(self._effective_for(base, req), mustChange=base.get("mustChange"))),
                              "projects": self._visible_projects(base)})

    def api_register(self, req):
        row = Store.register_user(req.get("user") or {}, str(req.get("projectId") or "").strip() or None)
        write_server_log(f"[AUTH] New user registered: {row['empNo']} ({row['subsystem']})")
        self._send_json(200, {"ok": True, "user": Store.public_value("projectUsers", [row])[0]})

    def api_change_password(self, req):
        """로그인 화면 비밀번호 변경 (토큰 없이 사번 + 현재 비밀번호 검증)"""
        emp = str(req.get("empNo", "")).strip()
        if not emp:
            raise AuthError("사번을 입력하세요.", 400)
        LoginThrottle.check(emp)
        try:
            Store.change_password(emp, str(req.get("oldHash", "")), str(req.get("newHash", "")))
        except AuthError:
            LoginThrottle.fail(emp)
            raise
        LoginThrottle.ok(emp)
        write_server_log(f"[AUTH] Password changed (login screen): {emp}")
        self._send_json(200, {"ok": True, "message": "비밀번호가 변경되었습니다."})

    def api_reset_password(self, req):
        """[v3.0.2] 로그인 화면 비밀번호 초기화 (테스트 버전: 별도 인증 없음) — app.ini [security] self_password_reset=0 이면 거부"""
        if str(APP_CONFIG.get("self_password_reset", "1")).strip().lower() in ("0", "false", "no"):
            raise AuthError("비밀번호 초기화가 꺼져 있습니다. 시스템관리자에게 요청하세요.", 403, "RESET_DISABLED")
        emp = str(req.get("empNo", "")).strip()
        if not emp:
            raise AuthError("사번을 입력하세요.", 400)
        LoginThrottle.check(emp)
        Store.self_reset_password(emp)
        write_server_log(f"[AUTH] Password reset to default (login screen, no auth): {emp}")
        self._send_json(200, {"ok": True, "message": "비밀번호를 1234로 초기화했습니다."})

    def api_password(self, req):
        info = self._require_user(allow_must_change=True)
        Store.change_password(info["empNo"], str(req.get("oldHash", "")), str(req.get("newHash", "")))
        self._send_json(200, {"ok": True, "message": "비밀번호가 변경되었습니다."})

    # ---- 데이터 API ----
    def api_db_test(self, req):
        self._require_user()
        conn = Store.connect()
        conn.close()
        self._send_json(200, {"ok": True, "message": f"SQLite DB 연결 확인 ({DB_PATH.name})"})

    def api_db_init(self, req):
        self._require_user(roles={"SYS_ADMIN"})
        self._send_json(200, {"ok": True, "message": Store.init_schema()})

    def api_db_load(self, req):
        info = self._require_user(req=req)
        keys = req.get("keys")
        data, revs = Store.load(keys if isinstance(keys, list) else None, info["projectId"], info)
        self._send_json(200, {"ok": True, "data": data, "revs": revs})

    def api_db_save(self, req):
        info = self._require_user(req=req)
        if info.get("projectStatus") == "ARCHIVED" and info.get("baseRole") != "SYS_ADMIN":
            raise AuthError("보관된 프로젝트는 읽기 전용입니다.", 403, "PROJECT_ARCHIVED")
        result = Store.save(info, req.get("changes") or {}, bool(req.get("force")), info["projectId"])
        if result.get("conflict"):
            self._send_json(409, result)
            return
        if result.get("blocked"):
            write_server_log(f"[AUTH] Unauthorized save rejected: {info['empNo']} -> {result['blocked']}")
        self._send_json(200, result)

    # ---- 채팅 API ----
    def api_chat_send(self, req):
        info = self._require_user()
        message = str(req.get("message", "")).strip()
        if not message:
            self._send_json(400, {"ok": False, "message": "채팅 메시지 내용을 입력해주세요."})
            return
        msg = Store.chat_send(info, str(req.get("channel") or "전체"), message[:2000], req.get("id"), info["projectId"])
        self._send_json(200, {"ok": True, "message": msg})

    def api_chat_clear(self, req):
        info = self._require_user(roles=MANAGER_ROLES)
        Store.chat_clear(info["projectId"])
        self._send_json(200, {"ok": True, "message": "채팅 대화내역이 모두 삭제되었습니다."})

    # ---- [v1.0.10] 프로젝트 API ----
    def api_projects_list(self, req):
        base = self._require_user()
        projects = self._visible_projects(base)
        if base.get("baseRole") == "SYS_ADMIN":
            users = Store.get_users()
            for p in projects:
                p["memberCount"] = sum(1 for u in users if not is_sys_admin(u) and membership(u, p["id"]))
        self._send_json(200, {"ok": True, "projects": projects, "current": base["projectId"]})

    def api_projects_create(self, req):
        info = self._require_user()
        if info.get("baseRole") != "SYS_ADMIN":
            raise AuthError("프로젝트는 시스템관리자만 만들 수 있습니다.", 403)
        p = Store.create_project(info, req)
        write_server_log(f"[PROJECT] Created {p['id']} by {info['empNo']}")
        self._send_json(200, {"ok": True, "project": p})

    def _require_project_manager(self, pid):
        base = Sessions.refresh_user(self._token())
        if not base:
            raise AuthError("로그인이 필요합니다. (세션 만료 또는 미인증)", 401)
        if base.get("mustChange"):
            raise AuthError("비밀번호를 변경한 뒤 사용할 수 있습니다.", 403, "MUST_CHANGE_PASSWORD")
        project = Store.get_project(pid)
        if not project:
            raise AuthError("프로젝트를 찾을 수 없습니다.", 404)
        eff = effective_user(base, project)
        if eff["role"] not in MANAGER_ROLES or not can_access_project(base, project):
            raise AuthError("이 프로젝트를 관리할 권한이 없습니다.", 403)
        return eff

    def api_projects_update(self, req):
        pid = str(req.get("id") or "")
        eff = self._require_project_manager(pid)
        p = Store.update_project(pid, req, eff.get("baseRole") == "SYS_ADMIN")
        self._send_json(200, {"ok": True, "project": p})

    def api_projects_delete(self, req):
        self._require_user(roles={"SYS_ADMIN"})
        Store.delete_project(str(req.get("id") or ""))
        write_server_log(f"[PROJECT] Deleted {req.get('id')}")
        self._send_json(200, {"ok": True})

    ROUTES = {
        "/api/projects/list": api_projects_list,
        "/api/projects/create": api_projects_create,
        "/api/projects/update": api_projects_update,
        "/api/projects/delete": api_projects_delete,
        "/api/projects/public": api_projects_public,
        "/api/projects/copy-users": api_projects_copy_users,
        "/api/projects/members": api_projects_members,
        "/api/auth/bootstrap": api_bootstrap,
        "/api/auth/login": api_login,
        "/api/auth/logout": api_logout,
        "/api/auth/me": api_me,
        "/api/auth/register": api_register,
        "/api/auth/password": api_password,
        "/api/auth/change-password": api_change_password,
        "/api/auth/reset-password": api_reset_password,
        "/api/db/test": api_db_test,
        "/api/db/init": api_db_init,
        "/api/db/load": api_db_load,
        "/api/db/save": api_db_save,
        "/api/chat/send": api_chat_send,
        "/api/chat/clear": api_chat_clear,
    }


class WbsServer(ThreadingHTTPServer):
    """요청마다 스레드 처리. HTTPS 사용 시 TLS 연결 수립(handshake)도 요청 스레드에서 수행하여 느린 접속이 다른 접속을 막지 않도록 함"""
    daemon_threads = True
    ssl_context = None

    def finish_request(self, request, client_address):
        if not self.ssl_context:
            return super().finish_request(request, client_address)
        try:
            request.settimeout(15)
            tls = self.ssl_context.wrap_socket(request, server_side=True)
            tls.settimeout(None)
        except (ssl.SSLError, OSError) as e:
            write_server_log(f"[TLS] Handshake failed from {client_address[0]}: {e.__class__.__name__}")
            return
        try:
            super().finish_request(tls, client_address)
        finally:
            try:
                tls.close()
            except OSError:
                pass


def make_tls_context(cert_file, key_file):
    """[v1.0.10] HTTPS: TLS 1.2 이상, 인증서(PEM)와 개인키(PEM) 파일 사용"""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
    return ctx


def main():
    global LOG_DATE_MODE, LOG_SILENT_MODE, LOG_DIR, DB_PATH, TLS_ACTIVE, PBKDF2_ITERATIONS
    parser = argparse.ArgumentParser(description=f"{APP_NAME} Secure Multi-User DB Server")
    cfg = APP_CONFIG
    parser.add_argument("--port", type=int, default=int(cfg["port"]), help="HTTP Server Port (default: app.ini [server] port)")
    parser.add_argument("--host", type=str, default=cfg["host"], help="Bind address (default: app.ini)")
    parser.add_argument("--db", type=str, default=cfg["db_file"], help="SQLite DB file name inside ./data (default: app.ini)")
    parser.add_argument("--log-dir", type=str, default=cfg["log_dir"], help="Directory for daily log files (default: app.ini)")
    parser.add_argument("--log-date", action="store_true", help="Enable date-based log file (logs/server_YYYYMMDD.log)")
    parser.add_argument("--silent", action="store_true", help="Suppress console log (file only)")
    parser.add_argument("--no-console", action="store_true", help="Alias for --silent")
    parser.add_argument("--cert", type=str, default="", help="HTTPS certificate file (PEM). Default: app.ini cert_file if it exists")
    parser.add_argument("--key", type=str, default="", help="HTTPS private key file (PEM). Default: app.ini key_file if it exists")
    parser.add_argument("--no-tls", action="store_true", help="Start with HTTP even if certificate files exist")
    parser.add_argument("--allow-origin", action="append", default=[], help="Extra origin allowed to call the API (repeatable)")
    parser.add_argument("--pbkdf2-iterations", type=int, default=PBKDF2_ITERATIONS, help=argparse.SUPPRESS)
    args = parser.parse_args()
    PBKDF2_ITERATIONS = max(1000, int(args.pbkdf2_iterations))
    EXTRA_ALLOWED_ORIGINS.update(o.rstrip("/") for o in args.allow_origin if o)

    db_name = pathlib.Path(args.db).name
    if not db_name.lower().endswith((".db", ".sqlite", ".sqlite3")):
        raise SystemExit("[ERROR] --db accepts only a .db/.sqlite/.sqlite3 file name.")
    DB_PATH = DATA_DIR / db_name
    LOG_SILENT_MODE = args.silent or args.no_console
    LOG_DATE_MODE = args.log_date or LOG_SILENT_MODE
    LOG_DIR = BASE_DIR / args.log_dir if not pathlib.Path(args.log_dir).is_absolute() else pathlib.Path(args.log_dir)

    Store.init_schema()
    server = WbsServer((args.host, args.port), WbsHttpHandler)
    scheme = "http"
    resolve = lambda v: pathlib.Path(v) if pathlib.Path(v).is_absolute() else BASE_DIR / v  # noqa: E731
    if not (args.cert or args.key) and not args.no_tls and resolve(cfg["cert_file"]).exists() and resolve(cfg["key_file"]).exists():
        args.cert, args.key = cfg["cert_file"], cfg["key_file"]  # [v1.2.0] 인증서가 있으면 자동 HTTPS
    if (args.cert or args.key) and not args.no_tls:
        cert = resolve(args.cert)
        key = resolve(args.key)
        if not cert.exists() or not key.exists():
            raise SystemExit(f"[ERROR] Certificate or key file not found: {cert} / {key}")
        server.ssl_context = make_tls_context(cert, key)
        TLS_ACTIVE = True
        scheme = "https"
    print("============================================================================")
    print(f"[{APP_NAME}] Multi-user DB server started (login authentication required)")
    print(f"  * Browser URL        : {scheme}://127.0.0.1:{args.port}  (LAN: {scheme}://<server-ip>:{args.port})")
    print(f"  * Encryption (TLS)   : {'ON (TLS 1.2+)' if TLS_ACTIVE else 'OFF - use --cert/--key to enable HTTPS'}")
    print(f"  * Web root directory : {BASE_DIR}")
    print(f"  * SQLite DB file     : {DB_PATH}")
    print("  * Initial admin      : admin / 1234  (change the password after first login)")
    print("============================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Server stopped by user request.")


if __name__ == "__main__":
    main()
