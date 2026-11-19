// Workgroup 판: modules/dataio/data-io.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(DataIO, {
  pick(kind) {
    const d = this.KINDS[kind];
    if (!d) return;
    const scope = this.scope(kind);
    if (scope === "ALL" && !SmartMergeCenter.canBulkWork()) {
      showToast(`🚫 [${d.label}] 전체 범위 업로드는 시스템관리자 · PM(담당이 ALL 인 PL 포함)만 할 수 있습니다. [서브시스템 조회]에서 담당 서브시스템을 고른 뒤 올리세요.`);
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
});
