// [IOSTAR-PM] 업무 데이터 변수 · 초기 데이터 · 실행 방식 확인 · 시작(AppBoot)
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
var meetingsData = [];
let wbsData = [];

let deliverablesData = [];

let reqMasterData = [];

let vocData = [];

// [ver1.0.4 신규] 프로젝트 인력을 위한 공지사항(Notices) 및 팀원 소통(Communications) 데이터
let noticesData = [];

let communicationsData = [];
// [v2.4.0] 사용자별 할 일 (TodoCenter) — 행: { id, owner, kind: "todo"|"hide", title, due, priority, link, done, ... }
var todosData = [];

// -------------------------------------------------------------
// [v1.0.5 신규] 최초 실행 초기 데이터(JSON) 로더
//  - 원본: data/initial_data.json  (편집 후 tools/build_initial_data.py 로 js/initial-data.js 재생성)
//  - file:// 환경은 브라우저 보안상 JSON 파일을 fetch 할 수 없으므로 js/initial-data.js 에
//    동일 내용을 window.AX_INITIAL_DATA 로 내장하여 로드
//  - LocalStorage 에 저장 데이터가 없을 때(최초 실행 / 전체 초기화 후)에만 적용 후 즉시 LocalStorage 저장
// -------------------------------------------------------------
var InitialDataLoader = {
  appliedFromInitial: false,

  apply() {
    const data = (typeof window !== "undefined") ? window.AX_INITIAL_DATA : null;
    if (!data || typeof data !== "object") return false;
    try {
      const clone = JSON.parse(JSON.stringify(data));
      if (clone.projectConfig) projectConfig = Object.assign({}, projectConfig, clone.projectConfig);
      if (Array.isArray(clone.subsystemsMeta)) subsystemsMeta = clone.subsystemsMeta;
      if (Array.isArray(clone.standardDeliverablesMeta)) standardDeliverablesMeta = clone.standardDeliverablesMeta;
      if (Array.isArray(clone.projectUsers) && clone.projectUsers.length > 0) DataRegistry.set("projectUsers", clone.projectUsers);
      if (Array.isArray(clone.wbsData)) wbsData = clone.wbsData;
      if (Array.isArray(clone.deliverablesData)) deliverablesData = clone.deliverablesData;
      if (Array.isArray(clone.reqMasterData)) reqMasterData = clone.reqMasterData;
      if (Array.isArray(clone.vocData)) vocData = clone.vocData;
      if (Array.isArray(clone.noticesData)) noticesData = clone.noticesData;
      if (Array.isArray(clone.communicationsData)) communicationsData = clone.communicationsData;
      if (Array.isArray(clone.meetingsData)) meetingsData = clone.meetingsData;
      if (Array.isArray(clone.weeklyReportsData)) weeklyReportsData = clone.weeklyReportsData;
      if (Array.isArray(clone.todosData)) todosData = clone.todosData;
      if (clone.theme) {
        clone.theme = normalizeTheme(clone.theme);
        document.body.setAttribute("data-theme", clone.theme);
        const sel = document.getElementById("themeSelector");
        if (sel) sel.value = clone.theme;
      }
      this.appliedFromInitial = true;
      return true;
    } catch (e) {
      console.error("초기 데이터(JSON) 적용 실패:", e);
      return false;
    }
  }
};
window.InitialDataLoader = InitialDataLoader;

