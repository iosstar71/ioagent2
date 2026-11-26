// [Project Mgmt] 저장소 관리 · 기준정보 동기화
// =========================================================================
// 저장소 관리자: 백업/복원, 샘플 복원, 초기화 (저장은 SyncManager 로 일원화)
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
          { empNo: "admin", name: "관리자", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" },
    { empNo: "admin2", name: "관리자2", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" }
        ]);
        try {
          AppStore.removeItem(AuthManager.STORAGE_POLICY_KEY);
          AppStore.removeItem(AuthManager.STORAGE_AUTOLOCK_KEY);
        } catch (e) {}
        DataRegistry.set("theme", defaultTheme());
        this._afterBulkReplace("✅ [완전 초기화 완료] 모든 설정, 프로젝트 설정 및 업무 데이터가 초기 상태로 초기화되었습니다.");
      }
  }
};

// updateAllSubsystemFilterDropdowns 호출 시 스마트병합 드롭다운도 함께 동기화
// =========================================================================
// 서브시스템 정규화 및 중복 방지 함수
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
      if (existing.desc.endsWith("Task") && displayDesc && !displayDesc.endsWith("Task")) existing.desc = displayDesc;
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
// MasterSyncEngine: 기준정보 및 시스템 설정 실시간 전체 탭 동기화 엔진
// =============================================================================

function populateConfigInputsFromState() {
  const inSys = document.getElementById("cfgSystemTitle");
  const inProj = document.getElementById("cfgProjectName");
  const inStart = document.getElementById("cfgProjectStartDate");
  const inEnd = document.getElementById("cfgProjectEndDate");
  const inWeek = document.getElementById("cfgWeekStartDay");
  const inReport = document.getElementById("reportDateInput");
  const inMaxR = document.getElementById("cfgMaxDeliverableRounds");

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

      // 4. 머리말 · 공통 표시
      renderReportDateLabels();
      if (typeof renderProjectTitles === "function") renderProjectTitles();
      if (typeof NoticeCommManager !== "undefined") NoticeCommManager.updateHeaderBadge();
      if (typeof RealtimeChatManager !== "undefined" && typeof RealtimeChatManager.renderChannels === "function") RealtimeChatManager.renderChannels();
      // 주간보고 상태 (기준일 주차 · 열린 보고) — 다른 화면 · 보고서가 읽음
      if (typeof WeeklyReportManager !== "undefined" && typeof WeeklyReportManager.init === "function") WeeklyReportManager.init();
      // 5. 화면: 보이는 화면만 다시 그림 (다른 화면은 열 때 그림 — common/tabs-theme.js ScreenRender)
      if (typeof ScreenRender !== "undefined") ScreenRender.refreshVisible();

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
        showToast("⚡ [실시간 적용 완료] 변경된 프로젝트 설정 및 시스템 설정이 모든 탭(WBS, 간트, 대시보드, 매트릭스, REQ, VOC, 산출물, 파일 Merge, 소통광장)에 즉시 반영되었습니다.", "success");
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

// 로컬 저장소 모드: 같은 PC의 다른 브라우저 탭에서 저장하면 미저장 변경이 없을 때 자동 반영
window.addEventListener("storage", function (e) {
  if (!SyncManager.isLocal() || (e.key !== LocalBackend._skey(ProjectContext.current) && e.key !== LocalBackend.STORAGE_KEY)) return;
  if (SyncManager.isDirty()) return;
  SyncManager.refresh(null, { silent: true, skipConfirm: true });
});
