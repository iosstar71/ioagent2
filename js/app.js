// =============================================================================
// IOSTAR-PM - 코어 앱 엔진
// =============================================================================
// [v1.2.0] 제품 이름·버전은 app.ini → js/app-config.js (APP_CONFIG) 에서 읽음
const APP_VERSION = (function () {
  const c = typeof APP_CONFIG !== "undefined" ? APP_CONFIG : { productName: "IOSTAR-PM", version: "1.0.1", edition: "STANDARD", editionName: "Standard" };
  const edName = c.editionName !== undefined ? c.editionName : (c.edition && c.edition !== "KR" ? c.edition : "");
  return { version: c.version, title: `${c.productName}${edName ? " " + edName : ""} ver${c.version}`, edition: c.edition || "KR", editionName: edName };
})();

// 인페이지 토스트 알림 및 비차단 확인 모달 헬퍼
let _confirmCallback = null;
function showToast(message) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 3800);
}
window.alert = showToast;

function openConfirmDialog(message, onConfirm) {
  const modal = document.getElementById("confirmDialogModal");
  const msgEl = document.getElementById("confirmDialogMessage");
  if (modal && msgEl) {
    msgEl.textContent = message;
    _confirmCallback = onConfirm;
    modal.style.display = "flex";
  } else if (typeof onConfirm === "function") {
    onConfirm();
  }
}
function closeConfirmDialog(confirmed) {
  const modal = document.getElementById("confirmDialogModal");
  if (modal) modal.style.display = "none";
  const cb = _confirmCallback;
  _confirmCallback = null;
  if (confirmed && typeof cb === "function") cb();
}

function openDataBackupModal() {
  const modal = document.getElementById("dataBackupModal");
  if (modal) modal.style.display = "flex";
}
function closeDataBackupModal() {
  const modal = document.getElementById("dataBackupModal");
  if (modal) modal.style.display = "none";
}

// [보안 강화] XSS 공격 방어 문자열 이스케이프 함수
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -------------------------------------------------------------
// [요건 2 & 5 & 6 & 7] 서브시스템 기준정보 및 선택 리스트(<select>) 공통 공급자
// -------------------------------------------------------------
let subsystemsMeta = [];

// [ver1.0.4 신규] 프로젝트 및 시스템 접근 인력 관리 (기본 관리자: admin / 초기비번: 1234)
let projectUsers = [
  { empNo: "admin", name: "시스템관리자", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" }
];

// [요건 2 & 7 신규] 단계별 표준산출물관리 마스터 (1회차 / 2회차 복수 체크 가능)
const DEFAULT_STANDARD_DELIVERABLES = [
  { phase: "요구사항정의단계", name: "사업수행계획서 및 WBS 공정표", round1: true, round2: true, round3: false, round4: true, defaultDate: "2026-10-15", remarks: "1회차 착수본 / 2회차 중간본 / 4회차 최종본" },
  { phase: "요구사항정의단계", name: "요구사항 정의서 및 추적표(RTM)", round1: true, round2: true, round3: true, round4: true, defaultDate: "2026-10-30", remarks: "전 회차(1~4회차) 변경이력 관리 산출물" },
  { phase: "분석설계단계", name: "UI/UX 화면설계서", round1: true, round2: true, round3: false, round4: true, defaultDate: "2026-11-06", remarks: "1회차 초안 / 2회차 확정 / 4회차 현행화" },
  { phase: "분석설계단계", name: "데이터베이스 ERD 및 테이블정의서", round1: true, round2: true, round3: false, round4: true, defaultDate: "2026-11-12", remarks: "1회차 논리·물리설계 / 4회차 최종본" },
  { phase: "분석설계단계", name: "인터페이스 API 명세서", round1: true, round2: true, round3: false, round4: false, defaultDate: "2026-11-12", remarks: "1·2회차 대내외 인터페이스 설계" },
  { phase: "구현단계", name: "단위테스트 시나리오 및 결과보고서", round1: false, round2: true, round3: true, round4: false, defaultDate: "2026-12-10", remarks: "2·3회차 구현단계 검증 산출물" },
  { phase: "통합테스트단계", name: "통합테스트 결함조치결과서", round1: false, round2: false, round3: true, round4: true, defaultDate: "2026-12-22", remarks: "3회차 통합테스트 / 4회차 최종검증" },
  { phase: "이행안정화단계", name: "시스템 운영자 및 사용자 매뉴얼", round1: false, round2: false, round3: false, round4: true, defaultDate: "2026-12-30", remarks: "4회차 이행 및 안정화 최종 산출물" }
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
      <button type="button" style="background:none;border:none;color:#dc2626;cursor:pointer;font-weight:bold;font-size:var(--fs-sm, 12px);" data-click="deleteDomain" data-click-args="${UiEvents.args(idx)}" title="분야 삭제">×</button>
    `;
    container.appendChild(chip);
  });
}

function addNewDomain() {
  const input = document.getElementById("newDomainInput");
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast("추가할 분야명을 입력해주세요.");
    return;
  }
  const domains = getProjectDomains();
  if (domains.length >= 5) {
    showToast("⚠️ 상위 분야는 최대 5개까지만 등록 가능합니다.");
    return;
  }
  if (domains.includes(val)) {
    showToast("이미 등록된 분야명입니다.");
    return;
  }
  projectConfig.domains.push(val);
  input.value = "";
  renderDomainChips();
  updateAllSubsystemFilterDropdowns();
  persistChanges();
  showToast(`신규 분야 [${val}] 가 등록되었습니다. (총 ${projectConfig.domains.length}/5개)`);
}

function deleteDomain(idx) {
  const domains = getProjectDomains();
  if (domains.length <= 1) {
    showToast("최소 1개 이상의 분야가 유지되어야 합니다.");
    return;
  }
  const delName = domains[idx];
  openConfirmDialog(`[${delName}] 분야를 삭제하시겠습니까?\n(소속된 서브시스템은 '미지정분야'로 변경됩니다)`, () => {
    projectConfig.domains.splice(idx, 1);
    subsystemsMeta.forEach(s => {
      if (s.domain === delName) s.domain = projectConfig.domains[0] || "공통";
    });
    renderDomainChips();
    rebuildAll();
    showToast(`[${delName}] 분야가 삭제되었습니다.`);
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
    dSel.innerHTML = `<option value="ALL">전체 분야 (5개중 ${domains.length}개 운영)</option>` +
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
  for (let i = 1; i <= maxR; i++) rounds.push(`${i}회차`);
  return rounds;
}

function updateDeliverableRoundDropdowns() {
  const rounds = getActiveDeliverableRounds();
  const roundLabelsStr = rounds.join(" + ");

  const filterEl = document.getElementById("delivRoundFilter");
  if (filterEl) {
    const cur = filterEl.value || "ALL";
    filterEl.innerHTML = `<option value="ALL">전체 회차 (${roundLabelsStr})</option>` +
      rounds.map(r => `<option value="${r}" ${r === cur ? "selected" : ""}>${r} 제출분만 보기</option>`).join("");
  }

  const bulkEl = document.getElementById("bulkDelivTargetRound");
  if (bulkEl) {
    const cur = bulkEl.value || "ALL";
    bulkEl.innerHTML = `<option value="ALL">전체 운영 회차 (${roundLabelsStr})</option>` +
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
    desc: `${name} 과업 범위`
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

function syncSubsystemWeights() {
  subsystemsMeta.forEach(sub => {
    const root = wbsData.find(d => d.system === sub.name && d.level === 1);
    if (root) root.weight = sub.weight;
  });
}

function deleteSubsystemMeta(idx) {
  openConfirmDialog(`[${subsystemsMeta[idx].name}] 기준정보를 삭제하시겠습니까?`, () => {
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
          <th style="width: 140px;">표준 공정단계</th>
          <th>필수 표준 산출물 명칭</th>
          <th style="width: 75px; text-align:center;">1회차${maxR < 1 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 75px; text-align:center;">2회차${maxR < 2 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 75px; text-align:center;">3회차${maxR < 3 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 75px; text-align:center;">4회차${maxR < 4 ? '<br><span style="font-size:calc(9px * var(--fs-scale, 1));color:#94a3b8;">(미운영)</span>' : ''}</th>
          <th style="width: 125px;">기준일자</th>
          <th style="width: 140px;">비고</th>
          <th style="width: 50px; text-align:center;">삭제</th>
        </tr>
      `;
    }
  }

  const phaseOptions = ["요구사항정의단계", "분석설계단계", "구현단계", "통합테스트단계", "시험검증단계", "이행단계", "안정화단계", "이행안정화단계", "구축단계"];

  standardDeliverablesMeta.forEach((item, idx) => {
    // 자동 초기화: maxR 초과 회차는 무조건 false로 동기화
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
            <label style="display:inline-flex; align-items:center; gap:4px; font-weight:bold; font-size:var(--fs-xs, 11px); color:#94a3b8; cursor:not-allowed;" title="프로젝트 기본정보에서 ${maxR}회차까지만 운영되도록 설정되어 선택이 비활성화되었습니다.">
              <input type="checkbox" disabled style="cursor:not-allowed;">
              <span style="font-size:var(--fs-2xs, 10px);">${rNum}회차</span>
            </label>
          </td>
        `;
      }
      return `
        <td style="text-align:center;">
          <label style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; font-weight:bold; font-size:var(--fs-xs, 11px); color:${colorHex};" title="${rNum}회차 필수 제출 대상 여부">
            <input type="checkbox" ${item[key] ? "checked" : ""} data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, key, "$checked", "persistChanges")}">
            ${rNum}회차
          </label>
        </td>
      `;
    };

    tr.innerHTML = `
      <td style="text-align:center;"><b>${idx + 1}</b></td>
      <td>
        <select style="width:130px;" data-change="UiH.set" data-change-args="${UiEvents.args("standardDeliverablesMeta", idx, "phase", "$value", "persistChanges")}">
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
    remarks: "1회차 초안 / 2회차 최종본 제출"
  });
  renderStandardDeliverablesMetaTable();
  persistChanges();
  showToast("신규 표준 산출물 항목이 추가되었습니다. (1회차·2회차 제출 여부를 복수로 체크할 수 있습니다.)");
}

function resetStandardDeliverablesMeta() {
  openConfirmDialog("표준산출물 기준정보를 초기 기본 목록(8종)으로 복원하시겠습니까?", () => {
    standardDeliverablesMeta = JSON.parse(JSON.stringify(DEFAULT_STANDARD_DELIVERABLES));
    renderStandardDeliverablesMetaTable();
    persistChanges();
    showToast("표준산출물 관리 목록이 초기 기본값으로 복원되었습니다.");
  });
}

// -------------------------------------------------------------
// 프로젝트 기본 설정 및 대한민국 공휴일 생성기
// -------------------------------------------------------------
let projectConfig = {
  systemTitle: APP_VERSION.title,
  projectName: "27년 가동률 시스템 개선",
  domains: ["관리공통", "개선공정", "신규공정"], // [2027년 프로젝트] 3대 상위 분야
  channels: [], // [v3.0.0] 소통 채널은 프로젝트별 (없으면 전체 + 이 프로젝트의 서브시스템)
  customSdlcTypes: [ // SDLC 마스터 풀 (최대 8개 등록 지원 / 프로젝트 활성 4개 선택)
    {
      code: "SDLC_PMO",
      name: "PMO 사업관리/거버넌스형 (3단계)",
      desc: "착수단계 ➔ 실행통제단계 ➔ 종료단계 (사업관리·품질보증·감리·이관 표준 거버넌스 공정)",
      isRecommended: true,
      phases: [
        { key: "p1", name: "착수단계", weight: 20, output: "사업수행계획서/착수보고서", keywords: ["착수", "기반", "계획", "거버넌스", "조직", "기준선", "baseline", "wbs수립"] },
        { key: "p2", name: "실행통제단계", weight: 60, output: "품질감리보고서/진척보고서", keywords: ["통제", "감리", "품질", "공정", "모니터링", "실행", "진척", "검수", "산출물"] },
        { key: "p3", name: "종료단계", weight: 20, output: "사업완료보고서/인수인계서", keywords: ["종료", "보고", "인수인계", "평가", "완료", "보안점검", "이행", "이관"] }
      ]
    },
    {
      code: "SDLC_SMART_MFG",
      name: "스마트제조/설비가동률 개선형 (4단계)",
      desc: "요구사항정의 ➔ 과제개발 ➔ 추가요구개발 ➔ 이행안정화 (27년 가동률 시스템 개선 맞춤형 공정)",
      isRecommended: true,
      phases: [
        { key: "p1", name: "요구사항정의단계 (1~3월)", weight: 20, output: "요구사항목록/과제정의서", keywords: ["요구사항", "요건", "접수", "정의", "확정", "상세정의"] },
        { key: "p2", name: "과제요구사항 개발단계 (3~10월)", weight: 40, output: "과제분석설계서/개발결과서", keywords: ["과제", "과제개발", "분석설계", "개발", "단위테스트", "구현"] },
        { key: "p3", name: "추가 요구사항 개발단계 (5~10월)", weight: 25, output: "추가요건개발서/현장검수원", keywords: ["추가", "추가요구", "개선", "비가동", "터치", "센서", "연계", "알고리즘"] },
        { key: "p4", name: "이행/안정화 단계 (11~12월)", weight: 15, output: "보안점검조치서/인수인계서", keywords: ["이행", "안정화", "보안", "보안점검", "인수인계", "종료", "운영이관"] }
      ]
    },
    {
      code: "SDLC_WATERFALL",
      name: "폭포수 표준형 (Waterfall / 5단계)",
      desc: "분석 ➔ 설계 ➔ 개발 ➔ 테스트 ➔ 이행 표준 순차형 공정",
      isRecommended: true,
      phases: [
        { key: "p1", name: "분석", weight: 15, output: "요구사항명세서", keywords: ["분석", "요구사항", "요건", "현황", "착수", "기획"] },
        { key: "p2", name: "설계", weight: 25, output: "화면/DB설계서", keywords: ["설계", "화면", "db", "인터페이스", "아키텍처", "스토리보드", "erd"] },
        { key: "p3", name: "개발", weight: 35, output: "소스코드/단위테스트", keywords: ["개발", "구현", "단위", "코딩", "제작", "엔진", "모듈"] },
        { key: "p4", name: "테스트", weight: 15, output: "통합테스트결과서", keywords: ["테스트", "통합테스트", "검증", "시험", "점검", "부하"] },
        { key: "p5", name: "이행", weight: 10, output: "이행보고서", keywords: ["이행", "전환", "오픈", "배포", "안정화", "컷오버"] }
      ]
    },
    {
      code: "SDLC_AGILE",
      name: "애자일/스프린트 반복형 (Agile & Sprint / 4단계)",
      desc: "스프린트계획 ➔ 개발이터레이션 ➔ 스프린트리뷰 ➔ 릴리즈 반복형 공정",
      isRecommended: true,
      phases: [
        { key: "p1", name: "스프린트계획", weight: 20, output: "스프린트백로그", keywords: ["스프린트", "백로그", "계획", "요구분석", "유저스토리"] },
        { key: "p2", name: "개발이터레이션", weight: 40, output: "증분소프트웨어", keywords: ["개발", "이터레이션", "구현", "컴포넌트", "코딩", "작업"] },
        { key: "p3", name: "스프린트리뷰", weight: 25, output: "리뷰/QA테스트결과", keywords: ["리뷰", "qa", "검증", "인수", "피드백", "테스트"] },
        { key: "p4", name: "릴리즈", weight: 15, output: "릴리즈노트", keywords: ["릴리즈", "배포", "오픈", "회고", "런칭"] }
      ]
    },
    {
      code: "SDLC_COTS",
      name: "패키지/솔루션 도입형 (COTS Package / 4단계)",
      desc: "Fit-Gap분석 ➔ 파라미터설정 ➔ 인수테스트 ➔ 이행오픈 솔루션 최적화 공정",
      phases: [
        { key: "p1", name: "Fit-Gap분석", weight: 25, output: "갭분석서", keywords: ["갭", "fit", "gap", "분석", "패키지", "커스터마이징", "비교"] },
        { key: "p2", name: "파라미터설정", weight: 40, output: "환경설정정의서", keywords: ["설정", "파라미터", "구축", "커스텀", "모듈", "매핑"] },
        { key: "p3", name: "인수테스트", weight: 20, output: "인수시험결과서", keywords: ["인수", "테스트", "검증", "시험", "사용자", "시운전"] },
        { key: "p4", name: "이행오픈", weight: 15, output: "가동승인원", keywords: ["이행", "오픈", "가동", "전환", "마이그레이션", "데이터"] }
      ]
    },
    {
      code: "SDLC_INFRA",
      name: "클라우드/인프라 전환형 (Cloud & Infra / 4단계)",
      desc: "아키텍처진단 ➔ 클라우드구축 ➔ 모의전환검증 ➔ 본전환 인프라 특화 공정",
      phases: [
        { key: "p1", name: "아키텍처진단", weight: 20, output: "진단보고서", keywords: ["진단", "아키텍처", "네트워크", "망분리", "설계", "분석"] },
        { key: "p2", name: "클라우드구축", weight: 35, output: "인프라구성도", keywords: ["구축", "k8s", "컨테이너", "클러스터", "프로비저닝", "설정"] },
        { key: "p3", name: "모의전환검증", weight: 25, output: "모의훈련결과서", keywords: ["모의", "훈련", "리허설", "취약점", "모의해킹", "테스트"] },
        { key: "p4", name: "본전환", weight: 20, output: "오픈확인서", keywords: ["본전환", "컷오버", "오픈", "스위칭", "안정화", "가동"] }
      ]
    },
    {
      code: "COMPACT",
      name: "SDLC 축약형 (4단계)",
      desc: "분석설계 ➔ 구현 ➔ 통합테스트 ➔ 이행 및 안정화",
      phases: [
        { key: "p1", name: "분석설계", weight: 25, output: "분석설계서", keywords: ["분석", "설계", "요구사항", "요건", "현황"] },
        { key: "p2", name: "구현", weight: 40, output: "소스코드/단위테스트", keywords: ["구현", "개발", "단위", "코딩", "제작"] },
        { key: "p3", name: "통합테스트", weight: 20, output: "통합테스트결과서", keywords: ["통합테스트", "시험", "테스트", "검증", "점검", "시운전"] },
        { key: "p4", name: "이행 및 안정화", weight: 15, output: "이행보고서", keywords: ["이행", "안정화", "운영", "전환", "오픈", "배포"] }
      ]
    },
    {
      code: "DETAILED",
      name: "SDLC 상세형 (6단계)",
      desc: "요구사항정의 ➔ 분석설계 ➔ 구현 ➔ 통합테스트 ➔ 이행 ➔ 안정화",
      phases: [
        { key: "p1", name: "요구사항정의", weight: 15, output: "요구사항정의서", keywords: ["요구사항", "요건정의", "요구정의", "현황분석", "착수"] },
        { key: "p2", name: "분석설계", weight: 20, output: "분석설계서", keywords: ["분석설계", "분석", "설계", "화면설계", "db설계", "인터페이스"] },
        { key: "p3", name: "구현", weight: 35, output: "소스코드/단위테스트", keywords: ["구현", "개발", "단위", "코딩", "모듈"] },
        { key: "p4", name: "통합테스트", weight: 15, output: "통합테스트결과서", keywords: ["통합테스트", "시험", "테스트", "검증", "점검"] },
        { key: "p5", name: "이행", weight: 10, output: "이행결과보고서", keywords: ["이행", "전환", "오픈", "배포", "컷오버"] },
        { key: "p6", name: "안정화", weight: 5, output: "안정화완료보고서", keywords: ["안정화", "운영이관", "모니터링", "교육"] }
      ]
    }
  ],
  activeSdlcCodes: ["SDLC_PMO", "SDLC_SMART_MFG", "SDLC_WATERFALL", "SDLC_AGILE"],
  activeReqPreset: "REQ_MFG_2027",
  // [ver1.0.4] 개선과제형(REQ) 서브시스템 공정 단계 기준정보 (4단계)
  reqSdlcPhases: [
    { key: "r1", name: "요구사항정의단계 (1~3월)", weight: 20, output: "요구사항목록/정의서", keywords: ["요구사항", "요건", "접수", "분석", "정의", "확정"] },
    { key: "r2", name: "과제요구사항 개발단계 (3~10월)", weight: 40, output: "과제개발결과서/분석설계서", keywords: ["과제", "개발", "분석설계", "구현", "단위테스트"] },
    { key: "r3", name: "추가 요구사항 개발단계 (5~10월)", weight: 25, output: "추가요건소스/검수원", keywords: ["추가", "개선", "비가동", "터치", "알고리즘", "연계"] },
    { key: "r4", name: "이행/안정화 단계 (11~12월)", weight: 15, output: "보안조치서/인수인계서", keywords: ["이행", "보안", "점검", "인수인계", "종료", "안정화"] }
  ],
  maxDeliverableRounds: 2,
  projectStartDate: "2027-01-01",
  projectEndDate: "2027-12-31",
  weekStartDay: 5, // 금요일 시작
  reportDate: "2027-06-01",
  roleHomeSettings: {
    SYS_ADMIN: "EXECUTIVE",
    PM: "EXECUTIVE",
    MEMBER: "PORTAL"
  },
  exportSettings: {
    xlsxTheme: "Navy Classic",
    xlsxFontSize: 10,
    docxTheme: "Official Navy",
    docxFontSize: 10,
    docxFont: "맑은 고딕"
  },
  idPrefixConfig: {
    wbsPrefix: "",
    wbsUseSubCode: false,
    reqPrefix: "REQ",
    reqUseSubCode: true,
    vocPrefix: "VOC",
    vocUseSubCode: true,
    actPrefix: "ACT",
    actUseSubCode: true
  },
  holidays: []
};

function renderProjectTitles() {
  // 저장된 시스템 명칭의 버전 표기는 현재 프로그램 버전으로 표시
  // [v1.0.10] 시스템 명칭 변경(IOSTAR-PM): 이전 명칭으로 저장된 시스템 타이틀은 새 명칭으로 교체
  if (/AX[ _]Project[ _]Management|AX_PMYS/i.test(projectConfig.systemTitle || "")) projectConfig.systemTitle = APP_VERSION.title;
  const sysTitle = String(projectConfig.systemTitle || APP_VERSION.title).replace(/ver\d+\.\d+\.\d+/, "ver" + APP_VERSION.version);
  const projName = projectConfig.projectName || "차세대 통합 구축 프로젝트";

  const hSys = document.getElementById("headerSystemTitleText");
  const hProj = document.getElementById("headerProjectNameBadge");
  const bTitle = document.getElementById("pageBrowserTitle");
  // Standard·Neo: 머리글 제목은 제품 이름만 (버전은 옆 배지에 표시)
  if (hSys) hSys.textContent = APP_VERSION.edition !== "KR" ? sysTitle.replace(/\s*ver\d+(\.\d+)*.*$/, "") : sysTitle;
  const hVer = document.getElementById("headerVersionBadge");
  if (hVer) hVer.textContent = (APP_VERSION.editionName ? APP_VERSION.editionName + " " : "") + "v" + APP_VERSION.version;
  if (hProj) hProj.textContent = projName;
  if (bTitle) bTitle.textContent = `${sysTitle} (${projName})`;

  const inSys = document.getElementById("cfgSystemTitle");
  const inProj = document.getElementById("cfgProjectName");
  if (inSys) inSys.value = sysTitle;
  if (inProj) inProj.value = projName;

  // SDLC는 1-2-B 커스텀 SDLC 카드로 관리됨

  const maxR = Math.min(4, Math.max(1, parseInt(projectConfig.maxDeliverableRounds || 2, 10)));
  const maxRSel = document.getElementById("cfgMaxDeliverableRounds");
  if (maxRSel) maxRSel.value = String(maxR);
}

function updateProjectSdlcType(newType) {
  projectConfig.sdlcType = newType === "DETAILED" ? "DETAILED" : "COMPACT";
  const spec = WBSEngine.getActiveSdlcSpec();
  rebuildAll();
  showToast(`[프로젝트 표준 SDLC 변경] '${spec.label}' 형태로 적용되었습니다. (개선타입 REQ는 서브시스템별로 추가 가능)`);
}

function updateMaxDeliverableRounds(newMax) {
  const maxR = Math.min(4, Math.max(1, parseInt(newMax, 10) || 2));
  projectConfig.maxDeliverableRounds = maxR;
  if (Array.isArray(standardDeliverablesMeta)) {
    standardDeliverablesMeta.forEach(item => {
      for (let r = maxR + 1; r <= 4; r++) {
        item[`round${r}`] = false;
      }
    });
  }
  updateDeliverableRoundDropdowns();
  renderStandardDeliverablesMetaTable();
  renderDeliverablesTable();
  rebuildAll();
  showToast(`[산출물 제출 회차 설정] 1회차 ~ ${maxR}회차 운영으로 동기화되었습니다. (초과 회차 비선택 초기화 완료)`);
}

function updateProjectTitles() {
  const inSys = document.getElementById("cfgSystemTitle");
  const inProj = document.getElementById("cfgProjectName");
  if (inSys && inSys.value.trim()) projectConfig.systemTitle = inSys.value.trim();
  if (inProj && inProj.value.trim()) projectConfig.projectName = inProj.value.trim();
  renderProjectTitles();
  persistChanges();
  showToast(`시스템 타이틀 및 프로젝트명([${projectConfig.projectName}])이 반영되었습니다.`);
}

// [ver1.0.4 신규] WBS / REQ / VOC ID 채번 Prefix 및 서브시스템 코드 연동 설정
function renderIdPrefixSettings() {
  if (!projectConfig.idPrefixConfig) {
    projectConfig.idPrefixConfig = {
      wbsPrefix: "",
      wbsUseSubCode: false,
      reqPrefix: "REQ",
      reqUseSubCode: true,
      vocPrefix: "VOC",
      vocUseSubCode: true
    };
  }
  const c = projectConfig.idPrefixConfig;
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ""; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

  setVal("cfgWbsPrefix", c.wbsPrefix);
  setChk("cfgWbsUseSubCode", c.wbsUseSubCode);
  setVal("cfgReqPrefix", c.reqPrefix);
  setChk("cfgReqUseSubCode", c.reqUseSubCode);
  setVal("cfgVocPrefix", c.vocPrefix);
  setChk("cfgVocUseSubCode", c.vocUseSubCode);
  setVal("cfgActPrefix", c.actPrefix || "ACT");
  setChk("cfgActUseSubCode", c.actUseSubCode !== false);

  updateIdPrefixPreview();
}

function updateIdPrefixPreview() {
  const c = projectConfig.idPrefixConfig || {};
  const sampleSubCode = (subsystemsMeta[1] && subsystemsMeta[1].code) ? subsystemsMeta[1].code : "EQP";

  const wParts = [];
  if ((c.wbsPrefix || "").trim()) wParts.push(c.wbsPrefix.trim().replace(/-+$/, ""));
  if (c.wbsUseSubCode) wParts.push(sampleSubCode);
  const wSample = (wParts.length > 0 ? wParts.join("-") + "-" : "") + "1.1.1";

  const rParts = [];
  if ((c.reqPrefix || "REQ").trim()) rParts.push((c.reqPrefix || "REQ").trim().replace(/-+$/, ""));
  if (c.reqUseSubCode) rParts.push(sampleSubCode);
  const rSample = rParts.join("-") + "-01";

  const vParts = [];
  if ((c.vocPrefix || "VOC").trim()) vParts.push((c.vocPrefix || "VOC").trim().replace(/-+$/, ""));
  if (c.vocUseSubCode) vParts.push(sampleSubCode);
  const vSample = vParts.join("-") + "-01";

  const aParts = [];
  if ((c.actPrefix || "ACT").trim()) aParts.push((c.actPrefix || "ACT").trim().replace(/-+$/, ""));
  if (c.actUseSubCode !== false) aParts.push(sampleSubCode);
  const aSample = aParts.join("-") + "-01";

  const prevEl = document.getElementById("idPrefixPreviewText");
  if (prevEl) {
    prevEl.innerHTML = `• WBS: ${escapeHtml(wSample)}<br>• REQ: ${escapeHtml(rSample)}<br>• VOC: ${escapeHtml(vSample)}<br>• ActionItem: ${escapeHtml(aSample)}`;
  }
  const prevAct = document.getElementById("previewActId");
  if (prevAct) prevAct.textContent = aSample;
}

function applyIdPrefixSettings(reNumberAll = false) {
  if (!projectConfig.idPrefixConfig) projectConfig.idPrefixConfig = {};
  const c = projectConfig.idPrefixConfig;
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

  c.wbsPrefix = getVal("cfgWbsPrefix");
  c.wbsUseSubCode = getChk("cfgWbsUseSubCode");
  c.reqPrefix = getVal("cfgReqPrefix") || "REQ";
  c.reqUseSubCode = getChk("cfgReqUseSubCode");
  c.vocPrefix = getVal("cfgVocPrefix") || "VOC";
  c.vocUseSubCode = getChk("cfgVocUseSubCode");
  c.actPrefix = getVal("cfgActPrefix") || "ACT";
  c.actUseSubCode = getChk("cfgActUseSubCode");

  updateIdPrefixPreview();

  if (reNumberAll) {
    // 기존 요구사항 및 VOC ID도 설정된 Prefix+서브시스템코드 규칙으로 일괄 재채번 및 WBS reqId 참조 동기화
    const reqIdMap = {};
    const sysReqCounters = {};
    reqMasterData.forEach(r => {
      const oldId = r.id;
      const sCode = WBSEngine.getSubsystemCode(r.system);
      const key = c.reqUseSubCode ? sCode : "ALL";
      sysReqCounters[key] = (sysReqCounters[key] || 0) + 1;
      const parts = [c.reqPrefix.replace(/-+$/, "")];
      if (c.reqUseSubCode && sCode) parts.push(sCode.replace(/-+$/, ""));
      parts.push(String(sysReqCounters[key]).padStart(2, "0"));
      const newId = parts.filter(Boolean).join("-");
      reqIdMap[oldId] = newId;
      r.id = newId;
    });
    wbsData.forEach(t => {
      if (t.reqId && reqIdMap[t.reqId]) t.reqId = reqIdMap[t.reqId];
    });

    const sysVocCounters = {};
    vocData.forEach(v => {
      const sCode = WBSEngine.getSubsystemCode(v.system);
      const key = c.vocUseSubCode ? sCode : "ALL";
      sysVocCounters[key] = (sysVocCounters[key] || 0) + 1;
      const parts = [c.vocPrefix.replace(/-+$/, "")];
      if (c.vocUseSubCode && sCode) parts.push(sCode.replace(/-+$/, ""));
      parts.push(String(sysVocCounters[key]).padStart(2, "0"));
      v.id = parts.filter(Boolean).join("-");
    });

    // [ver1.0.4 요건 3] Action Item ID도 설정된 Prefix 및 서브시스템 코드 규칙으로 일괄 재채번
    if (typeof meetingsData !== "undefined" && Array.isArray(meetingsData)) {
      const sysActCounters = {};
      meetingsData.forEach(m => {
        if (Array.isArray(m.actionItems)) {
          m.actionItems.forEach(a => {
            const sCode = (typeof WBSEngine !== "undefined" ? WBSEngine.getSubsystemCode(m.system) : m.system) || "COM";
            const key = c.actUseSubCode !== false ? sCode : "ALL";
            sysActCounters[key] = (sysActCounters[key] || 0) + 1;
            const parts = [(c.actPrefix || "ACT").replace(/-+$/, "")];
            if (c.actUseSubCode !== false && sCode && sCode !== "ALL") parts.push(sCode.replace(/-+$/, ""));
            parts.push(String(sysActCounters[key]).padStart(2, "0"));
            a.id = parts.filter(Boolean).join("-");
          });
        }
      });
      if (typeof MeetingManager !== "undefined" && typeof MeetingManager.render === "function") {
        MeetingManager.render();
      }
    }
  }

  rebuildAll();
  if (reNumberAll) {
    showToast("WBS · 요구사항(REQ) · VOC · Action Item 전체 ID에 설정된 접두어(Prefix) 및 서브시스템 코드 규칙이 일괄 적용되었습니다.");
  } else {
    showToast("ID 채번 규칙(Action Item 포함)이 변경되었습니다. (신규 생성 건부터 자동 적용)");
  }
}

function updateIdPrefixConfig() {
  applyIdPrefixSettings(false);
}

function buildNextEntityId(entityType, sysName) {
  const c = projectConfig.idPrefixConfig || { reqPrefix: "REQ", reqUseSubCode: true, vocPrefix: "VOC", vocUseSubCode: true, actPrefix: "ACT", actUseSubCode: true };
  const sCode = WBSEngine.getSubsystemCode(sysName);

  if (entityType === "ACT") {
    const parts = [(c.actPrefix || "ACT").replace(/-+$/, "")];
    if (c.actUseSubCode !== false && sCode && sCode !== "ALL") parts.push(sCode.replace(/-+$/, ""));
    const basePref = parts.filter(Boolean).join("-");
    const allActions = typeof MeetingManager !== "undefined" ? MeetingManager.getAllActionItems() : [];
    const matching = allActions.filter(a => (a.id || "").startsWith(basePref + "-"));
    const nextNum = matching.length + 1;
    return `${basePref}-${String(nextNum).padStart(2, "0")}`;
  }

  if (entityType === "REQ") {
    const parts = [(c.reqPrefix || "REQ").replace(/-+$/, "")];
    if (c.reqUseSubCode && sCode) parts.push(sCode.replace(/-+$/, ""));
    const basePref = parts.filter(Boolean).join("-");
    const matching = reqMasterData.filter(r => (r.id || "").startsWith(basePref + "-"));
    const nextNum = matching.length + 1;
    return `${basePref}-${String(nextNum).padStart(2, "0")}`;
  } else {
    const parts = [(c.vocPrefix || "VOC").replace(/-+$/, "")];
    if (c.vocUseSubCode && sCode) parts.push(sCode.replace(/-+$/, ""));
    const basePref = parts.filter(Boolean).join("-");
    const matching = vocData.filter(v => (v.id || "").startsWith(basePref + "-"));
    const nextNum = matching.length + 1;
    return `${basePref}-${String(nextNum).padStart(2, "0")}`;
  }
}

// =============================================================================
// [기준정보 > 사용자 정보] 투입인력 계정 · 권한(4단계) · 담당 서브시스템 · 언어
// =============================================================================
// [v3.0.0] 사용자 정보는 프로젝트별 — 이 프로젝트의 사용자(시스템관리자 + 참여자)만 표시
//  역할·담당 서브시스템·부서는 이 프로젝트에만 적용, 사번·이름·비밀번호는 계정 공통
function renderProjectUsersTable() {
  const tbody = document.getElementById("projectUsersBody");
  const pid = ProjectContext.current;
  const rows = projectUsers.map((u, idx) => ({ u, idx })).filter(x => ProjectContext.isAdminUser(x.u) || ProjectContext.member(x.u, pid));
  const amAdmin = ProjectManager.isAdmin();
  if (tbody) {
    tbody.innerHTML = "";
    const info = document.getElementById("projectUsersScopeInfo");
    if (info) {
      const p = ProjectContext.info();
      info.style.display = "block";
      info.innerHTML = `🗂️ <b>${escapeHtml(p ? p.name : (projectConfig.projectName || pid))}</b> 프로젝트의 사용자입니다. 역할·담당 서브시스템·부서는 이 프로젝트에만 적용되고, 사번·이름·비밀번호는 계정 공통입니다. 다른 프로젝트의 사용자는 ${amAdmin ? "[📥 다른 프로젝트에서 복사]로" : "시스템관리자에게 요청하여"} 가져옵니다.`;
    }
    const copyBtn = document.getElementById("btnCopyUsers");
    if (copyBtn) copyBtn.style.display = amAdmin ? "" : "none";
    rows.forEach(({ u, idx }) => {
      const isAdminAccount = (u.empNo || "").toLowerCase() === "admin";
      const asg = ProjectManager.userAssignment(u);
      const role = asg.role;
      const roles = AuthManager.ROLES.filter(r => r !== "SYS_ADMIN" || amAdmin || asg.admin);
      const roleOpts = roles.map(r => `<option value="${r}" ${role === r ? "selected" : ""}>${AuthManager.ROLE_DESCS[r]}</option>`).join("");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(u.empNo)}" style="width:105px; font-weight:bold;" ${u._new ? "" : "readonly title='저장된 사번은 바꿀 수 없습니다.'"} data-change="setProjectUserEmpNo" data-change-args="${UiEvents.args(idx, "$trim")}"></td>
        <td><input type="text" value="${escapeHtml(u.name || "")}" style="width:100px;" data-change="UiH.set" data-change-args="${UiEvents.args("projectUsers", idx, "name", "$trim", "persistChanges")}"></td>
        <td>
          <select style="width:250px; font-weight:bold;" data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "role", "$value")}" ${isAdminAccount || (asg.admin && !amAdmin) ? "disabled title='시스템 관리자 계정은 모든 프로젝트에서 시스템 관리자 권한을 유지합니다.'" : ""}>${roleOpts}</select>
          ${asg.admin ? `<div class="pm-role-tag own">모든 프로젝트 공통</div>` : ""}
        </td>
        <td>
          <select style="width:125px;" data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "subsystem", "$value")}" ${asg.admin ? "disabled" : ""}>
            <option value="ALL" ${asg.subsystem === "ALL" ? "selected" : ""}>전체 서브시스템</option>
            ${getSubsystemOptionsHtml(asg.subsystem)}
          </select>
        </td>
        <td><input type="text" value="${escapeHtml(asg.dept || "")}" style="width:100%;" data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "dept", "$value")}"></td>
        <td>
          <select style="width:90px;" data-change="UiH.set" data-change-args="${UiEvents.args("projectUsers", idx, "lang", "$value", "persistChanges")}">
            <option value="ko" ${(u.lang || "ko") === "ko" ? "selected" : ""}>한국어</option>
            <option value="en" ${u.lang === "en" ? "selected" : ""}>English</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            <input type="password" id="userNewPwd_${idx}" placeholder="새 비번 입력" autocomplete="off" style="width:105px; font-size:var(--fs-xs, 11px);">
            <button class="btn btn-sm" data-btn="save" data-click="updateProjectUserPassword" data-click-args="${UiEvents.args(idx)}">변경</button>
            <button class="btn btn-sm" data-btn="warn" data-click="resetProjectUserPassword" data-click-args="${UiEvents.args(idx)}" title="비밀번호를 초기값(1234)으로 초기화합니다.">🔄 초기화</button>
          </div>
        </td>
        <td><button class="btn btn-danger btn-sm" data-click="deleteProjectUser" data-click-args="${UiEvents.args(idx)}" ${isAdminAccount || (asg.admin && !amAdmin) ? "disabled title='기본 관리자(admin)와 시스템관리자 계정은 시스템관리자만 삭제할 수 있습니다.'" : "title='이 프로젝트에서 빼기 (다른 프로젝트 참여는 유지)'"}>×</button></td>
      `;
      tbody.appendChild(tr);
    });
  }
  // 권한 등급별 인원 통계 (이 프로젝트 기준)
  const list = rows.map(x => x.u);
  const count = r => list.filter(u => ProjectManager.userAssignment(u).role === r).length;
  const setText = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = `${n} 명`; };
  setText("userStatTotal", list.length);
  setText("userStatAdmin", count("SYS_ADMIN"));
  setText("userStatPm", count("PM"));
  setText("userStatLead", count("LEAD"));
  setText("userStatMember", count("MEMBER"));
}

// 새로 추가한 행의 사번 변경 (다른 프로젝트·이 프로젝트에 이미 있는 사번은 불가)
function setProjectUserEmpNo(idx, value) {
  const u = projectUsers[idx];
  if (!u || !u._new) return;
  const v = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(v)) { showToast("⚠️ 사번은 영문/숫자/_.- 2~30자로 입력하세요."); return renderProjectUsersTable(); }
  const other = ProjectContext.findAny(v) || projectUsers.find((x, i) => i !== idx && String(x.empNo || "").toLowerCase() === v.toLowerCase());
  if (other && other !== u) {
    showToast(ProjectManager.isAdmin() ? `⚠️ 이미 있는 사번(${v})입니다. 다른 프로젝트 사용자라면 [📥 다른 프로젝트에서 복사]를 쓰세요.` : `⚠️ 이미 있는 사번(${v})입니다. 다른 프로젝트 사용자는 시스템관리자에게 복사를 요청하세요.`);
    return renderProjectUsersTable();
  }
  u.empNo = v;
  renderProjectUsersTable();
  persistChanges();
}

// 언어 일괄 설정 (전체 사용자)
function applyBulkUserLanguage() {
  const sel = document.getElementById("bulkUserLangSelect");
  const lang = sel && sel.value === "en" ? "en" : "ko";
  openConfirmDialog(`모든 사용자(${projectUsers.length}명)의 언어를 [${lang === "en" ? "English" : "한국어"}]로 설정하시겠습니까? (다음 로그인부터 적용)`, () => {
    projectUsers.forEach(u => { u.lang = lang; });
    renderProjectUsersTable();
    persistChanges();
    showToast(`🌐 전체 사용자 언어가 [${lang === "en" ? "English" : "한국어"}]로 설정되었습니다. 저장 후 다음 로그인부터 적용됩니다.`);
  });
}

// 서브탭 공통 관리자 (기준정보 / 시스템 설정)
var SubTabs = {
  KEY: "AX_PMYS_SUBTAB_",
  show(group, name) {
    document.querySelectorAll(`.master-subtab-bar[data-group="${group}"] .master-subtab-btn`).forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
    document.querySelectorAll(`.master-subpane[data-group="${group}"]`).forEach(p => p.classList.toggle("active", p.dataset.subpane === name));
    try { sessionStorage.setItem(this.KEY + group, name); } catch (e) {}
    if (group === "master") {
      if (name === "holiday") ProgressBasisManager.render();
      if (name === "users") renderProjectUsersTable();
      if (name === "basic") { MilestoneManager.render(); if (typeof ProjectManager !== "undefined") ProjectManager.renderPanels(); }
    }
    if (group === "config" && name === "db") DbConnector.renderConfigForm();
    if (group === "config" && name === "project" && typeof ProjectManager !== "undefined") ProjectManager.renderPanels();
  },
  restore(group, def) {
    let name = def;
    try { name = sessionStorage.getItem(this.KEY + group) || def; } catch (e) {}
    this.show(group, name);
  }
};

// 기준정보 서브탭 (프로젝트 기본정보 / 공정단계정보 / 휴일정보 / 사용자 정보)
var MasterSubTabs = {
  show(name) { SubTabs.show("master", name); },
  restore() { SubTabs.restore("master", "basic"); }
};

// [v1.0.7] 주요 마일스톤 (통합 / 서브시스템별) — projectConfig.milestones
var MilestoneManager = {
  list() {
    if (!Array.isArray(projectConfig.milestones)) projectConfig.milestones = [];
    return projectConfig.milestones;
  },
  render() {
    const body = document.getElementById("milestoneTableBody");
    if (!body) return;
    const list = this.list();
    const rep = projectConfig.reportDate || "";
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:14px; color:var(--text-muted);">등록된 마일스톤이 없습니다. [➕ 마일스톤 추가]로 등록하세요.</td></tr>`;
      return;
    }
    const subs = getAllSubsystemNames();
    body.innerHTML = list
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => String(a.m.date).localeCompare(String(b.m.date)))
      .map(({ m, idx }) => {
        const opts = [`<option value="ALL" ${!m.scope || m.scope === "ALL" ? "selected" : ""}>🏁 통합 (프로젝트 전체)</option>`]
          .concat(subs.map(s => `<option value="${escapeHtml(s)}" ${m.scope === s ? "selected" : ""}>🔧 ${escapeHtml(s)}</option>`)).join("");
        const passed = m.date && m.date <= rep;
        return `<tr>
          <td><select style="width:150px;" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "scope", "$value")}">${opts}</select></td>
          <td><input type="text" value="${escapeHtml(m.name || "")}" style="width:100%; font-weight:bold;" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "name", "$value")}"></td>
          <td><input type="date" value="${escapeHtml(m.date || "")}" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "date", "$value")}"></td>
          <td><input type="text" value="${escapeHtml(m.desc || "")}" style="width:100%;" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "desc", "$value")}"></td>
          <td style="text-align:center;">${passed ? '<span class="status-tag tag-completed">경과</span>' : '<span class="status-tag tag-ready">예정</span>'}</td>
          <td style="text-align:center;"><button class="btn btn-sm" data-btn="danger" data-click="MilestoneManager.remove" data-click-args="${UiEvents.args(idx)}">×</button></td>
        </tr>`;
      }).join("");
  },
  add(kind) {
    const subs = getAllSubsystemNames();
    const own = Permission.ownSubsystem();
    const scope = kind === "ALL" ? "ALL" : (subs.includes(own) ? own : (subs[0] || "ALL"));
    this.list().push({ id: `MS-${Date.now().toString(36)}`, scope, name: kind === "ALL" ? "신규 통합 마일스톤" : "신규 서브시스템 마일스톤", date: projectConfig.reportDate || projectConfig.projectStartDate, desc: "" });
    this.changed();
  },
  update(idx, field, value) {
    const m = this.list()[idx];
    if (!m) return;
    m[field] = String(value || "").trim();
    this.changed();
  },
  remove(idx) {
    const m = this.list()[idx];
    if (!m) return;
    openConfirmDialog(`[${m.name}] 마일스톤을 삭제하시겠습니까?`, () => {
      this.list().splice(idx, 1);
      this.changed();
    });
  },
  changed() {
    this.render();
    renderGantt();
    persistChanges();
  }
};

// 계획 진척률 산정 기준 (달력 일수 / 영업일) — 선택 후 [적용] 시 전체 재계산
var ProgressBasisManager = {
  LABELS: { CALENDAR: "달력 일수 기준 (주말·공휴일 포함)", BUSINESS: "영업일 기준 (주말·공휴일 제외)" },
  current() { return projectConfig.progressBasis === "BUSINESS" ? "BUSINESS" : "CALENDAR"; },
  render() {
    const sel = document.getElementById("cfgProgressBasisSelect");
    if (sel) sel.value = this.current();
    this.onSelectChanged();
  },
  onSelectChanged() {
    const sel = document.getElementById("cfgProgressBasisSelect");
    const st = document.getElementById("progressBasisStatus");
    if (!sel || !st) return;
    const pending = sel.value !== this.current();
    st.innerHTML = pending
      ? `<span style="color:#d97706; font-weight:bold;">⚠️ 변경 대기: [적용]을 눌러야 진척률이 다시 계산됩니다.</span>`
      : `현재 적용: <b>${this.LABELS[this.current()]}</b>`;
  },
  apply() {
    const sel = document.getElementById("cfgProgressBasisSelect");
    if (!sel) return;
    projectConfig.progressBasis = sel.value === "BUSINESS" ? "BUSINESS" : "CALENDAR";
    rebuildAll();
    this.onSelectChanged();
    showToast(`📐 계획 진척률 산정 기준이 [${this.LABELS[projectConfig.progressBasis]}]으로 적용되어 전체 진척률을 다시 계산했습니다.`);
  }
};

function addNewProjectUser() {
  const pid = ProjectContext.current;
  let seq = projectUsers.length;
  const taken = e => !!(ProjectContext.findAny(e) || projectUsers.some(u => String(u.empNo || "").toLowerCase() === e.toLowerCase()));
  while (taken(`emp0${seq}`)) seq++;
  const newEmpNo = `emp0${seq}`;
  const sub = subsystemsMeta[0] ? subsystemsMeta[0].name : "ALL";
  projectUsers.push({
    empNo: newEmpNo, name: `신규담당자${seq}`, role: "MEMBER", subsystem: sub, dept: "", lang: "ko",
    pwdHash: "", // 초기 기본 비밀번호 '1234' 적용
    projectRoles: { [pid]: { role: "MEMBER", subsystem: sub, dept: "프로젝트 수행팀" } },
    _new: true
  });
  renderProjectUsersTable();
  persistChanges();
  showToast(`신규 사용자 [${newEmpNo}] 을(를) 이 프로젝트에 추가했습니다. 사번을 바꿀 수 있습니다. (초기 비밀번호: 1234)`);
}

async function updateProjectUserPassword(idx) {
  const input = document.getElementById(`userNewPwd_${idx}`);
  if (!input || !input.value) {
    showToast("변경할 새 비밀번호를 입력해주세요.");
    return;
  }
  const rule = AuthManager.validateNewPassword(input.value);
  if (rule) {
    showToast(rule);
    return;
  }
  const u = projectUsers[idx];
  const hash = await AuthManager.hashPassword(input.value);
  u.pwdHash = hash;
  u.pwdTemp = true; // 관리자가 지정한 임시 비밀번호 → 사용자가 첫 로그인 때 변경
  input.value = "";
  persistChanges();
  showToast(`[${u.name}(${u.empNo})] 인력의 비밀번호가 변경되었습니다.${SyncManager.isLocal() ? "" : " (저장 버튼을 눌러 서버에 반영하세요)"}`);
}

// [v1.0.7] 사용자별 비밀번호 초기화 (초기 비밀번호 1234)
function resetProjectUserPassword(idx) {
  const u = projectUsers[idx];
  if (!u) return;
  openConfirmDialog(`[${u.name}(${u.empNo})] 사용자의 비밀번호를 초기값(1234)으로 초기화하시겠습니까?`, () => {
    u.pwdHash = "";
    u.pwdTemp = false;
    u.pwdReset = true;
    if (String(u.empNo).toLowerCase() === "admin") { try { localStorage.removeItem(AuthManager.LEGACY_ADMIN_HASH_KEY); } catch (e) {} }
    persistChanges();
    showToast(`🔄 [${u.name}(${u.empNo})] 비밀번호가 1234로 초기화되었습니다.${SyncManager.isLocal() ? "" : " (저장 버튼을 눌러 서버에 반영하세요)"}`);
  });
}

// [v3.0.0] 사용자 삭제 = 이 프로젝트에서 빼기 (다른 프로젝트 참여가 없으면 계정도 삭제)
function deleteProjectUser(idx) {
  const u = projectUsers[idx];
  if (!u || (u.empNo || "").toLowerCase() === "admin") {
    showToast("기본 관리자(admin) 계정은 삭제할 수 없습니다.");
    return;
  }
  const pid = ProjectContext.current;
  const adminRow = ProjectContext.isAdminUser(u);
  if (adminRow && !ProjectManager.isAdmin()) return showToast("시스템관리자 계정은 시스템관리자만 삭제할 수 있습니다.");
  const full = ProjectContext.findAny(u.empNo) || u;
  const others = Object.keys(full.projectRoles || {}).filter(k => k !== pid);
  const msg = adminRow ? `[${u.name}(${u.empNo})] 시스템관리자 계정을 삭제하시겠습니까?`
    : others.length ? `[${u.name}(${u.empNo})] 사용자를 이 프로젝트에서 뺄까요? (다른 프로젝트 ${others.length}곳의 참여는 유지됩니다)`
    : `[${u.name}(${u.empNo})] 사용자를 이 프로젝트에서 뺄까요? 다른 프로젝트 참여가 없어 계정도 삭제됩니다.`;
  openConfirmDialog(msg, () => {
    if (!adminRow && others.length) {
      const pr = Object.assign({}, u.projectRoles);
      delete pr[pid];
      u.projectRoles = pr;
    } else {
      projectUsers.splice(idx, 1);
    }
    renderProjectUsersTable();
    persistChanges();
  });
}

function getKoreanNationalHolidays(startYear, endYear) {
  const holidays = [];
  for (let y = startYear; y <= endYear; y++) {
    holidays.push({ type: "NATIONAL", name: "신정", date: `${y}-01-01` });
    holidays.push({ type: "NATIONAL", name: "삼일절", date: `${y}-03-01` });
    holidays.push({ type: "NATIONAL", name: "어린이날", date: `${y}-05-05` });
    holidays.push({ type: "NATIONAL", name: "현충일", date: `${y}-06-06` });
    holidays.push({ type: "NATIONAL", name: "광복절", date: `${y}-08-15` });
    holidays.push({ type: "NATIONAL", name: "개천절", date: `${y}-10-03` });
    holidays.push({ type: "NATIONAL", name: "한글날", date: `${y}-10-09` });
    holidays.push({ type: "NATIONAL", name: "성탄절", date: `${y}-12-25` });

    if (y === 2025) {
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2025-01-28" });
      holidays.push({ type: "NATIONAL", name: "설날", date: "2025-01-29" });
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2025-01-30" });
      holidays.push({ type: "NATIONAL", name: "부처님오신날", date: "2025-05-05" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(부처님오신날)", date: "2025-05-06" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2025-10-05" });
      holidays.push({ type: "NATIONAL", name: "추석", date: "2025-10-06" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2025-10-07" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(추석)", date: "2025-10-08" });
    } else if (y === 2026) {
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2026-02-16" });
      holidays.push({ type: "NATIONAL", name: "설날", date: "2026-02-17" });
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2026-02-18" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(삼일절)", date: "2026-03-02" });
      holidays.push({ type: "NATIONAL", name: "부처님오신날", date: "2026-05-24" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(부처님오신날)", date: "2026-05-25" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(광복절)", date: "2026-08-17" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2026-09-24" });
      holidays.push({ type: "NATIONAL", name: "추석", date: "2026-09-25" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2026-09-26" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(개천절)", date: "2026-10-05" });
    } else if (y === 2027) {
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2027-02-06" });
      holidays.push({ type: "NATIONAL", name: "설날", date: "2027-02-07" });
      holidays.push({ type: "NATIONAL", name: "설날 연휴", date: "2027-02-08" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(설날)", date: "2027-02-09" });
      holidays.push({ type: "NATIONAL", name: "부처님오신날", date: "2027-05-13" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(광복절)", date: "2027-08-16" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2027-09-14" });
      holidays.push({ type: "NATIONAL", name: "추석", date: "2027-09-15" });
      holidays.push({ type: "NATIONAL", name: "추석 연휴", date: "2027-09-16" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(개천절)", date: "2027-10-04" });
      holidays.push({ type: "NATIONAL", name: "대체공휴일(한글날)", date: "2027-10-11" });
    }
  }
  return holidays;
}

function updateKoreanHolidays(showAlert = false) {
  const customHolidays = projectConfig.holidays.filter(h => h.type === "CUSTOM");
  const startY = new Date(projectConfig.projectStartDate).getFullYear() || 2026;
  const endY = new Date(projectConfig.projectEndDate).getFullYear() || 2026;

  const national = getKoreanNationalHolidays(Math.min(startY, endY), Math.max(startY, endY));

  const merged = [...customHolidays];
  national.forEach(nh => {
    if (!merged.some(m => m.date === nh.date)) {
      merged.push(nh);
    }
  });

  merged.sort((a, b) => a.date.localeCompare(b.date));
  projectConfig.holidays = merged;

  renderHolidays();
  rebuildAll();
  if (showAlert) showToast(`대한민국 법정공휴일이 프로젝트 기간(${startY}~${endY}년)에 맞춰 자동 재등록되었습니다.`);
}

var meetingsData = [];
let wbsData = [];

let deliverablesData = [];

let reqMasterData = [];

let vocData = [];

// [ver1.0.4 신규] 프로젝트 인력을 위한 공지사항(Notices) 및 팀원 소통(Communications) 데이터
let noticesData = [];

let communicationsData = [];
// [v2.4.0] 사용자별 할 일 (TodoCenter) — 행: { id, owner, kind: "todo"|"hide", title, due, priority, link, done, ... }
var todosData = [];

// -------------------------------------------------------------
// [v1.0.5 신규] 최초 실행 초기 데이터(JSON) 로더
//  - 원본: data/initial_data.json  (편집 후 tools/build_initial_data.py 로 js/initial-data.js 재생성)
//  - file:// 환경은 브라우저 보안상 JSON 파일을 fetch 할 수 없으므로 js/initial-data.js 에
//    동일 내용을 window.AX_INITIAL_DATA 로 내장하여 로드
//  - LocalStorage 에 저장 데이터가 없을 때(최초 실행 / 전체 초기화 후)에만 적용 후 즉시 LocalStorage 저장
// -------------------------------------------------------------
var InitialDataLoader = {
  appliedFromInitial: false,

  apply() {
    const data = (typeof window !== "undefined") ? window.AX_INITIAL_DATA : null;
    if (!data || typeof data !== "object") return false;
    try {
      const clone = JSON.parse(JSON.stringify(data));
      if (clone.projectConfig) projectConfig = Object.assign({}, projectConfig, clone.projectConfig);
      if (Array.isArray(clone.subsystemsMeta)) subsystemsMeta = clone.subsystemsMeta;
      if (Array.isArray(clone.standardDeliverablesMeta)) standardDeliverablesMeta = clone.standardDeliverablesMeta;
      if (Array.isArray(clone.projectUsers) && clone.projectUsers.length > 0) DataRegistry.set("projectUsers", clone.projectUsers);
      if (Array.isArray(clone.wbsData)) wbsData = clone.wbsData;
      if (Array.isArray(clone.deliverablesData)) deliverablesData = clone.deliverablesData;
      if (Array.isArray(clone.reqMasterData)) reqMasterData = clone.reqMasterData;
      if (Array.isArray(clone.vocData)) vocData = clone.vocData;
      if (Array.isArray(clone.noticesData)) noticesData = clone.noticesData;
      if (Array.isArray(clone.communicationsData)) communicationsData = clone.communicationsData;
      if (Array.isArray(clone.meetingsData)) meetingsData = clone.meetingsData;
      if (Array.isArray(clone.weeklyReportsData)) weeklyReportsData = clone.weeklyReportsData;
      if (Array.isArray(clone.todosData)) todosData = clone.todosData;
      if (clone.theme) {
        clone.theme = normalizeTheme(clone.theme);
        document.body.setAttribute("data-theme", clone.theme);
        const sel = document.getElementById("themeSelector");
        if (sel) sel.value = clone.theme;
      }
      this.appliedFromInitial = true;
      return true;
    } catch (e) {
      console.error("초기 데이터(JSON) 적용 실패:", e);
      return false;
    }
  }
};
window.InitialDataLoader = InitialDataLoader;

// =============================================================================
// [v1.0.8] 접속 방식과 저장소 모드 불일치 방지 (ModeGuard)
//  - 서버 주소(http://IP:8080)로 접속 + 로컬 저장소 모드 → "서버 DB 모드로 전환하시겠습니까?"
//      · 이 브라우저에서 저장소 모드를 한 번도 고른 적이 없으면 서버 DB 모드를 기본값으로 사용
//  - index.html 파일을 직접 열어 접속(file://) → 로컬 저장소 모드로 실행하고 서버 주소 접속 방법 안내
// =============================================================================
var ModeGuard = {
  accessType() {
    const p = window.location.protocol;
    return p === "http:" || p === "https:" ? "SERVER_URL" : "FILE";
  },

  async pingServer() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await fetch(window.location.origin + "/api/db/ping", { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return false;
      const json = await res.json().catch(() => ({}));
      return !!json.ok;
    } catch (e) {
      clearTimeout(timer);
      return false;
    }
  },

  _hasSavedChoice() {
    try { return !!localStorage.getItem(DbConnector.CONFIG_STORAGE_KEY); } catch (e) { return false; }
  },

  _setMode(mode) {
    DbConnector.config.mode = mode;
    DbConnector.config.connected = false;
    DbConnector.saveConfig();
    DbConnector.renderConfigForm();
    DbConnector.updateHeaderBadge();
  },

  async check() {
    const access = this.accessType();
    const mode = DbConnector.config.mode;

    if (access === "FILE") {
      if (mode !== "LOCAL") this._setMode("LOCAL");
      // [v1.2.0] 문장 단위로 작성 (영어 화면에서 문장 전체가 번역되도록 문장 안에 굵게 표시 등을 넣지 않음)
      this.loginNotice = "<div>📁 index.html 파일을 직접 열어 실행했습니다. 로컬 저장소 모드(이 PC 브라우저에만 저장)로 로그인합니다.</div>" +
        "<div>여러 사용자가 함께 쓰는 서버 DB 모드는 서버에서 run_server.bat 을 실행한 뒤 브라우저 주소창에 서버 주소(예: http://서버IP:8080)를 입력하여 접속하세요.</div>";
      if (mode !== "LOCAL") {
        await SyncUI.ask("📁 로컬 저장소 모드로 실행합니다",
          "index.html 파일을 직접 열어 접속했기 때문에 서버 DB 를 사용할 수 없습니다.\n" +
          "이번 접속은 로컬 저장소 모드(이 PC 브라우저에만 저장)로 전환하여 로그인합니다.\n\n" +
          "서버 DB 모드로 사용하려면 서버 PC 에서 run_server.bat 을 실행한 뒤, 브라우저 주소창에 http://서버IP:8080 으로 접속하세요.",
          [{ id: "ok", label: "확인 (로컬 저장소 모드로 로그인)", cls: "btn-primary" }]);
      }
      return;
    }

    // 서버 주소로 접속
    if (mode !== "LOCAL") return;
    const alive = await this.pingServer();
    if (!alive) {
      this.loginNotice = "⚠️ 서버 주소로 접속했지만 DB 서버 응답이 없어 로컬 저장소 모드로 실행합니다. (입력한 내용은 이 PC 브라우저에만 저장)";
      return;
    }
    if (!this._hasSavedChoice()) {
      this._setMode("SQLITE");
      this.loginNotice = "🗄️ 서버 주소로 접속하여 서버 DB 모드로 시작합니다. (여러 사용자가 같은 데이터를 함께 사용)";
      return;
    }
    const choice = await SyncUI.ask("🗄️ 서버 DB 모드로 전환하시겠습니까?",
      `서버 주소(${window.location.host})로 접속했지만 현재 저장소 모드가 [로컬 저장소] 입니다.\n` +
      "로컬 저장소 모드에서는 입력한 내용이 이 PC 브라우저에만 저장되어 다른 사용자와 공유되지 않고, 서버를 꺼도 화면이 계속 동작합니다.\n\n" +
      "※ 이 브라우저에 로컬로만 저장한 데이터가 있다면 전환 전에 [데이터 가져오기·내보내기 > ④ 전체 일괄 > JSON 내려받기]로 받아 두었다가 서버 모드에서 올리세요.",
      [
        { id: "server", label: "🗄️ 서버 DB 모드로 전환 (권장)", cls: "btn-primary" },
        { id: "local", label: "로컬 저장소 모드로 계속", cls: "btn-secondary" }
      ]);
    if (choice === "server") {
      this._setMode("SQLITE");
      this.loginNotice = "🗄️ 서버 DB 모드로 전환했습니다. 로그인하면 서버 데이터를 불러옵니다.";
    } else {
      this.loginNotice = "💻 로컬 저장소 모드로 계속합니다. 입력한 내용은 이 PC 브라우저에만 저장됩니다.";
    }
  }
};
window.ModeGuard = ModeGuard;

// =============================================================================
// [v1.0.8] 서버 연결 감시 (DB 서버 모드): 20초마다 서버 응답 확인
//  - 끊기면 상단 경고 배너 표시 + 저장 버튼 비활성화, 다시 연결되면 자동 해제
// =============================================================================
var ServerHeartbeat = {
  INTERVAL_MS: 20000,
  online: true,
  timer: null,

  start() {
    if (SyncManager.isLocal() || this.timer) return;
    this.timer = setInterval(() => this.check(), this.INTERVAL_MS);
  },

  async check() {
    const res = await ServerBackend.request("/api/db/ping", null, "GET", 4000);
    this.setOnline(!!res.ok);
  },

  setOnline(ok) {
    if (ok === this.online) return;
    this.online = ok;
    let bar = document.getElementById("serverOfflineBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "serverOfflineBar";
      bar.className = "server-offline-bar";
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.style.display = ok ? "none" : "block";
    bar.innerHTML = "🔌 <b>DB 서버 연결이 끊겼습니다.</b> 지금 입력하는 내용은 저장되지 않고 화면에만 남습니다. 서버가 다시 켜지면 자동으로 연결되며, 그때 [💾 전체 저장]을 눌러 주세요.";
    document.querySelectorAll("#btnHeaderSaveAll, .sync-toolbar button[data-btn='save'], .sync-toolbar .btn-primary").forEach(b => { b.disabled = !ok; });
    DbConnector.setConnected(ok);
    showToast(ok ? "🟢 DB 서버에 다시 연결되었습니다. 미저장 변경이 있으면 [💾 전체 저장]을 눌러 주세요." : "🔌 DB 서버 연결이 끊겼습니다. 저장할 수 없습니다.");
  }
};
window.ServerHeartbeat = ServerHeartbeat;

// =============================================================================
// [v1.0.6] 애플리케이션 시작 순서 (단일 진입점)
//  1) 저장소 모드·언어 초기화 → 2) 공통 툴바 → 3) 데이터 로드(로컬) → 4) 화면 초기화 → 5) 로그인
//  ※ DB 서버 모드는 서버 로그인(토큰 인증) 후 데이터를 불러옵니다.
// =============================================================================
var AppBoot = {
  uiReady: false,

  async start() {
    ProjectContext.init();
    DbConnector.init();
    if (typeof ButtonStandard !== "undefined") ButtonStandard.init();
    if (typeof I18N !== "undefined") I18N.init();
    await ModeGuard.check();
    SyncUI.init();
    ServerHeartbeat.start();
    if (SyncManager.isLocal()) {
      await SyncManager.initialLoad();
    }
    this.initUi();
    AuthManager.init();
  },

  // 로그인 성공 후 호출 (DB 서버 모드: 서버 데이터 로드)
  async afterLogin() {
    if (!(await ProjectManager.afterLogin())) return;
    if (!SyncManager.isLocal()) {
      await SyncManager.initialLoad();
    }
    // 사용자 권한에 맞는 주간보고 작성 단위로 초기화 (일반: 담당 서브시스템 / PM: 통합)
    WeeklyReportManager.scope = null;
    WeeklyReportManager.currentWeekReport = null;
    if (document.getElementById("tab-weekly-report").classList.contains("active")) WeeklyReportManager.init();
    AuthManager.applyTabPermissions();
    if (typeof HomeScreenManager !== "undefined") {
      HomeScreenManager.applyRoleMode();
      HomeScreenManager.render();
    }
    if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.init();
    if (typeof GShell !== "undefined") { GShell.refresh(); GShell.syncSettings(); }
  },

  initUi() {
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined) el.value = v; };
    setVal("cfgProjectStartDate", projectConfig.projectStartDate);
    setVal("cfgProjectEndDate", projectConfig.projectEndDate);
    setVal("globalReportDate", projectConfig.reportDate);
    setVal("cfgWeekStartDay", projectConfig.weekStartDay);
    renderProjectPeriodLabels();
    renderProjectTitles();
    renderIdPrefixSettings();
    renderDomainChips();
    renderCustomSdlcCards();
    renderStandardDeliverablesMetaTable();
    StorageManager.updateUsageInfo();
    MeetingManager.init();
    BackupHistoryManager.init();
    NoticeCommManager.init();
    LayoutManager.init();
    HomeScreenManager.init();
    rebuildAll();
    if (typeof GShell !== "undefined") GShell.init(); // [Standard] 2단 메뉴·머리글 (G v1.0.0 에서 시작)
    if (typeof NeoPage !== "undefined") NeoPage.init(); // [Neo 2.2] 화면 머리줄 통일 · 내려받기/올리기 메뉴
    this.uiReady = true;
  }
};
window.AppBoot = AppBoot;
window.addEventListener("DOMContentLoaded", () => AppBoot.start());

// -------------------------------------------------------------
// [ver1.0.4 신규] SDLC 임의 커스터마이징 및 다중 선택(최대 2개) 관리자
// -------------------------------------------------------------
// -------------------------------------------------------------
// [ver1.0.4] SDLC 마스터 풀(최대 8개) 및 프로젝트 활성 SDLC(최대 4개) 관리자
// -------------------------------------------------------------
let _editingSdlcIndex = -1;
let _editingSdlcPhasesTemp = [];

function getProjectActiveSdlcCodes() {
  if (typeof projectConfig !== "undefined" && Array.isArray(projectConfig.activeSdlcCodes) && projectConfig.activeSdlcCodes.length > 0) {
    return projectConfig.activeSdlcCodes;
  }
  return ["SDLC_WATERFALL", "SDLC_AGILE", "SDLC_COTS", "SDLC_INFRA"];
}

function toggleSdlcActiveState(sdlcCode) {
  if (!projectConfig.activeSdlcCodes) {
    projectConfig.activeSdlcCodes = getProjectActiveSdlcCodes();
  }
  const idx = projectConfig.activeSdlcCodes.indexOf(sdlcCode);
  if (idx !== -1) {
    // Already active, user wants to deactivate
    if (projectConfig.activeSdlcCodes.length <= 1) {
      showToast("⚠️ 프로젝트에는 최소 1개 이상의 SDLC 타입이 활성화되어 있어야 합니다.", "warning");
      return;
    }
    // Check if any subsystem uses this
    const inUse = subsystemsMeta.filter(s => s.type !== "REQ" && s.sdlcCode === sdlcCode).length;
    if (inUse > 0) {
      openConfirmDialog(
        `⚠️ 해당 SDLC 타입을 사용하는 서브시스템이 ${inUse}개 있습니다. 비활성화하시겠습니까? (서브시스템의 SDLC 설정이 다른 활성 SDLC로 재배정됩니다)`,
        () => {
          projectConfig.activeSdlcCodes.splice(idx, 1);
          const fallback = projectConfig.activeSdlcCodes[0];
          subsystemsMeta.forEach(s => {
            if (s.type !== "REQ" && s.sdlcCode === sdlcCode) s.sdlcCode = fallback;
          });
          renderCustomSdlcCards();
          rebuildAll(true);
          persistChanges();
          showToast(`[${sdlcCode}] 타입이 프로젝트 활성 목록에서 제외되었습니다.`);
        }
      );
      return;
    }
    projectConfig.activeSdlcCodes.splice(idx, 1);
    renderCustomSdlcCards();
    rebuildAll(true);
    persistChanges();
    showToast(`[${sdlcCode}] 타입이 프로젝트 활성 목록에서 제외되었습니다.`);
  } else {
    // User wants to activate
    if (projectConfig.activeSdlcCodes.length >= 4) {
      showToast("⚠️ 프로젝트에서는 SDLC 타입을 최대 4개까지만 선택하여 활성화할 수 있습니다. 기존 활성 타입을 비활성화한 후 선택해주세요.", "warning");
      return;
    }
    projectConfig.activeSdlcCodes.push(sdlcCode);
    renderCustomSdlcCards();
    rebuildAll(true);
    persistChanges();
    showToast(`✅ [${sdlcCode}] 타입이 프로젝트 활성 SDLC로 등록되었습니다. (총 ${projectConfig.activeSdlcCodes.length}/4개 활성)`);
  }
}

function renderCustomSdlcCards() {
  const container = document.getElementById("customSdlcCardsContainer");
  if (!container) return;
  container.innerHTML = "";

  const masterList = (typeof projectConfig !== "undefined" && Array.isArray(projectConfig.customSdlcTypes))
    ? projectConfig.customSdlcTypes
    : [WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_WATERFALL];

  const activeCodes = getProjectActiveSdlcCodes();

  // Header Summary info
  const summaryDiv = document.createElement("div");
  summaryDiv.className = "phase-summary-box";
  summaryDiv.style.marginBottom = "12px";
  summaryDiv.style.padding = "8px 12px";
  summaryDiv.style.background = "#f0fdf4";
  summaryDiv.style.border = "1px solid #bbf7d0";
  summaryDiv.style.borderRadius = "6px";
  summaryDiv.style.display = "flex";
  summaryDiv.style.justifyContent = "space-between";
  summaryDiv.style.alignItems = "center";
  summaryDiv.innerHTML = `
    <span style="font-size:var(--fs-sm, 12px); color:#166534; font-weight:bold;">
      📋 SDLC 마스터 등록 풀: <b>${masterList.length}/8개</b> | 프로젝트 선택 활성화: <b>${activeCodes.length}/4개</b>
    </span>
    <span style="font-size:var(--fs-xs, 11px); color:#15803d;">
      (프로젝트 활성으로 선택된 SDLC만 서브시스템 배정 및 단계별 진척 현황 매트릭스에 렌더링됩니다)
    </span>
  `;
  container.appendChild(summaryDiv);

  masterList.forEach((sdlc, idx) => {
    const isActive = activeCodes.includes(sdlc.code);
    const card = document.createElement("div");
    card.className = "step-card";
    card.style.background = isActive ? "rgba(16,185,129,0.03)" : "rgba(100,116,139,0.03)";
    card.style.border = isActive ? "1px solid #6ee7b7" : "1px solid #cbd5e1";
    card.style.position = "relative";

    const assignedCount = subsystemsMeta.filter(s => s.type !== "REQ" && s.sdlcCode === sdlc.code).length;
    const phaseNames = (sdlc.phases || []).map((p, pIdx) => `${pIdx + 1}.${p.name}(${p.weight}%)`).join(" ➔ ");

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge" style="background:${isActive ? "#059669" : "#64748b"}; color:#fff; font-size:var(--fs-2xs, 10px);">
            ${isActive ? "✅ 프로젝트 활성" : "비활성 (보관)"}
          </span>
          ${sdlc.isRecommended ? '<span class="badge" style="background:#0284c7; color:#fff; font-size:calc(9.5px * var(--fs-scale, 1));">⭐ 추천타입</span>' : ''}
          <strong style="font-size:var(--fs-base, 13px); color:var(--text-main);">${escapeHtml(sdlc.name)}</strong>
          <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">(코드: <code>${escapeHtml(sdlc.code)}</code>)</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-success'}" data-click="toggleSdlcActiveState" data-click-args="${UiEvents.args(String(sdlc.code))}">
            ${isActive ? '선택 해제' : '선택 활성화 (프로젝트 사용)'}
          </button>
          <button class="btn btn-secondary btn-sm" data-click="openEditSdlcModal" data-click-args="${UiEvents.args(idx)}">✏️ 단계 편집</button>
          ${masterList.length > 1 ? `<button class="btn btn-danger btn-sm" data-click="deleteCustomSdlcType" data-click-args="${UiEvents.args(idx)}">삭제</button>` : ""}
        </div>
      </div>
      <p style="font-size:var(--fs-xs, 11px); color:var(--text-sub); margin-bottom:6px;">${escapeHtml(sdlc.desc || "")}</p>
      <div style="padding:6px 8px; background:rgba(0,0,0,0.02); border-radius:6px; font-size:var(--fs-xs, 11px); color:${isActive ? "#047857" : "#475569"}; line-height:1.5;">
        <b>공정 파이프라인:</b> ${escapeHtml(phaseNames || "정의된 단계 없음")}<br>
        <span style="color:#64748b;">• 소속 서브시스템 수: <b>${assignedCount}개</b> | 단계 수: <b>${(sdlc.phases || []).length}단계</b></span>
      </div>
    `;
    container.appendChild(card);
  });
}

function resetSdlcPresetsToDefault() {
  openConfirmDialog("🔄 SDLC 설정을 시스템 추천 8종 마스터 풀(PMO 3단계, 스마트제조 4단계, 폭포수, 애자일 등)로 초기화하시겠습니까?", () => {
    projectConfig.customSdlcTypes = [
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_PMO)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_SMART_MFG)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_WATERFALL)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_AGILE)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_COTS)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.SDLC_INFRA)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.COMPACT)),
      JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS.DETAILED))
    ];
    projectConfig.activeSdlcCodes = ["SDLC_PMO", "SDLC_SMART_MFG", "SDLC_WATERFALL", "SDLC_AGILE"];
    
    // Auto map subsystems
    subsystemsMeta.forEach(s => {
      if (s.type !== "REQ") {
        if (s.code === "PMO") s.sdlcCode = "SDLC_PMO";
        else s.sdlcCode = "SDLC_SMART_MFG";
      }
    });
    if (typeof MasterSyncEngine !== "undefined") {
      MasterSyncEngine.syncAll(true, "resetSdlc");
    } else {
      renderCustomSdlcCards();
      rebuildAll(true);
    }
    showToast("SDLC 설정이 추천 8대 표준 풀 및 4대 활성 SDLC로 복원되었습니다.");
  });
}

function openNewSdlcModal() {
  if (!projectConfig.customSdlcTypes) projectConfig.customSdlcTypes = [];
  if (projectConfig.customSdlcTypes.length >= 8) {
    showToast("⚠️ SDLC 마스터 등록 풀에는 최대 8개까지만 등록할 수 있습니다. 기존 타입을 수정하거나 삭제 후 추가해주세요.", "warning");
    return;
  }
  _editingSdlcIndex = -1;
  _editingSdlcPhasesTemp = [
    { key: "p1", name: "요구분석", weight: 25, output: "요구명세서", keywords: ["분석", "요구"] },
    { key: "p2", name: "설계", weight: 25, output: "설계서", keywords: ["설계", "화면", "db"] },
    { key: "p3", name: "구현", weight: 35, output: "프로그램", keywords: ["구현", "개발", "코딩"] },
    { key: "p4", name: "검증이행", weight: 15, output: "검증보고서", keywords: ["검증", "테스트", "이행"] }
  ];
  document.getElementById("customSdlcModalTitle").textContent = `🛠️ 신규 SDLC 타입 등록 (마스터 풀 ${projectConfig.customSdlcTypes.length + 1}/8개)`;
  document.getElementById("editSdlcCode").value = `SDLC_CUSTOM_${Date.now().toString().slice(-4)}`;
  document.getElementById("editSdlcCode").readOnly = false;
  document.getElementById("editSdlcName").value = "신규 커스텀 SDLC";
  document.getElementById("editSdlcDesc").value = "요구분석 ➔ 설계 ➔ 구현 ➔ 검증이행 4단계 공정";
  renderEditSdlcPhasesTable();
  document.getElementById("customSdlcModal").style.display = "flex";
}


function openEditSdlcModal(idx) {
  const list = WBSEngine.getActiveSdlcList();
  const target = list[idx];
  if (!target) return;
  _editingSdlcIndex = idx;
  _editingSdlcPhasesTemp = JSON.parse(JSON.stringify(target.phases || []));

  document.getElementById("customSdlcModalTitle").textContent = `🛠️ [${target.name}] 단계 커스터마이징`;
  document.getElementById("editSdlcCode").value = target.code;
  document.getElementById("editSdlcCode").readOnly = true;
  document.getElementById("editSdlcName").value = target.name;
  document.getElementById("editSdlcDesc").value = target.desc || "";
  renderEditSdlcPhasesTable();
  document.getElementById("customSdlcModal").style.display = "flex";
}

function closeCustomSdlcModal() {
  const modal = document.getElementById("customSdlcModal");
  if (modal) modal.style.display = "none";
}

function renderEditSdlcPhasesTable() {
  const tbody = document.getElementById("editSdlcPhasesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  _editingSdlcPhasesTemp.forEach((p, pIdx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center;"><b>${pIdx + 1}</b></td>
      <td><input type="text" value="${escapeHtml(p.name)}" style="width:100%;font-weight:bold;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "name", "$trim")}"></td>
      <td><input type="number" value="${p.weight}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "weight", "$num")}"></td>
      <td><input type="text" value="${escapeHtml(p.output || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "output", "$trim")}"></td>
      <td><input type="text" value="${escapeHtml((p.keywords || []).join(", "))}" style="width:100%; font-size:var(--fs-xs, 11px);" placeholder="Task명 매칭 키워드" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "keywords", "$split")}"></td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "renderEditSdlcPhasesTable")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function addPhaseToEditSdlc() {
  const nextNum = _editingSdlcPhasesTemp.length + 1;
  _editingSdlcPhasesTemp.push({
    key: `p${nextNum}`,
    name: `신규단계${nextNum}`,
    weight: 20,
    output: "단계보고서",
    keywords: [`단계${nextNum}`]
  });
  renderEditSdlcPhasesTable();
}

function saveCustomSdlcFromModal() {
  const codeVal = document.getElementById("editSdlcCode").value.trim();
  const nameVal = document.getElementById("editSdlcName").value.trim();
  const descVal = document.getElementById("editSdlcDesc").value.trim();

  if (!codeVal || !nameVal) {
    showToast("SDLC 타입 코드와 명칭을 모두 입력해주세요.");
    return;
  }
  if (_editingSdlcPhasesTemp.length === 0) {
    showToast("최소 1개 이상의 단계를 등록해야 합니다.");
    return;
  }

  if (!projectConfig.customSdlcTypes || !Array.isArray(projectConfig.customSdlcTypes)) {
    projectConfig.customSdlcTypes = WBSEngine.getActiveSdlcList();
  }

  const newSdlcObj = {
    code: codeVal,
    name: nameVal,
    desc: descVal,
    phases: _editingSdlcPhasesTemp
  };

  if (_editingSdlcIndex >= 0 && _editingSdlcIndex < projectConfig.customSdlcTypes.length) {
    projectConfig.customSdlcTypes[_editingSdlcIndex] = newSdlcObj;
  } else {
    projectConfig.customSdlcTypes.push(newSdlcObj);
  }

  closeCustomSdlcModal();
  renderCustomSdlcCards();
  rebuildAll();
  showToast(`[${nameVal}] SDLC 설정이 저장되었습니다.`);
}

function deleteCustomSdlcType(idx) {
  if (projectConfig.customSdlcTypes.length <= 1) {
    showToast("프로젝트에는 최소 1개의 SDLC 타입이 있어야 합니다.");
    return;
  }
  const target = projectConfig.customSdlcTypes[idx];
  openConfirmDialog(`[${target.name}] SDLC 타입을 삭제하시겠습니까?\n(해당 타입을 사용 중인 서브시스템은 다른 SDLC 타입으로 자동 전환됩니다)`, () => {
    projectConfig.customSdlcTypes.splice(idx, 1);
    const fallbackCode = projectConfig.customSdlcTypes[0].code;
    subsystemsMeta.forEach(s => {
      if (s.sdlcCode === target.code) s.sdlcCode = fallbackCode;
    });
    renderCustomSdlcCards();
    rebuildAll();
    showToast(`[${target.name}] SDLC 타입이 삭제되었습니다.`);
  });
}

function renderProjectPeriodLabels() {
  const startDay = WBSEngine.getDayOfWeekText(projectConfig.projectStartDate);
  const endDay = WBSEngine.getDayOfWeekText(projectConfig.projectEndDate);
  const sTag = document.getElementById("cfgProjStartDayTag");
  const eTag = document.getElementById("cfgProjEndDayTag");
  if (sTag) sTag.innerText = `(${startDay})`;
  if (eTag) eTag.innerText = `(${endDay})`;
  const periodStr = `${projectConfig.projectStartDate} (${startDay}) ~ ${projectConfig.projectEndDate} (${endDay})`;
  ["dashProjPeriodText", "wbsBannerPeriodText"].forEach(id => {
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

// [v1.0.7] WBS ID 재채번 시 다른 데이터의 WBS 참조를 새 ID 로 갱신
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
  document.querySelectorAll(".lbl-current-date").forEach(el => { el.innerText = `${d} (${dayName})`; });
}

function syncGlobalDate(newDate) {
  projectConfig.reportDate = newDate;
  renderReportDateLabels();
  rebuildAll();
}

// 전체 재계산 + 전 화면 재렌더링 (변경 알림 포함)
function rebuildAll(forceImmediateSave = false) {
  MasterSyncEngine.syncAll(false, "rebuildAll", forceImmediateSave);
  if (typeof HomeScreenManager !== "undefined") HomeScreenManager.render();
}

// 홈 / 대시보드 / 단계별 진척 [🔄 실적 새로고침] → 저장소 최신본 재조회 후 진척률 재계산
function refreshDashboardView() { return ProgressRefreshManager.refresh("dashboard"); }
function refreshMatrixView() { return ProgressRefreshManager.refresh("matrix"); }
function refreshHomeView() { return ProgressRefreshManager.refresh("home"); }

var ProgressRefreshManager = {
  KEYS: ["wbsData", "deliverablesData", "reqMasterData", "vocData", "projectConfig", "subsystemsMeta"],

  async refresh(origin = "home") {
    const btns = document.querySelectorAll(".btn-progress-refresh");
    btns.forEach(b => { b.disabled = true; });
    try {
      const res = await SyncManager.refresh(this.KEYS, { silent: true });
      const now = new Date().toLocaleTimeString();
      document.querySelectorAll(".lbl-progress-refreshed-at").forEach(el => { el.textContent = `최종 갱신: ${now}`; });
      if (res.ok) {
        const where = origin === "matrix" ? "단계별 진척" : (origin === "dashboard" ? "종합 대시보드" : "홈 화면");
        showToast(`🔄 [${where} 실적 새로고침 완료] 저장소 최신 실적 기준으로 계획·실적 진척률을 재계산했습니다. (${now})`);
      }
    } finally {
      btns.forEach(b => { b.disabled = false; });
    }
  }
};
window.ProgressRefreshManager = ProgressRefreshManager;

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

// -------------------------------------------------------------
// [요건 8] 단계별 진척 현황 (SDLC 매트릭스 + REQ 매트릭스 + 요구사항·산출물·VOC 통합 진척표)
// -------------------------------------------------------------
function renderPhaseMatrix() {
  const phaseCardContainer = document.getElementById("phaseMatrixContainer");
  const enhTbody = document.getElementById("enhancementMatrixBody");
  const intTbody = document.getElementById("integratedProgressBody");
  if (!phaseCardContainer || !enhTbody || !intTbody) return;

  const dFilterEl = document.getElementById("matrixDomainFilter");
  const sFilterEl = document.getElementById("matrixSubsystemFilter");
  const selDomain = (dFilterEl && dFilterEl.value) ? dFilterEl.value : "ALL";
  const selSubsys = (sFilterEl && sFilterEl.value) ? sFilterEl.value : "ALL";

  const allSystemsRaw = getAllSubsystemNames();
  const allSystems = allSystemsRaw.filter(sys => {
    if (selDomain !== "ALL" && WBSEngine.getSubsystemDomain(sys) !== selDomain) return false;
    if (selSubsys !== "ALL" && sys !== selSubsys) return false;
    return true;
  });

  const activeRounds = getActiveDeliverableRounds(); // Defined by projectConfig.maxDeliverableRounds (1~4)

  // [요건 1-2] Section 1 (Top): 서브시스템별 요구사항(REQ) · 산출물 · 추가 VOC 통합 진척 현황표
  const intTable = document.getElementById("integratedProgressTable");
  if (intTable) {
    const thead = intTable.querySelector("thead");
    if (thead) {
      const roundThs = activeRounds.map(r => `<th>${r}(완료/전체)</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th rowspan="2" style="width: 105px;">분야</th>
          <th rowspan="2" style="width: 130px;">서브시스템</th>
          <th rowspan="2" style="width: 110px;">관리유형</th>
          <th colspan="3" class="col-phase">WBS 공정 진척</th>
          <th colspan="4" style="background:#f0fdf4; color:#166534;">🎯 요구사항(REQ) 진척</th>
          <th colspan="${activeRounds.length + 2}" style="background:#eff6ff; color:#1e40af;">📑 산출물 제출 진척 (${activeRounds.length}회차 운영)</th>
          <th colspan="5" style="background:#fef3c7; color:#92400e;">💬 추가 VOC / 이슈 진척 (대기·진행 분리)</th>
        </tr>
        <tr>
          <th>계획</th><th>실적</th><th>달성률</th>
          <th>전체</th><th>진행</th><th>완료</th><th>완료율</th>
          ${roundThs}<th>검토/작성중</th><th>완료율</th>
          <th>유효전체</th><th>대기</th><th>진행중</th><th>완료·제외</th><th>달성률</th>
        </tr>
      `;
    }
  }

  intTbody.innerHTML = "";
  let sumReqTot = 0, sumReqPrg = 0, sumReqCmp = 0;
  const sumRoundStats = {};
  activeRounds.forEach(r => { sumRoundStats[r] = { tot: 0, cmp: 0 }; });
  let sumDIng = 0, sumDAllTot = 0, sumDAllCmp = 0;
  let sumVocTot = 0, sumVocWait = 0, sumVocProg = 0, sumVocDone = 0;
  let sumWP = 0, sumWA = 0, sumWCount = 0;

  allSystems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys) || { type: "SDLC" };
    const domain = WBSEngine.getSubsystemDomain(sys);
    const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
    const wP = sysRoot ? sysRoot.pProg : 0;
    const wA = sysRoot ? sysRoot.aProg : 0;
    const wRate = wP > 0 ? Math.round((wA / wP) * 100) : (wA > 0 ? 100 : 0);
    sumWP += wP; sumWA += wA; sumWCount++;

    const sReqs = reqMasterData.filter(r => r.system === sys && r.status !== "삭제");
    const rPrg = sReqs.filter(r => r.status === "진행").length;
    const rCmp = sReqs.filter(r => r.status === "완료").length;
    const rRate = sReqs.length > 0 ? Math.round((rCmp / sReqs.length) * 100) : 0;
    sumReqTot += sReqs.length; sumReqPrg += rPrg; sumReqCmp += rCmp;

    let sysDTot = 0, sysDCmp = 0;
    const roundTds = activeRounds.map(rnd => {
      const list = deliverablesData.filter(d => d.system === sys && d.round === rnd);
      const cmp = list.filter(d => d.status === "보완완료").length;
      sysDTot += list.length;
      sysDCmp += cmp;
      sumRoundStats[rnd].tot += list.length;
      sumRoundStats[rnd].cmp += cmp;
      return `<td>${cmp} / ${list.length}건</td>`;
    }).join("");

    const dAll = deliverablesData.filter(d => d.system === sys && activeRounds.includes(d.round));
    const dIng = dAll.filter(d => d.status === "작성중" || d.status === "검토요청").length;
    const dRate = sysDTot > 0 ? Math.round((sysDCmp / sysDTot) * 100) : 0;
    sumDIng += dIng; sumDAllTot += sysDTot; sumDAllCmp += sysDCmp;

    // VOC: 대기와 진행중 분리
    const sVocs = vocData.filter(v => v.system === sys && v.status !== "삭제");
    const vWait = sVocs.filter(v => v.status === "착수전" || v.status === "대기" || v.status === "보류").length;
    const vProg = sVocs.filter(v => v.status === "진행").length;
    const vDone = sVocs.filter(v => v.status === "완료" || v.status === "제외").length;
    const vRate = sVocs.length > 0 ? Math.round((vDone / sVocs.length) * 100) : 0;
    sumVocTot += sVocs.length; sumVocWait += vWait; sumVocProg += vProg; sumVocDone += vDone;

    const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
    const typeBadge = meta.type === "REQ"
      ? `<span class="status-tag tag-completed">개선타입(REQ)</span>`
      : `<span class="status-tag tag-progress">${escapeHtml(curSpec ? curSpec.name : "SDLC")}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(domain)}</span></td>
      <td><strong>${escapeHtml(sys)}</strong></td>
      <td>${typeBadge}</td>
      <td>${wP}%</td>
      <td><strong>${wA}%</strong></td>
      <td style="font-weight:bold; color:${wRate >= 90 ? "#15803d" : (wRate >= 70 ? "#b45309" : "#b91c1c")}">${wRate}%</td>
      <td>${sReqs.length}건</td>
      <td>${rPrg}건</td>
      <td><strong>${rCmp}건</strong></td>
      <td style="font-weight:bold; color:#166534;">${rRate}%</td>
      ${roundTds}
      <td>${dIng}건</td>
      <td style="font-weight:bold; color:#1e40af;">${dRate}%</td>
      <td>${sVocs.length}건</td>
      <td style="color:#b45309;">${vWait}건</td>
      <td style="color:#2563eb;">${vProg}건</td>
      <td><strong>${vDone}건</strong></td>
      <td style="font-weight:bold; color:#92400e;">${vRate}%</td>
    `;
    intTbody.appendChild(tr);
  });

  const avgWP = sumWCount > 0 ? Math.round(sumWP / sumWCount) : 0;
  const avgWA = sumWCount > 0 ? Math.round(sumWA / sumWCount) : 0;
  const avgWRate = avgWP > 0 ? Math.round((avgWA / avgWP) * 100) : (avgWA > 0 ? 100 : 0);
  const totRRate = sumReqTot > 0 ? Math.round((sumReqCmp / sumReqTot) * 100) : 0;
  const totDRate = sumDAllTot > 0 ? Math.round((sumDAllCmp / sumDAllTot) * 100) : 0;
  const totVRate = sumVocTot > 0 ? Math.round((sumVocDone / sumVocTot) * 100) : 0;
  const sumRoundTds = activeRounds.map(r => `<td><b>${sumRoundStats[r].cmp} / ${sumRoundStats[r].tot}건</b></td>`).join("");

  const sumRow = document.createElement("tr");
  sumRow.className = "matrix-total-row";
  sumRow.innerHTML = `
    <td colspan="3"><strong>[선택 범위 합계 (${allSystems.length}개 서브시스템)]</strong></td>
    <td>${avgWP}%</td>
    <td><strong>${avgWA}%</strong></td>
    <td><b>${avgWRate}%</b></td>
    <td><b>${sumReqTot}건</b></td>
    <td><b>${sumReqPrg}건</b></td>
    <td><b>${sumReqCmp}건</b></td>
    <td style="color:#166534;"><b>${totRRate}%</b></td>
    ${sumRoundTds}
    <td><b>${sumDIng}건</b></td>
    <td style="color:#1e40af;"><b>${totDRate}%</b></td>
    <td><b>${sumVocTot}건</b></td>
    <td style="color:#b45309;"><b>${sumVocWait}건</b></td>
    <td style="color:#2563eb;"><b>${sumVocProg}건</b></td>
    <td><b>${sumVocDone}건</b></td>
    <td style="color:#92400e;"><b>${totVRate}%</b></td>
  `;
  intTbody.appendChild(sumRow);

  // [요건 1-1, 1-3] Section 2 (Middle): 서브시스템에 매핑되어 있는 SDLC 타입만 진척 표출
  const mappedSdlcSpecs = [];
  const seenSdlcCodes = new Set();
  allSystems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys);
    if (meta && meta.type === "REQ") return;
    const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
    if (curSpec && !seenSdlcCodes.has(curSpec.code)) {
      seenSdlcCodes.add(curSpec.code);
      mappedSdlcSpecs.push(curSpec);
    }
  });

  let sdlcTablesHtml = "";
  if (mappedSdlcSpecs.length === 0) {
    sdlcTablesHtml = `
      <div style="text-align:center; color:var(--text-muted); padding:20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px;">
        ℹ️ 현재 조회 조건에 매핑된 SDLC 폭포수형 서브시스템이 없습니다. (개선과제형 REQ 또는 다른 서브시스템을 조회하세요)
      </div>
    `;
  } else {
    mappedSdlcSpecs.forEach((spec, sIdx) => {
      const groupSystems = allSystems.filter(sys => {
        const meta = subsystemsMeta.find(m => m.name === sys);
        if (meta && meta.type === "REQ") return false;
        const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
        return curSpec && curSpec.code === spec.code;
      });

      const topThs = spec.phases.map(p => `<th colspan="3" class="col-phase sdlc-ph ${sIdx === 0 ? "" : "sdlc-ph-alt"}">${escapeHtml(p.name)} (${p.weight}%)</th>`).join("");
      const subThs = spec.phases.map(() => `<th>계획</th><th>실적</th><th>달성률</th>`).join("");

      let groupRowsHtml = "";
      const totalStats = { all: { p: 0, a: 0, w: 0 } };
      spec.phases.forEach(ph => { totalStats[ph.key] = { p: 0, a: 0, w: 0 }; });

      groupSystems.forEach(sys => {
        const domain = WBSEngine.getSubsystemDomain(sys);
        const sysTasks = wbsData.filter(d => d.system === sys && d.isLeaf);
        let sysTotalP = 0, sysTotalA = 0, sysTotalW = 0;

        let phTds = "";
        spec.phases.forEach(ph => {
          const phTasks = sysTasks.filter(t => WBSEngine.matchTaskToPhase(t, ph, wbsData));
          let pAvg = 0, aAvg = 0, wSum = 0;
          if (phTasks.length > 0) {
            wSum = phTasks.reduce((acc, t) => acc + (t.weight || 1), 0);
            pAvg = Math.round(phTasks.reduce((acc, t) => acc + (t.pProg * (t.weight || 1)), 0) / (wSum || 1));
            aAvg = Math.round(phTasks.reduce((acc, t) => acc + (t.aProg * (t.weight || 1)), 0) / (wSum || 1));
            totalStats[ph.key].p += pAvg * wSum;
            totalStats[ph.key].a += aAvg * wSum;
            totalStats[ph.key].w += wSum;
          }
          const rate = pAvg > 0 ? Math.round((aAvg / pAvg) * 100) : (aAvg > 0 ? 100 : 0);
          phTds += `<td>${pAvg}%</td><td><strong>${aAvg}%</strong></td><td style="color:${rate >= 90 ? "#15803d" : (rate >= 70 ? "#b45309" : "#b91c1c")}">${rate}%</td>`;
          sysTotalP += pAvg * wSum;
          sysTotalA += aAvg * wSum;
          sysTotalW += wSum;
        });

        const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
        const rootP = sysRoot ? sysRoot.pProg : (sysTotalW > 0 ? Math.round(sysTotalP / sysTotalW) : 0);
        const rootA = sysRoot ? sysRoot.aProg : (sysTotalW > 0 ? Math.round(sysTotalA / sysTotalW) : 0);
        const rootRate = rootP > 0 ? Math.round((rootA / rootP) * 100) : 100;

        totalStats.all.p += rootP * (sysRoot ? sysRoot.weight : 1);
        totalStats.all.a += rootA * (sysRoot ? sysRoot.weight : 1);
        totalStats.all.w += sysRoot ? sysRoot.weight : 1;

        groupRowsHtml += `
          <tr>
            <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(domain)}</span></td>
            <td><strong>${escapeHtml(sys)}</strong></td>
            ${phTds}
            <td class="col-total">${rootP}%</td>
            <td class="col-total"><strong>${rootA}%</strong></td>
            <td class="col-total" style="color:${rootRate >= 90 ? "#15803d" : (rootRate >= 70 ? "#b45309" : "#b91c1c")}">${rootRate}%</td>
          </tr>
        `;
      });

      // 그룹 소계
      let sumPhTds = "";
      spec.phases.forEach(ph => {
        const totW = totalStats[ph.key].w || 1;
        const totP = Math.round(totalStats[ph.key].p / totW);
        const totA = Math.round(totalStats[ph.key].a / totW);
        const totRate = totP > 0 ? Math.round((totA / totP) * 100) : 100;
        sumPhTds += `<td>${totP}%</td><td><strong>${totA}%</strong></td><td style="color:#b45309;font-weight:bold;">${totRate}%</td>`;
      });
      const allW = totalStats.all.w || 1;
      const allP = Math.round(totalStats.all.p / allW);
      const allA = Math.round(totalStats.all.a / allW);
      const allRate = allP > 0 ? Math.round((allA / allP) * 100) : 100;

      groupRowsHtml += `
        <tr class="matrix-total-row">
          <td colspan="2"><strong>[${escapeHtml(spec.name)} 그룹 소계]</strong></td>
          ${sumPhTds}
          <td class="col-total sdlc-sum">${allP}%</td>
          <td class="col-total sdlc-sum"><strong>${allA}%</strong></td>
          <td class="col-total sdlc-sum" style="color:var(--primary);font-weight:bold;">${allRate}%</td>
        </tr>
      `;

      sdlcTablesHtml += `
        <div style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 10px; background:var(--bg-main); border-radius:6px; border:1px solid ${sIdx === 0 ? "#bae6fd" : "#ddd6fe"};">
            <span style="font-weight:bold; font-size:var(--fs-sm, 12px); color:var(--primary);">
              📂 SDLC 유형: ${escapeHtml(spec.name)} (${escapeHtml(spec.desc || "")}) — 소속 서브시스템 ${groupSystems.length}개
            </span>
          </div>
          <div class="table-container">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th rowspan="2" style="width: 105px;">분야</th>
                  <th rowspan="2" style="width: 130px;">서브시스템</th>
                  ${topThs}
                  <th colspan="3" class="col-total sdlc-ph-total">그룹 합계</th>
                </tr>
                <tr>
                  ${subThs}
                  <th>계획</th><th>실적</th><th>달성률</th>
                </tr>
              </thead>
              <tbody>${groupRowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    });
  }

  phaseCardContainer.innerHTML = sdlcTablesHtml;

  // Section 3 (Bottom): 개선타입(REQ) 서브시스템 요건별 진척 매트릭스
  enhTbody.innerHTML = "";
  const reqSystems = allSystems.filter(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys);
    return meta && meta.type === "REQ";
  });

  if (reqSystems.length === 0) {
    enhTbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:15px;">조회 조건에 해당하는 개선타입(REQ) 서브시스템이 없습니다.</td></tr>`;
  } else {
    reqSystems.forEach(sys => {
      const domain = WBSEngine.getSubsystemDomain(sys);
      const sysReqs = reqMasterData.filter(r => r.system === sys);
      if (sysReqs.length === 0) {
        const distinctReqs = [...new Set(wbsData.filter(d => d.system === sys).map(d => d.reqId).filter(Boolean))];
        distinctReqs.forEach(reqId => {
          sysReqs.push({ id: reqId, system: sys, name: `${reqId} 개선 요건`, status: "진행" });
        });
      }

      sysReqs.forEach(req => {
        const linkedTasks = wbsData.filter(t => t.system === sys && t.reqId === req.id && t.isLeaf);
        const taskCount = linkedTasks.length;
        const pAvg = taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.pProg, 0) / taskCount) : 0;
        const aAvg = taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.aProg, 0) / taskCount) : 0;
        const rate = pAvg > 0 ? Math.round((aAvg / pAvg) * 100) : (aAvg >= 100 ? 100 : 0);

        const row = document.createElement("tr");
        row.innerHTML = `
          <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(domain)}</span></td>
          <td><strong>${escapeHtml(sys)}</strong></td>
          <td><span class="lvl-badge lvl-3">${escapeHtml(req.id)}</span></td>
          <td>${escapeHtml(req.name)}</td>
          <td style="text-align:center;"><b>${taskCount}</b>개</td>
          <td style="text-align:right;">${pAvg}%</td>
          <td style="text-align:right;"><strong>${aAvg}%</strong></td>
          <td style="text-align:right; font-weight:bold; color:${rate >= 90 ? "#15803d" : (rate >= 70 ? "#b45309" : "#b91c1c")}">${rate}%</td>
          <td style="text-align:center;"><span class="status-tag ${aAvg >= 100 ? "tag-completed" : (aAvg >= pAvg ? "tag-progress" : "tag-delayed")}">${aAvg >= 100 ? "완료" : (aAvg > 0 ? "진행" : "착수전")}</span></td>
        `;
        enhTbody.appendChild(row);
      });
    });
  }
}

function renderSubsystemCards(systems) {
  const container = document.getElementById("subsystemCardsContainer");
  if (!container) return;
  container.innerHTML = "";

  const dFilterEl = document.getElementById("dashDomainFilter");
  const selDomain = dFilterEl ? dFilterEl.value : "ALL";

  const targetSystems = selDomain === "ALL"
    ? systems
    : systems.filter(s => (typeof WBSEngine !== "undefined" ? WBSEngine.getSubsystemDomain(s) === selDomain : true));

  targetSystems.forEach(sys => {
    const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
    const meta = subsystemsMeta.find(m => m.name === sys) || { domain: "공통", type: "SDLC", weight: 10, pm: "-" };
    const domain = meta.domain || ((typeof WBSEngine !== "undefined") ? WBSEngine.getSubsystemDomain(sys) : "공통");
    const leafTasks = wbsData.filter(d => d.system === sys && d.isLeaf);
    const pVal = sysRoot ? sysRoot.pProg : 0;
    const aVal = sysRoot ? sysRoot.aProg : 0;
    const rate = pVal > 0 ? Math.round((aVal / pVal) * 100) : (aVal > 0 ? 100 : 0);

    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "0";
    card.innerHTML = `
      <div class="card-title">
        <span>
          <span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px); margin-right:4px;">${escapeHtml(domain)}</span>
          <b>${escapeHtml(sys)}</b>
          <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted); font-weight:normal;">(${meta.type === "REQ" ? "개선타입(REQ)" : "SDLC형"} · 가중치 ${meta.weight}% · PM: ${escapeHtml(meta.pm || "-")})</span>
        </span>
        <span class="status-tag ${rate >= 90 ? "tag-completed" : (rate >= 70 ? "tag-progress" : "tag-delayed")}">달성률 ${rate}%</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:var(--fs-sm, 12px);">
        <span>계획 진척율: <b>${pVal}%</b></span>
        <span>실행 과업: <b>${leafTasks.length}개</b></span>
        <span>실적 진척율: <b style="color:var(--success); font-size:var(--fs-md, 14px);">${aVal}%</b></span>
      </div>
      <div style="background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden;">
        <div style="background:var(--success); width:${Math.min(100, aVal)}%; height:100%;"></div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderDeliverablesTable() {
  const tbody = document.getElementById("deliverablesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dFilter = document.getElementById("delivDomainFilter") ? document.getElementById("delivDomainFilter").value : "ALL";
  const sysFilter = document.getElementById("delivSubsystemFilter") ? document.getElementById("delivSubsystemFilter").value : "ALL";
  const roundFilter = document.getElementById("delivRoundFilter") ? document.getElementById("delivRoundFilter").value : "ALL";
  const nameQuery = (document.getElementById("delivNameSearchInput") ? document.getElementById("delivNameSearchInput").value : "").trim().toLowerCase();

  const activeRounds = getActiveDeliverableRounds();
  const chipScope = [];
  deliverablesData.forEach((row, idx) => {
    if (!activeRounds.includes(row.round)) return;
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    if (roundFilter !== "ALL" && row.round !== roundFilter) return;
    if (nameQuery && !(row.name || "").toLowerCase().includes(nameQuery)) return;
    chipScope.push(row);
    if (typeof StatusChips !== "undefined" && !StatusChips.match("deliv", row)) return;

    const tr = document.createElement("tr");
    const pDay = WBSEngine.getDayOfWeekText(row.pDate);
    const aDay = WBSEngine.getDayOfWeekText(row.aDate);

    tr.innerHTML = `
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "round", "$value", "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          ${getActiveDeliverableRounds().map(r => `<option value="${r}" ${row.round === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </td>
      <td>
        <select style="width:125px;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "system", "$value", "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "phase", "$value", "renderDashboard", "persistChanges")}">
          ${["요구사항정의단계", "분석설계단계", "구현단계", "통합테스트단계", "시험검증단계", "이행단계", "안정화단계", "이행안정화단계", "구축단계"].map(p => `<option value="${p}" ${row.phase === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.name)}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "name", "$value", "renderDashboard", "persistChanges")}"></td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.pDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "pDate", "$value", "renderDeliverablesTable", "persistChanges")}">
          <span class="day-of-week-tag ${pDay === "토" ? "day-sat" : (pDay === "일" ? "day-sun" : "")}">${pDay ? `(${pDay})` : ""}</span>
        </div>
      </td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.aDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "aDate", "$value", "renderDeliverablesTable", "persistChanges")}">
          <span class="day-of-week-tag ${aDay === "토" ? "day-sat" : (aDay === "일" ? "day-sun" : "")}">${aDay ? `(${aDay})` : ""}</span>
        </div>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "status", "$value", "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          <option value="작성전" ${row.status === "작성전" ? "selected" : ""}>작성전</option>
          <option value="작성중" ${row.status === "작성중" ? "selected" : ""}>작성중</option>
          <option value="검토요청" ${row.status === "검토요청" ? "selected" : ""}>검토요청</option>
          <option value="보완완료" ${row.status === "보완완료" ? "selected" : ""}>보완완료</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.manager || "")}" style="width:80px;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "manager", "$value", "persistChanges")}"></td>
      <td><input type="text" value="${escapeHtml(row.remarks || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "remarks", "$value", "persistChanges")}"></td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("deliverablesData", idx, "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  if (typeof StatusChips !== "undefined") StatusChips.render("deliv", chipScope);
}

function addNewDeliverable() {
  const sysFilter = document.getElementById("delivSubsystemFilter") ? document.getElementById("delivSubsystemFilter").value : "ALL";
  const roundFilter = document.getElementById("delivRoundFilter") ? document.getElementById("delivRoundFilter").value : "ALL";
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "PMO");
  const defaultRound = roundFilter !== "ALL" ? roundFilter : "1회차";

  deliverablesData.push({
    id: deliverablesData.length + 1,
    round: defaultRound,
    system: defaultSys,
    phase: defaultRound === "2회차" ? "구현단계" : "분석설계단계",
    name: "신규 산출물",
    pDate: WBSEngine.getNextWorkingDay(projectConfig.reportDate, projectConfig.holidays, projectConfig.projectEndDate),
    aDate: "",
    status: "작성전",
    manager: "담당자",
    remarks: ""
  });
  renderDeliverablesTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}

function openBulkDeliverableModal() {
  updateAllSubsystemFilterDropdowns();
  document.getElementById("bulkDeliverableModal").style.display = "flex";
}
function closeBulkDeliverableModal() {
  document.getElementById("bulkDeliverableModal").style.display = "none";
}

// [요건 7] 설정 탭의 표준산출물관리(standardDeliverablesMeta) 정보를 기반으로 서브시스템별·회차별 자동생성
function generateStandardDeliverables() {
  const targetSysVal = document.getElementById("bulkDelivTargetSystem") ? document.getElementById("bulkDelivTargetSystem").value : "ALL";
  const targetRoundVal = document.getElementById("bulkDelivTargetRound") ? document.getElementById("bulkDelivTargetRound").value : "ALL";

  const systems = targetSysVal === "ALL" ? getAllSubsystemNames() : [targetSysVal];
  let createdCount = 0;

  systems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys);
    const pmName = meta && meta.pm ? meta.pm : `${sys} 담당`;

    const activeRounds = getActiveDeliverableRounds();
    standardDeliverablesMeta.forEach(std => {
      const roundsToCreate = [];
      activeRounds.forEach((rLabel, rIdx) => {
        const flagKey = `round${rIdx + 1}`;
        if (std[flagKey] && (targetRoundVal === "ALL" || targetRoundVal === rLabel)) {
          roundsToCreate.push(rLabel);
        }
      });

      roundsToCreate.forEach(rnd => {
        const exists = deliverablesData.some(d => d.system === sys && d.name === std.name && d.round === rnd);
        if (!exists) {
          const validPDate = WBSEngine.getNextWorkingDay(
            std.defaultDate || projectConfig.reportDate,
            projectConfig.holidays,
            projectConfig.projectEndDate
          );
          deliverablesData.push({
            id: deliverablesData.length + 1,
            round: rnd,
            system: sys,
            phase: std.phase || (rnd === "2회차" ? "구현단계" : "분석설계단계"),
            name: std.name,
            pDate: validPDate,
            aDate: "",
            status: "작성전",
            manager: pmName,
            remarks: std.remarks || `${rnd} 표준 산출물`
          });
          createdCount++;
        }
      });
    });
  });

  closeBulkDeliverableModal();
  renderDeliverablesTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
  showToast(`설정 탭의 표준산출물 기준정보를 바탕으로 총 ${createdCount}건의 산출물이 자동 생성되었습니다.`);
}

// -------------------------------------------------------------
// [요건 6] 요구사항 관리 탭 (서브시스템별 필터 & 리스트 선택)
// -------------------------------------------------------------
function renderReqMasterTable() {
  const tbody = document.getElementById("reqMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dFilter = document.getElementById("reqDomainFilter") ? document.getElementById("reqDomainFilter").value : "ALL";
  const sysFilter = document.getElementById("reqSubsystemFilter") ? document.getElementById("reqSubsystemFilter").value : "ALL";
  let statTotal = 0, statReady = 0, statProg = 0, statComp = 0, statHold = 0, statDel = 0;

  const chipScope = [];
  reqMasterData.forEach((row, idx) => {
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    chipScope.push(row);
    if (typeof StatusChips !== "undefined" && !StatusChips.match("req", row)) return;

    statTotal++;
    if (row.status === "착수전") statReady++;
    else if (row.status === "진행") statProg++;
    else if (row.status === "완료") statComp++;
    else if (row.status === "보류") statHold++;
    else if (row.status === "삭제") statDel++;

    const linkedTasks = wbsData.filter(t => t.reqId === row.id && t.isLeaf);
    const taskCount = linkedTasks.length;
    const avgProg = taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.aProg, 0) / taskCount) : 0;

    let tagClass = "tag-ready";
    if (row.status === "진행") tagClass = "tag-progress";
    else if (row.status === "완료") tagClass = "tag-completed";
    else if (row.status === "보류") tagClass = "tag-hold";
    else if (row.status === "삭제") tagClass = "tag-del";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(row.id)}" style="width:98px; font-weight:bold;" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "id", "$value", "renderPhaseMatrix", "persistChanges")}"></td>
      <td>
        <select style="width:125px;" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "system", "$value", "renderReqMasterTable", "renderPhaseMatrix", "renderDashboard", "persistChanges")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.name)}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "name", "$value", "renderPhaseMatrix", "persistChanges")}"></td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "type", "$value", "persistChanges")}">
          <option value="기능" ${row.type === "기능" ? "selected" : ""}>기능</option>
          <option value="비기능" ${row.type === "비기능" ? "selected" : ""}>비기능</option>
          <option value="화면" ${row.type === "화면" ? "selected" : ""}>화면</option>
          <option value="인터페이스" ${row.type === "인터페이스" ? "selected" : ""}>인터페이스</option>
          <option value="연계" ${row.type === "연계" ? "selected" : ""}>연계</option>
          <option value="보안" ${row.type === "보안" ? "selected" : ""}>보안</option>
          <option value="관리" ${row.type === "관리" ? "selected" : ""}>관리</option>
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "priority", "$value", "persistChanges")}">
          <option value="긴급" ${row.priority === "긴급" ? "selected" : ""}>긴급</option>
          <option value="상" ${row.priority === "상" ? "selected" : ""}>상</option>
          <option value="중" ${row.priority === "중" ? "selected" : ""}>중</option>
          <option value="하" ${row.priority === "하" ? "selected" : ""}>하</option>
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "accept", "$value", "persistChanges")}">
          <option value="수용" ${row.accept === "수용" ? "selected" : ""}>수용</option>
          <option value="불가" ${row.accept === "불가" ? "selected" : ""}>불가</option>
          <option value="검토중" ${row.accept === "검토중" ? "selected" : ""}>검토중</option>
        </select>
      </td>
      <td style="text-align:center;"><b>${taskCount}</b>개</td>
      <td style="text-align:right;"><b>${avgProg}%</b></td>
      <td>
        <select class="status-tag ${tagClass}" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "status", "$value", "renderReqMasterTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          <option value="착수전" ${row.status === "착수전" ? "selected" : ""}>착수전</option>
          <option value="진행" ${row.status === "진행" ? "selected" : ""}>진행</option>
          <option value="완료" ${row.status === "완료" ? "selected" : ""}>완료</option>
          <option value="보류" ${row.status === "보류" ? "selected" : ""}>보류</option>
          <option value="삭제" ${row.status === "삭제" ? "selected" : ""}>삭제</option>
        </select>
      </td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("reqMasterData", idx, "renderReqMasterTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  if (typeof StatusChips !== "undefined") StatusChips.render("req", chipScope);
  document.getElementById("tab-req-stat-total").innerText = statTotal;
  document.getElementById("tab-req-stat-ready").innerText = statReady;
  document.getElementById("tab-req-stat-progress").innerText = statProg;
  document.getElementById("tab-req-stat-completed").innerText = statComp;
  document.getElementById("tab-req-stat-hold").innerText = statHold;
  document.getElementById("tab-req-stat-deleted").innerText = statDel;
}

function addNewReq() {
  const sysFilter = document.getElementById("reqSubsystemFilter") ? document.getElementById("reqSubsystemFilter").value : "ALL";
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "서브시스템A");

  const newReqId = buildNextEntityId("REQ", defaultSys);
  reqMasterData.push({
    id: newReqId,
    system: defaultSys,
    name: "신규 요구사항 명세",
    type: "기능",
    priority: "중",
    accept: "수용",
    status: "착수전"
  });
  renderReqMasterTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}

// -------------------------------------------------------------
// [요건 6] 추가 VOC / 이슈관리 탭 (서브시스템별 필터 & 리스트 선택)
// -------------------------------------------------------------
function renderVocTable() {
  const tbody = document.getElementById("vocTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dFilter = document.getElementById("vocDomainFilter") ? document.getElementById("vocDomainFilter").value : "ALL";
  const sysFilter = document.getElementById("vocSubsystemFilter") ? document.getElementById("vocSubsystemFilter").value : "ALL";
  let statTotal = 0, statReady = 0, statProg = 0, statComp = 0, statExcl = 0, statHold = 0, statDel = 0;

  const chipScope = [];
  vocData.forEach((row, idx) => {
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    chipScope.push(row);
    if (typeof StatusChips !== "undefined" && !StatusChips.match("voc", row)) return;

    statTotal++;
    if (row.status === "착수전") statReady++;
    else if (row.status === "진행") statProg++;
    else if (row.status === "완료") statComp++;
    else if (row.status === "제외") statExcl++;
    else if (row.status === "보류") statHold++;
    else if (row.status === "삭제") statDel++;

    const reqDay = WBSEngine.getDayOfWeekText(row.reqDate);
    const targetDay = WBSEngine.getDayOfWeekText(row.targetDate);

    let tagClass = "tag-ready";
    if (row.status === "진행") tagClass = "tag-progress";
    else if (row.status === "완료") tagClass = "tag-completed";
    else if (row.status === "제외") tagClass = "tag-excluded";
    else if (row.status === "보류") tagClass = "tag-hold";
    else if (row.status === "삭제") tagClass = "tag-del";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(row.id)}</strong></td>
      <td>
        <select style="width:125px;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "system", "$value", "renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "priority", "$value", "renderDashboard", "persistChanges")}">
          <option value="긴급" ${row.priority === "긴급" ? "selected" : ""}>긴급</option>
          <option value="상" ${row.priority === "상" ? "selected" : ""}>상</option>
          <option value="중" ${row.priority === "중" ? "selected" : ""}>중</option>
          <option value="하" ${row.priority === "하" ? "selected" : ""}>하</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.title)}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "title", "$value", "renderDashboard", "persistChanges")}"></td>
      <td><input type="text" value="${escapeHtml(row.requester || "")}" style="width:80px;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "requester", "$value", "persistChanges")}"></td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.reqDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "reqDate", "$value", "renderVocTable", "persistChanges")}">
          <span class="day-of-week-tag ${reqDay === "토" ? "day-sat" : (reqDay === "일" ? "day-sun" : "")}">${reqDay ? `(${reqDay})` : ""}</span>
        </div>
      </td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.targetDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "targetDate", "$value", "renderVocTable", "persistChanges")}">
          <span class="day-of-week-tag ${targetDay === "토" ? "day-sat" : (targetDay === "일" ? "day-sun" : "")}">${targetDay ? `(${targetDay})` : ""}</span>
        </div>
      </td>
      <td>
        <select class="status-tag ${tagClass}" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "status", "$value", "renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          <option value="착수전" ${row.status === "착수전" ? "selected" : ""}>착수전</option>
          <option value="진행" ${row.status === "진행" ? "selected" : ""}>진행</option>
          <option value="완료" ${row.status === "완료" ? "selected" : ""}>완료</option>
          <option value="제외" ${row.status === "제외" ? "selected" : ""}>제외</option>
          <option value="보류" ${row.status === "보류" ? "selected" : ""}>보류</option>
          <option value="삭제" ${row.status === "삭제" ? "selected" : ""}>삭제</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.action || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "action", "$value", "persistChanges")}"></td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("vocData", idx, "renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  const validTotal = statTotal - statDel;
  const achieveRate = validTotal > 0 ? (((statComp + statExcl) / validTotal) * 100).toFixed(1) : "0.0";

  if (typeof StatusChips !== "undefined") StatusChips.render("voc", chipScope);
  document.getElementById("tab-voc-stat-total").innerText = statTotal;
  document.getElementById("tab-voc-stat-ready").innerText = statReady;
  document.getElementById("tab-voc-stat-progress").innerText = statProg;
  document.getElementById("tab-voc-stat-completed").innerText = statComp;
  document.getElementById("tab-voc-stat-excluded").innerText = statExcl;
  document.getElementById("tab-voc-stat-hold").innerText = statHold;
  document.getElementById("tab-voc-stat-deleted").innerText = statDel;
  document.getElementById("tab-voc-stat-rate").innerText = `${achieveRate}%`;
}

function addNewVoc() {
  const sysFilter = document.getElementById("vocSubsystemFilter") ? document.getElementById("vocSubsystemFilter").value : "ALL";
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "서브시스템A");

  const newVocId = buildNextEntityId("VOC", defaultSys);
  vocData.push({
    id: newVocId,
    system: defaultSys,
    title: "신규 VOC 요청사항",
    priority: "중",
    requester: "요청부서",
    reqDate: WBSEngine.getNextWorkingDay(projectConfig.reportDate, projectConfig.holidays, projectConfig.projectEndDate),
    targetDate: "",
    status: "착수전",
    action: ""
  });
  renderVocTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}

// -------------------------------------------------------------
// [요건 8] 종합대시보드 렌더링 (서브시스템 카드 + 산출물 통계표 + VOC 통계표)
// -------------------------------------------------------------
function renderDashboard() {
  const repDate = projectConfig.reportDate;
  // [v3.4.0] 불릿 차트 (대시보드 서브시스템 필터 반영)
  if (typeof BulletChart !== "undefined") {
    try { const sf = document.getElementById("dashSubsystemFilter"); BulletChart.render("dashBulletChart", BulletChart.liveRows(sf ? sf.value : "ALL")); } catch (e) { console.warn(e); }
  }

  // [ver1.0.4 신규] 대시보드 4대 영역 통합 필터링 (분야 / 서브시스템)
  const dFilterEl = document.getElementById("dashDomainFilter");
  const sFilterEl = document.getElementById("dashSubsystemFilter") || document.getElementById("scurveSystemFilter");
  const selDomain = dFilterEl ? dFilterEl.value : "ALL";
  const selSubsys = sFilterEl ? sFilterEl.value : "ALL";

  const allSystemsRaw = getAllSubsystemNames();
  const activeSystems = allSystemsRaw.filter(sys => {
    if (selDomain !== "ALL" && WBSEngine.getSubsystemDomain(sys) !== selDomain) return false;
    if (selSubsys !== "ALL" && sys !== selSubsys) return false;
    return true;
  });
  // [Neo 2.1] 확인할 일 (대시보드 조회 범위 기준)
  if (typeof NeoTodo !== "undefined") { try { NeoTodo.render(activeSystems); } catch (e) { console.error(e); } }

  // KPI 계산 (선택 서브시스템에 맞춰 동적 집계)
  const scopeTasks = (selDomain === "ALL" && selSubsys === "ALL")
    ? wbsData
    : wbsData.filter(d => activeSystems.includes(d.system));

  const rootItems = scopeTasks.filter(d => d.level === 1);
  const totalWeight = rootItems.reduce((acc, d) => acc + (parseFloat(d.weight) || 1), 0) || 1;
  const totalPlan = Math.round(rootItems.reduce((acc, d) => acc + (d.pProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
  const totalActual = Math.round(rootItems.reduce((acc, d) => acc + (d.aProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
  const achieveRate = totalPlan > 0 ? ((totalActual / totalPlan) * 100).toFixed(1) : (totalActual > 0 ? "100.0" : "0.0");

  const delayedTasks = scopeTasks.filter(d => WBSEngine.getTaskStatus(d, repDate).code === "delayed");

  document.getElementById("kpi-plan").innerText = `${totalPlan}%`;
  document.getElementById("kpi-actual").innerText = `${totalActual}%`;
  document.getElementById("kpi-rate").innerText = `${achieveRate}%`;
  document.getElementById("kpi-delayed").innerText = `${delayedTasks.length} 건`;

  let cntTotal = scopeTasks.length, cntComp = 0, cntProg = 0, cntDel = 0, cntReady = 0;
  scopeTasks.forEach(t => {
    const st = WBSEngine.getTaskStatus(t, repDate).code;
    if (st === "completed") cntComp++;
    else if (st === "delayed") cntDel++;
    else if (st === "progress") cntProg++;
    else cntReady++;
  });
  document.getElementById("stat-count-total").innerText = cntTotal;
  document.getElementById("stat-count-completed").innerText = cntComp;
  document.getElementById("stat-count-progress").innerText = cntProg;
  document.getElementById("stat-count-delayed").innerText = cntDel;
  document.getElementById("stat-count-ready").innerText = cntReady;

  // 요구사항 통계 (선택 범위 연동)
  const scopeReqs = (selDomain === "ALL" && selSubsys === "ALL")
    ? reqMasterData
    : reqMasterData.filter(r => activeSystems.includes(r.system));

  let reqTot = scopeReqs.length, reqRdy = 0, reqPrg = 0, reqCmp = 0, reqHld = 0, reqDel = 0;
  scopeReqs.forEach(r => {
    if (r.status === "착수전") reqRdy++;
    else if (r.status === "진행") reqPrg++;
    else if (r.status === "완료") reqCmp++;
    else if (r.status === "보류") reqHld++;
    else if (r.status === "삭제") reqDel++;
  });
  const reqValid = reqTot - reqDel;
  const reqRate = reqValid > 0 ? ((reqCmp / reqValid) * 100).toFixed(1) : "0.0";
  document.getElementById("req-stat-total").innerText = reqTot;
  document.getElementById("req-stat-ready").innerText = reqRdy;
  document.getElementById("req-stat-progress").innerText = reqPrg;
  document.getElementById("req-stat-completed").innerText = reqCmp;
  document.getElementById("req-stat-hold").innerText = reqHld;
  document.getElementById("req-stat-deleted").innerText = reqDel;
  if (document.getElementById("req-stat-rate")) document.getElementById("req-stat-rate").innerText = `${reqRate}%`;

  // VOC 통계 (선택 범위 연동)
  const scopeVocsAll = (selDomain === "ALL" && selSubsys === "ALL")
    ? vocData
    : vocData.filter(v => activeSystems.includes(v.system));

  let vocTot = scopeVocsAll.length, vocRdy = 0, vocPrg = 0, vocCmp = 0, vocExc = 0, vocHld = 0, vocDel = 0;
  scopeVocsAll.forEach(v => {
    if (v.status === "착수전") vocRdy++;
    else if (v.status === "진행") vocPrg++;
    else if (v.status === "완료") vocCmp++;
    else if (v.status === "제외") vocExc++;
    else if (v.status === "보류") vocHld++;
    else if (v.status === "삭제") vocDel++;
  });
  const vocValid = vocTot - vocDel;
  const vocRate = vocValid > 0 ? (((vocCmp + vocExc) / vocValid) * 100).toFixed(1) : "0.0";

  document.getElementById("voc-stat-total").innerText = vocTot;
  document.getElementById("voc-stat-ready").innerText = vocRdy;
  document.getElementById("voc-stat-progress").innerText = vocPrg;
  document.getElementById("voc-stat-completed").innerText = vocCmp;
  document.getElementById("voc-stat-excluded").innerText = vocExc;
  document.getElementById("voc-stat-hold").innerText = vocHld;
  document.getElementById("voc-stat-deleted").innerText = vocDel;
  document.getElementById("voc-stat-achieve").innerText = `${vocRate}%`;

  // [1] 서브시스템별 공정 진척 현황 카드 (선택 필터 연동 적용)
  renderSubsystemCards(activeSystems);

  // [2] S-Curve 주별 진척율 (선) 및 달성률 (막대) (선택 필터 연동 적용)
  const scBadge = document.getElementById("scurveFilterBadge");
  if (scBadge) {
    scBadge.textContent = (selDomain === "ALL" && selSubsys === "ALL")
      ? "전체 서브시스템 (통합)"
      : `${selDomain !== "ALL" ? `[${selDomain}] ` : ""}${selSubsys !== "ALL" ? selSubsys : "전체"}`;
  }
  DashboardChart.renderSCurve("scurveCanvas", wbsData, repDate, projectConfig.weekStartDay, selSubsys, selDomain);

  // [3] 서브시스템 · 회차별 산출물 제출 현황 통계 (선택 필터 연동 적용)
  const activeRounds = getActiveDeliverableRounds();
  const dashDelivTable = document.getElementById("dashDeliverablesTable");
  if (dashDelivTable) {
    const thead = dashDelivTable.querySelector("thead");
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>서브시스템</th>
          ${activeRounds.map(r => `<th>${r}(완료/전체)</th>`).join("")}
          <th>보완완료</th>
          <th>검토/작성중</th>
          <th>작성전</th>
          <th>제출완료율</th>
        </tr>
      `;
    }
  }
  const dashDelivTbody = document.querySelector("#dashDeliverablesTable tbody");
  dashDelivTbody.innerHTML = "";
  const validDelivs = deliverablesData.filter(d => activeRounds.includes(d.round) && activeSystems.includes(d.system));
  const doneDelivs = validDelivs.filter(d => d.status === "보완완료").length;
  const totDelivRate = validDelivs.length > 0 ? Math.round((doneDelivs / validDelivs.length) * 100) : 0;
  document.getElementById("dash-deliv-total").innerText = validDelivs.length;
  document.getElementById("dash-deliv-done").innerText = doneDelivs;
  if (document.getElementById("dash-deliv-rate")) document.getElementById("dash-deliv-rate").innerText = `${totDelivRate}%`;

  const roundSums = {};
  activeRounds.forEach(r => { roundSums[r] = { done: 0, tot: 0 }; });
  let sDone = 0, sIng = 0, sRdy = 0;

  if (activeSystems.length === 0) {
    dashDelivTbody.innerHTML = `<tr><td colspan="${activeRounds.length + 5}" style="text-align:center; padding:20px; color:#64748b;">선택된 조회 조건(분야: ${selDomain}, 서브시스템: ${selSubsys})에 해당하는 산출물이 없습니다.</td></tr>`;
  } else {
    activeSystems.forEach(sys => {
      const dAll = validDelivs.filter(d => d.system === sys);
      const rCells = activeRounds.map((r, rIdx) => {
        const list = dAll.filter(d => d.round === r);
        const dCnt = list.filter(d => d.status === "보완완료").length;
        roundSums[r].done += dCnt;
        roundSums[r].tot += list.length;
        const cls = rIdx % 2 === 0 ? "badge-round-1" : "badge-round-2";
        return `<td><span class="badge-round ${cls}">${dCnt} / ${list.length}건</span></td>`;
      }).join("");

      const done = dAll.filter(d => d.status === "보완완료").length;
      const ing = dAll.filter(d => d.status === "작성중" || d.status === "검토요청").length;
      const rdy = dAll.filter(d => d.status === "작성전").length;
      const rate = dAll.length > 0 ? Math.round((done / dAll.length) * 100) : 0;

      sDone += done; sIng += ing; sRdy += rdy;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(sys)}</strong></td>
        ${rCells}
        <td>${done}</td>
        <td>${ing}</td>
        <td>${rdy}</td>
        <td style="font-weight:bold; color:${rate >= 80 ? "#15803d" : "#b45309"}">${rate}%</td>
      `;
      dashDelivTbody.appendChild(tr);
    });

    const totRateVal = validDelivs.length > 0 ? Math.round((sDone / validDelivs.length) * 100) : 0;
    const totRCells = activeRounds.map(r => `<td><b>${roundSums[r].done} / ${roundSums[r].tot}건</b></td>`).join("");
    const totalRow = document.createElement("tr");
    totalRow.className = "matrix-total-row";
    totalRow.innerHTML = `
      <td><strong>[선택 합계]</strong></td>
      ${totRCells}
      <td><b>${sDone}</b></td>
      <td><b>${sIng}</b></td>
      <td><b>${sRdy}</b></td>
      <td style="font-weight:bold; color:#1e40af">${totRateVal}%</td>
    `;
    dashDelivTbody.appendChild(totalRow);
  }

  // [4] 서브시스템별 VOC / 이슈 처리 현황 통계 (선택 필터 연동 적용)
  const dashVocTbody = document.querySelector("#dashVocTable tbody");
  dashVocTbody.innerHTML = "";
  const scopeVocs = vocData.filter(v => activeSystems.includes(v.system) && v.status !== "삭제");
  const openVocs = scopeVocs.filter(v => v.status !== "완료" && v.status !== "제외").length;
  const doneVocs = scopeVocs.filter(v => v.status === "완료" || v.status === "제외").length;
  const scopeVocRate = scopeVocs.length > 0 ? Math.round((doneVocs / scopeVocs.length) * 100) : 0;
  document.getElementById("dash-voc-open").innerText = openVocs;
  document.getElementById("dash-voc-done").innerText = doneVocs;

  let vTotSum = 0, vCmpSum = 0, vExcSum = 0, vPrgSum = 0, vRdySum = 0;
  if (activeSystems.length === 0) {
    dashVocTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">선택된 조회 조건(분야: ${selDomain}, 서브시스템: ${selSubsys})에 해당하는 VOC가 없습니다.</td></tr>`;
  } else {
    activeSystems.forEach(sys => {
      const vAll = scopeVocs.filter(v => v.system === sys);
      const vCmp = vAll.filter(v => v.status === "완료").length;
      const vExc = vAll.filter(v => v.status === "제외").length;
      const vPrg = vAll.filter(v => v.status === "진행").length;
      const vRdy = vAll.filter(v => v.status === "착수전" || v.status === "보류").length;
      const vRate = vAll.length > 0 ? Math.round(((vCmp + vExc) / vAll.length) * 100) : 0;

      vTotSum += vAll.length; vCmpSum += vCmp; vExcSum += vExc; vPrgSum += vPrg; vRdySum += vRdy;

      dashVocTbody.innerHTML += `
        <tr>
          <td><strong>${escapeHtml(sys)}</strong></td>
          <td><b>${vAll.length}건</b></td>
          <td><b style="color:var(--success);">${vCmp}건</b></td>
          <td>${vExc}건</td>
          <td>${vPrg}건</td>
          <td>${vRdy}건</td>
          <td><b style="color:${vRate >= 80 ? "#15803d" : "#b45309"};">${vRate}%</b></td>
        </tr>
      `;
    });
    dashVocTbody.innerHTML += `
      <tr class="matrix-total-row">
        <td><strong>[선택 합계]</strong></td>
        <td><b>${vTotSum}건</b></td>
        <td><b style="color:var(--success);">${vCmpSum}건</b></td>
        <td><b>${vExcSum}건</b></td>
        <td><b>${vPrgSum}건</b></td>
        <td><b>${vRdySum}건</b></td>
        <td><b style="color:var(--success);">${scopeVocRate}%</b></td>
      </tr>
    `;
  }
}

function renderGantt() {
  if (typeof GanttRenderer !== "undefined") {
    GanttRenderer.render(wbsData, projectConfig.holidays);
  }
}

function renderHolidays() {
  const tbody = document.querySelector("#holidayTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filter = document.getElementById("holidayTypeFilter") ? document.getElementById("holidayTypeFilter").value : "ALL";

  projectConfig.holidays.forEach((h, i) => {
    if (filter === "CUSTOM" && h.type !== "CUSTOM") return;
    if (filter === "NATIONAL" && h.type !== "NATIONAL") return;

    const dayName = WBSEngine.getDayOfWeekText(h.date);
    const typeBadge = h.type === "CUSTOM"
      ? `<span class="status-tag tag-progress" style="font-size:calc(9px * var(--fs-scale, 1));">사용자휴일</span>`
      : `<span class="status-tag tag-completed" style="font-size:calc(9px * var(--fs-scale, 1));">법정공휴일</span>`;

    tbody.innerHTML += `
      <tr>
        <td>${typeBadge}</td>
        <td><input type="text" value="${escapeHtml(h.name)}" data-change="UiH.set" data-change-args="${UiEvents.args("projectConfig.holidays", i, "name", "$value", "persistChanges")}"></td>
        <td>
          <div class="date-input-wrap">
            <input type="date" value="${h.date}" data-change="UiH.set" data-change-args="${UiEvents.args("projectConfig.holidays", i, "date", "$value", "renderHolidays", "rebuildAll")}">
            <span class="day-of-week-tag ${dayName === "토" ? "day-sat" : (dayName === "일" ? "day-sun" : "")}">(${dayName})</span>
          </div>
        </td>
        <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("projectConfig.holidays", i, "renderHolidays", "rebuildAll")}">×</button></td>
      </tr>
    `;
  });
}

function addCustomHolidayRow() {
  projectConfig.holidays.push({ type: "CUSTOM", name: "사용자 특별휴일", date: projectConfig.reportDate });
  renderHolidays();
  rebuildAll();
}

function saveConfig() {
  projectConfig.weekStartDay = parseInt(document.getElementById("cfgWeekStartDay").value, 10);
  rebuildAll();
}

// =============================================================================
// [Neo 2.2] 서브시스템별 WBS 템플릿 추가
//  - 기준정보에 등록된 서브시스템만 선택 (이전: 이름을 직접 입력하면 서브시스템이 자동 등록됨)
//  - 템플릿은 서브시스템 유형에 맞게 자동 선택 (SDLC → 지정한 SDLC 단계 / REQ → 개선과제 단계), 다른 템플릿도 선택 가능
//  - 단계별 계획 기간은 프로젝트 기간을 가중치 비율로 나눠 자동 지정 (이전: 2026년 고정 날짜)
//  - 이미 WBS 가 있으면 추가(Append: 기존 L1 아래에 덧붙임) 또는 교체(Replace: 기존 과업 삭제 후 새로 생성) 선택
// =============================================================================
var WbsTemplate = {
  metas() { return (subsystemsMeta || []).filter(m => m && (m.name || m.code)); },
  sysKey(m) { return String(m.name || m.code).trim(); },
  existing(sys) { return wbsData.filter(t => String(t.system || "").trim() === sys); },
  _val(id) { const el = document.getElementById(id); return el ? el.value : ""; },
  mode() { const r = document.querySelector('input[name="tplMode"]:checked'); return r ? r.value : "append"; },

  open(preset) {
    const sel = document.getElementById("tplSystemSelect");
    const list = this.metas();
    const cur = preset || this._val("wbsSubsystemFilter");
    sel.innerHTML = list.map(m => {
      const k = this.sysKey(m);
      const n = this.existing(k).length;
      return `<option value="${escapeAttr(k)}" ${k === cur ? "selected" : ""}>${escapeHtml(k)}${m.domain ? ` · ${escapeHtml(m.domain)}` : ""} (${m.type === "REQ" ? "개선 REQ" : "SDLC"})${n ? ` — 기존 과업 ${n}개` : " — 과업 없음"}</option>`;
    }).join("");
    document.getElementById("tplNoSystem").hidden = list.length > 0;
    sel.disabled = !list.length;
    const radio = document.querySelector('input[name="tplMode"][value="append"]');
    if (radio) radio.checked = true;
    this.render();
    const m = document.getElementById("templateModal");
    m.style.display = "flex";
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(m);
    if (typeof I18N !== "undefined") I18N.translateTree(m);
  },
  close() { document.getElementById("templateModal").style.display = "none"; },
  goMaster() { this.close(); if (typeof GShell !== "undefined") GShell.go("tab-master"); else switchTab("tab-master"); },

  // 서브시스템을 바꾸면 템플릿 선택지와 기존 과업 안내를 다시 표시
  render() {
    const sys = this._val("tplSystemSelect");
    const meta = this.metas().find(m => this.sysKey(m) === sys);
    const tsel = document.getElementById("tplTypeSelect");
    const opts = WBSEngine.getActiveSdlcList().map(sp => [`SDLC:${sp.code}`, `SDLC · ${sp.name}`]);
    if (meta && meta.type !== "REQ" && meta.sdlcCode && !opts.some(o => o[0] === `SDLC:${meta.sdlcCode}`)) {
      const sp = WBSEngine.getSdlcSpecByCode(meta.sdlcCode);
      opts.unshift([`SDLC:${sp.code}`, `SDLC · ${sp.name}`]);
    }
    opts.push(["REQ", "개선(REQ) 단계 · 기준정보의 개선과제 공정 단계"]);
    const def = !meta ? "" : meta.type === "REQ" ? "REQ" : `SDLC:${meta.sdlcCode || (opts[0] && opts[0][0].slice(5))}`;
    tsel.innerHTML = opts.map(([v, l]) => `<option value="${escapeAttr(v)}" ${v === def ? "selected" : ""}>${escapeHtml(l)}${v === def ? " (서브시스템 설정)" : ""}</option>`).join("");
    tsel.disabled = !meta;
    const n = sys ? this.existing(sys).length : 0;
    document.getElementById("tplExisting").hidden = !n;
    document.getElementById("tplExistingCount").textContent = n;
    this.renderPreview();
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("templateModal"));
  },

  phases(type) {
    if (type === "REQ") {
      const ph = typeof ReqPhaseManager !== "undefined" ? ReqPhaseManager.getPhases() : [];
      return { label: "개선(REQ)", phases: ph };
    }
    const sp = WBSEngine.getSdlcSpecByCode(String(type || "").replace(/^SDLC:/, ""));
    return { label: sp.name, phases: sp.phases || [] };
  },

  // 프로젝트 기간을 단계 가중치 비율로 나눈 계획 기간
  schedule(phases) {
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const s = new Date((projectConfig.projectStartDate || projectConfig.reportDate || iso(new Date())) + "T00:00:00");
    let e = new Date((projectConfig.projectEndDate || "") + "T00:00:00");
    if (isNaN(e) || e < s) { e = new Date(s); e.setMonth(e.getMonth() + 6); }
    const days = Math.max(phases.length, Math.round((e - s) / 86400000) + 1);
    const total = phases.reduce((a, p) => a + (parseFloat(p.weight) || 1), 0) || 1;
    let cur = new Date(s), acc = 0;
    return phases.map((p, i) => {
      acc += parseFloat(p.weight) || 1;
      const end = i === phases.length - 1 ? new Date(e) : new Date(s.getTime() + (Math.round(days * acc / total) - 1) * 86400000);
      // 시작일은 다음 평일, 종료일은 이전 평일로 (주말·공휴일 제외, 단계 기간을 벗어나지 않게)
      const hol = projectConfig.holidays || [];
      const st = WBSEngine.getNextWorkingDay(iso(cur), hol, iso(end < cur ? cur : end));
      let en = new Date(end < cur ? cur : end);
      for (let g = 0; g < 10 && WBSEngine.isHoliday(iso(en), hol) && iso(en) > st; g++) en.setDate(en.getDate() - 1);
      const r = [st, iso(en)];
      cur = new Date((end < cur ? cur : end).getTime() + 86400000);
      return r;
    });
  },

  build(sys, type, withRoot) {
    const meta = this.metas().find(m => this.sysKey(m) === sys) || {};
    const t = this.phases(type);
    const slots = this.schedule(t.phases);
    const rows = [];
    if (withRoot) {
      rows.push({ id: "", level: 1, system: sys, name: `${sys} ${type === "REQ" ? "개선 과업" : "구축"} (${t.label})`, weight: parseFloat(meta.weight) || 10,
        reqId: "", pStart: slots.length ? slots[0][0] : "", pEnd: slots.length ? slots[slots.length - 1][1] : "", aStart: "", aEnd: "", pProg: 0, aProg: 0, output: "" });
    }
    t.phases.forEach((p, i) => rows.push({ id: "", level: 2, system: sys, name: p.name || p.taskName || `단계 ${i + 1}`, weight: parseFloat(p.weight) || 1,
      reqId: "", pStart: slots[i][0], pEnd: slots[i][1], aStart: "", aEnd: "", pProg: 0, aProg: 0, output: p.output || "" }));
    return rows;
  },

  // 추가(Append) 시 기존 L1 이 있으면 단계 과업만 덧붙임
  _plan() {
    const sys = this._val("tplSystemSelect"), type = this._val("tplTypeSelect");
    if (!sys || !type) return null;
    const ex = this.existing(sys);
    const mode = ex.length ? this.mode() : "new";
    const hasRoot = ex.some(t => (parseInt(t.level, 10) || 1) === 1);
    const rows = this.build(sys, type, mode !== "append" || !hasRoot);
    return { sys, type, ex, mode, rows };
  },

  renderPreview() {
    const body = document.getElementById("tplPreviewBody");
    const note = document.getElementById("tplPreviewNote");
    const btn = document.getElementById("tplApplyBtn");
    const plan = this._plan();
    if (!plan) { body.innerHTML = ""; note.textContent = ""; btn.disabled = true; return; }
    body.innerHTML = plan.rows.map(r => `<tr><td><span class="lvl-badge lvl-${r.level}">L${r.level}</span></td><td style="padding-left:${(r.level - 1) * 14 + 6}px;">${escapeHtml(r.name)}</td><td style="text-align:right;">${r.weight}</td><td>${r.pStart} ~ ${r.pEnd}</td><td>${escapeHtml(r.output)}</td></tr>`).join("");
    note.textContent = plan.mode === "replace" ? `— 기존 ${plan.ex.length}개 삭제 후 ${plan.rows.length}개 생성`
      : plan.mode === "append" ? `— 기존 ${plan.ex.length}개 뒤에 ${plan.rows.length}개 추가` : `— ${plan.rows.length}개 생성`;
    btn.textContent = plan.mode === "replace" ? "♻️ 교체 실행" : "➕ 템플릿 추가";
    btn.setAttribute("data-btn", plan.mode === "replace" ? "danger" : "add");
    btn.disabled = false;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(btn.parentNode);
    if (typeof I18N !== "undefined") { I18N.translateTree(body); I18N.translateTree(note.parentNode); I18N.translateTree(btn.parentNode); }
  },

  apply() {
    const plan = this._plan();
    if (!plan) return showToast("대상 서브시스템을 선택하세요.");
    if (typeof Permission !== "undefined" && !Permission.canWriteSubsystem(plan.sys)) {
      return showToast(`⚠️ [${plan.sys}] 서브시스템의 WBS 를 바꿀 권한이 없습니다.`);
    }
    const run = () => {
      if (plan.mode === "replace") {
        for (let i = wbsData.length - 1; i >= 0; i--) if (String(wbsData[i].system || "").trim() === plan.sys) wbsData.splice(i, 1);
      }
      // 같은 서브시스템 과업 묶음의 끝에 넣음 (정렬·재채번은 rebuildAll 에서 처리)
      let at = -1;
      wbsData.forEach((t, i) => { if (String(t.system || "").trim() === plan.sys) at = i; });
      if (at === -1) wbsData.push(...plan.rows); else wbsData.splice(at + 1, 0, ...plan.rows);
      this.close();
      rebuildAll(true);
      const fl = document.getElementById("wbsSubsystemFilter");
      if (fl && [...fl.options].some(o => o.value === plan.sys)) { fl.value = plan.sys; renderWbsTable(); }
      showToast(plan.mode === "replace" ? `♻️ [${plan.sys}] WBS 를 템플릿으로 교체했습니다. (기존 ${plan.ex.length}개 삭제, ${plan.rows.length}개 생성)`
        : `✅ [${plan.sys}] WBS 에 템플릿 과업 ${plan.rows.length}개를 추가했습니다.`);
    };
    if (plan.mode === "replace") {
      openConfirmDialog(`⚠️ [${plan.sys}] 서브시스템의 기존 WBS 과업 ${plan.ex.length}개(입력한 실적·진척률 포함)를 모두 지우고 템플릿 과업 ${plan.rows.length}개로 교체합니다.\n계속하시겠습니까?`, run);
    } else run();
  }
};
// 이전 이름 호환
function openTemplateModal() { WbsTemplate.open(); }
function closeTemplateModal() { WbsTemplate.close(); }

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



// =============================================================================
// [ver1.0.4 신규] 프로젝트 공지사항 등록 및 팀원 간 소통 기능 매니저
// =============================================================================
// =============================================================================
// [ver1.0.4 신규] 프로젝트 공지사항 등록 및 다중 뷰 모드(피드/칸반/스탠드업) 소통 매니저
// =============================================================================
// =============================================================================
// [ver1.0.4] 공지사항, 업무소통 피드, 실시간 채팅 서브 탭 매니저
// =============================================================================
var NoticeCommManager = {

  hasNoticePermission(item) {
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : (AuthManager?.currentUser || { role: "MEMBER", empNo: "unknown", name: "unknown" });
    const norm = (curUser.role || "MEMBER").toUpperCase();
    if (norm === "SYS_ADMIN" || norm === "PM") return true;
    if (item.authorEmpNo && curUser.empNo && String(item.authorEmpNo).trim() === String(curUser.empNo).trim()) return true;
    if (item.author && curUser.name && String(item.author).trim() === String(curUser.name).trim()) return true;
    return false;
  },

  hasCommPermission(item) {
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : (AuthManager?.currentUser || { role: "MEMBER", empNo: "unknown", name: "unknown" });
    const norm = (curUser.role || "MEMBER").toUpperCase();
    if (norm === "SYS_ADMIN" || norm === "PM") return true;
    if (item.authorEmpNo && curUser.empNo && String(item.authorEmpNo).trim() === String(curUser.empNo).trim()) return true;
    if (item.author && curUser.name && String(item.author).trim() === String(curUser.name).trim()) return true;
    return false;
  },

  hasChannelPermission() {
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : (AuthManager?.currentUser || { role: "MEMBER" });
    const norm = (curUser.role || "MEMBER").toUpperCase();
    return norm === "SYS_ADMIN" || norm === "PM";
  },

  openEditNoticeModal(id) {
    const target = noticesData.find(n => n.id === id);
    if (!target) return;
    if (!this.hasNoticePermission(target)) {
      showToast("⚠️ 본인이 작성한 공지이거나 관리자/PM 권한만 수정할 수 있습니다.", "warning");
      return;
    }
    const modal = document.getElementById("editNoticeModal");
    if (!modal) return;
    document.getElementById("editNoticeId").value = target.id;
    document.getElementById("editNoticeTitleInput").value = target.title;
    document.getElementById("editNoticePrioritySelect").value = target.priority || "일반";
    document.getElementById("editNoticePinnedCheckbox").checked = !!target.isPinned;
    document.getElementById("editNoticeContentInput").value = target.content;
    modal.style.display = "flex";
  },

  closeEditNoticeModal() {
    const modal = document.getElementById("editNoticeModal");
    if (modal) modal.style.display = "none";
  },

  submitEditNotice() {
    const id = document.getElementById("editNoticeId")?.value;
    const target = noticesData.find(n => n.id === id);
    if (!target) return;
    if (!this.hasNoticePermission(target)) {
      showToast("⚠️ 수정 권한이 없습니다.", "warning");
      return;
    }

    const title = (document.getElementById("editNoticeTitleInput")?.value || "").trim();
    const content = (document.getElementById("editNoticeContentInput")?.value || "").trim();
    const priority = document.getElementById("editNoticePrioritySelect")?.value || "일반";
    const isPinned = document.getElementById("editNoticePinnedCheckbox")?.checked || false;

    if (!title || !content) {
      showToast("공지 제목과 상세 내용을 모두 입력해주세요.", "warning");
      return;
    }

    target.title = title;
    target.content = content;
    target.priority = priority;
    target.isPinned = isPinned;

    this.closeEditNoticeModal();
    this.renderNotices();
    this.updateHeaderBadge();
    persistChanges();
    showToast("✅ 공지사항이 성공적으로 수정되었습니다.");
  },

  openEditCommPost(id) {
    const post = communicationsData.find(c => c.id === id);
    if (!post) return;
    if (!this.hasCommPermission(post)) {
      showToast("⚠️ 본인이 작성한 게시글이거나 관리자/PM 권한만 수정할 수 있습니다.", "warning");
      return;
    }
    const newContent = prompt("수정할 소통 피드 내용을 입력하세요:", post.content);
    if (newContent !== null && newContent.trim()) {
      post.content = newContent.trim();
      persistChanges();
      this.renderCommunications();
      showToast("✅ 소통 게시글이 수정되었습니다.");
    }
  },

  deleteCommPost(id) {
    const post = communicationsData.find(c => c.id === id);
    if (!post) return;
    if (!this.hasCommPermission(post)) {
      showToast("⚠️ 본인이 작성한 게시글이거나 관리자/PM 권한만 삭제할 수 있습니다.", "warning");
      return;
    }
    openConfirmDialog("해당 소통 게시글을 삭제하시겠습니까?", () => {
      communicationsData = communicationsData.filter(c => c.id !== id);
      persistChanges();
      this.renderCommunications();
      showToast("소통 게시글이 삭제되었습니다.");
    });
  },

  deleteReply(postId, repId) {
    const post = communicationsData.find(c => c.id === postId);
    if (!post || !Array.isArray(post.replies)) return;
    const rep = post.replies.find(r => r.id === repId);
    if (!rep) return;
    if (!this.hasCommPermission(rep)) {
      showToast("⚠️ 본인 작성 답글이거나 관리자/PM 권한만 삭제할 수 있습니다.", "warning");
      return;
    }
    openConfirmDialog("해당 답글을 삭제하시겠습니까?", () => {
      post.replies = post.replies.filter(r => r.id !== repId);
      persistChanges();
      this.renderCommunications();
      showToast("답글이 삭제되었습니다.");
    });
  },

  editChannel(oldName) {
    if (!this.hasChannelPermission()) {
      showToast("⚠️ 채널 정보 수정은 시스템 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다.", "warning");
      return;
    }
    if (oldName === "전체") {
      showToast("기본 '전체' 채널명은 변경할 수 없습니다.", "warning");
      return;
    }
    const newName = prompt(`[# ${oldName}] 채널의 새로운 명칭을 입력하세요:`, oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
      const cleanName = newName.trim().replace(/^#\s*/, "");
      if (projectConfig.channels.includes(cleanName)) {
        showToast("이미 존재하는 채널명입니다.", "warning");
        return;
      }
      const idx = projectConfig.channels.indexOf(oldName);
      if (idx !== -1) {
        projectConfig.channels[idx] = cleanName;
        // update communications channel if needed
        communicationsData.forEach(c => { if (c.channel === oldName) c.channel = cleanName; });
        if (this.activeChannel === oldName) this.activeChannel = cleanName;
        if (typeof RealtimeChatManager !== "undefined" && RealtimeChatManager.activeChannel === oldName) {
          RealtimeChatManager.activeChannel = cleanName;
        }
        this.renderChannelOptions();
        this.renderCommunications();
        persistChanges();
        showToast(`✅ 채널명이 [# ${cleanName}]으로 변경되었습니다.`);
      }
    }
  },

  currentSubTab: "NOTICES", // NOTICES | FEED | CHAT
  viewMode: "FEED",         // FEED | KANBAN | STANDUP
  activeChannel: "전체",
  noticePriorityFilter: "ALL",
  noticeSearchKeyword: "",

  // [ver1.0.4] 공지사항 바로가기 전용 핸들러
  goToNotice() {
    if (typeof switchTab === "function") switchTab("tab-notices");
    this.switchSubTab("NOTICES", true);
    setTimeout(() => {
      const el = document.getElementById("noticesContainer") || document.getElementById("subpane_NOTICES");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  },

  init() {
    const savedSubTab = localStorage.getItem("WBS_COMM_SUB_TAB");
    if (savedSubTab) this.currentSubTab = savedSubTab;
    const savedMode = localStorage.getItem("WBS_COMM_VIEW_MODE");
    if (savedMode) this.viewMode = savedMode;
    this.switchSubTab(this.currentSubTab, false);
    this.updateHeaderBadge();
  },

  switchSubTab(tabName, persist = true) {
    this.currentSubTab = tabName;
    if (persist) localStorage.setItem("WBS_COMM_SUB_TAB", tabName);

    // subtab buttons
    ["NOTICES", "FEED", "CHAT"].forEach(t => {
      const btn = document.getElementById(`subtabBtn_${t}`);
      const pane = document.getElementById(`subpane_${t}`);
      if (btn) {
        if (t === tabName) {
          btn.classList.add("active");
          btn.style.background = "var(--primary)";
          btn.style.color = "#ffffff";
          btn.style.borderColor = "var(--primary)";
        } else {
          btn.classList.remove("active");
          btn.style.background = "#f8fafc";
          btn.style.color = "var(--text-sub)";
          btn.style.borderColor = "var(--border-color)";
        }
      }
      if (pane) {
        pane.style.display = t === tabName ? "block" : "none";
      }
    });

    if (tabName === "NOTICES") {
      this.renderNotices();
      if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.stopPolling();
    } else if (tabName === "FEED") {
      this.renderChannelOptions();
      this.renderCommunications();
      if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.stopPolling();
    } else if (tabName === "CHAT") {
      if (typeof RealtimeChatManager !== "undefined") {
        RealtimeChatManager.init();
      }
    }
  },

  setViewMode(mode) {
    this.viewMode = mode;
    localStorage.setItem("WBS_COMM_VIEW_MODE", mode);
    this.renderCommunications();
    this.updateModeButtons();
    showToast(`소통 UI 뷰가 [${mode === "FEED" ? "💬 채널 피드형" : (mode === "KANBAN" ? "📋 칸반 보드형" : "⏱️ 데일리 스탠드업형")}]으로 전환되었습니다.`);
  },

          cleanObsoleteChannelData() {
    const validChannels = this.getChannels();
    if (Array.isArray(communicationsData)) {
      communicationsData = communicationsData.filter(c => c && (c.channel === "전체" || validChannels.includes(c.channel)));
    }
    if (Array.isArray(noticesData)) {
      noticesData = noticesData.filter(n => !n.channel || n.channel === "전체" || validChannels.includes(n.channel));
    }
  },

  setChannel(ch) {
    this.activeChannel = ch || "전체";
    this.cleanObsoleteChannelData();
    this.renderChannelOptions();
    this.renderCommunications();
    const postSel = document.getElementById("commPostChannelSelect");
    if (postSel && ch !== "전체") {
      postSel.value = ch;
    }
  },

  filterNoticesByPriority(p) {
    this.noticePriorityFilter = p;
    this.renderNotices();
  },

  filterNoticesByKeyword(kw) {
    this.noticeSearchKeyword = (kw || "").trim().toLowerCase();
    this.renderNotices();
  },

  updateHeaderBadge() {
    const badge = document.getElementById("headerNoticeCountBadge");
    if (badge && Array.isArray(noticesData)) {
      const urgentCount = noticesData.filter(n => n.priority === "긴급").length;
      badge.textContent = urgentCount > 0 ? `🚨 긴급공지 ${urgentCount}` : `📢 공지 ${noticesData.length}`;
      badge.style.display = noticesData.length > 0 ? "inline-flex" : "none";
    }
  },

  updateModeButtons() {
    ["FEED", "KANBAN", "STANDUP"].forEach(m => {
      const btn = document.getElementById(`btnViewMode_${m}`);
      if (btn) {
        if (this.viewMode === m) {
          btn.className = "btn btn-primary btn-sm";
          btn.style.fontWeight = "800";
        } else {
          btn.className = "btn btn-secondary btn-sm";
          btn.style.fontWeight = "normal";
        }
      }
    });
  },

  
  getChannels() {
    // [v3.0.0] 채널 기본값은 이 프로젝트의 서브시스템 (다른 프로젝트·샘플 채널을 쓰지 않음)
    const defaultSubs = (subsystemsMeta || []).map(m => m.code || m.name).filter(Boolean);
    if (projectConfig && Array.isArray(projectConfig.channels) && projectConfig.channels.length > 0) {
      // Remove any obsolete channels like 포털UI, 코어서비스, etc.
      const obsolete = ["포털UI", "코어서비스", "데이터연계", "인프라보안"];
      projectConfig.channels = projectConfig.channels.filter(c => !obsolete.includes(c));
      if (!projectConfig.channels.includes("전체")) projectConfig.channels.unshift("전체");
      return projectConfig.channels;
    }
    const cleanList = ["전체", ...defaultSubs];
    if (projectConfig) projectConfig.channels = cleanList;
    return cleanList;
  },

  renderChannelOptions() {
    const channels = this.getChannels();
    
    // 1. Post Channel Select in Feed
    const postSel = document.getElementById("commPostChannelSelect");
    if (postSel) {
      const curVal = postSel.value;
      postSel.innerHTML = channels.map(c => `<option value="${escapeHtml(c)}">${c === "전체" ? "🌐 " : "💬 "}# ${escapeHtml(c)} 채널</option>`).join("");
      if (channels.includes(curVal)) postSel.value = curVal;
    }

    // 2. Feed Channel Filter Buttons (Requirement 2)
    const filterContainer = document.getElementById("feedChannelFilterContainer");
    if (filterContainer) {
      filterContainer.innerHTML = channels.map(c => {
        const count = c === "전체"
          ? (Array.isArray(communicationsData) ? communicationsData.length : 0)
          : (Array.isArray(communicationsData) ? communicationsData.filter(p => p.channel === c).length : 0);
        const isActive = (this.activeChannel === c);
        const btnClass = isActive ? "btn btn-sm btn-primary feed-channel-chip active" : "btn btn-sm btn-secondary feed-channel-chip";
        const activeStyle = isActive
          ? "background:var(--primary) !important; color:#fff !important; border-color:var(--primary) !important; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.2); transform:scale(1.02);"
          : "background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;";
        const label = isActive ? `✓ #${escapeHtml(c)} (${count})` : `#${escapeHtml(c)} (${count})`;
        return `
          <button class="${btnClass}" style="${activeStyle} font-size:calc(11.5px * var(--fs-scale, 1)); padding:4px 9px; border-radius:4px; transition:all 0.15s ease;" data-channel="${escapeHtml(c)}" data-click="NoticeCommManager.setChannel" data-click-args="${UiEvents.args(String(c))}">
            ${label}
          </button>
        `;
      }).join("");
    }

    // Active Channel Indicator Update
    const ind = document.getElementById("feedActiveChannelIndicator");
    if (ind) {
      const count = this.activeChannel === "전체"
        ? (Array.isArray(communicationsData) ? communicationsData.length : 0)
        : (Array.isArray(communicationsData) ? communicationsData.filter(p => p.channel === this.activeChannel).length : 0);
      ind.textContent = `📢 선택된 채널: #${this.activeChannel} (총 ${count}건)`;
      ind.style.background = "var(--primary)";
    }

    // 3. Chat Room Channels
    const chatContainer = document.getElementById("chatChannelListContainer");
    if (chatContainer && typeof RealtimeChatManager !== "undefined") {
      chatContainer.innerHTML = channels.map(c => `
        <button class="chat-channel-btn ${RealtimeChatManager.activeChannel === c ? 'active' : ''}" data-channel="${escapeHtml(c)}" data-click="RealtimeChatManager.setChannel" data-click-args="${UiEvents.args(String(c))}">
          <span># ${escapeHtml(c)}</span>
        </button>
      `).join("");
    }

    // 4. System Settings Channels Table
    this.renderSettingsChannelTable();
  },

  renderSettingsChannelTable() {
    const tbody = document.getElementById("settingsChannelTableBody");
    if (!tbody) return;
    const channels = this.getChannels();
    tbody.innerHTML = "";
    channels.forEach((c, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:center;"><b>${idx + 1}</b></td>
        <td><strong style="color:#0f172a;"># ${escapeHtml(c)}</strong></td>
        <td style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#64748b;">${c === "전체" ? "전사 공통 기본 채널 (고정)" : "프로젝트 커스텀 소통 채널"}</td>
        <td style="text-align:center;">
          ${c === "전체" ? '<span style="font-size:var(--fs-xs, 11px); color:#94a3b8; font-weight:bold;">고정</span>' : `<button class="btn btn-danger btn-sm" data-click="NoticeCommManager.deleteChannel" data-click-args="${UiEvents.args(String(c))}">삭제</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  addChannel() {
    const input = document.getElementById("newChannelNameInput");
    const name = (input?.value || "").trim().replace(/^#\s*/, "");
    if (!name) {
      showToast("추가할 채널명을 입력해주세요.", "warning");
      return;
    }
    if (!projectConfig.channels) projectConfig.channels = this.getChannels();
    if (projectConfig.channels.includes(name)) {
      showToast("이미 등록된 채널명입니다.", "warning");
      return;
    }
    projectConfig.channels.push(name);
    if (input) input.value = "";
    this.renderChannelOptions();
    persistChanges();
    showToast(`✅ [# ${name}] 채널이 등록되었습니다.`);
  },

  deleteChannel(name) {
    if (name === "전체") {
      showToast("기본 '전체' 채널은 삭제할 수 없습니다.", "warning");
      return;
    }
    openConfirmDialog(`[# ${name}] 채널을 삭제하시겠습니까?`, () => {
      if (!projectConfig.channels) projectConfig.channels = this.getChannels();
      projectConfig.channels = projectConfig.channels.filter(c => c !== name);
      if (this.activeChannel === name) this.activeChannel = "전체";
      if (typeof RealtimeChatManager !== "undefined" && RealtimeChatManager.activeChannel === name) {
        RealtimeChatManager.activeChannel = "전체";
      }
      this.renderChannelOptions();
      this.renderCommunications();
      persistChanges();
      showToast(`[# ${name}] 채널이 삭제되었습니다.`);
    });
  },

  clearAllCommunications() {
    openConfirmDialog("⚠️ 작성된 모든 업무 소통 피드 및 답글을 완전히 초기화하시겠습니까? (삭제된 데이터는 복구할 수 없습니다)", () => {
      communicationsData = [];
      this.renderCommunications();
      persistChanges();
      showToast("🧹 모든 업무 소통 피드가 초기화(삭제)되었습니다.");
    });
  },

  clearAllNotices() {
    openConfirmDialog("⚠️ 등록된 모든 프로젝트 공지사항을 완전히 초기화하시겠습니까?", () => {
      noticesData = [];
      this.renderNotices();
      this.updateHeaderBadge();
      persistChanges();
      showToast("🧹 모든 공지사항이 초기화(삭제)되었습니다.");
    });
  },

  renderAll() {
    this.renderChannelOptions();
    this.updateHeaderBadge();
    this.renderNotices();
    this.renderCommunications();
    this.updateModeButtons();
    if (this.currentSubTab === "CHAT" && typeof RealtimeChatManager !== "undefined") {
      RealtimeChatManager.checkServerConnection();
    }
  },

  renderNotices() {
    const listEl = document.getElementById("noticesListContainer");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!Array.isArray(noticesData) || noticesData.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8; font-size:var(--fs-base, 13px);">등록된 공지사항이 없습니다. 상단 [➕ 신규 공지사항 등록] 버튼을 눌러 등록하세요.</div>';
      return;
    }

    let filtered = noticesData;
    if (this.noticePriorityFilter && this.noticePriorityFilter !== "ALL") {
      filtered = filtered.filter(n => n.priority === this.noticePriorityFilter);
    }
    if (this.noticeSearchKeyword) {
      filtered = filtered.filter(n => (n.title || "").toLowerCase().includes(this.noticeSearchKeyword) || (n.content || "").toLowerCase().includes(this.noticeSearchKeyword));
    }

    const sorted = [...filtered].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.date || "").localeCompare(a.date || "");
    });

    if (sorted.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:var(--fs-base, 13px);">검색 조건에 일치하는 공지사항이 없습니다.</div>';
      return;
    }

    sorted.forEach(item => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.style.border = item.isPinned ? "2px solid #f59e0b" : "1px solid #cbd5e1";
      card.style.background = item.isPinned ? "#fffbeb" : "#ffffff";
      card.style.marginBottom = "12px";
      card.style.padding = "14px 18px";
      card.style.borderRadius = "8px";
      card.style.boxShadow = item.isPinned ? "0 2px 8px rgba(245, 158, 11, 0.15)" : "0 1px 3px rgba(0,0,0,0.04)";

      const priorityBadge = item.priority === "긴급"
        ? '<span class="badge" style="background:#dc2626; color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">🚨 긴급</span>'
        : (item.priority === "중요" ? '<span class="badge" style="background:#d97706; color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">⚠️ 중요</span>' : '<span class="badge" style="background:#0284c7; color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">일반</span>');

      const canManage = this.hasNoticePermission(item);
      const actionButtons = canManage ? `
        <button class="btn btn-sm ${item.isPinned ? 'btn-secondary' : 'btn-primary'}" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.togglePinNotice" data-click-args="${UiEvents.args(String(item.id))}">
          ${item.isPinned ? '📌 고정해제' : '📌 상단고정'}
        </button>
        <button class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.openEditNoticeModal" data-click-args="${UiEvents.args(String(item.id))}">✏️ 수정</button>
        <button class="btn btn-danger btn-sm" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.deleteNotice" data-click-args="${UiEvents.args(String(item.id))}">🗑️ 삭제</button>
      ` : '<span style="font-size:calc(10.5px * var(--fs-scale, 1)); color:#94a3b8; padding:2px 6px; background:#f1f5f9; border-radius:4px;">🔒 조회전용</span>';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${item.isPinned ? '<span style="font-size:calc(15px * var(--fs-scale, 1));" title="상단 고정 공지">📌</span>' : ''}
            ${priorityBadge}
            <strong style="font-size:var(--fs-md, 14px); color:#0f172a;">${escapeHtml(item.title)}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:#64748b;">작성자: <b>${escapeHtml(item.author)}</b> (${escapeHtml(item.date)})</span>
            ${actionButtons}
          </div>
        </div>
        <div style="font-size:var(--fs-base, 13px); line-height:1.7; color:#334155; white-space:pre-wrap; background:rgba(0,0,0,0.02); padding:10px 14px; border-radius:6px; border:1px solid rgba(0,0,0,0.05);">${escapeHtml(item.content)}</div>
      `;
      listEl.appendChild(card);
    });
  },

  renderCommunications() {
    this.cleanObsoleteChannelData();
    const container = document.getElementById("commMainDisplayArea");
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(communicationsData) || communicationsData.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;">작성된 소통 글이 없습니다. 상단에서 첫 번째 업무 소통 피드를 게시해보세요.</div>';
      return;
    }

    if (this.viewMode === "KANBAN") {
      this.renderKanbanView(container);
    } else if (this.viewMode === "STANDUP") {
      this.renderStandupView(container);
    } else {
      this.renderFeedView(container);
    }
  },

  // 1. 채널 피드 & 스레드 뷰 (Slack / Teams 스타일)
  renderFeedView(container) {
    const filtered = this.activeChannel === "전체"
      ? communicationsData
      : communicationsData.filter(c => c.channel === this.activeChannel);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:45px 20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; margin:10px 0;">
          <div style="font-size:var(--fs-2xl, 24px); margin-bottom:6px;">💬</div>
          <div style="font-size:var(--fs-md, 14px); font-weight:bold; color:var(--primary); margin-bottom:4px;">[# ${escapeHtml(this.activeChannel)}] 채널에 등록된 소통 안건이 없습니다.</div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#64748b; margin-bottom:12px;">상단 작성 영역에서 글을 작성하거나, 전체 채널로 전환하세요.</div>
          <button class="btn btn-primary btn-sm" data-click="NoticeCommManager.setChannel" data-click-args='["전체"]'>🌐 전체 채널 보기</button>
        </div>
      `;
      return;
    }

    const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const feedWrap = document.createElement("div");
    feedWrap.style.display = "flex";
    feedWrap.style.flexDirection = "column";
    feedWrap.style.gap = "14px";

    sorted.forEach(post => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.style.background = "#ffffff";
      card.style.border = "1px solid #cbd5e1";
      card.style.borderRadius = "8px";
      card.style.padding = "14px 18px";
      card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";

      let repliesHtml = "";
      if (Array.isArray(post.replies) && post.replies.length > 0) {
        repliesHtml = '<div style="margin-top:12px; padding-left:14px; border-left:3px solid #38bdf8; display:flex; flex-direction:column; gap:8px;">';
        post.replies.forEach(rep => {
          repliesHtml += `
            <div style="background:#f0f9ff; padding:10px 12px; border-radius:6px; font-size:var(--fs-sm, 12px); border:1px solid #e0f2fe;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-weight:bold; color:#0369a1;">💬 ${escapeHtml(rep.author)} (${escapeHtml(rep.role || "")})</span>
                <span style="color:#94a3b8; font-size:calc(10.5px * var(--fs-scale, 1));">${escapeHtml(rep.date || "")}</span>
              </div>
              <div style="color:#334155; white-space:pre-wrap; line-height:1.5;">${escapeHtml(rep.content)}</div>
            </div>
          `;
        });
        repliesHtml += '</div>';
      }

      const canManagePost = this.hasCommPermission(post);
      const postActionButtons = canManagePost ? `
        <button class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:calc(10.5px * var(--fs-scale, 1));" data-click="NoticeCommManager.openEditCommPost" data-click-args="${UiEvents.args(String(post.id))}">✏️ 수정</button>
        <button class="btn btn-danger btn-sm" style="padding:2px 7px; font-size:calc(10.5px * var(--fs-scale, 1));" data-click="NoticeCommManager.deleteCommPost" data-click-args="${UiEvents.args(String(post.id))}">🗑️ 삭제</button>
      ` : "";

      const displayTitle = post.title || (post.taskId ? `[과업 #${post.taskId}] ${post.content.slice(0, 30)}...` : (post.content.length > 30 ? post.content.slice(0, 30) + "..." : post.content));
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:#0284c7; color:#fff; font-size:var(--fs-2xs, 10px);">#${escapeHtml(post.channel || "전체")}</span>
            ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:var(--fs-2xs, 10px);">과업 #WBS-${escapeHtml(post.taskId)}</span>` : ""}
            <strong style="color:#0f172a; font-size:calc(13.5px * var(--fs-scale, 1));">${escapeHtml(post.author)}</strong>
            <span style="font-size:var(--fs-xs, 11px); color:#64748b;">(${escapeHtml(post.role || "")})</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:#94a3b8;">${escapeHtml(post.date)}</span>
            ${postActionButtons}
          </div>
        </div>
        <div style="font-size:var(--fs-md, 14px); font-weight:bold; color:var(--primary, #1e3a8a); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
          <span>📌</span> <span>${escapeHtml(displayTitle)}</span>
        </div>
        <div style="font-size:var(--fs-base, 13px); line-height:1.6; color:#1e293b; margin-bottom:8px; white-space:pre-wrap;">${escapeHtml(post.content)}</div>
        ${repliesHtml}
        <div style="margin-top:12px; display:flex; gap:8px;">
          <input type="text" id="replyInput_${post.id}" placeholder="스레드 답글 입력 후 Enter 또는 클릭..." style="flex:1; padding:6px 12px; font-size:var(--fs-sm, 12px); border:1px solid #cbd5e1; border-radius:4px;" data-keydown="NoticeCommManager.addReply" data-keydown-args="${UiEvents.args(String(post.id))}" data-keydown-key="Enter">
          <button class="btn btn-secondary btn-sm" data-click="NoticeCommManager.addReply" data-click-args="${UiEvents.args(String(post.id))}">💬 답글</button>
        </div>
      `;
      feedWrap.appendChild(card);
    });

    container.appendChild(feedWrap);
  },

  // 2. 칸반 보드 & 담벼락 뷰 (Notion / Linear 스타일)
  renderKanbanView(container) {
    const kanbanWrap = document.createElement("div");
    kanbanWrap.style.display = "grid";
    kanbanWrap.style.gridTemplateColumns = "repeat(3, 1fr)";
    kanbanWrap.style.gap = "14px";

    const cols = [
      { id: "OPEN", title: "💬 논의/질의 중", bg: "#f8fafc", border: "#cbd5e1", badge: "#0284c7" },
      { id: "PROGRESS", title: "⚙️ 조치/협의 진행", bg: "#eff6ff", border: "#93c5fd", badge: "#2563eb" },
      { id: "RESOLVED", title: "✅ 해결/합의 완료", bg: "#f0fdf4", border: "#86efac", badge: "#16a34a" }
    ];

    cols.forEach(col => {
      const colDiv = document.createElement("div");
      colDiv.style.background = col.bg;
      colDiv.style.border = `1px solid ${col.border}`;
      colDiv.style.borderRadius = "8px";
      colDiv.style.padding = "12px";
      colDiv.style.minHeight = "440px";

      const targetPosts = this.activeChannel === "전체"
        ? communicationsData
        : communicationsData.filter(c => c.channel === this.activeChannel);

      const colPosts = targetPosts.filter((c, i) => {
        const status = c.status || (i % 3 === 0 ? "OPEN" : (i % 3 === 1 ? "PROGRESS" : "RESOLVED"));
        return status === col.id;
      });

      colDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid ${col.border};">
          <strong style="font-size:calc(13.5px * var(--fs-scale, 1)); color:#1e293b;">${col.title}</strong>
          <span class="badge" style="background:${col.badge}; color:#fff; font-size:var(--fs-2xs, 10px);">${colPosts.length}건</span>
        </div>
        <div id="kanbanCol_${col.id}" style="display:flex; flex-direction:column; gap:10px;"></div>
      `;

      const listContainer = colDiv.querySelector(`#kanbanCol_${col.id}`);
      colPosts.forEach(post => {
        const itemCard = document.createElement("div");
        itemCard.style.background = "#ffffff";
        itemCard.style.border = "1px solid #cbd5e1";
        itemCard.style.borderRadius = "6px";
        itemCard.style.padding = "12px";
        itemCard.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
        const cardTitle = post.title || (post.taskId ? `[과업 #${post.taskId}] ${post.content.slice(0, 25)}...` : (post.content.length > 25 ? post.content.slice(0, 25) + "..." : post.content));
        itemCard.innerHTML = `
          <div style="border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                <span class="badge" style="background:#0284c7; color:#fff; font-size:calc(9.5px * var(--fs-scale, 1)); padding:2px 6px;">#${escapeHtml(post.channel || "전체")}</span>
                ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:calc(9px * var(--fs-scale, 1)); padding:2px 6px;">과업 #${escapeHtml(post.taskId)}</span>` : ""}
              </div>
              <span style="font-size:calc(10.5px * var(--fs-scale, 1)); color:#94a3b8;">${escapeHtml((post.date || "").split(" ")[0])}</span>
            </div>
            <div class="kanban-card-title" style="font-size:calc(13.5px * var(--fs-scale, 1)); font-weight:800; color:var(--primary, #1e3a8a); line-height:1.45; word-break:keep-all;">
              📌 ${escapeHtml(cardTitle)}
            </div>
          </div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#475569; margin-bottom:10px; line-height:1.55; max-height:60px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${escapeHtml(post.content)}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--fs-xs, 11px); color:#64748b; border-top:1px dashed #e2e8f0; padding-top:6px;">
            <span style="font-weight:600;">👤 ${escapeHtml(post.author)}</span>
            <select data-change="NoticeCommManager.updatePostStatus" data-change-args="${UiEvents.args(String(post.id), "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; font-weight:bold; background:#ffffff; color:#1e293b;">
              <option value="OPEN" ${col.id==='OPEN'?'selected':''}>논의중</option>
              <option value="PROGRESS" ${col.id==='PROGRESS'?'selected':''}>조치중</option>
              <option value="RESOLVED" ${col.id==='RESOLVED'?'selected':''}>해결완료</option>
            </select>
          </div>
        `;
        listContainer.appendChild(itemCard);
      });

      kanbanWrap.appendChild(colDiv);
    });

    container.appendChild(kanbanWrap);
  },

  // 3. 데일리 스탠드업 & 타임라인 뷰 (Jira / Monday 스타일)
  renderStandupView(container) {
    const standupWrap = document.createElement("div");
    standupWrap.style.display = "flex";
    standupWrap.style.flexDirection = "column";
    standupWrap.style.gap = "14px";

    const summaryBox = document.createElement("div");
    summaryBox.style.background = "linear-gradient(135deg, #1e293b, #0f172a)";
    summaryBox.style.color = "#fff";
    summaryBox.style.borderRadius = "8px";
    summaryBox.style.padding = "14px 18px";
    summaryBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:var(--fs-md, 14px); font-weight:bold; color:#38bdf8;">⏱️ 프로젝트 일일 스탠드업 &amp; 블로커 현황판</span>
        <span style="font-size:var(--fs-xs, 11px); color:#94a3b8;">기준일자: ${escapeHtml(projectConfig.reportDate || "2026-06-30")}</span>
      </div>
      <div style="display:flex; gap:16px; font-size:var(--fs-sm, 12px); color:#cbd5e1;">
        <span>• 등록된 소통 안건: <b>${communicationsData.length}건</b></span>
        <span>• 긴급 공지: <b>${noticesData.filter(n=>n.priority==='긴급').length}건</b></span>
        <span>• WBS 연계 이슈: <b>${communicationsData.filter(c=>c.taskId).length}건</b></span>
      </div>
    `;
    standupWrap.appendChild(summaryBox);

    const targetPosts = this.activeChannel === "전체"
      ? communicationsData
      : communicationsData.filter(c => c.channel === this.activeChannel);

    targetPosts.forEach((post, pIdx) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.gap = "12px";
      item.style.alignItems = "flex-start";
      item.innerHTML = `
        <div style="width:28px; height:28px; border-radius:50%; background:#2563eb; color:#fff; display:flex; align-items:center; justify-content:center; font-size:var(--fs-sm, 12px); font-weight:bold; flex-shrink:0;">
          ${pIdx + 1}
        </div>
        <div style="flex:1; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <div>
              <strong style="color:var(--primary); font-size:var(--fs-base, 13px);">${escapeHtml(post.author)}</strong>
              <span style="font-size:var(--fs-xs, 11px); color:#64748b; margin-left:4px;">(${escapeHtml(post.role || "")})</span>
              ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:calc(9.5px * var(--fs-scale, 1)); margin-left:6px;">#WBS-${escapeHtml(post.taskId)}</span>` : ""}
            </div>
            <span style="font-size:var(--fs-xs, 11px); color:#94a3b8;">${escapeHtml(post.date)}</span>
          </div>
          <div style="font-size:calc(12.5px * var(--fs-scale, 1)); line-height:1.6; color:#334155;">${escapeHtml(post.content)}</div>
        </div>
      `;
      standupWrap.appendChild(item);
    });

    container.appendChild(standupWrap);
  },

  updatePostStatus(id, newStatus) {
    const post = communicationsData.find(c => c.id === id);
    if (post) {
      post.status = newStatus;
      persistChanges();
      this.renderCommunications();
      showToast(`소통 안건 상태가 [${newStatus}]으로 변경되었습니다.`);
    }
  },

  openNewNoticeModal() {
    const modal = document.getElementById("newNoticeModal");
    if (modal) {
      modal.style.display = "flex";
      const titleInput = document.getElementById("noticeTitleInput");
      if (titleInput) {
        titleInput.value = "";
        setTimeout(() => titleInput.focus(), 80);
      }
      const contentInput = document.getElementById("noticeContentInput");
      if (contentInput) contentInput.value = "";
    }
  },

  closeNewNoticeModal() {
    const modal = document.getElementById("newNoticeModal");
    if (modal) modal.style.display = "none";
  },

  submitNewNotice() {
    const title = (document.getElementById("noticeTitleInput")?.value || "").trim();
    const content = (document.getElementById("noticeContentInput")?.value || "").trim();
    const priority = document.getElementById("noticePrioritySelect")?.value || "일반";
    const isPinned = document.getElementById("noticePinnedCheckbox")?.checked || false;

    if (!title || !content) {
      showToast("공지사항 제목과 상세 내용을 모두 입력해주세요.", "warning");
      return;
    }

    const curUser = (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser()) || { name: "관리자", empNo: "admin" };
    const today = (projectConfig && projectConfig.reportDate) || new Date().toISOString().slice(0, 10);

    const newNotice = {
      id: "NOT-" + Date.now().toString().slice(-4),
      title: title,
      content: content,
      author: curUser.name || "관리자",
      authorEmpNo: curUser.empNo || "admin",
      date: today,
      priority: priority,
      isPinned: isPinned,
      viewCount: 1
    };

    if (!Array.isArray(noticesData)) noticesData = [];
    noticesData.unshift(newNotice);

    this.closeNewNoticeModal();
    this.renderNotices();
    this.updateHeaderBadge();
    persistChanges();
    showToast("📢 신규 공지사항이 등록되었습니다.");
  },

  togglePinNotice(id) {
    const target = noticesData.find(n => n.id === id);
    if (target) {
      target.isPinned = !target.isPinned;
      this.renderNotices();
      this.updateHeaderBadge();
      persistChanges();
      showToast(target.isPinned ? "📌 공지사항이 상단에 고정되었습니다." : "공지사항 상단 고정이 해제되었습니다.");
    }
  },

  deleteNotice(id) {
    openConfirmDialog("해당 공지사항을 삭제하시겠습니까?", () => {
      noticesData = noticesData.filter(n => n.id !== id);
      this.renderNotices();
      this.updateHeaderBadge();
      persistChanges();
      showToast("공지사항이 삭제되었습니다.");
    });
  },

  submitNewCommPost() {
    const content = (document.getElementById("commPostContentInput")?.value || "").trim();
    const channel = document.getElementById("commPostChannelSelect")?.value || "전체";
    const taskId = (document.getElementById("commPostTaskIdInput")?.value || "").trim();

    if (!content) {
      showToast("소통 피드 내용을 입력해주세요.", "warning");
      return;
    }

    const titleInput = document.getElementById("commPostTitleInput");
    const titleVal = (titleInput?.value || "").trim();
    const curUser = (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser()) || { name: "팀원", empNo: "user", role: "MEMBER", subsystem: "PORTAL" };
    const nowStr = ((projectConfig && projectConfig.reportDate) || new Date().toISOString().slice(0, 10)) + " " + new Date().toTimeString().slice(0, 5);

    const newPost = {
      id: "COMM-" + Date.now().toString().slice(-4),
      title: titleVal || (content.length > 25 ? content.slice(0, 25) + "..." : content),
      channel: channel,
      taskId: taskId,
      author: curUser.name || "팀원",
      authorEmpNo: curUser.empNo || "user",
      role: curUser.subsystem || curUser.role || "MEMBER",
      content: content,
      date: nowStr,
      status: "OPEN",
      replies: []
    };

    if (!Array.isArray(communicationsData)) communicationsData = [];
    communicationsData.unshift(newPost);

    const input = document.getElementById("commPostContentInput");
    if (input) input.value = "";
    this.renderCommunications();
    persistChanges();
    showToast("💬 소통 피드가 게시되었습니다.");
  },

  addReply(postId) {
    const input = document.getElementById(`replyInput_${postId}`);
    const text = (input?.value || "").trim();
    if (!text) {
      showToast("답글 내용을 입력해주세요.", "warning");
      return;
    }

    const target = communicationsData.find(c => c.id === postId);
    if (!target) return;

    const curUser = (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser()) || { name: "팀원", empNo: "user", role: "MEMBER", subsystem: "CORE" };
    const nowStr = ((projectConfig && projectConfig.reportDate) || new Date().toISOString().slice(0, 10)) + " " + new Date().toTimeString().slice(0, 5);

    if (!Array.isArray(target.replies)) target.replies = [];
    target.replies.push({
      id: "REP-" + Date.now().toString().slice(-4),
      author: curUser.name || "팀원",
      authorEmpNo: curUser.empNo || "user",
      role: curUser.subsystem || curUser.role || "MEMBER",
      content: text,
      date: nowStr
    });

    input.value = "";
    this.renderCommunications();
    persistChanges();
    showToast("답글이 등록되었습니다.");
  }
};


// =============================================================================
// [ver1.0.4] 실시간 팀 채팅 매니저 (서버 연결 시에만 활성화)
// =============================================================================
// =============================================================================
// 실시간 채팅 (DB 서버 모드 전용)
//  - 로컬 저장소 모드: "오프라인" 표시 및 채팅 기능 비활성화 (v1.0.6)
//  - DB 서버 모드: 로그인 토큰으로 서버 채팅 API 사용 (2.5초 주기 동기화)
// =============================================================================
var RealtimeChatManager = {
  isConnected: false,
  activeChannel: "전체",
  pollTimer: null,
  messages: [],

  async init() {
    this.renderChannelButtons();
    await this.checkServerConnection(false);
    if (this.isConnected) await this.startPolling();
  },

  renderChannelButtons() {
    const chatContainer = document.getElementById("chatChannelListContainer");
    if (!chatContainer) return;
    const channels = (typeof NoticeCommManager !== "undefined" && NoticeCommManager.getChannels)
      ? NoticeCommManager.getChannels()
      : ["전체", ...((typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : ["PMO", "W1", "W2", "P1", "A1", "A2", "S1"])];
    
    chatContainer.innerHTML = channels.map(c => `
      <button class="chat-channel-btn ${this.activeChannel === c ? 'active' : ''}" data-channel="${escapeHtml(c)}" data-click="RealtimeChatManager.setChannel" data-click-args="${UiEvents.args(String(c))}">
        <span># ${escapeHtml(c)}</span>
      </button>
    `).join("");
  },

  async checkServerConnection(showFeedback = false) {
    if (SyncManager.isLocal()) {
      this.setConnected(false, "오프라인 (로컬 저장소 모드에서는 채팅을 사용할 수 없습니다)");
      if (showFeedback) showToast("💬 채팅은 DB 서버 모드에서만 사용할 수 있습니다. (시스템 설정 > DB 연동에서 서버 모드 선택)");
      return false;
    }
    const res = await ServerBackend.request("/api/chat/messages?channel=" + encodeURIComponent(this.activeChannel), null, "GET");
    const ok = !!res.ok;
    this.setConnected(ok, ok ? "서버 정상 연결 (실시간 채팅 활성화)" : "오프라인 (DB 서버 연결 실패)");
    if (ok) this.renderMessages(res.messages || [], true);
    if (showFeedback) showToast(ok ? "🟢 채팅 서버와 정상 연결되었습니다." : "⚠️ 채팅 서버에 연결할 수 없습니다. run_server.bat 실행 여부를 확인하세요.");
    return ok;
  },

  setConnected(connected, statusText) {
    this.isConnected = connected;
    const dot = document.getElementById("chatServerStatusDot");
    const indicator = document.getElementById("chatServerStatusText");
    const offlineBanner = document.getElementById("chatServerOfflineBanner");
    const activeArea = document.getElementById("chatActiveArea");
    const input = document.getElementById("chatMessageInput");
    const sendBtn = document.getElementById("btnChatSend");
    if (dot) {
      dot.style.color = connected ? "#10b981" : "#94a3b8";
      dot.textContent = connected ? "● 온라인" : "● 오프라인";
    }
    if (indicator) {
      indicator.textContent = statusText;
      indicator.style.color = connected ? "#059669" : "#64748b";
    }
    if (offlineBanner) offlineBanner.style.display = connected ? "none" : "flex";
    if (activeArea) activeArea.classList.toggle("chat-offline-disabled", !connected);
    if (input) {
      input.disabled = !connected;
      input.placeholder = connected ? "메시지를 입력하세요... (Enter 키로 전송)" : "오프라인 - 채팅 사용 불가";
    }
    if (sendBtn) sendBtn.disabled = !connected;
    if (!connected) this.stopPolling();
  },

  async startPolling() {
    this.stopPolling();
    await this.fetchMessages(true);
    this.pollTimer = setInterval(async () => {
      const pane = document.getElementById("tab-notices");
      const subpane = document.getElementById("subpane_CHAT");
      if (pane && pane.classList.contains("active") && subpane && subpane.style.display !== "none") {
        if (this.isConnected) {
          await this.fetchMessages(false);
        }
      }
    }, 2500);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  setChannel(ch) {
    this.activeChannel = ch;
    this.renderChannelButtons();
    const curTitle = document.getElementById("chatCurrentChannelTitle");
    if (curTitle) curTitle.textContent = `# ${ch} 채널`;
    if (this.isConnected) this.fetchMessages(true);
  },

  async fetchMessages(forceScroll = false) {
    if (!this.isConnected) return;
    const res = await ServerBackend.request("/api/chat/messages?channel=" + encodeURIComponent(this.activeChannel), null, "GET");
    if (res.ok && Array.isArray(res.messages)) this.renderMessages(res.messages, forceScroll);
    else if (res.network) this.setConnected(false, "오프라인 (DB 서버 연결 끊김)");
  },

  renderMessages(msgs, forceScroll = false) {
    this.messages = msgs;
    const stream = document.getElementById("chatMessagesStream");
    if (!stream) return;

    if (!Array.isArray(msgs) || msgs.length === 0) {
      stream.innerHTML = `<div style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:var(--fs-base, 13px);">
        💬 <b>#${escapeHtml(this.activeChannel)}</b> 채널에 등록된 실시간 메시지가 없습니다.<br>
        팀원들에게 첫 메시지를 전송해보세요! (Enter 키로 즉시 전송)
      </div>`;
      return;
    }

    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function" ? AuthManager.getCurrentUser() : (AuthManager?.currentUser || { name: "관리자", empNo: "admin" }));
    let html = "";
    msgs.forEach(m => {
      const isMe = m.senderEmpNo === curUser.empNo || m.senderName === curUser.name;
      html += `
        <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:var(--fs-xs, 11px); color:#64748b;">
            <strong style="color:${isMe ? '#2563eb' : '#1e293b'}; font-size:var(--fs-sm, 12px);">${escapeHtml(m.senderName)}</strong>
            <span>(${escapeHtml(m.userRole || "MEMBER")})</span>
            <span style="font-size:var(--fs-2xs, 10px); color:#94a3b8;">${escapeHtml(m.createdAt || "")}</span>
          </div>
          <div style="max-width:75%; padding:9px 15px; border-radius:${isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px'}; background:${isMe ? '#2563eb' : '#f1f5f9'}; color:${isMe ? '#ffffff' : '#1e293b'}; font-size:var(--fs-base, 13px); line-height:1.55; word-break:break-word; box-shadow:0 1px 2px rgba(0,0,0,0.06);">
            ${escapeHtml(m.message)}
          </div>
        </div>
      `;
    });
    stream.innerHTML = html;
    if (forceScroll || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 160) {
      stream.scrollTop = stream.scrollHeight;
    }
  },

  async sendMessage() {
    if (!this.isConnected) {
      showToast("💬 오프라인 상태에서는 채팅을 사용할 수 없습니다.");
      return;
    }
    const input = document.getElementById("chatMessageInput");
    const msg = (input && input.value || "").trim();
    if (!msg) return;
    const res = await ServerBackend.request("/api/chat/send", { id: Date.now().toString(), channel: this.activeChannel, message: msg });
    if (res.ok) {
      input.value = "";
      await this.fetchMessages(true);
    } else {
      showToast("⚠️ 메시지 전송 실패: " + (res.message || ""));
    }
  },

  async clearAllChat() {
    if (!this.isConnected) {
      showToast("💬 채팅은 DB 서버 모드에서만 사용할 수 있습니다.");
      return;
    }
    openConfirmDialog("⚠️ 서버의 모든 채팅 기록을 삭제하시겠습니까? (업무 데이터는 보존됩니다)", async () => {
      const res = await ServerBackend.request("/api/chat/clear", {});
      if (!res.ok) { showToast("⚠️ 채팅 삭제 실패: " + (res.message || "")); return; }
      this.messages = [];
      this.renderMessages([], true);
      showToast("🧹 채팅 대화기록이 모두 초기화되었습니다.");
    });
  }
};
window.RealtimeChatManager = RealtimeChatManager;


window.addEventListener("resize", () => {
  if (typeof LayoutManager !== "undefined") LayoutManager.adjustSidebar();
});



// =============================================================================
// [ver1.0.4] LayoutManager: 화면 레이아웃 타입 & 테이블 밀도(Density) 제어
// =============================================================================
var LayoutManager = {
  // [Standard v1.0.1] 메뉴 위치 2가지 (이전 버전의 다른 레이아웃 값은 위쪽 메뉴로)
  LAYOUT_LABELS: {
    "top-nav": "⬆️ 위쪽 메뉴 (기본)",
    "sidebar-left": "⬅️ 왼쪽 메뉴"
  },
  DENSITIES: ["standard", "compact"],

  init() {
    const savedLayout = (projectConfig && projectConfig.layoutType) || localStorage.getItem("WBS_LAYOUT_TYPE") || "top-nav";
    const savedDensity = (projectConfig && projectConfig.uiDensity) || localStorage.getItem("WBS_UI_DENSITY") || "standard";
    this.setLayout(savedLayout, false);
    this.setDensity(savedDensity, false);
    this.syncThemeSelect();
    this.adjustSidebar();
  },

  adjustSidebar() {
    const header = document.querySelector("header");
    const tabBar = document.querySelector(".tab-bar");
    if (document.body.getAttribute("data-layout") === "sidebar-left") {
      if (header && tabBar) {
        const h = Math.max(header.offsetHeight || 0, 75);
        tabBar.style.top = h + "px";
      }
    } else {
      if (tabBar) tabBar.style.top = "";
    }
  },

  setLayout(layoutType, notify = false) {
    const valid = this.LAYOUT_LABELS[layoutType] ? layoutType : "top-nav";
    document.body.setAttribute("data-layout", valid);
    if (projectConfig) projectConfig.layoutType = valid;
    try { localStorage.setItem("WBS_LAYOUT_TYPE", valid); } catch (e) {}

    // 상단 헤더 드롭다운 및 설정 탭 드롭다운 동기화
    const hdrSel = document.getElementById("headerLayoutSelector");
    if (hdrSel) hdrSel.value = valid;
    const cfgSel = document.getElementById("cfgLayoutTypeSelect");
    if (cfgSel) cfgSel.value = valid;

    // 설정 탭 레이아웃 카드 active 클래스 업데이트
    Object.keys(this.LAYOUT_LABELS).forEach(k => {
      const card = document.getElementById(`layoutCard_${k}`);
      if (card) {
        if (k === valid) card.classList.add("active");
        else card.classList.remove("active");
      }
    });

    const badge = document.getElementById("currentLayoutStatusBadge");
    if (badge) badge.textContent = `현재 메뉴 위치: ${this.LAYOUT_LABELS[valid]}`;

    this.adjustSidebar();

    // 레이아웃 변경 시 대시보드 및 간트차트 폭 재계산
    setTimeout(() => {
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderGantt === "function") renderGantt();
      this.adjustSidebar();
    }, 60);

    if (notify) {
      persistChanges();
      if (typeof showToast === "function") {
        showToast(`메뉴 위치를 [${this.LAYOUT_LABELS[valid]}](으)로 바꿨습니다.`);
      }
    }
  },

  setDensity(densityMode, notify = false) {
    const valid = this.DENSITIES.includes(densityMode) ? densityMode : "standard";
    document.body.setAttribute("data-density", valid);
    if (projectConfig) projectConfig.uiDensity = valid;
    try { localStorage.setItem("WBS_UI_DENSITY", valid); } catch (e) {}

    const cfgDen = document.getElementById("cfgDensitySelect");
    if (cfgDen) cfgDen.value = valid;
    const hdrDen = document.getElementById("gDensitySelect");
    if (hdrDen) hdrDen.value = valid;

    if (notify) {
      persistChanges();
      const labelMap = { standard: "기본", compact: "촘촘" };
      if (typeof showToast === "function") {
        showToast(`화면 밀도를 [${labelMap[valid]}](으)로 바꿨습니다.`);
      }
    }
  },

  syncThemeSelect() {
    const curTheme = document.body.getAttribute("data-theme") || defaultTheme();
    const hdrTheme = document.getElementById("themeSelector");
    if (hdrTheme) hdrTheme.value = curTheme;
    const cfgTheme = document.getElementById("cfgThemeSelect");
    if (cfgTheme) cfgTheme.value = curTheme;
  }
};



// =============================================================================
// [ver1.0.4 신규] 개선과제형(REQ) 공정 단계 기준정보 관리자 (프리셋 & 실시간 동기화)
// =============================================================================
var ReqPhaseManager = {
  PRESETS: {
    REQ_MFG_2027: {
      code: "REQ_MFG_2027",
      name: "27년 가동률 시스템 개선 표준형 (4단계)",
      desc: "요구사항정의(1~3월) ➔ 과제요구개발(3~10월) ➔ 추가요구개발(5~10월) ➔ 이행안정화(11~12월)",
      phases: [
        { key: "r1", name: "요구사항정의단계 (1~3월)", weight: 20, output: "요구사항목록/정의서", keywords: ["요구사항", "요건", "접수", "분석", "정의", "확정"] },
        { key: "r2", name: "과제요구사항 개발단계 (3~10월)", weight: 40, output: "과제개발결과서/분석설계서", keywords: ["과제", "개발", "분석설계", "구현", "단위테스트"] },
        { key: "r3", name: "추가 요구사항 개발단계 (5~10월)", weight: 25, output: "추가요건소스/검수원", keywords: ["추가", "개선", "비가동", "터치", "알고리즘", "연계"] },
        { key: "r4", name: "이행/안정화 단계 (11~12월)", weight: 15, output: "보안조치서/인수인계서", keywords: ["이행", "보안", "점검", "인수인계", "종료", "안정화"] }
      ]
    },
    REQ_STANDARD: {
      code: "REQ_STANDARD",
      name: "일반 요구사항 개선형 (4단계)",
      desc: "과제접수/요구분석 ➔ 개선방안 상세설계 ➔ 개선개발 및 현장적용 ➔ 효과검증 및 과제완료",
      phases: [
        { key: "r1", name: "과제접수/요구분석", weight: 20, output: "요구명세서/접수증", keywords: ["접수", "타당성", "분석", "요건", "검토", "요구사항", "현황"] },
        { key: "r2", name: "개선방안 상세설계", weight: 25, output: "개선설계서/방안서", keywords: ["설계", "방안", "개선안", "상세", "화면", "db", "인터페이스", "기획"] },
        { key: "r3", name: "개선개발 및 현장적용", weight: 35, output: "개발소스/적용확인서", keywords: ["개발", "구현", "적용", "제작", "개선", "코딩", "모듈", "단위"] },
        { key: "r4", name: "효과검증 및 과제완료", weight: 20, output: "완료보고서/검증서", keywords: ["검증", "효과", "완료", "측정", "시험", "안정화", "이행", "종료"] }
      ]
    },
    REQ_VOC_FAST: {
      code: "REQ_VOC_FAST",
      name: "현장 VOC 긴급대응형 (3단계)",
      desc: "현장VOC 접수 및 원인분석 ➔ 신속 개선개발 및 현장검증 ➔ 효과측정 및 현장 표준화",
      phases: [
        { key: "r1", name: "현장VOC 접수 및 원인분석", weight: 25, output: "VOC원인분석서", keywords: ["voc", "접수", "현장", "원인", "불편", "긴급"] },
        { key: "r2", name: "신속 개선개발 및 현장검증", weight: 50, output: "개선패치/현장확인서", keywords: ["개선", "개발", "패치", "조치", "터치", "ui", "센서"] },
        { key: "r3", name: "효과측정 및 현장 표준화", weight: 25, output: "효과검증서/표준작업서", keywords: ["효과", "측정", "표준화", "안정화", "완료"] }
      ]
    },
    REQ_EQUIPMENT: {
      code: "REQ_EQUIPMENT",
      name: "설비/센서 텔레메트리 연계형 (4단계)",
      desc: "설비통신 인터페이스설계 ➔ PLC/센서 데이터수집연계 ➔ 가동률 로직구현 ➔ 라인 시운전/안정화",
      phases: [
        { key: "r1", name: "설비통신 인터페이스설계", weight: 20, output: "통신인터페이스정의서", keywords: ["설비", "통신", "인터페이스", "설계", "프로토콜"] },
        { key: "r2", name: "PLC/센서 데이터수집연계", weight: 35, output: "수집게이트웨이모듈", keywords: ["plc", "cnc", "센서", "수집", "연계", "버퍼링"] },
        { key: "r3", name: "가동률/미소정지 로직구현", weight: 30, output: "가동률산출엔진", keywords: ["가동률", "oee", "미소정지", "택트타임", "로직", "지표"] },
        { key: "r4", name: "라인 시운전 및 종합안정화", weight: 15, output: "시운전검수보고서", keywords: ["시운전", "현장", "라인", "안정화", "이관"] }
      ]
    }
  },

  get DEFAULT_REQ_PHASES() {
    return this.PRESETS.REQ_MFG_2027.phases;
  },

  getPhases() {
    if (projectConfig && Array.isArray(projectConfig.reqSdlcPhases) && projectConfig.reqSdlcPhases.length > 0) {
      return projectConfig.reqSdlcPhases;
    }
    return JSON.parse(JSON.stringify(this.DEFAULT_REQ_PHASES));
  },

  applyPreset(presetCode) {
    const preset = this.PRESETS[presetCode] || this.PRESETS.REQ_MFG_2027;
    projectConfig.reqSdlcPhases = JSON.parse(JSON.stringify(preset.phases));
    projectConfig.activeReqPreset = presetCode;
    this.renderTable();
    if (typeof MasterSyncEngine !== "undefined") {
      MasterSyncEngine.syncAll(true, "req-preset");
    } else {
      rebuildAll(true);
    }
    showToast(`개선과제 단계가 [${preset.name}] 프리셋으로 전환 적용되었습니다.`);
  },

  renderTable() {
    const tbody = document.getElementById("reqPhasesTableBody");
    if (!tbody) return;
    const phases = this.getPhases();
    tbody.innerHTML = "";

    phases.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:center;"><b>${idx + 1}</b></td>
        <td><input type="text" value="${escapeHtml(p.name)}" style="width:100%;font-weight:bold;color:#0f766e;" data-change="ReqPhaseManager.updatePhase" data-change-args="${UiEvents.args(idx, "name", "$value")}"></td>
        <td><input type="number" value="${p.weight}" style="width:70px;text-align:right;" data-change="ReqPhaseManager.updatePhase" data-change-args="${UiEvents.args(idx, "weight", "$num")}"></td>
        <td><input type="text" value="${escapeHtml(p.output || "")}" style="width:100%;" data-change="ReqPhaseManager.updatePhase" data-change-args="${UiEvents.args(idx, "output", "$value")}"></td>
        <td><input type="text" value="${escapeHtml((p.keywords || []).join(", "))}" style="width:100%;font-size:var(--fs-xs, 11px);" placeholder="쉼표로 구분" data-change="ReqPhaseManager.updatePhase" data-change-args="${UiEvents.args(idx, "keywords", "$split")}"></td>
        <td style="text-align:center;"><button class="btn btn-danger btn-sm" data-click="ReqPhaseManager.deletePhase" data-click-args="${UiEvents.args(idx)}">×</button></td>
      `;
      tbody.appendChild(tr);
    });

    const sumWeight = phases.reduce((acc, p) => acc + (parseFloat(p.weight) || 0), 0);
    const sumEl = document.getElementById("reqPhasesWeightSum");
    if (sumEl) {
      sumEl.textContent = `가중치 합계: ${sumWeight}%`;
      sumEl.style.color = Math.round(sumWeight) === 100 ? "#10b981" : "#ef4444";
    }

    this.populatePresetSelector(projectConfig.activeReqPreset || "REQ_MFG_2027");
  },

  updatePhase(idx, field, val) {
    if (!projectConfig.reqSdlcPhases) projectConfig.reqSdlcPhases = this.getPhases();
    if (projectConfig.reqSdlcPhases[idx]) {
      projectConfig.reqSdlcPhases[idx][field] = val;
      this.renderTable();
      if (typeof MasterSyncEngine !== "undefined") {
        MasterSyncEngine.syncAll(false, "req-phase-update");
      } else {
        rebuildAll();
      }
    }
  },

  addPhase() {
    if (!projectConfig.reqSdlcPhases) projectConfig.reqSdlcPhases = this.getPhases();
    const newIdx = projectConfig.reqSdlcPhases.length + 1;
    projectConfig.reqSdlcPhases.push({
      key: `r${Date.now().toString().slice(-4)}`,
      name: `신규 개선단계 ${newIdx}`,
      weight: 10,
      output: "개선산출물",
      keywords: ["개선", "과제"]
    });
    this.renderTable();
    if (typeof MasterSyncEngine !== "undefined") {
      MasterSyncEngine.syncAll(false, "req-phase-add");
    } else {
      rebuildAll();
    }
    showToast("신규 개선과제 단계가 추가되었습니다.");
  },

  deletePhase(idx) {
    if (!projectConfig.reqSdlcPhases) projectConfig.reqSdlcPhases = this.getPhases();
    if (projectConfig.reqSdlcPhases.length <= 1) {
      showToast("개선과제 단계는 최소 1개 이상 유지되어야 합니다.", "warning");
      return;
    }
    projectConfig.reqSdlcPhases.splice(idx, 1);
    this.renderTable();
    if (typeof MasterSyncEngine !== "undefined") {
      MasterSyncEngine.syncAll(false, "req-phase-delete");
    } else {
      rebuildAll();
    }
    showToast("개선과제 단계가 삭제되었습니다.");
  },

  populatePresetSelector(selectedKey) {
    const sel = document.getElementById("reqPresetSelector");
    if (!sel) return;
    const currentActive = selectedKey || projectConfig.activeReqPreset || Object.keys(this.PRESETS)[0];
    sel.innerHTML = Object.keys(this.PRESETS).map(k => {
      const p = this.PRESETS[k];
      return `<option value="${k}" ${k === currentActive ? "selected" : ""}>${escapeHtml(p.name)}</option>`;
    }).join("");
    sel.value = currentActive;
  },

  deleteCurrentPreset() {
    const sel = document.getElementById("reqPresetSelector");
    const currentKey = (sel && sel.value) ? sel.value : (projectConfig.activeReqPreset || Object.keys(this.PRESETS)[0]);
    const presetKeys = Object.keys(this.PRESETS);
    if (presetKeys.length <= 1) {
      showToast("⚠️ 개선과제형 타입은 최소 1개 이상 유지되어야 하므로 삭제할 수 없습니다.", "warning");
      return;
    }
    const targetPreset = this.PRESETS[currentKey];
    const targetName = targetPreset ? targetPreset.name : currentKey;

    openConfirmDialog(`선택된 [${targetName}] 개선과제형 타입을 정말로 삭제하시겠습니까?`, () => {
      delete this.PRESETS[currentKey];
      if (projectConfig.customReqPresets && projectConfig.customReqPresets[currentKey]) {
        delete projectConfig.customReqPresets[currentKey];
      }
      const remainingKeys = Object.keys(this.PRESETS);
      const nextKey = remainingKeys[0];
      this.populatePresetSelector(nextKey);
      this.applyPreset(nextKey);
      persistChanges();
      showToast(`✅ [${targetName}] 타입이 삭제되고 [${this.PRESETS[nextKey].name}]으로 전환되었습니다.`);
    });
  },

  openNewPresetModal() {
    const modal = document.getElementById("newReqPresetModal");
    if (!modal) return;
    const codeIn = document.getElementById("newReqPresetCode");
    const nameIn = document.getElementById("newReqPresetName");
    const descIn = document.getElementById("newReqPresetDesc");
    const count = Object.keys(this.PRESETS).length + 1;
    if (codeIn) codeIn.value = `REQ_CUSTOM_${Date.now().toString().slice(-4)}`;
    if (nameIn) nameIn.value = `신규 개선과제형 타입 ${count} (4단계)`;
    if (descIn) descIn.value = "요구분석 ➔ 상세설계 ➔ 모듈개발 ➔ 현장검증 4단계 공정";
    modal.style.display = "flex";
  },

  closeNewPresetModal() {
    const modal = document.getElementById("newReqPresetModal");
    if (modal) modal.style.display = "none";
  },

  submitNewPreset() {
    const codeIn = document.getElementById("newReqPresetCode");
    const nameIn = document.getElementById("newReqPresetName");
    const descIn = document.getElementById("newReqPresetDesc");
    const tplSel = document.getElementById("newReqPresetTemplate");

    const code = (codeIn?.value || "").trim().toUpperCase();
    const name = (nameIn?.value || "").trim();
    const desc = (descIn?.value || "").trim();
    const tplType = tplSel?.value || "4STEP";

    if (!code || !name) {
      showToast("⚠️ 타입 코드와 타입 명칭을 모두 입력해주세요.", "warning");
      return;
    }
    if (this.PRESETS[code]) {
      showToast("⚠️ 이미 존재하는 타입 코드입니다. 다른 코드를 입력해주세요.", "warning");
      return;
    }

    let phases = [];
    if (tplType === "3STEP") {
      phases = [
        { key: "r1", name: "1. 현장요건 분석 및 접수", weight: 30, output: "요구사항접수증", keywords: ["요구사항", "접수", "분석", "현황"] },
        { key: "r2", name: "2. 신속 개선개발 및 현장적용", weight: 45, output: "개선개발소스/패치", keywords: ["개발", "구현", "적용", "패치", "로직"] },
        { key: "r3", name: "3. 효과검증 및 표준화", weight: 25, output: "효과검증보고서", keywords: ["검증", "효과", "완료", "표준화", "이행"] }
      ];
    } else if (tplType === "5STEP") {
      phases = [
        { key: "r1", name: "1. 과제타당성 검토", weight: 15, output: "타당성보고서", keywords: ["타당성", "검토", "요건"] },
        { key: "r2", name: "2. 상세 요구사항 정의", weight: 20, output: "요구사항정의서", keywords: ["요구사항", "정의", "분석"] },
        { key: "r3", name: "3. 개선방안 설계", weight: 25, output: "개선설계서", keywords: ["설계", "화면", "db", "인터페이스"] },
        { key: "r4", name: "4. 모듈개발 및 단위시험", weight: 25, output: "단위테스트성적서", keywords: ["개발", "구현", "코딩", "단위"] },
        { key: "r5", name: "5. 현장시운전 및 완료", weight: 15, output: "최종검증보고서", keywords: ["시운전", "현장", "완료", "이행"] }
      ];
    } else {
      phases = [
        { key: "r1", name: "1. 요구사항 분석 및 정의", weight: 20, output: "요구사항정의서", keywords: ["요구사항", "요건", "접수", "분석", "정의"] },
        { key: "r2", name: "2. 개선방안 상세설계", weight: 30, output: "상세설계서/ERD", keywords: ["설계", "화면", "db", "인터페이스", "로직"] },
        { key: "r3", name: "3. 기능 구현 및 단위테스트", weight: 30, output: "개발소스/단위시험서", keywords: ["개발", "구현", "코딩", "단위테스트"] },
        { key: "r4", name: "4. 종합검증 및 현장이행", weight: 20, output: "검증보고서/인수인계서", keywords: ["검증", "효과", "시험", "이행", "안정화"] }
      ];
    }

    const newPreset = { code, name, desc: desc || `${name} 공정`, phases };
    this.PRESETS[code] = newPreset;
    if (!projectConfig.customReqPresets) projectConfig.customReqPresets = {};
    projectConfig.customReqPresets[code] = newPreset;

    this.populatePresetSelector(code);
    this.applyPreset(code);
    this.closeNewPresetModal();
    persistChanges();
    showToast(`🎉 [${name}] 신규 개선과제형 타입이 성공적으로 등록되었습니다.`);
  }
};

window.ReqPhaseManager = ReqPhaseManager;

window.NoticeCommManager = NoticeCommManager;
window.RealtimeChatManager = RealtimeChatManager;
window.LayoutManager = LayoutManager;

// =========================================================================
// 스마트병합(tab-merge) 통합 입출력 컨트롤러 (SmartMergeCenter)
// - 모든 사용자: 다운로드 및 담당 서브시스템 업로드
// - 기준정보 / 전체(ALL) 업로드: 관리자(SYS_ADMIN) 및 PM
// =========================================================================
const SmartMergeCenter = {
  isAdminOrPm() {
    const norm = AuthManager.getCurrentRole();
    return norm === "SYS_ADMIN" || norm === "PM";
  },

  // [v1.0.7] 업무·협업 데이터 전체(ALL) 업로드: 관리자·PM·총괄리더
  ITEM_LABEL: { wbs: "WBS", req: "요구사항", voc: "VOC", deliverables: "산출물", config: "기준정보", subsystems: "서브시스템" },
  canBulkWork() {
    return Permission.canEditAllSubsystems();
  },

  refreshMergeUiPermissions() {
    const isPrivileged = this.isAdminOrPm();
    const list = getAllSubsystemNames();
    const curUser = AuthManager.getCurrentUser();
    const normRole = AuthManager.normalizeRole(curUser.role);

    // 상단 권한 안내 배지 갱신
    const bulk = this.canBulkWork();
    const badge = document.getElementById("mergeRoleNoticeBadge");
    if (badge) {
      const who = `${escapeHtml(curUser.name || curUser.empNo)} (${AuthManager.roleLabel(normRole)})`;
      badge.className = "status-badge-chip " + (isPrivileged ? "chip-completed" : bulk ? "chip-progress" : "chip-ready");
      badge.innerHTML = isPrivileged
        ? `👑 ${who} — 모든 데이터 내려받기 · 올리기 가능 (기준정보 포함)`
        : bulk
          ? `⭐ ${who} — 모든 데이터 내려받기 · 업무/협업 데이터 전체(ALL) 올리기 가능 (기준정보 올리기 제외)`
          : `👤 ${who} — 모든 데이터 내려받기 · 담당 서브시스템 데이터만 올리기 가능`;
    }

    // 분야 드롭다운 갱신
    const domains = getProjectDomains();
    ["masterPkgDomainSelect", "workDataDomainSelect"].forEach(dId => {
      const dSel = document.getElementById(dId);
      if (!dSel) return;
      const curD = dSel.value || "ALL";
      dSel.innerHTML = `<option value="ALL">전체 분야 (${domains.length}개)</option>` +
        domains.map(d => `<option value="${escapeHtml(d)}" ${d === curD ? "selected" : ""}>🗂️ ${escapeHtml(d)}</option>`).join("");
    });

    // 대상 서브시스템 드롭다운 갱신 (PM/관리자는 ALL 포함, 일반 사용자는 다운로드를 위해 ALL 선택 가능하되 업로드 시에는 개별 서브시스템 강제)
    ["masterPkgSubsysSelect", "workDataSubsysSelect"].forEach(sId => {
      const sSel = document.getElementById(sId);
      if (!sSel) return;
      const prevVal = sSel.value;
      sSel.innerHTML = "";

      const allOpt = document.createElement("option");
      allOpt.value = "ALL";
      allOpt.textContent = bulk
        ? `🌐 전체 서브시스템 (${list.length}개 · 내려받기/올리기)`
        : `🌐 전체 서브시스템 (내려받기 전용 · 올릴 때는 담당 서브시스템 선택)`;
      sSel.appendChild(allOpt);

      list.forEach(sys => {
        const meta = subsystemsMeta.find(m => m.name === sys || m.code === sys);
        const descShort = meta && meta.desc ? meta.desc.replace(/^\[[^\]]+\]\s*/, "").slice(0, 18) : "";
        const opt = document.createElement("option");
        opt.value = sys;
        opt.textContent = `🏢 ${sys}${descShort ? " (" + descShort + ")" : ""}`;
        sSel.appendChild(opt);
      });

      if (prevVal && (prevVal === "ALL" || list.includes(prevVal))) {
        sSel.value = prevVal;
      } else if (!bulk && curUser.subsystem && curUser.subsystem !== "ALL" && list.includes(curUser.subsystem)) {
        sSel.value = curUser.subsystem;
      } else {
        sSel.value = bulk ? "ALL" : (list[0] || "ALL");
      }
    });

    // 기준정보/서브시스템 업로드 버튼 상태 표시
    document.querySelectorAll(".btn-admin-pm-only").forEach(btn => {
      btn.style.opacity = isPrivileged ? "1" : "0.55";
      btn.title = isPrivileged
        ? "클릭하여 업로드"
        : "관리자(SYS_ADMIN) 또는 프로젝트 관리자(PM)만 업로드할 수 있습니다.";
    });
    // Task 데이터 건수 배지 갱신 및 서브시스템 선택 변경 이벤트 연결
    this.updateCountBadges();
    const sSel = document.getElementById("workDataSubsysSelect");
    if (sSel && !sSel.getAttribute("data-bound-cnt")) {
      sSel.setAttribute("data-bound-cnt", "1");
      sSel.addEventListener("change", () => this.updateCountBadges());
    }
  },

  // 프로젝트 기준정보를 2차원 테이블 행으로 직렬화
  buildConfigRows() {
    const rows = [];
    rows.push({ category: "BASIC", key: "systemTitle", value: projectConfig.systemTitle || "", extra1: "", extra2: "시스템 타이틀", extra3: "" });
    rows.push({ category: "BASIC", key: "projectName", value: projectConfig.projectName || "", extra1: "", extra2: "프로젝트명", extra3: "" });
    rows.push({ category: "BASIC", key: "projectStartDate", value: projectConfig.projectStartDate || "", extra1: "", extra2: "시작일", extra3: "" });
    rows.push({ category: "BASIC", key: "projectEndDate", value: projectConfig.projectEndDate || "", extra1: "", extra2: "종료일", extra3: "" });
    rows.push({ category: "BASIC", key: "reportDate", value: projectConfig.reportDate || "", extra1: "", extra2: "보고기준일", extra3: "" });
    rows.push({ category: "BASIC", key: "weekStartDay", value: String(projectConfig.weekStartDay ?? 5), extra1: "금요일=5, 월요일=1", extra2: "주차시작요일", extra3: "" });
    rows.push({ category: "BASIC", key: "maxDeliverableRounds", value: String(projectConfig.maxDeliverableRounds ?? 2), extra1: "최대 4회차", extra2: "산출물운영회차", extra3: "" });

    (projectConfig.domains || []).forEach((d, idx) => {
      rows.push({ category: "DOMAIN", key: `DOMAIN_${idx + 1}`, value: d, extra1: String(idx + 1), extra2: "상위 분야", extra3: "" });
    });

    (projectConfig.customSdlcTypes || []).forEach(sdlc => {
      (sdlc.phases || []).forEach(ph => {
        rows.push({
          category: "SDLC_PHASE",
          key: `${sdlc.code}|${sdlc.name}`,
          value: ph.name,
          extra1: String(ph.weight || 0),
          extra2: ph.output || "",
          extra3: (ph.keywords || []).join(",")
        });
      });
    });

    (projectConfig.holidays || []).forEach(h => {
      rows.push({
        category: "HOLIDAY",
        key: h.type || "NATIONAL",
        value: h.name || "",
        extra1: h.date || "",
        extra2: WBSEngine.getDayOfWeekText(h.date),
        extra3: ""
      });
    });

    (standardDeliverablesMeta || []).forEach((std, idx) => {
      const rounds = [std.round1 ? "1" : "", std.round2 ? "2" : "", std.round3 ? "3" : "", std.round4 ? "4" : ""].filter(Boolean).join(",");
      rows.push({
        category: "STD_DELIV",
        key: std.phase || "분석설계단계",
        value: std.name || "",
        extra1: rounds,
        extra2: std.defaultDate || "",
        extra3: std.remarks || ""
      });
    });

    rows.push({
      category: "PROJECT_INFO",
      key: "layoutType",
      value: projectConfig.layoutType || document.body.getAttribute("data-layout") || "top-nav",
      extra1: projectConfig.uiDensity || document.body.getAttribute("data-density") || "standard",
      extra2: "화면 레이아웃 타입 및 표시 밀도",
      extra3: ""
    });
    rows.push({ category: "BASIC", key: "progressBasis", value: projectConfig.progressBasis || "CALENDAR", extra1: "CALENDAR=달력일수, BUSINESS=영업일", extra2: "계획 진척률 산정 기준", extra3: "" });

    (projectConfig.milestones || []).forEach(m => {
      rows.push({ category: "MILESTONE", key: m.scope || "ALL", value: m.name || "", extra1: m.date || "", extra2: m.desc || "", extra3: m.id || "" });
    });

    return rows;
  },

  applyConfigRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const domains = [];
    const sdlcMap = new Map();
    const holidays = [];
    const stdDelivs = [];

    rows.forEach(r => {
      const cat = String(r.category || "").trim().toUpperCase();
      const k = String(r.key || "").trim();
      const val = String(r.value || "").trim();
      const ex1 = String(r.extra1 || "").trim();
      const ex2 = String(r.extra2 || "").trim();
      const ex3 = String(r.extra3 || "").trim();

      if (cat === "BASIC") {
        if (k === "systemTitle" && val) projectConfig.systemTitle = val;
        if (k === "projectName" && val) projectConfig.projectName = val;
        if (k === "projectStartDate" && val) projectConfig.projectStartDate = ExcelSync.normalizeDate(val);
        if (k === "projectEndDate" && val) projectConfig.projectEndDate = ExcelSync.normalizeDate(val);
        if (k === "reportDate" && val) projectConfig.reportDate = ExcelSync.normalizeDate(val);
        if (k === "weekStartDay" && val) projectConfig.weekStartDay = parseInt(val, 10) || 5;
        if (k === "maxDeliverableRounds" && val) projectConfig.maxDeliverableRounds = Math.min(4, Math.max(1, parseInt(val, 10) || 2));
      } else if (cat === "DOMAIN" && val) {
        if (!domains.includes(val) && domains.length < 5) domains.push(val);
      } else if (cat === "SDLC_PHASE" && k && val) {
        const [sCode, sName] = k.split("|");
        const code = (sCode || "SDLC_CUSTOM").trim();
        if (!sdlcMap.has(code)) {
          sdlcMap.set(code, { code, name: (sName || code).trim(), desc: "", phases: [] });
        }
        const entry = sdlcMap.get(code);
        entry.phases.push({
          key: `p${entry.phases.length + 1}`,
          name: val,
          weight: parseFloat(ex1) || 20,
          output: ex2,
          keywords: ex3 ? ex3.split(",").map(s => s.trim()).filter(Boolean) : [val]
        });
      } else if (cat === "HOLIDAY" && val && ex1) {
        holidays.push({
          type: k === "CUSTOM" ? "CUSTOM" : "NATIONAL",
          name: val,
          date: ExcelSync.normalizeDate(ex1)
        });
      } else if (cat === "STD_DELIV" && val) {
        const rSet = ex1.split(",").map(s => s.trim());
        stdDelivs.push({
          phase: k || "분석설계단계",
          name: val,
          round1: rSet.includes("1"),
          round2: rSet.includes("2"),
          round3: rSet.includes("3"),
          round4: rSet.includes("4"),
          defaultDate: ExcelSync.normalizeDate(ex2),
          remarks: ex3
        });
      }
    });

    if (domains.length > 0) projectConfig.domains = domains;
    if (sdlcMap.size > 0) {
      projectConfig.customSdlcTypes = Array.from(sdlcMap.values()).slice(0, 2).map(s => {
        s.desc = s.phases.map(p => p.name).join(" ➔ ");
        return s;
      });
    }
    if (holidays.length > 0) projectConfig.holidays = holidays;
    const milestones = rows.filter(r => r.category === "MILESTONE" && r.value).map((r, i) => ({
      id: r.extra3 || `MS-${Date.now().toString(36)}-${i}`, scope: r.key || "ALL", name: r.value, date: r.extra1 || "", desc: r.extra2 || ""
    }));
    if (milestones.length > 0) projectConfig.milestones = milestones;
    rows.forEach(r => {
      if (r.category === "PROJECT_INFO" && r.key === "layoutType" && r.value) {
        LayoutManager.setLayout(r.value.trim(), false);
        if (r.extra1) LayoutManager.setDensity(r.extra1.trim(), false);
      }
      if (r.category === "BASIC" && r.key === "progressBasis" && r.value) {
        projectConfig.progressBasis = r.value.trim() === "BUSINESS" ? "BUSINESS" : "CALENDAR";
      }
    });
    if (stdDelivs.length > 0) standardDeliverablesMeta = stdDelivs;
    return true;
  },

  // 1) 항목별 다운로드 (모든 사용자 허용)
  // [v3.3.0] scopeOverride: 화면 머리줄 [⬇ 내려받기]에서 그 화면의 서브시스템 조회 범위로 내려받을 때
  downloadItem(itemType, format, scopeOverride) {
    const repDate = projectConfig.reportDate || "2027-06-01";
    const scopeSel = document.getElementById("workDataSubsysSelect");
    const scope = (itemType === "config" || itemType === "subsystems")
      ? "ALL"
      : (scopeOverride || (scopeSel ? scopeSel.value : "ALL"));
    const isAll = scope === "ALL";

    if (format === "JSON") {
      let payload = {
        schemaVersion: "2026_v1.3",
        itemType: itemType,
        targetScope: scope,
        exportedAt: new Date().toISOString()
      };
      if (itemType === "config") {
        payload.projectConfig = projectConfig;
        payload.standardDeliverablesMeta = standardDeliverablesMeta;
      } else if (itemType === "subsystems") {
        payload.subsystemsMeta = subsystemsMeta;
      } else if (itemType === "wbs") {
        payload.wbsData = isAll ? wbsData : wbsData.filter(d => d.system === scope);
      } else if (itemType === "req") {
        payload.reqMasterData = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
      } else if (itemType === "voc") {
        payload.vocData = isAll ? vocData : vocData.filter(v => v.system === scope);
      } else if (itemType === "deliverables") {
        payload.deliverablesData = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName(SmartMergeCenter.ITEM_LABEL[itemType] || itemType, [scope], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[${itemType.toUpperCase()} JSON 내려받기 완료] ${filename}`);
      return;
    }

    // EXCEL 다운로드
    const schema = ExcelSync.TAB_SCHEMAS[itemType];
    if (!schema) return;
    let records = [];
    if (itemType === "config") records = this.buildConfigRows();
    else if (itemType === "subsystems") records = subsystemsMeta;
    else if (itemType === "wbs") records = isAll ? wbsData : wbsData.filter(d => d.system === scope);
    else if (itemType === "req") records = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
    else if (itemType === "voc") records = isAll ? vocData : vocData.filter(v => v.system === scope);
    else if (itemType === "deliverables") records = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);

    const rows = [
      { cells: schema.map(c => c.label), styleId: 1, height: 25 }
    ];
    records.forEach(r => {
      const rowCells = schema.map(c => {
        if ((itemType === "wbs" && ["level", "weight", "pProg", "aProg"].includes(c.key)) || (itemType === "subsystems" && c.key === "weight")) {
          const num = parseFloat(r[c.key]);
          return isNaN(num) ? 0 : num;
        }
        return ExcelSync.formatExportCell(itemType, c.key, r[c.key]);
      });
      rows.push({ cells: rowCells, styleId: 2, height: 20 });
    });

    const sheetNameMap = {
      config: "0_프로젝트기준정보",
      wbs: "1_WBS공정표",
      subsystems: "2_서브시스템기준정보",
      deliverables: "3_산출물관리",
      req: "4_요구사항REQ",
      voc: "5_VOC이슈관리"
    };
    const blob = ExcelSync._buildXlsxBlob([
      { name: sheetNameMap[itemType] || itemType.toUpperCase(), colWidths: schema.map(c => c.width || 18), rows }
    ]);
    const filename = ExcelSync.stdName(SmartMergeCenter.ITEM_LABEL[itemType] || itemType, [scope], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[${itemType.toUpperCase()} 엑셀 내려받기 완료] ${filename}`);
  },

  // 2) 항목별 업로드 (권한 검증 + 서브시스템 필터링)
  async uploadItem(e, itemType, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const isPrivileged = this.isAdminOrPm();

    // 권한 체크 1: 기준정보(config) 및 서브시스템 정보(subsystems)는 관리자나 PM만 업로드 가능
    if ((itemType === "config" || itemType === "subsystems") && !isPrivileged) {
      showToast("🚫 [권한 제한] 프로젝트 기준정보 및 서브시스템 기준정보 업로드는 시스템 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다.");
      return;
    }

    const scopeSel = document.getElementById("workDataSubsysSelect");
    const targetScope = (itemType === "config" || itemType === "subsystems")
      ? "ALL"
      : (scopeSel ? scopeSel.value : "ALL");

    // 권한 체크 2: WBS/REQ/VOC/산출물의 전체(ALL) 업로드는 관리자나 PM만 가능
    if (targetScope === "ALL" && !isPrivileged) {
      showToast("🚫 [권한 제한] 일반 사용자는 [전체 서브시스템(ALL)] 일괄 업로드를 수행할 수 없습니다. 상단 드롭다운에서 담당 서브시스템을 선택한 뒤 업로드해주세요.");
      return;
    }

    try {
      // 업로드 직전 타임스탬프 백업 생성
      const backupName = BackupHistoryManager.createBackupSnapshot(`${itemType.toUpperCase()}_${format}업로드(${targetScope})`, targetScope, true);

      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        if (itemType === "config") {
          if (data.projectConfig) projectConfig = Object.assign({}, projectConfig, data.projectConfig);
          if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
        } else if (itemType === "subsystems") {
          const arr = Array.isArray(data.subsystemsMeta) ? data.subsystemsMeta : (Array.isArray(data) ? data : []);
          if (arr.length === 0) throw new Error("유효한 서브시스템 기준정보가 없습니다.");
          subsystemsMeta = arr;
          normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
        } else {
          this._mergeWorkArrayData(itemType, data, targetScope);
        }
      } else {
        // EXCEL 파싱
        const sheets = await ExcelSync._parseUploadedFile(file);
        if (itemType === "config") {
          const cfgRows = [];
          sheets.forEach(sh => {
            sh.rows.slice(1).forEach(cells => {
              if (cells.length >= 2 && cells[0] && cells[1]) {
                cfgRows.push({
                  category: cells[0],
                  key: cells[1],
                  value: cells[2] || "",
                  extra1: cells[3] || "",
                  extra2: cells[4] || "",
                  extra3: cells[5] || ""
                });
              }
            });
          });
          if (!this.applyConfigRows(cfgRows)) {
            throw new Error("엑셀 파일에서 프로젝트 기준정보 행을 찾지 못했습니다.");
          }
        } else {
          const parsedRows = this._extractRowsFromSheets(sheets, itemType);
          if (parsedRows.length === 0) {
            throw new Error(`엑셀 파일에서 [${itemType.toUpperCase()}] 데이터를 찾지 못했습니다.`);
          }
          if (itemType === "subsystems") {
            subsystemsMeta = parsedRows;
            normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
          } else {
            this._mergeWorkArrayData(itemType, parsedRows, targetScope);
          }
        }
      }

      ExcelSync._ensureWbsAndSubsystemsIntegrity();
      syncSubsystemWeights();
      this.syncConfigInputs();
      rebuildAll(true);
      this.refreshMergeUiPermissions();
      showToast(`[${itemType.toUpperCase()} (${targetScope}) 업로드 반영 완료]\n• 자동 백업 파일: ${backupName}`);
    } catch (err) {
      console.error("SmartMerge upload error:", err);
      showToast("업로드 처리 중 오류가 발생했습니다: " + err.message);
    }
  },

  _extractRowsFromSheets(sheets, targetTabKey) {
    const results = [];
    sheets.forEach(sheet => {
      let colMap = null;
      let matchedSection = false;
      const sName = (sheet.name || "").toLowerCase();
      if (
        (targetTabKey === "wbs" && (sName.includes("wbs") || sName.includes("공정"))) ||
        (targetTabKey === "subsystems" && (sName.includes("서브시스템") || sName.includes("기준"))) ||
        (targetTabKey === "deliverables" && sName.includes("산출물")) ||
        (targetTabKey === "req" && (sName.includes("요구") || sName.includes("req"))) ||
        (targetTabKey === "voc" && (sName.includes("voc") || sName.includes("이슈"))) ||
        sheets.length === 1
      ) {
        matchedSection = true;
        colMap = ExcelSync._buildDefaultColMap(targetTabKey);
      }

      sheet.rows.forEach(cells => {
        const secTitle = ExcelSync._detectSectionTitle(cells);
        if (secTitle) {
          matchedSection = (secTitle === targetTabKey);
          if (matchedSection) colMap = ExcelSync._buildDefaultColMap(targetTabKey);
          return;
        }
        const hdr = ExcelSync._matchHeaderToSchema(cells, targetTabKey);
        if (hdr && hdr.tabKey === targetTabKey) {
          matchedSection = true;
          colMap = hdr.colMap;
          return;
        }
        if (matchedSection) {
          const rawObj = ExcelSync._extractRowObject(targetTabKey, cells, colMap);
          if (rawObj) {
            const norm = ExcelSync._normalizeRowData(targetTabKey, rawObj, results.length);
            if (norm) results.push(norm);
          }
        }
      });
    });
    return results;
  },

  _mergeWorkArrayData(itemType, rawSource, targetScope) {
    let arr = [];
    if (Array.isArray(rawSource)) arr = rawSource;
    else if (rawSource && typeof rawSource === "object") {
      const keyMap = { wbs: "wbsData", req: "reqMasterData", voc: "vocData", deliverables: "deliverablesData" };
      arr = Array.isArray(rawSource[keyMap[itemType]]) ? rawSource[keyMap[itemType]] : [];
    }
    if (arr.length === 0) throw new Error("반영할 데이터가 비어 있습니다.");

    if (targetScope === "ALL") {
      if (itemType === "wbs") wbsData = arr;
      else if (itemType === "req") reqMasterData = arr;
      else if (itemType === "voc") vocData = arr;
      else if (itemType === "deliverables") deliverablesData = arr;
      return;
    }

    // 단일 서브시스템 병합: 여러 서브시스템이 섞여 있어도 targetScope와 일치하는 데이터만 추출
    const filtered = arr.filter(x => {
      const sys = String(x.system || "").trim();
      return sys === targetScope || WBSEngine.getSubsystemCode(sys) === targetScope;
    }).map(x => Object.assign({}, x, { system: targetScope }));

    const finalRows = filtered.length > 0 ? filtered : arr.map(x => Object.assign({}, x, { system: targetScope }));

    if (itemType === "wbs") {
      wbsData = wbsData.filter(d => d.system !== targetScope);
      wbsData.push(...finalRows);
    } else if (itemType === "req") {
      reqMasterData = reqMasterData.filter(r => r.system !== targetScope);
      reqMasterData.push(...finalRows);
    } else if (itemType === "voc") {
      vocData = vocData.filter(v => v.system !== targetScope);
      vocData.push(...finalRows);
    } else if (itemType === "deliverables") {
      deliverablesData = deliverablesData.filter(d => d.system !== targetScope);
      deliverablesData.push(...finalRows);
      deliverablesData.forEach((d, idx) => { d.id = idx + 1; });
    }
  },

  // 3) 상단 마스터 통합 패키지 다운로드 (JSON / EXCEL)
  downloadMasterPackage(format) {
    const sel = document.getElementById("masterPkgSubsysSelect");
    const scope = sel ? sel.value : "ALL";
    const repDate = projectConfig.reportDate || "2027-06-01";
    const isAll = scope === "ALL";

    if (format === "JSON") {
      const payload = {
        schemaVersion: "2026_v1.3",
        exportedAt: new Date().toISOString(),
        targetScope: scope,
        projectConfig: projectConfig,
        standardDeliverablesMeta: standardDeliverablesMeta,
        subsystemsMeta: isAll ? subsystemsMeta : subsystemsMeta.filter(s => s.name === scope || s.code === scope),
        wbsData: isAll ? wbsData : wbsData.filter(d => d.system === scope),
        deliverablesData: isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope),
        reqMasterData: isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope),
        vocData: isAll ? vocData : vocData.filter(v => v.system === scope)
      };
      Object.keys(this.COLLAB_DEFS).forEach(k => {
        const def = this.COLLAB_DEFS[k];
        payload[def.dataKey] = this._collabRecords(k, scope);
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("기준정보묶음", [scope], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[통합 JSON 내려받기 완료] ${filename}`);
      return;
    }

    // EXCEL 통합 다운로드 (0_프로젝트기준정보 시트 포함)
    if (!isAll) {
      ExcelSync.exportSubsystemWorkbook(scope);
      return;
    }
    const cfgSchema = ExcelSync.TAB_SCHEMAS.config;
    const cfgRows = [
      { cells: cfgSchema.map(c => c.label), styleId: 1, height: 25 },
      ...this.buildConfigRows().map(r => ({
        cells: cfgSchema.map(c => r[c.key] || ""),
        styleId: 2,
        height: 20
      }))
    ];
    const sheets = [
      { name: "0_프로젝트기준정보", colWidths: cfgSchema.map(c => c.width || 20), rows: cfgRows }
    ];
    ExcelSync.SECTION_META.forEach(sec => {
      const schema = ExcelSync.TAB_SCHEMAS[sec.key];
      const data = ExcelSync.getTabData(sec.key);
      const sRows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }];
      data.forEach(r => {
        const rowCells = schema.map(c => {
          if ((sec.key === "wbs" && ["level", "weight", "pProg", "aProg"].includes(c.key)) || (sec.key === "subsystems" && c.key === "weight")) {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return ExcelSync.formatExportCell(sec.key, c.key, r[c.key]);
        });
        sRows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({ name: sec.sheetName, colWidths: schema.map(c => c.width || 16), rows: sRows });
    });

    Object.keys(this.COLLAB_DEFS).forEach(k => sheets.push(this._collabSheet(k, "ALL")));
    const blob = ExcelSync._buildXlsxBlob(sheets);
    const filename = ExcelSync.stdName("전체데이터", [], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[전체 통합 엑셀 내려받기 완료] ${filename}`);
  },

  // 4) 상단 마스터 통합 패키지 업로드 (JSON / EXCEL)
  async uploadMasterPackage(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const sel = document.getElementById("masterPkgSubsysSelect");
    const targetScope = sel ? sel.value : "ALL";
    const isPrivileged = this.isAdminOrPm(); // 기준정보 반영 권한

    if (targetScope === "ALL" && !this.canBulkWork()) {
      showToast("🚫 [권한 제한] 전체(ALL) 통합 업로드는 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다. 개별 서브시스템을 선택해주세요.");
      return;
    }

    try {
      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        const backupName = BackupHistoryManager.createBackupSnapshot(`통합JSON업로드(${targetScope})`, targetScope, true);

        this._applyCollabPayload(data, targetScope);
        if (targetScope === "ALL" && isPrivileged) {
          if (data.projectConfig) projectConfig = Object.assign({}, projectConfig, data.projectConfig);
          if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
          if (Array.isArray(data.subsystemsMeta) && data.subsystemsMeta.length > 0) subsystemsMeta = data.subsystemsMeta;
          if (Array.isArray(data.wbsData)) wbsData = data.wbsData;
          if (Array.isArray(data.deliverablesData)) deliverablesData = data.deliverablesData;
          if (Array.isArray(data.reqMasterData)) reqMasterData = data.reqMasterData;
          if (Array.isArray(data.vocData)) vocData = data.vocData;
        } else {
          if (Array.isArray(data.wbsData)) this._mergeWorkArrayData("wbs", data.wbsData, targetScope);
          if (Array.isArray(data.reqMasterData)) this._mergeWorkArrayData("req", data.reqMasterData, targetScope);
          if (Array.isArray(data.vocData)) this._mergeWorkArrayData("voc", data.vocData, targetScope);
          if (Array.isArray(data.deliverablesData)) this._mergeWorkArrayData("deliverables", data.deliverablesData, targetScope);
        }
        normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
        ExcelSync._ensureWbsAndSubsystemsIntegrity();
        syncSubsystemWeights();
        this.syncConfigInputs();
        rebuildAll(true);
        showToast(`[통합 JSON(${targetScope}) 병합 완료]\n• 백업 생성: ${backupName}`);
      } else {
        const collabApplied = this._applyCollabSheets(await ExcelSync._parseUploadedFile(file), targetScope);
        if (collabApplied.length) showToast(`🤝 협업 데이터 반영: ${collabApplied.join(", ")}`);
        if (targetScope === "ALL" && !isPrivileged) {
          // 총괄리더: 기준정보를 제외한 업무 데이터만 서브시스템 단위로 병합
          const sheets = await ExcelSync._parseUploadedFile(file);
          ["wbs", "req", "deliverables", "voc"].forEach(k => {
            const rows = this._extractRowsFromSheets(sheets, k);
            if (rows.length) this._mergeWorkArrayData(k, rows, "ALL");
          });
          rebuildAll(true);
        } else if (targetScope === "ALL") {
          await ExcelSync.importMasterWorkbook({ target: { files: [file], value: "" } });
          normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
          rebuildAll(true);
        } else {
          await ExcelSync.importSubsystemWorkbook({ target: { files: [file], value: "" } }, targetScope);
          normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
          rebuildAll(true);
        }
      }
      this.refreshMergeUiPermissions();
    } catch (err) {
      showToast("통합 패키지 업로드 오류: " + err.message);
    }
  },

  syncConfigInputs() {
    const sEl = document.getElementById("cfgProjectStartDate");
    const eEl = document.getElementById("cfgProjectEndDate");
    const rEl = document.getElementById("globalReportDate");
    const wEl = document.getElementById("cfgWeekStartDay");
    const mEl = document.getElementById("cfgMaxDeliverableRounds");
    if (sEl) sEl.value = projectConfig.projectStartDate;
    if (eEl) eEl.value = projectConfig.projectEndDate;
    if (rEl) rEl.value = projectConfig.reportDate;
    if (wEl) wEl.value = projectConfig.weekStartDay;
    if (mEl) mEl.value = projectConfig.maxDeliverableRounds || 2;
    LayoutManager.init();
  },

  // ---- [v1.0.7] 협업 데이터 (주간보고 · 회의록 · 공지사항 · 소통 피드) 입출력 — 채팅 제외 ----
  COLLAB_DEFS: {
    weekly: {
      dataKey: "weeklyReportsData", sheet: "7_주간보고", label: "주간보고",
      cols: [["id", "보고서ID"], ["weekLabel", "보고주차"], ["scope", "작성단위"], ["scopeValue", "단위값"], ["status", "상태"], ["author", "작성자"], ["updatedAt", "저장일시"], ["currentWeekSummary", "금주요약"], ["nextWeekSummary", "차주요약"], ["issuesNotes", "현안"]],
      inScope: (r, sc) => r.scope === "SYS" ? r.scopeValue === sc : false
    },
    meetings: {
      dataKey: "meetingsData", sheet: "8_회의록", label: "회의록",
      cols: [["id", "회의ID"], ["system", "서브시스템"], ["title", "회의명"], ["date", "회의일자"], ["startTime", "시작"], ["endTime", "종료"], ["location", "장소"], ["host", "주관"], ["status", "상태"], ["summary", "요약"]],
      inScope: (r, sc) => r.system === sc || r.system === "ALL"
    },
    notices: {
      dataKey: "noticesData", sheet: "9_공지사항", label: "공지사항",
      cols: [["id", "공지ID"], ["title", "제목"], ["priority", "중요도"], ["author", "작성자"], ["date", "등록일"], ["isPinned", "상단고정"], ["content", "내용"]],
      inScope: () => true
    },
    comms: {
      dataKey: "communicationsData", sheet: "10_소통피드", label: "소통피드",
      cols: [["id", "게시ID"], ["channel", "채널"], ["title", "제목"], ["taskId", "연계 Task"], ["author", "작성자"], ["date", "작성일"], ["content", "내용"]],
      inScope: (r, sc) => r.channel === sc || r.channel === "전체"
    }
  },
  COLLAB_JSON_COL: "원본데이터(JSON)",

  toggleCollabCheckboxes(checked) {
    Object.keys(this.COLLAB_DEFS).forEach(k => {
      const el = document.getElementById(`chkCollab_${k}`);
      if (el) el.checked = checked;
    });
  },
  getSelectedCollabKeys() {
    return Object.keys(this.COLLAB_DEFS).filter(k => {
      const el = document.getElementById(`chkCollab_${k}`);
      return el && el.checked;
    });
  },
  _collabScope() {
    const sel = document.getElementById("workDataSubsysSelect");
    return sel && sel.value ? sel.value : "ALL";
  },
  _collabRecords(k, scope) {
    const def = this.COLLAB_DEFS[k];
    const all = DataRegistry.get(def.dataKey) || [];
    return !scope || scope === "ALL" ? all : all.filter(r => def.inScope(r, scope));
  },
  _collabSheet(k, scope) {
    const def = this.COLLAB_DEFS[k];
    const rows = [{ cells: def.cols.map(c => c[1]).concat(this.COLLAB_JSON_COL), styleId: 1, height: 25 }];
    this._collabRecords(k, scope).forEach(r => {
      const json = JSON.stringify(r);
      rows.push({ cells: def.cols.map(c => ExcelSync.sanitizeFormulaInjection(r[c[0]] === undefined ? "" : String(r[c[0]]))).concat(json.length > 32000 ? "" : json), styleId: 2, height: 20 });
    });
    return { name: def.sheet, colWidths: def.cols.map(() => 18).concat(40), rows };
  },

  downloadCollabData(format) {
    const keys = this.getSelectedCollabKeys();
    if (!keys.length) {
      showToast("⚠️ 내려받을 협업 데이터 항목을 1개 이상 선택하세요.");
      return;
    }
    const scope = this._collabScope();
    const repDate = projectConfig.reportDate || "";
    if (format === "JSON") {
      const payload = { schemaVersion: `AX_PMYS_${APP_VERSION.version}_COLLAB`, exportCategory: "COLLAB", targetScope: scope, exportedAt: new Date().toISOString() };
      keys.forEach(k => { payload[this.COLLAB_DEFS[k].dataKey] = this._collabRecords(k, scope); });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("협업데이터", [scope], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`📥 [협업 데이터 JSON 내려받기] ${filename}`);
      return;
    }
    const blob = ExcelSync._buildXlsxBlob(keys.map(k => this._collabSheet(k, scope)));
    const filename = ExcelSync.stdName("협업데이터", [scope], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📥 [협업 데이터 엑셀 내려받기] ${filename}`);
  },

  // 같은 ID 는 갱신, 새 ID 는 추가 (범위 밖 항목은 제외)
  _upsertCollab(k, records, scope) {
    const def = this.COLLAB_DEFS[k];
    const list = DataRegistry.get(def.dataKey) || [];
    let added = 0, updated = 0;
    (records || []).forEach(r => {
      if (!r || typeof r !== "object") return;
      if (scope && scope !== "ALL" && !def.inScope(r, scope)) return;
      if (!r.id) r.id = `${k.toUpperCase()}-${Date.now().toString(36)}-${added + updated}`;
      const idx = list.findIndex(x => x.id === r.id);
      if (idx >= 0) { list[idx] = Object.assign({}, list[idx], r); updated++; }
      else { list.push(r); added++; }
    });
    DataRegistry.set(def.dataKey, list);
    return added + updated ? `${def.label}(추가 ${added} · 갱신 ${updated})` : "";
  },

  _applyCollabPayload(data, scope) {
    const applied = [];
    Object.keys(this.COLLAB_DEFS).forEach(k => {
      const arr = data && data[this.COLLAB_DEFS[k].dataKey];
      if (Array.isArray(arr)) {
        const r = this._upsertCollab(k, arr, scope);
        if (r) applied.push(r);
      }
    });
    return applied;
  },

  _applyCollabSheets(sheets, scope, onlyKeys) {
    const applied = [];
    Object.keys(this.COLLAB_DEFS).filter(k => !onlyKeys || onlyKeys.includes(k)).forEach(k => {
      const def = this.COLLAB_DEFS[k];
      const sheet = (sheets || []).find(sh => String(sh.name || "").replace(/\s/g, "") === def.sheet || String(sh.name || "").includes(def.label));
      if (!sheet || !sheet.rows || !sheet.rows.length) return;
      const hdrIdx = sheet.rows.findIndex(cells => (cells || []).map(c => String(c || "").trim()).includes(def.cols[0][1]));
      if (hdrIdx < 0) return;
      const hdr = sheet.rows[hdrIdx].map(c => String(c || "").trim());
      const jsonCol = hdr.indexOf(this.COLLAB_JSON_COL);
      const records = sheet.rows.slice(hdrIdx + 1).map(cells => {
        let rec = {};
        if (jsonCol >= 0 && cells[jsonCol]) {
          try { rec = JSON.parse(cells[jsonCol]); } catch (e) { rec = {}; }
        }
        def.cols.forEach(([key, label]) => {
          const ci = hdr.indexOf(label);
          if (ci >= 0 && cells[ci] !== undefined && cells[ci] !== "") rec[key] = key === "isPinned" ? String(cells[ci]) === "true" : cells[ci];
        });
        return rec.id || rec.title || rec.name ? rec : null;
      }).filter(Boolean);
      const r = this._upsertCollab(k, records, scope);
      if (r) applied.push(r);
    });
    return applied;
  },

  async uploadCollabData(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    const keys = this.getSelectedCollabKeys();
    if (!keys.length) {
      showToast("⚠️ 올릴 협업 데이터 항목을 1개 이상 선택하세요.");
      return;
    }
    const scope = this._collabScope();
    if (scope === "ALL" && !this.canBulkWork()) {
      showToast("🚫 [권한 제한] 일반 사용자는 전체(ALL) 범위로 올릴 수 없습니다. ①에서 담당 서브시스템을 선택하세요.");
      return;
    }
    try {
      const backupName = BackupHistoryManager.createBackupSnapshot(`협업데이터업로드(${scope})`, scope, true);
      let applied;
      if (format === "JSON") {
        const data = JSON.parse(await file.text());
        const filtered = {};
        keys.forEach(k => { const dk = this.COLLAB_DEFS[k].dataKey; if (data[dk]) filtered[dk] = data[dk]; });
        applied = this._applyCollabPayload(filtered, scope);
      } else {
        applied = this._applyCollabSheets(await ExcelSync._parseUploadedFile(file), scope, keys);
      }
      if (!applied.length) throw new Error("파일에서 선택한 협업 데이터 항목을 찾지 못했습니다.");
      rebuildAll(true);
      NoticeCommManager.renderAll();
      MeetingManager.onDataReloaded();
      WeeklyReportManager.onDataReloaded();
      this.updateCountBadges();
      showToast(`✅ [협업 데이터 반영 완료] ${applied.join(", ")} · 백업: ${backupName}`);
    } catch (err) {
      showToast("협업 데이터 업로드 오류: " + err.message);
    }
  },

  // ---- 다중선택(Multi-select) 기준정보 & Task데이터 입출력 ----
  MASTER_KEYS: ["config", "subsystems", "users"],
  WORK_KEYS: ["wbs", "req", "deliverables", "voc"],

  SHEET_NAMES: {
    config: "0_프로젝트기준정보",
    wbs: "1_WBS공정표",
    subsystems: "2_서브시스템기준정보",
    deliverables: "3_산출물관리",
    req: "4_요구사항REQ",
    voc: "5_VOC이슈관리",
    users: "6_사용자목록"
  },

  toggleWorkCheckboxes(checked) {
    this.WORK_KEYS.forEach(k => {
      const el = document.getElementById(`chkWork_${k}`);
      if (el) el.checked = checked;
    });
  },

  toggleMasterCheckboxes(checked) {
    this.MASTER_KEYS.forEach(k => {
      const el = document.getElementById(`chkMaster_${k}`);
      if (el) el.checked = checked;
    });
  },

  getSelectedWorkKeys() {
    return this.WORK_KEYS.filter(k => {
      const el = document.getElementById(`chkWork_${k}`);
      return el && el.checked;
    });
  },

  getSelectedMasterKeys() {
    return this.MASTER_KEYS.filter(k => {
      const el = document.getElementById(`chkMaster_${k}`);
      return el && el.checked;
    });
  },

  updateCountBadges() {
    const scopeSel = document.getElementById("workDataSubsysSelect");
    const scope = scopeSel ? scopeSel.value : "ALL";
    const isAll = !scope || scope === "ALL";

    const wCnt = isAll ? wbsData.length : wbsData.filter(d => d.system === scope).length;
    const rCnt = isAll ? reqMasterData.length : reqMasterData.filter(r => r.system === scope).length;
    const dCnt = isAll ? deliverablesData.length : deliverablesData.filter(d => d.system === scope).length;
    const vCnt = isAll ? vocData.length : vocData.filter(v => v.system === scope).length;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt("cntBadge_wbs", wCnt);
    setTxt("cntBadge_req", rCnt);
    setTxt("cntBadge_deliverables", dCnt);
    setTxt("cntBadge_voc", vCnt);
    setTxt("cntBadge_subsystems", subsystemsMeta.length);
    setTxt("cntBadge_users", projectUsers.length);
    Object.keys(this.COLLAB_DEFS).forEach(k => setTxt(`cntBadge_${k}`, this._collabRecords(k, scope).length));
  },

  // 기준정보 다중선택 다운로드 (프로젝트 기준정보, 서브시스템 정보, 사용자 목록)
  downloadSelectedMasterData(format, overrideKeys = null) {
    const selected = overrideKeys || this.getSelectedMasterKeys();
    if (selected.length === 0) {
      showToast("⚠️ 다운로드할 기준정보 항목을 최소 1개 이상 선택해주세요.");
      return;
    }
    const repDate = projectConfig.reportDate || "2027-06-01";
    const labelStr = selected.join("_").toUpperCase();

    if (format === "JSON") {
      const payload = {
        schemaVersion: "2026_v1.3.5",
        exportCategory: "MASTER_MULTI",
        selectedItems: selected,
        exportedAt: new Date().toISOString()
      };
      if (selected.includes("config")) {
        payload.projectConfig = projectConfig;
        payload.standardDeliverablesMeta = standardDeliverablesMeta;
      }
      if (selected.includes("subsystems")) {
        payload.subsystemsMeta = subsystemsMeta;
      }
      if (selected.includes("users")) {
        payload.projectUsers = projectUsers;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("기준정보", [labelStr], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[기준정보(${selected.length}종) JSON 내려받기 완료]\n${filename}`);
      return;
    }

    // EXCEL 다중 시트 생성
    const sheets = [];
    selected.forEach(k => {
      const schema = ExcelSync.TAB_SCHEMAS[k];
      if (!schema) return;
      let records = [];
      if (k === "config") records = this.buildConfigRows();
      else if (k === "subsystems") records = subsystemsMeta;
      else if (k === "users") records = projectUsers;

      const rows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }];
      records.forEach(r => {
        const rowCells = schema.map(c => {
          if (k === "subsystems" && c.key === "weight") {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return ExcelSync.formatExportCell(k, c.key, r[c.key]);
        });
        rows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({
        name: this.SHEET_NAMES[k] || k.toUpperCase(),
        colWidths: schema.map(c => c.width || 18),
        rows
      });
    });

    const blob = ExcelSync._buildXlsxBlob(sheets);
    const filename = ExcelSync.stdName("기준정보", [labelStr], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[기준정보(${selected.length}종) 엑셀 내려받기 완료]\n${filename}`);
  },

  // 기준정보 다중선택 업로드 (관리자/PM 전용)
  async uploadSelectedMasterData(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    if (!this.isAdminOrPm()) {
      showToast("🚫 [권한 제한] 기준정보(프로젝트 설정·서브시스템·사용자 목록) 업로드는 시스템 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다.");
      return;
    }

    const selected = this.getSelectedMasterKeys();
    if (selected.length === 0) {
      showToast("⚠️ 업로드하여 반영할 기준정보 항목을 최소 1개 이상 체크해주세요.");
      return;
    }

    try {
      const backupName = BackupHistoryManager.createBackupSnapshot(`기준정보업로드(${selected.join("+")})`, "ALL", true);
      const applied = [];

      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        if (selected.includes("config") && (data.projectConfig || data.standardDeliverablesMeta)) {
          if (data.projectConfig) projectConfig = Object.assign({}, projectConfig, data.projectConfig);
          if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
          applied.push("프로젝트 기준정보");
        }
        if (selected.includes("subsystems")) {
          const arr = Array.isArray(data.subsystemsMeta) ? data.subsystemsMeta : (Array.isArray(data) ? data : []);
          if (arr.length > 0) {
            subsystemsMeta = arr;
            normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
            applied.push(`서브시스템(${subsystemsMeta.length}개)`);
          }
        }
        if (selected.includes("users")) {
          const uArr = Array.isArray(data.projectUsers) ? data.projectUsers : [];
          if (uArr.length > 0) {
            this._mergeUsersList(uArr);
            applied.push(`사용자(${projectUsers.length}명)`);
          }
        }
      } else {
        const sheets = await ExcelSync._parseUploadedFile(file);
        if (selected.includes("config")) {
          const cfgRows = this._extractMasterSheetRows(sheets, "config");
          if (cfgRows.length > 0 && this.applyConfigRows(cfgRows)) {
            applied.push("프로젝트 기준정보");
          }
        }
        if (selected.includes("subsystems")) {
          const subRows = this._extractMasterSheetRows(sheets, "subsystems");
          if (subRows.length > 0) {
            subsystemsMeta = subRows;
            normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
            applied.push(`서브시스템(${subsystemsMeta.length}개)`);
          }
        }
        if (selected.includes("users")) {
          const userRows = this._extractMasterSheetRows(sheets, "users");
          if (userRows.length > 0) {
            this._mergeUsersList(userRows);
            applied.push(`사용자(${projectUsers.length}명)`);
          }
        }
      }

      if (applied.length === 0) {
        throw new Error("업로드한 파일에서 체크된 기준정보 항목에 해당하는 유효 데이터를 찾지 못했습니다.");
      }

      ExcelSync._ensureWbsAndSubsystemsIntegrity();
      syncSubsystemWeights();
      this.syncConfigInputs();
      rebuildAll(true);
      this.refreshMergeUiPermissions();
      showToast(`✅ [기준정보 다중선택 업로드 완료]\n• 반영 항목: ${applied.join(", ")}\n• 자동 백업: ${backupName}`);
    } catch (err) {
      showToast("기준정보 업로드 오류: " + err.message);
    }
  },

  // [v3.0.0] 사용자 가져오기: 이 프로젝트의 참여 정보(역할·담당·부서)로 추가·갱신 (목록에 없는 기존 사용자는 그대로 둠)
  _mergeUsersList(incomingUsers) {
    if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) return;
    const pid = ProjectContext.current;
    const list = (projectUsers || []).slice();
    incomingUsers.forEach(inU => {
      if (!inU || !inU.empNo) return;
      const key = String(inU.empNo).toLowerCase();
      let row = list.find(u => String(u.empNo || "").toLowerCase() === key);
      if (!row) {
        const other = ProjectContext.findAny(key);
        if (other && !ProjectContext.isAdminUser(other) && !ProjectManager.isAdmin()) return; // 다른 프로젝트 사용자: 시스템관리자만
        row = other || { empNo: inU.empNo, name: inU.name || inU.empNo, role: "MEMBER", pwdHash: "", lang: "ko" };
        list.push(row);
      }
      if (inU.name) row.name = inU.name;
      if (key === "admin" || ProjectContext.isAdminUser(row)) return;
      const cur = ProjectContext.member(row, pid) || {};
      const role = AuthManager.normalizeRole(inU.role || cur.role || "MEMBER");
      row.projectRoles = Object.assign({}, row.projectRoles, { [pid]: {
        role: role === "SYS_ADMIN" ? "PM" : role,
        subsystem: inU.subsystem || cur.subsystem || "ALL",
        dept: inU.dept !== undefined ? inU.dept : (cur.dept || row.dept || "")
      } });
    });
    projectUsers = list;
  },

  _extractMasterSheetRows(sheets, targetKey) {
    const results = [];
    sheets.forEach(sheet => {
      const sName = (sheet.name || "").toLowerCase();
      let matched = false;
      let colMap = null;

      if (
        (targetKey === "config" && (sName.includes("프로젝트기준") || sName.includes("기본정보") || sName.includes("config"))) ||
        (targetKey === "subsystems" && (sName.includes("서브시스템") || sName.includes("subsystem"))) ||
        (targetKey === "users" && (sName.includes("사용자") || sName.includes("인력") || sName.includes("user"))) ||
        sheets.length === 1
      ) {
        matched = true;
        colMap = ExcelSync._buildDefaultColMap(targetKey);
      }

      sheet.rows.forEach(cells => {
        const hdr = ExcelSync._matchHeaderToSchema(cells, targetKey);
        if (hdr && hdr.tabKey === targetKey) {
          matched = true;
          colMap = hdr.colMap;
          return;
        }
        if (matched) {
          const rawObj = ExcelSync._extractRowObject(targetKey, cells, colMap);
          if (rawObj) {
            const norm = ExcelSync._normalizeRowData(targetKey, rawObj, results.length);
            if (norm) results.push(norm);
          }
        }
      });
    });
    return results;
  },

  // [8] Task 데이터(WBS, 요구사항, 산출물, VOC) 다중선택 다운로드
  downloadSelectedWorkData(format) {
    const selected = this.getSelectedWorkKeys();
    if (selected.length === 0) {
      showToast("⚠️ 다운로드할 Task 데이터 항목(WBS, 요구사항, 산출물, VOC)을 최소 1개 이상 선택해주세요.");
      return;
    }
    const scopeSel = document.getElementById("workDataSubsysSelect");
    const scope = scopeSel ? scopeSel.value : "ALL";
    const isAll = scope === "ALL";
    const repDate = projectConfig.reportDate || "2027-06-01";
    const labelStr = selected.join("_").toUpperCase();

    if (format === "JSON") {
      const payload = {
        schemaVersion: "2026_v1.3.5",
        exportCategory: "WORK_MULTI",
        targetScope: scope,
        selectedItems: selected,
        exportedAt: new Date().toISOString()
      };
      if (selected.includes("wbs")) payload.wbsData = isAll ? wbsData : wbsData.filter(d => d.system === scope);
      if (selected.includes("req")) payload.reqMasterData = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
      if (selected.includes("deliverables")) payload.deliverablesData = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);
      if (selected.includes("voc")) payload.vocData = isAll ? vocData : vocData.filter(v => v.system === scope);

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("업무데이터", [scope, labelStr], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[Task데이터(${selected.length}종 · ${scope}) JSON 내려받기 완료]\n${filename}`);
      return;
    }

    // EXCEL 다중 시트 다운로드
    const sheets = [];
    selected.forEach(k => {
      const schema = ExcelSync.TAB_SCHEMAS[k];
      if (!schema) return;
      let records = [];
      if (k === "wbs") records = isAll ? wbsData : wbsData.filter(d => d.system === scope);
      else if (k === "req") records = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
      else if (k === "deliverables") records = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);
      else if (k === "voc") records = isAll ? vocData : vocData.filter(v => v.system === scope);

      const rows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }];
      records.forEach(r => {
        const rowCells = schema.map(c => {
          if (k === "wbs" && ["level", "weight", "pProg", "aProg"].includes(c.key)) {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return ExcelSync.formatExportCell(k, c.key, r[c.key]);
        });
        rows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({
        name: this.SHEET_NAMES[k] || k.toUpperCase(),
        colWidths: schema.map(c => c.width || 16),
        rows
      });
    });

    const blob = ExcelSync._buildXlsxBlob(sheets);
    const filename = ExcelSync.stdName("업무데이터", [scope, labelStr], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[Task데이터(${selected.length}종 · ${scope}) 엑셀 내려받기 완료]\n${filename}`);
  },

  // [8] Task 데이터(WBS, 요구사항, 산출물, VOC) 다중선택 업로드 병합
  async uploadSelectedWorkData(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const selected = this.getSelectedWorkKeys();
    if (selected.length === 0) {
      showToast("⚠️ 업로드하여 병합할 Task 데이터 항목을 최소 1개 이상 체크해주세요.");
      return;
    }

    const scopeSel = document.getElementById("workDataSubsysSelect");
    const targetScope = scopeSel ? scopeSel.value : "ALL";

    // 권한 체크: 전체(ALL) 업로드는 관리자·PM·총괄리더
    if (targetScope === "ALL" && !this.canBulkWork()) {
      showToast("🚫 [권한 제한] 일반 사용자는 [전체 서브시스템(ALL)] 일괄 업로드를 수행할 수 없습니다. STEP 1에서 담당 서브시스템을 선택한 뒤 업로드해주세요.");
      return;
    }

    try {
      const backupName = BackupHistoryManager.createBackupSnapshot(`Task데이터업로드(${targetScope}:${selected.join("+")})`, targetScope, true);
      const applied = [];

      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        selected.forEach(k => {
          const keyMap = { wbs: "wbsData", req: "reqMasterData", deliverables: "deliverablesData", voc: "vocData" };
          const arr = Array.isArray(data[keyMap[k]]) ? data[keyMap[k]] : (selected.length === 1 && Array.isArray(data) ? data : []);
          if (arr.length > 0) {
            this._mergeWorkArrayData(k, arr, targetScope);
            applied.push(`${k.toUpperCase()}(${arr.length}건)`);
          }
        });
      } else {
        const sheets = await ExcelSync._parseUploadedFile(file);
        selected.forEach(k => {
          const rows = this._extractRowsFromSheets(sheets, k);
          if (rows.length > 0) {
            this._mergeWorkArrayData(k, rows, targetScope);
            applied.push(`${k.toUpperCase()}(${rows.length}건)`);
          }
        });
      }

      if (applied.length === 0) {
        throw new Error("업로드한 파일에서 선택한 Task 데이터 항목에 해당하는 유효 데이터를 찾지 못했습니다.");
      }

      ExcelSync._ensureWbsAndSubsystemsIntegrity();
      syncSubsystemWeights();
      rebuildAll(true);
      this.refreshMergeUiPermissions();
      showToast(`✅ [Task데이터 다중선택 병합 완료 (범위: ${targetScope})]\n• 반영 항목: ${applied.join(", ")}\n• 자동 백업: ${backupName}`);
    } catch (err) {
      showToast("Task데이터 업로드 오류: " + err.message);
    }
  }
};

// =========================================================================
// [ver1.0.4] 정식 등록 샘플 데이터 스냅샷
// 1) 27년 가동률 시스템 개선 과제: data/initial_data.json (js/initial-data.js) 사용
// 2) 제조 시스템 샘플 과제 (SDLC_WATERFALL 4레벨, 2개 분야, 2개 서브시스템, 산출물 2회차)
// =========================================================================
var WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT = {"projectConfig": {"systemTitle": "IOSTAR-PM ver1.0.4", "projectName": "제조 시스템 샘플 과제", "projectStartDate": "2027-01-01", "projectEndDate": "2027-06-30", "weekStartDay": 5, "reportDate": "2027-04-01", "domains": ["제조실행", "품질설비"], "maxDeliverableRounds": 2, "idPrefixConfig": {"wbsPrefix": "WBS", "reqPrefix": "REQ", "vocPrefix": "VOC", "actPrefix": "ACT", "actUseSubCode": true}, "holidays": ["2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06", "2027-08-15", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-09", "2027-12-25"]}, "subsystemsMeta": [{"domain": "제조실행", "code": "MES", "name": "MES", "type": "SDLC", "sdlcCode": "SDLC_WATERFALL", "weight": 50.0, "pm": "김제조 책임", "desc": "[MES 제조실행] 작업지시 연동, 공정 로트(Lot) 트래킹, 생산실적 집계 및 터치 키오스크 UI 구축"}, {"domain": "품질설비", "code": "QMS", "name": "QMS", "type": "SDLC", "sdlcCode": "SDLC_WATERFALL", "weight": 50.0, "pm": "박품질 수석", "desc": "[QMS 품질설비] 실시간 SPC 품질 검사 데이터 수집, 불량 판정 엔진 및 설비 이상 알람 구축"}], "standardDeliverablesMeta": [{"phase": "분석설계단계", "name": "과제요구사항 분석설계서 및 인터페이스정의서", "round1": true, "round2": false, "round3": false, "round4": false, "defaultDate": "2027-05-28", "remarks": "1차 분석설계 승인"}, {"phase": "분석설계단계", "name": "ERD 설계서 및 화면 UI 설계서", "round1": true, "round2": false, "round3": false, "round4": false, "defaultDate": "2027-05-28", "remarks": "1차 UI설계 승인"}, {"phase": "구현테스트단계", "name": "단위 및 통합테스트 결과서", "round1": false, "round2": true, "round3": false, "round4": false, "defaultDate": "2027-10-29", "remarks": "2차 검수 대상"}, {"phase": "구현테스트단계", "name": "성능 시험 성적서 및 시운전 점검서", "round1": false, "round2": true, "round3": false, "round4": false, "defaultDate": "2027-10-29", "remarks": "2차 검수 대상"}], "projectUsers": [{"empNo": "admin", "name": "시스템관리자", "role": "SYS_ADMIN", "subsystem": "ALL", "dept": "전사 IT품질팀 / 시스템 총괄 및 기준정보 제어", "pwdHash": ""}, {"empNo": "pmo_kim", "name": "김총괄 수석PM", "role": "PM", "subsystem": "ALL", "dept": "PMO사업단 / 제조 프로젝트 총괄 공정률 관리", "pwdHash": ""}, {"empNo": "lead_mes", "name": "김제조 책임", "role": "MEMBER", "subsystem": "MES", "dept": "생산기술팀 / MES 작업지시 및 실적 관리", "pwdHash": ""}, {"empNo": "lead_qms", "name": "박품질 수석", "role": "MEMBER", "subsystem": "QMS", "dept": "품질기획팀 / QMS 품질 및 설비 연계 관리", "pwdHash": ""}, {"empNo": "qa_lee", "name": "이검증 선임", "role": "MEMBER", "subsystem": "ALL", "dept": "품질보증팀 / 산출물 검수 및 감리 지원", "pwdHash": ""}], "wbsData": [{"id": "1", "level": 1, "system": "MES", "name": "MES 제조실행시스템 구축", "weight": 50.0, "reqId": "REQ-MES-01", "pStart": "2027-01-01", "pEnd": "2027-06-30", "aStart": "2027-01-01", "aEnd": "", "pProg": 50, "aProg": 52, "output": "MES 총괄구축물", "isLeaf": false}, {"id": "1.1", "level": 2, "system": "MES", "name": "분석단계", "weight": 7.5, "reqId": "REQ-MES-01", "pStart": "2027-01-01", "pEnd": "2027-02-26", "aStart": "2027-01-01", "aEnd": "2027-02-26", "pProg": 100, "aProg": 100, "output": "요구사항명세서", "isLeaf": false}, {"id": "1.1.1", "level": 3, "system": "MES", "name": "현행 공정 분석 및 요건 정의", "weight": 3.5, "reqId": "REQ-MES-01", "pStart": "2027-01-01", "pEnd": "2027-02-19", "aStart": "2027-01-01", "aEnd": "2027-02-19", "pProg": 100, "aProg": 100, "output": "현황분석보고서", "isLeaf": false}, {"id": "1.1.1.1", "level": 4, "system": "MES", "name": "제조 현장 라인 공정 실사 및 인터뷰", "weight": 1.5, "reqId": "REQ-MES-01", "pStart": "2027-01-01", "pEnd": "2027-01-22", "aStart": "2027-01-01", "aEnd": "2027-01-22", "pProg": 100, "aProg": 100, "output": "현장실사결과서", "isLeaf": true}, {"id": "1.1.1.2", "level": 4, "system": "MES", "name": "표준 제조 요구사항 명세서 확정", "weight": 2.0, "reqId": "REQ-MES-01", "pStart": "2027-01-25", "pEnd": "2027-02-19", "aStart": "2027-01-25", "aEnd": "2027-02-19", "pProg": 100, "aProg": 100, "output": "요구사항명세서", "isLeaf": true}, {"id": "1.1.2", "level": 3, "system": "MES", "name": "기술 아키텍처 및 연계 방안 수립", "weight": 4.0, "reqId": "REQ-MES-02", "pStart": "2027-01-15", "pEnd": "2027-02-26", "aStart": "2027-01-15", "aEnd": "2027-02-26", "pProg": 100, "aProg": 100, "output": "기술아키텍처설계서", "isLeaf": false}, {"id": "1.1.2.1", "level": 4, "system": "MES", "name": "서버 및 개발 환경 표준 수립", "weight": 2.0, "reqId": "REQ-MES-02", "pStart": "2027-01-15", "pEnd": "2027-02-05", "aStart": "2027-01-15", "aEnd": "2027-02-05", "pProg": 100, "aProg": 100, "output": "개발환경표준서", "isLeaf": true}, {"id": "1.1.2.2", "level": 4, "system": "MES", "name": "공정 텔레메트리 연계 표준 규격서 작성", "weight": 2.0, "reqId": "REQ-MES-02", "pStart": "2027-02-08", "pEnd": "2027-02-26", "aStart": "2027-02-08", "aEnd": "2027-02-26", "pProg": 100, "aProg": 100, "output": "통신연계규격서", "isLeaf": true}, {"id": "1.2", "level": 2, "system": "MES", "name": "설계단계", "weight": 12.5, "reqId": "REQ-MES-01", "pStart": "2027-03-01", "pEnd": "2027-03-31", "aStart": "2027-03-01", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "화면/DB설계서", "isLeaf": false}, {"id": "1.2.1", "level": 3, "system": "MES", "name": "데이터베이스 및 화면 상세 설계", "weight": 6.5, "reqId": "REQ-MES-01", "pStart": "2027-03-01", "pEnd": "2027-03-26", "aStart": "2027-03-01", "aEnd": "2027-03-26", "pProg": 100, "aProg": 100, "output": "UI/DB상세설계서", "isLeaf": false}, {"id": "1.2.1.1", "level": 4, "system": "MES", "name": "MES 통합 ERD 및 DB 테이블 명세서 설계", "weight": 3.0, "reqId": "REQ-MES-01", "pStart": "2027-03-01", "pEnd": "2027-03-19", "aStart": "2027-03-01", "aEnd": "2027-03-19", "pProg": 100, "aProg": 100, "output": "ERD설계서", "isLeaf": true}, {"id": "1.2.1.2", "level": 4, "system": "MES", "name": "작업자 터치 키오스크 UI 화면 상세 설계", "weight": 3.5, "reqId": "REQ-MES-03", "pStart": "2027-03-08", "pEnd": "2027-03-26", "aStart": "2027-03-08", "aEnd": "2027-03-26", "pProg": 100, "aProg": 100, "output": "화면설계서", "isLeaf": true}, {"id": "1.2.2", "level": 3, "system": "MES", "name": "비즈니스 로직 및 인터페이스 설계", "weight": 6.0, "reqId": "REQ-MES-02", "pStart": "2027-03-15", "pEnd": "2027-03-31", "aStart": "2027-03-15", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "인터페이스설계서", "isLeaf": false}, {"id": "1.2.2.1", "level": 4, "system": "MES", "name": "공정 실적 집계 비즈니스 로직 설계", "weight": 3.0, "reqId": "REQ-MES-01", "pStart": "2027-03-15", "pEnd": "2027-03-31", "aStart": "2027-03-15", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "로직명세서", "isLeaf": true}, {"id": "1.2.2.2", "level": 4, "system": "MES", "name": "상위 ERP 생산계획 연계 인터페이스 설계", "weight": 3.0, "reqId": "REQ-MES-02", "pStart": "2027-03-15", "pEnd": "2027-03-31", "aStart": "2027-03-15", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "연계명세서", "isLeaf": true}, {"id": "1.3", "level": 2, "system": "MES", "name": "개발단계", "weight": 17.5, "reqId": "REQ-MES-01", "pStart": "2027-04-01", "pEnd": "2027-05-14", "aStart": "2027-04-01", "aEnd": "", "pProg": 15, "aProg": 20, "output": "소스코드/단위테스트", "isLeaf": false}, {"id": "1.3.1", "level": 3, "system": "MES", "name": "핵심 공정 추적 및 실적 모듈 개발", "weight": 10.0, "reqId": "REQ-MES-01", "pStart": "2027-04-01", "pEnd": "2027-04-30", "aStart": "2027-04-01", "aEnd": "", "pProg": 25, "aProg": 30, "output": "공정모듈소스", "isLeaf": false}, {"id": "1.3.1.1", "level": 4, "system": "MES", "name": "작업지시 수신 및 로트(Lot) 트래킹 모듈 개발", "weight": 5.0, "reqId": "REQ-MES-01", "pStart": "2027-04-01", "pEnd": "2027-04-30", "aStart": "2027-04-01", "aEnd": "", "pProg": 30, "aProg": 40, "output": "로트트래킹소스", "isLeaf": true}, {"id": "1.3.1.2", "level": 4, "system": "MES", "name": "공정 완료 실적 등록 및 바코드 발행 로직 개발", "weight": 5.0, "reqId": "REQ-MES-03", "pStart": "2027-04-05", "pEnd": "2027-04-30", "aStart": "2027-04-05", "aEnd": "", "pProg": 20, "aProg": 20, "output": "바코드실적소스", "isLeaf": true}, {"id": "1.3.2", "level": 3, "system": "MES", "name": "단위테스트 및 인터페이스 연동 검증", "weight": 7.5, "reqId": "REQ-MES-02", "pStart": "2027-04-19", "pEnd": "2027-05-14", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "단위시험성적서", "isLeaf": false}, {"id": "1.3.2.1", "level": 4, "system": "MES", "name": "실시간 제조 실적 단위테스트 시나리오 검증", "weight": 4.0, "reqId": "REQ-MES-01", "pStart": "2027-04-19", "pEnd": "2027-05-14", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "단위테스트결과서", "isLeaf": true}, {"id": "1.3.2.2", "level": 4, "system": "MES", "name": "단말기 터치 인터페이스 단위 기능 테스트", "weight": 3.5, "reqId": "REQ-MES-03", "pStart": "2027-04-26", "pEnd": "2027-05-14", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "터치UI검증서", "isLeaf": true}, {"id": "1.4", "level": 2, "system": "MES", "name": "테스트단계", "weight": 7.5, "reqId": "REQ-MES-01", "pStart": "2027-05-17", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "통합테스트결과서", "isLeaf": false}, {"id": "1.4.1", "level": 3, "system": "MES", "name": "통합 연계 테스트", "weight": 4.0, "reqId": "REQ-MES-02", "pStart": "2027-05-17", "pEnd": "2027-05-31", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "통합시험성적서", "isLeaf": false}, {"id": "1.4.1.1", "level": 4, "system": "MES", "name": "생산계획-현장실적 전구간 통합 연계 검증", "weight": 2.0, "reqId": "REQ-MES-02", "pStart": "2027-05-17", "pEnd": "2027-05-31", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "전구간연계보고서", "isLeaf": true}, {"id": "1.4.1.2", "level": 4, "system": "MES", "name": "가상 부하 시나리오 기반 성능 시험", "weight": 2.0, "reqId": "REQ-MES-01", "pStart": "2027-05-17", "pEnd": "2027-05-31", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "성능시험성적서", "isLeaf": true}, {"id": "1.4.2", "level": 3, "system": "MES", "name": "사용자 인수 시험 및 결함 조치", "weight": 3.5, "reqId": "REQ-MES-03", "pStart": "2027-06-01", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "인수시험보고서", "isLeaf": false}, {"id": "1.4.2.1", "level": 4, "system": "MES", "name": "현장 작업자 실기 시나리오 기반 인수 검수", "weight": 2.0, "reqId": "REQ-MES-03", "pStart": "2027-06-01", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "인수검수확인서", "isLeaf": true}, {"id": "1.4.2.2", "level": 4, "system": "MES", "name": "검수 결함 조치 및 종합 결과서 승인", "weight": 1.5, "reqId": "REQ-MES-01", "pStart": "2027-06-07", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "결함조치결과서", "isLeaf": true}, {"id": "1.5", "level": 2, "system": "MES", "name": "이행단계", "weight": 5.0, "reqId": "REQ-MES-01", "pStart": "2027-06-21", "pEnd": "2027-06-30", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "이행보고서", "isLeaf": false}, {"id": "1.5.1", "level": 3, "system": "MES", "name": "운영 전환 및 이행 승인", "weight": 5.0, "reqId": "REQ-MES-01", "pStart": "2027-06-21", "pEnd": "2027-06-30", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "준공이행계", "isLeaf": false}, {"id": "1.5.1.1", "level": 4, "system": "MES", "name": "본가동 데이터 이관 및 컷오버(Cut-over)", "weight": 2.5, "reqId": "REQ-MES-01", "pStart": "2027-06-21", "pEnd": "2027-06-25", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "컷오버완료원", "isLeaf": true}, {"id": "1.5.1.2", "level": 4, "system": "MES", "name": "최종 운영자/사용자 매뉴얼 인계 및 준공보고", "weight": 2.5, "reqId": "REQ-MES-03", "pStart": "2027-06-21", "pEnd": "2027-06-30", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "최종준공계", "isLeaf": true}, {"id": "2", "level": 1, "system": "QMS", "name": "QMS 품질설비연계 구축", "weight": 50.0, "reqId": "REQ-QMS-01", "pStart": "2027-01-01", "pEnd": "2027-06-30", "aStart": "2027-01-01", "aEnd": "", "pProg": 50, "aProg": 52, "output": "QMS 총괄구축물", "isLeaf": false}, {"id": "2.1", "level": 2, "system": "QMS", "name": "분석단계", "weight": 7.5, "reqId": "REQ-QMS-01", "pStart": "2027-01-01", "pEnd": "2027-02-26", "aStart": "2027-01-01", "aEnd": "2027-02-26", "pProg": 100, "aProg": 100, "output": "품질요구명세서", "isLeaf": false}, {"id": "2.1.1", "level": 3, "system": "QMS", "name": "품질 검사 규격 및 설비 센서 분석", "weight": 7.5, "reqId": "REQ-QMS-01", "pStart": "2027-01-01", "pEnd": "2027-02-26", "aStart": "2027-01-01", "aEnd": "2027-02-26", "pProg": 100, "aProg": 100, "output": "품질설비분석서", "isLeaf": false}, {"id": "2.1.1.1", "level": 4, "system": "QMS", "name": "공정 검사 항목 및 불량 판정 기준 분석", "weight": 3.75, "reqId": "REQ-QMS-01", "pStart": "2027-01-01", "pEnd": "2027-01-29", "aStart": "2027-01-01", "aEnd": "2027-01-29", "pProg": 100, "aProg": 100, "output": "검사기준분석서", "isLeaf": true}, {"id": "2.1.1.2", "level": 4, "system": "QMS", "name": "설비 상태 센서 데이터 연계 요건 확정", "weight": 3.75, "reqId": "REQ-QMS-02", "pStart": "2027-02-01", "pEnd": "2027-02-26", "aStart": "2027-02-01", "aEnd": "2027-02-26", "pProg": 100, "aProg": 100, "output": "센서연계정의서", "isLeaf": true}, {"id": "2.2", "level": 2, "system": "QMS", "name": "설계단계", "weight": 12.5, "reqId": "REQ-QMS-01", "pStart": "2027-03-01", "pEnd": "2027-03-31", "aStart": "2027-03-01", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "품질화면/DB설계서", "isLeaf": false}, {"id": "2.2.1", "level": 3, "system": "QMS", "name": "품질 판정 엔진 및 설비 모니터링 설계", "weight": 12.5, "reqId": "REQ-QMS-01", "pStart": "2027-03-01", "pEnd": "2027-03-31", "aStart": "2027-03-01", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "판정엔진설계서", "isLeaf": false}, {"id": "2.2.1.1", "level": 4, "system": "QMS", "name": "실시간 SPC 품질 통계 관리 화면 설계", "weight": 6.25, "reqId": "REQ-QMS-01", "pStart": "2027-03-01", "pEnd": "2027-03-19", "aStart": "2027-03-01", "aEnd": "2027-03-19", "pProg": 100, "aProg": 100, "output": "SPC화면설계서", "isLeaf": true}, {"id": "2.2.1.2", "level": 4, "system": "QMS", "name": "설비 이상 감지 및 알람 규칙 DB 설계", "weight": 6.25, "reqId": "REQ-QMS-02", "pStart": "2027-03-15", "pEnd": "2027-03-31", "aStart": "2027-03-15", "aEnd": "2027-03-31", "pProg": 100, "aProg": 100, "output": "알람규칙ERD", "isLeaf": true}, {"id": "2.3", "level": 2, "system": "QMS", "name": "개발단계", "weight": 17.5, "reqId": "REQ-QMS-01", "pStart": "2027-04-01", "pEnd": "2027-05-14", "aStart": "2027-04-01", "aEnd": "", "pProg": 15, "aProg": 20, "output": "품질모듈소스코드", "isLeaf": false}, {"id": "2.3.1", "level": 3, "system": "QMS", "name": "검사 데이터 수집 및 알람 엔진 개발", "weight": 17.5, "reqId": "REQ-QMS-01", "pStart": "2027-04-01", "pEnd": "2027-05-14", "aStart": "2027-04-01", "aEnd": "", "pProg": 15, "aProg": 20, "output": "수집엔진소스", "isLeaf": false}, {"id": "2.3.1.1", "level": 4, "system": "QMS", "name": "검사기 자동 인터페이스 수집 모듈 개발", "weight": 9.0, "reqId": "REQ-QMS-01", "pStart": "2027-04-01", "pEnd": "2027-04-30", "aStart": "2027-04-01", "aEnd": "", "pProg": 25, "aProg": 30, "output": "검사기인터페이스소스", "isLeaf": true}, {"id": "2.3.1.2", "level": 4, "system": "QMS", "name": "임계치 초과 시 SMS/알람 발송 로직 개발", "weight": 8.5, "reqId": "REQ-QMS-03", "pStart": "2027-04-08", "pEnd": "2027-05-14", "aStart": "2027-04-08", "aEnd": "", "pProg": 10, "aProg": 10, "output": "알람발송로직소스", "isLeaf": true}, {"id": "2.4", "level": 2, "system": "QMS", "name": "테스트단계", "weight": 7.5, "reqId": "REQ-QMS-01", "pStart": "2027-05-17", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "품질연동성적서", "isLeaf": false}, {"id": "2.4.1", "level": 3, "system": "QMS", "name": "품질/설비 연동 종합 테스트", "weight": 7.5, "reqId": "REQ-QMS-02", "pStart": "2027-05-17", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "종합시험성적서", "isLeaf": false}, {"id": "2.4.1.1", "level": 4, "system": "QMS", "name": "불량 로트 자동 격리 시나리오 검증", "weight": 4.0, "reqId": "REQ-QMS-01", "pStart": "2027-05-17", "pEnd": "2027-05-31", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "로트격리검증서", "isLeaf": true}, {"id": "2.4.1.2", "level": 4, "system": "QMS", "name": "설비 가동/비가동 신호 연동 정확도 테스트", "weight": 3.5, "reqId": "REQ-QMS-02", "pStart": "2027-06-01", "pEnd": "2027-06-18", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "정확도시험서", "isLeaf": true}, {"id": "2.5", "level": 2, "system": "QMS", "name": "이행단계", "weight": 5.0, "reqId": "REQ-QMS-01", "pStart": "2027-06-21", "pEnd": "2027-06-30", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "운영인계보고서", "isLeaf": false}, {"id": "2.5.1", "level": 3, "system": "QMS", "name": "현장 적용 및 운영 안정화", "weight": 5.0, "reqId": "REQ-QMS-03", "pStart": "2027-06-21", "pEnd": "2027-06-30", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "품질준공계", "isLeaf": false}, {"id": "2.5.1.1", "level": 4, "system": "QMS", "name": "품질/설비 담당자 실무 교육 및 매뉴얼 인계", "weight": 2.5, "reqId": "REQ-QMS-03", "pStart": "2027-06-21", "pEnd": "2027-06-25", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "교육결과보고서", "isLeaf": true}, {"id": "2.5.1.2", "level": 4, "system": "QMS", "name": "준공 승인 및 시스템 운영 이관", "weight": 2.5, "reqId": "REQ-QMS-01", "pStart": "2027-06-21", "pEnd": "2027-06-30", "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "output": "최종준공계", "isLeaf": true}], "deliverablesData": [{"id": 1, "round": "1회차", "system": "MES", "phase": "분석설계단계", "name": "MES 요구사항정의서 및 ERD 설계서", "pDate": "2027-03-26", "aDate": "2027-03-26", "status": "보완완료", "manager": "김제조 책임", "remarks": "1차 분석설계 승인 완료"}, {"id": 2, "round": "1회차", "system": "MES", "phase": "분석설계단계", "name": "작업자 키오스크 화면 UI 설계서", "pDate": "2027-03-26", "aDate": "2027-03-26", "status": "보완완료", "manager": "김제조 책임", "remarks": "1차 UI설계 승인 완료"}, {"id": 3, "round": "1회차", "system": "QMS", "phase": "분석설계단계", "name": "QMS 품질검사 규격서 및 SPC 설계서", "pDate": "2027-03-26", "aDate": "2027-03-26", "status": "보완완료", "manager": "박품질 수석", "remarks": "1차 품질설계 승인 완료"}, {"id": 4, "round": "1회차", "system": "QMS", "phase": "분석설계단계", "name": "설비 연계 인터페이스 정의서", "pDate": "2027-03-26", "aDate": "2027-03-26", "status": "보완완료", "manager": "박품질 수석", "remarks": "1차 연계설계 승인 완료"}, {"id": 5, "round": "2회차", "system": "MES", "phase": "구현테스트단계", "name": "MES 단위 및 통합테스트 결과서", "pDate": "2027-05-31", "aDate": "", "status": "작성중", "manager": "김제조 책임", "remarks": "2단계 통합테스트 준비 중"}, {"id": 6, "round": "2회차", "system": "MES", "phase": "구현테스트단계", "name": "키오스크 현장 시연 결과보고서", "pDate": "2027-05-31", "aDate": "", "status": "작성전", "manager": "김제조 책임", "remarks": "2단계 현장검증 대상"}, {"id": 7, "round": "2회차", "system": "QMS", "phase": "구현테스트단계", "name": "QMS SPC 분석 엔진 시험성적서", "pDate": "2027-05-31", "aDate": "", "status": "작성중", "manager": "박품질 수석", "remarks": "2단계 품질검증 대상"}, {"id": 8, "round": "2회차", "system": "QMS", "phase": "구현테스트단계", "name": "설비 알람 연동 시험성적서", "pDate": "2027-05-31", "aDate": "", "status": "작성전", "manager": "박품질 수석", "remarks": "2단계 설비연동 대상"}], "reqMasterData": [{"id": "REQ-MES-01", "system": "MES", "name": "공정별 작업지시 실시간 수신 및 로트(Lot) 추적", "type": "기능", "priority": "상", "accept": "수용", "status": "진행"}, {"id": "REQ-MES-02", "system": "MES", "name": "상위 ERP 생산계획 및 자재 인터페이스 연동", "type": "인터페이스", "priority": "상", "accept": "수용", "status": "진행"}, {"id": "REQ-MES-03", "system": "MES", "name": "현장 작업자 터치스크린 실적 등록 및 바코드 출력", "type": "화면", "priority": "중", "accept": "수용", "status": "진행"}, {"id": "REQ-QMS-01", "system": "QMS", "name": "실시간 품질 검사 수치 수집 및 SPC 관리도 분석", "type": "기능", "priority": "상", "accept": "수용", "status": "진행"}, {"id": "REQ-QMS-02", "system": "QMS", "name": "설비 센서 텔레메트리 연계 및 가동 상태 모니터링", "type": "인터페이스", "priority": "상", "accept": "수용", "status": "진행"}, {"id": "REQ-QMS-03", "system": "QMS", "name": "검사 불량 및 설비 이상 시 관리자 SMS 경보 알림", "type": "기능", "priority": "중", "accept": "수용", "status": "진행"}], "vocData": [{"id": "VOC-01", "system": "MES", "priority": "긴급", "title": "현장 터치 키오스크 작업자 장갑 착용 시 터치 감도 개선", "requester": "생산1팀", "reqDate": "2027-01-15", "targetDate": "2027-02-15", "status": "완료", "action": "대형 버튼 및 감압식/정전식 듀얼 감도 UI 적용 완료"}, {"id": "VOC-02", "system": "QMS", "priority": "상", "title": "SPC 통계 차트 로딩 속도 지연(3초 초과) 개선 요청", "requester": "품질보증팀", "reqDate": "2027-02-10", "targetDate": "2027-03-10", "status": "완료", "action": "차트 렌더링 인메모리 캐싱 적용 완료"}, {"id": "VOC-03", "system": "MES", "priority": "상", "title": "ERP 긴급 작업지시 변경 시 단말기 팝업 실시간 알림", "requester": "생산관리팀", "reqDate": "2027-03-05", "targetDate": "2027-04-15", "status": "진행", "action": "WebSocket 기반 실시간 팝업 모듈 개발 중"}, {"id": "VOC-04", "system": "QMS", "priority": "중", "title": "설비 이상 시 메신저 연계 알림 채널 확대 요청", "requester": "설비보전팀", "reqDate": "2027-03-20", "targetDate": "2027-04-30", "status": "진행", "action": "사내 메신저 웹훅(Webhook) API 연동 진행 중"}, {"id": "VOC-05", "system": "MES", "priority": "중", "title": "바코드 스캔 완료 시 비프음(음성) 안내 피드백 추가", "requester": "물류관리팀", "reqDate": "2027-03-25", "targetDate": "2027-05-15", "status": "착수전", "action": "단말기 사운드 드라이버 연동 검토 대기"}]};


// =========================================================================
// [v1.0.6] 저장소 관리자: 백업/복원, 샘플 복원, 초기화 (저장은 SyncManager 로 일원화)
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

  openResetModal() {
    const modal = document.getElementById("storageResetModal");
    if (modal) modal.style.display = "flex";
  },
  closeResetModal() {
    const modal = document.getElementById("storageResetModal");
    if (modal) modal.style.display = "none";
  },
  resetToDefault() { this.openResetModal(); },

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

  clearNonJsonItems() {
    const chk = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
    const targets = [
      ["chkClearWbs", true, () => { wbsData = []; }, "WBS"],
      ["chkClearSubsystems", false, () => { subsystemsMeta = []; }, "서브시스템 기준정보"],
      ["chkClearDeliverables", true, () => { deliverablesData = []; }, "산출물"],
      ["chkClearReq", true, () => { reqMasterData = []; }, "REQ"],
      ["chkClearVoc", true, () => { vocData = []; }, "VOC"]
    ].filter(t => chk(t[0], t[1]));
    if (!targets.length) {
      showToast("지울 항목을 최소 1개 이상 선택해주세요.");
      return;
    }
    targets.forEach(t => t[2]());
    this.closeResetModal();
    this._afterBulkReplace(`선택 항목(${targets.map(t => t[3]).join(", ")})이 모두 삭제되었습니다.`);
  },

  // 데이터는 보존하고 화면 설정·임시 키만 정리 (비밀번호 정책은 유지)
  clearStorageExceptJsonKey() {
    const keep = new Set([LocalBackend.STORAGE_KEY, LocalBackend.REVS_KEY, DbConnector.CONFIG_STORAGE_KEY,
      AuthManager.STORAGE_POLICY_KEY, AuthManager.STORAGE_AUTOLOCK_KEY]);
    try {
      const rm = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // 프로젝트 데이터(모든 프로젝트)·프로젝트 목록은 보존
        if (k && !keep.has(k) && k.indexOf(LocalBackend.STORAGE_KEY) !== 0 && k.indexOf(LocalBackend.REVS_KEY) !== 0 && k !== ProjectContext.REG_KEY && k !== ProjectContext.KEY) rm.push(k);
      }
      rm.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    this.closeResetModal();
    this.updateUsageInfo();
    showToast("프로젝트 데이터는 보존하고, 화면 설정·임시 저장 항목을 정리했습니다.");
  },

  resetAllToSample() {
    this.closeResetModal();
    openConfirmDialog("⚠️ 주의: 브라우저 로컬 저장소에 저장된 모든 데이터가 삭제되고 초기 데이터(initial_data.json)로 복원됩니다. 계속하시겠습니까?", () => {
      try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
      location.reload();
    });
  },

  exportFullSystemBackup() {
    const now = new Date();
    const stamp = BackupHistoryManager._formatTimestamp(now).fileStamp;
    const fullPayload = Object.assign({
      schemaVersion: `AX_PMYS_${APP_VERSION.version}_FULL_BACKUP`,
      exportedAt: now.toISOString(),
      exportedBy: AuthManager.getCurrentUser().empNo,
      systemSettings: {
        theme: document.body.getAttribute("data-theme") || defaultTheme(),
        authPolicy: AuthManager.getAuthPolicy(),
        autoLockMinutes: AuthManager.getAutoLockMinutes(),
        dbConfig: DbConnector.config
      }
    }, DataRegistry.collect());
    const blob = new Blob([JSON.stringify(fullPayload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ExcelSync.stdName("전체백업", [], "json", String(stamp).replace(/[^0-9]/g, "").slice(0, 14));
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`[전체 백업 완료] 시스템 설정, 기준정보, 업무 데이터(공지·소통·회의·주간보고 포함)를 저장했습니다.`);
  },

  async importFullSystemBackup(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== "object") throw new Error("유효하지 않은 백업 JSON 파일입니다.");
      openConfirmDialog(`선택한 [${file.name}] 백업 파일로 모든 시스템 설정, 기준정보 및 업무 데이터를 복원하시겠습니까?`, () => {
        BackupHistoryManager.createBackupSnapshot("전체복원직전자동백업", "ALL", false);
        DataRegistry.apply(data);
        const ss = data.systemSettings;
        if (ss) {
          if (ss.theme) DataRegistry.set("theme", ss.theme);
          if (ss.authPolicy) AuthManager.setAuthPolicy(ss.authPolicy);
          if (ss.autoLockMinutes !== undefined) AuthManager.setAutoLockMinutes(ss.autoLockMinutes);
        }
        this._afterBulkReplace(`[전체 복원 완료] ${file.name} 백업본이 정상 복원되었습니다.`);
      });
    } catch (err) {
      showToast("통합 백업 복원 오류: " + err.message);
    }
  },

  _applySnapshot(snapshot, meetingFilter) {
    const c = DataRegistry.clone(snapshot);
    DataRegistry.apply(c, ["projectConfig", "subsystemsMeta", "standardDeliverablesMeta", "projectUsers",
      "wbsData", "deliverablesData", "reqMasterData", "vocData", "noticesData", "communicationsData"]);
    weeklyReportsData = Array.isArray(c.weeklyReportsData) ? c.weeklyReportsData : [];
    meetingsData = Array.isArray(c.meetingsData)
      ? c.meetingsData
      : MeetingManager.getDefaultMeetings().filter(meetingFilter || (() => true));
  },

  resetToSampleData() {
    openConfirmDialog(
      "🔄 [제조_시스템_샘플_과제_4레벨 복원]\n현재 데이터를 지우고 표준 샘플데이터('제조 시스템 샘플 과제' — SDLC_WATERFALL 4레벨, MES·QMS)로 복원하시겠습니까?",
      () => {
        BackupHistoryManager.createBackupSnapshot("제조샘플복원직전백업", "ALL", false);
        this._applySnapshot(WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT, m => m.system === "MES" || m.system === "QMS" || m.system === "ALL");
        this._afterBulkReplace("✅ [제조 샘플 복원 완료] '제조_시스템_샘플_과제_4레벨.xlsx' 데이터로 복원되었습니다.");
      }
    );
  },

  resetToRate2027Data() {
    openConfirmDialog(
      "🏭 [27년 가동률 시스템 개선 복원]\n'27년 가동률 시스템 개선' (3개 분야, 7개 서브시스템, 232개 WBS) 데이터로 복원하시겠습니까?",
      () => {
        BackupHistoryManager.createBackupSnapshot("가동률샘플복원직전백업", "ALL", false);
        this._applySnapshot(window.AX_INITIAL_DATA);
        this._afterBulkReplace("🏭 [27년 가동률 시스템 개선 복원 완료] 표준 7개 서브시스템 원본 데이터로 복원되었습니다.");
      }
    );
  },

  resetToFactoryBlank() {
    openConfirmDialog(
      "⚠️ [완전 초기화 확인]\n모든 업무 데이터(WBS·요구사항·VOC·산출물·공지·소통·회의·주간보고)와 프로젝트 기준정보를 초기화합니다. (사용자는 admin / pm 2개 계정, 비밀번호 1234로 초기화)",
      () => {
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
        RealtimeChatManager.messages = [];
        NoticeCommManager.activeChannel = "전체";
        DataRegistry.set("projectUsers", [
          { empNo: "admin", name: "시스템관리자", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" },
          { empNo: "pm", name: "프로젝트관리자", role: "PM", subsystem: "ALL", dept: "프로젝트 총괄 PM", pwdHash: "", lang: "ko",
            projectRoles: { [ProjectContext.current]: { role: "PM", subsystem: "ALL", dept: "프로젝트 총괄 PM" } } }
        ]);
        try {
          localStorage.removeItem(AuthManager.STORAGE_POLICY_KEY);
          localStorage.removeItem(AuthManager.STORAGE_AUTOLOCK_KEY);
        } catch (e) {}
        DataRegistry.set("theme", defaultTheme());
        this._afterBulkReplace("✅ [완전 초기화 완료] 모든 설정, 기준정보 및 업무 데이터가 초기 상태로 초기화되었습니다.");
      }
    );
  }
};

// updateAllSubsystemFilterDropdowns 호출 시 스마트병합 드롭다운도 함께 동기화
// =========================================================================
// [ver1.0.4] 서브시스템 정규화 및 중복 방지 함수
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
      if (existing.desc.endsWith("과업") && displayDesc && !displayDesc.endsWith("과업")) existing.desc = displayDesc;
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
// [ver1.0.4] MasterSyncEngine: 기준정보 및 시스템 설정 실시간 전체 탭 동기화 엔진
// =============================================================================

function populateConfigInputsFromState() {
  const inSys = document.getElementById("cfgSystemTitle");
  const inProj = document.getElementById("cfgProjectName");
  const inStart = document.getElementById("cfgProjectStartDate");
  const inEnd = document.getElementById("cfgProjectEndDate");
  const inWeek = document.getElementById("cfgWeekStartDay");
  const inReport = document.getElementById("reportDateInput");
  const inMaxR = document.getElementById("cfgMaxDeliverableRounds");

  if (inSys && projectConfig.systemTitle) inSys.value = projectConfig.systemTitle;
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
      // 화면 입력값 → 기준정보 반영은 사용자가 [⚡ 전체 동기화]를 누른 경우에만 수행
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

      // 4. Master tab & Header components
      renderReportDateLabels();
      if (typeof renderProjectTitles === "function") renderProjectTitles();
      if (typeof renderIdPrefixSettings === "function") renderIdPrefixSettings();
      if (typeof renderDomainChips === "function") renderDomainChips();
      if (typeof renderSubsystemsMetaTable === "function") renderSubsystemsMetaTable();
      if (typeof renderCustomSdlcCards === "function") renderCustomSdlcCards();
      if (typeof ReqPhaseManager !== "undefined" && typeof ReqPhaseManager.renderTable === "function") {
        ReqPhaseManager.renderTable();
      }
      if (typeof renderStandardDeliverablesMetaTable === "function") renderStandardDeliverablesMetaTable();
      if (typeof renderHolidays === "function") renderHolidays();
      if (typeof renderProjectUsersTable === "function") renderProjectUsersTable();

      // 5. Operations & Monitoring Tabs
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderPhaseMatrix === "function") renderPhaseMatrix();
      if (typeof renderGantt === "function") renderGantt();
      if (typeof renderWbsTable === "function") renderWbsTable();
      if (typeof renderReqMasterTable === "function") renderReqMasterTable();
      if (typeof renderVocTable === "function") renderVocTable();
      if (typeof renderDeliverablesTable === "function") renderDeliverablesTable();

      // 6. Smart Merge Center (Tab 7)
      if (typeof SmartMergeCenter !== "undefined") {
        if (typeof SmartMergeCenter.populateSourceSubsystems === "function") SmartMergeCenter.populateSourceSubsystems();
        if (typeof SmartMergeCenter.populateTargetSubsystems === "function") SmartMergeCenter.populateTargetSubsystems();
        if (typeof onDomainFilterChanged === "function") {
          onDomainFilterChanged('workDataDomainSelect', 'workDataSubsysSelect');
          onDomainFilterChanged('mergeSourceDomainSelect', 'mergeSourceSubsysSelect');
          onDomainFilterChanged('mergeTargetDomainSelect', 'mergeTargetSubsysSelect');
        }
      }

      // 7. Notices & Comm Plaza (Tab 8)
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.renderAll === "function") {
        NoticeCommManager.renderAll();
      }

      // 8. Weekly Report Manager (Tab 9)
      if (typeof WeeklyReportManager !== "undefined" && typeof WeeklyReportManager.init === "function") {
        WeeklyReportManager.init();
      }
      if (typeof RealtimeChatManager !== "undefined" && typeof RealtimeChatManager.renderChannels === "function") {
        RealtimeChatManager.renderChannels();
      }

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
        showToast("⚡ [실시간 적용 완료] 변경된 기준정보 및 시스템 설정이 모든 탭(WBS, 간트, 대시보드, 매트릭스, REQ, VOC, 산출물, 스마트병합, 소통광장)에 즉시 반영되었습니다.", "success");
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

    if (inSys && inSys.value.trim()) projectConfig.systemTitle = inSys.value.trim();
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

// [v1.0.6] 로컬 저장소 모드: 같은 PC의 다른 브라우저 탭에서 저장하면 미저장 변경이 없을 때 자동 반영
window.addEventListener("storage", function (e) {
  if (!SyncManager.isLocal() || (e.key !== LocalBackend._skey(ProjectContext.current) && e.key !== LocalBackend.STORAGE_KEY)) return;
  if (SyncManager.isDirty()) return;
  SyncManager.refresh(null, { silent: true, skipConfirm: true });
});


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


// =========================================================================
// [IOSTAR-PM ver1.0.4] 맞춤형 홈 화면 관리자 (HomeScreenManager)
// 🏛️ 2. 이그제큐티브 브리핑 룸 / 🚀 3. 하이브리드 스마트 포털 및 권한별 설정
// =========================================================================
var HomeScreenManager = {
  _sessionMode: null, // (이전 버전 호환)
  // [v2.4.0] 홈 스타일 3가지 — 역할별 기본값(시스템 설정) + 사용자가 홈 위쪽 단추로 고른 스타일(사용자별 기억)
  STYLES: ["EXECUTIVE", "PORTAL", "TODO"],
  STYLE_LABELS: { EXECUTIVE: "📊 브리핑", PORTAL: "🧰 워크벤치", TODO: "✅ 내 할 일" },
  STYLE_KEY: "IOSTAR_HOME_STYLE_",

  init() {
    this.ensureConfig();
    this.syncConfigUi();
  },

  ensureConfig() {
    if (typeof projectConfig === "undefined") return;
    if (!projectConfig.roleHomeSettings) {
      projectConfig.roleHomeSettings = {
        SYS_ADMIN: "EXECUTIVE",
        PM: "EXECUTIVE",
        MEMBER: "TODO"
      };
    }
    if (!projectConfig.exportSettings) {
      projectConfig.exportSettings = {
        exportTheme: "Official Navy",
        exportFontSize: 10,
        exportFont: "맑은 고딕",
        xlsxTheme: "Official Navy",
        xlsxFontSize: 10,
        docxTheme: "Official Navy",
        docxFontSize: 10,
        docxFont: "맑은 고딕"
      };
    } else {
      if (!projectConfig.exportSettings.exportTheme) {
        projectConfig.exportSettings.exportTheme = projectConfig.exportSettings.unifiedTheme || projectConfig.exportSettings.docxTheme || projectConfig.exportSettings.xlsxTheme || "Official Navy";
      }
      if (!projectConfig.exportSettings.exportFont) {
        projectConfig.exportSettings.exportFont = projectConfig.exportSettings.docxFont || projectConfig.exportSettings.xlsxFont || "맑은 고딕";
      }
      if (!projectConfig.exportSettings.exportFontSize) {
        projectConfig.exportSettings.exportFontSize = projectConfig.exportSettings.docxFontSize || projectConfig.exportSettings.xlsxFontSize || 10;
      }
    }
  },

  syncConfigUi() {
    this.ensureConfig();
    const cfg = projectConfig.roleHomeSettings || {};
    const exp = projectConfig.exportSettings || {};

    const selAdmin = document.getElementById("cfgRoleHomeSysAdmin");
    const selPM = document.getElementById("cfgRoleHomePM");
    const selMember = document.getElementById("cfgRoleHomeMember");

    if (selAdmin) selAdmin.value = cfg.SYS_ADMIN || "EXECUTIVE";
    if (selPM) selPM.value = cfg.PM || "EXECUTIVE";
    if (selMember) selMember.value = cfg.MEMBER || "TODO";

    const selUnifiedTheme = document.getElementById("cfgExportUnifiedTheme");
    const selUnifiedFont = document.getElementById("cfgExportUnifiedFont");
    const selUnifiedSize = document.getElementById("cfgExportUnifiedFontSize");

    const curTheme = exp.exportTheme || exp.unifiedTheme || exp.docxTheme || exp.xlsxTheme || "Official Navy";
    const curFont = exp.exportFont || exp.docxFont || exp.xlsxFont || "맑은 고딕";
    const curSize = String(exp.exportFontSize || exp.docxFontSize || exp.xlsxFontSize || 10);

    if (selUnifiedTheme) selUnifiedTheme.value = ExcelSync.normalizeExportTheme(curTheme);
    const fc = document.getElementById("cfgFileCode");
    if (fc) fc.value = projectConfig.fileCode || "";
    this.renderFileNameSample();
    if (selUnifiedFont) selUnifiedFont.value = curFont;
    if (selUnifiedSize) selUnifiedSize.value = curSize;
  },

  // 역할별 기본 홈 스타일
  roleDefault() {
    this.ensureConfig();
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : { role: "SYS_ADMIN" };
    const normRole = (typeof AuthManager !== "undefined" && typeof AuthManager.normalizeRole === "function")
      ? AuthManager.normalizeRole(curUser.role)
      : (curUser.role ? curUser.role.toUpperCase() : "MEMBER");

    const settings = projectConfig.roleHomeSettings || {};
    const ok = m => (this.STYLES.indexOf(m) !== -1 ? m : null);
    if (normRole === "SYS_ADMIN") return ok(settings.SYS_ADMIN) || "EXECUTIVE";
    if (normRole === "PM" || normRole === "LEAD") return ok(settings.PM) || "EXECUTIVE";
    return ok(settings.MEMBER) || "TODO";
  },

  _styleKey() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
    return this.STYLE_KEY + String((u && u.empNo) || "guest").toLowerCase();
  },
  userStyle() {
    try { const v = localStorage.getItem(this._styleKey()); return this.STYLES.indexOf(v) !== -1 ? v : null; } catch (e) { return null; }
  },
  getEffectiveMode() {
    return this.userStyle() || this.roleDefault();
  },

  getCurrentMode() {
    return this.getEffectiveMode();
  },

  // 사용자가 홈 위쪽 단추로 홈 스타일을 고름 (사용자별 기억, 역할 기본값과 같으면 기억 지움)
  setStyle(mode) {
    if (this.STYLES.indexOf(mode) === -1) return;
    try {
      if (mode === this.roleDefault()) localStorage.removeItem(this._styleKey());
      else localStorage.setItem(this._styleKey(), mode);
    } catch (e) {}
    this.render();
  },

  setSessionMode(mode) { this.setStyle(mode); },

  openSettings() {
    if (typeof AuthManager !== "undefined" && AuthManager.TAB_POLICY["tab-config"] && !AuthManager.canAccessTab(AuthManager.getCurrentRole(), "tab-config")) {
      showToast("ℹ️ 홈 스타일은 위쪽 [브리핑 · 워크벤치 · 내 할 일] 단추로 바꿀 수 있습니다. 역할별 기본 홈은 시스템 관리자가 정합니다.");
      return;
    }
    switchTab("tab-config");
    setTimeout(() => {
      try { SubTabs.show("config", "screen"); } catch (e) {}
      const el = document.getElementById("cfgRoleHomeSysAdmin");
      const card = el && el.closest(".card");
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "start" }); card.classList.add("g-flash-card"); setTimeout(() => card.classList.remove("g-flash-card"), 1800); }
    }, 200);
  },

  applyRoleMode() {
    this._sessionMode = null; // Clear manual override when user changes
    this.render();
  },

  previewMode(mode) {
    switchTab("tab-home");
    this.setStyle(mode);
  },

  onRoleHomeSettingChange(role, mode) {
    this.ensureConfig();
    projectConfig.roleHomeSettings[role] = mode;
    if (typeof persistChanges === "function") persistChanges();
    this.render();
    showToast(`🏠 [${role}] 역할의 기본 홈을 [${this.STYLE_LABELS[mode] || mode}](으)로 정했습니다.`);
  },

  onExportSettingChange(key, value) {
    this.ensureConfig();
    projectConfig.exportSettings[key] = value;
    if (key === "exportTheme" || key === "unifiedTheme") {
      projectConfig.exportSettings.exportTheme = value;
      projectConfig.exportSettings.unifiedTheme = value;
      projectConfig.exportSettings.xlsxTheme = value;
      projectConfig.exportSettings.docxTheme = value;
    } else if (key === "exportFont") {
      projectConfig.exportSettings.exportFont = value;
      projectConfig.exportSettings.docxFont = value;
      projectConfig.exportSettings.xlsxFont = value;
    } else if (key === "exportFontSize") {
      const num = parseInt(value, 10) || 10;
      projectConfig.exportSettings.exportFontSize = num;
      projectConfig.exportSettings.docxFontSize = num;
      projectConfig.exportSettings.xlsxFontSize = num;
    }
    if (typeof persistChanges === "function") persistChanges();
    showToast(`📊 공통 보고서 스타일이 '${value}'(으)로 일원화 설정되었습니다. 주간보고 워드, 회의록 워드, 공정표 XLSX 다운로드 시 즉시 반영됩니다.`);
  },

  // [v3.1.0] 주간보고 파일 이름 약칭
  onFileCodeChange(v) {
    projectConfig.fileCode = WeeklyExport.safe(v).slice(0, 20);
    const fc = document.getElementById("cfgFileCode");
    if (fc) fc.value = projectConfig.fileCode;
    this.renderFileNameSample();
    if (typeof persistChanges === "function") persistChanges();
  },
  renderFileNameSample() {
    const el = document.getElementById("cfgFileNameSample");
    if (!el || typeof WeeklyExport === "undefined") return;
    el.textContent = `예) ${WeeklyExport.fileCode()}_주간보고_2027W22_ALL_DOC-T_v2.docx`;
  },

  render() {
    this.ensureConfig();
    const mode = this.getCurrentMode();
    const roleDef = this.roleDefault();
    document.querySelectorAll(".home-style-btn").forEach(btn => {
      const on = btn.getAttribute("data-home-style") === mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const badge = document.getElementById("homeModeStatusBadge");
    if (badge) {
      badge.textContent = mode === roleDef ? "역할 기본 홈" : "내가 고른 홈";
      badge.title = `역할 기본: ${this.STYLE_LABELS[roleDef]}`;
    }
    // [v3.0.2] 홈 스타일 단추는 머리줄 맨 오른쪽에 고정 (안내 문구 길이가 바뀌어도 단추 위치가 움직이지 않게)
    const sw = document.querySelector("#tab-home .home-style-switch");
    if (sw && sw.parentElement) {
      if (badge && badge.parentElement === sw.parentElement && badge.nextElementSibling !== sw) sw.parentElement.insertBefore(badge, sw);
      if (sw.parentElement.lastElementChild !== sw) sw.parentElement.appendChild(sw);
    }

    if (mode === "EXECUTIVE" && typeof ExecReport !== "undefined") { try { ExecReport.render(); } catch (e) { console.warn(e); } }
    const boxes = { EXECUTIVE: "homeExecutiveContainer", PORTAL: "homePortalContainer", TODO: "homeTodoContainer" };
    Object.keys(boxes).forEach(k => {
      const el = document.getElementById(boxes[k]);
      if (el) el.style.display = k === mode ? "block" : "none";
    });
    if (mode === "EXECUTIVE") this.renderExecutive();
    else if (mode === "PORTAL") this.renderPortal();
    else if (typeof TodoCenter !== "undefined") TodoCenter.render();
    if (typeof TodoCenter !== "undefined") TodoCenter.updateCounts();
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("tab-home"));
  },

  renderExecutive() {
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";
    const repDay = (typeof WBSEngine !== "undefined" && WBSEngine.getDayOfWeekText) ? WBSEngine.getDayOfWeekText(repDate) : "화";

    // 1. Calculate overall metrics
    const rootItems = (wbsData || []).filter(d => d.level === 1);
    const totalWeight = rootItems.reduce((acc, d) => acc + (parseFloat(d.weight) || 1), 0) || 1;
    const totalPlan = Math.round(rootItems.reduce((acc, d) => acc + (d.pProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
    const totalActual = Math.round(rootItems.reduce((acc, d) => acc + (d.aProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
    const gap = totalActual - totalPlan;
    const achieveRate = totalPlan > 0 ? ((totalActual / totalPlan) * 100).toFixed(1) : (totalActual > 0 ? "100.0" : "0.0");
    const achieveNum = parseFloat(achieveRate);

    // Hero Banner DOM
    const heroTitle = document.getElementById("execHeroProjTitle");
    const heroMeta = document.getElementById("execHeroMeta");
    const heroAchieve = document.getElementById("execHeroAchieveRate");
    const heroGap = document.getElementById("execHeroGap");
    const heroPlan = document.getElementById("execHeroPlanRate");
    const heroActual = document.getElementById("execHeroActualRate");
    const heroBadge = document.getElementById("execHeroStatusBadge");

    if (heroTitle) heroTitle.textContent = projName;
    if (heroMeta) {
      let wLabel = "2027년 22주차";
      if (typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.findWeekForDate) {
        const wObj = WeeklyReportManager.findWeekForDate(repDate);
        if (wObj) wLabel = wObj.fullLabel;
      }
      heroMeta.innerHTML = `공정 기준일: <b>${repDate} (${repDay})</b> | 대상: <b>${wLabel}</b> | 총괄 PM: <b>${escapeHtml(((projectUsers || []).find(u => AuthManager.normalizeRole(u.role) === "PM") || {}).name || "-")}</b>`;
    }
    if (heroAchieve) heroAchieve.textContent = `${achieveRate}%`;
    if (heroGap) {
      heroGap.textContent = `공정 GAP: ${gap >= 0 ? "+" : ""}${gap}%p (${gap >= 0 ? "목표 초과" : "계획 대비 지연"})`;
      heroGap.style.color = gap >= 0 ? "#86efac" : (gap >= -5 ? "#fde047" : "#fca5a5");
    }
    if (heroPlan) heroPlan.textContent = `${totalPlan}%`;
    if (heroActual) heroActual.textContent = `${totalActual}%`;
    if (heroBadge) {
      if (achieveNum >= 90) {
        heroBadge.textContent = "🟢 정상 공정 궤도";
        heroBadge.style.background = "#22c55e";
      } else if (achieveNum >= 70) {
        heroBadge.textContent = "🟡 주의 및 경계 관리";
        heroBadge.style.background = "#eab308";
      } else {
        heroBadge.textContent = "🔴 공정 지연 리스크";
        heroBadge.style.background = "#ef4444";
      }
    }

    // 2. 5-KPI Strip
    // [v2.4.0] 지연 판정은 WBS·대시보드와 같은 기준 (최하위 Task, 계획 대비 실적 1%p 이상 부족)
    const delayedTasks = (wbsData || []).filter(t => t.isLeaf && WBSEngine.getTaskStatus(t, repDate).code === "delayed");
    const delayedCount = delayedTasks.length;

    const elKpiActual = document.getElementById("execKpiWbsActual");
    const elKpiSub = document.getElementById("execKpiWbsSub");
    if (elKpiActual) elKpiActual.textContent = `${totalActual}%`;
    if (elKpiSub) elKpiSub.textContent = `목표 계획: ${totalPlan}% (달성률 ${achieveRate}%)`;

    const elKpiDelay = document.getElementById("execKpiDelayed");
    const elKpiDelaySub = document.getElementById("execKpiDelayedSub");
    if (elKpiDelay) {
      elKpiDelay.textContent = `${delayedCount}건`;
      elKpiDelay.style.color = delayedCount === 0 ? "#15803d" : "#b91c1c";
    }
    if (elKpiDelaySub) {
      elKpiDelaySub.textContent = delayedCount === 0 ? "지연 리스크 정상 통제" : "중점 만회 대책 필요";
      elKpiDelaySub.style.color = delayedCount === 0 ? "#15803d" : "#b91c1c";
    }

    const validReqs = (reqMasterData || []).filter(r => r.status !== "삭제");
    const reqDone = validReqs.filter(r => r.status === "완료").length;
    const reqRate = validReqs.length > 0 ? Math.round((reqDone / validReqs.length) * 100) : 0;
    const elKpiReq = document.getElementById("execKpiReqRate");
    const elKpiReqSub = document.getElementById("execKpiReqSub");
    if (elKpiReq) elKpiReq.textContent = `${reqRate}%`;
    if (elKpiReqSub) elKpiReqSub.textContent = `완료 ${reqDone}건 / 전체 ${validReqs.length}건`;

    const activeRounds = (typeof getActiveDeliverableRounds === "function") ? getActiveDeliverableRounds() : ["1회차", "2회차"];
    const validDelivs = (deliverablesData || []).filter(d => activeRounds.includes(d.round));
    const delivDone = validDelivs.filter(d => d.status === "보완완료").length;
    const delivRate = validDelivs.length > 0 ? Math.round((delivDone / validDelivs.length) * 100) : 0;

    const validVocs = (vocData || []).filter(v => v.status !== "삭제");
    const vocWait = validVocs.filter(v => v.status === "착수전" || v.status === "대기" || v.status === "보류").length;
    const vocProg = validVocs.filter(v => v.status === "진행").length;
    const vocDone = validVocs.filter(v => v.status === "완료" || v.status === "제외").length;
    const vocRate = validVocs.length > 0 ? Math.round((vocDone / validVocs.length) * 100) : 0;

    const elKpiDelivVoc = document.getElementById("execKpiDelivVoc");
    const elKpiDelivVocSub = document.getElementById("execKpiDelivVocSub");
    if (elKpiDelivVoc) elKpiDelivVoc.textContent = `산출물 ${delivRate}% · VOC ${vocRate}%`;
    if (elKpiDelivVocSub) elKpiDelivVocSub.textContent = `산출물 ${delivDone}/${validDelivs.length}건 승인 | VOC ${vocDone}/${validVocs.length}건 조치`;

    // 3. Subsystem Traffic Light Tiles Grid
    const gridEl = document.getElementById("execSubsystemGrid");
    if (gridEl) {
      gridEl.innerHTML = "";
      const sysNames = (typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : [];
      sysNames.forEach(sys => {
        const root = (wbsData || []).find(d => d.system === sys && d.level === 1);
        const pProg = root ? root.pProg : 0;
        const aProg = root ? root.aProg : 0;
        const rate = pProg > 0 ? ((aProg / pProg) * 100).toFixed(1) : (aProg > 0 ? "100.0" : "0.0");
        const rateNum = parseFloat(rate);

        const meta = (subsystemsMeta || []).find(s => s.name === sys) || {};
        const pmName = meta.pm || "담당PM";
        const sysType = meta.type || "SDLC";
        const sysDelays = (wbsData || []).filter(t => t.system === sys && t.isLeaf && t.pProg > t.aProg && t.pEnd && t.pEnd < repDate).length;

        let lightIcon = "🟢";
        let lightText = "정상";
        let cardBorder = "#10b981";
        let rateColor = "#15803d";

        if (rateNum < 70) {
          lightIcon = "🔴";
          lightText = "경고";
          cardBorder = "#ef4444";
          rateColor = "#b91c1c";
        } else if (rateNum < 90) {
          lightIcon = "🟡";
          lightText = "주의";
          cardBorder = "#f59e0b";
          rateColor = "#b45309";
        }

        const tile = document.createElement("div");
        tile.className = "card";
        tile.style.margin = "0";
        tile.style.border = `1px solid ${cardBorder}`;
        tile.style.borderTop = `4px solid ${cardBorder}`;
        tile.style.padding = "12px 14px";
        tile.style.cursor = "pointer";
        tile.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
        tile.onmouseenter = () => { tile.style.transform = "translateY(-2px)"; tile.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)"; };
        tile.onmouseleave = () => { tile.style.transform = "none"; tile.style.boxShadow = "none"; };
        tile.onclick = () => HomeScreenManager.jumpToSubsystem(sys);
        tile.title = `${sys} (${pmName}) 상세 공정 WBS 화면으로 이동`;

        tile.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:800; font-size:var(--fs-base, 13px); color:#1e293b;">${escapeHtml(sys)}</div>
            <div style="font-size:var(--fs-xs, 11px); font-weight:700; display:flex; align-items:center; gap:3px;">
              <span>${lightIcon}</span>
              <span style="color:${rateColor};">${lightText}</span>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:#64748b;">달성률</span>
            <span style="font-size:calc(20px * var(--fs-scale, 1)); font-weight:900; color:${rateColor};">${rate}%</span>
          </div>
          <div style="width:100%; background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${Math.min(100, aProg)}%; background:${cardBorder}; height:100%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:var(--fs-xs, 11px); color:#475569; border-top:1px dashed #e2e8f0; padding-top:6px;">
            <span>계획 <b>${pProg}%</b> / 실적 <b>${aProg}%</b></span>
            <span>${sysDelays > 0 ? `<b style="color:#ef4444;">지연 ${sysDelays}</b>` : '<span style="color:#10b981;">지연 0</span>'}</span>
          </div>
          <div style="font-size:var(--fs-2xs, 10px); color:#94a3b8; margin-top:4px; display:flex; justify-content:space-between;">
            <span>PM: ${escapeHtml(pmName)}</span>
            <span class="badge" style="font-size:calc(9px * var(--fs-scale, 1)); padding:1px 4px;">${sysType}</span>
          </div>
        `;
        gridEl.appendChild(tile);
      });
    }

    // 4. Domain Portfolio Table
    const domTbody = document.getElementById("execDomainPortfolioBody");
    if (domTbody) {
      domTbody.innerHTML = "";
      const domains = (typeof projectConfig !== "undefined" && projectConfig.domains) ? projectConfig.domains : ["관리공통", "개선공정", "신규공정"];
      domains.forEach(dName => {
        const dSubs = (subsystemsMeta || []).filter(s => s.domain === dName).map(s => s.name);
        const dTasks = (wbsData || []).filter(t => dSubs.includes(t.system) && t.isLeaf);
        const dRoots = (wbsData || []).filter(t => dSubs.includes(t.system) && t.level === 1);
        const dWeight = dRoots.reduce((acc, t) => acc + (parseFloat(t.weight) || 1), 0);
        const dPlan = dWeight > 0 ? Math.round(dRoots.reduce((acc, t) => acc + (t.pProg * (parseFloat(t.weight) || 1)), 0) / dWeight) : 0;
        const dActual = dWeight > 0 ? Math.round(dRoots.reduce((acc, t) => acc + (t.aProg * (parseFloat(t.weight) || 1)), 0) / dWeight) : 0;
        const dRate = dPlan > 0 ? Math.round((dActual / dPlan) * 100) : (dActual > 0 ? 100 : 0);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${escapeHtml(dName)}</strong></td>
          <td>${dTasks.length}개</td>
          <td>${dWeight}%</td>
          <td>${dPlan}%</td>
          <td><strong>${dActual}%</strong></td>
          <td style="font-weight:700; color:${dRate >= 90 ? "#15803d" : (dRate >= 70 ? "#b45309" : "#b91c1c")};">${dRate}%</td>
          <td><span class="status-tag ${dRate >= 90 ? "tag-completed" : (dRate >= 70 ? "tag-progress" : "tag-delayed")}">${dRate >= 90 ? "정상" : (dRate >= 70 ? "주의" : "지연")}</span></td>
        `;
        domTbody.appendChild(tr);
      });
    }
  },

  jumpToSubsystem(sysName) {
    const sel = document.getElementById("wbsSubsystemFilter");
    if (sel) {
      sel.value = sysName;
      if (typeof onDomainFilterChanged === "function") {
        onDomainFilterChanged("wbsDomainFilter", "wbsSubsystemFilter");
      }
    }
    switchTab("tab-wbs");
    showToast(`🏢 [${sysName}] 서브시스템 WBS 공정 화면으로 이동했습니다.`);
  },

  renderPortal() {
    this.renderPortalFilterOptions();
    this.renderPortalTasks();
    this.renderPortalSummaryCards();
    this.renderPortalNotices();
    this.renderPortalChat();
  },

  renderPortalFilterOptions() {
    const sel = document.getElementById("portalTaskFilterSubsystem");
    if (!sel) return;
    const curVal = sel.value || "ALL";
    const sysNames = (typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : [];
    sel.innerHTML = `<option value="ALL">전체 서브시스템</option>` + sysNames.map(s => `<option value="${s}" ${s === curVal ? "selected" : ""}>${s} 서브시스템</option>`).join("");
  },

  renderPortalTasks() {
    const tbody = document.getElementById("portalTasksTableBody");
    const badge = document.getElementById("portalTaskCountBadge");
    if (!tbody) return;
    tbody.innerHTML = "";

    const sel = document.getElementById("portalTaskFilterSubsystem");
    const filterSys = sel ? sel.value : "ALL";
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";

    let uncompleted = (wbsData || []).filter(t => t.isLeaf && (t.aProg < 100 || t.status !== "완료"));
    if (filterSys !== "ALL") {
      uncompleted = uncompleted.filter(t => t.system === filterSys);
    }

    if (badge) badge.textContent = `${uncompleted.length}건 진행중`;

    if (uncompleted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted); font-size:var(--fs-sm, 12px);">🎉 모든 과업이 100% 완료되었거나 필터 조건에 해당하는 미완료 Task이 없습니다.</td></tr>`;
      return;
    }

    uncompleted.slice(0, 15).forEach(t => {
      const st = WBSEngine.getTaskStatus(t, repDate);
      const stTag = `<span class="status-tag ${st.cssClass}">${st.label}</span>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(t.system)}</span></td>
        <td><strong>${escapeHtml(t.id)}</strong></td>
        <td style="text-align:left; font-weight:600; color:#1e293b;">${escapeHtml(t.name)}</td>
        <td style="font-size:var(--fs-xs, 11px); color:#64748b;">${escapeHtml(t.pStart || "-")} ~ ${escapeHtml(t.pEnd || "-")}</td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="flex:1; background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden;">
              <div style="width:${t.aProg || 0}%; background:#2563eb; height:100%;"></div>
            </div>
            <span style="font-size:var(--fs-xs, 11px); font-weight:700; color:#2563eb; width:30px; text-align:right;">${t.aProg || 0}%</span>
          </div>
        </td>
        <td>${stTag}</td>
        <td style="text-align:center;">
          <button class="btn btn-success btn-xs" data-click="HomeScreenManager.markTaskComplete" data-click-args="${UiEvents.args(String(t.id))}" style="padding:2px 8px; font-weight:700; font-size:var(--fs-2xs, 10px);" title="이 과업의 실적을 즉시 100% 완료 상태로 반영">
            ✓ 100% 완료
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  markTaskComplete(taskId) {
    const task = (wbsData || []).find(t => t.id === taskId);
    if (!task) return;
    task.aProg = 100;
    task.status = "완료";
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    if (!task.aEnd) task.aEnd = repDate;

    if (typeof WBSEngine !== "undefined" && typeof WBSEngine.rollup === "function") {
      WBSEngine.rollup(wbsData);
    }

    this.render();
    if (typeof renderWbsTable === "function") renderWbsTable();
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof renderPhaseMatrix === "function") renderPhaseMatrix();
    if (typeof StorageManager !== "undefined") StorageManager.saveAll(false);
    showToast(`✅ [과업 완료] WBS [${task.id}] '${task.name}' 과업이 100% 완료 처리되었습니다.`);
  },

  renderPortalSummaryCards() {
    const sel = document.getElementById("portalTaskFilterSubsystem");
    const filterSys = sel ? sel.value : "ALL";

    // REQ
    let reqs = (reqMasterData || []).filter(r => r.status !== "삭제");
    if (filterSys !== "ALL") reqs = reqs.filter(r => r.system === filterSys);
    const reqDone = reqs.filter(r => r.status === "완료").length;
    const reqRate = reqs.length > 0 ? Math.round((reqDone / reqs.length) * 100) : 0;
    const elRVal = document.getElementById("portalReqStatValue");
    const elRSub = document.getElementById("portalReqStatSub");
    if (elRVal) elRVal.textContent = `${reqDone}/${reqs.length}건`;
    if (elRSub) elRSub.textContent = `완료율 ${reqRate}%`;

    // Deliv
    const activeRounds = (typeof getActiveDeliverableRounds === "function") ? getActiveDeliverableRounds() : ["1회차", "2회차"];
    let delivs = (deliverablesData || []).filter(d => activeRounds.includes(d.round));
    if (filterSys !== "ALL") delivs = delivs.filter(d => d.system === filterSys);
    const delivDone = delivs.filter(d => d.status === "보완완료").length;
    const delivRate = delivs.length > 0 ? Math.round((delivDone / delivs.length) * 100) : 0;
    const elDVal = document.getElementById("portalDelivStatValue");
    const elDSub = document.getElementById("portalDelivStatSub");
    if (elDVal) elDVal.textContent = `${delivDone}/${delivs.length}건`;
    if (elDSub) elDSub.textContent = `승인율 ${delivRate}%`;

    // VOC
    let vocs = (vocData || []).filter(v => v.status !== "삭제");
    if (filterSys !== "ALL") vocs = vocs.filter(v => v.system === filterSys);
    const vocDone = vocs.filter(v => v.status === "완료" || v.status === "제외").length;
    const vocRate = vocs.length > 0 ? Math.round((vocDone / vocs.length) * 100) : 0;
    const elVVal = document.getElementById("portalVocStatValue");
    const elVSub = document.getElementById("portalVocStatSub");
    if (elVVal) elVVal.textContent = `${vocDone}/${vocs.length}건`;
    if (elVSub) elVSub.textContent = `조치율 ${vocRate}%`;
  },

  renderPortalNotices() {
    const listEl = document.getElementById("portalNoticesList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const notices = (typeof noticesData !== "undefined" && Array.isArray(noticesData))
      ? noticesData
      : ((typeof projectNoticesData !== "undefined" && Array.isArray(projectNoticesData)) ? projectNoticesData : []);

    if (notices.length === 0) {
      listEl.innerHTML = `<div style="font-size:var(--fs-xs, 11px); color:#64748b; padding:12px; text-align:center;">등록된 공지사항이 없습니다. 상단 [공지 전체보기] 버튼을 눌러 등록하세요.</div>`;
      return;
    }
    notices.slice(0, 4).forEach(n => {
      const item = document.createElement("div");
      item.style.padding = "7px 10px";
      item.style.borderLeft = n.priority === "긴급" ? "3px solid #ef4444" : (n.priority === "중요" ? "3px solid #f59e0b" : "3px solid #3b82f6");
      item.style.background = "#f8fafc";
      item.style.borderRadius = "4px";
      item.style.cursor = "pointer";
      item.style.transition = "background 0.15s ease, transform 0.15s ease";
      item.onmouseenter = () => { item.style.background = "#eff6ff"; item.style.transform = "translateX(2px)"; };
      item.onmouseleave = () => { item.style.background = "#f8fafc"; item.style.transform = "none"; };
      item.title = "클릭 시 공지사항 탭으로 바로 이동합니다.";
      item.onclick = () => {
        switchTab("tab-notices");
        if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.switchSubTab === "function") {
          NoticeCommManager.switchSubTab("NOTICES");
        }
      };
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:calc(11.5px * var(--fs-scale, 1));">
          <strong style="color:var(--primary);">${n.isPinned ? "📌 " : ""}${escapeHtml(n.title)}</strong>
          <span style="font-size:var(--fs-2xs, 10px); color:#64748b;">${escapeHtml(n.date || "")}</span>
        </div>
        <div style="font-size:var(--fs-xs, 11px); color:#475569; margin-top:3px; line-height:1.4;">${escapeHtml((n.content || "").substring(0, 55))}${n.content && n.content.length > 55 ? "..." : ""}</div>
      `;
      listEl.appendChild(item);
    });
  },

  renderPortalChat() {
    const stream = document.getElementById("portalChatStream");
    if (!stream) return;
    stream.innerHTML = "";

    // 소통 피드 데이터(communicationsData) 우선 연동
    const comms = (typeof communicationsData !== "undefined" && Array.isArray(communicationsData) && communicationsData.length > 0)
      ? communicationsData
      : ((typeof teamChatMessages !== "undefined" && Array.isArray(teamChatMessages)) ? teamChatMessages : []);

    if (comms.length === 0) {
      stream.innerHTML = `<div style="color:#94a3b8; font-size:var(--fs-xs, 11px); text-align:center; padding:16px;">등록된 소통 피드 메시지가 없습니다. 하단 입력창에서 메시지를 작성해보세요.</div>`;
      return;
    }

    const recent = comms.slice(0, 6);
    recent.forEach(m => {
      const p = document.createElement("div");
      p.style.marginBottom = "6px";
      p.style.padding = "5px 8px";
      p.style.borderRadius = "4px";
      p.style.background = "#ffffff";
      p.style.border = "1px solid #e2e8f0";
      p.style.fontSize = "var(--fs-xs, 11px)";
      p.style.cursor = "pointer";
      p.style.transition = "background 0.15s ease";
      p.onmouseenter = () => { p.style.background = "#eff6ff"; };
      p.onmouseleave = () => { p.style.background = "#ffffff"; };
      p.title = "클릭 시 소통 피드 탭으로 바로 이동합니다.";
      p.onclick = () => {
        switchTab("tab-notices");
        if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.switchSubTab === "function") {
          NoticeCommManager.switchSubTab("FEED");
        }
      };

      const sender = m.author || m.sender || "팀원";
      const channel = m.channel ? `[#${m.channel}] ` : "";
      const text = m.content || m.text || "";
      const time = m.createdAt ? m.createdAt.substring(5, 16) : (m.time || "");

      p.innerHTML = `<span style="font-weight:700; color:#2563eb;">${escapeHtml(channel)}${escapeHtml(sender)}:</span> <span style="color:#334155;">${escapeHtml(text)}</span> <span style="color:#94a3b8; font-size:calc(9.5px * var(--fs-scale, 1)); margin-left:4px;">(${escapeHtml(time)})</span>`;
      stream.appendChild(p);
    });
    stream.scrollTop = stream.scrollHeight;
  },

  sendQuickMessage() {
    const input = document.getElementById("portalChatInput");
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();

    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : { name: "관리자", subsystem: "PMO", role: "SYS_ADMIN" };

    const nowStr = new Date().toISOString().substring(0, 16).replace("T", " ");

    const newPost = {
      id: Date.now(),
      channel: "전체",
      author: curUser.name || "담당자",
      subsystem: curUser.subsystem || "PMO",
      role: curUser.role || "MEMBER",
      content: text,
      createdAt: nowStr,
      likes: 0,
      replies: [],
      taskId: null,
      taskName: null
    };

    if (typeof communicationsData === "undefined") globalThis.communicationsData = [];
    communicationsData.unshift(newPost);

    if (typeof teamChatMessages === "undefined") globalThis.teamChatMessages = [];
    teamChatMessages.push({
      id: newPost.id,
      sender: newPost.author,
      text: text,
      time: new Date().toTimeString().substring(0, 5)
    });

    input.value = "";
    this.renderPortalChat();
    if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.renderFeed === "function") {
      NoticeCommManager.renderFeed();
    }
    if (typeof StorageManager !== "undefined" && typeof StorageManager.saveAll === "function") {
      StorageManager.saveAll(false);
    }
    showToast("💬 팀 소통 피드에 새 메시지가 등록되었습니다.");
  }
};

window.HomeScreenManager = HomeScreenManager;
