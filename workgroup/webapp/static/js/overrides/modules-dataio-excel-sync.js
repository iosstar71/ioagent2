// Workgroup 판: modules/dataio/excel-sync.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ExcelSync, {
  HEADER_ALIASES: {
    users: {
      empNo: ["멤버 ID(id)", "멤버 ID", "멤버 ID (멤버 선택 id)", "id", "empno"],
      name: ["성명", "이름", "사용자명", "name"],
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
      vocType: ["구분", "유형", "type"],
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
  _triggerDownload(blob, filename) {
    // [v1.0.5] 윈도우 파일명 금지문자 치환 및 다운로드 안정화
    const safeName = String(filename || "download").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, " ").trim() || "download";
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

      // [v3.9.0] 전체 일괄 파일의 프로젝트 기준정보 · 사용자 시트 (서브시스템 시트로 잘못 읽지 않게 따로 처리)
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
        if (/사용자|작업자|멤버/.test(sName)) { userRows.push(...sheetRowsOf(sheet, "users")); return; }
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
});

Object.assign(DocxBuilder, {
  buildMeetingMinutesDocx(m, projName = "27년 가동률 시스템 개선") {
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
});
