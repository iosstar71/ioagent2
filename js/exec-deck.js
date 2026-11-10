// =============================================================================
// [IOSTAR-PM v3.3.0] 주간 경영 보고 장표 (ExecDeck) — PPT(.pptx) / PDF(인쇄 → PDF로 저장)
// -----------------------------------------------------------------------------
//  구성: 1) 표지(주차)  2) 목차  3) 종합 진척(지표 + 서브시스템별 계획·실적 그래프, 서브시스템이 많으면 여러 장)
//        4) 요구사항 · 산출물 · VOC 현황  5) 지연 · 주의 과업과 마일스톤
//        6~) 서브시스템별 주간보고 1장씩 (작성 완료된 서브시스템만, 내용이 많으면 글자를 줄여 한 장에 맞춤)
//            금주: Task 진행 요약 · 회의 진행 요약 · VOC 등록 요약 / 차주: Task 계획 요약 · 회의 계획 요약
//  자료: 주간보고 작성 완료 시점 자료(snapshot) — 지난 주차도 그때 숫자로 나옴
//  테마: 워드 · 엑셀과 같은 보고서 테마 (시스템 설정 > 보고서 양식)
//  PPT 는 외부 라이브러리 없이 OpenXML 로 직접 만들고, PDF 는 같은 장표를 인쇄 화면으로 열어
//  브라우저의 [PDF로 저장]을 씀 (폐쇄망에서 한글 글꼴을 PDF 에 넣을 수 없어서)
// =============================================================================
var ExecDeck = {
  W: 13.333, H: 7.5, // 16:9 (inch)

  // ---------------------------------------------------------------------------
  // 자료 모으기
  // ---------------------------------------------------------------------------
  collect(weekNum) {
    const Wm = WeeklyReportManager;
    const weeks = Wm.getAllWeeks();
    const wObj = weeks.find(w => w.weekNum === parseInt(weekNum, 10));
    if (!wObj) return null;
    const integ = Wm.buildWeekIntegrated(weekNum);
    const order = getAllSubsystemNames();
    const isDone = r => r && (r.status || "DONE") === "DONE";
    const sysReps = order.map(sy => Wm._findSaved(wObj, "SYS", sy)).filter(isDone);
    const data = WeeklyExport.data(integ);
    const m = data.metrics || {};
    return {
      wObj, integ, data, m, order,
      sysReps,
      done: sysReps.map(r => r.scopeValue),
      missing: order.filter(s => !sysReps.some(r => r.scopeValue === s)),
      projName: data.projectName || projectConfig.projectName || "",
      pal: ExcelSync.getExportThemePalette(),
      author: (integ && integ.author) || (AuthManager.getCurrentUser() || {}).name || "",
      docNo: `${WeeklyExport.fileCode()}_경영보고_${wObj.year || String(wObj.startDate).slice(0, 4)}W${String(wObj.weekNum).padStart(2, "0")}`
    };
  },

  // ---------------------------------------------------------------------------
  // 장표 모델: 슬라이드 = 요소 목록 (rect / text) — 좌표는 inch
  // ---------------------------------------------------------------------------
  build(weekNum) {
    const c = this.collect(weekNum);
    if (!c) return null;
    const P = c.pal, C = P.primary, H = P.headerBg, SUB = P.subHeaderBg, B = P.border;
    const slides = [];
    const T = (x, y, w, h, paras, o = {}) => Object.assign({ t: "text", x, y, w, h, paras }, o);
    const R = (x, y, w, h, fill, o = {}) => Object.assign({ t: "rect", x, y, w, h, fill }, o);
    const p = (text, size, o = {}) => ({ text: String(text === undefined || text === null ? "" : text), size, bold: !!o.bold, color: o.color || "1F2937", align: o.align || "l", bullet: !!o.bullet });
    const pct = v => `${parseFloat(String(v === undefined ? 0 : v).replace(/%/g, "")) || 0}%`;
    const head = (title, sub) => [
      R(0, 0, this.W, 0.9, H),
      T(0.45, 0.12, 9.5, 0.66, [p(title, 24, { bold: true, color: P.headerTextColor })], { anchor: "ctr" }),
      T(9.4, 0.12, 3.5, 0.66, [p(sub || c.wObj.fullLabel, 11, { color: P.headerTextColor, align: "r" })], { anchor: "ctr" }),
      R(0, this.H - 0.32, this.W, 0.32, SUB),
      T(0.45, this.H - 0.32, 8, 0.32, [p(`${c.projName} · 주간 경영 보고`, 9, { color: "475569" })], { anchor: "ctr" }),
      T(this.W - 3.2, this.H - 0.32, 2.75, 0.32, [p(c.docNo, 9, { color: "475569", align: "r" })], { anchor: "ctr" })
    ];

    // 1. 표지
    slides.push({ name: "표지", els: [
      R(0, 0, this.W, this.H, "FFFFFF"),
      R(0, 0, 0.35, this.H, H),
      R(0.35, 2.15, this.W - 0.35, 0.06, C),
      T(1.0, 1.0, 11.3, 0.6, [p(c.projName, 20, { bold: true, color: "475569" })]),
      T(1.0, 2.45, 11.3, 1.1, [p("주간 경영 보고", 44, { bold: true, color: C })]),
      T(1.0, 3.65, 11.3, 0.7, [p(c.wObj.fullLabel, 24, { bold: true, color: "1F2937" })]),
      T(1.0, 4.4, 11.3, 0.5, [p(`차주: ${c.integ.nextStartDate} ~ ${c.integ.nextEndDate}`, 14, { color: "475569" })]),
      T(1.0, 6.0, 11.3, 0.9, [
        p(`작성자 ${c.author || "-"}  ·  자료 기준 ${c.data.live ? "현재 자료" : "작성 완료 시점 " + c.data.takenAt}`, 11, { color: "64748B" }),
        p(`문서 번호 ${c.docNo}`, 11, { color: "64748B" })])
    ] });

    // 2. 목차 (나중에 장 번호 채움)
    const agenda = { name: "목차", els: [] };
    slides.push(agenda);

    // 3. 종합 진척 — 지표 + 서브시스템별 계획·실적 막대 (8개씩)
    const rows = (c.m.subsystemRows || []);
    const kpi = [["전체 계획", pct(c.m.totalPlan)], ["전체 실적", pct(c.m.totalActual)], ["달성률", `${c.m.achieveRate || 0}%`], ["지연 Task", `${c.m.cntDel || 0}건`],
      ["작성 완료", `${c.done.length} / ${c.order.length}`]];
    const chunks = [];
    for (let i = 0; i < Math.max(1, rows.length); i += 8) chunks.push(rows.slice(i, i + 8));
    const progressStart = slides.length + 1;
    chunks.forEach((ch, ci) => {
      const els = head(`종합 진척 현황${chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ""}`);
      kpi.forEach(([k, v], i) => {
        const x = 0.45 + i * 2.52;
        els.push(R(x, 1.15, 2.35, 1.15, SUB, { line: B }));
        els.push(T(x, 1.2, 2.35, 0.4, [p(k, 11, { color: "475569", align: "ctr" })]));
        els.push(T(x, 1.55, 2.35, 0.7, [p(v, 26, { bold: true, color: k === "지연 Task" && (c.m.cntDel || 0) > 0 ? "B91C1C" : C, align: "ctr" })], { anchor: "ctr" }));
      });
      // 막대 그래프
      const gx = 2.4, gy = 2.75, gw = 9.9, rowH = Math.min(0.5, 3.9 / Math.max(1, ch.length));
      els.push(T(0.45, 2.45, 8, 0.3, [p("서브시스템별 계획 대비 실적", 12, { bold: true, color: C })]));
      els.push(R(gx + gw - 3.3, 2.5, 0.22, 0.16, "CBD5E1"));
      els.push(T(gx + gw - 3.05, 2.43, 0.9, 0.3, [p("계획", 9, { color: "475569" })]));
      els.push(R(gx + gw - 2.1, 2.5, 0.22, 0.16, C));
      els.push(T(gx + gw - 1.85, 2.43, 1.8, 0.3, [p("실적 (달성률)", 9, { color: "475569" })]));
      ch.forEach((r, i) => {
        const y = gy + i * rowH + 0.08;
        const pv = Math.min(100, parseFloat(r[6]) || 0), av = Math.min(100, parseFloat(r[7]) || 0);
        els.push(T(0.45, y, 1.9, rowH - 0.04, [p(r[1], 11, { bold: true, align: "r" })], { anchor: "ctr" }));
        const bh = (rowH - 0.14) / 2;
        els.push(R(gx, y + 0.03, gw * 0.82, bh, "F1F5F9"));
        if (pv > 0) els.push(R(gx, y + 0.03, gw * 0.82 * pv / 100, bh, "CBD5E1"));
        els.push(R(gx, y + 0.05 + bh, gw * 0.82, bh, "F1F5F9"));
        if (av > 0) els.push(R(gx, y + 0.05 + bh, gw * 0.82 * av / 100, bh, C));
        els.push(T(gx + gw * 0.83, y, gw * 0.17, rowH - 0.04, [p(`${pct(r[6])} / ${pct(r[7])} (${pct(r[8])})`, 10, { color: "1F2937" })], { anchor: "ctr" }));
      });
      if (!ch.length) els.push(T(gx, gy, gw, 0.5, [p("서브시스템 자료가 없습니다.", 12, { color: "64748B" })]));
      slides.push({ name: "종합 진척", els });
    });

    // 4. 요구사항 · 산출물 · VOC 현황 (서브시스템별 완료율 표)
    {
      const els = head("요구사항 · 산출물 · VOC 현황");
      const ir = c.m.integratedRows || [];
      const cols = [["분야", 1.4], ["서브시스템", 1.6], ["요구사항 완료", 2.4], ["산출물 완료율", 2.0], ["VOC 조치", 2.4]];
      const lastIdx = ir.length ? ir[0].length - 1 : 0;
      const rowsT = ir.map(r => [r[0], r[1], r[2], r[lastIdx - 1], r[lastIdx]]);
      const tableTop = 1.2, rh = Math.min(0.42, 4.6 / Math.max(1, rowsT.length + 1));
      let x = 0.45;
      cols.forEach(([h, w]) => { els.push(R(x, tableTop, w, rh, H)); els.push(T(x, tableTop, w, rh, [p(h, 11, { bold: true, color: P.headerTextColor, align: "ctr" })], { anchor: "ctr" })); x += w; });
      rowsT.forEach((r, i) => {
        let xx = 0.45;
        const y = tableTop + rh * (i + 1);
        cols.forEach(([, w], j) => {
          els.push(R(xx, y, w, rh, i % 2 ? "FFFFFF" : SUB, { line: B }));
          els.push(T(xx, y, w, rh, [p(r[j], 10, { align: j < 2 ? "l" : "ctr", bold: j === 1 })], { anchor: "ctr" }));
          xx += w;
        });
      });
      // 산출물 회차별 진행
      const ds = c.m.delivStats || [];
      els.push(T(10.5, 1.2, 2.4, 0.35, [p("산출물 회차별 진행", 12, { bold: true, color: C })]));
      ds.forEach((d, i) => {
        const y = 1.6 + i * 0.8;
        els.push(R(10.5, y, 2.4, 0.7, SUB, { line: B }));
        els.push(T(10.55, y, 2.3, 0.7, [p(`${d[0]}  ${d[6]}`, 14, { bold: true, color: C }), p(`완료 ${d[2]} · 검토 ${d[3]} · 작성 ${d[4]} / ${d[1]}건`, 9, { color: "475569" })], { anchor: "ctr" }));
      });
      slides.push({ name: "요구사항·산출물·VOC", els });
    }

    // 5. 지연 · 주의 과업과 마일스톤
    {
      const els = head("지연 과업 · 주요 마일스톤");
      const del = (c.data.delayed || []).slice(0, 12);
      els.push(T(0.45, 1.15, 7.3, 0.35, [p(`지연 Task ${c.m.cntDel || 0}건${del.length < (c.m.cntDel || 0) ? ` (상위 ${del.length}건)` : ""}`, 13, { bold: true, color: "B91C1C" })]));
      const dl = del.length ? del.map(t => p(`[${t.system}] ${t.id} ${t.name} — 계획 ${t.pProg}% / 실적 ${t.aProg}%${t.owner ? ` · ${t.owner}` : ""}`, 11, { bullet: true })) : [p("지연 과업 없음", 12, { color: "15803D" })];
      els.push(T(0.45, 1.55, 7.3, 5.4, this.fit(dl, 7.3, 5.4)));
      const ms = (c.data.milestones || []).slice(0, 10);
      els.push(T(8.1, 1.15, 4.8, 0.35, [p("주요 마일스톤", 13, { bold: true, color: C })]));
      const ml = ms.length ? ms.map(x => p(`${x.date}  ${x.name}${x.scope && x.scope !== "ALL" ? ` (${x.scope})` : ""}`, 11, { bullet: true })) : [p("등록된 마일스톤 없음", 11, { color: "64748B" })];
      els.push(R(8.0, 1.5, 4.9, 5.45, SUB, { line: B }));
      els.push(T(8.1, 1.6, 4.7, 5.25, this.fit(ml, 4.7, 5.25)));
      slides.push({ name: "지연·마일스톤", els });
    }

    // 6~. 서브시스템별 주간보고 (작성 완료분)
    const sysStart = slides.length + 1;
    c.sysReps.forEach(rep => slides.push(this.sysSlide(c, rep, head, T, R, p, pct)));
    if (!c.sysReps.length) {
      const els = head("서브시스템별 주간보고");
      els.push(T(0.8, 2.6, 11.7, 1.5, [p("작성 완료된 서브시스템 주간보고가 없습니다.", 20, { bold: true, color: "64748B", align: "ctr" }),
        p(`미작성: ${c.missing.join(", ") || "-"}`, 13, { color: "64748B", align: "ctr" })], { anchor: "ctr" }));
      slides.push({ name: "서브시스템", els });
    }

    // 목차 채우기
    agenda.els = head("목차").concat([
      T(1.0, 1.5, 11.3, 5.2, [
        p(`1. 종합 진척 현황 ············ ${progressStart}`, 20, { bold: true, color: C }),
        p(`2. 요구사항 · 산출물 · VOC 현황 ············ ${progressStart + chunks.length}`, 20, { bold: true, color: C }),
        p(`3. 지연 과업 · 주요 마일스톤 ············ ${progressStart + chunks.length + 1}`, 20, { bold: true, color: C }),
        p(`4. 서브시스템별 주간보고 ············ ${sysStart}`, 20, { bold: true, color: C }),
        ...c.sysReps.map((r, i) => p(`${r.scopeValue} ····· ${sysStart + i}`, 13, { color: "334155", bullet: true })),
        ...(c.missing.length ? [p(`미작성 서브시스템 (장표 제외): ${c.missing.join(", ")}`, 12, { color: "B45309" })] : [])
      ])
    ]);
    return { c, slides };
  },

  sysSlide(c, rep, head, T, R, p, pct) {
    const sys = rep.scopeValue;
    const snap = rep.snapshot || c.data;
    const row = (c.m.subsystemRows || []).find(r => r[1] === sys) || [];
    const els = head(`[${sys}] 서브시스템 주간보고`, `${c.wObj.fullLabel}`);
    const P = c.pal, C = P.primary, SUB = P.subHeaderBg, B = P.border;
    els.push(T(0.45, 1.0, 12.4, 0.4, [p(`계획 ${pct(row[6])} · 실적 ${pct(row[7])} · 달성률 ${pct(row[8])} · 지연 ${row[9] || 0}건 · 담당 PM ${row[3] || "-"} · 작성 ${rep.author || "-"} (${rep.updatedAt || "-"})`, 12, { bold: true, color: "334155" })], { anchor: "ctr" }));

    const cur = rep.currentWeekTasks || [], nxt = rep.nextWeekTasks || [];
    const cnt = (list, st) => list.filter(t => t.status === st).length;
    const curLines = [p(`금주 대상 ${cur.length}건 — 완료 ${cnt(cur, "완료")} · 진행 ${cnt(cur, "진행중")} · 지연 ${cnt(cur, "지연")}`, 12, { bold: true })]
      .concat(cur.slice(0, 6).map(t => p(`${t.name} (${t.status || "-"}${t.manual ? "" : `, ${t.aProg ?? 0}%`})${t.detail ? ` — ${t.detail}` : ""}`, 11, { bullet: true })))
      .concat(cur.length > 6 ? [p(`외 ${cur.length - 6}건`, 10, { color: "64748B" })] : []);
    const mtgCur = (snap.meetingsCur || []).filter(x => x.system === sys);
    const mtgLines = [p(`회의 ${mtgCur.length}건`, 12, { bold: true })].concat(mtgCur.slice(0, 3).map(x => p(`${x.date} ${x.title}${x.decisions ? ` — ${x.decisions}` : ""}`, 11, { bullet: true })));
    const vocs = (snap.vocs || []).filter(v => v.system === sys);
    const newV = vocs.filter(v => v.reqDate && v.reqDate >= rep.startDate && v.reqDate <= rep.endDate);
    const openV = vocs.filter(v => ["완료", "제외"].indexOf(v.status) === -1);
    const vocLines = [p(`신규 등록 ${newV.length}건 · 미조치 ${openV.length}건`, 12, { bold: true })].concat((newV.length ? newV : openV).slice(0, 3).map(v => p(`${v.title} (${v.status})`, 11, { bullet: true })));
    const nxtLines = [p(`차주 계획 ${nxt.length}건`, 12, { bold: true })]
      .concat(nxt.slice(0, 6).map(t => p(`${t.name}${t.detail ? ` — ${t.detail}` : ""}`, 11, { bullet: true })))
      .concat(nxt.length > 6 ? [p(`외 ${nxt.length - 6}건`, 10, { color: "64748B" })] : []);
    const mtgNxt = (snap.meetingsNext || []).filter(x => x.system === sys);
    const mtgNLines = [p(`예정 회의 ${mtgNxt.length}건`, 12, { bold: true })].concat(mtgNxt.slice(0, 3).map(x => p(`${x.date} ${x.startTime || ""} ${x.title}`, 11, { bullet: true })));

    // 왼쪽: 금주 / 오른쪽: 차주
    const box = (x, y, w, h, title, lines) => {
      els.push(R(x, y, w, h, "FFFFFF", { line: B }));
      els.push(R(x, y, w, 0.34, SUB));
      els.push(T(x + 0.08, y, w - 0.16, 0.34, [p(title, 12, { bold: true, color: C })], { anchor: "ctr" }));
      els.push(T(x + 0.1, y + 0.38, w - 0.2, h - 0.42, this.fit(lines, w - 0.2, h - 0.42)));
    };
    els.push(T(0.45, 1.45, 7.3, 0.4, [p("■ 금주 실적", 15, { bold: true, color: C })]));
    els.push(T(7.95, 1.45, 4.9, 0.4, [p("■ 차주 계획", 15, { bold: true, color: C })]));
    const summary = rep.currentWeekSummary ? [p(rep.currentWeekSummary, 11, { color: "334155" })] : [];
    box(0.45, 1.88, 7.3, 2.25, "Task 진행 요약", summary.concat(curLines));
    box(0.45, 4.2, 3.6, 2.25, "회의 진행 요약", mtgLines);
    box(4.15, 4.2, 3.6, 2.25, "VOC 등록 요약", vocLines);
    const nsum = rep.nextWeekSummary ? [p(rep.nextWeekSummary, 11, { color: "334155" })] : [];
    box(7.95, 1.88, 4.9, 2.9, "Task 계획 요약", nsum.concat(nxtLines));
    box(7.95, 4.85, 4.9, 1.6, "회의 계획 요약", mtgNLines);
    if (rep.issuesNotes && rep.issuesNotes.trim() && rep.issuesNotes.trim() !== "특이사항 없음") {
      els.push(R(0.45, 6.52, 12.4, 0.6, "FEF3C7", { line: "F59E0B" }));
      els.push(T(0.55, 6.52, 12.2, 0.6, this.fit([p(`⚠ 현안 · 지원 요청: ${rep.issuesNotes}`, 11, { bold: true, color: "92400E" })], 12.2, 0.6), { anchor: "ctr" }));
    }
    return { name: sys, els };
  },

  // 글자 크기 맞추기: 상자에 들어갈 때까지 글자를 1pt 씩 줄임 (최소 8pt)
  fit(paras, wIn, hIn) {
    const need = scale => paras.reduce((sum, q) => {
      const size = Math.max(8, q.size * scale);
      const chars = Math.max(1, (wIn * 72 - (q.bullet ? 14 : 4)) / (size * 0.92));
      const len = [...q.text].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2E80 ? 1 : 0.55), 0);
      return sum + Math.max(1, Math.ceil(len / chars)) * size * 1.28 / 72 + 0.04;
    }, 0);
    let scale = 1;
    while (scale > 0.55 && need(scale) > hIn) scale -= 0.06;
    return paras.map(q => Object.assign({}, q, { size: Math.max(8, Math.round(q.size * scale * 2) / 2) }));
  },

  // ---------------------------------------------------------------------------
  // PPTX
  // ---------------------------------------------------------------------------
  toPptxBlob(deck) {
    const E = v => Math.round(v * 914400);
    const esc = s => ExcelSync.escapeXml(String(s));
    const font = deck.c.pal.fontName || "맑은 고딕";
    let id = 2;
    const shape = el => {
      const nid = id++;
      const fill = el.fill ? `<a:solidFill><a:srgbClr val="${el.fill}"/></a:solidFill>` : "<a:noFill/>";
      const line = el.line ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${el.line}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>";
      const geo = `<a:xfrm><a:off x="${E(el.x)}" y="${E(el.y)}"/><a:ext cx="${E(Math.max(0.01, el.w))}" cy="${E(Math.max(0.01, el.h))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
      if (el.t === "rect") {
        return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Shape ${nid}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${geo}${fill}${line}</p:spPr></p:sp>`;
      }
      const paras = el.paras.map(q => {
        const algn = q.align === "ctr" ? "ctr" : q.align === "r" ? "r" : "l";
        const bu = q.bullet ? `<a:pPr marL="171450" indent="-171450" algn="${algn}"><a:spcBef><a:spcPts val="200"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>` : `<a:pPr algn="${algn}"><a:spcBef><a:spcPts val="200"/></a:spcBef><a:buNone/></a:pPr>`;
        const rpr = `<a:rPr lang="ko-KR" altLang="en-US" sz="${Math.round(q.size * 100)}" b="${q.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${q.color}"/></a:solidFill><a:latin typeface="${esc(font)}"/><a:ea typeface="${esc(font)}"/></a:rPr>`;
        return `<a:p>${bu}<a:r>${rpr}<a:t>${esc(q.text)}</a:t></a:r></a:p>`;
      }).join("");
      return `<p:sp><p:nvSpPr><p:cNvPr id="${nid}" name="Text ${nid}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${geo}${fill}${line}</p:spPr>` +
        `<p:txBody><a:bodyPr wrap="square" lIns="45720" tIns="27432" rIns="45720" bIns="27432" anchor="${el.anchor === "ctr" ? "ctr" : "t"}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
    };
    const NS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;
    const tree = inner => `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${inner}</p:spTree></p:cSld>`;
    const X = s => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`;
    const files = [];
    const n = deck.slides.length;
    const slideRels = X(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
    deck.slides.forEach((s, i) => {
      id = 2;
      files.push({ name: `ppt/slides/slide${i + 1}.xml`, content: X(`<p:sld ${NS}>${tree(s.els.map(shape).join(""))}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`) });
      files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, content: slideRels });
    });
    const P = deck.c.pal;
    const theme = X(`<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="IOSTAR Report"><a:themeElements>
<a:clrScheme name="IOSTAR"><a:dk1><a:srgbClr val="1F2937"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${P.primary}"/></a:dk2><a:lt2><a:srgbClr val="${P.subHeaderBg}"/></a:lt2>
<a:accent1><a:srgbClr val="${P.headerBg}"/></a:accent1><a:accent2><a:srgbClr val="${P.secondary}"/></a:accent2><a:accent3><a:srgbClr val="${P.accent}"/></a:accent3><a:accent4><a:srgbClr val="15803D"/></a:accent4><a:accent5><a:srgbClr val="B45309"/></a:accent5><a:accent6><a:srgbClr val="B91C1C"/></a:accent6>
<a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>
<a:fontScheme name="IOSTAR"><a:majorFont><a:latin typeface="${esc(P.fontName)}"/><a:ea typeface="${esc(P.fontName)}"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(P.fontName)}"/><a:ea typeface="${esc(P.fontName)}"/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="IOSTAR"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`);
    const lvl = `<a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:defRPr></a:lvl1pPr>`;
    const master = X(`<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${lvl}</p:titleStyle><p:bodyStyle>${lvl}</p:bodyStyle><p:otherStyle>${lvl}</p:otherStyle></p:txStyles></p:sldMaster>`);
    const layout = X(`<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${tree("").replace("<p:cSld>", "").replace("</p:cSld>", "")}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
    files.push({ name: "ppt/theme/theme1.xml", content: theme });
    files.push({ name: "ppt/slideMasters/slideMaster1.xml", content: master });
    files.push({ name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: X(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`) });
    files.push({ name: "ppt/slideLayouts/slideLayout1.xml", content: layout });
    files.push({ name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: X(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`) });
    files.push({ name: "ppt/presProps.xml", content: X(`<p:presentationPr ${NS}/>`) });
    files.push({ name: "ppt/viewProps.xml", content: X(`<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`) });
    files.push({ name: "ppt/tableStyles.xml", content: X(`<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`) });
    const sldIds = deck.slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
    files.push({ name: "ppt/presentation.xml", content: X(`<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${lvl}</p:defaultTextStyle></p:presentation>`) });
    const presRels = [`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`]
      .concat(deck.slides.map((s, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`))
      .concat([`<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
        `<Relationship Id="rId${n + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>`,
        `<Relationship Id="rId${n + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>`,
        `<Relationship Id="rId${n + 5}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`]).join("");
    files.push({ name: "ppt/_rels/presentation.xml.rels", content: X(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`) });
    files.push({ name: "_rels/.rels", content: X(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`) });
    const ct = `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
      `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
      `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
      `<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>` +
      `<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>` +
      `<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>` +
      deck.slides.map((s, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
    files.unshift({ name: "[Content_Types].xml", content: X(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${ct}</Types>`) });
    return ExcelSync._createZipBlob(files, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  },

  // ---------------------------------------------------------------------------
  // 인쇄용 HTML (→ 브라우저 [PDF로 저장])
  // ---------------------------------------------------------------------------
  toHtml(deck) {
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const px = v => (v * 96).toFixed(1) + "px";
    const font = deck.c.pal.fontName || "맑은 고딕";
    const el = e => {
      const box = `left:${px(e.x)};top:${px(e.y)};width:${px(e.w)};height:${px(e.h)};${e.fill ? `background:#${e.fill};` : ""}${e.line ? `border:1px solid #${e.line};` : ""}`;
      if (e.t === "rect") return `<div class="r" style="${box}"></div>`;
      const ps = e.paras.map(q => `<p style="font-size:${q.size}pt;${q.bold ? "font-weight:700;" : ""}color:#${q.color};text-align:${q.align === "ctr" ? "center" : q.align === "r" ? "right" : "left"};${q.bullet ? "padding-left:12pt;text-indent:-9pt;" : ""}">${q.bullet ? "• " : ""}${esc(q.text)}</p>`).join("");
      return `<div class="t" style="${box}justify-content:${e.anchor === "ctr" ? "center" : "flex-start"};">${ps}</div>`;
    };
    const slides = deck.slides.map(s => `<section class="slide">${s.els.map(el).join("")}</section>`).join("");
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(deck.c.docNo)}</title><style>
@page { size: 13.333in 7.5in; margin: 0; }
html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: "${font}", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
.slide { position: relative; width: 1280px; height: 720px; margin: 16px auto; background: #fff; overflow: hidden; page-break-after: always; break-after: page; box-shadow: 0 2px 10px rgba(0,0,0,.15); }
.r, .t { position: absolute; box-sizing: border-box; }
.t { display: flex; flex-direction: column; padding: 2px 5px; overflow: hidden; }
.t p { margin: 0 0 2pt; line-height: 1.25; word-break: keep-all; overflow-wrap: anywhere; }
.bar { position: sticky; top: 0; background: #111827; color: #fff; padding: 10px 16px; font: 14px sans-serif; z-index: 5; }
@media print { html, body { background: #fff; } .slide { margin: 0; box-shadow: none; } .bar { display: none; } }
</style></head><body><div class="bar">주간 경영 보고 미리보기 — 인쇄 창에서 대상을 [PDF로 저장]으로 고르면 PDF 파일이 됩니다. (용지: 가로, 여백 없음)</div>${slides}</body></html>`;
  },

  // ---------------------------------------------------------------------------
  // 실행
  // ---------------------------------------------------------------------------
  week() { return typeof ExecReport !== "undefined" ? ExecReport.week() : null; },
  downloadPptx(weekNum) {
    const deck = this.build(weekNum || this.week());
    if (!deck) return showToast("⚠️ 보고 주차를 찾을 수 없습니다.");
    const name = `${deck.c.docNo}_PPT.pptx`;
    ExcelSync._triggerDownload(this.toPptxBlob(deck), name);
    showToast(`📽 [경영 보고] ${name} 내려받기 완료 (${deck.slides.length}장)`);
    return name;
  },
  // 주간보고 화면 [⬇ 내려받기]: 왼쪽 목록에서 고른 주차
  downloadPptxSelected() { return this.downloadPptx(WeeklyReportManager.listWeek || this.week()); },
  openPdf(weekNum) {
    const deck = this.build(weekNum || this.week());
    if (!deck) return showToast("⚠️ 보고 주차를 찾을 수 없습니다.");
    const w = window.open("", "_blank");
    if (!w) return showToast("⚠️ 팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저에서 이 프로그램의 팝업을 허용하세요.");
    w.document.open();
    w.document.write(this.toHtml(deck));
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600);
    showToast(`🖨 [경영 보고] 인쇄 창에서 [PDF로 저장]을 고르세요 (${deck.slides.length}장)`);
  }
};
window.ExecDeck = ExecDeck;
