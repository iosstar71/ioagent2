// [IOSTAR-PM] WBS 표 · 담당자 · 행 편집
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// -------------------------------------------------------------
// [요건 5] WBS 테이블 렌더링 (서브시스템 필터, 레벨단위 접기, 리스트 선택, 개별 실적반영, 컴팩트 너비)
// -------------------------------------------------------------
function renderWbsTable() {
  const tbody = document.getElementById("wbsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (typeof WbsOwner !== "undefined") WbsOwner.fillList();
  if (typeof WbsFold !== "undefined") WbsFold.apply();
  let outOfRangeCount = 0;

  const sysFilterEl = document.getElementById("wbsSubsystemFilter");
  const lvlFilterEl = document.getElementById("wbsMaxLevelFilter");
  const dFilterEl = document.getElementById("wbsDomainFilter");
  const dFilter = dFilterEl ? dFilterEl.value : "ALL";
  const sysFilter = sysFilterEl ? sysFilterEl.value : "ALL";
  const maxLvl = lvlFilterEl ? parseInt(lvlFilterEl.value, 10) || 5 : 5;
  const stFilterEl = document.getElementById("wbsStatusFilter");
  const stFilter = stFilterEl ? stFilterEl.value : "ALL";
  const leafOnly = stFilter !== "ALL";
  const delayCnt = wbsData.filter(t => t.isLeaf && t.status === "지연" && (sysFilter === "ALL" || t.system === sysFilter)).length;
  const dc = document.getElementById("wbsDelayedCount");
  if (dc) dc.textContent = delayCnt;

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
    // 상태 조회는 최하위 Task(Leaf) 기준 — 레벨 접기와 무관하게 해당 상태의 최하위 과업만 표시
    if (leafOnly) {
      if (!row.isLeaf || row.status !== stFilter) return;
    } else if ((row.level || 1) > maxLvl) return;

    const tr = document.createElement("tr");
    tr.className = `wbs-row-lvl-${row.level}`;
    tr.setAttribute("data-wbs-id", row.id);

    const status = WBSEngine.getTaskStatus(row, projectConfig.reportDate);
    tr.classList.add(`task-state-${status.code}`);

    const indent = (row.level - 1) * 12;
    const isLeaf = row.isLeaf;

    const isStartHoliday = WBSEngine.isHoliday(row.pStart, projectConfig.holidays);
    const isEndHoliday = WBSEngine.isHoliday(row.pEnd, projectConfig.holidays);

    const pStartDay = WBSEngine.getDayOfWeekText(row.pStart);
    const pEndDay = WBSEngine.getDayOfWeekText(row.pEnd);
    const aStartDay = WBSEngine.getDayOfWeekText(row.aStart);
    const aEndDay = WBSEngine.getDayOfWeekText(row.aEnd);

    // 하위 레벨이 접혀 있는지 표시 뱃지
    const hasHiddenChildren = !isLeaf && row.level === maxLvl;
    const foldBadge = hasHiddenChildren ? `<span style="font-size:var(--fs-2xs, 10px); color:var(--accent); font-weight:bold; margin-right:3px;" title="하위 레벨이 접혀 있습니다.">[+하위접힘]</span>` : "";

    tr.innerHTML = `
      <td><button type="button" class="wbs-id-link" title="상세 보기 (오른쪽 패널)" data-click="NeoDetail.open" data-click-args="${UiEvents.args(idx)}">${escapeHtml(row.id)}</button></td>
      <td>
        <div class="wbs-lvl-ctrl">
          <button class="btn-xs" title="상위 레벨로 올리기 (L${row.level} → L${Math.max(2, row.level - 1)})" data-click="changeTaskLevel" data-click-args="${UiEvents.args(idx, -1)}" ${row.level <= 2 ? "disabled" : ""}>◀</button>
          <button class="btn-xs" title="하위 레벨로 내리기 (L${row.level} → L${Math.min(5, row.level + 1)})" data-click="changeTaskLevel" data-click-args="${UiEvents.args(idx, 1)}" ${row.level === 1 || row.level >= 5 ? "disabled" : ""}>▶</button>
        </div>
      </td>
      <td>
        <select style="width:86px; padding:2px 3px; font-size:var(--fs-xs, 11px);" data-change="changeTaskSystem" data-change-args="${UiEvents.args(idx, "$value")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td>
        <div style="padding-left: ${indent}px; display:flex; align-items:center;">
          <span class="lvl-badge lvl-${row.level}">L${row.level}</span>
          ${foldBadge}
          <input type="text" value="${escapeHtml(row.name)}" style="flex:1 1 0; width:0; min-width:180px;" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "name", "$value", "persistChanges")}">
        </div>
      </td>
      <td style="text-align:center;"><span class="status-tag ${status.cssClass}">${status.label}</span></td>
      <td class="col-fold"><input type="number" min="0" value="${row.weight}" style="width:44px; padding:2px 3px;" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "weight", "$num", "rebuildAll")}"></td>
      <td class="col-fold"><input type="text" value="${escapeHtml(row.reqId || "")}" style="width:74px; padding:2px 3px;" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "reqId", "$value", "renderPhaseMatrix", "renderReqMasterTable", "persistChanges")}"></td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.pStart || ""}" data-dow="${pStartDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${pStartOutOfRange ? "date-out-of-range" : ""} ${isStartHoliday ? "holiday-date-highlight" : ""}"
                 title="${pStartOutOfRange ? "⚠️ 프로젝트 기간 이탈 오류" : (isStartHoliday ? "휴일(주말/공휴일) 경고" : "")}"
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "pStart", "$value", "rebuildAll")}">
          <span class="wbs-dow ${pStartDay === "토" ? "day-sat" : (pStartDay === "일" ? "day-sun" : "")}">${pStartDay || ""}</span>
        </div>
      </td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.pEnd || ""}" data-dow="${pEndDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${pEndOutOfRange ? "date-out-of-range" : ""} ${isEndHoliday ? "holiday-date-highlight" : ""}"
                 title="${pEndOutOfRange ? "⚠️ 프로젝트 기간 이탈 오류" : (isEndHoliday ? "휴일(주말/공휴일) 경고" : "")}"
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "pEnd", "$value", "rebuildAll")}">
          <span class="wbs-dow ${pEndDay === "토" ? "day-sat" : (pEndDay === "일" ? "day-sun" : "")}">${pEndDay || ""}</span>
        </div>
      </td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.aStart || ""}" data-dow="${aStartDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${aStartOutOfRange ? "date-out-of-range" : ""}"
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "aStart", "$value", "rebuildAll")}">
          <span class="wbs-dow ${aStartDay === "토" ? "day-sat" : (aStartDay === "일" ? "day-sun" : "")}">${aStartDay || ""}</span>
        </div>
      </td>

      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.aEnd || ""}" data-dow="${aEndDay || ""}" ${isLeaf ? "" : "readonly"}
                 class="${aEndOutOfRange ? "date-out-of-range" : ""}"
                 data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "aEnd", "$value", "rebuildAll")}">
          <span class="wbs-dow ${aEndDay === "토" ? "day-sat" : (aEndDay === "일" ? "day-sun" : "")}">${aEndDay || ""}</span>
        </div>
      </td>

      <td><input type="number" value="${row.pProg}" readonly style="width:44px; padding:2px 3px; text-align:right;"></td>
      <td><input type="number" min="0" max="100" step="1" value="${row.aProg}" ${isLeaf ? "" : "readonly"} style="width:44px; padding:2px 3px; text-align:right;" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "aProg", "$num", "rebuildAll")}"></td>
      <td class="col-fold"><input type="text" class="wbs-owner" list="wbsOwnerList" maxlength="40" value="${escapeHtml(row.owner || "")}" title="${isLeaf ? "담당자 (목록에서 고르거나 직접 입력, 1명)" : "담당자 — 상위 Task 에 지정하면 하위 Task 에도 자동 지정"}" data-change="WbsOwner.set" data-change-args="${UiEvents.args(idx, "$value")}"></td>
      <td class="col-fold"><input type="text" value="${escapeHtml(row.output || "")}" style="width:106px; padding:2px 3px;" data-change="UiH.set" data-change-args="${UiEvents.args("wbsData", idx, "output", "$value", "persistChanges")}"></td>
      <td>
        <div class="wbs-action-group">
          <button class="btn-xs" style="background:#fef3c7; color:#b45309; border-color:#fde68a;" title="이 과업만 계획일정/진척율(${row.pProg}%)을 실적에 즉시 반영" data-click="fillRowActualFromPlan" data-click-args="${UiEvents.args(idx)}" ${!isLeaf ? "disabled" : ""}>⚡</button>
          <button class="btn-xs btn-xs-child" title="하위 레벨(L${Math.min(5, row.level + 1)}) 자식 Task 추가" data-click="addChildTask" data-click-args="${UiEvents.args(idx)}" ${row.level >= 5 ? "disabled" : ""}>↳</button>
          <button class="btn-xs btn-xs-sibling" title="동일 레벨(L${row.level === 1 ? 2 : row.level}) 동위 Task 추가" data-click="addSiblingTask" data-click-args="${UiEvents.args(idx)}">＋</button>
          <button class="btn-xs" title="위로 이동" data-click="moveTaskOrder" data-click-args="${UiEvents.args(idx, -1)}" ${row.level === 1 ? "disabled" : ""}>▲</button>
          <button class="btn-xs" title="아래로 이동" data-click="moveTaskOrder" data-click-args="${UiEvents.args(idx, 1)}" ${row.level === 1 ? "disabled" : ""}>▼</button>
          <button class="btn btn-danger btn-sm" style="padding:2px 5px;" title="Task 삭제" data-click="deleteWbsRow" data-click-args="${UiEvents.args(idx)}">×</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // [Neo 2.1] 상태 칩 필터 건수 · 상세 패널 선택 행 표시
  if (typeof UiMode !== "undefined" && UiMode.isNeo()) { NeoChips.render(); NeoDetail.afterTable(); }

  const errChip = document.getElementById("stat-chip-error");
  const errCount = document.getElementById("stat-count-error");
  const kpiErr = document.getElementById("kpi-out-of-range-count");
  if (kpiErr) kpiErr.innerText = outOfRangeCount;
  if (errChip && errCount) {
    if (outOfRangeCount > 0) {
      errChip.style.display = "inline-flex";
      errCount.innerText = outOfRangeCount;
    } else {
      errChip.style.display = "none";
    }
  }
}

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
// [v3.0.2] WBS 담당자 (1명) — 사용자 목록에서 고르거나 직접 입력
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
    if (typeof persistChanges === "function") persistChanges();
    if (end > idx + 1) {
      showToast(c.value
        ? `👤 하위 Task ${changed}건에 담당자 [${c.value}]를 자동 지정했습니다.${kept ? ` (다른 담당자가 지정된 ${kept}건은 그대로)` : ""}`
        : `👤 담당자를 지웠습니다. 같은 담당자였던 하위 Task ${changed}건도 지웠습니다.`);
    }
    if (typeof NeoDetail !== "undefined" && NeoDetail.isOpen && NeoDetail.isOpen()) NeoDetail.render();
  },
  // 담당자 목록: 이 프로젝트 사용자 이름 + WBS 에 이미 입력된 이름
  options() {
    const names = new Map();
    (projectUsers || []).forEach(u => {
      if (!u || !u.name) return;
      if (typeof ProjectContext !== "undefined" && ProjectContext.member && !ProjectContext.isAdminUser(u) && !ProjectContext.member(u)) return;
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
    showToast("최대 하위 레벨(L5) 이하로는 자식 과업을 추가할 수 없습니다.");
    return;
  }
  const childLevel = parent.level + 1;
  const insertPos = getSubtreeEndIndex(idx);
  const newTask = {
    id: "",
    level: childLevel,
    system: parent.system,
    name: `${parent.name} - 하위과업`,
    weight: Math.max(1, Math.round((parent.weight || 10) / 2)),
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
  showToast(`[${parent.id} ${parent.name}] 하위에 L${childLevel} 자식 과업이 추가되었습니다.`);
}

function addSiblingTask(idx) {
  const target = wbsData[idx];
  if (!target) return;
  const sibLevel = target.level === 1 ? 2 : target.level;
  const insertPos = getSubtreeEndIndex(idx);
  const newTask = {
    id: "",
    level: sibLevel,
    system: target.system,
    name: `신규 L${sibLevel} 단위과업`,
    weight: target.level === 1 ? 10 : (target.weight || 5),
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
  showToast(`[${target.id}] 다음에 L${sibLevel} 동위 과업이 추가되었습니다.`);
}

// [v1.0.7] 레벨 변경: 선택 과업과 하위 과업(서브트리)을 함께 이동하고 WBS ID 를 자동 재채번·재정렬
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
    showToast(`단위 과업 레벨은 L2 ~ L5 범위 내에서만 조정 가능합니다. (하위 과업 포함 최대 L${maxLvl})`);
    return;
  }
  if (delta > 0) {
    const prev = wbsData[idx - 1];
    if (!prev || (prev.system || "").trim() !== (row.system || "").trim() || nextLvl > (prev.level || 1) + 1) {
      showToast(`직전 과업(L${prev ? prev.level : "-"}) 아래로만 내릴 수 있습니다. (최대 L${prev ? (prev.level || 1) + 1 : 2})`);
      return;
    }
  }
  const oldId = row.id;
  subtree.forEach(t => { t.level = (t.level || 1) + delta; });
  rebuildAll();
  showToast(`🔢 [${oldId} → ${row.id}] 레벨 L${nextLvl - delta} → L${nextLvl} 변경 (하위 ${subtree.length - 1}건 포함) · WBS ID 자동 재채번 완료`);
}

// 레벨 선택 상자 변경
function setTaskLevel(idx, lvl) {
  const row = wbsData[idx];
  if (!row) return;
  const delta = parseInt(lvl, 10) - (row.level || 1);
  if (delta) changeTaskLevel(idx, delta);
  else renderWbsTable();
}

// 서브시스템 변경: 하위 과업을 함께 대상 서브시스템 마지막으로 이동 후 재채번
function changeTaskSystem(idx, sys) {
  const row = wbsData[idx];
  if (!row || !sys || row.system === sys) return;
  if (row.level === 1) {
    showToast("서브시스템 루트(L1)는 다른 서브시스템으로 이동할 수 없습니다. 기준정보에서 서브시스템명을 변경하세요.");
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
  showToast(`🔀 과업(하위 ${block.length - 1}건 포함)을 [${sys}] 서브시스템 마지막으로 이동하고 WBS ID 를 재채번했습니다.`);
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
      showToast("현재 상위 그룹 내에서 가장 첫 번째 과업입니다.");
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
      showToast("현재 상위 그룹 내에서 가장 마지막 과업입니다.");
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
  rebuildAll();
}

function addNewRow() {
  const sysFilterEl = document.getElementById("wbsSubsystemFilter");
  const defaultSys = (sysFilterEl && sysFilterEl.value !== "ALL") ? sysFilterEl.value : (subsystemsMeta[0] ? subsystemsMeta[0].name : "PMO");
  const validStart = WBSEngine.getNextWorkingDay(projectConfig.projectStartDate, projectConfig.holidays, projectConfig.projectEndDate);
  const validEnd = WBSEngine.getNextWorkingDay(projectConfig.projectEndDate, projectConfig.holidays, projectConfig.projectEndDate);

  wbsData.push({
    id: "",
    level: 2,
    system: defaultSys,
    name: "신규 단위과업",
    weight: 5,
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
  const sysFilterEl = document.getElementById("wbsSubsystemFilter");
  const sysFilter = sysFilterEl ? sysFilterEl.value : "ALL";
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
    showToast(`[휴일 자동보정 완료] 주말·공휴일에 걸쳐 있던 ${adjustedCount}건의 과업 계획일정을 평일(영업일)로 자동 보정했습니다.`);
  } else {
    showToast("현재 조회된 과업 중 휴일(주말·공휴일)에 해당하는 계획일정이 없습니다.");
  }
}

// [요건 5 신규] 개별 행(Task) 단위 계획 ➔ 실적 즉시 반영
// [v1.0.8] 계획 → 실적 반영 공통 규칙
//  - 실적 진척률 = 계획 진척률, 실적시작일 미입력 시 계획시작일
//  - 100% 가 되면 실적완료일: 계획완료일이 기준일과 같은 주차이면 계획완료일, 아니면 기준일
//  - 실적시작일이 실적완료일보다 미래이면 실적시작일 = 실적완료일
function applyPlanToActual(task) {
  const rep = projectConfig.reportDate;
  if (task.pStart && !task.aStart) task.aStart = task.pStart;
  task.aProg = task.pProg;
  if (task.aProg >= 100) {
    const wk = WBSEngine.getWeekRange(rep, projectConfig.weekStartDay);
    task.aEnd = task.pEnd && task.pEnd >= wk.start && task.pEnd <= wk.end ? task.pEnd : rep;
    if (task.aStart && task.aStart > task.aEnd) task.aStart = task.aEnd;
  }
}

function fillRowActualFromPlan(idx) {
  const task = wbsData[idx];
  if (!task || !task.isLeaf) return;
  applyPlanToActual(task);
  rebuildAll();
  showToast(`[${task.id} ${task.name}] 계획 진척률(${task.pProg}%)을 실적에 반영했습니다.${task.aProg >= 100 ? ` (실적완료일 ${task.aEnd})` : ""}`);
}

// 서브시스템(또는 전체)에서 기준일 현재 진행 중이거나 기준일에 끝나는 과업만 반영 (과거 완료 과업은 보존)
function fillActualFromPlan() {
  const repDateStr = projectConfig.reportDate;
  const sysFilterEl = document.getElementById("wbsSubsystemFilter");
  const sysFilter = sysFilterEl ? sysFilterEl.value : "ALL";
  let updatedCount = 0;
  wbsData.forEach(task => {
    if (!task.isLeaf) return;
    if (sysFilter !== "ALL" && task.system !== sysFilter) return;
    if (!task.pStart || !task.pEnd) return;
    if (task.pStart <= repDateStr && task.pEnd >= repDateStr) {
      applyPlanToActual(task);
      updatedCount++;
    }
  });
  rebuildAll();
  const scopeLabel = sysFilter === "ALL" ? "전체 서브시스템" : `[${sysFilter}]`;
  showToast(`${scopeLabel}에서 기준일(${repDateStr}) 현재 진행 중이거나 완료되는 과업 ${updatedCount}건의 실적을 반영했습니다. (과거 일정 과업은 보존)`);
}
