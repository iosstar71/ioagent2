// ===================================================================
// 순수 자바스크립트 OpenXML DOCX 빌더 (DocxBuilder)
// 회의록 워드 파일. 주간보고 워드는 modules/weekly/weekly-export.js (WeeklyExport)
// ===================================================================
const DocxBuilder = {
  // 주간보고 워드는 js/weekly-export.js (WeeklyExport) 에서 만듦

  // =========================================================================
  // 회의록 독립 OpenXML DOCX 생성기
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
    // 회의록 DOCX 생성 시 미정의 변수(tableBorder/headerBg 등) 참조로 인한 ReferenceError 해결
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
