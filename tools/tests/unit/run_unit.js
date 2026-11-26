// 계산 단위 시험 — 브라우저 없이 1~2초
//   node tools/tests/unit/run_unit.js
// 계산(달성률 · 비율 · 가중치 합산 · 계획 진척률 · 예전 자료 변환)을 고칠 때 E2E 대신 먼저 돌린다.
// 화면 코드가 아니라 엔진 파일만 읽어 시험한다 (Metrics · WBSEngine · Migrate).
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..", "..");
const JS = p => fs.readFileSync(path.join(ROOT, "static/js", p), "utf8").replace(/^(const|let) /mg, "var ");

function load(globals) {
  const ctx = Object.assign({ window: {}, console, projectConfig: {}, subsystemsMeta: [] }, globals || {});
  vm.createContext(ctx);
  ["modules/wbs/metrics.js", "modules/wbs/baseline.js", "modules/wbs/wbs-engine.js", "core/migrate.js"].forEach(f => vm.runInContext(JS(f), ctx, { filename: f }));
  return ctx;
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  [FAIL] ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
}

// ---- 담당 서브시스템 목록 (SubsysList — 화면 · 서버 permission.py 와 같은 규칙) ----
{
  const src = fs.readFileSync(path.join(ROOT, "static/js/core/data-registry.js"), "utf8");
  const m = /var SubsysList = \{[\s\S]*?\n\};/.exec(src);
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(m[0], ctx);
  const L = ctx.SubsysList;
  eq("subsys: parse list / ALL / empty", [L.parse("A, B,A").join(), L.parse("ALL").join(), L.parse("").join(), L.parse("A,ALL").join()], ["A,B", "ALL", "ALL", "ALL"]);
  eq("subsys: has", [L.has("A,B", "B"), L.has("A,B", "C"), L.has("ALL", "C"), L.has("A", "A")], [true, false, true, true]);
  eq("subsys: join / label / isAll", [L.join(["B", "A", "B"]), L.label("A,B"), L.isAll("A"), L.isAll(" ")], ["B,A", "A, B", false, true]);
}

// ---- Metrics ----
{
  const { Metrics: M } = load();
  eq("achv: actual / plan", M.achv(40, 30), 75);
  eq("achv: plan 0 -> 100", M.achv(0, 0), 100);
  eq("achv: 1 decimal", M.achv(3, 1, 1), 33.3);
  eq("achv: strings", M.achv("50", "45"), 90);
  eq("notPlanned: both 0", M.notPlanned(0, 0), true);
  eq("notPlanned: actual only", M.notPlanned(0, 5), false);
  eq("pct: total 0 -> 0", M.pct(3, 0), 0);
  eq("pct: rounding", M.pct(1, 3), 33);
  const reqs = [{ status: "완료" }, { status: "진행" }, { status: "삭제" }, { status: "대기" }];
  const r = M.reqStats(reqs);
  eq("reqStats: deleted excluded", [r.total, r.done, r.prog, r.rate], [3, 1, 1, 33]);
  const vocs = [{ status: "완료" }, { status: "요구 반영", vocType: "개선 요청" }, { status: "보류" }, { status: "" }, { status: "진행", vocType: "개선 요청" }, { status: "삭제" }];
  const v = M.vocStats(vocs);
  eq("vocStats: done = 완료 + 요구 반영, wait = 대기 · 보류 · 빈 값", [v.total, v.done, v.wait, v.prog, v.rate], [5, 2, 2, 1, 40]);
  eq("vocStats: improvement requests = registered as REQ + handled in VOC", [v.improve, v.toReq, v.improveInVoc, v.undecided], [2, 1, 1, 3]);
  eq("vocOpen: deleted · done · moved to REQ are not open", M.vocOpen(vocs).map(x => x.status), ["보류", "", "진행"]);
  eq("vocLate: past target and not done; 보류 · 요구 반영 never late",
    [M.vocLate({ targetDate: "2026-01-01", status: "진행" }, "2026-02-01"), M.vocLate({ targetDate: "2026-01-01", status: "보류" }, "2026-02-01"), M.vocLate({ targetDate: "2026-01-01", status: "요구 반영" }, "2026-02-01")], [true, false, false]);
  eq("judgeOf: old 구분 values", ["VOC", "버그", "이슈", "결함", "", "Bug"].map(t => M.judgeOf({ vocType: t })), ["미판정", "결함", "이슈", "결함", "미판정", "결함"]);
  eq("reqStats: initial / added", [M.reqStats([{ status: "대기" }, { status: "대기", origin: "추가" }, { status: "삭제", origin: "추가" }]).initial, M.reqStats([{ status: "대기", origin: "추가" }]).added], [1, 1]);
}

