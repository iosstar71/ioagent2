// [IOSTAR-PM] 기준정보: 프로젝트 기본 설정 · ID 규칙
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// -------------------------------------------------------------
// 프로젝트 기본 설정 및 대한민국 공휴일 생성기
// -------------------------------------------------------------
let projectConfig = {
  systemTitle: APP_VERSION.title,
  projectName: "27년 가동률 시스템 개선",
  domains: ["관리공통", "개선공정", "신규공정"], // [2027년 프로젝트] 3대 상위 분야
  channels: [], // [v3.0.0] 게시판 · 채팅 채널은 프로젝트별 (없으면 전체 + 이 프로젝트의 서브시스템)
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
  if (/AX[ _]Project[ _]Management|AX_PMYS|^IOSTAR-PM/i.test(projectConfig.systemTitle || "")) projectConfig.systemTitle = APP_VERSION.title;
  const sysTitle = String(projectConfig.systemTitle || APP_VERSION.title).replace(/ver\d+\.\d+\.\d+/, "ver" + APP_VERSION.version);
  const projName = projectConfig.projectName || "차세대 통합 구축 프로젝트";

  const hSys = document.getElementById("headerSystemTitleText");
  const hProj = document.getElementById("headerProjectNameBadge");
  const bTitle = document.getElementById("pageBrowserTitle");
  // Standard·Neo: 머리글 제목은 제품 이름만 (버전은 옆 배지에 표시)
  if (hSys) { hSys.textContent = APP_VERSION.name; hSys.title = APP_VERSION.product; }
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
  showToast(`[산출물 제출 차수 설정] 1차 ~ ${maxR}차 운영으로 동기화되었습니다. (초과 차수 비선택 초기화 완료)`);
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