// =============================================================================
// [v1.0.8] 접속 방식 안내 (ModeGuard) — [Workgroup 0.4] 서버 DB 만
//  - 서버 주소(http://IP:8080)로 접속 + 로컬 저장소 모드 → "서버 DB 모드로 전환하시겠습니까?"
//      · 이 브라우저에서 저장소 모드를 한 번도 고른 적이 없으면 서버 DB 모드를 기본값으로 사용
//  - index.html 파일을 직접 열어 접속(file://) → 로컬 저장소 모드로 실행하고 서버 주소 접속 방법 안내
// =============================================================================
var ModeGuard = {
  accessType() {
    const p = window.location.protocol;
    return p === "http:" || p === "https:" ? "SERVER_URL" : "FILE";
  },

  async pingServer() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(window.location.origin + "/api/db/ping", { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return false;
      const json = await res.json().catch(() => ({}));
      return !!json.ok;
    } catch (e) {
      clearTimeout(timer);
      return false;
    }
  },

  _hasSavedChoice() {
    try { return !!localStorage.getItem(DbConnector.CONFIG_STORAGE_KEY); } catch (e) { return false; }
  },

  _setMode(mode) {
    DbConnector.config.mode = mode;
    DbConnector.config.connected = false;
    DbConnector.saveConfig();
    DbConnector.renderConfigForm();
    DbConnector.updateHeaderBadge();
  },

  // [Workgroup 0.4] 서버 DB 만 — 로컬 저장소 모드 없음 (서버 없이 쓰려면 IOSTAR-PM Standalone)
  async check() {
    if (DbConnector.config.mode !== "SQLITE") this._setMode("SQLITE");
    if (this.accessType() === "FILE") {
      this.loginNotice = "<div>📁 index.html 파일을 직접 열었습니다. Workgroup 은 서버 판이라 서버 주소(예: http://서버IP:8080)로 접속해야 합니다.</div>" +
        "<div>서버 없이 쓰려면 IOSTAR-PM Standalone 을 쓰세요.</div>";
      await SyncUI.ask("🗄️ 서버 주소로 접속하세요",
        "Workgroup 은 서버 DB 를 함께 쓰는 판입니다. 파일로 직접 열면 동작하지 않습니다.\n" +
        "서버 PC 에서 run_server.bat 을 실행한 뒤, 브라우저 주소창에 http://서버IP:8080 으로 접속하세요.\n\n" +
        "서버 없이 혼자 · 파일로 쓰려면 IOSTAR-PM Standalone 을 쓰세요.",
        [{ id: "ok", label: "확인", cls: "btn-primary" }]);
      return;
    }
    const alive = await this.pingServer();
    if (!alive) this.loginNotice = "⚠️ DB 서버가 응답하지 않습니다. 서버가 켜져 있는지 확인한 뒤 화면을 다시 불러오세요.";
  }
};
window.ModeGuard = ModeGuard;

// [Workgroup 0.4] 새 버전 안내 — 주기적으로 묻지 않고, 화면을 열 때 · 창으로 돌아올 때(최소 10분 간격)만 서버 버전을 확인
var VersionWatch = {
  KEY: "IOSTAR_WG_APP_VERSION",
  _last: 0, _shown: false,
  init() {
    let prev = null;
    try { prev = localStorage.getItem(this.KEY); localStorage.setItem(this.KEY, APP_VERSION.version); } catch (e) {}
    if (prev && prev !== APP_VERSION.version) setTimeout(() => showToast(`🆕 ${APP_VERSION.product} v${APP_VERSION.version} 로 바뀌었습니다 (이전 v${prev}). 자료는 서버 DB 에 그대로 있습니다.`), 1500);
    window.addEventListener("focus", () => this.check());
  },
  async check() {
    if (this._shown || Date.now() - this._last < 600000) return;
    this._last = Date.now();
    try {
      const r = await fetch(window.location.origin + "/api/db/ping", { cache: "no-store" });
      const j = await r.json();
      if (j && j.version && j.version !== APP_VERSION.version) {
        this._shown = true;
        showToast(`🆕 서버가 새 버전(v${j.version})으로 바뀌었습니다. 저장한 뒤 화면을 새로고침(F5)하세요.`);
      }
    } catch (e) {}
  }
};
window.VersionWatch = VersionWatch;

