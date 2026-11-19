// Workgroup 판: modules/meeting/meeting-manager.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(MeetingManager, {
  getDefaultMeetings() {
    return [
      {
        id: "MTG-20270528-01",
        system: "W1",
        title: "가공1라인 PLC 실시간 데이터 연계 인터페이스 긴급 기술회의",
        date: "2027-05-28",
        startTime: "10:00",
        endTime: "11:30",
        location: "제1공장 2층 회의실 (온·오프라인 병행)",
        host: "이가공 책임",
        status: "완료",
        notes: "5월말 1단계 감리 전 통신 버퍼링 구조 최적화 협의",
        attendees: [
          { name: "이가공 책임", dept: "가공기술팀", role: "주관/발표", attendance: "참석" },
          { name: "김총괄 수석PM", dept: "PMO사업단", role: "총괄 관리", attendance: "참석" },
          { name: "박가공 수석", dept: "설비보전팀", role: "기술지원", attendance: "참석" },
          { name: "한품질 선임", dept: "품질보증팀", role: "품질감리", attendance: "참석" }
        ],
        agendas: [
          {
            id: "AGD-01",
            order: 1,
            title: "현행 PLC 텔레메트리 패킷 지연 원인 및 버퍼링 구조 분석",
            discussion: "가공1라인 CNC 설비 가동 시 초당 50건 이상 발생하는 고속 샘플링 신호에서 패킷 유실이 0.2% 발생함을 확인. 에지 게이트웨이 로컬 버퍼 크기 부족이 주원인으로 분석됨.",
            decision: "에지 게이트웨이 로컬 링버퍼(10MB) 드라이버를 개발하여 패치하고, 패킷 수신 주기 100ms로 최적화 합의."
          },
          {
            id: "AGD-02",
            order: 2,
            title: "현장 비가동 사유 터치 키오스크 UI 대형 버튼 시범 적용",
            discussion: "멤버 장갑 착용 상태에서 버튼 오터치를 방지하기 위해 10대 다빈도 비가동 사유 1-Touch 입력 레이아웃 시연 및 피드백 청취.",
            decision: "버튼 크기 140% 확대 및 감압식 터치 보정 알고리즘을 6월 5일까지 시범 라인에 적용하기로 확정."
          }
        ],
        actionItems: [
          {
            id: "ACT-01",
            meetingId: "MTG-20270528-01",
            title: "에지 게이트웨이 로컬 링버퍼(10MB) 드라이버 패치 및 통신 검증",
            content: "가공1라인 1호기 에지 게이트웨이에 10MB 버퍼 드라이버 설치 후 패킷 유실률 0.01% 이하 달성 확인",
            requester: "김총괄 수석PM",
            assignee: "이가공 책임",
            system: "W1",
            meetingDate: "2027-05-28",
            targetDate: "2027-06-05",
            status: "완료"
          },
          {
            id: "ACT-02",
            meetingId: "MTG-20270528-01",
            title: "비가동 사유 터치 키오스크 대형 버튼 UI 현장 배포",
            content: "현장 터치 단말기에 확대 UI 컴포넌트 설치 및 2개 교대조 피드백 수렴 보고서 작성",
            requester: "이가공 책임",
            assignee: "강조립 선임",
            system: "W1",
            meetingDate: "2027-05-28",
            targetDate: "2027-06-10",
            status: "진행중"
          }
        ],
        summary: "가공1라인 PLC 통신 버퍼링 구조 최적화 및 현장 터치 UI 개선 조치계획 수립 완료",
        updatedAt: "2027-05-28 12:00:00"
      },
      {
        id: "MTG-20270531-01",
        system: "PMO",
        title: "5월말 1단계 분석설계 산출물 감리 검수 결과 총괄 리뷰",
        date: "2027-05-31",
        startTime: "14:00",
        endTime: "15:30",
        location: "본관 대회의실 (PMO 총괄룸)",
        host: "김총괄 수석PM",
        status: "완료",
        notes: "전 서브시스템 1단계 분석설계 산출물 감리 검수 결과 및 조건부 승인 조치사항 협의",
        attendees: [
          { name: "김총괄 수석PM", dept: "PMO사업단", role: "주관/총괄", attendance: "참석" },
          { name: "이가공 책임", dept: "가공기술팀", role: "서브시스템PM", attendance: "참석" },
          { name: "박가공 수석", dept: "설비보전팀", role: "서브시스템PM", attendance: "참석" },
          { name: "최도장 책임", dept: "도장기술팀", role: "서브시스템PM", attendance: "참석" },
          { name: "정조립 책임", dept: "조립생산팀", role: "서브시스템PM", attendance: "참석" },
          { name: "한품질 선임", dept: "품질보증팀", role: "품질검수", attendance: "참석" }
        ],
        agendas: [
          {
            id: "AGD-03",
            order: 1,
            title: "7대 서브시스템 1단계 분석설계 표준 산출물 감리 적합성 검토",
            discussion: "전체 14건 표준 산출물 중 12건 적합 승인. W2 ERD 설계서 및 S1 통신 매핑서 2건에 대한 보안 점검 항목 보완 권고 접수.",
            decision: "보완 대상 2개 서브시스템은 6월 8일까지 보완 완료 후 조건부 승인 최종 종결 합의."
          }
        ],
        actionItems: [
          {
            id: "ACT-03",
            meetingId: "MTG-20270531-01",
            title: "W2 ERD 설계서 개인정보 및 접근권한 암호화 명세 보완",
            content: "DB 테이블 보안성 검토 지적사항 반영 및 테이블 명세서 개정 배포",
            requester: "한품질 선임",
            assignee: "박가공 수석",
            system: "W2",
            meetingDate: "2027-05-31",
            targetDate: "2027-06-08",
            status: "완료"
          },
          {
            id: "ACT-04",
            meetingId: "MTG-20270531-01",
            title: "S1 출하시험 시리얼 통신 인터페이스 암호화 프로토콜 적용",
            content: "출하 검사기 시리얼 통신 구간 패킷 체크섬 및 토큰 인증 추가",
            requester: "김총괄 수석PM",
            assignee: "윤출하 선임",
            system: "S1",
            meetingDate: "2027-05-31",
            targetDate: "2027-06-12",
            status: "진행중"
          }
        ],
        summary: "1단계 산출물 감리 통과 및 6월 개발단계 본격 진입 승인",
        updatedAt: "2027-05-31 16:00:00"
      },
      {
        id: "MTG-20270601-01",
        system: "A2",
        title: "조립2라인 미소정지 감지 알고리즘 현장 테스트 중간 점검",
        date: "2027-06-01",
        startTime: "10:00",
        endTime: "11:30",
        location: "조립2공장 기술지원실",
        host: "강조립 선임",
        status: "완료",
        notes: "3분 이하 미소정지 자동 분류 알고리즘 현장 인터럽트 신호 연동 검증",
        attendees: [
          { name: "강조립 선임", dept: "생산기술팀", role: "주관", attendance: "참석" },
          { name: "정조립 책임", dept: "조립생산팀", role: "라인총괄", attendance: "참석" },
          { name: "김총괄 수석PM", dept: "PMO사업단", role: "PMO", attendance: "참석" }
        ],
        agendas: [
          {
            id: "AGD-04",
            order: 1,
            title: "조립 스테이션 센서 인터럽트 캡처 주기 상향에 따른 시스템 부하 검증",
            discussion: "샘플링 주기를 100ms로 단축한 결과 3분 이하 단기 정지 감지율이 98.5%로 대폭 개선되었으며 서버 CPU 사용률 12% 수준으로 안정적임.",
            decision: "조립 2라인 전 스테이션(10개소)으로 해당 알고리즘 확대 전개 결정."
          }
        ],
        actionItems: [
          {
            id: "ACT-05",
            meetingId: "MTG-20270601-01",
            title: "조립2라인 10개 스테이션 알고리즘 일괄 배포 및 모니터링",
            content: "라인 밸런싱 모니터링 화면과 연계하여 실시간 미소정지 팝업 가동 검증",
            requester: "정조립 책임",
            assignee: "강조립 선임",
            system: "A2",
            meetingDate: "2027-06-01",
            targetDate: "2027-06-15",
            status: "진행중"
          }
        ],
        summary: "미소정지 100ms 알고리즘 안정화 확인 및 전 공정 확대 전개 결정",
        updatedAt: "2027-06-01 12:00:00"
      },
      {
        id: "MTG-20270604-01",
        system: "ALL",
        title: "22주차 정기 전사 WBS 공정회의 및 6월 개발 착수 보고",
        date: "2027-06-04",
        startTime: "15:00",
        endTime: "16:30",
        location: "본관 3층 스마트회의실",
        host: "김총괄 수석PM",
        status: "예정",
        notes: "전사 WBS 주간 공정률 집계 및 6월 단위/통합 개발 목표 점검",
        attendees: [
          { name: "김총괄 수석PM", dept: "PMO사업단", role: "주관", attendance: "참석" },
          { name: "이가공 책임", dept: "가공기술팀", role: "참석", attendance: "참석" },
          { name: "박가공 수석", dept: "설비보전팀", role: "참석", attendance: "참석" },
          { name: "최도장 책임", dept: "도장기술팀", role: "참석", attendance: "참석" },
          { name: "정조립 책임", dept: "조립생산팀", role: "참석", attendance: "참석" },
          { name: "강조립 선임", dept: "생산기술팀", role: "참석", attendance: "참석" },
          { name: "윤출하 선임", dept: "물류출하팀", role: "참석", attendance: "참석" }
        ],
        agendas: [
          {
            id: "AGD-05",
            order: 1,
            title: "22주차 전사 WBS 진척률 집계 및 계획 대비 갭 분석 보고",
            discussion: "금주 종합 실적 진척률 55% 달성 목표 확인 및 Task 일정 준수 상태 점검 예정.",
            decision: "(회의 진행 후 기록 예정)"
          },
          {
            id: "AGD-06",
            order: 2,
            title: "6월 핵심 Task 모듈 개발 환경 및 테스트베드 공동 활용 방안",
            discussion: "도장 및 조립 라인 가상 PLC 시뮬레이터 서버 자원 배분 계획 협의.",
            decision: "(회의 진행 후 기록 예정)"
          }
        ],
        actionItems: [
          {
            id: "ACT-06",
            meetingId: "MTG-20270604-01",
            title: "가상 PLC 시뮬레이터 공용 테스트베드 계정 발급 및 네트워크 오픈",
            content: "개발사 및 서브시스템 PM 대상 테스트베드 접속 환경 구성",
            requester: "김총괄 수석PM",
            assignee: "관리자",
            system: "ALL",
            meetingDate: "2027-06-04",
            targetDate: "2027-06-07",
            status: "진행중"
          }
        ],
        summary: "22주차 전사 공정회의 안건 상정 및 준비 진행",
        updatedAt: "2027-06-01 18:00:00"
      },
      {
        id: "MTG-20270608-01",
        system: "P1",
        title: "도장공정 부스 센서 인터페이스 통신 패킷 안정화 실무회의",
        date: "2027-06-08",
        startTime: "14:00",
        endTime: "15:30",
        location: "도장공장 현장 기술미팅룸",
        host: "최도장 책임",
        status: "예정",
        notes: "도장 부스 온·습도 센서 및 압력 텔레메트리 WebSocket 실시간 알람 연계",
        attendees: [
          { name: "최도장 책임", dept: "도장기술팀", role: "주관", attendance: "참석" },
          { name: "김총괄 수석PM", dept: "PMO사업단", role: "참석", attendance: "참석" }
        ],
        agendas: [
          {
            id: "AGD-07",
            order: 1,
            title: "도장 부스 환경 센서 연계 드라이버 현장 통신 테스트 계획 수립",
            discussion: "부스 온도 급변 시 경보 푸시 지연 방지를 위한 WebSocket 채널 분리 검증.",
            decision: "(예정)"
          }
        ],
        actionItems: [
          {
            id: "ACT-07",
            meetingId: "MTG-20270608-01",
            title: "도장 부스 알람 푸시 WebSocket 채널 1초 이내 단축 테스트",
            content: "현장 단말기 및 관리자 모바일 웹 브라우저 경보 알림 실측",
            requester: "최도장 책임",
            assignee: "최도장 책임",
            system: "P1",
            meetingDate: "2027-06-08",
            targetDate: "2027-06-18",
            status: "진행중"
          }
        ],
        summary: "차주 도장공정 실시간 경보 통신 안정화 실무회의 예정",
        updatedAt: "2027-06-01 18:00:00"
      },
      {
        id: "MTG-20270611-01",
        system: "W2",
        title: "가공2라인 CNC 텔레메트리 연계 드라이버 배포 점검회의",
        date: "2027-06-11",
        startTime: "10:00",
        endTime: "11:30",
        location: "설비보전팀 기술회의실",
        host: "박가공 수석",
        status: "예정",
        notes: "CNC 가공 설비 고속 샘플링 데이터 수집 어댑터 현장 배포 준비",
        attendees: [
          { name: "박가공 수석", dept: "설비보전팀", role: "주관", attendance: "참석" },
          { name: "김총괄 수석PM", dept: "PMO사업단", role: "참석", attendance: "참석" }
        ],
        agendas: [
          {
            id: "AGD-08",
            order: 1,
            title: "CNC 3호기 및 5호기 텔레메트리 어댑터 현장 가동 시나리오 검토",
            discussion: "가공 사이클 타임 분석 및 공구 마모도 연계 알고리즘 배포 일정 조율.",
            decision: "(예정)"
          }
        ],
        actionItems: [
          {
            id: "ACT-08",
            meetingId: "MTG-20270611-01",
            title: "CNC 3호기 텔레메트리 버퍼링 어댑터 현장 설치",
            content: "공구 카운터 잔여치 연산 룰 추가 및 경보 팝업 테스트",
            requester: "박가공 수석",
            assignee: "박가공 수석",
            system: "W2",
            meetingDate: "2027-06-11",
            targetDate: "2027-06-25",
            status: "진행중"
          }
        ],
        summary: "차주 CNC 어댑터 배포 및 사이클타임 분석 점검 회의 예정",
        updatedAt: "2027-06-01 18:00:00"
      }
    ];
  },


  // =========================================================================
  // 1. 회의일정 (월별 프로젝트 인터랙티브 캘린더 & 일정 리스트)
  // =========================================================================



  // 회의록 엑셀(XLSX) 다운로드

  // Action Item 통합 목록 엑셀 내려받기

  // [ver1.0.4 신규] 회의 일정 목록 전체/필터 엑셀 내려받기 (XLSX)
});
