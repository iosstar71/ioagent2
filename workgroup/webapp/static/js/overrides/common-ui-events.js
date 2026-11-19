// Workgroup 판: common/ui-events.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(UiEvents, {
  root(name) {
    if (name in window) return window[name];
    switch (name) {
      case "BackupHistoryManager": return typeof BackupHistoryManager !== "undefined" ? BackupHistoryManager : undefined;
      case "DbConnector": return typeof DbConnector !== "undefined" ? DbConnector : undefined;
      case "ExcelSync": return typeof ExcelSync !== "undefined" ? ExcelSync : undefined;
      case "ReportExporter": return typeof ReportExporter !== "undefined" ? ReportExporter : undefined;
      case "SmartMergeCenter": return typeof SmartMergeCenter !== "undefined" ? SmartMergeCenter : undefined;
      case "JsonCollabManager": return typeof JsonCollabManager !== "undefined" ? JsonCollabManager : undefined;
      case "ManualViewer": return typeof ManualViewer !== "undefined" ? ManualViewer : undefined;
      case "GanttRenderer": return typeof GanttRenderer !== "undefined" ? GanttRenderer : undefined;
      case "DashboardChart": return typeof DashboardChart !== "undefined" ? DashboardChart : undefined;
      case "WBSEngine": return typeof WBSEngine !== "undefined" ? WBSEngine : undefined;
      case "DocxBuilder": return typeof DocxBuilder !== "undefined" ? DocxBuilder : undefined;
    }
    return undefined;
  },
});
