# PM Hub (IOSTAR-PM) 자료 정의

프로젝트 하나의 자료는 아래 열두 묶음(`DataRegistry.DEFS`, `core/data-store.js`)으로 저장된다.
자료 모양 번호는 `projectConfig.schemaVersion` (지금 **2**, `core/migrate.js` 의 `Migrate.VERSION`).

**자료 모양을 바꿀 때 규칙**
1. 이 문서의 표를 먼저 고친다.
2. 예전 자료를 새 모양으로 바꾸는 단계를 `core/migrate.js` 에 추가하고 `Migrate.VERSION` 을 1 올린다.
3. 더 쓰지 않는 필드 · 함수 · 화면 문구는 같은 커밋에서 지운다.

## 1. 묶음 목록

| 키 | 내용 | 나눠 저장하는 기준 | 범위 |
|---|---|---|---|
| `projectConfig` | 프로젝트 설정 (아래 2장) | 없음 | 프로젝트 |
| `subsystemsMeta` | 서브시스템 목록 | 없음 | 프로젝트 |
| `standardDeliverablesMeta` | 단계별 표준 산출물 | 없음 | 프로젝트 |
| `projectUsers` | 멤버 | `empNo` | 프로젝트 |
| `wbsData` | WBS Task | `system` | 서브시스템 |
| `deliverablesData` | 산출물 | `system` | 서브시스템 |
| `reqMasterData` | 요구사항 | `system` | 서브시스템 |
| `vocData` | VOC · 버그 · 이슈 | `system` | 서브시스템 |
| `noticesData` | 공지 | `id` | 프로젝트 공유 |
| `communicationsData` | 게시판 글 | `id` | 프로젝트 공유 |
| `meetingsData` | 회의 · 회의록 · Action Item | `id` | 프로젝트 공유 |
| `weeklyReportsData` | 주간보고 | `id` | 주간보고 |
| `todosData` | 내 할 일 (본인만) | `id` | 개인 |
| `theme` | 화면 테마 | 없음 | 개인 설정 |
| `processTypes` | SDLC · 개선과제 유형 라이브러리 (Admin) | 없음 | 시스템 공통 |

## 2. projectConfig

| 필드 | 뜻 |
|---|---|
| `systemTitle` · `projectName` · `fileCode` | 시스템 타이틀 · 프로젝트 이름 · 파일 이름에 쓰는 약칭 |
| `projectStartDate` · `projectEndDate` | 프로젝트 기간 (YYYY-MM-DD) |
| `reportDate` · `weekStartDay` | 기준일 · 한 주의 시작 요일 (0=일 … 5=금) |
| `weekNumbering` | 주차 표시 `{ basis: ANNUAL·PROJECT, multiYear: PREFIX·CONTINUE, format }` |
| `progressBasis` | 계획 진척률 산정 `CALENDAR` · `BUSINESS` |
| `delayGap` · `dueDays` | 지연 판정 차이(%p) · 마감 임박 일수 |
| `holidays` | 공휴일 · 비작업일 목록 |
| `domains` | 도메인 이름 목록 (최대 5) |
| `maxDeliverableRounds` | 산출물 제출 차수 (1~4) |
| `customSdlcTypes` | 이 프로젝트의 SDLC 유형 사본 (단계 가중치 · 계획 일정 포함). 기본 정의는 `WBSEngine.DEFAULT_SDLC_PRESETS` |
| `activeSdlcCodes` | 서브시스템들이 쓰는 SDLC 유형 코드 (자동으로 맞춤, 최대 4개). 미리 고르지 않음 |
| `activeReqPreset` · `reqSdlcPhases` | 적용한 개선과제 유형 코드 · 그 단계(가중치 · 계획 일정) |
| `reqTypeCopies` | 적용하지 않은 개선과제 유형별 가중치 · 계획 일정 `{ 코드: phases }` |
| `customReqPresets` | 예전 사용자 정의 개선과제 유형 (읽기만) |
| `idPrefixConfig` | WBS · REQ · VOC · Action Item ID 접두사 |
| `milestones` | 마일스톤 `{ scope: ALL·서브시스템, name, date, desc }` |
| `channels` | 게시판 채널 |
| `exportSettings` | 보고서 설정 (색 · 글꼴 · 종합보고서 구성) |
| `roleHomeSettings` | 역할별 첫 화면 |
| `layoutType` · `uiDensity` · `uiTheme` | 화면 설정 (메뉴 위치 · 밀도 · 테마) |
| `packageStamp` · `packageBy` | 마스터 파일 버전 · 만든 사람 |
| `weightModel` | WBS 가중치 방식 표시 (예전 자료 변환용) |
| `schemaVersion` | 자료 모양 번호 |

