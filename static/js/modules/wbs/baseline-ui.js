// =============================================================================
// 기준선 화면 — 프로젝트 설정 카드(확정 · 이력 · 비교 기준), Summary 한 줄, WBS 상세 패널 한 줄
//  계산은 modules/wbs/baseline.js (Baseline)
// =============================================================================
var BaselineUI = {
  canEdit() { return typeof ProcessLib === "undefined" || ProcessLib.canManageProject(); },
  _who() { const u = AuthManager.currentUser || {}; return u.name ? `${u.name}(${u.empNo || ""})` : (u.empNo || ""); },

  // 프로젝트 설정 > 판정 기준 아래 카드
  render() {
    const box = document.getElementById("baselineBox");
    if (!box) return;
    const l = Baseline.list(projectConfig), cur = Baseline.current(projectConfig), ed = this.canEdit();
    const s = Baseline.summary(wbsData, projectConfig);
    box.innerHTML = `
      <div class="u-flex u-gap-10 u-ai-center u-wrap">
        <button class="btn btn-primary btn-sm" data-click="BaselineUI.confirm"${ed ? "" : " disabled"}>📐 ${l.length ? "기준선 다시 확정" : "기준선 확정"}</button>
        ${l.length ? `<button class="btn btn-sm" data-btn="danger" data-click="BaselineUI.clear"${ed ? "" : " disabled"} title="기준선 이력을 모두 지우고 처음부터 다시 확정합니다">🗑️ 기준선 지우기</button>` : ""}
        <label class="u-bold u-fs-sm">비교 기준:</label>
        <select id="baselineCompareSel" data-change="BaselineUI.setCompare" data-change-args='["$value"]'${ed && l.length > 1 ? "" : " disabled"}>
          <option value="first"${projectConfig.baselineCompare !== "last" ? " selected" : ""}>최초 기준선</option>
          <option value="last"${projectConfig.baselineCompare === "last" ? " selected" : ""}>직전 기준선</option>
        </select>
        ${s.has ? `<span class="bl-sum">${this.sumText(s)}</span>` : `<span class="u-c-muted u-fs-sm">${I18N.t("아직 기준선이 없습니다. 계획 일정이 정해지면 [기준선 확정] 을 누르세요.")}</span>`}
      </div>
      ${l.length ? `<table class="m-table bl-hist"><thead><tr><th>No</th><th>확정일</th><th>확정한 사람</th><th>사유</th><th>비교</th></tr></thead><tbody>
        ${l.map(b => `<tr><td class="u-tc">${b.no}</td><td>${escapeHtml(b.date || "")}</td><td>${escapeHtml(b.by || "")}</td><td>${escapeHtml(b.reason || "")}</td>
          <td class="u-tc">${cur && cur.no === b.no ? "✔" : ""}</td></tr>`).join("")}</tbody></table>` : ""}`;
    I18N.translateTree(box);
  },
  sumText(s) {
    const v = s.endVar > 0 ? `+${s.endVar}` : String(s.endVar);
    return I18N.tf("기준선 {no} 대비 종료 예정 {v}일 · 밀린 Task {n}건{a}", { no: s.no, v, n: s.shifted, a: s.added ? " · " + I18N.tf("기준선 후 추가 {k}건", { k: s.added }) : "" });
  },
  confirm() {
    if (!this.canEdit()) return;
    const re = Baseline.list(projectConfig).length > 0;
    const leaves = wbsData.filter(t => t.isLeaf && t.pStart && t.pEnd).length;
    if (!leaves) return showToast("⚠️ 계획 시작 · 종료일이 있는 Task 가 없어 기준선을 확정할 수 없습니다.", "warning");
    openPromptDialog(re ? I18N.t("기준선 다시 확정 — 바꾸는 사유 (필수)") : I18N.t("기준선 확정 — 메모 (예: 착수 보고 승인 일정)"), re ? "" : I18N.t("최초 기준선"), reason => {
      const no = Baseline.confirm(wbsData, projectConfig, this._who(), reason, projectConfig.reportDate);
      rebuildAll();
      this.render();
      showToast(I18N.tf("📐 기준선 {no} 을 확정했습니다 (Task {n}건의 계획 일정). [저장] 을 눌러 기록하세요.", { no, n: leaves }));
    }, { multiline: true });
  },
  clear() {
    if (!this.canEdit() || !Baseline.list(projectConfig).length) return;
    openConfirmDialog(I18N.t("기준선 이력을 모두 지웁니다. Gantt · Summary · 보고서의 기준선 비교가 사라지고, 다시 [기준선 확정] 을 눌러 처음부터 시작합니다. 계속할까요?"), () => {
      Baseline.clear(wbsData, projectConfig);
      rebuildAll();
      this.render();
      showToast(I18N.t("🗑️ 기준선을 지웠습니다. [저장] 을 눌러 기록하세요."));
    });
  },
  // Gantt 위쪽 줄: 기준선 요약 + 확정 · 지우기 버튼 (프로젝트 설정의 카드와 같은 동작)
  ganttBar() {
    const box = document.getElementById("ganttBaselineBar");
    if (!box) return;
    const l = Baseline.list(projectConfig), ed = this.canEdit(), s = Baseline.summary(wbsData, projectConfig);
    box.innerHTML = `<span class="gl-key"><i class="gl-plan"></i>${I18N.t("계획 (실적 채움)")}</span>
      <span class="gl-key"><i class="gl-base"></i>${I18N.t("기준선")}</span><span class="gl-key"><i class="gl-slip"></i>${I18N.t("기준선보다 밀린 기간")}</span>
      <span class="gl-key"><i class="gl-pred"></i>${I18N.t("선행 경고")}</span>
      <span class="gl-sum">${s.has ? escapeHtml(this.sumText(s)) : I18N.t("기준선 없음")}</span>
      ${ed ? `<button type="button" class="btn btn-sm" data-btn="save" data-click="BaselineUI.confirm">📐 ${l.length ? I18N.t("기준선 다시 확정") : I18N.t("기준선 확정")}</button>` : ""}
      ${ed && l.length ? `<button type="button" class="btn btn-sm" data-btn="danger" data-click="BaselineUI.clear">🗑️ ${I18N.t("기준선 지우기")}</button>` : ""}`;
    ButtonStandard.apply(box);
    I18N.translateTree(box);
  },
  setCompare(v) {
    projectConfig.baselineCompare = v === "last" ? "last" : "first";
    rebuildAll();
    this.render();
  },

  // Summary · 대시보드 한 줄 (기준선이 있을 때만)
  lineHtml(systems) {
    const s = Baseline.summary(wbsData, projectConfig, systems);
    if (!s.has) return "";
    const last = s.last && s.count > 1 ? ` · ${I18N.tf("최근 재확정: {r}", { r: s.last.reason || "-" })}` : "";
    return `<span class="svl-item${s.endVar > 0 ? " svl-warn" : ""}">📐 <span>${escapeHtml(this.sumText(s) + last)}</span></span>`;
  },

  // WBS 상세 패널 한 줄
  taskHtml(t) {
    if (!t || !t.bEnd) return Baseline.current(projectConfig) && t && t.isLeaf ? `<div class="bl-task u-c-muted">📐 ${I18N.t("기준선 확정 후 추가된 Task")}</div>` : "";
    const v = Baseline.varOf(t, projectConfig);
    const cls = v > 0 ? "u-c-danger" : (v < 0 ? "u-c-success" : "u-c-muted");
    return `<div class="bl-task">📐 <span>${I18N.t("기준선")}</span> ${escapeHtml(t.bStart)} ~ ${escapeHtml(t.bEnd)} <b class="${cls}">(${v > 0 ? "+" : ""}${v}${I18N.t("일")})</b></div>`;
  }
};
window.BaselineUI = BaselineUI;
