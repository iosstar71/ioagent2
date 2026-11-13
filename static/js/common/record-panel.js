// =============================================================================
// 목록 오른쪽 상세 패널 (요구사항 · VOC · 산출물 — WBS 상세 패널과 같은 모양 · 같은 조작)
// -----------------------------------------------------------------------------
//  - 행 끝 [▯] 버튼이나 행의 빈 곳을 누르면 열림, Esc 로 닫힘, Ctrl+Enter = 입력 중인 칸 저장
//  - 고친 값은 표와 같은 길(UiH.set)로 바로 반영 → 표 · 대시보드 · 저장이 함께 갱신
//  - 새 목록을 붙이려면 RecordPanel.SCHEMAS 에 정의 하나만 추가하고,
//    그 목록의 표 그리기 끝에서 RecordPanel.decorate("<종류>") 를 부르면 됨
// =============================================================================
var RecordPanel = {
  SCHEMAS: {
    req: {
      data: "reqMasterData", tab: "tab-req", tbody: "reqMasterTableBody", label: "요구사항",
      after: ["renderReqMasterTable", "renderDashboard", "renderPhaseMatrix", "persistChanges"],
      title: r => r.name, fields: [
        { k: "id", l: "REQ ID" }, { k: "system", l: "서브시스템", type: "system" },
        { k: "name", l: "요구사항명", type: "textarea", wide: true },
        { k: "type", l: "유형", opts: ["기능", "비기능", "화면", "인터페이스", "연계", "보안", "관리"] },
        { k: "priority", l: "우선순위", opts: ["긴급", "상", "중", "하"] },
        { k: "accept", l: "수용 여부", opts: ["수용", "불가", "검토중"] },
        { k: "status", l: "상태", opts: ["대기", "진행", "완료", "보류", "삭제"] }],
      extra: r => {
        const tasks = (wbsData || []).filter(t => t.reqId && t.reqId === r.id && t.isLeaf);
        const avg = tasks.length ? Math.round(tasks.reduce((a, t) => a + (parseFloat(t.aProg) || 0), 0) / tasks.length) : 0;
        return `<div class="rec-section"><div class="rec-section-title">🔗 연결된 Task <b>${tasks.length}</b> · 평균 실적 <b>${avg}%</b></div>`
          + (tasks.length ? `<ul class="rec-list">${tasks.slice(0, 12).map(t => `<li><code>${escapeHtml(t.id)}</code> ${escapeHtml(t.name || "")} <b>${parseFloat(t.aProg) || 0}%</b></li>`).join("")}</ul>` : `<div class="rec-empty">연결된 Task 가 없습니다.</div>`) + `</div>`;
      }
    },
    voc: {
      data: "vocData", tab: "tab-voc", tbody: "vocTableBody", label: "VOC",
      after: ["renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges"],
      title: r => r.title, fields: [
        { k: "id", l: "ID", ro: true }, { k: "vocType", l: "구분", opts: ["VOC", "버그", "이슈"] },
        { k: "system", l: "서브시스템", type: "system" },
        { k: "title", l: "제목 · 내용", type: "textarea", wide: true },
        { k: "requester", l: "요청자" }, { k: "priority", l: "우선순위", opts: ["긴급", "상", "중", "하"] },
        { k: "reqDate", l: "요청일", type: "date" }, { k: "targetDate", l: "목표일", type: "date" },
        { k: "status", l: "상태", opts: ["대기", "진행", "완료", "보류", "제외", "삭제"] },
        { k: "action", l: "조치 내용", type: "textarea", wide: true }]
    },
    deliv: {
      data: "deliverablesData", tab: "tab-deliverables", tbody: "deliverablesTableBody", label: "산출물",
      after: ["renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges"],
      title: r => r.name, noId: true, fields: [
        { k: "name", l: "산출물명", type: "textarea", wide: true }, { k: "system", l: "서브시스템", type: "system" },
        { k: "phase", l: "Phase", type: "distinct" }, { k: "round", l: "차수", type: "distinct" },
        { k: "manager", l: "담당자" }, { k: "status", l: "상태", opts: ["작성전", "작성중", "검토요청", "보완완료"] },
        { k: "pDate", l: "계획일", type: "date" }, { k: "aDate", l: "제출일", type: "date" },
        { k: "remarks", l: "비고", type: "textarea", wide: true }]
    }
  },
  _kind: null, _ref: null,

  arr(kind) { return UiH._array(this.SCHEMAS[kind].data); },
  idx() { const a = this._kind ? this.arr(this._kind) : null; return a && this._ref ? a.indexOf(this._ref) : -1; },
  isOpen() { const p = document.getElementById("recPanel"); return !!(p && !p.hidden); },
  _panel() {
    let p = document.getElementById("recPanel");
    if (p) return p;
    p = document.createElement("aside");
    p.id = "recPanel"; p.className = "neo-detail rec-panel"; p.hidden = true;
    document.body.appendChild(p);
    return p;
  },

  open(kind, idx) {
    const s = this.SCHEMAS[kind];
    const row = s && this.arr(kind)[idx];
    if (!row) return;
    if (typeof NeoDetail !== "undefined" && NeoDetail.isOpen()) NeoDetail.close();
    this._kind = kind; this._ref = row;
    this.render();
  },
  close() {
    const p = document.getElementById("recPanel");
    if (p) p.hidden = true;
    document.body.classList.remove("rec-panel-open");
    const k = this._kind;
    this._kind = null; this._ref = null;
    if (k) this.mark(k);
  },
  // 패널에서 고친 값: 표와 같은 길로 반영 (자료가 새 객체로 바뀌어도 같은 행을 따라감)
  set(field, value) {
    const i = this.idx();
    if (i < 0) return this.close();
    const s = this.SCHEMAS[this._kind];
    UiH.set(s.data, i, field, value, ...s.after);
    this.render();
  },
  // Ctrl+Enter: 입력 중인 칸을 바로 반영
  commit() {
    const act = document.activeElement;
    if (act && this._panel().contains(act) && (act.tagName === "INPUT" || act.tagName === "TEXTAREA" || act.tagName === "SELECT")) {
      act.dispatchEvent(new Event("change", { bubbles: true }));
      if (typeof showToast === "function") showToast("💾 반영했습니다.");
    }
  },

  _input(s, f, row) {
    const v = row[f.k] === undefined || row[f.k] === null ? "" : String(row[f.k]);
    const ch = `data-change="RecordPanel.set" data-change-args="${UiEvents.args(f.k, "$value")}"`;
    if (f.type === "textarea") return `<textarea rows="3" ${ch}>${escapeHtml(v)}</textarea>`;
    let opts = f.opts;
    if (f.type === "system") opts = (subsystemsMeta || []).map(m => m.name);
    if (f.type === "distinct") opts = [...new Set(this.arr(this._kind).map(r => r[f.k]).filter(Boolean))];
    if (opts) {
      const list = opts.indexOf(v) === -1 && v ? [v].concat(opts) : opts;
      return `<select ${ch}>${list.map(o => `<option value="${escapeAttr(o)}"${o === v ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
    }
    return `<input type="${f.type === "date" ? "date" : "text"}" value="${escapeAttr(v)}"${f.ro ? " readonly" : ""} ${ch}>`;
  },
  render() {
    const p = this._panel();
    const s = this.SCHEMAS[this._kind];
    const row = this._ref;
    if (!s || !row || this.idx() < 0) return this.close();
    const act = document.activeElement;
    const focusKey = act && p.contains(act) ? act.getAttribute("data-change-args") : null;
    p.innerHTML = `
      <div class="neo-detail-head">
        <div class="neo-detail-title"><code>${escapeHtml(s.noId || !row.id ? s.label : row.id)}</code> <b>${escapeHtml(String(s.title(row) || "").slice(0, 40))}</b>
          ${row.status ? `<span class="status-tag rec-status">${escapeHtml(row.status)}</span>` : ""}</div>
        <div class="neo-detail-nav"><button type="button" class="btn btn-xs" data-btn="cancel" data-click="RecordPanel.close" title="닫기 (Esc)">✕</button></div>
      </div>
      <div class="neo-detail-body">
        <div class="neo-grid2">${s.fields.map(f => `<label class="neo-field${f.wide ? " neo-field-wide" : ""}"><span>${f.l}</span>${this._input(s, f, row)}</label>`).join("")}</div>
        ${s.extra ? s.extra(row) : ""}
        <div class="rec-hint">Esc 닫기 · Ctrl+Enter 입력 중인 칸 반영</div>
      </div>`;
    p.hidden = false;
    document.body.classList.add("rec-panel-open");
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(p);
    if (focusKey) { const el = p.querySelector(`[data-change-args='${focusKey}']`); if (el) el.focus(); }
    this.mark(this._kind);
  },

  // 표 그리기 끝에서 부름: 행 끝 [▯] 버튼과 열린 행 표시
  decorate(kind) {
    const s = this.SCHEMAS[kind];
    const tb = s && document.getElementById(s.tbody);
    if (!tb) return;
    const arr = this.arr(kind);
    tb.querySelectorAll(":scope > tr").forEach(tr => {
      const i = parseInt(tr.getAttribute("data-rec-idx"), 10);
      if (isNaN(i) || tr.querySelector(".rec-open-btn")) return;
      const td = tr.lastElementChild;
      if (!td) return;
      td.insertAdjacentHTML("afterbegin", `<button type="button" class="btn-xs rec-open-btn wbs-open-btn" title="상세 열기 (오른쪽 패널) — 행의 빈 곳을 눌러도 열림" data-click="RecordPanel.open" data-click-args="${UiEvents.args(kind, i)}"><svg class="iostar-ico ico-solo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg></button>`);
      void arr;
    });
    this.mark(kind);
  },
  mark(kind) {
    const s = this.SCHEMAS[kind];
    const tb = s && document.getElementById(s.tbody);
    if (!tb) return;
    const i = this._kind === kind ? this.idx() : -1;
    tb.querySelectorAll(":scope > tr").forEach(tr => tr.classList.toggle("neo-sel", i >= 0 && parseInt(tr.getAttribute("data-rec-idx"), 10) === i));
  }
};
window.RecordPanel = RecordPanel;

// 행의 빈 곳(입력칸 · 버튼 밖)을 누르면 상세 패널
document.addEventListener("click", e => {
  const td = e.target && e.target.closest ? e.target.closest("td") : null;
  if (!td || e.target.closest("input, select, textarea, button, a, label, [data-click]")) return;
  const tr = td.parentElement, tb = tr && tr.parentElement;
  const kind = tb && Object.keys(RecordPanel.SCHEMAS).find(k => RecordPanel.SCHEMAS[k].tbody === tb.id);
  const i = tr && parseInt(tr.getAttribute("data-rec-idx"), 10);
  if (kind && !isNaN(i)) RecordPanel.open(kind, i);
});
// Esc 닫기 · Ctrl+Enter 반영
document.addEventListener("keydown", e => {
  if (!RecordPanel.isOpen()) return;
  if (e.key === "Escape") { const pal = document.getElementById("gPalette"); if (pal && !pal.hidden) return; RecordPanel.close(); }
  else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); RecordPanel.commit(); }
});
// 그 목록 화면을 떠나면 닫기
(function watchPanes() {
  const start = () => Object.keys(RecordPanel.SCHEMAS).forEach(k => {
    const pane = document.getElementById(RecordPanel.SCHEMAS[k].tab);
    if (pane) new MutationObserver(() => { if (RecordPanel._kind === k && !pane.classList.contains("active")) RecordPanel.close(); })
      .observe(pane, { attributes: true, attributeFilter: ["class"] });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
