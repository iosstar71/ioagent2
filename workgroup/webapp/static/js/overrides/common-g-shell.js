// Workgroup 판: common/g-shell.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(GShell, {
  LABELS: {
    "tab-mywork": "My Work", "tab-home": "Summary", "tab-dashboard": "Dashboard", "tab-matrix": "Phase 진척",
    "tab-wbs": "WBS", "tab-gantt": "Gantt",
    "tab-req": "요구사항", "tab-voc": "VOC · 이슈", "tab-deliverables": "산출물",
    "tab-weekly-report": "보고", "tab-meeting": "회의", "tab-notices": "게시판 · 채팅",
    "tab-master": "프로젝트 설정", "tab-merge": "Import · Export", "tab-config": "Admin"
  },
});
