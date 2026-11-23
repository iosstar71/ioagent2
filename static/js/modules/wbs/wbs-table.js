// [Project Mgmt] WBS 표 · 담당자 · 행 편집
// -------------------------------------------------------------
// [요건 5] WBS 테이블 렌더링 (서브시스템 필터, 레벨단위 접기, 리스트 선택, 개별 실적반영, 컴팩트 너비)
// -------------------------------------------------------------
// 화면의 선택 상자 값 (없으면 기본값)
function wbsVal(id, def) {
  const el = /** @type {HTMLSelectElement} */ (document.getElementById(id));
  return el && el.value ? el.value : def;
}

function renderWbsTable() {
  const tbody = document.getElementById("wbsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  WbsOwner.fillList();
  WbsFold.apply();
  let outOfRangeCount = 0;

  const dFilter = wbsVal("wbsDomainFilter", "ALL");
  const sysFilter = wbsVal("wbsSubsystemFilter", "ALL");
  const maxLvl = parseInt(wbsVal("wbsMaxLevelFilter", "5"), 10) || 5;
  const stFilter = wbsVal("wbsStatusFilter", "ALL");
  // 상태 조회: 해당 상태의 최하위 Task(선행 지연은 경고가 있는 Task) + 고른 레벨까지의 상위 Task 를 묶음 머리로
  const predWarn = WBSEngine.predWarnings(wbsData, projectConfig.reportDate);
  const view = WbsStatusView.rows(wbsData, stFilter, maxLvl, predWarn);
  // 단계별 조회: 조회 범위 서브시스템들의 단계 목록 → 고른 단계에 해당하는 Task 와 그 상위 Task
  const scopeSystems = (subsystemsMeta || []).map(m => m.name).filter(n => (sysFilter === "ALL" || n === sysFilter) && (dFilter === "ALL" || WBSEngine.getSubsystemDomain(n) === dFilter));
  const phase = WbsPhase.fill(scopeSystems);
  const phaseSet = phase !== "ALL" ? WbsPhase.matchSet(wbsData, phase) : null;
  const delayCnt = wbsData.filter(t => t.isLeaf && t.status === "지연" && (sysFilter === "ALL" || t.system === sysFilter)).length;
  const dc = document.getElementById("wbsDelayedCount");
  if (dc) dc.textContent = String(delayCnt);
  // 가중치 경고 (하위 합 ≠ 상위) — 자료에서 매번 계산하므로 고칠 때까지 계속 표시
  const wWarn = WbsWeight.warnMap(wbsData);
  // 오류 건수 (조회 범위): 가중치 · 휴일 · 날짜(역전 · 기간 이탈) — 알림 대신 단추 앞에 건수로
  const inScopeSys = s => (sysFilter === "ALL" || s === sysFilter) && (dFilter === "ALL" || WBSEngine.getSubsystemDomain(s) === dFilter);
  WbsWeight.renderBadge(inScopeSys);
  const errRows = wbsData.filter(t => t.isLeaf && inScopeSys(String(t.system || "").trim()));
  const hol = errRows.filter(t => WBSEngine.isHoliday(t.pStart, projectConfig.holidays) || WBSEngine.isHoliday(t.pEnd, projectConfig.holidays)).length;
  const out = (d) => WBSEngine.isDateOutOfRange(d, projectConfig.projectStartDate, projectConfig.projectEndDate);
  const dte = errRows.filter(t => isDateReversed(t.pStart, t.pEnd) || isDateReversed(t.aStart, t.aEnd) || out(t.pStart) || out(t.pEnd) || out(t.aStart) || out(t.aEnd)).length;
  /** @type {Array<[string, number, string]>} */ ([["wbsHolidayErrChip", hol, "휴일"], ["wbsDateErrChip", dte, "날짜"]]).forEach(([id, n, lbl]) => {
    const el = document.getElementById(id);
    if (el) { el.style.display = n ? "inline-flex" : "none"; el.textContent = `${lbl} ${n}건`; }
  });
  const grp = document.getElementById("wbsErrGroup");
  if (grp) grp.style.display = Array.from(grp.querySelectorAll(".wbs-err-chip")).some(c => /** @type {HTMLElement} */ (c).style.display !== "none") ? "inline-flex" : "none";

  wbsData.forEach((row, idx) => {
    const pStartOutOfRange = WBSEngine.isDateOutOfRange(row.pStart, projectConfig.projectStartDate, projectConfig.projectEndDate);
    const pEndOutOfRange = WBSEngine.isDateOutOfRange(row.pEnd, projectConfig.projectStartDate, projectConfig.projectEndDate);
    const aStartOutOfRange = WBSEngine.isDateOutOfRange(row.aStart, projectConfig.projectStartDate, projectConfig.projectEndDate);
    const aEndOutOfRange = WBSEngine.isDateOutOfRange(row.aEnd, projectConfig.projectStartDate, projectConfig.projectEndDate);

    if (pStartOutOfRange || pEndOutOfRange || aStartOutOfRange || aEndOutOfRange) {
      outOfRangeCount++;
    }

    // 서브시스템 필터 및 레벨 접기 필터 적용 (해당 레벨 이하는 표시 안 함)
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    if (phaseSet && !phaseSet.has(row)) return;
    // 상태 조회는 최하위 Task(Leaf) 기준 — 레벨 접기와 무관하게 해당 상태의 최하위 과업만 표시
    if (view) {
      if (!view.match.has(row) && !view.heads.has(row)) return;
    } else if ((row.level || 1) > maxLvl) return;

    const tr = document.createElement("tr");
    tr.className = `wbs-row-lvl-${row.level}`;
    if (view && view.heads.has(row)) tr.classList.add("wbs-group-head");
    tr.setAttribute("data-wbs-id", row.id);

    const status = WBSEngine.getTaskStatus(row, projectConfig.reportDate);
    tr.classList.add(`task-state-${status.code}`);

    const pRev = isDateReversed(row.pStart, row.pEnd), aRev = isDateReversed(row.aStart, row.aEnd);
    const isLeaf = row.isLeaf;

    const isStartHoliday = WBSEngine.isHoliday(row.pStart, projectConfig.holidays);
    const isEndHoliday = WBSEngine.isHoliday(row.pEnd, projectConfig.holidays);

    const pStartDay = WBSEngine.getDayOfWeekText(row.pStart);
    const pEndDay = WBSEngine.getDayOfWeekText(row.pEnd);
    const aStartDay = WBSEngine.getDayOfWeekText(row.aStart);
    const aEndDay = WBSEngine.getDayOfWeekText(row.aEnd);

    // 하위 레벨이 접혀 있는지 표시 뱃지
    const hasHiddenChildren = !view && !isLeaf && row.level === maxLvl;
    const foldBadge = hasHiddenChildren ? `<span class="u-bold u-mr-3 wbs-fold-badge" title="하위 레벨이 접혀 있습니다.">[+하위접힘]</span>` : "";

    tr.innerHTML = `
      <td><button type="button" class="wbs-id-link" title="상세 보기 (오른쪽 패널)" data-click="WbsDetail.open" data-click-args="${UiEvents.args(idx)}">${escapeHtml(row.id)}</button></td>
      <td>
        <div class="wbs-lvl-ctrl">
          <button class="btn-xs" title="상위 레벨로 올리기 (L${row.level} → L${Math.max(2, row.level - 1)})" data-click="changeTaskLevel" data-click-args="${UiEvents.args(idx, -1)}" ${row.level <= 2 ? "disabled" : ""}>◀</button>
          <button class="btn-xs" title="하위 레벨로 내리기 (L${row.level} → L${Math.min(5, row.level + 1)})" data-click="changeTaskLevel" data-click-args="${UiEvents.args(idx, 1)}" ${row.level === 1 || row.level >= 5 ? "disabled" : ""}>▶</button>
        </div>
      </td>
      <td>
        <select class="u-fs-xs wbs-in-sys" data-change="changeTaskSystem" data-change-args="${UiEvents.args(idx, "$value")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td>
        <div class="wbs-name-cell wbs-ind-${row.level}">
          <span class="lvl-badge lvl-${row.level}">L${row.level}</span>
          ${foldBadge}
          ${view && view.heads.has(row) ? `<span class="wbs-head-cnt">${escapeHtml(I18N.tf("{st} {n}건", { st: view.label, n: view.heads.get(row) }))}</span>` : ""}
          ${WbsStatusView.predIcon(row, predWarn)}
          <input type="text" class="wbs-in-name" value="${escapeHtml(row.name)}" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "name", "$value", "persistChanges")}">
        </div>
      </td>
      <td class="u-tc"><span class="status-tag ${status.cssClass}">${status.label}</span></td>
      <td class="col-fold"><input type="number" min="0" step="0.1" value="${row.weight === undefined || row.weight === null ? "" : row.weight}" ${wWarn.has(row) ? ` class="wbs-in-w weight-warn" title="${escapeAttr(wWarn.get(row))}"` : ` class="wbs-in-w" title="가중치 (서브시스템 100 기준, 상위 = 하위 합, 소수점 1자리)"`} data-change="WbsWeight.set" data-change-args="${UiEvents.args(idx, "$value")}"></td>
      <td class="col-fold"><input type="text" class="wbs-in-req" value="${escapeHtml(row.reqId || "")}" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "reqId", "$value", "renderPhaseMatrix", "renderReqMasterTable", "persistChanges")}"></td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.pStart || ""}" data-dow="${pStartDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${pStartOutOfRange ? "date-out-of-range" : ""} ${isStartHoliday ? "holiday-date-highlight" : ""} ${pRev ? "date-reversed" : ""}"
                 title="${pRev ? "⚠️ 계획시작일이 계획종료일보다 늦습니다 (일정 역전)" : (pStartOutOfRange ? "⚠️ 프로젝트 기간 이탈 오류" : (isStartHoliday ? "휴일(주말/공휴일) 경고" : ""))}"
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "pStart", "$value", "rebuildAll")}">
          <span class="wbs-dow ${pStartDay === "토" ? "day-sat" : (pStartDay === "일" ? "day-sun" : "")}">${pStartDay || ""}</span>
        </div>
      </td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.pEnd || ""}" data-dow="${pEndDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${pEndOutOfRange ? "date-out-of-range" : ""} ${isEndHoliday ? "holiday-date-highlight" : ""} ${pRev ? "date-reversed" : ""}"
                 title="${pRev ? "⚠️ 계획시작일이 계획종료일보다 늦습니다 (일정 역전)" : (pEndOutOfRange ? "⚠️ 프로젝트 기간 이탈 오류" : (isEndHoliday ? "휴일(주말/공휴일) 경고" : ""))}"
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "pEnd", "$value", "rebuildAll")}">
          <span class="wbs-dow ${pEndDay === "토" ? "day-sat" : (pEndDay === "일" ? "day-sun" : "")}">${pEndDay || ""}</span>
        </div>
      </td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.aStart || ""}" data-dow="${aStartDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${aStartOutOfRange ? "date-out-of-range" : ""} ${aRev ? "date-reversed" : ""}"${aRev ? ` title="⚠️ 실제 시작일이 실제 종료일보다 늦습니다 (일정 역전)"` : ""}
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "aStart", "$value", "rebuildAll")}">
          <span class="wbs-dow ${aStartDay === "토" ? "day-sat" : (aStartDay === "일" ? "day-sun" : "")}">${aStartDay || ""}</span>
        </div>
      </td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.aEnd || ""}" data-dow="${aEndDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${aEndOutOfRange ? "date-out-of-range" : ""} ${aRev ? "date-reversed" : ""}"${aRev ? ` title="⚠️ 실제 시작일이 실제 종료일보다 늦습니다 (일정 역전)"` : ""}
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "aEnd", "$value", "rebuildAll")}">
          <span class="wbs-dow ${aEndDay === "토" ? "day-sat" : (aEndDay === "일" ? "day-sun" : "")}">${aEndDay || ""}</span>
        </div>
      </td>

      <td><input class="u-tr wbs-in-pct" type="number" value="${row.pProg}" readonly></td>
      <td><input type="number" min="0" max="100" step="1" value="${row.aProg}" ${isLeaf ? "" : "readonly"} class="u-tr wbs-in-pct" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "aProg", "$num", "rebuildAll")}"></td>
      <td class="col-fold"><input type="text" class="wbs-owner" list="wbsOwnerList" maxlength="40" value="${escapeHtml(row.owner || "")}" title="${isLeaf ? "담당자 (목록에서 고르거나 직접 입력, 1명)" : "담당자 — 상위 Task 에 지정하면 하위 Task 에도 자동 지정"}" data-change="WbsOwner.set" data-change-args="${UiEvents.args(idx, "$value")}"></td>
      <td class="col-fold"><input type="text" class="wbs-in-out" value="${escapeHtml(row.output || "")}" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "output", "$value", "persistChanges")}"></td>
      <td>
        <div class="wbs-action-group">
          <button type="button" class="btn-xs wbs-open-btn" title="상세 열기 (오른쪽 패널) — 행의 빈 곳을 눌러도 열림" data-click="WbsDetail.open" data-click-args="${UiEvents.args(idx)}"><svg class="iostar-ico ico-solo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg></button>
          <button class="btn-xs wbs-fill-btn" title="이 Task만 계획일정/진척률(${row.pProg}%)을 실적에 즉시 반영" data-click="fillRowActualFromPlan" data-click-args="${UiEvents.args(idx)}" ${!isLeaf ? "disabled" : ""}>⚡</button>
          <button class="btn-xs btn-xs-child" title="하위 레벨(L${Math.min(5, row.level + 1)}) 자식 Task 추가" data-click="addChildTask" data-click-args="${UiEvents.args(idx)}" ${row.level >= 5 ? "disabled" : ""}>↳</button>
          <button class="btn-xs btn-xs-sibling" title="동일 레벨(L${row.level === 1 ? 2 : row.level}) 동위 Task 추가" data-click="addSiblingTask" data-click-args="${UiEvents.args(idx)}">＋</button>
          <button class="btn-xs" title="위로 이동" data-click="moveTaskOrder" data-click-args="${UiEvents.args(idx, -1)}" ${row.level === 1 ? "disabled" : ""}>▲</button>
          <button class="btn-xs" title="아래로 이동" data-click="moveTaskOrder" data-click-args="${UiEvents.args(idx, 1)}" ${row.level === 1 ? "disabled" : ""}>▼</button>
          <button class="btn btn-danger btn-sm wbs-del-btn" title="Task 삭제" data-click="deleteWbsRow" data-click-args="${UiEvents.args(idx)}">×</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // [Neo 2.1] 상태 칩 필터 건수 · 상세 패널 선택 행 표시
  WbsStatusChips.render(); WbsDetail.afterTable();

  const errChip = document.getElementById("stat-chip-error");
  const errCount = document.getElementById("stat-count-error");
  const kpiErr = document.getElementById("kpi-out-of-range-count");
  if (kpiErr) kpiErr.innerText = String(outOfRangeCount);
  if (errChip && errCount) {
    if (outOfRangeCount > 0) {
      errChip.style.display = "inline-flex";
      errCount.innerText = String(outOfRangeCount);
    } else {
      errChip.style.display = "none";
    }
  }
}

// 상태 조회 · 선행 Task 표시
var WbsStatusView = {
  PRED: "선행 지연",
  // 상태를 고르면 { match: 해당 Task, heads: 그 상위 Task 중 고른 레벨까지 } — 전체면 null
  rows(data, st, maxLvl, predWarn) {
    if (!st || st === "ALL") return null;
    const match = new Set((data || []).filter(t => st === this.PRED ? predWarn.has(t) : (t.isLeaf && t.status === st)));
    const heads = new Map();   // 묶음 머리 → 그 아래 해당 Task 수
    (data || []).forEach((t, i) => {
      if (!match.has(t)) return;
      let lv = t.level || 1;
      for (let j = i - 1; j >= 0 && lv > 1; j--) {
        const u = data[j], ul = u.level || 1;
        if ((u.system || "").trim() !== (t.system || "").trim()) break;
        if (ul < lv) { if (ul <= maxLvl && !match.has(u)) heads.set(u, (heads.get(u) || 0) + 1); lv = ul; }
      }
    });
    return { match, heads, label: st };
  },
  // 작업명 앞 ⛓: 선행 Task 가 있으면 표시, 경고면 주황 + 말풍선
  predIcon(row, predWarn) {
    if (!row.pred) return "";
    const w = predWarn.get(row);
    const tip = w ? this.tip(w) : I18N.tf("선행 Task {ids}", { ids: WBSEngine.predIds(row).join(", ") });
    return `<span class="wbs-pred${w ? " warn" : ""}" title="${escapeAttr(tip)}">⛓</span>`;
  },
  // "선행 1.2.3 지연 (계획 종료 6/10)" 줄들
  tip(w) {
    return w.list.filter(x => x.reasons.length).map(x => I18N.tf("선행 {id} {why} (계획 종료 {end})",
      { id: x.id, why: x.reasons.map(r => WBSEngine.PRED_REASON[r]).join(" · "), end: x.task.pEnd ? x.task.pEnd.slice(5).replace("-", "/") : "-" })).join("\n");
  }
};

// 단계별 조회 (📶) — 서브시스템의 SDLC 단계(개선 타입은 개선 공정 단계)로 걸러 봄
var WbsPhase = {
  phasesOf(sys) { return WBSEngine.phasesOfSystem(sys); },
  // 단계 이름 목록 (조회 범위 서브시스템 순서대로, 겹치는 이름은 한 번)
  names(systems) {
    const out = [];
    (systems || []).forEach(s => this.phasesOf(s).forEach(p => { if (p && p.name && !out.includes(p.name)) out.push(p.name); }));
    return out;
  },
  fill(systems) {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById("wbsPhaseFilter"));
    if (!sel) return "ALL";
    const keep = sel.value || "ALL";
    const names = this.names(systems);
    sel.innerHTML = `<option value="ALL">전체 단계</option>` + names.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join("");
    sel.value = names.includes(keep) ? keep : "ALL";
    return sel.value;
  },
  // 그 단계에 해당하는 행(L2 이하) + 상위 행
  matchSet(data, name) {
    const set = new Set();
    data.forEach((t, i) => {
      if ((t.level || 1) < 2) return;
      const ph = this.phasesOf(t.system).find(p => p.name === name);
      if (!ph || !WBSEngine.matchTaskToPhase(t, ph, data)) return;
      set.add(t);
      let j = i;
      while ((j = WbsWeight.parentIdx(data, j)) !== -1) set.add(data[j]);
    });
    return set;
  }
};

// 특정 과업 하위 트리 끝 인덱스 계산 및 계층/순서 조작
function getSubtreeEndIndex(startIdx) {
  const baseRow = wbsData[startIdx];
  if (!baseRow) return startIdx + 1;
  const baseSys = (baseRow.system || "").trim();
  const baseLvl = baseRow.level || 1;
  let i = startIdx + 1;
  while (i < wbsData.length) {
    const curSys = (wbsData[i].system || "").trim();
    const curLvl = wbsData[i].level || 1;
    if (curSys !== baseSys || curLvl <= baseLvl) break;
    i++;
  }
  return i;
}

// =============================================================================
// WBS 담당자 (1명) — 작업자 목록에서 고르거나 직접 입력
//  상위 Task 에 지정하면 하위 Task 에도 자동 지정: 비어 있거나 이전 상위 담당자와 같은 하위만 바꾸고,
//  다른 담당자가 따로 지정된 하위는 그대로 둠
// =============================================================================
var WbsOwner = {
  MAX: 40,
  clean(v) {
    let t = String(v || "").trim();
    const multi = /[,;/|]/.test(t);
    if (multi) t = t.split(/[,;/|]/)[0].trim();
    return { value: t.slice(0, this.MAX), multi };
  },
  // idx 다음부터 같은 하위 묶음(레벨이 더 깊은 행)의 끝
  subtreeEnd(idx) {
    const lv = wbsData[idx].level;
    let i = idx + 1;
    while (i < wbsData.length && wbsData[i].level > lv) i++;
    return i;
  },
  // 새 동위 Task 의 상위 담당자 (idx 행 위쪽에서 레벨이 더 낮은 가장 가까운 행)
  parentOwner(idx, level) {
    for (let i = idx; i >= 0; i--) { if (wbsData[i] && wbsData[i].level < level) return wbsData[i].owner || ""; }
    return "";
  },
  set(idx, value) {
    const row = wbsData[idx];
    if (!row) return;
    const c = this.clean(value);
    if (c.multi) showToast("ℹ️ 담당자는 1명만 지정할 수 있습니다. 첫 번째 이름만 저장했습니다.");
    const prev = row.owner || "";
    row.owner = c.value;
    let changed = 0, kept = 0;
    const end = this.subtreeEnd(idx);
    for (let i = idx + 1; i < end; i++) {
      const t = wbsData[i];
      const cur = t.owner || "";
      if (cur === "" || cur === prev) { if (cur !== c.value) { t.owner = c.value; changed++; } }
      else if (cur !== c.value) kept++;
    }
    renderWbsTable();
    persistChanges();
    if (end > idx + 1) {
      showToast(c.value
        ? `👤 하위 Task ${changed}건에 담당자 [${c.value}]를 자동 지정했습니다.${kept ? ` (다른 담당자가 지정된 ${kept}건은 그대로)` : ""}`
        : `👤 담당자를 지웠습니다. 같은 담당자였던 하위 Task ${changed}건도 지웠습니다.`);
    }
    if (WbsDetail.isOpen && WbsDetail.isOpen()) WbsDetail.render();
  },
  // 담당자 목록: 이 프로젝트 작업자 이름 + WBS 에 이미 입력된 이름
  options() {
    const names = new Map();
    (projectUsers || []).forEach(u => {
      if (!u || !u.name) return;
      if (ProjectContext.member && !ProjectContext.isAdminUser(u) && !ProjectContext.member(u)) return;
      names.set(u.name, `${u.empNo}${u.dept ? " · " + u.dept : ""}`);
    });
    (wbsData || []).forEach(t => { if (t.owner && !names.has(t.owner)) names.set(t.owner, "직접 입력"); });
    return [...names.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
  },
  fillList() {
    let dl = document.getElementById("wbsOwnerList");
    if (!dl) { dl = document.createElement("datalist"); dl.id = "wbsOwnerList"; document.body.appendChild(dl); }
    dl.innerHTML = this.options().map(([n, lbl]) => `<option value="${escapeAttr(n)}" label="${escapeAttr(lbl)}"></option>`).join("");
  }
};

function addChildTask(idx) {
  const parent = wbsData[idx];
  if (!parent) return;
  if (parent.level >= 5) {
    showToast("최대 하위 레벨(L5) 이하로는 자식 Task를 추가할 수 없습니다.");
    return;
  }
  const childLevel = parent.level + 1;
  const insertPos = getSubtreeEndIndex(idx);
  const childW = WbsWeight.newWeight(wbsData, idx, WbsWeight.childIdx(wbsData, idx));
  const newTask = {
    id: "",
    level: childLevel,
    system: parent.system,
    name: `${parent.name} - 하위 Task`,
    weight: childW,
    reqId: parent.reqId || "",
    owner: parent.owner || "",
    pStart: WBSEngine.getNextWorkingDay(parent.pStart || projectConfig.projectStartDate, projectConfig.holidays, projectConfig.projectEndDate),
    pEnd: WBSEngine.getNextWorkingDay(parent.pEnd || projectConfig.projectEndDate, projectConfig.holidays, projectConfig.projectEndDate),
    aStart: "",
    aEnd: "",
    pProg: 0,
    aProg: 0,
    output: ""
  };
  wbsData.splice(insertPos, 0, newTask);
  rebuildAll();
  showToast(`[${parent.id} ${parent.name}] 하위에 L${childLevel} 자식 Task가 추가되었습니다.`);
}

function addSiblingTask(idx) {
  const target = wbsData[idx];
  if (!target) return;
  const sibLevel = target.level === 1 ? 2 : target.level;
  const insertPos = getSubtreeEndIndex(idx);
  const pIdx = target.level === 1 ? idx : WbsWeight.parentIdx(wbsData, idx);
  const sibW = WbsWeight.newWeight(wbsData, pIdx, pIdx >= 0 ? WbsWeight.childIdx(wbsData, pIdx) : []);
  const newTask = {
    id: "",
    level: sibLevel,
    system: target.system,
    name: `신규 L${sibLevel} Task`,
    weight: sibW,
    reqId: target.reqId || "",
    owner: WbsOwner.parentOwner(idx, sibLevel),
    pStart: WBSEngine.getNextWorkingDay(target.pStart || projectConfig.projectStartDate, projectConfig.holidays, projectConfig.projectEndDate),
    pEnd: WBSEngine.getNextWorkingDay(target.pEnd || projectConfig.projectEndDate, projectConfig.holidays, projectConfig.projectEndDate),
    aStart: "",
    aEnd: "",
    pProg: 0,
    aProg: 0,
    output: ""
  };
  wbsData.splice(insertPos, 0, newTask);
  rebuildAll();
  showToast(`[${target.id}] 다음에 L${sibLevel} 동위 Task가 추가되었습니다.`);
}

// 레벨 변경: 선택 과업과 하위 과업(서브트리)을 함께 이동하고 WBS ID 를 자동 재채번·재정렬
function changeTaskLevel(idx, delta) {
  const row = wbsData[idx];
  if (!row || !delta) return;
  if (row.level === 1) {
    showToast("서브시스템 루트(L1)의 레벨은 고정되어 있습니다.");
    return;
  }
  const end = getSubtreeEndIndex(idx);
  const subtree = wbsData.slice(idx, end);
  const nextLvl = row.level + delta;
  const maxLvl = Math.max(...subtree.map(t => t.level || 1)) + delta;
  if (nextLvl < 2 || maxLvl > 5) {
    showToast(`단위 Task 레벨은 L2 ~ L5 범위 내에서만 조정 가능합니다. (하위 Task 포함 최대 L${maxLvl})`);
    return;
  }
  if (delta > 0) {
    const prev = wbsData[idx - 1];
    if (!prev || (prev.system || "").trim() !== (row.system || "").trim() || nextLvl > (prev.level || 1) + 1) {
      showToast(`직전 Task(L${prev ? prev.level : "-"}) 아래로만 내릴 수 있습니다. (최대 L${prev ? (prev.level || 1) + 1 : 2})`);
      return;
    }
  }
  const oldId = row.id;
  subtree.forEach(t => { t.level = (t.level || 1) + delta; });
  rebuildAll();
  showToast(`🔢 [${oldId} → ${row.id}] 레벨 L${nextLvl - delta} → L${nextLvl} 변경 (하위 ${subtree.length - 1}건 포함) · WBS ID 자동 다시 매기기 완료`);
}

// 서브시스템 변경: 하위 과업을 함께 대상 서브시스템 마지막으로 이동 후 재채번
function changeTaskSystem(idx, sys) {
  const row = wbsData[idx];
  if (!row || !sys || row.system === sys) return;
  if (row.level === 1) {
    showToast("서브시스템 루트(L1)는 다른 서브시스템으로 이동할 수 없습니다. 프로젝트 설정에서 서브시스템명을 변경하세요.");
    renderWbsTable();
    return;
  }
  const end = getSubtreeEndIndex(idx);
  const block = wbsData.splice(idx, end - idx);
  const baseLvl = block[0].level;
  block.forEach(t => { t.system = sys; t.level = Math.max(2, t.level - baseLvl + 2); });
  let insertAt = wbsData.length;
  for (let i = wbsData.length - 1; i >= 0; i--) {
    if ((wbsData[i].system || "").trim() === sys) { insertAt = i + 1; break; }
  }
  wbsData.splice(insertAt, 0, ...block);
  rebuildAll();
  showToast(`🔀 Task(하위 ${block.length - 1}건 포함)을 [${sys}] 서브시스템 마지막으로 이동하고 WBS ID 를 다시 매기기했습니다.`);
}

function moveTaskOrder(idx, direction) {
  const row = wbsData[idx];
  if (!row || row.level === 1) return;
  const sys = (row.system || "").trim();
  const lvl = row.level;
  const blockStart = idx;
  const blockEnd = getSubtreeEndIndex(idx);

  if (direction === -1) {
    let prevStart = -1;
    for (let i = idx - 1; i >= 0; i--) {
      if ((wbsData[i].system || "").trim() !== sys || wbsData[i].level < lvl) break;
      if (wbsData[i].level === lvl) {
        prevStart = i;
        break;
      }
    }
    if (prevStart < 0) {
      showToast("현재 상위 그룹 내에서 가장 첫 번째 Task입니다.");
      return;
    }
    const movingBlock = wbsData.splice(blockStart, blockEnd - blockStart);
    wbsData.splice(prevStart, 0, ...movingBlock);
    rebuildAll();
  } else if (direction === 1) {
    const nextStart = blockEnd;
    if (
      nextStart >= wbsData.length ||
      (wbsData[nextStart].system || "").trim() !== sys ||
      wbsData[nextStart].level !== lvl
    ) {
      showToast("현재 상위 그룹 내에서 가장 마지막 Task입니다.");
      return;
    }
    const nextEnd = getSubtreeEndIndex(nextStart);
    const nextBlock = wbsData.splice(nextStart, nextEnd - nextStart);
    wbsData.splice(blockStart, 0, ...nextBlock);
    rebuildAll();
  }
}

function deleteWbsRow(idx) {
  const row = wbsData[idx];
  if (!row) return;
  wbsData.splice(idx, 1);
  // 지운 Task 를 선행으로 둔 Task 에서 뺌 (다시 매긴 번호와 섞이지 않게)
  const gone = String(row.id);
  wbsData.forEach(t => { if (t.pred) t.pred = WBSEngine.predIds(t).filter(p => p !== gone).join(", "); });
  rebuildAll();
}

function addNewRow() {
  const sf = wbsVal("wbsSubsystemFilter", "ALL");
  const defaultSys = sf !== "ALL" ? sf : (subsystemsMeta[0] ? subsystemsMeta[0].name : "PMO");
  const validStart = WBSEngine.getNextWorkingDay(projectConfig.projectStartDate, projectConfig.holidays, projectConfig.projectEndDate);
  const validEnd = WBSEngine.getNextWorkingDay(projectConfig.projectEndDate, projectConfig.holidays, projectConfig.projectEndDate);

  const rootIdx = wbsData.findIndex(t => (t.system || "").trim() === defaultSys && t.level === 1);
  const newW = rootIdx >= 0 ? WbsWeight.newWeight(wbsData, rootIdx, WbsWeight.childIdx(wbsData, rootIdx)) : 0;
  wbsData.push({
    id: "",
    level: 2,
    system: defaultSys,
    name: "신규 Task",
    weight: newW,
    reqId: "REQ-NEW",
    pStart: validStart,
    pEnd: validEnd,
    aStart: "",
    aEnd: "",
    pProg: 0,
    aProg: 0,
    output: ""
  });
  rebuildAll();
}

// [요건 5 신규] WBS 계획일자 휴일 자동보정 기능
function autoAdjustWbsHolidays() {
  const sysFilter = wbsVal("wbsSubsystemFilter", "ALL");
  let adjustedCount = 0;

  wbsData.forEach(task => {
    if (!task.isLeaf) return;
    if (sysFilter !== "ALL" && task.system !== sysFilter) return;

    let changed = false;
    if (task.pStart && WBSEngine.isHoliday(task.pStart, projectConfig.holidays)) {
      task.pStart = WBSEngine.getNextWorkingDay(task.pStart, projectConfig.holidays, projectConfig.projectEndDate);
      changed = true;
    }
    if (task.pEnd && WBSEngine.isHoliday(task.pEnd, projectConfig.holidays)) {
      task.pEnd = WBSEngine.getNextWorkingDay(task.pEnd, projectConfig.holidays, projectConfig.projectEndDate);
      changed = true;
    }
    if (task.pStart && task.pEnd && task.pStart > task.pEnd) {
      task.pEnd = task.pStart;
      changed = true;
    }
    if (changed) adjustedCount++;
  });

  rebuildAll();
  if (adjustedCount > 0) {
    showToast(`[휴일 날짜 옮기기 완료] 주말·공휴일에 걸쳐 있던 ${adjustedCount}건의 Task 계획일정을 평일(영업일)로 자동 보정했습니다.`);
  } else {
    showToast("현재 조회된 Task 중 휴일(주말·공휴일)에 해당하는 계획일정이 없습니다.");
  }
}

// 계획 → 실적 반영 공통 규칙 (기준일이 속한 주차 = 기준 주차)
//  - 실적 진척률 = 계획 진척률 (이미 실적이 계획보다 앞서 있으면 그대로)
//  - 실적시작일 (비어 있을 때만): 계획시작일이 기준 주차보다 앞이면 기준 주차 시작일, 기준 주차 안이면 계획시작일
//  - 실적종료일 (100% 이고 비어 있을 때만): 계획종료일이 기준 주차 안이면 계획종료일, 기준 주차보다 앞이면 기준일
//  - 이미 입력된 실적시작 · 종료일은 바꾸지 않음 (시작 > 종료로 뒤집히면 표에 색으로 표시)
function applyPlanToActual(task) {
  const rep = projectConfig.reportDate;
  const wk = WBSEngine.getWeekRange(rep, projectConfig.weekStartDay);
  const p = parseFloat(task.pProg) || 0;
  if (p > (parseFloat(task.aProg) || 0)) task.aProg = p;
  const a = parseFloat(task.aProg) || 0;
  if (a > 0 && !task.aStart && task.pStart) task.aStart = task.pStart < wk.start ? wk.start : task.pStart;
  if (a >= 100 && !task.aEnd) task.aEnd = task.pEnd && task.pEnd >= wk.start && task.pEnd <= wk.end ? task.pEnd : rep;
}
// 시작일이 종료일보다 늦은 (뒤집힌) 일정
function isDateReversed(s, e) { return Boolean(s && e && s > e); }

function fillRowActualFromPlan(idx) {
  const task = wbsData[idx];
  if (!task || !task.isLeaf) return;
  applyPlanToActual(task);
  rebuildAll();
  showToast(`[${task.id} ${task.name}] 계획 진척률(${task.pProg}%)을 실적에 반영했습니다.${Number(task.aProg) >= 100 ? ` (실제 종료일 ${task.aEnd})` : ""}`);
}

// [실적 일괄 반영] 서브시스템(또는 전체)에서 계획 진척률이 0 보다 큰 최하위 Task 를 모두 반영 (규칙은 applyPlanToActual)
function fillActualFromPlan() {
  const repDateStr = projectConfig.reportDate;
  const sysFilter = wbsVal("wbsSubsystemFilter", "ALL");
  let updatedCount = 0;
  wbsData.forEach(task => {
    if (!task.isLeaf) return;
    if (sysFilter !== "ALL" && task.system !== sysFilter) return;
    if (!((parseFloat(String(task.pProg)) || 0) > 0)) return;
    const before = [task.aProg, task.aStart, task.aEnd].join("|");
    applyPlanToActual(task);
    if ([task.aProg, task.aStart, task.aEnd].join("|") !== before) updatedCount++;
  });
  rebuildAll();
  const scopeLabel = sysFilter === "ALL" ? "전체 서브시스템" : `[${sysFilter}]`;
  showToast(`${scopeLabel} Task ${updatedCount}건의 실적을 반영했습니다 (기준일 ${repDateStr} 주차 기준).`);
}

// -----------------------------------------------------------------------------
// WBS 담당자 · 산출물 칸 접기 (가중치 · REQ ID 도 함께) — 접으면 표 전체가 한 화면에 들어오고, 펼치면 가로 스크롤
//  작업자별 기억, 처음에는 화면 폭이 1600px 보다 좁으면 접힌 상태
// -----------------------------------------------------------------------------
var WbsFold = {
  KEY: "IOSTAR_WBS_FOLD_",
  _key() { const u = (AuthManager.currentUser) || {}; return this.KEY + (u.empNo || "_"); },
  isFolded() {
    let v = null;
    try { v = AppStore.getItem(this._key()); } catch (e) {}
    return v === null ? window.innerWidth < 1600 : v === "1";
  },
  toggle() {
    const next = !this.isFolded();
    try { AppStore.setItem(this._key(), next ? "1" : "0"); } catch (e) {}
    this.apply();
  },
  apply() {
    const t = document.getElementById("wbsTable");
    const on = this.isFolded();
    if (t) t.classList.toggle("wbs-fold", on);
    const b = document.getElementById("btnWbsFold");
    if (b) {
      b.textContent = on ? "▶ 가중치·REQ·담당자·산출물 펼치기" : "◀ 가중치·REQ·담당자·산출물 접기";
      b.title = on ? "접어 둔 가중치 · REQ ID · 담당자 · 산출물 칸을 다시 보여 줍니다 (표가 넓어지면 가로 스크롤)" : "가중치 · REQ ID · 담당자 · 산출물 칸을 접어 표 전체를 한 화면에 봅니다";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      I18N.translateTree(b.parentNode);
    }
  }
};
