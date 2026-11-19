# PM Hub (IOSTAR-PM) — 작업 규칙

브랜드 IOSTAR-PM · 사내 표시 PM Hub · 판: **Standalone**(DB · 서버 없음) / **Workgroup**(서버 DB) / Enterprise(계획).
**두 판이 이 브랜치(`iostar-pm-standalone`) 한 코드에 있다** — 화면은 맨 위 `index.html` · `static/` 한 벌, Workgroup 만의 것은 `workgroup/` (구조: `docs/EDITIONS.md`).
사용자와는 **한국어**로 답한다. 커밋 메시지 · 도구 콘솔 출력은 영어.

## 1. 사용량을 아끼는 작업 방식 (먼저 읽기)
- **큰 파일은 통째로 읽지 않는다.** `grep -n` 으로 줄을 찾고 `sed -n 'a,bp'` 또는 Read(offset/limit)로 그 부분만.
  - `index.html` 3.3천 줄 · `static/css/style.css` 3.2천 줄 · `static/js/common/i18n-en.js` 3천 줄(번역 사전, 거의 읽을 일 없음)
  - `static/js/core/sample-snapshot.js` · `initial-data.js` 는 데이터 파일 — 읽지 않는다.
- **위치 지도** (찾기 전에 여기부터)
  | 무엇 | 어디 |
  |---|---|
  | 테마 목록(한 곳) · 예전 값 변환 | `static/js/common/tabs-theme.js` (`THEMES`, `THEME_ALIASES`) — 견본 버튼 · 선택 상자는 여기서 그려짐 |
  | 목록 오른쪽 상세 패널(REQ · VOC · 산출물 · Action Item) | `static/js/common/record-panel.js` (`RecordPanel.SCHEMAS` 에 정의 추가 + 표 끝에서 `decorate`) |
  | 입력 대화상자 · 오류 표시 · 작업 중 버튼 | `common/app-base.js` (`openPromptDialog`, `UiForm`), `common/ui-events.js` (`_busy`, `_validate`) |
  | 엑셀 · 워드 양식 색상(Navy · Gray · Mint) | `modules/dataio/excel-sync.js` (`EXPORT_THEME_DEFS`, `normalizeExportTheme`) |
  | 엑셀 파일 형식 · 업로드 · 회의록 워드 | `modules/dataio/excel-format.js` · `excel-import.js` · `docx-builder.js` (모두 `ExcelSync` 에 붙음) |
  | 회의(일정 · 회의록 · Action Item · 다운로드) | `modules/meeting/meeting-manager.js`(상태 · 편집본) + `meeting-schedule` · `meeting-minutes` · `meeting-actions` · `meeting-export.js` |
  | 종합보고서(PPT) 구성 · 디자인 | `modules/report/exec-deck.js` (`SECTIONS` · `PRESETS` · `DESIGNS`, `_head` · `_cover`, 설정 화면 `DeckSettings`) |
  | 오른쪽 상세 패널이 시작하는 자리 | `common/neo.js` (`PanelDock` — 화면 머리글 아래, `--panel-top`) |
  | [보고] 메뉴 서브탭 | `modules/weekly/weekly-export.js` (`ReportTabs`) |
  | 화면이 그대로인지 확인 | `node tools/tests/css_safety_net.js --save <f.json>` → 고친 뒤 `--check <f.json>` (6개 테마 × 모든 화면 · 대화상자의 실제 스타일 비교). CSS 만 바꿨으면 `--compare <예전 css>` |
  | 공통 꾸밈 클래스(`u-flex` `u-bold` `u-gap-8` …) | `style.css` 맨 끝 블록 — 인라인 `style=""` 대신 씀. 없는 것은 같은 꼴로 더함 |
  | 화면 그리기 표(탭을 열 때 · 자료가 바뀔 때) | `common/tabs-theme.js` (`ScreenRender.MAP`) — 자료가 바뀌면 보이는 화면만 다시 그림(`MasterSyncEngine.syncAll`) |
  | 테마 색 · 차트 색 토큰 | `style.css` 끝부분: `[data-theme="..."]` 블록, `--chart-*`, `--tint-*` |
  | 선 아이콘(이모지 → SVG) | `static/js/common/icons.js` (`Icons.MAP`) |
  | 메뉴 묶음 · 첫 화면 | `static/js/common/g-shell.js` (`GROUPS`), `modules/home/home.js` (`LANDING`) |
  | WBS 표 · 오른쪽 상세 패널 | `modules/wbs/wbs-table.js`, `common/neo.js` (`NeoDetail`) |
  | 체크할 일 집계 | `common/neo.js` (`NeoTodo.collect`) |
  | 차트(S-curve · 불릿) | `modules/progress/dashboard-chart.js`, `common/charts.js` (`ChartTheme`) |
  | 영어 화면 | `common/i18n.js` + 사전 `i18n-en.js` (`exact` 에 한국어 원문 → 영어 추가) |
  | 저장 · 상태 표시 | `core/data-store.js` (`SyncUI`) |
  | 화면 설정(app.ini) | `conf/app.ini` → `python tools/app_config.py` 가 `static/js/config/app-config.js` 생성 |
  | 예전 자료 변환 · 자료 정의 | `core/migrate.js` (`Migrate`), `docs/DATA_MODEL.md` |
  | 달성률 · 비율 · 건수 기준 | `modules/wbs/metrics.js` (`Metrics`), 시험 `tools/tests/unit/run_unit.js` |
