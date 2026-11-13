// =============================================================================
// [Project Mgmt v3.3.0] 엑셀 내려받기 · 올리기 표준 (DataIO)
// -----------------------------------------------------------------------------
//  모든 업무 화면(WBS · 요구사항 · VOC · 산출물)의 머리줄 [⬇ 내려받기] [⬆ 올리기] 메뉴에 같은 방식으로 둠
//   - 내려받기: 그 화면의 [서브시스템 조회] 범위 그대로 (전체이면 전체), 파일 이름은 표준 규칙
//               {파일약칭}_{대상}_{범위}_{기준일}.xlsx  예) PRJ_WBS_W1_20270601.xlsx
//   - 올리기  : 같은 양식의 엑셀(.xlsx · .xls · .csv)을 그 화면의 조회 범위에 반영
//               서브시스템을 고른 상태 → 그 서브시스템 행만 교체 (다른 서브시스템은 그대로)
//               [전체]를 고른 상태 → 전체 교체 (관리자 · PM, 담당이 ALL 인 총괄리더)
//               [v4.1.0] 스마트 병합과 같은 미리 보기 창에서 건수 · 범위를 확인하고, 복원 지점을 만든 뒤 반영
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
      showToast(`🚫 [${d.label}] 전체 범위 업로드는 관리자 · PM(담당이 ALL 인 PL 포함)만 할 수 있습니다. [서브시스템 조회]에서 담당 서브시스템을 고른 뒤 올리세요.`);
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

  // [v4.1.0] 스마트 병합과 같은 올리기 미리 보기 창 (파일 행 · 반영 · 제외 · 방법 → [반영] / [취소])
  async upload(kind, file) {
    const d = this.KINDS[kind];
    await MergeTable.previewFile(file, { keys: [kind], scope: this.scope(kind), title: `📤 ${d.label} 엑셀 업로드` });
  }
};
window.DataIO = DataIO;
