// [IOSTAR-PM] 주간보고
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
var weeklyReportsData = [];

// =========================================================================
// [ver1.0.4 신규] 주간보고 작성 및 서술형 워드 / 엑셀 통합 매니저
// =========================================================================
var WeeklyReportManager = {
  currentWeekReport: null, // 작성 중인 편집본 (작성 완료 시 weeklyReportsData 에 반영)
  _draftBase: "",
  selectedHistoryIdx: 0,
  selectedWeek: null,
  scope: null,            // "ALL" (통합) | "DOMAIN" (분야) | "SYS" (서브시스템)
  scopeValue: "",

  // -------------------------------------------------------------------------
  // 작성 단위(Scope): 일반 사용자 = 담당 서브시스템, PM·관리자·총괄리더 = 통합
  // -------------------------------------------------------------------------
  defaultScope() {
    const u = AuthManager.getCurrentUser();
    const role = AuthManager.normalizeRole(u.role);
    if (role === "MEMBER" && u.subsystem && u.subsystem !== "ALL") return { scope: "SYS", value: u.subsystem };
    return { scope: "ALL", value: "" };
  },
  scopeKey(scope, value) {
    if (scope === "DOMAIN") return `D-${value}`;
    if (scope === "SYS") return `S-${value}`;
    return "ALL";
  },
  scopeLabel(scope, value) {
    if (scope === "DOMAIN") return `분야: ${value}`;
    if (scope === "SYS") return `서브시스템: ${value}`;
    return "통합 (전체)";
  },
  scopeFileLabel(scope, value) {
    if (scope === "DOMAIN") return `분야_${value}`;
    if (scope === "SYS") return `${value}_서브시스템`;
    return "전체통합";
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

  // 금주 주간보고 표시 태스크: a) 금주까지 계획 시작·미완료 b) 실적 진행 중 c) 금주 실적 완료
  isTaskInWeek(task, wStart, wEnd) {
    if (!task || !task.isLeaf) return false;
    const aE = (task.aEnd || "").trim();
    const condA = Boolean(task.pStart && task.pStart <= wEnd && !aE);
    const condB = Boolean(task.aStart && !aE && task.status !== "완료");
    const condC = Boolean(aE && aE >= wStart && aE <= wEnd);
    return condA || condB || condC;
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
          const st = t.aProg >= 100 ? "완료" : (t.aProg > 0 ? "진행중" : "계획");
          let detail = st === "완료"
            ? `${t.name} 완료 (${t.output || "과업 완료"})`
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
      nextWeekSummary: joinSub("nextWeekSummary") || "차주 계획 과업 착수 및 공정률 관리 예정",
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

  populateWeekDropdown() {
    const sel = document.getElementById("wrWeekSelect");
    if (!sel) return;
    const curW = this.listWeek || this.selectedWeek || 1;
    sel.innerHTML = this.getAllWeeks().map(w => `<option value="${w.weekNum}">${escapeHtml(w.fullLabel)}</option>`).join("");
    sel.value = String(curW);
  },

  // 작성 단위 선택: 통합 / 서브시스템별 (v1.0.9: 분야별 보고서 제외)
  populateSubsystemDropdown() {
    const sel = document.getElementById("wrSubsystemSelect");
    if (!sel) return;
    const opt = (v, label) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`;
    sel.innerHTML =
      opt("ALL|", "📊 통합 (전체)") +
      `<optgroup label="서브시스템별">${getAllSubsystemNames().map(s => opt(`SYS|${s}`, `🔧 ${s}`)).join("")}</optgroup>`;
    sel.value = `${this.scope || "ALL"}|${this.scopeValue || ""}`;
  },

  onWeekOrSubsystemChanged() {
    const wSel = document.getElementById("wrWeekSelect");
    const sSel = document.getElementById("wrSubsystemSelect");
    const wNum = wSel && wSel.value ? parseInt(wSel.value, 10) : this.selectedWeek;
    const [scope, value] = (sSel && sSel.value ? sSel.value : "ALL|").split("|");
    if (this.currentWeekReport && !this.confirmLeave(() => this._switchTo(wNum, scope, value))) return;
    this._switchTo(wNum, scope, value);
  },

  _switchTo(wNum, scope, value) {
    this.openReport(wNum, scope, value);
    this.listWeek = parseInt(wNum, 10);
    this.populateWeekDropdown();
    this.populateSubsystemDropdown();
    this.render();
  },

  openSavedReport(id) {
    const r = (weeklyReportsData || []).find(x => x.id === id);
    if (!r) return;
    const sc = this.reportScope(r);
    if (this.currentWeekReport && this.currentWeekReport.id !== id && !this.confirmLeave(() => this._switchTo(r.weekNo, sc.scope, sc.value))) return;
    this._switchTo(r.weekNo, sc.scope, sc.value);
  },

  // [v1.0.7] 보고 주차별 보고서 목록 (선택 주차의 통합·서브시스템 작성 현황, v1.0.9 분야별 제외) / 저장된 전체 주차
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

  _listRow(weekLabel, weekNum, sc, r, isCur, mine) {
    const status = r ? ((r.status || "DONE") === "DONE" ? '<span class="status-tag tag-completed">작성완료</span>' : '<span class="status-tag tag-progress">작성중</span>') : '<span class="status-tag tag-ready">미작성</span>';
    const arg = UiEvents.args(weekNum, sc.scope, String(sc.value || ""));
    return `<tr class="wr-list-row ${isCur ? "active" : ""}" data-click="WeeklyReportManager.openUnit" data-click-args="${arg}">
      <td>${escapeHtml(weekLabel)}</td>
      <td>${sc.scope === "ALL" ? "📊 " : sc.scope === "DOMAIN" ? "🏢 " : "🔧 "}${escapeHtml(this.scopeLabel(sc.scope, sc.value))}${mine ? " ⭐" : ""}</td>
      <td>${escapeHtml(r ? (r.author || "-") : "-")}</td>
      <td style="text-align:center;">${status}</td>
      <td style="text-align:center;">${r ? `${(r.currentWeekTasks || []).length} / ${(r.nextWeekTasks || []).length}` : "-"}</td>
      <td style="font-size:var(--fs-xs, 11px);">${escapeHtml(r ? (r.updatedAt || "-") : "-")}</td>
      <td style="text-align:center;"><button class="btn btn-xs" data-btn="${r ? "nav" : "add"}" data-click="WeeklyReportManager.openUnit" data-click-args="${arg}" data-click-stop="1" title="${r ? "저장된 보고서 보기" : "이 단위의 주간보고를 생성합니다 (WBS 기준 자동 편성)"}">${r ? "보기" : "📝 생성"}</button></td>
    </tr>`;
  },

  renderSavedList() {
    const body = document.getElementById("wrSavedListBody");
    if (!body) return;
    const own = Permission.ownSubsystem();
    const cur = this.currentWeekReport;
    const isCurRow = (weekNum, sc) => !!cur && cur.weekNo === weekNum && (cur.scope || "ALL") === sc.scope && (cur.scopeValue || "") === (sc.value || "");
    const showAll = document.getElementById("wrListShowAll") && document.getElementById("wrListShowAll").checked;
    const summary = document.getElementById("wrListSummary");
    if (showAll) {
      const list = (weeklyReportsData || []).filter(r => r.scope !== "DOMAIN").sort((a, b) => (b.weekNo - a.weekNo) || String(a.id).localeCompare(String(b.id)));
      if (summary) summary.textContent = `저장된 보고서 ${list.length}건`;
      body.innerHTML = list.length
        ? list.map(r => { const sc = this.reportScope(r); return this._listRow(r.weekLabel || ("W" + r.weekNo), r.weekNo, sc, r, isCurRow(r.weekNo, sc), sc.scope === "SYS" && sc.value === own); }).join("")
        : `<tr><td colspan="7" style="text-align:center; padding:14px; color:var(--text-muted);">저장된 주간보고가 없습니다.</td></tr>`;
      return;
    }
    const weeks = this.getAllWeeks();
    const wNum = this.listWeek || this.selectedWeek || (this.findWeekForDate(projectConfig.reportDate) || {}).weekNum;
    const wObj = weeks.find(w => w.weekNum === wNum) || weeks[0];
    if (!wObj) { body.innerHTML = ""; return; }
    let units = this._unitsOfWeek();
    // 일반 사용자: 담당 서브시스템을 맨 위에 표시
    if (!Permission.canEditAllSubsystems()) units = units.sort((a, b) => (b.scope === "SYS" && b.value === own) - (a.scope === "SYS" && a.value === own));
    const rows = units.map(sc => ({ sc, r: this._findSaved(wObj, sc.scope, sc.value) }));
    const done = rows.filter(x => x.r).length;
    if (summary) summary.textContent = `작성 ${done} / ${rows.length} 단위`;
    body.innerHTML = rows.map(({ sc, r }) => this._listRow(wObj.fullLabel, wObj.weekNum, sc, r, isCurRow(wObj.weekNum, sc), sc.scope === "SYS" && sc.value === own)).join("");
  },

  // ---------------------------------------------------------------------------
  // [v1.0.9] 주차 통합 주간보고: 선택 주차에 [작성 완료]된 서브시스템 보고서를 모두 취합하여 1개 통합 보고서로 생성
  //  - 요약·현안: 통합(PM) 보고서가 작성 완료되어 있으면 그 내용을 앞에 두고, 서브시스템 요약을 [서브시스템] 머리말로 이어 붙임 (중복 문장 제외)
  //  - 금주/차주 항목: 작성 완료된 서브시스템 보고서의 항목 + 통합 보고서의 직접 입력 항목·미작성 서브시스템 항목
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

    // [v3.3.0] 작성 완료하지 않은 서브시스템의 내용(과업 · 요약)은 통합 보고서에 넣지 않음
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
      // 통합 보고서 문장 중 미작성 서브시스템 줄([W2] …)은 뺌
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
      // 통합 보고서(PM 작성)는 직접 입력 항목 중 작성 완료된 서브시스템 또는 서브시스템 밖(공통) 항목만
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
    rep.coverageNote = `통합 보고서: ${allRep ? "작성 완료" : "미작성"} / 작성 완료 서브시스템 ${doneSys.length}개${doneSys.length ? ` (${doneSys.join(", ")})` : ""}`
      + (missing.length ? ` / 미작성 ${missing.length}개 (${missing.join(", ")})` : " / 미작성 없음");
    rep.integratedFrom = { done: doneSys, missing, auto: false, allDone: !!allRep };
    // [v3.1.0] 작성 시점 자료: 통합 보고서의 것, 없으면 가장 최근에 작성 완료된 서브시스템 보고서의 것
    const snaps = (allRep && allRep.snapshot ? [allRep.snapshot] : []).concat(sysReps.map(r => r.snapshot).filter(Boolean)).sort((a, b) => String(b.takenAt).localeCompare(String(a.takenAt)));
    if (allRep && allRep.snapshot) rep.snapshot = allRep.snapshot;
    else if (snaps.length) rep.snapshot = snaps[0];
    rep.revision = allRep ? (allRep.revision || 1) : 0;
    rep.status = "DONE";
    return rep;
  },

  // 상단 [엑셀 주간보고] [워드 주간보고 (표 포함)] [워드 주간보고 (표 제외)] : 선택 주차 통합 주간보고 생성
  exportWeek(format, weekNum) {
    const wNum = weekNum || this.listWeek || this.selectedWeek || (this.findWeekForDate(projectConfig.reportDate) || {}).weekNum;
    const rep = this.buildWeekIntegrated(wNum);
    if (!rep) { showToast("⚠️ 보고 주차를 찾을 수 없습니다."); return; }
    if (format === "EXCEL") this.exportExcel(false, rep);
    else this.exportDocx(format !== "WORD_TEXT", rep);
    const f = rep.integratedFrom || {};
    if (f.auto) showToast(`ℹ️ ${rep.weekLabel}: 작성 완료된 주간보고가 없어 WBS 기준 자동 생성본으로 내려받았습니다.`);
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

  // ---- [v1.0.8] 엑셀 셀 한도(32,767자) 대비 보고서 크기 제한 ----
  //  협업 데이터 엑셀 내보내기는 보고서 1건을 원본(JSON) 1개 셀에 담으므로, 보고서 전체 크기를 32,000자 이내로 제한
  MAX_REPORT_CHARS: 32000,
  FIELD_LIMITS: { summary: 3000, issues: 2000, detail: 1000, name: 200 },
  reportSize(rep) {
    const r = Object.assign({}, rep || this.currentWeekReport || {});
    delete r.snapshot; // [v3.1.0] 작성 시점 자료는 크기 계산에서 제외
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
  renderSizeMeter() {
    const el = document.getElementById("wrSizeMeter");
    if (!el || !this.currentWeekReport) return;
    const size = this.reportSize();
    const pct = Math.min(100, Math.round(size / this.MAX_REPORT_CHARS * 100));
    el.className = "wr-size-meter" + (pct >= 100 ? " over" : pct >= 85 ? " warn" : "");
    el.innerHTML = `📏 보고서 크기 <b>${size.toLocaleString()}</b> / ${this.MAX_REPORT_CHARS.toLocaleString()}자 <span class="wr-size-bar"><span style="width:${pct}%"></span></span>`;
    el.title = "엑셀 셀 최대 32,767자 제한에 맞춰 주간보고 1건의 전체 내용을 32,000자 이내로 제한합니다.";
  },
  onSizeInput() {
    this.readInputsIntoCurrentReport();
    this.renderSizeMeter();
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
  _fillAddSelects() {
    [["cur", "wrAddCurWbsSelect"], ["nxt", "wrAddNxtWbsSelect"]].forEach(([kind, id]) => {
      const sel = document.getElementById(id);
      if (!sel || !this.currentWeekReport) return;
      const cands = this._candidateTasks(kind);
      sel.innerHTML = `<option value="">-- 추가할 WBS 과업 선택 (${cands.length}건) --</option>` +
        cands.map(t => `<option value="${escapeHtml(t.id)}">[${escapeHtml(t.system)}] ${escapeHtml(t.id)} ${escapeHtml(t.name)}</option>`).join("");
    });
  },
  addWbsItem(kind) {
    if (!this._checkSize(400)) return;
    const sel = document.getElementById(kind === "cur" ? "wrAddCurWbsSelect" : "wrAddNxtWbsSelect");
    const t = sel && sel.value ? wbsData.find(x => x.id === sel.value) : null;
    if (!t) { showToast("⚠️ 추가할 WBS 과업을 먼저 선택하세요."); return; }
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
    const sys = this.scope === "SYS" ? this.scopeValue : (systems.includes(Permission.ownSubsystem()) ? Permission.ownSubsystem() : (systems[0] || ""));
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

  renderScopeBanner() {
    const el = document.getElementById("wrScopeBanner");
    if (!el || !this.currentWeekReport) return;
    const rep = this.currentWeekReport;
    const writable = this.canWrite(rep);
    const saved = (weeklyReportsData || []).some(r => r.id === rep.id);
    const dirty = this._canon(rep) !== this._draftBase;
    el.innerHTML = `📝 <b>${escapeHtml(rep.weekLabel)}</b> · 작성 단위: <b>${escapeHtml(this.scopeLabel(this.scope, this.scopeValue))}</b>
      · 상태: <b>${saved ? "저장됨" : "신규 (미저장)"}</b>${dirty ? ' · <span style="color:#d97706; font-weight:bold;">● 변경 내용 있음 (작성 완료를 눌러 저장)</span>' : ""}
      ${writable ? "" : ` · <span style="color:#dc2626; font-weight:bold;">🔒 조회 전용 (담당 서브시스템 ${escapeHtml(Permission.ownSubsystem())} 보고서만 저장 가능)</span>`}
      ${rep.snapshot ? `<span class="wr-basis snap" title="지표·요구사항·VOC·회의·Action Item 은 작성 완료 시점 자료로 표시·내려받기 합니다.">📌 작성 완료 시점 자료 (${escapeHtml(rep.snapshot.takenAt)})</span>`
        : `<span class="wr-basis live" title="작성 완료하면 그 시점의 자료가 보고서와 함께 저장됩니다.">⏱ 현재 자료 기준</span>`}
      <div class="wr-docno">문서 번호 <code>${escapeHtml(WeeklyExport.docNo(rep))}</code></div>`;
    const btn = document.getElementById("btnWrComplete");
    if (btn) {
      btn.disabled = !writable;
      btn.style.opacity = writable ? "1" : "0.5";
    }
  },

  // 금주/차주 항목 행 (WBS 연동 항목 / 직접 입력 항목)
  _taskRow(kind, t) {
    const tr = document.createElement("tr");
    const id = escapeHtml(t.id);
    const k = `'${kind}', '${id}'`;
    const sysCell = t.manual
      ? `<select style="font-size:var(--fs-xs, 11px); width:96px;" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "system", "$value")}">${this.scopeSystems(this.scope, this.scopeValue).map(sy => `<option value="${escapeHtml(sy)}" ${sy === t.system ? "selected" : ""}>${escapeHtml(sy)}</option>`).join("")}</select>`
      : `<span class="badge" style="background:#f1f5f9; color:#334155;">${escapeHtml(t.system)}</span>`;
    const nameCell = t.manual
      ? `<input type="text" class="wr-manual-name" maxlength="200" value="${escapeHtml(t.name || "")}" placeholder="보고 항목명 입력" style="width:100%; font-size:var(--fs-xs, 11px); font-weight:bold;" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "name", "$value")}">`
      : escapeHtml(t.name);
    const sched = t.manual
      ? `<input type="date" value="${escapeHtml(t.pEnd || "")}" style="font-size:var(--fs-2xs, 10px); width:120px;" title="목표일 (선택)" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "pEnd", "$value")}">`
      : `<span style="font-size:var(--fs-2xs, 10px); color:#475569; white-space:nowrap; background:#f8fafc; padding:2px 5px; border-radius:3px; border:1px solid #e2e8f0;">📅 ${escapeHtml(t.pStart || "-")} ~ ${escapeHtml(t.pEnd || "-")}</span>`;
    const statusOpts = (kind === "cur" ? ["완료", "진행중", "지연", "계획"] : ["계획", "진행중"])
      .map(v => `<option value="${v}" ${t.status === v ? "selected" : ""}>${v}</option>`).join("");
    const detail = `<textarea class="wr-detail" rows="2" maxlength="1000" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "detail", "$value")}">${escapeHtml(t.detail || "")}</textarea>`;
    // [v3.1.0] 담당자: WBS 과업은 WBS 담당자(보고서에 함께 저장), 직접 입력 항목은 입력
    const ownerCell = t.manual
      ? `<input type="text" maxlength="40" list="wbsOwnerList" value="${escapeHtml(t.owner || "")}" style="width:100%; font-size:var(--fs-xs, 11px);" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "owner", "$value")}">`
      : `<span class="wr-owner">${escapeHtml(t.owner || "-")}</span>`;
    const remove = `<button class="btn btn-xs" data-btn="danger" title="이 항목을 보고서에서 제외" data-click="WeeklyReportManager.removeItem" data-click-args="${UiEvents.args(k)}">✕</button>`;
    const wbsCell = t.manual ? `<span class="wr-manual-tag">직접입력</span>` : `<strong>${escapeHtml(t.wbsId)}</strong>`;
    const lvl = t.manual ? "-" : `L${t.level || 4}`;
    const done = t.manual ? "" : (t.aEnd || (t.aProg >= 100 ? (t.pEnd || "") : ""));
    const schedCell = t.manual ? sched : `<div class="wr-sched">${escapeHtml(t.pStart || "-")} ~ ${escapeHtml(t.pEnd || "-")}${kind === "cur" && done ? `<br><b>완료 ${escapeHtml(done)}</b>` : ""}</div>`;
    const idCell = `${wbsCell}${t.manual ? "" : `<span class="wr-lvl">${lvl}</span>`}`;
    tr.innerHTML = kind === "cur" ? `
      <td>${sysCell}</td><td>${idCell}</td><td style="text-align:left;">${nameCell}</td><td>${ownerCell}</td><td>${schedCell}</td>
      <td>${t.manual ? "-" : (t.pProg ?? 0) + "%"}</td><td><strong>${t.manual ? "-" : (t.aProg ?? 0) + "%"}</strong></td>
      <td><select data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "status", "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 4px;">${statusOpts}</select></td>
      <td>${detail}</td><td style="text-align:center;">${remove}</td>` : `
      <td>${sysCell}</td><td>${idCell}</td><td style="text-align:left;">${nameCell}</td><td>${ownerCell}</td><td>${schedCell}</td>
      <td>${t.manual ? "-" : (t.pProg ?? 0) + "%"}</td>
      <td><select data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "status", "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 4px;">${statusOpts}</select></td>
      <td>${detail}</td><td style="text-align:center;">${remove}</td>`;
    if (t.manual) tr.style.background = "rgba(254,243,199,0.35)";
    return tr;
  },

  render() {
    if (!this.currentWeekReport) return;
    const rep = this.currentWeekReport;
    const scopeSystems = this.scopeSystems(this.scope, this.scopeValue);
    const filterSys = "ALL"; // 보고서 자체가 작성 단위로 구성됨
    const inScope = sys => this.scope === "ALL" || scopeSystems.includes(sys);
    this.renderScopeBanner();
    this.renderSavedList();
    this._fillAddSelects();
    this.renderSizeMeter();
    const setCnt = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setCnt("wrCurCount", (rep.currentWeekTasks || []).length);
    setCnt("wrNxtCount", (rep.nextWeekTasks || []).length);

    const inAuthor = document.getElementById("wrAuthorInput");
    const inCurSum = document.getElementById("wrCurrentSummary");
    const inNxtSum = document.getElementById("wrNextSummary");
    const inIssues = document.getElementById("wrIssuesNotes");

    if (inAuthor) inAuthor.value = rep.author || "";
    if (inCurSum) inCurSum.value = rep.currentWeekSummary || "";
    if (inNxtSum) inNxtSum.value = rep.nextWeekSummary || "";
    if (inIssues) inIssues.value = rep.issuesNotes || "";
    const wObj = this.getAllWeeks().find(w => w.weekNum === rep.weekNo);
    document.querySelectorAll(".lbl-wr-week").forEach(el => { el.textContent = wObj ? wObj.label : ""; });

    const curTbody = document.getElementById("wrCurrentTasksBody");
    if (curTbody) {
      curTbody.innerHTML = "";
      const tasks = (rep.currentWeekTasks || []).filter(t => filterSys === "ALL" || t.system === filterSys);
      if (tasks.length === 0) {
        curTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:20px;">ℹ️ 금주 실적 항목이 없습니다. [➕ WBS 과업 추가] 또는 [➕ 직접 입력 항목 추가]로 등록하세요.</td></tr>`;
      } else {
        tasks.forEach(t => curTbody.appendChild(this._taskRow("cur", t)));
      }
    }

    const nxtTbody = document.getElementById("wrNextTasksBody");
    if (nxtTbody) {
      nxtTbody.innerHTML = "";
      const tasks = (rep.nextWeekTasks || []).filter(t => filterSys === "ALL" || t.system === filterSys);
      if (tasks.length === 0) {
        nxtTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">ℹ️ 차주 계획 항목이 없습니다. [➕ WBS 과업 추가] 또는 [➕ 직접 입력 항목 추가]로 등록하세요.</td></tr>`;
      } else {
        tasks.forEach(t => nxtTbody.appendChild(this._taskRow("nxt", t)));
      }
    // [ver1.0.4] 금주 진행 회의 및 차주 예정 회의 실시간 렌더링
    if (typeof MeetingManager !== "undefined") {
      // [v3.1.0] 작성 완료본은 작성 시점의 회의 목록
      const snapMtg = list => (list || []).map(m => Object.assign({}, m, { agendas: null, summary: m.decisions }));
      const curMtgs = rep.snapshot ? snapMtg(rep.snapshot.meetingsCur) : MeetingManager.getWeeklyMeetings(rep.startDate, rep.endDate);
      const curMtgsBody = document.getElementById("wrCurrentMeetingsBody");
      if (curMtgsBody) {
        curMtgsBody.innerHTML = "";
        const filteredMtgs = curMtgs.filter(m => m.system === "ALL" || inScope(m.system));
        if (filteredMtgs.length === 0) {
          curMtgsBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">ℹ️ 금주 진행된 회의 일정이 없습니다.</td></tr>`;
        } else {
          filteredMtgs.forEach((m, mIdx) => {
            const tr = document.createElement("tr");
            const decs = (m.agendas || []).map(a => `${a.title}: ${a.decision || "합의"}`).join("<br>");
            tr.innerHTML = `
              <td style="text-align:center;">${mIdx + 1}</td>
              <td style="text-align:center;">
                <span class="badge" style="background:${MeetingManager.getSubsystemColor(m.system)}; color:white; font-size:var(--fs-2xs, 10px);">${escapeHtml(m.system)}</span>
              </td>
              <td><strong>${escapeHtml(m.title)}</strong></td>
              <td style="text-align:center; font-size:var(--fs-xs, 11px);">${m.date} (${m.startTime}~${m.endTime})</td>
              <td style="text-align:center; font-size:var(--fs-xs, 11px);">${escapeHtml(m.host || "-")} / ${escapeHtml(m.location || "-")}</td>
              <td style="font-size:var(--fs-xs, 11px); color:#1e293b;">${decs || escapeHtml(m.summary || "정상 완료")}</td>
            `;
            curMtgsBody.appendChild(tr);
          });
        }
      }

      const nxtMtgs = rep.snapshot ? snapMtg(rep.snapshot.meetingsNext) : MeetingManager.getNextWeekMeetings(rep.nextStartDate, rep.nextEndDate);
      const nxtMtgsBody = document.getElementById("wrNextMeetingsBody");
      if (nxtMtgsBody) {
        nxtMtgsBody.innerHTML = "";
        const filteredNxt = nxtMtgs.filter(m => m.system === "ALL" || inScope(m.system));
        if (filteredNxt.length === 0) {
          nxtMtgsBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:var(--text-muted);">ℹ️ 차주 예정된 회의 일정이 없습니다.</td></tr>`;
        } else {
          filteredNxt.forEach((m, mIdx) => {
            const tr = document.createElement("tr");
            const agds = (m.agendas || []).map(a => a.title).join(", ");
            tr.innerHTML = `
              <td style="text-align:center;">${mIdx + 1}</td>
              <td style="text-align:center;">
                <span class="badge" style="background:${MeetingManager.getSubsystemColor(m.system)}; color:white; font-size:var(--fs-2xs, 10px);">${escapeHtml(m.system)}</span>
              </td>
              <td><strong>${escapeHtml(m.title)}</strong></td>
              <td style="text-align:center; font-size:var(--fs-xs, 11px);">${m.date} (${m.startTime}~${m.endTime})</td>
              <td style="text-align:center; font-size:var(--fs-xs, 11px);">${escapeHtml(m.host || "-")} / ${escapeHtml(m.location || "-")}</td>
              <td style="font-size:var(--fs-xs, 11px); color:#475569;">${escapeHtml(agds || m.summary || "공정 협의")}</td>
            `;
            nxtMtgsBody.appendChild(tr);
          });
        }
      }
    }
    }
  },

  readInputsIntoCurrentReport() {
    if (!this.currentWeekReport) return;
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };
    const map = { wrAuthorInput: "author", wrCurrentSummary: "currentWeekSummary", wrNextSummary: "nextWeekSummary", wrIssuesNotes: "issuesNotes" };
    Object.keys(map).forEach(id => {
      const v = val(id);
      if (v !== null) this.currentWeekReport[map[id]] = v;
    });
  },

  // [✅ 작성 완료 (저장)] 편집본을 확정하여 저장
  async completeReport(notify = true) {
    if (!this.currentWeekReport) return false;
    this.readInputsIntoCurrentReport();
    const rep = this.currentWeekReport;
    if (!this.canWrite(rep)) {
      showToast(`⛔ 저장 권한 없음: 일반 사용자는 담당 서브시스템(${Permission.ownSubsystem()}) 주간보고만 저장할 수 있습니다.`);
      return false;
    }
    if (!this._checkSize()) return false;
    const u = AuthManager.getCurrentUser();
    rep.status = "DONE";
    rep.updatedAt = new Date().toISOString().replace("T", " ").substring(0, 19);
    rep.updatedBy = u.empNo || "";
    if (!rep.author) rep.author = u.name || "";
    // [v3.1.0] 판 번호 + 작성 시점 자료 (지난 주간보고는 이 자료로 보여 주고 내려받음)
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

  saveCurrentReport() { return this.completeReport(true); },

  syncWbsTasks() {
    if (!this.currentWeekReport) return;
    this.readInputsIntoCurrentReport();

    const weekNum = this.currentWeekReport.weekNo;
    const weeks = this.getAllWeeks();
    const wObj = weeks.find(w => w.weekNum === weekNum) || weeks[0];
    const freshReport = this.buildReport(wObj, this.scope, this.scopeValue);
    freshReport.status = this.currentWeekReport.status;

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
    // 사용자가 직접 추가한 WBS 과업(added)은 자동 편성 대상이 아니어도 유지하고 일정·진척만 최신화
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
    // [v3.1.0] 판 번호는 유지, 작성 시점 자료는 다시 [작성 완료] 할 때 새로 저장 (그 전까지 내려받기는 현재 자료 기준)
    if (this.currentWeekReport.revision) freshReport.revision = this.currentWeekReport.revision;
    if (this.currentWeekReport.updatedAt) freshReport.updatedAt = this.currentWeekReport.updatedAt;

    this.currentWeekReport = freshReport; // 저장은 [작성 완료] 시 반영

    this.render();
    showToast("🔄 [WBS 과업 다시 불러오기 완료] 최신 WBS 일정·진척을 반영했습니다. (제외 항목·직접 입력 항목 유지 · 작성 완료 시 저장)");
  },

  openHistoryModal() {
    this.readInputsIntoCurrentReport();
    const modal = document.getElementById("wrHistoryModal");
    if (!modal) return;
    this.renderHistoryList();
    modal.style.display = "flex";
  },

  closeHistoryModal() {
    const modal = document.getElementById("wrHistoryModal");
    if (modal) modal.style.display = "none";
  },

    renderHistoryList() {
    const listEl = document.getElementById("wrHistoryList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!Array.isArray(weeklyReportsData) || weeklyReportsData.length === 0) {
      listEl.innerHTML = `
        <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:var(--fs-sm, 12px);">
          ℹ️ 저장된 이전 주간보고서 이력이 없습니다.<br>
          현재 주간보고서를 저장(💾 주간보고 저장)하시면 이력으로 보관됩니다.
        </div>
      `;
      this.renderHistoryPreview(null);
      return;
    }

    if (this.selectedHistoryIdx >= weeklyReportsData.length) {
      this.selectedHistoryIdx = 0;
    }

    weeklyReportsData.forEach((r, idx) => {
      const isSel = idx === this.selectedHistoryIdx;
      const item = document.createElement("div");
      item.style.padding = "10px 12px";
      item.style.marginBottom = "8px";
      item.style.borderRadius = "6px";
      item.style.border = isSel ? "2px solid #2563eb" : "1px solid #e2e8f0";
      item.style.cursor = "pointer";
      item.style.background = isSel ? "#eff6ff" : "#ffffff";
      item.style.transition = "all 0.15s ease";
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <strong style="font-size:calc(12.5px * var(--fs-scale, 1)); color:${isSel ? "#1e40af" : "#1e293b"};">📅 ${escapeHtml(r.weekLabel)}</strong>
          <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:var(--fs-2xs, 10px);">${escapeHtml(r.reportDate || "")}</span>
        </div>
        <div style="font-size:var(--fs-xs, 11px); color:#64748b; margin-bottom:4px;">
          👤 작성: ${escapeHtml(r.author || "PM")} | 갱신: ${escapeHtml(r.updatedAt ? r.updatedAt.substring(0, 10) : "-")}
        </div>
        <div style="font-size:var(--fs-xs, 11px); color:#334155; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
          ${escapeHtml(r.currentWeekSummary || "(요약 없음)")}
        </div>
        <div style="margin-top:6px; display:flex; justify-content:flex-end;">
          <button class="btn btn-outline btn-xs" style="color:#2563eb; border-color:#93c5fd; background:#fff; font-size:calc(10.5px * var(--fs-scale, 1));" data-click="WeeklyReportManager.copyHistoryToCurrent" data-click-args="${UiEvents.args(idx)}" data-click-stop="1" title="이 보고서 내용을 즉시 이번주로 복사">
            📋 바로 복사
          </button>
        </div>
      `;
      item.onclick = () => {
        this.selectedHistoryIdx = idx;
        this.renderHistoryList();
        this.renderHistoryPreview(r);
      };
      listEl.appendChild(item);
    });

    if (weeklyReportsData[this.selectedHistoryIdx]) {
      this.renderHistoryPreview(weeklyReportsData[this.selectedHistoryIdx]);
    }
  },

  renderHistoryPreview(r) {
    const prevEl = document.getElementById("wrHistoryPreview");
    if (!prevEl) return;
    if (!r) {
      prevEl.innerHTML = `
        <div style="padding:40px; text-align:center; color:var(--text-muted);">
          선택된 이전 보고서가 없습니다.
        </div>
      `;
      return;
    }

    const cCount = Array.isArray(r.currentWeekTasks) ? r.currentWeekTasks.length : 0;
    const nCount = Array.isArray(r.nextWeekTasks) ? r.nextWeekTasks.length : 0;

    prevEl.innerHTML = `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <h4 style="margin:0; font-size:var(--fs-md, 14px); color:var(--primary);">📋 [${escapeHtml(r.weekLabel)}] 보고서 상세 미리보기</h4>
          <span class="badge" style="background:#dbeafe; color:#1e40af; font-size:var(--fs-xs, 11px);">과업: 금주 ${cCount}건 / 차주 ${nCount}건</span>
        </div>
        <div style="font-size:var(--fs-xs, 11px); color:#475569; display:flex; gap:16px;">
          <span><b>작성자:</b> ${escapeHtml(r.author || "PM")}</span>
          <span><b>기준일자:</b> ${escapeHtml(r.reportDate || "-")}</span>
          <span><b>금주기간:</b> ${escapeHtml(r.startDate || "")} ~ ${escapeHtml(r.endDate || "")}</span>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:10px;">
          <div style="font-weight:bold; font-size:calc(11.5px * var(--fs-scale, 1)); color:#1e40af; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>🎯</span> 【금주 중점 추진 실적 총괄 요약】
          </div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#1e293b; white-space:pre-wrap; line-height:1.5;">${escapeHtml(r.currentWeekSummary || "(작성된 요약 없음)")}</div>
        </div>

        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:10px;">
          <div style="font-weight:bold; font-size:calc(11.5px * var(--fs-scale, 1)); color:#0369a1; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>🚀</span> 【차주 중점 추진 목표 및 계획 요약】
          </div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#1e293b; white-space:pre-wrap; line-height:1.5;">${escapeHtml(r.nextWeekSummary || "(작성된 요약 없음)")}</div>
        </div>

        <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:10px;">
          <div style="font-weight:bold; font-size:calc(11.5px * var(--fs-scale, 1)); color:#b45309; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <span>⚠️</span> 【주요 현안 및 지원 요청사항】
          </div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#1e293b; white-space:pre-wrap; line-height:1.5;">${escapeHtml(r.issuesNotes || "(현안 및 특이사항 없음)")}</div>
        </div>
      </div>

      <div style="margin-top:14px; text-align:center;">
        <button class="btn btn-primary btn-sm" style="padding:6px 16px; font-weight:bold;" data-click="WeeklyReportManager.copyHistoryToCurrent" data-click-args="${UiEvents.args(this.selectedHistoryIdx)}">
          📋 위 [${escapeHtml(r.weekLabel)}] 보고서 내용을 이번 주로 복사 적용하기
        </button>
      </div>
    `;
  },

  copyHistoryToCurrent(targetIdx) {
    const idx = (targetIdx !== undefined) ? targetIdx : this.selectedHistoryIdx;
    const src = weeklyReportsData[idx];
    if (!src || !this.currentWeekReport) return;

    if (src.currentWeekSummary) this.currentWeekReport.currentWeekSummary = src.currentWeekSummary;
    if (src.nextWeekSummary) this.currentWeekReport.nextWeekSummary = src.nextWeekSummary;
    if (src.issuesNotes) this.currentWeekReport.issuesNotes = src.issuesNotes;
    if (src.author) this.currentWeekReport.author = src.author;

    this.render();
    this.closeHistoryModal();
    showToast(`📋 [내용 복사 완료] [${src.weekLabel}] 보고서 내용이 현재 주차로 복사되었습니다.`);
  },

  // [ver1.0.4] 주간보고 엑셀 내려받기 (XLSX 형태)
  // forceIntegrated=true: 현재 작성 단위와 관계없이 통합(전체) 보고서로 생성 (대시보드 엑셀 보고서)
  // [v3.1.0] 엑셀·워드 내려받기는 WeeklyExport (같은 보고서 모델 · 파일 이름 규칙 · 작성 시점 자료)
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

  exportNarrativeDoc() {
    this.exportDocx(true);
  }
};

window.WeeklyReportManager = WeeklyReportManager;
