// [Project Mgmt] 업무 데이터 변수 · 초기 데이터 · 실행 방식 확인 · 시작(AppBoot)
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
var meetingsData = [];
let wbsData = [];

let deliverablesData = [];

let reqMasterData = [];

let vocData = [];

// [ver1.0.4 신규] 프로젝트 인력을 위한 공지사항(Notices) 및 팀원 소통(Communications) 데이터
let noticesData = [];

let communicationsData = [];
// [v2.4.0] 작업자별 할 일 (TodoCenter) — 행: { id, owner, kind: "todo"|"hide", title, due, priority, link, done, ... }
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
// 저장 방식 (ModeGuard) — Local 판은 항상 브라우저 저장소
// =============================================================================
var ModeGuard = {
  // [Local] 서버 없이 항상 이 브라우저에 저장 (정적 파일만 올리는 전사 시스템 하위 주소용)
  async check() {
    DbConnector.selectMode("LOCAL");
    this.loginNotice = "";
  }
};
window.ModeGuard = ModeGuard;

// =============================================================================
// 서버 연결 상태 (ConnState) — 일정 시간마다 묻지 않음: 작업자 요청이 실패하면 배너, 다시 성공하면 해제
// =============================================================================
var ConnState = {
  online: true,
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
    bar.innerHTML = "🔌 <b>서버에 연결할 수 없습니다.</b> 지금 입력하는 내용은 저장되지 않고 화면에만 남습니다. 연결되면 [💾 전체 저장]을 눌러 주세요.";
    document.querySelectorAll("#btnHeaderSaveAll, .sync-toolbar button[data-btn='save'], .sync-toolbar .btn-primary").forEach(b => { b.disabled = !ok; });
    DbConnector.setConnected(ok);
    showToast(ok ? "🟢 서버에 다시 연결되었습니다. 저장하지 않은 변경이 있으면 [💾 전체 저장]을 눌러 주세요." : "🔌 서버에 연결할 수 없습니다. 저장할 수 없습니다.");
  }
};
window.ConnState = ConnState;

// =============================================================================
// [v1.0.6] 애플리케이션 시작 순서 (단일 진입점)
//  1) 저장소 모드·언어 초기화 → 2) 공통 툴바 → 3) 데이터 로드(로컬) → 4) 화면 초기화 → 5) 작업자 선택
//  ※ DB 서버 모드는 서버 작업자 선택(토큰 인증) 후 데이터를 불러옵니다.
// =============================================================================
var AppBoot = {
  uiReady: false,

  async start() {
    ProjectContext.init();
    DbConnector.init();
    if (typeof ButtonStandard !== "undefined") ButtonStandard.init();
    if (typeof I18N !== "undefined") I18N.init();
    await ModeGuard.check();
    SyncUI.init();
    if (SyncManager.isLocal()) {
      await SyncManager.initialLoad();
      // 배포 폴더의 최신 종합본(shared/latest.json) 확인 — 새것이면 받아 두거나 그것으로 시작
      if (typeof WorkerPick !== "undefined" && await WorkerPick.checkServerPackage()) return;
    }
    this.initUi();
    AuthManager.init();
    if (typeof WorkerPick !== "undefined") WorkerPick.startMessage();
    this.versionNotice();
  },

  // 작업자 선택 성공 후 호출 (DB 서버 모드: 서버 데이터 로드)
  async afterLogin() {
    if (!(await ProjectManager.afterLogin())) return;
    if (!SyncManager.isLocal()) {
      await SyncManager.initialLoad();
    }
    // 작업자 권한에 맞는 주간보고 작성 단위로 초기화 (일반: 담당 서브시스템 / PM: 통합)
    WeeklyReportManager.scope = null;
    WeeklyReportManager.currentWeekReport = null;
    if (document.getElementById("tab-weekly-report").classList.contains("active")) WeeklyReportManager.init();
    if (typeof WbsWeight !== "undefined" && WbsWeight.migrateIfNeeded()) rebuildAll(true);   // 예전 가중치 자료 한 번 전환
    AuthManager.applyTabPermissions();
    if (typeof HomeScreenManager !== "undefined") {
      HomeScreenManager.applyRoleMode();
      HomeScreenManager.render();
    }
    if (typeof GShell !== "undefined") { GShell.refresh(); GShell.syncSettings(); }
    if (SyncManager.isLocal() && typeof WorkerPick !== "undefined") WorkerPick.applyPending();
    this.backupReminder();
  },

  // 새 버전으로 바뀌었으면 한 번 알림 (자료는 그대로)
  versionNotice() {
    let prev = null;
    try { prev = AppStore.getItem("PPRJMGMT_APP_VERSION"); AppStore.setItem("PPRJMGMT_APP_VERSION", APP_VERSION.version); } catch (e) {}
    if (prev && prev !== APP_VERSION.version) setTimeout(() => showToast(`🆕 ${APP_VERSION.product} v${APP_VERSION.version} 로 바뀌었습니다 (이전 v${prev}). 이 브라우저의 자료는 그대로입니다.`), 1200);
  },

  // [Local] 자료는 이 브라우저에만 있으므로, 7일 넘게 파일로 받지 않았으면 알림
  backupReminder() {
    if (!SyncManager.isLocal() || !(wbsData.length || subsystemsMeta.length)) return;
    const last = parseInt(AppStore.getItem("PPRJMGMT_LAST_FILE_SAVE") || "0", 10);
    const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
    if (days !== null && days < 7) return;
    setTimeout(() => showToast(`💾 ${days === null ? "아직 자료를 파일로 받은 적이 없습니다." : `마지막으로 자료 파일을 받은 지 ${days}일 지났습니다.`} 자료는 이 브라우저에만 있으니 [🔀 스마트 병합 > 💾 백업 · 복원]에서 프로젝트 백업을 내려받아 두세요.`), 2500);
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
// [Local] 브라우저 저장소(IndexedDB)를 다 읽은 뒤 시작
window.addEventListener("DOMContentLoaded", () => AppStore.ready().then(() => AppBoot.start()));
