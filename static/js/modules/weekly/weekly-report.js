// [Project Mgmt] 주간보고
var weeklyReportsData = [];

// =========================================================================
// 주간보고 작성 및 서술형 워드 / 엑셀 통합 매니저
// =========================================================================
var WeeklyReportManager = {
  currentWeekReport: null, // 작성 중인 편집본 (작성 완료 시 weeklyReportsData 에 반영)
  _draftBase: "",
  selectedHistoryIdx: 0,
  selectedWeek: null,
  scope: null,            // "ALL" (종합) | "DOMAIN" (도메인) | "SYS" (서브시스템)
  scopeValue: "",

  // -------------------------------------------------------------------------
  // 작성 단위(Scope): 일반 작업자 = 담당 서브시스템, PM·관리자·총괄리더 = 통합
  // -------------------------------------------------------------------------
  defaultScope() {
    const u = AuthManager.getCurrentUser();
    const role = AuthManager.normalizeRole(u.role);
    if (role === "MEMBER" && !SubsysList.isAll(u.subsystem)) return { scope: "SYS", value: SubsysList.parse(u.subsystem)[0] };   // 여러 개 담당이면 첫 서브시스템부터
    return { scope: "ALL", value: "" };
  },
  scopeKey(scope, value) {
    if (scope === "DOMAIN") return `D-${value}`;
    if (scope === "SYS") return `S-${value}`;
    return "ALL";
  },
  scopeLabel(scope, value) {
    if (scope === "DOMAIN") return `도메인: ${value}`;
    if (scope === "SYS") return `서브시스템: ${value}`;
    return "종합 (전체)";
  },
  scopeSystems(scope, value) {
    const all = getAllSubsystemNames();
    if (scope === "DOMAIN") return (subsystemsMeta || []).filter(s => (s.domain || "") === value).map(s => s.name);
    if (scope === "SYS") return [value];
    return all;
  },
  reportScope(r) { return { scope: r.scope || "ALL", value: r.scopeValue || "" }; },
  reportId(weekObj, scope, value) { return `WR-${weekObj.year}-W${weekObj.weekNum}-${this.scopeKey(scope, value)}`; },
  canWrite(rep) {
    return Permission.canWritePart("weeklyReportsData", rep.id, rep);
  },

  init() {
    if (!this.scope) {
      const d = this.defaultScope();
      this.scope = d.scope;
      this.scopeValue = d.value;
    }
    if (!this.currentWeekReport) {
      const wObj = this.findWeekForDate(projectConfig.reportDate);
      this.selectedWeek = wObj ? wObj.weekNum : 1;
      this.openReport(this.selectedWeek, this.scope, this.scopeValue);
    }
    // 목록의 처음 주차 = 기준일의 주차 (기준일을 바꾸면 그 주차로 다시 맞춤)
    const baseW = this.findWeekForDate(projectConfig.reportDate);
    if (baseW && this._listBase !== projectConfig.reportDate) { this.listWeek = baseW.weekNum; this._listBase = projectConfig.reportDate; }
    if (!this.listWeek) this.listWeek = this.selectedWeek;
    this.populateWeekDropdown();
    this.populateSubsystemDropdown();
    this.render();
  },

  getAllWeeks() {
    const sDate = projectConfig.projectStartDate || "2027-01-01";
    const eDate = projectConfig.projectEndDate || "2027-12-31";
    const wDay = projectConfig.weekStartDay !== undefined ? projectConfig.weekStartDay : 5;
    return WBSEngine.getProjectWeeks(sDate, eDate, wDay);
  },

  findWeekForDate(dateStr) {
    const weeks = this.getAllWeeks();
    const target = dateStr || projectConfig.reportDate;
    return weeks.find(w => target >= w.startDate && target <= w.endDate) || weeks[weeks.length - 1] || weeks[0];
  },

  // 금주 주간보고 표시 태스크 (최하위 Task):
  //  a) 계획 기간이 금주에 걸치고 금주 전에 끝나지 않은 Task
  //  b) 지연 Task (미완료) — 계획종료일이 금주보다 앞인데 미완료인 오래 밀린 Task 포함
  //  c) 실적 진행 중 (금주까지 시작, 미완료)  d) 금주에 실적 완료
  isTaskInWeek(task, wStart, wEnd) {
    if (!task || !task.isLeaf) return false;
    const aE = (task.aEnd || "").trim();
    const doneBefore = Boolean(aE && aE < wStart);
    const condA = Boolean(task.pStart && task.pEnd && task.pStart <= wEnd && task.pEnd >= wStart && !doneBefore);
    const condB = Boolean(!aE && (task.status === "지연" || this.isOverdue(task, wStart)));
    const condC = Boolean(task.aStart && task.aStart <= wEnd && !aE);
    const condD = Boolean(aE && aE >= wStart && aE <= wEnd);
    return condA || condB || condC || condD;
  },

  // 오래 밀린 Task: 계획종료일이 그 주 시작보다 앞인데 미완료
  isOverdue(task, wStart) {
    return Boolean(task && !String(task.aEnd || "").trim() && (parseFloat(task.aProg) || 0) < 100 && task.pEnd && wStart && task.pEnd < wStart);
  },
  overdueDays(task, wEnd) {
    return Math.max(0, Math.round((new Date(wEnd + "T00:00:00") - new Date(task.pEnd + "T00:00:00")) / 86400000));
  },

  // 차주 표시 태스크: 계획시작일이 차주까지이고 금주까지 실적 미완료
  isNextWeekTask(task, nStart, nEnd, wEnd) {
    if (!task || !task.isLeaf) return false;
    const aE = (task.aEnd || "").trim();
    const cutoff = wEnd || (nStart ? WBSEngine.addDays(nStart, -1) : "");
    return Boolean(task.pStart && task.pStart <= nEnd && (!aE || (cutoff ? aE > cutoff : true)));
  },

  // 같은 주차의 서브시스템 보고서(작성 완료본)에서 상세 내용 취합
  _subsystemReportsOfWeek(weekNo) {
    return (weeklyReportsData || []).filter(r => r.weekNo === weekNo && r.scope === "SYS");
  },

  buildReport(weekObj, scope, value) {
    const weeks = this.getAllWeeks();
    const nextWeekObj = weeks[weekObj.weekNum] || {
      startDate: WBSEngine.addDays(weekObj.endDate, 1),
      endDate: WBSEngine.addDays(weekObj.endDate, 7)
    };
    const systems = this.scopeSystems(scope, value);
    const subReports = scope === "SYS" ? [] : this._subsystemReportsOfWeek(weekObj.weekNum).filter(r => systems.includes(r.scopeValue));
    const subDetail = new Map();
    subReports.forEach(r => {
      (r.currentWeekTasks || []).forEach(t => subDetail.set("C" + t.wbsId, t));
      (r.nextWeekTasks || []).forEach(t => subDetail.set("N" + t.wbsId, t));
    });

    const curTasks = [];
    const nxtTasks = [];
    systems.forEach(sys => {
      wbsData.filter(t => t.system === sys && t.isLeaf).forEach(t => {
        if (this.isTaskInWeek(t, weekObj.startDate, weekObj.endDate)) {
          const late = this.isOverdue(t, weekObj.startDate);
          const st = t.aProg >= 100 ? "완료" : (late || t.status === "지연" ? "지연" : (t.aProg > 0 ? "진행중" : "계획"));
          let detail = st === "완료"
            ? `${t.name} 완료 (${t.output || "Task 완료"})`
            : late ? `⚠️ ${t.name} 지연 — 계획종료 ${t.pEnd} (${this.overdueDays(t, weekObj.endDate)}일 경과), 현재 진척률 ${parseFloat(t.aProg) || 0}%`
            : st === "지연" ? `${t.name} 지연 (계획 ${t.pProg}% · 실적 ${parseFloat(t.aProg) || 0}%)`
            : (st === "진행중" ? `${t.name} 진행 중 (현재 진척률 ${t.aProg}%)` : `${t.name} 착수 준비`);
          const sub = subDetail.get("C" + t.id);
          curTasks.push({
            id: `CT-${sys}-${t.id}`, system: sys, wbsId: t.id, level: t.level, name: t.name, owner: t.owner || "",
            pProg: t.pProg, aProg: t.aProg, pStart: t.pStart, pEnd: t.pEnd, aStart: t.aStart, aEnd: t.aEnd,
            status: sub ? sub.status : st,
            detail: sub && sub.detail ? sub.detail : detail
          });
        }
        if (this.isNextWeekTask(t, nextWeekObj.startDate, nextWeekObj.endDate, weekObj.endDate)) {
          const sub = subDetail.get("N" + t.id);
          nxtTasks.push({
            id: `NT-${sys}-${t.id}`, system: sys, wbsId: t.id, level: t.level, name: t.name, owner: t.owner || "",
            pProg: t.pProg, pStart: t.pStart, pEnd: t.pEnd, status: "계획",
            detail: sub && sub.detail ? sub.detail : `차주 ${t.name} 추진 예정`
          });
        }
      });
    });

    const joinSub = field => subReports.filter(r => r[field]).map(r => `[${r.scopeValue}] ${r[field]}`).join("\n");
    const u = AuthManager.getCurrentUser();
    return {
      id: this.reportId(weekObj, scope, value),
      scope, scopeValue: value || "",
      status: "DRAFT",
      year: weekObj.year,
      weekNo: weekObj.weekNum,
      weekLabel: weekObj.fullLabel,
      startDate: weekObj.startDate,
      endDate: weekObj.endDate,
      nextStartDate: nextWeekObj.startDate,
      nextEndDate: nextWeekObj.endDate,
      reportDate: projectConfig.reportDate,
      author: u.name || "",
      authorEmpNo: u.empNo || "",
      currentWeekSummary: joinSub("currentWeekSummary") || `${weekObj.weekNum}주차 WBS 계획 대비 실적 정상 추진`,
      nextWeekSummary: joinSub("nextWeekSummary") || "차주 계획 Task 착수 및 공정률 관리 예정",
      issuesNotes: joinSub("issuesNotes") || "특이사항 없음",
      currentWeekTasks: curTasks,
      nextWeekTasks: nxtTasks,
      updatedAt: ""
    };
  },

  _canon(r) {
    if (!r) return "";
    const c = Object.assign({}, r);
    delete c.updatedAt;
    delete c.snapshot;
    delete c.revision;
    return JSON.stringify(c);
  },

  // 주차 + 작성 단위의 보고서를 편집본으로 열기 (저장본 없으면 새로 생성)
  openReport(weekNum, scope, value) {
    const weeks = this.getAllWeeks();
    const wObj = weeks.find(w => w.weekNum === parseInt(weekNum, 10)) || weeks[0];
    if (!wObj) return;
    const id = this.reportId(wObj, scope, value);
    const saved = (weeklyReportsData || []).find(r => r.id === id)
      || (scope === "ALL" ? (weeklyReportsData || []).find(r => r.weekNo === wObj.weekNum && !r.scope) : null);
    this.currentWeekReport = saved
      ? Object.assign({ scope, scopeValue: value || "", status: "DONE" }, JSON.parse(JSON.stringify(saved)), { id })
      : this.buildReport(wObj, scope, value);
    this._draftBase = this._canon(this.currentWeekReport);
    this.selectedWeek = wObj.weekNum;
    this.scope = scope;
    this.scopeValue = value || "";
  },

  isDirty() {
    if (!this.currentWeekReport) return false;
    const pane = document.getElementById("tab-weekly-report");
    if (pane && pane.classList.contains("active")) this.readInputsIntoCurrentReport(true);
    return this._canon(this.currentWeekReport) !== this._draftBase;
  },

  // 미저장 상태에서 다른 보고서/화면 이동 시 [저장 / 무시 / 취소]
  confirmLeave(onProceed) {
    if (!this.isDirty()) return true;
    SyncUI.ask(
      "📝 주간보고 미저장",
      `작성 중인 주간보고 [${this.currentWeekReport.weekLabel} · ${this.scopeLabel(this.scope, this.scopeValue)}] 이 저장되지 않았습니다.\n저장하시겠습니까?`,
      [
        { id: "save", label: "💾 저장 (작성 완료)", cls: "btn-primary" },
        { id: "ignore", label: "무시 (변경 취소)", cls: "btn-danger" },
        { id: "cancel", label: "계속 작성", cls: "btn-secondary" }
      ]
    ).then(async choice => {
      if (choice === "cancel") { this.populateWeekDropdown(); this.populateSubsystemDropdown(); return; }
      if (choice === "save") {
        const ok = await this.completeReport(false);
        if (!ok) return;
      } else {
        this._draftBase = this._canon(this.currentWeekReport);
        this.currentWeekReport = null;
      }
      if (typeof onProceed === "function") onProceed();
    });
    return false;
  },

  onDataReloaded() {
    if (!this.currentWeekReport) return;
    if (!this.isDirty()) this.openReport(this.selectedWeek, this.scope, this.scopeValue);
    const pane = document.getElementById("tab-weekly-report");
    if (pane && pane.classList.contains("active")) {
      this.populateWeekDropdown();
      this.populateSubsystemDropdown();
      this.render();
    }
  },


  _switchTo(wNum, scope, value) {
    this.openReport(wNum, scope, value);
    this.listWeek = parseInt(wNum, 10);
    this.populateWeekDropdown();
    this.populateSubsystemDropdown();
    this.render();
  },


  // 보고 주차별 보고서 목록 (선택 주차의 종합·서브시스템 작성 현황, v1.0.9 분야별 제외) / 저장된 전체 주차
  listWeek: null,

  _unitsOfWeek() {
    const units = [{ scope: "ALL", value: "" }];
    getAllSubsystemNames().forEach(sys => units.push({ scope: "SYS", value: sys }));
    return units;
  },

  _findSaved(weekObj, scope, value) {
    const id = this.reportId(weekObj, scope, value);
    return (weeklyReportsData || []).find(r => r.id === id)
      || (scope === "ALL" ? (weeklyReportsData || []).find(r => r.weekNo === weekObj.weekNum && !r.scope) : null);
  },

  // ---------------------------------------------------------------------------
  // 주차 종합 주간보고: 선택 주차에 [작성 완료]된 서브시스템 보고서를 모두 취합하여 1개 종합 보고서로 생성
  //  - 요약·현안: 통합(PM) 보고서가 작성 완료되어 있으면 그 내용을 앞에 두고, 서브시스템 요약을 [서브시스템] 머리말로 이어 붙임 (중복 문장 제외)
  //  - 금주/차주 항목: 작성 완료된 서브시스템 보고서의 항목 + 종합 보고서의 직접 입력 항목·미작성 서브시스템 항목
  //  - 작성 완료 보고서가 하나도 없으면 WBS 기준 자동 생성본으로 대체 (작성 현황에 표시)
  // ---------------------------------------------------------------------------
  buildWeekIntegrated(weekNum) {
    const weeks = this.getAllWeeks();
    const wObj = weeks.find(w => w.weekNum === parseInt(weekNum, 10));
    if (!wObj) return null;
    const isDone = r => r && (r.status || "DONE") === "DONE";
    const order = getAllSubsystemNames();
    const sysReps = order.map(sy => this._findSaved(wObj, "SYS", sy)).filter(isDone);
    const allSaved = this._findSaved(wObj, "ALL", "");
    const allRep = isDone(allSaved) ? allSaved : null;
    const doneSys = sysReps.map(r => r.scopeValue);
    const missing = order.filter(sy => !doneSys.includes(sy));
    const auto = this.buildReport(wObj, "ALL", "");
    const rep = JSON.parse(JSON.stringify(auto));
    rep.id = this.reportId(wObj, "ALL", "") + "-INTEGRATED";
    rep.status = "DONE";
    rep.integrated = true;

    // 작성 완료하지 않은 서브시스템의 내용(과업 · 요약)은 종합 보고서에 넣지 않음
    if (!sysReps.length && !allRep) {
      rep.currentWeekTasks = [];
      rep.nextWeekTasks = [];
      rep.currentWeekSummary = "";
      rep.nextWeekSummary = "";
      rep.issuesNotes = "";
      rep.coverageNote = `작성 완료된 주간보고가 없습니다. (미작성 서브시스템 ${order.length}개: ${order.join(", ")}) — 각 서브시스템 주간보고를 작성 완료하면 그 내용이 들어갑니다.`;
      rep.integratedFrom = { done: [], missing: order, auto: true };
      return rep;
    }

    const join = field => {
      const parts = [];
      // 종합 보고서 문장 중 미작성 서브시스템 줄([W2] …)은 뺌
      const head = allRep && allRep[field] ? String(allRep[field]).split(/\r?\n/).filter(l => {
        const m = l.match(/^\s*\[([^\]]+)\]/);
        return !m || doneSys.includes(m[1]) || !order.includes(m[1]);
      }).join("\n").trim() : "";
      if (head) parts.push(head);
      sysReps.forEach(r => {
        const txt = String(r[field] || "").trim();
        if (txt && !head.includes(txt)) parts.push(`[${r.scopeValue}] ${txt}`);
      });
      return parts.join("\n");
    };
    const sortKey = t => { const i = order.indexOf(t.system); return i < 0 ? order.length : i; };
    const collect = key => {
      const list = [];
      sysReps.forEach(r => (r[key] || []).forEach(t => list.push(Object.assign({}, t))));
      // 종합 보고서(PM 작성)는 직접 입력 항목 중 작성 완료된 서브시스템 또는 서브시스템 밖(공통) 항목만
      if (allRep) (allRep[key] || []).forEach(t => { if (t.manual && (doneSys.includes(t.system) || !order.includes(t.system))) list.push(Object.assign({}, t)); });
      return list.map((t, i) => ({ t, i })).sort((x, y) => (sortKey(x.t) - sortKey(y.t)) || (x.i - y.i)).map(x => x.t);
    };

    rep.currentWeekSummary = join("currentWeekSummary");
    rep.nextWeekSummary = join("nextWeekSummary");
    rep.issuesNotes = join("issuesNotes");
    rep.currentWeekTasks = collect("currentWeekTasks");
    rep.nextWeekTasks = collect("nextWeekTasks");
    rep.author = (allRep && allRep.author) || (AuthManager.getCurrentUser().name || "");
    const stamps = sysReps.concat(allRep ? [allRep] : []).map(r => r.updatedAt || "").filter(Boolean).sort();
    rep.updatedAt = stamps[stamps.length - 1] || "";
    rep.coverageNote = `종합 보고서: ${allRep ? "작성 완료" : "미작성"} / 작성 완료 서브시스템 ${doneSys.length}개${doneSys.length ? ` (${doneSys.join(", ")})` : ""}`
      + (missing.length ? ` / 미작성 ${missing.length}개 (${missing.join(", ")})` : " / 미작성 없음");
    rep.integratedFrom = { done: doneSys, missing, auto: false, allDone: !!allRep };
    // 작성 시점 자료: 종합 보고서의 것, 없으면 가장 최근에 작성 완료된 서브시스템 보고서의 것
    const snaps = (allRep && allRep.snapshot ? [allRep.snapshot] : []).concat(sysReps.map(r => r.snapshot).filter(Boolean)).sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
    if (allRep && allRep.snapshot) rep.snapshot = allRep.snapshot;
    else if (snaps.length) rep.snapshot = snaps[0];
    rep.revision = allRep ? (allRep.revision || 1) : 0;
    rep.status = "DONE";
    return rep;
  },

  // 상단 [엑셀 주간보고] [워드 주간보고 (표 포함)] [워드 주간보고 (표 제외)] : 선택 주차 종합 주간보고 생성
  exportWeek(format, weekNum) {
    const wNum = weekNum || this.listWeek || this.selectedWeek || (this.findWeekForDate(projectConfig.reportDate) || {}).weekNum;
    const rep = this.buildWeekIntegrated(wNum);
    if (!rep) { showToast("⚠️ 보고 주차를 찾을 수 없습니다."); return; }
    if (format === "EXCEL") this.exportExcel(false, rep);
    else this.exportDocx(format !== "WORD_TEXT", rep);
    const f = rep.integratedFrom || {};
    if (f.auto) showToast(`ℹ️ ${rep.weekLabel}: 작성 완료된 주간보고가 없어 WBS 기준 자동 생성본으로 다운로드했습니다.`);
  },

  onListWeekChanged() {
    const sel = document.getElementById("wrWeekSelect");
    this.listWeek = sel ? parseInt(sel.value, 10) : this.listWeek;
    const all = document.getElementById("wrListShowAll");
    if (all) all.checked = false;
    this.renderSavedList();
  },
  shiftWeek(delta) {
    const weeks = this.getAllWeeks();
    const cur = this.listWeek || this.selectedWeek || 1;
    const next = Math.min(weeks.length, Math.max(1, cur + delta));
    const sel = document.getElementById("wrWeekSelect");
    if (sel) sel.value = String(next);
    this.onListWeekChanged();
  },
  goToReportWeek() {
    const w = this.findWeekForDate(projectConfig.reportDate);
    if (!w) return;
    const sel = document.getElementById("wrWeekSelect");
    if (sel) sel.value = String(w.weekNum);
    this.onListWeekChanged();
  },
  // 목록에서 보고서 선택 → 상세 열기 (미저장 변경 시 저장/무시 확인)
  openUnit(weekNum, scope, value) {
    const cur = this.currentWeekReport;
    if (cur && cur.weekNo === weekNum && (cur.scope || "ALL") === scope && (cur.scopeValue || "") === (value || "")) {
      const panel = document.getElementById("wrDetailPanel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (cur && !this.confirmLeave(() => this.openUnit(weekNum, scope, value))) return;
    this._switchTo(weekNum, scope, value);
    const panel = document.getElementById("wrDetailPanel");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  discardChanges() {
    if (!this.currentWeekReport) return;
    this.openReport(this.selectedWeek, this.scope, this.scopeValue);
    this.render();
    showToast("↩️ 저장하지 않은 주간보고 변경 내용을 취소했습니다.");
  },

  // ---- 엑셀 셀 한도(32,767자) 대비 보고서 크기 제한 ----
  //  협업 데이터 엑셀 내보내기는 보고서 1건을 원본(JSON) 1개 셀에 담으므로, 보고서 전체 크기를 32,000자 이내로 제한
  MAX_REPORT_CHARS: 32000,
  FIELD_LIMITS: { summary: 3000, issues: 2000, detail: 1000, name: 200 },
  reportSize(rep) {
    const r = Object.assign({}, rep || this.currentWeekReport || {});
    delete r.snapshot; // 작성 시점 자료는 크기 계산에서 제외
    return JSON.stringify(r).length;
  },
  _checkSize(extra = 0, notify = true) {
    const size = this.reportSize() + extra;
    if (size > this.MAX_REPORT_CHARS) {
      if (notify) showToast(`⛔ 주간보고 크기 한도 초과: ${size.toLocaleString()} / ${this.MAX_REPORT_CHARS.toLocaleString()}자 (엑셀 셀 한도 32,767자). 상세 내용을 줄이거나 항목을 정리하세요.`);
      return false;
    }
    return true;
  },

  // ---- 항목 추가 / 제외 ----
  _listOf(kind) {
    const rep = this.currentWeekReport;
    if (!rep) return [];
    const key = kind === "cur" ? "currentWeekTasks" : "nextWeekTasks";
    if (!Array.isArray(rep[key])) rep[key] = [];
    return rep[key];
  },
  _excludedOf(kind) {
    const rep = this.currentWeekReport;
    const key = kind === "cur" ? "excludedCurWbsIds" : "excludedNxtWbsIds";
    if (!Array.isArray(rep[key])) rep[key] = [];
    return rep[key];
  },
  removeItem(kind, itemId) {
    this.readInputsIntoCurrentReport();
    const list = this._listOf(kind);
    const idx = list.findIndex(t => t.id === itemId);
    if (idx < 0) return;
    const t = list[idx];
    list.splice(idx, 1);
    if (t.wbsId && !t.manual) {
      const ex = this._excludedOf(kind);
      if (!ex.includes(t.wbsId)) ex.push(t.wbsId);
    }
    this.render();
    showToast(`➖ [${t.wbsId || "직접입력"}] ${t.name} 항목을 ${kind === "cur" ? "금주 실적" : "차주 계획"}에서 제외했습니다. (작성 완료 시 저장)`);
  },
  _candidateTasks(kind) {
    const rep = this.currentWeekReport;
    const systems = this.scopeSystems(this.scope, this.scopeValue);
    const used = new Set(this._listOf(kind).map(t => t.wbsId).filter(Boolean));
    return wbsData.filter(t => t.isLeaf && systems.includes(t.system) && !used.has(t.id));
  },
  addWbsItem(kind) {
    if (!this._checkSize(400)) return;
    const sel = document.getElementById(kind === "cur" ? "wrAddCurWbsSelect" : "wrAddNxtWbsSelect");
    const t = sel && sel.value ? wbsData.find(x => x.id === sel.value) : null;
    if (!t) { showToast("⚠️ 추가할 WBS Task를 먼저 선택하세요."); return; }
    this.readInputsIntoCurrentReport();
    const list = this._listOf(kind);
    if (kind === "cur") {
      const st = t.aProg >= 100 ? "완료" : (t.aProg > 0 ? "진행중" : "계획");
      list.push({ id: `CT-${t.system}-${t.id}`, added: true, system: t.system, wbsId: t.id, level: t.level, name: t.name, owner: t.owner || "", pProg: t.pProg, aProg: t.aProg, pStart: t.pStart, pEnd: t.pEnd, aStart: t.aStart, aEnd: t.aEnd, status: st, detail: "" });
    } else {
      list.push({ id: `NT-${t.system}-${t.id}`, added: true, system: t.system, wbsId: t.id, level: t.level, name: t.name, owner: t.owner || "", pProg: t.pProg, pStart: t.pStart, pEnd: t.pEnd, status: "계획", detail: "" });
    }
    const ex = this._excludedOf(kind);
    const i = ex.indexOf(t.id);
    if (i >= 0) ex.splice(i, 1);
    this.render();
  },
  addManualItem(kind) {
    this.readInputsIntoCurrentReport();
    if (!this._checkSize(300)) return;
    const systems = this.scopeSystems(this.scope, this.scopeValue);
    const sys = this.scope === "SYS" ? this.scopeValue : (systems.find(s => Permission.canWriteSubsystem(s) && !Permission.canEditAllSubsystems()) || systems[0] || "");
    this._listOf(kind).push({
      id: `MT-${kind}-${Date.now().toString(36)}`, manual: true, system: sys, wbsId: "", level: "",
      name: "", pStart: "", pEnd: "", status: kind === "cur" ? "진행중" : "계획", detail: ""
    });
    this.render();
    setTimeout(() => {
      const body = document.getElementById(kind === "cur" ? "wrCurrentTasksBody" : "wrNextTasksBody");
      const inputs = body ? body.querySelectorAll("input.wr-manual-name") : [];
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 30);
  },
  updateItem(kind, itemId, field, value) {
    const t = this._listOf(kind).find(x => x.id === itemId);
    if (!t) return;
    const prev = t[field];
    t[field] = typeof value === "string" ? value.trim() : value;
    if (!this._checkSize()) {
      t[field] = prev;
      this.render();
      return;
    }
    this.renderSizeMeter();
  },

  // [✅ 작성 완료 (저장)] 편집본을 확정하여 저장
  async completeReport(notify = true) {
    if (!this.currentWeekReport) return false;
    this.readInputsIntoCurrentReport();
    const rep = this.currentWeekReport;
    if (!this.canWrite(rep)) {
      showToast(`⛔ 저장 권한 없음: 멤버는 담당 서브시스템(${SubsysList.label(Permission.ownSubsystem())}) 주간보고만 저장할 수 있습니다.`);
      return false;
    }
    if (!this._checkSize()) return false;
    const u = AuthManager.getCurrentUser();
    rep.status = "DONE";
    rep.updatedAt = new Date().toISOString().replace("T", " ").substring(0, 19);
    rep.updatedBy = u.empNo || "";
    // 작성자: 직접 고쳐 적지 않았다면 저장한 사람 이름으로 (다른 사람이 고쳐 저장하면 작성자도 바뀜)
    if (!rep.author || rep.author === this._openedAuthor) rep.author = u.name || rep.author || "";
    this._openedAuthor = rep.author;
    // 판 번호 + 작성 시점 자료 (지난 주간보고는 이 자료로 보여 주고 내려받음)
    rep.revision = (parseInt(rep.revision, 10) || 0) + 1;
    rep.snapshot = WeeklyExport.takeSnapshot(rep);
    const copy = JSON.parse(JSON.stringify(rep));
    const idx = weeklyReportsData.findIndex(r => r.id === rep.id);
    if (idx !== -1) weeklyReportsData[idx] = copy;
    else weeklyReportsData.push(copy);
    const res = await SyncManager.save(["weeklyReportsData"], { notify: false });
    if (!(res.ok || res.nothing)) return false;
    this._draftBase = this._canon(this.currentWeekReport);
    this.render();
    if (notify) showToast(`✅ [주간보고 작성 완료] ${rep.weekLabel} · ${this.scopeLabel(this.scope, this.scopeValue)} 보고서가 저장되었습니다.`);
    return true;
  },


  // [최신 데이터 가져오기]: 지금 자료(Task · 회의 · Action Item · 지표)로 다시 읽음. 작성 완료된 보고서면 작성 완료를 취소
  //  (화면 [새로고침]은 저장된 상태를 다시 읽을 뿐 — 작성 완료본은 그때 자료(스냅샷) 그대로 보임)
  syncWbsTasks(confirmed) {
    if (!this.currentWeekReport) return;
    const wasDone = (this.currentWeekReport.status || "DRAFT") === "DONE" && (weeklyReportsData || []).some(r => r.id === this.currentWeekReport.id);
    if (wasDone && confirmed !== true) {
      openConfirmDialog("이 주간보고는 작성 완료 상태입니다.\n최신 데이터를 가져오면 작성 완료가 취소되고, Task · 회의 · Action Item · 지표를 지금 자료로 다시 가져옵니다.\n(직접 쓴 요약 · 현안 · 상세 내용과 직접 입력 항목은 그대로 둡니다)\n\n내용을 확인 · 수정한 뒤 [작성 완료]를 다시 눌러 주세요. 계속하시겠습니까?", () => this.syncWbsTasks(true));
      return;
    }
    this.readInputsIntoCurrentReport();

    const weekNum = this.currentWeekReport.weekNo;
    const weeks = this.getAllWeeks();
    const wObj = weeks.find(w => w.weekNum === weekNum) || weeks[0];
    const freshReport = this.buildReport(wObj, this.scope, this.scopeValue);
    freshReport.status = wasDone ? "DRAFT" : this.currentWeekReport.status;
    if (wasDone) {   // 저장된 완료본도 '작성 중'으로 — 스냅샷은 지움 ([작성 완료] 때 다시 찍음)
      const saved = (weeklyReportsData || []).find(r => r.id === this.currentWeekReport.id);
      if (saved) { saved.status = "DRAFT"; delete saved.snapshot; if (typeof persistChanges === "function") persistChanges(); }
    }

    const existingCurDetails = new Map();
    (this.currentWeekReport.currentWeekTasks || []).forEach(t => {
      if (t.wbsId) existingCurDetails.set(t.wbsId, { detail: t.detail, status: t.status });
    });
    const existingNxtDetails = new Map();
    (this.currentWeekReport.nextWeekTasks || []).forEach(t => {
      if (t.wbsId) existingNxtDetails.set(t.wbsId, { detail: t.detail });
    });

    freshReport.currentWeekTasks.forEach(t => {
      if (existingCurDetails.has(t.wbsId)) {
        const ex = existingCurDetails.get(t.wbsId);
        if (ex.detail) t.detail = ex.detail;
        if (ex.status) t.status = ex.status;
      }
    });

    freshReport.nextWeekTasks.forEach(t => {
      if (existingNxtDetails.has(t.wbsId)) {
        const ex = existingNxtDetails.get(t.wbsId);
        if (ex.detail) t.detail = ex.detail;
      }
    });

    // 제외한 WBS 항목은 다시 넣지 않고, 직접 입력 항목은 그대로 유지
    const exCur = this._excludedOf("cur").slice();
    const exNxt = this._excludedOf("nxt").slice();
    // 작업자가 직접 추가한 WBS 과업(added)은 자동 편성 대상이 아니어도 유지하고 일정·진척만 최신화
    const keepAdded = (list, freshList) => (list || []).filter(t => t.added && t.wbsId && !freshList.some(f => f.wbsId === t.wbsId)).map(t => {
      const w = wbsData.find(x => x.id === t.wbsId);
      return w ? Object.assign({}, t, { name: w.name, level: w.level, owner: w.owner || "", pProg: w.pProg, aProg: w.aProg, pStart: w.pStart, pEnd: w.pEnd, aStart: w.aStart, aEnd: w.aEnd }) : t;
    });
    const curFresh = freshReport.currentWeekTasks.filter(t => !exCur.includes(t.wbsId));
    const nxtFresh = freshReport.nextWeekTasks.filter(t => !exNxt.includes(t.wbsId));
    freshReport.currentWeekTasks = curFresh
      .concat(keepAdded(this.currentWeekReport.currentWeekTasks, curFresh))
      .concat((this.currentWeekReport.currentWeekTasks || []).filter(t => t.manual));
    freshReport.nextWeekTasks = nxtFresh
      .concat(keepAdded(this.currentWeekReport.nextWeekTasks, nxtFresh))
      .concat((this.currentWeekReport.nextWeekTasks || []).filter(t => t.manual));
    freshReport.excludedCurWbsIds = exCur;
    freshReport.excludedNxtWbsIds = exNxt;
    freshReport.currentWeekSummary = this.currentWeekReport.currentWeekSummary;
    freshReport.nextWeekSummary = this.currentWeekReport.nextWeekSummary;
    freshReport.issuesNotes = this.currentWeekReport.issuesNotes;
    freshReport.author = this.currentWeekReport.author;
    // 판 번호는 유지, 작성 시점 자료는 다시 [작성 완료] 할 때 새로 저장 (그 전까지 내려받기는 현재 자료 기준)
    if (this.currentWeekReport.revision) freshReport.revision = this.currentWeekReport.revision;
    if (this.currentWeekReport.updatedAt) freshReport.updatedAt = this.currentWeekReport.updatedAt;

    this.currentWeekReport = freshReport; // 저장은 [작성 완료] 시 반영

    this.render();
    if (wasDone && typeof this.renderSavedList === "function") this.renderSavedList();
    showToast(wasDone ? "🔄 작성 완료가 취소되었습니다. 최신 데이터로 다시 작성한 뒤 [작성 완료]를 눌러 주세요." : "🔄 [최신 데이터 가져오기 완료] 최신 WBS · 회의 · Action Item 을 반영했습니다. (제외 항목 · 직접 입력 항목 유지 · 작성 완료 시 저장)");
  },

  // 주간보고 엑셀 내려받기 (XLSX 형태)
  // forceIntegrated=true: 현재 작성 단위와 관계없이 통합(전체) 보고서로 생성 (대시보드 엑셀 보고서)
  // 엑셀·워드 내려받기는 WeeklyExport (같은 보고서 모델 · 파일 이름 규칙 · 작성 시점 자료)
  exportExcel(forceIntegrated = false, repOverride = null) {
    if (!repOverride && !this.currentWeekReport) this.init();
    if (!repOverride) this.readInputsIntoCurrentReport();
    let rep = repOverride || this.currentWeekReport;
    if (!repOverride && forceIntegrated && rep.scope !== "ALL") rep = this.buildWeekIntegrated(rep.weekNo) || rep;
    return WeeklyExport.download(rep, "EXCEL");
  },

  exportDocx(useTables = true, repOverride = null) {
    if (!repOverride && !this.currentWeekReport) this.init();
    if (!repOverride) this.readInputsIntoCurrentReport();
    const rep = repOverride || this.currentWeekReport;
    return WeeklyExport.download(rep, useTables ? "WORD" : "WORD_TEXT");
  },

};

window.WeeklyReportManager = WeeklyReportManager;
