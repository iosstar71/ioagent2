// =============================================================================
// [Project Mgmt] 💾 백업 · 복원 화면 (스마트 병합의 서브 탭) — BackupPane · SystemBackup
// -----------------------------------------------------------------------------
//  목적: 시스템 운영 정보와 작업 정보를 비상시에 대비해 보관하고 되돌림 (스마트 병합은 일괄 작업 · 통합용)
//  권한: 관리자 = 모든 기능 · 모든 프로젝트 / PM = 지금 프로젝트 기능 (시스템 전체 기능은 비활성) / 그 밖 = 탭 숨김
//  [v4.1.0] ① 프로젝트 백업 · 복원 ② 시스템 전체 백업 · 복원 ③ 복원 지점 — 초기화 · 자동 백업 설정은 시스템 설정 > 🗄️ 데이터 관리 (DataAdmin)
//  시스템 전체 백업: 서버 방식 = DB 를 백업 파일(.db)로 바로 내려받기 · 올려서 복원 (서버에는 남기지 않음)
//                    로컬 저장소 방식 = 이 브라우저의 모든 프로젝트 · 작업자 · 설정을 JSON 1개로
// =============================================================================
var BackupPane = {
  isManager() { return typeof ProjectData !== "undefined" && ProjectData.canManage(); },
  isAdmin() { return typeof ProjectData !== "undefined" && ProjectData.isAdmin(); },
  // 탭 단추: 관리자 · PM 에게만 보임
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
      ? "👑 <b>관리자</b> — 모든 프로젝트와 시스템 전체 백업 · 복원을 쓸 수 있습니다."
      : `🛡️ <b>PM</b> — 지금 프로젝트 <b>${escapeHtml(ProjectData.currentName())}</b> 의 백업 · 복원과 복원 지점을 쓸 수 있습니다. (시스템 전체 백업 · 초기화는 관리자 전용)`;
    // 권한 없는 부분은 비활성 (data-need="admin")
    document.querySelectorAll('#mergeBackupPane [data-need="admin"]').forEach(el => {
      el.classList.toggle("bk-locked", !admin);
      el.querySelectorAll("button, input, select").forEach(c => { c.disabled = !admin; });
      if (el.tagName === "BUTTON") { el.disabled = !admin; if (!admin) el.title = "관리자 전용"; }
    });
    await ProjectTransfer.render();
    const server = !SyncManager.isLocal();
    document.getElementById("bkServerBox").style.display = server ? "" : "none";
    document.getElementById("bkLocalBox").style.display = server ? "none" : "";
    if (!server) StorageManager.updateUsageInfo();
    BackupHistoryManager.renderBackupHistoryTable();
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("mergeBackupPane"));
  }
};
window.BackupPane = BackupPane;

var SystemBackup = {
  // 서버 방식: 지금 DB 를 백업 파일(.db)로 바로 내려받음 (서버에는 남기지 않음)
  async download(silent) {
    try {
      const r = await fetch(DbConnector.getApiBase() + "/api/admin/backup/download", { headers: { "Authorization": "Bearer " + ServerBackend.token }, cache: "no-store" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); showToast("⚠️ " + (j.message || "내려받지 못했습니다.")); return false; }
      const cd = r.headers.get("Content-Disposition") || "";
      const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || "pprjmgmt_backup.db");
      ExcelSync._triggerDownload(await r.blob(), name);
      if (!silent) showToast(`📥 시스템 백업을 내려받았습니다: ${name} — PC 에 보관하세요.`);
      return true;
    } catch (err) { showToast("⚠️ 내려받기 오류: " + err.message); return false; }
  },
  // 백업 파일로 복원 — 먼저 지금 상태를 내려받은 뒤 바꿈
  upload(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    openConfirmDialog(`⚠️ [시스템 전체 복원] ${file.name}\n모든 프로젝트 · 작업자 · 설정을 이 백업 파일 내용으로 바꿉니다.\n바꾸기 전에 지금 상태를 백업 파일로 먼저 내려받습니다. 다른 작업자는 다시 작업자 선택을 해야 할 수 있습니다. 계속할까요?`, async () => {
      if (!(await this.download(true))) return;
      try {
        const r = await fetch(DbConnector.getApiBase() + "/api/admin/backup/upload", { method: "POST", headers: { "Authorization": "Bearer " + ServerBackend.token, "Content-Type": "application/octet-stream" }, body: file });
        const res = await r.json().catch(() => ({}));
        if (!res.ok) return showToast("❌ 복원 실패: " + (res.message || ""));
        showToast("✅ 시스템을 복원했습니다. (복원 전 상태는 방금 내려받은 파일) 화면을 다시 불러옵니다...");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) { showToast("❌ 복원 오류: " + err.message); }
    });
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
    if (!ProjectData.isAdmin()) return showToast("🚫 관리자만 할 수 있습니다.");
    const items = {};
    this._localKeys().forEach(k => { items[k] = localStorage.getItem(k); });
    const payload = { schemaVersion: this.LOCAL_SCHEMA, appVersion: APP_VERSION.version, exportedAt: new Date().toISOString(), exportedBy: AuthManager.getCurrentUser().empNo,
      projects: ProjectContext.localList().map(p => p.name), items };
    ExcelSync._triggerDownload(new Blob([JSON.stringify(payload)], { type: "application/json;charset=utf-8" }), ExcelSync.stdName("시스템전체백업", [], "json", ProjectData._stamp()));
    showToast(`💾 이 브라우저의 시스템 전체(프로젝트 ${payload.projects.length}개 · 작업자 · 설정)를 백업했습니다.`);
  },
  async importLocal(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file || !ProjectData.isAdmin()) return;
    let j;
    try { j = JSON.parse(await file.text()); } catch (err) { return showToast("⚠️ JSON 파일을 읽지 못했습니다."); }
    if (!j || j.schemaVersion !== this.LOCAL_SCHEMA || !j.items) return showToast("⚠️ 시스템 전체 백업(JSON) 파일이 아닙니다. 프로젝트 하나는 [① 프로젝트 백업 · 복원]에서 올리세요.");
    openConfirmDialog(`⚠️ [시스템 전체 복원] ${file.name}\n이 브라우저의 모든 프로젝트(${(j.projects || []).join(", ")}) · 작업자 · 설정을 백업 시점으로 바꿉니다. 지금 상태는 복원 지점에 남깁니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("시스템복원직전백업", "ALL", false);
      this._localKeys().forEach(k => localStorage.removeItem(k));
      Object.keys(j.items).forEach(k => { try { localStorage.setItem(k, j.items[k]); } catch (err) {} });
      showToast("✅ 시스템 전체를 복원했습니다. 화면을 다시 불러옵니다...");
      setTimeout(() => window.location.reload(), 1200);
    });
  }
};
window.SystemBackup = SystemBackup;
