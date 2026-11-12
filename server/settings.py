# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 설정 · 경로 · 상수 (conf/app.ini)"""
import configparser
import pathlib
import sys
import threading



# 폴더 구성 (전사 시스템 하위 서비스 — 패키지 폴더 하나에 모두 들어 있음)
#   conf/    설정(app.ini)        server/  서버 프로그램(이 패키지)
#   index.html · static/  화면 (패키지 폴더가 곧 웹 루트)   data/  DB   logs/  오류 로그 (error.log 하나, 크기 제한)
#   웹 루트 안의 conf/ server/ data/ logs/ 와 .py · .db · .bat · .sh · .log · .ini 파일은 내려받기 차단
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONF_DIR = BASE_DIR / "conf"
WEB_DIR = BASE_DIR  # index.html 이 패키지 폴더 맨 위에 있음


def load_app_config(base_dir):
    """conf/app.ini 읽기 (tools/app_config.py 와 같은 규칙)"""
    cfg = {"product_name": "Project Mgmt", "edition": "COLLAB", "edition_name": "협업", "version": "1.0.0", "default_lang": "ko",
           "default_theme": "electric", "host": "0.0.0.0", "port": "8080", "db_file": "pprjmgmt.db", "base_path": "/pprjmgmt"}
    path = pathlib.Path(base_dir) / "conf" / "app.ini"
    if path.exists():
        cp = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
        cp.read(path, encoding="utf-8-sig")
        for section in cp.sections():
            for k, v in cp.items(section):
                cfg[k] = v.strip()
    cfg["default_lang"] = "en" if cfg["default_lang"].lower() == "en" else "ko"
    cfg["edition"] = cfg["edition"].upper()
    cfg["default_theme"] = cfg["default_theme"].lower() if str(cfg.get("default_theme", "")).lower() in ("electric", "navy", "green", "brown", "matte", "dark") else "electric"
    return cfg


def app_features(c):
    """체크아웃 잠금 설정 (conf/app.ini [lock]) — 화면 · 서버 공용"""
    mode = str(c.get("lock_mode", "required")).strip().lower()
    try:
        hours = max(0.05, min(72.0, float(c.get("lock_hours", "4"))))
    except ValueError:
        hours = 4.0
    return {"lock": {"mode": mode if mode in ("required", "advisory", "off") else "required", "hours": hours}}


def base_path(c):
    """전사 시스템 하위 주소 (예: /pprjmgmt). 빈 값이면 루트(/)"""
    v = "/" + str(c.get("base_path", "") or "").strip().strip("/")
    return "" if v == "/" else v


APP_CONFIG = load_app_config(BASE_DIR)
VERSION = "ver" + APP_CONFIG["version"]
APP_NAME = f"{APP_CONFIG['product_name']}{' (' + APP_CONFIG['edition_name'] + ')' if APP_CONFIG['edition_name'] else ''} {VERSION}"
BASE_PATH = base_path(APP_CONFIG)

# Windows 콘솔 한글 출력 인코딩 안전 처리
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DATA_DIR = (BASE_DIR / "data").resolve()
DB_PATH = DATA_DIR / "pprjmgmt.db"
INITIAL_DATA_PATH = DATA_DIR / "initial_data.json"
MAX_BODY_BYTES = 5 * 1024 * 1024  # 저장 요청 1건 최대 크기
APP_CONFIG_URL = "/static/js/config/app-config.js"  # conf/app.ini 로 즉시 만들어 보내는 화면 설정


BLOCKED_URL_PREFIXES = ("/server", "/data", "/logs", "/conf", "/tools", "/legal", "/.", "/__pycache__")
BLOCKED_URL_EXTENSIONS = {".py", ".pyc", ".ini", ".txt", ".md", ".json", ".db", ".sqlite", ".sqlite3", ".accdb", ".mdb", ".sql", ".bat", ".sh", ".env", ".log", ".pem", ".key", ".crt", ".pfx"}

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
    "processTypes":             {"part": None,     "scope": "system"},  # [v3.9.0] 공정 유형 라이브러리 (시스템관리자)
}
# [v1.0.10] 여러 프로젝트: 사용자 계정·화면 테마는 모든 프로젝트 공통, 그 밖의 데이터는 프로젝트별 저장
DEFAULT_PROJECT = "DEFAULT"
GLOBAL_KEYS = {"projectUsers", "theme", "processTypes"}
PROJECT_ID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")


# ---------------------------------------------------------------------------
# 로그: 오류만 logs/error.log 하나에 (LOG_MAX_BYTES 를 넘으면 뒤쪽 절반만 남김 — 용량 초과 방지)
# ---------------------------------------------------------------------------
LOG_DIR = BASE_DIR / "logs"
LOG_MAX_BYTES = 256 * 1024
LOG_CONSOLE = True
