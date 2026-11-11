// =============================================================================
// [IOSTAR-PM v4.0.0] 💾 백업 · 복원 화면 (스마트 병합의 서브 탭) — BackupPane · SystemBackup
// -----------------------------------------------------------------------------
//  목적: 시스템 운영 정보와 작업 정보를 비상시에 대비해 보관하고 되돌림 (스마트 병합은 일괄 작업 · 통합용)
//  권한: 시스템관리자 = 모든 기능 · 모든 프로젝트 / PM = 지금 프로젝트 기능 (시스템 전체 기능은 비활성) / 그 밖 = 탭 숨김
//  [v4.1.0] ① 프로젝트 백업 · 복원 ② 시스템 전체 백업 · 복원 ③ 복원 지점 — 초기화 · 자동 백업 설정은 시스템 설정 > 🗄️ 데이터 관리 (DataAdmin)
//  시스템 전체 백업: DB 서버 방식 = 서버가 zip(DB + 첨부파일 선택)을 data/backups 에 만들고 목록 · 내려받기 · 복원 · 자동 백업(선택)
//                    로컬 저장소 방식 = 이 브라우저의 모든 프로젝트 · 사용자 · 설정을 JSON 1개로
// =============================================================================
var BackupPane = {
  isManager() { return typeof ProjectData !== "undefined" && ProjectData.canManage(); },
  isAdmin() { return typeof ProjectData !== "undefined" && ProjectData.isAdmin(); },
  // 탭 단추: 시스템관리자 · PM 에게만 보임
  syncTab() {
    const btn = document.getElementById("mergeBackupTabBtn");
    if (btn) btn.style.display = this.isManager() ? "" : "none";
    if (!this.isManager()) {
      const pane = document.getElementById("mergeBackupPane");
      if (pane && pane.classList.contains("active")) SubTabs.show("merge", "merge");
    }
  },
  async render() {
    this.syncTab();
    if (!this.isManager()) return;
    const admin = this.isAdmin();
    const note = document.getElementById("bkRoleNote");
    if (note) note.innerHTML = admin
      ? "👑 <b>시스템관리자</b> — 모든 프로젝트와 시스템 전체 백업 · 복원을 쓸 수 있습니다."
      : `🛡️ <b>PM</b> — 지금 프로젝트 <b>${escapeHtml(ProjectData.currentName())}</b> 의 백업 · 복원과 복원 지점을 쓸 수 있습니다. (시스템 전체 백업 · 초기화는 시스템관리자 전용)`;
    // 권한 없는 부분은 비활성 (data-need="admin")
    document.querySelectorAll('#mergeBackupPane [data-need="admin"]').forEach(el => {
      el.classList.toggle("bk-locked", !admin);
      el.querySelectorAll("button, input, select").forEach(c => { c.disabled = !admin; });
      if (el.tagName === "BUTTON") { el.disabled = !admin; if (!admin) el.title = "시스템관리자 전용"; }
    });
    await ProjectTransfer.render();
    const server = !SyncManager.isLocal();
    document.getElementById("bkServerBox").style.display = server ? "" : "none";
    document.getElementById("bkLocalBox").style.display = server ? "none" : "";
    if (!server) StorageManager.updateUsageInfo();
    if (admin && server) await SystemBackup.refresh();
    BackupHistoryManager.renderBackupHistoryTable();
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("mergeBackupPane"));
  }
};
window.BackupPane = BackupPane;

