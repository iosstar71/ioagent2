// =============================================================================
// [Project Mgmt v3.8.0] 프로젝트 단위 백업 · 복원 · 초기화 (ProjectData) + 프로젝트별 화면 설정 공유 (SharedPanes)
// -----------------------------------------------------------------------------
//  - 프로젝트 백업: 지금 프로젝트의 기본정보 · 기준정보 · Task 정보만 JSON 으로 (작업자 · 시스템 설정은 넣지 않음)
//  - 프로젝트 복원: 그 JSON 으로 지금 프로젝트만 바꿈 (다른 프로젝트 · 작업자 계정은 그대로, 프로젝트 이름은 유지)
//  - Task 정보 초기화: 기본정보 · 기준정보는 두고 WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 업무 소통(채팅 포함)만 지움
//      지우기 전 자료는 복원 지점(브라우저)으로 남김
//  - 프로젝트 전체 초기화: 프로젝트 이름 · 기간만 두고 기준정보까지 빈 상태로
//  - 시스템 설정의 전체 백업 · 복원 · 초기화는 그대로 (StorageManager)
// =============================================================================
var ProjectData = {
  SCHEMA: "IOSTAR_PROJECT_BACKUP_v1",
  BASE_KEYS: ["projectConfig", "subsystemsMeta", "standardDeliverablesMeta"],
  TASK_KEYS: ["wbsData", "reqMasterData", "deliverablesData", "weeklyReportsData", "vocData", "meetingsData", "noticesData", "communicationsData"],
  LABELS: { wbsData: "WBS", reqMasterData: "요구사항", deliverablesData: "산출물", weeklyReportsData: "주간보고", vocData: "VOC",
    meetingsData: "회의", noticesData: "공지", communicationsData: "업무 소통" },

  isServer() { return typeof SyncManager !== "undefined" && !SyncManager.isLocal(); },
  canManage() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
    return !!u && (u.role === "SYS_ADMIN" || u.role === "PM");
  },
  isAdmin() { return typeof ProjectManager !== "undefined" && ProjectManager.isAdmin(); },
  currentName() { return (ProjectContext.info() || {}).name || projectConfig.projectName || ProjectContext.current; },
  projects() {
    const list = ProjectContext.projects && ProjectContext.projects.length ? ProjectContext.projects : ProjectContext.localList();
    return list.map(p => ({ id: p.id, name: p.id === ProjectContext.current ? this.currentName() : (p.name || p.id), status: p.status || "ACTIVE" }));
  },
  countText(data) {
    return this.TASK_KEYS.map(k => `${this.LABELS[k]} ${Array.isArray(data[k]) ? data[k].length : 0}`).join(" · ");
  },
  _stamp() { return BackupHistoryManager._formatTimestamp(new Date()).fileStamp.replace(/[^0-9]/g, ""); },

  // ---- 백업 ----
  collect() {
    const all = DataRegistry.collect();
    const data = {};
    this.BASE_KEYS.concat(this.TASK_KEYS).forEach(k => { data[k] = DataRegistry.clone(all[k] !== undefined ? all[k] : []); });
    return data;
  },
  exportProject(format) {
    if (!this.canManage()) return showToast("🚫 프로젝트 백업은 PM · 관리자만 할 수 있습니다.");
    // [v3.9.1] 엑셀 백업 = 스마트병합 [④ 전체 일괄] 엑셀과 같은 양식 (기준정보 · 업무 · 작업자 · 협업 시트)
    if (format === "EXCEL") {
      const blob = ExcelSync._buildXlsxBlob(SmartMergeCenter.buildPackageSheets());
      ExcelSync._triggerDownload(blob, ExcelSync.stdName("프로젝트백업", [], "xlsx", this._stamp()));
      return showToast(`💾 [${this.currentName()}] 프로젝트를 엑셀로 백업했습니다. (${this.countText(this.collect())})`);
    }
    const data = this.collect();
    const payload = { schemaVersion: this.SCHEMA, appVersion: APP_VERSION.version, projectId: ProjectContext.current, projectName: this.currentName(),
      exportedAt: new Date().toISOString(), exportedBy: AuthManager.getCurrentUser().empNo, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    ExcelSync._triggerDownload(blob, ExcelSync.stdName("프로젝트백업", [], "json", this._stamp()));
    showToast(`💾 [${this.currentName()}] 프로젝트를 백업했습니다. (${this.countText(data)})`);
  },

  // 올린 JSON → 프로젝트 자료 (프로젝트 백업 · 시스템 전체 백업 · 스냅샷 백업 모두 받음)
  _pick(json) {
    const src = json && json.schemaVersion === this.SCHEMA && json.data ? json.data : json;
    if (!src || typeof src !== "object" || !src.projectConfig || !Array.isArray(src.wbsData)) return null;
    const out = {};
    this.BASE_KEYS.concat(this.TASK_KEYS).forEach(k => { if (src[k] !== undefined) out[k] = DataRegistry.clone(src[k]); });
    return out;
  },
  async importProject(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    if (!this.canManage()) return showToast("🚫 프로젝트 복원은 PM · 관리자만 할 수 있습니다.");
    if (/\.(xlsx|xls)$/i.test(file.name)) return this._importExcel(file);
    let json;
    try { json = JSON.parse(await file.text()); } catch (err) { return showToast("⚠️ JSON 파일을 읽지 못했습니다: " + err.message); }
    const data = this._pick(json);
    if (!data) return showToast("⚠️ Project Mgmt 백업 파일이 아닙니다. (프로젝트 백업 · 전체 백업 · 스냅샷 백업 JSON 을 쓰세요)");
    const fromName = json.projectName || (data.projectConfig && data.projectConfig.projectName) || "";
    const other = json.projectId && json.projectId !== ProjectContext.current;
    openConfirmDialog(`[${this.currentName()}] 프로젝트를 백업 파일 [${file.name}] 의 내용으로 바꿉니다.\n` +
      `${other || (fromName && fromName !== this.currentName()) ? `⚠️ 다른 프로젝트(${fromName || json.projectId})의 백업입니다.\n` : ""}` +
      `· 바뀌는 것: 프로젝트 설정 + ${this.countText(data)}\n· 그대로: 프로젝트 이름, 멤버 계정, 다른 프로젝트\n바꾸기 전에 자동 스냅샷을 만듭니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("프로젝트복원직전백업", "ALL", false);
      const keepName = projectConfig.projectName;
      DataRegistry.apply(data, Object.keys(data));
      projectConfig.projectName = keepName;
      StorageManager._afterBulkReplace(`✅ [${this.currentName()}] 프로젝트를 [${file.name}] 백업으로 복원했습니다.`);
    });
  },

  // [v3.9.1] 엑셀 백업(전체 일괄 양식)으로 복원: 이 프로젝트의 업무 · 협업 자료를 비우고 파일 내용으로 바꿈
  async _importExcel(file) {
    let sheets;
    try { sheets = await ExcelSync._parseUploadedFile(file); } catch (err) { return showToast("⚠️ 엑셀 파일을 읽지 못했습니다: " + err.message); }
    const names = sheets.map(sh => String(sh.name || ""));
    const rows = key => { const sh = sheets.find(x => String(x.name || "").includes(key)); return sh ? Math.max(0, sh.rows.filter(r => r.some(c => String(c || "").trim())).length - 1) : 0; };
    if (!names.some(n => n.includes("WBS")) || !names.some(n => n.includes("프로젝트기준정보") || n.includes("서브시스템"))) {
      return showToast("⚠️ 프로젝트 백업 엑셀이 아닙니다. ([프로젝트 설정 > 백업·초기화] 또는 파일 Merge [④ 전체 일괄]에서 다운로드한 엑셀을 쓰세요)");
    }
    const summary = `WBS ${rows("WBS")} · 요구사항 ${rows("요구사항")} · 산출물 ${rows("산출물")} · VOC ${rows("VOC")} · 주간보고 ${rows("주간보고")} · 회의 ${rows("회의록")} · 공지 ${rows("공지")} · 소통 ${rows("소통")}`;
    openConfirmDialog(`[${this.currentName()}] 프로젝트를 엑셀 백업 [${file.name}] 의 내용으로 바꿉니다.\n` +
      `· 바뀌는 것: 프로젝트 설정 + ${summary}\n· 그대로: 프로젝트 이름, 다른 프로젝트 (엑셀의 멤버는 이 프로젝트 참여자로 추가 · 갱신)\n바꾸기 전에 자동 스냅샷을 만듭니다. 계속할까요?`, async () => {
      BackupHistoryManager.createBackupSnapshot("프로젝트복원직전백업", "ALL", false);
      const keepName = projectConfig.projectName;
      this.TASK_KEYS.forEach(k => DataRegistry.set(k, []));
      subsystemsMeta = [];
      SmartMergeCenter._applyCollabSheets(sheets, "ALL");
      await ExcelSync.importMasterWorkbook(file, { silent: true });
      projectConfig.projectName = keepName;
      StorageManager._afterBulkReplace(`✅ [${this.currentName()}] 프로젝트를 엑셀 백업 [${file.name}] 으로 복원했습니다. (${this.countText(this.collect())})`);
    });
  },
  goBackup() {
    if (typeof GShell !== "undefined") GShell.go("tab-merge"); else switchTab("tab-merge");
    SubTabs.show("merge", "backup");
  },

  // ---- Task 정보 초기화 (기본정보 · 기준정보 유지) ----
  clearTasks(ids, label) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    const many = ids.length > 1;
    if (!this.isAdmin()) return showToast("🚫 Task 정보 초기화는 관리자만 할 수 있습니다. (시스템 설정 > 데이터 관리)");
    const names = ids.map(id => (this.projects().find(p => p.id === id) || { name: id }).name);
    const cur = ids.indexOf(ProjectContext.current) !== -1;
    const dirty = cur && SyncManager.dirtyCount ? SyncManager.dirtyCount() : 0;
    openConfirmDialog(`🧹 [Task 정보 초기화] ${label || names.join(", ")}\n` +
      `· 지우는 것: WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 업무 소통\n` +
      `· 그대로: 프로젝트 기본정보 · 프로젝트 설정(도메인 · 서브시스템 · SDLC · 공휴일 · 표준 산출물) · 멤버\n` +
      "지우기 전 자료는 스냅샷(이 브라우저)으로 남깁니다." +
      `${dirty ? `\n⚠️ 지금 화면의 저장하지 않은 변경 ${dirty}건은 버려집니다.` : ""}\n되돌리기 어렵습니다. 계속할까요?`, () => this._clear(ids, names));
  },
  async _clear(ids, names) {
    if (this.isServer()) {
      // 서버에는 백업 파일을 남기지 않음 (용량) → 지우기 전 자료를 복원 지점(브라우저)으로
      for (let i = 0; i < ids.length; i++) {
        const pid = ids[i];
        if (pid === ProjectContext.current) BackupHistoryManager.createBackupSnapshot("Task초기화직전백업", "ALL", false);
        else {
          try { const cur = await ProjectTransfer.load(pid); BackupHistoryManager.createBackupSnapshot("Task초기화직전백업", "ALL", false, { projectId: pid, projectName: names[i], source: cur.data }); } catch (e) {}
        }
      }
      const res = await ServerBackend.request("/api/projects/clear-tasks", { ids }, "POST", 60000);
      if (!res.ok) return showToast("❌ Task 정보 초기화 실패: " + (res.message || ""));
      if (ids.indexOf(ProjectContext.current) !== -1) {
        await SyncManager.refresh(null, { silent: true, skipConfirm: true });
      }
      showToast(`🧹 Task 정보를 초기화했습니다: ${names.join(", ")} (지우기 전 자료는 스냅샷에)`);
      return;
    }
    // 로컬 저장소 방식: 지금 프로젝트는 화면 자료를, 다른 프로젝트는 저장소를 바로 고침
    ids.forEach(pid => {
      if (pid === ProjectContext.current) return;
      const st = LocalBackend._read(pid);
      if (!st) return;
      BackupHistoryManager.createBackupSnapshot("Task초기화직전백업", "ALL", false, { projectId: pid, projectName: (this.projects().find(p => p.id === pid) || {}).name, source: st });
      const revs = LocalBackend._readRevs(pid);
      this.TASK_KEYS.forEach(k => { st[k] = []; revs[k] = {}; });
      LocalBackend._write(pid, st, revs);
    });
    if (ids.indexOf(ProjectContext.current) !== -1) {
      BackupHistoryManager.createBackupSnapshot("Task초기화직전백업", "ALL", false);
      this.TASK_KEYS.forEach(k => DataRegistry.set(k, []));
      StorageManager._afterBulkReplace(`🧹 Task 정보를 초기화했습니다: ${names.join(", ")} (기본정보 · 프로젝트 설정은 그대로)`);
    } else {
      showToast(`🧹 Task 정보를 초기화했습니다: ${names.join(", ")} (기본정보 · 프로젝트 설정은 그대로)`);
    }
  },
  clearCurrentTasks() { this.clearTasks([ProjectContext.current], `[${this.currentName()}] 프로젝트`); },
  clearFromConfig() {
    const sel = document.getElementById("cfgClearTarget");
    const v = sel ? sel.value : ProjectContext.current;
    if (v === "__ALL__") this.clearTasks(this.projects().map(p => p.id), `모든 프로젝트 (${this.projects().length}개)`);
    else this.clearTasks([v], `[${(this.projects().find(p => p.id === v) || { name: v }).name}] 프로젝트`);
  },
  renderConfigTarget() {
    const sel = document.getElementById("cfgClearTarget");
    if (!sel) return;
    const keep = sel.value;
    // [v4.1.0] 초기화는 관리자만 — 모든 프로젝트
    const list = this.projects();
    sel.innerHTML = list.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}${p.id === ProjectContext.current ? " (지금 프로젝트)" : ""}${p.status === "ARCHIVED" ? " (사용 중지)" : ""}</option>`).join("") +
      `<option value="__ALL__">모든 프로젝트 일괄 (Task 정보 초기화만)</option>`;
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : ProjectContext.current;
  },

  // ---- 프로젝트 전체 초기화 (기준정보 포함, 이름 · 기간은 유지) ----
  // [v4.1.0] 초기화는 관리자만 (시스템 설정 > 🗄️ 데이터 관리)
  resetProject() {
    if (!this.isAdmin()) return showToast("🚫 프로젝트 초기화는 관리자만 할 수 있습니다. (시스템 설정 > 데이터 관리)");
    openConfirmDialog(`⚠️ [프로젝트 전체 초기화] [${this.currentName()}]\n프로젝트 설정(도메인 · 서브시스템 · SDLC · 공휴일 · 표준 산출물 · 마일스톤)와 모든 Task 정보를 빈 상태로 되돌립니다.\n` +
      `· 그대로: 프로젝트 이름 · 기간 · 멤버 계정 · 다른 프로젝트\n바꾸기 전에 자동 스냅샷을 만듭니다. 계속할까요?`, () => this._resetCurrent());
  },
  // 이름 · 기간 · 파일 약칭만 두고 기준정보를 빈 상태로
  blankConfig(c) {
    c = c || {};
    const keep = { projectName: c.projectName, projectStartDate: c.projectStartDate, projectEndDate: c.projectEndDate, reportDate: c.reportDate || c.projectStartDate,
      fileCode: c.fileCode, uiTheme: c.uiTheme, systemTitle: c.systemTitle };
    Object.keys(keep).forEach(k => { if (keep[k] === undefined) delete keep[k]; });
    return Object.assign({
      domains: ["기본분야"],
      customSdlcTypes: [DataRegistry.clone(WBSEngine.DEFAULT_SDLC_PRESETS.COMPACT), DataRegistry.clone(WBSEngine.DEFAULT_SDLC_PRESETS.DETAILED)],
      maxDeliverableRounds: 2, weekStartDay: 1, progressBasis: "CALENDAR", holidays: [], milestones: [], channels: ["전체"],
      idPrefixConfig: { wbsPrefix: "WBS", wbsUseSubCode: true, reqPrefix: "REQ", reqUseSubCode: true, vocPrefix: "VOC", vocUseSubCode: true }
    }, keep);
  },
  _resetCurrent() {
      BackupHistoryManager.createBackupSnapshot("프로젝트초기화직전백업", "ALL", false);
      projectConfig = this.blankConfig(projectConfig);
      subsystemsMeta = [];
      standardDeliverablesMeta = [];
      this.TASK_KEYS.forEach(k => DataRegistry.set(k, []));
      if (typeof NoticeCommManager !== "undefined") NoticeCommManager.activeChannel = "전체";
      if (this.isServer()) ServerBackend.request("/api/chat/clear", {});
      StorageManager._afterBulkReplace(`✅ [${this.currentName()}] 프로젝트를 초기 상태로 되돌렸습니다. (이름 · 기간 · 멤버는 그대로)`);
  },

  renderMasterPane() { if (typeof BackupPane !== "undefined") BackupPane.render(); }
};
window.ProjectData = ProjectData;

