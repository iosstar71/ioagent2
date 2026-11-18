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
  _usedCodes() { return [...new Set(subsystemsMeta.filter(m => m.type !== "REQ" && m.sdlcCode).map(m => m.sdlcCode))]; },
  // 사용 유형 칸이 차 있으면, 어느 서브시스템도 쓰지 않는 유형을 먼저 비움
  //  (예전 프로젝트는 쓰지 않는 기본 4종이 사용 유형으로 잡혀 있어 새 유형을 고를 수 없었음)
  _activate(code) {
    if (!Array.isArray(projectConfig.activeSdlcCodes) || !projectConfig.activeSdlcCodes.length) projectConfig.activeSdlcCodes = this.active();
    const list = projectConfig.activeSdlcCodes;
    if (list.indexOf(code) !== -1) { this._proj(code); return true; }
    if (list.length >= this.MAX) {
      const used = this._usedCodes();
      for (let i = list.length - 1; i >= 0 && list.length >= this.MAX; i--) if (used.indexOf(list[i]) === -1) list.splice(i, 1);
    }
    if (list.length >= this.MAX) { showToast(`⚠️ 한 프로젝트에서 SDLC 유형은 ${this.MAX}개까지 씁니다. 이미 서브시스템들이 ${this.MAX}개 유형을 쓰고 있어, 그중 하나로 고르거나 다른 서브시스템의 유형을 먼저 바꾸세요.`, "warning"); return false; }
    this._proj(code);
    list.push(code);
    return true;
  },
  // 서브시스템이 쓰는 유형은 항상 사용 유형에 들어 있게 (예전 자료 · 파일로 받은 자료 맞추기). 바뀌면 조용히 기록
  syncActive() {
    if (typeof subsystemsMeta === "undefined" || typeof projectConfig === "undefined") return;
    const before = JSON.stringify(projectConfig.activeSdlcCodes || null);
    const used = this._usedCodes(), cur = Array.isArray(projectConfig.activeSdlcCodes) && projectConfig.activeSdlcCodes.length ? projectConfig.activeSdlcCodes.slice() : this.active();
    const missing = used.filter(c => cur.indexOf(c) === -1);
    if (!missing.length && Array.isArray(projectConfig.activeSdlcCodes) && projectConfig.activeSdlcCodes.length) return;
    let next = used.concat(cur.filter(c => used.indexOf(c) === -1));
    if (next.length > this.MAX) next = next.slice(0, Math.max(this.MAX, used.length));
    next.forEach(c => { if (typeof ProcessLib === "undefined" || ProcessLib.findSdlc(c)) this._proj(c); });
    projectConfig.activeSdlcCodes = next;
    if (JSON.stringify(next) !== before && typeof SyncManager !== "undefined" && SyncManager.saveSettingsQuiet) SyncManager.saveSettingsQuiet();
  },
  _changed() { rebuildAll(true); persistChanges(); this.render(); if (typeof renderSubsystemsMetaTable === "function") renderSubsystemsMetaTable(); },
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
  sumOf(phases) { return Math.round((phases || []).reduce((a, ph) => a + (parseFloat(ph.weight) || 0), 0) * 10) / 10; },
  // 단계 표 (SDLC · 개선과제 같은 모양): 단계 · 가중치 · 계획 시작 · 계획 종료 · 프로젝트 기간 안 위치
  //  compact = 오른쪽 패널용 (위치 막대를 단계 이름 아래에)
  phaseTable(phases, fn, code, compact) {
    const dis = this.canEdit() ? "" : " disabled";
    const a = (i, f, v) => code == null ? UiEvents.args(i, f, v) : UiEvents.args(code, i, f, v);
    const bar = ph => `<span class="sb-track">${this._bar(ph)}</span>`;
    return `<table class="m-table sb-table${compact ? " sb-compact" : ""}"><thead><tr><th class="sb-c-no">No</th><th>단계</th><th class="sb-c-w">가중치(%)</th><th class="sb-c-d">계획 시작</th><th class="sb-c-d">계획 종료</th>${compact ? "" : "<th>프로젝트 기간 안 위치</th>"}</tr></thead><tbody>
      ${(phases || []).map((ph, i) => `<tr><td class="ai-c">${i + 1}</td><td><b>${escapeHtml(ph.name)}</b>${compact ? bar(ph) : ""}</td>
        <td><input type="number" class="phase-w" min="0" max="100" step="1"${dis} value="${escapeAttr(String(ph.weight))}" data-change="${fn}" data-change-args="${a(i, "weight", "$value")}"></td>
        <td><input type="date"${dis} value="${escapeAttr(ph.pStart || "")}" data-change="${fn}" data-change-args="${a(i, "pStart", "$value")}"></td>
        <td><input type="date"${dis} value="${escapeAttr(ph.pEnd || "")}" data-change="${fn}" data-change-args="${a(i, "pEnd", "$value")}"></td>
        ${compact ? "" : `<td>${bar(ph)}</td>`}</tr>`).join("")}
      </tbody></table>`;
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
      if (k === "SDLC") { const u = usersOf(t.code); if (u.length) st.push("사용 중", `(${u.join(", ")})`); else if (act.indexOf(t.code) !== -1) st.push("프로젝트 유형"); }
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
      note = u.length ? `쓰는 서브시스템: <b>${escapeHtml(u.join(", "))}</b>` : (act.indexOf(code) !== -1 ? "이 프로젝트의 SDLC 유형 — 아직 쓰는 서브시스템이 없습니다" : "아직 이 프로젝트에서 쓰지 않는 유형 — 서브시스템에서 고르면 사용 유형에 추가됩니다");
      if (ed && typeof ProcessLib !== "undefined" && ProcessLib.sdlcDiffers(code)) extra = `<button class="btn btn-sm" data-btn="warn" data-click="ProcessLib.refreshSdlc" data-click-args="${UiEvents.args(code)}" title="Admin 에서 단계 구성이 바뀌었습니다">🔄 최신 반영</button>`;
    } else if (code === reqAct) {
      note = `이 프로젝트에 적용 중인 개선과제 유형${reqUsers.length ? ` — 쓰는 서브시스템: <b>${escapeHtml(reqUsers.join(", "))}</b>` : ""}`;
      if (ed && typeof ProcessLib !== "undefined" && ProcessLib.reqDiffers()) extra = `<button class="btn btn-sm" data-btn="warn" data-click="ReqPhaseManager.refreshFromLib" title="Admin 에서 단계 구성이 바뀌었습니다">🔄 최신 반영</button>`;
    } else {
      note = "적용하지 않은 개선과제 유형 (개선과제형 서브시스템은 프로젝트에 적용한 유형 하나를 씁니다)";
      if (ed) extra = `<button class="btn btn-sm" data-btn="apply" data-click="ReqPhaseManager.applyPreset" data-click-args="${UiEvents.args(code)}">이 유형을 개선과제에 적용</button>`;
    }
    const chips = act.map(c => {
      const t = types.find(x => x.code === c) || { name: c }, n = usersOf(c).length;
      return `<span class="sb-chip">${escapeHtml(t.name)} <b>${n}</b>${ed && !n ? ` <button class="btn btn-xs" data-btn="neutral" data-click="toggleSdlcActiveState" data-click-args="${UiEvents.args(c)}">사용 안 함</button>` : ""}</span>`;
    }).join("");
    box.className = "ss-proc";
    box.innerHTML = `<div class="ss-proc-head">${sel}
        <span class="sb-sum ${sum === 100 ? "is-ok" : "is-bad"}">가중치 합계 ${sum}%</span>${extra}</div>
      <div class="lk-hint"><span>${note}</span> · <span>단계 이름 · 산출물 · 키워드는 Admin 에서</span></div>
      ${phases.length ? this.phaseTable(phases, kind === "REQ" ? "SdlcBoard.setReqPhase" : "SdlcBoard.setPhase", code) : `<div class="rec-empty">단계가 없습니다.</div>`}
      <div class="sb-spare"><span class="lk-hint">이 프로젝트의 SDLC 유형 (서브시스템이 고를 수 있는 유형, 최대 ${this.MAX}개 · 숫자 = 쓰는 서브시스템):</span> ${chips || "-"}</div>`;
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
