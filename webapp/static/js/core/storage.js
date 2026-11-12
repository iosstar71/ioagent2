// [Project Mgmt] 저장소 관리 · 기준정보 동기화
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =========================================================================
// [v1.0.6] 저장소 관리자: 백업/복원, 샘플 복원, 초기화 (저장은 SyncManager 로 일원화)
// =========================================================================
var StorageManager = {
  // 기존 화면 버튼 호환: 즉시 저장
  saveAll(showAlert = false) {
    return SyncManager.save(null, { notify: showAlert, forceFile: true });
  },

  updateUsageInfo() {
    const el = document.getElementById("storageUsageText");
    if (!el) return;
    const kb = (LocalBackend.usageBytes() / 1024).toFixed(2);
    el.innerText = `현재 로컬 저장 데이터 크기: ${kb} KB (브라우저 허용 최대 ~5MB)`;
  },

  openResetModal() {
    const modal = document.getElementById("storageResetModal");
    if (modal) modal.style.display = "flex";
  },
  closeResetModal() {
    const modal = document.getElementById("storageResetModal");
    if (modal) modal.style.display = "none";
  },
  resetToDefault() { this.openResetModal(); },

  _resetFilters() {
    ["matrixSubsystemFilter", "matrixDomainFilter", "wbsSubsystemFilter", "ganttSubsystemFilter", "delivSubsystemFilter",
     "deliverablesSubsystemFilter", "reqSubsysFilter", "reqSubsystemFilter", "vocSubsysFilter", "vocSubsystemFilter"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "ALL";
    });
  },

  _afterBulkReplace(message) {
    normalizeAndDeduplicateSubsystems();
    if (typeof NoticeCommManager !== "undefined") NoticeCommManager.cleanObsoleteChannelData();
    this._resetFilters();
    populateConfigInputsFromState();
    SmartMergeCenter.syncConfigInputs();
    SyncManager.replaceAllAndSave(message);
  },

  clearNonJsonItems() {
    const chk = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
    const targets = [
      ["chkClearWbs", true, () => { wbsData = []; }, "WBS"],
      ["chkClearSubsystems", false, () => { subsystemsMeta = []; }, "서브시스템 기준정보"],
      ["chkClearDeliverables", true, () => { deliverablesData = []; }, "산출물"],
      ["chkClearReq", true, () => { reqMasterData = []; }, "REQ"],
      ["chkClearVoc", true, () => { vocData = []; }, "VOC"]
    ].filter(t => chk(t[0], t[1]));
    if (!targets.length) {
      showToast("지울 항목을 최소 1개 이상 선택해주세요.");
      return;
    }
    targets.forEach(t => t[2]());
    this.closeResetModal();
    this._afterBulkReplace(`선택 항목(${targets.map(t => t[3]).join(", ")})이 모두 삭제되었습니다.`);
  },

  // 데이터는 보존하고 화면 설정·임시 키만 정리 (암호 정책은 유지)
  clearStorageExceptJsonKey() {
    const keep = new Set([LocalBackend.STORAGE_KEY, LocalBackend.REVS_KEY, DbConnector.CONFIG_STORAGE_KEY,
      AuthManager.STORAGE_POLICY_KEY, AuthManager.STORAGE_AUTOLOCK_KEY]);
    try {
      const rm = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // 프로젝트 데이터(모든 프로젝트)·프로젝트 목록은 보존
        if (k && !keep.has(k) && k.indexOf(LocalBackend.STORAGE_KEY) !== 0 && k.indexOf(LocalBackend.REVS_KEY) !== 0 && k !== ProjectContext.REG_KEY && k !== ProjectContext.KEY) rm.push(k);
      }
      rm.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    this.closeResetModal();
    this.updateUsageInfo();
    showToast("프로젝트 데이터는 보존하고, 화면 설정·임시 저장 항목을 정리했습니다.");
  },

  resetAllStorage() {
    this.closeResetModal();
    openConfirmDialog("⚠️ 주의: 브라우저 로컬 저장소에 저장된 모든 데이터가 삭제되고 처음 상태(빈 프로젝트, admin 하나)로 돌아갑니다. 계속하시겠습니까?", () => {
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      location.reload();
    });
  },

  exportFullSystemBackup() {
    const now = new Date();
    const stamp = BackupHistoryManager._formatTimestamp(now).fileStamp;
    const fullPayload = Object.assign({
      schemaVersion: `AX_PMYS_${APP_VERSION.version}_FULL_BACKUP`,
      exportedAt: now.toISOString(),
      exportedBy: AuthManager.getCurrentUser().empNo,
      systemSettings: {
        theme: document.body.getAttribute("data-theme") || defaultTheme(),
        authPolicy: AuthManager.getAuthPolicy(),
        autoLockMinutes: AuthManager.getAutoLockMinutes(),
        dbConfig: DbConnector.config
      }
    }, DataRegistry.collect());
    const blob = new Blob([JSON.stringify(fullPayload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ExcelSync.stdName("전체백업", [], "json", String(stamp).replace(/[^0-9]/g, "").slice(0, 14));
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`[전체 백업 완료] 시스템 설정, 기준정보, 업무 데이터(공지·소통·회의·주간보고 포함)를 저장했습니다.`);
  },

  async importFullSystemBackup(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object") throw new Error("유효하지 않은 백업 JSON 파일입니다.");
      openConfirmDialog(`선택한 [${file.name}] 백업 파일로 모든 시스템 설정, 기준정보 및 업무 데이터를 복원하시겠습니까?`, () => {
        BackupHistoryManager.createBackupSnapshot("전체복원직전자동백업", "ALL", false);
        DataRegistry.apply(data);
        const ss = data.systemSettings;
        if (ss) {
          if (ss.theme) DataRegistry.set("theme", ss.theme);
          if (ss.authPolicy) AuthManager.setAuthPolicy(ss.authPolicy);
          if (ss.autoLockMinutes !== undefined) AuthManager.setAutoLockMinutes(ss.autoLockMinutes);
        }
        this._afterBulkReplace(`[전체 복원 완료] ${file.name} 백업본이 정상 복원되었습니다.`);
      });
    } catch (err) {
      showToast("통합 백업 복원 오류: " + err.message);
    }
  },

  _applySnapshot(snapshot, meetingFilter) {
    const c = DataRegistry.clone(snapshot);
    DataRegistry.apply(c, ["projectConfig", "subsystemsMeta", "standardDeliverablesMeta", "projectUsers",
      "wbsData", "deliverablesData", "reqMasterData", "vocData", "noticesData", "communicationsData"]);
    weeklyReportsData = Array.isArray(c.weeklyReportsData) ? c.weeklyReportsData : [];
    meetingsData = Array.isArray(c.meetingsData)
      ? c.meetingsData
      : [];
  },

  resetToFactoryBlank() {
    openConfirmDialog(
      "⚠️ [완전 초기화 확인]\n모든 업무 데이터(WBS·요구사항·VOC·산출물·공지·소통·회의·주간보고)와 프로젝트 기준정보를 초기화합니다. (작업자는 admin 하나, 암호 1234 로 초기화)",
      () => this._factoryBlank()
    );
  },
  _factoryBlank() {
      {
        BackupHistoryManager.createBackupSnapshot("완전초기화직전백업", "ALL", false);
        const curYear = new Date().getFullYear();
        projectConfig = {
          systemTitle: APP_VERSION.title,
          projectName: "신규 프로젝트",
          domains: ["기본분야"],
          customSdlcTypes: [
            DataRegistry.clone(WBSEngine.DEFAULT_SDLC_PRESETS.COMPACT),
            DataRegistry.clone(WBSEngine.DEFAULT_SDLC_PRESETS.DETAILED)
          ],
          maxDeliverableRounds: 2,
          projectStartDate: `${curYear}-01-01`,
          projectEndDate: `${curYear}-12-31`,
          weekStartDay: 1,
          reportDate: `${curYear}-01-01`,
          progressBasis: "CALENDAR",
          idPrefixConfig: { wbsPrefix: "WBS", wbsUseSubCode: true, reqPrefix: "REQ", reqUseSubCode: true, vocPrefix: "VOC", vocUseSubCode: true },
          holidays: []
        };
        subsystemsMeta = [];
        standardDeliverablesMeta = [];
        wbsData = [];
        deliverablesData = [];
        reqMasterData = [];
        vocData = [];
        noticesData = [];
        communicationsData = [];
        meetingsData = [];
        weeklyReportsData = [];
        NoticeCommManager.activeChannel = "전체";
        DataRegistry.set("projectUsers", [
          { empNo: "admin", name: "관리자", role: "SYS_ADMIN", subsystem: "ALL", dept: "", pwdHash: "", lang: "ko" }
        ]);
        try {
          localStorage.removeItem(AuthManager.STORAGE_POLICY_KEY);
          localStorage.removeItem(AuthManager.STORAGE_AUTOLOCK_KEY);
        } catch (e) {}
        DataRegistry.set("theme", defaultTheme());
        this._afterBulkReplace("✅ [완전 초기화 완료] 모든 설정, 기준정보 및 업무 데이터가 초기 상태로 초기화되었습니다.");
      }
  }
};

