// =============================================================================
// [IOSTAR-PM v3.0.0] Neo 화면 기능 (v3.0.0 부터 화면은 Neo 하나)
// -----------------------------------------------------------------------------
//  - UiMode    : (호환용) 항상 Neo
//  - NeoTodo   : 대시보드 "확인할 일" — 지연 과업 · 7일 안 마감 과업 · 미조치 VOC · 확인할 산출물 · 미완료 Action Item
//  - NeoDetail : WBS 오른쪽 상세 패널 — ID 를 누르면 한 과업의 모든 항목을 한 곳에서 보고 고침
//  - NeoBadges : 메뉴 건수 배지 (지연 과업 · 미조치 VOC · 확인할 산출물 · 미완료 Action Item)
//  - NeoChips  : WBS 상태 칩 필터 (전체 · 지연 · 진행중 · 착수전 · 완료, 건수 표시)
//  - NeoSide   : 왼쪽 메뉴 접기 (아이콘만 표시)
//  ※ 데이터 계산·저장은 기존 엔진(WBSEngine · UiH · rebuildAll · persistChanges)을 그대로 사용
// =============================================================================
var NeoUtil = {
  addDays(iso, n) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  rep() { return (typeof projectConfig !== "undefined" && projectConfig.reportDate) || new Date().toISOString().slice(0, 10); },
  status(t) { return WBSEngine.getTaskStatus(t, this.rep()); },
  store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
    return val;
  },
  // 기준일 기준 마감까지 남은 날 (음수 = 지남)
  daysLeft(iso) {
    if (!iso) return null;
    return Math.round((new Date(iso + "T00:00:00") - new Date(this.rep() + "T00:00:00")) / 86400000);
  },
  dueText(iso) {
    const n = this.daysLeft(iso);
    if (n === null) return "";
    if (n < 0) return `${-n}일 지남`;
    if (n === 0) return "오늘 마감";
    return `D-${n}`;
  }
};

// -----------------------------------------------------------------------------
// 0. 화면 방식 (Standard / Neo)
//  - 처음 화면: 이 브라우저에서 마지막에 쓴 방식 → 없으면 app.ini default_ui
//  - 로그인 후: 사용자 설정(projectUsers[].uiMode)과 다르면 그 방식으로 다시 불러옴
//  - app.ini allow_ui_switch=0 이면 default_ui 로 고정 (선택 메뉴 숨김)
// -----------------------------------------------------------------------------
// [v3.0.0] Standard(클래식) 화면은 v2.4 까지 — 이제 화면은 Neo 하나 (UiMode 는 호환을 위해 남김)
var UiMode = {
  current: "neo",
  init() { this.apply("neo"); },
  apply() {
    this.current = "neo";
    document.body.classList.add("ui-neo");
    document.body.classList.remove("ui-standard");
  },
  isNeo() { return true; },
  canSwitch() { return false; },
  afterLogin() { return false; },
  set() {},
  syncSelects() {}
};
UiMode.init();

