# IOSTAR-PM — 자동 테스트 (v1.2.0)

프로그램 폴더에서 실행합니다. 두 테스트 모두 **임시 폴더에 복사본을 만들어** 실행하므로 운영 DB(`data/wbs_enterprise.db`)는 변경되지 않습니다.

| 구분 | 파일 | 필요 환경 | 실행 |
|---|---|---|---|
| DB 서버 API 테스트 | `tools/tests/test_server_api.py` | Python 3.8+ (표준 라이브러리만) | `python tools/tests/test_server_api.py` |
| 브라우저 E2E 테스트 | `tools/tests/e2e/run_e2e.js` | Node.js 18+, Playwright(Chromium) | `node tools/tests/e2e/run_e2e.js` |
| 전체 실행 | `run_tests.bat` | 위 두 환경 | `run_tests.bat` |

## 검증 항목 (API 19건 · E2E 39건)
콘솔 출력은 언어 설정과 관계없이 영어로 표시됩니다 (`[PASS]` / `[FAIL]`, `Result: n / n passed`).

- **API**: 미인증 차단(401), DB 파일 직접 접근 차단(403), 비밀번호 해시 비노출, 일반 사용자 담당 서브시스템만 저장, 기준정보 저장 차단, 동시 저장 충돌(409)·강제 저장, 신규 등록·중복 등록, 로그인 화면 비밀번호 변경·관리자 초기화, 로그인 5회 실패 차단(429), 채팅
- **E2E (로컬 저장소 모드)**: 초기 비밀번호 변경 강제, 비밀번호 규칙, 프로젝트 만들기·전환·데이터 분리·프로젝트별 권한, 파일 직접 실행 시 로컬 모드 안내·전환, 로그인, 전체 탭 이동, Oracle/Excel·Access 비활성화, WBS 레벨 변경 재채번, 실적 자동반영 날짜 규칙, 지연 상태·최하위 지연 Task 조회, 간트 목록/차트 스크롤 정렬·기준일선·마일스톤, 주간보고 목록(통합+서브시스템, 분야별 제외)·생성·항목 제외/직접 입력·작성 완료·32,000자 제한·작성 완료 보고서 통합 취합·상단 엑셀/워드(표 포함·표 제외) 다운로드·워드 표 열 개수 일치, 협업 데이터 JSON 왕복, 일반 사용자 권한 원복
- **API (v1.0.10 보안·여러 프로젝트)**: 초기 비밀번호 변경 강제, PBKDF2 저장, 데이터 저장으로 비밀번호 변경 차단, CSP·CORS 헤더, HTTPS(사내 CA 검증)·이전 비밀번호 자동 전환, 프로젝트 데이터 분리·프로젝트별 권한·참여자 제한·삭제·채팅 분리
- **E2E (DB 서버 모드)**: CSP 적용 상태에서 실제 클릭으로 전체 탭 이동·표 입력, 프로젝트 만들기·전환·저장 분리, 서버 주소 첫 접속 시 서버 DB 모드, 로컬 모드 저장값일 때 전환 질문, 동시 저장 충돌 경고·무시하기, 서버 중지 시 연결 끊김 배너

## 폐쇄망 준비 (Playwright)
인터넷이 되는 PC에서 아래를 실행한 뒤 `node_modules` 폴더와 브라우저 캐시 폴더(`%USERPROFILE%\AppData\Local\ms-playwright`)를 함께 반입합니다.
```
npm init -y
npm install playwright
npx playwright install chromium
```
이미 설치된 Chromium/Chrome 을 쓰려면 `set CHROMIUM_PATH=C:\경로\chrome.exe` 후 실행합니다.
`--local` 옵션을 붙이면 서버 모드 시나리오를 건너뜁니다.
