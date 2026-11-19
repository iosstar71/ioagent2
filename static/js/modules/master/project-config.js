// [Project Mgmt] 기준정보: 프로젝트 기본 설정 · ID 규칙
// -------------------------------------------------------------
// 프로젝트 기본 설정 및 대한민국 공휴일 생성기
// -------------------------------------------------------------
let projectConfig = {
  systemTitle: APP_VERSION.title,
  projectName: "기본 프로젝트",
  domains: ["기본분야"],
  channels: [], // 게시판 채널은 프로젝트별 (없으면 전체 + 이 프로젝트의 서브시스템)
  customSdlcTypes: Object.keys(WBSEngine.DEFAULT_SDLC_PRESETS).map(k => JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS[k]))),   // 기본 유형 정의는 WBSEngine 한 곳
  activeSdlcCodes: ["SDLC_PMO", "SDLC_SMART_MFG", "SDLC_WATERFALL", "SDLC_AGILE"],
  activeReqPreset: "",
  // 개선과제형(REQ) 서브시스템 공정 단계 기준정보 (4단계)
  reqSdlcPhases: JSON.parse(JSON.stringify(WBSEngine.DEFAULT_REQ_PRESETS.REQ_MFG_2027.phases)),
  maxDeliverableRounds: 2,
  // 처음 값: 올해 1월 1일 ~ 12월 31일, 기준일 = 오늘 (기준정보에서 바꿈)
  projectStartDate: `${new Date().getFullYear()}-01-01`,
  projectEndDate: `${new Date().getFullYear()}-12-31`,
  weekStartDay: 1, // 월요일 시작
  reportDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
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

// 시스템 타이틀: 화면 왼쪽 위 · 브라우저 탭 이름 — 프로젝트와 무관하게 하나 (Admin > 프로젝트 에서 정함)
var SystemTitle = {
  KEY: "IOSTAR_SYSTEM_TITLE",
  get() { try { return String(AppStore.getItem(this.KEY) || "").trim(); } catch (e) { return ""; } },
  text() { return this.get() || APP_VERSION.name; },
  _store(v) { try { if (v) AppStore.setItem(this.KEY, v); else AppStore.removeItem(this.KEY); } catch (e) {} },
  fill() { const el = document.getElementById("cfgSystemTitle"); if (el && document.activeElement !== el) el.value = this.get(); },
  save() {
    const el = document.getElementById("cfgSystemTitle");
    const v = el ? el.value.trim().slice(0, 40) : "";
    this._store(v);
    renderProjectTitles();
    showToast(v ? `🏷️ 시스템 타이틀을 [${v}] 로 바꿨습니다.` : "🏷️ 시스템 타이틀을 기본값으로 되돌렸습니다.");
  },
  reset() { const el = document.getElementById("cfgSystemTitle"); if (el) el.value = ""; this.save(); }
};
window.SystemTitle = SystemTitle;

function renderProjectTitles() {
  // 저장된 시스템 명칭의 버전 표기는 현재 프로그램 버전으로 표시
  // 시스템 명칭 변경(Project Mgmt): 이전 명칭으로 저장된 시스템 타이틀은 새 명칭으로 교체
  if (/AX[ _]Project[ _]Management|AX_PMYS/i.test(projectConfig.systemTitle || "")) projectConfig.systemTitle = APP_VERSION.title;
  const sysTitle = APP_VERSION.title;  // 시스템 이름은 고정: Project Mgmt (협업)
  const projName = projectConfig.projectName || "프로젝트";

  const hSys = document.getElementById("headerSystemTitleText");
  const hProj = document.getElementById("headerProjectNameBadge");
  const bTitle = document.getElementById("pageBrowserTitle");
  // Standard·Neo: 머리글 제목은 제품 이름만 (버전은 옆 배지에 표시)
  if (hSys) hSys.textContent = SystemTitle.text();
  const hVer = document.getElementById("headerVersionBadge");
  if (hVer) hVer.textContent = (APP_VERSION.variant ? APP_VERSION.variant + " " : "") + "v" + APP_VERSION.version;
  // 버전은 머리말에서 빼고 사용자 메뉴에 표시
  const uVer = document.getElementById("gUserVer");
  if (uVer) uVer.textContent = `${APP_VERSION.brand || "IOSTAR-PM"} ${APP_VERSION.editionName || APP_VERSION.variant || ""} v${APP_VERSION.version}`;
  if (hProj) hProj.textContent = projName;
  if (bTitle) bTitle.textContent = `${SystemTitle.get() || sysTitle} (${projName})`;

  SystemTitle.fill();
  const inProj = document.getElementById("cfgProjectName");
  if (inProj) inProj.value = projName;

  // SDLC는 1-2-B 커스텀 SDLC 카드로 관리됨

  const maxR = Math.min(4, Math.max(1, parseInt(projectConfig.maxDeliverableRounds || 2, 10)));
  const maxRSel = document.getElementById("cfgMaxDeliverableRounds");
  if (maxRSel) maxRSel.value = String(maxR);
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
  showToast(`[산출물 제출 차수 설정] 1차 ~ ${maxR}차 운영으로 동기화되었습니다. (초과 차수 비선택 초기화 완료)`);
}

function updateProjectTitles() {
  const inProj = document.getElementById("cfgProjectName");
  if (inProj && inProj.value.trim()) projectConfig.projectName = inProj.value.trim();
  renderProjectTitles();
  persistChanges();
  showToast(`시스템 타이틀 및 프로젝트명([${projectConfig.projectName}])이 반영되었습니다.`);
}

// WBS / REQ / VOC ID 채번 Prefix 및 서브시스템 코드 연동 설정
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

    // Action Item ID도 설정된 Prefix 및 서브시스템 코드 규칙으로 일괄 재채번
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
    showToast("ID 규칙(Action Item 포함)이 변경되었습니다. (신규 생성 건부터 자동 적용)");
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
