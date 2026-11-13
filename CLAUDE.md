# PM Hub (IOSTAR-PM) — 작업 규칙

브랜드 IOSTAR-PM · 사내 표시 PM Hub · 판: **Standalone**(이 브랜치 `iostar-pm-standalone`, DB · 서버 없음) /
**Workgroup**(`iostar-pm-workgroup`, 서버 DB, 같은 화면이 `webapp/` 아래) / Enterprise(계획).
사용자와는 **한국어**로 답한다. 커밋 메시지 · 도구 콘솔 출력은 영어.

## 1. 사용량을 아끼는 작업 방식 (먼저 읽기)
- **큰 파일은 통째로 읽지 않는다.** `grep -n` 으로 줄을 찾고 `sed -n 'a,bp'` 또는 Read(offset/limit)로 그 부분만.
  - `index.html` 3.3천 줄 · `static/css/style.css` 3.2천 줄 · `static/js/common/i18n-en.js` 3천 줄(번역 사전, 거의 읽을 일 없음)
  - `static/js/core/sample-snapshot.js` · `initial-data.js` 는 데이터 파일 — 읽지 않는다.
- **위치 지도** (찾기 전에 여기부터)
  | 무엇 | 어디 |
  |---|---|
  | 테마 목록 · 예전 값 변환 | `static/js/common/tabs-theme.js` (`STANDARD_THEMES`, `normalizeTheme`) |
  | 테마 색 · 차트 색 토큰 | `style.css` 끝부분: `[data-theme="..."]` 블록, `--chart-*`, `--tint-*` |
  | 선 아이콘(이모지 → SVG) | `static/js/common/icons.js` (`Icons.MAP`) |
  | 메뉴 묶음 · 첫 화면 | `static/js/common/g-shell.js` (`GROUPS`), `modules/home/home.js` (`LANDING`) |
  | WBS 표 · 오른쪽 상세 패널 | `modules/wbs/wbs-table.js`, `common/neo.js` (`NeoDetail`) |
  | 체크할 일 집계 | `common/neo.js` (`NeoTodo.collect`) |
  | 차트(S-curve · 불릿) | `modules/progress/dashboard-chart.js`, `common/charts.js` (`ChartTheme`) |
  | 영어 화면 | `common/i18n.js` + 사전 `i18n-en.js` (`exact` 에 한국어 원문 → 영어 추가) |
  | 저장 · 상태 표시 | `core/data-store.js` (`SyncUI`) |
  | 화면 설정(app.ini) | `conf/app.ini` → `python tools/app_config.py` 가 `static/js/config/app-config.js` 생성 |
- **여러 파일을 같은 식으로 고칠 때**는 파이썬 스크립트 한 번으로 고친다(파일마다 Edit 반복 금지). 고친 뒤 다시 읽어 확인하지 않는다.
- **시험은 필요한 만큼만**: 작은 수정 → `node --check <파일>` + `python tools/check_ui_debt.py`; 화면 동작 변경 → E2E 1회.
  E2E 는 끝에 한 번 돌린다(Standalone ~3분, Workgroup ~20분 — Workgroup 은 백그라운드로).
- **화면 확인 캡처**는 deviceScaleFactor 1, 필요한 영역만 clip. 사용자에게 보낼 것만 2배/합성.
- 미리보기용 정적 서버: 배포 폴더 이름이 `/pprjmgmt` 이어야 한다(심볼릭 링크 폴더를 쓸 때 기존 폴더가 있으면 그 안에 링크가 생기니 새 폴더로).
- 사용자가 설명만 원하면 코드를 고치지 않는다. 큰 디자인 변경은 **실제 화면에 임시 CSS 를 입힌 전/후 캡처**로 먼저 확인받는다.

