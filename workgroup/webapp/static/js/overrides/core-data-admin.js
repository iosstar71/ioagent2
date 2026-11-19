// Workgroup 판: core/data-admin.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(DataAdmin, {
  ACTIONS: {
    tasks: { label: "🧹 Task 정보 초기화", what: "WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 업무 소통(채팅 포함)", keep: "프로젝트 기본정보 · 프로젝트 설정 · 멤버", all: true },
    project: { label: "⚠️ 프로젝트 전체 초기화", what: "프로젝트 설정(도메인 · 서브시스템 · SDLC · 공휴일 · 표준 산출물 · 마일스톤) + 모든 Task 정보", keep: "프로젝트 이름 · 기간 · 멤버" },
    sample: { label: "🔄 제조 샘플 복원", what: "프로젝트 자료 전체를 2027 스마트공장 제조 샘플로 (샘플 담당자는 참여자로 추가)", keep: "프로젝트 이름 · 다른 멤버" },
    chat: { label: "💬 채팅 기록 초기화", what: "그 프로젝트의 실시간 채팅 기록", keep: "업무 자료 전체", server: true },
    factory: { label: "⚠️ 완전 초기화 (멤버 포함)", what: "지금 프로젝트의 프로젝트 설정 · 업무 자료 + 멤버 목록을 처음 상태로 (admin · admin2 · pm, 암호 1234)", keep: "다른 프로젝트 자료", current: true }
  },
  async render() {
    if (!this.isAdmin()) return;
    const server = this.isServer();
    if (typeof ProjectManager !== "undefined" && ProjectManager.refreshList) { try { await ProjectManager.refreshList(); } catch (e) {} }
    ProjectData.renderConfigTarget();
    this.renderActions();
    document.getElementById("daAutoServer").style.display = server ? "" : "none";
    document.getElementById("daAutoLocal").style.display = server ? "none" : "";
    if (server) await SystemBackup.refresh();
    const tr = document.getElementById("daTrash");
    if (tr) {
      if (!server) tr.innerHTML = `<span class="bk-hint">첨부파일은 DB 서버 방식에서만 씁니다.</span>`;
      else {
        if (typeof AttachManager !== "undefined") await AttachManager.refreshSummary(true);
        const n = typeof AttachManager !== "undefined" ? AttachManager.trashCount || 0 : 0;
        const pol = (typeof AttachManager !== "undefined" && (AttachManager.policy || AttachManager.FALLBACK)) || {};
        tr.innerHTML = `<span>지금 프로젝트 <b>${escapeHtml(ProjectData.currentName())}</b> 휴지통: <b>${n}</b>개 · 지운 파일은 ${pol.trashDays || 30}일 뒤 자동 완전 삭제</span>
          <button class="btn btn-sm" data-btn="neutral" data-click="AttachManager.openTrash">🗑 휴지통 열기</button>`;
      }
    }
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(document.getElementById("dataAdminPane"));
  },

  // 대상에 따라 쓸 수 있는 동작만 켬
  renderActions() {
    const body = document.getElementById("daActions");
    if (!body) return;
    const t = this.target();
    const server = this.isServer();
    body.innerHTML = Object.keys(this.ACTIONS).map(k => {
      const a = this.ACTIONS[k];
      let why = "";
      if (t.all && !a.all) why = "모든 프로젝트 일괄은 Task 정보 초기화만";
      else if (a.current && !t.current) why = "지금 프로젝트만 (머리글에서 그 프로젝트로 바꾼 뒤)";
      else if (a.server && !server) why = "채팅은 DB 서버 방식에서만";
      const danger = k === "project" || k === "factory";
      return `<tr class="${why ? "mp-off" : ""}">
        <td><b>${a.label}</b></td>
        <td class="mt-desc">${escapeHtml(a.what)}</td>
        <td class="mt-desc">${escapeHtml(a.keep)}</td>
        <td style="text-align:center; white-space:nowrap;">${why
          ? `<span class="mt-lock">🔒 ${escapeHtml(why)}</span>`
          : `<button class="btn btn-sm" data-btn="${danger ? "danger" : k === "chat" ? "neutral" : "warn"}" data-click="DataAdmin.run" data-click-args="${UiEvents.args(k)}">실행</button>`}</td>
      </tr>`;
    }).join("") + this._deleteRow(t);
  },
  // 프로젝트 삭제 (프로젝트 자체와 자료 전부) — 기본 프로젝트는 지울 수 없어 초기화만
  run(action) {
    if (!this.isAdmin()) return showToast("🚫 데이터 관리는 관리자만 할 수 있습니다.");
    const a = this.ACTIONS[action];
    const t = this.target();
    if (!a) return;
    if (t.all && !a.all) return;
    const lines = [`대상: ${t.name}${t.current ? " (지금 프로젝트)" : ""}`, `· 지우는 것: ${a.what}`, `· 그대로: ${a.keep}`,
      this.isServer() ? "바꾸기 전 자료는 스냅샷(서버)에 남기고, Task 정보는 서버 data/backups 에도 남깁니다." : "바꾸기 전 자료는 스냅샷(이 브라우저)에 남깁니다.",
      "되돌리기 어렵습니다. 확인을 위해 아래에 대상 이름을 그대로 입력하세요."];
    this.ask(`${a.label} — ${t.name}`, lines, t.name, () => this._do(action, t));
  },

  async _do(action, t) {
    try {
      if (action === "tasks") {
        const list = t.all ? ProjectData.projects() : [{ id: t.pid, name: t.name }];
        await ProjectData._clear(list.map(p => p.id), list.map(p => p.name));
      } else if (action === "project") {
        if (t.current) ProjectData._resetCurrent();
        else await this._writeOther(t, cur => ({ data: Object.assign(this._emptyTasks(), { projectConfig: ProjectData.blankConfig(cur.projectConfig), subsystemsMeta: [], standardDeliverablesMeta: [] }), users: [] }), "프로젝트초기화");
      } else if (action === "sample") {
        if (t.current) StorageManager._applySample();
        else await this._writeOther(t, () => {
          const c = DataRegistry.clone(WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT);
          const data = {};
          ProjectData.BASE_KEYS.concat(ProjectData.TASK_KEYS).forEach(k => { data[k] = c[k] !== undefined ? c[k] : (k === "projectConfig" ? {} : []); });
          return { data, users: (c.projectUsers || []).filter(u => !ProjectContext.isAdminUser(u)).map(u => ({ empNo: u.empNo, name: u.name, role: u.role, subsystem: u.subsystem, dept: u.dept, lang: u.lang })) };
        }, "제조샘플복원");
      } else if (action === "chat") {
        const res = await ServerBackend.request("/api/chat/clear", { projectId: t.pid });
        if (!res.ok) return showToast("⚠️ 채팅 기록 초기화 실패: " + (res.message || ""));
        if (t.current && typeof RealtimeChatManager !== "undefined") { RealtimeChatManager.messages = []; if (RealtimeChatManager.renderMessages) RealtimeChatManager.renderMessages([], true); }
        showToast(`🧹 [${t.name}] 채팅 기록을 초기화했습니다.`);
      } else if (action === "factory") {
        if (!t.current) return;
        StorageManager._factoryBlank();
      }
    } catch (err) {
      showToast("❌ 초기화 오류: " + err.message);
    }
    setTimeout(() => this.render(), 300);
  },
  async _writeOther(t, build, reason) {
    const cur = await ProjectTransfer.load(t.pid);
    BackupHistoryManager.createBackupSnapshot(`${reason}직전백업`, "ALL", false, { projectId: t.pid, projectName: t.name, source: cur.data });
    const next = build(cur.data);
    await ProjectTransfer.write(t.pid, { name: t.name, data: next.data, users: next.users }, true);
    showToast(`✅ [${t.name}] ${reason === "제조샘플복원" ? "프로젝트를 2027 제조 샘플로 바꿨습니다." : "프로젝트를 초기 상태로 되돌렸습니다. (이름 · 기간 · 사용자는 그대로)"}`);
  }
});
