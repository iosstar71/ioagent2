// [IOSTAR-PM] 탭 이동 · 화면 테마
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

// [v2.3.1] 테마는 Electric(기본) · Navy · Matte · Graphite(어두운 화면) 4가지 (Standard·Neo 공통)
//  — 이전 버전의 다른 테마 값(Teal 등)은 가까운 테마로
const STANDARD_THEMES = ["electric", "navy", "green", "brown", "matte", "dark"];
function defaultTheme() {
  const t = typeof APP_CONFIG !== "undefined" ? APP_CONFIG.defaultTheme : "";
  return STANDARD_THEMES.indexOf(t) !== -1 ? t : "electric";
}
function normalizeTheme(theme) {
  if (STANDARD_THEMES.indexOf(theme) !== -1) return theme;
  if (theme === "graphite" || theme === "cyber-neon" || theme === "charcoal") return "dark";
  if (theme === "ocean" || theme === "purple") return "navy";
  if (theme === "emerald" || theme === "forest") return "green";
  if (theme === "sepia" || theme === "mocha") return "brown";
  return defaultTheme();
}

function changeTheme(theme) {
  theme = normalizeTheme(theme);
  DataRegistry.set("theme", theme);
  const sel2 = document.getElementById("cfgThemeSelect");
  if (sel2 && sel2.value !== theme) sel2.value = theme;
  if (typeof LayoutManager !== "undefined") LayoutManager.syncThemeSelect();
  renderDashboard();
  renderGantt();
  MeetingManager.renderCalendar();
  persistChanges();
}
