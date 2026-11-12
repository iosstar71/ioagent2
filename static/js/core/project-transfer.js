// =============================================================================
// [Project Mgmt v3.9.2] 시스템 설정 > 🗂️ 프로젝트 — 프로젝트 파일 내려받기 · 올리기 (ProjectTransfer, 관리자)
// -----------------------------------------------------------------------------
//  - 내려받기: 모든 프로젝트 또는 특정 프로젝트를 엑셀 / JSON 으로
//      엑셀 = 스마트병합 [④ 전체 일괄] · [기준정보 > 백업] 과 같은 양식 (프로젝트마다 파일 1개)
//      JSON = 프로젝트 백업 형식 (모든 프로젝트는 묶음 파일 1개)
//  - 올리기: 엑셀 / JSON 파일로 새 프로젝트를 추가하거나, 고른 프로젝트를 파일 내용으로 바꿈
//      같은 이름의 프로젝트가 이미 있으면 새 이름을 받아서 추가
//      파일의 작업자(작업자 ID)는 그 프로젝트 참여자로 추가 · 갱신 (계정이 없으면 새로 만들고 초기 암호: 작업자 ID + 123!)
// =============================================================================
var ProjectTransfer = {
  BUNDLE: "IOSTAR_PROJECTS_BUNDLE_v1",
  NEW: "__NEW__",
  ALL: "__ALL__",
  keys() { return ProjectData.BASE_KEYS.concat(ProjectData.TASK_KEYS); },
  isServer() { return ProjectData.isServer(); },
  _c(v) { return JSON.parse(JSON.stringify(v === undefined ? null : v)); },
  _norm(n) { return String(n || "").replace(/\s+/g, " ").trim().toLowerCase(); },
  allUsers() { return ProjectContext.allUsers && ProjectContext.allUsers.length ? ProjectContext.allUsers : (projectUsers || []); },
  // 모든 프로젝트의 참여 정보가 든 작업자 목록 (DB 서버는 화면에 지금 프로젝트 참여 정보만 있으므로 관리자 API 로)
  async fullUsers() {
    if (!this.isServer()) return this.allUsers();
    const res = await ServerBackend.request("/api/admin/users/list", {});
    return res.ok ? res.users : this.allUsers();
  },

  // ---- 화면 ----
  async render() {
    if (!ProjectData.canManage()) return;
    await ProjectManager.refreshList();
    // [v4.0.0] 관리자: 모든 프로젝트 / PM: 지금 프로젝트만
    const admin = ProjectData.isAdmin();
    const list = admin ? ProjectData.projects() : ProjectData.projects().filter(p => p.id === ProjectContext.current);
    const down = document.getElementById("ptDownTarget"), up = document.getElementById("ptUpTarget");
    if (down) {
      const keep = down.value;
      down.innerHTML = (admin ? `<option value="${this.ALL}">모든 프로젝트 (${list.length}개)</option>` : "") + list.map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}${p.id === ProjectContext.current ? " (지금 프로젝트)" : ""}</option>`).join("");
      if ([...down.options].some(o => o.value === keep)) down.value = keep;
      else down.value = ProjectContext.current;
    }
    if (up) {
      const keep = up.value;
      up.innerHTML = (admin ? `<option value="${this.NEW}">➕ 새 프로젝트로 추가</option>` : "") + list.map(p => `<option value="${escapeAttr(p.id)}">♻️ [${escapeHtml(p.name)}] 프로젝트를 파일 내용으로 바꾸기</option>`).join("");
      if ([...up.options].some(o => o.value === keep)) up.value = keep;
    }
  },

  // ---- 프로젝트 자료 읽기 ----
  _usersOf(pid, list) {
    return (list || this.allUsers()).filter(u => u && !ProjectContext.isAdminUser(u) && ProjectContext.member(u, pid)).map(u => {
      const a = ProjectContext.member(u, pid);
      return { empNo: u.empNo, name: u.name, role: a.role || "MEMBER", subsystem: a.subsystem || "ALL", dept: a.dept !== undefined ? a.dept : (u.dept || ""), lang: u.lang || "ko" };
    });
  },
  async load(pid, users) {
    const out = {};
    if (pid === ProjectContext.current) {
      Object.assign(out, ProjectData.collect());
    } else if (this.isServer()) {
      const res = await ServerBackend.request("/api/db/load", { keys: this.keys(), projectId: pid }, "POST", 30000);
      if (!res.ok) throw new Error(res.message || "프로젝트 자료를 읽지 못했습니다.");
      this.keys().forEach(k => { out[k] = res.data[k] !== undefined ? res.data[k] : (k === "projectConfig" ? {} : []); });
    } else {
      const st = LocalBackend._read(pid) || {};
      this.keys().forEach(k => { out[k] = this._c(st[k] !== undefined ? st[k] : (k === "projectConfig" ? {} : [])); });
    }
    return { data: out, users: this._usersOf(pid, users) };
  },

  // 다른 프로젝트 자료로 화면 쪽 변수를 잠시 바꿔 기존 엑셀 생성 · 해석 기능을 그대로 씀 (끝나면 원래대로)
  withProject(pid, data, users, fn) {
    const saved = { cur: ProjectContext.current, all: ProjectContext.allUsers, users: projectUsers, cfg: projectConfig, subs: subsystemsMeta, std: standardDeliverablesMeta, data: {} };
    ProjectData.TASK_KEYS.forEach(k => { saved.data[k] = DataRegistry.get(k); });
    try {
      ProjectContext.current = pid;
      ProjectContext.allUsers = this._c(this.allUsers());
      projectUsers = (users || []).map(u => Object.assign({}, u, { role: "MEMBER", projectRoles: { [pid]: { role: u.role, subsystem: u.subsystem, dept: u.dept } } }));
      projectConfig = this._c(data.projectConfig || {});
      subsystemsMeta = this._c(data.subsystemsMeta || []);
      standardDeliverablesMeta = this._c(data.standardDeliverablesMeta || []);
      ProjectData.TASK_KEYS.forEach(k => DataRegistry.set(k, this._c(data[k] || [])));
      return fn();
    } finally {
      ProjectContext.current = saved.cur;
      ProjectContext.allUsers = saved.all;
      projectUsers = saved.users;
      projectConfig = saved.cfg;
      subsystemsMeta = saved.subs;
      standardDeliverablesMeta = saved.std;
      ProjectData.TASK_KEYS.forEach(k => DataRegistry.set(k, saved.data[k]));
      if (typeof ThemeScope !== "undefined") ThemeScope.apply();
    }
  },

  // ---- 내려받기 ----
  async download(format) {
    if (!ProjectData.canManage()) return showToast("🚫 관리자 · PM 만 할 수 있습니다.");
    let target = (document.getElementById("ptDownTarget") || {}).value || ProjectContext.current;
    if (!ProjectData.isAdmin()) target = ProjectContext.current;  // PM 은 지금 프로젝트만
    const list = ProjectData.projects();
    const ids = target === this.ALL ? list.map(p => p.id) : [target];
    const stamp = ProjectData._stamp();
    try {
      const items = [];
      const full = ProjectData.isAdmin() ? await this.fullUsers() : this.allUsers();
      for (const pid of ids) {
        const { data, users } = await this.load(pid, full);
        items.push({ pid, name: (list.find(p => p.id === pid) || {}).name || (data.projectConfig || {}).projectName || pid, data, users });
      }
      if (format === "JSON") {
        const one = it => ({ schemaVersion: ProjectData.SCHEMA, appVersion: APP_VERSION.version, projectId: it.pid, projectName: it.name,
          exportedAt: new Date().toISOString(), exportedBy: AuthManager.getCurrentUser().empNo, data: it.data, users: it.users });
        const payload = target === this.ALL ? { schemaVersion: this.BUNDLE, appVersion: APP_VERSION.version, exportedAt: new Date().toISOString(), projects: items.map(one) } : one(items[0]);
        const fname = target === this.ALL ? ExcelSync.stdName("전체프로젝트", [], "json", stamp) : this.withProject(items[0].pid, items[0].data, items[0].users, () => ExcelSync.stdName("프로젝트백업", [], "json", stamp));
        ExcelSync._triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), fname);
      } else {
        for (const it of items) {
          const out = this.withProject(it.pid, it.data, it.users, () => ({ blob: ExcelSync._buildXlsxBlob(SmartMergeCenter.buildPackageSheets()), name: ExcelSync.stdName("프로젝트백업", [], "xlsx", stamp) }));
          ExcelSync._triggerDownload(out.blob, out.name);
          if (items.length > 1) await new Promise(r => setTimeout(r, 400));
        }
      }
      showToast(`📥 ${target === this.ALL ? `모든 프로젝트 ${items.length}개` : `[${items[0].name}] 프로젝트`}를 ${format === "JSON" ? "JSON" : "엑셀"}으로 내려받았습니다.${format !== "JSON" && items.length > 1 ? " (프로젝트마다 파일 1개)" : ""}`);
    } catch (err) {
      showToast("❌ 내려받기 실패: " + err.message);
    }
  },

  // ---- 올리기 ----
  // 파일 → [{ name, data, users }]
  async parse(file) {
    if (/\.json$/i.test(file.name)) {
      const j = JSON.parse(await file.text());
      const one = x => { const data = ProjectData._pick(x); if (!data) return null;
        return { name: x.projectName || (data.projectConfig || {}).projectName || file.name.replace(/\.[^.]+$/, ""), data, users: Array.isArray(x.users) ? x.users : (Array.isArray(x.projectUsers) ? x.projectUsers.filter(u => !ProjectContext.isAdminUser(u)) : []) }; };
      const list = j && j.schemaVersion === this.BUNDLE && Array.isArray(j.projects) ? j.projects.map(one) : [one(j)];
      return list.filter(Boolean);
    }
    const sheets = await ExcelSync._parseUploadedFile(file);
    const names = sheets.map(s => String(s.name || ""));
    if (!names.some(n => n.includes("WBS")) || !names.some(n => n.includes("프로젝트기준정보") || n.includes("서브시스템"))) return [];
    const tmpl = ProjectManager._template("", "", "", false);
    const result = this.withProject("__IMPORT__", tmpl, [], () => {
      SmartMergeCenter._applyCollabSheets(sheets, "ALL");
      ExcelSync.importMasterWorkbook(null, { sheets, silent: true, noRebuild: true });
      const data = ProjectData.collect();
      const users = (projectUsers || []).filter(u => !ProjectContext.isAdminUser(u)).map(u => {
        const a = (u.projectRoles || {}).__IMPORT__ || {};
        return { empNo: u.empNo, name: u.name, role: a.role || "MEMBER", subsystem: a.subsystem || "ALL", dept: a.dept || "", lang: u.lang || "ko" };
      });
      return { data, users };
    });
    return [{ name: (result.data.projectConfig || {}).projectName || file.name.replace(/\.[^.]+$/, ""), data: result.data, users: result.users }];
  },

  // [v4.0.0] 같은 이름의 프로젝트가 있을 때: 새 이름으로 추가 / 그 프로젝트에 덮어쓰기 / 건너뛰기
  askDuplicate(name, same, taken) {
    return new Promise(resolve => {
      const m = document.getElementById("dupProjectModal");
      document.getElementById("dupProjectName").textContent = name;
      const inp = document.getElementById("dupNewName");
      let n = `${name} (2)`, k = 2;
      while (taken.some(t => this._norm(t) === this._norm(n))) n = `${name} (${++k})`;
      inp.value = n;
      document.querySelector('input[name="dupAction"][value="new"]').checked = true;
      document.getElementById("dupErr").textContent = "";
      m.style.display = "flex";
      this._dup = { resolve, taken, same };
    });
  },
  dupDone(ok) {
    const d = this._dup;
    if (!d) return;
    if (!ok) { document.getElementById("dupProjectModal").style.display = "none"; this._dup = null; return d.resolve(null); }
    const act = (document.querySelector('input[name="dupAction"]:checked') || {}).value || "new";
    if (act === "new") {
      const n = document.getElementById("dupNewName").value.trim().slice(0, 100);
      if (!n) { document.getElementById("dupErr").textContent = "새 이름을 입력하세요."; return; }
      if (d.taken.some(t => this._norm(t) === this._norm(n))) { document.getElementById("dupErr").textContent = "그 이름의 프로젝트도 이미 있습니다. 다른 이름을 입력하세요."; return; }
      document.getElementById("dupProjectModal").style.display = "none"; this._dup = null;
      return d.resolve({ action: "new", name: n });
    }
    document.getElementById("dupProjectModal").style.display = "none"; this._dup = null;
    d.resolve({ action: "overwrite" });
  },

  // 같은 이름이 있으면 새 이름을 받음 (취소하면 null)
  uniqueName(name, taken) {
    let n = String(name || "").trim() || "새 프로젝트";
    while (taken.some(t => this._norm(t) === this._norm(n))) {
      const v = window.prompt(`이미 같은 이름의 프로젝트가 있습니다: [${n}]\n추가할 프로젝트의 새 이름을 입력하세요. (취소하면 이 프로젝트는 추가하지 않습니다)`, `${n} (2)`);
      if (v === null) return null;
      n = String(v).trim().slice(0, 100) || n;
    }
    return n;
  },

  async pick() {
    if (!ProjectData.canManage()) return showToast("🚫 관리자 · PM 만 할 수 있습니다.");
    document.getElementById("ptUpInput").click();
  },
  async upload(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file || !ProjectData.canManage()) return;
    let target = (document.getElementById("ptUpTarget") || {}).value || this.NEW;
    if (!ProjectData.isAdmin()) target = ProjectContext.current;  // PM 은 지금 프로젝트 복원만
    let items;
    try { items = await this.parse(file); } catch (err) { return showToast("⚠️ 파일을 읽지 못했습니다: " + err.message); }
    if (!items.length) return showToast("⚠️ 프로젝트 백업 파일이 아닙니다. (프로젝트 엑셀 · 프로젝트 백업 JSON · 모든 프로젝트 JSON 을 쓰세요)");
    if (target !== this.NEW) {
      if (items.length > 1) return showToast("⚠️ 여러 프로젝트가 든 파일은 [새 프로젝트로 추가]로만 올릴 수 있습니다.");
      if (target === ProjectContext.current) return ProjectData.importProject({ target: { files: [file], value: "" } });
      const p = ProjectData.projects().find(x => x.id === target) || { name: target };
      const it = items[0];
      return openConfirmDialog(`[${p.name}] 프로젝트를 파일 [${file.name}] 의 내용으로 바꿉니다.\n· 기준정보 + ${ProjectData.countText(it.data)}\n· 프로젝트 이름은 그대로 · 작업자는 참여자로 추가 · 갱신\n계속할까요?`, async () => {
        try {
          await this.write(target, it, true);
          showToast(`✅ [${p.name}] 프로젝트를 [${file.name}] 내용으로 바꿨습니다.`);
          await this.afterChange();
        } catch (err) { showToast("❌ 올리기 실패: " + err.message); }
      });
    }
    const added = [], replaced = [];
    for (const it of items) {
      const projects = ProjectData.projects();
      const same = projects.find(p => this._norm(p.name) === this._norm(it.name));
      let choice = { action: "new", name: String(it.name || "").trim() || "새 프로젝트" };
      if (same) {
        choice = await this.askDuplicate(it.name, same, projects.map(p => p.name));
        if (!choice) continue;
      }
      try {
        if (choice.action === "overwrite") {
          if (same.id === ProjectContext.current) {
            BackupHistoryManager.createBackupSnapshot("프로젝트덮어쓰기직전백업", "ALL", false);
          }
          await this.write(same.id, it, true);
          replaced.push(same.name);
          if (same.id === ProjectContext.current) await SyncManager.refresh(null, { silent: true, skipConfirm: true });
        } else {
          const pid = await this.create(choice.name, it.data.projectConfig || {});
          await this.write(pid, Object.assign({}, it, { name: choice.name }), false);
          added.push(choice.name);
        }
      } catch (err) {
        showToast(`❌ [${choice.name || it.name}] 실패: ${err.message}`);
      }
    }
    await this.afterChange();
    const msg = [added.length ? `추가 ${added.length}개: ${added.join(", ")}` : "", replaced.length ? `덮어쓰기 ${replaced.length}개: ${replaced.join(", ")}` : ""].filter(Boolean).join(" · ");
    if (msg) showToast(`✅ 프로젝트 ${msg} — 머리글의 프로젝트 선택에서 열 수 있습니다.`);
  },
  async afterChange() {
    await ProjectManager.refreshList();
    ProjectManager.renderSelector();
    ProjectManager.renderPanels();
    if (typeof UserAdmin !== "undefined" && document.getElementById("uaBody")) UserAdmin.users = [];
    await this.render();
  },

  async create(name, cfg) {
    const y = new Date().getFullYear();
    const start = /^\d{4}-\d{2}-\d{2}$/.test(cfg.projectStartDate || "") ? cfg.projectStartDate : `${y}-01-01`;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(cfg.projectEndDate || "") && cfg.projectEndDate >= start ? cfg.projectEndDate : `${start.slice(0, 4)}-12-31`;
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/projects/create", { name, startDate: start, endDate: end, copyFrom: "", copySubsystems: false, restricted: false });
      if (!res.ok) throw new Error(res.message || "프로젝트를 만들지 못했습니다.");
      return res.project.id;
    }
    const list = ProjectContext.localList();
    let seq = 1;
    while (list.some(p => p.id === `P${String(seq).padStart(3, "0")}`)) seq++;
    const pid = `P${String(seq).padStart(3, "0")}`;
    list.push({ id: pid, name, status: "ACTIVE", restricted: false, members: [], createdAt: new Date().toISOString().slice(0, 19).replace("T", " "), createdBy: AuthManager.getCurrentUser().empNo });
    LocalBackend.createProjectStore(pid, ProjectManager._template(name, start, end, false));
    ProjectContext.saveLocalList(list);
    return pid;
  },

  // 프로젝트 자료 + 참여자 쓰기 (replace=true 면 그 프로젝트의 Task 정보를 먼저 비움, 이름은 그대로)
  async write(pid, item, replace) {
    const data = this._c(item.data);
    const keepName = replace ? ((ProjectData.projects().find(p => p.id === pid) || {}).name) : item.name;
    data.projectConfig = Object.assign({}, data.projectConfig || {}, { projectName: keepName || item.name });
    delete data.projectConfig.uiTheme;
    if (this.isServer()) {
      if (replace) {
        const r = await ServerBackend.request("/api/projects/clear-tasks", { ids: [pid] }, "POST", 60000);
        if (!r.ok) throw new Error(r.message || "기존 자료를 비우지 못했습니다.");
      }
      // [v4.1.0] 바꾸기(replace): 파일에 없는 기존 행(서브시스템 · 표준 산출물 등)은 지움
      const prev = replace ? (await this.load(pid)).data : {};
      const changes = {};
      this.keys().forEach(k => {
        if (data[k] === undefined) return;
        const parts = {};
        if (replace && prev[k] !== undefined) Partition.split(k, prev[k]).forEach((v, p) => { parts[p] = null; });
        Partition.split(k, data[k]).forEach((v, p) => { parts[p] = v; });
        changes[k] = { parts, base: {} };
      });
      const res = await ServerBackend.request("/api/db/save", { changes, force: true, lockBypass: true, projectId: pid }, "POST", 60000);
      if (!res.ok) throw new Error(res.message || "자료를 저장하지 못했습니다.");
      const urows = {};
      (item.users || []).forEach(u => {
        const cur = this.allUsers().find(x => String(x.empNo).toLowerCase() === String(u.empNo).toLowerCase());
        if (cur && ProjectContext.isAdminUser(cur)) return;
        const row = cur ? this._c(cur) : { empNo: u.empNo, name: u.name || u.empNo, role: "MEMBER", subsystem: u.subsystem || "ALL", dept: u.dept || "", lang: u.lang || "ko", pwdHash: "" };
        delete row.pwdHash;
        row.projectRoles = Object.assign({}, row.projectRoles, { [pid]: { role: AuthManager.normalizeRole(u.role) === "SYS_ADMIN" ? "PM" : AuthManager.normalizeRole(u.role), subsystem: u.subsystem || "ALL", dept: u.dept || "" } });
        urows[row.empNo] = row;
      });
      if (Object.keys(urows).length) {
        const ur = await ServerBackend.request("/api/db/save", { changes: { projectUsers: { parts: urows, base: {} } }, force: true, lockBypass: true, projectId: pid });
        if (!ur.ok) throw new Error(ur.message || "작업자를 저장하지 못했습니다.");
      }
      await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
      return;
    }
    this.writeLocal(pid, item, data);
    await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
  },

  // 로컬 저장소에 바로 씀 (화면 자료는 건드리지 않음 — 작업자 선택 전 [종합본으로 시작]에서도 씀)
  writeLocal(pid, item, data) {
    if (!data) {
      data = this._c(item.data);
      data.projectConfig = Object.assign({}, data.projectConfig || {}, { projectName: item.name });
      delete data.projectConfig.uiTheme;
    }
    const st = LocalBackend._read(pid) || {};
    const revs = LocalBackend._readRevs(pid);
    const now = new Date().toLocaleString();
    this.keys().forEach(k => {
      if (data[k] === undefined) return;
      st[k] = data[k];
      revs[k] = {};
      Partition.split(k, data[k]).forEach((_, p) => { revs[k][p] = { rev: 1, by: "import", at: now }; });
    });
    LocalBackend._write(pid, st, revs);
    const dst = LocalBackend._read(ProjectContext.DEFAULT) || {};
    const users = Array.isArray(dst.projectUsers) ? dst.projectUsers : [];
    (item.users || []).forEach(u => {
      let row = users.find(x => String(x.empNo).toLowerCase() === String(u.empNo).toLowerCase());
      if (row && ProjectContext.isAdminUser(row)) return;
      if (!row) { row = { empNo: u.empNo, name: u.name || u.empNo, role: "MEMBER", subsystem: u.subsystem || "ALL", dept: u.dept || "", lang: u.lang || "ko", pwdHash: "" }; users.push(row); }
      const role = AuthManager.normalizeRole(u.role);
      row.projectRoles = Object.assign({}, row.projectRoles, { [pid]: { role: role === "SYS_ADMIN" ? "PM" : role, subsystem: u.subsystem || "ALL", dept: u.dept || "" } });
    });
    dst.projectUsers = users;
    const drevs = LocalBackend._readRevs(ProjectContext.DEFAULT);
    drevs.projectUsers = drevs.projectUsers || {};
    (item.users || []).forEach(u => { const r = drevs.projectUsers[u.empNo]; drevs.projectUsers[u.empNo] = { rev: ((r && r.rev) || 0) + 1, by: "import", at: now }; });
    LocalBackend._write(ProjectContext.DEFAULT, dst, drevs);
  }
};
window.ProjectTransfer = ProjectTransfer;
