// =============================================================================
// 샘플 프로젝트가 담아야 할 경우 (tools/build_sample.js 가 만드는 static/js/core/sample-snapshot.js)
//  - 단위 시험(run_unit.js)이 이 목록을 돌린다. 경우 하나가 빠지면 실패
//  - E2E 는 [🧪 샘플 프로젝트 추가] 로 같은 자료를 열어 화면을 시험한다
//  새 기능을 만들면 그 기능이 보여 줄 경우를 CASES 에 더하고, build_sample.js 에서 자료를 넣는다
// =============================================================================
"use strict";
const path = require("path");
const Sample = require(path.join(__dirname, "..", "build_sample.js"));

// 앱이 프로젝트를 열 때와 같은 순서로 계산 (load = run_unit.js 의 엔진 불러오기)
function open(load) {
  const S = JSON.parse(JSON.stringify(Sample.load()));
  const ctx = load({ projectConfig: S.projectConfig, subsystemsMeta: S.subsystemsMeta, vocData: S.vocData, wbsData: S.wbsData });
  ctx.Migrate.data(S);
  ctx.Migrate.PROJECT_STEPS.find(s => s.id === "voc-stage").run();
  const E = ctx.WBSEngine, rep = S.projectConfig.reportDate;
  E.sortAndAutoNumber(S.wbsData);
  E.calculatePlanProgress(S.wbsData, rep);
  E.rollup(S.wbsData);
  return { S, E, M: ctx.Metrics, B: ctx.Baseline, rep };
}

