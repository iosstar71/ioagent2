// [Project Mgmt] 탭 이동 · 화면 테마
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

  ScreenRender.onShow(tabId);
  if (typeof LayoutManager !== "undefined") LayoutManager.adjustSidebar();
  if (typeof SyncUI !== "undefined") SyncUI.refreshIndicators();
}

// =============================================================================
// 화면 그리기 표 — 탭을 열 때와 자료가 바뀌었을 때(MasterSyncEngine.syncAll) 같은 함수를 씀
//  자료가 바뀌면 보이는 화면만 다시 그리고, 다른 화면은 열 때 그린다 (화면을 더하면 여기 한 줄)
// =============================================================================
var ScreenRender = {
  MAP: {
    "tab-home": () => HomeScreenManager.render(),
    "tab-mywork": () => HomeScreenManager.render(),
    "tab-dashboard": () => {
      updateAllSubsystemFilterDropdowns();
      renderDashboard();
      setTimeout(() => {
        const f = document.getElementById("scurveSystemFilter");
        DashboardChart.renderSCurve("scurveCanvas", wbsData, projectConfig.reportDate, projectConfig.weekStartDay, f ? f.value : "ALL");
      }, 60);
    },
    "tab-matrix": () => renderPhaseMatrix(),
    "tab-gantt": () => renderGantt(),
    "tab-wbs": () => renderWbsTable(),
    "tab-req": () => renderReqMasterTable(),
    "tab-voc": () => renderVocTable(),
    "tab-deliverables": () => renderDeliverablesTable(),
    "tab-weekly-report": () => {
      WeeklyReportManager.init();
      if (typeof ReportTabs !== "undefined") { ReportTabs.sync(); if (ReportTabs.cur === "deck") ReportTabs.renderDeck(); }
    },
    "tab-meeting": () => MeetingManager.init(),
    "tab-notices": () => NoticeCommManager.renderAll(),
    "tab-merge": () => {
      if (typeof BackupHistoryManager !== "undefined" && BackupHistoryManager.syncAutoDownloadBox) BackupHistoryManager.syncAutoDownloadBox();
      if (typeof BackupPane !== "undefined") BackupPane.syncTab();
      SubTabs.restore("merge", "merge");
      updateAllSubsystemFilterDropdowns();
      ["populateSourceSubsystems", "populateTargetSubsystems"].forEach(m => { if (typeof SmartMergeCenter !== "undefined" && typeof SmartMergeCenter[m] === "function") SmartMergeCenter[m](); });
      onDomainFilterChanged("workDataDomainSelect", "workDataSubsysSelect");
      onDomainFilterChanged("mergeSourceDomainSelect", "mergeSourceSubsysSelect");
      onDomainFilterChanged("mergeTargetDomainSelect", "mergeTargetSubsysSelect");
      if (typeof BackupHistoryManager !== "undefined") BackupHistoryManager.renderBackupHistoryTable();
    },
    "tab-master": () => {
      renderProjectTitles();
      renderDomainChips();
      renderCustomSdlcCards();
      renderIdPrefixSettings();
      BaselineUI.render();
      renderSubsystemsMetaTable();
      if (typeof ReqPhaseManager !== "undefined" && ReqPhaseManager.renderTable) ReqPhaseManager.renderTable();
      renderStandardDeliverablesMetaTable();
      renderHolidays();
      renderProjectUsersTable();
      if (typeof MasterSubTabs !== "undefined") MasterSubTabs.restore();
    },
    "tab-config": () => {
      StorageManager.updateUsageInfo();
      DbConnector.renderConfigForm();
      HomeScreenManager.syncConfigUi();
      NoticeCommManager.renderSettingsChannelTable();
      SubTabs.restore("config", "screen");
      if (typeof ProjectData !== "undefined") ProjectData.renderConfigTarget();
      document.querySelectorAll(".lbl-current-project-name").forEach(el => { el.textContent = (ProjectContext.info() || {}).name || projectConfig.projectName || ProjectContext.current; });
      if (typeof UiMode !== "undefined") UiMode.syncSelects();
    }
  },
  // 표가 큰 화면은 자료가 바뀌었을 때만 열 때 다시 그림 (스크롤 위치 유지). 나머지는 열 때마다 그림
  ONLY_WHEN_STALE: ["tab-wbs", "tab-req", "tab-voc", "tab-deliverables"],
  _stale: new Set(["tab-wbs", "tab-req", "tab-voc", "tab-deliverables"]),
  current() { return (document.querySelector(".tab-pane.active") || {}).id; },
  render(tabId) {
    const f = this.MAP[tabId]; if (!f) return;
    this._stale.delete(tabId); f();
  },
  // 탭을 열 때
  onShow(tabId) {
    if (this.ONLY_WHEN_STALE.indexOf(tabId) !== -1 && !this._stale.has(tabId)) return;
    this.render(tabId);
  },
  // 자료가 바뀌었을 때: 보이는 화면만 다시 그리고, 다른 화면은 열 때 그림
  refreshVisible() {
    const cur = this.current();
    Object.keys(this.MAP).forEach(t => { if (t !== cur) this._stale.add(t); });
    this.render(cur);
  }
};
window.ScreenRender = ScreenRender;