- **여러 파일을 같은 식으로 고칠 때**는 파이썬 스크립트 한 번으로 고친다(파일마다 Edit 반복 금지). 고친 뒤 다시 읽어 확인하지 않는다.
- **시험은 필요한 만큼만**: 작은 수정 → `node --check <파일>` + `python tools/check_ui_debt.py`; 계산 수정 → `node tools/tests/unit/run_unit.js`(1초); 화면 동작 변경 → E2E 1회.
  E2E 는 끝에 한 번 돌린다(Standalone ~3분, Workgroup ~20분 — Workgroup 은 백그라운드로).
- **화면 확인 캡처**는 deviceScaleFactor 1, 필요한 영역만 clip. 사용자에게 보낼 것만 2배/합성.
- 미리보기용 정적 서버: 배포 폴더 이름이 `/pprjmgmt` 이어야 한다(심볼릭 링크 폴더를 쓸 때 기존 폴더가 있으면 그 안에 링크가 생기니 새 폴더로).
- 사용자가 설명만 원하면 코드를 고치지 않는다. 큰 디자인 변경은 **실제 화면에 임시 CSS 를 입힌 전/후 캡처**로 먼저 확인받는다.

## 1-1. 유지보수 규칙 (기능을 바꿀 때마다)
- **옛 개념 삭제 확인**: 기능을 바꾸면 더 쓰지 않게 된 필드 · 함수 · 화면 문구 · 창(modal)을 같은 커밋에서 지운다.
  예전 자료를 새 모양으로 바꾸는 코드는 `static/js/core/migrate.js` 에 단계로 넣고 `Migrate.VERSION` 을 올린다 (화면 코드에 "예전 값이면 …" 을 흩지 않는다).
