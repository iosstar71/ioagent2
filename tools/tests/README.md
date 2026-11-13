# PM Hub (IOSTAR-PM Standalone) — 자동 테스트

| 구분 | 실행 | 내용 |
|---|---|---|
| 브라우저 E2E | `node tools/tests/e2e/run_e2e.js` | 배포 zip 을 만들어 풀고 정적 서버(`python -m http.server`)로 `/pprjmgmt/` 아래에서: 정적 파일만 · 작업자 선택 화면 · 빈 상태 시작(IndexedDB, 전사 localStorage 안 건드림) · 모든 화면 · PM 종합본 → 작업자 시작 → 작업자 내 자료 → PM 병합 · 이전 종합본 경고 · 새 종합본 가져오기(내 작업 유지) · 다시 불러오기 · 용량 · 외부 요청 없음 |

서버 프로그램이 없으므로 API 시험은 없습니다. Playwright 가 필요합니다.