// updateAllSubsystemFilterDropdowns 호출 시 스마트병합 드롭다운도 함께 동기화
// =========================================================================
// [ver1.0.4] 서브시스템 정규화 및 중복 방지 함수
// =========================================================================
function normalizeAndDeduplicateSubsystems() {
  if (!Array.isArray(subsystemsMeta)) subsystemsMeta = [];

  const mapByKey = new Map();
  const canonicalKeyMap = new Map();

  subsystemsMeta.forEach(raw => {
    if (!raw) return;
    const rawCode = String(raw.code || "").trim();
    const rawName = String(raw.name || "").trim();
    const rawFull = String(raw.fullName || "").trim();

    const key = rawCode || rawName;
    if (!key) return;

    let displayDesc = String(raw.desc || "").trim();
    if (rawName && rawName !== key && !displayDesc.includes(rawName)) {
      displayDesc = `[${rawName}] ` + displayDesc;
    }

    if (rawCode) canonicalKeyMap.set(rawCode, key);
    if (rawName) canonicalKeyMap.set(rawName, key);
    if (rawFull) canonicalKeyMap.set(rawFull, key);

    if (!mapByKey.has(key)) {
      mapByKey.set(key, {
        domain: String(raw.domain || "관리공통").trim(),
        code: key,
        name: key,
        type: raw.type === "REQ" ? "REQ" : "SDLC",
        sdlcCode: String(raw.sdlcCode || (key === "PMO" ? "SDLC_PMO" : "SDLC_SMART_MFG")).trim(),
        weight: parseFloat(raw.weight) || 15,
        pm: String(raw.pm || "담당PM").trim(),
        desc: displayDesc
      });
    } else {
      const existing = mapByKey.get(key);
      if (existing.pm === "담당PM" && raw.pm && raw.pm !== "담당PM") existing.pm = raw.pm;
      if (existing.desc.endsWith("과업") && displayDesc && !displayDesc.endsWith("과업")) existing.desc = displayDesc;
      if ((!existing.domain || existing.domain === "미지정분야") && raw.domain) existing.domain = raw.domain;
    }
  });

  subsystemsMeta = Array.from(mapByKey.values());

  const normSys = (s) => {
    const clean = String(s || "").trim();
    return canonicalKeyMap.get(clean) || clean;
  };
  if (Array.isArray(wbsData)) wbsData.forEach(d => { d.system = normSys(d.system); });
  if (Array.isArray(deliverablesData)) deliverablesData.forEach(d => { d.system = normSys(d.system); });
  if (Array.isArray(reqMasterData)) reqMasterData.forEach(r => { r.system = normSys(r.system); });
  if (Array.isArray(vocData)) vocData.forEach(v => { v.system = normSys(v.system); });
}