## 3. 목록 자료의 필드

| 묶음 | 필드 |
|---|---|
| `subsystemsMeta` | `domain` `code`(ID 접두) `name` `type`(SDLC·REQ) `sdlcCode` `weight`(서브시스템 가중치) `pm` `desc` |
| `standardDeliverablesMeta` | `phase` `name` `round1~4`(차수별 필수) `defaultDate` `remarks` |
| `projectUsers` | `empNo` `name` `role`(SYS_ADMIN·PM·LEAD·MEMBER) `subsystem` `dept` `pwdHash` `pwdTemp`(처음 암호 — 바꿔야 함) `lang` |
| `wbsData` | `id` `level`(1~5) `system` `name` `weight` `reqId` `pStart` `pEnd` `aStart` `aEnd` `pProg` `aProg` `owner` `output` `isLeaf` `status` — `pProg` · `status` 는 계산값 |
| `deliverablesData` | `id` `round`(N차) `system` `phase` `name` `pDate` `aDate` `status`(작성전·작성중·검토요청·보완완료) `manager` `remarks` |
| `reqMasterData` | `id` `system` `name` `type` `priority` `accept` `status`(대기·진행·완료·보류·삭제) |
| `vocData` | `id` `vocType`(VOC·버그·이슈) `system` `priority` `title` `requester` `reqDate` `targetDate` `status` `action` |
| `noticesData` | `id` `title` `content` `author` `authorEmpNo` `date` `priority`(긴급·중요·일반) `isPinned` `viewCount` |
| `communicationsData` | `id` `title` `channel` `taskId` `author` `authorEmpNo` `role` `content` `date` `replies` `status`(OPEN·PROGRESS·RESOLVED) |
| `meetingsData` | `id` `system` `title` `date` `startTime` `endTime` `location` `host` `status` `notes` `summary` `attendees[]` `agendas[]` `actionItems[]` `updatedAt` |
| `weeklyReportsData` | `id` `scope`(ALL·DOMAIN·SYS) `scopeValue` `status`(DRAFT·DONE) `year` `weekNo` `weekLabel` `startDate` `endDate` `nextStartDate` `nextEndDate` `reportDate` `author` `authorEmpNo` `currentWeekSummary` `nextWeekSummary` `issuesNotes` `currentWeekTasks[]` `nextWeekTasks[]` `updatedAt` `updatedBy` `revision` `snapshot`(작성 완료 시점 자료) |

## 4. 예전 자료 변환 목록

모두 `core/migrate.js` 에 있거나, 그 파일 머리말에 위치가 적혀 있다.

| 변환 | 위치 |
|---|---|
| 상태 '착수전' → '대기', 산출물 'N회차' → 'N차' | `Migrate.DATA_STEPS` terms |
| WBS 가중치 방식 (서브시스템 안 형제 합계 100) | `Migrate.PROJECT_STEPS` weight-model → `WbsWeight.migrateIfNeeded` |
| SDLC 사용 유형 = 서브시스템들이 쓰는 유형 | `Migrate.PROJECT_STEPS` sdlc-used-types → `SdlcBoard.syncActive` |
| 테마 예전 값 | `common/tabs-theme.js` THEME_ALIASES |
| 메뉴 위치 · 첫 화면 예전 값 | `common/layout.js`, `modules/home/home.js` |
| 엑셀 · 워드 색 예전 이름, 엑셀 시트 · 열 예전 이름 | `modules/dataio/excel-sync.js` |
| 참여 정보 없는 예전 멤버 행 | `core/data-store.js` ProjectContext.migrateLocalUsers |
