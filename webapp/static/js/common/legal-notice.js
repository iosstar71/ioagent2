// =============================================================================
// [IOSTAR-PM v1.0.10] 법적 고지 보기 (사용권 계약 · 개인정보 처리 안내 · 오픈소스 고지)
//  문서 원본: legal/*.txt  →  js/legal-text.js (tools/build_legal.py 로 자동 생성)
// =============================================================================
var LegalNotice = {
  open(key) {
    const docs = typeof LEGAL_DOCS !== "undefined" ? LEGAL_DOCS : [];
    if (!docs.length) return showToast("법적 고지 문서를 찾을 수 없습니다. (legal 폴더)");
    let m = document.getElementById("legalNoticeModal");
    if (!m) {
      m = document.createElement("div");
      m.id = "legalNoticeModal";
      m.className = "modal-overlay pm-modal";
      m.innerHTML = `
        <div class="modal-content pm-modal-box legal-box">
          <div class="pm-modal-head">
            <h3>⚖️ 법적 고지</h3>
            <button class="btn btn-sm" data-btn="cancel" data-click="LegalNotice.close">닫기</button>
          </div>
          <div class="legal-tabs">${docs.map(d => `<button class="btn btn-xs" data-btn="neutral" data-key="${escapeAttr(d.key)}" data-click="LegalNotice.show" data-click-args="${UiEvents.args(d.key)}">${escapeHtml(d.title)}</button>`).join("")}</div>
          <div id="legalNoticeFile" class="pm-hint"></div>
          <pre id="legalNoticeText" class="legal-text"></pre>
        </div>`;
      document.body.appendChild(m);
      if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(m);
    }
    this.show(key || docs[0].key);
    m.style.display = "flex";
    if (typeof I18N !== "undefined") I18N.translateTree(m.querySelector(".pm-modal-head"));
  },
  show(key) {
    const d = (LEGAL_DOCS || []).find(x => x.key === key) || LEGAL_DOCS[0];
    document.getElementById("legalNoticeText").textContent = d.text;
    document.getElementById("legalNoticeFile").textContent = `원본 파일: ${d.file} (프로그램 폴더)`;
    document.querySelectorAll("#legalNoticeModal .legal-tabs button").forEach(b => b.classList.toggle("active", b.getAttribute("data-key") === d.key));
  },
  close() {
    const m = document.getElementById("legalNoticeModal");
    if (m) m.style.display = "none";
  }
};
window.LegalNotice = LegalNotice;