// -----------------------------------------------------------------------------
// 1. 대시보드 "확인할 일"
// -----------------------------------------------------------------------------
var NeoTodo = {
  DUE_DAYS: 7,
  SHOW: 5,
  KEY_MINE: "IOSTAR_NEO_TODO_MINE",
  _systems: null,

  mine() { return NeoUtil.store(this.KEY_MINE) === "1"; },
  toggleMine() {
    NeoUtil.store(this.KEY_MINE, this.mine() ? "0" : "1");
    this.render(this._systems);
  },
  // 현재 사용자 담당 서브시스템 (ALL 이면 "내 담당만" 을 표시하지 않음)
  ownSystem() {
    const own = typeof Permission !== "undefined" ? Permission.ownSubsystem() : "ALL";
    return own && own !== "ALL" ? own : "";
  },
  userName() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
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
    const rep = NeoUtil.rep();
    const soon = NeoUtil.addDays(rep, this.DUE_DAYS);
    const leaves = (wbsData || []).filter(t => t.isLeaf && this._inScope(systems, t.system));
    const delayed = leaves.filter(t => NeoUtil.status(t).code === "delayed")
      .map(t => ({ t, gap: (parseFloat(t.pProg) || 0) - (parseFloat(t.aProg) || 0) }))
      .sort((a, b) => b.gap - a.gap);
    const dueSoon = leaves.filter(t => (parseFloat(t.aProg) || 0) < 100 && t.pEnd && t.pEnd >= rep && t.pEnd <= soon)
      .sort((a, b) => a.pEnd.localeCompare(b.pEnd));
    const vocs = (vocData || []).filter(v => ["완료", "제외", "삭제"].indexOf(v.status) === -1 && this._inScope(systems, v.system, v.requester))
      .sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));
    const delivs = (deliverablesData || []).filter(d => d.status !== "보완완료" && d.pDate && d.pDate <= soon && this._inScope(systems, d.system, d.manager))
      .sort((a, b) => a.pDate.localeCompare(b.pDate));
    const actions = [];
    (meetingsData || []).forEach(m => (m.actionItems || []).forEach(a => {
      if (a.status === "완료" || !this._inScope(systems, a.system || m.system, a.assignee)) return;
      actions.push(Object.assign({ _mtg: m.id }, a));
    }));
    actions.sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));
    return { delayed, dueSoon, vocs, delivs, actions };
  },

  // 메뉴 배지용 건수 (대시보드 필터와 무관하게 전체 기준)
  counts() {
    const c = this.collect(null);
    return {
      "tab-wbs": c.delayed.length,
      "tab-voc": c.vocs.length,
      "tab-deliverables": c.delivs.length,
      "tab-meeting": c.actions.length,
      // [v2.4.0] 홈: 내가 등록한 할 일 중 기한 지남 + 오늘 마감
      "tab-home": typeof TodoCenter !== "undefined" ? TodoCenter.urgent() : 0
    };
  },

  // [v2.4.0] 대시보드에는 한 줄 요약만 — 자세한 목록과 개인 할 일은 홈의 [✅ 내 할 일]
  render(systems) {
    if (!UiMode.isNeo()) return;
    this._systems = systems || null;
    const box = document.getElementById("neoTodoCard");
    if (!box) return;
    const c = this.collect(this._systems);
    const parts = [["🔴", "지연 과업", c.delayed.length], ["⏰", `${this.DUE_DAYS}일 안 마감`, c.dueSoon.length], ["📣", "미조치 VOC", c.vocs.length], ["📑", "확인할 산출물", c.delivs.length], ["⚡", "미완료 Action Item", c.actions.length]];
    const total = parts.reduce((a, p) => a + p[2], 0);
    const mineOpen = typeof TodoCenter !== "undefined" ? TodoCenter.stats().open : 0;
    box.innerHTML = `
      <div class="neo-todo-line">
        <span class="neo-todo-line-title"><span>✅ 확인할 일</span> <b class="neo-todo-total">${total}</b></span>
        ${parts.map(p => `<span class="neo-todo-chip${p[2] ? "" : " zero"}">${p[0]} <span>${p[1]}</span> <b>${p[2]}</b></span>`).join("")}
        <span class="neo-todo-chip mine"><span>📝 내 할 일</span> <b>${mineOpen}</b></span>
        <button type="button" class="btn btn-sm neo-todo-go" data-btn="nav" data-click="TodoCenter.openHome">홈의 내 할 일에서 보기 →</button>
      </div>`;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(box);
    if (typeof I18N !== "undefined") I18N.translateTree(box);
    NeoBadges.refresh();
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
      NeoDetail.open(idx);
    }, 200);
  },
  openWbsStatus(status) {
    GShell.go("tab-wbs");
    setTimeout(() => NeoChips.set(status), 150);
  },
  reveal(tabId, text) { GShell.reveal(tabId, text); }
};

