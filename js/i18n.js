// =============================================================================
// [IOSTAR-PM v1.0.6] 다국어(한국어/English) 지원 엔진
// -----------------------------------------------------------------------------
//  - 화면의 메뉴·제목·설명·버튼·안내 문구를 사전(I18N_EN) 기반으로 번역합니다.
//  - 작업 데이터(WBS 과업명, 요구사항, 회의록 등 사용자가 입력한 값)는 번역하지 않습니다.
//      · 입력 상자(input/textarea)의 값은 번역 대상이 아님
//      · data-i18n-skip 속성이 있는 영역은 번역 제외
//  - 동적으로 그려지는 화면은 MutationObserver 로 자동 번역
//  - 언어는 사용자별 설정(projectUsers[].lang)이며 로그인 화면에서 선택합니다.
//  ※ 사전은 js/i18n-en.js (I18N_EN) 에 정의
// =============================================================================
var I18N = {
  lang: "ko",
  LAST_LANG_KEY: "AX_PMYS_LAST_LANG",
  ATTRS: ["title", "placeholder", "aria-label"],
  _orig: new WeakMap(),     // 텍스트 노드 → 원문
  _origAttr: new WeakMap(), // 요소 → {attr: 원문}
  _observer: null,
  _busy: false,

  dict() { return (typeof I18N_EN !== "undefined" && I18N_EN.exact) || {}; },
  patterns() { return (typeof I18N_EN !== "undefined" && I18N_EN.patterns) || []; },
  phrases() { return (typeof I18N_EN !== "undefined" && I18N_EN.phrases) || []; },

  // [v1.2.0] 처음 화면(로그인)은 항상 app.ini 의 기본 언어(default_lang, 기본 한국어)로 시작
  //          로그인 후에는 사용자별 언어(projectUsers[].lang)를 적용
  init() {
    const def = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.defaultLang === "en") ? "en" : "ko";
    this._wrapDialogs();
    this.setLanguage(def, true);
  },

  // 로그인 화면에서 언어 선택 시 미리보기
  preview(lang) { this.setLanguage(lang, true); },

  setLanguage(lang, noRemember) {
    const next = lang === "en" ? "en" : "ko";
    const changed = next !== this.lang;
    this.lang = next;
    document.documentElement.setAttribute("lang", next);
    if (!noRemember) {
      try { localStorage.setItem(this.LAST_LANG_KEY, next); } catch (e) {}
    }
    if (next === "en") {
      this.translateTree(document.body);
      this._observe(true);
    } else {
      this._observe(false);
      if (changed) this.restoreTree(document.body);
    }
  },

  // ---- 문자열 번역 ----
  // usePhrases: 토스트·확인창 등 안내 메시지는 공통 용어 치환까지 적용
  //             (화면 텍스트 노드는 작업 데이터 보호를 위해 전체 일치/규칙만 적용)
  t(text, usePhrases) {
    if (this.lang !== "en" || text === null || text === undefined) return text;
    const raw = String(text);
    if (!/[가-힣]/.test(raw)) return raw;
    const trimmed = raw.replace(/\s+/g, " ").trim();
    let out = this._lookup(trimmed);
    if (out === undefined && usePhrases) out = this._phraseTranslate(trimmed);
    if (out === undefined || out === trimmed) return raw;
    const lead = raw.match(/^\s*/)[0];
    const tail = raw.match(/\s*$/)[0];
    return lead + out + tail;
  },

  _lookup(s) {
    const d = this.dict();
    if (Object.prototype.hasOwnProperty.call(d, s)) return d[s];
    for (const [re, rep] of this.patterns()) {
      if (re.test(s)) return s.replace(re, rep);
    }
    // "오류 메시지: 상세" 형태 → 앞부분만 사전 번역
    const idx = s.indexOf(": ");
    if (idx > 0) {
      const head = s.slice(0, idx + 1);
      if (Object.prototype.hasOwnProperty.call(d, head)) return d[head] + " " + this.t(s.slice(idx + 2), true);
    }
    return undefined;
  },

  _phraseTranslate(text) {
    let out = text;
    for (const [ko, en] of this.phrases()) {
      if (out.indexOf(ko) !== -1) out = out.split(ko).join(en);
    }
    return out;
  },

  // ---- DOM 번역 ----
  _skip(node) {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "CODE" || tag === "PRE") return true;
      if (el.hasAttribute && (el.hasAttribute("data-i18n-skip") || el.isContentEditable)) return true;
    }
    return false;
  },

  translateTree(root) {
    if (this.lang !== "en" || !root) return;
    this._busy = true;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(n => this._translateTextNode(n));
      const els = root.nodeType === 1 ? [root, ...root.querySelectorAll("*")] : [];
      els.forEach(el => this._translateAttrs(el));
    } finally {
      this._busy = false;
    }
  },

  _translateTextNode(n) {
    const v = n.nodeValue;
    if (!v || !/[가-힣]/.test(v) || this._skip(n)) return;
    const tr = this.t(v);
    if (tr !== v) {
      if (!this._orig.has(n)) this._orig.set(n, v);
      n.nodeValue = tr;
    }
  },

  _translateAttrs(el) {
    if (el.closest && el.closest("[data-i18n-skip]")) return;
    this.ATTRS.forEach(a => {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !/[가-힣]/.test(v)) return;
      const tr = this.t(v);
      if (tr === v) return;
      const store = this._origAttr.get(el) || {};
      if (!(a in store)) store[a] = v;
      this._origAttr.set(el, store);
      el.setAttribute(a, tr);
    });
    // 선택 상자 옵션 텍스트는 텍스트 노드로 처리됨
  },

  restoreTree(root) {
    if (!root) return;
    this._busy = true;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (this._orig.has(n)) { n.nodeValue = this._orig.get(n); this._orig.delete(n); }
      }
      root.querySelectorAll("*").forEach(el => {
        const store = this._origAttr.get(el);
        if (store) {
          Object.keys(store).forEach(a => el.setAttribute(a, store[a]));
          this._origAttr.delete(el);
        }
      });
    } finally {
      this._busy = false;
    }
  },

  _observe(on) {
    if (on && !this._observer && typeof MutationObserver !== "undefined") {
      this._observer = new MutationObserver(muts => {
        if (this._busy || this.lang !== "en") return;
        this._busy = true;
        try {
          muts.forEach(m => {
            if (m.type === "childList") {
              m.addedNodes.forEach(n => {
                if (n.nodeType === 3) this._translateTextNode(n);
                else if (n.nodeType === 1) { this._busy = false; this.translateTree(n); this._busy = true; }
              });
            } else if (m.type === "characterData") {
              this._translateTextNode(m.target);
            } else if (m.type === "attributes") {
              this._translateAttrs(m.target);
            }
          });
        } finally {
          this._busy = false;
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: this.ATTRS });
    } else if (!on && this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  },

  // 토스트 / 확인창 메시지 번역
  _wrapDialogs() {
    if (this._wrapped) return;
    this._wrapped = true;
    if (typeof showToast === "function") {
      const orig = showToast;
      showToast = function (msg, kind) { return orig(I18N.t(msg, true), kind); };
      window.showToast = showToast;
      window.alert = showToast;
    }
    if (typeof openConfirmDialog === "function") {
      const origC = openConfirmDialog;
      openConfirmDialog = function (msg, cb) { return origC(I18N.t(msg, true), cb); };
      window.openConfirmDialog = openConfirmDialog;
    }
  }
};
window.I18N = I18N;
