// [IOSTAR-PM] 공통 기반: 버전 · 알림(토스트) · 확인 창 · HTML 이스케이프
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =============================================================================
// IOSTAR-PM - 코어 앱 엔진
// =============================================================================
// [v1.2.0] 제품 이름·버전은 app.ini → js/app-config.js (APP_CONFIG) 에서 읽음
const APP_VERSION = (function () {
  const c = typeof APP_CONFIG !== "undefined" ? APP_CONFIG : { productName: "IOSTAR-PM", version: "1.0.1", edition: "STANDARD", editionName: "Standard" };
  const edName = c.editionName !== undefined ? c.editionName : (c.edition && c.edition !== "KR" ? c.edition : "");
  // 사내 표시 이름(PM Hub) · 브랜드 · 판: IOSTAR-PM Workgroup
  const brand = c.brand || c.productName || "IOSTAR-PM";
  const product = `${brand}${edName ? " " + edName : ""}`;
  const name = c.displayName || product;
  return { version: c.version, name, brand, product, variant: edName, title: `${c.displayName ? c.displayName + " · " : ""}${product} v${c.version}`, edition: c.edition || "KR", editionName: edName };
})();

// 인페이지 토스트 알림 및 비차단 확인 모달 헬퍼
let _confirmCallback = null;
function showToast(message) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => {
    if (item.parentNode) item.parentNode.removeChild(item);
  }, 3800);
}
window.alert = showToast;

function openConfirmDialog(message, onConfirm) {
  const modal = document.getElementById("confirmDialogModal");
  const msgEl = document.getElementById("confirmDialogMessage");
  if (modal && msgEl) {
    msgEl.textContent = message;
    _confirmCallback = onConfirm;
    modal.style.display = "flex";
  } else if (typeof onConfirm === "function") {
    onConfirm();
  }
}
function closeConfirmDialog(confirmed) {
  const modal = document.getElementById("confirmDialogModal");
  if (modal) modal.style.display = "none";
  const cb = _confirmCallback;
  _confirmCallback = null;
  if (confirmed && typeof cb === "function") cb();
}

// 앱 안 입력 대화상자 (브라우저 prompt() 대신): openPromptDialog("제목", "처음 값", 값 => {...}, { multiline: true })
//  Enter(여러 줄은 Ctrl+Enter) = 확인, Esc = 취소. 빈 값은 확인되지 않음
function openPromptDialog(title, value, onOk, opts = {}) {
  let m = document.getElementById("promptDialogModal");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal-overlay"; m.id = "promptDialogModal";
    m.innerHTML = `<div class="modal prompt-modal"><div class="card-title"><span id="promptDialogTitle"></span></div>
      <div id="promptDialogBody"></div><div class="prompt-hint" id="promptDialogHint"></div>
      <div class="prompt-actions"><button type="button" class="btn btn-secondary btn-sm" data-click="closePromptDialog" data-click-args='[false]'>취소</button>
      <button type="button" class="btn btn-primary btn-sm" data-click="closePromptDialog" data-click-args='[true]'>확인</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener("keydown", e => {
      const f = document.getElementById("promptDialogField");
      if (e.key === "Escape") closePromptDialog(false);
      else if (e.key === "Enter" && f && (f.tagName !== "TEXTAREA" || e.ctrlKey || e.metaKey)) { e.preventDefault(); closePromptDialog(true); }
    });
  }
  document.getElementById("promptDialogTitle").textContent = title;
  document.getElementById("promptDialogHint").textContent = opts.multiline ? "Ctrl+Enter 확인 · Esc 취소" : "Enter 확인 · Esc 취소";
  const body = document.getElementById("promptDialogBody");
  body.innerHTML = opts.multiline ? `<textarea id="promptDialogField" class="prompt-field" rows="5"></textarea>` : `<input id="promptDialogField" class="prompt-field" type="text">`;
  const f = document.getElementById("promptDialogField");
  f.value = value == null ? "" : String(value);
  m._onOk = onOk;
  m.style.display = "flex";
  if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(m);
  setTimeout(() => { f.focus(); if (f.select) f.select(); }, 30);
}
function closePromptDialog(ok) {
  const m = document.getElementById("promptDialogModal");
  if (!m) return;
  const f = document.getElementById("promptDialogField");
  const v = f ? f.value.trim() : "";
  if (ok && !v) { if (typeof UiForm !== "undefined") UiForm.invalid(f, "값을 입력하세요"); return; }
  m.style.display = "none";
  const cb = m._onOk; m._onOk = null;
  if (ok && typeof cb === "function") cb(v);
}

// 입력 오류 표시: UiForm.invalid(입력칸, "안내") / UiForm.clear(입력칸) — 빨간 테두리 + 마우스를 올리면 안내
var UiForm = {
  invalid(el, msg) {
    if (!el) return;
    el.classList.add("is-invalid"); el.setAttribute("aria-invalid", "true");
    if (msg) { if (!el.hasAttribute("data-title-orig")) el.setAttribute("data-title-orig", el.getAttribute("title") || ""); el.title = msg; }
  },
  clear(el) {
    if (!el || !el.classList.contains("is-invalid")) return;
    el.classList.remove("is-invalid"); el.removeAttribute("aria-invalid");
    if (el.hasAttribute("data-title-orig")) { el.title = el.getAttribute("data-title-orig"); el.removeAttribute("data-title-orig"); }
  }
};
window.UiForm = UiForm;

function openDataBackupModal() {
  const modal = document.getElementById("dataBackupModal");
  if (modal) modal.style.display = "flex";
}
function closeDataBackupModal() {
  const modal = document.getElementById("dataBackupModal");
  if (modal) modal.style.display = "none";
}

// [보안 강화] XSS 공격 방어 문자열 이스케이프 함수
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
