// Workgroup 판: core/project-transfer.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ProjectTransfer, {
  async download(format) {
    if (!ProjectData.canManage()) return showToast("🚫 시스템관리자 · PM 만 할 수 있습니다.");
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
      showToast("❌ 다운로드 실패: " + err.message);
    }
  },

  // ---- 올리기 ----
  // 파일 → [{ name, data, users }]
  async pick() {
    if (!ProjectData.canManage()) return showToast("🚫 시스템관리자 · PM 만 할 수 있습니다.");
    document.getElementById("ptUpInput").click();
  },
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
        if (!ur.ok) throw new Error(ur.message || "멤버를 저장하지 못했습니다.");
      }
      await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
      return;
    }
    // 로컬 저장소 방식
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
    await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
  }
});
