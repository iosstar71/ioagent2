// Workgroup 판: modules/dataio/smart-merge.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(SmartMergeCenter, {
  buildConfigRows() {
    const rows = [];
    rows.push({ category: "BASIC", key: "systemTitle", value: projectConfig.systemTitle || "", extra1: "", extra2: "시스템 타이틀", extra3: "" });
    rows.push({ category: "BASIC", key: "projectName", value: projectConfig.projectName || "", extra1: "", extra2: "프로젝트명", extra3: "" });
    rows.push({ category: "BASIC", key: "projectStartDate", value: projectConfig.projectStartDate || "", extra1: "", extra2: "시작일", extra3: "" });
    rows.push({ category: "BASIC", key: "projectEndDate", value: projectConfig.projectEndDate || "", extra1: "", extra2: "종료일", extra3: "" });
    rows.push({ category: "BASIC", key: "reportDate", value: projectConfig.reportDate || "", extra1: "", extra2: "보고기준일", extra3: "" });
    rows.push({ category: "BASIC", key: "weekStartDay", value: String(projectConfig.weekStartDay ?? 5), extra1: "금요일=5, 월요일=1", extra2: "주차시작요일", extra3: "" });
    if (projectConfig.weekNumbering) { const w = projectConfig.weekNumbering; rows.push({ category: "BASIC", key: "weekNumbering", value: `${w.basis}|${w.multiYear}|${w.format}`, extra1: "ANNUAL·PROJECT | PREFIX·CONTINUE | 형식", extra2: "주차표시", extra3: "" }); }
    rows.push({ category: "BASIC", key: "maxDeliverableRounds", value: String(projectConfig.maxDeliverableRounds ?? 2), extra1: "최대 4차", extra2: "산출물운영차수", extra3: "" });

    (projectConfig.domains || []).forEach((d, idx) => {
      rows.push({ category: "DOMAIN", key: `DOMAIN_${idx + 1}`, value: d, extra1: String(idx + 1), extra2: "상위 도메인", extra3: "" });
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
    rows.push({ category: "BASIC", key: "delayGap", value: String(WBSEngine.delayGap()), extra1: "%p", extra2: "지연 판정: 계획보다 실적이 이 값 이상 적으면 지연", extra3: "" });
    rows.push({ category: "BASIC", key: "dueDays", value: String(WBSEngine.dueDays()), extra1: "일", extra2: "체크할 일: 이 일수 안에 마감되는 Task · 산출물", extra3: "" });

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
        if (k === "weekNumbering" && val) { const [basis, multiYear, ...f] = String(val).split("|"); projectConfig.weekNumbering = { basis: basis === "PROJECT" ? "PROJECT" : "ANNUAL", multiYear: multiYear === "CONTINUE" ? "CONTINUE" : "PREFIX", format: f.join("|") || '"W"w' }; }
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
      if (r.category === "BASIC" && r.key === "delayGap" && r.value !== "" && !isNaN(parseFloat(r.value))) projectConfig.delayGap = Math.max(0, parseFloat(r.value));
      if (r.category === "BASIC" && r.key === "dueDays" && r.value !== "" && !isNaN(parseInt(r.value, 10))) projectConfig.dueDays = Math.max(1, parseInt(r.value, 10));
    });
    if (stdDelivs.length > 0) standardDeliverablesMeta = stdDelivs;
    return true;
  },

  // 1) 항목별 다운로드 (모든 사용자 허용)
  // [v3.3.0] scopeOverride: 화면 머리줄 [⬇ 내려받기]에서 그 화면의 서브시스템 조회 범위로 내려받을 때
  async importConsolidated(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    if (!SyncManager.isLocal()) return showToast("ℹ️ DB 서버 방식은 모두 같은 저장소를 쓰므로 마스터 파일 적용가 필요 없습니다.");
    let items;
    try { items = await ProjectTransfer.parse(file); } catch (err) { return showToast("⚠️ 파일을 읽지 못했습니다: " + err.message); }
    if (!items.length) return showToast("⚠️ 마스터 파일(④ 전체 다운로드) 파일이 아닙니다.");
    const src = items[0].data;
    const all = Permission.canEditAllSubsystems();
    const own = Permission.ownSubsystem();
    const keep = all ? [] : [own];
    const mine = sys => keep.includes(String(sys || ""));
    openConfirmDialog(`📥 [마스터 파일 적용] ${file.name}\n이 브라우저의 [${ProjectData.currentName()}] 자료를 마스터 파일로 맞춥니다.\n` +
      (keep.length ? `· 내 담당 서브시스템(${own}) 자료는 지금 내 작업 파일을 그대로 둡니다.\n` : "· 모든 서브시스템을 마스터 파일 내용으로 바꿉니다.\n") +
      `· 멤버 계정은 바꾸지 않습니다. 바꾸기 전에 스냅샷을 만듭니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("마스터 파일가져오기직전백업", "ALL", false);
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
      StorageManager._afterBulkReplace(`✅ 마스터 파일을 가져왔습니다.${keep.length ? ` (내 담당 ${own} 자료는 그대로)` : ""} (${ProjectData.countText(ProjectData.collect())})`);
    });
  },

  // [v3.9.1] 프로젝트 전체 엑셀(기준정보 · 업무 · 사용자 · 협업 시트) — 스마트병합 ④ 내려받기와 기준정보 > 백업 공용
});
