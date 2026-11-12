# IOSTAR-PM Enterprise 전환 메모 (Workgroup → Enterprise)

> 이 문서는 배포 패키지에 함께 들어갑니다 (`docs/ENTERPRISE_ROADMAP.md`).
> Workgroup 판을 만들면서 **일부러 미뤄 둔 것**, **꺼 두기만 한 것**, **Enterprise 로 갈 때 바꿀 자리**를 잊지 않도록 정리한 것입니다.
> 기준 버전: IOSTAR-PM Workgroup 0.1.0 (IOSTAR-PM v4.1.0 에서 분기). 최종 확정 전까지 Workgroup 은 0.x 로 올립니다.

---

## 1. 판 구분

| 구분 | Workgroup (지금) | Enterprise (예정, 유료) |
|---|---|---|
| 대상 | 폐쇄망, 약 100명, 부서 · 프로젝트 팀 | 전사 · 대규모, 여러 조직 |
| 저장소 | SQLite (DB 서버 방식) / 브라우저 로컬 저장소 | Oracle (그 밖 RDBMS 선택) |
| 인증 | 사번 + 비밀번호 (PBKDF2), 프로젝트별 역할 | SSO (SAML 2.0 / OIDC / 국내 SSO 솔루션), 사내 인사 연동 |
| 문서 보안 | 첨부파일 형식 · 크기 검사, 휴지통 | DRM (내려받기 때 암호화 · 열람 통제), 워터마크 |
| DB 보안 | 파일 권한, 백업 zip | 민감 항목 암호화, DB 접근 통제 · 감사 |
| 실시간 | 없음 (사용자가 무언가를 할 때만 서버와 통신) | 실시간 알림 · 채팅 (푸시 방식) |
| 동시 작업 | 서브시스템 체크아웃 · 체크인 (이 문서 3장) | 같은 방식 + 행 단위 잠금 · 알림 |

설정 위치: `conf/app.ini` 의 `[app] edition` (`WORKGROUP` / `ENTERPRISE`), `[features]`, `[lock]`.

---

## 2. Workgroup 에서 꺼 둔 기능 (코드는 그대로, 설정으로 켬)

| 기능 | 설정 (`conf/app.ini [features]`) | 끈 이유 | Enterprise 에서 할 일 |
|---|---|---|---|
| 실시간 채팅 | `chat=0` | 2.5초마다 서버에 물어봄 (주기 통신) | 푸시(WebSocket / SSE) 방식으로 바꾼 뒤 켬. 채팅 화면은 지금 "사용 안 함"으로 잠겨 있음 (로컬 저장소 방식과 같은 표시) |
| 서버 연결 감시 | `server_heartbeat=0` | 20초마다 `/api/db/ping` | 지금은 저장 · 불러오기 요청이 실패할 때 "연결 끊김" 배너를 띄움. Enterprise 는 푸시 연결 상태로 대신 |
| Oracle DB 선택 | `db_oracle=0` | 이 판의 서버는 SQLite 만 씀 | `server/repo/oracle` 구현 뒤 켬 (4장) |
| Excel/Access DB 선택 | `db_excel_access=0` | 동작하지 않는 예전 선택지 | 쓰지 않음 (없애도 됨) |
| 로컬 파일 직접 동기화 | `local_file_sync=0` | 브라우저 제약 · 예전 기능 | 쓰지 않음 |
| 메뉴 배지 2초 갱신 | (설정 없음) | 불필요한 반복 | 자료가 바뀔 때만 갱신하도록 바꿈 (유지) |

화면에서 기능 여부는 `Features.on("chat")` 하나로 판단합니다 (`webapp/static/js/core/features.js`).
서버는 `server/settings.py` 의 `app_features()` 로 같은 값을 읽습니다.

**원칙 (Workgroup)**: 화면이 일정 시간마다 서버에 묻는 기능을 넣지 않습니다. 새 기능을 넣을 때도 지킵니다.
확인 방법: E2E 시험 `Workgroup: no periodic server calls while idle (25 s)`.

---

## 3. 서브시스템 체크아웃 · 체크인 (Workgroup 0.1 에서 구현)

