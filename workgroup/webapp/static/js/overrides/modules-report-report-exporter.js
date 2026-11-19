// Workgroup 판: modules/report/report-exporter.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(BackupHistoryManager, {
  _serverMode() {
    return typeof SyncManager !== "undefined" && !SyncManager.isLocal() && typeof ProjectData !== "undefined" && ProjectData.canManage() && typeof ServerBackend !== "undefined" && !!ServerBackend.token;
  },
});

Object.assign(JsonCollabManager, {
});
