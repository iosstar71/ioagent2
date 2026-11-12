const WBSEngine = {
  // [2026 v1.5.0] SDLC 기본 프리셋 템플릿 마스터 풀 (최대 8개 등록 지원 / 프로젝트 활성 4개 선택)
  DEFAULT_SDLC_PRESETS: {
    SDLC_PMO: {
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
    SDLC_SMART_MFG: {
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

    SDLC_WATERFALL: {
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
    SDLC_AGILE: {
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
    SDLC_COTS: {
      code: "SDLC_COTS",
      name: "패키지/솔루션 도입형 (COTS Package / 4단계)",
      desc: "Fit-Gap분석 ➔ 파라미터설정 ➔ 인수테스트 ➔ 이행오픈 솔루션 최적화 공정",
      isRecommended: true,
      phases: [
        { key: "p1", name: "Fit-Gap분석", weight: 25, output: "갭분석서", keywords: ["갭", "fit", "gap", "분석", "패키지", "커스터마이징", "비교"] },
        { key: "p2", name: "파라미터설정", weight: 40, output: "환경설정정의서", keywords: ["설정", "파라미터", "구축", "커스텀", "모듈", "매핑"] },
        { key: "p3", name: "인수테스트", weight: 20, output: "인수시험결과서", keywords: ["인수", "테스트", "검증", "시험", "사용자", "시운전"] },
        { key: "p4", name: "이행오픈", weight: 15, output: "가동승인원", keywords: ["이행", "오픈", "가동", "전환", "마이그레이션", "데이터"] }
      ]
    },
    SDLC_INFRA: {
      code: "SDLC_INFRA",
      name: "클라우드/인프라 전환형 (Cloud & Infra / 4단계)",
      desc: "아키텍처진단 ➔ 클라우드구축 ➔ 모의전환검증 ➔ 본전환 인프라 특화 공정",
      isRecommended: true,
      phases: [
        { key: "p1", name: "아키텍처진단", weight: 20, output: "진단보고서", keywords: ["진단", "아키텍처", "네트워크", "망분리", "설계", "분석"] },
        { key: "p2", name: "클라우드구축", weight: 35, output: "인프라구성도", keywords: ["구축", "k8s", "컨테이너", "클러스터", "프로비저닝", "설정"] },
        { key: "p3", name: "모의전환검증", weight: 25, output: "모의훈련결과서", keywords: ["모의", "훈련", "리허설", "취약점", "모의해킹", "테스트"] },
        { key: "p4", name: "본전환", weight: 20, output: "오픈확인서", keywords: ["본전환", "컷오버", "오픈", "스위칭", "안정화", "가동"] }
      ]
    },
    COMPACT: {
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
    DETAILED: {
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
  },

  // [2026 v1.6.3] 개선과제형(REQ) 공정 단계 기준정보 프리셋 마스터
  DEFAULT_REQ_PRESETS: {
    REQ_MFG_2027: {
      code: "REQ_MFG_2027",
      name: "27년 가동률 시스템 개선 표준형 (4단계)",
      desc: "요구사항정의(1~3월) ➔ 과제요구개발(3~10월) ➔ 추가요구개발(5~10월) ➔ 이행안정화(11~12월)",
      isRecommended: true,
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

  // [2026 v1.5.0] 프로젝트에 등록된 활성 SDLC 타입 목록 (최대 4개 선택 운영)
  getActiveSdlcList() {
    if (typeof projectConfig !== "undefined" && Array.isArray(projectConfig.customSdlcTypes) && projectConfig.customSdlcTypes.length > 0) {
      const activeCodes = Array.isArray(projectConfig.activeSdlcCodes) && projectConfig.activeSdlcCodes.length > 0
        ? projectConfig.activeSdlcCodes
        : projectConfig.customSdlcTypes.slice(0, 4).map(s => s.code);
      
      const filtered = projectConfig.customSdlcTypes.filter(s => activeCodes.includes(s.code));
      if (filtered.length > 0) return filtered.slice(0, 4);
      return projectConfig.customSdlcTypes.slice(0, 4);
    }
    return [
      JSON.parse(JSON.stringify(this.DEFAULT_SDLC_PRESETS.SDLC_WATERFALL)),
      JSON.parse(JSON.stringify(this.DEFAULT_SDLC_PRESETS.SDLC_AGILE)),
      JSON.parse(JSON.stringify(this.DEFAULT_SDLC_PRESETS.SDLC_COTS)),
      JSON.parse(JSON.stringify(this.DEFAULT_SDLC_PRESETS.SDLC_INFRA))
    ];
  },

  // [2026 v1.5.0] 전체 마스터 풀(최대 8개)에서 특정 SDLC 코드 조회 (활성 여부 무관)
  getSdlcSpecByCode(sdlcCode) {
    if (!sdlcCode) return this.getActiveSdlcList()[0] || this.DEFAULT_SDLC_PRESETS.SDLC_WATERFALL;
    if (typeof projectConfig !== "undefined" && Array.isArray(projectConfig.customSdlcTypes)) {
      const target = projectConfig.customSdlcTypes.find(s => s.code === sdlcCode);
      if (target) return target;
    }
    if (this.DEFAULT_SDLC_PRESETS && this.DEFAULT_SDLC_PRESETS[sdlcCode]) {
      return this.DEFAULT_SDLC_PRESETS[sdlcCode];
    }
    const list = this.getActiveSdlcList();
    const found = list.find(s => s.code === sdlcCode);
    if (found) return found;
    return list[0] || this.DEFAULT_SDLC_PRESETS.SDLC_WATERFALL;
  },

  // 서브시스템에 매핑된 SDLC 스펙 조회
  getSubsystemSdlcSpec(sysName) {
    if (typeof subsystemsMeta !== "undefined" && Array.isArray(subsystemsMeta)) {
      const meta = subsystemsMeta.find(m => m.name === sysName || m.code === sysName);
      if (meta && meta.type === "REQ") return null; // 개선타입
      if (meta && meta.sdlcCode) {
        return this.getSdlcSpecByCode(meta.sdlcCode);
      }
    }
    const list = this.getActiveSdlcList();
    return list[0] || this.DEFAULT_SDLC_PRESETS.COMPACT;
  },

  // 과업이 특정 SDLC 단계에 매칭되는지 판별
  matchTaskToPhase(task, phase, allData) {
    if (!task || !phase) return false;
    const list = allData || (typeof wbsData !== "undefined" ? wbsData : []);
    let searchText = (task.name || "").toLowerCase();

    // 부모 L2 과업명도 함께 참조하여 계층 과업 판별
    if (task.id && task.level > 2) {
      const l2 = list.find(d => d.system === task.system && d.level === 2 && task.id.startsWith(d.id + "."));
      if (l2 && l2.name) searchText = (l2.name + " " + searchText).toLowerCase();
    }

    const keywords = Array.isArray(phase.keywords) && phase.keywords.length > 0
      ? phase.keywords
      : [phase.name || ""];

    return keywords.some(k => k && searchText.includes(String(k).toLowerCase().trim()));
  },

  // [2026 v1.2.5] 서브시스템의 분야(Domain) 조회 헬퍼
  getSubsystemDomain(sysName) {
    const s = (sysName || "").trim();
    if (typeof subsystemsMeta !== "undefined" && Array.isArray(subsystemsMeta)) {
      const found = subsystemsMeta.find(m => m.name === s || m.code === s);
      if (found && found.domain) return found.domain.trim();
    }
    return "미지정분야";
  },

  getDayOfWeekText(dateStr) {
    if (!dateStr) return "";
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return days[d.getDay()];
  },

  isDateOutOfRange(dateStr, startDateStr, endDateStr) {
    if (!dateStr || !startDateStr || !endDateStr) return false;
    const d = new Date(dateStr);
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    return d < start || d > end;
  },

  isHoliday(dateStr, holidays) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const day = d.getDay();
    if (day === 0 || day === 6) return true;
    return (holidays || []).some(h => h.date === dateStr);
  },

  getNextWorkingDay(dateStr, holidays, maxDateStr = null) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    let guard = 0;
    while (guard < 60) {
      const iso = d.toISOString().split("T")[0];
      if (!this.isHoliday(iso, holidays)) {
        if (maxDateStr && iso > maxDateStr) break;
        return iso;
      }
      d.setDate(d.getDate() + 1);
      guard++;
    }

    const dBack = new Date(dateStr);
    guard = 0;
    while (guard < 60) {
      const iso = dBack.toISOString().split("T")[0];
      if (!this.isHoliday(iso, holidays)) return iso;
      dBack.setDate(dBack.getDate() - 1);
      guard++;
    }
    return dateStr;
  },

  // 서브시스템 코드 조회 헬퍼
  getSubsystemCode(sysName) {
    const s = (sysName || "").trim();
    if (typeof subsystemsMeta !== "undefined" && Array.isArray(subsystemsMeta)) {
      const found = subsystemsMeta.find(m => m.name === s || m.code === s);
      if (found && found.code) return found.code.trim();
    }
    return s;
  },

  // WBS ID Prefix 조합 생성기 (기본 Prefix + 서브시스템 코드 연동 옵션)
  buildWbsIdPrefix(sysName) {
    if (typeof projectConfig === "undefined" || !projectConfig.idPrefixConfig) return "";
    const cfg = projectConfig.idPrefixConfig;
    const parts = [];
    const basePref = (cfg.wbsPrefix || "").trim().replace(/-+$/, "");
    if (basePref) parts.push(basePref);
    if (cfg.wbsUseSubCode) {
      const subCode = this.getSubsystemCode(sysName).replace(/-+$/, "");
      if (subCode) parts.push(subCode);
    }
    return parts.length > 0 ? parts.join("-") + "-" : "";
  },

  lastIdMap: null, // [v1.0.7] 직전 재채번에서 바뀐 ID (이전 → 신규)

  sortAndAutoNumber(data) {
    const prevIds = new Map(data.map(it => [it, it.id]));
    const getSystemPriority = (sys) => {
      const s = (sys || "").trim();
      if (s.toUpperCase() === "PMO") return "0000_PMO";
      if (typeof subsystemsMeta !== "undefined" && Array.isArray(subsystemsMeta)) {
        const idx = subsystemsMeta.findIndex(m => m.name === s || m.code === s);
        if (idx >= 0) return String(idx + 1).padStart(4, "0") + "_" + s;
      }
      return "0999_" + s;
    };

    const systemOrder = [...new Set(data.map(d => (d.system || "").trim()))].sort((a, b) => {
      return getSystemPriority(a).localeCompare(getSystemPriority(b), "ko");
    });

    const sortedData = [];
    systemOrder.forEach(sys => {
      const items = data.filter(d => (d.system || "").trim() === sys);
      if (items.length > 0 && !items.some(it => (parseInt(it.level, 10) || 1) === 1)) {
        sortedData.push({
          id: "",
          level: 1,
          system: sys,
          name: `${sys} 총괄`,
          weight: 20,
          reqId: "",
          pStart: items[0].pStart || "",
          pEnd: items[items.length - 1].pEnd || "",
          aStart: "",
          aEnd: "",
          pProg: 0,
          aProg: 0,
          output: ""
        });
      }
      sortedData.push(...items);
    });

    data.length = 0;
    sortedData.forEach(item => data.push(item));

    let currentL1Index = 0;
    let currentSystem = null;
    let hasL1InSystem = false;
    let prevLvl = 1;
    const counters = [0, 0, 0, 0, 0];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const sys = (item.system || "").trim();

      if (sys !== currentSystem) {
        currentSystem = sys;
        currentL1Index++;
        hasL1InSystem = false;
        counters[0] = currentL1Index;
        for (let j = 1; j < 5; j++) counters[j] = 0;
      }

      let lvl = Math.min(5, Math.max(1, parseInt(item.level, 10) || 1));
      if (!hasL1InSystem) {
        lvl = 1;
        hasL1InSystem = true;
        prevLvl = 1;
      } else if (lvl === 1) {
        lvl = 2;
      }
      // [v1.0.7] 레벨 건너뜀 보정 (예: L2 바로 아래 L4 → L3) — ID 에 존재하지 않는 중간 번호가 생기지 않도록
      if (lvl > prevLvl + 1) lvl = prevLvl + 1;
      prevLvl = lvl;
      item.level = lvl;

      const prefixStr = this.buildWbsIdPrefix(sys);

      if (lvl === 1) {
        item.id = `${prefixStr}${currentL1Index}`;
      } else {
        for (let j = 1; j < lvl - 1; j++) {
          if (counters[j] === 0) counters[j] = 1;
        }
        counters[lvl - 1]++;
        for (let j = lvl; j < 5; j++) counters[j] = 0;
        const parts = [currentL1Index];
        for (let j = 1; j < lvl; j++) {
          parts.push(counters[j]);
        }
        item.id = `${prefixStr}${parts.join(".")}`;
      }
    }

    this.markLeafNodes(data);
    const idMap = new Map();
    data.forEach(it => {
      const old = prevIds.get(it);
      if (old && old !== it.id) idMap.set(old, it.id);
    });
    this.lastIdMap = idMap.size ? idMap : null;
  },

  markLeafNodes(data) {
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const hasChildren = data.some(d => d !== item && d.id.startsWith(item.id + "."));
      item.isLeaf = !hasChildren;
    }
  },

  // 영업일 수 계산: [startStr, endStr) 구간의 평일(주말·공휴일 제외) 일수
  countBusinessDays(startStr, endStr, holidaySet) {
    const start = new Date(startStr + "T00:00:00");
    const end = new Date(endStr + "T00:00:00");
    if (isNaN(start) || isNaN(end) || end <= start) return 0;
    let n = 0;
    const d = new Date(start);
    while (d < end) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!holidaySet.has(iso)) n++;
      }
      d.setDate(d.getDate() + 1);
    }
    return n;
  },

  // 계획 진척률 계산
  //  - basis "CALENDAR": 주말·공휴일 포함 달력 일수 기준 (기본)
  //  - basis "BUSINESS": 주말·공휴일 제외 영업일 기준 ([기준정보 > 휴일정보]에서 선택 후 [적용])
  calculatePlanProgress(data, reportDateStr, opts) {
    const cfg = typeof projectConfig !== "undefined" ? projectConfig : {};
    const basis = (opts && opts.basis) || cfg.progressBasis || "CALENDAR";
    const holidaySet = new Set(((opts && opts.holidays) || cfg.holidays || []).map(h => h.date));
    const repDate = new Date(reportDateStr);
    data.forEach(task => {
      if (!task.isLeaf) return;
      if (!task.pStart || !task.pEnd) {
        task.pProg = 0;
        return;
      }
      const start = new Date(task.pStart);
      const end = new Date(task.pEnd);
      if (repDate < start) {
        task.pProg = 0;
      } else if (repDate >= end) {
        task.pProg = 100;
      } else if (basis === "BUSINESS") {
        const total = this.countBusinessDays(task.pStart, task.pEnd, holidaySet);
        const elapsed = this.countBusinessDays(task.pStart, reportDateStr, holidaySet);
        task.pProg = total <= 0 ? 0 : Math.min(100, Math.round((elapsed / total) * 100));
      } else {
        const total = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        const elapsed = Math.max(0, (repDate - start) / (1000 * 60 * 60 * 24));
        task.pProg = Math.min(100, Math.round((elapsed / total) * 100));
      }
    });
  },

  rollup(data) {
    this.markLeafNodes(data);

    for (let lvl = 5; lvl >= 1; lvl--) {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (item.level === lvl && !item.isLeaf) {
          let children = data.filter(d => d.id.startsWith(item.id + ".") && d.level === lvl + 1);
          if (children.length === 0) {
            children = data.filter(d => d.id.startsWith(item.id + ".") && d.isLeaf);
          }
          if (children.length > 0) {
            const pStarts = children.map(c => c.pStart).filter(Boolean).sort();
            const pEnds = children.map(c => c.pEnd).filter(Boolean).sort();
            const aStarts = children.map(c => c.aStart).filter(Boolean).sort();
            const aEnds = children.map(c => c.aEnd).filter(Boolean).sort();

            if (pStarts.length > 0) item.pStart = pStarts[0];
            if (pEnds.length > 0) item.pEnd = pEnds[pEnds.length - 1];
            if (aStarts.length > 0) item.aStart = aStarts[0];
            const allCompleted = children.every(c => c.aProg >= 100 && c.aEnd);
            if (allCompleted && aEnds.length > 0) item.aEnd = aEnds[aEnds.length - 1];
            else item.aEnd = "";

            const totalW = children.reduce((acc, c) => acc + (parseFloat(c.weight) || 1), 0);
            const sumP = children.reduce((acc, c) => acc + ((parseFloat(c.pProg) || 0) * (parseFloat(c.weight) || 1)), 0);
            const sumA = children.reduce((acc, c) => acc + ((parseFloat(c.aProg) || 0) * (parseFloat(c.weight) || 1)), 0);

            item.pProg = Math.round(sumP / (totalW || 1));
            item.aProg = Math.round(sumA / (totalW || 1));
          }
        }
      }
    }
    if (typeof projectConfig !== "undefined" && projectConfig.reportDate) this.applyStatus(data, projectConfig.reportDate);
    return data;
  },

  // [v1.0.8] 과업 상태 판정
  //  - 완료  : 실적 100%
  //  - 지연  : 계획 진척률보다 실적이 1%p 이상 적은 경우 (계획종료일 경과 미완료 포함)
  //  - 진행중: 실적이 있거나 실적시작일이 기준일 이전
  //  - 착수전: 그 외
  getTaskStatus(task, reportDateStr) {
    const aProg = parseFloat(task.aProg) || 0;
    const pProg = parseFloat(task.pProg) || 0;
    if (aProg >= 100) return { code: "completed", label: "완료", cssClass: "tag-completed" };
    if (pProg - aProg >= 1) return { code: "delayed", label: "지연", cssClass: "tag-delayed" };
    if (aProg > 0 || (task.aStart && task.aStart <= reportDateStr)) return { code: "progress", label: "진행중", cssClass: "tag-progress" };
    return { code: "ready", label: "착수전", cssClass: "tag-ready" };
  },

  // 판정한 상태를 데이터(task.status)에 저장 — 엑셀/DB/주간보고에서 동일 상태 사용
  applyStatus(data, reportDateStr) {
    (data || []).forEach(t => { t.status = this.getTaskStatus(t, reportDateStr).label; });
  },

  // 기준일이 속한 주차(주 시작 요일 기준)의 시작·종료일
  getWeekRange(dateStr, weekStartDayArg) {
    const d = new Date(dateStr + "T00:00:00");
    const wsd = parseInt(weekStartDayArg, 10);
    const target = isNaN(wsd) ? 1 : wsd;
    const start = new Date(d);
    while (start.getDay() !== target) start.setDate(start.getDate() - 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { start: iso(start), end: iso(end) };
  },

  // [2026 v1.7.6 신규] 프로젝트 주차(Weeks) 목록 생성 헬퍼
  getProjectWeeks(projectStartDate, projectEndDate, weekStartDayArg) {
    const sDate = new Date(projectStartDate || "2027-01-01");
    const eDate = new Date(projectEndDate || "2027-12-31");
    const weekStartDay = parseInt(weekStartDayArg !== undefined ? weekStartDayArg : 5, 10);
    const targetStartDay = isNaN(weekStartDay) ? 5 : weekStartDay;

    const firstWeekStart = new Date(sDate);
    while (firstWeekStart.getDay() !== targetStartDay) {
      firstWeekStart.setDate(firstWeekStart.getDate() - 1);
    }

    const weeks = [];
    const cur = new Date(firstWeekStart);
    let wIdx = 1;
    while ((cur <= eDate || weeks.length < 4) && wIdx <= 280) {
      const curEnd = new Date(cur);
      curEnd.setDate(curEnd.getDate() + 6);
      const isoStart = cur.toISOString().split("T")[0];
      const isoEnd = curEnd.toISOString().split("T")[0];
      weeks.push({
        weekNum: wIdx,
        // [Workgroup] 주차 표시는 기준정보의 주차 표시 방식(WeekFmt)을 따름 — weekNum 은 프로젝트 순번 그대로 (주간보고 ID)
        label: typeof WeekFmt !== "undefined" ? WeekFmt.label(isoStart) : `${wIdx}주차`,
        fullLabel: `${typeof WeekFmt !== "undefined" ? WeekFmt.label(isoStart) : cur.getFullYear() + "년 " + wIdx + "주차"} (${isoStart} ~ ${isoEnd})`,
        startDate: isoStart,
        endDate: isoEnd,
        year: cur.getFullYear()
      });
      cur.setDate(cur.getDate() + 7);
      wIdx++;
    }
    return weeks;
  },

  addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  },
};
