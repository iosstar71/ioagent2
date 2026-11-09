#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AX Project Management by YS ver1.0.5 - 보안 강화형 다중 데이터베이스 연동 웹 서버
================================================================================
[HTTP 사내망 보안 강화 및 ver1.0.4 스키마 호환 적용 내역]
1) 디렉터리 트래버설(Path Traversal) 원천 차단: DB 파일 경로를 ./data 디렉터리 내부 및 허용 확장자로 엄격 제한
2) 민감 파일 직접 접근 차단(403 Forbidden): 브라우저 URL로 /server/*, /data/*, *.py, *.db, *.accdb, *.sql, *.bat 직접 다운로드 불가
3) HTTP 보안 헤더 자동 주입: X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN
4) ver1.0.4 전체 설정(분야 domains, 커스텀 SDLC, 서브시스템 domain/sdlcCode, 인력 권한 projectUsers) 완벽 보존
"""

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import datetime
import time
import pathlib
import re
import sqlite3
import sys
import threading

# Windows 콘솔 한글 출력 인코딩 안전 처리
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DB_LOCK = threading.Lock()
_THIS_DIR = pathlib.Path(__file__).resolve().parent
BASE_DIR = _THIS_DIR if (_THIS_DIR / "index.html").exists() else _THIS_DIR.parent
DATA_DIR = (BASE_DIR / "data").resolve()
MAX_BODY_BYTES = 15 * 1024 * 1024  # 15MB 제한
ALLOWED_DB_EXTENSIONS = {".db", ".sqlite", ".sqlite3", ".accdb", ".mdb", ".xlsx"}
BLOCKED_URL_PREFIXES = ("/server", "/data", "/.")
BLOCKED_URL_EXTENSIONS = {".py", ".db", ".sqlite", ".sqlite3", ".accdb", ".mdb", ".sql", ".bat", ".sh", ".env"}


# [v1.0.5] TB_WBS_EXTRA_JSON 에 원본 JSON 그대로 저장/복원하는 확장 데이터 키
EXTRA_JSON_KEYS = ("noticesData", "communicationsData", "meetingsData", "weeklyReportsData")


class SecurityError(Exception):
    """보안 정책 위반 예외"""


class DatabaseAdapter:
    """SQLite / Oracle / Excel·Access 3대 DB 공통 보안 어댑터"""

    @staticmethod
    def _validate_and_resolve_db_path(file_path: str) -> pathlib.Path:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        raw_name = pathlib.Path(str(file_path or "wbs_enterprise.db")).name
        safe_name = re.sub(r"[^a-zA-Z0-9가-힣_.-]", "_", raw_name)
        if not safe_name or safe_name.startswith("."):
            safe_name = "wbs_enterprise.db"
        target = (DATA_DIR / safe_name).resolve()
        if not str(target).startswith(str(DATA_DIR)):
            raise SecurityError("허용되지 않은 파일 경로 접근이 차단되었습니다.")
        if target.suffix.lower() not in ALLOWED_DB_EXTENSIONS:
            raise SecurityError(f"허용되지 않는 DB 파일 확장자입니다: {target.suffix}")
        return target

    @classmethod
    def sqlite_connect(cls, cfg: dict) -> sqlite3.Connection:
        s_cfg = cfg.get("sqlite", {})
        db_path = cls._validate_and_resolve_db_path(s_cfg.get("filePath", "./data/wbs_enterprise.db"))
        timeout_sec = max(1.0, min(30.0, float(s_cfg.get("busyTimeout", 5000)) / 1000.0))
        conn = sqlite3.connect(str(db_path), timeout=timeout_sec)
        journal = str(s_cfg.get("journalMode", "WAL")).upper()
        if journal not in {"WAL", "DELETE", "MEMORY", "TRUNCATE", "PERSIST"}:
            journal = "WAL"
        conn.execute(f"PRAGMA journal_mode = {journal};")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    @classmethod
    def sqlite_init(cls, cfg: dict) -> str:
        with DB_LOCK:
            conn = cls.sqlite_connect(cfg)
            try:
                cur = conn.cursor()
                cur.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS TB_WBS_CONFIG (
                      PROJECT_ID TEXT PRIMARY KEY DEFAULT 'DEFAULT_PROJ',
                      PROJECT_START_DATE TEXT NOT NULL,
                      PROJECT_END_DATE TEXT NOT NULL,
                      REPORT_DATE TEXT NOT NULL,
                      WEEK_START_DAY INTEGER DEFAULT 5,
                      THEME TEXT DEFAULT 'navy',
                      HOLIDAYS_JSON TEXT,
                      STD_DELIV_JSON TEXT,
                      FULL_CONFIG_JSON TEXT,
                      USERS_JSON TEXT,
                      UPDATED_AT TEXT DEFAULT (datetime('now','localtime'))
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_SUBSYSTEM (
                      SUBSYSTEM_CODE TEXT PRIMARY KEY,
                      SUBSYSTEM_NAME TEXT NOT NULL,
                      DOMAIN_NAME TEXT DEFAULT '관리공통',
                      PROJ_TYPE TEXT DEFAULT 'SDLC',
                      SDLC_CODE TEXT DEFAULT 'SDLC_PROC',
                      WEIGHT REAL DEFAULT 15,
                      PM_NAME TEXT,
                      DESCRIPTION TEXT,
                      SORT_ORDER INTEGER DEFAULT 0
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_TASK (
                      ROW_SEQ INTEGER PRIMARY KEY AUTOINCREMENT,
                      WBS_ID TEXT NOT NULL,
                      LVL INTEGER NOT NULL DEFAULT 1,
                      SUBSYSTEM_NAME TEXT NOT NULL,
                      TASK_NAME TEXT NOT NULL,
                      WEIGHT REAL DEFAULT 1,
                      REQ_ID TEXT,
                      PLAN_START TEXT,
                      PLAN_END TEXT,
                      ACT_START TEXT,
                      ACT_END TEXT,
                      PLAN_PROG REAL DEFAULT 0,
                      ACT_PROG REAL DEFAULT 0,
                      OUTPUT_NOTE TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_DELIVERABLE (
                      DELIV_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                      SUBMIT_ROUND TEXT NOT NULL,
                      SUBSYSTEM_NAME TEXT NOT NULL,
                      PHASE_NAME TEXT,
                      DELIV_NAME TEXT NOT NULL,
                      PLAN_DATE TEXT,
                      ACT_DATE TEXT,
                      STATUS TEXT DEFAULT '작성전',
                      MANAGER_NAME TEXT,
                      REMARKS TEXT
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_REQ (
                      REQ_ID TEXT PRIMARY KEY,
                      SUBSYSTEM_NAME TEXT NOT NULL,
                      REQ_NAME TEXT NOT NULL,
                      REQ_TYPE TEXT DEFAULT '기능',
                      PRIORITY TEXT DEFAULT '중',
                      ACCEPT_YN TEXT DEFAULT '수용',
                      STATUS TEXT DEFAULT '착수전',
                      SORT_ORDER INTEGER DEFAULT 0
                    );
                                        CREATE TABLE IF NOT EXISTS TB_WBS_NOTICE (
                      NOTICE_ID TEXT PRIMARY KEY,
                      TITLE TEXT NOT NULL,
                      CONTENT TEXT,
                      AUTHOR TEXT,
                      AUTHOR_EMP_NO TEXT,
                      NOTICE_DATE TEXT,
                      PRIORITY TEXT DEFAULT '일반',
                      IS_PINNED INTEGER DEFAULT 0,
                      VIEW_COUNT INTEGER DEFAULT 0,
                      UPDATED_AT TEXT DEFAULT (datetime('now','localtime'))
                    );
                                        CREATE TABLE IF NOT EXISTS TB_WBS_CHAT (
                      MSG_ID TEXT PRIMARY KEY,
                      CHANNEL TEXT DEFAULT '전체',
                      SENDER_NAME TEXT NOT NULL,
                      SENDER_EMP_NO TEXT,
                      USER_ROLE TEXT,
                      MESSAGE TEXT NOT NULL,
                      CREATED_AT TEXT DEFAULT (datetime('now','localtime'))
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_COMMUNICATION (
                      COMM_ID TEXT PRIMARY KEY,
                      CHANNEL TEXT DEFAULT '전체',
                      TASK_ID TEXT,
                      AUTHOR TEXT,
                      AUTHOR_EMP_NO TEXT,
                      USER_ROLE TEXT,
                      CONTENT TEXT NOT NULL,
                      POST_DATE TEXT,
                      REPLIES_JSON TEXT,
                      UPDATED_AT TEXT DEFAULT (datetime('now','localtime'))
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_EXTRA_JSON (
                      DATA_KEY TEXT PRIMARY KEY,
                      JSON_TEXT TEXT,
                      UPDATED_AT TEXT DEFAULT (datetime('now','localtime'))
                    );
                    CREATE TABLE IF NOT EXISTS TB_WBS_VOC (
                      VOC_ID TEXT PRIMARY KEY,
                      SUBSYSTEM_NAME TEXT NOT NULL,
                      PRIORITY TEXT DEFAULT '중',
                      VOC_TITLE TEXT NOT NULL,
                      REQUESTER TEXT,
                      REQ_DATE TEXT,
                      TARGET_DATE TEXT,
                      STATUS TEXT DEFAULT '착수전',
                      ACTION_NOTE TEXT,
                      SORT_ORDER INTEGER DEFAULT 0
                    );
                    """
                )
                # 구버전 테이블 호환을 위한 컬럼 자동 추가
                for alter_sql in [
                    "ALTER TABLE TB_WBS_CONFIG ADD COLUMN FULL_CONFIG_JSON TEXT;",
                    "ALTER TABLE TB_WBS_CONFIG ADD COLUMN USERS_JSON TEXT;",
                    "ALTER TABLE TB_WBS_SUBSYSTEM ADD COLUMN DOMAIN_NAME TEXT DEFAULT '관리공통';",
                    "ALTER TABLE TB_WBS_SUBSYSTEM ADD COLUMN SDLC_CODE TEXT DEFAULT 'SDLC_PROC';",
                ]:
                    try:
                        cur.execute(alter_sql)
                    except Exception:
                        pass
                
                conn.commit()
                return "SQLite 6개 표준 테이블(TB_WBS_*) 초기화 및 v1.3 스키마 동기화가 완료되었습니다."
            finally:
                conn.close()

    @classmethod
    def sqlite_save(cls, cfg: dict, data: dict) -> str:
        cls.sqlite_init(cfg)
        with DB_LOCK:
            conn = cls.sqlite_connect(cfg)
            try:
                cur = conn.cursor()
                p_cfg = data.get("projectConfig", {})
                cur.execute("DELETE FROM TB_WBS_CONFIG")
                cur.execute(
                    """INSERT INTO TB_WBS_CONFIG
                       (PROJECT_ID, PROJECT_START_DATE, PROJECT_END_DATE, REPORT_DATE, WEEK_START_DAY, THEME, HOLIDAYS_JSON, STD_DELIV_JSON, FULL_CONFIG_JSON, USERS_JSON)
                       VALUES ('DEFAULT_PROJ', ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        p_cfg.get("projectStartDate", "2027-01-01"),
                        p_cfg.get("projectEndDate", "2027-12-31"),
                        p_cfg.get("reportDate", "2027-06-01"),
                        int(p_cfg.get("weekStartDay", 5)),
                        data.get("theme", "navy"),
                        json.dumps(p_cfg.get("holidays", []), ensure_ascii=False),
                        json.dumps(data.get("standardDeliverablesMeta", []), ensure_ascii=False),
                        json.dumps(p_cfg, ensure_ascii=False),
                        json.dumps(data.get("projectUsers", []), ensure_ascii=False),
                    ),
                )

                cur.execute("DELETE FROM TB_WBS_SUBSYSTEM")
                for idx, s in enumerate(data.get("subsystemsMeta", [])):
                    code = s.get("code") or s.get("name") or f"SYS_{idx+1}"
                    name = s.get("name") or code
                    cur.execute(
                        """INSERT OR REPLACE INTO TB_WBS_SUBSYSTEM
                           (SUBSYSTEM_CODE, SUBSYSTEM_NAME, DOMAIN_NAME, PROJ_TYPE, SDLC_CODE, WEIGHT, PM_NAME, DESCRIPTION, SORT_ORDER)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            code,
                            name,
                            s.get("domain", "관리공통"),
                            s.get("type", "SDLC"),
                            s.get("sdlcCode", "SDLC_PROC"),
                            float(s.get("weight", 15)),
                            s.get("pm", ""),
                            s.get("desc", ""),
                            idx,
                        ),
                    )

                cur.execute("DELETE FROM TB_WBS_TASK")
                for idx, t in enumerate(data.get("wbsData", []), 1):
                    cur.execute(
                        """INSERT INTO TB_WBS_TASK
                           (ROW_SEQ, WBS_ID, LVL, SUBSYSTEM_NAME, TASK_NAME, WEIGHT, REQ_ID, PLAN_START, PLAN_END, ACT_START, ACT_END, PLAN_PROG, ACT_PROG, OUTPUT_NOTE)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            idx, t.get("id", ""), int(t.get("level", 1)), t.get("system", ""), t.get("name", ""),
                            float(t.get("weight", 1)), t.get("reqId", ""), t.get("pStart", ""), t.get("pEnd", ""),
                            t.get("aStart", ""), t.get("aEnd", ""), float(t.get("pProg", 0)), float(t.get("aProg", 0)), t.get("output", ""),
                        ),
                    )

                cur.execute("DELETE FROM TB_WBS_DELIVERABLE")
                for idx, d in enumerate(data.get("deliverablesData", []), 1):
                    cur.execute(
                        "INSERT INTO TB_WBS_DELIVERABLE VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (idx, d.get("round", "1회차"), d.get("system", ""), d.get("phase", ""), d.get("name", ""), d.get("pDate", ""), d.get("aDate", ""), d.get("status", "작성전"), d.get("manager", ""), d.get("remarks", "")),
                    )

                cur.execute("DELETE FROM TB_WBS_REQ")
                for idx, r in enumerate(data.get("reqMasterData", []), 1):
                    cur.execute(
                        "INSERT OR REPLACE INTO TB_WBS_REQ VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (r.get("id", f"REQ-{idx}"), r.get("system", ""), r.get("name", ""), r.get("type", "기능"), r.get("priority", "중"), r.get("accept", "수용"), r.get("status", "착수전"), idx),
                    )

                cur.execute("DELETE FROM TB_WBS_VOC")
                for idx, v in enumerate(data.get("vocData", []), 1):
                    cur.execute(
                        "INSERT OR REPLACE INTO TB_WBS_VOC VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (v.get("id", f"VOC-{idx}"), v.get("system", ""), v.get("priority", "중"), v.get("title", ""), v.get("requester", ""), v.get("reqDate", ""), v.get("targetDate", ""), v.get("status", "착수전"), v.get("action", ""), idx),
                    )

                # [v1.0.5 버그수정] sqlite_init 에 잘못 위치하여 NameError(payload)로 저장/조회 API 전체가 500 오류를 내던 코드를 저장 함수로 이동
                # 6. 공지사항 저장
                notices_list = data.get("noticesData", [])
                if isinstance(notices_list, list):
                    cur.execute("DELETE FROM TB_WBS_NOTICE")
                    for n in notices_list:
                        cur.execute(
                            """INSERT OR REPLACE INTO TB_WBS_NOTICE
                               (NOTICE_ID, TITLE, CONTENT, AUTHOR, AUTHOR_EMP_NO, NOTICE_DATE, PRIORITY, IS_PINNED, VIEW_COUNT)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                str(n.get("id") or ""),
                                str(n.get("title") or ""),
                                str(n.get("content") or ""),
                                str(n.get("author") or ""),
                                str(n.get("authorEmpNo") or ""),
                                str(n.get("date") or ""),
                                str(n.get("priority") or "일반"),
                                1 if n.get("isPinned") else 0,
                                int(n.get("viewCount") or 0)
                            )
                        )

                # 7. 소통 피드 저장
                comm_list = data.get("communicationsData", [])
                if isinstance(comm_list, list):
                    cur.execute("DELETE FROM TB_WBS_COMMUNICATION")
                    for c in comm_list:
                        cur.execute(
                            """INSERT OR REPLACE INTO TB_WBS_COMMUNICATION
                               (COMM_ID, CHANNEL, TASK_ID, AUTHOR, AUTHOR_EMP_NO, USER_ROLE, CONTENT, POST_DATE, REPLIES_JSON)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                str(c.get("id") or ""),
                                str(c.get("channel") or "전체"),
                                str(c.get("taskId") or ""),
                                str(c.get("author") or ""),
                                str(c.get("authorEmpNo") or ""),
                                str(c.get("role") or ""),
                                str(c.get("content") or ""),
                                str(c.get("date") or ""),
                                json.dumps(c.get("replies", []), ensure_ascii=False)
                            )
                        )

                # [v1.0.5] 공지/소통/회의/주간보고 등 확장 데이터 무손실 JSON 저장
                for data_key in EXTRA_JSON_KEYS:
                    if data_key in data and isinstance(data.get(data_key), list):
                        cur.execute(
                            "INSERT OR REPLACE INTO TB_WBS_EXTRA_JSON (DATA_KEY, JSON_TEXT, UPDATED_AT) VALUES (?, ?, datetime('now','localtime'))",
                            (data_key, json.dumps(data.get(data_key), ensure_ascii=False)),
                        )

                conn.commit()
                return f"SQLite DB 저장 완료 (서브시스템 {len(data.get('subsystemsMeta', []))}개, WBS {len(data.get('wbsData', []))}건)"
            finally:
                conn.close()

    @classmethod
    def sqlite_load(cls, cfg: dict) -> dict:
        cls.sqlite_init(cfg)
        with DB_LOCK:
            conn = cls.sqlite_connect(cfg)
            try:
                cur = conn.cursor()
                out = {}
                cur.execute("SELECT PROJECT_START_DATE, PROJECT_END_DATE, REPORT_DATE, WEEK_START_DAY, THEME, HOLIDAYS_JSON, STD_DELIV_JSON, FULL_CONFIG_JSON, USERS_JSON FROM TB_WBS_CONFIG LIMIT 1")
                row = cur.fetchone()
                if row:
                    if row[7]:
                        out["projectConfig"] = json.loads(row[7])
                    else:
                        out["projectConfig"] = {
                            "projectStartDate": row[0],
                            "projectEndDate": row[1],
                            "reportDate": row[2],
                            "weekStartDay": row[3],
                            "holidays": json.loads(row[5] or "[]"),
                        }
                    out["theme"] = row[4]
                    if row[6]:
                        out["standardDeliverablesMeta"] = json.loads(row[6])
                    if row[8]:
                        out["projectUsers"] = json.loads(row[8])

                cur.execute("SELECT SUBSYSTEM_CODE, SUBSYSTEM_NAME, DOMAIN_NAME, PROJ_TYPE, SDLC_CODE, WEIGHT, PM_NAME, DESCRIPTION FROM TB_WBS_SUBSYSTEM ORDER BY SORT_ORDER")
                out["subsystemsMeta"] = [
                    {
                        "code": r[0],
                        "name": r[1],
                        "domain": r[2] or "관리공통",
                        "type": r[3] or "SDLC",
                        "sdlcCode": r[4] or "SDLC_PROC",
                        "weight": r[5],
                        "pm": r[6],
                        "desc": r[7],
                    }
                    for r in cur.fetchall()
                ]

                cur.execute("SELECT WBS_ID, LVL, SUBSYSTEM_NAME, TASK_NAME, WEIGHT, REQ_ID, PLAN_START, PLAN_END, ACT_START, ACT_END, PLAN_PROG, ACT_PROG, OUTPUT_NOTE FROM TB_WBS_TASK ORDER BY ROW_SEQ")
                out["wbsData"] = [
                    {
                        "id": r[0], "level": r[1], "system": r[2], "name": r[3], "weight": r[4],
                        "reqId": r[5], "pStart": r[6], "pEnd": r[7], "aStart": r[8], "aEnd": r[9],
                        "pProg": r[10], "aProg": r[11], "output": r[12],
                    }
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
                cur.execute("SELECT DATA_KEY, JSON_TEXT FROM TB_WBS_EXTRA_JSON")
                for data_key, json_text in cur.fetchall():
                    if data_key in EXTRA_JSON_KEYS and json_text:
                        try:
                            out[data_key] = json.loads(json_text)
                        except Exception:
                            pass
                return out
            finally:
                conn.close()

    @classmethod
    def oracle_connect(cls, cfg: dict):
        try:
            import oracledb as ora
        except ImportError:
            import cx_Oracle as ora
        o_cfg = cfg.get("oracle", {})
        host = re.sub(r"[^a-zA-Z0-9.-]", "", str(o_cfg.get("host", "127.0.0.1")))
        port = int(o_cfg.get("port", 1521))
        svc = re.sub(r"[^a-zA-Z0-9_.-]", "", str(o_cfg.get("serviceOrSid", "ORCL")))
        user = str(o_cfg.get("user", "WBS_ADMIN"))
        pwd = str(o_cfg.get("password", ""))
        dsn = f"{host}:{port}/{svc}"
        return ora.connect(user=user, password=pwd, dsn=dsn)

    @classmethod
    def excel_access_test(cls, cfg: dict) -> str:
        ea_cfg = cfg.get("excelAccess", {})
        sub = ea_cfg.get("subType", "ACCESS_ODBC")
        f_path = cls._validate_and_resolve_db_path(ea_cfg.get("filePath", "./data/WBS_Database.accdb"))
        if sub == "ACCESS_ODBC":
            import pyodbc
            drv = ea_cfg.get("odbcDriver", "Microsoft Access Driver (*.mdb, *.accdb)")
            conn_str = f"DRIVER={{{drv}}};DBQ={f_path};"
            conn = pyodbc.connect(conn_str)
            conn.close()
            return f"MS Access ODBC 연결 성공 ({f_path.name})"
        else:
            import openpyxl
            if not f_path.exists():
                wb = openpyxl.Workbook()
                wb.save(str(f_path))
            return f"MS Excel 공유 DB 워크북 연결 성공 ({f_path.name})"



# =========================================================================
# [ver1.0.4 신규] 날짜별 일일 로그 기록 및 무소음(Silent) 로깅 엔진
# =========================================================================
LOG_DATE_MODE = False
LOG_SILENT_MODE = False
LOG_DIR = None
_current_log_file = None
_current_log_date = None
_log_lock = threading.Lock()

def get_daily_log_file(log_dir_path):
    global _current_log_file, _current_log_date
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    with _log_lock:
        if _current_log_file is None or _current_log_date != today_str:
            if _current_log_file and not _current_log_file.closed:
                try: _current_log_file.close()
                except Exception: pass
            log_dir_path.mkdir(parents=True, exist_ok=True)
            log_path = log_dir_path / f"server_{today_str}.log"
            _current_log_file = open(log_path, "a", encoding="utf-8", buffering=1)
            _current_log_date = today_str
        return _current_log_file

def write_server_log(msg):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{now_str}] {msg.rstrip()}\n"
    if LOG_DATE_MODE and LOG_DIR:
        try:
            f = get_daily_log_file(LOG_DIR)
            f.write(formatted)
            f.flush()
        except Exception as e:
            sys.stderr.write(f"[LOG ERROR] {e}\n")
    if not LOG_SILENT_MODE:
        sys.stderr.write(formatted)
        sys.stderr.flush()


# =========================================================================
# [ver1.0.4 신규] 날짜별 일일 로그 기록 및 무소음(Silent) 로깅 엔진
# =========================================================================
LOG_DATE_MODE = False
LOG_SILENT_MODE = False
LOG_DIR = None
_current_log_file = None
_current_log_date = None
_log_lock = threading.Lock()

def get_daily_log_file(log_dir_path):
    global _current_log_file, _current_log_date
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    with _log_lock:
        if _current_log_file is None or _current_log_date != today_str:
            if _current_log_file and not _current_log_file.closed:
                try: _current_log_file.close()
                except Exception: pass
            log_dir_path.mkdir(parents=True, exist_ok=True)
            log_path = log_dir_path / f"server_{today_str}.log"
            _current_log_file = open(log_path, "a", encoding="utf-8", buffering=1)
            _current_log_date = today_str
        return _current_log_file

def write_server_log(msg):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{now_str}] {msg.rstrip()}\n"
    if LOG_DATE_MODE and LOG_DIR:
        try:
            f = get_daily_log_file(LOG_DIR)
            f.write(formatted)
            f.flush()
        except Exception as e:
            sys.stderr.write(f"[LOG ERROR] {e}\n")
    if not LOG_SILENT_MODE:
        sys.stderr.write(formatted)
        sys.stderr.flush()

class WbsHttpHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self):
        origin = self.headers.get("Origin")
        self.send_header("Access-Control-Allow-Origin", origin if origin and origin != "null" else "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-WBS-Client, Accept, Origin")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-XSS-Protection", "1; mode=block")
        super().end_headers()

    def do_GET(self):
        clean_path = self.path.split("?", 1)[0].split("#", 1)[0]
        if clean_path == "/api/chat/messages":
            import urllib.parse
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            channel = urllib.parse.unquote(params.get("channel", ["전체"])[0])
            with DB_LOCK:
                try:
                    conn = DatabaseAdapter.sqlite_connect({"sqliteFile": "data/wbs_master.db"})
                    cur = conn.cursor()
                    cur.execute("""CREATE TABLE IF NOT EXISTS TB_WBS_CHAT (
                        MSG_ID TEXT PRIMARY KEY,
                        CHANNEL TEXT DEFAULT '전체',
                        SENDER_NAME TEXT NOT NULL,
                        SENDER_EMP_NO TEXT,
                        USER_ROLE TEXT,
                        MESSAGE TEXT NOT NULL,
                        CREATED_AT TEXT DEFAULT (datetime('now','localtime'))
                    )""")
                    if channel == "전체":
                        cur.execute("SELECT MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT FROM TB_WBS_CHAT ORDER BY CREATED_AT ASC LIMIT 300")
                    else:
                        cur.execute("SELECT MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT FROM TB_WBS_CHAT WHERE CHANNEL = ? ORDER BY CREATED_AT ASC LIMIT 300", (channel,))
                    rows = cur.fetchall()
                    conn.close()
                    msgs = []
                    for r in rows:
                        msgs.append({
                            "id": r[0], "channel": r[1], "senderName": r[2], "senderEmpNo": r[3],
                            "userRole": r[4], "message": r[5], "createdAt": r[6]
                        })
                    self._send_json(200, {"ok": True, "messages": msgs, "channel": channel, "serverTime": str(datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))})
                except Exception as ex:
                    self._send_json(500, {"ok": False, "message": f"채팅 조회 오류: {str(ex)}"})
            return

        if clean_path == "/api/db/ping":
            self._send_json(200, {"ok": True, "version": "ver1.0.5", "message": "AX Project Management by YS ver1.0.5 DB Server Running"})
            return
        lower_path = clean_path.lower()
        ext = pathlib.Path(lower_path).suffix
        if any(lower_path.startswith(p) for p in BLOCKED_URL_PREFIXES) or ext in BLOCKED_URL_EXTENSIONS:
            self.send_error(403, "Forbidden: Direct access to server or database files is restricted.")
            return
        super().do_GET()

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY_BYTES:
            self._send_json(413, {"ok": False, "message": "요청 데이터 크기가 허용 한도(15MB)를 초과했습니다."})
            return

        raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            req = json.loads(raw)
        except Exception:
            self._send_json(400, {"ok": False, "message": "잘못된 JSON 요청 형식입니다."})
            return

        cfg = req.get("config", {})
        mode = cfg.get("mode", "SQLITE")

        try:
            if self.path == "/api/chat/clear":
                with DB_LOCK:
                    try:
                        conn = DatabaseAdapter.sqlite_connect({"sqliteFile": "data/wbs_master.db"})
                        cur = conn.cursor()
                        cur.execute("""CREATE TABLE IF NOT EXISTS TB_WBS_CHAT (
                            MSG_ID TEXT PRIMARY KEY,
                            CHANNEL TEXT DEFAULT '전체',
                            SENDER_NAME TEXT NOT NULL,
                            SENDER_EMP_NO TEXT,
                            USER_ROLE TEXT,
                            MESSAGE TEXT NOT NULL,
                            CREATED_AT TEXT DEFAULT (datetime('now','localtime'))
                        )""")
                        cur.execute("DELETE FROM TB_WBS_CHAT")
                        conn.commit()
                        conn.close()
                        self._send_json(200, {"ok": True, "message": "채팅 대화내역이 모두 삭제되었습니다."})
                    except Exception as ex:
                        self._send_json(500, {"ok": False, "message": f"채팅 삭제 실패: {str(ex)}"})
                return

            if self.path == "/api/chat/send":
                channel = req.get("channel", "전체")
                sender_name = req.get("senderName", "익명")
                sender_emp_no = req.get("senderEmpNo", "user")
                user_role = req.get("userRole", "MEMBER")
                message = str(req.get("message", "")).strip()
                if not message:
                    self._send_json(400, {"ok": False, "message": "채팅 메시지 내용을 입력해주세요."})
                    return
                msg_id = "CHAT-" + str(req.get("id", int(time.time() * 1000)))
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                with DB_LOCK:
                    try:
                        conn = DatabaseAdapter.sqlite_connect({"sqliteFile": "data/wbs_master.db"})
                        cur = conn.cursor()
                        cur.execute("""CREATE TABLE IF NOT EXISTS TB_WBS_CHAT (
                            MSG_ID TEXT PRIMARY KEY,
                            CHANNEL TEXT DEFAULT '전체',
                            SENDER_NAME TEXT NOT NULL,
                            SENDER_EMP_NO TEXT,
                            USER_ROLE TEXT,
                            MESSAGE TEXT NOT NULL,
                            CREATED_AT TEXT DEFAULT (datetime('now','localtime'))
                        )""")
                        cur.execute("""INSERT INTO TB_WBS_CHAT (MSG_ID, CHANNEL, SENDER_NAME, SENDER_EMP_NO, USER_ROLE, MESSAGE, CREATED_AT)
                                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                                    (msg_id, channel, sender_name, sender_emp_no, user_role, message, now_str))
                        conn.commit()
                        conn.close()
                        self._send_json(200, {
                            "ok": True,
                            "message": {
                                "id": msg_id, "channel": channel, "senderName": sender_name,
                                "senderEmpNo": sender_emp_no, "userRole": user_role,
                                "message": message, "createdAt": now_str
                            }
                        })
                    except Exception as ex:
                        self._send_json(500, {"ok": False, "message": f"메시지 저장 실패: {str(ex)}"})
                return

            if self.path == "/api/db/test":
                if mode == "SQLITE":
                    conn = DatabaseAdapter.sqlite_connect(cfg)
                    conn.close()
                    self._send_json(200, {"ok": True, "message": "SQLite 3 파일 DB 연결이 확인되었습니다."})
                elif mode == "ORACLE":
                    conn = DatabaseAdapter.oracle_connect(cfg)
                    conn.close()
                    self._send_json(200, {"ok": True, "message": "Oracle DB 연결이 확인되었습니다."})
                elif mode == "EXCEL_ACCESS":
                    msg = DatabaseAdapter.excel_access_test(cfg)
                    self._send_json(200, {"ok": True, "message": msg})
                else:
                    self._send_json(200, {"ok": True, "message": "LOCAL 모드 확인 완료"})
            elif self.path == "/api/db/init":
                msg = DatabaseAdapter.sqlite_init(cfg)
                self._send_json(200, {"ok": True, "message": msg})
            elif self.path == "/api/db/save":
                msg = DatabaseAdapter.sqlite_save(cfg, req.get("data", {}))
                self._send_json(200, {"ok": True, "message": msg})
            elif self.path == "/api/db/load":
                data = DatabaseAdapter.sqlite_load(cfg)
                self._send_json(200, {"ok": True, "data": data})
            else:
                self._send_json(404, {"ok": False, "message": "알 수 없는 API 경로입니다."})
        except SecurityError as se:
            self._send_json(403, {"ok": False, "message": str(se)})
        except Exception as e:
            self._send_json(500, {"ok": False, "message": str(e)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AX Project Management by YS ver1.0.5 Secure Multi-DB Server")
    parser.add_argument("--port", type=int, default=8080, help="HTTP Server Port")
    parser.add_argument("--log-dir", type=str, default="logs", help="Directory for daily log files")
    parser.add_argument("--log-date", action="store_true", help="Enable date-based log file (logs/server_YYYYMMDD.log)")
    parser.add_argument("--silent", action="store_true", help="Suppress real-time console log display (logs to file only)")
    parser.add_argument("--no-console", action="store_true", help="Alias for --silent")
    args = parser.parse_args()

    LOG_DATE_MODE = args.log_date or bool(args.log_dir and args.silent)
    LOG_SILENT_MODE = args.silent or args.no_console
    LOG_DIR = BASE_DIR / args.log_dir if not pathlib.Path(args.log_dir).is_absolute() else pathlib.Path(args.log_dir)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), WbsHttpHandler)
    print("============================================================================")
    print(f"[AX Project Management by YS ver1.0.5] 다중 사용자 DB 연동 웹 서버가 시작되었습니다!")
    print(f"  * 웹 브라우저 접속 주소: http://127.0.0.1:{args.port}")
    print(f"  * 웹 루트 디렉터리 경로: {BASE_DIR}")
    print(f"  * SQLite DB 저장 폴더  : {DATA_DIR}")
    print("============================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[서버 종료] 사용자 요청으로 서버를 종료합니다.")
