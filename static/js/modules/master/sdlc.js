// [Project Mgmt] 기준정보: SDLC 단계 구성
// -------------------------------------------------------------
// SDLC 임의 커스터마이징 및 다중 선택(최대 2개) 관리자
// -------------------------------------------------------------
// -------------------------------------------------------------
// SDLC 마스터 풀(최대 8개) 및 프로젝트 활성 SDLC(최대 4개) 관리자
// -------------------------------------------------------------
let _editingSdlcIndex = -1;
let _editingSdlcPhasesTemp = [];

function getProjectActiveSdlcCodes() {
  if (typeof projectConfig !== "undefined" && Array.isArray(projectConfig.activeSdlcCodes) && projectConfig.activeSdlcCodes.length > 0) {
    return projectConfig.activeSdlcCodes;
  }
  return ["SDLC_WATERFALL", "SDLC_AGILE", "SDLC_COTS", "SDLC_INFRA"];
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
  // 이 프로젝트의 SDLC 유형 = 서브시스템들이 고른 유형 (미리 고르지 않음). 서로 다른 유형은 최대 MAX 개
  active() { const u = this._usedCodes(); return u.length ? u : getProjectActiveSdlcCodes().slice(0, 1); },
  _proj(code) {   // 이 프로젝트의 사본 (없으면 Admin 정의를 복사해 만듦)
    if (typeof ProcessLib !== "undefined" && !ProcessLib.projectSdlc(code)) ProcessLib.applySdlcToProject(code);
    return (projectConfig.customSdlcTypes || []).find(t => t.code === code) || null;
  },
  _usedCodes(except) { return [...new Set(subsystemsMeta.filter(m => m !== except && m.type !== "REQ" && m.sdlcCode).map(m => m.sdlcCode))]; },
  // 서브시스템 m 이 code 를 쓰게 되면 서로 다른 유형이 MAX 개를 넘는지
  _fits(m, code) {
    const others = this._usedCodes(m);
    if (others.indexOf(code) !== -1 || others.length < this.MAX) return true;
    showToast(`⚠️ 한 프로젝트의 서브시스템들이 쓰는 SDLC 유형은 서로 다른 것 ${this.MAX}개까지입니다. 이미 쓰는 유형 중에서 고르거나, 다른 서브시스템의 유형을 먼저 바꾸세요.`, "warning");
    return false;
  },
  // 저장해 두는 사용 유형 목록(WBS 템플릿 · 보고서가 읽음) = 서브시스템들이 쓰는 유형. 바뀌면 조용히 기록
  syncActive(noSave) {
    if (typeof subsystemsMeta === "undefined" || typeof projectConfig === "undefined") return;
    const used = this._usedCodes();
    if (!used.length) return;
    used.forEach(c => { if (typeof ProcessLib === "undefined" || ProcessLib.findSdlc(c)) this._proj(c); });
    if (JSON.stringify(projectConfig.activeSdlcCodes || null) === JSON.stringify(used)) return;
    projectConfig.activeSdlcCodes = used;
    if (!noSave && typeof SyncManager !== "undefined" && SyncManager.saveSettingsQuiet) SyncManager.saveSettingsQuiet();
  },
  _changed() { this.syncActive(); rebuildAll(true); persistChanges(); this.render(); if (typeof renderSubsystemsMetaTable === "function") renderSubsystemsMetaTable(); },
  setType(idx, type) {
    const m = subsystemsMeta[idx]; if (!m || !this.canEdit()) return;
    if (type !== "REQ") {
      const code = m.sdlcCode || this.active()[0];
      if (!this._fits(m, code)) return renderSubsystemsMetaTable();
      m.sdlcCode = code; this._proj(code);
    }
    m.type = type === "REQ" ? "REQ" : "SDLC";
    this._changed();
  },
  assign(idx, code) {
    const m = subsystemsMeta[idx]; if (!m || !this.canEdit()) return;
    if (!this._fits(m, code)) { this.render(); return renderSubsystemsMetaTable(); }
    this._proj(code);
    m.sdlcCode = code;
    this._changed();
  },
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
  sumOf(phases) { return Math.round((phases || []).reduce((a, ph) => a + (parseFloat(ph.weight) || 0), 0) * 10) / 10; },
  // 단계 표 (SDLC · 개선과제 같은 모양): 단계 · 가중치 · 계획 시작 · 계획 종료 · 프로젝트 기간 안 위치
  //  compact = 오른쪽 패널용 (위치 막대를 단계 이름 아래에)
  phaseTable(phases, fn, code, compact) {
    const dis = this.canEdit() ? "" : " disabled";
    const a = (i, f, v) => code == null ? UiEvents.args(i, f, v) : UiEvents.args(code, i, f, v);
    const bar = ph => `<span class="sb-track">${this._bar(ph)}</span>`;
    return `<table class="m-table sb-table${compact ? " sb-compact" : ""}"><thead><tr><th class="sb-c-no">No</th><th>단계</th><th class="sb-c-w">가중치(%)</th><th class="sb-c-d">계획 시작</th><th class="sb-c-d">계획 종료</th><th class="sb-c-vs" title="이 Phase 기간에 접수된 VOC 의 단계 (비우면 Phase 이름으로 자동)">VOC 단계</th>${compact ? "" : "<th>프로젝트 기간 안 위치</th>"}</tr></thead><tbody>
      ${(phases || []).map((ph, i) => `<tr><td class="ai-c">${i + 1}</td><td><b>${escapeHtml(ph.name)}</b>${compact ? bar(ph) : ""}</td>
        <td><input type="number" class="phase-w" min="0" max="100" step="1"${dis} value="${escapeAttr(String(ph.weight))}" data-change="${fn}" data-change-args="${a(i, "weight", "$value")}"></td>
        <td><input type="date"${dis} value="${escapeAttr(ph.pStart || "")}" data-change="${fn}" data-change-args="${a(i, "pStart", "$value")}"></td>
        <td><input type="date"${dis} value="${escapeAttr(ph.pEnd || "")}" data-change="${fn}" data-change-args="${a(i, "pEnd", "$value")}"></td>
        <td>${this._vocStageSel(ph, dis, fn, a(i, "vocStage", "$value"))}</td>
        ${compact ? "" : `<td>${bar(ph)}</td>`}</tr>`).join("")}
      </tbody></table>`;
  },
  // VOC 단계 매핑 (빈 값 = Phase 이름으로 추정한 값을 씀 — Metrics.stageGuess)
  _vocStageSel(ph, dis, fn, args) {
    const guess = Metrics.stageGuess(Object.assign({}, ph, { vocStage: "" }));
    const cur = Metrics.VOC_STAGES.indexOf(ph.vocStage) !== -1 ? ph.vocStage : "";
    const tr = x => (typeof I18N !== "undefined" ? I18N.t(x) : x);
    return `<select class="sb-vs"${dis} data-change="${fn}" data-change-args="${args}">
      <option value="">${escapeHtml(tr("자동") + (guess ? ": " + tr(guess) : ""))}</option>
      ${Metrics.VOC_STAGES.map(v => `<option value="${escapeAttr(v)}"${v === cur ? " selected" : ""}>${escapeHtml(v)}</option>`).join("")}</select>`;
  },
  // ---- [공정 유형]: 서브시스템과 따로, 시스템 설정의 모든 유형(SDLC · 개선과제)의 가중치 · 계획 일정 ----
  //  (서브시스템이 고를 수 있는 SDLC 유형은 이 프로젝트의 사용 유형, 최대 MAX 개)
  view: null,   // "SDLC:<code>" | "REQ:<code>"
  _reqLib() { return typeof ProcessLib !== "undefined" ? ProcessLib.reqTypes() : Object.values(ReqPhaseManager.PRESETS); },
  _reqActive() { return projectConfig.activeReqPreset || "REQ_MFG_2027"; },
  phasesOf(kind, code) {
    if (kind === "REQ") {
      if (code === this._reqActive()) return ReqPhaseManager.getPhases();
      const c = (projectConfig.reqTypeCopies || {})[code];
      const t = this._reqLib().find(x => x.code === code);
      return c || (t ? t.phases : []);
    }
    const t = (projectConfig.customSdlcTypes || []).find(x => x.code === code) || this.types().find(x => x.code === code);
    return t ? t.phases || [] : [];
  },
  unplanned(phases) { return !phases || !phases.length || phases.some(ph => !ph.pStart || !ph.pEnd); },
  // 서브시스템 목록의 [⚠ 일정 미지정] 표시 (누르면 아래 [공정 유형]이 그 유형으로)
  warnHtml(kind, code) {
    if (!code || !this.unplanned(this.phasesOf(kind, code))) return "";
    return `<button type="button" class="ss-warn" data-click="SdlcBoard.show" data-click-args="${UiEvents.args(kind + ":" + code)}" title="계획 일정이 비어 있는 단계가 있습니다 — 눌러서 [공정 유형]에서 채우세요">⚠ 일정 미지정</button>`;
  },
  show(v) {
    this.view = v; this.render();
    const card = document.getElementById("ssProcCard");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
  // 쓰지 않는 개선과제 유형의 가중치 · 일정 (적용 중인 유형은 ReqPhaseManager.updatePhase)
  setReqPhase(code, i, field, value) {
    if (!this.canEdit()) return;
    if (code === this._reqActive()) return ReqPhaseManager.updatePhase(i, field, value);
    if (!projectConfig.reqTypeCopies || typeof projectConfig.reqTypeCopies !== "object") projectConfig.reqTypeCopies = {};
    let ph = projectConfig.reqTypeCopies[code];
    if (!ph) { const t = this._reqLib().find(x => x.code === code); if (!t) return; ph = projectConfig.reqTypeCopies[code] = JSON.parse(JSON.stringify(t.phases)); }
    const row = ph[i]; if (!row) return;
    if (field === "weight") {
      const w = Math.max(0, Math.min(100, parseFloat(value) || 0));
      const others = ph.reduce((a, x, j) => a + (j === i ? 0 : (parseFloat(x.weight) || 0)), 0);
      if (others + w > 100) { showToast(`⚠️ 단계 가중치 합계가 100 을 넘을 수 없습니다 (이 단계는 ${100 - others} 까지).`, "warning"); return this.render(); }
      row.weight = w;
    } else if (value) row[field] = value; else delete row[field];
    if (row.pStart && row.pEnd && row.pStart > row.pEnd) showToast(`⚠️ [${row.name}] 계획 종료일이 시작일보다 빠릅니다.`, "warning");
    this._changed();
  },
  _defaultView() {
    const m = subsystemsMeta[0];
    if (m && m.type === "REQ") return "REQ:" + this._reqActive();
    if (m && m.sdlcCode) return "SDLC:" + m.sdlcCode;
    return "SDLC:" + (this.active()[0] || "");
  },
  render() {
    const box = document.getElementById("customSdlcCardsContainer");
    if (!box) return;
    this.syncActive();
    const types = this.types(), act = this.active(), ed = this.canEdit(), dis = ed ? "" : " disabled";
    const reqs = this._reqLib(), reqAct = this._reqActive();
    if (!this.view || !/^(SDLC|REQ):./.test(this.view)) this.view = this._defaultView();
    let [kind, code] = [this.view.slice(0, this.view.indexOf(":")), this.view.slice(this.view.indexOf(":") + 1)];
    if (kind === "SDLC" && !types.some(t => t.code === code)) { kind = "SDLC"; code = (act[0] || (types[0] || {}).code || ""); this.view = "SDLC:" + code; }
    if (kind === "REQ" && !reqs.some(t => t.code === code)) { code = reqAct; this.view = "REQ:" + code; }
    const usersOf = c => subsystemsMeta.filter(m => m.type !== "REQ" && m.sdlcCode === c).map(m => m.name);
    const reqUsers = subsystemsMeta.filter(m => m.type === "REQ").map(m => m.name);
    const label = (k, t) => {
      const ph = this.phasesOf(k, t.code), st = [];
      if (k === "SDLC") { const u = usersOf(t.code); if (u.length) st.push("사용 중", `(${u.join(", ")})`); }
      else if (t.code === reqAct) { st.push("적용 중"); if (reqUsers.length) st.push(`(${reqUsers.join(", ")})`); }
      if (this.unplanned(ph)) st.push("일정 미지정");
      const tr = x => typeof I18N !== "undefined" ? I18N.t(x) : x;   // 선택 상자 글은 한 덩어리라 조각마다 번역
      return escapeHtml(tr(t.name)) + (st.length ? " — " + escapeHtml(st.map(tr).join(" · ")) : "");
    };
    const sel = `<select class="ss-proc-pick" data-change="SdlcBoard.show" data-change-args="${UiEvents.args("$value")}">
      <optgroup label="SDLC 유형">${types.map(t => `<option value="SDLC:${escapeAttr(t.code)}"${kind === "SDLC" && t.code === code ? " selected" : ""}>${label("SDLC", t)}</option>`).join("")}</optgroup>
      <optgroup label="개선과제 유형">${reqs.map(t => `<option value="REQ:${escapeAttr(t.code)}"${kind === "REQ" && t.code === code ? " selected" : ""}>${label("REQ", t)}</option>`).join("")}</optgroup></select>`;
    const phases = this.phasesOf(kind, code), sum = this.sumOf(phases);
    let note, extra = "";
    if (kind === "SDLC") {
      const u = usersOf(code);
      note = u.length ? `쓰는 서브시스템: <b>${escapeHtml(u.join(", "))}</b>` : "아직 쓰는 서브시스템이 없는 유형 — 일정을 미리 정해 둘 수 있습니다";
      if (ed && typeof ProcessLib !== "undefined" && ProcessLib.sdlcDiffers(code)) extra = `<button class="btn btn-sm" data-btn="warn" data-click="ProcessLib.refreshSdlc" data-click-args="${UiEvents.args(code)}" title="Admin 에서 단계 구성이 바뀌었습니다">🔄 최신 반영</button>`;
    } else if (code === reqAct) {
      note = `이 프로젝트에 적용 중인 개선과제 유형${reqUsers.length ? ` — 쓰는 서브시스템: <b>${escapeHtml(reqUsers.join(", "))}</b>` : ""}`;
      if (ed && typeof ProcessLib !== "undefined" && ProcessLib.reqDiffers()) extra = `<button class="btn btn-sm" data-btn="warn" data-click="ReqPhaseManager.refreshFromLib" title="Admin 에서 단계 구성이 바뀌었습니다">🔄 최신 반영</button>`;
    } else {
      note = "적용하지 않은 개선과제 유형 (개선과제형 서브시스템은 프로젝트에 적용한 유형 하나를 씁니다)";
      if (ed) extra = `<button class="btn btn-sm" data-btn="apply" data-click="ReqPhaseManager.applyPreset" data-click-args="${UiEvents.args(code)}">이 유형을 개선과제에 적용</button>`;
    }
    const used = this._usedCodes();
    const chips = used.map(c => `<span class="sb-chip">${escapeHtml((types.find(x => x.code === c) || { name: c }).name)} <b>${usersOf(c).length}</b></span>`).join("");
    box.className = "ss-proc";
    box.innerHTML = `<div class="ss-proc-head">${sel}
        <span class="sb-sum ${sum === 100 ? "is-ok" : "is-bad"}">가중치 합계 ${sum}%</span>${extra}</div>
      <div class="lk-hint"><span>${note}</span> · <span>단계 이름 · 산출물 · 키워드는 Admin 에서</span></div>
      ${phases.length ? this.phaseTable(phases, kind === "REQ" ? "SdlcBoard.setReqPhase" : "SdlcBoard.setPhase", code) : `<div class="rec-empty">단계가 없습니다.</div>`}
      <div class="sb-spare"><span class="lk-hint">서브시스템들이 쓰는 SDLC 유형 (서로 다른 유형 최대 ${this.MAX}개 · 숫자 = 쓰는 서브시스템):</span> ${chips || "-"}</div>`;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(box);
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(box);
  }
};
window.SdlcBoard = SdlcBoard;
function renderCustomSdlcCards() { SdlcBoard.render(); }


function closeCustomSdlcModal() {
  const modal = document.getElementById("customSdlcModal");
  if (modal) modal.style.display = "none";
  _editingSdlcMode = null;
}

function renderEditSdlcPhasesTable() {
  const tbody = document.getElementById("editSdlcPhasesBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const ro = _editingSdlcMode && _editingSdlcMode.target === "dates" ? " disabled" : "";  // 프로젝트에서는 계획 일정만
  _editingSdlcPhasesTemp.forEach((p, pIdx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="u-tc"><b>${pIdx + 1}</b></td>
      <td><input class="u-w100 u-bold" type="text"${ro} value="${escapeHtml(p.name)}" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "name", "$trim")}"></td>
      <td><input class="u-w100" type="number" min="0" max="100" step="1" value="${p.weight}" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "weight", "$num")}"></td>
      <td class="col-date"><input class="u-w100" type="date" value="${escapeHtml(p.pStart || "")}" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "pStart", "$value")}"></td>
      <td class="col-date"><input class="u-w100" type="date" value="${escapeHtml(p.pEnd || "")}" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "pEnd", "$value")}"></td>
      <td><input class="u-w100" type="text"${ro} value="${escapeHtml(p.output || "")}" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "output", "$trim")}"></td>
      <td><input class="u-w100 u-fs-xs" type="text"${ro} value="${escapeHtml((p.keywords || []).join(", "))}" placeholder="Task명 매칭 키워드" data-change="UiH.set" data-change-args="${UiEvents.args("_editingSdlcPhasesTemp", pIdx, "keywords", "$split")}"></td>
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
  // 시스템 설정의 공정 유형 편집 / 프로젝트 단계 일정 편집
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
