// =============================================================================
// 지표 계산 (화면 · 보고서가 같은 기준으로 세도록 한 곳에) — 화면 코드에서 비율 · 건수 기준을 새로 만들지 않는다
//  - 달성률 = 실적 / 계획 (계획 0 이면 100, 계획 · 실적 모두 0 이면 "아직 계획 전")
//  - 요구사항: 삭제 제외, 완료 = "완료"
//  - VOC: 삭제 제외, 완료 = "완료" · "제외", 대기 = "대기" · "보류" · 빈 값
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
  VOC_DONE: ["완료", "제외"],
  VOC_WAIT: ["대기", "보류", ""],
  DELIV_DONE: ["보완완료"],
  DELIV_ING: ["작성중", "검토요청"],

  reqStats(list) {
    const v = (list || []).filter(r => r && r.status !== "삭제");
    const done = v.filter(r => this.REQ_DONE.indexOf(r.status) !== -1).length;
    const prog = v.filter(r => r.status === "진행").length;
    return { list: v, total: v.length, done, prog, rate: this.pct(done, v.length) };
  },
  vocStats(list) {
    const v = (list || []).filter(r => r && r.status !== "삭제");
    const done = v.filter(r => this.VOC_DONE.indexOf(r.status) !== -1).length;
    const prog = v.filter(r => r.status === "진행").length;
    const wait = v.filter(r => this.VOC_WAIT.indexOf(r.status || "") !== -1).length;
    return { list: v, total: v.length, done, prog, wait, rate: this.pct(done, v.length) };
  },
  delivStats(list, rounds) {
    const v = (list || []).filter(d => d && (!rounds || rounds.indexOf(d.round) !== -1));
    const done = v.filter(d => this.DELIV_DONE.indexOf(d.status) !== -1).length;
    const ing = v.filter(d => this.DELIV_ING.indexOf(d.status) !== -1).length;
    return { list: v, total: v.length, done, ing, rate: this.pct(done, v.length) };
  }
};
if (typeof window !== "undefined") window.Metrics = Metrics;
