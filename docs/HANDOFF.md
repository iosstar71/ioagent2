# 작업 인계 메모 (AI · 사람 공용)

새 대화 · 새 세션 · 다른 도구로 옮겨도 같은 기준으로 이어 가기 위한 메모. **규칙은 `CLAUDE.md`**, 여기는 그 밖의 결정 · 선호 · 진행 상황.
고칠 때마다 이 파일의 "지금 상태"와 "다음 할 일"을 같이 고친다.

## 지금 상태
- 버전 **1.6.2** (두 판 같은 번호) — 브랜치 `iostar-pm-standalone`
- 두 판: Standalone(정적 · IndexedDB) / Workgroup(Python 서버 + SQLite). 한 코드, 판 차이는 `tools/edition.py` 표시와 `workgroup/`
- 시험 기준: 단위 81(샘플 경우 포함) · Standalone E2E 71 (샘플 프로젝트 구간 포함) · Workgroup E2E 116 · 서버 API 36 (1.6.0 에서 모두 통과) · Workgroup E2E (조립 폴더에서) · 서버 API 36
- 설계 문서: `docs/design/DESIGN_v1.4.md`(적용), `docs/design/PLAN_v1.5.md`(적용)

## 사용자가 정한 것 (다시 묻지 않기)
- 답은 한국어, 커밋 메시지 · 도구 출력은 영어. PR 은 요청할 때만
- 사용량 절약: E2E 는 끝에 한 번, **작은 수정(문구 · 링크 하나)으로 Workgroup 전체 E2E 를 다시 돌리지 않음**
- **시험 방식(2026-11 다시 결정, 실측 후)**: 버전을 마칠 때 Standalone E2E(약 3분) + Workgroup 서버 API 시험(9초)은 **항상**, Workgroup E2E(약 4분)는 **화면 · 저장 쪽을 고친 버전에서 함께** 돌린다(조립 폴더에서). Workgroup **배포본**은 사용자가 "Workgroup 버전 만들어 줘" 라고 할 때만. 저장 · 불러오기 · 잠금 코드를 고쳤으면 그 사실을 알려 줌
- 설명만 원하면 코드를 고치지 않음. 큰 디자인 변경은 전/후 캡처로 먼저 확인
- 브라우저 종료 시 임시 저장은 **필요 없음** (저장은 [저장] 버튼만)
- VOC **보류는 지연 판정에서 제외**
- 초기 관리자 두 판 모두 admin · admin2 (암호 1234, 처음 변경 필수). 완전 초기화 계정도 이 둘만
- 샘플 자료는 `static/js/core/sample-snapshot.js` 한 곳만. 두 판 모두 [🧪 샘플 프로젝트 추가] = 새 프로젝트로 추가
- Default 프로젝트는 삭제 불가 (멤버 · 화면 설정 보관 자리) — 표시 · 설명만
- 아키텍처 정의서는 나중에 새로 작성 (지금은 없음). Oracle 은 비활성 유지, Excel/Access 엔진은 삭제됨. 매뉴얼은 화면 안 창
- VOC 설계(1.4): 판정 5개(미판정 · 결함 · 개선 요청 · 설명 종결 · 이슈), 단계 4개(자동), 중복은 따로 두지 않음, **작은 개선은 VOC 안에서 처리 · 큰 것만 추가 요구사항(CR) 등록**(산출물 부담 때문), 요구 반영 건은 모수 포함 · 미결 제외, 테스트 결함 = 통합테스트만(안정화는 VOC 현황), 메뉴 "VOC · 결함"
- **고쳐 쓰는 화면의 저장 · 다운로드 줄은 위쪽 고정**(2026-11, 회의록을 주간보고와 같게): `.doc-head` · `.doc-toolbar` (스크롤하면 서브메뉴 줄 아래에 고정). 아래쪽에 저장 줄을 두지 않음
- 다음 버전 번호는 아직 정하지 않음 (AI 초안 · 회의록 배치 — 사용자가 정할 때까지 "다음 버전 (작성 중)")
- 목록 화면: 상태 버튼에 숫자가 있으므로 별도 상태 숫자 줄은 두지 않음
- **WBS 상태 버튼(2026-11 결정)**: 지연 등을 고르면 해당 Task + **레벨 보기에서 고른 레벨까지의 상위 Task 를 묶음 머리**로 함께 표시, 머리마다 "지연 n건"
- **선행 지연은 상태가 아니라 경고** (1.6.1): WBS 상태 칸에 자기 상태 + [⛓ 선행 지연] 표시를 함께, 상태 값 · 지연 건수는 바뀌지 않음
- **선행 Task(1.5)**: 최대 3개, 경고만(일정 자동 밀기 · 크리티컬 패스 · Gantt 연결선 없음). 일정 겹침 = 선행 계획 종료 ≥ 이 Task 계획 시작. 순환(A→B→A)은 상세 패널에서 거부 (엑셀 업로드는 그대로 받음 — 경고만이라 계산이 돌지 않음)
- **Workgroup 아래 고정 줄([변경 취소] · [모두 저장]) 없앰(1.5)** — 위쪽 줄과 같은 기능
- 1.5 ~ 1.6 Workgroup 화면(다운로드 제한 · 감사 로그 · 아래 저장 줄 삭제 포함)은 1.6.0 에서 Workgroup E2E 116/116 으로 확인함
- **주간보고 AI 초안(2026-11)**: Claude API, **Workgroup 만**(Standalone 은 키를 숨길 서버가 없어 지원 안 함). 서버 `workgroup/server/ai_draft.py` · 화면 `workgroup/webapp/static/js/modules/weekly/weekly-ai.js`. 기본 꺼짐(`[features] ai_draft`), 키는 서버 환경 변수 `ANTHROPIC_API_KEY`, 결과는 입력칸에 채우기만(저장 안 함), 감사 로그 'AI'. 시험은 가짜 anthropic 패키지로(`test_server_api.py` AiDraftApiTest)
- **다운로드 제한 · 감사 로그는 Workgroup 만**. 다운로드 제한은 멤버별(프로젝트별), 감사 로그 열람 Admin · PM, 보관 1년, 감사 로그 화면은 프로젝트 설정 > 감사 로그 (PM 이 Admin 메뉴를 못 보므로)
- **테스트 결함 현황(1.5.1 결정, B안)**: 기준일까지 통합테스트 단계로 접수된 VOC 가 있을 때만 보이고 건수도 기준일까지 (`Metrics.hasTestStage/defectStats(list, refDate)`)
- **기준선 "재설정" = 지우고 새로 시작** (`Baseline.clear`, [🗑️ 기준선 지우기]). 다시 확정(이력 남김)도 그대로 있음. Gantt 위쪽 줄에서 둘 다 가능
- **샘플 프로젝트 = 시험 기준 자료(1.5 부터)**: 화면 시험은 [🧪 샘플 프로젝트 추가] 로 만든 샘플로 한다. 새 기능을 만들면 ① `tools/build_sample.js` 에 그 경우를 넣고 ② `tools/tests/sample_coverage.js` 에 검사를 더하고 ③ `node tools/build_sample.js` → 단위 시험 · E2E 샘플 구간에 화면 확인을 더함. 샘플의 자료 오류는 원래 있던 휴일 날짜 3건뿐(가중치 합 · 날짜 역전은 넣지 않음) — 오류 화면은 E2E 가 따로 만든 작은 자료로 시험