- **자료 정의**: 자료 묶음 · 필드를 바꾸면 `docs/DATA_MODEL.md` 를 함께 고친다.
- **같은 정의는 한 곳**: 기본 SDLC · 개선과제 유형은 `WBSEngine.DEFAULT_SDLC_PRESETS` · `DEFAULT_REQ_PRESETS` 만. 상태 · 우선순위 목록도 복사하지 않고 읽어 쓴다.
- **계산은 엔진에**: 진척률 · 가중치 · 지연 판정은 `wbs-engine.js` · `wbs-weight.js`, 달성률 · 비율 · 요구사항/VOC/산출물 건수 기준은 `modules/wbs/metrics.js`(`Metrics`). 화면 코드에서 비율 · 완료 기준을 새로 만들지 않는다. 계산을 고치면 `node tools/tests/unit/run_unit.js`(1초) 를 먼저 돌리고 시험 항목도 더한다.
- **버전 주석 금지**: `[v3.9.0]` 같은 이력은 코드에 쓰지 않는다(커밋 · `RELEASE_NOTES.md` 에). 주석은 "왜 이렇게 하는지"만.
- **문구**: 숫자 · 이름이 들어가는 화면 문장은 `I18N.tf("가중치 {n}%", { n })` 로 만들고 `i18n-en.js` 의 `templates` 에 같은 틀의 영어를 넣는다. 여러 조각을 이을 때는 조각마다 `<span>`.
- **안 쓰는 코드 찾기**: 큰 정리 뒤에는 아무 데서도 부르지 않는 함수 · 메서드가 없는지 확인한다.

