// =============================================================================
// VOC · 결함 현황 (대시보드 · Phase 현황 · Summary 가 같이 씀) — 셈은 모두 Metrics
//  - stageTable : 단계 × 판정 표 (합계 행)
//  - defect     : 테스트 결함 현황 카드 (통합테스트 단계 접수가 있을 때만) + 소진 차트(SVG)
// =============================================================================
var VocBoard = {

  // 단계 × 판정 (행: 4단계 + 미지정(있을 때) + 합계)
  stageTable(list) {
    const st = Metrics.vocStats(list);
    const stages = Metrics.VOC_STAGES.concat(st.byStage[""] ? [""] : []);
    const cell = (row, j) => row && row[j] ? `<b>${row[j]}</b>` : `<span class="u-c-muted">0</span>`;
    const body = stages.map(s => {
      const r = st.byStage[s];
      return `<tr><td class="u-tl"><b>${escapeHtml(s || "미지정")}</b></td><td>${r ? `<b>${r.total}</b>` : "0"}</td>${Metrics.VOC_JUDGE.map(j => `<td>${cell(r, j)}</td>`).join("")}</tr>`;
    }).join("");
    const total = `<tr class="col-total"><td class="u-tl"><b>합계</b></td><td><b>${st.total}</b></td>${Metrics.VOC_JUDGE.map(j => `<td><b>${st.byJudge[j]}</b></td>`).join("")}</tr>`;
    return `<table class="matrix-table voc-stage-table"><thead><tr><th>단계</th><th>접수</th>${Metrics.VOC_JUDGE.map(j => `<th>${j === "미판정" ? "판정 대기" : j}</th>`).join("")}</tr></thead>
      <tbody>${body}${total}</tbody></table>`;
  },

  // 결함 소진 차트: 누적 발생 · 누적 해결 선 + 잔여 막대 (색은 테마 --chart-*)
  burnSvg(series) {
    if (!series || series.length < 2) return `<div class="u-c-muted u-fs-sm u-p-12">${I18N.t("추이를 그리려면 접수일이 2일 이상 필요합니다.")}</div>`;
    const W = 720, H = 200, L = 34, R = 10, T = 12, B = 26;
    const max = Math.max(1, ...series.map(s => s.opened));
    const x = i => L + (W - L - R) * i / (series.length - 1), y = v => T + (H - T - B) * (1 - v / max);
    const bw = Math.max(1, (W - L - R) / series.length * 0.6);
    const line = k => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join("");
    const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
    const step = Math.max(1, Math.ceil(series.length / 8));
    return `<svg class="burn-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeAttr(I18N.t("결함 소진 추이"))}">
      ${ticks.map(v => `<line class="bn-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="bn-axis" x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
      ${series.map((s, i) => s.remain ? `<rect class="bn-remain" x="${(x(i) - bw / 2).toFixed(1)}" y="${y(s.remain).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(s.remain)).toFixed(1)}"/>` : "").join("")}
      <path class="bn-open" d="${line("opened")}"/><path class="bn-closed" d="${line("closed")}"/>
      ${series.map((s, i) => i % step === 0 || i === series.length - 1 ? `<text class="bn-axis" x="${x(i)}" y="${H - 8}" text-anchor="middle">${s.date.slice(5)}</text>` : "").join("")}
    </svg>
    <div class="bn-legend"><span class="bn-lg-open"></span>${I18N.t("누적 발생")} <span class="bn-lg-closed"></span>${I18N.t("누적 해결")} <span class="bn-lg-remain"></span>${I18N.t("잔여")}</div>`;
  },

  defectHtml(list, refDate) {
    const d = Metrics.defectStats(list, refDate);
    const sev = Metrics.VOC_SEVERITY.concat([""]).filter(s => s || d.bySev[""]);
    const kpi = (label, val, cls) => `<div class="df-kpi${cls ? " " + cls : ""}"><span>${label}</span><b>${val}</b></div>`;
    return `<div class="df-kpis">
        ${kpi("결함", d.total)}${kpi("미결", d.open, d.open ? "df-warn" : "")}${kpi("치명 · 높음 미결", d.critOpen, d.critOpen ? "df-bad" : "")}
        ${kpi("해결률", d.rate + "%")}${kpi("판정 대기", d.undecided, d.undecided ? "df-warn" : "")}
      </div>
      <div class="df-body">
        <div class="df-chart">${this.burnSvg(d.series)}${d.noDate ? `<div class="u-fs-xs u-c-muted">${I18N.tf("해결일이 없는 완료 {n}건은 추이에서 뺐습니다.", { n: d.noDate })}</div>` : ""}</div>
        <table class="matrix-table df-sev"><thead><tr><th>심각도</th><th>전체</th><th>미결</th></tr></thead>
          <tbody>${sev.map(s => `<tr><td class="u-tl">${escapeHtml(s || "미지정")}</td><td>${d.bySev[s]}</td><td>${d.openBySev[s] ? `<b class="u-c-danger">${d.openBySev[s]}</b>` : 0}</td></tr>`).join("")}</tbody></table>
      </div>`;
  }
};
window.VocBoard = VocBoard;
