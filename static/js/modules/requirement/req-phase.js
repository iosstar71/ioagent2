// [Project Mgmt] 개선과제형(REQ) 공정 단계
// =============================================================================
// 개선과제형(REQ) 공정 단계 기준정보 관리자 (프리셋 & 실시간 동기화)
// =============================================================================
var ReqPhaseManager = {
  // 개선과제 기본 유형 정의는 WBSEngine.DEFAULT_REQ_PRESETS 한 곳
  get PRESETS() { return WBSEngine.DEFAULT_REQ_PRESETS; },

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
    // 개선과제 유형은 시스템 설정의 공정 유형 라이브러리에서 고름 (계획 일정은 단계 이름이 같으면 유지)
    if (typeof ProcessLib !== "undefined" && ProcessLib.findReq(presetCode)) {
      if (!ProcessLib.canManageProject()) return showToast("🚫 PM · 관리자만 바꿀 수 있습니다.");
      ProcessLib.applyReqToProject(presetCode);
      const t = ProcessLib.findReq(presetCode);
      this.renderTable();
      if (typeof MasterSyncEngine !== "undefined") MasterSyncEngine.syncAll(true, "req-preset"); else rebuildAll(true);
      return showToast(`개선과제 단계를 [${t.name}] 유형으로 적용했습니다.`);
    }
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

  // 화면은 [프로젝트 설정 > Phase · 산출물] 한 판(SdlcBoard)에서 SDLC 유형과 함께 그림
  renderTable() { if (typeof SdlcBoard !== "undefined") SdlcBoard.render(); if (typeof renderSubsystemsMetaTable === "function") renderSubsystemsMetaTable(); },
  typeName() {
    const cur = projectConfig.activeReqPreset || "REQ_MFG_2027";
    const t = (typeof ProcessLib !== "undefined" && ProcessLib.findReq(cur)) || this.PRESETS[cur];
    return t ? t.name : cur;
  },

  refreshFromLib() { this.applyPreset(projectConfig.activeReqPreset); },

  updatePhase(idx, field, val) {
    if (!projectConfig.reqSdlcPhases) projectConfig.reqSdlcPhases = this.getPhases();
    if (projectConfig.reqSdlcPhases[idx]) {
      if (field === "weight") {   // 단계 가중치 합계는 100 을 넘을 수 없음
        val = Math.max(0, Math.min(100, parseFloat(val) || 0));
        const others = projectConfig.reqSdlcPhases.reduce((a, x, j) => a + (j === idx ? 0 : (parseFloat(x.weight) || 0)), 0);
        if (others + val > 100) { showToast(`⚠️ 단계 가중치 합계가 100 을 넘을 수 없습니다 (이 단계는 ${100 - others} 까지).`, "warning"); return this.renderTable(); }
      }
      if (val === "" && field === "vocStage") delete projectConfig.reqSdlcPhases[idx][field];
      else projectConfig.reqSdlcPhases[idx][field] = val;
      this.renderTable();
      if (typeof MasterSyncEngine !== "undefined") {
        MasterSyncEngine.syncAll(false, "req-phase-update");
      } else {
        rebuildAll();
      }
    }
  },



  populatePresetSelector(selectedKey) {
    const sel = document.getElementById("reqPresetSelector");
    if (!sel) return;
    if (typeof ProcessLib !== "undefined") {
      const list = ProcessLib.reqTypes();
      const cur = selectedKey || projectConfig.activeReqPreset || (list[0] || {}).code;
      sel.innerHTML = list.map(t => `<option value="${escapeAttr(t.code)}" ${t.code === cur ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("") +
        (list.some(t => t.code === cur) ? "" : `<option value="${escapeAttr(cur || "")}" selected>${escapeHtml(cur || "")} (이 프로젝트 전용)</option>`);
      sel.disabled = !ProcessLib.canManageProject();
      const btn = document.getElementById("reqRefreshBtn");
      if (btn) btn.style.display = ProcessLib.canManageProject() && ProcessLib.reqDiffers() ? "" : "none";
      return;
    }
    const currentActive = selectedKey || projectConfig.activeReqPreset || Object.keys(this.PRESETS)[0];
    sel.innerHTML = Object.keys(this.PRESETS).map(k => {
      const p = this.PRESETS[k];
      return `<option value="${k}" ${k === currentActive ? "selected" : ""}>${escapeHtml(p.name)}</option>`;
    }).join("");
    sel.value = currentActive;
  },




};

window.ReqPhaseManager = ReqPhaseManager;

window.NoticeCommManager = NoticeCommManager;
window.LayoutManager = LayoutManager;
