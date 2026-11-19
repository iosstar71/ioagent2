// =============================================================================
// 사용자 매뉴얼을 화면 안 창에서 보기 (두 판 같음)
//  manual.html 을 그대로 iframe 으로 띄움 — 내 PC 파일(file://)로 열어도 보이고, 매뉴얼을 고치면 바로 반영
// =============================================================================
var ManualViewer = {
  open() {
    let m = document.getElementById("manualViewerModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "manualViewerModal";
      m.className = "modal-overlay";
      m.innerHTML = `<div class="manual-viewer-box">
        <div class="manual-viewer-head"><b>❔ 사용자 매뉴얼</b>
          <span class="u-flex u-gap-6">
            <a class="btn btn-sm" data-btn="neutral" href="manual.html" target="_blank" rel="noopener">↗ 새 창</a>
            <button type="button" class="btn btn-sm" data-btn="cancel" data-click="ManualViewer.close">닫기</button>
          </span></div>
        <iframe class="manual-viewer-frame" src="manual.html" title="사용자 매뉴얼"></iframe>
      </div>`;
      m.addEventListener("click", e => { if (e.target === m) this.close(); });
      document.body.appendChild(m);
      if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(m);
    }
    m.style.display = "flex";
  },
  close() { const m = document.getElementById("manualViewerModal"); if (m) m.style.display = "none"; }
};
window.ManualViewer = ManualViewer;
