// [IOSTAR-PM] 자료 내려받기 · 올리기 (SmartMergeCenter)
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =========================================================================
// 스마트병합(tab-merge) 통합 입출력 컨트롤러 (SmartMergeCenter)
// - 모든 사용자: 다운로드 및 담당 서브시스템 업로드
// - 기준정보 / 전체(ALL) 업로드: 관리자(SYS_ADMIN) 및 PM
// =========================================================================
const SmartMergeCenter = {
  isAdminOrPm() {
    const norm = AuthManager.getCurrentRole();
    return norm === "SYS_ADMIN" || norm === "PM";
  },

  // [v1.0.7] 업무·협업 데이터 전체(ALL) 업로드: 관리자·PM·총괄리더
  ITEM_LABEL: { wbs: "WBS", req: "요구사항", voc: "VOC", deliverables: "산출물", config: "기준정보", subsystems: "서브시스템" },
  canBulkWork() {
    return Permission.canEditAllSubsystems();
  },

  refreshMergeUiPermissions() {
    const isPrivileged = this.isAdminOrPm();
    const list = getAllSubsystemNames();
    const curUser = AuthManager.getCurrentUser();
    const normRole = AuthManager.normalizeRole(curUser.role);

    // 상단 권한 안내 배지 갱신
    const bulk = this.canBulkWork();
    const badge = document.getElementById("mergeRoleNoticeBadge");
    if (badge) {
      const who = `${escapeHtml(curUser.name || curUser.empNo)} (${AuthManager.roleLabel(normRole)})`;
      badge.className = "status-badge-chip " + (isPrivileged ? "chip-completed" : bulk ? "chip-progress" : "chip-ready");
      badge.innerHTML = isPrivileged
        ? `👑 ${who} — 모든 데이터 내려받기 · 올리기 가능 (기준정보 포함)`
        : bulk
          ? `⭐ ${who} — 모든 데이터 내려받기 · 업무/협업 데이터 전체(ALL) 올리기 가능 (기준정보 올리기 제외)`
          : `👤 ${who} — 모든 데이터 내려받기 · 담당 서브시스템 데이터만 올리기 가능`;
    }

    // 분야 드롭다운 갱신
    const domains = getProjectDomains();
    ["masterPkgDomainSelect", "workDataDomainSelect"].forEach(dId => {
      const dSel = document.getElementById(dId);
      if (!dSel) return;
      const curD = dSel.value || "ALL";
      dSel.innerHTML = `<option value="ALL">전체 분야 (${domains.length}개)</option>` +
        domains.map(d => `<option value="${escapeHtml(d)}" ${d === curD ? "selected" : ""}>🗂️ ${escapeHtml(d)}</option>`).join("");
    });

    // 대상 서브시스템 드롭다운 갱신 (PM/관리자는 ALL 포함, 일반 사용자는 다운로드를 위해 ALL 선택 가능하되 업로드 시에는 개별 서브시스템 강제)
    ["masterPkgSubsysSelect", "workDataSubsysSelect"].forEach(sId => {
      const sSel = document.getElementById(sId);
      if (!sSel) return;
      const prevVal = sSel.value;
      sSel.innerHTML = "";

      const allOpt = document.createElement("option");
      allOpt.value = "ALL";
      allOpt.textContent = bulk
        ? `🌐 전체 서브시스템 (${list.length}개 · 내려받기/올리기)`
        : `🌐 전체 서브시스템 (내려받기 전용 · 올릴 때는 담당 서브시스템 선택)`;
      sSel.appendChild(allOpt);

      list.forEach(sys => {
        const meta = subsystemsMeta.find(m => m.name === sys || m.code === sys);
        const descShort = meta && meta.desc ? meta.desc.replace(/^\[[^\]]+\]\s*/, "").slice(0, 18) : "";
        const opt = document.createElement("option");
        opt.value = sys;
        opt.textContent = `🏢 ${sys}${descShort ? " (" + descShort + ")" : ""}`;
        sSel.appendChild(opt);
      });

      if (prevVal && (prevVal === "ALL" || list.includes(prevVal))) {
        sSel.value = prevVal;
      } else if (!bulk && curUser.subsystem && curUser.subsystem !== "ALL" && list.includes(curUser.subsystem)) {
        sSel.value = curUser.subsystem;
      } else {
        sSel.value = bulk ? "ALL" : (list[0] || "ALL");
      }
    });

    // 기준정보/서브시스템 업로드 버튼 상태 표시
    document.querySelectorAll(".btn-admin-pm-only").forEach(btn => {
      btn.style.opacity = isPrivileged ? "1" : "0.55";
      btn.title = isPrivileged
        ? "클릭하여 업로드"
        : "관리자(SYS_ADMIN) 또는 프로젝트 관리자(PM)만 업로드할 수 있습니다.";
    });
    // Task 데이터 건수 배지 갱신 및 서브시스템 선택 변경 이벤트 연결
    this.updateCountBadges();
    const sSel = document.getElementById("workDataSubsysSelect");
    if (sSel && !sSel.getAttribute("data-bound-cnt")) {
      sSel.setAttribute("data-bound-cnt", "1");
      sSel.addEventListener("change", () => this.updateCountBadges());
    }
  },

  // 프로젝트 기준정보를 2차원 테이블 행으로 직렬화
  buildConfigRows() {
    const rows = [];
    rows.push({ category: "BASIC", key: "systemTitle", value: projectConfig.systemTitle || "", extra1: "", extra2: "시스템 타이틀", extra3: "" });
    rows.push({ category: "BASIC", key: "projectName", value: projectConfig.projectName || "", extra1: "", extra2: "프로젝트명", extra3: "" });
    rows.push({ category: "BASIC", key: "projectStartDate", value: projectConfig.projectStartDate || "", extra1: "", extra2: "시작일", extra3: "" });
    rows.push({ category: "BASIC", key: "projectEndDate", value: projectConfig.projectEndDate || "", extra1: "", extra2: "종료일", extra3: "" });
    rows.push({ category: "BASIC", key: "reportDate", value: projectConfig.reportDate || "", extra1: "", extra2: "보고기준일", extra3: "" });
    rows.push({ category: "BASIC", key: "weekStartDay", value: String(projectConfig.weekStartDay ?? 5), extra1: "금요일=5, 월요일=1", extra2: "주차시작요일", extra3: "" });
    rows.push({ category: "BASIC", key: "maxDeliverableRounds", value: String(projectConfig.maxDeliverableRounds ?? 2), extra1: "최대 4회차", extra2: "산출물운영회차", extra3: "" });

    (projectConfig.domains || []).forEach((d, idx) => {
      rows.push({ category: "DOMAIN", key: `DOMAIN_${idx + 1}`, value: d, extra1: String(idx + 1), extra2: "상위 분야", extra3: "" });
    });

    // [v3.9.0] 이 프로젝트에서 활성화한 SDLC 유형만 + 개선과제(REQ) 단계
    const activeCodes = typeof WBSEngine !== "undefined" ? WBSEngine.getActiveSdlcList().map(s => s.code) : [];
    (projectConfig.customSdlcTypes || []).filter(s => !activeCodes.length || activeCodes.includes(s.code)).forEach(sdlc => {
      (sdlc.phases || []).forEach(ph => {
        rows.push({
          category: "SDLC_PHASE",
          key: `${sdlc.code}|${sdlc.name}`,
          value: ph.name,
          extra1: String(ph.weight || 0),
          extra2: ph.output || "",
          extra3: (ph.keywords || []).join(",")
        });
      });
    });

    const reqCode = projectConfig.activeReqPreset || "REQ_CUSTOM";
    const reqName = (typeof ProcessLib !== "undefined" && ProcessLib.findReq(reqCode) || {}).name || reqCode;
    (typeof ReqPhaseManager !== "undefined" ? ReqPhaseManager.getPhases() : []).forEach(ph => {
      rows.push({ category: "REQ_PHASE", key: `${reqCode}|${reqName}`, value: ph.name, extra1: String(ph.weight || 0), extra2: ph.output || "", extra3: (ph.keywords || []).join(",") });
    });

    (projectConfig.holidays || []).forEach(h => {
      rows.push({
        category: "HOLIDAY",
        key: h.type || "NATIONAL",
        value: h.name || "",
        extra1: h.date || "",
        extra2: WBSEngine.getDayOfWeekText(h.date),
        extra3: ""
      });
    });

    (standardDeliverablesMeta || []).forEach((std, idx) => {
      const rounds = [std.round1 ? "1" : "", std.round2 ? "2" : "", std.round3 ? "3" : "", std.round4 ? "4" : ""].filter(Boolean).join(",");
      rows.push({
        category: "STD_DELIV",
        key: std.phase || "분석설계단계",
        value: std.name || "",
        extra1: rounds,
        extra2: std.defaultDate || "",
        extra3: std.remarks || ""
      });
    });

    rows.push({
      category: "PROJECT_INFO",
      key: "layoutType",
      value: projectConfig.layoutType || document.body.getAttribute("data-layout") || "top-nav",
      extra1: projectConfig.uiDensity || document.body.getAttribute("data-density") || "standard",
      extra2: "화면 레이아웃 타입 및 표시 밀도",
      extra3: ""
    });
    rows.push({ category: "BASIC", key: "progressBasis", value: projectConfig.progressBasis || "CALENDAR", extra1: "CALENDAR=달력일수, BUSINESS=영업일", extra2: "계획 진척률 산정 기준", extra3: "" });

    (projectConfig.milestones || []).forEach(m => {
      rows.push({ category: "MILESTONE", key: m.scope || "ALL", value: m.name || "", extra1: m.date || "", extra2: m.desc || "", extra3: m.id || "" });
    });

    return rows;
  },

  applyConfigRows(rows, opts = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const domains = [];
    const sdlcMap = new Map();
    const holidays = [];
    const stdDelivs = [];
    const reqPhases = [];
    let reqCode = "";

    rows.forEach(r => {
      const cat = String(r.category || "").trim().toUpperCase();
      const k = String(r.key || "").trim();
      const val = String(r.value || "").trim();
      const ex1 = String(r.extra1 || "").trim();
      const ex2 = String(r.extra2 || "").trim();
      const ex3 = String(r.extra3 || "").trim();

      if (cat === "BASIC") {
        if (k === "systemTitle" && val) projectConfig.systemTitle = val;
        if (k === "projectName" && val) projectConfig.projectName = val;
        if (k === "projectStartDate" && val) projectConfig.projectStartDate = ExcelSync.normalizeDate(val);
        if (k === "projectEndDate" && val) projectConfig.projectEndDate = ExcelSync.normalizeDate(val);
        if (k === "reportDate" && val) projectConfig.reportDate = ExcelSync.normalizeDate(val);
        if (k === "weekStartDay" && val) projectConfig.weekStartDay = parseInt(val, 10) || 5;
        if (k === "maxDeliverableRounds" && val) projectConfig.maxDeliverableRounds = Math.min(4, Math.max(1, parseInt(val, 10) || 2));
      } else if (cat === "DOMAIN" && val) {
        if (!domains.includes(val) && domains.length < 5) domains.push(val);
      } else if (cat === "SDLC_PHASE" && k && val) {
        const [sCode, sName] = k.split("|");
        const code = (sCode || "SDLC_CUSTOM").trim();
        if (!sdlcMap.has(code)) {
          sdlcMap.set(code, { code, name: (sName || code).trim(), desc: "", phases: [] });
        }
        const entry = sdlcMap.get(code);
        entry.phases.push({
          key: `p${entry.phases.length + 1}`,
          name: val,
          weight: parseFloat(ex1) || 20,
          output: ex2,
          keywords: ex3 ? ex3.split(",").map(s => s.trim()).filter(Boolean) : [val]
        });
      } else if (cat === "REQ_PHASE" && k && val) {
        reqCode = (k.split("|")[0] || "").trim();
        reqPhases.push({ key: `r${reqPhases.length + 1}`, name: val, weight: parseFloat(ex1) || 25, output: ex2,
          keywords: ex3 ? ex3.split(",").map(s => s.trim()).filter(Boolean) : [val] });
      } else if (cat === "HOLIDAY" && val && ex1) {
        holidays.push({
          type: k === "CUSTOM" ? "CUSTOM" : "NATIONAL",
          name: val,
          date: ExcelSync.normalizeDate(ex1)
        });
      } else if (cat === "STD_DELIV" && val) {
        const rSet = ex1.split(",").map(s => s.trim());
        stdDelivs.push({
          phase: k || "분석설계단계",
          name: val,
          round1: rSet.includes("1"),
          round2: rSet.includes("2"),
          round3: rSet.includes("3"),
          round4: rSet.includes("4"),
          defaultDate: ExcelSync.normalizeDate(ex2),
          remarks: ex3
        });
      }
    });

    if (domains.length > 0) projectConfig.domains = domains;
    if (sdlcMap.size > 0) {
      projectConfig.customSdlcTypes = Array.from(sdlcMap.values()).slice(0, 4).map(s => {
        const lib = typeof ProcessLib !== "undefined" ? ProcessLib.findSdlc(s.code) : null;
        s.desc = (lib && lib.desc) || s.phases.map(p => p.name).join(" ➔ ");
        return s;
      });
      projectConfig.activeSdlcCodes = projectConfig.customSdlcTypes.map(s => s.code);
    }
    if (reqPhases.length > 0) {
      projectConfig.reqSdlcPhases = reqPhases;
      if (reqCode) projectConfig.activeReqPreset = reqCode;
    }
    if (holidays.length > 0) projectConfig.holidays = holidays;
    const milestones = rows.filter(r => r.category === "MILESTONE" && r.value).map((r, i) => ({
      id: r.extra3 || `MS-${Date.now().toString(36)}-${i}`, scope: r.key || "ALL", name: r.value, date: r.extra1 || "", desc: r.extra2 || ""
    }));
    if (milestones.length > 0) projectConfig.milestones = milestones;
    rows.forEach(r => {
      if (r.category === "PROJECT_INFO" && r.key === "layoutType" && r.value) {
        if (opts.noUi) { projectConfig.layoutType = r.value.trim(); if (r.extra1) projectConfig.uiDensity = r.extra1.trim(); }
        else {
          LayoutManager.setLayout(r.value.trim(), false);
          if (r.extra1) LayoutManager.setDensity(r.extra1.trim(), false);
        }
      }
      if (r.category === "BASIC" && r.key === "progressBasis" && r.value) {
        projectConfig.progressBasis = r.value.trim() === "BUSINESS" ? "BUSINESS" : "CALENDAR";
      }
    });
    if (stdDelivs.length > 0) standardDeliverablesMeta = stdDelivs;
    return true;
  },

  // 1) 항목별 다운로드 (모든 사용자 허용)
  // [v3.3.0] scopeOverride: 화면 머리줄 [⬇ 내려받기]에서 그 화면의 서브시스템 조회 범위로 내려받을 때
  downloadItem(itemType, format, scopeOverride) {
    const repDate = projectConfig.reportDate || "2027-06-01";
    const scopeSel = document.getElementById("workDataSubsysSelect");
    const scope = (itemType === "config" || itemType === "subsystems")
      ? "ALL"
      : (scopeOverride || (scopeSel ? scopeSel.value : "ALL"));
    const isAll = scope === "ALL";

    if (format === "JSON") {
      let payload = {
        schemaVersion: "2026_v1.3",
        itemType: itemType,
        targetScope: scope,
        exportedAt: new Date().toISOString()
      };
      if (itemType === "config") {
        payload.projectConfig = projectConfig;
        payload.standardDeliverablesMeta = standardDeliverablesMeta;
      } else if (itemType === "subsystems") {
        payload.subsystemsMeta = subsystemsMeta;
      } else if (itemType === "wbs") {
        payload.wbsData = isAll ? wbsData : wbsData.filter(d => d.system === scope);
      } else if (itemType === "req") {
        payload.reqMasterData = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
      } else if (itemType === "voc") {
        payload.vocData = isAll ? vocData : vocData.filter(v => v.system === scope);
      } else if (itemType === "deliverables") {
        payload.deliverablesData = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName(SmartMergeCenter.ITEM_LABEL[itemType] || itemType, [scope], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[${itemType.toUpperCase()} JSON 내려받기 완료] ${filename}`);
      return;
    }

    // EXCEL 다운로드
    const schema = ExcelSync.TAB_SCHEMAS[itemType];
    if (!schema) return;
    let records = [];
    if (itemType === "config") records = this.buildConfigRows();
    else if (itemType === "subsystems") records = subsystemsMeta;
    else if (itemType === "wbs") records = isAll ? wbsData : wbsData.filter(d => d.system === scope);
    else if (itemType === "req") records = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
    else if (itemType === "voc") records = isAll ? vocData : vocData.filter(v => v.system === scope);
    else if (itemType === "deliverables") records = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);

    const rows = [
      { cells: schema.map(c => c.label), styleId: 1, height: 25 }
    ];
    records.forEach(r => {
      const rowCells = schema.map(c => {
        if ((itemType === "wbs" && ["level", "weight", "pProg", "aProg"].includes(c.key)) || (itemType === "subsystems" && c.key === "weight")) {
          const num = parseFloat(r[c.key]);
          return isNaN(num) ? 0 : num;
        }
        return ExcelSync.formatExportCell(itemType, c.key, r[c.key]);
      });
      rows.push({ cells: rowCells, styleId: 2, height: 20 });
    });

    const sheetNameMap = {
      config: "0_프로젝트기준정보",
      wbs: "1_WBS공정표",
      subsystems: "2_서브시스템기준정보",
      deliverables: "3_산출물관리",
      req: "4_요구사항REQ",
      voc: "5_VOC이슈관리"
    };
    const blob = ExcelSync._buildXlsxBlob([
      { name: sheetNameMap[itemType] || itemType.toUpperCase(), colWidths: schema.map(c => c.width || 18), rows }
    ]);
    const filename = ExcelSync.stdName(SmartMergeCenter.ITEM_LABEL[itemType] || itemType, [scope], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[${itemType.toUpperCase()} 엑셀 내려받기 완료] ${filename}`);
  },

  // 2) 항목별 업로드 (권한 검증 + 서브시스템 필터링)
  async uploadItem(e, itemType, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const isPrivileged = this.isAdminOrPm();

    // 권한 체크 1: 기준정보(config) 및 서브시스템 정보(subsystems)는 관리자나 PM만 업로드 가능
    if ((itemType === "config" || itemType === "subsystems") && !isPrivileged) {
      showToast("🚫 [권한 제한] 프로젝트 기준정보 및 서브시스템 기준정보 업로드는 시스템 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다.");
      return;
    }

    const scopeSel = document.getElementById("workDataSubsysSelect");
    const targetScope = (itemType === "config" || itemType === "subsystems")
      ? "ALL"
      : (scopeSel ? scopeSel.value : "ALL");

    // 권한 체크 2: WBS/REQ/VOC/산출물의 전체(ALL) 업로드는 관리자나 PM만 가능
    if (targetScope === "ALL" && !isPrivileged) {
      showToast("🚫 [권한 제한] 일반 사용자는 [전체 서브시스템(ALL)] 일괄 업로드를 수행할 수 없습니다. 상단 드롭다운에서 담당 서브시스템을 선택한 뒤 업로드해주세요.");
      return;
    }

    try {
      // 업로드 직전 타임스탬프 백업 생성
      const backupName = BackupHistoryManager.createBackupSnapshot(`${itemType.toUpperCase()}_${format}업로드(${targetScope})`, targetScope, true);

      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        if (itemType === "config") {
          if (data.projectConfig) projectConfig = Object.assign({}, projectConfig, data.projectConfig);
          if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
        } else if (itemType === "subsystems") {
          const arr = Array.isArray(data.subsystemsMeta) ? data.subsystemsMeta : (Array.isArray(data) ? data : []);
          if (arr.length === 0) throw new Error("유효한 서브시스템 기준정보가 없습니다.");
          subsystemsMeta = arr;
          normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
        } else {
          this._mergeWorkArrayData(itemType, data, targetScope);
        }
      } else {
        // EXCEL 파싱
        const sheets = await ExcelSync._parseUploadedFile(file);
        if (itemType === "config") {
          const cfgRows = [];
          sheets.forEach(sh => {
            sh.rows.slice(1).forEach(cells => {
              if (cells.length >= 2 && cells[0] && cells[1]) {
                cfgRows.push({
                  category: cells[0],
                  key: cells[1],
                  value: cells[2] || "",
                  extra1: cells[3] || "",
                  extra2: cells[4] || "",
                  extra3: cells[5] || ""
                });
              }
            });
          });
          if (!this.applyConfigRows(cfgRows)) {
            throw new Error("엑셀 파일에서 프로젝트 기준정보 행을 찾지 못했습니다.");
          }
        } else {
          const parsedRows = this._extractRowsFromSheets(sheets, itemType);
          if (parsedRows.length === 0) {
            throw new Error(`엑셀 파일에서 [${itemType.toUpperCase()}] 데이터를 찾지 못했습니다.`);
          }
          if (itemType === "subsystems") {
            subsystemsMeta = parsedRows;
            normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
          } else {
            this._mergeWorkArrayData(itemType, parsedRows, targetScope);
          }
        }
      }

      ExcelSync._ensureWbsAndSubsystemsIntegrity();
      syncSubsystemWeights();
      this.syncConfigInputs();
      rebuildAll(true);
      this.refreshMergeUiPermissions();
      showToast(`[${itemType.toUpperCase()} (${targetScope}) 업로드 반영 완료]\n• 자동 백업 파일: ${backupName}`);
    } catch (err) {
      console.error("SmartMerge upload error:", err);
      showToast("업로드 처리 중 오류가 발생했습니다: " + err.message);
    }
  },

  _extractRowsFromSheets(sheets, targetTabKey) {
    const results = [];
    sheets.forEach(sheet => {
      let colMap = null;
      let matchedSection = false;
      const sName = (sheet.name || "").toLowerCase();
      if (
        (targetTabKey === "wbs" && (sName.includes("wbs") || sName.includes("공정"))) ||
        (targetTabKey === "subsystems" && (sName.includes("서브시스템") || sName.includes("기준"))) ||
        (targetTabKey === "deliverables" && sName.includes("산출물")) ||
        (targetTabKey === "req" && (sName.includes("요구") || sName.includes("req"))) ||
        (targetTabKey === "voc" && (sName.includes("voc") || sName.includes("이슈"))) ||
        sheets.length === 1
      ) {
        matchedSection = true;
        colMap = ExcelSync._buildDefaultColMap(targetTabKey);
      }

      sheet.rows.forEach(cells => {
        const secTitle = ExcelSync._detectSectionTitle(cells);
        if (secTitle) {
          matchedSection = (secTitle === targetTabKey);
          if (matchedSection) colMap = ExcelSync._buildDefaultColMap(targetTabKey);
          return;
        }
        const hdr = ExcelSync._matchHeaderToSchema(cells, targetTabKey);
        if (hdr && hdr.tabKey === targetTabKey) {
          matchedSection = true;
          colMap = hdr.colMap;
          return;
        }
        if (matchedSection) {
          const rawObj = ExcelSync._extractRowObject(targetTabKey, cells, colMap);
          if (rawObj) {
            const norm = ExcelSync._normalizeRowData(targetTabKey, rawObj, results.length);
            if (norm) results.push(norm);
          }
        }
      });
    });
    return results;
  },

  _mergeWorkArrayData(itemType, rawSource, targetScope) {
    let arr = [];
    if (Array.isArray(rawSource)) arr = rawSource;
    else if (rawSource && typeof rawSource === "object") {
      const keyMap = { wbs: "wbsData", req: "reqMasterData", voc: "vocData", deliverables: "deliverablesData" };
      arr = Array.isArray(rawSource[keyMap[itemType]]) ? rawSource[keyMap[itemType]] : [];
    }
    if (arr.length === 0) throw new Error("반영할 데이터가 비어 있습니다.");

    if (targetScope === "ALL") {
      if (itemType === "wbs") wbsData = arr;
      else if (itemType === "req") reqMasterData = arr;
      else if (itemType === "voc") vocData = arr;
      else if (itemType === "deliverables") deliverablesData = arr;
      return;
    }

    // 단일 서브시스템 병합: 여러 서브시스템이 섞여 있어도 targetScope와 일치하는 데이터만 추출
    const filtered = arr.filter(x => {
      const sys = String(x.system || "").trim();
      return sys === targetScope || WBSEngine.getSubsystemCode(sys) === targetScope;
    }).map(x => Object.assign({}, x, { system: targetScope }));

    const finalRows = filtered.length > 0 ? filtered : arr.map(x => Object.assign({}, x, { system: targetScope }));

    if (itemType === "wbs") {
      wbsData = wbsData.filter(d => d.system !== targetScope);
      wbsData.push(...finalRows);
    } else if (itemType === "req") {
      reqMasterData = reqMasterData.filter(r => r.system !== targetScope);
      reqMasterData.push(...finalRows);
    } else if (itemType === "voc") {
      vocData = vocData.filter(v => v.system !== targetScope);
      vocData.push(...finalRows);
    } else if (itemType === "deliverables") {
      deliverablesData = deliverablesData.filter(d => d.system !== targetScope);
      deliverablesData.push(...finalRows);
      deliverablesData.forEach((d, idx) => { d.id = idx + 1; });
    }
  },

  // 3) 상단 마스터 통합 패키지 다운로드 (JSON / EXCEL)
  downloadMasterPackage(format) {
    const sel = document.getElementById("masterPkgSubsysSelect");
    const scope = sel ? sel.value : "ALL";
    const repDate = projectConfig.reportDate || "2027-06-01";
    const isAll = scope === "ALL";

    if (format === "JSON") {
      const payload = {
        schemaVersion: "2026_v1.3",
        exportedAt: new Date().toISOString(),
        targetScope: scope,
        projectConfig: projectConfig,
        standardDeliverablesMeta: standardDeliverablesMeta,
        subsystemsMeta: isAll ? subsystemsMeta : subsystemsMeta.filter(s => s.name === scope || s.code === scope),
        wbsData: isAll ? wbsData : wbsData.filter(d => d.system === scope),
        deliverablesData: isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope),
        reqMasterData: isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope),
        vocData: isAll ? vocData : vocData.filter(v => v.system === scope)
      };
      Object.keys(this.COLLAB_DEFS).forEach(k => {
        const def = this.COLLAB_DEFS[k];
        payload[def.dataKey] = this._collabRecords(k, scope);
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("기준정보묶음", [scope], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[통합 JSON 내려받기 완료] ${filename}`);
      return;
    }

    // EXCEL 통합 다운로드 (0_프로젝트기준정보 시트 포함)
    if (!isAll) {
      ExcelSync.exportSubsystemWorkbook(scope);
      return;
    }
    const blob = ExcelSync._buildXlsxBlob(this.buildPackageSheets());
    const filename = ExcelSync.stdName("전체데이터", [], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[전체 통합 엑셀 내려받기 완료] ${filename}`);
  },

  // 4) 상단 마스터 통합 패키지 업로드 (JSON / EXCEL)
  async uploadMasterPackage(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const sel = document.getElementById("masterPkgSubsysSelect");
    const targetScope = sel ? sel.value : "ALL";
    const isPrivileged = this.isAdminOrPm(); // 기준정보 반영 권한

    if (targetScope === "ALL" && !isPrivileged) {
      showToast("🚫 [권한 제한] 전체(ALL) 통합 업로드는 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다. 개별 서브시스템을 선택해주세요.");
      return;
    }

    try {
      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        const backupName = BackupHistoryManager.createBackupSnapshot(`통합JSON업로드(${targetScope})`, targetScope, true);

        this._applyCollabPayload(data, targetScope);
        if (targetScope === "ALL" && isPrivileged) {
          if (data.projectConfig) projectConfig = Object.assign({}, projectConfig, data.projectConfig);
          if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
          if (Array.isArray(data.subsystemsMeta) && data.subsystemsMeta.length > 0) subsystemsMeta = data.subsystemsMeta;
          if (Array.isArray(data.wbsData)) wbsData = data.wbsData;
          if (Array.isArray(data.deliverablesData)) deliverablesData = data.deliverablesData;
          if (Array.isArray(data.reqMasterData)) reqMasterData = data.reqMasterData;
          if (Array.isArray(data.vocData)) vocData = data.vocData;
        } else {
          if (Array.isArray(data.wbsData)) this._mergeWorkArrayData("wbs", data.wbsData, targetScope);
          if (Array.isArray(data.reqMasterData)) this._mergeWorkArrayData("req", data.reqMasterData, targetScope);
          if (Array.isArray(data.vocData)) this._mergeWorkArrayData("voc", data.vocData, targetScope);
          if (Array.isArray(data.deliverablesData)) this._mergeWorkArrayData("deliverables", data.deliverablesData, targetScope);
        }
        normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
        ExcelSync._ensureWbsAndSubsystemsIntegrity();
        syncSubsystemWeights();
        this.syncConfigInputs();
        rebuildAll(true);
        showToast(`[통합 JSON(${targetScope}) 병합 완료]\n• 백업 생성: ${backupName}`);
      } else {
        const collabApplied = this._applyCollabSheets(await ExcelSync._parseUploadedFile(file), targetScope);
        if (collabApplied.length) showToast(`🤝 협업 데이터 반영: ${collabApplied.join(", ")}`);
        if (targetScope === "ALL" && !isPrivileged) {
          // 총괄리더: 기준정보를 제외한 업무 데이터만 서브시스템 단위로 병합
          const sheets = await ExcelSync._parseUploadedFile(file);
          ["wbs", "req", "deliverables", "voc"].forEach(k => {
            const rows = this._extractRowsFromSheets(sheets, k);
            if (rows.length) this._mergeWorkArrayData(k, rows, "ALL");
          });
          rebuildAll(true);
        } else if (targetScope === "ALL") {
          await ExcelSync.importMasterWorkbook({ target: { files: [file], value: "" } });
          normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
          rebuildAll(true);
        } else {
          await ExcelSync.importSubsystemWorkbook({ target: { files: [file], value: "" } }, targetScope);
          normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
          rebuildAll(true);
        }
      }
      this.refreshMergeUiPermissions();
    } catch (err) {
      showToast("통합 패키지 업로드 오류: " + err.message);
    }
  },

  syncConfigInputs() {
    const sEl = document.getElementById("cfgProjectStartDate");
    const eEl = document.getElementById("cfgProjectEndDate");
    const rEl = document.getElementById("globalReportDate");
    const wEl = document.getElementById("cfgWeekStartDay");
    const mEl = document.getElementById("cfgMaxDeliverableRounds");
    if (sEl) sEl.value = projectConfig.projectStartDate;
    if (eEl) eEl.value = projectConfig.projectEndDate;
    if (rEl) rEl.value = projectConfig.reportDate;
    if (wEl) wEl.value = projectConfig.weekStartDay;
    if (mEl) mEl.value = projectConfig.maxDeliverableRounds || 2;
    LayoutManager.init();
  },

  // ---- [v1.0.7] 협업 데이터 (주간보고 · 회의록 · 공지사항 · 소통 피드) 입출력 — 채팅 제외 ----
  COLLAB_DEFS: {
    weekly: {
      dataKey: "weeklyReportsData", sheet: "7_주간보고", label: "주간보고",
      cols: [["id", "보고서ID"], ["weekLabel", "보고주차"], ["scope", "작성단위"], ["scopeValue", "단위값"], ["status", "상태"], ["author", "작성자"], ["updatedAt", "저장일시"], ["currentWeekSummary", "금주요약"], ["nextWeekSummary", "차주요약"], ["issuesNotes", "현안"]],
      inScope: (r, sc) => r.scope === "SYS" ? r.scopeValue === sc : false
    },
    meetings: {
      dataKey: "meetingsData", sheet: "8_회의록", label: "회의록",
      cols: [["id", "회의ID"], ["system", "서브시스템"], ["title", "회의명"], ["date", "회의일자"], ["startTime", "시작"], ["endTime", "종료"], ["location", "장소"], ["host", "주관"], ["status", "상태"], ["summary", "요약"]],
      inScope: (r, sc) => r.system === sc || r.system === "ALL"
    },
    notices: {
      dataKey: "noticesData", sheet: "9_공지사항", label: "공지사항",
      cols: [["id", "공지ID"], ["title", "제목"], ["priority", "중요도"], ["author", "작성자"], ["date", "등록일"], ["isPinned", "상단고정"], ["content", "내용"]],
      inScope: () => true
    },
    comms: {
      dataKey: "communicationsData", sheet: "10_소통피드", label: "소통피드",
      cols: [["id", "게시ID"], ["channel", "채널"], ["title", "제목"], ["taskId", "연계 Task"], ["author", "작성자"], ["date", "작성일"], ["content", "내용"]],
      inScope: (r, sc) => r.channel === sc || r.channel === "전체"
    }
  },
  COLLAB_JSON_COL: "원본데이터(JSON)",

  toggleCollabCheckboxes(checked) {
    Object.keys(this.COLLAB_DEFS).forEach(k => {
      const el = document.getElementById(`chkCollab_${k}`);
      if (el) el.checked = checked;
    });
  },
  getSelectedCollabKeys() {
    return Object.keys(this.COLLAB_DEFS).filter(k => {
      const el = document.getElementById(`chkCollab_${k}`);
      return el && el.checked;
    });
  },
  // [v3.9.0] ② 공지사항 · 소통 피드는 프로젝트 전체 단위 (서브시스템을 고르지 않음)
  _collabScope() { return "ALL"; },
  _collabRecords(k, scope) {
    const def = this.COLLAB_DEFS[k];
    const all = DataRegistry.get(def.dataKey) || [];
    return !scope || scope === "ALL" ? all : all.filter(r => def.inScope(r, scope));
  },
  _collabSheet(k, scope) {
    const def = this.COLLAB_DEFS[k];
    const rows = [{ cells: def.cols.map(c => c[1]).concat(this.COLLAB_JSON_COL), styleId: 1, height: 25 }];
    this._collabRecords(k, scope).forEach(r => {
      const json = JSON.stringify(r);
      rows.push({ cells: def.cols.map(c => ExcelSync.sanitizeFormulaInjection(r[c[0]] === undefined ? "" : String(r[c[0]]))).concat(json.length > 32000 ? "" : json), styleId: 2, height: 20 });
    });
    return { name: def.sheet, colWidths: def.cols.map(() => 18).concat(40), rows };
  },

  downloadCollabData(format) {
    const keys = this.getSelectedCollabKeys();
    if (!keys.length) {
      showToast("⚠️ 내려받을 협업 데이터 항목을 1개 이상 선택하세요.");
      return;
    }
    const scope = this._collabScope();
    const repDate = projectConfig.reportDate || "";
    if (format === "JSON") {
      const payload = { schemaVersion: `AX_PMYS_${APP_VERSION.version}_COLLAB`, exportCategory: "COLLAB", targetScope: scope, exportedAt: new Date().toISOString() };
      keys.forEach(k => { payload[this.COLLAB_DEFS[k].dataKey] = this._collabRecords(k, scope); });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("협업데이터", [scope], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`📥 [협업 데이터 JSON 내려받기] ${filename}`);
      return;
    }
    const blob = ExcelSync._buildXlsxBlob(keys.map(k => this._collabSheet(k, scope)));
    const filename = ExcelSync.stdName("협업데이터", [scope], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📥 [협업 데이터 엑셀 내려받기] ${filename}`);
  },

  // 같은 ID 는 갱신, 새 ID 는 추가 (범위 밖 항목은 제외)
  _upsertCollab(k, records, scope) {
    const def = this.COLLAB_DEFS[k];
    const list = DataRegistry.get(def.dataKey) || [];
    let added = 0, updated = 0;
    (records || []).forEach(r => {
      if (!r || typeof r !== "object") return;
      if (scope && scope !== "ALL" && !def.inScope(r, scope)) return;
      if (!r.id) r.id = `${k.toUpperCase()}-${Date.now().toString(36)}-${added + updated}`;
      const idx = list.findIndex(x => x.id === r.id);
      if (idx >= 0) { list[idx] = Object.assign({}, list[idx], r); updated++; }
      else { list.push(r); added++; }
    });
    DataRegistry.set(def.dataKey, list);
    return added + updated ? `${def.label}(추가 ${added} · 갱신 ${updated})` : "";
  },

  _applyCollabPayload(data, scope) {
    const applied = [];
    Object.keys(this.COLLAB_DEFS).forEach(k => {
      const arr = data && data[this.COLLAB_DEFS[k].dataKey];
      if (Array.isArray(arr)) {
        const r = this._upsertCollab(k, arr, scope);
        if (r) applied.push(r);
      }
    });
    return applied;
  },

  _applyCollabSheets(sheets, scope, onlyKeys) {
    const applied = [];
    Object.keys(this.COLLAB_DEFS).filter(k => !onlyKeys || onlyKeys.includes(k)).forEach(k => {
      const def = this.COLLAB_DEFS[k];
      const sheet = (sheets || []).find(sh => String(sh.name || "").replace(/\s/g, "") === def.sheet || String(sh.name || "").includes(def.label));
      if (!sheet || !sheet.rows || !sheet.rows.length) return;
      const hdrIdx = sheet.rows.findIndex(cells => (cells || []).map(c => String(c || "").trim()).includes(def.cols[0][1]));
      if (hdrIdx < 0) return;
      const hdr = sheet.rows[hdrIdx].map(c => String(c || "").trim());
      const jsonCol = hdr.indexOf(this.COLLAB_JSON_COL);
      const records = sheet.rows.slice(hdrIdx + 1).map(cells => {
        let rec = {};
        if (jsonCol >= 0 && cells[jsonCol]) {
          try { rec = JSON.parse(cells[jsonCol]); } catch (e) { rec = {}; }
        }
        def.cols.forEach(([key, label]) => {
          const ci = hdr.indexOf(label);
          if (ci >= 0 && cells[ci] !== undefined && cells[ci] !== "") rec[key] = key === "isPinned" ? String(cells[ci]) === "true" : cells[ci];
        });
        return rec.id || rec.title || rec.name ? rec : null;
      }).filter(Boolean);
      const r = this._upsertCollab(k, records, scope);
      if (r) applied.push(r);
    });
    return applied;
  },

  async uploadCollabData(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    const keys = this.getSelectedCollabKeys();
    if (!keys.length) {
      showToast("⚠️ 올릴 협업 데이터 항목을 1개 이상 선택하세요.");
      return;
    }
    const scope = this._collabScope();
    if (!this.isAdminOrPm()) {
      showToast("🚫 [권한 제한] 공지사항 · 소통 피드 올리기는 시스템관리자 · PM만 할 수 있습니다.");
      return;
    }
    try {
      const backupName = BackupHistoryManager.createBackupSnapshot(`협업데이터업로드(${scope})`, scope, true);
      let applied;
      if (format === "JSON") {
        const data = JSON.parse(await file.text());
        const filtered = {};
        keys.forEach(k => { const dk = this.COLLAB_DEFS[k].dataKey; if (data[dk]) filtered[dk] = data[dk]; });
        applied = this._applyCollabPayload(filtered, scope);
      } else {
        applied = this._applyCollabSheets(await ExcelSync._parseUploadedFile(file), scope, keys);
      }
      if (!applied.length) throw new Error("파일에서 선택한 협업 데이터 항목을 찾지 못했습니다.");
      rebuildAll(true);
      NoticeCommManager.renderAll();
      MeetingManager.onDataReloaded();
      WeeklyReportManager.onDataReloaded();
      this.updateCountBadges();
      showToast(`✅ [협업 데이터 반영 완료] ${applied.join(", ")} · 백업: ${backupName}`);
    } catch (err) {
      showToast("협업 데이터 업로드 오류: " + err.message);
    }
  },

  // ---- 다중선택(Multi-select) 기준정보 & Task데이터 입출력 ----
  MASTER_KEYS: ["config", "subsystems", "users"],
  // [v3.9.0] 서브시스템별 내려받기 · 올리기에 주간보고 · 회의록 포함 (공지 · 소통 · 기준정보는 프로젝트 전체 단위, 올리기는 PM 이상)
  WORK_KEYS: ["wbs", "req", "deliverables", "voc", "weekly", "meetings"],
  WORK_COLLAB: ["weekly", "meetings"],

  SHEET_NAMES: {
    config: "0_프로젝트기준정보",
    wbs: "1_WBS공정표",
    subsystems: "2_서브시스템기준정보",
    deliverables: "3_산출물관리",
    req: "4_요구사항REQ",
    voc: "5_VOC이슈관리",
    users: "6_사용자목록"
  },

  toggleWorkCheckboxes(checked) {
    this.WORK_KEYS.forEach(k => {
      const el = document.getElementById(`chkWork_${k}`);
      if (el) el.checked = checked;
    });
  },

  toggleMasterCheckboxes(checked) {
    this.MASTER_KEYS.forEach(k => {
      const el = document.getElementById(`chkMaster_${k}`);
      if (el) el.checked = checked;
    });
  },

  getSelectedWorkKeys() {
    return this.WORK_KEYS.filter(k => {
      const el = document.getElementById(`chkWork_${k}`);
      return el && el.checked;
    });
  },

  getSelectedMasterKeys() {
    return this.MASTER_KEYS.filter(k => {
      const el = document.getElementById(`chkMaster_${k}`);
      return el && el.checked;
    });
  },

  updateCountBadges() {
    const scopeSel = document.getElementById("workDataSubsysSelect");
    const scope = scopeSel ? scopeSel.value : "ALL";
    const isAll = !scope || scope === "ALL";

    const wCnt = isAll ? wbsData.length : wbsData.filter(d => d.system === scope).length;
    const rCnt = isAll ? reqMasterData.length : reqMasterData.filter(r => r.system === scope).length;
    const dCnt = isAll ? deliverablesData.length : deliverablesData.filter(d => d.system === scope).length;
    const vCnt = isAll ? vocData.length : vocData.filter(v => v.system === scope).length;

    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt("cntBadge_wbs", wCnt);
    setTxt("cntBadge_req", rCnt);
    setTxt("cntBadge_deliverables", dCnt);
    setTxt("cntBadge_voc", vCnt);
    setTxt("cntBadge_subsystems", subsystemsMeta.length);
    setTxt("cntBadge_users", projectUsers.length);
    this.WORK_COLLAB.forEach(k => setTxt(`cntBadge_${k}`, this._collabRecords(k, scope).length));
    ["notices", "comms"].forEach(k => setTxt(`cntBadge_${k}`, this._collabRecords(k, "ALL").length));
  },

  // [v4.0.0] 로컬 저장소 방식: PM 이 배포한 종합본을 내 브라우저에 반영 — 내 담당 서브시스템 자료는 내 것을 유지
  async importConsolidated(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    if (!SyncManager.isLocal()) return showToast("ℹ️ DB 서버 방식은 모두 같은 저장소를 쓰므로 종합본 가져오기가 필요 없습니다.");
    let items;
    try { items = await ProjectTransfer.parse(file); } catch (err) { return showToast("⚠️ 파일을 읽지 못했습니다: " + err.message); }
    if (!items.length) return showToast("⚠️ 종합본(④ 전체 내려받기) 파일이 아닙니다.");
    const src = items[0].data;
    const all = Permission.canEditAllSubsystems();
    const own = Permission.ownSubsystem();
    const keep = all ? [] : [own];
    const mine = sys => keep.includes(String(sys || ""));
    openConfirmDialog(`📥 [종합본 가져오기] ${file.name}\n이 브라우저의 [${ProjectData.currentName()}] 자료를 종합본으로 맞춥니다.\n` +
      (keep.length ? `· 내 담당 서브시스템(${own}) 자료는 지금 내 자료를 그대로 둡니다.\n` : "· 모든 서브시스템을 종합본 내용으로 바꿉니다.\n") +
      `· 사용자 계정은 바꾸지 않습니다. 바꾸기 전에 복원 지점을 만듭니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("종합본가져오기직전백업", "ALL", false);
      const cur = ProjectData.collect();
      const by = (k, f) => (src[k] || []).filter(r => !f(r)).concat((cur[k] || []).filter(f));
      ["wbsData", "reqMasterData", "deliverablesData", "vocData"].forEach(k => DataRegistry.set(k, by(k, r => mine(r.system))));
      DataRegistry.set("weeklyReportsData", by("weeklyReportsData", r => r.scope === "SYS" && mine(r.scopeValue)));
      DataRegistry.set("meetingsData", by("meetingsData", r => mine(r.system)));
      ["noticesData", "communicationsData"].forEach(k => DataRegistry.set(k, src[k] || []));
      const keepName = projectConfig.projectName;
      if (src.projectConfig) projectConfig = Object.assign({}, projectConfig, src.projectConfig, { projectName: keepName });
      if (Array.isArray(src.subsystemsMeta) && src.subsystemsMeta.length) subsystemsMeta = src.subsystemsMeta;
      if (Array.isArray(src.standardDeliverablesMeta)) standardDeliverablesMeta = src.standardDeliverablesMeta;
      StorageManager._afterBulkReplace(`✅ 종합본을 가져왔습니다.${keep.length ? ` (내 담당 ${own} 자료는 그대로)` : ""} (${ProjectData.countText(ProjectData.collect())})`);
    });
  },

  // [v3.9.1] 프로젝트 전체 엑셀(기준정보 · 업무 · 사용자 · 협업 시트) — 스마트병합 ④ 내려받기와 기준정보 > 백업 공용
  buildPackageSheets() {
    const cfgSchema = ExcelSync.TAB_SCHEMAS.config;
    const cfgRows = [
      { cells: cfgSchema.map(c => c.label), styleId: 1, height: 25 },
      ...this.buildConfigRows().map(r => ({
        cells: cfgSchema.map(c => r[c.key] || ""),
        styleId: 2,
        height: 20
      }))
    ];
    const sheets = [
      { name: "0_프로젝트기준정보", colWidths: cfgSchema.map(c => c.width || 20), rows: cfgRows }
    ];
    ExcelSync.SECTION_META.forEach(sec => {
      const schema = ExcelSync.TAB_SCHEMAS[sec.key];
      const data = ExcelSync.getTabData(sec.key);
      const sRows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }];
      data.forEach(r => {
        const rowCells = schema.map(c => {
          if ((sec.key === "wbs" && ["level", "weight", "pProg", "aProg"].includes(c.key)) || (sec.key === "subsystems" && c.key === "weight")) {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return ExcelSync.formatExportCell(sec.key, c.key, r[c.key]);
        });
        sRows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({ name: sec.sheetName, colWidths: schema.map(c => c.width || 16), rows: sRows });
    });

    // [v3.9.0] 이 프로젝트 참여자 (시스템관리자 제외) — 올리면 그 프로젝트의 역할 · 담당으로 들어감
    const uSchema = ExcelSync.TAB_SCHEMAS.users;
    sheets.push({ name: this.SHEET_NAMES.users, colWidths: uSchema.map(c => c.width || 18),
      rows: [{ cells: uSchema.map(c => c.label), styleId: 1, height: 25 }].concat(this._projectUserRows(false).map(r => ({ cells: uSchema.map(c => ExcelSync.formatExportCell("users", c.key, r[c.key])), styleId: 2, height: 20 }))) });
    Object.keys(this.COLLAB_DEFS).forEach(k => sheets.push(this._collabSheet(k, "ALL")));
    return sheets;
  },

  // [v3.9.0] 사용자 목록 = 이 프로젝트에서의 역할 · 담당 서브시스템 · 부서 (사용자 정보는 프로젝트별)
  _projectUserRows(withAdmins) {
    return (projectUsers || []).filter(u => withAdmins || !ProjectContext.isAdminUser(u)).map(u => {
      const e = ProjectContext.effective ? ProjectContext.effective(u) : u;
      return { empNo: u.empNo, name: u.name, role: e.role, subsystem: e.subsystem || "ALL", dept: e.dept || u.dept || "", lang: u.lang || "ko" };
    });
  },

  // 기준정보 다중선택 다운로드 (프로젝트 기준정보, 서브시스템 정보, 사용자 목록)
  downloadSelectedMasterData(format, overrideKeys = null) {
    const selected = overrideKeys || this.getSelectedMasterKeys();
    if (selected.length === 0) {
      showToast("⚠️ 다운로드할 기준정보 항목을 최소 1개 이상 선택해주세요.");
      return;
    }
    const repDate = projectConfig.reportDate || "2027-06-01";
    const labelStr = selected.join("_").toUpperCase();

    if (format === "JSON") {
      const payload = {
        schemaVersion: "2026_v1.3.5",
        exportCategory: "MASTER_MULTI",
        selectedItems: selected,
        exportedAt: new Date().toISOString()
      };
      if (selected.includes("config")) {
        payload.projectConfig = projectConfig;
        payload.standardDeliverablesMeta = standardDeliverablesMeta;
      }
      if (selected.includes("subsystems")) {
        payload.subsystemsMeta = subsystemsMeta;
      }
      if (selected.includes("users")) {
        payload.projectUsers = projectUsers;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("기준정보", [labelStr], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[기준정보(${selected.length}종) JSON 내려받기 완료]\n${filename}`);
      return;
    }

    // EXCEL 다중 시트 생성
    const sheets = [];
    selected.forEach(k => {
      if (this.WORK_COLLAB.includes(k)) { sheets.push(this._collabSheet(k, scope)); return; }
      const schema = ExcelSync.TAB_SCHEMAS[k];
      if (!schema) return;
      let records = [];
      if (k === "config") records = this.buildConfigRows();
      else if (k === "subsystems") records = subsystemsMeta;
      else if (k === "users") records = this._projectUserRows(true);

      const rows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }];
      records.forEach(r => {
        const rowCells = schema.map(c => {
          if (k === "subsystems" && c.key === "weight") {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return ExcelSync.formatExportCell(k, c.key, r[c.key]);
        });
        rows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({
        name: this.SHEET_NAMES[k] || k.toUpperCase(),
        colWidths: schema.map(c => c.width || 18),
        rows
      });
    });

    const blob = ExcelSync._buildXlsxBlob(sheets);
    const filename = ExcelSync.stdName("기준정보", [labelStr], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[기준정보(${selected.length}종) 엑셀 내려받기 완료]\n${filename}`);
  },

  // 기준정보 다중선택 업로드 (관리자/PM 전용)
  async uploadSelectedMasterData(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    if (!this.isAdminOrPm()) {
      showToast("🚫 [권한 제한] 기준정보(프로젝트 설정·서브시스템·사용자 목록) 업로드는 시스템 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다.");
      return;
    }

    const selected = this.getSelectedMasterKeys();
    if (selected.length === 0) {
      showToast("⚠️ 업로드하여 반영할 기준정보 항목을 최소 1개 이상 체크해주세요.");
      return;
    }

    try {
      const backupName = BackupHistoryManager.createBackupSnapshot(`기준정보업로드(${selected.join("+")})`, "ALL", true);
      const applied = [];

      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        if (selected.includes("config") && (data.projectConfig || data.standardDeliverablesMeta)) {
          if (data.projectConfig) projectConfig = Object.assign({}, projectConfig, data.projectConfig);
          if (Array.isArray(data.standardDeliverablesMeta)) standardDeliverablesMeta = data.standardDeliverablesMeta;
          applied.push("프로젝트 기준정보");
        }
        if (selected.includes("subsystems")) {
          const arr = Array.isArray(data.subsystemsMeta) ? data.subsystemsMeta : (Array.isArray(data) ? data : []);
          if (arr.length > 0) {
            subsystemsMeta = arr;
            normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
            applied.push(`서브시스템(${subsystemsMeta.length}개)`);
          }
        }
        if (selected.includes("users")) {
          const uArr = Array.isArray(data.projectUsers) ? data.projectUsers : [];
          if (uArr.length > 0) {
            this._mergeUsersList(uArr);
            applied.push(`사용자(${projectUsers.length}명)`);
          }
        }
      } else {
        const sheets = await ExcelSync._parseUploadedFile(file);
        if (selected.includes("config")) {
          const cfgRows = this._extractMasterSheetRows(sheets, "config");
          if (cfgRows.length > 0 && this.applyConfigRows(cfgRows)) {
            applied.push("프로젝트 기준정보");
          }
        }
        if (selected.includes("subsystems")) {
          const subRows = this._extractMasterSheetRows(sheets, "subsystems");
          if (subRows.length > 0) {
            subsystemsMeta = subRows;
            normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.cleanObsoleteChannelData === "function") {
        NoticeCommManager.cleanObsoleteChannelData();
      }
            applied.push(`서브시스템(${subsystemsMeta.length}개)`);
          }
        }
        if (selected.includes("users")) {
          const userRows = this._extractMasterSheetRows(sheets, "users");
          if (userRows.length > 0) {
            this._mergeUsersList(userRows);
            applied.push(`사용자(${projectUsers.length}명)`);
          }
        }
      }

      if (applied.length === 0) {
        throw new Error("업로드한 파일에서 체크된 기준정보 항목에 해당하는 유효 데이터를 찾지 못했습니다.");
      }

      ExcelSync._ensureWbsAndSubsystemsIntegrity();
      syncSubsystemWeights();
      this.syncConfigInputs();
      rebuildAll(true);
      this.refreshMergeUiPermissions();
      showToast(`✅ [기준정보 다중선택 업로드 완료]\n• 반영 항목: ${applied.join(", ")}\n• 자동 백업: ${backupName}`);
    } catch (err) {
      showToast("기준정보 업로드 오류: " + err.message);
    }
  },

  // [v3.0.0] 사용자 가져오기: 이 프로젝트의 참여 정보(역할·담당·부서)로 추가·갱신 (목록에 없는 기존 사용자는 그대로 둠)
  _mergeUsersList(incomingUsers) {
    if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) return;
    const pid = ProjectContext.current;
    const list = (projectUsers || []).slice();
    incomingUsers.forEach(inU => {
      if (!inU || !inU.empNo) return;
      const key = String(inU.empNo).toLowerCase();
      let row = list.find(u => String(u.empNo || "").toLowerCase() === key);
      if (!row) {
        const other = ProjectContext.findAny(key);
        if (other && !ProjectContext.isAdminUser(other) && !ProjectManager.isAdmin()) return; // 다른 프로젝트 사용자: 시스템관리자만
        row = other || { empNo: inU.empNo, name: inU.name || inU.empNo, role: "MEMBER", pwdHash: "", lang: "ko" };
        list.push(row);
      }
      if (inU.name) row.name = inU.name;
      if (key === "admin" || ProjectContext.isAdminUser(row)) return;
      const cur = ProjectContext.member(row, pid) || {};
      const role = AuthManager.normalizeRole(inU.role || cur.role || "MEMBER");
      row.projectRoles = Object.assign({}, row.projectRoles, { [pid]: {
        role: role === "SYS_ADMIN" ? "PM" : role,
        subsystem: inU.subsystem || cur.subsystem || "ALL",
        dept: inU.dept !== undefined ? inU.dept : (cur.dept || row.dept || "")
      } });
    });
    projectUsers = list;
  },

  _extractMasterSheetRows(sheets, targetKey) {
    const results = [];
    sheets.forEach(sheet => {
      const sName = (sheet.name || "").toLowerCase();
      let matched = false;
      let colMap = null;

      if (
        (targetKey === "config" && (sName.includes("프로젝트기준") || sName.includes("기본정보") || sName.includes("config"))) ||
        (targetKey === "subsystems" && (sName.includes("서브시스템") || sName.includes("subsystem"))) ||
        (targetKey === "users" && (sName.includes("사용자") || sName.includes("인력") || sName.includes("user"))) ||
        sheets.length === 1
      ) {
        matched = true;
        colMap = ExcelSync._buildDefaultColMap(targetKey);
      }

      sheet.rows.forEach(cells => {
        const hdr = ExcelSync._matchHeaderToSchema(cells, targetKey);
        if (hdr && hdr.tabKey === targetKey) {
          matched = true;
          colMap = hdr.colMap;
          return;
        }
        if (matched) {
          const rawObj = ExcelSync._extractRowObject(targetKey, cells, colMap);
          if (rawObj) {
            const norm = ExcelSync._normalizeRowData(targetKey, rawObj, results.length);
            if (norm) results.push(norm);
          }
        }
      });
    });
    return results;
  },

  // [8] Task 데이터(WBS, 요구사항, 산출물, VOC) 다중선택 다운로드
  downloadSelectedWorkData(format) {
    const selected = this.getSelectedWorkKeys();
    if (selected.length === 0) {
      showToast("⚠️ 내려받을 항목(WBS · 요구사항 · 산출물 · VOC · 주간보고 · 회의록)을 1개 이상 선택하세요.");
      return;
    }
    const scopeSel = document.getElementById("workDataSubsysSelect");
    const scope = scopeSel ? scopeSel.value : "ALL";
    const isAll = scope === "ALL";
    const repDate = projectConfig.reportDate || "2027-06-01";
    const labelStr = selected.join("_").toUpperCase();

    if (format === "JSON") {
      const payload = {
        schemaVersion: "2026_v1.3.5",
        exportCategory: "WORK_MULTI",
        targetScope: scope,
        selectedItems: selected,
        exportedAt: new Date().toISOString()
      };
      if (selected.includes("wbs")) payload.wbsData = isAll ? wbsData : wbsData.filter(d => d.system === scope);
      if (selected.includes("req")) payload.reqMasterData = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
      if (selected.includes("deliverables")) payload.deliverablesData = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);
      if (selected.includes("voc")) payload.vocData = isAll ? vocData : vocData.filter(v => v.system === scope);
      this.WORK_COLLAB.filter(k => selected.includes(k)).forEach(k => { payload[this.COLLAB_DEFS[k].dataKey] = this._collabRecords(k, scope); });

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const filename = ExcelSync.stdName("업무데이터", [scope, labelStr], "json");
      ExcelSync._triggerDownload(blob, filename);
      showToast(`[Task데이터(${selected.length}종 · ${scope}) JSON 내려받기 완료]\n${filename}`);
      return;
    }

    // EXCEL 다중 시트 다운로드
    const sheets = [];
    selected.forEach(k => {
      const schema = ExcelSync.TAB_SCHEMAS[k];
      if (!schema) return;
      let records = [];
      if (k === "wbs") records = isAll ? wbsData : wbsData.filter(d => d.system === scope);
      else if (k === "req") records = isAll ? reqMasterData : reqMasterData.filter(r => r.system === scope);
      else if (k === "deliverables") records = isAll ? deliverablesData : deliverablesData.filter(d => d.system === scope);
      else if (k === "voc") records = isAll ? vocData : vocData.filter(v => v.system === scope);

      const rows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }];
      records.forEach(r => {
        const rowCells = schema.map(c => {
          if (k === "wbs" && ["level", "weight", "pProg", "aProg"].includes(c.key)) {
            const num = parseFloat(r[c.key]);
            return isNaN(num) ? 0 : num;
          }
          return ExcelSync.formatExportCell(k, c.key, r[c.key]);
        });
        rows.push({ cells: rowCells, styleId: 2, height: 20 });
      });
      sheets.push({
        name: this.SHEET_NAMES[k] || k.toUpperCase(),
        colWidths: schema.map(c => c.width || 16),
        rows
      });
    });

    const blob = ExcelSync._buildXlsxBlob(sheets);
    const filename = ExcelSync.stdName("업무데이터", [scope, labelStr], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`[Task데이터(${selected.length}종 · ${scope}) 엑셀 내려받기 완료]\n${filename}`);
  },

  // [8] Task 데이터(WBS, 요구사항, 산출물, VOC) 다중선택 업로드 병합
  async uploadSelectedWorkData(e, format) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;

    const selected = this.getSelectedWorkKeys();
    if (selected.length === 0) {
      showToast("⚠️ 업로드하여 병합할 Task 데이터 항목을 최소 1개 이상 체크해주세요.");
      return;
    }

    const scopeSel = document.getElementById("workDataSubsysSelect");
    const targetScope = scopeSel ? scopeSel.value : "ALL";

    // 권한 체크: 전체(ALL) 업로드는 관리자·PM·총괄리더
    if (targetScope === "ALL" && !this.canBulkWork()) {
      showToast("🚫 [권한 제한] 일반 사용자는 [전체 서브시스템(ALL)] 일괄 업로드를 수행할 수 없습니다. STEP 1에서 담당 서브시스템을 선택한 뒤 업로드해주세요.");
      return;
    }

    try {
      const backupName = BackupHistoryManager.createBackupSnapshot(`Task데이터업로드(${targetScope}:${selected.join("+")})`, targetScope, true);
      const applied = [];

      if (format === "JSON") {
        const text = await file.text();
        const data = JSON.parse(text);
        selected.filter(k => this.WORK_COLLAB.includes(k)).forEach(k => {
          const r = this._upsertCollab(k, data[this.COLLAB_DEFS[k].dataKey], targetScope);
          if (r) applied.push(r);
        });
        selected.filter(k => !this.WORK_COLLAB.includes(k)).forEach(k => {
          const keyMap = { wbs: "wbsData", req: "reqMasterData", deliverables: "deliverablesData", voc: "vocData" };
          const arr = Array.isArray(data[keyMap[k]]) ? data[keyMap[k]] : (selected.length === 1 && Array.isArray(data) ? data : []);
          if (arr.length > 0) {
            this._mergeWorkArrayData(k, arr, targetScope);
            applied.push(`${k.toUpperCase()}(${arr.length}건)`);
          }
        });
      } else {
        const sheets = await ExcelSync._parseUploadedFile(file);
        const coll = selected.filter(k => this.WORK_COLLAB.includes(k));
        if (coll.length) applied.push(...this._applyCollabSheets(sheets, targetScope, coll));
        selected.filter(k => !this.WORK_COLLAB.includes(k)).forEach(k => {
          const rows = this._extractRowsFromSheets(sheets, k);
          if (rows.length > 0) {
            this._mergeWorkArrayData(k, rows, targetScope);
            applied.push(`${k.toUpperCase()}(${rows.length}건)`);
          }
        });
      }

      if (applied.length === 0) {
        throw new Error("업로드한 파일에서 선택한 Task 데이터 항목에 해당하는 유효 데이터를 찾지 못했습니다.");
      }

      ExcelSync._ensureWbsAndSubsystemsIntegrity();
      syncSubsystemWeights();
      rebuildAll(true);
      if (selected.includes("meetings") && typeof MeetingManager !== "undefined") MeetingManager.onDataReloaded();
      if (selected.includes("weekly") && typeof WeeklyReportManager !== "undefined") WeeklyReportManager.onDataReloaded();
      this.refreshMergeUiPermissions();
      showToast(`✅ [Task데이터 다중선택 병합 완료 (범위: ${targetScope})]\n• 반영 항목: ${applied.join(", ")}\n• 자동 백업: ${backupName}`);
    } catch (err) {
      showToast("Task데이터 업로드 오류: " + err.message);
    }
  }
};
