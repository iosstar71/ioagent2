// =============================================================================
// 지표 계산 (화면 · 보고서가 같은 기준으로 세도록 한 곳에) — 화면 코드에서 비율 · 건수 기준을 새로 만들지 않는다
//  - 달성률 = 실적 / 계획 (계획 0 이면 100, 계획 · 실적 모두 0 이면 "아직 계획 전")
//  - 요구사항: 삭제 제외, 완료 = "완료"
//  - VOC: 삭제 제외, 끝남 = "완료" · "요구 반영"(추가 요구사항으로 등록), 대기 = "대기" · "보류" · 빈 값
//    판정(vocType) · 단계(stage) · 심각도(severity) 목록과 단계 자동 지정 · 결함 집계도 여기
//  - 요구사항: origin "추가" = VOC 에서 등록한 추가 요구사항, 그 밖은 초기
//  - 산출물: 운영 차수만, 완료 = "보완완료", 진행 = "작성중" · "검토요청"
//  DOM · 전역 화면 상태를 쓰지 않는다 (tools/tests/unit 에서 그대로 시험)
// =============================================================================
var Metrics = {
  _round(v, digits) { const f = Math.pow(10, digits || 0); return Math.round(v * f) / f; },

  // 달성률 (%): 계획이 0 이면 100
  achv(plan, actual, digits) {
    const p = parseFloat(plan) || 0, a = parseFloat(actual) || 0;
    return p > 0 ? this._round(a / p * 100, digits) : 100;
  },
  // 계획 · 실적이 모두 0 → 아직 계획 전 (화면은 "-", 합계에서 뺌)
  notPlanned(plan, actual) { return (parseFloat(plan) || 0) <= 0 && (parseFloat(actual) || 0) <= 0; },
  // 비율 (%): 전체가 0 이면 0
  pct(done, total, digits) { return total > 0 ? this._round(done / total * 100, digits) : 0; },

  REQ_DONE: ["완료"],
  VOC_DONE: ["완료", "요구 반영"],
  VOC_WAIT: ["대기", "보류", ""],
  DELIV_DONE: ["보완완료"],
  DELIV_ING: ["작성중", "검토요청"],

  // ---- VOC 판정 · 단계 · 심각도 (화면 · 엑셀 · 상세 패널이 이 목록을 읽어 씀) ----
  VOC_STATUS: ["대기", "진행", "완료", "보류", "요구 반영", "삭제"],
  VOC_JUDGE: ["미판정", "결함", "개선 요청", "설명 종결", "이슈"],
  VOC_STAGES: ["요건분석/설계", "구현/단위테스트", "통합테스트", "안정화"],
  VOC_SEVERITY: ["치명", "높음", "보통", "낮음"],
  TEST_STAGE: "통합테스트",
  // 예전 구분 · 영어 값 → 판정
  JUDGE_ALIAS: { "VOC": "미판정", "버그": "결함", "bug": "결함", "defect": "결함", "issue": "이슈", "improvement": "개선 요청", "개선": "개선 요청", "개선요청": "개선 요청", "설명종결": "설명 종결" },
  judgeOf(v) {
    const t = String((v && v.vocType) || "").trim();
    if (this.VOC_JUDGE.indexOf(t) !== -1) return t;
    return this.JUDGE_ALIAS[t] || this.JUDGE_ALIAS[t.toLowerCase()] || "미판정";
  },
  // Phase 이름 · 키워드로 VOC 단계 추정 ("단위테스트" 가 통합테스트로 잡히지 않게 구현을 먼저 봄) (프로젝트 설정에서 Phase 마다 고칠 수 있음: phase.vocStage)
  STAGE_WORDS: [
    ["안정화", ["안정화", "이행", "오픈", "릴리즈", "배포", "종료", "전환", "컷오버", "인수인계", "운영"]],
    ["구현/단위테스트", ["개발", "구현", "단위", "코딩", "제작", "설정", "파라미터", "이터레이션", "구축"]],
    ["통합테스트", ["통합테스트", "테스트", "검증", "인수", "시험", "리뷰", "qa", "점검"]],
    ["요건분석/설계", ["분석", "설계", "요구", "요건", "착수", "계획", "정의", "fit", "gap", "기획"]]
  ],
  stageGuess(phase) {
    if (!phase) return "";
    if (this.VOC_STAGES.indexOf(phase.vocStage) !== -1) return phase.vocStage;
    const text = (String(phase.name || "") + " " + (phase.keywords || []).join(" ")).toLowerCase();
    const nameOnly = String(phase.name || "").toLowerCase();
    // 이름에서 먼저 찾고, 없으면 키워드까지
    for (const src of [nameOnly, text]) {
      for (const [stage, words] of this.STAGE_WORDS) if (/** @type {string[]} */ (words).some(w => src.indexOf(w) !== -1)) return /** @type {string} */ (stage);
    }
    return "";
  },
  // 접수일이 들어가는 Phase 계획 기간의 단계. 겹치면 늦게 시작한 Phase, 밖이면 가장 가까운 Phase
  vocStageOf(date, phases) {
    const ps = (phases || []).filter(p => p && p.pStart && p.pEnd);
    if (!date || !ps.length) return "";
    const inside = ps.filter(p => p.pStart <= date && date <= p.pEnd).sort((a, b) => (a.pStart < b.pStart ? 1 : -1));
    if (inside.length) return this.stageGuess(inside[0]);
    const t = d => new Date(d + "T00:00:00").getTime(), x = t(date);
    let best = null, bd = Infinity;
    ps.forEach(p => { const d = Math.min(Math.abs(x - t(p.pStart)), Math.abs(x - t(p.pEnd))); if (d < bd) { bd = d; best = p; } });
    return this.stageGuess(best);
  },

  reqStats(list) {
    const v = (list || []).filter(r => r && r.status !== "삭제");
    const done = v.filter(r => this.REQ_DONE.indexOf(r.status) !== -1).length;
    const prog = v.filter(r => r.status === "진행").length;
    const added = v.filter(r => r.origin === "추가").length;
    return { list: v, total: v.length, done, prog, rate: this.pct(done, v.length), initial: v.length - added, added };
  },
  // byJudge: 판정별, byStage: 단계별 × 판정별 (단계 빈 값은 "")
  vocStats(list) {
    const v = (list || []).filter(r => r && r.status !== "삭제");
    const done = v.filter(r => this.VOC_DONE.indexOf(r.status) !== -1).length;
    const prog = v.filter(r => r.status === "진행").length;
    const wait = v.filter(r => this.VOC_WAIT.indexOf(r.status || "") !== -1).length;
    const toReq = v.filter(r => r.status === "요구 반영").length;
    const byJudge = {}, byStage = {};
    this.VOC_JUDGE.forEach(j => { byJudge[j] = 0; });
    v.forEach(r => {
      const j = this.judgeOf(r), st = r.stage || "";
      byJudge[j]++;
      const row = byStage[st] || (byStage[st] = Object.assign({ total: 0 }, ...this.VOC_JUDGE.map(x => ({ [x]: 0 }))));
      row.total++; row[j]++;
    });
    const improve = byJudge["개선 요청"];
    return { list: v, total: v.length, done, prog, wait, rate: this.pct(done, v.length), byJudge, byStage,
      undecided: byJudge["미판정"], toReq, improve, improveInVoc: improve - v.filter(r => this.judgeOf(r) === "개선 요청" && r.status === "요구 반영").length };
  },
  // 아직 조치가 끝나지 않은 VOC (삭제 · 완료 · 요구 반영이 아닌 것) — My Work · 주간보고 · 종합보고서가 같은 기준으로 셈
  vocOpen(list) { return (list || []).filter(v => v && v.status !== "삭제" && this.VOC_DONE.indexOf(v.status) === -1); },
  // 지연: 목표일이 기준일보다 앞 + 끝나지 않음 (보류 제외)
  vocLate(v, refDate) { return !!(v && v.targetDate && refDate && v.targetDate < refDate && this.VOC_DONE.concat(["삭제", "보류"]).indexOf(v.status) === -1); },
  // 범위 협의 알림: 서브시스템별 VOC 안에서 처리한 개선 요청 건수가 기준 이상 (0 = 끔)
  SCOPE_ALERT_DEFAULT: 10,
  scopeAlertCount(cfg) { const v = parseInt(cfg && cfg.scopeAlert, 10); return isNaN(v) || v < 0 ? this.SCOPE_ALERT_DEFAULT : v; },
  scopeAlerts(list, cfg) {
    const lim = this.scopeAlertCount(cfg), by = {};
    if (!lim) return [];
    (list || []).forEach(v => { if (v && v.status !== "삭제" && v.status !== "요구 반영" && this.judgeOf(v) === "개선 요청") by[v.system] = (by[v.system] || 0) + 1; });
    return Object.keys(by).filter(s => by[s] >= lim).map(s => ({ system: s, count: by[s] }));
  },
  // 테스트 결함 = 단계 통합테스트 + 판정 결함 (안정화는 VOC 현황에만)
  //  refDate(기준일)를 주면 그날까지 접수된 것만 — 다른 지표처럼 "기준일 시점" (지난 주를 다시 볼 때 뒤에 들어온 결함이 섞이지 않게)
  _byRef(v, refDate) { return !refDate || (!!v.reqDate && v.reqDate <= refDate); },
  isTestDefect(v, refDate) { return !!v && v.status !== "삭제" && v.stage === this.TEST_STAGE && this.judgeOf(v) === "결함" && this._byRef(v, refDate); },
  // 결함 현황을 보여 줄지: 기준일까지 통합테스트 단계로 접수된 VOC 가 있을 때만
  hasTestStage(list, refDate) { return (list || []).some(v => v && v.status !== "삭제" && v.stage === this.TEST_STAGE && this._byRef(v, refDate)); },
  // 결함 현황 + 소진 추이 (일별 누적 발생 · 해결 · 잔여). 해결일(closedDate)이 없는 끝난 건은 추이에서 빼고 noDate 로 셈
  defectStats(list, refDate) {
    const d = (list || []).filter(v => this.isTestDefect(v, refDate));
    const isDone = v => this.VOC_DONE.indexOf(v.status) !== -1;
    const open = d.filter(v => !isDone(v));
    const bySev = {}, openBySev = {};
    this.VOC_SEVERITY.concat([""]).forEach(s => { bySev[s] = 0; openBySev[s] = 0; });
    d.forEach(v => { const s = this.VOC_SEVERITY.indexOf(v.severity) !== -1 ? v.severity : ""; bySev[s]++; if (!isDone(v)) openBySev[s]++; });
    const undecided = (list || []).filter(v => v && v.status !== "삭제" && v.stage === this.TEST_STAGE && this.judgeOf(v) === "미판정" && this._byRef(v, refDate)).length;
    const dates = d.map(v => v.reqDate).filter(Boolean).sort();
    const series = [];
    let noDate = 0;
    d.forEach(v => { if (isDone(v) && !v.closedDate) noDate++; });
    if (dates.length && refDate && dates[0] <= refDate) {
      const t = s => new Date(s + "T00:00:00"), f = x => x.toISOString().slice(0, 10);
      for (let x = t(dates[0]); f(x) <= refDate && series.length < 1000; x.setDate(x.getDate() + 1)) {
        const day = f(x);
        const opened = d.filter(v => v.reqDate && v.reqDate <= day).length;
        const closed = d.filter(v => isDone(v) && v.closedDate && v.closedDate <= day).length;
        series.push({ date: day, opened, closed, remain: opened - closed });
      }
    }
    return { list: d, total: d.length, open: open.length, closed: d.length - open.length, rate: this.pct(d.length - open.length, d.length),
      bySev, openBySev, critOpen: openBySev["치명"] + openBySev["높음"], undecided, series, noDate };
  },
  delivStats(list, rounds) {
    const v = (list || []).filter(d => d && (!rounds || rounds.indexOf(d.round) !== -1));
    const done = v.filter(d => this.DELIV_DONE.indexOf(d.status) !== -1).length;
    const ing = v.filter(d => this.DELIV_ING.indexOf(d.status) !== -1).length;
    return { list: v, total: v.length, done, ing, rate: this.pct(done, v.length) };
  }
};
if (typeof window !== "undefined") window.Metrics = Metrics;
