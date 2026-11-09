# IOSTAR-PM G 버전 (글로벌판) 운영 안내

| 항목 | 국내판 (KR) | G 버전 |
|---|---|---|
| 브랜치 | `claude/closed-network-project-management-x9e68s` | `iostar-pm-g` |
| 기준 | v1.2.0 (커밋 `04d5a39`) | v1.2.0 에서 분기 → G v1.0.0 |
| app.ini | `edition=KR`, `version=1.2.x` | `edition=G`, `version=1.0.x` |
| 화면 | 기존 위쪽 탭 | B2: 한 줄 머리글 + 2단 메뉴 + ⚙ 관리 + Ctrl+K |
| 배포 파일 | `IOSTAR-PM_v1.2.x[_win64].zip` | `IOSTAR-PM-G_v1.0.x[_win64].zip` |
| 기본 언어 | 한국어 | 한국어 |

## 공용 파일 (두 판이 똑같아야 함)
`run_server.bat`, `make_cert.bat`, `run_tests.bat`, `build_standalone.bat`,
`tools/app_config.py`, `tools/check_shared_files.py`, `tools/make_cert.py`, `tools/make_release.py`, `tools/make_release_win.py`

- 확인: `python tools/check_shared_files.py` (run_tests.bat 첫 단계)
- 바꾸는 순서
  1. 국내판 브랜치에서 수정 → `python tools/check_shared_files.py --update` → 커밋
  2. G 브랜치에서 `git checkout <국내판 브랜치> -- <바꾼 파일들> tools/shared_files.sha256` → 커밋
- 제품마다 다른 값은 배치 파일이 아니라 `app.ini` 에 둡니다.

## 공통 엔진 수정
일정 계산(wbs-engine), 저장·권한(data-store, access-control), DB 서버(wbs_db_server.py) 수정은
국내판에서 먼저 하고 G 브랜치로 `git cherry-pick` 합니다. G 화면 전용 코드는 `js/g-shell.js` 와
`css/style.css` 끝의 `[G v1.0.0]` 영역에 있습니다.
