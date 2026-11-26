// =============================================================================
// 로드맵 차트 (RoadmapChart) — 종합보고서 PPT 의 로드맵 한 장 (ExecDeck 도형: rect · text · poly)
// -----------------------------------------------------------------------------
//  한 장에 통합 + 서브시스템: 맨 위 분기 · 월 머리줄(달 경계마다 흐린 세로선을 아래 끝까지)
//    → 마일스톤 줄(◆, 서브시스템 마일스톤은 [이름]) → 서브시스템마다 한 묶음: 2레벨 단계 막대 줄 + 그 아래 3레벨 작업 막대 줄
//  구간 = 둥근 알약 막대 (단계마다 색). 완료 · 진행 중 · 예정은 계획 날짜와 기준일로만 정함
//    → 같은 계획이면 기준일 세로선만 옮겨 가며 그 시점을 보여 줌 (숫자는 쓰지 않음)
//  겹치는 막대는 아랫줄로 (_lanes). 묶음 높이는 줄 수에 맞춰 장표를 채움
//  서브시스템이 5개 이상이면 3레벨은 빼고 단계(2레벨)만 — 한 장에서 글자가 읽히지 않으므로 (o.depth 로 정할 수 있음)
// =============================================================================
var RoadmapChart = {
  // 단계 색 — 차가운 색 → 따뜻한 색 순서로 진행을 나타냄. 이름의 낱말로 같은 단계는 어느 서브시스템이든 같은 색
  COLORS: ["0891B2", "2563EB", "4F46E5", "9333EA", "D97706", "0F766E", "64748B", "DB2777"],
  PHASE_WORDS: [[/착수|분석|요구|조사/, 0], [/설계/, 1], [/개발|구현|구축|연계|수집|실행|통제/, 2], [/테스트|시험|검증|시운전/, 3], [/이행|전환|안정화|종료|오픈/, 4]],
  NOW: "E11D48", INK: "1E293B", SUB: "64748B", FAINT: "94A3B8", GRID: "D5DCE5", LINE: "E2E8F0", BAND: "F1F5F9", MS: "B45309",

  colorOf(name, i) {
    const hit = this.PHASE_WORDS.find(([rx]) => rx.test(String(name || "")));
    return this.COLORS[hit ? hit[1] : (5 + i) % this.COLORS.length];
  },
  // 색을 흰색 쪽으로 섞음 (t = 0 ~ 1) · 어둡게
  tint(hex, t) {
    return [0, 2, 4].map(i => { const v = parseInt(hex.substr(i, 2), 16); return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0"); }).join("").toUpperCase();
  },
  shade(hex) { return [0, 2, 4].map(i => Math.round(parseInt(hex.substr(i, 2), 16) * 0.75).toString(16).padStart(2, "0")).join("").toUpperCase(); },
  _d(s) { return s ? new Date(String(s).slice(0, 10) + "T00:00:00").getTime() : NaN; },
  _md(s) { return String(s || "").slice(5, 10).replace("-", "."); },
  // 완료(계획 종료가 기준일 전) · 진행 중 · 예정(계획 시작이 기준일 뒤)
  _state(it, ref) { const r = this._d(ref); return it.e < r ? "done" : it.s > r ? "plan" : "doing"; },
  // 서로 겹치는 막대를 줄로 나눔 (시작 순서대로 빈 줄에) → 막대마다 lane, 줄 수 돌려줌
  _lanes(items) {
    const ends = [];
    items.slice().sort((a, b) => a.s - b.s || b.e - a.e).forEach(it => {
      let k = ends.findIndex(e => e < it.s);
      if (k < 0) { k = ends.length; ends.push(0); }
      ends[k] = it.e;
      it.lane = k;
    });
    return Math.max(1, ends.length);
  },
  _items(tasks, level) {
    return tasks.filter(t => +t.level === level && this._d(t.pStart) && this._d(t.pEnd))
      .map((t, i) => ({ t, s: this._d(t.pStart), e: this._d(t.pEnd), color: this.colorOf(t.name, i) }))
      .map((it, i, a) => {   // 이웃한 단계가 같은 색이면 다음 색으로
        if (i && it.color === a[i - 1].color) it.color = this.COLORS[(this.COLORS.indexOf(it.color) + 1) % 5];
        return it;
      });
  },

  // 분기 · 월 머리줄 + 달 경계 흐린 세로선(아래 끝까지) + 기준일 → X(시각) 돌려줌
  _scale(els, o) {
    const { x, w, y, bottom, s, e, ref, T, p } = o;
    const X = t => x + Math.max(0, Math.min(1, (t - s) / (e - s))) * w;
    const months = [];
    for (const d = new Date(s); d.getTime() <= e; d.setMonth(d.getMonth() + 1, 1)) months.push(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
    const next = m => { const d = new Date(m); return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); };
    const qs = {};
    months.forEach(m => { const d = new Date(m), k = `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`; qs[k] = qs[k] || [Math.max(m, s), 0]; qs[k][1] = Math.min(next(m), e); });
    Object.keys(qs).forEach(k => {
      const x0 = X(qs[k][0]) + 0.02, x1 = X(qs[k][1]) - 0.02;
      els.push({ t: "rect", x: x0, y, w: x1 - x0, h: 0.26, fill: this.BAND, r: 0.13 });
      if (x1 - x0 > 0.55) els.push(T(x0, y, x1 - x0, 0.26, [p(k, 8.5, { bold: true, color: "475569", align: "ctr" })], { anchor: "ctr" }));
    });
    els.push({ t: "poly", x, y: y + 0.56, w, h: 0.001, pts: [[0, 0], [1, 0]], color: this.GRID, width: 0.75 });
    months.forEach(m => {
      const d = new Date(m), x0 = X(Math.max(m, s)), x1 = X(Math.min(next(m), e));
      if (x1 - x0 > 0.3) els.push(T(x0, y + 0.3, x1 - x0, 0.24, [p(`${d.getMonth() + 1}월`, 9, { bold: true, color: this.SUB, align: "ctr" })], { anchor: "ctr" }));
      if (m > s) els.push({ t: "poly", x: x0, y: y + 0.3, w: 0.001, h: bottom - y - 0.3, pts: [[0, 0], [0, 1]], color: this.GRID, width: 0.75 });
    });
    return X;
  },
  _now(els, X, o) {
    const { y, bottom, s, e, ref, T, p } = o, r = this._d(ref);
    if (!(r >= s && r <= e)) return;
    const xr = X(r);
    els.push({ t: "poly", x: xr, y, w: 0.001, h: bottom - y, pts: [[0, 0], [0, 1]], color: this.NOW, width: 1.5 });
    els.push({ t: "rect", shape: "ellipse", x: xr - 0.05, y: y - 0.05, w: 0.1, h: 0.1, fill: this.NOW });
    els.push({ t: "rect", x: xr - 0.52, y: bottom + 0.03, w: 1.04, h: 0.24, fill: this.NOW, r: 0.12 });
    els.push(T(xr - 0.52, bottom + 0.03, 1.04, 0.24, [p(`기준일 ${this._md(ref)}`, 8, { bold: true, color: "FFFFFF", align: "ctr" })], { anchor: "ctr" }));
  },

  // 알약 막대: 완료 = 진한 색 · 흰 글, 진행 중 = 중간 색 + 테두리, 예정 = 옅은 색
  _pill(els, o) {
    const { x, y, w, h, color, state, name, T, p, size } = o;
    const ww = Math.max(0.08, w), r = Math.min(h / 2, ww / 2);
    const st = { done: [color, null, "FFFFFF"], doing: [this.tint(color, 0.72), color, this.INK], plan: [this.tint(color, 0.88), null, this.shade(color)] }[state];
    els.push({ t: "rect", x, y, w: ww, h, fill: st[0], line: st[1], lw: 1.5, r });
    els.push(T(x - 0.03, y, ww + 0.06, h, [p(name, size, { bold: true, color: st[2], align: "ctr" })], { anchor: "ctr" }));
  },
  // 마일스톤 ◆ + 날짜 · 이름 — 글은 오른쪽에 (끝에 닿으면 왼쪽에), 겹치면 아랫줄
  _milestones(els, X, ms, o) {
    const { y, rowH, right, T, p } = o, used = [];
    ms.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(m => {
      const xm = X(this._d(m.date)), label = `${this._md(m.date)} ${m.scope && m.scope !== "ALL" ? `[${m.scope}] ` : ""}${m.name}`;
      const lw = Math.min(2.6, 0.25 + label.length * 0.085), left = xm + 0.12 + lw > right;
      const l = left ? xm - 0.12 - lw : xm - 0.1, r = left ? xm + 0.1 : xm + 0.12 + lw;
      let k = 0;
      while ((used[k] || []).some(([a, b]) => l < b && r > a)) k++;
      (used[k] = used[k] || []).push([l, r]);
      const yy = y + k * rowH + rowH / 2, sys = m.scope && m.scope !== "ALL";
      els.push({ t: "rect", shape: "diamond", x: xm - 0.09, y: yy - 0.09, w: 0.18, h: 0.18, fill: sys ? this.tint(this.MS, 0.35) : this.MS, line: "FFFFFF" });
      els.push(T(left ? xm - 0.12 - lw : xm + 0.1, yy - 0.12, lw, 0.24, [p(label, 8.5, { bold: true, color: this.INK, align: left ? "r" : "l" })], { anchor: "ctr" }));
    });
    return Math.max(1, used.length);
  },

  // 괄호 모양 한 묶음: 서브시스템 가로축 위 ∩ 단계(안에 ∩ 작업), 겹쳐 함께 가는 것은 축 아래 ∪, 단계 경계 점
  //  완료 = 진하게 칠함 · 진행 중 = 옅게 칠함 · 예정 = 선만 옅게 (계획 일정과 기준일로만 정함)
  _look(color, state) {
    return { done: { fill: this.tint(color, 0.72), line: color, ink: this.shade(color) }, doing: { fill: this.tint(color, 0.9), line: color, ink: this.shade(color) },
      plan: { fill: "FFFFFF", line: this.tint(color, 0.5), ink: this.tint(color, 0.2) } }[state];
  },
  _bracketBlock(els, b, o) {
    const { X, y, bh, ref, T, p, x, w } = o;
    const down = b.phases.some(ph => ph.lane > 0) || b.kids.some(k => k.lane > 0);
    const UP = down ? Math.min(bh * 0.62, 0.72) : bh - 0.1, ay = y + UP + 0.02, DN = bh - UP - 0.06;
    const kidOf = ph => b.kids.filter(k => String(k.t.id).startsWith(ph.t.id + "."));
    const lbl = (x0, x1, yy, h, text, size, color) => T(x0, yy, Math.max(0.1, x1 - x0), h, [p(text, size, { bold: true, color, align: "ctr" })], { anchor: "ctr" });
    b.phases.forEach(ph => {
      const x0 = X(ph.s) + 0.03, x1 = X(ph.e) - 0.03, L = this._look(ph.color, this._state(ph, ref)), up = ph.lane === 0;
      const H = up ? UP : DN;
      els.push({ t: "bracket", dir: up ? "up" : "down", x: x0, y: up ? ay - H : ay, w: x1 - x0, h: H, color: L.line, fill: L.fill, width: 2.25, r: 0.2 });
      els.push(lbl(x0, x1, up ? ay - H + 0.02 : ay + H - 0.26, 0.24, ph.t.name, 9.5, L.ink));
      kidOf(ph).forEach(k => {
        const kx0 = X(k.s) + 0.05, kx1 = X(k.e) - 0.05, K = this._look(ph.color, this._state(k, ref));
        const kUp = up && k.lane === 0, kh = kUp ? UP - 0.28 : up ? DN - 0.04 : Math.max(0.2, DN - 0.3);
        els.push({ t: "bracket", dir: kUp ? "up" : "down", x: kx0, y: kUp ? ay - kh : ay, w: kx1 - kx0, h: kh, color: K.line, fill: "FFFFFF", width: 1.25, r: 0.14 });
        els.push(lbl(kx0 - 0.04, kx1 + 0.04, kUp ? ay - kh + 0.03 : ay + 0.03, Math.max(0.2, kh - 0.06), k.t.name, 7.5, this.INK));
      });
    });
    // 축 · 끝점 · 단계 경계 점
    els.push({ t: "poly", x, y: ay, w, h: 0.001, pts: [[0, 0], [1, 0]], color: "334155", width: 2.25 });
    [x, x + w].forEach(cx => els.push({ t: "rect", shape: "ellipse", x: cx - 0.07, y: ay - 0.07, w: 0.14, h: 0.14, fill: "334155" }));
    const dots = [];   // 단계 시작 점 + 마지막 끝 점 (붙어 있는 경계는 한 점)
    b.phases.forEach(ph => dots.push([X(ph.s), ph.color]));
    const last = b.phases.reduce((a, q) => q.e > a.e ? q : a, b.phases[0]);
    dots.push([X(last.e), last.color]);
    dots.filter((d, i) => !dots.slice(0, i).some(q => Math.abs(q[0] - d[0]) < 0.12))
      .forEach(([cx, c]) => els.push({ t: "rect", shape: "ellipse", x: cx - 0.06, y: ay - 0.06, w: 0.12, h: 0.12, fill: c, line: "FFFFFF" }));
  },

  // 오른쪽 칸: 상태 칩 + 지금 단계(기준일 기준) + 다음 단계 시작
  _side(els, b, o) {
    const { x, y, w, h, ref, T, p } = o, r = this._d(ref);
    const ph = b.phases.slice().sort((a, c) => a.s - c.s);
    const now = ph.filter(q => q.s <= r && q.e >= r), next = ph.find(q => q.s > r);
    const cut = (v, n) => { v = String(v || ""); return v.length > n ? v.slice(0, n - 1) + "…" : v; };
    const cur = now.length ? cut(now[0].t.name, 9) + (now.length > 1 ? ` 외 ${now.length - 1}` : "") : next ? "착수 전" : "완료";
    const st = this.status(b.root.pProg, b.root.aProg), col = (now[0] || next || ph[ph.length - 1]).color;
    els.push({ t: "rect", x, y: y + 0.03, w, h: h - 0.06, fill: "FFFFFF", line: this.LINE, r: 0.08 });
    els.push({ t: "rect", x: x + 0.08, y: y + h / 2 - 0.11, w: 0.5, h: 0.22, fill: this.tint(st.color, 0.86), r: 0.11 });
    els.push(T(x + 0.08, y + h / 2 - 0.11, 0.5, 0.22, [p(st.label, 8, { bold: true, color: st.color, align: "ctr" })], { anchor: "ctr" }));
    els.push(T(x + 0.62, y + 0.03, w - 0.66, h - 0.06, [p(cur, 8.5, { bold: true, color: this.shade(col) }),
      p(next ? `→ ${this._md(next.t.pStart)} ${cut(next.t.name, 8)}` : "→ -", 7.5, { color: this.SUB })], { anchor: "ctr" }));
  },
  // 상태 (계획 대비 달성률 — 종합보고서의 다른 장표와 같은 기준)
  STATUS: [[90, "정상", "15803D"], [70, "주의", "B45309"], [0, "지연", "B91C1C"]],
  status(plan, actual) {
    const r = Metrics.achv(plan, actual, 0);
    const s = this.STATUS.find(([min]) => r >= min);
    return { label: s[1], color: s[2] };
  },

  // 로드맵 한 장: systems = 서브시스템 순서, tasksOf(이름) = 그 서브시스템 WBS (레벨 1 · 2 · 3), milestones = [{scope,name,date}]
  slideEls(o) {
    const { systems, tasksOf, start, end, ref, milestones, T, p, box } = o;
    const els = [], s = this._d(start), e = this._d(end);
    const LW = Math.min(1.5, box.w * 0.13), KW = o.side ? 1.75 : 0, x = box.x + LW, w = box.w - LW - KW, bottom = box.y + box.h;
    const X = this._scale(els, { x, w, y: box.y, bottom, s, e, ref, T, p });
    const inRange = m => this._d(m.date) >= s && this._d(m.date) <= e;
    const all = (milestones || []).filter(inRange);   // 서브시스템 마일스톤은 [이름] 을 붙여 같은 줄에
    if (KW) els.push(T(x + w + 0.12, box.y + 0.29, KW - 0.12, 0.26, [p("현재 단계 · 다음 일정", 8.5, { bold: true, color: this.SUB, align: "ctr" })], { anchor: "ctr" }));
    // 마일스톤 줄
    let y = box.y + 0.62;
    if (all.length) {   // 줄 수는 그려 본 뒤에 정하고 바탕을 맨 뒤에 깔아 넣음
      const at = els.length, msH = 0.22, rows = this._milestones(els, X, all, { y: y + 0.03, rowH: msH, right: x + w, T, p });
      els.splice(at, 0, { t: "rect", x: box.x, y, w: box.w, h: msH * rows + 0.06, fill: "FFFBEB", r: 0.08 },
        T(box.x + 0.1, y, LW - 0.2, msH * rows + 0.06, [p("주요 마일스톤", 10, { bold: true, color: this.MS })], { anchor: "ctr" }));
      y += msH * rows + 0.14;
    }
    // 서브시스템 묶음: 단계 줄(1.2) + 작업 줄 수 → 높이를 나눠 장표를 채움
    const blocks = systems.map(sys => {
      const tasks = tasksOf(sys), phases = this._items(tasks, 2);
      const pl = phases.length ? this._lanes(phases) : 1;
      const kids = (o.depth || (systems.length > 4 ? 2 : 3)) < 3 ? [] : this._items(tasks, 3).map(k => { const ph = phases.find(q => String(k.t.id).startsWith(q.t.id + ".")); return Object.assign(k, { color: ph ? ph.color : k.color }); });
      const kl = kids.length ? this._lanes(kids) : 0;
      const down = phases.some(q => q.lane > 0) || kids.some(k => k.lane > 0);
      return { sys, root: tasks.find(t => +t.level === 1) || {}, phases, pl, kids, kl, units: o.style === "bracket" ? (down ? 4.3 : 2.25) : pl * 1.2 + kl };
    }).filter(b => b.phases.length);
    const GAP = 0.08, unit = (bottom - y - GAP * blocks.length) / Math.max(1, blocks.reduce((a, b) => a + b.units, 0));
    blocks.forEach((b, i) => {
      const bh = b.units * unit;
      if (i % 2 === 0) els.push({ t: "rect", x: box.x, y: y - GAP / 2, w: box.w, h: bh + GAP, fill: "F8FAFC" });
      els.push({ t: "rect", x: box.x, y: y + 0.04, w: 0.06, h: bh - 0.08, fill: b.phases[0].color, r: 0.03 });
      els.push(T(box.x + 0.12, y, LW - 0.15, bh, [p(b.sys, 12, { bold: true, color: this.INK }), p(b.root.name || "", 7.5, { color: this.SUB })], { anchor: "ctr" }));
      if (KW) this._side(els, b, { x: x + w + 0.12, y, w: KW - 0.12, h: bh, ref, T, p });
      if (o.style === "bracket") { this._bracketBlock(els, b, { X, y, bh, ref, T, p, x, w }); y += bh + GAP; return; }
      const ph = unit * 1.2, kh = unit;
      b.phases.forEach(it => this._pill(els, { x: X(it.s) + 0.025, y: y + it.lane * ph + 0.04, w: X(it.e) - X(it.s) - 0.05, h: ph - 0.08, color: it.color, state: this._state(it, ref), name: it.t.name, size: 9.5, T, p }));
      const ky = y + b.pl * ph;
      b.kids.forEach(k => this._pill(els, { x: X(k.s) + 0.04, y: ky + k.lane * kh + 0.035, w: X(k.e) - X(k.s) - 0.08, h: kh - 0.07, color: k.color, state: this._state(k, ref), name: k.t.name, size: 7, T, p }));
      y += bh + GAP;
    });
    this._now(els, X, { y: box.y + 0.56, bottom, s, e, ref, T, p });
    return els;
  }
};
window.RoadmapChart = RoadmapChart;
