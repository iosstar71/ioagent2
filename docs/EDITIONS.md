# IOSTAR-PM 판(Edition) 운영 안내

## v3.0.0 부터: Neo 하나
- 브랜치: `iostar-pm-unified`
- app.ini: `edition=MAIN`, `edition_name=`(표시 없음), `version=3.x`, `[ui] default_theme`
- 배포 파일: `IOSTAR-PM_v3.x[_win64].zip`
- Standard(클래식) 화면과 화면 방식 선택(`default_ui`, `allow_ui_switch`, `projectUsers[].uiMode`)은 없어짐.
  `UiMode` 는 호환용으로 남아 있고 항상 `neo` 를 돌려줌 (CSS 의 `body:not(.ui-neo)` 규칙은 쓰이지 않으며 다음 정리 때 지울 수 있음)
- 사용자 모델: 계정(사번·이름·비밀번호)은 하나, 프로젝트 참여는 `projectUsers[].projectRoles[프로젝트ID] = {role, subsystem, dept}`.
  `SYS_ADMIN` 은 모든 프로젝트 공통. 이전 데이터는 처음 한 번 자동 이관 (서버: `TB_META.membership_v3`, 로컬: `IOSTAR_MEMBERSHIP_V3`)
- 로그인: PM 이하는 프로젝트를 골라야 하고 그 프로젝트만 조회 (서버 세션의 `loginProject` 로 고정), 시스템관리자는 선택하지 않아도 됨

## v2.3.0 ~ v2.4.x: 통합판 (화면 방식 Standard / Neo 선택) — 보존용
- Standard v1.0.1 + Neo v2.2.0 통합, `[ui] default_ui / allow_ui_switch` 로 화면 방식 선택 (v2.4.0 부터 기본 neo)
- Neo 전용 코드: `js/neo.js`, CSS `[Neo 2.1]`·`[Neo 2.2]`·`[v2.3.0]` 영역

## 이전 분리판 (보존용)

| 항목 | 국내판 (KR) — 개발 종료 | Standard (구 G) | Neo |
|---|---|---|---|
| 브랜치 | `claude/closed-network-project-management-x9e68s` | `iostar-pm-standard` (구 `iostar-pm-g`) | `iostar-pm-neo` |
| 기준 | v1.2.0 (커밋 `04d5a39`) — 마지막 버전 | v1.2.0 에서 분기 → G v1.0.0 → Standard v1.0.1 | Standard v1.0.1 에서 분기 → v2.0.0 |
| app.ini | `edition=KR`, `version=1.2.0` | `edition=STANDARD`, `edition_name=Standard`, `version=1.0.x` | `edition=NEO`, `edition_name=Neo`, `version=2.x` |
| 화면 | 기존 위쪽 탭 | B2: 한 줄 머리글 + 2단 메뉴 + ⚙ 관리 + Ctrl+K | Standard + 개편안 A 의 장점 (계획) |
| 배포 파일 | `IOSTAR-PM_v1.2.0[_win64].zip` | `IOSTAR-PM-Standard_v1.0.x[_win64].zip` | `IOSTAR-PM-Neo_v2.x[_win64].zip` |
| 기본 언어 | 한국어 | 한국어 | 한국어 |

- 판 이름(`edition_name`)은 머리글 배지, 배포 파일 이름, 서버 창 제목에 쓰입니다. 비워 두면 `edition` 코드로 정합니다
  (KR → 표시 안 함, STANDARD → Standard, NEO → Neo).
- 내부 이름(`GShell`, `g-edition`, 저장 키 `IOSTAR_G_*`)은 사용자 설정 호환을 위해 그대로 둡니다.

## 공용 파일 (모든 판이 똑같아야 함)
`run_server.bat`, `make_cert.bat`, `run_tests.bat`, `build_standalone.bat`,
`tools/app_config.py`, `tools/check_shared_files.py`, `tools/make_cert.py`, `tools/make_release.py`, `tools/make_release_win.py`

- 확인: `python tools/check_shared_files.py` (run_tests.bat 첫 단계)
- 바꾸는 순서 (국내판은 개발 종료 → Standard 가 기준)
  1. Standard 브랜치에서 수정 → `python tools/check_shared_files.py --update` → 커밋
  2. Neo 브랜치에서 `git checkout iostar-pm-standard -- <바꾼 파일들> tools/shared_files.sha256` → 커밋
- 제품마다 다른 값은 배치 파일이 아니라 `app.ini` 에 둡니다.
- Standard v1.0.1 에서 바꾼 공용 파일: `run_server.bat`(창 제목에 판 이름), `run_tests.bat`(안내 문구),
  `tools/app_config.py`(`edition_name`), 배포 도구 설명 문구. 국내판 v1.2.0 은 개발 종료로 반영하지 않습니다.

## 공통 엔진 수정
일정 계산(wbs-engine), 저장·권한(data-store, access-control), DB 서버(wbs_db_server.py) 수정은
Standard 에서 먼저 하고 Neo 브랜치로 `git cherry-pick` 합니다. Standard 화면 전용 코드는 `js/g-shell.js` 와
`css/style.css` 끝의 `[G v1.0.0]`·`[Standard v1.0.1]` 영역에 있습니다.
