// -------------------------------------------------------------
// [Project Mgmt] 저장소 연결 (DbConnector)
//  - 서버 주소로 열면 SQLite 서버 방식 (작업자 확인 후 [💾 저장]으로 저장, 충돌 감지)
//  - 파일로 직접 열면 브라우저 로컬 저장소 방식 (시험용)
//  - 하위 주소(/pprjmgmt) 아래에서 열어도 API 는 같은 하위 주소로 보냄
//  ※ 실제 저장/조회는 js/data-store.js (SyncManager / ServerBackend)
// -------------------------------------------------------------
const DbConnector = {
  CONFIG_STORAGE_KEY: "PPRJMGMT_DB_CONFIG_V1",
  config: { mode: "LOCAL", connected: false, lastSyncTime: "-" },

  init() {
    this.loadConfig();
    this.renderConfigForm();
    this.updateHeaderBadge();
  },
  isServerMode() { return this.config.mode !== "LOCAL"; },

  // 서버 주소 = 이 화면을 연 주소의 폴더 (예: https://xxx.com/pprjmgmt/index.html → https://xxx.com/pprjmgmt)
  getApiBase() {
    if (typeof window !== "undefined" && window.location && /^https?:$/.test(window.location.protocol) && window.location.host) {
      return window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "");
    }
    return "";
  },

  loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.CONFIG_STORAGE_KEY) || "null");
      if (saved && (saved.mode === "LOCAL" || saved.mode === "SQLITE")) this.config.mode = saved.mode;
    } catch (e) {}
  },
  saveConfig() {
    try { localStorage.setItem(this.CONFIG_STORAGE_KEY, JSON.stringify({ mode: this.config.mode })); } catch (e) {}
  },
  // ModeGuard 가 주소에 맞춰 바꿈 (서버 주소 → SQLITE, 파일 → LOCAL)
  selectMode(mode) {
    if (mode !== "LOCAL" && mode !== "SQLITE") return;
    this.config.mode = mode;
    this.saveConfig();
  },

  getConnectionSummaryHtml() {
    if (!this.isServerMode()) return `<b>현재 방식:</b> 브라우저 로컬 저장소 (파일로 직접 연 시험용 — 이 PC 에만 저장)`;
    const st = this.config.connected
      ? `<span class="status-tag tag-completed">🟢 서버 연결됨 (${escapeHtml(this.getApiBase())})</span>`
      : `<span class="status-tag tag-ready">⚪ 연결 대기</span>`;
    return `<b>현재 방식:</b> 서버 (SQLite) | ${st} | 최근 확인: <b>${escapeHtml(this.config.lastSyncTime)}</b>`;
  },
  renderConfigForm() {
    const el = document.getElementById("dbConnectionSummaryText");
    if (el) el.innerHTML = this.getConnectionSummaryHtml();
  },
  updateHeaderBadge() {
    const badge = document.getElementById("headerDbStatusBadge");
    if (badge) {
      badge.className = "status-badge-chip " + (!this.isServerMode() ? "chip-ready" : this.config.connected ? "chip-completed" : "chip-hold");
      badge.innerText = !this.isServerMode() ? "🗄️ 로컬" : this.config.connected ? "🟢 서버" : "🟡 서버(대기)";
    }
    this.renderConfigForm();
  },
  setConnected(ok) {
    this.config.connected = !!ok;
    if (ok) this.config.lastSyncTime = new Date().toLocaleTimeString();
    this.updateHeaderBadge();
  },
  async testConnection() {
    if (!this.isServerMode()) return showToast("로컬 저장소 방식입니다. (서버 연결 없음)");
    const res = await ServerBackend.request("/api/db/test", {});
    this.setConnected(!!res.ok);
    showToast(res.ok ? `🟢 서버 연결 확인 (${this.getApiBase()})` : `❌ 서버 연결 실패: ${res.message || ""}`);
  },
  saveToDb(showAlert = true) { return SyncManager.save(null, { notify: showAlert }); },
  loadFromDb() { return SyncManager.refresh(null); }
};
