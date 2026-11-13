// =============================================================================
// [IOSTAR-PM Workgroup 0.1] 주차 표시 (WeekFmt) — 기준정보 > 기본정보 > 주차 표시 방식
// -----------------------------------------------------------------------------
//  projectConfig.weekNumbering = { basis, multiYear, format }
//   basis    : ANNUAL  = 연간 주차 (1월 1일이 들어 있는 주 = W1, 엑셀 WEEKNUM 과 같은 방식 — 날짜가 속한 해 기준)
//              PROJECT = 프로젝트 주차 (프로젝트 시작일이 들어 있는 주 = W1)
//   multiYear: PREFIX  = 2개 연도 이상이면 해마다 다시 W1, 앞에 연도 (27W1, 28W1 …)
//              CONTINUE= 해가 바뀌어도 이어서 (W52, W53, W54 …)
//   format   : 엑셀 사용자 지정 형식처럼 — yyyy · yy = 연도, ww = 두 자리 주차, w = 주차, "…" = 그대로 쓰는 글자
//              예) "W"w → W5 / "W"ww → W05 / yy"W"w → 27W5 / yyyy"-W"ww → 2027-W05 / w"주차" → 5주차
//  한 주의 시작 요일은 기존 설정(projectConfig.weekStartDay)을 그대로 씀
// =============================================================================
var WeekFmt = {
  DEFAULT: { basis: "ANNUAL", multiYear: "PREFIX", format: '"W"w' },
  PRESETS: [
    ['"W"w', "W5"], ['"W"ww', "W05"], ['yy"W"w', "27W5"], ['yyyy"-W"ww', "2027-W05"], ['w"주차"', "5주차"], ['yy"년 "w"주차"', "27년 5주차"]
  ],
  cfg() { return Object.assign({}, this.DEFAULT, (typeof projectConfig !== "undefined" && projectConfig.weekNumbering) || {}); },
  wsd() { const v = parseInt(typeof projectConfig !== "undefined" ? projectConfig.weekStartDay : 1, 10); return isNaN(v) ? 1 : v; },
  _d(s) { return new Date(String(s).slice(0, 10) + "T00:00:00"); },
  _ws(d) { const x = new Date(d); while (x.getDay() !== this.wsd()) x.setDate(x.getDate() - 1); return x; },
  _diffWeeks(a, b) { return Math.round((a - b) / (7 * 86400000)); },
  // 연간 주차 (엑셀 WEEKNUM 과 같음): 그 날짜가 속한 해의 1월 1일이 들어 있는 주 = W1 (해가 바뀌는 주는 12월 쪽 W53 · 1월 쪽 W1)
  _annual(d) {
    const y = d.getFullYear();
    return { year: y, week: this._diffWeeks(this._ws(d), this._ws(new Date(y, 0, 1))) + 1 };
  },
  span(c) {
    const s = (projectConfig.projectStartDate || ""), e = (projectConfig.projectEndDate || "");
    return !!s && !!e && s.slice(0, 4) !== e.slice(0, 4);
  },
  // 날짜 → { year, week }
  info(dateStr, c) {
    c = c || this.cfg();
    if (!dateStr) return null;
    const d = this._d(dateStr);
    const ws = this._ws(d);
    const start = projectConfig.projectStartDate ? this._ws(this._d(projectConfig.projectStartDate)) : ws;
    const firstAnnual = this._annual(projectConfig.projectStartDate ? this._d(projectConfig.projectStartDate) : d);
    const multi = this.span(c);
    if (c.basis === "PROJECT") {
      const idx = this._diffWeeks(ws, start) + 1;
      if (!multi || c.multiYear === "CONTINUE") return { year: firstAnnual.year, week: idx };
      const a = this._annual(d);
      return a.year === firstAnnual.year ? { year: a.year, week: idx } : a;
    }
    if (multi && c.multiYear === "CONTINUE") {
      const base = this._ws(new Date(firstAnnual.year, 0, 1));
      return { year: firstAnnual.year, week: this._diffWeeks(ws, base) + 1 };
    }
    return this._annual(d);
  },
  // 형식 문자열 → 글자
  render(fmt, v) {
    let out = "", i = 0;
    const s = String(fmt || '"W"w');
    while (i < s.length) {
      const ch = s[i];
      if (ch === '"') { const j = s.indexOf('"', i + 1); out += j < 0 ? s.slice(i + 1) : s.slice(i + 1, j); i = j < 0 ? s.length : j + 1; continue; }
      if (ch === "\\") { out += s[i + 1] || ""; i += 2; continue; }
      if (s.startsWith("yyyy", i)) { out += String(v.year); i += 4; continue; }
      if (s.startsWith("yy", i)) { out += String(v.year).slice(-2); i += 2; continue; }
      if (s.startsWith("ww", i)) { out += String(v.week).padStart(2, "0"); i += 2; continue; }
      if (ch === "w") { out += String(v.week); i += 1; continue; }
      out += ch; i += 1;
    }
    return out;
  },
  effectiveFormat(c) {
    c = c || this.cfg();
    let f = c.format || '"W"w';
    // 2개 연도 이상 + 연도 붙이기인데 형식에 연도가 없으면 앞에 yy 를 붙임 (27W1)
    if (this.span(c) && c.multiYear === "PREFIX" && !/y/.test(f.replace(/"[^"]*"/g, ""))) f = (/^w/.test(f) ? 'yy"년 "' : "yy") + f;
    return f;
  },
  label(dateStr, c) {
    c = c || this.cfg();
    const v = this.info(dateStr, c);
    return v ? this.render(this.effectiveFormat(c), v) : "";
  },

  // ---- 기준정보 화면 ----
  renderSettings() {
    const box = document.getElementById("weekFmtBox");
    if (!box) return;
    const c = this.cfg();
    const set = (name, v) => { const el = box.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
    set("wkBasis", c.basis); set("wkMulti", c.multiYear);
    const sel = document.getElementById("wkFormatPreset");
    const custom = !this.PRESETS.some(p => p[0] === c.format);
    sel.innerHTML = this.PRESETS.map(p => `<option value="${escapeAttr(p[0])}">${escapeHtml(p[1])}  —  ${escapeHtml(p[0])}</option>`).join("") + `<option value="__CUSTOM__">사용자 지정…</option>`;
    sel.value = custom ? "__CUSTOM__" : c.format;
    const inp = document.getElementById("wkFormatCustom");
    inp.value = c.format;
    inp.hidden = !custom;
    this.preview();
  },
  _form() {
    const box = document.getElementById("weekFmtBox");
    const val = name => (box.querySelector(`input[name="${name}"]:checked`) || {}).value;
    const sel = document.getElementById("wkFormatPreset");
    const inp = document.getElementById("wkFormatCustom");
    if (sel.value !== "__CUSTOM__") inp.value = sel.value;
    inp.hidden = sel.value !== "__CUSTOM__";
    return { basis: val("wkBasis") || "ANNUAL", multiYear: val("wkMulti") || "PREFIX", format: (inp.value || '"W"w').slice(0, 40) };
  },
  // 미리 보기: 시작일 · 해 바뀜 · 기준일 · 종료일
  preview() {
    const body = document.getElementById("wkPreviewBody");
    if (!body) return;
    const c = this._form();
    const s = projectConfig.projectStartDate, e = projectConfig.projectEndDate, r = projectConfig.reportDate;
    const rows = [["프로젝트 시작일", s], ["기준일", r]];
    if (s && e) for (let y = parseInt(s.slice(0, 4), 10) + 1; y <= parseInt(e.slice(0, 4), 10); y++) {
      const dec = `${y - 1}-12-28`, jan = `${y}-01-05`;
      if (dec >= s && dec <= e) rows.push([`${y - 1}년 마지막 주`, dec]);
      if (jan >= s && jan <= e) rows.push([`${y}년 첫 주`, jan]);
    }
    rows.push(["프로젝트 종료일", e]);
    body.innerHTML = rows.filter(x => x[1]).map(([k, d]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(d)} (${WBSEngine.getDayOfWeekText(d)})</td><td><b class="week-chip">${escapeHtml(this.label(d, c))}</b></td></tr>`).join("");
    const note = document.getElementById("wkSpanNote");
    if (note) note.textContent = this.span(c) ? `이 프로젝트는 ${s.slice(0, 4)}~${e.slice(0, 4)}년, 2개 연도 이상입니다.` : "이 프로젝트는 한 해 안에 있습니다 (연도 표시 방식은 2개 연도 이상일 때만 적용).";
  },
  save() {
    projectConfig.weekNumbering = this._form();
    if (typeof persistChanges === "function") persistChanges();
    if (typeof renderReportDateLabels === "function") renderReportDateLabels();
    if (typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.populateWeekDropdown) WeeklyReportManager.populateWeekDropdown();
    this.preview();
    showToast(`📅 주차 표시 방식을 저장했습니다. 기준일 ${projectConfig.reportDate} = ${this.label(projectConfig.reportDate)}`);
  }
};
window.WeekFmt = WeekFmt;
