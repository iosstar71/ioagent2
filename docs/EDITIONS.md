# 판(Standalone · Workgroup) 한 코드 구조

| 위치 | 내용 | 어느 판 |
|---|---|---|
| `index.html` · `manual.html` · `static/` | 화면 코드 한 벌 | 두 판 (Workgroup 은 `manual.html` 을 따로 씀) |
| `index.html` 의 `<!--#sa--> … <!--#/sa-->` | 📦 마스터 파일, 멤버 선택 화면, 샘플 프로젝트 등 | Standalone 에만 |
| `index.html` 의 `<template data-edition="workgroup"> … </template>` | 로그인 · 계정 등록, 채팅, 첨부, 잠금 표시, Workgroup 전용 스크립트 | Workgroup 에만 |
| `conf/app.ini` · `tools/` · `tools/tests/` | Standalone 설정 · 도구 · 시험 | Standalone |
| `workgroup/` | 서버(`server/`, `wbs_db_server.py`), 설정(`conf/app.ini`), 도구 · 시험(`tools/`), 배포 문서 | Workgroup |
| `workgroup/webapp/` | Workgroup 전용 화면 파일(채팅 · 잠금 · 첨부 · 도움말 보기 · 기능 켜고 끄기), 생성 파일(법적 고지 · 처음 자료), `workgroup.css`, localStorage `AppStore` | Workgroup |
| `workgroup/webapp/static/js/overrides/` | 공통 화면 코드 중 Workgroup 에서 다른 메서드(서버 저장 · 로그인 · 계정 · 잠금 · 백업 등) — 공통 파일 다음에 불러와 같은 이름을 덮어씀 | Workgroup |

## 배포 · 시험
- Standalone: `python tools/make_release.py <폴더>` (index.html 을 Standalone 에 맞게 바꿔 담음), 시험 `node tools/tests/e2e/run_e2e.js`
- Workgroup: `python tools/edition.py assemble workgroup <폴더>` 로 예전 Workgroup 저장소와 같은 모양을 만든 뒤, 그 폴더에서
  `python tools/tests/test_server_api.py` · `node tools/tests/e2e/run_e2e.js` · `python tools/make_release.py <출력 폴더>`

## 고칠 때
- 공통 파일의 메서드를 고치면 `workgroup/webapp/static/js/overrides/` 에 같은 이름이 있는지 확인한다 (`grep -rn "이름" workgroup/webapp/static/js/overrides`).
  있으면 Workgroup 쪽도 같은 뜻으로 고친다.
- 덮어쓰기 파일은 두 판을 합칠 때(1.2.5) 자동으로 뽑은 것이라, 낱말만 다른 메서드(로그인 ↔ 멤버 선택, 비밀번호 ↔ 암호)도 들어 있다.
  4단계에서 판 낱말 표 · 판 조건으로 바꿔 덮어쓰기를 줄여 간다.
- Workgroup 에만 필요한 화면 조각은 `index.html` 의 `<template data-edition="workgroup">` 안에 둔다.
