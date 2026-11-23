// =============================================================================
// 기준선 (Baseline) — [기준선 확정] 순간의 계획 일정을 복사해 두고 지금 계획과 비교
//  - 자료: projectConfig.baselines = [{ no, date, by, reason }], projectConfig.baselineCompare = "first" | "last"
//          wbsData 의 Leaf Task 에 bHist = { [no]: [계획 시작, 계획 종료] }
//  - 계산값(저장되지만 다시 계산): bStart · bEnd (비교 기준선, 상위 Task 는 하위의 처음 · 끝)
//  - 차이(일) = 지금 계획 종료 − 기준선 종료. + 면 밀림. 계획 진척률 기준(progressBasis)이 영업일이면 영업일로 셈
//  DOM 을 쓰지 않는다 (tools/tests/unit 에서 그대로 시험). 화면은 baseline-ui.js
// =============================================================================
var Baseline = {
  list(cfg) { return (cfg && Array.isArray(cfg.baselines)) ? cfg.baselines : []; },
  // 비교에 쓰는 기준선 (최초 · 직전)
  current(cfg) {
    const l = this.list(cfg);
    if (!l.length) return null;
    return cfg.baselineCompare === "last" ? l[l.length - 1] : l[0];
  },

  // 확정: 계획 시작 · 종료가 있는 Leaf 의 일정을 복사. 새 기준선 번호를 돌려줌
  confirm(data, cfg, by, reason, date) {
    const l = this.list(cfg);
    const no = l.reduce((m, b) => Math.max(m, b.no || 0), 0) + 1;
    (data || []).forEach(t => {
      if (!t || !t.isLeaf || !t.pStart || !t.pEnd) return;
      t.bHist = Object.assign({}, t.bHist || {}, { [no]: [t.pStart, t.pEnd] });
    });
    cfg.baselines = l.concat([{ no, date, by: by || "", reason: reason || "" }]);
    this.annotate(data, cfg);
    return no;
  },

  // bStart · bEnd 채우기 (Leaf = bHist, 상위 = 하위의 가장 이른 시작 · 가장 늦은 종료). rollup 끝에서 부름
  annotate(data, cfg) {
    const b = this.current(cfg);
    (data || []).forEach(t => {
      if (!t) return;
      const h = b && t.isLeaf && t.bHist && t.bHist[b.no];
      if (h) { t.bStart = h[0]; t.bEnd = h[1]; } else { delete t.bStart; delete t.bEnd; }
    });
    if (!b) return;
    for (let lvl = 4; lvl >= 1; lvl--) {
      (data || []).forEach(t => {
        if (!t || t.isLeaf || t.level !== lvl) return;
        const kids = data.filter(d => d.level > lvl && d.isLeaf && String(d.id).startsWith(t.id + ".") && d.bStart);
        if (!kids.length) return;
        t.bStart = kids.map(k => k.bStart).sort()[0];
        t.bEnd = kids.map(k => k.bEnd).sort().pop();
      });
    }
  },

  // 지우기: 기준선 이력과 Task 의 기준선 일정을 모두 없앰 (처음부터 다시 확정)
  clear(data, cfg) {
    delete cfg.baselines; delete cfg.baselineCompare;
    (data || []).forEach(t => { if (t) { delete t.bHist; delete t.bStart; delete t.bEnd; } });
  },

  // 엑셀 업로드 · 파일 Merge 로 행을 바꿀 때: 같은 서브시스템 · 같은 WBS ID 의 기준선을 이어 받음
  //  (기준선은 PM 이 확정하는 것이라 지금 자료에 있는 기준선이 우선)
  carry(oldRows, newRows) {
    const key = t => `${t.system}\u0001${t.id}`;
    const m = new Map((oldRows || []).filter(t => t && t.bHist).map(t => [key(t), t.bHist]));
    (newRows || []).forEach(t => { if (t && m.has(key(t))) t.bHist = Object.assign({}, t.bHist || {}, m.get(key(t))); });
  },
  // 프로젝트 설정을 파일에서 가져올 때: 기준선 이력이 더 짧은 쪽으로 되돌아가지 않게
  keepConfig(cur, incoming) {
    if (!incoming || !cur) return incoming;
    if (this.list(cur).length > this.list(incoming).length) { delete incoming.baselines; delete incoming.baselineCompare; }
    return incoming;
  },

  // 두 날짜 사이 일수 (b → a, a 가 늦으면 +)
  diffDays(a, b, cfg) {
    if (!a || !b || a === b) return 0;
    const sign = a > b ? 1 : -1, lo = a > b ? b : a, hi = a > b ? a : b;
    if (cfg && cfg.progressBasis === "BUSINESS" && typeof WBSEngine !== "undefined") {
      const hs = new Set((cfg.holidays || []).map(h => h.date));
      return sign * WBSEngine.countBusinessDays(lo, hi, hs);   // [lo, hi) 의 영업일 수
    }
    return sign * Math.round((new Date(hi + "T00:00:00") - new Date(lo + "T00:00:00")) / 86400000);
  },
  // Task 하나의 종료 차이 (기준선 없으면 null)
  varOf(t, cfg) { return t && t.bEnd && t.pEnd ? this.diffDays(t.pEnd, t.bEnd, cfg) : null; },

  // 요약: 종료 예정 차이 · 밀린 Leaf 수 · 기준선 후 추가된 Leaf 수
  summary(data, cfg, systems) {
    const b = this.current(cfg);
    if (!b) return { has: false };
    const leaves = (data || []).filter(t => t && t.isLeaf && (!systems || systems.indexOf(t.system) !== -1));
    const based = leaves.filter(t => t.bEnd);
    const ends = based.map(t => t.pEnd).filter(Boolean).sort(), bends = based.map(t => t.bEnd).sort();
    const endVar = ends.length && bends.length ? this.diffDays(ends[ends.length - 1], bends[bends.length - 1], cfg) : 0;
    const shifted = based.filter(t => (this.varOf(t, cfg) || 0) > 0).length;
    const l = this.list(cfg);
    return { has: true, no: b.no, date: b.date, reason: b.reason, count: l.length, last: l[l.length - 1],
      endVar, shifted, added: leaves.length - based.length, planEnd: ends[ends.length - 1] || "", baseEnd: bends[bends.length - 1] || "" };
  }
};
if (typeof window !== "undefined") window.Baseline = Baseline;
