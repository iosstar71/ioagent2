// =============================================================================
// [Project Mgmt v3.7.0] 전체 작업자 통합 관리 (UserAdmin) — [⚙ 시스템 설정 > 👥 전체 작업자], 관리자 전용
// -----------------------------------------------------------------------------
//  - 등록된 모든 작업자를 한 표에서 보고, 작업자마다 참여 프로젝트 · 역할 · 담당 서브시스템을 함께 관리
//  - 계정(작업자 ID · 이름 · 암호)은 하나, 프로젝트마다 참여 정보(projectRoles[프로젝트] = 역할 · 담당 · 부서)
//  - DB 서버 방식: /api/admin/users/* (서버가 관리자인지 다시 확인) / 로컬 저장소 방식: 이 PC 저장소를 직접 고침
//  - 프로젝트 안에서의 작업자 관리([기준정보 > 작업자 정보])는 그대로 — 여기서 고친 내용이 바로 반영됨
// =============================================================================
var UserAdmin = {
  ROLES: ["PM", "LEAD", "MEMBER"],
  users: [],
  projects: [],
  editing: null,   // { isNew, empNo }

  isServer() { return typeof DbConnector !== "undefined" && DbConnector.isServerMode(); },
  allowed() { return typeof ProjectManager !== "undefined" ? ProjectManager.isAdmin() : false; },
  roleLabel(r) { return AuthManager.roleLabel(r) || r; },
  projectName(pid) { const p = this.projects.find(x => x.id === pid); return p ? p.name : pid; },

  // ---- 저장소 ----
  _localUsers() {
    const st = LocalBackend._read(ProjectContext.DEFAULT) || {};
    return { st, list: Array.isArray(st.projectUsers) ? st.projectUsers : [] };
  },
  _localProjects() {
    return ProjectContext.localList().map(p => {
      let subs = [];
      if (p.id === ProjectContext.current) subs = (subsystemsMeta || []).map(m => m.name || m.code);
      else { const st = LocalBackend._read(p.id); subs = ((st && st.subsystemsMeta) || []).map(m => m.name || m.code); }
      return { id: p.id, name: p.id === ProjectContext.current ? (projectConfig.projectName || p.name) : p.name, status: p.status || "ACTIVE", subsystems: subs.filter(Boolean) };
    });
  },
  _localWrite(st, emp) {
    const revs = LocalBackend._readRevs(ProjectContext.DEFAULT);
    revs.projectUsers = revs.projectUsers || {};
    const cur = revs.projectUsers[emp];
    revs.projectUsers[emp] = { rev: ((cur && cur.rev) || 0) + 1, by: AuthManager.getCurrentUser().empNo, at: new Date().toLocaleString() };
    LocalBackend._write(ProjectContext.DEFAULT, st, revs);
  },
  _apply(res) {
    this.users = res.users || [];
    this.projects = res.projects || [];
  },

  async load() {
    if (!this.allowed()) return;
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/admin/users/list", {});
      if (!res.ok) { showToast("⚠️ " + (res.message || "작업자 목록을 불러오지 못했습니다.")); return; }
      this._apply(res);
    } else {
      this._apply({
        users: this._localUsers().list.map(u => Object.assign({}, u, { sysAdmin: ProjectContext.isAdminUser(u), pwdDefault: !u.pwdHash, projectRoles: u.projectRoles || {} })),
        projects: this._localProjects()
      });
    }
    this.render();
  },

  async _save(req) {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/admin/users/save", req);
      if (!res.ok) return res.message || "저장하지 못했습니다.";
      this._apply(res);
    } else {
      const { st, list } = this._localUsers();
      const key = req.empNo.toLowerCase();
      let row = list.find(u => String(u.empNo || "").toLowerCase() === key);
      if (req.isNew && row) return `이미 등록된 작업자 ID입니다: ${req.empNo}`;
      const me = String(AuthManager.getCurrentUser().empNo).toLowerCase();
      const admin = key === "admin" ? true : req.sysAdmin;
      if (key === me && !admin) return "자기 자신의 관리자 권한은 해제할 수 없습니다.";
      if (!row) { row = { empNo: req.empNo, pwdHash: "", lang: "ko" }; list.push(row); }
      const first = Object.values(req.projectRoles)[0];
      Object.assign(row, { name: req.name, dept: req.dept, projectRoles: req.projectRoles,
        role: admin ? "SYS_ADMIN" : (first ? first.role : "MEMBER"), subsystem: admin ? "ALL" : (first ? first.subsystem : "ALL") });
      if (req.pwdReset) { row.pwdHash = ""; row.pwdTemp = false; }
      st.projectUsers = list;
      this._localWrite(st, row.empNo);
    }
    await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
    if (!this.isServer()) await this.load();
    return "";
  },

  async _delete(empNo) {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/admin/users/delete", { empNo });
      if (!res.ok) return res.message || "삭제하지 못했습니다.";
      this._apply(res);
    } else {
      const { st, list } = this._localUsers();
      const key = String(empNo).toLowerCase();
      if (key === "admin") return "기본 관리자(admin) 계정은 삭제할 수 없습니다.";
      if (key === String(AuthManager.getCurrentUser().empNo).toLowerCase()) return "지금 선택한 계정은 삭제할 수 없습니다.";
      st.projectUsers = list.filter(u => String(u.empNo || "").toLowerCase() !== key);
      this._localWrite(st, empNo);
    }
    await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
    if (!this.isServer()) await this.load();
    return "";
  },

  // ---- 목록 ----
  render() {
    const body = document.getElementById("uaBody");
    if (!body) return;
    const q = (document.getElementById("uaSearch").value || "").trim().toLowerCase();
    const psel = document.getElementById("uaProjectFilter");
    const keep = psel.value || "ALL";
    psel.innerHTML = `<option value="ALL">전체 프로젝트</option><option value="NONE">참여 프로젝트 없음</option>` +
      this.projects.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join("");
    psel.value = [...psel.options].some(o => o.value === keep) ? keep : "ALL";
    const pf = psel.value;
    const rows = this.users.filter(u => {
      const prs = Object.keys(u.projectRoles || {}).filter(pid => this.projects.some(p => p.id === pid));
      if (q && !(`${u.empNo} ${u.name} ${u.dept || ""}`.toLowerCase().includes(q))) return false;
      if (pf === "NONE") return !u.sysAdmin && !prs.length;
      if (pf !== "ALL") return u.sysAdmin || prs.includes(pf);
      return true;
    });
    const admins = this.users.filter(u => u.sysAdmin).length;
    document.getElementById("uaSummary").textContent = `등록 작업자 ${this.users.length}명 · 관리자 ${admins}명 · 프로젝트 ${this.projects.length}개 — 표시 ${rows.length}명`;
    body.innerHTML = rows.map(u => {
      const chips = u.sysAdmin
        ? `<span class="ua-chip ua-admin">모든 프로젝트 · 관리자</span>`
        : (Object.keys(u.projectRoles || {}).filter(pid => this.projects.some(p => p.id === pid)).map(pid => {
          const a = u.projectRoles[pid];
          return `<span class="ua-chip" title="${escapeAttr(pid)}">${escapeHtml(this.projectName(pid))} · <b>${escapeHtml(this.roleLabel(a.role))}</b> · ${escapeHtml(a.subsystem || "ALL")}</span>`;
        }).join("") || `<span class="ua-chip ua-none">참여 프로젝트 없음</span>`);
      return `<tr>
        <td><b>${escapeHtml(u.empNo)}</b></td>
        <td>${escapeHtml(u.name || "")}</td>
        <td>${escapeHtml(u.dept || "")}</td>
        <td>${chips}</td>
        <td style="text-align:center;">${u.pwdDefault ? '<span class="status-tag tag-ready">초기(1234)</span>' : '<span class="status-tag tag-completed">변경함</span>'}</td>
        <td style="white-space:nowrap; text-align:center;">
          <button class="btn btn-secondary btn-sm" data-click="UserAdmin.openEdit" data-click-args="${UiEvents.args(u.empNo)}">편집</button>
          <button class="btn btn-danger btn-sm" data-click="UserAdmin.remove" data-click-args="${UiEvents.args(u.empNo)}">삭제</button>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">조건에 맞는 작업자가 없습니다.</td></tr>`;
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("uaPane"));
  },

  // ---- 편집 창 ----
  openNew() { this._openEdit({ empNo: "", name: "", dept: "", sysAdmin: false, projectRoles: {} }, true); },
  openEdit(empNo) {
    const u = this.users.find(x => x.empNo === empNo);
    if (u) this._openEdit(u, false);
  },
  _openEdit(u, isNew) {
    this.editing = { isNew, empNo: u.empNo };
    const set = (id, v) => { document.getElementById(id).value = v; };
    set("uaEmpNo", u.empNo); set("uaName", u.name || ""); set("uaDept", u.dept || "");
    document.getElementById("uaEmpNo").disabled = !isNew;
    const adm = document.getElementById("uaSysAdmin");
    adm.checked = !!u.sysAdmin;
    adm.disabled = String(u.empNo).toLowerCase() === "admin";
    document.getElementById("uaPwdReset").checked = false;
    document.getElementById("uaPwdResetRow").style.display = isNew ? "none" : "";
    document.getElementById("uaEditTitle").textContent = isNew ? "👤 작업자 추가" : `👤 작업자 편집 — ${u.name || ""} (${u.empNo})`;
    document.getElementById("uaProjectRows").innerHTML = this.projects.map(p => {
      const a = (u.projectRoles || {})[p.id];
      const subs = ["ALL"].concat(p.subsystems || []);
      if (a && a.subsystem && !subs.includes(a.subsystem)) subs.push(a.subsystem);
      return `<tr data-pid="${escapeAttr(p.id)}">
        <td style="text-align:center;"><input type="checkbox" class="ua-join" ${a ? "checked" : ""} data-change="UserAdmin.syncEditRows"></td>
        <td>${escapeHtml(p.name)}${p.status === "ARCHIVED" ? ' <span class="status-tag tag-ready">사용 중지</span>' : ""}</td>
        <td><select class="ua-role">${this.ROLES.map(r => `<option value="${r}" ${(a ? a.role : "MEMBER") === r ? "selected" : ""}>${escapeHtml(this.roleLabel(r))}</option>`).join("")}</select></td>
        <td><select class="ua-sub">${subs.map(s => `<option value="${escapeAttr(s)}" ${(a ? a.subsystem || "ALL" : "ALL") === s ? "selected" : ""}>${s === "ALL" ? "전체 (ALL)" : escapeHtml(s)}</option>`).join("")}</select></td>
      </tr>`;
    }).join("");
    this.syncEditRows();
    const m = document.getElementById("userAdminModal");
    m.style.display = "flex";
    if (typeof I18N !== "undefined") I18N.translateTree(m);
  },
  // 관리자는 모든 프로젝트에 들어가므로 프로젝트별 지정을 끔 / 참여하지 않는 프로젝트는 역할 선택을 끔
  syncEditRows() {
    const admin = document.getElementById("uaSysAdmin").checked;
    document.getElementById("uaAdminNote").style.display = admin ? "" : "none";
    document.querySelectorAll("#uaProjectRows tr").forEach(tr => {
      const join = tr.querySelector(".ua-join");
      join.disabled = admin;
      const off = admin || !join.checked;
      tr.querySelector(".ua-role").disabled = off;
      tr.querySelector(".ua-sub").disabled = off;
      tr.classList.toggle("ua-off", off);
    });
  },
  closeEdit() { document.getElementById("userAdminModal").style.display = "none"; this.editing = null; },

  async saveEdit() {
    if (!this.editing) return;
    const val = id => document.getElementById(id).value.trim();
    const req = { isNew: this.editing.isNew, empNo: this.editing.isNew ? val("uaEmpNo") : this.editing.empNo, name: val("uaName"), dept: val("uaDept"),
      sysAdmin: document.getElementById("uaSysAdmin").checked, pwdReset: document.getElementById("uaPwdReset").checked, projectRoles: {} };
    if (!/^[A-Za-z0-9_.\-]{2,30}$/.test(req.empNo)) return showToast("⚠️ 작업자 ID은 영문 · 숫자 · _ . - 로 2~30자여야 합니다.");
    if (!req.name) return showToast("⚠️ 이름을 입력하세요.");
    const prev = this.users.find(x => x.empNo === req.empNo);
    document.querySelectorAll("#uaProjectRows tr").forEach(tr => {
      if (!tr.querySelector(".ua-join").checked) return;
      const pid = tr.dataset.pid;
      const old = prev && prev.projectRoles && prev.projectRoles[pid];
      req.projectRoles[pid] = { role: tr.querySelector(".ua-role").value, subsystem: tr.querySelector(".ua-sub").value, dept: old && old.dept !== undefined ? old.dept : req.dept };
    });
    const err = await this._save(req);
    if (err) return showToast("⚠️ " + err);
    this.closeEdit();
    this.render();
    showToast(req.isNew ? `✅ 작업자 [${req.name}(${req.empNo})]를 등록했습니다. 초기 암호는 1234 입니다.` : `✅ 작업자 [${req.name}(${req.empNo})] 정보를 저장했습니다.`);
    if (typeof renderProjectUsersTable === "function") renderProjectUsersTable();
  },

  remove(empNo) {
    const u = this.users.find(x => x.empNo === empNo);
    if (!u) return;
    openConfirmDialog(`작업자 [${u.name || ""}(${u.empNo})] 계정을 삭제할까요? 모든 프로젝트에서 빠지며 되돌릴 수 없습니다.`, async () => {
      const err = await this._delete(empNo);
      if (err) return showToast("⚠️ " + err);
      this.render();
      showToast(`🗑 작업자 [${u.name || ""}(${u.empNo})] 계정을 삭제했습니다.`);
      if (typeof renderProjectUsersTable === "function") renderProjectUsersTable();
    });
  }
};
window.UserAdmin = UserAdmin;