// =============================================================================
// [ver1.0.4] MasterSyncEngine: 기준정보 및 시스템 설정 실시간 전체 탭 동기화 엔진
// =============================================================================

function populateConfigInputsFromState() {
  const inSys = document.getElementById("cfgSystemTitle");
  const inProj = document.getElementById("cfgProjectName");
  const inStart = document.getElementById("cfgProjectStartDate");
  const inEnd = document.getElementById("cfgProjectEndDate");
  const inWeek = document.getElementById("cfgWeekStartDay");
  const inReport = document.getElementById("reportDateInput");
  const inMaxR = document.getElementById("cfgMaxDeliverableRounds");

  if (inSys && projectConfig.systemTitle) inSys.value = projectConfig.systemTitle;
  if (inProj && projectConfig.projectName) inProj.value = projectConfig.projectName;
  if (inStart && projectConfig.projectStartDate) inStart.value = projectConfig.projectStartDate;
  if (inEnd && projectConfig.projectEndDate) inEnd.value = projectConfig.projectEndDate;
  if (inWeek && projectConfig.weekStartDay !== undefined) inWeek.value = String(projectConfig.weekStartDay);
  if (inReport && projectConfig.reportDate) inReport.value = projectConfig.reportDate;
  if (inMaxR && projectConfig.maxDeliverableRounds !== undefined) inMaxR.value = String(projectConfig.maxDeliverableRounds);
}