## 2. 화면 스타일 규칙 (UI 부채 줄이기)
- 브라우저 `prompt()` · `confirm()` · `alert()` 를 쓰지 않는다 (`openPromptDialog` · `openConfirmDialog` · `showToast`).
- **새 코드에 `!important` · 인라인 `style=""` · 고정 색(#hex)을 쓰지 않는다.** 색은 테마 변수만:
  `--primary --bg-main --bg-card --border-color --text-main/sub/muted --success --warning --danger --tint-info(-text) --chip-bg --chart-*`.
  - 예외: 이미 있는 `!important` 규칙을 덮어야 할 때만 (그 자리에 이유 주석).
- **화면을 고치면 그 화면의 인라인 스타일 · `!important` · 고정 색을 함께 줄인다**(같은 모양의 CSS 클래스로 옮김).
- `python tools/check_ui_debt.py` — 화면별 개수가 **늘면 실패**, 줄면 기준(`tools/ui_debt.json`)이 자동으로 낮아진다. 커밋 전에 실행. `--report` 로 화면별 현황.
- 상태 색은 뜻이 있다: 정상 = success(초록), 주의 = warning(주황/노랑), 지연 · 위험 = danger(빨강). 장식에 쓰지 않는다.
- 이모지는 화면에 그대로 써도 `icons.js` 가 같은 모양의 선 아이콘으로 바꾼다. 새 이모지를 쓰면 `Icons.MAP` 에 아이콘을 추가.
- 새 한국어 화면 문구는 `i18n-en.js` 의 `exact` 에 영어를 함께 넣는다.

## 3. 테마 (6가지, 확정)
| 화면 이름 | 내부 값 | 성격 |
|---|---|---|
| Slate (기본) | `urban-slate` | 흰 바탕 · 회청, 납작한 글자 헤더 |
| Walnut | `brown` | 따뜻한 종이색 바탕 · 갈색 메뉴 필 · 띠 |
| Navy | `navy` | Walnut 과 같은 틀의 블루 계열 (규칙을 함께 씀: `:is([data-theme="brown"], [data-theme="navy"])`, 색은 `--pf-N`) |
| Classic | `classic` | 예전 IT 시스템 스타일: 남색 머리말 · 색 버튼 · 색 이모지(선 아이콘으로 바꾸지 않음, `THEMES` 의 `emoji: true`) |
| Obsidian | `dark` | 어두운 화면 · 납작한 헤더 |
| Pop | `electric` | 팝아트: 흰 바탕 · 노란 배너 · 원색 띠 · 굵은 먹선(배너 · 고른 메뉴 · 주 버튼에만) |
- 내부 값은 바꾸지 않는다(저장된 프로젝트 호환). 예전 값: matte·green·nordic-sage→urban-slate, graphite·obsidian→dark, ocean·purple→classic.
- 새 화면 요소를 만들면 **6개 테마 모두**에서 확인(특히 Obsidian 의 밝은 상자, Pop 의 테두리, Classic 의 진한 표 머리).
- 표 제목 행에 진한 고정 색을 쓰지 않는다: 묶음 제목은 `--tint-*` 클래스(`.col-phase` `.col-req` `.col-voc` `.col-deliv`), 합계는 `.col-total`.

## 4. 용어 · 이름
Task · 멤버 · PL · 다운로드/업로드 · 마스터 파일 · 내 작업 파일 · 프로젝트 설정 · 도메인 · 스냅샷 · Phase · 실제 시작/종료 ·
대기(예전 착수전) · N차(예전 N회차) · 보고 · 게시판 · 체크할 일 · Admin · Dashboard · Gantt.
엑셀 시트 이름(`0_프로젝트기준정보` 등)과 읽기 규칙은 예전 이름도 받아야 한다(멤버 시트: 사용자/작업자/멤버).

## 5. 두 판 운영 (한 코드)
- 화면 코드는 한 벌. 판마다 다른 것:
  - `index.html` 의 `<!--#sa--> … <!--#/sa-->`(Standalone 에만) · `<template data-edition="workgroup"> … </template>`(Workgroup 에만) — `tools/edition.py` 가 배포할 때 판에 맞게 남김
  - `workgroup/` — 서버(`server/`, `wbs_db_server.py`), 설정(`conf/app.ini`), Workgroup 도구 · 시험, 그리고 `workgroup/webapp/`(Workgroup 전용 화면 파일 · 생성 파일 · 덮어쓰기)
  - `workgroup/webapp/static/js/overrides/*.js` — 공통 화면 코드 중 Workgroup 에서 다르게 동작하는 메서드(로그인 · 서버 저장 · 체크아웃 잠금 등)를 같은 이름으로 덮어씀.
    **공통 파일의 메서드를 고칠 때 `grep -rn "<메서드 이름>" workgroup/webapp/static/js/overrides` 로 같은 이름이 있는지 확인**하고 있으면 함께 고친다.
- 평소 시험은 Standalone 만. Workgroup 은 화면 동작 · 저장 · 로그인을 바꿨을 때, 또는 배포 전에:
  `python tools/edition.py assemble workgroup <폴더>` → 그 폴더에서 Workgroup 시험(아래 6).
- Workgroup 만의 것: 서버, 로그인 · 계정 등록, 체크아웃 잠금, 채팅, 첨부, 도움말 내장(manual-viewer). Standalone 만의 것: 📦 마스터 파일 메뉴, 샘플 프로젝트, IndexedDB 저장(Workgroup 은 같은 이름의 localStorage `AppStore`).
- 저장: 두 판 모두 자동저장 없음 — [저장]을 눌러야 기록. 화면 설정(기준일 · 테마)과 프로그램이 한 자료 변환만 조용히 기록(`SyncManager.saveSettingsQuiet`).
- 초기 암호는 두 판 모두 `1234`, 처음 들어올 때 변경 필수. 설치본은 샘플 없이 빈 상태(Workgroup 시험은 `workgroup/tools/tests/fixtures/initial_sample.json`).
- 버전: 두 판 같은 번호 (`conf/app.ini` · `workgroup/conf/app.ini` 의 version). 릴리즈 노트: `RELEASE_NOTES.md` · `workgroup/RELEASE_NOTES.md`.

## 6. 시험 · 배포
- Standalone: `node tools/tests/e2e/run_e2e.js` (배포 zip 을 만들어 `/pprjmgmt` 에서 시험) · `python tools/make_release.py <폴더>`
- Workgroup: `python tools/edition.py assemble workgroup <폴더>` 다음 그 폴더에서 `node tools/tests/e2e/run_e2e.js`(실제 서버, ~20분 — 백그라운드로) · `python tools/tests/test_server_api.py`(10초) · `python tools/make_release.py <출력 폴더>`
  (조립한 폴더에서 화면 부채 기준을 바꾸면 `tools/ui_debt.json` 을 `workgroup/tools/` 로 다시 복사)
- 호환 시험 자료: `tools/tests/fixtures/` (상대 판에서 만든 프로젝트 백업 JSON)
