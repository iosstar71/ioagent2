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

// =============================================================================
// 프로젝트 설정 > Phase · 산출물: SDLC 유형을 한 화면에서 (창 없이)
//  ① 서브시스템마다 관리 유형(SDLC / 개선과제)과 SDLC 유형을 고름 → 고른 유형은 자동으로 이 프로젝트에 추가(최대 4개)
//  ② 쓰는 유형마다 단계 가중치 · 계획 일정을 표에서 바로 고침 (Admin 의 가중치는 처음 값) + 일정 막대
// =============================================================================
var SdlcBoard = {
  MAX: 4,
  canEdit() { return typeof ProcessLib === "undefined" || ProcessLib.canManageProject(); },
  // 고를 수 있는 유형 = Admin 의 SDLC 유형 + 이 프로젝트에만 남은 유형 (프로젝트 사본이 있으면 그것)
  types() {
    const proj = Array.isArray(projectConfig.customSdlcTypes) ? projectConfig.customSdlcTypes : [];
    const lib = typeof ProcessLib !== "undefined" ? ProcessLib.sdlcTypes() : proj;
    return lib.map(t => proj.find(x => x.code === t.code) || t)
      .concat(proj.filter(t => !lib.some(x => x.code === t.code)).map(t => Object.assign({}, t, { _projectOnly: true })));
  },
  active() { return getProjectActiveSdlcCodes().slice(); },
  _proj(code) {   // 이 프로젝트의 사본 (없으면 Admin 정의를 복사해 만듦)
    if (typeof ProcessLib !== "undefined" && !ProcessLib.projectSdlc(code)) ProcessLib.applySdlcToProject(code);
    return (projectConfig.customSdlcTypes || []).find(t => t.code === code) || null;
  },
  _activate(code) {
    if (!projectConfig.activeSdlcCodes) projectConfig.activeSdlcCodes = this.active();
    if (projectConfig.activeSdlcCodes.indexOf(code) !== -1) return true;
    if (projectConfig.activeSdlcCodes.length >= this.MAX) { showToast(`⚠️ 한 프로젝트에서 SDLC 유형은 ${this.MAX}개까지 씁니다. 쓰지 않는 유형을 [사용 안 함]으로 뺀 뒤 고르세요.`, "warning"); return false; }
    this._proj(code);
    projectConfig.activeSdlcCodes.push(code);
    return true;
  },
  _changed() { rebuildAll(true); persistChanges(); this.render(); },
  setType(idx, type) {
    const m = subsystemsMeta[idx]; if (!m || !this.canEdit()) return;
    m.type = type === "REQ" ? "REQ" : "SDLC";
    if (m.type === "SDLC" && !m.sdlcCode) m.sdlcCode = this.active()[0];
    this._changed();
  },
  assign(idx, code) {
    const m = subsystemsMeta[idx]; if (!m || !this.canEdit()) return;
    if (!this._activate(code)) return this.render();
    m.sdlcCode = code;
    this._changed();
  },
  add(code) { if (this.canEdit() && this._activate(code)) this._changed(); },
  setPhase(code, i, field, value) {
    if (!this.canEdit()) return;
    const t = this._proj(code); const ph = t && t.phases && t.phases[i];
    if (!ph) return;
    if (field === "weight") {
      const w = Math.max(0, Math.min(100, parseFloat(value) || 0));
      const others = t.phases.reduce((a, x, j) => a + (j === i ? 0 : (parseFloat(x.weight) || 0)), 0);
      if (others + w > 100) { showToast(`⚠️ 단계 가중치 합계가 100 을 넘을 수 없습니다 (다른 단계 합 ${others} → 이 단계는 ${100 - others} 까지).`, "warning"); return this.render(); }
      ph.weight = w;
    }
    else if (value) ph[field] = value; else delete ph[field];
    if (ph.pStart && ph.pEnd && ph.pStart > ph.pEnd) showToast(`⚠️ [${ph.name}] 계획 종료일이 시작일보다 빠릅니다.`, "warning");
    this._changed();
  },
  _bar(ph) {   // 프로젝트 기간 안에서 단계 일정의 위치
    const ps = projectConfig.projectStartDate, pe = projectConfig.projectEndDate;
    if (!ph.pStart || !ph.pEnd || !ps || !pe) return "";
    const t = d => new Date(d + "T00:00:00").getTime(), a = t(ps), z = t(pe);
    if (!(z > a)) return "";
    const l = Math.max(0, Math.min(100, (t(ph.pStart) - a) / (z - a) * 100)), r = Math.max(0, Math.min(100, (t(ph.pEnd) - a) / (z - a) * 100));
    return `<span class="sb-bar" style="left:${l.toFixed(1)}%; width:${Math.max(1, r - l).toFixed(1)}%"></span>`;
  },
  render() {
    const box = document.getElementById("customSdlcCardsContainer");
    if (!box) return;
    const types = this.types(), active = this.active(), ed = this.canEdit(), dis = ed ? "" : " disabled";
    const name = c => (types.find(t => t.code === c) || { name: c }).name;
    const users = c => subsystemsMeta.filter(m => m.type !== "REQ" && m.sdlcCode === c).map(m => m.name);
    // ① 서브시스템별 유형
    const rows = subsystemsMeta.map((m, i) => `<tr>
        <td>${escapeHtml(m.domain || "-")}</td><td><b>${escapeHtml(m.name)}</b></td>
        <td><select${dis} data-change="SdlcBoard.setType" data-change-args="${UiEvents.args(i, "$value")}">
          <option value="SDLC"${m.type !== "REQ" ? " selected" : ""}>SDLC형</option><option value="REQ"${m.type === "REQ" ? " selected" : ""}>개선과제(REQ)형</option></select></td>
        <td>${m.type === "REQ" ? `<span class="lk-hint">아래 [개선과제(REQ) 유형]을 따름</span>` : `<select${dis} data-change="SdlcBoard.assign" data-change-args="${UiEvents.args(i, "$value")}">
          ${types.map(t => `<option value="${escapeAttr(t.code)}"${m.sdlcCode === t.code ? " selected" : ""}>${escapeHtml(t.name)}${active.indexOf(t.code) === -1 ? " (추가)" : ""}</option>`).join("")}</select>`}</td>
      </tr>`).join("");
    // ② 쓰는 유형의 단계
    const cards = active.map(c => {
      const t = (projectConfig.customSdlcTypes || []).find(x => x.code === c) || types.find(x => x.code === c);
      if (!t) return "";
      const used = users(c), sum = Math.round((t.phases || []).reduce((a, ph) => a + (parseFloat(ph.weight) || 0), 0) * 10) / 10;
      const differs = ed && typeof ProcessLib !== "undefined" && ProcessLib.sdlcDiffers(c);
      return `<div class="sb-type">
        <div class="sb-type-head"><b>${escapeHtml(t.name)}</b>
          <span class="lk-hint">쓰는 서브시스템: ${used.length ? escapeHtml(used.join(", ")) : "없음"}</span>
          <span class="sb-sum ${sum === 100 ? "is-ok" : "is-bad"}">가중치 합계 ${sum}%</span>
          ${differs ? `<button class="btn btn-sm" data-btn="warn" data-click="ProcessLib.refreshSdlc" data-click-args="${UiEvents.args(c)}" title="Admin 에서 단계 구성이 바뀌었습니다">🔄 최신 반영</button>` : ""}
          ${ed ? `<button class="btn btn-sm" data-btn="neutral" data-click="toggleSdlcActiveState" data-click-args="${UiEvents.args(c)}">사용 안 함</button>` : ""}</div>
        <table class="m-table sb-table"><thead><tr><th class="sb-c-no">No</th><th>단계</th><th class="sb-c-w">가중치(%)</th><th class="sb-c-d">계획 시작</th><th class="sb-c-d">계획 종료</th><th>프로젝트 기간 안 위치</th></tr></thead><tbody>
        ${(t.phases || []).map((ph, i) => `<tr><td class="ai-c">${i + 1}</td><td><b>${escapeHtml(ph.name)}</b></td>
          <td><input type="number" class="phase-w" min="0" max="100" step="1"${dis} value="${escapeAttr(String(ph.weight))}" data-change="SdlcBoard.setPhase" data-change-args="${UiEvents.args(c, i, "weight", "$value")}"></td>
          <td><input type="date"${dis} value="${escapeAttr(ph.pStart || "")}" data-change="SdlcBoard.setPhase" data-change-args="${UiEvents.args(c, i, "pStart", "$value")}"></td>
          <td><input type="date"${dis} value="${escapeAttr(ph.pEnd || "")}" data-change="SdlcBoard.setPhase" data-change-args="${UiEvents.args(c, i, "pEnd", "$value")}"></td>
          <td><span class="sb-track">${this._bar(ph)}</span></td></tr>`).join("")}
        </tbody></table></div>`;
    }).join("");
    const spare = types.filter(t => active.indexOf(t.code) === -1);
    box.className = "sdlc-board";
    box.innerHTML = `
      <div class="sb-sec"><div class="sb-sec-title">① 서브시스템별 관리 유형 <span class="lk-hint">SDLC 유형을 고르면 이 프로젝트에 자동으로 추가됩니다 (최대 ${this.MAX}개)</span></div>
        <div class="table-container sb-assign"><table class="m-table"><thead><tr><th>도메인</th><th>서브시스템</th><th>관리 유형</th><th>SDLC 유형</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="rec-empty">서브시스템을 먼저 [프로젝트 기본정보]에서 등록하세요.</td></tr>`}</tbody></table></div></div>
      <div class="sb-sec"><div class="sb-sec-title">② 쓰는 유형의 단계 가중치 · 계획 일정 <span class="lk-hint">Admin 의 가중치는 처음 값 — 이 프로젝트에 맞게 고칩니다 (합계 100)</span></div>
        ${cards || `<div class="rec-empty">쓰는 SDLC 유형이 없습니다.</div>`}
        ${ed && spare.length ? `<div class="sb-spare"><span class="lk-hint">서브시스템 없이 미리 추가:</span> ${spare.map(t => `<button class="btn btn-xs" data-btn="add" data-click="SdlcBoard.add" data-click-args="${UiEvents.args(t.code)}">+ ${escapeHtml(t.name)}</button>`).join(" ")}</div>` : ""}</div>`;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(box);
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(box);
  }
};
window.SdlcBoard = SdlcBoard;
function renderCustomSdlcCards() { SdlcBoard.render(); }

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
      <td><input type="number" min="0" max="100" step="1" value="${p.weight}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "weight", "$num")}"></td>
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
