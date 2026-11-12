// =============================================================================
// [Project Mgmt v1.0.10] 화면 이벤트 연결 (CSP script-src 'self' 대응)
// -----------------------------------------------------------------------------
//  HTML 안의 onclick="..." 같은 인라인 스크립트는 콘텐츠 보안 정책(CSP)에서 차단되므로
//  모든 화면 동작을 아래 선언형 속성으로 연결합니다.
//
//    data-click="객체.함수"             실행할 함수 (전역 객체/함수 경로)
//    data-click-args='["값", 1]'        인자 (JSON 배열)
//      특수 인자: "$value" 입력값 · "$trim" 앞뒤 공백 제거 입력값 · "$num" 숫자 입력값(없으면 0)
//                 "$int" 정수 입력값 · "$checked" 체크 여부 · "$split" 쉼표 구분 목록
//                 "$event" 이벤트 객체 · "$this" 요소 자체
//    data-click-key="Enter"             (키 이벤트) 해당 키일 때만 실행
//    data-click-stop="1"                상위 요소의 같은 이벤트 처리 중단 (stopPropagation)
//    data-click-prevent="1"             기본 동작 취소 (preventDefault)
//  지원 이벤트: click · change · input · keydown · keyup · keypress
//  자바스크립트 템플릿에서는 UiEvents.args(...) 로 인자 속성 값을 만듭니다.
//
//  ※ 이 파일은 다른 js 파일보다 먼저 로드합니다. (index.html 스크립트 목록 첫 줄)
// =============================================================================
var UiEvents = {
  TYPES: ["click", "change", "input", "keydown", "keyup", "keypress"],

  // 템플릿용: 인자 배열 → HTML 속성에 안전한 JSON 문자열
  args(...list) {
    return escapeAttr(JSON.stringify(list));
  },

  init() {
    if (this._ready) return;
    this._ready = true;
    this.TYPES.forEach(type => document.addEventListener(type, e => this.dispatch(type, e), false));
  },

  // 전역 이름 해석 (var/function 은 window 에, const/let 은 아래 목록으로)
  root(name) {
    if (name in window) return window[name];
    switch (name) {
      case "BackupHistoryManager": return typeof BackupHistoryManager !== "undefined" ? BackupHistoryManager : undefined;
      case "DbConnector": return typeof DbConnector !== "undefined" ? DbConnector : undefined;
      case "ExcelSync": return typeof ExcelSync !== "undefined" ? ExcelSync : undefined;
      case "ReportExporter": return typeof ReportExporter !== "undefined" ? ReportExporter : undefined;
      case "SmartMergeCenter": return typeof SmartMergeCenter !== "undefined" ? SmartMergeCenter : undefined;
      case "JsonCollabManager": return typeof JsonCollabManager !== "undefined" ? JsonCollabManager : undefined;
      case "GanttRenderer": return typeof GanttRenderer !== "undefined" ? GanttRenderer : undefined;
      case "DashboardChart": return typeof DashboardChart !== "undefined" ? DashboardChart : undefined;
      case "WBSEngine": return typeof WBSEngine !== "undefined" ? WBSEngine : undefined;
      case "DocxBuilder": return typeof DocxBuilder !== "undefined" ? DocxBuilder : undefined;
    }
    return undefined;
  },

  resolve(path) {
    const parts = String(path || "").split(".");
    let owner = null;
    let cur = this.root(parts[0]);
    for (let i = 1; i < parts.length && cur !== undefined && cur !== null; i++) {
      owner = cur;
      cur = cur[parts[i]];
    }
    return typeof cur === "function" ? { fn: cur, owner: owner || window } : null;
  },

  _arg(v, el, e) {
    if (typeof v !== "string" || v.charAt(0) !== "$") return v;
    switch (v) {
      case "$value": return el.value;
      case "$trim": return String(el.value || "").trim();
      case "$num": return parseFloat(el.value) || 0;
      case "$int": return parseInt(el.value, 10);
      case "$checked": return !!el.checked;
      case "$split": return String(el.value || "").split(",").map(s => s.trim()).filter(Boolean);
      case "$event": return e;
      case "$this": return el;
    }
    return v;
  },

  run(el, type, e) {
    const path = el.getAttribute("data-" + type);
    const target = this.resolve(path);
    if (!target) {
      console.error(`[UiEvents] 함수를 찾을 수 없습니다: ${path}`);
      return;
    }
    let raw = [];
    const a = el.getAttribute(`data-${type}-args`);
    if (a) {
      try { raw = JSON.parse(a); } catch (err) { console.error("[UiEvents] 인자 형식 오류:", a); return; }
    }
    const args = (Array.isArray(raw) ? raw : [raw]).map(v => this._arg(v, el, e));
    return target.fn.apply(target.owner, args);
  },

  dispatch(type, e) {
    let el = e.target;
    while (el && el !== document && el.nodeType === 1) {
      if (el.hasAttribute("data-" + type)) {
        const key = el.getAttribute(`data-${type}-key`);
        if (!key || key.split("|").indexOf(e.key) !== -1) {
          if (type === "click" && el.tagName === "A" && el.getAttribute("href") === "#") e.preventDefault();
          if (el.hasAttribute(`data-${type}-prevent`)) e.preventDefault();
          try {
            this.run(el, type, e);
          } catch (err) {
            console.error(err);
          }
          if (el.hasAttribute(`data-${type}-stop`)) break;
        }
      }
      el = el.parentNode;
    }
  },

  // 버튼 분류·탭 활성 표시용: 연결된 동작을 문자열로 (이전 onclick 속성 문자열 대체)
  describe(el, type = "click") {
    if (!el) return "";
    return `${el.getAttribute("data-" + type) || ""}(${el.getAttribute(`data-${type}-args`) || ""})`;
  }
};

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -----------------------------------------------------------------------------
// 여러 문장으로 된 이전 인라인 동작을 함수로 옮긴 공통 처리기
// -----------------------------------------------------------------------------
var UiH = {
  // 표 편집용 배열 (const/let 전역은 window 에 없으므로 직접 참조)
  _array(name) {
    switch (name) {
      case "wbsData": return wbsData;
      case "subsystemsMeta": return subsystemsMeta;
      case "standardDeliverablesMeta": return standardDeliverablesMeta;
      case "projectUsers": return projectUsers;
      case "deliverablesData": return deliverablesData;
      case "reqMasterData": return reqMasterData;
      case "vocData": return vocData;
      case "_editingSdlcPhasesTemp": return _editingSdlcPhasesTemp;
      case "projectConfig.holidays": return projectConfig.holidays;
    }
    throw new Error("UiH: 알 수 없는 데이터 " + name);
  },
  _after(fns) {
    fns.forEach(n => {
      const t = UiEvents.resolve(n);
      if (t) t.fn.call(t.owner);
    });
  },
  // 표의 한 칸 수정: UiH.set("wbsData", 3, "name", 값, "persistChanges", ...)
  set(name, idx, field, value, ...after) {
    const arr = this._array(name);
    if (!arr || !arr[idx]) return false;
    // [v3.0.0] 진척률(계획·실적)은 0~100, 가중치는 0 이상만 — 범위를 벗어나면 저장하지 않고 원래 값으로 되돌림
    const bad = (this.PCT_FIELDS.indexOf(field) !== -1 && !this.validPct(value)) || (field === "weight" && !(Number(value) >= 0));
    if (bad) {
      if (typeof showToast === "function") showToast(field === "weight" ? "⚠️ 가중치는 0 이상으로 입력하세요." : "⚠️ 진척률은 0 ~ 100 사이로 입력하세요. (마이너스·100 초과 불가)");
      const redraw = { wbsData: "renderWbsTable" }[name];
      const t = redraw && UiEvents.resolve(redraw);
      if (t) t.fn.call(t.owner);
      return false;
    }
    arr[idx][field] = value;
    this._after(after);
    return true;
  },
  PCT_FIELDS: ["aProg", "pProg"],
  validPct(v) { const n = Number(v); return v !== "" && v !== null && !isNaN(n) && n >= 0 && n <= 100; },
  // 표의 한 행 삭제: UiH.removeAt("vocData", 3, "renderVocTable", ...)
  removeAt(name, idx, ...after) {
    const arr = this._array(name);
    if (!arr) return;
    arr.splice(idx, 1);
    this._after(after);
  },

  clickEl(id) { const el = document.getElementById(id); if (el) el.click(); },
  focusEl(id) { const el = document.getElementById(id); if (el) el.focus(); },
  loginKeys(e) {
    if (e.key === "Enter") AuthManager.unlock();
    else if (e.key === "Escape") AuthManager.cancelUnlock();
  },
  goNotice(sub) {
    switchTab("tab-notices");
    if (typeof NoticeCommManager !== "undefined") NoticeCommManager.switchSubTab(sub);
  },
  domainFilter(domainId, subsysId, renderFn) {
    onDomainFilterChanged(domainId, subsysId);
    this._after([renderFn]);
  },
  rebuildToast(msg) { rebuildAll(); showToast(msg); },
  setValueRun(id, value, fn) {
    const el = document.getElementById(id);
    if (el) el.value = value;
    this._after([fn]);
  },
  resetDelivFilters() {
    [["delivNameSearchInput", ""], ["delivSubsystemFilter", "ALL"], ["delivRoundFilter", "ALL"]].forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    });
    renderDeliverablesTable();
  },
  importMasterWorkbook(e) {
    ExcelSync.importMasterWorkbook(e);
    closeDataBackupModal();
  },
  meetingDiscard() {
    MeetingManager.discardDraft();
    MeetingManager.render();
  }
};

window.UiEvents = UiEvents;
window.UiH = UiH;
window.escapeAttr = escapeAttr;
UiEvents.init();