### 3.1 규칙
- **체크아웃** = 편집 시작(잠금) · **체크인** = 저장하고 잠금 해제 · **체크아웃 취소** = 변경 버리고 해제 · **강제 해제** = PM · 시스템관리자, 사유 필수.
- 잠금 단위: 서브시스템의 WBS · 요구사항 · 산출물 · VOC (`SUB:<서브시스템>`).
  기준정보(`PROJECT`)는 다른 사람이 잡고 있을 때만 막습니다 (Workgroup 은 기준정보 체크아웃 화면이 없음 — 시스템관리자 · PM 만 고치므로).
- 주간보고 · 회의록 · 공지 · 소통 · 할 일: 잠금 없음 (문서별 동시수정 검사).
- `lock_mode=required`: 서브시스템 자료는 내가 체크아웃해야 저장. `advisory`: 남이 잡은 것만 막음. `off`: 사용 안 함.
- `lock_hours=4`: 유효 시간. 그 사람이 저장 · 불러오기 · 잠금 조회를 할 때마다 다시 4시간 연장.
  **주기 신호 없음** — 만료는 누군가 요청할 때 서버가 계산(lazy)하고, 기록에 "만료 해제"로 남깁니다.
- 저장이 막히면 서버가 `423 Locked` 와 함께 누가 · 언제부터 잡고 있는지 알려 주고 **아무것도 저장하지 않습니다** (원자적).
- 막힌 사람의 선택: ⏸ 보류(브라우저 localStorage 에 보관, 새로고침해도 남음, 잠기지 않은 변경만 저장) / 💾 내 변경 백업(JSON) / 🗑 버리고 최신 받기.
- 다시 체크아웃할 때 그 사이 다른 사람이 바꿨으면 **3자 비교** (받았던 때 · 다른 사람 결과 · 내 것): 나만 바꾼 행은 내 것, 남만 바꾼 행은 남의 것, 둘 다 바꾼 행은 고름.
- 관리자 복원 · 초기화 · 프로젝트 파일 덮어쓰기는 `lockBypass` (시스템관리자는 모든 잠금 무시, PM 은 "체크아웃 필요"만 무시)로 저장하고, 끝나면 그 프로젝트 잠금을 모두 풂.
- 시스템 전체 복원 뒤에는 모든 잠금을 풉니다 (복원 시점의 잠금이 남지 않게).
- 로컬 저장소 방식: 실시간 잠금 없음. 스마트 병합 올리기 미리 보기에서 담당 서브시스템만 반영(기존 권한)으로 대신.

### 3.2 구현 위치
| 위치 | 내용 |
|---|---|
| `server/locks.py` | 표 `TB_LOCK`(현재 잠금) · `TB_LOCK_LOG`(기록), API `/api/locks/list · checkout · checkin · cancel · force-release`, 저장 검사 `save_guard()` |
| `server/store.py` `Store.save(guard=)` | 저장 전에 잠금 검사, 막히면 아무것도 쓰지 않음 |
| `server/handler.py` | 불러오기 · 저장 응답에 잠금 현황(`locks`)을 함께 실어 보냄 → 화면은 따로 조회하지 않아도 앎 |
| `webapp/static/js/core/lock-manager.js` | 화면: 업무 화면 잠금 줄, 머리글 배지, 🔐 체크아웃 현황(스마트 병합 서브 탭), 보류, 3자 비교, 강제 해제 |
| `webapp/static/js/core/data-store.js` | 423 처리 → `LockManager.onBlocked()`, 체크인할 서브시스템만 저장(`onlyParts`) |
| `webapp/static/js/modules/dataio/merge-table.js` | 올리기 미리 보기: 남이 잡은 서브시스템 제외, 반영할 서브시스템 자동 체크아웃 |

### 3.3 Workgroup 에서 하지 않은 것 (Enterprise 후보)
- [ ] **해제 알림 (푸시)**: 지금은 다음에 화면을 열거나 [🔄 상태 확인] · 저장할 때 알게 됨.
- [ ] **행(Task) 단위 잠금**: 지금은 서브시스템 단위. 큰 서브시스템은 L2 단위 잠금 검토.
- [ ] **같은 사람이 두 PC 에서 편집**: 지금은 사번 기준 잠금이라 두 PC 모두 저장 가능 (리비전 충돌 검사로만 보호). 세션(PC) 단위 잠금 검토.
- [ ] **기준정보(PROJECT) 체크아웃 화면**: 서버 규칙은 있음(남이 잡으면 막음), 화면 단추는 없음.
- [ ] **잠금 기록 보관 · 감사 보고서**: `TB_LOCK_LOG` 를 기간별 조회 · 내보내기.
- [ ] **유휴 경고**: 화면을 연 채 오래 손대지 않을 때 안내 (주기 타이머가 필요해 Workgroup 에서는 뺌).
- [ ] **보류 변경을 서버에 임시 저장**: 지금은 그 PC 브라우저에만 있음.

