// [IOSTAR-PM] 기준정보: 분야 · 서브시스템 · 표준 산출물
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// -------------------------------------------------------------
// [요건 2 & 5 & 6 & 7] 서브시스템 기준정보 및 선택 리스트(<select>) 공통 공급자
// -------------------------------------------------------------
let subsystemsMeta = [];

// [ver1.0.4 신규] 프로젝트 및 시스템 접근 인력 관리 (기본 관리자: admin / 초기비번: 1234)
let projectUsers = [
  { empNo: "admin", name: "시스템관리자", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" }
];

// [요건 2 & 7 신규] 단계별 표준산출물관리 마스터 (1차 / 2차 복수 체크 가능)
const DEFAULT_STANDARD_DELIVERABLES = [
  { phase: "요구사항정의단계", name: "사업수행계획서 및 WBS 공정표", round1: true, round2: true, round3: false, round4: true, defaultDate: "2026-10-15", remarks: "1차 착수본 / 2차 중간본 / 4차 최종본" },
  { phase: "요구사항정의단계", name: "요구사항 정의서 및 추적표(RTM)", round1: true, round2: true, round3: true, round4: true, defaultDate: "2026-10-30", remarks: "전 차수(1~4차) 변경이력 관리 산출물" },
  { phase: "분석설계단계", name: "UI/UX 화면설계서", round1: true, round2: true, round3: false, round4: true, defaultDate: "2026-11-06", remarks: "1차 초안 / 2차 확정 / 4차 현행화" },
  { phase: "분석설계단계", name: "데이터베이스 ERD 및 테이블정의서", round1: true, round2: true, round3: false, round4: true, defaultDate: "2026-11-12", remarks: "1차 논리·물리설계 / 4차 최종본" },
  { phase: "분석설계단계", name: "인터페이스 API 명세서", round1: true, round2: true, round3: false, round4: false, defaultDate: "2026-11-12", remarks: "1·2차 대내외 인터페이스 설계" },
  { phase: "구현단계", name: "단위테스트 시나리오 및 결과보고서", round1: false, round2: true, round3: true, round4: false, defaultDate: "2026-12-10", remarks: "2·3차 구현단계 검증 산출물" },
  { phase: "통합테스트단계", name: "통합테스트 결함조치결과서", round1: false, round2: false, round3: true, round4: true, defaultDate: "2026-12-22", remarks: "3차 통합테스트 / 4차 최종검증" },
  { phase: "이행안정화단계", name: "시스템 운영자 및 멤버 매뉴얼", round1: false, round2: false, round3: false, round4: true, defaultDate: "2026-12-30", remarks: "4차 이행 및 안정화 최종 산출물" }
];

let standardDeliverablesMeta = JSON.parse(JSON.stringify(DEFAULT_STANDARD_DELIVERABLES));

// -------------------------------------------------------------
// [ver1.0.4 신규] 상위 분야(Domain, 최대 5개) 관리 및 전 화면 연동 필터
// -------------------------------------------------------------
function getProjectDomains() {
  if (!projectConfig.domains || !Array.isArray(projectConfig.domains)) {
    projectConfig.domains = ["제조실행", "품질관리", "설비보전", "기준정보", "공통인프라"];
  }
  return projectConfig.domains.slice(0, 5);
}

function renderDomainChips() {
  const container = document.getElementById("domainChipsContainer");
  if (!container) return;
  container.innerHTML = "";
  const domains = getProjectDomains();

  domains.forEach((d, idx) => {
    const chip = document.createElement("span");
    chip.className = "status-badge-chip chip-progress";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "4px";
    chip.style.padding = "3px 8px";
    chip.style.fontSize = "var(--fs-xs, 11px)";
    chip.innerHTML = `
      <b>${escapeHtml(d)}</b>
      <button type="button" style="background:none;border:none;color:#dc2626;cursor:pointer;font-weight:bold;font-size:var(--fs-sm, 12px);" data-click="deleteDomain" data-click-args="${UiEvents.args(idx)}" title="도메인 삭제">×</button>
    `;
    container.appendChild(chip);
  });
}

function addNewDomain() {
  const input = document.getElementById("newDomainInput");
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast("추가할 도메인명을 입력해주세요.");
    return;
  }
  const domains = getProjectDomains();
  if (domains.length >= 5) {
    showToast("⚠️ 상위 도메인은 최대 5개까지만 등록 가능합니다.");
    return;
  }
  if (domains.includes(val)) {
    showToast("이미 등록된 도메인명입니다.");
    return;
  }
  projectConfig.domains.push(val);
  input.value = "";
  renderDomainChips();
  updateAllSubsystemFilterDropdowns();
  persistChanges();
  showToast(`신규 도메인 [${val}] 가 등록되었습니다. (총 ${projectConfig.domains.length}/5개)`);
}