// ---- VOC 단계 · 결함 ----
{
  const { Metrics: M, WBSEngine: W } = load();
  const P = W.DEFAULT_SDLC_PRESETS;
  eq("stageGuess: waterfall phases", P.SDLC_WATERFALL.phases.map(ph => M.stageGuess(ph)), ["요건분석/설계", "요건분석/설계", "구현/단위테스트", "통합테스트", "안정화"]);
  eq("stageGuess: phase.vocStage wins", M.stageGuess({ name: "개발", vocStage: "통합테스트" }), "통합테스트");
  eq("stageGuess: 단위테스트 is not 통합테스트", M.stageGuess({ name: "구현/단위테스트" }), "구현/단위테스트");
  const ph = [{ name: "분석", pStart: "2026-01-01", pEnd: "2026-02-28" }, { name: "개발", pStart: "2026-03-01", pEnd: "2026-06-30" },
    { name: "통합테스트", pStart: "2026-06-15", pEnd: "2026-08-31" }, { name: "이행", pStart: "2026-09-01", pEnd: "2026-09-30" }];
  eq("vocStageOf: inside / overlap → later phase / outside → nearest / no date",
    [M.vocStageOf("2026-01-10", ph), M.vocStageOf("2026-06-20", ph), M.vocStageOf("2026-12-01", ph), M.vocStageOf("2025-11-01", ph), M.vocStageOf("", ph)],
    ["요건분석/설계", "통합테스트", "안정화", "요건분석/설계", ""]);
  const dv = [
    { stage: "통합테스트", vocType: "결함", severity: "치명", status: "진행", reqDate: "2026-07-01" },
    { stage: "통합테스트", vocType: "결함", severity: "보통", status: "완료", reqDate: "2026-07-01", closedDate: "2026-07-03" },
    { stage: "통합테스트", vocType: "결함", status: "완료", reqDate: "2026-07-02" },
    { stage: "통합테스트", vocType: "미판정", status: "대기", reqDate: "2026-07-02" },
    { stage: "안정화", vocType: "결함", status: "진행", reqDate: "2026-07-02" },
    { stage: "통합테스트", vocType: "결함", status: "삭제", reqDate: "2026-07-02" }];
  const df = M.defectStats(dv, "2026-07-04");
  eq("defectStats: 통합테스트 + 결함 only (안정화 · 삭제 out)", [df.total, df.open, df.closed, df.critOpen, df.undecided, df.noDate], [3, 1, 2, 1, 1, 1]);
  eq("defectStats: daily burn-down", df.series.map(x => [x.opened, x.closed, x.remain]), [[2, 0, 2], [3, 0, 3], [3, 1, 2], [3, 1, 2]]);
  eq("hasTestStage", [M.hasTestStage(dv), M.hasTestStage([{ stage: "안정화" }])], [true, false]);
  const vs = M.vocStats(dv);
  eq("vocStats.byStage", [vs.byStage["통합테스트"].total, vs.byStage["통합테스트"]["결함"], vs.byStage["안정화"]["결함"]], [4, 3, 1]);
  const ds = [{ round: "1차", status: "보완완료" }, { round: "1차", status: "작성중" }, { round: "3차", status: "보완완료" }];
  const d = M.delivStats(ds, ["1차", "2차"]);
  eq("delivStats: active rounds only", [d.total, d.done, d.ing, d.rate], [2, 1, 1, 50]);
}

