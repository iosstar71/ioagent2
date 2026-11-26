// =============================================================================
// 화면 틀 — 왼쪽 메뉴 접기 · 화면 머리줄 · 글자 크기 · 고정 머리글 · 오른쪽 패널 자리
//  - SideMenu · PageHead · UiScale · StickyTop · PanelDock
// =============================================================================

// -----------------------------------------------------------------------------
// 5. 왼쪽 메뉴 접기
// -----------------------------------------------------------------------------
var SideMenu = {
  KEY: "IOSTAR_NEO_SIDE_COLLAPSED",
  collapsed() { return DayUtil.store(this.KEY) === "1"; },
  toggle() {
    DayUtil.store(this.KEY, this.collapsed() ? "0" : "1");
    this.sync();
    setTimeout(renderGantt, 60);
  },
  sync() {
    document.body.classList.toggle("neo-side-collapsed", this.collapsed());
    const b = document.getElementById("neoSideToggle");
    if (b) {
      b.textContent = this.collapsed() ? "»" : "« 메뉴 접기";
      b.title = this.collapsed() ? "메뉴 펼치기" : "메뉴 접기 (아이콘만 표시)";
      I18N.translateTree(b.parentNode);
    }
  },
  apply(nav) {
    nav = nav || document.getElementById("gNav");
    const side = nav && nav.querySelector(".g-nav-side");
    if (!side) return;
    if (!side.querySelector("#neoSideToggle")) {
      side.insertAdjacentHTML("afterbegin", '<button type="button" id="neoSideToggle" class="neo-side-toggle" data-click="SideMenu.toggle"></button>');
    }
    // 접었을 때 아이콘만 보이므로 이름을 말풍선으로
    side.querySelectorAll(".g-side-item").forEach(b => { if (!b.title) b.title = b.textContent.trim(); });
    this.sync();
  }
};

