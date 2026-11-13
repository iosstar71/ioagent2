// =============================================================================
// [Local] 상단 [📦 종합본] 메뉴 — 파일 주고받기를 한곳에
// -----------------------------------------------------------------------------
//  PM · 관리자 : 종합본 내려받기 (JSON / 엑셀) · 배포용 latest.json · 작업자 자료 받아 합치기
//  모든 작업자 : 받은 종합본 가져오기 (내 담당 작업 유지) · 내 자료 보내기 (엑셀 / JSON)
//  (같은 기능은 [🔀 스마트 병합] 화면에도 그대로 있음)
// =============================================================================
var LocalPkg = {
  _pm() { return typeof Permission !== "undefined" && Permission.canEditAllSubsystems && Permission.canEditAllSubsystems(); },

  toggle() {
    this.render();
    GShell.toggleMenu("gPkgMenu");
  },

  render() {
    const m = document.getElementById("gPkgMenu");
    if (!m) return;
    const cfg = typeof projectConfig !== "undefined" && projectConfig ? projectConfig : {};
    const stamp = cfg.packageStamp || "";
    const own = typeof Permission !== "undefined" && Permission.ownSubsystem ? Permission.ownSubsystem() : "";
    const item = (fn, args, label, hint) => `<button type="button" class="g-menu-item" data-click="${fn}"${args ? ` data-click-args='${args}'` : ""}>${label}${hint ? `<span class="g-pkg-hint">${hint}</span>` : ""}</button>`;
    let html = `<div class="g-menu-title">📦 마스터 파일 — 프로젝트 최신 자료 파일</div>
      <div class="g-menu-row g-pkg-ver">이 PC 마스터 파일 버전: <b>${escapeHtml(stamp || "없음")}</b>${cfg.packageBy ? ` <span class="g-pkg-hint">(${escapeHtml(cfg.packageBy)})</span>` : ""}</div>`;
    if (this._pm()) {
      html += `<div class="g-menu-sep"></div><div class="g-menu-title">PM · 관리자 → 멤버</div>`
        + item("SmartMergeCenter.downloadMasterPackage", '["JSON"]', "📥 마스터 파일 다운로드 (JSON)", "")
        + item("SmartMergeCenter.downloadMasterPackage", '["EXCEL"]', "📥 마스터 파일 다운로드 (엑셀)", "")
        + item("SmartMergeCenter.downloadMasterPackage", '["SERVER"]', "🌐 배포용 latest.json 다운로드", "배포 폴더 shared/ 에 넣으면 자동 배포")
        + `<div class="g-menu-sep"></div><div class="g-menu-title">멤버 → PM</div>`
        + item("LocalPkg.mergeWorker", "", "📋 멤버 자료 받아 합치기", "");
    }
    html += `<div class="g-menu-sep"></div><div class="g-menu-title">${this._pm() ? "그 밖에" : "PM 이 보낸 마스터 파일 받기"}</div>`
      + item("UiH.clickEl", '["consolidateInput"]', "📤 받은 마스터 파일 적용", this._pm() ? "PM · 관리자는 전부 종합본으로 바뀜" : `내 담당${own && own !== "ALL" ? `(${escapeHtml(own)})` : ""} 작업은 그대로, 나머지만 최신으로`);
    if (!this._pm()) {
      html += `<div class="g-menu-sep"></div><div class="g-menu-title">내 작업 파일 PM 에게 보내기</div>`
        + item("LocalPkg.sendMine", '["EXCEL"]', "📤 내 작업 파일 다운로드 (엑셀)", "")
        + item("LocalPkg.sendMine", '["JSON"]', "📤 내 작업 파일 다운로드 (JSON)", "");
    }
    m.innerHTML = html;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(m);
  },

  _toMerge() {
    GShell.go("tab-merge");
    if (typeof SubTabs !== "undefined") SubTabs.show("merge", "merge");
    if (typeof SmartMergeCenter !== "undefined" && SmartMergeCenter.updateCountBadges) SmartMergeCenter.updateCountBadges();
  },
  // 내 담당 서브시스템 자료(서브시스템 단위)를 내려받음
  sendMine(fmt) {
    GShell.closeMenus();
    this._toMerge();
    const own = Permission.ownSubsystem();
    const sel = document.getElementById("workDataSubsysSelect");
    if (sel && own && own !== "ALL" && [...sel.options].some(o => o.value === own)) sel.value = own;
    MergeTable.selectUnit("sys");
    MergeTable.download(fmt === "JSON" ? "JSON" : "EXCEL");
  },
  // 작업자가 보낸 파일 올리기 (스마트 병합의 미리 보기와 같음)
  mergeWorker() {
    GShell.closeMenus();
    this._toMerge();
    MergeTable.pick();
  }
};
window.LocalPkg = LocalPkg;