// -----------------------------------------------------------------------------
// 2. WBS 오른쪽 상세 패널
// -----------------------------------------------------------------------------
var NeoDetail = {
  _id: null,

  // 과업은 ID 로 찾음 (다시 계산하면 행 객체가 새로 만들어질 수 있음)
  idx() { return this._id === null ? -1 : wbsData.findIndex(t => String(t.id) === this._id); },
  row() { const i = this.idx(); return i === -1 ? null : wbsData[i]; },
  _panel() {
    let p = document.getElementById("neoDetail");
    if (p) return p;
    p = document.createElement("aside");
    p.id = "neoDetail";
    p.className = "neo-detail";
    p.hidden = true;
    p.setAttribute("aria-label", "WBS 과업 상세");
    document.body.appendChild(p);
    return p;
  },
  open(idx) {
    if (!UiMode.isNeo()) return;
    const row = wbsData[idx];
    if (!row) return;
    this._id = String(row.id);
    this.render();
  },
  close() {
    this._id = null;
    const p = document.getElementById("neoDetail");
    if (p) p.hidden = true;
    document.body.classList.remove("neo-detail-open");
    this.markRow();
  },
  isOpen() { const p = document.getElementById("neoDetail"); return !!(p && !p.hidden); },

  // 표에서 현재 보이는 과업 순서대로 이전/다음
  step(dir) {
    const ids = Array.prototype.map.call(document.querySelectorAll("#wbsTableBody tr[data-wbs-id]"), r => r.getAttribute("data-wbs-id"));
    const cur = this._id === null ? -1 : ids.indexOf(this._id);
    const next = ids[cur + dir];
    if (!next) return;
    const idx = wbsData.findIndex(t => t.id === next);
    if (idx !== -1) this.open(idx);
  },

  // 한 칸 수정: 표와 같은 처리(값 저장 → 다시 계산/저장 → 표·패널 다시 그림)
  set(field, value) {
    const idx = this.idx();
    if (idx === -1) return this.close();
    if (field === "owner") return WbsOwner.set(idx, value);
    const after = {
      name: ["persistChanges"], output: ["persistChanges"],
      reqId: ["renderPhaseMatrix", "renderReqMasterTable", "persistChanges"],
      weight: ["rebuildAll"], pStart: ["rebuildAll"], pEnd: ["rebuildAll"], aStart: ["rebuildAll"], aEnd: ["rebuildAll"], aProg: ["rebuildAll"]
    }[field] || ["persistChanges"];
    const num = field === "weight" || field === "aProg";
    const v = num ? (value === "" ? "" : parseFloat(value)) : value;
    if (!UiH.set("wbsData", idx, field, v, ...after)) return this.render();
    if (after.indexOf("rebuildAll") === -1 && typeof renderWbsTable === "function") renderWbsTable();
    this.render();
  },
  run(fnName) {
    const idx = this.idx();
    if (idx === -1) return;
    const fn = UiEvents.resolve(fnName);
    if (fn) fn.fn.call(fn.owner, idx);
    setTimeout(() => this.render(), 80);
  },

  render() {
    const p = this._panel();
    const row = this.row();
    if (!row) return this.close();
    // 다시 그려도 입력 중이던 칸(Tab 으로 옮겨 간 칸)의 포커스 유지
    const act = document.activeElement;
    const focusKey = act && p.contains(act) ? act.getAttribute("data-change-args") : null;
    const st = NeoUtil.status(row);
    const leaf = !!row.isLeaf;
    const ro = leaf ? "" : "readonly";
    const field = (label, key, type, extra = "") => `
      <label class="neo-field"><span>${label}</span>
        <input type="${type}" value="${escapeAttr(row[key] === undefined || row[key] === null ? "" : String(row[key]))}" ${extra} data-change="NeoDetail.set" data-change-args="${UiEvents.args(key, "$value")}"></label>`;
    const req = (reqMasterData || []).find(r => r.id && r.id === row.reqId);
    const posts = (typeof communicationsData !== "undefined" ? communicationsData : []).filter(c => c.taskId && String(c.taskId) === String(row.id));
    const kids = (() => { const i = wbsData.indexOf(row); return leaf ? 0 : getSubtreeEndIndex(i) - i - 1; })();
    const pp = Math.max(0, Math.min(100, parseFloat(row.pProg) || 0)), ap = Math.max(0, Math.min(100, parseFloat(row.aProg) || 0));
    const due = row.pEnd && ap < 100 ? NeoUtil.dueText(row.pEnd) : "";
    p.innerHTML = `
      <div class="neo-detail-head">
        <div class="neo-detail-title">
          <span class="lvl-badge lvl-${row.level}">L${row.level}</span>
          <code>${escapeHtml(row.id)}</code>
          <span class="status-tag ${st.cssClass}">${st.label}</span>
        </div>
        <div class="neo-detail-nav">
          <button type="button" class="btn btn-xs" data-click="NeoDetail.step" data-click-args="${UiEvents.args(-1)}" title="이전 과업">▲</button>
          <button type="button" class="btn btn-xs" data-click="NeoDetail.step" data-click-args="${UiEvents.args(1)}" title="다음 과업">▼</button>
          <button type="button" class="btn btn-xs" data-btn="cancel" data-click="NeoDetail.close" title="닫기 (Esc)">✕</button>
        </div>
      </div>
      <div class="neo-detail-body">
        <label class="neo-field neo-field-wide"><span>Task명</span>
          <textarea rows="2" data-change="NeoDetail.set" data-change-args="${UiEvents.args("name", "$value")}">${escapeHtml(row.name || "")}</textarea></label>
        <div class="neo-detail-meta">
          <span>🏢 ${escapeHtml(row.system || "-")}</span>
          <span>${leaf ? "최하위 Task" : `상위 Task · 하위 ${kids}개`}</span>
          ${due ? `<span class="neo-due${NeoUtil.daysLeft(row.pEnd) < 0 ? " late" : ""}">계획종료 ${due}</span>` : ""}
        </div>
        <div class="neo-progress">
          <div class="neo-progress-row"><span>계획</span><div class="neo-bar"><i style="width:${pp}%"></i></div><b>${pp}%</b></div>
          <div class="neo-progress-row actual"><span>실적</span><div class="neo-bar"><i style="width:${ap}%"></i></div><b>${ap}%</b></div>
        </div>
        <div class="neo-grid2">
          ${field("계획시작", "pStart", "date", ro)}
          ${field("계획종료", "pEnd", "date", ro)}
          ${field("실적시작", "aStart", "date", ro)}
          ${field("실적종료", "aEnd", "date", ro)}
          ${field("실적 진척율(%)", "aProg", "number", `min="0" max="100" ${ro}`)}
          ${field("가중치", "weight", "number", `min="0" step="0.5"`)}
          ${field("REQ ID", "reqId", "text")}
          ${field("담당자", "owner", "text", `list="wbsOwnerList" maxlength="40" title="목록에서 고르거나 직접 입력 (1명)${leaf ? "" : " — 하위 Task 에도 자동 지정"}"`)}
          ${field("산출물", "output", "text")}
        </div>
        ${leaf ? "" : '<div class="neo-note">상위 Task 의 일정·진척율은 하위 Task 에서 자동으로 합산됩니다.</div>'}
        <div class="neo-detail-actions">
          <button type="button" class="btn btn-sm" data-btn="warn" data-click="NeoDetail.run" data-click-args="${UiEvents.args("fillRowActualFromPlan")}" ${leaf ? "" : "disabled"}>⚡ 계획을 실적에 반영</button>
          <button type="button" class="btn btn-sm" data-btn="add" data-click="NeoDetail.run" data-click-args="${UiEvents.args("addChildTask")}" ${row.level >= 5 ? "disabled" : ""}>+ 하위</button>
          <button type="button" class="btn btn-sm" data-btn="add" data-click="NeoDetail.run" data-click-args="${UiEvents.args("addSiblingTask")}">+ 동위</button>
        </div>
        <div class="neo-detail-sec">
          <div class="neo-detail-sec-title">🔗 연결된 요구사항</div>
          ${req ? `<button type="button" class="neo-link" data-click="NeoTodo.reveal" data-click-args="${UiEvents.args("tab-req", req.id)}"><span><code>${escapeHtml(req.id)}</code> · ${escapeHtml(req.status || "")}</span><span>${escapeHtml(req.name || "")}</span></button>`
            : `<div class="neo-muted">${row.reqId ? `요구사항 [${escapeHtml(row.reqId)}] 을 찾을 수 없습니다.` : "REQ ID 를 입력하면 연결됩니다."}</div>`}
        </div>
        <div class="neo-detail-sec">
          <div class="neo-detail-sec-title">💬 이 과업 소통 글 (${posts.length})</div>
          ${posts.length ? posts.slice(0, 5).map(c => `<div class="neo-post"><b>${escapeHtml(c.author || "")}</b> <span class="neo-muted">${escapeHtml(c.date || "")}</span><div>${escapeHtml((c.title || c.content || "").slice(0, 80))}</div></div>`).join("")
            : '<div class="neo-muted">등록된 글이 없습니다.</div>'}
        </div>
      </div>`;
    p.hidden = false;
    document.body.classList.add("neo-detail-open");
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(p);
    if (typeof I18N !== "undefined") I18N.translateTree(p);
    if (focusKey) {
      const el = Array.prototype.find.call(p.querySelectorAll("[data-change-args]"), x => x.getAttribute("data-change-args") === focusKey);
      if (el) el.focus();
    }
    this.markRow();
  },
  markRow() {
    document.querySelectorAll("#wbsTableBody tr.neo-sel").forEach(r => r.classList.remove("neo-sel"));
    if (this._id === null) return;
    const tr = document.querySelector(`#wbsTableBody tr[data-wbs-id="${CSS.escape(this._id)}"]`);
    if (tr) {
      tr.classList.add("neo-sel");
      const box = tr.closest(".table-container");
      if (box) {
        const top = tr.offsetTop, h = box.clientHeight;
        if (top < box.scrollTop || top > box.scrollTop + h - 40) box.scrollTop = Math.max(0, top - h / 3);
      }
    }
  },
  // 표가 다시 그려진 뒤 (renderWbsTable 끝에서 호출)
  afterTable() {
    if (!UiMode.isNeo() || !this.isOpen()) return;
    if (!this.row()) return this.close();
    this.render();
  }
};

