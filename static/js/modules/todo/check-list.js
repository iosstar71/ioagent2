// =============================================================================
// 체크할 일 집계 · 메뉴 건수 배지
//  - CheckList : 지연 Task · 마감 임박 · 선행 지연 영향 · 미조치 VOC · 판정 대기 · 확인할 산출물 · 미완료 Action Item (My Work · Dashboard)
//  - MenuBadges: 메뉴 옆 건수 배지
//  - MyWorkHello: My Work 인사말 줄
// =============================================================================

// -----------------------------------------------------------------------------
// 1. 대시보드 "확인할 일"
// -----------------------------------------------------------------------------
var CheckList = {
  get DUE_DAYS() { return WBSEngine.dueDays ? WBSEngine.dueDays() : 7; },   // 기준정보의 마감 임박 일수
  SHOW: 5,
  KEY_MINE: "IOSTAR_NEO_TODO_MINE",
  _systems: null,

  mine() { return DayUtil.store(this.KEY_MINE) === "1"; },
  toggleMine() {
    DayUtil.store(this.KEY_MINE, this.mine() ? "0" : "1");
    this.render(this._systems);
  },
  // 현재 작업자 담당 서브시스템 (ALL 이면 "내 담당만" 을 표시하지 않음)
  ownSystem() {
    const own = Permission.ownSubsystem();
    return own && own !== "ALL" ? own : "";
  },
  userName() {
    const u = AuthManager.getCurrentUser();
    return (u && u.name) || "";
  },

  // 화면의 조회 범위(대시보드 필터 + 내 담당만)에 들어가는지
  _inScope(systems, sys, person) {
    if (systems && systems.indexOf(sys) === -1) return false;
    if (this._mineNow !== undefined ? this._mineNow : this.mine()) {
      const own = this.ownSystem(), name = this.userName();
      return (own && sys === own) || (!!name && !!person && String(person).indexOf(name) !== -1);
    }
    return true;
  },

  // mine: true/false = 내 담당만 여부 지정 (생략하면 대시보드 설정)
  collect(systems, mine) {
    this._mineNow = mine;
    try { return this._collect(systems); } finally { this._mineNow = undefined; }
  },
  _collect(systems) {
    const rep = DayUtil.rep();
    const soon = DayUtil.addDays(rep, this.DUE_DAYS);
    const leaves = (wbsData || []).filter(t => t.isLeaf && this._inScope(systems, t.system));
    const delayed = leaves.filter(t => DayUtil.status(t).code === "delayed")
      .map(t => ({ t, gap: (parseFloat(t.pProg) || 0) - (parseFloat(t.aProg) || 0) }))
      .sort((a, b) => b.gap - a.gap);
    const dueSoon = leaves.filter(t => (parseFloat(t.aProg) || 0) < 100 && t.pEnd && t.pEnd >= rep && t.pEnd <= soon)
      .sort((a, b) => a.pEnd.localeCompare(b.pEnd));
    const vocs = Metrics.vocOpen(vocData).filter(v => this._inScope(systems, v.system, v.requester))
      .sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));
    const delivs = (deliverablesData || []).filter(d => d.status !== "보완완료" && d.pDate && d.pDate <= soon && this._inScope(systems, d.system, d.manager))
      .sort((a, b) => a.pDate.localeCompare(b.pDate));
    const actions = [];
    (meetingsData || []).forEach(m => (m.actionItems || []).forEach(a => {
      if (a.status === "완료" || !this._inScope(systems, a.system || m.system, a.assignee)) return;
      actions.push(Object.assign({ _mtg: m.id }, a));
    }));
    actions.sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));
    const undecided = vocs.filter(v => Metrics.judgeOf(v) === "미판정");   // 미조치 VOC 중 아직 판정하지 않은 것
    // 선행 지연 영향: 내(조회 범위) Task 의 선행 Task 가 늦거나 일정이 겹침
    const pw = WBSEngine.predWarnings(wbsData || [], rep);
    const predHit = [...pw.entries()].filter(([t]) => this._inScope(systems, t.system, t.owner)).map(([t, r]) => ({ t, r }));
    return { delayed, dueSoon, vocs, undecided, delivs, actions, predHit };
  },

  // 메뉴 배지용 건수 (대시보드 필터와 무관하게 전체 기준)
  counts() {
    const c = this.collect(null);
    return {
      "tab-wbs": c.delayed.length,
      "tab-voc": c.vocs.length,
      "tab-deliverables": c.delivs.length,
      "tab-meeting": c.actions.length,
      // 홈: 내가 등록한 할 일 중 기한 지남 + 오늘 마감
      "tab-mywork": TodoCenter.urgent()
    };
  },

  // 대시보드에는 한 줄 요약만 — 자세한 목록과 개인 할 일은 홈의 [✅ 내 할 일]
  render(systems) {
    this._systems = systems || null;
    const box = document.getElementById("neoTodoCard");
    if (!box) return;
    const c = this.collect(this._systems);
    const parts = [["🔴", "지연 Task", c.delayed.length], ["⏰", `${this.DUE_DAYS}일 안 마감`, c.dueSoon.length], ["📣", "미조치 VOC", c.vocs.length], ["🏷️", "판정 대기 VOC", c.undecided.length], ["⛓", "선행 지연 영향", c.predHit.length], ["📑", "확인할 산출물", c.delivs.length], ["⚡", "미완료 Action Item", c.actions.length]];
    const total = parts.reduce((a, p) => a + p[2], 0);
    const mineOpen = TodoCenter.stats().open;
    box.innerHTML = `
      <div class="neo-todo-line">
        <span class="neo-todo-line-title"><span>✅ 체크할 일</span> <b class="neo-todo-total">${total}</b></span>
        ${parts.map(p => `<span class="neo-todo-chip${p[2] ? "" : " zero"}">${p[0]} <span>${p[1]}</span> <b>${p[2]}</b></span>`).join("")}
        <span class="neo-todo-chip mine"><span>📝 내 할 일</span> <b>${mineOpen}</b></span>
        <button type="button" class="btn btn-sm neo-todo-go" data-btn="nav" data-click="TodoCenter.openHome">홈의 내 할 일에서 보기 →</button>
      </div>`;
    ButtonStandard.apply(box);
    I18N.translateTree(box);
    MenuBadges.refresh();
  },

  openTask(id) {
    GShell.go("tab-wbs");
    setTimeout(() => {
      const idx = wbsData.findIndex(t => t.id === id);
      if (idx === -1) return;
      const st = document.getElementById("wbsStatusFilter");
      // 접혀서(레벨 필터) 안 보이는 과업이면 전체 표시로 바꾼 뒤 상세 패널 열기
      if (!document.querySelector(`#wbsTableBody [data-wbs-id="${CSS.escape(id)}"]`)) {
        if (st) st.value = "ALL";
        const lv = document.getElementById("wbsMaxLevelFilter");
        if (lv) lv.value = "5";
        renderWbsTable();
      }
      WbsDetail.open(idx);
    }, 200);
  },
  openWbsStatus(status) {
    GShell.go("tab-wbs");
    setTimeout(() => WbsStatusChips.set(status), 150);
  },
  reveal(tabId, text) { GShell.reveal(tabId, text); }
};

