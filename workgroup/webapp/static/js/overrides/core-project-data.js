// Workgroup 판: core/project-data.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ProjectData, {
  exportProject(format) {
    if (!this.canManage()) return showToast("🚫 프로젝트 백업은 PM · 관리자만 할 수 있습니다.");
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

  // [v3.9.1] 엑셀 백업(전체 일괄 양식)으로 복원: 이 프로젝트의 업무 · 협업 자료를 비우고 파일 내용으로 바꿈
  clearTasks(ids, label) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    const many = ids.length > 1;
    if (!this.isAdmin()) return showToast("🚫 Task 정보 초기화는 관리자만 할 수 있습니다. (Admin > 데이터 관리)");
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
});