// ---- WBSEngine: 가중치 합산 · 서브시스템 가중치 ----
{
  const subs = [{ name: "A", weight: 60 }, { name: "B", weight: 40 }];
  const { WBSEngine: E } = load({ subsystemsMeta: subs });
  const roots = [
    { id: "A-1", system: "A", level: 1, weight: 1, pProg: 100, aProg: 50 },
    { id: "B-1", system: "B", level: 1, weight: 1, pProg: 50, aProg: 50 }
  ];
  eq("sysWeight", [E.sysWeight("A"), E.sysWeight("B"), E.sysWeight("X")], [60, 40, 0]);
  eq("weightedProgress = subsystem progress x subsystem weight", E.weightedProgress(roots), { plan: 80, actual: 50 });
  subs[0].weight = 0; subs[1].weight = 0;
  eq("weightedProgress: all weights 0 -> equal share", E.weightedProgress(roots), { plan: 75, actual: 50 });
}

// ---- WBSEngine: 하위 가중치로 상위 진척 합산 ----
{
  const { WBSEngine: E } = load();
  const data = [
    { id: "S-1", system: "S", level: 1, name: "L1" },
    { id: "S-1.1", system: "S", level: 2, weight: 30, pStart: "2027-01-01", pEnd: "2027-01-31", pProg: 100, aProg: 100, aEnd: "2027-01-31" },
    { id: "S-1.2", system: "S", level: 2, weight: 70, pStart: "2027-02-01", pEnd: "2027-02-28", pProg: 50, aProg: 20 }
  ];
  E.rollup(data);
  eq("rollup: weighted by child weight", [data[0].pProg, data[0].aProg], [65, 44]);
  eq("rollup: parent dates from children", [data[0].pStart, data[0].pEnd, data[0].aEnd], ["2027-01-01", "2027-02-28", ""]);
}

// ---- WBSEngine: 계획 진척률 (달력 일수) ----
{
  const { WBSEngine: E } = load();
  const t = [{ isLeaf: true, pStart: "2027-01-01", pEnd: "2027-01-11" }, { isLeaf: true, pStart: "2027-02-01", pEnd: "2027-02-10" }, { isLeaf: true, pStart: "2026-12-01", pEnd: "2026-12-10" }, { isLeaf: true }];
  E.calculatePlanProgress(t, "2027-01-06", { basis: "CALENDAR", holidays: [] });
  eq("calculatePlanProgress: mid / before / after / no dates", t.map(x => x.pProg), [50, 0, 100, 0]);
}

// ---- WBSEngine: 선행 Task 경고 ----
{
  const { WBSEngine: E } = load({ projectConfig: { delayGap: 5 } });
  const rep = "2027-03-10";
  const d = [
    { id: "1.1", isLeaf: true, pStart: "2027-03-01", pEnd: "2027-03-05", pProg: 100, aProg: 60 },                       // 지연 (계획 종료 지남)
    { id: "1.2", isLeaf: true, pStart: "2027-03-01", pEnd: "2027-03-20", pProg: 40, aProg: 40 },                         // 정상 진행
    { id: "1.3", isLeaf: true, pStart: "2027-03-01", pEnd: "2027-03-04", pProg: 100, aProg: 100, aEnd: "2027-03-04" },  // 완료
    { id: "2.1", isLeaf: true, pred: "1.1", pStart: "2027-03-15", pEnd: "2027-03-30", pProg: 0, aProg: 0 },               // delayed
    { id: "2.2", isLeaf: true, pred: "1.2", pStart: "2027-03-15", pEnd: "2027-03-30", pProg: 0, aProg: 0 },               // overlap (1.2 ends 3/20)
    { id: "2.3", isLeaf: true, pred: "1.2", pStart: "2027-03-21", pEnd: "2027-03-30", aStart: "2027-03-09", pProg: 0, aProg: 10 }, // started
    { id: "2.4", isLeaf: true, pred: "1.3", pStart: "2027-03-05", pEnd: "2027-03-30", pProg: 10, aProg: 10 },              // no warning
    { id: "2.5", isLeaf: true, pred: "1.1, 1.1;1.2 1.3 9.9", pStart: "2027-03-15", pEnd: "2027-03-30", pProg: 0, aProg: 100 } // done → none
  ];
  const reasons = id => E.predCheck(d.find(t => t.id === id), d, rep).list.map(x => x.id + ":" + (x.missing ? "missing" : x.reasons.join("+")));
  eq("predIds: split, unique, max 3", E.predIds(d[7]), ["1.1", "1.2", "1.3"]);
  eq("predCheck: delayed / overlap / started / ok", [reasons("2.1"), reasons("2.2"), reasons("2.3"), reasons("2.4")],
    [["1.1:delayed"], ["1.2:overlap"], ["1.2:started"], ["1.3:"]]);
  eq("predCheck: a finished Task has no warning; unknown ID is missing", [reasons("2.5"), E.predCheck({ pred: "9.9" }, d, rep).list[0].missing], [["1.1:", "1.2:", "1.3:"], true]);
  eq("predWarnings: only Tasks with a warning", [...E.predWarnings(d, rep).keys()].map(t => t.id), ["2.1", "2.2", "2.3"]);
  const cyc = [{ id: "A", pred: "" }, { id: "B", pred: "A" }, { id: "C", pred: "B" }, { id: "D", pred: "" }];
  eq("predCycle: A←B←C, adding C (or B) as A's predecessor loops; D does not", [E.predCycle(cyc, cyc[0], "C"), E.predCycle(cyc, cyc[0], "B"), E.predCycle(cyc, cyc[0], "D"), E.predCycle(cyc, cyc[0], "A")], [true, true, false, true]);
  const r = [{ id: "1", level: 1, system: "A" }, { id: "1.1", level: 2, system: "A" }, { id: "1.2", level: 2, system: "A", pred: "1.1" }, { id: "1.3", level: 2, system: "A", pred: "1.2, 7.7" }];
  r.splice(1, 0, { id: "", level: 2, system: "A" });
  E.sortAndAutoNumber(r);
  eq("sortAndAutoNumber: predecessors follow renumbered IDs (unknown kept)", r.map(t => t.pred || ""), ["", "", "", "1.2", "1.3, 7.7"]);
}

