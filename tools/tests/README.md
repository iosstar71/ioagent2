# Project Mgmt (협업) — 자동 테스트

| 구분 | 실행 | 내용 |
|---|---|---|
| 서버 API | `python tools/tests/test_server_api.py` | 인증 · 권한 · 충돌 · 프로젝트 분리 · 작업자 관리 · 초기화 · 체크아웃 잠금 · 하위 주소 · 뺀 기능(404) · 백업 내려받기/복원 · 사용 용량 · 오류만 로그 · 배포 크기 |
| 브라우저 E2E | `node tools/tests/e2e/run_e2e.js` | 배포 zip 을 풀어 `/pprjmgmt` 아래에서: 빈 상태 시작 · 작업자 선택 화면 · 뺀 기능 · 모든 화면 · 용량 · 백업 · 주기 통신 없음 · 두 작업자 체크아웃 흐름 |

시험 자료(작업자 · 서브시스템)는 `tools/tests/fixtures/sample_initial_data.json` — 시험에만 쓰며 배포 묶음에는 들어가지 않습니다.