// =============================================================================
// [v1.0.8] 서버 연결 감시 (DB 서버 모드): 20초마다 서버 응답 확인
//  - 끊기면 상단 경고 배너 표시 + 저장 버튼 비활성화, 다시 연결되면 자동 해제
// =============================================================================
var ServerHeartbeat = {
  INTERVAL_MS: 20000,
  online: true,
  timer: null,

  // [Workgroup] app.ini [features] server_heartbeat=0 이면 주기 확인 없음 — 저장 · 불러오기 실패 때 setOnline(false)
  start() {
    if (typeof Features !== "undefined" && !Features.on("server_heartbeat")) return;
    if (SyncManager.isLocal() || this.timer) return;
    this.timer = setInterval(() => this.check(), this.INTERVAL_MS);
  },

  async check() {
    const res = await ServerBackend.request("/api/db/ping", null, "GET", 4000);
    this.setOnline(!!res.ok);
  },

  setOnline(ok) {
    if (ok === this.online) return;
    this.online = ok;
    let bar = document.getElementById("serverOfflineBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "serverOfflineBar";
      bar.className = "server-offline-bar";
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.style.display = ok ? "none" : "block";
    bar.innerHTML = "🔌 <b>DB 서버 연결이 끊겼습니다.</b> 지금 입력하는 내용은 저장되지 않고 화면에만 남습니다. 서버가 다시 켜지면 자동으로 연결되며, 그때 [💾 전체 저장]을 눌러 주세요.";
    document.querySelectorAll("#btnHeaderSaveAll, .sync-toolbar button[data-btn='save'], .sync-toolbar .btn-primary").forEach(b => { b.disabled = !ok; });
    DbConnector.setConnected(ok);
    showToast(ok ? "🟢 DB 서버에 다시 연결되었습니다. 미저장 변경이 있으면 [💾 전체 저장]을 눌러 주세요." : "🔌 DB 서버 연결이 끊겼습니다. 저장할 수 없습니다.");
  }
};
window.ServerHeartbeat = ServerHeartbeat;

// =============================================================================
// [v1.0.6] 애플리케이션 시작 순서 (단일 진입점)
//  1) 저장소 모드·언어 초기화 → 2) 공통 툴바 → 3) 데이터 로드(로컬) → 4) 화면 초기화 → 5) 로그인
//  ※ DB 서버 모드는 서버 로그인(토큰 인증) 후 데이터를 불러옵니다.
// =============================================================================
var AppBoot = {
  uiReady: false,

  // 저장된 테마를 적용한 뒤에 화면을 보여 줌 (처음 그린 기본 테마 색이 잠깐 보였다 바뀌지 않도록)
  async start() {
    try { await this._start(); } finally { document.body.classList.add("theme-ready"); }
  },
  async _start() {
    ProjectContext.init();
    DbConnector.init();
    if (typeof ButtonStandard !== "undefined") ButtonStandard.init();
    if (typeof I18N !== "undefined") I18N.init();
    await ModeGuard.check();
    SyncUI.init();
    ServerHeartbeat.start();
    if (SyncManager.isLocal()) {
      await SyncManager.initialLoad();
    }
    this.initUi();
    AuthManager.init();
    VersionWatch.init();
  },

  // 로그인 성공 후 호출 (DB 서버 모드: 서버 데이터 로드)
  async afterLogin() {
    if (!(await ProjectManager.afterLogin())) return;
    if (!SyncManager.isLocal()) {
      await SyncManager.initialLoad();
    }
    // 사용자 권한에 맞는 주간보고 작성 단위로 초기화 (일반: 담당 서브시스템 / PM: 통합)
    WeeklyReportManager.scope = null;
    WeeklyReportManager.currentWeekReport = null;
    if (document.getElementById("tab-weekly-report").classList.contains("active")) WeeklyReportManager.init();
    if (typeof WbsWeight !== "undefined" && WbsWeight.migrateIfNeeded()) rebuildAll(true);   // 예전 가중치 자료 한 번 전환
    AuthManager.applyTabPermissions();
    if (typeof HomeScreenManager !== "undefined") {
      HomeScreenManager.applyRoleMode();
      HomeScreenManager.render();
    }
    if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.init();
    if (typeof GShell !== "undefined") { GShell.refresh(); GShell.syncSettings(); }
  },

  initUi() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    setVal("cfgProjectStartDate", projectConfig.projectStartDate);
    setVal("cfgProjectEndDate", projectConfig.projectEndDate);
    setVal("globalReportDate", projectConfig.reportDate);
    setVal("cfgWeekStartDay", projectConfig.weekStartDay);
    renderProjectPeriodLabels();
    renderProjectTitles();
    renderIdPrefixSettings();
    renderDomainChips();
    renderCustomSdlcCards();
    renderStandardDeliverablesMetaTable();
    StorageManager.updateUsageInfo();
    MeetingManager.init();
    BackupHistoryManager.init();
    NoticeCommManager.init();
    LayoutManager.init();
    HomeScreenManager.init();
    rebuildAll();
    if (typeof GShell !== "undefined") GShell.init(); // [Standard] 2단 메뉴·머리글 (G v1.0.0 에서 시작)
    if (typeof NeoPage !== "undefined") NeoPage.init(); // [Neo 2.2] 화면 머리줄 통일 · 내려받기/올리기 메뉴
    this.uiReady = true;
  }
};
window.AppBoot = AppBoot;
window.addEventListener("DOMContentLoaded", () => AppBoot.start());
