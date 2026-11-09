================================================================================
⚡ AX Project Management by YS ver1.0.6 (Multi-User · RBAC · i18n Release)
   - 프로그램 공식 명칭: AX_Project_Management_by YS (약칭: AX_PMYS)
   - 최신 버전: ver1.0.6
================================================================================

■ [빠른 시작]
  1) 압축 해제 후 index.html (또는 Standalone.html) 더블클릭 → 로컬 저장소(LocalStorage) 모드로 실행
     - 최초 실행 시 data/initial_data.json 초기 데이터가 브라우저 로컬 저장소에 설정됨
     - 로그인: 기본 관리자 admin / 1234 (로그인 화면에서 [👤 신규 사용자 등록] 가능, 기본 권한: 일반 사용자)
     - 로그인 화면에서 언어(한국어 / English) 선택
  2) 다중 사용자 공유: run_server.bat 실행 → http://<서버IP>:8080 접속
     → admin 로그인 후 [⚙️ 시스템 설정 > DB 연동]에서 [🪶 SQLite 파일 DB] 선택 → 화면 재로드 후 서버 로그인
     - 서버는 로그인 토큰 인증 필수 (기존 v1.0.5 DB는 최초 기동 시 자동 이관)

■ [ver1.0.6 개선 내역]
1. 다중 사용자 저장/동기화
   - DB 서버 모드: 실시간 자동저장 해제 → 모든 화면에 [💾 저장] [🔄 새로고침] 툴바, 상단 [💾 전체 저장] [🔄 전체 새로고침]
   - 저장 시 다른 사용자가 먼저 저장한 데이터가 있으면 경고 → [⚠️ 덮어쓰기] / [↩️ 무시하기(충돌 항목은 최신본 적용, 나머지 내 변경만 저장)] / [취소]
     (충돌 판정 단위: WBS·REQ·VOC·산출물 = 서브시스템 단위, 공지·소통·회의·주간보고 = 건 단위)
   - 로컬 저장소 모드에서만 실시간 자동저장
   - 탭을 이동해도 저장하지 않은 변경 데이터는 유지 (DB 서버 모드에서 미저장 상태로 창을 닫으면 경고)
2. 회의관리 / 주간보고 / 로그인
   - 회의록·주간보고는 [✅ 작성 완료 (저장)] 클릭 시 저장
   - 저장하지 않고 다른 회의록·주간보고(주차/단위)를 선택하면 [저장 / 무시 / 계속 작성] 확인
   - 주간보고 [🗂️ 저장된 주간보고 목록] 제공 (클릭 시 열기)
   - 작성 단위: 일반 사용자 = 담당 서브시스템, PM·관리자·총괄리더 = 통합(전체) / 생성 단위: 통합 · 분야별 · 서브시스템별
     (통합·분야별 보고서는 같은 주차의 서브시스템 보고서 상세 내용을 자동 취합)
   - 로그인 화면 신규 사용자 등록 (기본 권한 MEMBER)
3. 계획 진척률 산정 기준: [기준정보 > c. 휴일정보]에서 달력 일수 / 영업일(주말·공휴일 제외) 선택 → [✅ 적용] 시 재계산
4. 권한
   - 일반 사용자: 다른 서브시스템 데이터를 화면에서 고쳐도 저장 시 본인 담당 서브시스템 데이터만 저장 (나머지는 원복 + 안내)
   - 총괄리더(LEAD) 권한 신설: 전체 서브시스템 업무 데이터 수정·저장 가능 (기준정보·시스템설정 제외)
   - 서버에서도 동일 규칙으로 재검증 (권한 없는 저장 요청은 거부)
5. 연결된 JSON 파일 자동 저장 시 공지·소통·회의·주간보고 등 채팅 이외 모든 데이터 저장 (회의·주간보고가 로컬 저장소에 저장되지 않던 문제도 수정)
6. DB 서버 인증: /api/auth/login 토큰 발급, 모든 데이터/채팅 API 인증 필수, 비밀번호 해시 비노출
7. 로컬 저장소 모드에서는 채팅 '오프라인' 표시 및 비활성화
8. 기준정보 서브탭: a. 프로젝트 기본정보 / b. 공정단계정보 / c. 휴일정보 / d. 사용자 정보 (사용자 탭 이동)
9. 다국어: 영어 UI 제공 (메뉴·타이틀은 표준 약어: Dash, Phase Prog., REQ, Deliv., Wkly Rpt, Mtg, Sys Cfg 등)
   - 사용자별 언어: 로그인 시 선택, [기준정보 > d. 사용자 정보]에서 사용자별/일괄 설정
   - 사용자가 입력한 작업 데이터는 번역하지 않음
