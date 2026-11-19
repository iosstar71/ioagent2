// =============================================================================
// 엑셀 · 워드 파일 형식 (ExcelSync 의 일부) — zip 만들기 · 풀기, xlsx 시트 XML, CSV · HTML 표 읽기
// 화면 · 자료를 모르는 순수 변환만. modules/dataio/excel-sync.js 다음에 불러옴
// =============================================================================
Object.assign(ExcelSync, {

  escapeXml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
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


  // ---------------------------------------------------------------------------
  // Word(DOCX) OpenXML 스키마 정규화
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
});
