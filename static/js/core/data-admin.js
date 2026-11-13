// =============================================================================
// [Project Mgmt] ⚙️ 시스템 설정 > 🗄️ 데이터 관리 (DataAdmin) — 관리자 전용
// -----------------------------------------------------------------------------
//  💽 사용 용량: 프로그램 폴더 전체 · DB 크기 (한도 10MB), DB 정리(VACUUM)
//  🧹 프로젝트 초기화: 대상 프로젝트를 골라 (지금 프로젝트가 아니어도 됨) 프로젝트 이름을 입력해 확인
//      Task 정보 초기화 (모든 프로젝트 일괄 가능) · 프로젝트 전체 초기화 · 완전 초기화(지금 프로젝트만)
//      바꾸기 전 자료는 복원 지점(브라우저)으로 남김
// =============================================================================
var DataAdmin = {
  ALL: "__ALL__",
  LIMIT: 10 * 1024 * 1024,
  ACTIONS: {
    tasks: { label: "🧹 Task 정보 초기화", what: "WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 업무 소통", keep: "프로젝트 기본정보 · 프로젝트 설정 · 멤버", all: true },
    project: { label: "⚠️ 프로젝트 전체 초기화", what: "프로젝트 설정(도메인 · 서브시스템 · SDLC · 공휴일 · 표준 산출물 · 마일스톤) + 모든 Task 정보", keep: "프로젝트 이름 · 기간 · 멤버" },
    factory: { label: "⚠️ 완전 초기화 (멤버 포함)", what: "지금 프로젝트의 프로젝트 설정 · 업무 자료 + 멤버 목록을 처음 상태로 (admin 하나, 암호 admin123!)", keep: "다른 프로젝트 자료", current: true }
  },
  isAdmin() { return typeof ProjectData !== "undefined" && ProjectData.isAdmin(); },
  isServer() { return typeof SyncManager !== "undefined" && !SyncManager.isLocal(); },
  go() {
    if (typeof GShell !== "undefined") GShell.go("tab-config"); else switchTab("tab-config");
    SubTabs.show("config", "data");
  },
  target() {
    const sel = document.getElementById("cfgClearTarget");
    const v = sel && sel.value ? sel.value : ProjectContext.current;
    const all = v === this.ALL;
    const p = all ? null : (ProjectData.projects().find(x => x.id === v) || { id: v, name: v });
    return { v, all, pid: all ? null : v, name: all ? "모든 프로젝트" : p.name, current: v === ProjectContext.current };
  },

  async render() {
    if (!this.isAdmin()) return;
    if (typeof ProjectManager !== "undefined" && ProjectManager.refreshList) { try { await ProjectManager.refreshList(); } catch (e) {} }
    ProjectData.renderConfigTarget();
    this.renderActions();
    await this.usage(true);
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(document.getElementById("dataAdminPane"));
  },

  size(n) { return n >= 1048576 ? (n / 1048576).toFixed(2) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB"; },
  _showUsage(res) {
    const el = document.getElementById("daUsage");
    if (!el) return;
    if (!res || !res.ok) { el.textContent = this.isServer() ? "사용 용량을 읽지 못했습니다." : "로컬 저장소 방식: 서버 용량 없음"; return; }
    const pct = Math.round(res.total / (res.limit || this.LIMIT) * 100);
    el.innerHTML = `프로그램 폴더 전체 <b>${this.size(res.total)}</b> / 한도 ${this.size(res.limit || this.LIMIT)} (<b style="color:${pct >= 90 ? "var(--chart-bad-text)" : pct >= 75 ? "var(--chart-warn-text)" : "var(--chart-good-text)"}">${pct}%</b>) · 그중 DB ${this.size(res.db)}`
      + (pct >= 75 ? ` — ⚠️ 한도에 가깝습니다. 끝난 프로젝트를 백업(💾 백업 · 복원)한 뒤 지우고 [🧹 DB 정리]를 누르세요.` : "");
  },
  async usage(silent) {
    if (!this.isServer()) {
      // [Local] 이 브라우저 저장소 사용량
      const el = document.getElementById("daUsage");
      let quota = "";
      try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); quota = e.quota ? ` · 브라우저 허용량 약 ${this.size(e.quota)}` : ""; } } catch (err) {}
      if (el) el.innerHTML = `이 브라우저(IndexedDB "pprjmgmt")에 저장된 자료 약 <b>${this.size(AppStore.usageBytes())}</b>${quota}. 자료는 이 PC 에만 있으니 정기적으로 💾 백업 · 복원에서 다운로드하세요.`;
      return;
    }
    const res = await ServerBackend.request("/api/admin/usage", {});
    this._showUsage(res);
    if (!silent && res.ok) showToast(`💽 사용 용량 ${this.size(res.total)}`);
  },
  async vacuum() {
    if (!this.isServer()) return;
    const res = await ServerBackend.request("/api/admin/vacuum", {}, "POST", 60000);
    this._showUsage(res);
    showToast(res.ok ? `🧹 DB 를 정리했습니다. (DB ${this.size(res.db)})` : "❌ DB 정리 실패: " + (res.message || ""));
  },

  // 대상에 따라 쓸 수 있는 동작만 켬
  renderActions() {
    const body = document.getElementById("daActions");
    if (!body) return;
    const t = this.target();
    body.innerHTML = Object.keys(this.ACTIONS).map(k => {
      const a = this.ACTIONS[k];
      let why = "";
      if (t.all && !a.all) why = "모든 프로젝트 일괄은 Task 정보 초기화만";
      else if (a.current && !t.current) why = "지금 프로젝트만 (머리글에서 그 프로젝트로 바꾼 뒤)";
      return `<tr class="${why ? "mp-off" : ""}">
        <td><b>${a.label}</b></td>
        <td class="mt-desc">${escapeHtml(a.what)}</td>
        <td class="mt-desc">${escapeHtml(a.keep)}</td>
        <td style="text-align:center; white-space:nowrap;">${why
          ? `<span class="mt-lock">🔒 ${escapeHtml(why)}</span>`
          : `<button class="btn btn-sm" data-btn="${k === "tasks" ? "warn" : "danger"}" data-click="DataAdmin.run" data-click-args="${UiEvents.args(k)}">실행</button>`}</td>
      </tr>`;
    }).join("");
  },

  // ---- 이름 입력 확인 창 ----
  ask(title, lines, expect, fn) {
    this._ask = { expect, fn };
    document.getElementById("daConfirmTitle").textContent = title;
    document.getElementById("daConfirmMsg").textContent = lines.join("\n");
    document.getElementById("daConfirmExpect").textContent = expect;
    const inp = document.getElementById("daConfirmInput");
    inp.value = "";
    document.getElementById("daConfirmOk").disabled = true;
    document.getElementById("daConfirmModal").style.display = "flex";
    setTimeout(() => inp.focus(), 50);
  },
  checkInput() {
    const a = this._ask;
    const inp = document.getElementById("daConfirmInput");
    document.getElementById("daConfirmOk").disabled = !a || inp.value.trim() !== a.expect;
  },
  closeAsk(ok) {
    const a = this._ask;
    document.getElementById("daConfirmModal").style.display = "none";
    this._ask = null;
    if (ok && a && document.getElementById("daConfirmInput").value.trim() === a.expect) a.fn();
  },

  run(action) {
    if (!this.isAdmin()) return showToast("🚫 데이터 관리는 관리자만 할 수 있습니다.");
    const a = this.ACTIONS[action];
    const t = this.target();
    if (!a || (t.all && !a.all)) return;
    const lines = [`대상: ${t.name}${t.current ? " (지금 프로젝트)" : ""}`, `· 지우는 것: ${a.what}`, `· 그대로: ${a.keep}`,
      "바꾸기 전 자료는 스냅샷(이 브라우저)에 남깁니다. 오래 보관하려면 먼저 💾 백업 · 복원에서 다운로드하세요.",
      "되돌리기 어렵습니다. 확인을 위해 아래에 대상 이름을 그대로 입력하세요."];
    this.ask(`${a.label} — ${t.name}`, lines, t.name, () => this._do(action, t));
  },

  async _do(action, t) {
    try {
      if (action === "tasks") {
        const list = t.all ? ProjectData.projects() : [{ id: t.pid, name: t.name }];
        await ProjectData._clear(list.map(p => p.id), list.map(p => p.name));
      } else if (action === "project") {
        if (t.current) ProjectData._resetCurrent();
        else await this._writeOther(t, cur => ({ data: Object.assign(this._emptyTasks(), { projectConfig: ProjectData.blankConfig(cur.projectConfig), subsystemsMeta: [], standardDeliverablesMeta: [] }), users: [] }));
      } else if (action === "factory") {
        if (!t.current) return;
        StorageManager._factoryBlank();
      }
    } catch (err) {
      showToast("❌ 초기화 오류: " + err.message);
    }
    setTimeout(() => this.render(), 300);
  },
  _emptyTasks() { const o = {}; ProjectData.TASK_KEYS.forEach(k => { o[k] = []; }); return o; },

  // 다른 프로젝트: 지금 자료를 복원 지점으로 남긴 뒤 새 자료로 바꿈 (이름은 그대로)
  async _writeOther(t, build) {
    const cur = await ProjectTransfer.load(t.pid);
    BackupHistoryManager.createBackupSnapshot("프로젝트초기화직전백업", "ALL", false, { projectId: t.pid, projectName: t.name, source: cur.data });
    const next = build(cur.data);
    await ProjectTransfer.write(t.pid, { name: t.name, data: next.data, users: next.users }, true);
    showToast(`✅ [${t.name}] 프로젝트를 초기 상태로 되돌렸습니다. (이름 · 기간 · 멤버는 그대로)`);
  }
};
window.DataAdmin = DataAdmin;
