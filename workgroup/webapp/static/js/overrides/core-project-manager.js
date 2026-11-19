// Workgroup 판: core/project-manager.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ProjectManager, {
  async afterLogin() {
    await this.refreshList();
    // [v3.0.0] 시스템관리자가 아닌데 이 프로젝트의 사용자가 아니면 다시 로그인 (프로젝트 선택)
    if (!this.isAdmin() && !ProjectContext.info()) {
      AuthManager.openLogin("🗂️ 프로젝트 로그인", "이 프로젝트의 멤버가 아닙니다. 참여 중인 프로젝트를 선택해 다시 로그인하세요.");
      return false;
    }
    if (!ProjectContext.info()) {
      // 접근할 수 없거나 없는 프로젝트 → 기본 프로젝트로
      if (!ProjectContext.isDefault()) {
        showToast("⚠️ 선택했던 프로젝트에 접근할 수 없어 기본 프로젝트로 전환합니다.");
        ProjectContext.set(ProjectContext.DEFAULT);
        if (!this.isServer()) { setTimeout(() => window.location.reload(), 400); return false; }
      }
    }
    this.renderSelector();
    setTimeout(() => SyncManager.saveSettingsQuiet(), 600);   // 처음 열 때 채워진 기본값(기준일 등)은 변경으로 세지 않음
    return true;
  },

  renderSelector() {
    const sel = document.getElementById("headerProjectSelect");
    if (!sel) return;
    const list = ProjectContext.projects.length ? ProjectContext.projects : [{ id: ProjectContext.current, name: projectConfig.projectName || ProjectContext.current, status: "ACTIVE" }];
    sel.innerHTML = list.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === ProjectContext.current ? "selected" : ""}>${escapeHtml(p.name || p.id)}${p.status === "ARCHIVED" ? " (사용 중지)" : ""}</option>`).join("");
    // [v3.0.0] 프로젝트 전환은 시스템관리자만 — 그 밖의 사용자는 프로젝트 이름만 표시
    const badge = document.getElementById("headerProjectNameBadge");
    const admin = this.isAdmin();
    sel.style.display = admin ? "" : "none";
    if (badge) {
      badge.style.display = admin ? "none" : "";
      badge.textContent = (ProjectContext.info() || {}).name || projectConfig.projectName || ProjectContext.current;
      badge.title = "로그인한 프로젝트 (다른 프로젝트는 다시 로그인하여 선택)";
    }
    const btn = document.getElementById("btnProjectManager");
    if (btn) btn.style.display = this.canCreate() || this.canManage(ProjectContext.info()) ? "" : "none";
    const cur = ProjectContext.info();
    const arch = document.getElementById("projectArchivedBar");
    if (arch) arch.style.display = cur && cur.status === "ARCHIVED" ? "block" : "none";
  },

  // ---- 전환 ----
  async switchTo(pid, onCancel) {
    if (!pid || pid === ProjectContext.current) return;
    if (!this.isAdmin()) {
      showToast("ℹ️ 다른 프로젝트는 로그아웃 후 로그인 화면에서 프로젝트를 선택해 들어가세요.");
      if (onCancel) onCancel();
      return;
    }
    const retry = () => this.switchTo(pid, onCancel);
    if (typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.currentWeekReport && !WeeklyReportManager.confirmLeave(retry)) { if (onCancel) onCancel(); return; }
    if (typeof MeetingManager !== "undefined" && MeetingManager.confirmLeave && !MeetingManager.confirmLeave(retry)) { if (onCancel) onCancel(); return; }
    if (SyncManager.isAutoSave()) {
      await SyncManager.flushAutoSave();
    } else if (SyncManager.isDirty()) {
      const choice = await SyncUI.ask("🗂️ 프로젝트 전환", `저장하지 않은 변경 ${SyncManager.dirtyCount()}건이 있습니다.\n프로젝트를 전환하기 전에 저장하시겠습니까?`, [
        { id: "save", label: "💾 저장 후 전환", cls: "btn-primary" },
        { id: "discard", label: "🗑️ 변경 버리고 전환", cls: "btn-danger" },
        { id: "cancel", label: "취소", cls: "btn-secondary" }
      ]);
      if (choice === "cancel") { if (onCancel) onCancel(); return; }
      if (choice === "save") {
        const r = await SyncManager.save(null, { notify: false });
        if (!r.ok && !r.nothing) { if (onCancel) onCancel(); return; }
      }
    }
    // 전환 중에는 저장 금지 (대기 중인 자동저장이 새 프로젝트 저장 위치에 이전 프로젝트 데이터를 쓰지 않도록)
    this._switching = true;
    if (SyncManager._autoTimer) { clearTimeout(SyncManager._autoTimer); SyncManager._autoTimer = null; }
    SyncManager._suspendAuto = true;
    try {
      const active = document.querySelector(".tab-pane.active");
      sessionStorage.setItem("AX_PMYS_LANDING_TAB", active ? active.id : "tab-home");
    } catch (e) {}
    ProjectContext.set(pid);
    showToast("🗂️ 프로젝트를 전환합니다...");
    window.location.reload();
  },

  // ---- 관리 창 ----
  // 프로젝트 관리는 Admin > 프로젝트 탭 안에서 (예전 팝업 창 대신)
  async renderPanels() {
    const boxes = Array.prototype.slice.call(document.querySelectorAll("[data-project-panel]"));
    if (!boxes.length) return;
    try { await this.refreshList(); } catch (e) {}
    const list = ProjectContext.projects.length ? ProjectContext.projects : [{ id: ProjectContext.current, name: projectConfig.projectName || ProjectContext.current, status: "ACTIVE" }];
    const cur = ProjectContext.info() || list.find(p => p.id === ProjectContext.current) || list[0];
    const active = list.filter(p => p.status !== "ARCHIVED").length;
    const canCreate = this.canCreate();
    const canManage = canCreate || this.canManage(cur);
    const mode = this.isServer() ? "DB 서버 (모든 멤버 공유)" : "이 PC 브라우저 저장소";
    boxes.forEach(box => {
      const compact = box.getAttribute("data-project-panel") === "compact";
      const rows = compact ? "" : `
        <div class="pm-hint">프로젝트마다 WBS · 요구사항 · VOC · 산출물 · 회의 · 주간보고 · 공지 · 프로젝트 설정을 따로 관리합니다.</div>
        <div class="table-container pm-list-wrap">
          <table class="matrix-table pm-table">
            <thead><tr><th class="pm-c-id">ID</th><th>프로젝트</th><th class="pm-c-st">상태</th><th class="pm-c-mem">멤버</th><th class="pm-c-date">만든 날</th><th class="pm-c-act">관리</th></tr></thead>
            <tbody id="pmListBody"></tbody>
          </table>
        </div>
        <div id="pmMembersPanel" class="pm-panel" hidden></div>
        ${canCreate ? `<div id="pmCreatePanel" class="pm-panel">
          <div class="pm-panel-title">➕ 새 프로젝트</div>
          <div class="pm-form">
            <label>프로젝트 이름 <input type="text" id="pmNewName" maxlength="100" placeholder="예: 28년 설비 예지보전 구축"></label>
            <label>시작일 <input type="date" id="pmNewStart" value="${escapeAttr(projectConfig.projectStartDate || "")}"></label>
            <label>종료일 <input type="date" id="pmNewEnd" value="${escapeAttr(projectConfig.projectEndDate || "")}"></label>
          </div>
          <div class="pm-form">
            <label class="pm-check"><input type="checkbox" id="pmNewCopy" checked> 현재 프로젝트의 프로젝트 설정 복사 (도메인·서브시스템·SDLC·ID 규칙·휴일·표준 산출물)</label>
            <span class="pm-check">👥 멤버는 프로젝트별로 관리합니다. 만든 뒤 [프로젝트 설정 &gt; 멤버 정보]에서 추가하거나 다른 프로젝트에서 복사하세요.</span>
          </div>
          <div class="pm-create-foot"><button class="btn btn-sm" data-btn="add" data-click="ProjectManager.create">➕ 프로젝트 만들기</button></div>
        </div>` : ""}`;
      box.innerHTML = `
        <div class="pm-summary">
          <div class="pm-summary-item"><span>현재 프로젝트</span><b>${escapeHtml(cur ? (cur.name || cur.id) : "-")}</b><code>${escapeHtml(cur ? cur.id : "")}</code></div>
          <div class="pm-summary-item"><span>프로젝트 수</span><b>${list.length}개</b><small><span>사용 중 ${active}</span> · <span>사용 중지 ${list.length - active}</span></small></div>
          <div class="pm-summary-item"><span>저장 위치</span><b>${escapeHtml(mode)}</b></div>
          <div class="pm-summary-actions">
            ${canManage && compact ? '<button class="btn btn-sm" data-btn="nav" data-click="ProjectManager.open">🗂️ 프로젝트 관리 →</button>' : ""}
            ${!canManage ? '<span class="pm-role-tag">프로젝트 추가·변경은 시스템관리자 또는 PM만 할 수 있습니다.</span>' : ""}
          </div>
        </div>${rows}`;
      if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(box);
      if (typeof I18N !== "undefined") I18N.translateTree(box);
    });
    this.renderList();
  },
  renderList() {
    const body = document.getElementById("pmListBody");
    if (!body) return;
    body.innerHTML = ProjectContext.projects.map(p => {
      const cur = p.id === ProjectContext.current;
      const manage = this.canManage(p);
      const btn = (label, fn, type, args, extra = "") => `<button class="btn btn-xs" data-btn="${type}" data-click="ProjectManager.${fn}" data-click-args="${UiEvents.args(...args)}" ${extra}>${label}</button>`;
      return `<tr class="${cur ? "pm-current" : ""}">
        <td><code>${escapeHtml(p.id)}</code></td>
        <td><b>${escapeHtml(p.name || p.id)}</b>${cur ? ' <span class="status-tag tag-progress">현재</span>' : ""}</td>
        <td>${p.status === "ARCHIVED" ? '<span class="status-tag tag-ready" title="로그인 화면의 프로젝트 목록에 나오지 않고, 시스템관리자 외에는 읽기 전용입니다. [다시 사용]으로 되돌립니다.">사용 중지</span>' : '<span class="status-tag tag-completed">사용 중</span>'}</td>
        <td>${I18N.tf("멤버 {n}명", { n: this.memberCount(p) })}</td>
        <td style="font-size:var(--fs-xs, 11px);">${escapeHtml(p.createdAt || "-")}</td>
        <td style="display:flex; gap:4px; flex-wrap:wrap;">
          ${cur ? "" : btn("열기", "switchTo", "nav", [p.id])}
          ${manage ? btn("이름 변경", "rename", "neutral", [p.id]) : ""}
          ${this.isAdmin() && p.id !== ProjectContext.DEFAULT ? btn(p.status === "ARCHIVED" ? "다시 사용" : "사용 중지", "toggleArchive", "warn", [p.id]) : ""}
          ${this.isAdmin() && p.id !== ProjectContext.DEFAULT ? btn("삭제", "remove", "danger", [p.id]) : ""}
          ${this.isAdmin() && p.id === ProjectContext.DEFAULT && cur ? btn("데이터 초기화", "resetDefault", "danger", []) : ""}
        </td>
      </tr>`;
    }).join("");
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(body);
    if (typeof I18N !== "undefined") I18N.translateTree(body);
  },

  // ---- 만들기 ----
  toggleArchive(pid) {
    const p = ProjectContext.info(pid);
    if (!p) return;
    const next = p.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
    openConfirmDialog(next === "ARCHIVED"
      ? `[${p.name}] 프로젝트를 사용 중지(보관)하시겠습니까?\n사용 중지한 프로젝트는 로그인 화면의 프로젝트 목록에 나오지 않고, 시스템관리자 외에는 읽기 전용이 됩니다. (자료는 그대로 남고 [다시 사용]으로 되돌릴 수 있습니다)`
      : `[${p.name}] 프로젝트를 다시 사용 중으로 바꾸시겠습니까?`, () => this._update(pid, { status: next }));
  },

  // 프로젝트 삭제: 프로젝트와 그 안의 자료를 모두 지움 (지금 열려 있는 프로젝트면 지운 뒤 기본 프로젝트로 이동)
  setUserAssignment(idx, field, value) {
    const u = projectUsers[idx];
    if (!u) return;
    const pid = ProjectContext.current;
    if (ProjectContext.isAdminUser(u)) {
      if (field === "dept") u.dept = value;
      else if (field === "role" && value !== "SYS_ADMIN" && this.isAdmin() && String(u.empNo).toLowerCase() !== "admin") {
        // 시스템관리자 해제 → 이 프로젝트의 사용자로
        u.role = value;
        u.projectRoles = Object.assign({}, u.projectRoles, { [pid]: { role: value, subsystem: u.subsystem || "ALL", dept: u.dept || "" } });
      }
    } else if (field === "role" && value === "SYS_ADMIN") {
      if (!this.isAdmin()) { showToast("시스템관리자 권한은 시스템관리자만 줄 수 있습니다."); return renderProjectUsersTable(); }
      u.role = "SYS_ADMIN";
    } else {
      const cur = this.userAssignment(u);
      const next = { role: cur.role, subsystem: cur.subsystem, dept: cur.dept || "" };
      next[field] = value;
      u.projectRoles = Object.assign({}, u.projectRoles, { [pid]: next });
    }
    renderProjectUsersTable();
    persistChanges();
  }
});

Object.assign(UserCopy, {
  _modal() {
    let m = document.getElementById("userCopyModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "userCopyModal";
    m.className = "modal-overlay pm-modal";
    m.innerHTML = `
      <div class="modal-content pm-modal-box">
        <div class="pm-modal-head">
          <h3>📥 다른 프로젝트에서 멤버 복사</h3>
          <button class="btn btn-sm" data-btn="cancel" data-click="UserCopy.close">닫기</button>
        </div>
        <div class="pm-hint">고른 멤버의 역할·담당 서브시스템·부서를 지금 프로젝트로 복사합니다. 계정(사번·비밀번호)은 같으므로 같은 비밀번호로 이 프로젝트에 로그인할 수 있습니다. 이미 이 프로젝트에 있는 멤버는 건너뜁니다.</div>
        <label class="pm-check" style="gap:8px;">복사할 프로젝트 <select id="ucSource" data-change="UserCopy.load"></select></label>
        <div class="table-container" style="max-height:320px;">
          <table class="matrix-table pm-table">
            <thead><tr><th style="width:36px;"><input type="checkbox" id="ucAll" data-change="UserCopy.toggleAll" aria-label="모두 선택"></th><th>사번</th><th>이름</th><th>역할</th><th>담당</th><th>부서</th><th style="width:100px;">이 프로젝트</th></tr></thead>
            <tbody id="ucBody"></tbody>
          </table>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <span id="ucSummary" class="pm-role-tag"></span>
          <button class="btn btn-sm" data-btn="add" data-click="UserCopy.copy">📥 선택한 멤버 복사</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    return m;
  },
  async open() {
    if (!ProjectManager.isAdmin()) return showToast("다른 프로젝트의 멤버 복사는 시스템관리자만 할 수 있습니다.");
    const m = this._modal();
    await ProjectManager.refreshList();
    const others = (ProjectContext.projects || []).filter(p => p.id !== ProjectContext.current);
    const sel = document.getElementById("ucSource");
    sel.innerHTML = others.length ? others.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name || p.id)} (${escapeHtml(p.id)})</option>`).join("") : `<option value="">다른 프로젝트가 없습니다</option>`;
    m.style.display = "flex";
    await this.load();
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(m);
    if (typeof I18N !== "undefined") I18N.translateTree(m);
  },
});
