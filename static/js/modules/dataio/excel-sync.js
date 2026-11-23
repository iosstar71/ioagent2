const ExcelSync = {
  // =========================================================================
  // Excel & Word DOCX 통합 시각 테마 및 폰트 팔레트
  // =========================================================================
  // 엑셀 · 워드 양식 색상 3가지 (한 곳에서 정의 — 설정 화면 선택 상자도 여기서 그려짐)
  //  예전 값: Official Navy · Office Blue → Navy / Office Gray · Matte Slate → Gray / Office Green → Mint
  EXPORT_THEME_DEFS: [
    { id: "Navy", name: "Navy — 네이비 (보고서 표준, 기본)", pal: { primary: "1E3A8A", secondary: "2563EB", accent: "0284C7", headerBg: "1E3A8A", subHeaderBg: "EEF2F8", border: "B4C2DC", headerTextColor: "FFFFFF" } },
    { id: "Gray", name: "Gray — 그레이 (흑백 인쇄에 무난)", pal: { primary: "3A3A3A", secondary: "595959", accent: "7F7F7F", headerBg: "595959", subHeaderBg: "F2F2F2", border: "BFBFBF", headerTextColor: "FFFFFF" } },
    { id: "Mint", name: "Mint — 민트 (파스텔)", pal: { primary: "2F7D6B", secondary: "4FA08C", accent: "7CC4B0", headerBg: "BFE3D6", subHeaderBg: "EEF8F4", border: "BFDDD3", headerTextColor: "1F4D43" } }
  ],
  get EXPORT_THEMES() { return this.EXPORT_THEME_DEFS.map(t => t.id); },
  fillExportThemeSelect(sel) {
    if (sel) sel.innerHTML = this.EXPORT_THEME_DEFS.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
  },
  // 내려받는 파일 이름 표준: {파일약칭}_{대상}[_범위…]_{기준일 yyyyMMdd}.{확장자}
  //  (주간보고는 WeeklyExport 의 주차 규칙) — 공백·괄호·특수문자 없이
  stdName(kind, parts, ext, stamp) {
    const safe = v => String(v === undefined || v === null ? "" : v).replace(/[\\/:*?"<>|\[\]()~{}#%&+=,;'`!@$^]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    const pid = typeof ProjectContext !== "undefined" ? ProjectContext.current : "";
    const code = safe((typeof projectConfig !== "undefined" && projectConfig.fileCode) || (pid && pid !== "DEFAULT" ? pid : "") || "PRJ").slice(0, 20) || "PRJ";
    const day = safe(stamp || String((typeof projectConfig !== "undefined" && projectConfig.reportDate) || new Date().toISOString().slice(0, 10)).replace(/-/g, ""));
    const mid = (parts || []).map(safe).filter(x => x && x !== "ALL" ? true : x === "ALL").filter(Boolean);
    return [code, safe(kind)].concat(mid).concat(day ? [day] : []).join("_") + "." + (ext || "xlsx");
  },
  normalizeExportTheme(v) {
    const r = String(v || "");
    if (this.EXPORT_THEMES.indexOf(r) !== -1) return r;
    if (/Mint|Emerald|Teal|Green|Pastel/i.test(r)) return "Mint";
    if (/Matte|Brown|Mocha|Sepia|Charcoal|Slate|Gray|Grey/i.test(r)) return "Gray";
    return "Navy";
  },
  getExportThemePalette() {
    const expCfg = (typeof projectConfig !== "undefined" && projectConfig.exportSettings) ? projectConfig.exportSettings : {};
    // Unified export theme takes absolute precedence
    const rawTheme = expCfg.exportTheme || expCfg.unifiedTheme || expCfg.xlsxTheme || expCfg.docxTheme || "Official Blue";
    const fontSize = parseInt(expCfg.exportFontSize || expCfg.docxFontSize || expCfg.xlsxFontSize, 10) || 10;
    const fontName = expCfg.exportFont || expCfg.docxFont || expCfg.xlsxFont || "맑은 고딕";

    const themeName = this.normalizeExportTheme(rawTheme);
    const t = this.EXPORT_THEME_DEFS.find(x => x.id === themeName).pal;
    const { primary, secondary, accent, headerBg, subHeaderBg, border, headerTextColor } = t;
    const isPastel = false;
    return { themeName, fontSize, fontName, primary, secondary, accent, headerBg, subHeaderBg, border, headerTextColor, isPastel };
  },

  TAB_SCHEMAS: {
    // 프로젝트 기준정보 (설정 행 단위)
    config: [
      { key: "category", label: "설정구분", width: 18 },
      { key: "key", label: "설정키/코드", width: 22 },
      { key: "value", label: "설정값/명칭", width: 32 },
      { key: "extra1", label: "세부속성1(가중치/요일)", width: 22 },
      { key: "extra2", label: "세부속성2(산출물/비고)", width: 32 },
      { key: "extra3", label: "세부속성3(매칭키워드)", width: 36 }
    ],
    // 작업자 목록
    users: [
      { key: "empNo", label: "멤버 ID(ID)", width: 16 },
      { key: "name", label: "성명", width: 16 },
      { key: "role", label: "권한등급(SYS_ADMIN/PM/LEAD/MEMBER)", width: 30 },
      { key: "subsystem", label: "담당서브시스템", width: 18 },
      { key: "dept", label: "소속부서/담당역할", width: 38 },
      { key: "lang", label: "언어(ko/en)", width: 12 }
    ],
    subsystems: [
      { key: "domain", label: "도메인(상위그룹)", width: 18 },
      { key: "code", label: "서브시스템코드", width: 18 },
      { key: "name", label: "서브시스템명", width: 20 },
      { key: "type", label: "프로젝트유형(SDLC/REQ)", width: 22 },
      { key: "sdlcCode", label: "SDLC타입코드", width: 16 },
      { key: "weight", label: "가중치(%)", width: 12 },
      { key: "pm", label: "담당자", width: 14 },
      { key: "desc", label: "Task개요", width: 42 }
    ],
    wbs: [
      { key: "id", label: "WBS ID", width: 12 },
      { key: "level", label: "레벨", width: 8 },
      { key: "system", label: "서브시스템", width: 16 },
      { key: "name", label: "작업명", width: 34 },
      { key: "weight", label: "가중치(%)", width: 12 },
      { key: "reqId", label: "요구사항 ID", width: 16 },
      { key: "pStart", label: "계획시작일", width: 16 },
      { key: "pEnd", label: "계획종료일", width: 16 },
      { key: "aStart", label: "실제 시작일", width: 16 },
      { key: "aEnd", label: "실제 종료일", width: 16 },
      { key: "pProg", label: "계획(%)", width: 11 },
      { key: "aProg", label: "실적(%)", width: 11 },
      { key: "owner", label: "담당자", width: 14 },
      { key: "output", label: "산출물 / 조치계획", width: 24 },
      { key: "bStart", label: "기준선 시작일", width: 16 },
      { key: "bEnd", label: "기준선 종료일", width: 16 }
    ],
    deliverables: [
      { key: "round", label: "제출 차수", width: 12 },
      { key: "system", label: "서브시스템", width: 16 },
      { key: "phase", label: "단계구분", width: 16 },
      { key: "name", label: "산출물명", width: 32 },
      { key: "pDate", label: "계획제출일", width: 16 },
      { key: "aDate", label: "실제제출일", width: 16 },
      { key: "status", label: "진행상태", width: 14 },
      { key: "manager", label: "담당자", width: 14 },
      { key: "remarks", label: "검토의견 및 조치내역", width: 36 }
    ],
    req: [
      { key: "id", label: "요구사항 ID", width: 16 },
      { key: "system", label: "서브시스템", width: 16 },
      { key: "name", label: "요구사항 명칭", width: 36 },
      { key: "type", label: "유형", width: 14 },
      { key: "priority", label: "중요도", width: 12 },
      { key: "accept", label: "수용여부", width: 12 },
      { key: "status", label: "진행상태", width: 14 },
      { key: "origin", label: "구분(초기/추가)", width: 12 },
      { key: "srcVoc", label: "출처 VOC", width: 14 },
      { key: "addedDate", label: "추가 등록일", width: 14 }
    ],
    voc: [
      { key: "id", label: "VOC ID", width: 14 },
      { key: "stage", label: "단계", width: 16 },
      { key: "vocType", label: "판정", width: 12 },
      { key: "severity", label: "심각도", width: 10 },
      { key: "system", label: "서브시스템", width: 16 },
      { key: "priority", label: "우선순위", width: 12 },
      { key: "title", label: "요청제목", width: 36 },
      { key: "requester", label: "요청자", width: 14 },
      { key: "reqDate", label: "접수일자", width: 16 },
      { key: "targetDate", label: "목표완료일", width: 16 },
      { key: "status", label: "처리상태", width: 14 },
      { key: "action", label: "처리결과 및 조치계획", width: 36 },
      { key: "closedDate", label: "종료일", width: 14 },
      { key: "reqLink", label: "연결 요구사항", width: 14 }
    ]
  },

  SECTION_META: [
    { key: "wbs", sheetName: "1_WBS공정표", title: "1. WBS 공정표 데이터 (WBS Master)" },
    { key: "subsystems", sheetName: "2_서브시스템기준정보", title: "2. 서브시스템 기준정보 (Subsystems Meta)" },
    { key: "deliverables", sheetName: "3_산출물관리", title: "3. 산출물 관리 데이터 (Deliverables 1~4차)" },
    { key: "req", sheetName: "4_요구사항REQ", title: "4. 요구사항 관리 데이터 (Requirements REQ)" },
    { key: "voc", sheetName: "5_VOC이슈관리", title: "5. 추가 VOC 및 이슈 관리 데이터 (VOC List)" }
  ],

  // 헤더 별칭 매핑 (화면 테이블 복사본이나 변형된 헤더도 자동 인식)
  HEADER_ALIASES: {
    users: {
      empNo: ["멤버 ID(id)", "멤버 ID", "멤버 ID (멤버 선택 id)", "작업자 ID(id)", "작업자 ID", "작업자 ID (작업자 선택 id)", "id", "empno"],
      name: ["성명", "이름", "작업자명", "사용자명", "name"],
      role: ["권한등급(sys_admin/pm/lead/member)", "권한등급(sys_admin/pm/member)", "권한등급", "권한", "시스템 권한 등급", "role"],
      subsystem: ["담당서브시스템", "담당 서브시스템", "서브시스템", "subsystem"],
      dept: ["소속부서/담당역할", "소속 부서 / 담당 역할", "부서", "역할", "dept"],
      lang: ["언어(ko/en)", "언어", "language", "lang"]
    },
    config: {
      category: ["설정구분", "구분", "카테고리", "category"],
      key: ["설정키/코드", "설정키", "코드", "key"],
      value: ["설정값/명칭", "설정값", "명칭", "value"],
      extra1: ["세부속성1(가중치/요일)", "세부속성1", "extra1"],
      extra2: ["세부속성2(산출물/비고)", "세부속성2", "extra2"],
      extra3: ["세부속성3(매칭키워드)", "세부속성3", "extra3"]
    },
    subsystems: {
      domain: ["분야", "분야(상위그룹)", "상위분야", "그룹", "도메인", "domain"],
      code: ["서브시스템코드", "코드", "서브시스템 코드/명", "code"],
      name: ["서브시스템명", "서브시스템", "시스템명", "name"],
      type: ["프로젝트유형(sdlc/req)", "프로젝트유형", "프로젝트 관리 유형", "유형", "type"],
      sdlcCode: ["sdlc타입코드", "sdlc코드", "sdlc타입", "sdlccode"],
      weight: ["가중치(%)", "가중치", "weight"],
      pm: ["담당자", "담당자/pm", "pm", "담당pm"],
      desc: ["과업개요", "서브시스템 개요 및 과업 범위", "개요", "설명", "desc"]
    },
    wbs: {
      id: ["wbs id", "wbsid", "id", "번호"],
      level: ["레벨", "레벨 / 단계이동", "level", "lvl", "단계레벨"],
      system: ["서브시스템", "서브시스템 (l1)", "서브시스템(l1)", "서브시스템명", "system"],
      name: ["작업명", "Task명", "태스크명", "task", "name"],
      weight: ["가중치(%)", "가중치", "weight"],
      reqId: ["요구사항 id", "요구사항id", "req id", "reqid"],
      pStart: ["계획시작일", "계획시작", "계획 시작일", "pstart"],
      pEnd: ["계획종료일", "계획종료", "계획 종료일", "pend"],
      aStart: ["실적시작일", "실적시작", "실적 시작일", "astart"],
      aEnd: ["실적종료일", "실적종료", "실적 종료일", "aend"],
      pProg: ["계획(%)", "계획진척율", "계획진척률", "계획", "pprog"],
      aProg: ["실적(%)", "실적진척율", "실적진척률", "실적", "aprog"],
      owner: ["담당자", "담당", "owner", "assignee"],
      output: ["산출물 / 조치계획", "산출물/조치계획", "산출물", "조치계획", " 비고", "output"]
    },
    deliverables: {
      round: ["제출차수", "제출 차수", "차수", "round"],
      system: ["서브시스템", "서브시스템명", "구분", "system"],
      phase: ["단계구분", "단계 구분", "단계", "phase"],
      name: ["산출물명", "산출물 명칭", "name"],
      pDate: ["계획제출일", "계획일자", "계획일", "pdate"],
      aDate: ["실제제출일", "실제일자", "실제일", "제출일", "adate"],
      status: ["진행상태", "진행 상태", "상태", "status"],
      manager: ["담당자", "작성자", "manager"],
      remarks: ["검토의견 및 조치내역", "검토 의견 및 보완 조치내역", "검토의견", "비고", "remarks"]
    },
    req: {
      id: ["요구사항 id", "요구사항id", "req id", "id"],
      system: ["서브시스템", "서브시스템명", "system"],
      name: ["요구사항 명칭", "요구사항 명칭 / 명세", "요구사항명", "개선 요건 명칭 및 과업", "name"],
      type: ["유형", "구분", "type"],
      priority: ["중요도", "우선순위", "priority"],
      accept: ["수용여부", "수용 여부", "accept"],
      status: ["진행상태", "진행 상태", "상태", "요건 상태", "status"],
      origin: ["구분(초기/추가)", "초기/추가", "origin"],
      srcVoc: ["출처 voc", "출처voc", "srcvoc"],
      addedDate: ["추가 등록일", "추가등록일", "addeddate"]
    },
    voc: {
      id: ["voc id", "vocid", "id"],
      vocType: ["판정", "구분", "유형", "type"],
      stage: ["단계", "발생 단계", "stage"],
      severity: ["심각도", "severity"],
      closedDate: ["종료일", "해결일", "closeddate"],
      reqLink: ["연결 요구사항", "연결 req", "reqlink"],
      system: ["서브시스템", "서브시스템명", "system"],
      priority: ["우선순위", "중요도", "priority"],
      title: ["요청제목", "요청 제목 / 이슈 내용", "제목", "이슈내용", "title"],
      requester: ["요청자", "요청부서", "requester"],
      reqDate: ["접수일자", "접수일", "요청일", "reqdate"],
      targetDate: ["목표완료일", "목표일자", "완료목표일", "targetdate"],
      status: ["처리상태", "처리 상태", "상태", "status"],
      action: ["처리결과 및 조치계획", "조치계획", "처리결과", "비고", "action"]
    }
  },

  // 무시할 UI 전용 계산 컬럼 (화면 표 복사 시 자동 스킵)
  IGNORED_HEADERS: new Set([
    "삭제", "하위·동위 추가 / 순서 / 삭제", "연계 Task 수", "실적 진척률", "평균 실적(%)", "기준선 시작일", "기준선 종료일"
  ]),


  normalizeDate(val) {
    if (val === null || val === undefined) return "";
    const str = String(val).trim();
    if (!str || str === "-") return "";
    const m = str.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
    if (/^\d{5}(\.\d+)?$/.test(str)) {
      const serial = parseFloat(str);
      if (serial > 30000 && serial < 70000) {
        const utcDays = Math.floor(serial - 25569);
        const d = new Date(utcDays * 86400 * 1000);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      }
    }
    return str;
  },

  // [보안 강화] 엑셀 수식/DDE 인젝션(=, +, -, @로 시작하는 악성 명령어) 방어
  sanitizeFormulaInjection(val) {
    if (typeof val !== "string" || !val) return val;
    if (/^[=+@]/.test(val) || (/^-[a-zA-Z]/.test(val))) {
      return "'" + val;
    }
    return val;
  },

  formatExportCell(tabKey, colKey, rawVal) {
    let val = rawVal !== undefined && rawVal !== null ? rawVal : "";
    if (
      (colKey.includes("Date") ||
        colKey === "pStart" ||
        colKey === "pEnd" ||
        colKey === "aStart" ||
        colKey === "aEnd" ||
        colKey === "bStart" ||
        colKey === "bEnd") &&
      val
    ) {
      const cleanDate = this.normalizeDate(val);
      const day = typeof WBSEngine !== "undefined" ? WBSEngine.getDayOfWeekText(cleanDate) : "";
      val = day ? `${cleanDate} (${day})` : cleanDate;
    }
    return this.sanitizeFormulaInjection(val);
  },

  getTabData(tabKey) {
    if (tabKey === "wbs") return wbsData;
    if (tabKey === "deliverables") return deliverablesData;
    if (tabKey === "req") return reqMasterData;
    if (tabKey === "voc") return vocData;
    if (tabKey === "subsystems") return subsystemsMeta;
    return [];
  },

  _crc32(bytes) {
    const table = this._getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  },

  _triggerDownload(blob, filename) {
    // 윈도우 파일명 금지문자 치환 및 다운로드 안정화
    const safeName = String(filename || "download").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, " ").trim() || "download";
    // [Local] 자료 파일을 PC 에 받은 때를 기억 (백업 알림용)
    if (/백업|종합본|마스터|자료|내변경|작업|프로젝트|latest/.test(safeName) && typeof AppStore !== "undefined") { try { AppStore.setItem("PPRJMGMT_LAST_FILE_SAVE", String(Date.now())); } catch (e) {} }
    if (typeof window !== "undefined" && window.navigator && typeof window.navigator.msSaveOrOpenBlob === "function") {
      window.navigator.msSaveOrOpenBlob(blob, safeName);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  },

  // ---------------------------------------------------------------------------
  // 2. 엑셀 내려받기 (단일 탭 & 마스터 통합본 - 표준 .xlsx 워크북 출력)
  // ---------------------------------------------------------------------------
  exportMasterWorkbook() {
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2026-11-04";

    // 시트 1: 통합 마스터 시트 (5개 섹션을 한 시트에서도 볼 수 있고, 개별 시트로도 분리 제공)
    const masterRows = [];
    this.SECTION_META.forEach((sec) => {
      const schema = this.TAB_SCHEMAS[sec.key];
      const data = this.getTabData(sec.key);

      masterRows.push({ cells: [sec.title], styleId: 3, height: 28 });
      masterRows.push({ cells: schema.map((c) => c.label), styleId: 1, height: 24 });

      data.forEach((r) => {
        const rowCells = schema.map((c) => {
          if (
            (sec.key === "wbs" && (c.key === "level" || c.key === "weight" || c.key === "pProg" || c.key === "aProg")) ||
            (sec.key === "subsystems" && c.key === "weight")
          ) {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return this.formatExportCell(sec.key, c.key, r[c.key]);
        });
        masterRows.push({ cells: rowCells, styleId: 2, height: 20 });
      });

      masterRows.push({ cells: [], styleId: 0, height: 14 });
    });

    const sheets = [
      {
        name: "0_마스터_통합본",
        colWidths: this.TAB_SCHEMAS.wbs.map((c) => c.width || 16),
        rows: masterRows
      }
    ];

    // 개별 탭 시트도 함께 추가하여 엑셀에서 시트별로도 편집 가능하도록 구성
    this.SECTION_META.forEach((sec) => {
      const schema = this.TAB_SCHEMAS[sec.key];
      const data = this.getTabData(sec.key);
      const sheetRows = [
        { cells: schema.map((c) => c.label), styleId: 1, height: 25 }
      ];
      data.forEach((r) => {
        const rowCells = schema.map((c) => {
          if (
            (sec.key === "wbs" && (c.key === "level" || c.key === "weight" || c.key === "pProg" || c.key === "aProg")) ||
            (sec.key === "subsystems" && c.key === "weight")
          ) {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return this.formatExportCell(sec.key, c.key, r[c.key]);
        });
        sheetRows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({
        name: sec.sheetName,
        colWidths: schema.map((c) => c.width || 16),
        rows: sheetRows
      });
    });

    const blob = this._buildXlsxBlob(sheets);
    this._triggerDownload(blob, this.stdName("전체데이터", [], "xlsx"));
  },

  // ---------------------------------------------------------------------------
  // 5. 엑셀 올리기 핸들러 (통합 마스터 워크북 & 개별 탭 업로드)
  // ---------------------------------------------------------------------------
  // 서브시스템별 전용 엑셀(.xlsx) 다운로드
  exportSubsystemWorkbook(targetSysArg) {
    const selEl = document.getElementById("excelSubsysExportSelect");
    const targetSys = targetSysArg || (selEl ? selEl.value : "");
    if (!targetSys || targetSys === "ALL") {
      this.exportMasterWorkbook();
      return;
    }
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) ? projectConfig.reportDate : "2026-11-06";
    const subCode = (typeof WBSEngine !== "undefined" && WBSEngine.getSubsystemCode) ? WBSEngine.getSubsystemCode(targetSys) : targetSys;

    const filterBySys = (tabKey) => {
      if (tabKey === "subsystems") return subsystemsMeta.filter(s => s.name === targetSys);
      if (tabKey === "wbs") return wbsData.filter(d => d.system === targetSys);
      if (tabKey === "deliverables") return deliverablesData.filter(d => d.system === targetSys);
      if (tabKey === "req") return reqMasterData.filter(r => r.system === targetSys);
      if (tabKey === "voc") return vocData.filter(v => v.system === targetSys);
      return [];
    };

    const sheets = this.SECTION_META.map((sec) => {
      const schema = this.TAB_SCHEMAS[sec.key];
      const records = filterBySys(sec.key);
      const sheetRows = [
        { cells: [`[${targetSys}] ${sec.title} (기준일: ${repDate})`], styleId: 3, height: 26 },
        { cells: schema.map((c) => c.label), styleId: 1, height: 24 }
      ];
      records.forEach((rec) => {
        const rowCells = schema.map((c) => (rec[c.key] !== undefined && rec[c.key] !== null ? rec[c.key] : ""));
        const isRoot = sec.key === "wbs" && Number(rec.level) === 1;
        sheetRows.push({ cells: rowCells, styleId: isRoot ? 3 : 2, height: 20 });
      });
      return {
        name: sec.sheetName,
        colWidths: schema.map((c) => c.width || 16),
        rows: sheetRows
      };
    });

    const blob = this._buildXlsxBlob(sheets);
    const filename = ExcelSync.stdName("서브시스템", [subCode], "xlsx");
    this._triggerDownload(blob, filename);
    if (typeof showToast === "function") {
      showToast(`[${targetSys} 엑셀 다운로드 완료] ${filename} 파일이 생성되었습니다. 엑셀에서 수정 후 업로드하면 해당 서브시스템에 바로 반영됩니다.`);
    }
  },
};
