// =============================================================================
// Dashboard — PM · PL 이 매일 보는 한눈 현황 (자세한 표는 Phase 진척)
//  조회 범위(도메인 · 서브시스템) → 핵심 숫자 4개 · 체크할 일 · S-curve | 불릿 차트 · 요약 카드 4개 · 도메인별 진척
//  셈은 모두 엔진(WBSEngine · Metrics) — 화면에서 비율 · 기준을 새로 만들지 않음
// =============================================================================
function renderDashboard() {
  const repDate = projectConfig.reportDate;
  const val = (id, d) => { const el = /** @type {HTMLSelectElement} */ (document.getElementById(id)); return el && el.value ? el.value : d; };
  const selDomain = val("dashDomainFilter", "ALL"), selSubsys = val("dashSubsystemFilter", "ALL");
  const activeSystems = getAllSubsystemNames().filter(sys => (selDomain === "ALL" || WBSEngine.getSubsystemDomain(sys) === selDomain) && (selSubsys === "ALL" || sys === selSubsys));
  const whole = selDomain === "ALL" && selSubsys === "ALL";
  const inScope = r => whole || activeSystems.includes(r.system);

  // 불릿 차트 · 체크할 일
  try { BulletChart.render("dashBulletChart", BulletChart.liveRows(selSubsys)); } catch (e) { console.warn(e); }
  try { CheckList.render(activeSystems); } catch (e) { console.error(e); }

  // 핵심 숫자 (서브시스템별 진척률 × 서브시스템 가중치)
  const scopeTasks = wbsData.filter(inScope);
  const wp = WBSEngine.weightedProgress(scopeTasks.filter(d => d.level === 1));
  const delayed = scopeTasks.filter(d => WBSEngine.getTaskStatus(d, repDate).code === "delayed").length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("kpi-plan", `${wp.plan}%`);
  set("kpi-actual", `${wp.actual}%`);
  set("kpi-rate", wp.plan <= 0 && wp.actual <= 0 ? "-" : `${Metrics.achv(wp.plan, wp.actual, 1).toFixed(1)}%`);   // 계획 전이면 "-"
  set("kpi-delayed", I18N.tf("{n} 건", { n: delayed }));

  DashboardChart.renderSCurve("scurveCanvas", wbsData, repDate, projectConfig.weekStartDay, selSubsys, selDomain);
  DashSummary.render(activeSystems, whole);
  DashSummary.domains();
}