function deleteDomain(idx) {
  const domains = getProjectDomains();
  if (domains.length <= 1) {
    showToast("최소 1개 이상의 도메인이 유지되어야 합니다.");
    return;
  }
  const delName = domains[idx];
  openConfirmDialog(`[${delName}] 도메인을 삭제하시겠습니까?\n(소속된 서브시스템은 '미지정도메인'로 변경됩니다)`, () => {
    projectConfig.domains.splice(idx, 1);
    subsystemsMeta.forEach(s => {
      if (s.domain === delName) s.domain = projectConfig.domains[0] || "공통";
    });
    renderDomainChips();
    rebuildAll();
    showToast(`[${delName}] 도메인이 삭제되었습니다.`);
  });
}

function onDomainFilterChanged(domainSelectId, subsysSelectId) {
  const dSel = document.getElementById(domainSelectId);
  const sSel = document.getElementById(subsysSelectId);
  if (!dSel || !sSel) return;
  const selDomain = dSel.value || "ALL";

  const allSystems = getAllSubsystemNames();
  const filteredSystems = selDomain === "ALL"
    ? allSystems
    : allSystems.filter(sys => WBSEngine.getSubsystemDomain(sys) === selDomain);

  const prevSubVal = sSel.value;
  const isAllOptNeeded = sSel.id !== "mergeTargetSubsystemSelect" && sSel.id !== "excelSubsysExportSelect" && sSel.id !== "excelSubsysImportSelect";

  sSel.innerHTML = isAllOptNeeded ? `<option value="ALL">전체 서브시스템 (${filteredSystems.length}개)</option>` : "";
  filteredSystems.forEach(sys => {
    const opt = document.createElement("option");
    opt.value = sys;
    opt.textContent = isAllOptNeeded ? sys : `${sys} (${WBSEngine.getSubsystemCode(sys)})`;
    sSel.appendChild(opt);
  });

  if (filteredSystems.includes(prevSubVal)) {
    sSel.value = prevSubVal;
  } else if (!isAllOptNeeded && filteredSystems.length > 0) {
    sSel.value = filteredSystems[0];
  } else if (isAllOptNeeded) {
    sSel.value = "ALL";
  }
}

function getAllSubsystemNames() {
  const names = new Set();
  subsystemsMeta.forEach(s => { if (s.name) names.add(s.name.trim()); });
  if (typeof wbsData !== "undefined") wbsData.forEach(d => { if (d.system) names.add(d.system.trim()); });
  if (typeof deliverablesData !== "undefined") deliverablesData.forEach(d => { if (d.system) names.add(d.system.trim()); });
  if (typeof reqMasterData !== "undefined") reqMasterData.forEach(d => { if (d.system) names.add(d.system.trim()); });
  if (typeof vocData !== "undefined") vocData.forEach(d => { if (d.system) names.add(d.system.trim()); });
  return Array.from(names).filter(Boolean);
}

function getSubsystemOptionsHtml(selectedVal) {
  const list = getAllSubsystemNames();
  const sel = (selectedVal || "").trim();
  if (sel && !list.includes(sel)) list.push(sel);
  return list
    .map(sys => `<option value="${escapeHtml(sys)}" ${sys === sel ? "selected" : ""}>${escapeHtml(sys)}</option>`)
    .join("");
}