// ---- Migrate ----
{
  const { Migrate } = load();
  const d = { reqMasterData: [{ status: "착수전" }], deliverablesData: [{ round: "2회차", status: "착수전" }] };
  Migrate.data(d);
  eq("Migrate.data: old status and round names", [d.reqMasterData[0].status, d.deliverablesData[0].round, d.deliverablesData[0].status], ["대기", "2차", "대기"]);
  const v = { vocData: [{ vocType: "VOC", status: "대기" }, { vocType: "버그", status: "완료", targetDate: "2026-03-01" }, { vocType: "VOC", status: "제외" }, { vocType: "이슈", status: "제외" }] };
  Migrate.data(v);
  eq("Migrate.data: VOC 구분 → 판정, 제외 → 완료 (+ 설명 종결 when undecided), closedDate from target",
    v.vocData.map(x => [x.vocType, x.status, x.closedDate || ""]),
    [["미판정", "대기", ""], ["결함", "완료", "2026-03-01"], ["설명 종결", "완료", ""], ["이슈", "완료", ""]]);
  const ctx = load({ vocData: [{ system: "A", reqDate: "2026-07-01" }, { system: "A", reqDate: "2026-07-01", stage: "안정화" }, { system: "A", reqDate: "2026-07-01", stageManual: true }],
    subsystemsMeta: [{ name: "A", sdlcCode: "X" }],
    projectConfig: { customSdlcTypes: [{ code: "X", phases: [{ name: "테스트", pStart: "2026-06-01", pEnd: "2026-08-01" }] }], activeSdlcCodes: ["X"] } });
  ctx.Migrate.PROJECT_STEPS.find(s => s.id === "voc-stage").run();
  eq("Migrate voc-stage: fills empty stage only", ctx.vocData.map(x => x.stage || ""), ["통합테스트", "안정화", ""]);
}