// Esc: 상세 패널 닫기 (검색 창·대화 상자가 열려 있지 않을 때)
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || !WbsDetail.isOpen()) return;
  const pal = document.getElementById("gPalette");
  if (pal && !pal.hidden) return;
  WbsDetail.close();
});
// [Workgroup] 메뉴 배지: 주기 갱신 대신 자료가 바뀔 때(SyncUI.refreshIndicators) · 화면을 바꿀 때만 갱신
// WBS 화면을 떠나면 상세 패널 닫기
(function watchWbsPane() {
  const start = () => {
    const pane = document.getElementById("tab-wbs");
    if (!pane) return;
    new MutationObserver(() => { if (!pane.classList.contains("active") && WbsDetail.isOpen()) WbsDetail.close(); })
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
var PageHead = {
  init() {
    if (this._ready) return;
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
    I18N.translateTree(head);
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
      wrap.innerHTML = `<button type="button" class="btn btn-sm neo-dd-btn" data-btn="${key === "down" ? "excel-down" : "json-up"}" data-click="PageHead.toggle" data-click-args="${UiEvents.args(key)}" aria-haspopup="true" aria-expanded="false">${label} ▾</button><div class="neo-dd-menu" role="menu" hidden></div>`;
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
    make(btns.filter(isDown), "down", "⬇ 다운로드");
    make(btns.filter(isUp), "up", "⬆ 업로드");
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
  if (e.target.closest(".neo-dd-item")) setTimeout(() => PageHead.closeMenus(), 0);
}, true);

// -----------------------------------------------------------------------------
// 화면 설정 메뉴: 테마 견본 · 글자 크기 (보통 100% / 크게 115% / 아주 크게 130%)
//  글자 크기 토큰(--fs-scale) 방식 — 글자만 커지고 칸·여백은 유지, 작업자별 기억
// -----------------------------------------------------------------------------
var UiScale = {
  KEY: "IOSTAR_UI_SCALE_",
  STEPS: [1, 1.15, 1.3],
  _key() { const u = (AuthManager.currentUser) || {}; return this.KEY + (u.empNo || "_"); },
  get() {
    let v = 1;
    try { v = parseFloat(AppStore.getItem(this._key()) || AppStore.getItem(this.KEY + "_") || "1"); } catch (e) {}
    return this.STEPS.indexOf(v) === -1 ? 1 : v;
  },
  apply(v) {
    v = v || this.get();
    // 화면 확대(zoom) 대신 글자 크기 토큰(--fs-scale)만 바꿈 — 배치는 유지되고 글자만 커짐
    document.documentElement.style.zoom = "";
    if (v === 1) document.documentElement.style.removeProperty("--fs-scale");
    else document.documentElement.style.setProperty("--fs-scale", String(v));
    document.documentElement.dataset.uiScale = String(v);
    this.sync();
    if (document.querySelector("#tab-gantt.active")) setTimeout(renderGantt, 60);
  },
  set(v) {
    v = parseFloat(v);
    if (this.STEPS.indexOf(v) === -1) v = 1;
    try { AppStore.setItem(this._key(), String(v)); AppStore.setItem(this.KEY + "_", String(v)); } catch (e) {}
    this.apply(v);
  },
  pickTheme(t) {
    changeTheme(t);
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

// =============================================================================
// 고정 줄 위치: 위쪽에 고정된 머리글 · 메뉴 줄의 높이를 --sticky-top 으로 알려 줌
//  (서브 탭 줄이 그 바로 아래에 붙어 고정되도록 — 글자 크기 · 메뉴 위치가 바뀌어도 다시 계산)
// =============================================================================
var StickyTop = {
  apply() {
    const root = document.documentElement.style;
    // 반올림하지 않음: 브라우저 확대(90% · 110% 등)에서 높이가 소수일 때 반올림하면 스크롤 중 1px 씩 흔들림
    const px = v => (Math.round(v * 100) / 100) + "px";
    const sticky = el => !!el && getComputedStyle(el).position === "sticky" && el.getBoundingClientRect().width > window.innerWidth * 0.6;
    const hdr = document.querySelector("header"), nav = document.querySelector(".g-nav");
    // 메뉴 줄 위 여백(예: Pop 테마의 색 띠 자리)도 고정 위치에 넣어야 스크롤할 때 메뉴 줄이 위로 올라붙지 않음
    const navGap = nav ? parseFloat(getComputedStyle(nav).marginTop) || 0 : 0;
    let top = sticky(hdr) ? hdr.getBoundingClientRect().height : 0;
    root.setProperty("--hdr-h", px(top + navGap));   // 메뉴 줄은 머리글(+ 그 아래 여백) 바로 아래에 고정
    if (sticky(nav)) top += navGap + nav.getBoundingClientRect().height;
    root.setProperty("--sticky-top", px(top));
    // 지금 화면의 이름 줄(+ 서브메뉴 줄) 높이: 서브메뉴 줄은 이름 줄 바로 아래에 고정
    const pane = document.querySelector(".tab-pane.active");
    const head = pane && pane.querySelector(":scope > .sub-header-bar");
    const headH = head ? head.offsetHeight + (parseFloat(getComputedStyle(head).marginBottom) || 0) : 0;
    const tabs = pane && pane.querySelector(":scope > .master-subtab-bar, :scope > .sub-tab-nav");
    // 메뉴 줄과 화면 이름 줄 사이의 틈: 그 틈만큼 아래에 고정해야 스크롤할 때 이름 줄이 위로 밀려 올라가지 않음
    //  (화면 틀은 고정되지 않으므로 그 위치 = 이름 줄의 원래 자리)
    const gap = pane && head ? Math.max(0, Math.min(40, pane.getBoundingClientRect().top + window.scrollY - top)) : 0;
    root.setProperty("--pane-gap", px(gap));
    root.setProperty("--pane-head-h", px(headH));
    root.setProperty("--pane-sticky-h", px(gap + headH + (tabs ? tabs.offsetHeight : 0)));
  },
  init() {
    this.apply();
    window.addEventListener("resize", () => this.apply());
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.apply());
      [document.querySelector("header"), document.querySelector(".g-nav")].forEach(el => { if (el) ro.observe(el); });
      document.querySelectorAll(".tab-pane > .sub-header-bar").forEach(el => ro.observe(el));
    }
    // 화면을 옮기면 그 화면의 이름 줄 높이로 다시 계산
    const mo = new MutationObserver(() => this.apply());
    document.querySelectorAll(".tab-pane").forEach(p => mo.observe(p, { attributes: true, attributeFilter: ["class"] }));
  }
};
window.StickyTop = StickyTop;
window.addEventListener("DOMContentLoaded", () => StickyTop.init());

// WBS 표: 행의 빈 곳(입력칸 · 버튼 밖)을 누르면 오른쪽 상세 패널
document.addEventListener("click", e => {
  const td = e.target && e.target.closest ? e.target.closest("#wbsTableBody td") : null;
  if (!td || e.target.closest("input, select, textarea, button, a, label, [data-click]")) return;
  const btn = td.parentElement && td.parentElement.querySelector(".wbs-open-btn");
  if (btn) { const m = /\d+/.exec(btn.getAttribute("data-click-args") || ""); if (m) WbsDetail.open(parseInt(m[0], 10)); }
});

// =============================================================================
// 오른쪽 상세 패널(WBS · 요구사항 · VOC · 산출물 · Action Item)의 자리
//  - 패널이 메뉴 바로 아래가 아니라, 지금 화면의 머리글(화면 이름 줄) 아래 = 화면 내용 영역에서 시작
//  - 열려 있는 동안 스크롤 · 창 크기 · 화면 전환에 맞춰 위쪽 위치를 다시 잡음 (--panel-top)
// =============================================================================
var PanelDock = {
  _raf: 0,
  isOpen() { return document.body.classList.contains("neo-detail-open") || document.body.classList.contains("rec-panel-open"); },
  place() {
    if (!this.isOpen()) return;
    const pane = document.querySelector(".tab-pane.active");
    const head = pane && pane.querySelector(":scope > .sub-header-bar");
    const menu = document.querySelector(".g-header");
    const floor = menu ? Math.round(menu.getBoundingClientRect().bottom) : 0;   // 메뉴 아래로는 올라가지 않음
    let top = floor + 8;
    if (head) top = Math.max(top, Math.round(head.getBoundingClientRect().bottom) + 8);
    document.body.style.setProperty("--panel-top", top + "px");
  },
  later() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.place(); }); }
};
window.PanelDock = PanelDock;
(function () {
  const run = () => PanelDock.later();
  window.addEventListener("scroll", run, { passive: true, capture: true });
  window.addEventListener("resize", run);
  const start = () => new MutationObserver(run).observe(document.body, { attributes: true, attributeFilter: ["class", "data-layout"] });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