10. 코드 정리
   - app.js·access-control.js 의 함수 재정의(monkey-patch) 20여 건을 원래 정의로 통합 (권한 버그 원인이던 switchTab/activateTab/canAccessTab 중복 제거)
   - 인증/권한(AuthManager)은 js/access-control.js 한 곳, 저장/동기화는 js/data-store.js 한 곳으로 일원화
   - 중복 함수(addNewSubsystemMeta, _escapeXml 등), 서버 중복 로그 함수·채팅 테이블 생성 코드, 미사용 대시보드 엑셀(구버전)·PPT 코드 삭제
   - app.js 에 하드코딩된 샘플 데이터 중복(약 4,000줄) 제거 → data/initial_data.json 단일 원본 사용
11. Sample 폴더 엑셀 파일명 한글 깨짐 수정 (UTF-8 파일명으로 복구, tools/make_release.py 로 UTF-8 플래그 zip 생성)

■ [ver1.0.5 버그 수정 내역]
1. 주간보고 DOCX 다운로드 불가 수정
   - 원인: DOCX 내부 XML이 Word 스키마 위반(<w:line> 비표준 요소, pPr/rPr 자식 순서 오류, 공백 미보존)으로 Word에서 열리지 않음
   - 조치: DOCX 생성 시 OpenXML 스키마 정규화 엔진(_normalizeWordXml) 적용, 파일명 공백 치환 정규식 오류 수정
   - 추가: 회의록 DOCX 다운로드 시 발생하던 ReferenceError(tableBorder 미정의) 수정
2. Standalone.html(단일 파일 실행본) 복구
   - build_standalone.bat (또는 python tools/build_standalone.py)로 index.html + css + js 를 1개 파일로 재생성
3. 홈/대시보드/단계별 진척 [🔄 실적 새로고침] 기능 복구
   - 최신 저장 데이터(DB 서버 → 연결된 JSON 파일 → 로컬 저장소) 재로드 후 계획·실적 진척률 재계산 및 전 화면 재렌더링
   - 미저장 변경분이 있으면 재로드하지 않고 현재 데이터 기준으로 재계산 (입력값 보호)
4. 대시보드 PPT 보고서 기능 일시 비활성화 (ReportExporter.PPTX_ENABLED = false)
5. 대시보드 엑셀 보고서 → 주간보고 탭 [전체 통합 엑셀]과 동일 기능으로 대체 (대제목 셀 병합으로 짤림 해소)
6. 단계별 진척 새로고침 시 진척 미반영 수정
   - 원인: DB 서버의 저장/조회 API가 NameError(payload)로 항상 500 오류 → 브라우저별 임시 저장소로 우회되어 타 사용자 실적이 반영되지 않음
   - 조치: wbs_db_server.py 저장 로직 정상화, 공지/소통 데이터 저장 복구, 사용자 목록(projectUsers) DB 저장 누락 수정
7. 사용자 권한별 탭 접근 제어 수정 (js/access-control.js 신규)
   - 원인: app.js 하단의 switchTab 재정의로 권한 검사가 무력화됨
   - 조치: 탭 접근 정책 단일화(시스템설정=SYS_ADMIN, 기준정보/사용자=SYS_ADMIN·PM), 권한 없는 탭 🔒 표시,
           어떤 경로로 호출되어도 권한 검사, 계정 전환 시 저장 → 권한 재검사 → 홈 화면으로 리로드
8. 초기 설정을 로컬 저장소(LocalStorage)로 변경 + 초기 JSON(data/initial_data.json) 제공
   - file:// 환경에서도 동작하도록 js/initial-data.js 에 동일 데이터 내장 (JSON 수정 후 python tools/build_initial_data.py)

■ [ver1.0.4 공식 운영 오픈 핵심 개선 내역]

1. 주간보고 회의 일정 레이아웃 및 DOCX 보고서 중복 정리
   - [UI 개선] 주간보고 탭의 [금주 회의 실적]과 [차주 회의 계획]을 위아래(Vertical Column)로 배치하여 차주 회의 일정과 상정 안건의 시인성을 대폭 강화
   - [DOCX 중복 제거] 주간보고 DOCX 출력물 목차에서 내용이 중복되던 "6. 금주 및 차주 프로젝트 주요 회의 일정 (Meeting Schedules)" 섹션을 완전히 삭제하고, "6. 주간 회의 진행 실적 및 차주 회의 계획 (회의록·Action Item 연동)"로 정돈 일원화