var SystemBackup = {
  KINDS: { manual: "수동", auto: "자동", "before-restore": "복원 직전", uploaded: "PC 에서 올림", "before-clear": "Task 초기화 전" },
  size(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB"; },
  _apply(res) {
    if (!res || !res.ok) return;
    this.list = res.backups || this.list || [];
    if (res.auto) this.auto = res.auto;
    const body = document.getElementById("bkServerList");
    if (body) body.innerHTML = this.list.length ? this.list.map(b => `<tr>
        <td>${escapeHtml(b.createdAt || "")}</td>
        <td><span class="status-badge-chip ${b.kind === "auto" ? "chip-progress" : b.kind === "before-restore" ? "chip-delayed" : "chip-completed"}">${escapeHtml(this.KINDS[b.kind] || b.kind)}</span></td>
        <td>${b.type === "system" ? (b.withFiles ? `포함 (${b.files})` : "없음") : "-"}</td>
        <td>${this.size(b.size)}</td>
        <td style="font-family:monospace; font-size:var(--fs-xs, 11px);">${escapeHtml(b.name)}</td>
        <td style="text-align:center; white-space:nowrap;">
          <button class="btn btn-primary btn-sm" data-click="SystemBackup.download" data-click-args="${UiEvents.args(b.name)}">📥 내려받기</button>
          ${b.type === "system" ? `<button class="btn btn-warning btn-sm" data-click="SystemBackup.restore" data-click-args="${UiEvents.args(b.name)}">⏪ 복원</button>` : ""}
          <button class="btn btn-danger btn-sm" data-click="SystemBackup.remove" data-click-args="${UiEvents.args(b.name)}">삭제</button>
        </td></tr>`).join("")
      : `<tr><td colspan="6" style="text-align:center; padding:14px; color:var(--text-muted);">아직 시스템 백업이 없습니다.</td></tr>`;
    const a = this.auto || {};
    const set = (id, prop, v) => { const el = document.getElementById(id); if (el) el[prop] = v; };
    set("bkAutoOn", "checked", !!a.enabled); set("bkAutoFiles", "checked", !!a.withFiles);
    set("bkAutoHours", "value", a.hours || 24); set("bkAutoKeep", "value", a.keep || 14);
    set("bkAutoLast", "textContent", a.enabled ? `마지막 자동 백업: ${a.last || "아직 없음 (켜면 5분 안에 첫 백업)"}` : "자동 백업 꺼짐");
    set("bkFolder", "textContent", res.folder ? `서버 보관 위치: ${res.folder}` : "");
    set("bkFolder2", "textContent", res.folder ? `서버 보관 위치: ${res.folder}` : "");
    // [v4.1.0] 백업 · 복원 탭에는 자동 백업 상태만 (설정은 시스템 설정 > 데이터 관리)
    const st = document.getElementById("bkAutoStatus");
    if (st) st.innerHTML = `<b>⏱ 자동 백업</b> ${a.enabled
      ? `<span class="status-badge-chip chip-completed">켜짐</span> ${a.hours || 24}시간마다 · 최근 ${a.keep || 14}개 보관${a.withFiles ? " · 첨부파일 포함" : ""} · 마지막: ${escapeHtml(a.last || "아직 없음")}`
      : `<span class="status-badge-chip chip-ready">꺼짐</span>`}
      <button class="btn btn-sm" data-btn="nav" data-click="DataAdmin.go">⚙️ 설정: 시스템 설정 &gt; 데이터 관리</button>`;
  },
  async refresh() { this._apply(await ServerBackend.request("/api/admin/backup/list", {})); },
  async create() {
    const withFiles = !!(document.getElementById("bkWithFiles") || {}).checked;
    showToast("💾 시스템 백업을 만드는 중입니다...");
    const res = await ServerBackend.request("/api/admin/backup/create", { withFiles }, "POST", 600000);
    if (!res.ok) return showToast("❌ 시스템 백업 실패: " + (res.message || ""));
    this._apply(res);
    showToast(`✅ 시스템 백업을 만들었습니다: ${res.name}${withFiles ? " (첨부파일 포함)" : ""} — [📥 내려받기]로 PC 에도 보관하세요.`);
  },
  async download(name) {
    try {
      const r = await fetch(ServerBackend.baseUrl() + "/api/admin/backup/download?name=" + encodeURIComponent(name), { headers: { "Authorization": "Bearer " + ServerBackend.token }, cache: "no-store" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); return showToast("⚠️ " + (j.message || "내려받지 못했습니다.")); }
      ExcelSync._triggerDownload(await r.blob(), name);
    } catch (err) { showToast("⚠️ 내려받기 오류: " + err.message); }
  },
  restore(name) {
    const b = (this.list || []).find(x => x.name === name) || {};
    openConfirmDialog(`⚠️ [시스템 전체 복원] ${name}\n모든 프로젝트 · 사용자 계정 · 공정 유형 · 설정을 ${b.createdAt || ""} 시점으로 되돌립니다.${b.withFiles ? "\n첨부파일도 그 시점으로 바뀝니다." : "\n(이 백업에는 첨부파일이 없어 첨부파일은 그대로)"}\n복원 직전 상태를 먼저 자동 백업합니다. 다른 사용자는 다시 로그인해야 할 수 있습니다. 계속할까요?`, async () => {
      const res = await ServerBackend.request("/api/admin/backup/restore", { name }, "POST", 600000);
      if (!res.ok) return showToast("❌ 복원 실패: " + (res.message || ""));
      showToast(`✅ 시스템을 복원했습니다. (복원 직전 백업: ${res.before}) 화면을 다시 불러옵니다...`);
      setTimeout(() => window.location.reload(), 1500);
    });
  },
  remove(name) {
    openConfirmDialog(`백업 파일 [${name}] 을(를) 삭제할까요? 되돌릴 수 없습니다.`, async () => {
      const res = await ServerBackend.request("/api/admin/backup/delete", { name });
      if (!res.ok) return showToast("❌ 삭제 실패: " + (res.message || ""));
      this._apply(res);
      showToast("🗑 백업 파일을 삭제했습니다.");
    });
  },
  async upload(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    try {
      const r = await fetch(ServerBackend.baseUrl() + "/api/admin/backup/upload", { method: "POST", headers: { "Authorization": "Bearer " + ServerBackend.token, "Content-Type": "application/octet-stream" }, body: file });
      const res = await r.json().catch(() => ({}));
      if (!res.ok) return showToast("❌ 올리기 실패: " + (res.message || ""));
      this._apply(res);
      showToast(`📤 백업 파일을 서버 목록에 올렸습니다: ${res.name} — 목록에서 [⏪ 복원]을 누르세요.`);
    } catch (err) { showToast("❌ 올리기 오류: " + err.message); }
  },
  async saveAuto() {
    const v = id => document.getElementById(id);
    const res = await ServerBackend.request("/api/admin/backup/settings", { enabled: v("bkAutoOn").checked, withFiles: v("bkAutoFiles").checked,
      hours: parseInt(v("bkAutoHours").value, 10) || 24, keep: parseInt(v("bkAutoKeep").value, 10) || 14 });
    if (!res.ok) return showToast("❌ 저장 실패: " + (res.message || ""));
    this.auto = res.auto;
    await this.refresh();
    showToast(res.auto.enabled ? `⏱ 자동 백업을 켰습니다: ${res.auto.hours}시간마다, 최근 ${res.auto.keep}개 보관${res.auto.withFiles ? ", 첨부파일 포함" : ""}` : "⏱ 자동 백업을 껐습니다.");
  },

  // ---- 로컬 저장소 방식 ----
  LOCAL_SCHEMA: "IOSTAR_LOCAL_SYSTEM_v1",
  _localKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k !== BackupHistoryManager.STORAGE_KEY) keys.push(k);
    }
    return keys;
  },
  exportLocal() {
    if (!ProjectData.isAdmin()) return showToast("🚫 시스템관리자만 할 수 있습니다.");
    const items = {};
    this._localKeys().forEach(k => { items[k] = localStorage.getItem(k); });
    const payload = { schemaVersion: this.LOCAL_SCHEMA, appVersion: APP_VERSION.version, exportedAt: new Date().toISOString(), exportedBy: AuthManager.getCurrentUser().empNo,
      projects: ProjectContext.localList().map(p => p.name), items };
    ExcelSync._triggerDownload(new Blob([JSON.stringify(payload)], { type: "application/json;charset=utf-8" }), ExcelSync.stdName("시스템전체백업", [], "json", ProjectData._stamp()));
    showToast(`💾 이 브라우저의 시스템 전체(프로젝트 ${payload.projects.length}개 · 사용자 · 설정)를 백업했습니다.`);
  },
  async importLocal(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file || !ProjectData.isAdmin()) return;
    let j;
    try { j = JSON.parse(await file.text()); } catch (err) { return showToast("⚠️ JSON 파일을 읽지 못했습니다."); }
    if (!j || j.schemaVersion !== this.LOCAL_SCHEMA || !j.items) return showToast("⚠️ 시스템 전체 백업(JSON) 파일이 아닙니다. 프로젝트 하나는 [① 프로젝트 백업 · 복원]에서 올리세요.");
    openConfirmDialog(`⚠️ [시스템 전체 복원] ${file.name}\n이 브라우저의 모든 프로젝트(${(j.projects || []).join(", ")}) · 사용자 · 설정을 백업 시점으로 바꿉니다. 지금 상태는 복원 지점에 남깁니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("시스템복원직전백업", "ALL", false);
      this._localKeys().forEach(k => localStorage.removeItem(k));
      Object.keys(j.items).forEach(k => { try { localStorage.setItem(k, j.items[k]); } catch (err) {} });
      showToast("✅ 시스템 전체를 복원했습니다. 화면을 다시 불러옵니다...");
      setTimeout(() => window.location.reload(), 1200);
    });
  }
};
window.SystemBackup = SystemBackup;
