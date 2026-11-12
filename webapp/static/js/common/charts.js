// =============================================================================
// [IOSTAR-PM v3.4.0] 공용 차트 — 불릿 차트 (서브시스템별 계획 대비 실적)
// -----------------------------------------------------------------------------
//  막대 = 실적, 검은 눈금 = 기준일 계획, 바탕 띠 = 계획 대비 달성 구간 (70% 미만 위험 · 70~90% 주의 · 90% 이상 정상)
//  막대 색: 달성률 90% 이상 정상(테마 색) · 70~89% 주의(주황) · 70% 미만 위험(빨강)
//  rows: [{ name, plan, actual, href? }]  — 화면(SVG) · 경영 보고 PPT(도형)에서 같은 규칙으로 그림
// =============================================================================
var BulletChart = {
  RISK: 0.7, WARN: 0.9,
  rate(r) { return r.plan > 0 ? Math.round(r.actual / r.plan * 100) : 100; },
  level(r) { const q = this.rate(r) / 100; return q >= this.WARN ? "ok" : q >= this.RISK ? "warn" : "bad"; },
  // 화면용 SVG (가로 폭에 맞춰 늘어남)
  svg(rows, opts = {}) {
    const W = Math.max(520, Math.round(opts.width || 1000)), labelW = 80, valueW = 150, rowH = opts.rowH || 30, top = 24;
    const barW = W - labelW - valueW;
    const H = top + rows.length * rowH + 6;
    const x = v => labelW + barW * Math.max(0, Math.min(100, v)) / 100;
    const col = { ok: "var(--chart-ok)", warn: "var(--chart-warn)", bad: "var(--chart-bad)" };
    let s = `<svg class="bullet-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="서브시스템별 계획 대비 실적">`;
    [0, 25, 50, 75, 100].forEach(v => { s += `<text x="${x(v)}" y="14" class="bl-axis" text-anchor="middle">${v}%</text>`; });
    rows.forEach((r, i) => {
      const y = top + i * rowH, h = rowH - 12, lv = this.level(r);
      s += `<g class="bl-row" ${r.href ? `data-sys="${String(r.name).replace(/"/g, "")}"` : ""}>`;
      s += `<text x="${labelW - 10}" y="${y + h / 2 + 5}" class="bl-name" text-anchor="end">${escapeHtml(r.name)}</text>`;
      s += `<rect x="${labelW}" y="${y}" width="${x(r.plan * this.RISK) - labelW}" height="${h}" class="bl-bad"/>`;
      s += `<rect x="${x(r.plan * this.RISK)}" y="${y}" width="${x(r.plan * this.WARN) - x(r.plan * this.RISK)}" height="${h}" class="bl-warn"/>`;
      s += `<rect x="${x(r.plan * this.WARN)}" y="${y}" width="${x(100) - x(r.plan * this.WARN)}" height="${h}" class="bl-ok"/>`;
      s += `<rect x="${labelW}" y="${y + h * 0.32}" width="${Math.max(0, x(r.actual) - labelW)}" height="${h * 0.36}" style="fill:${col[lv]}"/>`;
      s += `<line x1="${x(r.plan)}" y1="${y + 2}" x2="${x(r.plan)}" y2="${y + h - 2}" class="bl-mark"/>`;
      s += `<text x="${labelW + barW + 12}" y="${y + h / 2 + 5}" class="bl-val bl-${lv}">${r.actual}% / ${r.plan}% (${this.rate(r)}%)</text></g>`;
    });
    return s + "</svg>";
  },
  // 대시보드 · 브리핑 홈의 행 자료 (현재 자료)
  liveRows(filterSys) {
    const m = (typeof ReportExporter !== "undefined" && ReportExporter._collectMetrics) ? ReportExporter._collectMetrics() : null;
    return ((m && m.subsystemRows) || []).filter(r => !filterSys || filterSys === "ALL" || r[1] === filterSys)
      .map(r => ({ name: r[1], plan: parseFloat(r[6]) || 0, actual: parseFloat(r[7]) || 0, href: true }));
  },
  render(boxId, rows) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.innerHTML = rows.length ? this.svg(rows, { width: box.clientWidth || 1000 }) : `<div class="bl-empty">표시할 서브시스템이 없습니다.</div>`;
    box.querySelectorAll(".bl-row[data-sys]").forEach(g => {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => {
        const sys = g.getAttribute("data-sys");
        if (typeof GShell !== "undefined") GShell.go("tab-wbs");
        const sel = document.getElementById("wbsSubsystemFilter");
        if (sel) { sel.value = sys; if (typeof renderWbsTable === "function") renderWbsTable(); }
      });
    });
  }
};
window.BulletChart = BulletChart;

// 테마 차트 색 — CSS 의 --chart-* 값을 읽음 (canvas 처럼 CSS 변수를 못 쓰는 그림용)
var ChartTheme = {
  KEYS: ["grid", "axis", "label", "sub", "plan", "actual", "today", "rate-fill", "rate-line", "rate-text", "ok", "warn", "bad"],
  get() {
    const cs = getComputedStyle(document.body);
    const out = {};
    this.KEYS.forEach(k => { out[k.replace(/-(\w)/g, (m, c) => c.toUpperCase())] = (cs.getPropertyValue("--chart-" + k) || "").trim(); });
    return out;
  }
};
window.ChartTheme = ChartTheme;