## 구조 정리 — 화면을 고칠 때 그 화면만 (CLAUDE.md 1-2)
- **버전 마무리 절차 (2026-11 사용자 지적 후)**: 버전을 끝내기 전에 이번에 고친 화면 · 파일마다 1-2 항목을 확인한다 — ① 인라인 스타일 · 고정 색 → 클래스 ② 늘 있는 모듈의 `typeof` 확인 지우기 ③ 800줄 넘는 파일 나누기 ④ 자료형 검사 켜기(오류 0) ⑤ 계산은 엔진 + 단위 시험 ⑥ 저장 쪽 조용한 catch → 콘솔. 시작 전에 `css_safety_net.js --save`, 끝나고 `--check` (화면 그대로인지). 보고할 때 한 것 · 못 한 것을 함께 알림
- 1.6 에서 한 것: `neo.js` 기능별 분리 · 이름 변경(UiMode 삭제), WBS · Gantt · Dashboard · Phase 진척 · Summary 인라인 스타일 정리(501 → 437), WBS 표 · 상세 패널 · 기준선 · 날짜 도움 자료형 검사, 고친 파일의 `typeof` 정리
- 2~9번 항목(`typeof` 줄이기 · 열 정의 배열 · CSS 부채 · 덮어쓰기 줄이기 · 단위 시험 · 조용한 catch · 자료형 검사 · 800줄 넘는 파일 나누기 · 전역 이름)은 **해당 화면 수정 때 하나씩**
- 1번(Workgroup 덮어쓰기를 어댑터로)은 **사용자가 요청할 때만** (사용량 때문에 보류)
- 1.4 에서 한 것: 요구사항 · VOC 목록 열 정의 배열(`ListTable`), 대시보드 VOC 집계를 `Metrics` 로, Workgroup 덮어쓰기 2개(엑셀 열 이름 · Merge 목록) 공통으로 합침, ID 규칙 표 한 곳(`IdRules`)

