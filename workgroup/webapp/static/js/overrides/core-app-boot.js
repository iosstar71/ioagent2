// Workgroup 판: core/app-boot.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

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

Object.assign(ModeGuard, {
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
});

Object.assign(AppBoot, {
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
    if (Migrate.project()) {
      rebuildAll(true);
      // 프로그램이 자료 형식을 바꾼 것(사용자가 고친 것이 아님)은 묻지 않고 바로 기록
      if (typeof SyncManager !== "undefined" && SyncManager.isLocal()) setTimeout(() => SyncManager.save(null, { notify: false }), 300);
    }   // 예전 자료 형식 변환 (core/migrate.js)
    AuthManager.applyTabPermissions();
    if (typeof HomeScreenManager !== "undefined") {
      HomeScreenManager.applyRoleMode();
      HomeScreenManager.render();
    }
    if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.init();
    if (typeof GShell !== "undefined") { GShell.refresh(); GShell.syncSettings(); }
  },});
