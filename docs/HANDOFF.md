# 작업 인계 메모 (AI · 사람 공용)

새 대화 · 새 세션 · 다른 도구로 옮겨도 같은 기준으로 이어 가기 위한 메모. **규칙은 `CLAUDE.md`**, 여기는 그 밖의 결정 · 선호 · 진행 상황.
고칠 때마다 이 파일의 "지금 상태"와 "다음 할 일"을 같이 고친다.

## 지금 상태
- 버전 **1.5.0** (두 판 같은 번호) — 브랜치 `iostar-pm-standalone`
- 두 판: Standalone(정적 · IndexedDB) / Workgroup(Python 서버 + SQLite). 한 코드, 판 차이는 `tools/edition.py` 표시와 `workgroup/`
- 시험 기준: 단위 74(샘플 경우 27 포함) · Standalone E2E (샘플 프로젝트 구간 포함) · Workgroup E2E (조립 폴더에서) · 서버 API 36
- 설계 문서: `docs/design/DESIGN_v1.4.md`(적용), `docs/design/PLAN_v1.5.md`(적용)

## 사용자가 정한 것 (다시 묻지 않기)
- 답은 한국어, 커밋 메시지 · 도구 출력은 영어. PR 은 요청할 때만
- 사용량 절약: E2E 는 끝에 한 번, **작은 수정(문구 · 링크 하나)으로 Workgroup 전체 E2E 를 다시 돌리지 않음**
- **시험 방식(2026-11 결정)**: 기능 개선 때는 **Standalone 만 시험**. Workgroup 은 소스만 고치고(덮어쓰기 같은 이름 확인 포함), 사용자가 "Workgroup 버전 만들어 줘" 라고 할 때만 Workgroup 시험 · 배포본을 만든다. 저장 · 불러오기 · 잠금 코드를 고쳤으면 그 사실을 알려 줌
- 설명만 원하면 코드를 고치지 않음. 큰 디자인 변경은 전/후 캡처로 먼저 확인
- 브라우저 종료 시 임시 저장은 **필요 없음** (저장은 [저장] 버튼만)
- VOC **보류는 지연 판정에서 제외**
- 초기 관리자 두 판 모두 admin · admin2 (암호 1234, 처음 변경 필수). 완전 초기화 계정도 이 둘만
- 샘플 자료는 `static/js/core/sample-snapshot.js` 한 곳만. 두 판 모두 [🧪 샘플 프로젝트 추가] = 새 프로젝트로 추가
- Default 프로젝트는 삭제 불가 (멤버 · 화면 설정 보관 자리) — 표시 · 설명만
- 아키텍처 정의서는 나중에 새로 작성 (지금은 없음). Oracle 은 비활성 유지, Excel/Access 엔진은 삭제됨. 매뉴얼은 화면 안 창
- VOC 설계(1.4): 판정 5개(미판정 · 결함 · 개선 요청 · 설명 종결 · 이슈), 단계 4개(자동), 중복은 따로 두지 않음, **작은 개선은 VOC 안에서 처리 · 큰 것만 추가 요구사항(CR) 등록**(산출물 부담 때문), 요구 반영 건은 모수 포함 · 미결 제외, 테스트 결함 = 통합테스트만(안정화는 VOC 현황), 메뉴 "VOC · 결함"
- 목록 화면: 상태 버튼에 숫자가 있으므로 별도 상태 숫자 줄은 두지 않음
- **WBS 상태 버튼(2026-11 결정)**: 지연 등을 고르면 해당 Task + **레벨 보기에서 고른 레벨까지의 상위 Task 를 묶음 머리**로 함께 표시, 머리마다 "지연 n건"
- **선행 Task(1.5)**: 최대 3개, 경고만(일정 자동 밀기 · 크리티컬 패스 · Gantt 연결선 없음). 일정 겹침 = 선행 계획 종료 ≥ 이 Task 계획 시작. 순환(A→B→A)은 상세 패널에서 거부 (엑셀 업로드는 그대로 받음 — 경고만이라 계산이 돌지 않음)
- **Workgroup 아래 고정 줄([변경 취소] · [모두 저장]) 없앰(1.5)** — 위쪽 줄과 같은 기능
- **1.5 를 Workgroup 으로 배포하기 전에 Workgroup E2E 한 번 필요** (다운로드 제한 · 감사 로그 · 아래 줄 삭제는 Workgroup 화면). 요청하시면 조립 폴더에서 실행
- **다운로드 제한 · 감사 로그는 Workgroup 만**. 다운로드 제한은 멤버별(프로젝트별), 감사 로그 열람 Admin · PM, 보관 1년, 감사 로그 화면은 프로젝트 설정 > 감사 로그 (PM 이 Admin 메뉴를 못 보므로)
- **샘플 프로젝트 = 시험 기준 자료(1.5 부터)**: 화면 시험은 [🧪 샘플 프로젝트 추가] 로 만든 샘플로 한다. 새 기능을 만들면 ① `tools/build_sample.js` 에 그 경우를 넣고 ② `tools/tests/sample_coverage.js` 에 검사를 더하고 ③ `node tools/build_sample.js` → 단위 시험 · E2E 샘플 구간에 화면 확인을 더함. 샘플의 자료 오류는 원래 있던 휴일 날짜 3건뿐(가중치 합 · 날짜 역전은 넣지 않음) — 오류 화면은 E2E 가 따로 만든 작은 자료로 시험