## 2. 화면 스타일 규칙 (UI 부채 줄이기)
- **새 코드에 `!important` · 인라인 `style=""` · 고정 색(#hex)을 쓰지 않는다.** 색은 테마 변수만:
  `--primary --bg-main --bg-card --border-color --text-main/sub/muted --success --warning --danger --tint-info(-text) --chip-bg --chart-*`.
  - 예외: 이미 있는 `!important` 규칙을 덮어야 할 때만 (그 자리에 이유 주석).
- **화면을 고치면 그 화면의 인라인 스타일 · `!important` · 고정 색을 함께 줄인다**(같은 모양의 CSS 클래스로 옮김).
- `python tools/check_ui_debt.py` — 화면별 개수가 **늘면 실패**, 줄면 기준(`tools/ui_debt.json`)이 자동으로 낮아진다. 커밋 전에 실행. `--report` 로 화면별 현황.
- 상태 색은 뜻이 있다: 정상 = success(초록), 주의 = warning(주황/노랑), 지연 · 위험 = danger(빨강). 장식에 쓰지 않는다.
- 이모지는 화면에 그대로 써도 `icons.js` 가 같은 모양의 선 아이콘으로 바꾼다. 새 이모지를 쓰면 `Icons.MAP` 에 아이콘을 추가.
- 새 한국어 화면 문구는 `i18n-en.js` 의 `exact` 에 영어를 함께 넣는다.

## 3. 테마 (5가지, 확정)
| 화면 이름 | 내부 값 | 성격 |
|---|---|---|
| Slate (기본) | `urban-slate` | 흰 바탕 · 회청, 납작한 글자 헤더 |
| Walnut | `brown` | 따뜻한 종이색 바탕 · 갈색 메뉴 필 · 띠 |
| Navy | `classic` | 네이비 머리말 · 얇은 네이비 배너 (전통) |
| Obsidian | `dark` | 어두운 화면 · 납작한 헤더 |
| Pop | `electric` | 팝아트: 흰 바탕 · 노란 배너 · 원색 띠 · 굵은 먹선(배너 · 고른 메뉴 · 주 버튼에만) |
- 내부 값은 바꾸지 않는다(저장된 프로젝트 호환). 예전 값: navy→classic, matte·green·nordic-sage→urban-slate, graphite·obsidian→dark.
- 새 화면 요소를 만들면 5개 테마에서 모두 확인(특히 Obsidian 의 밝은 상자, Pop 의 테두리).

## 4. 용어 · 이름
Task · 멤버 · PL · 다운로드/업로드 · 마스터 파일 · 내 작업 파일 · 프로젝트 설정 · 도메인 · 스냅샷 · Phase · 실제 시작/종료 ·
대기(예전 착수전) · N차(예전 N회차) · 보고 · 게시판 · 체크할 일 · Admin · Dashboard · Gantt.
엑셀 시트 이름(`0_프로젝트기준정보` 등)과 읽기 규칙은 예전 이름도 받아야 한다(멤버 시트: 사용자/작업자/멤버).

## 5. 두 판에 함께 적용하기
- Standalone 에서 먼저 고치고 시험 → 같은 변경을 Workgroup 에: Standalone 쪽 `git diff <from> <to> -- static index.html` 을
  Workgroup 작업 폴더에서 `git apply --directory=webapp -3` (충돌은 Workgroup 내용을 살리고 색 · 클래스만 반영).
- Workgroup 만의 것: 서버(`server/`), 체크아웃 잠금, 채팅. Standalone 만의 것: 📦 마스터 파일 메뉴, 샘플 프로젝트, IndexedDB.
- 두 판 공통 도구(`tools/app_config.py` 등)를 바꾸면 Workgroup 에서 `python tools/check_shared_files.py --update`.

## 6. 시험 · 배포
- Standalone: `node tools/tests/e2e/run_e2e.js` (배포 zip 을 만들어 `/pprjmgmt` 에서 시험) · `python tools/make_release.py <폴더>`
- Workgroup: `node tools/tests/e2e/run_e2e.js` (실제 서버) · `python tools/tests/test_server_api.py` · `python tools/make_release.py <폴더>`
- 호환 시험 자료: `tools/tests/fixtures/` (상대 판에서 만든 프로젝트 백업 JSON)
