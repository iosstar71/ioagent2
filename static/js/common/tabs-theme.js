// [Project Mgmt] 탭 이동 · 화면 테마
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// 탭 화면 활성화 (권한 검사는 AuthManager.installTabGuards 에서 단일 래핑)
// ※ 탭 이동 시 화면의 미저장 변경 데이터는 메모리에 그대로 유지됩니다.
function activateTab(tabId) {
  // 회의록·주간보고 화면에서 다른 탭으로 나갈 때만 미저장 확인 (다른 탭 사이 이동은 확인하지 않음)
  const leaving = (document.querySelector(".tab-pane.active") || {}).id;
  if (leaving !== tabId) {
    if (leaving === "tab-meeting" && !MeetingManager.confirmLeave(() => activateTab(tabId))) return;
    if (leaving === "tab-weekly-report" && !WeeklyReportManager.confirmLeave(() => activateTab(tabId))) return;
  }

  document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => {
    const oc = UiEvents.describe(b);
    b.classList.toggle("active", oc.includes(`'${tabId}'`) || oc.includes(`"${tabId}"`));
  });
  const pane = document.getElementById(tabId);
  if (pane) pane.classList.add("active");

  switch (tabId) {
    case "tab-home":
    case "tab-mywork":
      HomeScreenManager.render();
      break;
    case "tab-dashboard":
      updateAllSubsystemFilterDropdowns();
      renderDashboard();
      setTimeout(() => {
        const filterSys = document.getElementById("scurveSystemFilter") ? document.getElementById("scurveSystemFilter").value : "ALL";
        DashboardChart.renderSCurve("scurveCanvas", wbsData, projectConfig.reportDate, projectConfig.weekStartDay, filterSys);
      }, 60);
      break;
    case "tab-matrix":
      renderPhaseMatrix();
      break;
    case "tab-gantt":
      renderGantt();
      break;
    case "tab-weekly-report":
      WeeklyReportManager.init();
      break;
    case "tab-meeting":
      MeetingManager.init();
      break;
    case "tab-notices":
      NoticeCommManager.renderAll();
      break;
    case "tab-merge": {
      if (typeof BackupHistoryManager !== "undefined" && BackupHistoryManager.syncAutoDownloadBox) BackupHistoryManager.syncAutoDownloadBox();
      if (typeof BackupPane !== "undefined") BackupPane.syncTab();
      { const cb = document.getElementById("consolidateBox"); if (cb) cb.style.display = SyncManager.isLocal() ? "" : "none"; }
      SubTabs.restore("merge", "merge");
      const dSel = document.getElementById("workDataDomainSelect");
      if (dSel && (!dSel.options || dSel.options.length === 0)) updateAllSubsystemFilterDropdowns();
      onDomainFilterChanged("workDataDomainSelect", "workDataSubsysSelect");
      updateAllSubsystemFilterDropdowns();
      if (typeof BackupHistoryManager !== "undefined") BackupHistoryManager.renderBackupHistoryTable();
      break;
    }
    case "tab-master":
      renderProjectTitles();
      renderDomainChips();
      renderCustomSdlcCards();
      renderIdPrefixSettings();
      renderSubsystemsMetaTable();
      renderStandardDeliverablesMetaTable();
      renderHolidays();
      renderProjectUsersTable();
      if (typeof MasterSubTabs !== "undefined") MasterSubTabs.restore();
      break;
    case "tab-config":
      StorageManager.updateUsageInfo();
      DbConnector.renderConfigForm();
      HomeScreenManager.syncConfigUi();
      NoticeCommManager.renderSettingsChannelTable();
      SubTabs.restore("config", "screen");
      if (typeof ProjectData !== "undefined") ProjectData.renderConfigTarget();
      document.querySelectorAll(".lbl-current-project-name").forEach(el => { el.textContent = (ProjectContext.info() || {}).name || projectConfig.projectName || ProjectContext.current; });
      if (typeof UiMode !== "undefined") UiMode.syncSelects();
      break;
  }
  if (typeof LayoutManager !== "undefined") LayoutManager.adjustSidebar();
  if (typeof SyncUI !== "undefined") SyncUI.refreshIndicators();
}

function switchTab(tabId) {
  activateTab(tabId);
}

// 테마 5가지 (화면 이름 / 내부 값): Slate(기본) urban-slate · Walnut brown · Navy classic · Obsidian dark · Pop electric
//  — 내부 값은 저장된 프로젝트 호환을 위해 그대로. 예전 값은 가까운 테마로 (Nordic Sage · Green · Matte → Slate, Navy → Navy(classic))
const STANDARD_THEMES = ["urban-slate", "brown", "classic", "dark", "electric"];
function defaultTheme() {
  const t = typeof APP_CONFIG !== "undefined" ? APP_CONFIG.defaultTheme : "";
  return STANDARD_THEMES.indexOf(t) !== -1 ? t : "urban-slate";
}
function normalizeTheme(theme) {
  if (STANDARD_THEMES.indexOf(theme) !== -1) return theme;
  if (theme === "obsidian" || theme === "graphite" || theme === "cyber-neon" || theme === "charcoal") return "dark";
  if (theme === "navy" || theme === "ocean" || theme === "purple") return "classic";
  if (theme === "nordic-sage" || theme === "green" || theme === "emerald" || theme === "forest" || theme === "sage") return "urban-slate";
  if (theme === "sepia" || theme === "mocha") return "brown";
  if (theme === "matte" || theme === "slate") return "urban-slate";
  return defaultTheme();
}

function changeTheme(theme) {
  theme = normalizeTheme(theme);
  // [v3.8.0] 테마는 프로젝트별 (projectConfig.uiTheme)
  projectConfig.uiTheme = theme;
  if (typeof ThemeScope !== "undefined") ThemeScope.apply(); else DataRegistry.set("theme", theme);
  const sel2 = document.getElementById("cfgThemeSelect");
  if (sel2 && sel2.value !== theme) sel2.value = theme;
  if (typeof LayoutManager !== "undefined") LayoutManager.syncThemeSelect();
  renderDashboard();
  renderGantt();
  MeetingManager.renderCalendar();
  persistChanges();
}
