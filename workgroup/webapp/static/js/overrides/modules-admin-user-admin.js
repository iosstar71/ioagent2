// Workgroup 판: modules/admin/user-admin.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(UserAdmin, {
  async _save(req) {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/admin/users/save", req);
      if (!res.ok) return res.message || "저장하지 못했습니다.";
      this._apply(res);
    } else {
      const { st, list } = this._localUsers();
      const key = req.empNo.toLowerCase();
      let row = list.find(u => String(u.empNo || "").toLowerCase() === key);
      if (req.isNew && row) return `이미 등록된 사번입니다: ${req.empNo}`;
      const me = String(AuthManager.getCurrentUser().empNo).toLowerCase();
      const admin = key === "admin" ? true : req.sysAdmin;
      if (key === me && !admin) return "자기 자신의 시스템관리자 권한은 해제할 수 없습니다.";
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
      if (key === String(AuthManager.getCurrentUser().empNo).toLowerCase()) return "지금 로그인한 계정은 삭제할 수 없습니다.";
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
    document.getElementById("uaSummary").textContent = `등록 멤버 ${this.users.length}명 · 시스템관리자 ${admins}명 · 프로젝트 ${this.projects.length}개 — 표시 ${rows.length}명`;
    body.innerHTML = rows.map(u => {
      const chips = u.sysAdmin
        ? `<span class="ua-chip ua-admin">모든 프로젝트 · 시스템관리자</span>`
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
    }).join("") || `<tr><td colspan="6" style="text-align:center; padding:18px; color:var(--text-muted);">조건에 맞는 멤버가 없습니다.</td></tr>`;
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("uaPane"));
  },

  // ---- 편집 창 ----
  async saveEdit() {
    if (!this.editing) return;
    const val = id => document.getElementById(id).value.trim();
    const req = { isNew: this.editing.isNew, empNo: this.editing.isNew ? val("uaEmpNo") : this.editing.empNo, name: val("uaName"), dept: val("uaDept"),
      sysAdmin: document.getElementById("uaSysAdmin").checked, pwdReset: document.getElementById("uaPwdReset").checked, projectRoles: {} };
    if (!/^[A-Za-z0-9_.\-]{2,30}$/.test(req.empNo)) return showToast("⚠️ 사번은 영문 · 숫자 · _ . - 로 2~30자여야 합니다.");
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
    showToast(req.isNew ? `✅ 멤버 [${req.name}(${req.empNo})]를 등록했습니다. 초기 비밀번호는 1234 입니다.` : `✅ 멤버 [${req.name}(${req.empNo})] 정보를 저장했습니다.`);
    if (typeof renderProjectUsersTable === "function") renderProjectUsersTable();
  },
});
