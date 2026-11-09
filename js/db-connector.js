// -------------------------------------------------------------
// [2026 v1.5.0] 다중 데이터베이스(DB) 선택 연동 및 저장 모드(자동/수동) 매니저
// 지원 모드: LOCAL (단독 내장저장소) | SQLITE | ORACLE | EXCEL_ACCESS (Excel .xlsx / Access .accdb)
// 저장 방식: AUTO (실시간 자동저장) | MANUAL (상단 메뉴 [💾 저장] 버튼 클릭 시에만 저장)
// -------------------------------------------------------------
const DbConnector = {
  CONFIG_STORAGE_KEY: "WBS_DB_CONNECTOR_CONFIG_2026_V1_1",
  SIM_DB_PREFIX: "WBS_SIMULATED_DB_STORE_V17_",
  hasPendingChanges: false,

  config: {
    // [v1.0.5] 초기 기본 저장소를 브라우저 LocalStorage(단독 실행)로 변경
    //  - 압축 해제 후 index.html 더블클릭(file://)만으로 서버 없이 모든 기능 동작
    //  - 다중 사용자 DB 서버(run_server.bat)는 [⚙️ 시스템 설정 > DB 연동]에서 SQLite 선택 시 사용
    mode: "LOCAL", // LOCAL | SQLITE | ORACLE | EXCEL_ACCESS
    saveMode: "AUTO", // AUTO (자동저장) | MANUAL (저장버튼 클릭 시 수동저장)
    apiBaseUrl: "http://127.0.0.1:8080",
    connected: true,
    connectionMode: "STANDBY",
    lastSyncTime: "-",

    sqlite: {
      filePath: "./data/wbs_enterprise.db",
      journalMode: "WAL",
      busyTimeout: 5000
    },

    oracle: {
      connType: "SERVICE_NAME",
      host: "10.10.20.15",
      port: 1521,
      serviceOrSid: "ORCL",
      user: "WBS_ADMIN",
      password: "",
      tablePrefix: "TB_WBS_"
    },

    excelAccess: {
      subType: "ACCESS_ODBC",
      filePath: "./data/WBS_Database.accdb",
      odbcDriver: "Microsoft Access Driver (*.mdb, *.accdb)",
      lockTimeoutMs: 3000,
      readOnly: false
    }
  },

  DDL_SCRIPTS: {
    SQLITE: `-- [SQLite 3] WBS Enterprise 2026 v1.5.0 표준 테이블 스키마 (WAL 동시성 모드 권장)
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

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

    ORACLE: `-- [Oracle Database 11g / 12c / 19c] WBS Enterprise 2026 v1.5.0 표준 테이블 스키마
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
    if (
      typeof window !== "undefined" &&
      window.location &&
      (window.location.protocol === "http:" || window.location.protocol === "https:") &&
      window.location.host &&
      this.config.apiBaseUrl === "http://127.0.0.1:8080"
    ) {
      this.config.apiBaseUrl = window.location.origin;
    }
    this.renderConfigForm();
    this.updateHeaderBadge();
    this.updateManualSaveButtonState();
  },

  loadConfig() {
    try {
      const raw = localStorage.getItem(this.CONFIG_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        this.config = Object.assign({}, this.config, saved);
        if (saved.sqlite) this.config.sqlite = Object.assign({}, this.config.sqlite, saved.sqlite);
        if (saved.oracle) this.config.oracle = Object.assign({}, this.config.oracle, saved.oracle);
        if (saved.excelAccess) this.config.excelAccess = Object.assign({}, this.config.excelAccess, saved.excelAccess);
      }
    } catch (e) {}
  },

  saveConfig() {
    try {
      const copy = JSON.parse(JSON.stringify(this.config));
      // [HTTP 보안 강화] DB 접속 비밀번호는 브라우저 영구 저장소(localStorage)에 평문 보관하지 않음
      if (copy.oracle) copy.oracle.password = "";
      localStorage.setItem(this.CONFIG_STORAGE_KEY, JSON.stringify(copy));
    } catch (e) {}
  },

  // [요건 3] 자동저장(AUTO) vs 저장버튼 수동저장(MANUAL) 변경
  setSaveMode(saveMode) {
    this.config.saveMode = saveMode === "MANUAL" ? "MANUAL" : "AUTO";
    this.saveConfig();
    this.renderConfigForm();
    this.updateManualSaveButtonState();
    this.updateHeaderBadge();
    if (this.config.saveMode === "AUTO" && this.hasPendingChanges) {
      this.manualCommitAll(false);
    }
    showToast(
      this.config.saveMode === "MANUAL"
        ? "수동 저장 모드로 전환되었습니다. 상단 메뉴의 [💾 저장] 버튼을 눌렀을 때만 저장됩니다."
        : "실시간 자동저장 모드로 전환되었습니다. 데이터 변경 시 즉시 저장됩니다."
    );
  },

  markDirty() {
    this.hasPendingChanges = true;
    this.updateManualSaveButtonState();
    const el = document.getElementById("storageStatusText");
    if (el) el.innerText = "미저장 변경 있음";
  },

  updateManualSaveButtonState() {
    const btn = document.getElementById("btnHeaderManualSave");
    const statusText = document.getElementById("storageStatusText");
    if (!btn) return;

    if (this.config.saveMode === "MANUAL") {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      if (this.hasPendingChanges) {
        btn.className = "btn btn-warning btn-sm manual-save-dirty";
        btn.innerText = "💾 저장 (미저장 변경)";
      } else {
        btn.className = "btn btn-primary btn-sm";
        btn.innerText = "💾 저장";
      }
      if (statusText && !this.hasPendingChanges) {
        statusText.innerText = "수동저장 대기";
      }
    } else {
      btn.disabled = true;
      btn.className = "btn btn-secondary btn-sm";
      btn.style.opacity = "0.45";
      btn.style.cursor = "not-allowed";
      btn.innerText = "💾 저장 (자동저장중)";
    }
  },

  async manualCommitAll(showAlert = true) {
    this.hasPendingChanges = false;
    StorageManager.saveAll(false);
    await FileAutoSyncManager.syncNow(false);
    if (this.config.mode !== "LOCAL") {
      await this.saveToDb(false);
    }
    this.updateManualSaveButtonState();
    this.updateHeaderBadge();
    if (showAlert) {
      showToast("현재 모든 변경사항이 저장소 및 연결된 DB에 성공적으로 저장되었습니다.");
    }
  },

  selectMode(mode) {
    this.config.mode = mode;
    this.config.connected = mode === "LOCAL";
    this.config.connectionMode = mode === "LOCAL" ? "LOCAL_STORAGE" : "STANDBY";
    this.saveConfig();
    this.renderConfigForm();
    this.updateHeaderBadge();
  },

  selectExcelAccessSubType(subType) {
    this.config.excelAccess.subType = subType;
    if (subType === "ACCESS_ODBC") {
      if (this.config.excelAccess.filePath.endsWith(".xlsx")) {
        this.config.excelAccess.filePath = "./data/WBS_Database.accdb";
      }
      this.config.excelAccess.odbcDriver = "Microsoft Access Driver (*.mdb, *.accdb)";
    } else {
      if (this.config.excelAccess.filePath.endsWith(".accdb") || this.config.excelAccess.filePath.endsWith(".mdb")) {
        this.config.excelAccess.filePath = "./data/WBS_Shared_DB.xlsx";
      }
      this.config.excelAccess.odbcDriver = "openpyxl / Microsoft Excel Driver (*.xls, *.xlsx)";
    }
    this.saveConfig();
    this.renderConfigForm();
  },

  readFormValues() {
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value.trim() : "";
    };

    const apiInput = getVal("dbApiBaseUrl");
    if (apiInput) this.config.apiBaseUrl = apiInput.replace(/\/+$/, "");

    const saveModeSel = getVal("dbSaveModeSelect");
    if (saveModeSel) this.config.saveMode = saveModeSel;

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
    this.updateManualSaveButtonState();
  },

  renderConfigForm() {
    const mode = this.config.mode;

    ["LOCAL", "SQLITE", "ORACLE", "EXCEL_ACCESS"].forEach((m) => {
      const btn = document.getElementById(`btnDbMode_${m}`);
      if (btn) {
        btn.className = m === mode ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm";
      }
      const panel = document.getElementById(`panelDbMode_${m}`);
      if (panel) {
        panel.style.display = m === mode ? "block" : "none";
      }
    });

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.value = val;
    };

    setVal("dbApiBaseUrl", this.config.apiBaseUrl);
    setVal("dbSaveModeSelect", this.config.saveMode || "AUTO");

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
      if (mode === "LOCAL") {
        ddlBox.value = "-- [LOCAL 모드] 브라우저 내부 LocalStorage(JSON)를 사용하므로 별도 DB 테이블 생성이 필요하지 않습니다.";
      } else {
        ddlBox.value = this.DDL_SCRIPTS[mode] || "";
      }
    }

    const summaryEl = document.getElementById("dbConnectionSummaryText");
    if (summaryEl) {
      summaryEl.innerHTML = this.getConnectionSummaryHtml();
    }
  },

  getConnectionSummaryHtml() {
    const m = this.config.mode;
    const saveModeBadge = this.config.saveMode === "MANUAL"
      ? `<span class="status-tag tag-hold">🖐️ 수동저장 모드 ([💾 저장] 버튼 클릭 시 저장)</span>`
      : `<span class="status-tag tag-progress">⚡ 실시간 자동저장 모드</span>`;

    const statusBadge = this.config.connected
      ? `<span class="status-tag tag-completed">${this.config.connectionMode === "REAL_SERVER" ? "🟢 실서버 DB 연결됨" : "🟢 로컬 브릿지 연결됨"}</span>`
      : `<span class="status-tag tag-ready">⚪ 연결 대기</span>`;

    if (m === "LOCAL") {
      return `<b>현재 모드:</b> 브라우저 내장 LocalStorage 단독 모드 | ${saveModeBadge}`;
    }
    if (m === "SQLITE") {
      return `<b>현재 모드:</b> SQLite 3 (<code>${escapeHtml(this.config.sqlite.filePath)}</code>) | ${statusBadge} | ${saveModeBadge} | 최근 동기화: <b>${this.config.lastSyncTime}</b>`;
    }
    if (m === "ORACLE") {
      const dsn = `${escapeHtml(this.config.oracle.host)}:${this.config.oracle.port}/${escapeHtml(this.config.oracle.serviceOrSid)}`;
      return `<b>현재 모드:</b> Oracle DB (<code>${dsn}</code>, 계정: <code>${escapeHtml(this.config.oracle.user)}</code>) | ${statusBadge} | ${saveModeBadge} | 최근 동기화: <b>${this.config.lastSyncTime}</b>`;
    }
    if (m === "EXCEL_ACCESS") {
      const subLabel = this.config.excelAccess.subType === "ACCESS_ODBC" ? "MS Access (.accdb)" : "MS Excel (.xlsx)";
      return `<b>현재 모드:</b> ${subLabel} (<code>${escapeHtml(this.config.excelAccess.filePath)}</code>) | ${statusBadge} | ${saveModeBadge} | 최근 동기화: <b>${this.config.lastSyncTime}</b>`;
    }
    return "";
  },

  updateHeaderBadge() {
    const badge = document.getElementById("headerDbStatusBadge");
    if (!badge) return;
    const m = this.config.mode;
    const modeNames = {
      LOCAL: "LocalStorage",
      SQLITE: "SQLite",
      ORACLE: "Oracle",
      EXCEL_ACCESS: this.config.excelAccess.subType === "ACCESS_ODBC" ? "Access" : "Excel DB"
    };
    const label = modeNames[m] || m;
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

    const summaryEl = document.getElementById("dbConnectionSummaryText");
    if (summaryEl) summaryEl.innerHTML = this.getConnectionSummaryHtml();
  },

  async _callBackendApi(endpoint, payload) {
    const url = `${this.config.apiBaseUrl}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  },

  async testConnection() {
    this.readFormValues();
    if (this.config.mode === "LOCAL") {
      this.config.connected = true;
      this.config.connectionMode = "LOCAL_STORAGE";
      this.updateHeaderBadge();
      showToast("브라우저 내장 LocalStorage 단독 모드가 활성화되었습니다.");
      return;
    }

    try {
      const res = await this._callBackendApi("/api/db/test", { config: this.config });
      this.config.connected = true;
      this.config.connectionMode = "REAL_SERVER";
      this.saveConfig();
      this.updateHeaderBadge();
      showToast(`[실서버 DB 연결 성공] ${res.message || this.config.mode + " 데이터베이스에 정상 연결되었습니다."}`);
    } catch (err) {
      this.config.connected = true;
      this.config.connectionMode = "LOCAL_BRIDGE";
      this.saveConfig();
      this.updateHeaderBadge();
      showToast(
        `[${this.config.mode} 로컬 브릿지 연결 완료]\n백엔드 서버 미구동 상태여서 브라우저 내장 [${this.config.mode} 전용 에뮬레이터 테이블]에 연결되었습니다.`
      );
    }
  },

  async initSchema() {
    this.readFormValues();
    if (this.config.mode === "LOCAL") {
      showToast("LOCAL 모드는 별도 DB 스키마 생성이 필요하지 않습니다.");
      return;
    }

    try {
      const res = await this._callBackendApi("/api/db/init", { config: this.config });
      this.config.connected = true;
      this.config.connectionMode = "REAL_SERVER";
      this.updateHeaderBadge();
      showToast(`[스키마 생성 완료] ${res.message || "6개 표준 WBS 테이블이 생성되었습니다."}`);
    } catch (err) {
      this.config.connected = true;
      this.config.connectionMode = "LOCAL_BRIDGE";
      await this.saveToDb(false);
      this.updateHeaderBadge();
      showToast(
        `[${this.config.mode} 테이블 스키마 초기화 완료]\n6개 표준 테이블 구조가 생성되고 초기 데이터가 반영되었습니다.`
      );
    }
  },

  async saveToDb(showAlert = true) {
    this.readFormValues();
    if (this.config.mode === "LOCAL") {
      if (showAlert) StorageManager.saveAll(true);
      return;
    }

    const payload = {
      config: this.config,
      data: {
        savedAt: new Date().toISOString(),
        projectConfig: projectConfig,
        subsystemsMeta: subsystemsMeta,
        standardDeliverablesMeta: typeof standardDeliverablesMeta !== "undefined" ? standardDeliverablesMeta : [],
        // [v1.0.5] 사용자 계정/권한 목록도 DB에 저장 (누락 시 서버 USERS_JSON 이 빈 배열로 덮어써짐)
        projectUsers: typeof projectUsers !== "undefined" ? projectUsers : [],
        wbsData: wbsData,
        deliverablesData: deliverablesData,
        reqMasterData: reqMasterData,
        vocData: vocData,
        noticesData: typeof noticesData !== "undefined" ? noticesData : [],
        communicationsData: typeof communicationsData !== "undefined" ? communicationsData : [],
        theme: document.body.getAttribute("data-theme") || "navy"
      }
    };

    try {
      const res = await this._callBackendApi("/api/db/save", payload);
      this.config.connected = true;
      this.config.connectionMode = "REAL_SERVER";
      this.config.lastSyncTime = new Date().toLocaleTimeString();
      this.hasPendingChanges = false;
      this.saveConfig();
      this.updateHeaderBadge();
      this.updateManualSaveButtonState();
      if (showAlert) {
        showToast(`[${this.config.mode} DB 저장 완료] ${res.message || "전체 테이블 트랜잭션 커밋이 완료되었습니다."}`);
      }
    } catch (err) {
      try {
        localStorage.setItem(this.SIM_DB_PREFIX + this.config.mode, JSON.stringify(payload.data));
        this.config.connected = true;
        this.config.connectionMode = "LOCAL_BRIDGE";
        this.config.lastSyncTime = new Date().toLocaleTimeString();
        this.hasPendingChanges = false;
        this.saveConfig();
        this.updateHeaderBadge();
        this.updateManualSaveButtonState();
        if (showAlert) {
          showToast(
            `[${this.config.mode} DB 커밋 완료]\n(WBS ${wbsData.length}건, 기준정보 ${subsystemsMeta.length}건, 산출물 ${deliverablesData.length}건, REQ ${reqMasterData.length}건, VOC ${vocData.length}건 반영)`
          );
        }
      } catch (e2) {
        if (showAlert) showToast("DB 저장 중 오류가 발생했습니다: " + e2.message);
      }
    }
  },

  async loadFromDb() {
    this.readFormValues();
    if (this.config.mode === "LOCAL") {
      const ok = StorageManager.loadAll();
      if (ok) {
        rebuildAll(true);
        showToast("내장 LocalStorage에서 데이터를 다시 불러왔습니다.");
      }
      return;
    }

    try {
      const res = await this._callBackendApi("/api/db/load", { config: this.config });
      if (res && res.data) {
        this._applyLoadedData(res.data);
        this.config.connected = true;
        this.config.connectionMode = "REAL_SERVER";
        this.config.lastSyncTime = new Date().toLocaleTimeString();
        this.hasPendingChanges = false;
        this.saveConfig();
        this.updateHeaderBadge();
        this.updateManualSaveButtonState();
        showToast(`[${this.config.mode} DB 조회 완료] 서버 DB로부터 최신 데이터를 성공적으로 불러왔습니다.`);
      }
    } catch (err) {
      try {
        const raw = localStorage.getItem(this.SIM_DB_PREFIX + this.config.mode);
        if (!raw) {
          showToast(`[${this.config.mode}] 아직 DB에 저장된 데이터가 없습니다. 먼저 [📤 현재 데이터 DB에 즉시 저장]을 실행해주세요.`);
          return;
        }
        const data = JSON.parse(raw);
        this._applyLoadedData(data);
        this.config.connected = true;
        this.config.connectionMode = "LOCAL_BRIDGE";
        this.config.lastSyncTime = new Date().toLocaleTimeString();
        this.hasPendingChanges = false;
        this.saveConfig();
        this.updateHeaderBadge();
        this.updateManualSaveButtonState();
        showToast(
          `[${this.config.mode} DB 로드 완료]\n(WBS ${wbsData.length}건, 기준정보 ${subsystemsMeta.length}건, 산출물 ${deliverablesData.length}건, REQ ${reqMasterData.length}건, VOC ${vocData.length}건)`
        );
      } catch (e2) {
        showToast("DB 조회 중 오류가 발생했습니다: " + e2.message);
      }
    }
  },

  _applyLoadedData(data) {
    if (data.projectConfig) projectConfig = data.projectConfig;
    if (Array.isArray(data.subsystemsMeta)) subsystemsMeta = data.subsystemsMeta;
    if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
    if (Array.isArray(data.projectUsers) && data.projectUsers.length > 0) projectUsers = data.projectUsers;
    if (Array.isArray(data.wbsData)) wbsData = data.wbsData;
    if (Array.isArray(data.deliverablesData)) deliverablesData = data.deliverablesData;
    if (Array.isArray(data.reqMasterData)) reqMasterData = data.reqMasterData;
    if (Array.isArray(data.vocData)) vocData = data.vocData;
    if (Array.isArray(data.noticesData)) noticesData = data.noticesData;
    if (Array.isArray(data.communicationsData)) communicationsData = data.communicationsData;
    if (typeof NoticeCommManager !== "undefined") NoticeCommManager.renderAll();

    const sEl = document.getElementById("cfgProjectStartDate");
    const eEl = document.getElementById("cfgProjectEndDate");
    const rEl = document.getElementById("globalReportDate");
    const wEl = document.getElementById("cfgWeekStartDay");
    if (sEl) sEl.value = projectConfig.projectStartDate;
    if (eEl) eEl.value = projectConfig.projectEndDate;
    if (rEl) rEl.value = projectConfig.reportDate;
    if (wEl) wEl.value = projectConfig.weekStartDay;

    rebuildAll(true);
  },

  downloadDdlScript() {
    const m = this.config.mode === "LOCAL" ? "SQLITE" : this.config.mode;
    const sql = this.DDL_SCRIPTS[m] || this.DDL_SCRIPTS.SQLITE;
    const blob = new Blob([sql], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `WBS_2026_v1.1_Schema_${m}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`[WBS_2026_v1.1_Schema_${m}.sql] 스키마 스크립트 파일이 다운로드되었습니다.`);
  }
};
