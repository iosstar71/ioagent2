# IOSTAR-PM 판(Edition) 운영 안내

## v2.3.0 부터: 통합판 하나 (화면 방식 Standard / Neo 선택)
- 브랜치: `iostar-pm-unified` (Standard v1.0.1 + Neo v2.2.0 통합)
- app.ini: `edition=MAIN`, `edition_name=`(표시 없음), `version=2.3.x`, `[ui] default_ui / allow_ui_switch / default_theme`
- 배포 파일: `IOSTAR-PM_v2.3.x[_win64].zip`
- 화면 방식은 사용자별(`projectUsers[].uiMode`), 처음 값은 `default_ui`(v2.4.0 부터 neo), `allow_ui_switch=0` 이면 고정
- Standard(클래식) 화면은 v2.4.x 까지 제공 — 다음 버전에서 Neo 하나로 통합하고 화면 방식 선택을 없앨 예정
  (통합 시 정리 대상: `UiMode`, CSS `body:not(.ui-neo)` 규칙, `.neo-std-only` 요소, 자동 테스트의 Standard 단계)
- Neo 전용 코드: `js/neo.js`(UiMode · Neo 기능), CSS `[Neo 2.1]`·`[Neo 2.2]`·`[v2.3.0]` 영역 — Neo 요소는 `body.ui-neo` 일 때만 표시
- Standard 방식에서도 판매용으로 Neo 기능 자체를 빼야 한다면, 배포 전에 `default_ui=standard`, `allow_ui_switch=0` 으로 고정
  (화면 설정 방식이므로 기술적 보호 수단은 아님 — 기능을 실제로 빼는 별도 빌드가 필요하면 make_release 에 제외 목록 추가)

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