// ---- 기준선 ----
{
  const { Baseline: B } = load();
  const cfg = {};
  const data = [{ id: "1", level: 1, isLeaf: false, system: "A" }, { id: "1.1", level: 2, isLeaf: true, system: "A", pStart: "2026-03-02", pEnd: "2026-03-10" },
    { id: "1.2", level: 2, isLeaf: true, system: "A", pStart: "2026-03-11", pEnd: "2026-03-20" }, { id: "1.3", level: 2, isLeaf: true, system: "A" }];
  eq("no baseline → summary.has false", B.summary(data, cfg).has, false);
  const no = B.confirm(data, cfg, "pm", "kick-off", "2026-03-01");
  eq("confirm: number 1, leaves with dates copied, parent rolled up", [no, data[1].bEnd, data[3].bHist, data[0].bStart, data[0].bEnd], [1, "2026-03-10", undefined, "2026-03-02", "2026-03-20"]);
  data[2].pEnd = "2026-03-25";
  B.annotate(data, cfg);
  const s1 = B.summary(data, cfg);
  eq("summary: end +5 days (calendar), 1 shifted, 1 added after", [s1.endVar, s1.shifted, s1.added], [5, 1, 1]);
  eq("varOf: earlier is negative", B.varOf({ pEnd: "2026-03-08", bEnd: "2026-03-10" }, cfg), -2);
  const no2 = B.confirm(data, cfg, "pm", "re-plan", "2026-03-15");
  eq("re-baseline: compare first by default, last when set", [no2, B.summary(data, cfg).endVar, (cfg.baselineCompare = "last", B.annotate(data, cfg), B.summary(data, cfg).endVar)], [2, 5, 0]);
  B.clear(data, cfg);
  eq("clear: no baseline history or Task baseline dates left", [B.summary(data, cfg).has, data.some(t => t.bHist || t.bStart || t.bEnd), "baselineCompare" in cfg], [false, false, false]);
  eq("diffDays: business basis skips weekend", B.diffDays("2026-03-09", "2026-03-06", { progressBasis: "BUSINESS", holidays: [] }), 1);
}

// ---- 영어 화면: 문구 틀(tf) · 규칙 ----
{
  const ctx = { window: {}, console, document: { documentElement: { setAttribute() {} } }, APP_CONFIG: {} };
  vm.createContext(ctx);
  ["common/i18n-en.js", "common/i18n.js"].forEach(f => vm.runInContext(JS(f), ctx, { filename: f }));
  const I = ctx.I18N; I.lang = "en";
  eq("tf fills Korean template", I.tf("가중치 {n}%", { n: 30 }), "가중치 30%");
  eq("template translates in English", I.t(I.tf("가중치 {n}%", { n: 30 })), "weight 30%");
  eq("count patterns", [I.t("전체 저장 (2)"), I.t("단계 4개")], ["Save all (2)", "4 phases"]);
}

// ---- Phase 진척: 단계 칸 문제 요약 · 단계별 산출물 ----
{
  const { WBSEngine: E, Metrics: M } = load({ projectConfig: { delayGap: 5 } });
  const leaves = [{ pStart: "2027-01-01", pEnd: "2027-01-10", pProg: 100, aProg: 50, bEnd: "2027-01-03" }, { pStart: "2027-01-01", pEnd: "2027-03-10", pProg: 20, aProg: 20 }];
  eq("phaseIssues: delayed count, largest slip", E.phaseIssues(leaves, "2027-02-01", t => t.bEnd ? 7 : null), { delayed: 1, slip: 7 });
  eq("phaseIssues: no baseline -> slip 0", E.phaseIssues(leaves, "2027-02-01", null).slip, 0);
  const dl = [{ phase: "설계", round: "1차", status: "보완완료" }, { phase: "설계", round: "1차", status: "작성중", pDate: "2027-01-05" }, { phase: "분석", round: "2차", status: "작성전", pDate: "2027-03-01" }, { phase: "분석", round: "3차", status: "작성전" }];
  const r = M.delivByPhase(dl, ["1차", "2차"], "2027-02-01", ["분석", "설계"]);
  eq("delivByPhase: order, rounds, late, rate", r.map(x => [x.phase, x.total, x.done, x.late, x.rate, x.byRound["1차"].total]), [["분석", 1, 0, 0, 0, 0], ["설계", 2, 1, 1, 50, 2]]);
}

// ---- 결함 현황: 기준일까지 접수된 것만 ----
{
  const { Metrics: M } = load();
  const l = [{ stage: "통합테스트", vocType: "결함", reqDate: "2027-09-10", status: "진행" }, { stage: "통합테스트", vocType: "결함", reqDate: "2027-09-20", status: "완료", closedDate: "2027-09-21" }];
  eq("hasTestStage / defectStats follow the report date", [M.hasTestStage(l, "2027-09-01"), M.hasTestStage(l, "2027-09-15"), M.defectStats(l, "2027-09-15").total, M.defectStats(l, "2027-09-30").total, M.hasTestStage(l)], [false, true, 1, 2, true]);
}

