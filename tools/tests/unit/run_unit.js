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
  ["modules/wbs/metrics.js", "modules/wbs/wbs-engine.js", "core/migrate.js"].forEach(f => vm.runInContext(JS(f), ctx, { filename: f }));
  return ctx;
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`  [FAIL] ${name}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`); }
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
  const vocs = [{ status: "완료" }, { status: "제외" }, { status: "보류" }, { status: "" }, { status: "진행" }, { status: "삭제" }];
  const v = M.vocStats(vocs);
  eq("vocStats: done = 완료 + 제외, wait = 대기 · 보류 · 빈 값", [v.total, v.done, v.wait, v.prog, v.rate], [5, 2, 2, 1, 40]);
  eq("vocOpen: deleted · done · excluded are not open", M.vocOpen(vocs).map(x => x.status), ["보류", "", "진행"]);
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

// ---- Migrate ----
{
  const { Migrate } = load();
  const d = { reqMasterData: [{ status: "착수전" }], deliverablesData: [{ round: "2회차", status: "착수전" }] };
  Migrate.data(d);
  eq("Migrate.data: old status and round names", [d.reqMasterData[0].status, d.deliverablesData[0].round, d.deliverablesData[0].status], ["대기", "2차", "대기"]);
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

console.log(`Unit: ${pass} / ${pass + fail} passed`);
process.exit(fail ? 1 : 0);
