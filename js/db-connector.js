// -------------------------------------------------------------
// [v1.0.6] 데이터베이스(DB) 연결 설정 관리자
//  - LOCAL      : 브라우저 LocalStorage 단독 모드 (실시간 자동저장)
//  - SQLITE / ORACLE / EXCEL_ACCESS : 다중 사용자 DB 서버(wbs_db_server.py) 모드
//      · 서버 로그인(토큰) 인증 필수
//      · 실시간 자동저장 없음 → 화면별 [💾 저장] / 상단 [💾 전체 저장] 버튼으로 저장
//      · 저장 시 다른 사용자의 선저장 데이터 충돌 감지 (SyncManager)
//  ※ 실제 저장/조회 로직은 js/data-store.js (SyncManager / ServerBackend) 가 담당합니다.
// -------------------------------------------------------------
const DbConnector = {
  CONFIG_STORAGE_KEY: "WBS_DB_CONNECTOR_CONFIG_2026_V1_1",

  config: {
    mode: "LOCAL", // LOCAL | SQLITE | ORACLE | EXCEL_ACCESS
    apiBaseUrl: "http://127.0.0.1:8080",
    connected: false,
    lastSyncTime: "-",
    sqlite: { filePath: "./data/wbs_enterprise.db", journalMode: "WAL", busyTimeout: 5000 },
    oracle: { connType: "SERVICE_NAME", host: "10.10.20.15", port: 1521, serviceOrSid: "ORCL", user: "WBS_ADMIN", password: "", tablePrefix: "TB_WBS_" },
    excelAccess: { subType: "ACCESS_ODBC", filePath: "./data/WBS_Database.accdb", odbcDriver: "Microsoft Access Driver (*.mdb, *.accdb)", lockTimeoutMs: 3000, readOnly: false }
  },

  DDL_SCRIPTS: {
    SQLITE: `-- [SQLite 3] AX_PMYS v1.0.6 표준 테이블 스키마 (WAL 동시성 모드 권장)
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

-- [v1.0.6] 데이터셋 원본(JSON) + 파티션별 리비전 (충돌 감지·권한 저장 기준 테이블)
CREATE TABLE IF NOT EXISTS TB_WBS_DATASET (
  DATA_KEY TEXT PRIMARY KEY,
  JSON_TEXT TEXT,
  PART_REVS_JSON TEXT,
  UPDATED_AT TEXT,
  UPDATED_BY TEXT
);

CREATE TABLE IF NOT EXISTS TB_WBS_CONFIG (
  PROJECT_ID TEXT PRIMARY KEY DEFAULT 'DEFAULT_PROJ',
  PROJECT_START_DATE TEXT NOT NULL,
  PROJECT_END_DATE TEXT NOT NULL,
  REPORT_DATE TEXT NOT NULL,
  WEEK_START_DAY INTEGER DEFAULT 1,
  THEME TEXT DEFAULT 'navy',
  HOLIDAYS_JSON TEXT,
  STD_DELIV_JSON TEXT,
  UPDATED_AT TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS TB_WBS_SUBSYSTEM (
  SUBSYSTEM_CODE TEXT PRIMARY KEY,
  SUBSYSTEM_NAME TEXT NOT NULL,
  PROJ_TYPE TEXT DEFAULT 'SDLC',
  WEIGHT REAL DEFAULT 10,
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
  OUTPUT_NOTE TEXT,
  UPDATED_AT TEXT DEFAULT (datetime('now','localtime'))
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
);`,

    ORACLE: `-- [Oracle Database 11g / 12c / 19c] AX_PMYS v1.0.6 표준 테이블 스키마
CREATE TABLE TB_WBS_CONFIG (
  PROJECT_ID VARCHAR2(50) DEFAULT 'DEFAULT_PROJ' PRIMARY KEY,
  PROJECT_START_DATE VARCHAR2(10) NOT NULL,
  PROJECT_END_DATE VARCHAR2(10) NOT NULL,
  REPORT_DATE VARCHAR2(10) NOT NULL,
  WEEK_START_DAY NUMBER(2) DEFAULT 1,
  THEME VARCHAR2(30) DEFAULT 'navy',
  HOLIDAYS_JSON CLOB,
  STD_DELIV_JSON CLOB,
  UPDATED_AT DATE DEFAULT SYSDATE
);

CREATE TABLE TB_WBS_SUBSYSTEM (
  SUBSYSTEM_CODE VARCHAR2(100) PRIMARY KEY,
  SUBSYSTEM_NAME VARCHAR2(200) NOT NULL,
  PROJ_TYPE VARCHAR2(20) DEFAULT 'SDLC',
  WEIGHT NUMBER(6,2) DEFAULT 10,
  PM_NAME VARCHAR2(100),
  DESCRIPTION VARCHAR2(1000),
  SORT_ORDER NUMBER(6) DEFAULT 0
);

CREATE TABLE TB_WBS_TASK (
  ROW_SEQ NUMBER(10) PRIMARY KEY,
  WBS_ID VARCHAR2(50) NOT NULL,
  LVL NUMBER(2) DEFAULT 1 NOT NULL,
  SUBSYSTEM_NAME VARCHAR2(200) NOT NULL,
  TASK_NAME VARCHAR2(500) NOT NULL,
  WEIGHT NUMBER(8,2) DEFAULT 1,
  REQ_ID VARCHAR2(100),
  PLAN_START VARCHAR2(10),
  PLAN_END VARCHAR2(10),
  ACT_START VARCHAR2(10),
  ACT_END VARCHAR2(10),
  PLAN_PROG NUMBER(6,2) DEFAULT 0,
  ACT_PROG NUMBER(6,2) DEFAULT 0,
  OUTPUT_NOTE VARCHAR2(500),
  UPDATED_AT DATE DEFAULT SYSDATE
);
CREATE INDEX IDX_WBS_TASK_SYS ON TB_WBS_TASK(SUBSYSTEM_NAME, ROW_SEQ);

CREATE TABLE TB_WBS_DELIVERABLE (
  DELIV_ID NUMBER(10) PRIMARY KEY,
  SUBMIT_ROUND VARCHAR2(30) NOT NULL,
  SUBSYSTEM_NAME VARCHAR2(200) NOT NULL,
  PHASE_NAME VARCHAR2(100),
  DELIV_NAME VARCHAR2(400) NOT NULL,
  PLAN_DATE VARCHAR2(10),
  ACT_DATE VARCHAR2(10),
  STATUS VARCHAR2(50) DEFAULT '작성전',
  MANAGER_NAME VARCHAR2(100),
  REMARKS VARCHAR2(1000)
);

CREATE TABLE TB_WBS_REQ (
  REQ_ID VARCHAR2(100) PRIMARY KEY,
  SUBSYSTEM_NAME VARCHAR2(200) NOT NULL,
  REQ_NAME VARCHAR2(500) NOT NULL,
  REQ_TYPE VARCHAR2(50) DEFAULT '기능',
  PRIORITY VARCHAR2(30) DEFAULT '중',
  ACCEPT_YN VARCHAR2(30) DEFAULT '수용',
  STATUS VARCHAR2(50) DEFAULT '착수전',
  SORT_ORDER NUMBER(6) DEFAULT 0
);

CREATE TABLE TB_WBS_VOC (
  VOC_ID VARCHAR2(100) PRIMARY KEY,
  SUBSYSTEM_NAME VARCHAR2(200) NOT NULL,
  PRIORITY VARCHAR2(30) DEFAULT '중',
  VOC_TITLE VARCHAR2(500) NOT NULL,
  REQUESTER VARCHAR2(100),
  REQ_DATE VARCHAR2(10),
  TARGET_DATE VARCHAR2(10),
  STATUS VARCHAR2(50) DEFAULT '착수전',
  ACTION_NOTE VARCHAR2(1000),
  SORT_ORDER NUMBER(6) DEFAULT 0
);`,

    EXCEL_ACCESS: `-- [MS Access (.accdb/.mdb) ODBC & MS Excel (.xlsx) DB] 스키마 정의
CREATE TABLE TB_WBS_CONFIG (
  PROJECT_ID VARCHAR(50) PRIMARY KEY,
  PROJECT_START_DATE VARCHAR(10),
  PROJECT_END_DATE VARCHAR(10),
  REPORT_DATE VARCHAR(10),
  WEEK_START_DAY INT,
  THEME VARCHAR(30),
  HOLIDAYS_JSON LONGTEXT,
  STD_DELIV_JSON LONGTEXT,
  UPDATED_AT VARCHAR(30)
);

CREATE TABLE TB_WBS_SUBSYSTEM (
  SUBSYSTEM_CODE VARCHAR(100) PRIMARY KEY,
  SUBSYSTEM_NAME VARCHAR(200),
  PROJ_TYPE VARCHAR(20),
  WEIGHT DOUBLE,
  PM_NAME VARCHAR(100),
  DESCRIPTION LONGTEXT,
  SORT_ORDER INT
);

CREATE TABLE TB_WBS_TASK (
  ROW_SEQ INT PRIMARY KEY,
  WBS_ID VARCHAR(50),
  LVL INT,
  SUBSYSTEM_NAME VARCHAR(200),
  TASK_NAME VARCHAR(255),
  WEIGHT DOUBLE,
  REQ_ID VARCHAR(100),
  PLAN_START VARCHAR(10),
  PLAN_END VARCHAR(10),
  ACT_START VARCHAR(10),
  ACT_END VARCHAR(10),
  PLAN_PROG DOUBLE,
  ACT_PROG DOUBLE,
  OUTPUT_NOTE VARCHAR(255)
);

CREATE TABLE TB_WBS_DELIVERABLE (
  DELIV_ID INT PRIMARY KEY,
  SUBMIT_ROUND VARCHAR(30),
  SUBSYSTEM_NAME VARCHAR(200),
  PHASE_NAME VARCHAR(100),
  DELIV_NAME VARCHAR(255),
  PLAN_DATE VARCHAR(10),
  ACT_DATE VARCHAR(10),
  STATUS VARCHAR(50),
  MANAGER_NAME VARCHAR(100),
  REMARKS LONGTEXT
);

CREATE TABLE TB_WBS_REQ (
  REQ_ID VARCHAR(100) PRIMARY KEY,
  SUBSYSTEM_NAME VARCHAR(200),
  REQ_NAME VARCHAR(255),
  REQ_TYPE VARCHAR(50),
  PRIORITY VARCHAR(30),
  ACCEPT_YN VARCHAR(30),
  STATUS VARCHAR(50),
  SORT_ORDER INT
);

CREATE TABLE TB_WBS_VOC (
  VOC_ID VARCHAR(100) PRIMARY KEY,
  SUBSYSTEM_NAME VARCHAR(200),
  PRIORITY VARCHAR(30),
  VOC_TITLE VARCHAR(255),
  REQUESTER VARCHAR(100),
  REQ_DATE VARCHAR(10),
  TARGET_DATE VARCHAR(10),
  STATUS VARCHAR(50),
  ACTION_NOTE LONGTEXT,
  SORT_ORDER INT
);`
  },

  init() {
    this.loadConfig();
    this.renderConfigForm();
    this.updateHeaderBadge();
  },

  isServerMode() {
    return this.config.mode !== "LOCAL";
  },

  // 서버 주소: http(s)로 접속한 경우 현재 접속 주소(origin)를 최우선 사용
  getApiBase() {
    if (typeof window !== "undefined" && window.location && /^https?:$/.test(window.location.protocol) && window.location.host) {
      return window.location.origin;
    }
    return String(this.config.apiBaseUrl || "http://127.0.0.1:8080").replace(/\/+$/, "");
  },

  loadConfig() {
    try {
      const raw = localStorage.getItem(this.CONFIG_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        delete saved.saveMode;
        this.config = Object.assign({}, this.config, saved);
        ["sqlite", "oracle", "excelAccess"].forEach(k => {
          if (saved[k]) this.config[k] = Object.assign({}, this.config[k], saved[k]);
        });
      }
    } catch (e) {}
  },

  saveConfig() {
    try {
      const copy = JSON.parse(JSON.stringify(this.config));
      // DB 접속 비밀번호는 브라우저 저장소에 평문 보관하지 않음
      if (copy.oracle) copy.oracle.password = "";
      localStorage.setItem(this.CONFIG_STORAGE_KEY, JSON.stringify(copy));
    } catch (e) {}
  },

  // 저장 모드 변경: 로컬 저장소 ↔ DB 서버 (변경 후 재로그인/재조회를 위해 화면을 다시 불러옴)
  selectMode(mode) {
    if (mode === this.config.mode) return;
    const go = () => {
      this.config.mode = mode;
      this.config.connected = false;
      this.saveConfig();
      if (typeof ServerBackend !== "undefined") ServerBackend.setToken("");
      showToast(mode === "LOCAL"
        ? "💻 로컬 저장소(LocalStorage) 단독 모드로 전환합니다. 실시간 자동저장이 활성화됩니다."
        : `🗄️ ${mode} DB 서버 모드로 전환합니다. 서버 로그인 후 저장 버튼으로 저장합니다.`);
      setTimeout(() => window.location.reload(), 600);
    };
    if (typeof SyncManager !== "undefined" && SyncManager.isDirty()) {
      openConfirmDialog("저장하지 않은 변경 내용이 있습니다. 저장소 모드를 전환하면 미저장 변경분은 사라집니다. 계속하시겠습니까?", go);
    } else {
      go();
    }
  },

  selectExcelAccessSubType(subType) {
    this.config.excelAccess.subType = subType;
    if (subType === "ACCESS_ODBC") {
      if (this.config.excelAccess.filePath.endsWith(".xlsx")) this.config.excelAccess.filePath = "./data/WBS_Database.accdb";
      this.config.excelAccess.odbcDriver = "Microsoft Access Driver (*.mdb, *.accdb)";
    } else {
      if (/\.(accdb|mdb)$/.test(this.config.excelAccess.filePath)) this.config.excelAccess.filePath = "./data/WBS_Shared_DB.xlsx";
      this.config.excelAccess.odbcDriver = "openpyxl / Microsoft Excel Driver (*.xls, *.xlsx)";
    }
    this.saveConfig();
    this.renderConfigForm();
  },

  readFormValues() {
    const getVal = id => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : "";
    };
    const apiInput = getVal("dbApiBaseUrl");
    if (apiInput) this.config.apiBaseUrl = apiInput.replace(/\/+$/, "");
    if (this.config.mode === "SQLITE") {
      this.config.sqlite.filePath = getVal("dbSqlitePath") || "./data/wbs_enterprise.db";
      this.config.sqlite.journalMode = getVal("dbSqliteJournal") || "WAL";
      this.config.sqlite.busyTimeout = parseInt(getVal("dbSqliteTimeout"), 10) || 5000;
    } else if (this.config.mode === "ORACLE") {
      this.config.oracle.connType = getVal("dbOracleConnType") || "SERVICE_NAME";
      this.config.oracle.host = getVal("dbOracleHost") || "127.0.0.1";
      this.config.oracle.port = parseInt(getVal("dbOraclePort"), 10) || 1521;
      this.config.oracle.serviceOrSid = getVal("dbOracleService") || "ORCL";
      this.config.oracle.user = getVal("dbOracleUser") || "WBS_ADMIN";
      this.config.oracle.password = getVal("dbOraclePassword");
      this.config.oracle.tablePrefix = getVal("dbOraclePrefix") || "TB_WBS_";
    } else if (this.config.mode === "EXCEL_ACCESS") {
      this.config.excelAccess.subType = getVal("dbExcelAccessSubType") || "ACCESS_ODBC";
      this.config.excelAccess.filePath = getVal("dbExcelAccessPath") || "./data/WBS_Database.accdb";
      this.config.excelAccess.odbcDriver = getVal("dbExcelAccessDriver") || "Microsoft Access Driver (*.mdb, *.accdb)";
      this.config.excelAccess.lockTimeoutMs = parseInt(getVal("dbExcelAccessLockTimeout"), 10) || 3000;
    }
    this.saveConfig();
  },

  renderConfigForm() {
    const mode = this.config.mode;
    ["LOCAL", "SQLITE", "ORACLE", "EXCEL_ACCESS"].forEach(m => {
      const btn = document.getElementById(`btnDbMode_${m}`);
      if (btn) btn.className = m === mode ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm";
      const panel = document.getElementById(`panelDbMode_${m}`);
      if (panel) panel.style.display = m === mode ? "block" : "none";
    });
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };
    setVal("dbApiBaseUrl", this.config.apiBaseUrl);
    setVal("dbSaveModeSelect", this.isServerMode() ? "MANUAL" : "AUTO");
    setVal("dbSqlitePath", this.config.sqlite.filePath);
    setVal("dbSqliteJournal", this.config.sqlite.journalMode);
    setVal("dbSqliteTimeout", this.config.sqlite.busyTimeout);
    setVal("dbOracleConnType", this.config.oracle.connType);
    setVal("dbOracleHost", this.config.oracle.host);
    setVal("dbOraclePort", this.config.oracle.port);
    setVal("dbOracleService", this.config.oracle.serviceOrSid);
    setVal("dbOracleUser", this.config.oracle.user);
    setVal("dbOraclePassword", this.config.oracle.password);
    setVal("dbOraclePrefix", this.config.oracle.tablePrefix);
    setVal("dbExcelAccessSubType", this.config.excelAccess.subType);
    setVal("dbExcelAccessPath", this.config.excelAccess.filePath);
    setVal("dbExcelAccessDriver", this.config.excelAccess.odbcDriver);
    setVal("dbExcelAccessLockTimeout", this.config.excelAccess.lockTimeoutMs);

    const ddlBox = document.getElementById("dbDdlPreviewBox");
    if (ddlBox) {
      ddlBox.value = mode === "LOCAL"
        ? "-- [LOCAL 모드] 브라우저 내부 LocalStorage(JSON)를 사용하므로 별도 DB 테이블 생성이 필요하지 않습니다."
        : (this.DDL_SCRIPTS[mode] || "");
    }
    const summaryEl = document.getElementById("dbConnectionSummaryText");
    if (summaryEl) summaryEl.innerHTML = this.getConnectionSummaryHtml();
  },

  getConnectionSummaryHtml() {
    const m = this.config.mode;
    const saveModeBadge = this.isServerMode()
      ? `<span class="status-tag tag-hold">🖐️ 저장 버튼 저장 (화면별 [💾 저장] / 상단 [💾 전체 저장])</span>`
      : `<span class="status-tag tag-progress">⚡ 실시간 자동저장 (로컬 저장소)</span>`;
    const statusBadge = this.config.connected
      ? `<span class="status-tag tag-completed">🟢 DB 서버 연결됨 (${escapeHtml(this.getApiBase())})</span>`
      : `<span class="status-tag tag-ready">⚪ 연결 대기</span>`;
    if (m === "LOCAL") return `<b>현재 모드:</b> 브라우저 내장 LocalStorage 단독 모드 | ${saveModeBadge}`;
    let target = "";
    if (m === "SQLITE") target = `SQLite 3 (<code>${escapeHtml(this.config.sqlite.filePath)}</code>)`;
    if (m === "ORACLE") target = `Oracle DB (<code>${escapeHtml(this.config.oracle.host)}:${this.config.oracle.port}/${escapeHtml(this.config.oracle.serviceOrSid)}</code>)`;
    if (m === "EXCEL_ACCESS") target = `${this.config.excelAccess.subType === "ACCESS_ODBC" ? "MS Access (.accdb)" : "MS Excel (.xlsx)"} (<code>${escapeHtml(this.config.excelAccess.filePath)}</code>)`;
    return `<b>현재 모드:</b> ${target} | ${statusBadge} | ${saveModeBadge} | 최근 동기화: <b>${escapeHtml(this.config.lastSyncTime)}</b>`;
  },

  updateHeaderBadge() {
    const badge = document.getElementById("headerDbStatusBadge");
    if (badge) {
      const m = this.config.mode;
      const names = { LOCAL: "LocalStorage", SQLITE: "SQLite", ORACLE: "Oracle", EXCEL_ACCESS: this.config.excelAccess.subType === "ACCESS_ODBC" ? "Access" : "Excel DB" };
      const label = names[m] || m;
      if (m === "LOCAL") {
        badge.className = "status-badge-chip chip-ready";
        badge.innerText = `🗄️ DB: ${label}`;
      } else if (this.config.connected) {
        badge.className = "status-badge-chip chip-completed";
        badge.innerText = `🟢 DB: ${label}`;
      } else {
        badge.className = "status-badge-chip chip-hold";
        badge.innerText = `🟡 DB: ${label}(대기)`;
      }
    }
    const summaryEl = document.getElementById("dbConnectionSummaryText");
    if (summaryEl) summaryEl.innerHTML = this.getConnectionSummaryHtml();
  },

  setConnected(ok) {
    this.config.connected = !!ok;
    if (ok) this.config.lastSyncTime = new Date().toLocaleTimeString();
    this.saveConfig();
    this.updateHeaderBadge();
  },

  async testConnection() {
    this.readFormValues();
    if (!this.isServerMode()) {
      showToast("브라우저 내장 LocalStorage 단독 모드입니다. (서버 연결 불필요)");
      return;
    }
    const res = await ServerBackend.request("/api/db/test", { config: this.config });
    if (res.ok) {
      this.setConnected(true);
      showToast(`🟢 [DB 서버 연결 성공] ${res.message || ""} (${this.getApiBase()})`);
    } else {
      this.setConnected(false);
      showToast(`❌ [DB 서버 연결 실패] ${res.message || ""} — run_server.bat 실행 여부와 서버 주소(${this.getApiBase()})를 확인하세요.`);
    }
  },

  async initSchema() {
    this.readFormValues();
    if (!this.isServerMode()) {
      showToast("LOCAL 모드는 별도 DB 스키마 생성이 필요하지 않습니다.");
      return;
    }
    const res = await ServerBackend.request("/api/db/init", { config: this.config });
    showToast(res.ok ? `[스키마 확인 완료] ${res.message || ""}` : `❌ 스키마 생성 실패: ${res.message || ""}`);
  },

  // 기존 버튼 호환: [📤 DB 저장] / [📥 DB 불러오기]
  saveToDb(showAlert = true) { return SyncManager.save(null, { notify: showAlert, forceFile: true }); },
  loadFromDb() { return SyncManager.refresh(null); },

  downloadDdlScript() {
    const m = this.config.mode === "LOCAL" ? "SQLITE" : this.config.mode;
    const sql = this.DDL_SCRIPTS[m] || this.DDL_SCRIPTS.SQLITE;
    const blob = new Blob([sql], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AX_PMYS_Schema_${m}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`[AX_PMYS_Schema_${m}.sql] 스키마 스크립트 파일이 다운로드되었습니다.`);
  }
};
