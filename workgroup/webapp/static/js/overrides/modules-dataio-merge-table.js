// Workgroup 판: modules/dataio/merge-table.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(MergeTable, {
  _lockOn() { return typeof LockManager !== "undefined" && LockManager.active(); },
  download(format) {
    const keys = this.selected();
    if (!keys.length) return showToast("⚠️ 다운로드할 자료를 1개 이상 체크하세요.");
    const scope = this.scope();
    const tag = keys.length === this.ITEMS.length ? "ALL" : keys.join("_").toUpperCase();
    if (format === "JSON") {
      const payload = { schemaVersion: `AX_PMYS_${APP_VERSION.version}_MERGE`, exportCategory: "MERGE_TABLE", projectId: ProjectContext.current,
        projectName: ProjectData.currentName(), targetScope: scope, selectedItems: keys, exportedAt: new Date().toISOString() };
      keys.forEach(k => {
        if (k === "config") { payload.projectConfig = projectConfig; payload.standardDeliverablesMeta = standardDeliverablesMeta; }
        else if (k === "users") payload.projectUsers = SmartMergeCenter._projectUserRows(false);
        else payload[this.DATA_KEY[k]] = this.records(k, scope);
      });
      const name = ExcelSync.stdName("자료", [scope, tag], "json");
      ExcelSync._triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), name);
      return showToast(`📥 [자료 ${keys.length}종 · ${scope}] JSON 다운로드: ${name}`);
    }
    const sheets = keys.map(k => this.sheetFor(k, scope)).filter(Boolean);
    const name = ExcelSync.stdName("자료", [scope, tag], "xlsx");
    ExcelSync._triggerDownload(ExcelSync._buildXlsxBlob(sheets), name);
    showToast(`📥 [자료 ${keys.length}종 · ${scope}] 엑셀 다운로드: ${name}`);
  },

  // ---- 올리기 ----
  async parseFile(file) {
    if (/\.json$/i.test(file.name)) {
      let d = JSON.parse(await file.text());
      if (d && Array.isArray(d.items) && d.items[0] && d.items[0].data) d = d.items[0].data;     // 프로젝트 백업 (JSON)
      else if (d && d.data && typeof d.data === "object" && !Array.isArray(d.data)) d = Object.assign({}, d.data, d.projectUsers ? { projectUsers: d.projectUsers } : {});
      return { json: d };
    }
    return { sheets: await ExcelSync._parseUploadedFile(file) };
  },

  // 시트마다 어떤 자료인지 (이름 → 머리줄)
});
