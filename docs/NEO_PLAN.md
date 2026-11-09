# IOSTAR-PM Neo (v2.x) 개발 계획

- 브랜치: `iostar-pm-neo` (Standard v1.0.1, 커밋 `79817a2` 에서 분기)
- app.ini: `edition=NEO`, `edition_name=Neo`, `version=2.0.0` (개발 중)
- 목표: Standard 의 B2 화면(한 줄 머리글 · 2단 메뉴 · ⚙ 관리 · Ctrl+K)을 그대로 두고,
  개편안 A(docs/UI_Redesign_Proposal_v1.0.9.html)의 장점을 다듬어 더함
- 기본 언어: 한국어 (app.ini `default_lang=ko`)
- 공용 파일(배치 파일 4개·배포/인증서 도구)은 Standard 와 동일하게 유지 (docs/EDITIONS.md)
- 공통 엔진(일정 계산·저장·권한·DB 서버) 수정은 Standard 에서 먼저 하고 Neo 로 cherry-pick

## 단계별 계획
| 버전 | 내용 |
|---|---|
| 2.1 | 대시보드 "확인할 일"(지연·기한 임박·미조치 VOC·미승인 산출물) · WBS 오른쪽 상세 패널(행 편집) · 메뉴 건수 배지 · 상태 칩 필터 · 접을 수 있는 왼쪽 메뉴 · 어두운 화면 전체 정리 |
| 2.2 | 화면 머리줄 통일(제목·기준일·주요 버튼 위치) · 내려받기/올리기 메뉴로 버튼 정리 · 주간보고 2단 화면(목록 + 편집) |
| 2.3 | 선 아이콘(SVG, 라이선스 확인된 자체 제작) · Pretendard 글꼴(SIL OFL, 오프라인 내장) · 버튼 규칙 정리 |

## 현재 상태
- v2.0.0: 분기만 완료 (화면·기능은 Standard v1.0.1 과 같음)