function updateAllSubsystemFilterDropdowns() {
  const list = getAllSubsystemNames();
  // [ver1.0.4] 전 화면 분야(Domain) 드롭다운 채우기
  const domains = getProjectDomains();
  const domainFilterIds = [
    "dashDomainFilter", "scurveDomainFilter", "matrixDomainFilter", "ganttDomainFilter",
    "wbsDomainFilter", "reqDomainFilter", "vocDomainFilter", "delivDomainFilter",
    "mergeTargetDomainSelect", "workDataDomainSelect", "excelExportDomainSelect", "excelImportDomainSelect"
  ];
  domainFilterIds.forEach(dId => {
    const dSel = document.getElementById(dId);
    if (!dSel) return;
    const curD = dSel.value || "ALL";
    dSel.innerHTML = `<option value="ALL">전체 도메인 (5개중 ${domains.length}개 운영)</option>` +
      domains.map(d => `<option value="${escapeHtml(d)}" ${d === curD ? "selected" : ""}>🗂️ ${escapeHtml(d)}</option>`).join("");
  });

  const filterConfigs = [
    { id: "dashSubsystemFilter", allLabel: "전체 서브시스템 (통합)" },
    { id: "scurveSystemFilter", allLabel: "전체 통합 프로젝트" },
    { id: "matrixSubsystemFilter", allLabel: "전체 서브시스템 보기" },
    { id: "ganttSubsystemFilter", allLabel: "전체 서브시스템" },
    { id: "wbsSubsystemFilter", allLabel: "전체 서브시스템 보기" },
    { id: "reqSubsystemFilter", allLabel: "전체 서브시스템 보기" },
    { id: "vocSubsystemFilter", allLabel: "전체 서브시스템 보기" },
    { id: "delivSubsystemFilter", allLabel: "전체 서브시스템" },
    { id: "bulkDelivTargetSystem", allLabel: "전체 서브시스템 일괄 생성" },
    { id: "collabExportSubsystemSelect", allLabel: "전체 서브시스템 통합 JSON 내보내기" }
  ];

  filterConfigs.forEach(cfg => {
    const sel = document.getElementById(cfg.id);
    if (!sel) return;
    // [v2.4.0] 처음에는 내 담당 서브시스템으로 (담당이 전체이면 전체)
    let curVal = sel.value || "ALL";
    if (!sel.dataset.init) {
      sel.dataset.init = "1";
      const own = typeof Permission !== "undefined" ? Permission.ownSubsystem() : "ALL";
      if (own && own !== "ALL") curVal = own;
    }
    sel.innerHTML = `<option value="ALL">${cfg.allLabel}</option>`;
    list.forEach(sys => {
      const opt = document.createElement("option");
      opt.value = sys;
      opt.textContent = sys;
      if (sys === curVal) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  // [ver1.0.4.4] 단일 서브시스템 선택 전용 드롭다운 (JSON 스마트병합 대상, 서브시스템별 엑셀 다운/업로드)
  const singleSysIds = ["mergeTargetSubsystemSelect", "excelSubsysExportSelect", "excelSubsysImportSelect"];
  singleSysIds.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const curVal = sel.value;
    sel.innerHTML = "";
    list.forEach((sys, i) => {
      const opt = document.createElement("option");
      opt.value = sys;
      opt.textContent = `${sys} (${WBSEngine.getSubsystemCode(sys)})`;
      if (sys === curVal || (!curVal && i === 0)) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  updateDeliverableRoundDropdowns();
  if (typeof SmartMergeCenter !== "undefined") SmartMergeCenter.refreshMergeUiPermissions();
}

function getActiveDeliverableRounds() {
  const maxR = Math.min(4, Math.max(1, parseInt((projectConfig && projectConfig.maxDeliverableRounds) || 2, 10)));
  const rounds = [];
  for (let i = 1; i <= maxR; i++) rounds.push(`${i}차`);
  return rounds;
}

function updateDeliverableRoundDropdowns() {
  const rounds = getActiveDeliverableRounds();
  const roundLabelsStr = rounds.join(" + ");

  const filterEl = document.getElementById("delivRoundFilter");
  if (filterEl) {
    const cur = filterEl.value || "ALL";
    filterEl.innerHTML = `<option value="ALL">전체 차수 (${roundLabelsStr})</option>` +
      rounds.map(r => `<option value="${r}" ${r === cur ? "selected" : ""}>${r} 제출분만 보기</option>`).join("");
  }

  const bulkEl = document.getElementById("bulkDelivTargetRound");
  if (bulkEl) {
    const cur = bulkEl.value || "ALL";
    bulkEl.innerHTML = `<option value="ALL">전체 운영 차수 (${roundLabelsStr})</option>` +
      rounds.map(r => `<option value="${r}" ${r === cur ? "selected" : ""}>${r} 제출 대상 산출물만 생성</option>`).join("");
  }
}

// [v1.0.6] 데이터 변경 알림: 로컬 저장소 모드는 실시간 자동저장, DB 서버 모드는 미저장 표시만 갱신
function persistChanges(immediate = false) {
  if (typeof SyncManager !== "undefined") SyncManager.onDataChanged(immediate);
}

function renderSubsystemsMetaTable() {
  const tbody = document.getElementById("subsystemsMetaBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const domains = getProjectDomains();
  const sdlcList = WBSEngine.getActiveSdlcList();

  subsystemsMeta.forEach((sub, idx) => {
    const tr = document.createElement("tr");
    const rootTask = wbsData.find(d => d.system === sub.name && d.level === 1);
    const linkedTasks = wbsData.filter(d => d.system === sub.name && d.isLeaf);
    const taskCount = linkedTasks.length;
    const aProg = rootTask ? rootTask.aProg : (taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.aProg, 0) / taskCount) : 0);

    const domainOptionsHtml = domains
      .map(d => `<option value="${escapeHtml(d)}" ${sub.domain === d ? "selected" : ""}>${escapeHtml(d)}</option>`)
      .join("");

    const sdlcOptionsHtml = sdlcList
      .map(s => `<option value="${s.code}" ${sub.sdlcCode === s.code ? "selected" : ""}>${escapeHtml(s.name)}</option>`)
      .join("");

    tr.innerHTML = `
      <td>
        <select style="width:125px;font-weight:bold;color:var(--primary);" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "domain", "$value", "rebuildAll")}">
          ${domainOptionsHtml}
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(sub.code || sub.name)}" style="width:85px;font-weight:bold;color:var(--primary);" title="ID 채번 접두 코드" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "code", "$trim", "rebuildAll")}"></td>
      <td><input type="text" value="${escapeHtml(sub.name)}" style="width:120px;font-weight:bold;" data-change="updateSubsystemName" data-change-args="${UiEvents.args(idx, "$value")}"></td>
      <td>
        <select style="width:115px;" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "type", "$value", "rebuildAll")}">
          <option value="SDLC" ${sub.type === "SDLC" ? "selected" : ""}>SDLC 공정형</option>
          <option value="REQ" ${sub.type === "REQ" ? "selected" : ""}>개선타입(REQ)</option>
        </select>
      </td>
      <td>
        <select style="width:160px; font-size:var(--fs-xs, 11px);" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "sdlcCode", "$value", "rebuildAll")}" ${sub.type === "REQ" ? "disabled title='개선타입은 SDLC 단계 매칭 대상이 아닙니다'" : ""}>
          ${sdlcOptionsHtml}
        </select>
      </td>
      <td><input type="number" value="${sub.weight}" style="width:65px;" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "weight", "$num", "syncSubsystemWeights", "rebuildAll")}"></td>
      <td><input type="text" value="${escapeHtml(sub.pm || "")}" style="width:85px;" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "pm", "$value", "persistChanges")}"></td>
      <td><input type="text" value="${escapeHtml(sub.desc || "")}" style="width:100%; font-size:var(--fs-xs, 11px);" data-change="UiH.set" data-change-args="${UiEvents.args("subsystemsMeta", idx, "desc", "$value", "persistChanges")}"></td>
      <td style="text-align:center;"><b>${taskCount}</b>개</td>
      <td style="text-align:right;"><b style="color:var(--success);">${aProg}%</b></td>
      <td><button class="btn btn-danger btn-sm" data-click="deleteSubsystemMeta" data-click-args="${UiEvents.args(idx)}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function addNewSubsystemMeta() {
  if (subsystemsMeta.length >= 20) {
    showToast("⚠️ 서브시스템은 최대 20개까지만 등록 가능합니다.");
    return;
  }
  const nextIdx = subsystemsMeta.length + 1;
  const domains = getProjectDomains();
  const defaultDomain = domains[(nextIdx - 1) % domains.length] || "공통인프라";
  const sdlcList = WBSEngine.getActiveSdlcList();
  const defaultSdlcCode = sdlcList[0] ? sdlcList[0].code : "SDLC_A";

  const code = `SYS_${String(nextIdx).padStart(2, "0")}`;
  const name = `서브시스템${String.fromCharCode(64 + nextIdx)}`;
  subsystemsMeta.push({
    domain: defaultDomain,
    code: code,
    name: name,
    type: "SDLC",
    sdlcCode: defaultSdlcCode,
    weight: 15,
    pm: `담당PM${nextIdx}`,
    desc: `${name} Task 범위`
  });
  renderSubsystemsMetaTable();
  rebuildAll();
  showToast(`[${name}] 신규 서브시스템이 등록되었습니다. (총 ${subsystemsMeta.length}/20개 등록됨)`);
}

function updateSubsystemName(idx, newName) {
  const cleanNew = (newName || "").trim();
  if (!cleanNew) return;
  const oldName = subsystemsMeta[idx].name;
  if (!subsystemsMeta[idx].code || subsystemsMeta[idx].code === oldName) {
    subsystemsMeta[idx].code = cleanNew;
  }
  subsystemsMeta[idx].name = cleanNew;
  wbsData.forEach(d => { if (d.system === oldName) d.system = cleanNew; });
  deliverablesData.forEach(d => { if (d.system === oldName) d.system = cleanNew; });
  reqMasterData.forEach(d => { if (d.system === oldName) d.system = cleanNew; });
  vocData.forEach(d => { if (d.system === oldName) d.system = cleanNew; });
  rebuildAll();
}

// 서브시스템 가중치는 프로젝트 종합 계산(WBSEngine.weightedProgress)에만 씀 — WBS L1 가중치(서브시스템 100 기준)와 별개
function syncSubsystemWeights() {}

function deleteSubsystemMeta(idx) {
  openConfirmDialog(`[${subsystemsMeta[idx].name}] 프로젝트 설정을 삭제하시겠습니까?`, () => {
    subsystemsMeta.splice(idx, 1);
    renderSubsystemsMetaTable();
    rebuildAll();
  });
}

// [요건 2 신규] 설정 탭 1-4: 단계별 표준산출물관리 렌더링 및 조작
function renderStandardDeliverablesMetaTable() {
  const tbody = document.getElementById("standardDeliverablesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const maxR = Math.min(4, Math.max(1, parseInt((projectConfig && projectConfig.maxDeliverableRounds) || 2, 10)));
  const table = document.getElementById("standardDeliverablesTable");
  if (table) {
    const thead = table.querySelector("thead");
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th style="width: 45px; text-align:center;">No</th>
          <th style="width: 140px;">표준 Phase</th>
          <th>필수 표준 산출물 명칭</th>
          <th style="width: 75px; text-align:center;">1차${maxR < 1 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 75px; text-align:center;">2차${maxR < 2 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 75px; text-align:center;">3차${maxR < 3 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 75px; text-align:center;">4차${maxR < 4 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 125px;">기준일자</th>
          <th style="width: 140px;">비고</th>
          <th style="width: 50px; text-align:center;">삭제</th>
        </tr>
      `;
    }
  }

  const phaseOptions = ["요구사항정의단계", "분석설계단계", "구현단계", "통합테스트단계", "시험검증단계", "이행단계", "안정화단계", "이행안정화단계", "구축단계"];

  // [v3.7.0] 표준 공정단계 순으로 표시 (같은 단계 안에서는 등록 순서)
  const phaseRank = p => { const i = phaseOptions.indexOf(p); return i === -1 ? phaseOptions.length : i; };
  const order = standardDeliverablesMeta.map((item, idx) => idx).sort((a, b) => phaseRank(standardDeliverablesMeta[a].phase) - phaseRank(standardDeliverablesMeta[b].phase) || a - b);
  order.forEach((idx, no) => {
    const item = standardDeliverablesMeta[idx];
    // 자동 초기화: maxR 초과 차수는 무조건 false로 동기화
    for (let r = maxR + 1; r <= 4; r++) {
      item[`round${r}`] = false;
    }

    const tr = document.createElement("tr");
    const phaseSelectHtml = phaseOptions
      .map(p => `<option value="${p}" ${item.phase === p ? "selected" : ""}>${p}</option>`)
      .join("");

    const buildRoundCell = (rNum, colorHex) => {
      const key = `round${rNum}`;
      const isEnabled = rNum <= maxR;
      if (!isEnabled) {
        return `
          <td style="text-align:center; opacity:0.38; background:#f8fafc; cursor:not-allowed;">
            <label style="display:inline-flex; align-items:center; gap:4px; font-weight:bold; font-size:var(--fs-xs, 11px); color:#94a3b8; cursor:not-allowed;" title="프로젝트 기본정보에서 ${maxR}차까지만 운영되도록 설정되어 선택이 비활성화되었습니다.">
              <input type="checkbox" disabled style="cursor:not-allowed;">
              <span style="font-size:var(--fs-2xs, 10px);">${rNum}차</span>
            </label>
          </td>
        `;
      }
      return `
        <td style="text-align:center;">
          <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; font-weight:bold; font-size:var(--fs-xs, 11px); color:${colorHex};" title="${rNum}차 필수 제출 대상 여부">
            <input type="checkbox" ${item[key] ? "checked" : ""} data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, key, "$checked", "persistChanges")}">
            ${rNum}차
          </label>
        </td>
      `;
    };

    tr.innerHTML = `
      <td style="text-align:center;"><b>${no + 1}</b></td>
      <td>
        <select style="width:130px;" data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, "phase", "$value", "renderStandardDeliverablesMetaTable", "persistChanges")}">
          ${phaseSelectHtml}
        </select>
      </td>
      <td>
        <input type="text" value="${escapeHtml(item.name)}" style="width:100%; font-weight:bold;" data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, "name", "$value", "persistChanges")}">
      </td>
      ${buildRoundCell(1, "#3730a3")}
      ${buildRoundCell(2, "#92400e")}
      ${buildRoundCell(3, "#065f46")}
      ${buildRoundCell(4, "#6b21a8")}
      <td>
        <input type="date" value="${item.defaultDate || projectConfig.reportDate}" data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, "defaultDate", "$value", "persistChanges")}">
      </td>
      <td>
        <input type="text" value="${escapeHtml(item.remarks || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, "remarks", "$value", "persistChanges")}">
      </td>
      <td style="text-align:center;">
        <button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("standardDeliverablesMeta", idx, "renderStandardDeliverablesMetaTable", "persistChanges")}">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function addNewStandardDeliverableMeta() {
  standardDeliverablesMeta.push({
    phase: "분석설계단계",
    name: "신규 표준 산출물",
    round1: true,
    round2: true,
    defaultDate: projectConfig.reportDate || "2026-11-04",
    remarks: "1차 초안 / 2차 최종본 제출"
  });
  renderStandardDeliverablesMetaTable();
  persistChanges();
  showToast("신규 표준 산출물 항목이 추가되었습니다. (1차·2차 제출 여부를 복수로 체크할 수 있습니다.)");
}

function resetStandardDeliverablesMeta() {
  openConfirmDialog("표준산출물 프로젝트 설정을 초기 기본 목록(8종)으로 복원하시겠습니까?", () => {
    standardDeliverablesMeta = JSON.parse(JSON.stringify(DEFAULT_STANDARD_DELIVERABLES));
    renderStandardDeliverablesMetaTable();
    persistChanges();
    showToast("표준산출물 관리 목록이 초기 기본값으로 복원되었습니다.");
  });
}