// -----------------------------------------------------------------------------
// 3. 메뉴 건수 배지
// -----------------------------------------------------------------------------
var NeoBadges = {
  TIPS: { "tab-wbs": "지연 과업", "tab-voc": "미조치 VOC", "tab-deliverables": "확인할 산출물 (7일 이내)", "tab-meeting": "미완료 Action Item", "tab-home": "내 할 일 (기한 지남·오늘 마감)" },
  _counts: {},
  _sig: "",

  compute() {
    try { return NeoTodo.counts(); } catch (e) { return {}; }
  },
  // GShell.renderNav 끝에서 호출 (메뉴를 다시 그릴 때마다)
  apply(nav) {
    if (!UiMode.isNeo()) return;
    this._counts = this.compute();
    this._sig = JSON.stringify(this._counts);
    this._paint(nav || document.getElementById("gNav"));
    NeoSide.apply(nav);
  },
  refresh() {
    if (!UiMode.isNeo()) return;
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
      s.title = sum ? `확인할 일 ${sum}건` : "";
    });
  }
};

// -----------------------------------------------------------------------------
// 4. WBS 상태 칩 필터
// -----------------------------------------------------------------------------
var NeoChips = {
  LIST: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["진행중", "진행중", "chip-progress"], ["착수전", "착수전", "chip-ready"], ["완료", "완료", "chip-completed"]],
  set(v) {
    const sel = document.getElementById("wbsStatusFilter");
    if (!sel) return;
    sel.value = v;
    renderWbsTable();
  },
  // renderWbsTable 끝에서 호출: 분야·서브시스템 조회 범위의 최하위 Task 상태별 건수
  render() {
    const box = document.getElementById("neoStatusChips");
    if (!box || !UiMode.isNeo()) return;
    const val = id => { const el = document.getElementById(id); return el ? el.value : "ALL"; };
    const dF = val("wbsDomainFilter"), sF = val("wbsSubsystemFilter"), cur = val("wbsStatusFilter") || "ALL";
    const leaves = wbsData.filter(t => t.isLeaf && (dF === "ALL" || WBSEngine.getSubsystemDomain(t.system) === dF) && (sF === "ALL" || t.system === sF));
    const cnt = { ALL: leaves.length };
    leaves.forEach(t => { const l = NeoUtil.status(t).label; cnt[l] = (cnt[l] || 0) + 1; });
    box.innerHTML = this.LIST.map(([v, label, cls]) =>
      `<button type="button" class="neo-chip ${cls}${cur === v ? " active" : ""}" data-click="NeoChips.set" data-click-args="${UiEvents.args(v)}" aria-pressed="${cur === v ? "true" : "false"}">${label} <b>${cnt[v] || 0}</b></button>`).join("");
    if (typeof I18N !== "undefined") I18N.translateTree(box);
  }
};

