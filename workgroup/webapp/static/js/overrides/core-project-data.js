// Workgroup 판: core/project-data.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ProjectData, {
  exportProject(format) {
    if (!this.canManage()) return showToast("🚫 프로젝트 백업은 PM · 시스템관리자만 할 수 있습니다.");
    // [v3.9.1] 엑셀 백업 = 스마트병합 [④ 전체 일괄] 엑셀과 같은 양식 (기준정보 · 업무 · 사용자 · 협업 시트)
    if (format === "EXCEL") {
      const blob = ExcelSync._buildXlsxBlob(SmartMergeCenter.buildPackageSheets());
      ExcelSync._triggerDownload(blob, ExcelSync.stdName("프로젝트백업", [], "xlsx", this._stamp()));
      return showToast(`💾 [${this.currentName()}] 프로젝트를 엑셀로 백업했습니다. (${this.countText(this.collect())})`);
    }
    const data = this.collect();
    const payload = { schemaVersion: this.SCHEMA, appVersion: APP_VERSION.version, projectId: ProjectContext.current, projectName: this.currentName(),
      exportedAt: new Date().toISOString(), exportedBy: AuthManager.getCurrentUser().empNo, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    ExcelSync._triggerDownload(blob, ExcelSync.stdName("프로젝트백업", [], "json", this._stamp()));
    showToast(`💾 [${this.currentName()}] 프로젝트를 백업했습니다. (${this.countText(data)})`);
  },

  // 올린 JSON → 프로젝트 자료 (프로젝트 백업 · 시스템 전체 백업 · 스냅샷 백업 모두 받음),
  async importProject(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    if (!this.canManage()) return showToast("🚫 프로젝트 복원은 PM · 시스템관리자만 할 수 있습니다.");
    if (/\.(xlsx|xls)$/i.test(file.name)) return this._importExcel(file);
    let json;
    try { json = JSON.parse(await file.text()); } catch (err) { return showToast("⚠️ JSON 파일을 읽지 못했습니다: " + err.message); }
    const data = this._pick(json);
    if (!data) return showToast("⚠️ IOSTAR-PM 백업 파일이 아닙니다. (프로젝트 백업 · 전체 백업 · 스냅샷 백업 JSON 을 쓰세요)");
    const fromName = json.projectName || (data.projectConfig && data.projectConfig.projectName) || "";
    const other = json.projectId && json.projectId !== ProjectContext.current;
    openConfirmDialog(`[${this.currentName()}] 프로젝트를 백업 파일 [${file.name}] 의 내용으로 바꿉니다.\n` +
      `${other || (fromName && fromName !== this.currentName()) ? `⚠️ 다른 프로젝트(${fromName || json.projectId})의 백업입니다.\n` : ""}` +
      `· 바뀌는 것: 프로젝트 설정 + ${this.countText(data)}\n· 그대로: 프로젝트 이름, 멤버 계정, 다른 프로젝트\n바꾸기 전에 자동 스냅샷을 만듭니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("프로젝트복원직전백업", "ALL", false);
      const keepName = projectConfig.projectName;
      DataRegistry.apply(data, Object.keys(data));
      projectConfig.projectName = keepName;
      StorageManager._afterBulkReplace(`✅ [${this.currentName()}] 프로젝트를 [${file.name}] 백업으로 복원했습니다.`);
    });
  },

  // [v3.9.1] 엑셀 백업(전체 일괄 양식)으로 복원: 이 프로젝트의 업무 · 협업 자료를 비우고 파일 내용으로 바꿈
  async _importExcel(file) {
    let sheets;
    try { sheets = await ExcelSync._parseUploadedFile(file); } catch (err) { return showToast("⚠️ 엑셀 파일을 읽지 못했습니다: " + err.message); }
    const names = sheets.map(sh => String(sh.name || ""));
    const rows = key => { const sh = sheets.find(x => String(x.name || "").includes(key)); return sh ? Math.max(0, sh.rows.filter(r => r.some(c => String(c || "").trim())).length - 1) : 0; };
    if (!names.some(n => n.includes("WBS")) || !names.some(n => n.includes("프로젝트기준정보") || n.includes("서브시스템"))) {
      return showToast("⚠️ 프로젝트 백업 엑셀이 아닙니다. ([프로젝트 설정 > 백업·초기화] 또는 Import · Export [④ 전체 일괄]에서 다운로드한 엑셀을 쓰세요)");
    }
    const summary = `WBS ${rows("WBS")} · 요구사항 ${rows("요구사항")} · 산출물 ${rows("산출물")} · VOC ${rows("VOC")} · 주간보고 ${rows("주간보고")} · 회의 ${rows("회의록")} · 공지 ${rows("공지")} · 소통 ${rows("소통")}`;
    openConfirmDialog(`[${this.currentName()}] 프로젝트를 엑셀 백업 [${file.name}] 의 내용으로 바꿉니다.\n` +
      `· 바뀌는 것: 프로젝트 설정 + ${summary}\n· 그대로: 프로젝트 이름, 다른 프로젝트 (엑셀의 멤버는 이 프로젝트 참여자로 추가 · 갱신)\n바꾸기 전에 자동 스냅샷을 만듭니다. 계속할까요?`, async () => {
      BackupHistoryManager.createBackupSnapshot("프로젝트복원직전백업", "ALL", false);
      const keepName = projectConfig.projectName;
      this.TASK_KEYS.forEach(k => DataRegistry.set(k, []));
      subsystemsMeta = [];
      SmartMergeCenter._applyCollabSheets(sheets, "ALL");
      await ExcelSync.importMasterWorkbook(file, { silent: true });
      projectConfig.projectName = keepName;
      StorageManager._afterBulkReplace(`✅ [${this.currentName()}] 프로젝트를 엑셀 백업 [${file.name}] 으로 복원했습니다. (${this.countText(this.collect())})`);
    });
  },
  clearTasks(ids, label) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    const many = ids.length > 1;
    if (!this.isAdmin()) return showToast("🚫 Task 정보 초기화는 시스템관리자만 할 수 있습니다. (시스템 설정 > 데이터 관리)");
    const names = ids.map(id => (this.projects().find(p => p.id === id) || { name: id }).name);
    const cur = ids.indexOf(ProjectContext.current) !== -1;
    const dirty = cur && SyncManager.dirtyCount ? SyncManager.dirtyCount() : 0;
    openConfirmDialog(`🧹 [Task 정보 초기화] ${label || names.join(", ")}\n` +
      `· 지우는 것: WBS · 요구사항 · 산출물 · 주간보고 · VOC · 회의 · 공지 · 업무 소통(채팅 포함)\n` +
      `· 그대로: 프로젝트 기본정보 · 프로젝트 설정(도메인 · 서브시스템 · SDLC · 공휴일 · 표준 산출물) · 멤버\n` +
      `${this.isServer() ? "지우기 전 자료는 서버 data/backups 폴더에 자동 저장되고, 첨부파일은 휴지통으로 옮깁니다." : "지우기 전 자료는 백업 스냅샷으로 남깁니다."}` +
      `${dirty ? `\n⚠️ 지금 화면의 저장하지 않은 변경 ${dirty}건은 버려집니다.` : ""}\n되돌리기 어렵습니다. 계속할까요?`, () => this._clear(ids, names));
  },
  async _clear(ids, names) {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/projects/clear-tasks", { ids }, "POST", 60000);
      if (!res.ok) return showToast("❌ Task 정보 초기화 실패: " + (res.message || ""));
      if (ids.indexOf(ProjectContext.current) !== -1) {
        if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.messages = [];
        await SyncManager.refresh(null, { silent: true, skipConfirm: true });
        if (typeof AttachManager !== "undefined") AttachManager.refreshSummary(true);
      }
      const files = res.results.reduce((a, r) => a + (r.filesTrashed || 0), 0);
      showToast(`🧹 Task 정보를 초기화했습니다: ${names.join(", ")} — 서버 백업 ${res.results.map(r => r.backup).join(", ")}${files ? ` · 첨부파일 ${files}개 휴지통` : ""}`);
      return;
    }
    // 로컬 저장소 방식: 지금 프로젝트는 화면 자료를, 다른 프로젝트는 저장소를 바로 고침
    ids.forEach(pid => {
      if (pid === ProjectContext.current) return;
      const st = LocalBackend._read(pid);
      if (!st) return;
      BackupHistoryManager.createBackupSnapshot("Task초기화직전백업", "ALL", false, { projectId: pid, projectName: (this.projects().find(p => p.id === pid) || {}).name, source: st });
      const revs = LocalBackend._readRevs(pid);
      this.TASK_KEYS.forEach(k => { st[k] = []; revs[k] = {}; });
      LocalBackend._write(pid, st, revs);
    });
    if (ids.indexOf(ProjectContext.current) !== -1) {
      BackupHistoryManager.createBackupSnapshot("Task초기화직전백업", "ALL", false);
      this.TASK_KEYS.forEach(k => DataRegistry.set(k, []));
      if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.messages = [];
      StorageManager._afterBulkReplace(`🧹 Task 정보를 초기화했습니다: ${names.join(", ")} (기본정보 · 프로젝트 설정은 그대로)`);
    } else {
      showToast(`🧹 Task 정보를 초기화했습니다: ${names.join(", ")} (기본정보 · 프로젝트 설정은 그대로)`);
    }
  },
  resetProject() {
    if (!this.isAdmin()) return showToast("🚫 프로젝트 초기화는 시스템관리자만 할 수 있습니다. (시스템 설정 > 데이터 관리)");
    openConfirmDialog(`⚠️ [프로젝트 전체 초기화] [${this.currentName()}]\n프로젝트 설정(도메인 · 서브시스템 · SDLC · 공휴일 · 표준 산출물 · 마일스톤)와 모든 Task 정보를 빈 상태로 되돌립니다.\n` +
      `· 그대로: 프로젝트 이름 · 기간 · 멤버 계정 · 다른 프로젝트\n바꾸기 전에 자동 스냅샷을 만듭니다. 계속할까요?`, () => this._resetCurrent());
  },
  // 이름 · 기간 · 파일 약칭만 두고 기준정보를 빈 상태로
});