---

## 4. 확장하기 좋게 해 둔 자리 · 할 일

### 4.1 저장소 (SQLite → Oracle)
- 지금 SQL 이 있는 곳: `server/store.py`(자료 · 사용자 · 프로젝트 · 미러 표), `server/locks.py`, `server/project_reset.py`, `server/backup.py`(SQLite 백업 API 사용), `server/snapshots.py`(파일).
- [ ] `server/repo/` 저장소 인터페이스로 묶기: `load / save(guard) / users / projects / locks / chat / meta`.
- [ ] `sqlite_repo` (지금 코드 이동) + `oracle_repo` (python-oracledb, thin 모드 — 폐쇄망 설치 패키지 준비).
- [ ] 시스템 백업 · 복원: Oracle 은 DB 덤프 대신 Data Pump 또는 자료 단위 JSON 백업으로.
- [ ] 동시성: SQLite `DB_LOCK`(프로세스 잠금) → DB 트랜잭션 · 행 잠금 (`SELECT … FOR UPDATE`).
- [ ] 미러 표(`TB_WBS_TASK` 등)를 정식 표로 승격하고 JSON 자료셋(`TB_WBS_DATASET`)은 이전 호환용으로.

### 4.2 인증 (사번/비밀번호 → SSO)
- 지금: `server/security.py`(비밀번호), `server/session.py`(토큰), `/api/auth/*`.
- [ ] `server/auth/` 인증 제공자 인터페이스: `local` (지금) / `sso` (SAML 2.0 · OIDC · 국내 SSO 에이전트 헤더).
- [ ] 로그인 화면: SSO 사용 시 비밀번호 입력 숨김, [SSO 로그인] 단추.
- [ ] 사용자 · 부서 동기화 (인사 DB / LDAP) — 프로젝트별 역할(`projectRoles`)은 그대로 이 프로그램에서 관리.
- [ ] `self_password_reset` 은 Enterprise 에서 항상 0.

### 4.3 문서 보안 (DRM)
- 지금: `server/files.py` / `server/file_api.py` — 형식 · 크기 · 내용 검사, 휴지통, 버전.
- [ ] 올리기 · 내려받기 사이 **보안 처리 단계(hook)**: 올릴 때 복호화/검사, 내려받을 때 DRM 포장 · 워터마크(사번 · 시각).
- [ ] 화면이 만드는 엑셀 · 워드 · PPT (브라우저에서 생성) 는 DRM 대상이 아님 → Enterprise 는 서버에서 만들어 내려주거나 내보내기 권한을 역할로 제한.

### 4.4 DB 보안 · 감사
- [ ] 민감 항목(이름 · 연락처 등) 암호화 컬럼, 키 관리.
- [ ] 감사 기록 통합: 로그인 · 권한 변경 · 내려받기 · 잠금(`TB_LOCK_LOG`) · 초기화 · 복원.
- [ ] 개인정보 보존 기간 · 파기.

### 4.5 실시간
- [ ] 푸시 채널 (WebSocket 또는 SSE) 한 개로: 잠금 해제 알림, 저장 알림(다른 사람이 저장함), 채팅, 연결 상태.
- [ ] 그 뒤 `chat=1`, `server_heartbeat` 는 쓰지 않음(푸시 연결이 대신).

---

## 5. 버전 규칙
- Workgroup: 확정 전까지 `0.x.y` (기능 묶음마다 x, 고침은 y). 첫 확정판 = `1.0.0`.
- 버전 값은 `conf/app.ini [app] version` 한 곳 (화면 · 서버 · 배포 파일 이름이 함께 씀).

## 6. Workgroup 변경 기록
- **0.1.0**
  - 서브시스템 체크아웃 · 체크인 (required, 4시간)
  - 주기 통신 제거 (채팅 · 서버 연결 감시 끔, 메뉴 배지 이벤트 갱신)
  - 기능 켜고 끄기 `[features]`
  - 주차 표시 방식 (연간 / 프로젝트 주차, 연도 붙이기 / 이어서, 엑셀식 형식)
  - 이 문서 추가