2. 소통 패드 및 시스템 설정 스타일 설정 일원화
   - [위치 정상화] 소통 패드(공지/소통 탭)에 중복 표시되던 '엑셀/DOCX 스타일 및 폰트 설정 카드' 2건을 완전히 제거
   - [시스템 설정 이동] 시스템 설정(⚙️ 설정) 탭의 노후 분리 설정 카드를 삭제하고, 단일 통합 '엑셀(XLSX) · 워드(DOCX) 공통 보고서 스타일 및 폰트 설정 카드'로 교체

3. 홈 화면(하이브리드 스마트 포털 / 이그제큐티브 브리핑 룸) 위젯 연동 및 네비게이션 고도화
   - [하이브리드 스마트 포털] 공지사항 및 실시간 소통 피드 데이터(noticesData, communicationsData)가 100% 정상 로드되도록 연동 복구
   - [원클릭 탭 이동] 공지사항 클릭 시 [공지사항 서브탭]으로, 소통 피드 클릭 시 [소통 피드 서브탭]으로 즉시 자동 이동
   - [스마트 워크벤치 위젯] 3대 업무 요약 카드(요구사항, 산출물, VOC) 및 미완료 Task 클릭 시 해당 관리 탭으로 즉시 네비게이션
   - [이그제큐티브 브리핑 룸] 전사 달성률 히어로 배너 및 5대 핵심 경영 KPI 스트립(WBS, 지연, REQ, 산출물/VOC) 클릭 시 WBS 및 각 관리 탭으로 즉시 전환

4. 시스템 명칭 및 버전 정보 전사 표준 일원화
   - 상단 메뉴탑(Header), 오프라인 매뉴얼(manual.html), 소프트웨어 아키텍처 정의서(architecture.html), 배치 프로그램(run_server.bat), 파이썬 DB 서버(wbs_db_server.py), README.txt 모두 동일하게 [AX_Project_Management_by YS ver1.0.4]으로 통일

5. 엑셀 / DOCX 통합 스타일 엔진 및 파스텔 소프트 테마군 추가
   - [단일 스타일 일원화] 엑셀과 DOCX 보고서의 스타일 선택을 완전히 하나로 통합하여 설정 변경 시 엑셀과 워드에 즉시 동일 반영
   - [전체 테이블 스타일 100% 적용] Word(DOCX) 주간보고서 및 회의록에서 첫 번째 테이블뿐만 아니라 세부 추진실적, 차주 계획, 회의록, Action Item 등 모든 테이블에 테마 색상(헤더 배경, 텍스트 색상, 테두리, 서체, 폰트 크기)이 완전하게 반영되도록 엔진 개선
   - [신규 감성 파스텔 테마 추가] 기존 공식 엔터프라이즈 테마에 더해 은은하고 부드러운 7대 감성 파스텔 테마(Pastel Sky Blue, Pastel Mint, Pastel Lavender, Pastel Warm Peach, Pastel Rose Pink, Pastel Soft Lemon, Pastel Sage Gray) 신규 탑재

6. 소통 피드 칸반보드(Kanban Board) 카드 제목 노출 및 전용 안건 제목 입력 지원
   - [제목 노출] 칸반보드 및 피드 뷰에서 각 소통 카드의 핵심 안건 제목(Title)이 상단에 굵고 선명하게 노출되도록 개선
   - [안건 입력] 소통 피드 작성 창에 WBS 연계 Task ID와 함께 안건 제목 입력란(commPostTitleInput)을 신설하여 체계적인 토론 안건 카드 생성 지원

7. 상단 헤더 긴급공지 바로가기 카운트 정확도 개선
   - [필터 정상화] 상단 헤더 긴급공지 배지(headerNoticeCountBadge)가 상단 고정(isPinned) 여부와 혼동되지 않고, 실제 긴급(priority === '긴급') 공지만 정확히 선별 카운트하도록 필터 로직 정비 (현재 긴급 1건 정상 노출)

8. 회의관리 캘린더 전면 테마(Color Theme) 완벽 연동
   - [캘린더 테마 반영] 회의관리 캘린더 컨테이너, 네비게이션 바, 요일 헤더, 일자 셀, 당일(Today) 강조 링 등에 CSS 테마 변수(var(--primary), var(--bg-card), var(--lvl-1-bg) 등)를 전면 적용
   - [실시간 리렌더링] 상단 헤더 또는 설정 탭에서 시스템 컬러 테마 변경 시 회의 캘린더가 즉시 새로운 테마 컬러로 자동 동기화 리렌더링

