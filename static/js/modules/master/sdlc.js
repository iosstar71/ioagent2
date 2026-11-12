// [Project Mgmt] 기준정보: SDLC 단계 구성
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
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
    // [v3.9.0] 시스템 설정의 공정 유형 정의를 이 프로젝트에 복사 (계획 일정은 이 프로젝트에서 따로)
    if (typeof ProcessLib !== "undefined") ProcessLib.applySdlcToProject(sdlcCode);
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

  // [v3.9.0] 고를 수 있는 유형 = 시스템 설정의 공정 유형 라이브러리 (+ 이 프로젝트에만 남아 있는 이전 유형)
  const projList = Array.isArray(projectConfig.customSdlcTypes) ? projectConfig.customSdlcTypes : [];
  const libList = typeof ProcessLib !== "undefined" ? ProcessLib.sdlcTypes() : projList;
  const masterList = libList.map(t => projList.find(x => x.code === t.code) || t)
    .concat(projList.filter(t => !libList.some(x => x.code === t.code)).map(t => Object.assign({}, t, { _projectOnly: true })));
  const canEdit = typeof ProcessLib === "undefined" || ProcessLib.canManageProject();

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
      📋 시스템 공정 유형: <b>${masterList.length}개</b> | 이 프로젝트 활성화: <b>${activeCodes.length}/4개</b>
    </span>
    <span style="font-size:var(--fs-xs, 11px); color:#15803d;">
      (유형 추가 · 단계 수정은 [시스템 설정 &gt; 🔄 공정 유형] · 이 화면에서는 활성화와 단계별 계획 일정만)
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
    const phaseNames = (sdlc.phases || []).map((p, pIdx) => `${pIdx + 1}.${p.name}(${p.weight}%${p.pStart && p.pEnd ? ` · ${p.pStart.slice(5)}~${p.pEnd.slice(5)}` : ""})`).join(" ➔ ");

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge" style="background:${isActive ? "#059669" : "#64748b"}; color:#fff; font-size:var(--fs-2xs, 10px);">
            ${isActive ? "✅ 프로젝트 활성" : "사용 안 함"}
          </span>
          ${sdlc.isRecommended ? '<span class="badge" style="background:#0284c7; color:#fff; font-size:calc(9.5px * var(--fs-scale, 1));">⭐ 추천타입</span>' : ''}
          <strong style="font-size:var(--fs-base, 13px); color:var(--text-main);">${escapeHtml(sdlc.name)}</strong>
          <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">(코드: <code>${escapeHtml(sdlc.code)}</code>)</span>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
          ${sdlc._projectOnly ? '<span class="badge" style="background:#b45309; color:#fff; font-size:var(--fs-2xs, 10px);" title="시스템 설정의 공정 유형에는 없고 이 프로젝트에만 남아 있는 유형입니다">이 프로젝트 전용</span>' : ""}
          ${isActive && canEdit && typeof ProcessLib !== "undefined" && ProcessLib.sdlcDiffers(sdlc.code) ? `<button class="btn btn-warning btn-sm" data-click="ProcessLib.refreshSdlc" data-click-args="${UiEvents.args(String(sdlc.code))}" title="시스템 설정에서 단계 구성이 바뀌었습니다">🔄 최신 반영</button>` : ""}
          ${isActive && canEdit ? `<button class="btn btn-secondary btn-sm" data-click="ProcessLib.openDates" data-click-args="${UiEvents.args(String(sdlc.code))}">📅 단계 일정</button>` : ""}
          ${canEdit ? `<button class="btn btn-sm ${isActive ? 'btn-secondary' : 'btn-success'}" data-click="toggleSdlcActiveState" data-click-args="${UiEvents.args(String(sdlc.code))}">
            ${isActive ? '선택 해제' : '선택 활성화 (프로젝트 사용)'}
          </button>` : ""}
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
  _editingSdlcMode = null;
}

function renderEditSdlcPhasesTable() {
  const tbody = document.getElementById("editSdlcPhasesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const ro = _editingSdlcMode && _editingSdlcMode.target === "dates" ? " disabled" : "";  // [v3.9.0] 프로젝트에서는 계획 일정만
  _editingSdlcPhasesTemp.forEach((p, pIdx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center;"><b>${pIdx + 1}</b></td>
      <td><input type="text"${ro} value="${escapeHtml(p.name)}" style="width:100%;font-weight:bold;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "name", "$trim")}"></td>
      <td><input type="number"${ro} value="${p.weight}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "weight", "$num")}"></td>
      <td class="col-date"><input type="date" value="${escapeHtml(p.pStart || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "pStart", "$value")}"></td>
      <td class="col-date"><input type="date" value="${escapeHtml(p.pEnd || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "pEnd", "$value")}"></td>
      <td><input type="text"${ro} value="${escapeHtml(p.output || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "output", "$trim")}"></td>
      <td><input type="text"${ro} value="${escapeHtml((p.keywords || []).join(", "))}" style="width:100%; font-size:var(--fs-xs, 11px);" placeholder="Task명 매칭 키워드" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "keywords", "$split")}"></td>
      <td class="col-del"><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "renderEditSdlcPhasesTable")}">×</button></td>
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
  // [v3.9.0] 시스템 설정의 공정 유형 편집 / 프로젝트 단계 일정 편집
  if (_editingSdlcMode && typeof ProcessLib !== "undefined") return ProcessLib.saveModal(_editingSdlcMode, codeVal, nameVal, descVal);

  if (!codeVal || !nameVal) {
    showToast("SDLC 타입 코드와 명칭을 모두 입력해주세요.");
    return;
  }
  if (_editingSdlcPhasesTemp.length === 0) {
    showToast("최소 1개 이상의 단계를 등록해야 합니다.");
    return;
  }
  const badDate = _editingSdlcPhasesTemp.find(p => p.pStart && p.pEnd && p.pStart > p.pEnd);
  if (badDate) {
    showToast(`[${badDate.name}] 단계의 계획 종료일이 시작일보다 빠릅니다.`);
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
