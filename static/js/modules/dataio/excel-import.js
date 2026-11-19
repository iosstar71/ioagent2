// =============================================================================
// 엑셀 업로드 (ExcelSync 의 일부) — 머리글을 자료 열에 맞추고, 행을 자료로 바꿔 마스터 · 서브시스템 파일을 불러옴
// modules/dataio/excel-sync.js · excel-format.js 다음에 불러옴
// =============================================================================
Object.assign(ExcelSync, {


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
        // 진척률은 0~100 으로 보정 (엑셀에 범위를 벗어난 값이 있어도 그대로 들어가지 않음)
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
        vocType: ["VOC", "버그", "이슈"].indexOf(String(raw.vocType || "").trim()) !== -1 ? String(raw.vocType).trim() : (/bug|버그|결함/i.test(String(raw.vocType || "")) ? "버그" : (/issue|이슈/i.test(String(raw.vocType || "")) ? "이슈" : "VOC")),
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


  // 서브시스템별 엑셀(.xlsx) 업로드 병합 (업로드 시 업데이트 날짜·시간 백업 JSON 자동 생성)
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

      // 전체 일괄 파일의 프로젝트 기준정보 · 작업자 시트 (서브시스템 시트로 잘못 읽지 않게 따로 처리)
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
});
