// =============================================================================
// [IOSTAR-PM v1.0.7] 버튼 · 바로가기 스타일 표준
// -----------------------------------------------------------------------------
//  모든 화면의 .btn 버튼을 "기능"에 따라 같은 색상·모양으로 표시합니다.
//   save       : 저장 · 작성 완료 · 적용 · 로그인            (파랑, 채움)
//   refresh    : 새로고침 · 동기화 · 다시 불러오기 · 재계산    (파랑, 테두리)
//   add        : 추가 · 등록 · 생성 · 작성                    (청록, 채움)
//   danger     : 삭제 · 초기화 · 제외                         (빨강, 채움)
//   warn       : 주의가 필요한 동작 (잠금 · 비밀번호 초기화)    (주황, 채움)
//   cancel     : 취소 · 닫기 · 돌아가기                       (회색, 테두리)
//   nav        : 화면 이동 · 보기 · 바로가기                   (남색, 연한 배경)
//   excel-down / excel-up : 엑셀 다운로드(초록 채움) / 엑셀 업로드(초록 테두리)
//   word-down  / word-up  : 워드 다운로드(파랑 채움) / 워드 업로드(파랑 테두리)
//   json-down  / json-up  : JSON 다운로드(회색 채움) / JSON 업로드(회색 테두리)
//   neutral    : 그 밖의 보조 동작                              (회색, 테두리)
//  ※ HTML 에서 data-btn="종류" 로 직접 지정할 수 있으며, 지정이 없으면 문구·동작으로 자동 분류합니다.
// =============================================================================
var ButtonStandard = {
  TYPES: ["save", "refresh", "add", "danger", "warn", "cancel", "nav", "excel-down", "excel-up", "word-down", "word-up", "json-down", "json-up", "neutral"],
  STYLE_PROPS: ["background", "background-color", "color", "border-color", "border"],

  classify(btn) {
    const text = (btn.getAttribute("data-label-ko") || btn.textContent || "").replace(/\s+/g, " ").trim();
    const oc = UiEvents.describe(btn);
    const t = text + " " + oc;
    const has = re => re.test(t);
    const up = /업로드|올리기|올려|로드|복원|Upload|Restore|Load|\.click\(\)/i.test(t);
    const down = /다운|내려받|Download|export/i.test(t);
    if (/변경 취소|Discard/i.test(text)) return "cancel";
    if (/비밀번호 초기화|비번 초기화|🔄 초기화/.test(text) || /resetProjectUserPassword/.test(oc)) return "warn";
    if (/엑셀|XLSX|Excel|xlsx/i.test(t)) return up && !/download|Download|다운/.test(text) ? "excel-up" : "excel-down";
    if (/워드|Word|exportDocx|exportMeetingDocx|downloadDocx/i.test(t)) return up && !down ? "word-up" : "word-down";
    if (/JSON|json|백업 다운|DDL/i.test(t) && (up || down)) return up && !/다운|Download/i.test(text) ? "json-up" : "json-down";
    if (has(/삭제|초기화|✕|×|🗑️|비우기|Delete|Reset|Clear|delete|remove|clearAll/) && !/선택 해제/.test(text)) return "danger";
    if (has(/잠금|Lock/)) return "warn";
    if (/취소|닫기|로그인으로|Cancel|Close|Back to/i.test(text)) return "cancel";
    if (/저장|작성 완료|적용|로그인|확인|변경$|전송|완료$|Save|Apply|Login|Complete|Send|Done|^OK$/i.test(text)) return "save";
    if (/새로고침|동기화|다시 불러|재계산|재채번|재확인|재연결|연결 테스트|자동반영|자동보정|Refresh|Sync|Recalc|Renumber|Reconnect|Test Connection|Auto-/i.test(text)) return "refresh";
    if (/^[➕+＋]|추가|등록|생성|작성|게시|Add|Register|Generate|Post|New/i.test(text)) return "add";
    if (/이동|보기|열기|바로가기|미리보기|📍|도움말|◀|▶|Go to|View|Open|Preview|Help/i.test(text)) return "nav";
    if (/설정|회의록|Settings|Minutes/i.test(text)) return "nav";
    if (/전체 선택|선택 해제|수정|편집|✏️|PPT|Select|Edit/i.test(text)) return "neutral";
    return null;
  },

  apply(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const list = scope.matches && scope.matches(".btn") ? [scope] : [];
    scope.querySelectorAll(".btn").forEach(b => list.push(b));
    list.forEach(btn => {
      if (btn.classList.contains("tab-btn") || btn.closest(".tab-bar")) return;
      let type = btn.getAttribute("data-btn");
      if (!type) {
        type = this.classify(btn);
        if (!type) return;
        btn.setAttribute("data-btn", type);
      }
      if (btn.getAttribute("data-btn-styled") === "1") return;
      // [v3.3.0] 내려받기 · 올리기 단추는 모양을 data-btn 표준 하나로 (개별 색 클래스 제거)
      if (/-(down|up)$/.test(type) && /📥|📤|내려받기|올리기|다운로드|업로드/.test(btn.textContent)) ["btn-success", "btn-warning", "btn-outline", "btn-primary", "btn-secondary", "btn-info"].forEach(c => btn.classList.remove(c));
      // 기능 색상이 적용되도록 개별 인라인 색상 지정 제거 (크기·여백은 유지)
      this.STYLE_PROPS.forEach(p => btn.style.removeProperty(p));
      btn.setAttribute("data-btn-styled", "1");
    });
  },

  init() {
    this.apply(document.body);
    if (typeof MutationObserver === "undefined") return;
    let pending = null;
    new MutationObserver(muts => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) this.apply(n); }));
        this.apply(document.body);
      }, 30);
    }).observe(document.body, { childList: true, subtree: true });
  }
};
window.ButtonStandard = ButtonStandard;
