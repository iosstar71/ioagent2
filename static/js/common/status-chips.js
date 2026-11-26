// =============================================================================
// 상태 버튼(칩) 필터 — 버튼마다 건수, 누르면 그 상태만
//  - WbsStatusChips: WBS (전체 · 지연 · 진행중 · 대기 · 완료 · 선행 지연)
//  - StatusChips   : 요구사항 · VOC · 산출물 · 회의 · Action Item
// =============================================================================

// -----------------------------------------------------------------------------
// 4. WBS 상태 칩 필터
// -----------------------------------------------------------------------------
var WbsStatusChips = {
  LIST: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["진행중", "진행중", "chip-progress"], ["대기", "대기", "chip-ready"], ["완료", "완료", "chip-completed"], ["선행 지연", "⛓ 선행 지연", "chip-pred"]],
  set(v) {
    const sel = document.getElementById("wbsStatusFilter");
    if (!sel) return;
    sel.value = v;
    renderWbsTable();
  },
  // renderWbsTable 끝에서 호출: 분야·서브시스템 조회 범위의 최하위 Task 상태별 건수
  render() {
    const box = document.getElementById("neoStatusChips");
    if (!box) return;
    const val = id => { const el = document.getElementById(id); return el ? el.value : "ALL"; };
    const dF = val("wbsDomainFilter"), sF = val("wbsSubsystemFilter"), cur = val("wbsStatusFilter") || "ALL";
    const leaves = wbsData.filter(t => t.isLeaf && (dF === "ALL" || WBSEngine.getSubsystemDomain(t.system) === dF) && (sF === "ALL" || t.system === sF));
    const cnt = { ALL: leaves.length };
    leaves.forEach(t => { const l = DayUtil.status(t).label; cnt[l] = (cnt[l] || 0) + 1; });
    const pw = WBSEngine.predWarnings(wbsData, DayUtil.rep());
    cnt[WbsStatusView.PRED] = [...pw.keys()].filter(t => (dF === "ALL" || WBSEngine.getSubsystemDomain(t.system) === dF) && (sF === "ALL" || t.system === sF)).length;
    box.innerHTML = this.LIST.map(([v, label, cls]) =>
      `<button type="button" class="neo-chip ${cls}${cur === v ? " active" : ""}" data-click="WbsStatusChips.set" data-click-args="${UiEvents.args(v)}" aria-pressed="${cur === v ? "true" : "false"}">${label} <b>${cnt[v] || 0}</b></button>`).join("");
    I18N.translateTree(box);
  }
};

// 요구사항 · VOC · 산출물 · Action Item 상태 칩 필터 (WBS 상태 칩과 같은 방식)
//  - 칩에는 지금 조회 범위(분야·서브시스템 등)의 상태별 건수, 누르면 그 상태만 표시
//  - "지연": VOC = 목표일 지남 + 미완료, 산출물 = 계획 제출일 지남 + 보완완료 전, Action Item = 완료 목표일 지남 + 진행중
var StatusChips = {
  _v: {},
  _late(date, done) { const rep = (projectConfig.reportDate) || ""; return !!(date && rep && date < rep && !done); },
  DEFS: {
    req: { box: "reqStatusChips", run: "renderReqMasterTable",
      list: [["ALL", "전체", ""], ["대기", "대기", "chip-ready"], ["진행", "진행", "chip-progress"], ["완료", "완료", "chip-completed"], ["보류", "보류", "chip-hold"], ["삭제", "삭제", "chip-del"]],
      of: r => [r.status || "대기"] },
    voc: { box: "vocStatusChips", run: "renderVocTable",
      list: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["대기", "대기", "chip-ready"], ["진행", "진행", "chip-progress"], ["완료", "완료", "chip-completed"], ["보류", "보류", "chip-hold"], ["요구 반영", "요구 반영", "chip-moved"], ["삭제", "삭제", "chip-del"]],
      of: r => [r.status || "대기", Metrics.vocLate(r, projectConfig.reportDate) ? "지연" : ""] },
    deliv: { box: "delivStatusChips", run: "renderDeliverablesTable",
      list: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["작성전", "작성전", "chip-ready"], ["작성중", "작성중", "chip-progress"], ["검토요청", "검토요청", "chip-hold"], ["보완완료", "보완완료", "chip-completed"]],
      of: r => [r.status || "작성전", StatusChips._late(r.pDate, r.status === "보완완료" || !!r.aDate) ? "지연" : ""] },
    mtg: { box: "meetingStatusChips", run: "MeetingManager.onFilterChanged", select: "meetingFilterStatus",
      list: [["ALL", "전체", ""], ["예정", "예정", "chip-ready"], ["진행중", "진행중", "chip-progress"], ["완료", "완료", "chip-completed"], ["취소", "취소", "chip-hold"]],
      of: r => [r.status || "예정"] },
    ai: { box: "aiStatusChips", run: "MeetingManager.renderActionItemsTracker", select: "aiFilterStatus",
      list: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["진행중", "진행중", "chip-progress"], ["완료", "완료", "chip-completed"]],
      of: r => [r.status, r.status === "진행중" && StatusChips._late(r.targetDate, false) ? "지연" : ""] }
  },
  get(k) {
    const d = this.DEFS[k];
    if (d && d.select) { const el = document.getElementById(d.select); return el ? el.value || "ALL" : "ALL"; }
    return this._v[k] || "ALL";
  },
  tags(k, row) { return this.DEFS[k].of(row).filter(Boolean); },
  match(k, row) { const v = this.get(k); return v === "ALL" || this.tags(k, row).indexOf(v) !== -1; },
  set(k, v) {
    const d = this.DEFS[k];
    if (!d) return;
    if (d.select) { const el = document.getElementById(d.select); if (el) el.value = v; }
    else this._v[k] = v;
    const t = UiEvents.resolve(d.run);
    if (t) t.fn.call(t.owner);
  },
  // rows: 상태 칩을 뺀 나머지 조건으로 걸러진 행
  render(k, rows) {
    const d = this.DEFS[k], box = d && document.getElementById(d.box);
    if (!box) return;
    const cur = this.get(k), cnt = { ALL: rows.length };
    rows.forEach(r => this.tags(k, r).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
    box.innerHTML = d.list.filter(([v]) => v === "ALL" || v === cur || cnt[v] || ["삭제", "요구 반영", "보류"].indexOf(v) === -1)
      .map(([v, label, cls]) => `<button type="button" class="neo-chip ${cls}${cur === v ? " active" : ""}" data-click="StatusChips.set" data-click-args="${UiEvents.args(k, v)}" aria-pressed="${cur === v ? "true" : "false"}">${label} <b>${cnt[v] || 0}</b></button>`).join("");
    I18N.translateTree(box);
  }
};
