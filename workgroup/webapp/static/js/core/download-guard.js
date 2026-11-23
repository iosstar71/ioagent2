// =============================================================================
// [Workgroup] 다운로드 제한 · 감사 로그 화면 (서버: server/audit.py)
//  - 화면에서 만드는 파일(엑셀 · 워드 · PPT · JSON · CSV)은 내려받기 전에 서버에 허가를 받음 → 서버가 기록 · 제한된 멤버는 거부
//    (첨부 · 시스템 백업처럼 서버가 보내는 파일은 서버가 직접 막고 기록)
//  - 제한된 멤버: 다운로드 버튼 비활성 + 말풍선, 멤버 메뉴에 "다운로드 제한 계정"
//  - 감사 로그: 프로젝트 설정 > 감사 로그 (Admin · PM) — 걸러 보기 · CSV 내려받기(이것도 기록)
// =============================================================================
var DownloadGuard = {
  TIP: "다운로드가 제한된 계정입니다 — PM 에게 요청하세요.",
  BTN: '[data-btn="excel-down"], [data-btn="word-down"], [data-btn="json-down"], [data-dl]',

  blocked() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.currentUser : null;
    return !!(u && u.noDownload);
  },
  kindOf(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return { xlsx: "excel", xls: "excel", docx: "word", pptx: "ppt", json: "json", csv: "csv" }[ext] || "file";
  },
  // 서버에 허가 요청 (기록은 서버가 함). 거부되면 안내
  async permit(name) {
    const res = await ServerBackend.request("/api/audit/download", { kind: this.kindOf(name), target: String(name || "") });
    if (res.ok) return true;
    showToast(res.code === "DOWNLOAD_BLOCKED" ? "⛔ " + this.TIP : "⚠️ " + (res.message || "다운로드를 허가받지 못했습니다."));
    return false;
  },
  install() {
    if (this._installed || typeof ExcelSync === "undefined") return;
    this._installed = true;
    const orig = ExcelSync._triggerDownload;
    // opt.logged: 서버가 이미 허가 · 기록한 파일(첨부)
    ExcelSync._triggerDownload = function (blob, name, opt) {
      if (opt && opt.logged) return orig.call(ExcelSync, blob, name);
      DownloadGuard.permit(name).then(ok => { if (ok) orig.call(ExcelSync, blob, name); });
    };
    new MutationObserver(() => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.apply(); });
    }).observe(document.body, { childList: true, subtree: true });
  },
  // 제한된 멤버: 다운로드 버튼 비활성 + 멤버 메뉴 표시
  apply() {
    const on = this.blocked();
    document.querySelectorAll(this.BTN).forEach(b => {
      if (on && !b.disabled) { b.disabled = true; b.dataset.dlBlocked = "1"; b.title = this.TIP; }
      else if (!on && b.dataset.dlBlocked) { b.disabled = false; delete b.dataset.dlBlocked; b.title = ""; }
    });
    const menu = document.getElementById("gUserMenu");
    let note = document.getElementById("gUserDlNote");
    if (menu && on && !note) {
      note = document.createElement("div");
      note.id = "gUserDlNote";
      note.className = "g-menu-row dl-limit-note";
      note.textContent = "⛔ 다운로드 제한 계정";
      note.title = this.TIP;
      const who = document.getElementById("gUserWho");
      if (who && who.nextSibling) menu.insertBefore(note, who.nextSibling); else menu.appendChild(note);
    } else if (note && !on) note.remove();
  },

  // 멤버 정보 표의 "다운로드" 칸 (PM 이상만 바꿈, PM · 관리자 행은 항상 허용)
  cellHtml(idx, u) {
    const asg = ProjectManager.userAssignment(u);
    const a = ProjectContext.member(u) || {};
    const fixed = asg.admin || asg.role === "PM";
    const can = AuthManager.currentUser && ["SYS_ADMIN", "PM"].indexOf(AuthManager.currentUser.role) !== -1;
    const v = !fixed && a.noDownload ? "1" : "";
    return `<td><select class="dl-limit-sel${v ? " on" : ""}" ${fixed || !can ? "disabled" : ""} title="${fixed ? "PM · 관리자는 항상 허용" : "엑셀 · 워드 · PPT · 백업 · 첨부 내려받기"}"
      data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "noDownload", "$value")}">
      <option value="" ${v ? "" : "selected"}>허용</option><option value="1" ${v ? "selected" : ""}>금지</option></select></td>`;
  }
};

