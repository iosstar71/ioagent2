// =============================================================================
// [Project Mgmt Standard v1.0.1] 화면 틀 (B2 레이아웃, G v1.0.0 에서 이름 변경 — 내부 이름 GShell·g-edition 은 호환을 위해 유지)
// -----------------------------------------------------------------------------
//  - 2단 메뉴: 업무 묶음 4개 + 선택한 묶음의 하위 메뉴 (위쪽 메뉴가 가로로 넘치지 않음)
//  - ⚙ 관리 메뉴: 기준정보 · 스마트 병합 · 시스템 설정 · 프로젝트 관리 · 법적 고지 (권한 없으면 숨김)
//  - 작업자 메뉴: 테마 3종 · 메뉴 위치(위쪽/왼쪽, 선택 설정) · 화면 밀도 · 언어 · 암호 · 잠금
//  - 검색 (Ctrl+K): 화면 · WBS · 요구사항 · VOC · 작업자
//  - 즐겨찾기: 자주 쓰는 화면 최대 3개를 메뉴 줄에 고정
//  - 아래 고정 줄: DB 서버 모드에서 저장하지 않은 변경이 있으면 표시 (Ctrl+S 로 모두 저장)
//  ※ 기존 탭 버튼(.tab-bar)은 권한 판정·호환을 위해 숨긴 채 유지하고, 화면 전환은 기존 switchTab 을 사용
// =============================================================================
var GShell = {
  GROUPS: [
    { key: "ov", label: "개요", icon: "🧭", tabs: ["tab-home", "tab-dashboard", "tab-matrix"] },
    { key: "sc", label: "일정", icon: "🗓️", tabs: ["tab-wbs", "tab-gantt"] },
    { key: "sq", label: "범위·품질", icon: "🎯", tabs: ["tab-req", "tab-voc", "tab-deliverables"] },
    { key: "co", label: "보고·협업", icon: "🤝", tabs: ["tab-weekly-report", "tab-meeting", "tab-notices"] }
  ],
  ADMIN_TABS: ["tab-master", "tab-merge", "tab-config"],
  LABELS: {
    "tab-home": "홈", "tab-dashboard": "대시보드", "tab-matrix": "단계별 진척",
    "tab-wbs": "WBS 공정", "tab-gantt": "간트차트",
    "tab-req": "요구사항", "tab-voc": "VOC·이슈", "tab-deliverables": "산출물",
    "tab-weekly-report": "주간보고", "tab-meeting": "회의관리", "tab-notices": "공지·소통",
    "tab-master": "기준정보", "tab-merge": "스마트 병합", "tab-config": "시스템 설정"
  },
  ICONS: {
    "tab-home": "🏠", "tab-dashboard": "📊", "tab-matrix": "📈", "tab-wbs": "📋", "tab-gantt": "🗓️",
    "tab-req": "📌", "tab-voc": "📣", "tab-deliverables": "📑", "tab-weekly-report": "📝", "tab-meeting": "📅",
    "tab-notices": "📢", "tab-master": "🗂️", "tab-merge": "🔀", "tab-config": "⚙️"
  },
  KEY_LAST: "IOSTAR_G_LAST_TAB_",
  KEY_FAV: "IOSTAR_G_FAVORITES",
  MAX_FAV: 3,
  current: "tab-home",

  init() {
    if (this._ready) return;
    this._ready = true;
    document.body.classList.add("g-edition");
    // 메뉴 위치는 위쪽/왼쪽 2가지만 사용 (이전 레이아웃 값은 위쪽 메뉴로)
    const layout = document.body.getAttribute("data-layout");
    if (layout !== "top-nav" && layout !== "sidebar-left" && typeof LayoutManager !== "undefined") LayoutManager.setLayout("top-nav", false);
    const theme = document.body.getAttribute("data-theme");
    if (typeof normalizeTheme === "function" && normalizeTheme(theme) !== theme) document.body.setAttribute("data-theme", normalizeTheme(theme));
    this.renderNav();
    this.renderAdmin();
    this.syncSettings();
    // 화면 전환 감지 (기존 activateTab 이 .tab-pane.active 를 바꾸면 메뉴 표시 갱신)
    const panes = document.querySelectorAll(".tab-pane");
    const mo = new MutationObserver(() => {
      const a = document.querySelector(".tab-pane.active");
      if (a && a.id !== this.current) this.sync(a.id);
    });
    panes.forEach(p => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
    // 권한별 탭 숨김(기존 탭 버튼의 표시 여부)이 바뀌면 메뉴 다시 그림
    const bar = document.querySelector(".tab-bar");
    if (bar) new MutationObserver(() => this.refresh()).observe(bar, { attributes: true, subtree: true, attributeFilter: ["style", "class"] });
    document.addEventListener("click", e => {
      if (!e.target.closest(".g-menu-wrap")) this.closeMenus();
    });
    document.addEventListener("keydown", e => this.onKey(e));
    const a = document.querySelector(".tab-pane.active");
    this.sync(a ? a.id : "tab-home");
    this._wrapIndicators();
  },

  // ---- 권한: 기존 탭 버튼이 보이는 화면만 메뉴에 표시 ----
  _btn(tabId) {
    return Array.prototype.find.call(document.querySelectorAll(".tab-bar .tab-btn"), b =>
      tabId === "tab-notices" ? b.getAttribute("data-click") === "NoticeCommManager.goToNotice" : (b.getAttribute("data-click-args") || "").indexOf(`"${tabId}"`) !== -1);
  },
  // 권한 없는 관리 화면(기준정보·시스템 설정)은 메뉴에서 숨김 (B2) — 다른 계정이 필요하면 [잠금 / 계정 전환]
  allowed(tabId) {
    if (typeof AuthManager !== "undefined" && AuthManager.TAB_POLICY[tabId] && !AuthManager.canAccessTab(AuthManager.getCurrentRole(), tabId)) return false;
    const b = this._btn(tabId);
    return !b || b.style.display !== "none";
  },
  label(tabId) { return this.LABELS[tabId] || tabId; },
  groupOf(tabId) { return this.GROUPS.find(g => g.tabs.indexOf(tabId) !== -1) || null; },

  go(tabId) {
    if (!tabId) return;
    this.closeMenus();
    if (tabId === "tab-notices" && typeof NoticeCommManager !== "undefined") NoticeCommManager.goToNotice();
    else switchTab(tabId);
  },
  goGroup(key) {
    const g = this.GROUPS.find(x => x.key === key);
    if (!g) return;
    let last = "";
    try { last = localStorage.getItem(this.KEY_LAST + key) || ""; } catch (e) {}
    const target = (last && g.tabs.indexOf(last) !== -1 && this.allowed(last)) ? last : g.tabs.find(t => this.allowed(t));
    this.go(target);
  },

  // ---- 메뉴 줄 ----
  renderNav() {
    const nav = document.getElementById("gNav");
    if (!nav) return;
    const cur = this.current;
    const curGroup = this.groupOf(cur);
    const groups = this.GROUPS.filter(g => g.tabs.some(t => this.allowed(t)));
    const favs = this.favorites().filter(t => this.allowed(t));
    const btn = (tabId, cls) => `<button type="button" class="${cls}${tabId === cur ? " active" : ""}" data-tab="${tabId}" data-click="GShell.go" data-click-args="${UiEvents.args(tabId)}"${tabId === cur ? ' aria-current="page"' : ""}><span class="g-ico">${this.ICONS[tabId] || ""}</span>${escapeHtml(this.label(tabId))}</button>`;
    // 위쪽 메뉴: 묶음 + 선택 묶음의 하위 메뉴 / 왼쪽 메뉴: 모든 묶음과 하위 메뉴를 세로로
    // [Standard v1.0.1] 1단 메뉴(묶음)는 상자형 버튼, 2단 메뉴(하위 화면)는 › 뒤 옅은 띠 위의 밑줄 탭으로 구분
    const subTabs = curGroup ? curGroup.tabs.filter(t => this.allowed(t)) : [];
    const top = `
      <div class="g-groups" role="tablist" aria-label="업무 묶음">${groups.map(g => {
        const on = curGroup && curGroup.key === g.key;
        const n = g.tabs.filter(t => this.allowed(t)).length;
        return `<button type="button" class="g-group${on ? " active" : ""}" role="tab" aria-selected="${on ? "true" : "false"}" data-group="${g.key}" data-click="GShell.goGroup" data-click-args="${UiEvents.args(g.key)}"><span class="g-gico">${g.icon || ""}</span>${escapeHtml(g.label)}<span class="g-group-count">${n}</span></button>`;
      }).join("")}</div>
      <span class="g-crumb" aria-hidden="true">›</span>
      <div class="g-subs">${curGroup ? `<span class="g-sub-label">${escapeHtml(curGroup.label)}</span>` + subTabs.map(t => btn(t, "g-sub")).join("") : `<span class="g-sub-title">${this.ICONS[cur] || ""} ${escapeHtml(this.label(cur))}</span>`}
        <button type="button" class="g-pin${favs.indexOf(cur) !== -1 ? " on" : ""}" data-click="GShell.toggleFavorite" title="현재 화면 즐겨찾기 (최대 ${this.MAX_FAV}개)">${favs.indexOf(cur) !== -1 ? "★" : "☆"}</button>
      </div>
      <div class="g-favs">${favs.length ? `<span class="g-fav-label">★ 즐겨찾기</span>` + favs.map(t => btn(t, "g-fav")).join("") : ""}</div>`;
    const side = `
      ${groups.map(g => `<div class="g-side-group${curGroup && curGroup.key === g.key ? " cur" : ""}"><div class="g-side-title"><span>${g.icon || ""}</span>${escapeHtml(g.label)}</div>${g.tabs.filter(t => this.allowed(t)).map(t => btn(t, "g-side-item")).join("")}</div>`).join("")}
      ${this.ADMIN_TABS.some(t => this.allowed(t)) ? `<div class="g-side-group${this.ADMIN_TABS.indexOf(cur) !== -1 ? " cur" : ""}"><div class="g-side-title"><span>⚙️</span>관리</div>${this.ADMIN_TABS.filter(t => this.allowed(t)).map(t => btn(t, "g-side-item")).join("")}</div>` : ""}`;
    nav.innerHTML = `<div class="g-nav-top">${top}</div><div class="g-nav-side">${side}</div>`;
    if (typeof NeoBadges !== "undefined") NeoBadges.apply(nav); // [Neo 2.1] 메뉴 건수 배지 · 왼쪽 메뉴 접기
    if (typeof I18N !== "undefined") I18N.translateTree(nav);
  },

  renderAdmin() {
    const box = document.getElementById("gAdminItems");
    if (!box) return;
    box.innerHTML = this.ADMIN_TABS.filter(t => this.allowed(t)).map(t =>
      `<button type="button" class="g-menu-item" data-click="GShell.go" data-click-args="${UiEvents.args(t)}">${this.ICONS[t]} ${escapeHtml(this.label(t))}</button>`).join("");
    if (typeof I18N !== "undefined") I18N.translateTree(box);
  },

  refresh() {
    if (this._refreshTimer) return;
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      this.renderNav();
      this.renderAdmin();
    }, 30);
  },

  sync(tabId) {
    this.current = tabId;
    const g = this.groupOf(tabId);
    if (g) { try { localStorage.setItem(this.KEY_LAST + g.key, tabId); } catch (e) {} }
    this.renderNav();
  },

  // ---- 즐겨찾기 ----
  favorites() {
    try { return (JSON.parse(localStorage.getItem(this.KEY_FAV) || "[]") || []).filter(t => this.LABELS[t]); } catch (e) { return []; }
  },
  toggleFavorite() {
    let favs = this.favorites();
    const t = this.current;
    if (favs.indexOf(t) !== -1) favs = favs.filter(x => x !== t);
    else {
      if (favs.length >= this.MAX_FAV) favs.shift();
      favs.push(t);
    }
    try { localStorage.setItem(this.KEY_FAV, JSON.stringify(favs)); } catch (e) {}
    this.renderNav();
  },

  // ---- 펼침 메뉴 ----
  toggleMenu(id) {
    const m = document.getElementById(id);
    if (!m) return;
    const open = m.hidden;
    this.closeMenus();
    m.hidden = !open;
    if (open) {
      this.syncSettings();
      if (id === "gAdminMenu") this.renderAdmin();
      if (typeof I18N !== "undefined") I18N.translateTree(m);
    }
  },
  closeMenus() {
    document.querySelectorAll(".g-menu").forEach(m => { m.hidden = true; });
  },

  syncSettings() {
    const set = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
    set("themeSelector", document.body.getAttribute("data-theme"));
    set("headerLayoutSelector", document.body.getAttribute("data-layout"));
    set("gDensitySelect", document.body.getAttribute("data-density") === "compact" ? "compact" : "standard");
    set("gLangSelect", typeof I18N !== "undefined" ? I18N.lang : "ko");
    if (typeof UiMode !== "undefined") UiMode.syncSelects();
    if (typeof UiScale !== "undefined") UiScale.sync();
  },

  // 언어: 화면에 바로 적용하고 선택한 작업자 설정으로 저장
  setLanguage(lang) {
    const l = lang === "en" ? "en" : "ko";
    if (typeof I18N !== "undefined") I18N.setLanguage(l);
    const u = AuthManager.getCurrentUser();
    if (u && u.empNo && typeof AuthManager._rememberUserLang === "function") AuthManager._rememberUserLang(u.empNo, l);
    this.renderNav();
    this.renderAdmin();
  },

  goPassword() {
    this.closeMenus();
    switchTab("tab-config");
    setTimeout(() => {
      if (typeof SubTabs !== "undefined") { try { SubTabs.show("config", "security"); } catch (e) {} }
      const el = document.getElementById("cfgCurrentPassword");
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
    }, 150);
  },

  // ---- 키보드 ----
  onKey(e) {
    const k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "k") { e.preventDefault(); this.openPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "s") {
      e.preventDefault();
      if (typeof SyncManager !== "undefined") SyncManager.save(null, { notify: true, forceFile: true });
      return;
    }
    if (k === "escape") { this.closeMenus(); this.closePalette(); }
  },

  // ---- 검색 (Ctrl+K) ----
  _palette() {
    let p = document.getElementById("gPalette");
    if (p) return p;
    p = document.createElement("div");
    p.id = "gPalette";
    p.className = "g-palette-overlay";
    p.hidden = true;
    p.innerHTML = `
      <div class="g-palette" role="dialog" aria-label="검색">
        <input type="text" id="gPaletteInput" placeholder="화면 이름, WBS ID·Task명, 요구사항·VOC 번호, 작업자 이름으로 검색" autocomplete="off"
          data-input="GShell.searchPalette" data-input-args='["$value"]' data-keydown="GShell.paletteKey" data-keydown-args='["$event"]'>
        <div class="g-palette-list" id="gPaletteList"></div>
        <div class="g-palette-hint">↑↓ 이동 · Enter 열기 · Esc 닫기</div>
      </div>`;
    p.addEventListener("click", e => { if (e.target === p) this.closePalette(); });
    document.body.appendChild(p);
    if (typeof I18N !== "undefined") I18N.translateTree(p);
    return p;
  },
  openPalette() {
    this.closeMenus();
    const p = this._palette();
    p.hidden = false;
    const inp = document.getElementById("gPaletteInput");
    inp.value = "";
    this.searchPalette("");
    setTimeout(() => inp.focus(), 30);
  },
  closePalette() {
    const p = document.getElementById("gPalette");
    if (p) p.hidden = true;
  },

  _items() {
    const items = [];
    const screens = this.GROUPS.reduce((a, g) => a.concat(g.tabs), []).concat(this.ADMIN_TABS);
    screens.filter(t => this.allowed(t)).forEach(t => items.push({ kind: "화면", text: this.label(t), sub: "", act: () => this.go(t) }));
    items.push({ kind: "관리", text: "프로젝트 관리", sub: "", act: () => ProjectManager.open() });
    if (typeof ProjectManager !== "undefined" && ProjectManager.canCreate()) items.push({ kind: "관리", text: "새 프로젝트 등록", sub: "", act: () => ProjectManager.openNew() });
    items.push({ kind: "관리", text: "법적 고지", sub: "", act: () => LegalNotice.open() });
    (typeof wbsData !== "undefined" ? wbsData : []).forEach(t => items.push({ kind: "WBS", text: `${t.id} ${t.name || ""}`, sub: t.system || "", act: () => this.reveal("tab-wbs", t.name || t.id) }));
    (typeof reqMasterData !== "undefined" ? reqMasterData : []).forEach(r => items.push({ kind: "요구사항", text: `${r.id} ${r.name || ""}`, sub: r.system || "", act: () => this.reveal("tab-req", r.id) }));
    (typeof vocData !== "undefined" ? vocData : []).forEach(v => items.push({ kind: "VOC", text: `${v.id} ${v.title || ""}`, sub: v.system || "", act: () => this.reveal("tab-voc", v.id) }));
    (typeof projectUsers !== "undefined" ? projectUsers : []).forEach(u => items.push({ kind: "작업자", text: `${u.name || ""} (${u.empNo})`, sub: u.dept || "", act: () => { this.go("tab-master"); setTimeout(() => { try { MasterSubTabs.show("users"); } catch (e) {} this.reveal(null, u.empNo); }, 200); } }));
    return items;
  },
  searchPalette(q) {
    const list = document.getElementById("gPaletteList");
    if (!list) return;
    const query = String(q || "").trim().toLowerCase();
    const all = this._items();
    const found = (query ? all.filter(i => (i.text + " " + i.sub + " " + i.kind).toLowerCase().indexOf(query) !== -1) : all.filter(i => i.kind === "화면" || i.kind === "관리")).slice(0, 40);
    this._found = found;
    this._sel = 0;
    list.innerHTML = found.length
      ? found.map((i, n) => `<button type="button" class="g-palette-item${n === 0 ? " sel" : ""}" data-click="GShell.pickPalette" data-click-args="${UiEvents.args(n)}"><span class="g-kind">${escapeHtml(i.kind)}</span><span class="g-text">${escapeHtml(i.text)}</span><span class="g-subtext">${escapeHtml(i.sub)}</span></button>`).join("")
      : `<div class="g-palette-empty">검색 결과가 없습니다.</div>`;
    if (typeof I18N !== "undefined") I18N.translateTree(list);
  },
  paletteKey(e) {
    const items = document.querySelectorAll("#gPaletteList .g-palette-item");
    if (!items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this._sel = (this._sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((el, n) => el.classList.toggle("sel", n === this._sel));
      items[this._sel].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      this.pickPalette(this._sel || 0);
    }
  },
  pickPalette(n) {
    const it = (this._found || [])[n];
    this.closePalette();
    if (it) it.act();
  },
  // 해당 화면으로 이동한 뒤 글자가 들어 있는 행을 찾아 강조
  reveal(tabId, text) {
    if (tabId) this.go(tabId);
    setTimeout(() => {
      const pane = document.querySelector(".tab-pane.active");
      if (!pane || !text) return;
      const rows = pane.querySelectorAll("tr");
      const t = String(text);
      const row = Array.prototype.find.call(rows, r => r.textContent.indexOf(t) !== -1 ||
        Array.prototype.some.call(r.querySelectorAll("input"), i => i.value === t));
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.classList.add("g-flash");
        setTimeout(() => row.classList.remove("g-flash"), 2200);
      }
    }, 350);
  },

  // ---- 아래 고정 줄: 저장하지 않은 변경 (DB 서버 모드) ----
  _wrapIndicators() {
    if (typeof SyncUI === "undefined" || this._wrapped) return;
    this._wrapped = true;
    const orig = SyncUI.refreshIndicators.bind(SyncUI);
    SyncUI.refreshIndicators = () => { orig(); this.renderSaveBar(); };
    this.renderSaveBar();
  },
  renderSaveBar() {
    let bar = document.getElementById("gSaveBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "gSaveBar";
      bar.className = "g-savebar";
      bar.hidden = true;
      bar.innerHTML = `<span id="gSaveBarText"></span><span class="g-savebar-btns">
        <button type="button" class="btn btn-sm" data-btn="cancel" data-click="SyncManager.refresh" data-click-args='[null]'>변경 취소 (다시 불러오기)</button>
        <button type="button" class="btn btn-sm" data-btn="save" data-click="SyncManager.save" data-click-args='[null, {"notify": true}]'>💾 모두 저장 (Ctrl+S)</button></span>`;
      document.body.appendChild(bar);
      if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(bar);
    }
    const n = (typeof SyncManager !== "undefined" && !SyncManager.isLocal()) ? SyncManager.dirtyCount() : 0;
    bar.hidden = n === 0;
    document.body.classList.toggle("g-has-savebar", n > 0);
    if (n > 0) {
      const t = document.getElementById("gSaveBarText");
      t.textContent = `저장하지 않은 변경 ${n}건`;
      if (typeof I18N !== "undefined") I18N.translateTree(bar);
    }
  }
};

window.GShell = GShell;
