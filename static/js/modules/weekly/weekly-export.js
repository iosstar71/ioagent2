// =============================================================================
// [Project Mgmt v3.1.0] 주간보고 내려받기 (WeeklyExport)
// -----------------------------------------------------------------------------
//  - 파일 이름 규칙: {파일약칭}_주간보고_{yyyy}W{주차}_{범위}_{양식}_{판}.{확장자}
//      예) P001_주간보고_2027W22_ALL_DOC-T_v2.docx
//      범위: ALL(통합) / S-서브시스템 / D-분야,  양식: XLSX / DOC-T(표 포함) / DOC-N(서술형)
//      판: 작성 완료 횟수(v1, v2 …), 작성 완료 전 = DRAFT, 작성 완료본 없이 자동 생성 = AUTO
//  - 작성 시점 자료: [작성 완료] 할 때 지표·요구사항·VOC·회의·Action Item 을 보고서에 함께 저장(snapshot)
//      → 지난 주간보고는 나중에 내려받아도 작성 당시 숫자로 나옴
//  - 엑셀과 워드는 같은 보고서 모델(model)에서 만들어 목차·표 구성이 같음
//      1. 개요 및 핵심 지표  2. 금주 추진 실적  3. 차주 추진 계획
//      4. 이슈 · 요구사항 · VOC  5. 회의 · Action Item  6. 작성 현황
// =============================================================================
var WeeklyExport = {
  // ---------------------------------------------------------------------------
  // 파일 이름
  // ---------------------------------------------------------------------------
  safe(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/[\\/:*?"<>|\[\]()~{}#%&+=,;'`!@$^]+/g, "_")
      .replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  },
  fileCode() {
    const pid = typeof ProjectContext !== "undefined" ? ProjectContext.current : "";
    const c = (projectConfig && projectConfig.fileCode) || (pid && pid !== "DEFAULT" ? pid : "") || "PRJ";
    return this.safe(c).slice(0, 20) || "PRJ";
  },
  scopeCode(scope, value) {
    if (scope === "SYS") return "S-" + this.safe(value);
    if (scope === "DOMAIN") return "D-" + this.safe(value);
    return "ALL";
  },
  revLabel(rep) {
    if (!rep) return "DRAFT";
    if (rep.integrated && rep.integratedFrom && rep.integratedFrom.auto) return "AUTO";
    if (rep.revision) return "v" + rep.revision;
    if ((rep.status || "DONE") === "DONE" && rep.updatedAt) return "v1";
    return "DRAFT";
  },
  docNo(rep) {
    const sc = WeeklyReportManager.reportScope(rep);
    const w = String(rep.weekNo || 0).padStart(2, "0");
    const y = rep.year || String(rep.startDate || "").slice(0, 4);
    return `${this.fileCode()}_주간보고_${y}W${w}_${this.scopeCode(sc.scope, sc.value)}_${this.revLabel(rep)}`;
  },
  fileName(rep, fmt) {
    const ext = fmt === "XLSX" ? "xlsx" : "docx";
    const sc = WeeklyReportManager.reportScope(rep);
    const w = String(rep.weekNo || 0).padStart(2, "0");
    const y = rep.year || String(rep.startDate || "").slice(0, 4);
    return `${this.fileCode()}_주간보고_${y}W${w}_${this.scopeCode(sc.scope, sc.value)}_${fmt}_${this.revLabel(rep)}.${ext}`;
  },

  // ---------------------------------------------------------------------------
  // 작성 시점 자료 (snapshot)
  // ---------------------------------------------------------------------------
  _metrics() {
    const m = (typeof ReportExporter !== "undefined" && ReportExporter._collectMetrics) ? ReportExporter._collectMetrics() : null;
    if (!m) return null;
    return {
      totalPlan: m.totalPlan, totalActual: m.totalActual, achieveRate: m.achieveRate,
      cntTotal: m.cntTotal, cntComp: m.cntComp, cntProg: m.cntProg, cntDel: m.cntDel, cntReady: m.cntReady,
      subsystemRows: m.subsystemRows, integratedRows: m.integratedRows, delivStats: m.delivStats, activeRounds: m.activeRounds
    };
  },
  _actionsOfWeek(start, end) {
    if (typeof MeetingManager === "undefined") return [];
    return MeetingManager.getAllActionItems().filter(a => a.status !== "삭제" && (
      (a.meetingDate >= start && a.meetingDate <= end) ||
      (a.targetDate && a.targetDate >= start && a.targetDate <= end) ||
      (a.status === "진행중" && a.targetDate && a.targetDate <= end)))
      .map(a => ({ id: a.id, system: a.system || a.meetingSystem || "", title: a.title, assignee: a.assignee || "", targetDate: a.targetDate || "", status: a.status || "", meetingTitle: a.meetingTitle || "", meetingDate: a.meetingDate || "" }));
  },
  _meetings(start, end) {
    if (typeof MeetingManager === "undefined") return [];
    return MeetingManager.getWeeklyMeetings(start, end).map(m => ({
      date: m.date, startTime: m.startTime || "", endTime: m.endTime || "", system: m.system || "ALL", title: m.title || "",
      location: m.location || "", host: m.host || "", status: m.status || "",
      agendaTitles: (m.agendas || []).map(a => a.title).filter(Boolean),
      decisions: (m.agendas || []).map(a => `${a.title}: ${a.decision || "합의"}`).join(" / ") || m.summary || ""
    }));
  },
  // 주차별 누적 계획 진척률 (L1 과업 가중 평균, 대시보드 S-커브와 같은 계산)
  _planCurve() {
    const weeks = WeeklyReportManager.getAllWeeks();
    const tasks = (wbsData || []).filter(d => d.level === 1);
    const shares = WBSEngine.rootShares(tasks);   // 서브시스템 가중치 × L1 비율
    const day = 86400000;
    return weeks.map(w => {
      const end = new Date(w.endDate);
      let sum = 0;
      tasks.forEach(t => {
        const s = new Date(t.pStart || projectConfig.projectStartDate), e = new Date(t.pEnd || projectConfig.projectEndDate);
        const p = end < s ? 0 : end >= e ? 100 : Math.min(100, Math.round((end - s) / day / Math.max(1, (e - s) / day) * 100));
        sum += p * (shares.get(t) || 0);
      });
      return { w: w.weekNum, label: String(w.startDate).slice(5).replace("-", "/"), p: Math.round(sum) };
    });
  },
  _sdlc() {
    const m = (typeof ReportExporter !== "undefined" && ReportExporter._collectMetrics) ? ReportExporter._collectMetrics() : null;
    return ((m && m.sdlcGroups) || []).filter(g => g.rows && g.rows.length).map(g => ({
      name: g.spec.name, phases: (g.spec.phases || []).map(p => ({ name: p.name, weight: p.weight })), rows: g.rows
    }));
  },
  takeSnapshot(rep) {
    return {
      takenAt: new Date().toISOString().replace("T", " ").substring(0, 19),
      reportDate: projectConfig.reportDate || "",
      projectName: projectConfig.projectName || "",
      projectStartDate: projectConfig.projectStartDate || "",
      projectEndDate: projectConfig.projectEndDate || "",
      metrics: this._metrics(),
      reqs: (reqMasterData || []).filter(r => r.status !== "삭제").map(r => ({ id: r.id, system: r.system, name: r.name, status: r.status || "", priority: r.priority || "" })),
      vocs: (vocData || []).filter(v => v.status !== "삭제").map(v => ({ id: v.id, system: v.system, priority: v.priority || "", title: v.title || "", requester: v.requester || "", reqDate: v.reqDate || "", targetDate: v.targetDate || "", status: v.status || "", action: v.action || "" })),
      meetingsCur: this._meetings(rep.startDate, rep.endDate),
      meetingsNext: this._meetings(rep.nextStartDate, rep.nextEndDate),
      actions: this._actionsOfWeek(rep.startDate, rep.endDate),
      // [v3.4.0] 경영 보고 장표용: S-커브 계획선(주차별) · 단계별 종합 공정 매트릭스(SDLC 만)
      planCurve: this._planCurve(),
      sdlc: this._sdlc(),
      // [v3.3.0] 경영 보고 장표용: 지연 과업 · 마일스톤
      delayed: (wbsData || []).filter(t => t.isLeaf && WBSEngine.getTaskStatus(t, projectConfig.reportDate).code === "delayed")
        .slice(0, 40).map(t => ({ id: t.id, system: t.system, name: t.name, pProg: t.pProg, aProg: t.aProg, owner: t.owner || "" })),
      milestones: (projectConfig.milestones || []).filter(x => x && x.date && x.name && x.date >= WBSEngine.addDays(rep.startDate, -7))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 12).map(x => ({ date: x.date, name: x.name, scope: x.scope || "ALL" }))
    };
  },
  // 보고서에 쓸 자료: 작성 완료본은 저장된 snapshot, 아니면 지금 자료(live)
  data(rep) {
    if (rep && rep.snapshot) return Object.assign({ live: false }, rep.snapshot);
    return Object.assign({ live: true }, this.takeSnapshot(rep || {}));
  },

  // ---------------------------------------------------------------------------
  // 보고서 모델 — 엑셀·워드 공통
  // ---------------------------------------------------------------------------
  model(rep) {
    const W = WeeklyReportManager;
    const sc = W.reportScope(rep);
    const allSys = W.scopeSystems(sc.scope, sc.value);
    // [v3.3.0] 통합 보고서는 작성 완료된 서브시스템 내용만 (서브시스템이 아닌 공통 항목은 포함)
    const done = rep.integrated && rep.integratedFrom ? rep.integratedFrom.done || [] : null;
    const systems = done ? allSys.filter(x => done.indexOf(x) !== -1) : allSys;
    const subsystemNames = getAllSubsystemNames();
    const inScope = sys => done ? (systems.includes(sys) || !subsystemNames.includes(sys)) : (sc.scope === "ALL" || systems.includes(sys));
    const d = this.data(rep);
    const m = d.metrics || {};
    const projName = d.projectName || projectConfig.projectName || "";
    const scopeLabel = W.scopeLabel(sc.scope, sc.value);
    const pct = v => `${String(v === undefined || v === null ? 0 : v).replace(/%+$/, "")}%`;
    const rate = (p, a) => { p = parseFloat(p) || 0; a = parseFloat(a) || 0; return p > 0 ? Math.round(a / p * 100) : 100; };
    const basis = d.live ? `현재 자료 기준 (${d.reportDate || "-"})` : `작성 완료 시점 자료 (${d.takenAt})`;
    const T = (title, headers, widths, rows, line, empty) => ({ title, headers, widths, rows, line, empty: empty || "해당 항목 없음" });

    // 1. 개요 및 핵심 지표
    const subRows = (m.subsystemRows || []).filter(r => inScope(r[1]));
    const s1 = {
      title: "1. 개요 및 핵심 지표",
      info: [
        ["프로젝트", projName], ["보고 주차", rep.weekLabel || ""],
        ["금주 기간", `${rep.startDate || ""} ~ ${rep.endDate || ""}`], ["차주 기간", `${rep.nextStartDate || ""} ~ ${rep.nextEndDate || ""}`],
        ["보고 범위", scopeLabel], ["공정 기준일", d.reportDate || ""],
        ["전체 계획", pct(m.totalPlan)], ["전체 실적", pct(m.totalActual)],
        ["달성률", `${m.achieveRate || rate(m.totalPlan, m.totalActual)}%`], ["지연 Task", `${m.cntDel || 0}건`]
      ],
      tables: [T("서브시스템별 공정 진척", ["도메인", "서브시스템", "SDLC 유형", "담당 PM", "Task 수", "계획", "실적", "달성률", "지연"],
        [12, 14, 16, 14, 9, 9, 9, 9, 8],
        subRows.map(r => [r[0], r[1], r[2], r[3], String(r[5]), pct(r[6]), pct(r[7]), pct(r[8]), `${r[9]}건`]),
        r => `[${r[1]}] 계획 ${r[5]} · 실적 ${r[6]} · 달성률 ${r[7]} · 지연 ${r[8]} (${r[0]}, PM ${r[3]})`)]
    };
    // 2·3. 금주 실적 / 차주 계획
    const taskRow = (t, cur) => cur
      ? [t.system || "", t.manual ? "직접입력" : (t.wbsId || ""), t.name || "", t.owner || "", t.manual ? "-" : pct(t.pProg), t.manual ? "-" : pct(t.aProg), t.status || "", t.detail || ""]
      : [t.system || "", t.manual ? "직접입력" : (t.wbsId || ""), t.name || "", t.owner || "", t.manual ? "-" : pct(t.pProg), t.status || "", t.detail || ""];
    const s2 = {
      title: "2. 금주 추진 실적",
      texts: [["금주 실적 요약", rep.currentWeekSummary || "(작성된 요약 없음)"]],
      tables: [T(`금주 Task 실적 (${rep.startDate || ""} ~ ${rep.endDate || ""})`, ["서브시스템", "WBS ID", "Task명", "담당자", "계획", "실적", "상태", "추진 실적 및 조치 내역"],
        [11, 10, 30, 10, 8, 8, 8, 40],
        (rep.currentWeekTasks || []).map(t => taskRow(t, true)),
        r => `[${r[0]}] ${r[1]} ${r[2]}${r[3] ? ` (담당 ${r[3]})` : ""} — 계획 ${r[4]} / 실적 ${r[5]}, ${r[6]}${r[7] ? `: ${r[7]}` : ""}`,
        "금주 실적 항목 없음")]
    };
    const s3 = {
      title: "3. 차주 추진 계획",
      texts: [["차주 계획 요약", rep.nextWeekSummary || "(작성된 요약 없음)"]],
      tables: [T(`차주 Task 계획 (${rep.nextStartDate || ""} ~ ${rep.nextEndDate || ""})`, ["서브시스템", "WBS ID", "Task명", "담당자", "목표 계획", "상태", "차주 추진 계획 및 준비 사항"],
        [11, 10, 32, 10, 9, 8, 44],
        (rep.nextWeekTasks || []).map(t => taskRow(t, false)),
        r => `[${r[0]}] ${r[1]} ${r[2]}${r[3] ? ` (담당 ${r[3]})` : ""} — 목표 ${r[4]}${r[6] ? `: ${r[6]}` : ""}`,
        "차주 계획 항목 없음")]
    };
    // 4. 이슈 · 요구사항 · VOC
    const reqBySys = {};
    (d.reqs || []).filter(r => inScope(r.system) && r.status !== "삭제").forEach(r => {   // 삭제 건은 완료율에서 뺌
      const o = reqBySys[r.system] = reqBySys[r.system] || { tot: 0, done: 0, prog: 0, hold: 0 };
      o.tot++; if (r.status === "완료") o.done++; else if (r.status === "진행") o.prog++; else if (r.status === "보류") o.hold++;
    });
    const openVocs = (d.vocs || []).filter(v => inScope(v.system) && ["완료", "제외"].indexOf(v.status) === -1);
    const s4 = {
      title: "4. 이슈 · 요구사항 · VOC",
      texts: [["주요 현안 및 지원 요청", rep.issuesNotes || "특이사항 없음"]],
      tables: [
        T("서브시스템별 요구사항 진척", ["서브시스템", "전체", "진행", "완료", "보류", "완료율"], [16, 10, 10, 10, 10, 10],
          Object.keys(reqBySys).map(s => { const o = reqBySys[s]; return [s, `${o.tot}건`, `${o.prog}건`, `${o.done}건`, `${o.hold}건`, `${o.tot ? Math.round(o.done / o.tot * 100) : 0}%`]; }),
          r => `[${r[0]}] 요구사항 ${r[1]} 중 완료 ${r[3]} (완료율 ${r[5]}), 진행 ${r[2]}, 보류 ${r[4]}`, "요구사항 없음"),
        T("미완료 VOC · 이슈", ["VOC ID", "서브시스템", "우선순위", "제목", "요청자", "목표일", "상태", "조치 내용"], [10, 11, 8, 32, 10, 11, 8, 36],
          openVocs.map(v => [v.id, v.system, v.priority, v.title, v.requester, v.targetDate, v.status, v.action]),
          r => `[${r[1]}] ${r[0]} ${r[3]} (${r[2]}, 목표 ${r[5] || "-"}, ${r[6]})${r[7] ? ` — ${r[7]}` : ""}`, "미완료 VOC 없음")
      ]
    };
    // 5. 회의 · Action Item
    const mtg = list => (list || []).filter(x => x.system === "ALL" || inScope(x.system));
    const s5 = {
      title: "5. 회의 · Action Item",
      tables: [
        T("금주 회의", ["일자", "시간", "서브시스템", "회의명", "주관/장소", "결정 사항"], [11, 11, 11, 30, 18, 40],
          mtg(d.meetingsCur).map(x => [x.date, `${x.startTime}~${x.endTime}`, x.system, x.title, `${x.host || "-"} / ${x.location || "-"}`, x.decisions]),
          r => `${r[0]} ${r[3]} (${r[2]}, ${r[4]})${r[5] ? ` — ${r[5]}` : ""}`, "금주 회의 없음"),
        T("차주 예정 회의", ["일자", "시간", "서브시스템", "회의명", "주관/장소"], [11, 11, 11, 34, 22],
          mtg(d.meetingsNext).map(x => [x.date, `${x.startTime}~${x.endTime}`, x.system, x.title, `${x.host || "-"} / ${x.location || "-"}`]),
          r => `${r[0]} ${r[1]} ${r[3]} (${r[2]}, ${r[4]})`, "차주 예정 회의 없음"),
        T("Action Item (금주 도출 · 금주 마감 · 미완료)", ["ID", "서브시스템", "내용", "담당자", "목표일", "상태", "회의"], [10, 11, 34, 10, 11, 8, 26],
          (d.actions || []).filter(a => !a.system || inScope(a.system)).map(a => [a.id, a.system, a.title, a.assignee, a.targetDate, a.status, a.meetingTitle]),
          r => `${r[0]} ${r[2]} — 담당 ${r[3] || "-"}, 목표 ${r[4] || "-"}, ${r[5]}`, "해당 Action Item 없음")
      ]
    };
    // 6. 작성 현황
    const s6 = {
      title: "6. 작성 현황",
      info: [
        ["문서 번호", this.docNo(rep)], ["작성자", rep.author || "-"],
        ["작성 완료", rep.updatedAt || "작성 완료 전"], ["자료 기준", basis]
      ],
      texts: rep.coverageNote ? [["통합 보고서 구성", rep.coverageNote]] : []
    };
    return {
      projName, weekLabel: rep.weekLabel || "", scopeLabel, docNo: this.docNo(rep), basis, live: d.live,
      author: rep.author || "", reportDate: d.reportDate || "", updatedAt: rep.updatedAt || "",
      sections: [s1, s2, s3, s4, s5, s6]
    };
  },

  // ---------------------------------------------------------------------------
  // 엑셀 (시트 = 목차)
  // ---------------------------------------------------------------------------
  toXlsxBlob(model) {
    const sheetNames = ["1_개요_지표", "2_금주_실적", "3_차주_계획", "4_이슈_요구사항_VOC", "5_회의_ActionItem", "6_작성현황"];
    const sheets = model.sections.map((sec, si) => {
      const rows = [], merges = [];
      const width = Math.max(4, ...(sec.tables || []).map(t => t.headers.length));
      const col = n => String.fromCharCode(64 + n);
      const push = (cells, styleId, height, merge) => {
        rows.push({ cells, styleId, height });
        if (merge) merges.push(`A${rows.length}:${col(width)}${rows.length}`);
      };
      push([`[${model.projName} 주간보고] ${model.weekLabel} · ${model.scopeLabel} — ${sec.title}`], 3, 26, true);
      push([`문서 번호 ${model.docNo}  ·  ${model.basis}`], 2, 18, true);
      push([], 0, 8);
      if (sec.info) {
        for (let i = 0; i < sec.info.length; i += 2) {
          const a = sec.info[i], b = sec.info[i + 1];
          push(b ? [a[0], a[1], b[0], b[1]] : [a[0], a[1]], 2, 20);
        }
        push([], 0, 8);
      }
      (sec.texts || []).forEach(([label, text]) => {
        push([`【${label}】`], 3, 22, true);
        push([text], 2, Math.min(120, 20 + 14 * (String(text).split("\n").length - 1)), true);
        push([], 0, 8);
      });
      (sec.tables || []).forEach(t => {
        push([`【${t.title}】`], 3, 22, true);
        push(t.headers, 1, 22);
        if (!t.rows.length) push([t.empty], 2, 20, true);
        t.rows.forEach(r => push(r, 2, 20));
        push([], 0, 8);
      });
      const widths = (sec.tables && sec.tables[0] && sec.tables[0].widths) || [18, 30, 18, 30];
      const infoW = sec.info ? [16, 40, 16, 40] : [];
      const colWidths = Array.from({ length: width }, (_, i) => Math.max(widths[i] || 12, infoW[i] || 0));
      return { name: sheetNames[si], colWidths, rows, merges };
    });
    return ExcelSync._buildXlsxBlob(sheets);
  },

  // ---------------------------------------------------------------------------
  // 워드 (표 포함 / 서술형)
  // ---------------------------------------------------------------------------
  toDocxBlob(model, useTables) {
    const esc = s => ExcelSync.escapeXml(String(s === undefined || s === null ? "" : s));
    const pal = ExcelSync.getExportThemePalette();
    const font = pal.fontName, sz = pal.fontSize * 2;
    const C = pal.primary, H = pal.headerBg, HT = pal.headerTextColor, SUB = pal.subHeaderBg, B = pal.border;
    const run = (text, o = {}) => `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ""}</w:rPr>${String(text).split(/\r?\n/).map((l, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(l)}</w:t>`).join("")}</w:r>`;
    // 단락 속성은 OOXML 순서(pStyle → keepNext → shd → spacing → ind → jc)를 지켜야 Word 가 내용을 버리지 않음
    const para = (inner, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ""}${o.keep ? "<w:keepNext/>" : ""}${o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : ""}<w:spacing w:before="${o.before === undefined ? 40 : o.before}" w:after="${o.after === undefined ? 60 : o.after}"/>${o.ind ? `<w:ind w:left="${o.ind}"/>` : ""}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>${inner}</w:p>`;
    const TW = 14200; // A4 가로 (본문 폭)
    const table = t => {
      // 칸 폭: 짧은 칸(숫자·상태·ID)은 글자가 세로로 쪼개지지 않을 만큼 최소 폭을 주고, 나머지는 긴 글 칸이 나눠 가짐
      const MIN = { "계획": 760, "실적": 760, "달성률": 860, "지연": 760, "Task 수": 820, "전체": 760, "진행": 760, "완료": 760, "보류": 760, "완료율": 860,
        "상태": 900, "목표 계획": 900, "목표일": 1150, "일자": 1150, "시간": 1150, "WBS ID": 1000, "ID": 1000, "VOC ID": 1000, "서브시스템": 1050, "도메인": 1000, "우선순위": 900, "담당자": 1000, "요청자": 1000, "담당 PM": 1150 };
      const mins = t.headers.map(h => MIN[h] || 0);
      const fixedSum = mins.reduce((a, b) => a + b, 0);
      const flexIdx = t.headers.map((h, i) => (mins[i] ? -1 : i)).filter(i => i >= 0);
      const flexTotal = flexIdx.reduce((a, i) => a + (t.widths[i] || 10), 0) || 1;
      const ws = t.headers.map((_, i) => mins[i] || Math.max(1200, Math.round((t.widths[i] || 10) / flexTotal * Math.max(1500 * flexIdx.length, TW - fixedSum))));
      const tsz = (pal.fontSize - 1) * 2;
      const cell = (text, w, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? `<w:shd w:val="clear" w:color="auto" w:fill="${H}"/>` : ""}<w:tcMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${para(run(text, head ? { b: true, color: HT, sz: tsz } : { sz: tsz }), { jc: head ? "center" : "", before: 20, after: 20 })}</w:tc>`;
      const rows = t.rows.length ? t.rows : [[t.empty].concat(t.headers.slice(1).map(() => ""))];
      const border = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="${B}"/>`).join("")}</w:tblBorders>`;
      return `<w:tbl><w:tblPr><w:tblW w:w="${ws.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
        `<w:tr><w:trPr><w:tblHeader/></w:trPr>${t.headers.map((h, i) => cell(h, ws[i], true)).join("")}</w:tr>` +
        rows.map(r => `<w:tr>${t.headers.map((_, i) => cell(r[i] === undefined ? "" : r[i], ws[i], false)).join("")}</w:tr>`).join("") + `</w:tbl>`;
    };
    const body = [];
    body.push(para(run(`[주간보고] ${model.projName}`, { b: true, sz: (pal.fontSize + 10) * 2, color: "0F172A" }), { jc: "center", before: 120, after: 40 }));
    body.push(para(run(`${model.weekLabel} · ${model.scopeLabel}`, { b: true, sz: (pal.fontSize + 3) * 2, color: C }), { jc: "center", before: 0, after: 40 }));
    body.push(para(run(`문서 번호 ${model.docNo}  |  작성자 ${model.author || "-"}  |  ${model.basis}`, { color: "475569" }), { jc: "center", before: 0, after: 200 }));
    model.sections.forEach(sec => {
      body.push(para(run(sec.title, { b: true, sz: (pal.fontSize + 4) * 2, color: C }), { style: "Heading1", before: 240, after: 100 }));
      if (sec.info) {
        if (useTables) {
          const rows = [];
          for (let i = 0; i < sec.info.length; i += 2) {
            const a = sec.info[i], b = sec.info[i + 1] || ["", ""];
            rows.push([a[0], a[1], b[0], b[1]]);
          }
          const ws = [2200, 4900, 2200, 4900];
          const cell = (text, w, label) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${label ? `<w:shd w:val="clear" w:color="auto" w:fill="${SUB}"/>` : ""}</w:tcPr>${para(run(text, label ? { b: true, color: C } : {}), { before: 30, after: 30 })}</w:tc>`;
          const border = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="${B}"/>`).join("")}</w:tblBorders>`;
          body.push(`<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${ws.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
            rows.map(r => `<w:tr>${r.map((v, i) => cell(v, ws[i], i % 2 === 0)).join("")}</w:tr>`).join("") + `</w:tbl>`);
        } else {
          sec.info.forEach(([k, v]) => body.push(para(run(`■ ${k}: `, { b: true, color: C }) + run(v), { ind: 200, before: 20, after: 20 })));
        }
      }
      // 요약 · 현안: 표 포함 양식은 [제목 | 내용] 상자(엑셀과 같은 모양), 서술형은 제목 줄 + 내용 단락
      (sec.texts || []).forEach(([label, text]) => {
        const lines = String(text || "-").split(/\r?\n/).filter(l => l.trim() !== "");
        if (useTables) {
          const ws = [2600, TW - 2600];
          const border = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="${B}"/>`).join("")}</w:tblBorders>`;
          body.push(`<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${border}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${ws[0]}"/><w:gridCol w:w="${ws[1]}"/></w:tblGrid><w:tr>` +
            `<w:tc><w:tcPr><w:tcW w:w="${ws[0]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${SUB}"/></w:tcPr>${para(run(label, { b: true, color: C }), { before: 40, after: 40 })}</w:tc>` +
            `<w:tc><w:tcPr><w:tcW w:w="${ws[1]}" w:type="dxa"/></w:tcPr>${(lines.length ? lines : ["-"]).map(l => para(run(l), { before: 20, after: 20 })).join("")}</w:tc></w:tr></w:tbl>`);
          body.push(para("", { before: 0, after: 60 }));
        } else {
          body.push(para(run(`■ ${label}`, { b: true, color: C }), { before: 100, after: 30, keep: true }));
          (lines.length ? lines : ["-"]).forEach(l => body.push(para(run(l), { ind: 240, before: 10, after: 20 })));
        }
      });
      (sec.tables || []).forEach(t => {
        body.push(para(run(`□ ${t.title}`, { b: true, sz: (pal.fontSize + 1) * 2, color: C }), { before: 140, after: 60 }));
        if (useTables) body.push(table(t));
        else if (!t.rows.length) body.push(para(run(`· ${t.empty}`), { ind: 240 }));
        else t.rows.forEach(r => body.push(para(run(`· ${t.line(r)}`), { ind: 240, before: 10, after: 20 })));
      });
    });
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1000" w:right="1300" w:bottom="1000" w:left="1300"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${sz}"/><w:color w:val="1F2937"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${C}"/></w:rPr></w:style>
</w:styles>`;
    const files = [
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: "word/_rels/document.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "word/styles.xml", content: styles },
      { name: "word/document.xml", content: docXml }
    ];
    return ExcelSync._createZipBlob(files, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  },

  // ---------------------------------------------------------------------------
  // 내려받기
  // ---------------------------------------------------------------------------
  download(rep, format) {
    const fmt = format === "EXCEL" ? "XLSX" : (format === "WORD_TEXT" ? "DOC-N" : "DOC-T");
    const model = this.model(rep);
    const blob = fmt === "XLSX" ? this.toXlsxBlob(model) : this.toDocxBlob(model, fmt === "DOC-T");
    const name = this.fileName(rep, fmt);
    ExcelSync._triggerDownload(blob, name);
    showToast(`📥 [주간보고] ${name} 다운로드 완료${model.live ? " (현재 자료 기준)" : " (작성 완료 시점 자료)"}`);
    return name;
  }
};
window.WeeklyExport = WeeklyExport;

// =============================================================================
// [v3.1.0] 홈 [📊 브리핑] 경영 보고 카드 — 기준일 주차의 통합 주간보고 (주간보고 화면 위쪽 내려받기와 같은 결과)
// =============================================================================
var ExecReport = {
  week() {
    const w = WeeklyReportManager.findWeekForDate(projectConfig.reportDate);
    return w ? w.weekNum : null;
  },
  render() {
    const el = document.getElementById("execReportInfo");
    if (!el) return;
    const wn = this.week();
    const rep = wn ? WeeklyReportManager.buildWeekIntegrated(wn) : null;
    if (!rep) { el.innerHTML = `<div class="exec-report-line">⚠️ 기준일(${escapeHtml(projectConfig.reportDate || "-")})이 들어 있는 보고 주차가 없습니다.</div>`; return; }
    const f = rep.integratedFrom || {};
    const total = (f.done || []).length + (f.missing || []).length;
    el.innerHTML = `
      <div class="exec-report-line"><b>${escapeHtml(rep.weekLabel)}</b></div>
      <div class="exec-report-line">통합 보고서: ${f.allDone ? '<span class="status-tag tag-completed">작성 완료</span>' : '<span class="status-tag tag-ready">미작성</span>'}
        · 서브시스템 ${(f.done || []).length} / ${total} 작성 완료</div>
      <div class="exec-report-line">${rep.snapshot ? `📌 작성 완료 시점 자료 (${escapeHtml(rep.snapshot.takenAt)})` : (f.auto ? "⏱ 작성 완료본이 없어 현재 자료로 자동 생성" : "⏱ 작성 시점 자료가 없는 이전 버전 보고서 — 현재 자료 기준")}</div>
      <div class="exec-report-line exec-report-file">파일: <code>${escapeHtml(WeeklyExport.fileName(rep, "DOC-T"))}</code></div>`;
    if (typeof I18N !== "undefined") I18N.translateTree(el);
  },
  download(format) {
    WeeklyReportManager.exportWeek(format, this.week());
  },
  openWeekly() {
    if (typeof GShell !== "undefined") GShell.go("tab-weekly-report"); else switchTab("tab-weekly-report");
    const wn = this.week();
    if (wn) setTimeout(() => { try { WeeklyReportManager.listWeek = wn; WeeklyReportManager.renderSavedList(); } catch (e) {} }, 200);
  }
};
window.ExecReport = ExecReport;