// 요약 카드 4개 (요구사항 · VOC · 테스트 결함 · 산출물) + 도메인별 진척 표
var DashSummary = {
  _card(c) {
    const lv = c.rate >= 80 ? "ok" : (c.rate >= 50 ? "warn" : "bad");
    return `<button type="button" class="dash-sum${c.empty ? " empty" : ""}" data-click="DashSummary.go" data-click-args="${UiEvents.args(c.go)}" title="${escapeAttr(c.tip)}">
      <span class="dash-sum-head"><span>${c.icon} ${c.title}</span><span>${c.label || ""}</span></span>
      <span class="dash-sum-val${c.bad ? " bad" : ""}">${c.value}</span>
      ${c.empty ? "" : `<span class="dash-sum-bar ${c.level || lv}"><i style="width:${Math.max(0, Math.min(100, c.rate))}%"></i></span>`}
      <span class="dash-sum-sub">${c.sub}</span>
      <span class="dash-sum-go">${c.goText} →</span></button>`;
  },
  render(systems, whole) {
    const box = document.getElementById("dashSumGrid");
    if (!box) return;
    const rep = projectConfig.reportDate;
    const inScope = r => whole || systems.includes(r.system);
    const reqs = reqMasterData.filter(inScope), vocs = vocData.filter(inScope);
    const rs = Metrics.reqStats(reqs), vs = Metrics.vocStats(vocs);
    const cnt = st => rs.list.filter(r => r.status === st).length;
    const rounds = getActiveDeliverableRounds();
    const dl = Metrics.delivStats(deliverablesData.filter(inScope), rounds);
    const dLate = Metrics.delivByPhase(dl.list, rounds, rep, []).reduce((a, x) => a + x.late, 0);
    const hasTest = Metrics.hasTestStage(vocs, rep);
    const df = Metrics.defectStats(vocs, rep);
    const b = (n, cls) => n ? `<b class="${cls || ""}">${n}</b>` : "0";
    const cards = [
      { icon: "🎯", title: I18N.t("요구사항"), label: I18N.t("완료율"), value: `${rs.rate}%`, rate: rs.rate, go: "tab-req", goText: I18N.t("요구사항 화면"), tip: I18N.t("요구사항 화면으로"),
        sub: I18N.tf("전체 {t} · 대기 {a} · 진행 {b} · 완료 {c} · 보류 {d}", { t: rs.total, a: cnt("대기"), b: cnt("진행"), c: rs.done, d: cnt("보류") }) + "<br>" + I18N.tf("초기 {a} · 추가 {b}", { a: rs.initial, b: rs.added }) },
      { icon: "💬", title: I18N.t("VOC"), label: I18N.t("처리율"), value: `${vs.rate}%`, rate: vs.rate, go: "matrix:voc", goText: I18N.t("단계별 VOC"), tip: I18N.t("Phase 진척의 단계별 VOC 로"),
        sub: I18N.tf("접수 {t} · 미결 {o} · 판정 대기 {u}", { t: vs.total, o: b(vs.total - vs.done), u: b(vs.undecided, "bad") }) + "<br>" + I18N.tf("결함 {a} · 개선 요청 {b} · 이슈 {c}", { a: vs.byJudge["결함"], b: vs.improve, c: vs.byJudge["이슈"] }) },
      hasTest
        ? { icon: "🐞", title: I18N.t("테스트 결함"), label: I18N.t("해결률"), value: I18N.tf("미결 {o} / {t}", { o: df.open, t: df.total }), bad: df.critOpen > 0, rate: df.rate, go: "matrix:voc", goText: I18N.t("결함 현황 · 소진 추이"), tip: I18N.t("Phase 진척의 테스트 결함 현황으로"),
          sub: I18N.tf("해결률 {r}% · 치명 · 높음 미결 {c} · 판정 대기 {u}", { r: df.rate, c: b(df.critOpen, "bad"), u: b(df.undecided) }) }
        : { icon: "🐞", title: I18N.t("테스트 결함"), value: I18N.t("통합테스트 접수 없음"), empty: true, rate: 0, go: "matrix:voc", goText: I18N.t("단계별 VOC"), tip: I18N.t("Phase 진척의 단계별 VOC 로"),
          sub: I18N.t("기준일까지 통합테스트 단계로 접수된 VOC 가 생기면 보입니다.") },
      { icon: "📑", title: I18N.t("산출물"), label: I18N.t("제출 완료율"), value: `${dl.rate}%`, rate: dl.rate, bad: dLate > 0 && dl.rate < 50, go: "matrix:deliv", goText: I18N.t("단계별 산출물"), tip: I18N.t("Phase 진척의 단계별 산출물로"),
        sub: I18N.tf("완료 {d} / 전체 {t} · 작성 · 검토 {i}", { d: dl.done, t: dl.total, i: dl.ing }) + "<br>" + I18N.tf("계획 제출일 지남 {n}", { n: b(dLate, "bad") }) }
    ];
    box.innerHTML = cards.map(c => this._card(c)).join("");
    I18N.translateTree(box);
  },
  // 요약 카드 → 해당 화면 (matrix:구역 = Phase 진척의 그 구역으로 스크롤)
  go(where) {
    const [tab, sec] = String(where).split(":");
    GShell.go(tab === "matrix" ? "tab-matrix" : tab);
    if (sec) setTimeout(() => { const el = document.getElementById(sec === "voc" ? "phaseVocCard" : "phaseDelivCard"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 250);
  },
  // 도메인별 진척 (도메인이 2개 이상일 때만 — 하나면 핵심 숫자와 같음)
  domains() {
    const card = document.getElementById("dashDomainCard"), body = document.getElementById("execDomainPortfolioBody");
    if (!card || !body) return;
    const domains = (projectConfig.domains || []).filter(d => (subsystemsMeta || []).some(s => s.domain === d));
    card.hidden = domains.length < 2;
    if (card.hidden) return;
    const allSw = (subsystemsMeta || []).reduce((acc, m) => acc + WBSEngine.sysWeight(m.name), 0);
    body.innerHTML = domains.map(dName => {
      const dSubs = subsystemsMeta.filter(s => s.domain === dName).map(s => s.name);
      const leaves = wbsData.filter(t => dSubs.includes(t.system) && t.isLeaf).length;
      const roots = wbsData.filter(t => dSubs.includes(t.system) && t.level === 1);
      const dwp = roots.length ? WBSEngine.weightedProgress(roots) : { plan: 0, actual: 0 };
      // 도메인 비중 = 그 도메인 서브시스템 가중치 합 / 전체 서브시스템 가중치 합
      const dWeight = allSw > 0 ? Math.round(dSubs.reduce((acc, n) => acc + WBSEngine.sysWeight(n), 0) / allSw * 1000) / 10 : 0;
      const rate = Metrics.achv(dwp.plan, dwp.actual);
      const lv = rate >= 90 ? ["rate-good", "tag-completed", "정상"] : (rate >= 70 ? ["rate-warn", "tag-progress", "주의"] : ["rate-bad", "tag-delayed", "지연"]);
      return `<tr><td><strong>${escapeHtml(dName)}</strong></td><td>${leaves}</td><td>${dWeight}%</td><td>${dwp.plan}%</td><td><strong>${dwp.actual}%</strong></td>
        <td class="u-bold ${lv[0]}">${rate}%</td><td><span class="status-tag ${lv[1]}">${lv[2]}</span></td></tr>`;
    }).join("");
    I18N.translateTree(card);
  }
};
window.DashSummary = DashSummary;