// [v3.0.2] 요구사항 · VOC · 산출물 · Action Item 상태 칩 필터 (WBS 상태 칩과 같은 방식)
//  - 칩에는 지금 조회 범위(분야·서브시스템 등)의 상태별 건수, 누르면 그 상태만 표시
//  - "지연": VOC = 목표일 지남 + 미완료, 산출물 = 계획 제출일 지남 + 보완완료 전, Action Item = 완료 목표일 지남 + 진행중
var StatusChips = {
  _v: {},
  _late(date, done) { const rep = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || ""; return !!(date && rep && date < rep && !done); },
  DEFS: {
    req: { box: "reqStatusChips", run: "renderReqMasterTable",
      list: [["ALL", "전체", ""], ["착수전", "착수전", "chip-ready"], ["진행", "진행", "chip-progress"], ["완료", "완료", "chip-completed"], ["보류", "보류", "chip-hold"], ["삭제", "삭제", "chip-del"]],
      of: r => [r.status || "착수전"] },
    voc: { box: "vocStatusChips", run: "renderVocTable",
      list: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["착수전", "착수전", "chip-ready"], ["진행", "진행", "chip-progress"], ["완료", "완료", "chip-completed"], ["보류", "보류", "chip-hold"], ["제외", "제외", "chip-del"], ["삭제", "삭제", "chip-del"]],
      of: r => [r.status || "착수전", StatusChips._late(r.targetDate, ["완료", "제외", "삭제", "보류"].indexOf(r.status) !== -1) ? "지연" : ""] },
    deliv: { box: "delivStatusChips", run: "renderDeliverablesTable",
      list: [["ALL", "전체", ""], ["지연", "지연", "chip-delayed"], ["작성전", "작성전", "chip-ready"], ["작성중", "작성중", "chip-progress"], ["검토요청", "검토요청", "chip-hold"], ["보완완료", "보완완료", "chip-completed"]],
      of: r => [r.status || "작성전", StatusChips._late(r.pDate, r.status === "보완완료" || !!r.aDate) ? "지연" : ""] },
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
    box.innerHTML = d.list.filter(([v]) => v === "ALL" || v === cur || cnt[v] || ["삭제", "제외", "보류"].indexOf(v) === -1)
      .map(([v, label, cls]) => `<button type="button" class="neo-chip ${cls}${cur === v ? " active" : ""}" data-click="StatusChips.set" data-click-args="${UiEvents.args(k, v)}" aria-pressed="${cur === v ? "true" : "false"}">${label} <b>${cnt[v] || 0}</b></button>`).join("");
    if (typeof I18N !== "undefined") I18N.translateTree(box);
  }
};

