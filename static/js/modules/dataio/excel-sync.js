const ExcelSync = {
  // =========================================================================
  // [ver1.0 요건] Excel & Word DOCX 통합 시각 테마 및 폰트 팔레트
  // =========================================================================
  EXPORT_THEMES: ["Official Navy", "Office Blue", "Office Gray", "Office Green", "Matte Slate"],
  // [v3.3.0] 내려받는 파일 이름 표준: {파일약칭}_{대상}[_범위…]_{기준일 yyyyMMdd}.{확장자}
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
    if (/Matte|Brown|Mocha|Sepia/i.test(r)) return "Matte Slate";
    if (/Sky|Ocean|Office Blue/i.test(r)) return "Office Blue";
    if (/Mint|Emerald|Teal|Green/i.test(r)) return "Office Green";
    if (/Charcoal|Slate|Gray|Grey/i.test(r)) return "Office Gray";
    return "Official Navy";
  },
  getExportThemePalette() {
    const expCfg = (typeof projectConfig !== "undefined" && projectConfig.exportSettings) ? projectConfig.exportSettings : {};
    // Unified export theme takes absolute precedence
    const rawTheme = expCfg.exportTheme || expCfg.unifiedTheme || expCfg.xlsxTheme || expCfg.docxTheme || "Official Blue";
    const fontSize = parseInt(expCfg.exportFontSize || expCfg.docxFontSize || expCfg.xlsxFontSize, 10) || 10;
    const fontName = expCfg.exportFont || expCfg.docxFont || expCfg.xlsxFont || "맑은 고딕";

    // [v3.1.0] 보고서 테마 5가지 (시중 보고서에서 흔히 쓰는 4가지 + 화면 Matte 테마와 비슷한 무광 1가지)
    //  예전 테마 이름은 가까운 테마로 바꿔 씀
    const THEMES = {
      "Official Navy": { primary: "1E3A8A", secondary: "2563EB", accent: "0284C7", headerBg: "1E3A8A", subHeaderBg: "EEF2F8", border: "B4C2DC", headerTextColor: "FFFFFF" },
      "Office Blue":   { primary: "2F5597", secondary: "4472C4", accent: "5B9BD5", headerBg: "4472C4", subHeaderBg: "DDEBF7", border: "9BC2E6", headerTextColor: "FFFFFF" },
      "Office Gray":   { primary: "3A3A3A", secondary: "595959", accent: "7F7F7F", headerBg: "595959", subHeaderBg: "F2F2F2", border: "BFBFBF", headerTextColor: "FFFFFF" },
      "Office Green":  { primary: "375623", secondary: "548235", accent: "70AD47", headerBg: "548235", subHeaderBg: "E2EFDA", border: "A9D08E", headerTextColor: "FFFFFF" },
      "Matte Slate":   { primary: "3E4A55", secondary: "4F6475", accent: "6F8597", headerBg: "4F6475", subHeaderBg: "ECEAE5", border: "D3D0C9", headerTextColor: "FFFFFF" }
    };
    const themeName = this.normalizeExportTheme(rawTheme);
    const t = THEMES[themeName];
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
      { key: "output", label: "산출물 / 조치계획", width: 24 }
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
      { key: "status", label: "진행상태", width: 14 }
    ],
    voc: [
      { key: "id", label: "VOC ID", width: 14 },
      { key: "system", label: "서브시스템", width: 16 },
      { key: "priority", label: "우선순위", width: 12 },
      { key: "title", label: "요청제목", width: 36 },
      { key: "requester", label: "요청자", width: 14 },
      { key: "reqDate", label: "접수일자", width: 16 },
      { key: "targetDate", label: "목표완료일", width: 16 },
      { key: "status", label: "처리상태", width: 14 },
      { key: "action", label: "처리결과 및 조치계획", width: 36 }
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
      empNo: ["작업자 ID(id)", "작업자 ID", "작업자 ID (작업자 선택 id)", "id", "empno"],
      name: ["성명", "이름", "작업자명", "name"],
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
      status: ["진행상태", "진행 상태", "상태", "요건 상태", "status"]
    },
    voc: {
      id: ["voc id", "vocid", "id"],
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
    "삭제", "하위·동위 추가 / 순서 / 삭제", "연계 Task 수", "실적 진척률", "평균 실적(%)"
  ]),

  escapeXml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  },

  escapeHtmlText(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

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
        colKey === "aEnd") &&
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

  // ---------------------------------------------------------------------------
  // 1. 순수 JS 기반 표준 .xlsx (OpenXML ZIP) 생성기 (외부 라이브러리 불필요)
  // ---------------------------------------------------------------------------
  _crcTable: null,
  _getCrcTable() {
    if (this._crcTable) return this._crcTable;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    this._crcTable = table;
    return table;
  },

  _crc32(bytes) {
    const table = this._getCrcTable();
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  },

  // ---------------------------------------------------------------------------
  // [v1.0.5 버그수정] Word(DOCX) OpenXML 스키마 정규화
  //  - MS Word는 스키마 순서/요소에 엄격하여 "읽을 수 없는 내용" 오류로 파일을 열지 못함
  //  - 잘못된 <w:line> 요소 → <w:spacing w:line> 속성으로 병합
  //  - pPr / rPr / tcPr / tblPr / tblBorders / pBdr / trPr 자식 요소를 스키마 순서로 재정렬
  //  - 앞뒤 공백이 있는 <w:t>에 xml:space="preserve" 부여
  // ---------------------------------------------------------------------------
  _WORD_CHILD_ORDER: {
    pPr: "pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange",
    rPr: "rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath",
    tcPr: "cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark",
    tblPr: "tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing tblInd tblBorders shd tblLayout tblCellMar tblLook",
    tblBorders: "top left start bottom right end insideH insideV",
    tcBorders: "top left start bottom right end insideH insideV tl2br tr2bl",
    pBdr: "top left bottom right between bar",
    trPr: "cnfStyle divId gridBefore gridAfter wBefore wAfter cantSplit trHeight tblHeader tblCellSpacing jc hidden"
  },

  _normalizeWordXml(xml) {
    if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") return xml;
    try {
      const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length > 0) return xml;

      // 1) 비표준 <w:line> → 형제 <w:spacing>의 line/lineRule 속성으로 병합
      Array.from(doc.getElementsByTagNameNS(W, "line")).forEach(lineEl => {
        const parent = lineEl.parentNode;
        if (parent && parent.localName === "pPr") {
          let spacing = Array.from(parent.childNodes).find(c => c.nodeType === 1 && c.localName === "spacing");
          if (!spacing) {
            spacing = doc.createElementNS(W, "w:spacing");
            parent.appendChild(spacing);
          }
          const lv = lineEl.getAttributeNS(W, "line") || lineEl.getAttribute("w:line");
          const lr = lineEl.getAttributeNS(W, "lineRule") || lineEl.getAttribute("w:lineRule");
          if (lv && !spacing.getAttribute("w:line")) spacing.setAttributeNS(W, "w:line", lv);
          if (lr && !spacing.getAttribute("w:lineRule")) spacing.setAttributeNS(W, "w:lineRule", lr);
        }
        if (parent) parent.removeChild(lineEl);
      });

      // 2) 스키마 순서 재정렬 (중복 요소는 첫 번째만 유지)
      Object.keys(this._WORD_CHILD_ORDER).forEach(tag => {
        const order = this._WORD_CHILD_ORDER[tag].split(" ");
        Array.from(doc.getElementsByTagNameNS(W, tag)).forEach(el => {
          const kids = Array.from(el.childNodes).filter(c => c.nodeType === 1);
          const seen = {};
          const kept = [];
          kids.forEach(k => {
            el.removeChild(k);
            if (k.namespaceURI === W && seen[k.localName]) return;
            seen[k.localName] = true;
            kept.push(k);
          });
          Array.from(el.childNodes).forEach(c => el.removeChild(c)); // 공백 텍스트 노드 제거
          kept.sort((a, b) => {
            const ia = order.indexOf(a.localName);
            const ib = order.indexOf(b.localName);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });
          kept.forEach(k => el.appendChild(k));
        });
      });

      // 3) 앞뒤 공백 보존
      Array.from(doc.getElementsByTagNameNS(W, "t")).forEach(t => {
        const txt = t.textContent || "";
        if (txt !== txt.trim()) t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
      });

      let out = new XMLSerializer().serializeToString(doc);
      if (!/^<\?xml/.test(out)) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + out;
      return out;
    } catch (e) {
      console.warn("DOCX XML 정규화 실패(원본 사용):", e);
      return xml;
    }
  },

  _createZipBlob(files, mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    if (/wordprocessingml/.test(mimeType)) {
      files = files.map(f => (typeof f.content === "string" && /^word\/.*\.xml$/.test(f.name))
        ? { name: f.name, content: this._normalizeWordXml(f.content.trim()) }
        : (typeof f.content === "string" ? { name: f.name, content: f.content.trim() } : f));
    }
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((f) => {
      const nameBytes = encoder.encode(f.name);
      const dataBytes = typeof f.content === "string" ? encoder.encode(f.content) : f.content;
      const crc = this._crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 flag
      lv.setUint16(8, 0, true); // Store (no compression)
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, dataBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + size;
    });

    const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], {
      type: mimeType
    });
  },

  _colIndexToLetter(idx) {
    let s = "";
    let n = idx + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  },

  _colLetterToIndex(letters) {
    let n = 0;
    for (let i = 0; i < letters.length; i++) {
      n = n * 26 + (letters.charCodeAt(i) - 64);
    }
    return n - 1;
  },

    _buildSheetXml(rows, colWidths = [], merges = []) {
    let colsXml = "";
    if (colWidths.length > 0) {
      colsXml =
        "<cols>" +
        colWidths
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join("") +
        "</cols>";
    }

    let sheetDataXml = "<sheetData>";
    rows.forEach((rowObj, rIdx) => {
      const rowNum = rIdx + 1;
      const cells = rowObj.cells || [];
      const styleId = rowObj.styleId || 0;
      const ht = rowObj.height ? ` ht="${rowObj.height}" customHeight="1"` : "";
      sheetDataXml += `<row r="${rowNum}"${ht}>`;
      cells.forEach((cellVal, cIdx) => {
        const ref = `${this._colIndexToLetter(cIdx)}${rowNum}`;
        const sAttr = styleId ? ` s="${styleId}"` : "";
        if (typeof cellVal === "number" && !isNaN(cellVal)) {
          sheetDataXml += `<c r="${ref}"${sAttr}><v>${cellVal}</v></c>`;
        } else {
          const text = cellVal !== undefined && cellVal !== null ? String(cellVal) : "";
          sheetDataXml += `<c r="${ref}" t="inlineStr"${sAttr}><is><t xml:space="preserve">${this.escapeXml(text)}</t></is></c>`;
        }
      });
      sheetDataXml += `</row>`;
    });
    sheetDataXml += "</sheetData>";

    let mergesXml = "";
    if (Array.isArray(merges) && merges.length > 0) {
      mergesXml = `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  ${sheetDataXml}
  ${mergesXml}
</worksheet>`;
  },

  _buildXlsxBlob(sheets) {
    const files = [];

    const overrides = sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("");

    files.push({
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${overrides}
</Types>`
    });

    files.push({
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    });

    const sheetTags = sheets
      .map(
        (s, i) =>
          `<sheet name="${this.escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
      )
      .join("");

    files.push({
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetTags}</sheets>
</workbook>`
    });

    const relTags = sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("");

    files.push({
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${relTags}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    });

    const pal = this.getExportThemePalette();
    files.push({
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="${pal.fontSize}"/><color rgb="FF1E293B"/><name val="${pal.fontName}"/></font>
    <font><b/><sz val="${pal.fontSize + 0.5}"/><color rgb="FF${pal.headerTextColor}"/><name val="${pal.fontName}"/></font>
    <font><b/><sz val="${pal.fontSize + 2}"/><color rgb="FF${pal.headerTextColor}"/><name val="${pal.fontName}"/></font>
    <font><b/><sz val="${pal.fontSize}"/><color rgb="FF${pal.primary}"/><name val="${pal.fontName}"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${pal.headerBg}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${pal.primary}"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${pal.subHeaderBg}"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF${pal.border}"/></left>
      <right style="thin"><color rgb="FF${pal.border}"/></right>
      <top style="thin"><color rgb="FF${pal.border}"/></top>
      <bottom style="thin"><color rgb="FF${pal.border}"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="49" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    });

    sheets.forEach((s, i) => {
      files.push({
        name: `xl/worksheets/sheet${i + 1}.xml`,
        content: this._buildSheetXml(s.rows, s.colWidths, s.merges || [])
      });
    });

    return this._createZipBlob(files);
  },

  _triggerDownload(blob, filename) {
    // [v1.0.5] 윈도우 파일명 금지문자 치환 및 다운로드 안정화
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

  exportTab(tabKey) {
    const schema = this.TAB_SCHEMAS[tabKey];
    if (!schema) return;
    const data = this.getTabData(tabKey);
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2026-11-04";

    const rows = [
      { cells: schema.map((c) => c.label), styleId: 1, height: 25 }
    ];

    data.forEach((r) => {
      const rowCells = schema.map((c) => {
        if (
          (tabKey === "wbs" && (c.key === "level" || c.key === "weight" || c.key === "pProg" || c.key === "aProg")) ||
          (tabKey === "subsystems" && c.key === "weight")
        ) {
          const num = parseFloat(r[c.key]);
          return isNaN(num) ? 0 : num;
        }
        return this.formatExportCell(tabKey, c.key, r[c.key]);
      });
      rows.push({ cells: rowCells, styleId: 2, height: 20 });
    });

    const secMeta = this.SECTION_META.find((s) => s.key === tabKey);
    const sheetName = secMeta ? secMeta.sheetName : tabKey.toUpperCase();

    const blob = this._buildXlsxBlob([
      {
        name: sheetName,
        colWidths: schema.map((c) => c.width || 16),
        rows: rows
      }
    ]);
    this._triggerDownload(blob, this.stdName({ wbs: "WBS", req: "요구사항", voc: "VOC", deliverables: "산출물", users: "멤버", subsystems: "서브시스템", config: "프로젝트 설정" }[tabKey] || tabKey, [], "xlsx"));
  },

  // ---------------------------------------------------------------------------
  // 3. 멀티 포맷 파서 (.xlsx / HTML .xls / XML .xls / .csv / .tsv 모두 지원)
  // ---------------------------------------------------------------------------
  async _parseUploadedFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1) ZIP 시그니처 확인 (PK\x03\x04 -> 표준 .xlsx 파일)
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return await this._parseXlsxBuffer(buffer);
    }

    // 2) 텍스트 기반 파일 (HTML .xls, XML .xls, .csv, .tsv) - UTF-8 및 EUC-KR 자동 감지
    let text = "";
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (_) {
      try {
        text = new TextDecoder("euc-kr").decode(buffer);
      } catch (e2) {
        text = new TextDecoder("utf-8").decode(buffer);
      }
    }
    text = text.replace(/^\uFEFF/, "");

    if (/<Workbook[\s>]/i.test(text) && /<Row[\s>]/i.test(text)) {
      return this._parseSpreadsheetMl(text);
    }
    if (/<table[\s>]|<tr[\s>]|<td[\s>]/i.test(text)) {
      return this._parseHtmlTables(text);
    }
    return [{ name: "CSV", rows: this._parseCsv(text) }];
  },

  async _parseXlsxBuffer(buffer) {
    const entries = await this._unzipEntries(buffer);
    const decoder = new TextDecoder("utf-8");
    const getXmlText = (path) => {
      const clean = path.replace(/^\/+/, "");
      return entries[clean] ? decoder.decode(entries[clean]) : null;
    };

    // sharedStrings.xml 파싱
    const sharedStrings = [];
    const sstText = getXmlText("xl/sharedStrings.xml");
    if (sstText) {
      const siMatches = sstText.match(/<si[\s>][\s\S]*?<\/si>/gi) || [];
      siMatches.forEach((si) => {
        const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi) || [];
        const combined = tMatches
          .map((t) => t.replace(/<[^>]+>/g, ""))
          .join("");
        sharedStrings.push(this._unescapeXml(combined));
      });
    }

    // workbook.xml & workbook.xml.rels로 시트 목록 확인
    const sheetFiles = [];
    const wbText = getXmlText("xl/workbook.xml");
    const relsText = getXmlText("xl/_rels/workbook.xml.rels");
    const relMap = {};
    if (relsText) {
      const relMatches = relsText.match(/<Relationship\b[^>]*\/?>/gi) || [];
      relMatches.forEach((rel) => {
        const idM = rel.match(/\bId="([^"]+)"/i);
        const targetM = rel.match(/\bTarget="([^"]+)"/i);
        if (idM && targetM) {
          let t = targetM[1].replace(/^\/+/, "");
          if (!t.startsWith("xl/")) t = "xl/" + t.replace(/^\.\//, "");
          relMap[idM[1]] = t;
        }
      });
    }

    if (wbText) {
      const shMatches = wbText.match(/<sheet\b[^>]*\/?>/gi) || [];
      shMatches.forEach((sh, idx) => {
        const nameM = sh.match(/\bname="([^"]+)"/i);
        const rIdM = sh.match(/\br:id="([^"]+)"/i);
        const name = nameM ? this._unescapeXml(nameM[1]) : `Sheet${idx + 1}`;
        const path = (rIdM && relMap[rIdM[1]]) || `xl/worksheets/sheet${idx + 1}.xml`;
        if (getXmlText(path)) {
          sheetFiles.push({ name, path });
        }
      });
    }

    if (sheetFiles.length === 0) {
      Object.keys(entries)
        .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
        .sort()
        .forEach((path, idx) => {
          sheetFiles.push({ name: `Sheet${idx + 1}`, path });
        });
    }

    const sheets = [];
    sheetFiles.forEach((sf) => {
      const xml = getXmlText(sf.path);
      if (!xml) return;
      const rows = [];
      const rowMatches = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) || [];
      rowMatches.forEach((rowXml) => {
        const rowCells = [];
        const cellMatches = rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/gi) || [];
        let nextColIdx = 0;
        cellMatches.forEach((cellXml) => {
          const rMatch = cellXml.match(/\br="([A-Z]+)\d+"/i);
          const colIdx = rMatch ? this._colLetterToIndex(rMatch[1].toUpperCase()) : nextColIdx;
          nextColIdx = colIdx + 1;

          const typeMatch = cellXml.match(/\bt="([^"]+)"/i);
          const cellType = typeMatch ? typeMatch[1] : "n";

          let val = "";
          if (cellType === "inlineStr") {
            const tMatches = cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi) || [];
            val = this._unescapeXml(tMatches.map((t) => t.replace(/<[^>]+>/g, "")).join(""));
          } else {
            const vMatch = cellXml.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i);
            const rawV = vMatch ? this._unescapeXml(vMatch[1].trim()) : "";
            if (cellType === "s") {
              const sIdx = parseInt(rawV, 10);
              val = !isNaN(sIdx) && sharedStrings[sIdx] !== undefined ? sharedStrings[sIdx] : rawV;
            } else {
              val = rawV;
            }
          }
          while (rowCells.length < colIdx) rowCells.push("");
          rowCells[colIdx] = String(val).trim();
        });
        if (rowCells.some((c) => c !== "")) {
          rows.push(rowCells);
        }
      });
      sheets.push({ name: sf.name, rows });
    });

    return sheets;
  },

  async _unzipEntries(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder("utf-8");
    const entries = {};

    // End of Central Directory (EOCD) 역방향 탐색
    let eocdOffset = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset >= 0) {
      const totalEntries = view.getUint16(eocdOffset + 10, true);
      const cdOffset = view.getUint32(eocdOffset + 16, true);
      let ptr = cdOffset;
      for (let i = 0; i < totalEntries && ptr + 46 <= bytes.length; i++) {
        if (view.getUint32(ptr, true) !== 0x02014b50) break;
        const method = view.getUint16(ptr + 10, true);
        const compSize = view.getUint32(ptr + 20, true);
        const nameLen = view.getUint16(ptr + 28, true);
        const extraLen = view.getUint16(ptr + 30, true);
        const commentLen = view.getUint16(ptr + 32, true);
        const localOffset = view.getUint32(ptr + 42, true);
        const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
        ptr += 46 + nameLen + extraLen + commentLen;

        if (localOffset + 30 <= bytes.length && view.getUint32(localOffset, true) === 0x04034b50) {
          const lNameLen = view.getUint16(localOffset + 26, true);
          const lExtraLen = view.getUint16(localOffset + 28, true);
          const dataStart = localOffset + 30 + lNameLen + lExtraLen;
          const compData = bytes.subarray(dataStart, dataStart + compSize);
          if (method === 0) {
            entries[name] = compData;
          } else if (method === 8) {
            entries[name] = await this._inflateRaw(compData);
          }
        }
      }
    }
    return entries;
  },

  async _inflateRaw(compData) {
    if (typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(compData);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      chunks.forEach((c) => {
        out.set(c, offset);
        offset += c.length;
      });
      return out;
    }
    return new Uint8Array(0);
  },

  _unescapeXml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&");
  },

  _parseHtmlTables(htmlText) {
    const rows = [];
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(htmlText, "text/html");
      const trs = doc.querySelectorAll("tr");
      trs.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td")).map((cell) =>
          (cell.textContent || "").replace(/\s+/g, " ").trim()
        );
        if (cells.some((c) => c !== "")) {
          rows.push(cells);
        }
      });
    } else {
      // Node.js 또는 DOMParser 미지원 환경 폴백: 멀티라인 <tr> 블록 정규식 파싱
      const trMatches = htmlText.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
      trMatches.forEach((trHtml) => {
        const cellMatches = trHtml.match(/<(?:td|th)\b[^>]*>[\s\S]*?<\/(?:td|th)>/gi) || [];
        const cells = cellMatches.map((c) =>
          this._unescapeXml(c.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        );
        if (cells.some((c) => c !== "")) {
          rows.push(cells);
        }
      });
    }
    return [{ name: "HTML", rows }];
  },

  _parseSpreadsheetMl(xmlText) {
    const sheets = [];
    const wsMatches = xmlText.match(/<Worksheet\b[^>]*>[\s\S]*?<\/Worksheet>/gi) || [xmlText];
    wsMatches.forEach((wsXml, idx) => {
      const nameM = wsXml.match(/ss:Name="([^"]+)"/i);
      const name = nameM ? this._unescapeXml(nameM[1]) : `Sheet${idx + 1}`;
      const rows = [];
      const rowMatches = wsXml.match(/<Row\b[^>]*>[\s\S]*?<\/Row>/gi) || [];
      rowMatches.forEach((rowXml) => {
        const cells = [];
        const cellMatches = rowXml.match(/<Cell\b[^>]*?(?:\/>|>[\s\S]*?<\/Cell>)/gi) || [];
        let colPtr = 0;
        cellMatches.forEach((cellXml) => {
          const idxM = cellXml.match(/ss:Index="(\d+)"/i);
          if (idxM) colPtr = Math.max(0, parseInt(idxM[1], 10) - 1);
          const dataM = cellXml.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
          const val = dataM ? this._unescapeXml(dataM[1].replace(/<[^>]+>/g, "").trim()) : "";
          while (cells.length < colPtr) cells.push("");
          cells[colPtr] = val;
          colPtr++;
        });
        if (cells.some((c) => c !== "")) rows.push(cells);
      });
      sheets.push({ name, rows });
    });
    return sheets;
  },

  _parseCsv(text) {
    // 첫 줄에서 구분자 자동 감지 (탭 vs 쉼표 vs 세미콜론)
    const firstLine = (text.split(/\r\n|\n/)[0] || "").trim();
    let delimiter = ",";
    if (firstLine.split("\t").length > firstLine.split(",").length && firstLine.split("\t").length >= 4) {
      delimiter = "\t";
    }

    const rows = [];
    let currentRow = [];
    let currentVal = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          currentVal += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          currentVal += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          currentRow.push(currentVal.trim());
          currentVal = "";
        } else if (ch === "\r" && next === "\n") {
          currentRow.push(currentVal.trim());
          if (currentRow.some((c) => c !== "")) rows.push(currentRow);
          currentRow = [];
          currentVal = "";
          i++;
        } else if (ch === "\n" || ch === "\r") {
          currentRow.push(currentVal.trim());
          if (currentRow.some((c) => c !== "")) rows.push(currentRow);
          currentRow = [];
          currentVal = "";
        } else {
          currentVal += ch;
        }
      }
    }
    currentRow.push(currentVal.trim());
    if (currentRow.some((c) => c !== "")) rows.push(currentRow);

    return rows;
  },

  // ---------------------------------------------------------------------------
  // 4. 섹션/헤더 자동 인식 및 데이터 정규화 엔진
  // ---------------------------------------------------------------------------
  _detectSectionTitle(cells) {
    const joined = cells.join(" ").trim();
    if (joined.includes("1. WBS 공정표 데이터") || joined.includes("WBS Master")) return "wbs";
    if (joined.includes("2. 서브시스템 기준정보") || joined.includes("Subsystems Meta")) return "subsystems";
    if (joined.includes("3. 산출물 관리 데이터") || joined.includes("Deliverables")) return "deliverables";
    if (joined.includes("4. 요구사항 관리 데이터") || joined.includes("Requirements REQ")) return "req";
    if (joined.includes("5. 추가 VOC 및 이슈") || joined.includes("VOC List")) return "voc";
    return null;
  },

  _matchHeaderToSchema(cells, targetTabKey = null) {
    const normCells = cells.map((c) => String(c || "").toLowerCase().replace(/\s+/g, " ").trim());
    const candidates = targetTabKey ? [targetTabKey] : ["wbs", "subsystems", "deliverables", "req", "voc"];

    let bestTab = null;
    let bestMap = null;
    let bestMatchCount = 0;

    candidates.forEach((tabKey) => {
      const aliases = this.HEADER_ALIASES[tabKey];
      const colMap = {};
      let matchCount = 0;

      normCells.forEach((cellText, colIdx) => {
        if (!cellText || this.IGNORED_HEADERS.has(cellText)) return;
        for (const [fieldKey, aliasList] of Object.entries(aliases)) {
          if (colMap[fieldKey] !== undefined) continue;
          const matched = aliasList.some((a) => a.toLowerCase() === cellText);
          if (matched) {
            colMap[fieldKey] = colIdx;
            matchCount++;
            break;
          }
        }
      });

      if (matchCount >= 3 && matchCount > bestMatchCount) {
        bestMatchCount = matchCount;
        bestTab = tabKey;
        bestMap = colMap;
      }
    });

    if (bestTab) {
      return { tabKey: bestTab, colMap: bestMap };
    }
    return null;
  },

  _buildDefaultColMap(tabKey) {
    const schema = this.TAB_SCHEMAS[tabKey] || [];
    const map = {};
    schema.forEach((col, idx) => {
      map[col.key] = idx;
    });
    return map;
  },

  _extractRowObject(tabKey, cells, colMap) {
    const schema = this.TAB_SCHEMAS[tabKey] || [];
    const activeMap = colMap || this._buildDefaultColMap(tabKey);
    const raw = {};
    let nonEmptyCount = 0;

    schema.forEach((col, defaultIdx) => {
      const cIdx = activeMap[col.key] !== undefined ? activeMap[col.key] : defaultIdx;
      const val = cells[cIdx] !== undefined ? String(cells[cIdx]).trim() : "";
      raw[col.key] = val;
      if (val !== "") nonEmptyCount++;
    });

    if (nonEmptyCount < 2) return null;
    return raw;
  },

  _normalizeRowData(tabKey, raw, index) {
    if (tabKey === "users") {
      const empNo = String(raw.empNo || "").trim();
      const name = String(raw.name || "").trim();
      if (!empNo && !name) return null;
      const rawRole = String(raw.role || "MEMBER").toUpperCase();
      let role = "MEMBER";
      if (rawRole.includes("SYS_ADMIN") || rawRole.includes("시스템") || empNo.toLowerCase() === "admin") role = "SYS_ADMIN";
      else if (rawRole.includes("LEAD") || rawRole.includes("총괄리더") || /^PL$/i.test(rawRole.trim())) role = "LEAD";
      else if (rawRole.includes("PM") || rawRole.includes("프로젝트")) role = "PM";
      const lang = String(raw.lang || "ko").trim().toLowerCase() === "en" ? "en" : "ko";
      return {
        empNo: empNo || `user${index + 1}`,
        name: name || empNo,
        role,
        subsystem: String(raw.subsystem || "ALL").trim() || "ALL",
        dept: String(raw.dept || "").trim(),
        lang,
        pwdHash: ""
      };
    }
    if (tabKey === "config") {
      const cat = String(raw.category || "").trim();
      const key = String(raw.key || "").trim();
      if (!cat || !key) return null;
      return {
        category: cat,
        key,
        value: String(raw.value || "").trim(),
        extra1: String(raw.extra1 || "").trim(),
        extra2: String(raw.extra2 || "").trim(),
        extra3: String(raw.extra3 || "").trim()
      };
    }
    if (tabKey === "wbs") {
      const name = String(raw.name || "").trim();
      const sys = String(raw.system || "").trim();
      if (!name && !sys) return null;

      const lvlNum = parseInt(String(raw.level || "1").replace(/[^0-9]/g, ""), 10);
      const level = Math.min(5, Math.max(1, isNaN(lvlNum) ? 1 : lvlNum));
      const weightNum = parseFloat(String(raw.weight ?? "1").replace(/[^0-9.-]/g, ""));
      const pProgNum = parseFloat(String(raw.pProg ?? "0").replace(/[^0-9.-]/g, ""));
      const aProgNum = parseFloat(String(raw.aProg ?? "0").replace(/[^0-9.-]/g, ""));

      return {
        id: String(raw.id || "").trim(),
        level: level,
        system: sys || "미분류",
        name: name || "Task",
        weight: isNaN(weightNum) ? 1 : Math.round(Math.max(0, weightNum) * 10) / 10,
        reqId: String(raw.reqId || "").trim(),
        pStart: this.normalizeDate(raw.pStart),
        pEnd: this.normalizeDate(raw.pEnd),
        aStart: this.normalizeDate(raw.aStart),
        aEnd: this.normalizeDate(raw.aEnd),
        // [v3.0.0] 진척률은 0~100 으로 보정 (엑셀에 범위를 벗어난 값이 있어도 그대로 들어가지 않음)
        pProg: isNaN(pProgNum) ? 0 : Math.min(100, Math.max(0, pProgNum)),
        aProg: isNaN(aProgNum) ? 0 : Math.min(100, Math.max(0, aProgNum)),
        owner: String(raw.owner || "").split(/[,;/|]/)[0].trim().slice(0, 40),
        output: String(raw.output || "").trim()
      };
    }

    if (tabKey === "subsystems") {
      const name = String(raw.name || raw.code || "").trim();
      if (!name) return null;
      const code = String(raw.code || name).trim();
      const domain = String(raw.domain || "공통/인프라").trim();
      const rawType = String(raw.type || "SDLC").toUpperCase();
      const type = rawType.includes("REQ") || rawType.includes("개선") || rawType.includes("요건") ? "REQ" : "SDLC";
      const sdlcCode = String(raw.sdlcCode || (type === "REQ" ? "" : "SDLC_A")).trim();
      const weightNum = parseFloat(String(raw.weight ?? "10").replace(/[^0-9.-]/g, ""));

      return {
        domain: domain || "공통/인프라",
        code: code,
        name: name,
        type: type,
        sdlcCode: sdlcCode,
        weight: isNaN(weightNum) ? 10 : weightNum,
        pm: String(raw.pm || "").trim(),
        desc: String(raw.desc || "").trim()
      };
    }

    if (tabKey === "deliverables") {
      const name = String(raw.name || "").trim();
      if (!name) return null;
      const rawR = String(raw.round || "1차");
      let roundStr = "1차";
      if (rawR.includes("4")) roundStr = "4차";
      else if (rawR.includes("3")) roundStr = "3차";
      else if (rawR.includes("2")) roundStr = "2차";
      const phaseStr = String(raw.phase || (roundStr === "2차" ? "구축단계" : "분석설계단계")).trim();

      return {
        id: index + 1,
        round: roundStr,
        system: String(raw.system || "PMO").trim(),
        phase: phaseStr,
        name: name,
        pDate: this.normalizeDate(raw.pDate),
        aDate: this.normalizeDate(raw.aDate),
        status: String(raw.status || "작성전").trim(),
        manager: String(raw.manager || "").trim(),
        remarks: String(raw.remarks || "").trim()
      };
    }

    if (tabKey === "req") {
      const id = String(raw.id || "").trim();
      const name = String(raw.name || "").trim();
      if (!id && !name) return null;
      let status = String(raw.status || "대기").trim();
      if (status === "착수전") status = "대기";
      if (status === "진행중") status = "진행";

      return {
        id: id || `REQ-${index + 1}`,
        system: String(raw.system || "서브시스템A").trim(),
        name: name || id,
        type: String(raw.type || "기능").trim(),
        priority: String(raw.priority || "중").trim(),
        accept: String(raw.accept || "수용").trim(),
        status: status
      };
    }

    if (tabKey === "voc") {
      const id = String(raw.id || "").trim();
      const title = String(raw.title || "").trim();
      if (!id && !title) return null;
      let status = String(raw.status || "대기").trim();
      if (status === "착수전") status = "대기";
      if (status === "진행중") status = "진행";
      if (status === "접수" || status === "대기(접수)" || status === "착수전" || status === "착수전(접수)") status = "대기";

      return {
        id: id || `VOC-${String(index + 1).padStart(2, "0")}`,
        system: String(raw.system || "서브시스템A").trim(),
        priority: String(raw.priority || "중").trim(),
        title: title || id,
        requester: String(raw.requester || "").trim(),
        reqDate: this.normalizeDate(raw.reqDate),
        targetDate: this.normalizeDate(raw.targetDate),
        status: status,
        action: String(raw.action || "").trim()
      };
    }

    return null;
  },

  _ensureWbsAndSubsystemsIntegrity() {
    // 1. WBS의 각 서브시스템이 최소 1개의 Level 1 루트 행을 갖도록 보장
    const distinctSystems = [...new Set(wbsData.map((d) => (d.system || "").trim()).filter(Boolean))];
    distinctSystems.forEach((sys) => {
      const hasL1 = wbsData.some((d) => (d.system || "").trim() === sys && d.level === 1);
      if (!hasL1) {
        const meta = subsystemsMeta.find((m) => m.name === sys);
        wbsData.unshift({
          id: "",
          level: 1,
          system: sys,
          name: `${sys} 사업 총괄`,
          weight: 100,
          reqId: "",
          pStart: projectConfig.projectStartDate,
          pEnd: projectConfig.projectEndDate,
          aStart: "",
          aEnd: "",
          pProg: 0,
          aProg: 0,
          output: ""
        });
      }
      // 2. subsystemsMeta에 없는 신규 서브시스템이면 자동 등록
      if (!subsystemsMeta.some((m) => m.name === sys)) {
        const l1 = wbsData.find((d) => (d.system || "").trim() === sys && d.level === 1);
        subsystemsMeta.push({
          code: sys,
          name: sys,
          type: "SDLC",
          weight: 10,
          pm: "담당PM",
          desc: `${sys} Task`
        });
      }
    });
  },

  // ---------------------------------------------------------------------------
  // 5. 엑셀 올리기 핸들러 (통합 마스터 워크북 & 개별 탭 업로드)
  // ---------------------------------------------------------------------------
  // [2026 v1.2.4] 서브시스템별 전용 엑셀(.xlsx) 다운로드
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

  // [2026 v1.2.4] 서브시스템별 엑셀(.xlsx) 업로드 병합 (업로드 시 업데이트 날짜·시간 백업 JSON 자동 생성)
  async importSubsystemWorkbook(e, targetSysArg) {
    const file = e && e.target && e.target.files ? e.target.files[0] : (e instanceof File ? e : null);
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const selEl = document.getElementById("excelSubsysImportSelect");
    const targetSys = targetSysArg || (selEl ? selEl.value : "");
    if (!targetSys) {
      if (typeof showToast === "function") showToast("반영할 대상 서브시스템을 먼저 선택해주세요.");
      return;
    }

    try {
      const sheets = await this._parseUploadedFile(file);
      const bucket = { wbs: [], subsystems: [], deliverables: [], req: [], voc: [] };

      sheets.forEach((sheet, sIdx) => {
        let currentSection = null;
        let currentColMap = null;
        const sName = (sheet.name || "").toLowerCase();
        if (sName.includes("wbs") || sName.includes("공정")) currentSection = "wbs";
        else if (sName.includes("서브시스템") || sName.includes("기준")) currentSection = "subsystems";
        else if (sName.includes("산출물")) currentSection = "deliverables";
        else if (sName.includes("요구사항") || sName.includes("req")) currentSection = "req";
        else if (sName.includes("voc") || sName.includes("이슈")) currentSection = "voc";
        if (currentSection) currentColMap = this._buildDefaultColMap(currentSection);

        const localBucket = { wbs: [], subsystems: [], deliverables: [], req: [], voc: [] };

        sheet.rows.forEach((cells) => {
          const secTitle = this._detectSectionTitle(cells);
          if (secTitle) {
            currentSection = secTitle;
            currentColMap = this._buildDefaultColMap(secTitle);
            return;
          }
          const headerMatch = this._matchHeaderToSchema(cells);
          if (headerMatch) {
            currentSection = headerMatch.tabKey;
            currentColMap = headerMatch.colMap;
            return;
          }
          if (!currentSection && sIdx === 0 && sheets.length === 1) {
            currentSection = "wbs";
            currentColMap = this._buildDefaultColMap("wbs");
          }
          if (currentSection) {
            const rawObj = this._extractRowObject(currentSection, cells, currentColMap);
            if (rawObj) {
              const norm = this._normalizeRowData(currentSection, rawObj, localBucket[currentSection].length);
              if (norm) localBucket[currentSection].push(norm);
            }
          }
        });

        Object.keys(bucket).forEach((k) => {
          if (bucket[k].length === 0 && localBucket[k].length > 0) {
            bucket[k] = localBucket[k];
          }
        });
      });

      // 대상 서브시스템에 해당하는 데이터만 필터링 (만약 단일 서브시스템 시트여서 system이 비어있거나 동일하면 targetSys로 귀속)
      const filterOrBindSys = (arr, isSubMeta = false) => {
        if (!Array.isArray(arr) || arr.length === 0) return [];
        if (isSubMeta) {
          const exact = arr.filter(x => x.name === targetSys || x.code === targetSys);
          return exact;
        }
        const distinctSys = [...new Set(arr.map(x => (x.system || "").trim()).filter(Boolean))];
        if (distinctSys.length === 1 && distinctSys[0] === targetSys) {
          return arr.map(x => Object.assign({}, x, { system: targetSys }));
        }
        const matched = arr.filter(x => (x.system || "").trim() === targetSys);
        if (matched.length > 0) return matched;
        // 만약 업로드된 파일에 다른 서브시스템이 없고 단일 작업표라면 targetSys로 강제 매핑
        if (distinctSys.length <= 1) {
          return arr.map(x => Object.assign({}, x, { system: targetSys }));
        }
        return [];
      };

      const subWbs = filterOrBindSys(bucket.wbs);
      const subDeliv = filterOrBindSys(bucket.deliverables);
      const subReq = filterOrBindSys(bucket.req);
      const subVoc = filterOrBindSys(bucket.voc);
      const subMeta = filterOrBindSys(bucket.subsystems, true);

      const totalCount = subWbs.length + subDeliv.length + subReq.length + subVoc.length + subMeta.length;
      if (totalCount === 0) {
        if (typeof showToast === "function") {
          showToast(`업로드한 엑셀 파일에서 [${targetSys}] 서브시스템에 해당하는 데이터를 찾지 못했습니다.`);
        }
        return;
      }

      // [요건 4] 업로드 반영 직전 업데이트 날짜 및 시간으로 백업 JSON 생성!
      let backupFilename = "";
      if (typeof BackupHistoryManager !== "undefined") {
        backupFilename = BackupHistoryManager.createBackupSnapshot(`엑셀업로드(${targetSys})`, targetSys, true);
      }

      if (subMeta.length > 0) {
        const idx = subsystemsMeta.findIndex(s => s.name === targetSys);
        if (idx >= 0) subsystemsMeta[idx] = Object.assign({}, subsystemsMeta[idx], subMeta[0], { name: targetSys });
        else subsystemsMeta.push(Object.assign({}, subMeta[0], { name: targetSys }));
      }

      if (subWbs.length > 0) {
        wbsData = wbsData.filter(d => (d.system || "").trim() !== targetSys);
        wbsData.push(...subWbs);
      }
      if (subDeliv.length > 0) {
        deliverablesData = deliverablesData.filter(d => (d.system || "").trim() !== targetSys);
        deliverablesData.push(...subDeliv);
        deliverablesData.forEach((d, i) => { d.id = i + 1; });
      }
      if (subReq.length > 0) {
        reqMasterData = reqMasterData.filter(r => (r.system || "").trim() !== targetSys);
        reqMasterData.push(...subReq);
      }
      if (subVoc.length > 0) {
        vocData = vocData.filter(v => (v.system || "").trim() !== targetSys);
        vocData.push(...subVoc);
      }

      this._ensureWbsAndSubsystemsIntegrity();
      if (typeof syncSubsystemWeights === "function") syncSubsystemWeights();
      if (typeof rebuildAll === "function") rebuildAll(true);
      if (typeof BackupHistoryManager !== "undefined") BackupHistoryManager.renderBackupHistoryTable();

      if (typeof showToast === "function") {
        showToast(
          `[${targetSys} 엑셀 업로드 병합 완료]
• 반영 건수: WBS ${subWbs.length}건, 산출물 ${subDeliv.length}건, REQ ${subReq.length}건, VOC ${subVoc.length}건
• 백업 JSON 생성: ${backupFilename}`
        );
      }
    } catch (err) {
      console.error("서브시스템 엑셀 업로드 오류:", err);
      if (typeof showToast === "function") showToast("서브시스템 엑셀 업로드 중 오류 발생: " + err.message);
    }
  },

  // opts.sheets: 이미 읽은 시트 (그러면 기다림 없이 바로 처리) · opts.silent: 알림 · 자동 백업 없음 · opts.noRebuild: 화면 다시 그리지 않음
  async importMasterWorkbook(e, opts = {}) {
    const file = e && e.target && e.target.files ? e.target.files[0] : e instanceof File ? e : null;
    if (e && e.target) e.target.value = "";
    if (!file && !opts.sheets) return;

    try {
      const sheets = opts.sheets || await this._parseUploadedFile(file);
      const bucket = {
        wbs: [],
        subsystems: [],
        deliverables: [],
        req: [],
        voc: []
      };

      // [v3.9.0] 전체 일괄 파일의 프로젝트 기준정보 · 작업자 시트 (서브시스템 시트로 잘못 읽지 않게 따로 처리)
      const configRows = [], userRows = [];
      const sheetRowsOf = (sheet, tabKey) => {
        const out = [];
        let colMap = null;
        sheet.rows.forEach(cells => {
          const labels = (this.TAB_SCHEMAS[tabKey] || []).map(c => c.label);
          if (!colMap && cells.some(c => labels.includes(String(c || "").trim()))) {
            colMap = {};
            (this.TAB_SCHEMAS[tabKey] || []).forEach(c => { const i = cells.findIndex(x => String(x || "").trim() === c.label); if (i >= 0) colMap[c.key] = i; });
            return;
          }
          if (!colMap) return;
          const raw = this._extractRowObject(tabKey, cells, colMap);
          if (raw) out.push(raw);
        });
        return out;
      };

      // 시트별로 파싱: 통합 마스터 시트가 있으면 우선 파싱하고, 비어있는 섹션은 개별 시트에서 보충
      sheets.forEach((sheet, sIdx) => {
        let currentSection = null;
        let currentColMap = null;

        // 시트 이름으로 기본 섹션 추정
        const sName = (sheet.name || "").toLowerCase();
        if (sName.includes("프로젝트기준정보")) { configRows.push(...sheetRowsOf(sheet, "config")); return; }
        if (sName.includes("작업자") || sName.includes("사용자") || sName.includes("멤버")) { userRows.push(...sheetRowsOf(sheet, "users")); return; }
        if (/주간보고|회의록|공지|소통/.test(sName)) return;  // 협업 데이터 시트는 SmartMergeCenter._applyCollabSheets 가 처리
        if (sName.includes("wbs") || sName.includes("공정")) currentSection = "wbs";
        else if (sName.includes("서브시스템") || sName.includes("기준정보") || sName.includes("subsystem")) currentSection = "subsystems";
        else if (sName.includes("산출물") || sName.includes("deliverable")) currentSection = "deliverables";
        else if (sName.includes("요구사항") || sName.includes("req")) currentSection = "req";
        else if (sName.includes("voc") || sName.includes("이슈")) currentSection = "voc";

        const localBucket = { wbs: [], subsystems: [], deliverables: [], req: [], voc: [] };

        sheet.rows.forEach((cells) => {
          const secTitle = this._detectSectionTitle(cells);
          if (secTitle) {
            currentSection = secTitle;
            currentColMap = this._buildDefaultColMap(secTitle);
            return;
          }

          const headerMatch = this._matchHeaderToSchema(cells);
          if (headerMatch) {
            currentSection = headerMatch.tabKey;
            currentColMap = headerMatch.colMap;
            return;
          }

          if (!currentSection && sIdx === 0 && sheets.length === 1) {
            currentSection = "wbs";
            currentColMap = this._buildDefaultColMap("wbs");
          }

          if (currentSection) {
            const rawObj = this._extractRowObject(currentSection, cells, currentColMap);
            if (rawObj) {
              const norm = this._normalizeRowData(currentSection, rawObj, localBucket[currentSection].length);
              if (norm) localBucket[currentSection].push(norm);
            }
          }
        });

        Object.keys(bucket).forEach((k) => {
          if (bucket[k].length === 0 && localBucket[k].length > 0) {
            bucket[k] = localBucket[k];
          }
        });
      });

      const totalLoaded =
        bucket.wbs.length +
        bucket.subsystems.length +
        bucket.deliverables.length +
        bucket.req.length +
        bucket.voc.length;

      if (totalLoaded === 0) {
        showToast("업로드한 파일에서 유효한 데이터를 찾지 못했습니다. 엑셀 양식을 확인해주세요.");
        return;
      }

      if (typeof BackupHistoryManager !== "undefined" && !opts.silent) {
        BackupHistoryManager.createBackupSnapshot("전체엑셀통합로드", "ALL", true);
      }
      if (configRows.length && typeof SmartMergeCenter !== "undefined") SmartMergeCenter.applyConfigRows(configRows, { noUi: !!opts.noRebuild });
      if (userRows.length && typeof SmartMergeCenter !== "undefined") {
        SmartMergeCenter._mergeUsersList(userRows.map((r, i) => this._normalizeRowData("users", r, i)).filter(Boolean));
      }
      if (bucket.subsystems.length > 0) subsystemsMeta = bucket.subsystems;
      if (bucket.wbs.length > 0) wbsData = bucket.wbs;
      if (bucket.deliverables.length > 0) deliverablesData = bucket.deliverables;
      if (bucket.req.length > 0) reqMasterData = bucket.req;
      if (bucket.voc.length > 0) vocData = bucket.voc;

      this._ensureWbsAndSubsystemsIntegrity();
      if (typeof syncSubsystemWeights === "function") syncSubsystemWeights();
      if (typeof rebuildAll === "function" && !opts.noRebuild) rebuildAll();

      if (!opts.silent) showToast(
        `엑셀 파일로부터 성공적으로 데이터를 로드했습니다.\n(WBS: ${bucket.wbs.length}건, 서브시스템: ${bucket.subsystems.length}건, 산출물: ${bucket.deliverables.length}건, REQ: ${bucket.req.length}건, VOC: ${bucket.voc.length}건)`
      );
    } catch (err) {
      console.error("엑셀 통합 파일 로드 오류:", err);
      showToast("엑셀 파일 처리 중 오류가 발생했습니다: " + err.message);
    }
  },

  async importTab(e, tabKey) {
    const file = e && e.target && e.target.files ? e.target.files[0] : e instanceof File ? e : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    try {
      const sheets = await this._parseUploadedFile(file);
      let imported = [];

      for (const sheet of sheets) {
        let activeSection = tabKey;
        let colMap = this._buildDefaultColMap(tabKey);
        const sheetRows = [];

        for (let i = 0; i < sheet.rows.length; i++) {
          const cells = sheet.rows[i];

          const secTitle = this._detectSectionTitle(cells);
          if (secTitle) {
            activeSection = secTitle;
            colMap = this._buildDefaultColMap(secTitle);
            continue;
          }

          const anyHeader = this._matchHeaderToSchema(cells);
          if (anyHeader) {
            const targetHeader = this._matchHeaderToSchema(cells, tabKey);
            if (targetHeader && targetHeader.tabKey === tabKey) {
              activeSection = tabKey;
              colMap = targetHeader.colMap;
            } else {
              activeSection = anyHeader.tabKey;
              colMap = anyHeader.colMap;
            }
            continue;
          }

          if (activeSection !== tabKey) continue;

          const rawObj = this._extractRowObject(tabKey, cells, colMap);
          if (rawObj) {
            const norm = this._normalizeRowData(tabKey, rawObj, sheetRows.length);
            if (norm) sheetRows.push(norm);
          }
        }

        if (sheetRows.length > 0) {
          imported = sheetRows;
          break;
        }
      }

      if (imported.length === 0) {
        showToast(`[${tabKey.toUpperCase()}] 파일에서 가져올 수 있는 유효한 데이터 행을 찾지 못했습니다.`);
        return;
      }

      if (typeof BackupHistoryManager !== "undefined") {
        BackupHistoryManager.createBackupSnapshot(`탭엑셀업로드(${tabKey})`, "ALL", true);
      }
      if (tabKey === "wbs") {
        wbsData = imported;
        this._ensureWbsAndSubsystemsIntegrity();
      } else if (tabKey === "subsystems") {
        subsystemsMeta = imported;
        if (typeof syncSubsystemWeights === "function") syncSubsystemWeights();
      } else if (tabKey === "deliverables") {
        deliverablesData = imported;
      } else if (tabKey === "req") {
        reqMasterData = imported;
      } else if (tabKey === "voc") {
        vocData = imported;
      }

      if (typeof rebuildAll === "function") rebuildAll();
      showToast(`[${tabKey.toUpperCase()}] 성공적으로 ${imported.length}건의 데이터를 가져왔습니다.`);
    } catch (err) {
      console.error(`[${tabKey}] 엑셀 업로드 오류:`, err);
      showToast(`엑셀 업로드 중 오류가 발생했습니다: ${err.message}`);
    }
  }
};


// ===================================================================
// [2026 v1.7.6 신규] 순수 자바스크립트 OpenXML DOCX 빌더 (DocxBuilder)
// 표 형식 주간보고(useTables=true) 및 완전 서술형 주간보고(useTables=false) 완벽 지원
// 5대 목차: 1) 프로젝트 기본정보 2) 통합/서브시스템 진척률 3) 요구사항 진척율 4) VOC 진행 현황 5) 서브시스템별 금주/차주 상세
// ===================================================================
const DocxBuilder = {
  // [v3.1.0] 주간보고 워드는 js/weekly-export.js (WeeklyExport) 에서 만듦

  // =========================================================================
  // [2026 v0.9 신규] 회의록 독립 OpenXML DOCX 생성기
  // =========================================================================
  buildMeetingMinutesDocx(m, projName = "프로젝트") {
    const esc = s => ExcelSync.escapeXml(s);
    const bodyParts = [];

    const pal = (typeof ExcelSync !== "undefined" && ExcelSync.getExportThemePalette)
      ? ExcelSync.getExportThemePalette()
      : { fontSize: 10, fontName: "맑은 고딕", primary: "1E3A8A", secondary: "2563EB", accent: "0284C7" };

    const docxFont = pal.fontName;
    const docxFontSize = pal.fontSize;
    const colorPrimary = pal.primary;
    const colorSecondary = pal.secondary;
    const colorAccent = pal.accent;
    // [v1.0.5 버그수정] 회의록 DOCX 생성 시 미정의 변수(tableBorder/headerBg 등) 참조로 인한 ReferenceError 해결
    const headerBg = pal.headerBg || pal.primary || "1E3A8A";
    const headerTextColor = pal.headerTextColor || "FFFFFF";
    const subHeaderBg = pal.subHeaderBg || "EFF6FF";
    const tableBorder = pal.border || "CBD5E1";

    const szBase = docxFontSize * 2;
    const szH1 = (docxFontSize + 4) * 2;
    const szH2 = (docxFontSize + 2) * 2;
    const szTitle = (docxFontSize + 11) * 2;

    // Header Title
    bodyParts.push(`
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:spacing w:before="120" w:after="60"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}"/>
            <w:b/>
            <w:sz w:val="${szTitle}"/>
            <w:color w:val="0F172A"/>
          </w:rPr>
          <w:t>[회의록] ${esc(m.title)}</w:t>
        </w:r>
      </w:p>
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:spacing w:before="0" w:after="220"/>
        </w:pPr>
        <w:r>
          <w:rPr>
            <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}"/>
            <w:b/>
            <w:sz w:val="22"/>
            <w:color w:val="${colorSecondary}"/>
          </w:rPr>
          <w:t>프로젝트: ${esc(projName)}  |  서브시스템: [${esc(m.system)}]  |  회의일자: ${esc(m.date)} (${esc(m.startTime)} ~ ${esc(m.endTime)})</w:t>
        </w:r>
      </w:p>
    `);

    // 1. 회의 기본 정보
    bodyParts.push(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="200" w:after="100"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="${szH1}"/><w:color w:val="${colorPrimary}"/></w:rPr><w:t>1. 회의 기본 정보</w:t></w:r>
      </w:p>
      <w:tbl>
        <w:tblPr>
          <w:tblW w:w="9400" w:type="dxa"/>
          <w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/></w:tblBorders>
        </w:tblPr>
        <w:tblGrid>
          <w:gridCol w:w="1800"/>
          <w:gridCol w:w="2900"/>
          <w:gridCol w:w="1800"/>
          <w:gridCol w:w="2900"/>
        </w:tblGrid>
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>회의 명칭</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${colorPrimary}"/></w:rPr><w:t>${esc(m.title)}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>관련 서브시스템</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${colorSecondary}"/></w:rPr><w:t>${esc(m.system)}</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>회의 일시</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t>${esc(m.date)} (${esc(m.startTime)} ~ ${esc(m.endTime)})</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>회의 장소</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t>${esc(m.location || "-")}</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>주관자 / 발표</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t>${esc(m.host || "-")}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>진행 상태</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2900" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${m.status === "완료" ? "15803D" : "2563EB"}"/></w:rPr><w:t>${esc(m.status)}</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
      <w:p>
        <w:pPr>
          <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
          <w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${colorSecondary}"/></w:pBdr>
          <w:ind w:left="200" w:right="200"/>
          <w:spacing w:before="120" w:after="100"/>
        </w:pPr>
        <w:r><w:rPr><w:b/><w:color w:val="${colorSecondary}"/></w:rPr><w:t>【회의 목적 및 총괄 요약】: </w:t></w:r>
        <w:r><w:t>${esc(m.summary || m.title)}</w:t></w:r>
      </w:p>
    `);

    // 2. 참석자 명단
    const attList = m.attendees || [];
    let attTrs = `
      <w:tr>
        <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${headerTextColor}"/></w:rPr><w:t>No</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${headerTextColor}"/></w:rPr><w:t>성명</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${headerTextColor}"/></w:rPr><w:t>소속 부서 / 팀</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${headerTextColor}"/></w:rPr><w:t>역할 및 직책</w:t></w:r></w:p></w:tc>
        <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${headerTextColor}"/></w:rPr><w:t>참석 여부</w:t></w:r></w:p></w:tc>
      </w:tr>
    `;
    attList.forEach((a, i) => {
      attTrs += `
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:t>${i + 1}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(a.name)}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:t>${esc(a.dept || "-")}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:t>${esc(a.role || "참석")}</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1400" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${a.attendance === "불참" ? "DC2626" : "15803D"}"/></w:rPr><w:t>${esc(a.attendance || "참석")}</w:t></w:r></w:p></w:tc>
        </w:tr>
      `;
    });
    bodyParts.push(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="200" w:after="100"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="${szH1}"/><w:color w:val="${colorPrimary}"/></w:rPr><w:t>2. 회의 참석자 명단</w:t></w:r>
      </w:p>
      <w:tbl>
        <w:tblPr>
          <w:tblW w:w="9400" w:type="dxa"/>
          <w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/></w:tblBorders>
        </w:tblPr>
        <w:tblGrid>
          <w:gridCol w:w="800"/>
          <w:gridCol w:w="2400"/>
          <w:gridCol w:w="3000"/>
          <w:gridCol w:w="1800"/>
          <w:gridCol w:w="1400"/>
        </w:tblGrid>
        ${attTrs}
      </w:tbl>
    `);

    // 3. 안건별 상세 논의 및 결정사항
    const agdList = m.agendas || [];
    bodyParts.push(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="100"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="${szH1}"/><w:color w:val="${colorPrimary}"/></w:rPr><w:t>3. 회의 안건별 상세 논의 및 결정 사항</w:t></w:r>
      </w:p>
    `);
    agdList.forEach((a, i) => {
      bodyParts.push(`
        <w:p>
          <w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="140" w:after="60"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="${szH2}"/><w:color w:val="${colorSecondary}"/></w:rPr><w:t>■ 안건 #${i + 1}: ${esc(a.title)}</w:t></w:r>
        </w:p>
        <w:tbl>
          <w:tblPr>
            <w:tblW w:w="9400" w:type="dxa"/>
            <w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/></w:tblBorders>
          </w:tblPr>
          <w:tblGrid>
            <w:gridCol w:w="2200"/>
            <w:gridCol w:w="7200"/>
          </w:tblGrid>
          <w:tr>
            <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${pal.subHeaderBg}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${colorSecondary}"/></w:rPr><w:t>💬 논의 내용 및 발언 요지</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="7200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:t>${esc(a.discussion || "(상세 논의 내용 기록)")}</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:tcPr><w:tcW w:w="2200" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F0FDF4"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="166534"/></w:rPr><w:t>✅ 결정 사항 및 실행 합의</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="7200" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(a.decision || "(결정 사항 기록)")}</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      `);
    });

    // 4. 회의 결과 도출 Action Item
    const actList = m.actionItems || [];
    bodyParts.push(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="100"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="${szH1}"/><w:color w:val="${colorPrimary}"/></w:rPr><w:t>4. 회의 결과 도출 Action Item</w:t></w:r>
      </w:p>
    `);
    if (actList.length === 0) {
      bodyParts.push(`<w:p><w:pPr><w:ind w:left="200"/><w:spacing w:after="80"/></w:pPr><w:r><w:t style="color:#64748b;">(도출된 후속 Action Item 없음)</w:t></w:r></w:p>`);
    } else {
      let actTrs = `
        <w:tr>
          <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>ID</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>Action Item 명칭</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>세부 Task 내용</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1100" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>요청자</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1100" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>담당자</w:t></w:r></w:p></w:tc>
          <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t>목표일</w:t></w:r></w:p></w:tc>
        </w:tr>
      `;
      actList.forEach(act => {
        actTrs += `
          <w:tr>
            <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:t>${esc(act.id)}</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(act.title)}</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:t>${esc(act.content || "-")}</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="1100" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:t>${esc(act.requester || "-")}</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="1100" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${colorSecondary}"/></w:rPr><w:t>${esc(act.assignee || "-")}</w:t></w:r></w:p></w:tc>
            <w:tc><w:tcPr><w:tcW w:w="1000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${act.status === "완료" ? "15803D" : "2563EB"}"/></w:rPr><w:t>${esc(act.targetDate || "-")}</w:t></w:r></w:p></w:tc>
          </w:tr>
        `;
      });
      bodyParts.push(`
        <w:tbl>
          <w:tblPr>
            <w:tblW w:w="9400" w:type="dxa"/>
            <w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${tableBorder}"/></w:tblBorders>
          </w:tblPr>
          <w:tblGrid>
            <w:gridCol w:w="1000"/>
            <w:gridCol w:w="2600"/>
            <w:gridCol w:w="2600"/>
            <w:gridCol w:w="1100"/>
            <w:gridCol w:w="1100"/>
            <w:gridCol w:w="1000"/>
          </w:tblGrid>
          ${actTrs}
        </w:tbl>
      `);
    }

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${bodyParts.join("")}
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
        </w:sectPr>
      </w:body>
    </w:document>`;

    const content_types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`;

    const doc_rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:docDefaults>
        <w:rPrDefault>
          <w:rPr>
            <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}" w:hAnsi="${docxFont}" w:cs="${docxFont}"/>
            <w:sz w:val="${szBase}"/>
            <w:color w:val="1F2937"/>
          </w:rPr>
        </w:rPrDefault>
      </w:docDefaults>
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
        <w:pPr><w:spacing w:after="80" w:line="260" w:lineRule="auto"/></w:pPr>
        <w:rPr>
          <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}" w:hAnsi="${docxFont}" w:cs="${docxFont}"/>
          <w:sz w:val="${szBase}"/>
        </w:rPr>
      </w:style>
      <w:style w:type="table" w:default="1" w:styleId="TableNormal">
        <w:name w:val="Normal Table"/>
        <w:rPr>
          <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}" w:hAnsi="${docxFont}" w:cs="${docxFont}"/>
          <w:sz w:val="${szBase}"/>
        </w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:pPr><w:spacing w:before="240" w:after="100"/></w:pPr>
        <w:rPr>
          <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}" w:hAnsi="${docxFont}" w:cs="${docxFont}"/>
          <w:b/>
          <w:sz w:val="${szH1}"/>
          <w:color w:val="${colorPrimary}"/>
        </w:rPr>
      </w:style>
      <w:style w:type="paragraph" w:styleId="Heading2">
        <w:name w:val="heading 2"/>
        <w:pPr><w:spacing w:before="180" w:after="80"/></w:pPr>
        <w:rPr>
          <w:rFonts w:ascii="${docxFont}" w:eastAsia="${docxFont}" w:hAnsi="${docxFont}" w:cs="${docxFont}"/>
          <w:b/>
          <w:sz w:val="${szH2}"/>
          <w:color w:val="${colorSecondary}"/>
        </w:rPr>
      </w:style>
    </w:styles>`;

    const files = [
      { name: "[Content_Types].xml", content: content_types },
      { name: "_rels/.rels", content: rels },
      { name: "word/_rels/document.xml.rels", content: doc_rels },
      { name: "word/styles.xml", content: styles },
      { name: "word/document.xml", content: docXml }
    ];

    return ExcelSync._createZipBlob(files, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

};
