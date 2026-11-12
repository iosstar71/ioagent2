// =============================================================================
// WBS 가중치 (WbsWeight)
// -----------------------------------------------------------------------------
//  규칙
//   - 서브시스템마다 100 기준: 그 서브시스템의 L1 가중치 합 = 100
//   - 상위 Task 가중치 = 바로 아래 하위 Task 가중치의 합 (하위는 상위 점수를 나눠 가짐)
//   - 소수점 1자리까지 (예: 33.3 / 33.3 / 33.4)
//   - 프로젝트 전체 계획 · 실적 = 서브시스템별 진척률 × 기준정보의 서브시스템 가중치 (WBSEngine.weightedProgress)
//  동작
//   - 상위 가중치를 바꾸면 하위 전체를 같은 비율로 자동 조정 (하위가 모두 0 이면 계획 기간 비율로)
//   - 하위 합이 상위와 다르면 그 하위 묶음의 가중치 칸을 모두 경고색으로 표시 (자료에서 매번 계산하므로
//     저장 · 다시 조회해도 고칠 때까지 계속 표시). 저장할 때 경고 알림 후 저장
//   - [⚖️ 가중치 오류 보정]: 경고가 난 묶음만 하위 가중치를 계획 기간(일수) 비율로 다시 나눔
//     (그 아래 단계는 같은 비율로 따라 조정)
// =============================================================================
var WbsWeight = {
  ROOT_TOTAL: 100,
  EPS: 0.05,

  r1(v) { const n = Math.round((parseFloat(v) || 0) * 10) / 10; return Object.is(n, -0) ? 0 : n; },
  wOf(t) { const v = parseFloat(t && t.weight); return isNaN(v) ? 0 : v; },
  _sys(t) { return String((t && t.system) || "").trim(); },

  // 바로 아래 하위 행 번호 (표 순서 기준: 같은 서브시스템, 레벨이 한 단계 깊은 행)
  childIdx(data, i) {
    const p = data[i], out = [];
    if (!p) return out;
    const lv = p.level || 1, sys = this._sys(p);
    for (let j = i + 1; j < data.length; j++) {
      const t = data[j];
      if (this._sys(t) !== sys || (t.level || 1) <= lv) break;
      if ((t.level || 1) === lv + 1) out.push(j);
    }
    return out;
  },

  // 검사 묶음: 서브시스템별 L1 묶음(목표 100) + 하위가 있는 행마다 바로 아래 묶음(목표 = 그 행 가중치)
  groups(data) {
    const out = [];
    const roots = new Map();
    data.forEach((t, i) => {
      if ((t.level || 1) === 1) {
        const s = this._sys(t);
        if (!roots.has(s)) roots.set(s, []);
        roots.get(s).push(i);
      }
    });
    roots.forEach((idxs, sys) => out.push({ parent: -1, sys, level: 1, kids: idxs, target: this.ROOT_TOTAL }));
    data.forEach((t, i) => {
      const kids = this.childIdx(data, i);
      if (kids.length) out.push({ parent: i, sys: this._sys(t), level: (t.level || 1) + 1, kids, target: this.wOf(t) });
    });
    return out;
  },
  _sum(data, idxs) { return this.r1(idxs.reduce((a, j) => a + this.wOf(data[j]), 0)); },
  _bad(data, g) { return Math.abs(this._sum(data, g.kids) - this.r1(g.target)) > this.EPS; },

  // 경고 목록: { rows: Set(행 객체), groups: [{ parent, kids, target, sum }] }
  check(data) {
    data = data || wbsData || [];
    const rows = new Set(), bad = [];
    this.groups(data).forEach(g => {
      if (!this._bad(data, g)) return;
      g.kids.forEach(j => rows.add(data[j]));
      bad.push(Object.assign({}, g, { sum: this._sum(data, g.kids) }));
    });
    return { rows, groups: bad };
  },
  // 표에 쓰는 행별 경고 문구 (Map 행 → 문구)
  warnMap(data) {
    data = data || wbsData || [];
    const m = new Map();
    this.check(data).groups.forEach(g => {
      const p = g.parent >= 0 ? data[g.parent] : null;
      const msg = p ? `⚠️ 가중치 오류: [${p.id} ${p.name || ""}] 하위 합 ${g.sum} ≠ 상위 ${this.r1(g.target)}`
                    : `⚠️ 가중치 오류: [${g.sys}] L1 합 ${g.sum} ≠ ${this.ROOT_TOTAL}`;
      g.kids.forEach(j => m.set(data[j], msg));
    });
    return m;
  },
  count(data) { return this.check(data).groups.length; },

  // 계획 기간(일수) 비율로 target 을 나눔 (소수점 1자리, 끝수는 가장 큰 행에)
  _days(t) {
    if (!t.pStart || !t.pEnd) return 0;
    const d = (new Date(t.pEnd) - new Date(t.pStart)) / 86400000 + 1;
    return isNaN(d) ? 0 : Math.max(0, d);
  },
  _split(target, basis) {
    const n = basis.length;
    if (!n) return [];
    let tot = basis.reduce((a, b) => a + b, 0);
    if (tot <= 0) { basis = basis.map(() => 1); tot = n; }
    const vals = basis.map(b => this.r1(target * b / tot));
    const diff = this.r1(this.r1(target) - this.r1(vals.reduce((a, b) => a + b, 0)));
    if (diff) {
      let k = 0;
      vals.forEach((v, i) => { if (v > vals[k]) k = i; });
      vals[k] = this.r1(vals[k] + diff);
    }
    return vals;
  },
  byDate(data, idxs, target) {
    const vals = this._split(target, idxs.map(j => this._days(data[j])));
    idxs.forEach((j, i) => { data[j].weight = vals[i]; });
  },
  // 하위 전체를 상위 가중치에 맞춰 같은 비율로 (하위가 모두 0 이면 기간 비율로) — 아래 단계까지 이어서
  cascade(data, i) {
    const kids = this.childIdx(data, i);
    if (!kids.length) return 0;
    const target = this.wOf(data[i]);
    const cur = kids.map(j => this.wOf(data[j]));
    const vals = cur.some(v => v > 0) ? this._split(target, cur) : this._split(target, kids.map(j => this._days(data[j])));
    let n = 0;
    kids.forEach((j, k) => { if (this.wOf(data[j]) !== vals[k]) n++; data[j].weight = vals[k]; n += this.cascade(data, j); });
    return n;
  },

  // 표 · 상세 패널에서 가중치 입력
  set(idx, value) {
    const row = wbsData[idx];
    if (!row) return;
    const v = this.r1(Math.max(0, parseFloat(value) || 0));
    row.weight = v;
    const n = this.childIdx(wbsData, idx).length ? this.cascade(wbsData, idx) : 0;
    rebuildAll();
    if (n) showToast(`⚖️ [${row.id}] 가중치 ${v} — 하위 Task ${n}건을 같은 비율로 자동 조정했습니다.`);
  },
  // 경고가 있으면 알림 (입력 · 저장 때)
  notify(prefix) {
    const c = this.count();
    if (c) showToast(`${prefix || ""}⚠️ 가중치 오류 ${c}건: 하위 가중치 합이 상위와 다릅니다 (경고색 칸). 직접 고치거나 [⚖️ 가중치 오류 보정]을 누르세요.`);
    return c;
  },

  // 새 행 기본 가중치: 첫 하위면 상위 가중치 전부, 아니면 형제 평균 (합이 달라져 경고 → 사용자가 조정)
  newWeight(data, parentIdx, siblingIdxs) {
    if (!siblingIdxs || !siblingIdxs.length) return parentIdx >= 0 ? this.wOf(data[parentIdx]) : this.ROOT_TOTAL;
    return this.r1(siblingIdxs.reduce((a, j) => a + this.wOf(data[j]), 0) / siblingIdxs.length);
  },
  parentIdx(data, i) {
    const lv = (data[i] && data[i].level) || 1, sys = this._sys(data[i]);
    for (let j = i - 1; j >= 0; j--) {
      if (this._sys(data[j]) !== sys) return -1;
      if ((data[j].level || 1) < lv) return j;
    }
    return -1;
  },

  // [⚖️ 가중치 오류 보정] 경고 묶음만: 위 단계부터 차례로 — 경고 묶음은 기간 비율로 다시 나누고,
  // 그 때문에 바뀐 행의 아래 단계는 같은 비율로 따라 조정 (원래 맞던 아래 묶음의 비율은 유지)
  fix(sysFilter) {
    const data = wbsData;
    const inScope = t => !sysFilter || sysFilter === "ALL" || this._sys(t) === sysFilter;
    let fixed = 0;
    const changed = new Set();
    for (let lv = 1; lv <= 5; lv++) {
      this.groups(data).filter(g => g.level === lv && g.kids.length && inScope(data[g.kids[0]])).forEach(g => {
        const parentChanged = g.parent >= 0 && changed.has(data[g.parent]);
        if (!this._bad(data, g)) return;
        const before = g.kids.map(j => this.wOf(data[j]));
        if (parentChanged && before.some(v => v > 0) && !this._wasBad(g)) {
          const vals = this._split(g.target, before);
          g.kids.forEach((j, k) => { data[j].weight = vals[k]; });
        } else {
          this.byDate(data, g.kids, g.target);
          fixed++;
        }
        g.kids.forEach((j, k) => { if (this.wOf(data[j]) !== before[k]) changed.add(data[j]); });
      });
    }
    this._badBefore = null;
    return fixed;
  },
  _wasBad(g) { return this._badBefore ? this._badBefore.has(g.parent) : false; },
  runFix() {
    const sel = document.getElementById("wbsSubsystemFilter");
    const sys = sel ? sel.value : "ALL";
    const before = this.check(wbsData).groups.filter(g => !sys || sys === "ALL" || g.sys === sys);
    if (!before.length) return showToast(`✅ ${sys === "ALL" ? "" : `[${sys}] `}가중치 오류가 없습니다.`);
    this._badBefore = new Set(before.map(g => g.parent));
    const n = this.fix(sys);
    rebuildAll();
    const left = this.check(wbsData).groups.filter(g => !sys || sys === "ALL" || g.sys === sys).length;
    showToast(`⚖️ 가중치 오류 ${n}건을 계획 기간 비율로 다시 나눴습니다 (소수점 1자리).${left ? ` 남은 오류 ${left}건` : " 오류 없음"}`);
  },

  // ---- S-커브용: 최하위 Task 비중 · 날짜 시점의 계획 · 실적 ----
  // tops: Map(행 → 전체 안 비중) → Map(최하위 행 → 비중), 가중치 비율로 아래로 나눔 (모두 0 이면 같은 비율)
  leafShares(tops) {
    const data = typeof wbsData !== "undefined" ? wbsData : [], out = new Map();
    const walk = (i, share) => {
      const kids = this.childIdx(data, i);
      if (!kids.length) { out.set(data[i], (out.get(data[i]) || 0) + share); return; }
      const ws = kids.map(j => this.wOf(data[j])), tot = ws.reduce((a, b) => a + b, 0);
      kids.forEach((j, k) => walk(j, share * (tot > 0 ? ws[k] / tot : 1 / kids.length)));
    };
    tops.forEach((share, row) => { const i = data.indexOf(row); if (i !== -1) walk(i, share); });
    return out;
  },
  _d(s) { return new Date(String(s).slice(0, 10) + "T00:00:00"); },
  // 날짜(iso) 시점 계획 진척률 (달력 일수)
  planAt(t, iso) {
    if (!t.pStart || !t.pEnd) return 0;
    if (iso < t.pStart) return 0;
    if (iso >= t.pEnd) return 100;
    const s = this._d(t.pStart), e = this._d(t.pEnd), x = this._d(iso);
    return Math.min(100, Math.max(0, (x - s) / Math.max(1, e - s) * 100));
  },
  // 날짜(iso) 시점 실적 진척률 — 실적 날짜로 되짚음: 실적완료일 이후 = 지금 실적, 실적시작 전 = 0,
  // 그 사이 = 실적시작일 ~ 실적완료일(없으면 기준일) 동안 지금 실적까지 고르게 올라간 것으로 봄
  actualAt(t, iso, rep) {
    const a = parseFloat(t.aProg) || 0;
    if (!rep || iso >= rep) return a;
    if (t.aEnd && t.aEnd <= iso) return a;
    if (!t.aStart || t.aStart > iso) return 0;
    const endIso = t.aEnd && t.aEnd < rep ? t.aEnd : rep;
    const s = this._d(t.aStart), e = this._d(endIso), x = this._d(iso);
    const tot = (e - s) / 86400000 + 1, el = (x - s) / 86400000 + 1;
    return tot > 0 ? Math.min(a, a * el / tot) : a;
  },

  // ---- 예전 자료 전환 (한 번) ----
  //  예전에는 가중치가 형제끼리의 비율이었고 L1 가중치 = 서브시스템 가중치였음
  //  → 서브시스템마다 L1 = 100 으로 두고 아래로 같은 비율로 나눔 (비율이 그대로라 진척률은 바뀌지 않음)
  //  PM · 관리자(모든 서브시스템을 저장할 수 있는 사람)가 열 때 한 번, projectConfig.weightModel 로 표시
  MODEL: "sys100",
  migrate(data) {
    const bySys = new Map();
    data.forEach((t, i) => { if ((t.level || 1) === 1) { const k = this._sys(t); if (!bySys.has(k)) bySys.set(k, []); bySys.get(k).push(i); } });
    let n = 0;
    bySys.forEach(idxs => {
      const vals = this._split(this.ROOT_TOTAL, idxs.map(j => this.wOf(data[j])));
      idxs.forEach((j, k) => { data[j].weight = vals[k]; n += 1 + this.cascade(data, j); });
    });
    return n;
  },
  migrateIfNeeded() {
    if (typeof projectConfig === "undefined" || !projectConfig || projectConfig.weightModel === this.MODEL) return false;
    if (typeof AuthManager !== "undefined" && !AuthManager.currentUser) return false;
    if (typeof Permission !== "undefined" && Permission.canEditAllSubsystems && !Permission.canEditAllSubsystems()) return false;
    const data = typeof wbsData !== "undefined" ? wbsData : [];
    const need = data.length > 0 && this.count(data) > 0;
    if (need) this.migrate(data);
    projectConfig.weightModel = this.MODEL;
    if (need) setTimeout(() => showToast("⚖️ WBS 가중치를 서브시스템 100 기준으로 바꿨습니다 (기존 비율 그대로라 진척률은 같음). 서브시스템 사이 비중은 [기준정보]의 서브시스템 가중치로 계산합니다."), 900);
    return true;
  },

  // 표 위 오류 건수 (가중치 칸을 접어도 보이도록) — 조회 범위 서브시스템만
  renderBadge(inScope) {
    const el = document.getElementById("wbsWeightErrChip");
    if (!el) return;
    const c = this.check(wbsData).groups.filter(g => !inScope || inScope(g.sys)).length;
    el.style.display = c ? "inline-flex" : "none";
    el.textContent = `⚠️ 가중치 ${c}`;
  }
};
window.WbsWeight = WbsWeight;
