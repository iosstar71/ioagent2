# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 설정 · 경로 · 상수 (conf/app.ini)"""
import configparser
import pathlib
import re
import sys
import threading



# 폴더 구성 (v3.6.0)
#   conf/    설정(app.ini)            server/  서버 프로그램(이 패키지)
#   webapp/  화면 파일(웹 루트)        data/    DB
#   upload/  첨부파일(웹 루트 밖)      logs/    서버 로그        certs/  HTTPS 인증서
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONF_DIR = BASE_DIR / "conf"
WEB_DIR = BASE_DIR / "webapp"


def load_app_config(base_dir):
    """[v1.2.0] conf/app.ini 읽기 (tools/app_config.py 와 같은 규칙, 서버 단독 실행을 위해 내장)"""
    cfg = {"product_name": "IOSTAR-PM", "edition": "KR", "version": "1.2.0", "default_lang": "ko",
           "default_ui": "standard", "allow_ui_switch": "1", "default_theme": "electric",
           "host": "0.0.0.0", "port": "8080", "db_file": "wbs_enterprise.db", "log_dir": "logs",
           "cert_file": "certs/server.crt", "key_file": "certs/server.key"}
    path = pathlib.Path(base_dir) / "conf" / "app.ini"
    if not path.exists():
        path = pathlib.Path(base_dir) / "app.ini"  # v3.5.0 이하 위치
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
    cfg["default_theme"] = cfg["default_theme"].lower() if str(cfg.get("default_theme", "")).lower() in ("electric", "navy", "green", "brown", "matte", "dark") else "electric"
    return cfg


APP_CONFIG = load_app_config(BASE_DIR)
VERSION = "ver" + APP_CONFIG["version"]
APP_NAME = f"{APP_CONFIG['product_name']}{' ' + APP_CONFIG['edition_name'] if APP_CONFIG['edition_name'] else ''} {VERSION}"

# Windows 콘솔 한글 출력 인코딩 안전 처리
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DATA_DIR = (BASE_DIR / "data").resolve()
DB_PATH = DATA_DIR / "wbs_enterprise.db"
INITIAL_DATA_PATH = DATA_DIR / "initial_data.json"
MAX_BODY_BYTES = 15 * 1024 * 1024
APP_CONFIG_URL = "/static/js/config/app-config.js"  # conf/app.ini 로 즉시 만들어 보내는 화면 설정


def _cfg_int(key, default, low, high):
    try:
        return max(low, min(high, int(str(APP_CONFIG.get(key, default)).strip())))
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# [v3.6.0] 첨부파일 정책 (conf/app.ini [files])
#   - 파일 1개 최대 20MB, 프로젝트별 합계 한도, 허용 확장자만 올리기
#   - 삭제하면 휴지통에 보관했다가 보존 기간이 지나면 자동으로 완전 삭제
#   - 같은 이름으로 다시 올리면 새 버전, 이전 버전은 정해진 개수까지 보관
# ---------------------------------------------------------------------------
UPLOAD_DIR = (BASE_DIR / (APP_CONFIG.get("upload_dir") or "upload")).resolve()
FILE_MAX_BYTES = _cfg_int("max_file_mb", 20, 1, 200) * 1024 * 1024
FILE_PROJECT_QUOTA_BYTES = _cfg_int("project_quota_mb", 5120, 10, 1024 * 1024) * 1024 * 1024
FILE_TRASH_DAYS = _cfg_int("trash_days", 30, 0, 3650)
FILE_KEEP_VERSIONS = _cfg_int("keep_versions", 10, 1, 100)
FILE_DEFAULT_EXTENSIONS = ("pdf hwp hwpx doc docx xls xlsx ppt pptx txt csv md "
                           "png jpg jpeg gif bmp webp zip 7z")
FILE_ALLOWED_EXTENSIONS = frozenset(
    e.strip().lstrip(".").lower() for e in re.split(r"[\s,]+", APP_CONFIG.get("allowed_extensions") or FILE_DEFAULT_EXTENSIONS) if e.strip())
FILE_MAX_PER_POST = _cfg_int("max_files_per_post", 5, 1, 50)  # 공지 · 게시물 · 회의록 1건에 붙일 수 있는 파일 수
# 첨부 대상 → 권한을 따르는 데이터셋 / 한 건에 붙일 수 있는 파일 수(0 = 제한 없음) / 올리기 · 삭제 규칙
#   subsystem: 그 서브시스템을 저장할 수 있는 사람   author: 글쓴이와 PM · 시스템관리자   member: 프로젝트 참여자 (삭제는 올린 사람과 PM · 시스템관리자)
FILE_OWNER_TYPES = {
    "deliverable": {"dataset": "deliverablesData", "max": 0, "rule": "subsystem"},
    "notice": {"dataset": "noticesData", "max": FILE_MAX_PER_POST, "rule": "author"},
    "post": {"dataset": "communicationsData", "max": FILE_MAX_PER_POST, "rule": "author"},
    "meeting": {"dataset": "meetingsData", "max": FILE_MAX_PER_POST, "rule": "member"},
}
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
    "processTypes":             {"part": None,     "scope": "system"},  # [v3.9.0] 공정 유형 라이브러리 (시스템관리자)
}
# [v1.0.10] 여러 프로젝트: 사용자 계정·화면 테마는 모든 프로젝트 공통, 그 밖의 데이터는 프로젝트별 저장
DEFAULT_PROJECT = "DEFAULT"
GLOBAL_KEYS = {"projectUsers", "theme", "processTypes"}
PROJECT_ID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")
MIRROR_SCHEMA_VERSION = "2"


# ---------------------------------------------------------------------------
# 로그
# ---------------------------------------------------------------------------
LOG_DATE_MODE = False
LOG_SILENT_MODE = False
LOG_DIR = None