const CASES = [
  // 기본 구성
  ["subsystems: SDLC and improvement (REQ) types, 3 domains", ({ S }) => S.subsystemsMeta.some(s => s.type === "REQ") && S.subsystemsMeta.some(s => s.type === "SDLC") && new Set(S.subsystemsMeta.map(s => s.domain)).size >= 3],
  ["members: PM · LEAD · MEMBER roles", ({ S }) => ["PM", "LEAD", "MEMBER"].every(r => S.projectUsers.some(u => u.role === r))],
  ["old terms are converted on open (착수전 → 대기, N회차 → N차)", ({ S }) => !JSON.stringify(S.reqMasterData).includes("착수전") && S.deliverablesData.every(d => /^\d차$/.test(d.round))],
  // WBS
  ["WBS: levels 1 to 5", ({ S }) => [1, 2, 3, 4, 5].every(l => S.wbsData.some(t => t.level === l))],
  ["WBS: every Task status (완료 · 진행중 · 지연 · 대기) among leaves", ({ S }) => ["완료", "진행중", "지연", "대기"].every(st => S.wbsData.some(t => t.isLeaf && t.status === st))],
  ["WBS: delayed Task under several upper levels (status filter shows group heads)", ({ S }) => S.wbsData.some(t => t.isLeaf && t.status === "지연" && t.level >= 4)],
  ["WBS: Task weights add up (no weight warning in the sample)", ({ S }) => S.wbsData.every(t => t.weight !== undefined)],
  // 선행 Task
  ["predecessor: 선행 지연", ({ S, E, rep }) => [...E.predWarnings(S.wbsData, rep).values()].some(r => r.list.some(x => x.reasons.includes("delayed")))],
  ["predecessor: 일정 겹침, across subsystems", ({ S, E, rep }) => [...E.predWarnings(S.wbsData, rep).entries()].some(([t, r]) => r.list.some(x => x.reasons.includes("overlap") && x.task.system !== t.system))],
  ["predecessor: started while predecessor unfinished", ({ S, E, rep }) => [...E.predWarnings(S.wbsData, rep).values()].some(r => r.list.some(x => x.reasons.includes("started")))],
  ["predecessor: one with no warning (finished predecessor)", ({ S, E, rep }) => S.wbsData.some(t => t.pred && !E.predCheck(t, S.wbsData, rep).warn)],
  ["predecessor: a Task with 3 predecessors", ({ S, E }) => S.wbsData.some(t => E.predIds(t).length === 3)],
  // 기준선
  ["baseline: confirmed, some Tasks shifted later, one added after", ({ S, B }) => { const s = B.summary(S.wbsData, S.projectConfig); return s.has && s.shifted >= 1 && s.added >= 1; }],
  // 요구사항
  ["requirements: 대기 · 진행 · 완료 · 보류 · 삭제", ({ S }) => ["대기", "진행", "완료", "보류", "삭제"].every(st => S.reqMasterData.some(r => r.status === st))],
  ["requirements: added requirement (CR) registered from a VOC", ({ S }) => S.reqMasterData.some(r => r.origin === "추가" && S.vocData.some(v => v.id === r.srcVoc && v.reqLink === r.id && v.status === "요구 반영"))],
  // VOC · 결함
  ["VOC: all 5 judgements", ({ S, M }) => M.VOC_JUDGE.every(j => S.vocData.some(v => M.judgeOf(v) === j))],
  ["VOC: statuses 대기 · 진행 · 완료 · 보류 · 요구 반영 · 삭제", ({ S }) => ["대기", "진행", "완료", "보류", "요구 반영", "삭제"].every(st => S.vocData.some(v => v.status === st))],
  ["VOC: late (target passed) and on-hold past target (not late)", ({ S, M, rep }) => S.vocData.some(v => M.vocLate(v, rep)) && S.vocData.some(v => v.status === "보류" && v.targetDate < rep && !M.vocLate(v, rep))],
  ["VOC: stages filled automatically and one set by hand", ({ S }) => S.vocData.some(v => v.stage && !v.stageManual) && S.vocData.some(v => v.stageManual)],
  ["defects: integration-test defects with severity, open + closed (burn-down), undecided in test", ({ S, M, rep }) => { const d = M.defectStats(S.vocData, rep); return d.total >= 2 && d.open >= 1 && d.closed >= 1 && d.critOpen + d.bySev["치명"] >= 1 && d.undecided >= 1 && d.series.length >= 2; }],
  ["VOC: scope alert (improvement requests handled in VOC)", ({ S, M }) => M.scopeAlerts(S.vocData, S.projectConfig).length >= 1],
  // 산출물 · 회의 · 보고 · 게시판
  ["deliverables: every status and 2 rounds; one past its plan date", ({ S, rep }) => ["작성전", "작성중", "검토요청", "보완완료"].every(st => S.deliverablesData.some(d => d.status === st)) && new Set(S.deliverablesData.map(d => d.round)).size >= 2 && S.deliverablesData.some(d => d.pDate < rep && d.status !== "보완완료" && !d.aDate)],
  ["meetings: done and planned, Action Items done / open / overdue", ({ S, rep }) => { const a = [].concat(...S.meetingsData.map(m => m.actionItems || [])); return S.meetingsData.some(m => m.status === "완료") && S.meetingsData.some(m => m.status === "예정") && a.some(x => x.status === "완료") && a.some(x => x.status !== "완료" && x.targetDate < rep); }],
  ["weekly reports: per subsystem and whole project, finished with snapshot", ({ S }) => S.weeklyReportsData.some(r => r.scope === "SYS") && S.weeklyReportsData.some(r => r.scope === "ALL") && S.weeklyReportsData.some(r => r.status === "DONE" && r.snapshot)],
  ["notices (pinned) and board posts with 3 statuses", ({ S }) => S.noticesData.some(n => n.isPinned) && ["OPEN", "PROGRESS", "RESOLVED"].every(st => S.communicationsData.some(c => c.status === st))],
  ["milestones: whole project and one subsystem", ({ S }) => (S.projectConfig.milestones || []).some(m => m.scope === "ALL") && (S.projectConfig.milestones || []).some(m => m.scope && m.scope !== "ALL")]
];

// eq(name, got, want) 로 결과를 알림
function run(load, eq) {
  const built = Sample.build(Sample.load());
  eq("sample-snapshot.js is up to date with tools/build_sample.js", JSON.stringify(built) === JSON.stringify(Sample.load()), true);
  const env = open(load);
  CASES.forEach(([name, fn]) => {
    let ok = false;
    try { ok = !!fn(env); } catch (e) { ok = "error: " + e.message; }
    eq("sample covers " + name, ok, true);
  });
}
module.exports = { CASES, run, open };
