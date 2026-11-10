// =============================================================================
// [IOSTAR-PM v3.3.0] 엑셀 내려받기 · 올리기 표준 (DataIO)
// -----------------------------------------------------------------------------
//  모든 업무 화면(WBS · 요구사항 · VOC · 산출물)의 머리줄 [⬇ 내려받기] [⬆ 올리기] 메뉴에 같은 방식으로 둠
//   - 내려받기: 그 화면의 [서브시스템 조회] 범위 그대로 (전체이면 전체), 파일 이름은 표준 규칙
//               {파일약칭}_{대상}_{범위}_{기준일}.xlsx  예) PRJ_WBS_W1_20270601.xlsx
//   - 올리기  : 같은 양식의 엑셀(.xlsx · .xls · .csv)을 그 화면의 조회 범위에 반영
//               서브시스템을 고른 상태 → 그 서브시스템 행만 교체 (다른 서브시스템은 그대로)
//               [전체]를 고른 상태 → 전체 교체 (시스템관리자 · PM · 총괄리더만)
//               반영 전에 건수 · 범위를 확인하고, 자동 백업을 만든 뒤 반영
//   - 버튼 문구 · 색: 📥 엑셀 내려받기 / 📤 엑셀 올리기 (data-btn="excel-down" / "excel-up")
// =============================================================================
var DataIO = {
  KINDS: {
    wbs: { label: "WBS", sys: "wbsSubsystemFilter" },
    req: { label: "요구사항", sys: "reqSubsystemFilter" },
    voc: { label: "VOC", sys: "vocSubsystemFilter" },
    deliverables: { label: "산출물", sys: "delivSubsystemFilter" }
  },
  ACCEPT: ".xlsx,.xls,.csv",

  scope(kind) {
    const d = this.KINDS[kind];
    const el = d && document.getElementById(d.sys);
    return el && el.value ? el.value : "ALL";
  },

  download(kind) {
    if (!this.KINDS[kind]) return;
    SmartMergeCenter.downloadItem(kind, "EXCEL", this.scope(kind));
  },

  pick(kind) {
    const d = this.KINDS[kind];
    if (!d) return;
    const scope = this.scope(kind);
    if (scope === "ALL" && !SmartMergeCenter.canBulkWork()) {
      showToast(`🚫 [${d.label}] 전체 범위 올리기는 시스템관리자 · PM · 총괄리더만 할 수 있습니다. [서브시스템 조회]에서 담당 서브시스템을 고른 뒤 올리세요.`);
      return;
    }
    if (scope !== "ALL" && typeof Permission !== "undefined" && Permission.canWriteSubsystem && !Permission.canWriteSubsystem(scope)) {
      showToast(`🚫 [${d.label}] ${scope} 서브시스템은 담당이 아니어서 올릴 수 없습니다.`);
      return;
    }
    let input = document.getElementById("dataIoFileInput");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "dataIoFileInput";
      input.accept = this.ACCEPT;
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        const k = input.dataset.kind;
        input.value = "";
        if (f) this.upload(k, f);
      });
    }
    input.dataset.kind = kind;
    input.click();
  },

  async upload(kind, file) {
    const d = this.KINDS[kind];
    const scope = this.scope(kind);
    let rows = [];
    try {
      const sheets = await ExcelSync._parseUploadedFile(file);
      rows = SmartMergeCenter._extractRowsFromSheets(sheets, kind);
    } catch (e) {
      showToast(`⚠️ [${d.label}] 엑셀 파일을 읽지 못했습니다: ${e.message}`);
      return;
    }
    const inScope = scope === "ALL" ? rows : rows.filter(r => String(r.system || "").trim() === scope);
    if (!inScope.length) {
      showToast(scope === "ALL"
        ? `⚠️ [${d.label}] 파일에서 올릴 데이터 행을 찾지 못했습니다. [📥 엑셀 내려받기]로 받은 양식을 쓰세요.`
        : `⚠️ [${d.label}] 파일에 ${scope} 서브시스템 행이 없습니다. (전체 ${rows.length}행)`);
      return;
    }
    const skipped = rows.length - inScope.length;
    const msg = scope === "ALL"
      ? `[${d.label}] 엑셀 ${inScope.length}행으로 전체 ${d.label} 데이터를 교체합니다. 반영 전에 자동 백업을 만듭니다. 계속할까요?`
      : `[${d.label}] ${scope} 서브시스템 데이터를 엑셀 ${inScope.length}행으로 교체합니다.${skipped ? ` (다른 서브시스템 ${skipped}행은 무시)` : ""} 다른 서브시스템은 그대로이며, 반영 전에 자동 백업을 만듭니다. 계속할까요?`;
    openConfirmDialog(msg, () => {
      try {
        const backup = BackupHistoryManager.createBackupSnapshot(`엑셀올리기(${d.label}:${scope})`, scope, true);
        const fileKeys = kind === "deliverables" && typeof AttachManager !== "undefined" ? AttachManager.rememberKeys() : null;
        SmartMergeCenter._mergeWorkArrayData(kind, inScope, scope);
        if (fileKeys) AttachManager.reapplyKeys(fileKeys);  // 첨부파일 연결 유지
        ExcelSync._ensureWbsAndSubsystemsIntegrity();
        if (typeof syncSubsystemWeights === "function") syncSubsystemWeights();
        rebuildAll(true);
        showToast(`✅ [${d.label}] 엑셀 ${inScope.length}행을 ${scope === "ALL" ? "전체" : scope} 범위에 반영했습니다. (자동 백업: ${backup})`);
      } catch (e) {
        showToast(`⚠️ [${d.label}] 엑셀 올리기 오류: ${e.message}`);
      }
    });
  }
};
window.DataIO = DataIO;