var MasterSyncEngine = {
  _isSyncing: false,

  syncAll(notify = true, source = "manual", immediateSave = false) {
    if (this._isSyncing) return;
    this._isSyncing = true;
    try {
      // 1. Read or populate input values between DOM and projectConfig
      // 화면 입력값 → 기준정보 반영은 작업자가 [⚡ 전체 동기화]를 누른 경우에만 수행
      if (source === "manual") {
        this.readAllDomInputs();
      } else {
        populateConfigInputsFromState();
      }

      // 2. Rollup and recalculations in WBSEngine
      if (typeof WBSEngine !== "undefined") {
        WBSEngine.sortAndAutoNumber(wbsData);
        if (WBSEngine.lastIdMap && source !== "data-applied") remapWbsReferences(WBSEngine.lastIdMap);
        WBSEngine.calculatePlanProgress(wbsData, projectConfig.reportDate);
        WBSEngine.rollup(wbsData);
      }

      // 3. Sync all dropdowns across DOM
      if (typeof updateAllSubsystemFilterDropdowns === "function") {
        updateAllSubsystemFilterDropdowns();
      }
      this.syncAllDropdowns();

      // 4. Master tab & Header components
      renderReportDateLabels();
      if (typeof renderProjectTitles === "function") renderProjectTitles();
      if (typeof renderIdPrefixSettings === "function") renderIdPrefixSettings();
      if (typeof renderDomainChips === "function") renderDomainChips();
      if (typeof renderSubsystemsMetaTable === "function") renderSubsystemsMetaTable();
      if (typeof renderCustomSdlcCards === "function") renderCustomSdlcCards();
      if (typeof ReqPhaseManager !== "undefined" && typeof ReqPhaseManager.renderTable === "function") {
        ReqPhaseManager.renderTable();
      }
      if (typeof renderStandardDeliverablesMetaTable === "function") renderStandardDeliverablesMetaTable();
      if (typeof renderHolidays === "function") renderHolidays();
      if (typeof renderProjectUsersTable === "function") renderProjectUsersTable();

      // 5. Operations & Monitoring Tabs
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderPhaseMatrix === "function") renderPhaseMatrix();
      if (typeof renderGantt === "function") renderGantt();
      if (typeof renderWbsTable === "function") renderWbsTable();
      if (typeof renderReqMasterTable === "function") renderReqMasterTable();
      if (typeof renderVocTable === "function") renderVocTable();
      if (typeof renderDeliverablesTable === "function") renderDeliverablesTable();

      // 6. Smart Merge Center (Tab 7)
      if (typeof SmartMergeCenter !== "undefined") {
        if (typeof SmartMergeCenter.populateSourceSubsystems === "function") SmartMergeCenter.populateSourceSubsystems();
        if (typeof SmartMergeCenter.populateTargetSubsystems === "function") SmartMergeCenter.populateTargetSubsystems();
        if (typeof onDomainFilterChanged === "function") {
          onDomainFilterChanged('workDataDomainSelect', 'workDataSubsysSelect');
          onDomainFilterChanged('mergeSourceDomainSelect', 'mergeSourceSubsysSelect');
          onDomainFilterChanged('mergeTargetDomainSelect', 'mergeTargetSubsysSelect');
        }
      }

      // 7. Notices & Comm Plaza (Tab 8)
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.renderAll === "function") {
        NoticeCommManager.renderAll();
      }

      // 8. Weekly Report Manager (Tab 9)
      if (typeof WeeklyReportManager !== "undefined" && typeof WeeklyReportManager.init === "function") {
        WeeklyReportManager.init();
      }
      if (typeof RealtimeChatManager !== "undefined" && typeof RealtimeChatManager.renderChannels === "function") {
        RealtimeChatManager.renderChannels();
      }

      // 8. Layout & Density
      if (typeof LayoutManager !== "undefined" && typeof LayoutManager.adjustSidebar === "function") {
        LayoutManager.adjustSidebar();
      }

      // 9. 변경 알림 (로컬 모드: 자동저장 / 서버 모드: 미저장 표시) — 데이터 적용 직후에는 생략
      if (source !== "data-applied") {
        persistChanges(immediateSave);
      }

      // 11. Toast notification
      if (notify && typeof showToast === "function") {
        showToast("⚡ [실시간 적용 완료] 변경된 기준정보 및 시스템 설정이 모든 탭(WBS, 간트, 대시보드, 매트릭스, REQ, VOC, 산출물, 스마트병합, 소통광장)에 즉시 반영되었습니다.", "success");
      }
    } finally {
      this._isSyncing = false;
    }
  },

  readAllDomInputs() {
    const inSys = document.getElementById("cfgSystemTitle");
    const inProj = document.getElementById("cfgProjectName");
    const inStart = document.getElementById("cfgProjectStartDate");
    const inEnd = document.getElementById("cfgProjectEndDate");
    const inWeek = document.getElementById("cfgWeekStartDay");
    const inReport = document.getElementById("reportDateInput");
    const inMaxR = document.getElementById("cfgMaxDeliverableRounds");

    if (inSys && inSys.value.trim()) projectConfig.systemTitle = inSys.value.trim();
    if (inProj && inProj.value.trim()) projectConfig.projectName = inProj.value.trim();
    if (inStart && inStart.value) projectConfig.projectStartDate = inStart.value;
    if (inEnd && inEnd.value) projectConfig.projectEndDate = inEnd.value;
    if (inWeek && inWeek.value) projectConfig.weekStartDay = parseInt(inWeek.value, 10);
    if (inReport && inReport.value) projectConfig.reportDate = inReport.value;
    if (inMaxR && inMaxR.value) {
      const maxR = parseInt(inMaxR.value, 10);
      projectConfig.maxDeliverableRounds = maxR;
      if (Array.isArray(standardDeliverablesMeta)) {
        standardDeliverablesMeta.forEach(item => {
          for (let r = maxR + 1; r <= 4; r++) item[`round${r}`] = false;
        });
      }
      const activeRounds = getActiveDeliverableRounds();
      if (Array.isArray(deliverablesData)) {
        deliverablesData = deliverablesData.filter(d => activeRounds.includes(d.round));
      }
    }
  },

  syncAllDropdowns() {
    const allSubs = Array.isArray(subsystemsMeta) ? subsystemsMeta.map(s => s.name) : [];
    const dropdownIds = [
      "wbsSubsystemFilter",
      "matrixSubsystemFilter",
      "ganttSubsystemFilter",
      "delivSubsystemFilter",
      "deliverablesSubsystemFilter",
      "reqSubsysFilter",
      "reqSubsystemFilter",
      "vocSubsysFilter",
      "vocSubsystemFilter",
      "chatChannelSelect",
      "newNoticeChannel",
      "editNoticeChannel",
      "commChannelSelect"
    ];

    dropdownIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const curVal = el.value;
      const isChannel = id.includes("Channel");
      const hasAll = el.querySelector("option[value='ALL']") || el.querySelector("option[value='전체']");

      let optsHtml = "";
      if (hasAll) {
        optsHtml += `<option value="${hasAll.value}">${hasAll.textContent}</option>`;
      }
      allSubs.forEach(s => {
        optsHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
      });
      if (isChannel && projectConfig.channels) {
        projectConfig.channels.filter(c => !allSubs.includes(c) && c !== "전체").forEach(c => {
          optsHtml += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
        });
      }
      el.innerHTML = optsHtml;
      if (curVal && el.querySelector(`option[value="${curVal}"]`)) {
        el.value = curVal;
      }
    });
  }
};
window.MasterSyncEngine = MasterSyncEngine;

// [v1.0.6] 로컬 저장소 모드: 같은 PC의 다른 브라우저 탭에서 저장하면 미저장 변경이 없을 때 자동 반영
window.addEventListener("storage", function (e) {
  if (!SyncManager.isLocal() || (e.key !== LocalBackend._skey(ProjectContext.current) && e.key !== LocalBackend.STORAGE_KEY)) return;
  if (SyncManager.isDirty()) return;
  SyncManager.refresh(null, { silent: true, skipConfirm: true });
});