// =============================================================================
// [v3.8.0] 프로젝트별 설정 화면 공유: [시스템 설정]의 화면·테마 / 보고서 양식 / 소통 채널을 [기준정보]에서도 엶
//  - 같은 화면 한 벌을 연 쪽으로 옮겨 보여 줌 (두 곳에서 고쳐도 같은 프로젝트 설정)
//  - 설정 값은 모두 프로젝트별로 저장 (projectConfig): 테마 · 메뉴 위치 · 밀도 · 역할별 홈 · 보고서 테마 · 파일 이름 · 소통 채널
// =============================================================================
var SharedPanes = {
  MAP: { screen: "ui-screen", report: "ui-report", channel: "ui-channel" },
  _wrap(name) {
    let w = document.getElementById("shared-" + name);
    if (w) return w;
    const host = document.querySelector(`.master-subpane[data-group="config"][data-subpane="${name}"]`);
    if (!host) return null;
    w = document.createElement("div");
    w.id = "shared-" + name;
    w.innerHTML = `<div class="proj-scope-note">🗂️ <b>프로젝트별 설정</b> — 지금 프로젝트 <b class="lbl-project-scope"></b> 에만 적용됩니다. 다른 프로젝트는 그 프로젝트에서 따로 정합니다.</div>`;
    while (host.firstChild) w.appendChild(host.firstChild);
    host.appendChild(w);
    return w;
  },
  // group/name 화면을 열기 전에 공유 화면을 그쪽으로 옮김
  place(group, name) {
    let key = null, target = null;
    if (group === "config" && this.MAP[name]) { key = name; target = document.querySelector(`.master-subpane[data-group="config"][data-subpane="${name}"]`); }
    if (group === "master") { key = Object.keys(this.MAP).find(k => this.MAP[k] === name); if (key) target = document.getElementById("masterSub-" + name); }
    if (!key || !target) return;
    const w = this._wrap(key);
    if (w && w.parentNode !== target) target.appendChild(w);
    if (typeof ProjectData !== "undefined") document.querySelectorAll(".lbl-project-scope").forEach(el => { el.textContent = ProjectData.currentName(); });
    if (key === "screen" && typeof HomeScreenManager !== "undefined") HomeScreenManager.syncConfigUi();
    if (key === "channel" && typeof NoticeCommManager !== "undefined") NoticeCommManager.renderSettingsChannelTable();
    if (typeof LayoutManager !== "undefined" && LayoutManager.syncThemeSelect) LayoutManager.syncThemeSelect();
  }
};
window.SharedPanes = SharedPanes;

// =============================================================================
// [v3.8.0] 화면 테마는 프로젝트별 (projectConfig.uiTheme) — 정하지 않은 프로젝트는 시스템 기본 테마
// =============================================================================
var ThemeScope = {
  global: undefined,
  effective() {
    const pc = typeof projectConfig !== "undefined" ? projectConfig : null;
    return normalizeTheme((pc && pc.uiTheme) || this.global || (typeof defaultTheme === "function" ? defaultTheme() : "urban-slate"));
  },
  apply() {
    if (typeof normalizeTheme !== "function") return;
    const t = this.effective();
    document.body.setAttribute("data-theme", t);
    const sel = document.getElementById("themeSelector");
    if (sel) sel.value = t;
    const sel2 = document.getElementById("cfgThemeSelect");
    if (sel2) sel2.value = t;
    if (typeof UiScale !== "undefined" && UiScale.sync) UiScale.sync();
  }
};
window.ThemeScope = ThemeScope;
