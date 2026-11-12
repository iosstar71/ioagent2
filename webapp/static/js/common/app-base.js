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