// -----------------------------------------------------------------------------
// 5. 왼쪽 메뉴 접기
// -----------------------------------------------------------------------------
var NeoSide = {
  KEY: "IOSTAR_NEO_SIDE_COLLAPSED",
  collapsed() { return NeoUtil.store(this.KEY) === "1"; },
  toggle() {
    NeoUtil.store(this.KEY, this.collapsed() ? "0" : "1");
    this.sync();
    if (typeof renderGantt === "function") setTimeout(renderGantt, 60);
  },
  sync() {
    document.body.classList.toggle("neo-side-collapsed", this.collapsed());
    const b = document.getElementById("neoSideToggle");
    if (b) {
      b.textContent = this.collapsed() ? "»" : "« 메뉴 접기";
      b.title = this.collapsed() ? "메뉴 펼치기" : "메뉴 접기 (아이콘만 표시)";
      if (typeof I18N !== "undefined") I18N.translateTree(b.parentNode);
    }
  },
  apply(nav) {
    nav = nav || document.getElementById("gNav");
    const side = nav && nav.querySelector(".g-nav-side");
    if (!side) return;
    if (!side.querySelector("#neoSideToggle")) {
      side.insertAdjacentHTML("afterbegin", '<button type="button" id="neoSideToggle" class="neo-side-toggle" data-click="NeoSide.toggle"></button>');
    }
    // 접었을 때 아이콘만 보이므로 이름을 말풍선으로
    side.querySelectorAll(".g-side-item").forEach(b => { if (!b.title) b.title = b.textContent.trim(); });
    this.sync();
  }
};

