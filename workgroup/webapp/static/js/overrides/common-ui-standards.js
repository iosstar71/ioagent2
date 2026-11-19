// Workgroup 판: common/ui-standards.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ButtonStandard, {
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
    if (/새로고침|동기화|다시 불러|재계산|다시 계산|재채번|다시 매기기|재확인|재연결|연결 테스트|자동반영|자동보정|채우기|옮기기|맞추기|Refresh|Sync|Recalc|Renumber|Reconnect|Test Connection|Auto-/i.test(text)) return "refresh";
    if (/^[➕+＋]|추가|등록|생성|작성|게시|Add|Register|Generate|Post|New/i.test(text)) return "add";
    if (/이동|보기|열기|바로가기|미리보기|📍|도움말|◀|▶|Go to|View|Open|Preview|Help/i.test(text)) return "nav";
    if (/설정|회의록|Settings|Minutes/i.test(text)) return "nav";
    if (/전체 선택|선택 해제|수정|편집|✏️|PPT|Select|Edit/i.test(text)) return "neutral";
    return null;
  },
});
