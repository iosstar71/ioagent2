// =============================================================================
// [Workgroup] 주간보고 AI 초안 — 이번 주 자료를 서버(/api/ai/weekly-draft)로 보내 Claude 가 쓴 총괄 요약 세 칸을 받아 채움
//  켜기: conf/app.ini [features] ai_draft=1 (서버에 anthropic 패키지 · API 키). 꺼져 있으면 버튼을 숨김
//  받은 글은 입력칸에만 채움 — 사람이 고친 뒤 [작성 완료]로 저장
// =============================================================================
var WeeklyAi = {
  FIELDS: { currentWeekSummary: "wrCurrentSummary", nextWeekSummary: "wrNextSummary", issuesNotes: "wrIssuesNotes" },
  MAX_ROWS: 40,

  init() {
    const btn = document.getElementById("btnWrAiDraft");
    if (btn) btn.hidden = !Features.on("ai_draft");
  },

  // 보낼 자료: 이 보고서의 금주 · 차주 항목, 범위 안의 지연 · 위험, 금주 회의 결정, 지난주 요약
  payload() {
    const M = WeeklyReportManager, rep = M.currentWeekReport;
    const systems = M.scopeSystems(M.scope, M.scopeValue);
    const n = (list, f) => (list || []).slice(0, this.MAX_ROWS).map(f);
    const task = t => ({ id: t.manual ? "" : t.wbsId, name: t.name, system: t.system, owner: t.owner || "", plan: t.manual ? null : t.pProg, actual: t.manual ? null : t.aProg, due: t.pEnd || "", status: t.status, note: t.detail || "" });
    const c = CheckList.collect(systems);
    const prev = (weeklyReportsData || []).filter(r => r.id !== rep.id && r.scope === rep.scope && r.scopeValue === rep.scopeValue && r.weekNo < rep.weekNo)
      .sort((a, b) => b.weekNo - a.weekNo)[0];
    const meetings = MeetingManager.getWeeklyMeetings(rep.startDate, rep.endDate).filter(m => m.system === "ALL" || systems.includes(m.system));
    return {
      week: rep.weekLabel, period: `${rep.startDate} ~ ${rep.endDate}`, scope: M.scopeLabel(M.scope, M.scopeValue), reportDate: projectConfig.reportDate,
      curTasks: n(rep.currentWeekTasks, task),
      nextTasks: n(rep.nextWeekTasks, task),
      risks: {
        delayedTasks: n(c.delayed, x => ({ id: x.t.id, name: x.t.name, system: x.t.system, plan: x.t.pProg, actual: x.t.aProg, due: x.t.pEnd })),
        predecessorWarnings: n(c.predHit, x => ({ id: x.t.id, name: x.t.name, preds: x.r.list.map(p => `${p.task.id} ${p.task.name} (${p.reasons.join("·")})`) })),
        openVoc: n(c.vocs, v => ({ id: v.id, title: v.title, judge: Metrics.judgeOf(v), priority: v.priority, due: v.targetDate || "", late: Metrics.vocLate(v, projectConfig.reportDate) })),
        actionItems: n(c.actions, a => ({ title: a.title, assignee: a.assignee || "", due: a.targetDate || "" })),
        deliverablesDue: n(c.delivs, d => ({ name: d.name, round: d.round, due: d.pDate, status: d.status }))
      },
      meetings: n(meetings, m => ({ date: m.date, title: m.title, decisions: (m.agendas || []).map(a => `${a.title}: ${a.decision || ""}`).join(" / ") || m.summary || "" })),
      prev: prev ? { week: prev.weekLabel, current: prev.currentWeekSummary || "", next: prev.nextWeekSummary || "", issues: prev.issuesNotes || "" } : null
    };
  },

  run() {
    const M = WeeklyReportManager;
    if (!M.currentWeekReport) return;
    const filled = Object.values(this.FIELDS).some(id => { const el = /** @type {HTMLTextAreaElement} */ (document.getElementById(id)); return el && el.value.trim(); });
    if (!filled) return this._call();
    openConfirmDialog(I18N.t("총괄 요약 세 칸을 AI 초안으로 바꿉니다. 지금 쓴 내용은 사라집니다. 계속할까요?"), () => this._call());
  },

  async _call() {
    const btn = /** @type {HTMLButtonElement} */ (document.getElementById("btnWrAiDraft"));
    if (btn) btn.disabled = true;
    showToast(I18N.t("🤖 AI 초안을 만드는 중입니다… (30초 정도)"));
    try {
      const res = await ServerBackend.request("/api/ai/weekly-draft", { data: this.payload() }, "POST", 150000);
      if (!res.ok) { showToast("⚠️ " + (res.message || I18N.t("AI 초안을 받지 못했습니다."))); return; }
      Object.entries(this.FIELDS).forEach(([k, id]) => { const el = /** @type {HTMLTextAreaElement} */ (document.getElementById(id)); if (el) el.value = res.draft[k] || ""; });
      WeeklyReportManager.onSizeInput();
      WeeklyReportManager.renderScopeBanner();
      showToast(I18N.t("🤖 AI 초안을 채웠습니다 — 사실과 다른 곳이 없는지 확인 · 고친 뒤 [작성 완료]로 저장하세요."));
    } catch (e) {
      console.error("[WeeklyAi]", e);
      showToast("⚠️ " + I18N.t("AI 초안을 받지 못했습니다."));
    } finally {
      if (btn) btn.disabled = false;
    }
  }
};
window.WeeklyAi = WeeklyAi;
WeeklyAi.init();