// Esc: 상세 패널 닫기 (검색 창·대화 상자가 열려 있지 않을 때)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !NeoDetail.isOpen()) return;
  const pal = document.getElementById("gPalette");
  if (pal && !pal.hidden) return;
  NeoDetail.close();
});
// 데이터가 바뀌면 메뉴 배지 갱신 (가벼운 계산이므로 짧은 주기로 확인)
setInterval(() => { if (UiMode.isNeo() && document.getElementById("gNav")) NeoBadges.refresh(); }, 2000);
// WBS 화면을 떠나면 상세 패널 닫기
(function watchWbsPane() {
  const start = () => {
    const pane = document.getElementById("tab-wbs");
    if (!pane) return;
    new MutationObserver(() => { if (!pane.classList.contains("active") && NeoDetail.isOpen()) NeoDetail.close(); })
      .observe(pane, { attributes: true, attributeFilter: ["class"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

// -----------------------------------------------------------------------------
// 6. [Neo 2.2] 화면 머리줄 통일 · 내려받기/올리기 메뉴
//  - 모든 화면 맨 위: 왼쪽 [제목 + 한 줄 설명], 오른쪽 [화면 버튼 · ⬇ 내려받기 ▾ · ⬆ 올리기 ▾ · 저장 상태/저장/새로고침]
//  - 화면마다 따로 있던 저장 줄(.sync-toolbar)은 머리줄 오른쪽 끝으로 옮김
//  - 머리줄의 내려받기(엑셀·워드·JSON·PPT) 버튼은 [⬇ 내려받기] 메뉴로, 올리기 버튼은 [⬆ 올리기] 메뉴로 묶음
// -----------------------------------------------------------------------------
var NeoPage = {
  init() {
    if (this._ready || !UiMode.isNeo()) return;
    this._ready = true;
    document.querySelectorAll(".tab-pane").forEach(pane => this.normalize(pane));
    document.addEventListener("click", e => {
      if (!e.target.closest(".neo-dd")) this.closeMenus();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") this.closeMenus(); });
  },

  normalize(pane) {
    const head = pane.querySelector(":scope > .sub-header-bar");
    if (!head || head.classList.contains("neo-ph")) return;
    head.classList.add("neo-ph");
    head.removeAttribute("style");
    const title = head.querySelector(".sub-title");
    const desc = head.querySelector(".neo-ph-desc");
    const main = document.createElement("div");
    main.className = "neo-ph-main";
    if (title) main.appendChild(title);
    if (desc) main.appendChild(desc);
    const actions = document.createElement("div");
    actions.className = "neo-ph-actions";
    // 제목 외의 요소(배지·버튼 등)는 순서대로 오른쪽으로 (기준일 배지는 머리글에 있으므로 숨김)
    Array.prototype.slice.call(head.childNodes).forEach(n => {
      if (n.nodeType !== 1) return;
      Array.prototype.slice.call(n.children || []).forEach(c => {
        if (c === title || c === desc) return;
        actions.appendChild(c);
      });
      if (n !== main) n.remove();
    });
    actions.querySelectorAll(".current-date-badge").forEach(b => { if (b.querySelector(".lbl-current-date")) b.classList.add("neo-hide"); });
    head.innerHTML = "";
    head.appendChild(main);
    head.appendChild(actions);
    this.groupIO(actions);
    // 저장 줄을 머리줄 오른쪽 끝으로 (자리표시는 남겨 중복 생성 방지)
    const bar = pane.querySelector(":scope > .sync-toolbar");
    if (bar) {
      const holder = document.createElement("div");
      holder.className = "sync-toolbar neo-hide";
      holder.setAttribute("aria-hidden", "true");
      bar.parentNode.insertBefore(holder, bar);
      bar.classList.add("neo-ph-sync");
      const scope = bar.querySelector(".sync-toolbar-scope");
      if (scope) { bar.title = "저장 범위: " + scope.textContent.replace(/^🗂️\s*/, ""); scope.classList.add("neo-hide"); }
      actions.appendChild(bar);
    }
    if (typeof I18N !== "undefined") I18N.translateTree(head);
  },

  // 내려받기(-down, 📥) · 올리기(-up, 📤) 버튼을 메뉴로 묶음
  groupIO(actions) {
    const btns = Array.prototype.slice.call(actions.querySelectorAll("button"));
    const isDown = b => /-down$/.test(b.getAttribute("data-btn") || "") || /^\s*📥/.test(b.textContent);
    const isUp = b => /-up$/.test(b.getAttribute("data-btn") || "") || /^\s*📤/.test(b.textContent);
    const make = (list, key, label) => {
      if (!list.length) return;
      const wrap = document.createElement("div");
      wrap.className = "neo-dd";
      wrap.setAttribute("data-dd", key);
      wrap.innerHTML = `<button type="button" class="btn btn-sm neo-dd-btn" data-btn="${key === "down" ? "excel-down" : "json-up"}" data-click="NeoPage.toggle" data-click-args="${UiEvents.args(key)}" aria-haspopup="true" aria-expanded="false">${label} ▾</button><div class="neo-dd-menu" role="menu" hidden></div>`;
      const menu = wrap.querySelector(".neo-dd-menu");
      const lbl = actions.querySelector(".neo-dd-label");
      if (lbl && key === "down") { lbl.classList.add("neo-dd-title"); menu.appendChild(lbl); }
      // 버튼을 놓여 있던 자리에 메뉴를 둠
      list[0].parentNode.insertBefore(wrap, list[0]);
      list.forEach(b => { b.classList.add("neo-dd-item"); b.setAttribute("role", "menuitem"); menu.appendChild(b); });
      // 빈 묶음 상자(버튼만 담고 있던 div) 정리
      Array.prototype.slice.call(actions.querySelectorAll("div")).forEach(d => {
        if (!d.closest(".neo-dd") && !d.classList.contains("sync-toolbar") && !d.children.length && !d.textContent.trim()) d.remove();
      });
    };
    make(btns.filter(isDown), "down", "⬇ 내려받기");
    make(btns.filter(isUp), "up", "⬆ 올리기");
  },

  toggle(key, ev) {
    const pane = document.querySelector(".tab-pane.active");
    const wrap = pane && pane.querySelector(`.neo-ph .neo-dd[data-dd="${key}"]`);
    if (!wrap) return;
    const menu = wrap.querySelector(".neo-dd-menu");
    const open = menu.hidden;
    this.closeMenus();
    menu.hidden = !open;
    wrap.querySelector(".neo-dd-btn").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const first = menu.querySelector("button:not([disabled])");
      if (first) first.focus();
    }
  },
  closeMenus() {
    document.querySelectorAll(".neo-dd-menu").forEach(m => { m.hidden = true; });
    document.querySelectorAll(".neo-dd-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
  }
};
// 메뉴 항목을 누르면 메뉴 닫기 (항목 동작은 원래 버튼의 data-click 그대로)
document.addEventListener("click", e => {
  if (e.target.closest(".neo-dd-item")) setTimeout(() => NeoPage.closeMenus(), 0);
}, true);

// -----------------------------------------------------------------------------
// [v3.1.0] 화면 설정 메뉴: 테마 견본 · 글자 크기 (보통 100% / 크게 115% / 아주 크게 130%)
//  [v3.2.0] 글자 크기 토큰(--fs-scale) 방식 — 글자만 커지고 칸·여백은 유지, 사용자별 기억
// -----------------------------------------------------------------------------
var UiScale = {
  KEY: "IOSTAR_UI_SCALE_",
  STEPS: [1, 1.15, 1.3],
  _key() { const u = (typeof AuthManager !== "undefined" && AuthManager.currentUser) || {}; return this.KEY + (u.empNo || "_"); },
  get() {
    let v = 1;
    try { v = parseFloat(localStorage.getItem(this._key()) || localStorage.getItem(this.KEY + "_") || "1"); } catch (e) {}
    return this.STEPS.indexOf(v) === -1 ? 1 : v;
  },
  apply(v) {
    v = v || this.get();
    // [v3.2.0] 화면 확대(zoom) 대신 글자 크기 토큰(--fs-scale)만 바꿈 — 배치는 유지되고 글자만 커짐
    document.documentElement.style.zoom = "";
    if (v === 1) document.documentElement.style.removeProperty("--fs-scale");
    else document.documentElement.style.setProperty("--fs-scale", String(v));
    document.documentElement.dataset.uiScale = String(v);
    this.sync();
    if (typeof renderGantt === "function" && document.querySelector("#tab-gantt.active")) setTimeout(renderGantt, 60);
  },
  set(v) {
    v = parseFloat(v);
    if (this.STEPS.indexOf(v) === -1) v = 1;
    try { localStorage.setItem(this._key(), String(v)); localStorage.setItem(this.KEY + "_", String(v)); } catch (e) {}
    this.apply(v);
  },
  pickTheme(t) {
    if (typeof changeTheme === "function") changeTheme(t);
    const sel = document.getElementById("themeSelector");
    if (sel) sel.value = t;
    this.sync();
  },
  sync() {
    const v = this.get();
    document.querySelectorAll(".g-scale").forEach(b => { const on = parseFloat(b.dataset.scale) === v; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    const th = document.body.dataset.theme;
    document.querySelectorAll(".g-swatch").forEach(b => { const on = b.dataset.themePick === th; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
};
UiScale.apply();

// -----------------------------------------------------------------------------
// [v3.1.0] WBS 담당자 · 산출물 칸 접기 ([v3.2.0] 가중치 · REQ ID 도 함께) — 접으면 표 전체가 한 화면에 들어오고, 펼치면 가로 스크롤
//  사용자별 기억, 처음에는 화면 폭이 1600px 보다 좁으면 접힌 상태
// -----------------------------------------------------------------------------
var WbsFold = {
  KEY: "IOSTAR_WBS_FOLD_",
  _key() { const u = (typeof AuthManager !== "undefined" && AuthManager.currentUser) || {}; return this.KEY + (u.empNo || "_"); },
  isFolded() {
    let v = null;
    try { v = localStorage.getItem(this._key()); } catch (e) {}
    return v === null ? window.innerWidth < 1600 : v === "1";
  },
  toggle() {
    const next = !this.isFolded();
    try { localStorage.setItem(this._key(), next ? "1" : "0"); } catch (e) {}
    this.apply();
  },
  apply() {
    const t = document.getElementById("wbsTable");
    const on = this.isFolded();
    if (t) t.classList.toggle("wbs-fold", on);
    const b = document.getElementById("btnWbsFold");
    if (b) {
      b.textContent = on ? "▶ 가중치·REQ·담당자·산출물 펼치기" : "◀ 가중치·REQ·담당자·산출물 접기";
      b.title = on ? "접어 둔 가중치 · REQ ID · 담당자 · 산출물 칸을 다시 보여 줍니다 (표가 넓어지면 가로 스크롤)" : "가중치 · REQ ID · 담당자 · 산출물 칸을 접어 표 전체를 한 화면에 봅니다";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (typeof I18N !== "undefined") I18N.translateTree(b.parentNode);
    }
  }
};

// =============================================================================
// [v3.7.0] 고정 줄 위치: 위쪽에 고정된 머리글 · 메뉴 줄의 높이를 --sticky-top 으로 알려 줌
//  (서브 탭 줄이 그 바로 아래에 붙어 고정되도록 — 글자 크기 · 메뉴 위치가 바뀌어도 다시 계산)
// =============================================================================
var StickyTop = {
  apply() {
    let top = 0;
    const root = document.documentElement.style;
    [document.querySelector("header"), document.querySelector(".g-nav")].forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).position === "sticky" && r.width > window.innerWidth * 0.6) top += r.height;
      if (i === 0) root.setProperty("--hdr-h", Math.round(top) + "px");  // 메뉴 줄은 머리글 바로 아래에 고정
    });
    root.setProperty("--sticky-top", Math.round(top) + "px");
  },
  init() {
    this.apply();
    window.addEventListener("resize", () => this.apply());
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.apply());
      [document.querySelector("header"), document.querySelector(".g-nav")].forEach(el => { if (el) ro.observe(el); });
    }
  }
};
window.StickyTop = StickyTop;
window.addEventListener("DOMContentLoaded", () => StickyTop.init());