9. 시스템 UI 화면 테마 및 보고서 출력 테마 인기 7대 핵심 테마로 정돈 (v1.0.4)
   - [UI 화면 테마 7종] Enterprise Navy, Ocean Deep Blue, Forest Emerald, Nordic Teal, Midnight Purple, Slate Charcoal, High-Contrast Dark
   - [보고서 출력 테마 7종] Official Blue, Emerald Green, Nordic Teal, Slate Charcoal, Executive Purple, Pastel Sky Blue, Pastel Mint

10. 회의 캘린더 요일 타이틀(월,화,수,목,금) 및 회의 카드/날짜 고대비 시인성 100% 확보
   - [요일 헤더 시인성 복구] 평일(월~금) 헤더 글자색을 고대비 다크 텍스트(var(--text-main, #1e293b))로 지정하여 어떤 테마에서도 선명하게 노출
   - [회의 카드 및 날짜 가독성 강화] 회의 카드의 상태별 보더 라인과 텍스트(#0f172a bold)를 강화하고 날짜 숫자(12.5px bold)의 시인성을 극대화

11. 오프라인 매뉴얼(ManualViewer) 임베디드 HTML 버전 동기화
   - [매뉴얼 동기화] manual-viewer.js 내부에 Base64로 내장된 독립 팝업 매뉴얼(standaloneManualHtmlB64)을 ver1.0.4 manual.html로 완전히 갱신하여 로컬 file:// 및 오프라인 환경에서도 항상 최신 매뉴얼이 열람되도록 조치


12. 화면 최하단 오염 텍스트("=== -->") 원천 제거 (v1.0.4)
   - [원인 분석] 회의관리(tab-meeting) 탭 종료 위치와 스마트 데이터 병합(tab-merge) 탭 시작 위치 사이에 있던 HTML 주석 태그에서 시작 기호(<!--)가 누락되어 일반 텍스트 노드로 직렬화되어 브라우저 화면 하단에 상시 노출되던 문제를 발견
   - [조치 완료] 해당 누락 기호를 정상 HTML 주석 규격으로 완벽 교체하여 모든 화면 하단에서 불필요한 텍스트 노출을 100% 원천 차단

================================================================================
■ [시스템 폴더 구성]
- index.html                : AX_PMYS ver1.0.6 메인 웹 애플리케이션
- Standalone.html           : CSS/JS 전체 내장 단일 파일 실행본 (build_standalone.bat 로 재생성)
- build_standalone.bat      : Standalone.html 및 js/initial-data.js 재생성 배치
- tools/                    : build_standalone.py, build_initial_data.py, make_release.py(배포 zip) 빌드 스크립트
- manual.html               : 관리자 및 사용자 상세 운영 매뉴얼
- architecture.html         : 4계층 소프트웨어 아키텍처 정의서
- run_server.bat            : 로컬 다중 사용자 DB 웹서버 원클릭 실행 배치 프로그램
- wbs_db_server.py          : 파이썬 기반 로컬 SQLite/Access DB 웹서버 (포트: 8080)
- js/                       : WBS 모듈러 스크립트 라이브러리
  ├── app.js                : 전사 코어 앱 엔진 및 홈 화면(HomeScreenManager)
  ├── excel-sync.js         : OpenXML 표준 .xlsx 및 .docx 생성·동기화 엔진
  ├── meeting-manager.js    : 주간 회의록 및 Action Item 통합 트래커
  ├── db-connector.js       : 로컬 REST API DB 커넥터
  ├── dashboard-chart.js    : SVG 종합 대시보드 차트 엔진
  ├── gantt-renderer.js     : 인터랙티브 WBS 간트차트 렌더러
  ├── wbs-engine.js         : 공정률/가중치/일정 계산 엔진
  ├── data-store.js         : 저장/동기화 계층 (충돌 감지·권한 저장·화면별 저장/새로고침) (v1.0.6)
  ├── access-control.js     : 로그인·신규등록·서버 인증·4단계 권한(RBAC)·탭 접근 제어 (v1.0.6)
  ├── i18n.js / i18n-en.js  : 다국어(한국어/영어) 엔진 및 영어 사전 (v1.0.6)
  └── initial-data.js       : 최초 실행 초기 데이터 (data/initial_data.json 에서 자동 생성)
- css/                      : 스타일시트 (style.css, themes.css)
- data/                     : SQLite 프로젝트 DB (wbs_enterprise.db), 초기 데이터 initial_data.json
- Sample/                   : 표준 WBS 4레벨 샘플 데이터 엑셀 파일
- template/                 : WBS 마스터 템플릿 양식 CSV
================================================================================
