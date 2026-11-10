// =============================================================================
// [IOSTAR-PM v2.4.0] 내 할 일 (TodoCenter) — 홈 스타일 [✅ 내 할 일]
// -----------------------------------------------------------------------------
//  - 내가 등록한 할 일: 제목 · 마감일 · 중요도 · (선택) WBS/VOC/요구사항/회의 연결 · 완료 체크 · 수정 · 삭제
//  - 확인할 일 (자동): 지연 과업 · 7일 안 마감 과업 · 미조치 VOC · 확인할 산출물 · 미완료 Action Item
//      → [할 일로 담기] (내 할 일로 복사, 원본과 연결) · [7일 숨김]
//  - 저장: todosData (행마다 owner = 사번). 본인 항목만 보고 고칠 수 있음
//      (DB 서버는 본인 항목만 내려주고, 다른 사람 항목 저장은 거부)
//  - 화면 방식(Standard / Neo)과 관계없이 동작
// =============================================================================
var TodoCenter = {
  PRI: { H: "높음", M: "보통", L: "낮음" },
  LINKS: { WBS: "WBS", VOC: "VOC", REQ: "요구사항", MTG: "회의" },
  KEY_MINE: "IOSTAR_TODO_MINE_",
  filter: "open",
  _editing: null,

  // ---- 데이터 ----
  me() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
    return String((u && u.empNo) || "").toLowerCase();
  },
  rows() { const me = this.me(); return (todosData || []).filter(r => r && String(r.owner || "").toLowerCase() === me); },
  todos() { return this.rows().filter(r => (r.kind || "todo") === "todo"); },
  hides() { return this.rows().filter(r => r.kind === "hide"); },
  rep() { return NeoUtil.rep(); },
  newId(prefix) { return `${prefix}-${this.me()}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; },

  async save() {
    if (typeof SyncManager !== "undefined") {
      try { await SyncManager.save(["todosData"], { notify: false }); } catch (e) {}
    } else if (typeof persistChanges === "function") persistChanges();
    this.render();
    this.updateCounts();
  },

  // 내 담당만 (사용자별 기억) — 기본: 담당 서브시스템이 정해진 사용자는 켬
  mine() {
    try {
      const v = localStorage.getItem(this.KEY_MINE + this.me());
      if (v === "1" || v === "0") return v === "1";
    } catch (e) {}
    return !!NeoTodo.ownSystem();
  },
  toggleMine() {
    try { localStorage.setItem(this.KEY_MINE + this.me(), this.mine() ? "0" : "1"); } catch (e) {}
    this.render();
    this.updateCounts();
  },

  isHidden(key) {
    const today = this.rep();
    return this.hides().some(h => h.key === key && (!h.until || h.until >= today));
  },

  // ---- 확인할 일 (자동) ----
  autoGroups() {
    const c = NeoTodo.collect(null, this.mine());
    const g = [
      { key: "delay", icon: "🔴", title: "지연 과업", items: c.delayed.map(x => ({ k: `WBS:${x.t.id}`, type: "WBS", id: x.t.id, title: `${x.t.id} ${x.t.name || ""}`, sub: `${x.t.system || ""} · 계획 ${x.t.pProg}% / 실적 ${x.t.aProg}%`, due: x.t.pEnd, tag: `-${Math.round(x.gap)}%p` })) },
      { key: "soon", icon: "⏰", title: `${NeoTodo.DUE_DAYS}일 안 마감`, items: c.dueSoon.map(t => ({ k: `WBS:${t.id}`, type: "WBS", id: t.id, title: `${t.id} ${t.name || ""}`, sub: `${t.system || ""} · 실적 ${t.aProg}%`, due: t.pEnd })) },
      { key: "voc", icon: "📣", title: "미조치 VOC", items: c.vocs.map(v => ({ k: `VOC:${v.id}`, type: "VOC", id: v.id, title: `${v.id} ${v.title || ""}`, sub: `${v.system || ""} · ${v.priority || ""} · ${v.status || ""}`, due: v.targetDate })) },
      { key: "deliv", icon: "📑", title: "확인할 산출물", items: c.delivs.map(d => ({ k: `DLV:${d.id}`, type: "DLV", id: d.name, title: d.name || "", sub: `${d.system || ""} · ${d.round || ""} · ${d.status || ""}`, due: d.pDate })) },
      { key: "act", icon: "⚡", title: "미완료 Action Item", items: c.actions.map(a => ({ k: `ACT:${a._mtg}:${a.id || a.title}`, type: "MTG", id: a._mtg, title: a.title || "", sub: `${a.assignee || ""} · ${a.system || ""}`, due: a.targetDate })) }
    ];
    let hidden = 0;
    g.forEach(x => { const before = x.items.length; x.items = x.items.filter(i => !this.isHidden(i.k)); hidden += before - x.items.length; });
    return { groups: g, hidden };
  },

  // ---- 내 할 일 ----
  sorted(list) {
    const pr = { H: 0, M: 1, L: 2 };
    return list.slice().sort((a, b) => (a.done - b.done) || String(a.due || "9999").localeCompare(String(b.due || "9999")) || ((pr[a.priority] ?? 1) - (pr[b.priority] ?? 1)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  },
  stats() {
    const today = this.rep(), soon = NeoUtil.addDays(today, NeoTodo.DUE_DAYS);
    const open = this.todos().filter(t => !t.done);
    let wk = null;
    try { wk = WBSEngine.getWeekRange(today, projectConfig.weekStartDay); } catch (e) {}
    const wkStart = wk ? (wk.start || wk.startDate || wk[0]) : NeoUtil.addDays(today, -6);
    return {
      open: open.length,
      late: open.filter(t => t.due && t.due < today).length,
      today: open.filter(t => t.due === today).length,
      soon: open.filter(t => t.due && t.due > today && t.due <= soon).length,
      doneWeek: this.todos().filter(t => t.done && t.doneAt && t.doneAt >= wkStart).length
    };
  },

  _link(type, id) {
    if (!type || !id) return null;
    const exists = {
      WBS: () => (wbsData || []).some(t => String(t.id) === id),
      VOC: () => (vocData || []).some(v => String(v.id) === id),
      REQ: () => (reqMasterData || []).some(r => String(r.id) === id),
      MTG: () => (meetingsData || []).some(m => String(m.id) === id)
    }[type];
    return exists && exists() ? { type, id } : null;
  },

  add() {
    const v = id => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
    const title = v("todoNewTitle");
    if (!title) { showToast("할 일 내용을 입력하세요."); const el = document.getElementById("todoNewTitle"); if (el) el.focus(); return; }
    const lt = v("todoNewLinkType"), lid = v("todoNewLinkId");
    const link = this._link(lt, lid);
    if (lt && lid && !link) showToast(`⚠️ [${this.LINKS[lt]}] ${lid} 을(를) 찾을 수 없어 연결 없이 등록합니다.`);
    todosData.push({
      id: this.newId("TD"), owner: this.me(), kind: "todo", title: title.slice(0, 200),
      due: v("todoNewDue"), priority: this.PRI[v("todoNewPri")] ? v("todoNewPri") : "M",
      link, done: false, doneAt: "", createdAt: new Date().toISOString().slice(0, 19).replace("T", " ")
    });
    this.save();
  },
  _find(id) { return this.todos().find(t => t.id === id); },
  toggle(id) {
    const t = this._find(id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? this.rep() : "";
    this.save();
  },
  remove(id) {
    const i = (todosData || []).findIndex(t => t.id === id && String(t.owner || "").toLowerCase() === this.me());
    if (i === -1) return;
    todosData.splice(i, 1);
    if (this._editing === id) this._editing = null;
    this.save();
  },
  clearDone() {
    const me = this.me();
    const before = todosData.length;
    todosData = todosData.filter(t => !(String(t.owner || "").toLowerCase() === me && (t.kind || "todo") === "todo" && t.done));
    if (todosData.length !== before) this.save();
  },
  edit(id) { this._editing = this._editing === id ? null : id; this.render(); },
  saveEdit(id) {
    const t = this._find(id);
    if (!t) return;
    const v = sel => { const el = document.querySelector(sel); return el ? String(el.value || "").trim() : ""; };
    const title = v(`[data-todo-edit="title"]`);
    if (!title) return showToast("할 일 내용을 입력하세요.");
    t.title = title.slice(0, 200);
    t.due = v(`[data-todo-edit="due"]`);
    t.priority = this.PRI[v(`[data-todo-edit="pri"]`)] ? v(`[data-todo-edit="pri"]`) : "M";
    this._editing = null;
    this.save();
  },
  setFilter(f) { this.filter = f; this.render(); },

  // 확인할 일 → 내 할 일로 담기
  fromAuto(key) {
    const item = this.autoGroups().groups.reduce((a, g) => a.concat(g.items), []).find(i => i.k === key);
    if (!item) return;
    if (this.todos().some(t => t.autoKey === key && !t.done)) return showToast("이미 내 할 일에 담겨 있습니다.");
    const link = item.type === "DLV" ? null : this._link(item.type, String(item.id));
    todosData.push({
      id: this.newId("TD"), owner: this.me(), kind: "todo", title: item.title.slice(0, 200), due: item.due || "",
      priority: key.indexOf("WBS:") === 0 && /^-/.test(item.tag || "") ? "H" : "M", link, autoKey: key,
      done: false, doneAt: "", createdAt: new Date().toISOString().slice(0, 19).replace("T", " ")
    });
    showToast("✅ 내 할 일에 담았습니다.");
    this.save();
  },
  hide(key) {
    todosData.push({ id: this.newId("TH"), owner: this.me(), kind: "hide", key, until: NeoUtil.addDays(this.rep(), 7), createdAt: new Date().toISOString().slice(0, 19).replace("T", " ") });
    this.save();
  },
  unhideAll() {
    const me = this.me();
    todosData = todosData.filter(t => !(String(t.owner || "").toLowerCase() === me && t.kind === "hide"));
    this.save();
  },

  openLink(type, id) {
    if (type === "WBS") {
      if (typeof UiMode !== "undefined" && UiMode.isNeo()) return NeoTodo.openTask(id);
      return GShell.reveal("tab-wbs", id);
    }
    if (type === "VOC") return GShell.reveal("tab-voc", id);
    if (type === "REQ") return GShell.reveal("tab-req", id);
    if (type === "DLV") return GShell.reveal("tab-deliverables", id);
    if (type === "MTG") return GShell.go("tab-meeting");
  },
  openHome() {
    GShell.go("tab-home");
    if (typeof HomeScreenManager !== "undefined") HomeScreenManager.setStyle("TODO");
  },

  // 홈 단추 · 메뉴 배지용: 기한 지남 + 오늘 마감 (내가 등록한 할 일)
  urgent() { const s = this.stats(); return s.late + s.today; },
  updateCounts() {
    const el = document.getElementById("homeTodoCount");
    if (!el) return;
    const n = this.me() ? this.urgent() : 0;
    el.hidden = !n;
    el.textContent = n;
    el.title = n ? `기한 지남·오늘 마감 ${n}건` : "";
  },

  // ---- 화면 ----
  due(iso) {
    if (!iso) return '<span class="todo-due none">마감 없음</span>';
    const n = NeoUtil.daysLeft(iso);
    return `<span class="todo-due${n < 0 ? " late" : n === 0 ? " today" : n <= 2 ? " near" : ""}" title="${escapeAttr(iso)}">${NeoUtil.dueText(iso)}</span>`;
  },
  render() {
    const box = document.getElementById("homeTodoContainer");
    if (!box || box.style.display === "none") return;
    const s = this.stats();
    const auto = this.autoGroups();
    const autoTotal = auto.groups.reduce((a, g) => a + g.items.length, 0);
    const all = this.sorted(this.todos());
    const list = this.filter === "done" ? all.filter(t => t.done) : this.filter === "all" ? all : all.filter(t => !t.done);
    const A = (...a) => UiEvents.args(...a);
    const own = NeoTodo.ownSystem();
    const priOpts = cur => Object.keys(this.PRI).map(k => `<option value="${k}" ${k === cur ? "selected" : ""}>${this.PRI[k]}</option>`).join("");
    const row = t => {
      if (this._editing === t.id) {
        return `<li class="todo-item editing">
          <input type="text" data-todo-edit="title" value="${escapeAttr(t.title)}" maxlength="200" aria-label="할 일 내용">
          <input type="date" data-todo-edit="due" value="${escapeAttr(t.due || "")}" aria-label="마감일">
          <select data-todo-edit="pri" aria-label="중요도">${priOpts(t.priority)}</select>
          <button type="button" class="btn btn-xs" data-btn="save" data-click="TodoCenter.saveEdit" data-click-args="${A(t.id)}">저장</button>
          <button type="button" class="btn btn-xs" data-btn="cancel" data-click="TodoCenter.edit" data-click-args="${A(t.id)}">취소</button>
        </li>`;
      }
      const link = t.link ? `<button type="button" class="todo-link" data-click="TodoCenter.openLink" data-click-args="${A(t.link.type, t.link.id)}" title="연결된 항목 열기">${escapeHtml(this.LINKS[t.link.type] || t.link.type)} ${escapeHtml(t.link.id)}</button>` : "";
      return `<li class="todo-item${t.done ? " done" : ""}">
        <input type="checkbox" class="todo-check" ${t.done ? "checked" : ""} data-change="TodoCenter.toggle" data-change-args="${A(t.id)}" aria-label="완료">
        <span class="todo-pri pri-${escapeAttr(t.priority || "M")}" title="중요도 ${escapeAttr(this.PRI[t.priority] || "보통")}"></span>
        <span class="todo-title">${escapeHtml(t.title)}</span>
        ${link}
        ${t.done ? `<span class="todo-due none">${escapeHtml(t.doneAt || "")} 완료</span>` : this.due(t.due)}
        <span class="todo-actions">
          <button type="button" class="todo-icon" data-click="TodoCenter.edit" data-click-args="${A(t.id)}" title="수정" aria-label="수정">✎</button>
          <button type="button" class="todo-icon" data-click="TodoCenter.remove" data-click-args="${A(t.id)}" title="삭제" aria-label="삭제">✕</button>
        </span>
      </li>`;
    };
    const tile = (label, n, cls) => `<div class="todo-tile ${cls}"><span>${label}</span><b>${n}</b></div>`;
    box.innerHTML = `
      <div class="todo-home">
        <div class="todo-tiles">
          ${tile("기한 지남", s.late, s.late ? "late" : "")}
          ${tile("오늘 마감", s.today, s.today ? "today" : "")}
          ${tile(`${NeoTodo.DUE_DAYS}일 안 마감`, s.soon, "")}
          ${tile("남은 할 일", s.open, "")}
          ${tile("이번 주 완료", s.doneWeek, "ok")}
          ${tile("확인할 일 (자동)", autoTotal, autoTotal ? "auto" : "")}
        </div>
        <div class="todo-grid">
          <section class="card todo-panel">
            <div class="todo-head">
              <h3>📝 내가 등록한 할 일</h3>
              <div class="todo-filters" role="group" aria-label="보기">
                ${[["open", "진행 중", all.filter(t => !t.done).length], ["done", "완료", all.filter(t => t.done).length], ["all", "전체", all.length]].map(([k, l, n]) =>
                  `<button type="button" class="todo-filter${this.filter === k ? " active" : ""}" data-click="TodoCenter.setFilter" data-click-args="${A(k)}" aria-pressed="${this.filter === k}">${l} <b>${n}</b></button>`).join("")}
              </div>
            </div>
            <div class="todo-form">
              <input type="text" id="todoNewTitle" maxlength="200" placeholder="할 일을 입력하고 Enter (예: 2회차 산출물 검토 의견 회신)" aria-label="할 일 내용" data-keypress="TodoCenter.add" data-keypress-key="Enter">
              <input type="date" id="todoNewDue" aria-label="마감일" title="마감일">
              <select id="todoNewPri" aria-label="중요도" title="중요도">${priOpts("M")}</select>
              <select id="todoNewLinkType" aria-label="연결할 항목 종류" title="연결할 항목 (선택)">
                <option value="">연결 없음</option>${Object.keys(this.LINKS).map(k => `<option value="${k}">${this.LINKS[k]}</option>`).join("")}
              </select>
              <input type="text" id="todoNewLinkId" placeholder="ID (예: 1.2.1.1, VOC-06)" aria-label="연결할 항목 ID">
              <button type="button" class="btn btn-sm" data-btn="add" data-click="TodoCenter.add">➕ 추가</button>
            </div>
            ${list.length ? `<ul class="todo-list">${list.map(row).join("")}</ul>`
              : `<div class="todo-empty">${this.filter === "done" ? "완료한 할 일이 없습니다." : "등록한 할 일이 없습니다. 위에 입력하거나, 오른쪽 확인할 일에서 [할 일로 담기]를 누르세요."}</div>`}
            ${all.some(t => t.done) ? `<div class="todo-foot"><button type="button" class="btn btn-xs" data-btn="neutral" data-click="TodoCenter.clearDone">완료 항목 지우기</button><span>내 할 일은 본인만 볼 수 있습니다.</span></div>` : `<div class="todo-foot"><span>내 할 일은 본인만 볼 수 있습니다.</span></div>`}
          </section>
          <section class="card todo-panel">
            <div class="todo-head">
              <h3>🔔 확인할 일 <small>(자동)</small></h3>
              <label class="todo-mine"><input type="checkbox" data-change="TodoCenter.toggleMine" ${this.mine() ? "checked" : ""}> 내 담당만${own ? ` (${escapeHtml(own)})` : ""}</label>
            </div>
            <div class="todo-auto-hint">기준일 ${escapeHtml(this.rep())} · 마감 ${NeoTodo.DUE_DAYS}일 이내 · 원본 데이터가 처리되면 자동으로 사라집니다.
              ${auto.hidden ? `<span> · 숨긴 항목 ${auto.hidden}건</span> <button type="button" class="todo-linkbtn" data-click="TodoCenter.unhideAll">다시 보기</button>` : ""}</div>
            ${auto.groups.map(g => `
              <div class="todo-auto-group">
                <div class="todo-auto-title"><span>${g.icon} <span>${g.title}</span></span><b>${g.items.length}</b></div>
                ${g.items.length ? `<ul class="todo-auto-list">${g.items.slice(0, 6).map(i => `
                  <li>
                    <button type="button" class="todo-auto-main" data-click="TodoCenter.openLink" data-click-args="${A(i.type, String(i.id))}">
                      <span class="todo-auto-name">${escapeHtml(i.title)}</span><span class="todo-auto-sub">${escapeHtml(i.sub)}</span></button>
                    ${i.tag ? `<span class="todo-gap">${escapeHtml(i.tag)}</span>` : this.due(i.due)}
                    <button type="button" class="todo-icon" data-click="TodoCenter.fromAuto" data-click-args="${A(i.k)}" title="내 할 일로 담기" aria-label="내 할 일로 담기">＋</button>
                    <button type="button" class="todo-icon" data-click="TodoCenter.hide" data-click-args="${A(i.k)}" title="7일 동안 숨기기" aria-label="7일 동안 숨기기">⤫</button>
                  </li>`).join("")}</ul>${g.items.length > 6 ? `<div class="todo-more">외 ${g.items.length - 6}건</div>` : ""}` : `<div class="todo-auto-empty">✓ 없음</div>`}
              </div>`).join("")}
          </section>
        </div>
      </div>`;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(box);
    if (typeof I18N !== "undefined") I18N.translateTree(box);
  }
};