// -----------------------------------------------------------------------------
// 3. 메뉴 건수 배지
// -----------------------------------------------------------------------------
var MenuBadges = {
  TIPS: { "tab-wbs": "지연 Task", "tab-voc": "미조치 VOC", "tab-deliverables": "확인할 산출물 (7일 이내)", "tab-meeting": "미완료 Action Item", "tab-home": "내 할 일 (기한 지남·오늘 마감)" },
  _counts: {},
  _sig: "",

  compute() {
    try { return CheckList.counts(); } catch (e) { return {}; }
  },
  // GShell.renderNav 끝에서 호출 (메뉴를 다시 그릴 때마다)
  apply(nav) {
    this._counts = this.compute();
    this._sig = JSON.stringify(this._counts);
    this._paint(nav || document.getElementById("gNav"));
    SideMenu.apply(nav);
  },
  refresh() {
    const c = this.compute();
    const sig = JSON.stringify(c);
    if (sig === this._sig) return;
    this._counts = c;
    this._sig = sig;
    this._paint(document.getElementById("gNav"));
  },
  _paint(nav) {
    if (!nav) return;
    const c = this._counts;
    nav.querySelectorAll("[data-tab]").forEach(b => {
      const t = b.getAttribute("data-tab");
      let s = b.querySelector(".neo-badge");
      const n = c[t] || 0;
      if (!n) { if (s) s.remove(); return; }
      if (!s) { s = document.createElement("span"); s.className = "neo-badge"; b.appendChild(s); }
      s.textContent = n > 99 ? "99+" : String(n);
      s.title = `${this.TIPS[t] || ""} ${n}건`;
    });
    // 1단 메뉴(묶음): 하위 화면 수 대신 확인할 건수 합계 (없으면 숨김)
    nav.querySelectorAll(".g-group[data-group]").forEach(g => {
      const grp = GShell.GROUPS.find(x => x.key === g.getAttribute("data-group"));
      const sum = grp ? grp.tabs.filter(t => GShell.allowed(t)).reduce((a, t) => a + (c[t] || 0), 0) : 0;
      const s = g.querySelector(".g-group-count");
      if (!s) return;
      s.textContent = sum > 99 ? "99+" : String(sum);
      s.classList.add("neo-alert");
      s.hidden = !sum;
      s.title = sum ? `체크할 일 ${sum}건` : "";
    });
  }
};

// My Work 인사 헤더: 오늘 볼 것만 한 줄 (체크할 일 집계 그대로)
var MyWorkHello = {
  render() {
    const box = document.getElementById("mwHello");
    if (!box) return;
    const c = CheckList.collect(null);
    const u = AuthManager.getCurrentUser ? AuthManager.getCurrentUser() : null;
    const parts = [["지연 Task", c.delayed.length], [`${CheckList.DUE_DAYS}일 안 마감`, c.dueSoon.length], ["미조치 VOC", c.vocs.length], ["확인할 산출물", c.delivs.length], ["미완료 Action Item", c.actions.length]].filter(p => p[1] > 0);
    const line = parts.length ? parts.map(p => `<span>${p[0]}</span> <b>${p[1]}</b>`).join(" · ") : "<span>체크할 일이 없습니다</span>";
    box.innerHTML = `<div class="mw-hello-ico">🏠</div>
      <div class="mw-hello-text"><h3><span>오늘의 핵심</span>${u && u.name ? ` <small class="mw-who" data-i18n-skip>${escapeHtml(u.name)}</small>` : ""}</h3><p>${line}</p></div>
      <div class="mw-hello-go">
        ${c.delayed.length ? `<button type="button" class="btn btn-sm" data-btn="nav" data-click="CheckList.openWbsStatus" data-click-args='["지연"]'>지연 Task 보기 →</button>` : ""}
        <button type="button" class="btn btn-sm" data-btn="nav" data-click="GShell.go" data-click-args='["tab-dashboard"]'>Dashboard 열기 →</button>
      </div>`;
    box.hidden = false;
    ButtonStandard.apply(box);
    I18N.translateTree(box);
  }
};
window.MyWorkHello = MyWorkHello;