var AuditLogPane = {
  rows: [],
  _pane() { return document.getElementById("masterSub-audit"); },
  async load() {
    const pane = this._pane();
    if (!pane) return;
    if (!pane.dataset.built) this._build(pane);
    const val = id => (document.getElementById(id) || {}).value || "";
    const all = document.getElementById("auditAll");
    const res = await ServerBackend.request("/api/audit/list", { from: val("auditFrom"), to: val("auditTo"), emp: val("auditEmp").trim(), kind: val("auditKind"), allProjects: !!(all && all.checked) });
    if (!res.ok) { showToast("⚠️ " + (res.message || "감사 로그를 불러오지 못했습니다.")); return; }
    this.rows = res.rows || [];
    const kindSel = document.getElementById("auditKind");
    if (kindSel && kindSel.options.length <= 1) {
      Object.keys(res.kinds || {}).forEach(k => kindSel.insertAdjacentHTML("beforeend", `<option value="${escapeAttr(k)}">${escapeHtml(res.kinds[k])}</option>`));
    }
    const info = document.getElementById("auditInfo");
    if (info) info.textContent = I18N.tf("{n}건 (최근 {max}건까지) · 보관 {d}일", { n: this.rows.length, max: res.max, d: res.keepDays });
    const body = document.getElementById("auditBody");
    if (body) {
      body.innerHTML = this.rows.length ? this.rows.map(r => `<tr><td>${escapeHtml(r.at)}</td><td>${escapeHtml(r.emp)}</td><td>${escapeHtml(r.ip)}</td><td>${escapeHtml(r.project || "-")}</td>
        <td><span class="status-tag ${/BLOCK|FAIL|DELETE|RESET|LOCK/.test(r.kind) ? "tag-delayed" : "tag-ready"}">${escapeHtml(r.kindName)}</span></td><td>${escapeHtml(r.target)}</td><td class="audit-detail">${escapeHtml(r.detail)}</td></tr>`).join("")
        : `<tr><td colspan="7" class="u-tc u-c-muted">기록이 없습니다.</td></tr>`;
      if (typeof I18N !== "undefined") I18N.translateTree(body.closest("table"));
    }
  },
  _build(pane) {
    pane.dataset.built = "1";
    const admin = AuthManager.currentUser && AuthManager.currentUser.role === "SYS_ADMIN";
    pane.innerHTML = `
      <div class="card">
        <div class="card-title">🧾 감사 로그 <span class="neo-ph-desc">자료 삭제 · 초기화 · 복원 · Merge 반영 · 잠금 강제 해제 · 다운로드 · 계정 · 권한 · 기준선 기록 (서버가 남기며 고치거나 지울 수 없음)</span></div>
        <div class="filter-toolbar">
          <label class="filter-item">기간 <input type="date" id="auditFrom"> ~ <input type="date" id="auditTo"></label>
          <label class="filter-item">멤버 ID <input type="text" id="auditEmp" maxlength="30"></label>
          <label class="filter-item">종류 <select id="auditKind"><option value="">전체</option></select></label>
          ${admin ? '<label class="filter-item"><input type="checkbox" id="auditAll"> 모든 프로젝트</label>' : ""}
          <button type="button" class="btn btn-sm" data-btn="refresh" data-click="AuditLogPane.load">🔍 조회</button>
          <button type="button" class="btn btn-sm" data-btn="excel-down" data-click="AuditLogPane.csv">📥 CSV 내려받기</button>
          <span class="u-c-muted" id="auditInfo"></span>
        </div>
        <div class="table-container"><table class="audit-table">
          <thead><tr><th>일시</th><th>멤버</th><th>접속 IP</th><th>프로젝트</th><th>종류</th><th>대상</th><th>내용</th></tr></thead>
          <tbody id="auditBody"></tbody></table></div>
      </div>`;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(pane);
    if (typeof I18N !== "undefined") I18N.translateTree(pane);
  },
  // 화면에서만 알 수 있는 일(파일 Merge 반영)을 서버에 알림 — 사람 · 시각 · IP 는 서버가 정함
  event(kind, target, detail) { ServerBackend.request("/api/audit/event", { kind, target, detail }).catch(() => {}); },
  csv() {
    const q = v => `"${String(v === undefined || v === null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [["일시", "멤버", "접속 IP", "프로젝트", "종류", "대상", "내용"].map(q).join(",")]
      .concat(this.rows.map(r => [r.at, r.emp, r.ip, r.project, r.kindName, r.target, r.detail].map(q).join(",")));
    const name = `감사로그_${(projectConfig.fileCode || ProjectContext.current || "")}_${new Date().toISOString().slice(0, 10)}.csv`;
    ExcelSync._triggerDownload(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), name);
  }
};

window.DownloadGuard = DownloadGuard;
window.AuditLogPane = AuditLogPane;
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => DownloadGuard.install());
else DownloadGuard.install();