## 다음 할 일 (로드맵)
- **1.5** (완료): 선행 Task 지연 경고 · WBS 상태 버튼 묶음 머리 · 샘플 프로젝트 보강(시험 기준) · 다운로드 제한 · 감사 로그(Workgroup, 서버 API 시험만 — Workgroup E2E 는 요청 때) · 체크인 아이콘 색
- **보류 — Workgroup 폴더 구조**: 회사 배포 플랫폼에서 서버 실행이 가능해지면 다시 검토 (지금은 `webapp/` 이 웹 루트, DB · 설정은 그 밖). 웹 루트를 맨 위로 바꾸면 `/conf` · `/upload` 차단 추가 필요
- **검토 — 서버를 Java 로**: 가능 (서버 약 3.7천 줄, 화면은 그대로, `test_server_api.py` 로 같은 동작 확인). 사용자가 정하면 진행
- **1.6 (완료)**: 화면 역할 정리 — Summary(경영진) · Dashboard(PM · PL 한눈에, 스크롤 1~2번) · Phase 진척(단계 상세). Dashboard 진척 카드 삭제(불릿 차트 유지 — 색 기준을 Summary 신호등과 같게, PM · Task 수는 말풍선), 필터 맨 위, 표 · 결함 차트는 Phase 진척으로. 계획: `docs/design/PLAN_v1.6.md`. Phase 진척 순서는 사용자 요청으로 [3] 개선과제 · [4] VOC · [5] 산출물
- **`!important` 정리 (1.6.2 에서 함)**: 정리 도구로 376 → 359. `@layer`(B안)는 실험해 보니 남은 것이 인라인 스타일 · 다른 `!important` 와 겨루는 것이라 효과 없음 — 앞으로는 화면을 고칠 때 인라인 스타일과 함께 줄임. 정리 도구는 화면에 안 나온 경우(오늘 날짜 칸 · 휴일 칸 등)를 놓칠 수 있으니 결과를 `--check` 로 꼭 확인
- **AI 연동 (2026-11 시작)**: 첫 번째로 주간보고 초안(간단판) 적용. 다른 제안(회의록 → Action Item 뽑기 · 위험 설명 · VOC 판정 제안 등)은 사용자가 고르면
- ~~멤버 투입 기간 · 철수 임박 알림~~ — **취소** (2026-11 사용자 결정: 필요 없음. 다시 제안하지 않음)
- **Enterprise**: Oracle · 세션 · 트랜잭션 · 인력 원가, 자료 저장 방식 재설계
- 외부 평가 의견(2026-11): 강점 = 입력이 적고 자동 계산 — 새 기능도 **선택 입력 · 자동 계산** 위주로

## 시험 · 배포 빠른 참조
- **작업이 끝나면 Standalone 배포 zip 을 만들어 보냄**: `python tools/make_release.py <폴더>` (pprjmgmt/ 폴더판만 — pprjmgmt 폴더도 배포 플랫폼에서 동작, 2026-11 결정). `--root`(index.html 이 zip 맨 위)는 요청할 때만
- `python tools/build_index.py` (partials → index.html) · `python tools/check_ui_debt.py` · `node tools/tests/unit/run_unit.js`
- Standalone: `node tools/tests/e2e/run_e2e.js` · 배포 `python tools/make_release.py <폴더>`
- Workgroup: `python tools/edition.py assemble workgroup <폴더>` → 그 폴더에서 `python tools/app_config.py`, `python tools/tests/test_server_api.py`, `node tools/tests/e2e/run_e2e.js`(~4분), `python tools/make_release.py <폴더>`
