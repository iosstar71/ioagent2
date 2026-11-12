// =============================================================================
// [Project Mgmt v1.0.10] 여러 프로젝트 관리 (ProjectManager)
// -----------------------------------------------------------------------------
//  - 머리글 [프로젝트 선택]으로 프로젝트 전환 (미저장 변경 확인 후 화면 다시 불러오기)
//  - [🗂️ 프로젝트 관리]: 새 프로젝트 만들기(현재 프로젝트 기준정보 복사 선택), 이름 변경,
//    참여자 지정(참여자만 접근), 보관/복원, 삭제
//  - 작업자 계정은 모든 프로젝트 공통. 역할·담당 서브시스템은 프로젝트별로 지정 가능
//    (기준정보 > d. 작업자 정보에서 현재 프로젝트 기준으로 편집)
//  - 로컬 저장소 모드: 브라우저 저장소에 프로젝트별 저장 / DB 서버 모드: 서버 API (/api/projects/*)
// =============================================================================
var ProjectManager = {
  _editingMembers: null,

  isServer() { return typeof SyncManager !== "undefined" && !SyncManager.isLocal(); },
  baseRole() {
    const u = AuthManager.getCurrentUser();
    return AuthManager.normalizeRole(u.baseRole || u.role);
  },
  // [v3.0.0] 프로젝트 만들기·전환·관리는 관리자만 (그 밖의 작업자는 선택한 프로젝트만 사용)
  canCreate() { return this.isAdmin(); },
  isAdmin() { return this.baseRole() === "SYS_ADMIN"; },
  canManage(p) { return this.isAdmin(); },
  // 프로젝트 작업자 수 (관리자 제외)
  memberCount(p) {
    if (typeof p.memberCount === "number") return p.memberCount;
    return (ProjectContext.allUsers || []).filter(u => !ProjectContext.isAdminUser(u) && ProjectContext.member(u, p.id)).length;
  },

  // ---- 목록 ----
  async refreshList() {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/projects/list", {});
      if (res.ok && Array.isArray(res.projects)) ProjectContext.projects = res.projects;
    } else {
      const u = AuthManager.getCurrentUser();
      const list = ProjectContext.localList();
      ProjectContext.projects = this.isAdmin() ? list : list.filter(p => p.id === ProjectContext.current && ProjectContext.canAccess(Object.assign({}, u, { role: u.baseRole || u.role }), p));
    }
    return ProjectContext.projects;
  },

  // 작업자 선택 직후: 현재 프로젝트 접근 확인 + 머리글 표시
  async afterLogin() {
    await this.refreshList();
    // [v3.0.0] 관리자가 아닌데 이 프로젝트의 작업자가 아니면 다시 작업자 선택 (프로젝트 선택)
    if (!this.isAdmin() && !ProjectContext.info()) {
      AuthManager.openLogin("🗂️ 프로젝트 멤버 선택", "이 프로젝트의 멤버가 아닙니다. 참여 중인 프로젝트를 선택해 다시 멤버를 선택하세요.");
      return false;
    }
    if (!ProjectContext.info()) {
      // 접근할 수 없거나 없는 프로젝트 → 기본 프로젝트로
      if (!ProjectContext.isDefault()) {
        showToast("⚠️ 선택했던 프로젝트에 접근할 수 없어 기본 프로젝트로 전환합니다.");
        ProjectContext.set(ProjectContext.DEFAULT);
        if (!this.isServer()) { setTimeout(() => AppStore.reload(), 400); return false; }
      }
    }
    this.renderSelector();
    return true;
  },

  renderSelector() {
    const sel = document.getElementById("headerProjectSelect");
    if (!sel) return;
    const list = ProjectContext.projects.length ? ProjectContext.projects : [{ id: ProjectContext.current, name: projectConfig.projectName || ProjectContext.current, status: "ACTIVE" }];
    sel.innerHTML = list.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === ProjectContext.current ? "selected" : ""}>${escapeHtml(p.name || p.id)}${p.status === "ARCHIVED" ? " (사용 중지)" : ""}</option>`).join("");
    // [v3.0.0] 프로젝트 전환은 관리자만 — 그 밖의 작업자는 프로젝트 이름만 표시
    const badge = document.getElementById("headerProjectNameBadge");
    const admin = this.isAdmin();
    sel.style.display = admin ? "" : "none";
    if (badge) {
      badge.style.display = admin ? "none" : "";
      badge.textContent = (ProjectContext.info() || {}).name || projectConfig.projectName || ProjectContext.current;
      badge.title = "선택한 프로젝트 (다른 프로젝트는 다시 멤버를 선택하여 선택)";
    }
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
    if (!this.isAdmin()) {
      showToast("ℹ️ 다른 프로젝트는 멤버 변경 후 멤버 선택 화면에서 프로젝트를 선택해 들어가세요.");
      if (onCancel) onCancel();
      return;
    }
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
    AppStore.reload();
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
        <div class="pm-hint">프로젝트마다 WBS·요구사항·VOC·산출물·회의·주간보고·공지·프로젝트 설정을 따로 관리합니다. 멤버 계정은 모든 프로젝트 공통이며, 역할·담당 서브시스템은 [프로젝트 설정 &gt; d. 멤버 정보]에서 프로젝트별로 지정합니다.</div>
        <div class="table-container" style="max-height:300px;">
          <table class="matrix-table pm-table">
            <thead><tr><th style="width:70px;">ID</th><th>프로젝트</th><th style="width:80px;">상태</th><th style="width:130px;">멤버</th><th style="width:140px;">만든 날</th><th style="width:300px;">관리</th></tr></thead>
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
            <label class="pm-check"><input type="checkbox" id="pmNewCopy" checked> 현재 프로젝트의 프로젝트 설정 복사 (도메인·서브시스템·SDLC·ID 규칙·휴일·표준 산출물)</label>
            <span class="pm-check">👥 멤버는 프로젝트별로 관리합니다. 만든 뒤 [프로젝트 설정 &gt; 멤버 정보]에서 추가하거나 다른 프로젝트에서 복사하세요.</span>
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
  // [Standard v1.0.1] 시스템 설정·기준정보에서 바로 새 프로젝트 등록 (관리 창을 열고 이름 칸으로 이동)
  async openNew() {
    await this.open();
    const panel = document.getElementById("pmCreatePanel");
    const name = document.getElementById("pmNewName");
    if (panel && panel.style.display !== "none") {
      panel.scrollIntoView({ block: "nearest" });
      if (name) name.focus();
    } else {
      showToast("⚠️ 새 프로젝트는 관리자 또는 PM만 만들 수 있습니다.");
    }
  },

  // [Standard v1.0.1] 시스템 설정 > 🗂️ 프로젝트, 기준정보 > 기본정보의 프로젝트 요약 카드
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
        <div class="table-container" style="max-height:260px;">
          <table class="matrix-table pm-table">
            <thead><tr><th style="width:70px;">ID</th><th>프로젝트</th><th style="width:80px;">상태</th><th style="width:130px;">멤버</th><th style="width:90px;"></th></tr></thead>
            <tbody>${list.map(p => `<tr class="${p.id === ProjectContext.current ? "pm-current" : ""}">
              <td><code>${escapeHtml(p.id)}</code></td>
              <td><b>${escapeHtml(p.name || p.id)}</b>${p.id === ProjectContext.current ? ' <span class="status-tag tag-progress">현재</span>' : ""}</td>
              <td>${p.status === "ARCHIVED" ? '<span class="status-tag tag-ready" title="작업자 선택 화면의 프로젝트 목록에 나오지 않고, 관리자 외에는 읽기 전용입니다. [다시 사용]으로 되돌립니다.">사용 중지</span>' : '<span class="status-tag tag-completed">사용 중</span>'}</td>
              <td>멤버 ${this.memberCount(p)}명</td>
              <td>${p.id === ProjectContext.current ? "" : `<button class="btn btn-xs" data-btn="nav" data-click="ProjectManager.switchTo" data-click-args="${UiEvents.args(p.id)}">열기</button>`}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>`;
      box.innerHTML = `
        <div class="pm-summary">
          <div class="pm-summary-item"><span>현재 프로젝트</span><b>${escapeHtml(cur ? (cur.name || cur.id) : "-")}</b><code>${escapeHtml(cur ? cur.id : "")}</code></div>
          <div class="pm-summary-item"><span>프로젝트 수</span><b>${list.length}개</b><small>사용 중 ${active} · 사용 중지 ${list.length - active}</small></div>
          <div class="pm-summary-item"><span>저장 위치</span><b>${escapeHtml(mode)}</b></div>
          <div class="pm-summary-actions">
            ${canManage ? '<button class="btn btn-sm" data-btn="nav" data-click="ProjectManager.open">🗂️ 프로젝트 관리 열기</button>' : ""}
            ${canCreate ? '<button class="btn btn-sm" data-btn="add" data-click="ProjectManager.openNew">➕ 새 프로젝트 등록</button>' : ""}
            ${canCreate && typeof SampleProject !== "undefined" && SyncManager.isLocal() ? '<button class="btn btn-sm" data-click="SampleProject.add" title="교육 · 시연용 샘플 프로젝트를 새 프로젝트로 추가 (지금 프로젝트는 그대로)">🧪 샘플 프로젝트 추가</button>' : ""}
            ${!canManage ? '<span class="pm-role-tag">프로젝트 추가·변경은 관리자 또는 PM만 할 수 있습니다.</span>' : ""}
          </div>
        </div>${rows}`;
      if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(box);
      if (typeof I18N !== "undefined") I18N.translateTree(box);
    });
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
        <td>${p.status === "ARCHIVED" ? '<span class="status-tag tag-ready" title="작업자 선택 화면의 프로젝트 목록에 나오지 않고, 관리자 외에는 읽기 전용입니다. [다시 사용]으로 되돌립니다.">사용 중지</span>' : '<span class="status-tag tag-completed">사용 중</span>'}</td>
        <td>멤버 ${this.memberCount(p)}명</td>
        <td style="font-size:var(--fs-xs, 11px);">${escapeHtml(p.createdAt || "-")}</td>
        <td style="display:flex; gap:4px; flex-wrap:wrap;">
          ${cur ? "" : btn("열기", "switchTo", "nav", [p.id])}
          ${manage ? btn("이름 변경", "rename", "neutral", [p.id]) : ""}
          ${this.isAdmin() && p.id !== ProjectContext.DEFAULT ? btn(p.status === "ARCHIVED" ? "다시 사용" : "사용 중지", "toggleArchive", "warn", [p.id]) : ""}
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
    // [v3.0.0] 소통 채널은 프로젝트별: 전체 + 이 프로젝트의 서브시스템
    cfg.channels = ["전체"].concat(copy ? (subsystemsMeta || []).map(m => m.code || m.name).filter(Boolean) : []);
    const data = {
      projectConfig: cfg,
      subsystemsMeta: copy ? JSON.parse(JSON.stringify(subsystemsMeta)) : [],
      standardDeliverablesMeta: copy ? JSON.parse(JSON.stringify(standardDeliverablesMeta)) : JSON.parse(JSON.stringify(DEFAULT_STANDARD_DELIVERABLES)),
      wbsData: [], deliverablesData: [], reqMasterData: [], vocData: [], todosData: [],
      noticesData: [], communicationsData: [], meetingsData: [], weeklyReportsData: []
    };
    return data;
  },

  async create() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
    const name = v("pmNewName"), start = v("pmNewStart"), end = v("pmNewEnd");
    const copy = document.getElementById("pmNewCopy").checked;
    const restricted = false;
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
    this.renderPanels();
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
          if (st && st.projectConfig) { st.projectConfig.projectName = patch.name; AppStore.setItem(LocalBackend._skey(pid), JSON.stringify(st)); }
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
    this.renderPanels();
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
      ? `[${p.name}] 프로젝트를 사용 중지(보관)하시겠습니까?\n사용 중지한 프로젝트는 멤버 선택 화면의 프로젝트 목록에 나오지 않고, 관리자 외에는 읽기 전용이 됩니다. (자료는 그대로 남고 [다시 사용]으로 되돌릴 수 있습니다)`
      : `[${p.name}] 프로젝트를 다시 사용 중으로 바꾸시겠습니까?`, () => this._update(pid, { status: next }));
  },

  remove(pid) {
    const p = ProjectContext.info(pid);
    if (!p || pid === ProjectContext.DEFAULT || pid === ProjectContext.current) return;
    openConfirmDialog(`[${p.name}] 프로젝트와 그 안의 모든 데이터(WBS·요구사항·VOC·산출물·회의·주간보고·공지·채팅)를 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?\n(삭제 전 [시스템 설정 > 백업]으로 다운로드해 두는 것을 권장합니다)`, async () => {
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
      this.renderPanels();
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
      <label class="pm-check"><input type="checkbox" id="pmRestricted" ${p.restricted ? "checked" : ""}> 참여자만 접근 (체크 해제 시 전체 멤버 접근)</label>
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

  // ---- 작업자 정보: 프로젝트별 역할 ----
  // 기본 프로젝트가 아니면 역할·담당 서브시스템 변경은 현재 프로젝트에만 적용 (projectRoles)
  // [v3.0.0] 이 프로젝트의 역할·담당·부서
  userAssignment(u) {
    if (ProjectContext.isAdminUser(u)) return { role: "SYS_ADMIN", subsystem: "ALL", dept: u.dept || "", own: false, admin: true };
    const a = ProjectContext.member(u) || {};
    return { role: AuthManager.normalizeRole(a.role || "MEMBER"), subsystem: a.subsystem || "ALL", dept: a.dept !== undefined ? a.dept : (u.dept || ""), own: true };
  },
  setUserAssignment(idx, field, value) {
    const u = projectUsers[idx];
    if (!u) return;
    const pid = ProjectContext.current;
    if (ProjectContext.isAdminUser(u)) {
      if (field === "dept") u.dept = value;
      else if (field === "role" && value !== "SYS_ADMIN" && this.isAdmin() && String(u.empNo).toLowerCase() !== "admin") {
        // 관리자 해제 → 이 프로젝트의 작업자로
        u.role = value;
        u.projectRoles = Object.assign({}, u.projectRoles, { [pid]: { role: value, subsystem: u.subsystem || "ALL", dept: u.dept || "" } });
      }
    } else if (field === "role" && value === "SYS_ADMIN") {
      if (!this.isAdmin()) { showToast("관리자 권한은 관리자만 줄 수 있습니다."); return renderProjectUsersTable(); }
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
};

// =============================================================================
// [v3.0.0] 다른 프로젝트에서 작업자 복사 (관리자) — 역할·담당·부서를 그대로 이 프로젝트로
// =============================================================================
var UserCopy = {
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
        <div class="pm-hint">고른 멤버의 역할·담당 서브시스템·부서를 지금 프로젝트로 복사합니다. 계정(멤버 ID·암호)은 같으므로 같은 암호로 이 프로젝트에 작업할 수 있습니다. 이미 이 프로젝트에 있는 멤버는 건너뜁니다.</div>
        <label class="pm-check" style="gap:8px;">복사할 프로젝트 <select id="ucSource" data-change="UserCopy.load"></select></label>
        <div class="table-container" style="max-height:320px;">
          <table class="matrix-table pm-table">
            <thead><tr><th style="width:36px;"><input type="checkbox" id="ucAll" data-change="UserCopy.toggleAll" aria-label="모두 선택"></th><th>멤버 ID</th><th>이름</th><th>역할</th><th>담당</th><th>부서</th><th style="width:100px;">이 프로젝트</th></tr></thead>
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
    if (!ProjectManager.isAdmin()) return showToast("다른 프로젝트의 멤버 복사는 관리자만 할 수 있습니다.");
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
  close() { const m = document.getElementById("userCopyModal"); if (m) m.style.display = "none"; },
  async load() {
    const src = document.getElementById("ucSource").value;
    const body = document.getElementById("ucBody");
    let members = [];
    if (src) {
      if (ProjectManager.isServer()) {
        const res = await ServerBackend.request("/api/projects/members", { fromProject: src });
        members = res.ok ? res.members || [] : [];
      } else {
        members = (ProjectContext.allUsers || []).filter(u => !ProjectContext.isAdminUser(u) && ProjectContext.member(u, src))
          .map(u => Object.assign({ empNo: u.empNo, name: u.name }, ProjectContext.member(u, src)));
      }
    }
    const here = new Set(projectUsers.filter(u => ProjectContext.member(u)).map(u => String(u.empNo).toLowerCase()));
    this._members = members;
    body.innerHTML = members.length ? members.map(m => {
      const has = here.has(String(m.empNo).toLowerCase());
      return `<tr><td><input type="checkbox" class="uc-pick" value="${escapeAttr(m.empNo)}" ${has ? "disabled" : "checked"} aria-label="${escapeAttr(m.empNo)} 선택"></td>
        <td><code>${escapeHtml(m.empNo)}</code></td><td>${escapeHtml(m.name || "")}</td><td>${escapeHtml(AuthManager.roleLabel(AuthManager.normalizeRole(m.role)))}</td>
        <td>${escapeHtml(m.subsystem || "ALL")}</td><td>${escapeHtml(m.dept || "")}</td><td>${has ? '<span class="status-tag tag-completed">이미 있음</span>' : '<span class="status-tag tag-ready">복사 대상</span>'}</td></tr>`;
    }).join("") : `<tr><td colspan="7" style="text-align:center; padding:14px; color:var(--text-muted);">이 프로젝트에 멤버가 없습니다.</td></tr>`;
    const all = document.getElementById("ucAll");
    if (all) all.checked = true;
    document.getElementById("ucSummary").textContent = `멤버 ${members.length}명 · 이미 있음 ${members.filter(m => here.has(String(m.empNo).toLowerCase())).length}명`;
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("userCopyModal"));
  },
  toggleAll() {
    const on = document.getElementById("ucAll").checked;
    document.querySelectorAll("#ucBody .uc-pick:not([disabled])").forEach(c => { c.checked = on; });
  },
  async copy() {
    const src = document.getElementById("ucSource").value;
    const emps = Array.prototype.map.call(document.querySelectorAll("#ucBody .uc-pick:checked:not([disabled])"), c => c.value);
    if (!src || !emps.length) return showToast("복사할 멤버를 고르세요.");
    const pid = ProjectContext.current;
    let copied = [];
    if (ProjectManager.isServer()) {
      if (SyncManager.isDirty(["projectUsers"])) await SyncManager.save(["projectUsers"], { notify: false });
      const res = await ServerBackend.request("/api/projects/copy-users", { fromProject: src, empNos: emps });
      if (!res.ok) return showToast("❌ 복사 실패: " + (res.message || ""));
      copied = res.copied || [];
      await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
    } else {
      emps.forEach(e => {
        const full = ProjectContext.findAny(e);
        const a = full && ProjectContext.member(full, src);
        if (!a || ProjectContext.member(full, pid)) return;
        let row = projectUsers.find(u => String(u.empNo).toLowerCase() === String(e).toLowerCase());
        if (!row) { row = full; projectUsers.push(row); }
        row.projectRoles = Object.assign({}, row.projectRoles, { [pid]: { role: a.role, subsystem: a.subsystem || "ALL", dept: a.dept || "" } });
        copied.push(e);
      });
      await SyncManager.save(["projectUsers"], { notify: false });
    }
    this.close();
    renderProjectUsersTable();
    showToast(`📥 멤버 ${copied.length}명을 이 프로젝트로 복사했습니다.`);
  }
};
window.UserCopy = UserCopy;

window.ProjectManager = ProjectManager;