// ---- 샘플 프로젝트가 담은 경우 (tools/tests/sample_coverage.js) ----
require(path.join(__dirname, "..", "sample_coverage.js")).run(load, eq);

// ---- 회의록 엑셀 양식 (XlsxTemplate · MeetingTemplate): 안건 3줄 묶음 반복 · 최소 자리 · 빈 칸 비우기 · 날짜 ----
async function meetingTemplateTests() {
  const ctx = { window: {}, console, TextEncoder, TextDecoder, Blob, Response, DecompressionStream, atob, btoa, ProjectData: { currentName: () => "시험 프로젝트" }, projectConfig: {},
    I18N: { t: x => x, tf: (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => o[k]) } };
  vm.createContext(ctx);
  ["modules/dataio/xlsx-template.js", "modules/meeting/report-templates-default.js", "modules/meeting/meeting-template.js"].forEach(f => vm.runInContext(JS(f), ctx, { filename: f }));
  const MT = ctx.MeetingTemplate, XT = ctx.XlsxTemplate;
  const m = { title: "연계 협의", system: "MES", date: "2027-05-28", startTime: "10:00", endTime: "11:30", attendees: [{ dept: "IT", name: "김", role: "수석" }, { name: "이", attendance: "불참" }],
    agendas: [{ order: 2, title: "B", discussion: "둘째", decision: "" }, { order: 1, title: "A", discussion: "첫째\n둘째 줄", decision: "결정" }],
    actionItems: [{ title: "할 일", content: "상세", assignee: "홍", targetDate: "2027-06-04", status: "대기" }, { title: "지움", status: "삭제" }] };
  const v = MT.values(m);
  eq("meeting values: title with subsystem, schedule, attendees per line, agendas sorted and padded to 5, actions padded to 4 (deleted left out), date as Excel serial",
    [v.제목, v.일정, v.참석자목록, v.안건.map(a => a.번호 + a.제목).join(), v.액션.length, v.액션[0].내용, v.액션[0].완료예정일],
    ["[MES] 연계 협의", "2027-05-28 10:00~11:30", "IT 김 수석\n이 (불참)", "1A,2B,3,4,5", 4, "할 일 — 상세", 46542]);
  const r = await XT.fill(MT.current().bytes, v);
  const f = await XT.unzip(new Uint8Array(await r.blob.arrayBuffer())), sh = new TextDecoder().decode(f["xl/worksheets/sheet1.xml"]);
  const txt = ref => { const c = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`).exec(sh); return c && c[1] ? (/<t[^>]*>([\s\S]*?)<\/t>/.exec(c[1]) || /<v>([\s\S]*?)<\/v>/.exec(c[1]) || [])[1] : ""; };
  // 안건 묶음 3줄 × 5 = 8 ~ 22, 상자 아래 23, 빈 줄 24, Action item 25 · 머리 26, Action 27 ~ 30
  eq("minutes file: 5 agenda blocks of 3 rows, empty decision cleared, merges copied per block, 4 action rows after",
    [txt("C8"), txt("C10"), txt("C11"), txt("C13"), txt("C14"), txt("C20"), sh.includes("<c r=\"B26\""), txt("C27"), txt("G27"), txt("B30"), /ref="C20:H20"/.test(sh), /ref="C27:E27"/.test(sh) && /ref="C30:E30"/.test(sh), r.unknown.length],
    ["안건 1. A", "▶ 결정", "안건 2. B", "", "안건 3. ", "안건 5. ", true, "할 일 — 상세", "46542", "4", true, true, 0]);
  eq("minutes file: long or multi-line text raises the row height", Number((/<row r="9"[^>]*\bht="([\d.]+)"/.exec(sh) || [])[1]) >= 30, true);
}

meetingTemplateTests().catch(e => { fail++; console.log("  [FAIL] meeting template tests threw", e); }).then(() => {
  console.log(`Unit: ${pass} / ${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
});