## 구조 정리 — 화면을 고칠 때 그 화면만 (CLAUDE.md 1-2)
- 2~9번 항목(`typeof` 줄이기 · 열 정의 배열 · CSS 부채 · 덮어쓰기 줄이기 · 단위 시험 · 조용한 catch · 자료형 검사 · 800줄 넘는 파일 나누기 · 전역 이름)은 **해당 화면 수정 때 하나씩**
- 1번(Workgroup 덮어쓰기를 어댑터로)은 **사용자가 요청할 때만** (사용량 때문에 보류)
- 1.4 에서 한 것: 요구사항 · VOC 목록 열 정의 배열(`ListTable`), 대시보드 VOC 집계를 `Metrics` 로, Workgroup 덮어쓰기 2개(엑셀 열 이름 · Merge 목록) 공통으로 합침, ID 규칙 표 한 곳(`IdRules`)

## 다음 할 일 (로드맵)
- **1.5** (완료): 선행 Task 지연 경고 · WBS 상태 버튼 묶음 머리 · 샘플 프로젝트 보강(시험 기준) · 다운로드 제한 · 감사 로그(Workgroup, 서버 API 시험만 — Workgroup E2E 는 요청 때) · 체크인 아이콘 색
- **보류 — Workgroup 폴더 구조**: 회사 배포 플랫폼에서 서버 실행이 가능해지면 다시 검토 (지금은 `webapp/` 이 웹 루트, DB · 설정은 그 밖). 웹 루트를 맨 위로 바꾸면 `/conf` · `/upload` 차단 추가 필요
- **검토 — 서버를 Java 로**: 가능 (서버 약 3.7천 줄, 화면은 그대로, `test_server_api.py` 로 같은 동작 확인). 사용자가 정하면 진행
- **1.6**: 멤버 투입 기간 · 철수 임박 알림 (M/M 집계는 Enterprise)
- **Enterprise**: Oracle · 세션 · 트랜잭션 · 인력 원가, 자료 저장 방식 재설계
- 외부 평가 의견(2026-11): 강점 = 입력이 적고 자동 계산 — 새 기능도 **선택 입력 · 자동 계산** 위주로

## 시험 · 배포 빠른 참조
- **작업이 끝나면 Standalone 배포 zip 을 만들어 보냄**: `python tools/make_release.py <폴더>` (pprjmgmt/ 폴더판) 와 `--root` (index.html 이 zip 맨 위 — 회사 배포 플랫폼은 루트의 index 로 염, 2026-11 결정). 화면은 상대 경로라 어느 주소에서도 동작
- `python tools/build_index.py` (partials → index.html) · `python tools/check_ui_debt.py` · `node tools/tests/unit/run_unit.js`
- Standalone: `node tools/tests/e2e/run_e2e.js` · 배포 `python tools/make_release.py <폴더>`
- Workgroup: `python tools/edition.py assemble workgroup <폴더>` → 그 폴더에서 `python tools/app_config.py`, `python tools/tests/test_server_api.py`, `node tools/tests/e2e/run_e2e.js`(~20분), `python tools/make_release.py <폴더>`