function switchTab(tabId) {
  activateTab(tabId);
}

// =============================================================================
// 테마 등록부 — 테마 목록은 여기 한 곳에만 둔다 (머리말 견본 버튼 · 설정 화면 선택 상자는 이 목록으로 그림)
//  테마를 더하려면: ① 아래 THEMES 에 한 줄 ② style.css 에 [data-theme="값"] 색 블록과 견본 색(.g-swatch[data-theme-pick="값"] i)
//  id 는 저장된 프로젝트 값이라 바꾸지 않는다 (화면 이름만 바꿈). lightHeader = 밝은 머리말 → 무채색 로고
// =============================================================================
var THEMES = [
  { id: "urban-slate", name: "Slate", note: "기본", lightHeader: true },
  { id: "brown", name: "Walnut", note: "따뜻한 원목", lightHeader: true },
  { id: "navy", name: "Navy", note: "블루", lightHeader: true },
  { id: "classic", name: "Classic", note: "예전 스타일", emoji: true },
  { id: "dark", name: "Obsidian", note: "다크" },
  { id: "electric", name: "Pop", note: "팝아트" }
];
// 예전 버전에서 쓰던 값 → 지금 테마
var THEME_ALIASES = {
  obsidian: "dark", graphite: "dark", "cyber-neon": "dark", charcoal: "dark",
  ocean: "classic", purple: "classic",
  "nordic-sage": "urban-slate", green: "urban-slate", emerald: "urban-slate", forest: "urban-slate", sage: "urban-slate", matte: "urban-slate", slate: "urban-slate",
  sepia: "brown", mocha: "brown"
};
const STANDARD_THEMES = THEMES.map(t => t.id);
function defaultTheme() {
  const t = typeof APP_CONFIG !== "undefined" ? APP_CONFIG.defaultTheme : "";
  return STANDARD_THEMES.indexOf(t) !== -1 ? t : STANDARD_THEMES[0];
}
function normalizeTheme(theme) {
  if (STANDARD_THEMES.indexOf(theme) !== -1) return theme;
  return THEME_ALIASES[theme] || defaultTheme();
}
// 견본 버튼 · 선택 상자를 등록부로 그림 (index.html 에는 빈 자리만)
var ThemePickers = {
  label(t) { return `${t.name} (${t.note})`; },
  render() {
    document.querySelectorAll("[data-theme-swatches]").forEach(box => {
      box.innerHTML = THEMES.map(t => `<button type="button" class="g-swatch" data-theme-pick="${t.id}" data-click="UiScale.pickTheme" data-click-args='["${t.id}"]'><i></i>${t.name}</button>`).join("");
    });
    document.querySelectorAll("select[data-theme-select]").forEach(sel => {
      const keep = sel.value;
      sel.innerHTML = THEMES.map(t => `<option value="${t.id}">${this.label(t)}</option>`).join("");
      if (keep && STANDARD_THEMES.indexOf(keep) !== -1) sel.value = keep;
    });
  }
};
ThemePickers.render();

function changeTheme(theme) {
  theme = normalizeTheme(theme);
  // 테마는 프로젝트별 (projectConfig.uiTheme)
  projectConfig.uiTheme = theme;
  if (typeof ThemeScope !== "undefined") ThemeScope.apply(); else DataRegistry.set("theme", theme);
  const sel2 = document.getElementById("cfgThemeSelect");
  if (sel2 && sel2.value !== theme) sel2.value = theme;
  if (typeof LayoutManager !== "undefined") LayoutManager.syncThemeSelect();
  renderDashboard();
  renderGantt();
  MeetingManager.renderCalendar();
  persistChanges();
  if (typeof SyncManager !== "undefined") SyncManager.saveSettingsQuiet();
}
