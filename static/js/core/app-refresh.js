// [Project Mgmt] 프로젝트 기간 · 기준일 · 전체 다시 그리기(rebuildAll)
function renderProjectPeriodLabels() {
  const startDay = WBSEngine.getDayOfWeekText(projectConfig.projectStartDate);
  const endDay = WBSEngine.getDayOfWeekText(projectConfig.projectEndDate);
  const sTag = document.getElementById("cfgProjStartDayTag");
  const eTag = document.getElementById("cfgProjEndDayTag");
  if (sTag) sTag.innerText = `(${startDay})`;
  if (eTag) eTag.innerText = `(${endDay})`;
  const periodStr = `${projectConfig.projectStartDate} (${startDay}) ~ ${projectConfig.projectEndDate} (${endDay})`;
  ["dashProjPeriodText"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = periodStr;
  });
  return periodStr;
}

function updateProjectPeriod(triggerAlert = true) {
  projectConfig.projectStartDate = document.getElementById("cfgProjectStartDate").value;
  projectConfig.projectEndDate = document.getElementById("cfgProjectEndDate").value;
  const periodStr = renderProjectPeriodLabels();
  updateKoreanHolidays(false);
  if (triggerAlert) showToast(`프로젝트 기간이 [${periodStr}] 로 설정되었습니다.`);
}

// WBS ID 재채번 시 다른 데이터의 WBS 참조를 새 ID 로 갱신
//  - 소통 피드 연계 Task(taskId), 작성 중인 주간보고 편집본(wbsId / 제외 목록)
//  - 저장 완료된 과거 주간보고는 작성 시점 기록이므로 변경하지 않음
function remapWbsReferences(idMap) {
  if (!idMap || !idMap.size) return;
  const strip = v => String(v || "").replace(/^#/, "");
  (communicationsData || []).forEach(c => {
    const k = strip(c.taskId);
    if (k && idMap.has(k)) c.taskId = idMap.get(k);
  });
  const WRM = typeof WeeklyReportManager !== "undefined" ? WeeklyReportManager : null;
  const rep = WRM ? WRM.currentWeekReport : null;
  if (rep) {
    const remap = r => {
      ["currentWeekTasks", "nextWeekTasks"].forEach(key => (r[key] || []).forEach(t => { if (t.wbsId && idMap.has(t.wbsId)) t.wbsId = idMap.get(t.wbsId); }));
      ["excludedCurWbsIds", "excludedNxtWbsIds"].forEach(key => { if (Array.isArray(r[key])) r[key] = r[key].map(id => idMap.get(id) || id); });
    };
    remap(rep);
    // 기준본에도 같은 변환을 적용하여, ID 변경만으로 "미저장"이 되지 않도록 함
    try {
      const base = JSON.parse(WRM._draftBase || "null");
      if (base) { remap(base); WRM._draftBase = WRM._canon(base); }
    } catch (e) {}
  }
}

// 화면 곳곳의 기준일 표시 갱신
function renderReportDateLabels() {
  const d = projectConfig.reportDate;
  if (!d) return;
  const dayName = WBSEngine.getDayOfWeekText(d);
  const dayTag = document.getElementById("globalReportDayOfWeek");
  if (dayTag) {
    dayTag.innerText = `(${dayName})`;
    dayTag.className = `day-of-week-tag ${dayName === "토" ? "day-sat" : (dayName === "일" ? "day-sun" : "")}`;
  }
  const rEl = document.getElementById("globalReportDate");
  if (rEl && rEl.value !== d) rEl.value = d;
  // [Workgroup] 주차 (기준정보 > 기본정보 > 주차 표시 방식)
  const wk = typeof WeekFmt !== "undefined" ? WeekFmt.label(d) : "";
  const wEl = document.getElementById("globalReportWeek");
  if (wEl) wEl.textContent = wk;
  document.querySelectorAll(".lbl-current-date").forEach(el => { el.innerText = `${d} (${dayName})${wk ? " · " + wk : ""}`; });
}

function syncGlobalDate(newDate) {
  projectConfig.reportDate = newDate;
  renderReportDateLabels();
  rebuildAll();
  if (typeof SyncManager !== "undefined") SyncManager.saveSettingsQuiet();
}

// 전체 재계산 + 전 화면 재렌더링 (변경 알림 포함)
function rebuildAll(forceImmediateSave = false) {
  const migrated = Migrate.project();   // 예전 자료 형식 변환 (core/migrate.js)
  if (migrated) forceImmediateSave = true;
  MasterSyncEngine.syncAll(false, "rebuildAll", forceImmediateSave);
  if (typeof HomeScreenManager !== "undefined") HomeScreenManager.render();
  // 프로그램이 자료 형식을 바꾼 경우(사용자가 고친 것이 아님)는 묻지 않고 바로 기록
  if (migrated && typeof SyncManager !== "undefined" && SyncManager.isLocal()) setTimeout(() => SyncManager.save(null, { notify: false }), 0);
}
