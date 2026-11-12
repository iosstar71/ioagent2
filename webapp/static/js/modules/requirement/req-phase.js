// [Project Mgmt] 개선과제형(REQ) 공정 단계
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =============================================================================
// [ver1.0.4 신규] 개선과제형(REQ) 공정 단계 기준정보 관리자 (프리셋 & 실시간 동기화)
// =============================================================================
var ReqPhaseManager = {
  PRESETS: {
    REQ_MFG_2027: {
      code: "REQ_MFG_2027",
      name: "개선과제 표준형 (4단계)",
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
    // [v3.9.0] 개선과제 유형은 시스템 설정의 공정 유형 라이브러리에서 고름 (계획 일정은 단계 이름이 같으면 유지)
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

  renderTable() {
    const tbody = document.getElementById("reqPhasesTableBody");
    if (!tbody) return;
    const phases = this.getPhases();
    tbody.innerHTML = "";

    const canEdit = typeof ProcessLib === "undefined" || ProcessLib.canManageProject();
    const dis = canEdit ? "" : " disabled";
    phases.forEach((p, idx) => {
      const tr = document.createElement("tr");
      // [v3.9.0] 단계 이름 · 가중치 · 산출물 · 키워드는 [시스템 설정 > 공정 유형]에서, 여기서는 계획 일정만
      tr.innerHTML = `
        <td style="text-align:center;"><b>${idx + 1}</b></td>
        <td style="font-weight:bold;color:#0f766e;">${escapeHtml(p.name)}</td>
        <td style="text-align:right;">${p.weight}</td>
        <td><input type="date"${dis} value="${escapeHtml(p.pStart || "")}" style="width:100%;" data-change="ReqPhaseManager.updatePhase" data-change-args="${UiEvents.args(idx, "pStart", "$value")}"></td>
        <td><input type="date"${dis} value="${escapeHtml(p.pEnd || "")}" style="width:100%;" data-change="ReqPhaseManager.updatePhase" data-change-args="${UiEvents.args(idx, "pEnd", "$value")}"></td>
        <td>${escapeHtml(p.output || "")}</td>
        <td style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">${escapeHtml((p.keywords || []).join(", "))}</td>
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

  refreshFromLib() { this.applyPreset(projectConfig.activeReqPreset); },

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
window.LayoutManager = LayoutManager;
