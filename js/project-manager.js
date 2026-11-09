// =============================================================================
// [IOSTAR-PM v1.0.10] 여러 프로젝트 관리 (ProjectManager)
// -----------------------------------------------------------------------------
//  - 머리글 [프로젝트 선택]으로 프로젝트 전환 (미저장 변경 확인 후 화면 다시 불러오기)
//  - [🗂️ 프로젝트 관리]: 새 프로젝트 만들기(현재 프로젝트 기준정보 복사 선택), 이름 변경,
//    참여자 지정(참여자만 접근), 보관/복원, 삭제
//  - 사용자 계정은 모든 프로젝트 공통. 역할·담당 서브시스템은 프로젝트별로 지정 가능
//    (기준정보 > d. 사용자 정보에서 현재 프로젝트 기준으로 편집)
//  - 로컬 저장소 모드: 브라우저 저장소에 프로젝트별 저장 / DB 서버 모드: 서버 API (/api/projects/*)
// =============================================================================
var ProjectManager = {
  _editingMembers: null,

  isServer() { return typeof SyncManager !== "undefined" && !SyncManager.isLocal(); },
  baseRole() {
    const u = AuthManager.getCurrentUser();
    return AuthManager.normalizeRole(u.baseRole || u.role);
  },
  canCreate() { const r = this.baseRole(); return r === "SYS_ADMIN" || r === "PM"; },
  isAdmin() { return this.baseRole() === "SYS_ADMIN"; },
  canManage(p) {
    if (this.isAdmin()) return true;
    if (!p) return false;
    const u = AuthManager.getCurrentUser();
    const eff = ProjectContext.effective(Object.assign({}, AuthManager.findUser(u.empNo) || u, { role: u.baseRole || u.role }), p.id);
    return eff.role === "SYS_ADMIN" || eff.role === "PM";
  },

  // ---- 목록 ----
  async refreshList() {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/projects/list", {});
      if (res.ok && Array.isArray(res.projects)) ProjectContext.projects = res.projects;
    } else {
      const u = AuthManager.getCurrentUser();
      ProjectContext.projects = ProjectContext.localList().filter(p => ProjectContext.canAccess(Object.assign({}, u, { role: u.baseRole || u.role }), p));
    }
    return ProjectContext.projects;
  },

  // 로그인 직후: 현재 프로젝트 접근 확인 + 머리글 표시
  async afterLogin() {
    await this.refreshList();
    if (!ProjectContext.info()) {
      // 접근할 수 없거나 없는 프로젝트 → 기본 프로젝트로
      if (!ProjectContext.isDefault()) {
        showToast("⚠️ 선택했던 프로젝트에 접근할 수 없어 기본 프로젝트로 전환합니다.");
        ProjectContext.set(ProjectContext.DEFAULT);
        if (!this.isServer()) { setTimeout(() => window.location.reload(), 400); return false; }
      }
    }
    this.renderSelector();
    return true;
  },

  renderSelector() {
    const sel = document.getElementById("headerProjectSelect");
    if (!sel) return;
    const list = ProjectContext.projects.length ? ProjectContext.projects : [{ id: ProjectContext.current, name: projectConfig.projectName || ProjectContext.current, status: "ACTIVE" }];
    sel.innerHTML = list.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === ProjectContext.current ? "selected" : ""}>${escapeHtml(p.name || p.id)}${p.status === "ARCHIVED" ? " (보관)" : ""}${p.restricted ? " 🔒" : ""}</option>`).join("");
    const badge = document.getElementById("headerProjectNameBadge");
    if (badge) badge.style.display = "none";
    const btn = document.getElementById("btnProjectManager");
    if (btn) btn.style.display = this.canCreate() || this.canManage(ProjectContext.info()) ? "" : "none";
    const cur = ProjectContext.info();
    const arch = document.getElementById("projectArchivedBar");
    if (arch) arch.style.display = cur && cur.status === "ARCHIVED" ? "block" : "none";
  },

  // ---- 전환 ----
  onSelect(pid) {
    if (pid === ProjectContext.current) return;
    const back = () => { const sel = document.getElementById("headerProjectSelect"); if (sel) sel.value = ProjectContext.current; };
    this.switchTo(pid, back);
  },

  async switchTo(pid, onCancel) {
    if (!pid || pid === ProjectContext.current) return;
    const retry = () => this.switchTo(pid, onCancel);
    if (typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.currentWeekReport && !WeeklyReportManager.confirmLeave(retry)) { if (onCancel) onCancel(); return; }
    if (typeof MeetingManager !== "undefined" && MeetingManager.confirmLeave && !MeetingManager.confirmLeave(retry)) { if (onCancel) onCancel(); return; }
    if (SyncManager.isLocal()) {
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
    ProjectContext.set(pid);
    try {
      const active = document.querySelector(".tab-pane.active");
      sessionStorage.setItem("AX_PMYS_LANDING_TAB", active ? active.id : "tab-home");
    } catch (e) {}
    showToast("🗂️ 프로젝트를 전환합니다...");
    setTimeout(() => window.location.reload(), 250);
  },

  // ---- 관리 창 ----
  _modal() {
    let m = document.getElementById("projectManagerModal");
    if (m) return m;
    m = document.createElement("div");
    m.id = "projectManagerModal";
    m.className = "modal-overlay pm-modal";
    m.innerHTML = `
      <div class="modal-content pm-modal-box">
        <div class="pm-modal-head">
          <h3>🗂️ 프로젝트 관리</h3>
          <button class="btn btn-sm" data-btn="cancel" data-click="ProjectManager.close">닫기</button>
        </div>
        <div class="pm-hint">프로젝트마다 WBS·요구사항·VOC·산출물·회의·주간보고·공지·기준정보를 따로 관리합니다. 사용자 계정은 모든 프로젝트 공통이며, 역할·담당 서브시스템은 [기준정보 &gt; d. 사용자 정보]에서 프로젝트별로 지정합니다.</div>
        <div class="table-container" style="max-height:300px;">
          <table class="matrix-table pm-table">
            <thead><tr><th style="width:70px;">ID</th><th>프로젝트</th><th style="width:80px;">상태</th><th style="width:130px;">접근</th><th style="width:140px;">만든 날</th><th style="width:300px;">관리</th></tr></thead>
            <tbody id="pmListBody"></tbody>
          </table>
        </div>
        <div id="pmMembersPanel" class="pm-panel" style="display:none;"></div>
        <div id="pmCreatePanel" class="pm-panel">
          <div class="pm-panel-title">➕ 새 프로젝트</div>
          <div class="pm-form">
            <label>프로젝트 이름 <input type="text" id="pmNewName" maxlength="100" placeholder="예: 28년 설비 예지보전 구축"></label>
            <label>시작일 <input type="date" id="pmNewStart"></label>
            <label>종료일 <input type="date" id="pmNewEnd"></label>
          </div>
          <div class="pm-form">
            <label class="pm-check"><input type="checkbox" id="pmNewCopy" checked> 현재 프로젝트의 기준정보 복사 (분야·서브시스템·SDLC·ID 규칙·휴일·표준 산출물)</label>
            <label class="pm-check"><input type="checkbox" id="pmNewRestricted"> 참여자만 접근 (지정한 사용자와 시스템관리자만 볼 수 있음)</label>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button class="btn btn-sm" data-btn="add" data-click="ProjectManager.create">➕ 프로젝트 만들기</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);
    return m;
  },

  async open() {
    const m = this._modal();
    await this.refreshList();
    this.renderList();
    const start = document.getElementById("pmNewStart");
    const end = document.getElementById("pmNewEnd");
    if (start && !start.value) start.value = projectConfig.projectStartDate || "";
    if (end && !end.value) end.value = projectConfig.projectEndDate || "";
    const create = document.getElementById("pmCreatePanel");
    if (create) create.style.display = this.canCreate() ? "" : "none";
    document.getElementById("pmMembersPanel").style.display = "none";
    m.style.display = "flex";
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(m);
    if (typeof I18N !== "undefined") I18N.translateTree(m);
  },
  close() {
    const m = document.getElementById("projectManagerModal");
    if (m) m.style.display = "none";
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
        <td>${p.status === "ARCHIVED" ? '<span class="status-tag tag-ready">보관</span>' : '<span class="status-tag tag-completed">사용 중</span>'}</td>
        <td>${p.restricted ? `🔒 참여자 ${(p.members || []).length}명` : "전체 사용자"}</td>
        <td style="font-size:11px;">${escapeHtml(p.createdAt || "-")}</td>
        <td style="display:flex; gap:4px; flex-wrap:wrap;">
          ${cur ? "" : btn("열기", "switchTo", "nav", [p.id])}
          ${manage ? btn("이름 변경", "rename", "neutral", [p.id]) : ""}
          ${manage && p.id !== ProjectContext.DEFAULT ? btn("참여자", "editMembers", "neutral", [p.id]) : ""}
          ${this.isAdmin() && p.id !== ProjectContext.DEFAULT ? btn(p.status === "ARCHIVED" ? "복원" : "보관", "toggleArchive", "warn", [p.id]) : ""}
          ${this.isAdmin() && p.id !== ProjectContext.DEFAULT && !cur ? btn("삭제", "remove", "danger", [p.id]) : ""}
        </td>
      </tr>`;
    }).join("");
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(body);
    if (typeof I18N !== "undefined") I18N.translateTree(body);
  },

  // ---- 만들기 ----
  _template(name, start, end, copy) {
    const cfg = copy ? JSON.parse(JSON.stringify(projectConfig)) : {
      weekStartDay: projectConfig.weekStartDay, holidays: [], domains: [], idPrefixConfig: projectConfig.idPrefixConfig
    };
    delete cfg.milestones;
    Object.assign(cfg, { projectName: name, projectStartDate: start, projectEndDate: end, reportDate: start });
    const data = {
      projectConfig: cfg,
      subsystemsMeta: copy ? JSON.parse(JSON.stringify(subsystemsMeta)) : [],
      standardDeliverablesMeta: copy ? JSON.parse(JSON.stringify(standardDeliverablesMeta)) : JSON.parse(JSON.stringify(DEFAULT_STANDARD_DELIVERABLES)),
      wbsData: [], deliverablesData: [], reqMasterData: [], vocData: [],
      noticesData: [], communicationsData: [], meetingsData: [], weeklyReportsData: []
    };
    return data;
  },

  async create() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
    const name = v("pmNewName"), start = v("pmNewStart"), end = v("pmNewEnd");
    const copy = document.getElementById("pmNewCopy").checked;
    const restricted = document.getElementById("pmNewRestricted").checked;
    if (!name) return showToast("프로젝트 이름을 입력하세요.");
    if (!start || !end || start > end) return showToast("프로젝트 시작일과 종료일을 확인하세요.");
    let project;
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/projects/create", { name, startDate: start, endDate: end, copyFrom: copy ? ProjectContext.current : "", copySubsystems: copy, restricted });
      if (!res.ok) return showToast("❌ 프로젝트 만들기 실패: " + (res.message || ""));
      project = res.project;
    } else {
      const list = ProjectContext.localList();
      let seq = 1;
      while (list.some(p => p.id === `P${String(seq).padStart(3, "0")}`)) seq++;
      const u = AuthManager.getCurrentUser();
      project = {
        id: `P${String(seq).padStart(3, "0")}`, name, status: "ACTIVE", restricted,
        members: restricted ? [u.empNo] : [], createdAt: new Date().toISOString().slice(0, 19).replace("T", " "), createdBy: u.empNo
      };
      LocalBackend.createProjectStore(project.id, this._template(name, start, end, copy));
      list.push(project);
      ProjectContext.saveLocalList(list);
      if (this.baseRole() !== "SYS_ADMIN") {
        const row = AuthManager.findUser(u.empNo);
        if (row) {
          row.projectRoles = Object.assign({}, row.projectRoles, { [project.id]: { role: "PM", subsystem: "ALL" } });
          await SyncManager.save(["projectUsers"], { notify: false });
        }
      }
    }
    ["pmNewName"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    showToast(`✅ 새 프로젝트 [${project.name}] (${project.id})를 만들었습니다.`);
    await this.refreshList();
    this.renderList();
    this.renderSelector();
  },

  async _update(pid, patch) {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/projects/update", Object.assign({ id: pid }, patch));
      if (!res.ok) { showToast("❌ 변경 실패: " + (res.message || "")); return false; }
    } else {
      const list = ProjectContext.localList();
      const p = list.find(x => x.id === pid);
      if (!p) return false;
      Object.assign(p, patch);
      ProjectContext.saveLocalList(list);
      if (patch.name) {
        if (pid === ProjectContext.current) {
          projectConfig.projectName = patch.name;
          persistChanges();
        } else {
          const st = LocalBackend._read(pid);
          if (st && st.projectConfig) { st.projectConfig.projectName = patch.name; localStorage.setItem(LocalBackend._skey(pid), JSON.stringify(st)); }
        }
      }
    }
    if (patch.name && pid === ProjectContext.current) {
      projectConfig.projectName = patch.name;
      if (typeof renderProjectTitles === "function") renderProjectTitles();
      if (this.isServer()) SyncManager.refresh(["projectConfig"], { silent: true, skipConfirm: true });
    }
    await this.refreshList();
    this.renderList();
    this.renderSelector();
    return true;
  },

  // 로컬 모드: 기준정보에서 프로젝트 이름을 바꾸면 목록 이름도 갱신
  syncLocalName(name) {
    const list = ProjectContext.localList();
    const p = list.find(x => x.id === ProjectContext.current);
    if (p && p.name !== name) {
      p.name = name;
      ProjectContext.saveLocalList(list);
      const cur = ProjectContext.info();
      if (cur) cur.name = name;
      this.renderSelector();
    }
  },

  rename(pid) {
    const p = ProjectContext.info(pid);
    const name = window.prompt("새 프로젝트 이름", p ? p.name : "");
    if (name && name.trim()) this._update(pid, { name: name.trim().slice(0, 100) }).then(ok => { if (ok) showToast("✏️ 프로젝트 이름을 변경했습니다."); });
  },

  toggleArchive(pid) {
    const p = ProjectContext.info(pid);
    if (!p) return;
    const next = p.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
    openConfirmDialog(next === "ARCHIVED"
      ? `[${p.name}] 프로젝트를 보관하시겠습니까? 보관된 프로젝트는 시스템관리자 외에는 읽기 전용입니다.`
      : `[${p.name}] 프로젝트를 다시 사용 중으로 바꾸시겠습니까?`, () => this._update(pid, { status: next }));
  },

  remove(pid) {
    const p = ProjectContext.info(pid);
    if (!p || pid === ProjectContext.DEFAULT || pid === ProjectContext.current) return;
    openConfirmDialog(`[${p.name}] 프로젝트와 그 안의 모든 데이터(WBS·요구사항·VOC·산출물·회의·주간보고·공지·채팅)를 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?\n(삭제 전 [시스템 설정 > 백업]으로 내려받아 두는 것을 권장합니다)`, async () => {
      if (this.isServer()) {
        const res = await ServerBackend.request("/api/projects/delete", { id: pid });
        if (!res.ok) return showToast("❌ 삭제 실패: " + (res.message || ""));
      } else {
        LocalBackend.removeProjectStore(pid);
        ProjectContext.saveLocalList(ProjectContext.localList().filter(x => x.id !== pid));
        let changed = false;
        projectUsers.forEach(u => { if (u.projectRoles && u.projectRoles[pid]) { delete u.projectRoles[pid]; changed = true; } });
        if (changed) await SyncManager.save(["projectUsers"], { notify: false });
      }
      showToast(`🗑️ [${p.name}] 프로젝트를 삭제했습니다.`);
      await this.refreshList();
      this.renderList();
      this.renderSelector();
    });
  },

  // ---- 참여자 ----
  editMembers(pid) {
    const p = ProjectContext.info(pid);
    const panel = document.getElementById("pmMembersPanel");
    if (!p || !panel) return;
    this._editingMembers = pid;
    const members = new Set((p.members || []).map(m => String(m).toLowerCase()));
    panel.innerHTML = `
      <div class="pm-panel-title">👥 [${escapeHtml(p.name)}] 참여자</div>
      <label class="pm-check"><input type="checkbox" id="pmRestricted" ${p.restricted ? "checked" : ""}> 참여자만 접근 (체크 해제 시 전체 사용자 접근)</label>
      <div class="pm-members">${projectUsers.map(u => `<label class="pm-check"><input type="checkbox" class="pm-member" value="${escapeAttr(u.empNo)}" ${members.has(String(u.empNo).toLowerCase()) ? "checked" : ""}> ${escapeHtml(u.name || u.empNo)} <span style="color:var(--text-muted);">(${escapeHtml(u.empNo)})</span></label>`).join("")}</div>
      <div style="display:flex; gap:6px; justify-content:flex-end;">
        <button class="btn btn-sm" data-btn="cancel" data-click="ProjectManager.closeMembers">취소</button>
        <button class="btn btn-sm" data-btn="save" data-click="ProjectManager.saveMembers">참여자 저장</button>
      </div>`;
    panel.style.display = "block";
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(panel);
    if (typeof I18N !== "undefined") I18N.translateTree(panel);
  },
  closeMembers() {
    const panel = document.getElementById("pmMembersPanel");
    if (panel) panel.style.display = "none";
    this._editingMembers = null;
  },
  async saveMembers() {
    const pid = this._editingMembers;
    if (!pid) return;
    const members = Array.from(document.querySelectorAll("#pmMembersPanel .pm-member:checked")).map(el => el.value);
    const restricted = document.getElementById("pmRestricted").checked;
    if (await this._update(pid, { members, restricted })) {
      showToast(`👥 참여자 ${members.length}명을 저장했습니다.${restricted ? " (참여자만 접근)" : ""}`);
      this.closeMembers();
    }
  },

  // ---- 사용자 정보: 프로젝트별 역할 ----
  // 기본 프로젝트가 아니면 역할·담당 서브시스템 변경은 현재 프로젝트에만 적용 (projectRoles)
  userAssignment(u) {
    if (ProjectContext.isDefault()) return { role: AuthManager.normalizeRole(u.role), subsystem: u.subsystem || "ALL", own: false };
    const a = u.projectRoles && u.projectRoles[ProjectContext.current];
    if (AuthManager.normalizeRole(u.role) === "SYS_ADMIN") return { role: "SYS_ADMIN", subsystem: "ALL", own: false, admin: true };
    return a ? { role: AuthManager.normalizeRole(a.role), subsystem: a.subsystem || "ALL", own: true } : { role: AuthManager.normalizeRole(u.role), subsystem: u.subsystem || "ALL", own: false };
  },
  setUserAssignment(idx, field, value) {
    const u = projectUsers[idx];
    if (!u) return;
    if (ProjectContext.isDefault()) {
      u[field] = value;
    } else {
      const cur = this.userAssignment(u);
      const next = { role: cur.role === "SYS_ADMIN" ? "PM" : cur.role, subsystem: cur.subsystem };
      next[field] = field === "role" && value === "SYS_ADMIN" ? "PM" : value;
      u.projectRoles = Object.assign({}, u.projectRoles, { [ProjectContext.current]: next });
    }
    renderProjectUsersTable();
    persistChanges();
  },
  clearUserAssignment(idx) {
    const u = projectUsers[idx];
    if (!u || !u.projectRoles) return;
    delete u.projectRoles[ProjectContext.current];
    u.projectRoles = Object.assign({}, u.projectRoles);
    renderProjectUsersTable();
    persistChanges();
  }
};

window.ProjectManager = ProjectManager;
