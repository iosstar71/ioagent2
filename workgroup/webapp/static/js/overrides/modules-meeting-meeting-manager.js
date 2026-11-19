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

  render() {
    if (typeof AttachManager !== "undefined") AttachManager.refreshSummary();  // 첨부파일 수 (서버 방식, 처음 한 번)
    this.populateSubsystemDropdowns();
    this.populateMonthFilterDropdowns();
    if (this.activeSubTab === "schedule") {
      this.renderCalendar();
      this.renderScheduleList();
    } else if (this.activeSubTab === "minutes") {
      this.renderMinutesEditor(this.currentMeetingId);
    } else if (this.activeSubTab === "actionitems") {
      this.renderActionItemsTracker();
    }
  },

  // =========================================================================
  // 1. 회의일정 (월별 프로젝트 인터랙티브 캘린더 & 일정 리스트)
  // =========================================================================
  openNewMeetingModal(prefilledDate = "") {
    this.editingMeetingId = null;
    const modal = document.getElementById("meetingScheduleModal");
    if (!modal) return;
    document.getElementById("meetingModalTitle").textContent = "📅 신규 회의 일정 등록";
    document.getElementById("modalMtgTitle").value = "";
    document.getElementById("modalMtgDate").value = prefilledDate || (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    document.getElementById("modalMtgStartTime").value = "10:00";
    document.getElementById("modalMtgEndTime").value = "11:30";
    document.getElementById("modalMtgLocation").value = "대회의실 (온·오프라인 병행)";
    document.getElementById("modalMtgHost").value = "김총괄 수석PM";
    document.getElementById("modalMtgStatus").value = "예정";
    document.getElementById("modalMtgNotes").value = "";

    // Subsystem select options
    const sysSel = document.getElementById("modalMtgSystem");
    if (sysSel) {
      const subs = getAllSubsystemNames();
      sysSel.innerHTML = `<option value="ALL">ALL (전체 공통)</option>` + subs.map(s => `<option value="${s}">${s}</option>`).join("");
      sysSel.value = "ALL";
    }

    modal.style.display = "flex";
  },

  renderMinutesEditor(meetingId) {
    const filteredMtgs = this.getFilteredMinutesMeetings();
    const selectorEl = document.getElementById("minutesMeetingSelector");
    const container = document.getElementById("minutesEditorContainer");

    if (filteredMtgs.length === 0) {
      if (selectorEl) {
        selectorEl.innerHTML = '<option value="">(선택된 조건에 등록된 회의 없음)</option>';
      }
      if (container) {
        const minSys = (document.getElementById("minutesFilterSubsystem") && document.getElementById("minutesFilterSubsystem").value) || "ALL";
        const minMonth = (document.getElementById("minutesFilterMonth") && document.getElementById("minutesFilterMonth").value) || "ALL";
        container.innerHTML = `
          <div style="text-align:center; padding:40px; color:var(--text-muted); background:var(--bg-main); border:1px dashed var(--border-color); border-radius:8px;">
            📅 선택된 조회 조건(서브시스템: <b>${minSys === "ALL" ? "전체" : minSys}</b>, 회의 월: <b>${minMonth === "ALL" ? "전체" : minMonth}</b>)에 해당하는 회의 일정이 없습니다.
            <br><br>
            <button class="btn btn-primary btn-sm" data-click="MeetingManager.openNewMeetingModal">➕ 해당 월에 신규 회의 등록</button>
          </div>
        `;
      }
      this.currentMeetingId = null;
      return;
    }

    let mtg = filteredMtgs.find(x => x.id === meetingId);
    if (!mtg) {
      mtg = filteredMtgs[0];
    }
    this.currentMeetingId = mtg.id;

    if (selectorEl) {
      selectorEl.innerHTML = filteredMtgs.map(m => `
        <option value="${m.id}" ${m.id === this.currentMeetingId ? "selected" : ""}>
          [${m.date}] [${m.system}] ${escapeHtml(m.title)} (${m.status})
        </option>
      `).join("");
      selectorEl.value = this.currentMeetingId;
    }

    if (!container) return;

    if (!mtg) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--text-muted); background:var(--bg-main); border:1px dashed var(--border-color); border-radius:8px;">
          📅 선택된 회의가 없습니다. 상단에서 회의를 선택하거나 신규 회의 일정을 먼저 등록해주세요.
          <br><br>
          <button class="btn btn-primary btn-sm" data-click="MeetingManager.openNewMeetingModal">➕ 신규 회의 일정 등록</button>
        </div>
      `;
      return;
    }

    this.currentMeetingId = mtg.id;
    mtg = this._ensureDraft(mtg.id);
    const sysColor = this.getSubsystemColor(mtg.system);
    const stBadge = mtg.status === "완료"
      ? `<span class="badge" style="background:var(--chart-good-text); color:white;">완료</span>`
      : `<span class="badge" style="background:var(--primary); color:white;">${mtg.status}</span>`;

    container.innerHTML = `
      <!-- 1) 회의 기본 정보 카드 -->
      <div class="card" style="margin-bottom:14px; border-left:4px solid ${sysColor};">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:${sysColor}; color:white; font-size:var(--fs-sm, 12px);">${escapeHtml(mtg.system)}</span>
            <span style="font-size:var(--fs-lg, 16px); font-weight:bold; color:var(--text-main);">${escapeHtml(mtg.title)}</span>
            ${stBadge}
          </div>
          <div style="display:flex; gap:6px;">
            ${typeof AttachManager !== "undefined" ? AttachManager.btnHtml("meeting", String(mtg.id), mtg, "첨부파일") : ""}
            <button class="btn btn-outline btn-xs" data-click="MeetingManager.openEditMeetingModal" data-click-args="${UiEvents.args(String(mtg.id))}">✏️ 기본정보 수정</button>
            <button class="btn btn-outline btn-xs" data-click="MeetingManager.toggleMeetingStatus" data-click-args="${UiEvents.args(String(mtg.id))}">
              ${mtg.status === "완료" ? "🔄 진행중으로 변경" : "✅ 회의 완료 처리"}
            </button>
          </div>
        </div>
        <div class="grid-4" style="margin-top:8px; font-size:var(--fs-sm, 12px); background:var(--bg-main); padding:10px; border-radius:6px; border:1px solid var(--border-color);">
          <div><b style="color:var(--text-muted);">📅 회의 일자:</b> <strong>${mtg.date}</strong></div>
          <div><b style="color:var(--text-muted);">⏰ 회의 시간:</b> ${mtg.startTime} ~ ${mtg.endTime}</div>
          <div><b style="color:var(--text-muted);">📍 회의 장소:</b> ${escapeHtml(mtg.location || "-")}</div>
          <div><b style="color:var(--text-muted);">👤 주관/발표:</b> <strong>${escapeHtml(mtg.host || "-")}</strong></div>
        </div>
        <div style="margin-top:8px; font-size:var(--fs-sm, 12px);">
          <b style="color:var(--text-sub);">💡 회의 목적 및 총괄 요약:</b>
          <input type="text" id="minutesSummaryInput" value="${escapeHtml(mtg.summary || mtg.title)}" data-change="MeetingManager.updateMinutesSummary" data-change-args='["$value"]' style="width:100%; margin-top:4px; font-size:var(--fs-sm, 12px); padding:4px 8px; border:1px solid var(--border-color); border-radius:4px;">
        </div>
      </div>

      <!-- 2) 회의 참석자 카드 -->
      <div class="card" style="margin-bottom:14px;">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>👥 회의 참석자 명단 (${(mtg.attendees || []).length}명)</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <select id="selQuickAddUser" style="font-size:var(--fs-xs, 11px); padding:2px 6px;">
              <option value="">-- 등록된 멤버 빠른 선택 --</option>
              ${((typeof projectUsers !== "undefined" && Array.isArray(projectUsers)) ? projectUsers : []).map(u => `<option value="${escapeHtml(u.name)}|${escapeHtml(u.dept)}">${escapeHtml(u.name)} (${escapeHtml(u.dept || u.role)})</option>`).join("")}
            </select>
            <input type="text" id="inCustomAttendee" placeholder="성명(소속/역할)" style="font-size:var(--fs-xs, 11px); padding:2px 6px; width:130px;">
            <button class="btn btn-secondary btn-xs" data-click="MeetingManager.addAttendee">＋ 참석자 추가</button>
          </div>
        </div>
        <div id="attendeesChipsContainer" style="display:flex; flex-wrap:wrap; gap:8px; padding-top:6px;">
          ${((mtg.attendees || []).map((att, aIdx) => `
            <div class="attendee-chip" style="background:var(--tint-info); border:1px solid var(--border-color); border-radius:20px; padding:4px 10px; font-size:var(--fs-xs, 11px); display:inline-flex; align-items:center; gap:6px;">
              <span style="font-weight:bold; color:var(--tint-info-text);">${escapeHtml(att.name)}</span>
              <span style="color:var(--text-muted); font-size:var(--fs-2xs, 10px);">(<span>${escapeHtml(att.dept || "부서")}</span>/<span>${escapeHtml(att.role || "참석")}</span>)</span>
              <select data-change="MeetingManager.updateAttendance" data-change-args="${UiEvents.args(aIdx, "$value")}" style="font-size:var(--fs-2xs, 10px); padding:1px 3px; border:none; background:transparent; font-weight:bold; color:${att.attendance === "불참" ? "var(--chart-bad-text)" : "var(--chart-good-text)"};">
                <option value="참석" ${att.attendance !== "불참" && att.attendance !== "위임" ? "selected" : ""}>참석</option>
                <option value="불참" ${att.attendance === "불참" ? "selected" : ""}>불참</option>
                <option value="위임" ${att.attendance === "위임" ? "selected" : ""}>위임</option>
              </select>
              <span data-click="MeetingManager.removeAttendee" data-click-args="${UiEvents.args(aIdx)}" style="cursor:pointer; color:var(--text-muted); font-weight:bold; margin-left:2px;" title="참석자 삭제">✕</span>
            </div>
          `)).join("")}
        </div>
      </div>

      <!-- 3) 회의 안건별 상세 논의 및 결정사항 카드 -->
      <div class="card" style="margin-bottom:14px;">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>📋 회의 안건별 상세 논의 및 결정 사항 (${(mtg.agendas || []).length}개 안건)</span>
          <button class="btn btn-primary btn-xs" data-click="MeetingManager.addAgenda">➕ 신규 안건 추가</button>
        </div>
        <div id="agendasContainer" style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">
          ${((mtg.agendas || []).map((agd, gIdx) => `
            <div class="agenda-item-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--bg-main); padding-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px; width:75%;">
                  <span style="background:var(--tint-info-text); color:white; font-size:var(--fs-xs, 11px); font-weight:bold; padding:2px 8px; border-radius:10px;">안건 #${gIdx + 1}</span>
                  <input type="text" value="${escapeHtml(agd.title)}" data-change="MeetingManager.updateAgendaTitle" data-change-args="${UiEvents.args(gIdx, "$value")}" placeholder="안건 명칭을 입력하세요" style="font-weight:bold; font-size:var(--fs-base, 13px); width:100%; border:1px solid var(--border-color); border-radius:4px; padding:3px 8px;">
                </div>
                <button class="btn btn-outline btn-xs" data-click="MeetingManager.removeAgenda" data-click-args="${UiEvents.args(gIdx)}" style="color:var(--danger);" title="안건 삭제">🗑️ 안건 삭제</button>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <div>
                  <label style="font-size:var(--fs-xs, 11px); font-weight:bold; color:var(--tint-info-text); display:block; margin-bottom:4px;">
                    💬 논의 내용 및 주요 발언 요지
                  </label>
                  <textarea rows="4" data-change="MeetingManager.updateAgendaDiscussion" data-change-args="${UiEvents.args(gIdx, "$value")}" style="width:100%; font-size:var(--fs-xs, 11px); padding:6px; border:1px solid var(--border-color); border-radius:4px; resize:vertical;" placeholder="회의 중 논의된 기술적 쟁점, 원인 분석, 상호 발언 요점을 상세히 기록하세요.">${escapeHtml(agd.discussion || "")}</textarea>
                </div>
                <div>
                  <label style="font-size:var(--fs-xs, 11px); font-weight:bold; color:var(--chart-good-text); display:block; margin-bottom:4px;">
                    ✅ 결정 사항 및 실행 합의 내용
                  </label>
                  <textarea rows="4" data-change="MeetingManager.updateAgendaDecision" data-change-args="${UiEvents.args(gIdx, "$value")}" style="width:100%; font-size:var(--fs-xs, 11px); padding:6px; border:1px solid var(--border-color); border-radius:4px; resize:vertical; background:var(--tint-ok);" placeholder="안건 논의 결과 도출된 합의 사항, 후속 일정, 정책 결정을 구체적으로 기록하세요.">${escapeHtml(agd.decision || "")}</textarea>
                </div>
              </div>
            </div>
          `)).join("")}
        </div>
      </div>

      <!-- 4) 회의 결과 도출 Action Item 카드 -->
      <div class="card" style="margin-bottom:14px;">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>⚡ 회의 결과 도출 Action Item (${(mtg.actionItems || []).length}건)</span>
          <button class="btn btn-primary btn-xs" data-click="MeetingManager.openAddActionItemModal" data-click-args="${UiEvents.args(String(mtg.id))}">➕ Action Item 도출 등록</button>
        </div>
        <div class="table-container" style="max-height:260px; margin-top:8px;">
          <table class="matrix-table" id="meetingMinutesActionTable">
            <thead>
              <tr>
                <th style="width:90px;">ID</th>
                <th>Action Item 명칭</th>
                <th>세부 Task 내용</th>
                <th style="width:100px;">요청자</th>
                <th style="width:100px;">담당자</th>
                <th style="width:100px;">완료목표일</th>
                <th style="width:85px;">상태</th>
                <th style="width:110px;">관리</th>
              </tr>
            </thead>
            <tbody>
              ${((mtg.actionItems || []).length === 0)
                ? `<tr><td colspan="8" style="text-align:center; padding:18px; color:var(--text-muted);">ℹ️ 본 회의에서 도출된 Action Item이 없습니다.</td></tr>`
                : (mtg.actionItems || []).map((act, actIdx) => `
                  <tr>
                    <td style="text-align:center; font-weight:bold; color:var(--tint-info-text);">${escapeHtml(act.id)}</td>
                    <td style="font-weight:bold;">${escapeHtml(act.title)}</td>
                    <td>${escapeHtml(act.content || "-")}</td>
                    <td style="text-align:center;">${escapeHtml(act.requester || "-")}</td>
                    <td style="text-align:center; font-weight:bold; color:var(--tint-info-text);">${escapeHtml(act.assignee || "-")}</td>
                    <td style="text-align:center;">${escapeHtml(act.targetDate || "-")}</td>
                    <td style="text-align:center;">
                      <select data-change="MeetingManager.updateActionItemStatusDirect" data-change-args="${UiEvents.args(String(act.id), "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 4px; font-weight:bold; color:${act.status === "완료" ? "var(--chart-good-text)" : "var(--primary)"};">
                        <option value="진행중" ${act.status === "진행중" ? "selected" : ""}>진행중</option>
                        <option value="완료" ${act.status === "완료" ? "selected" : ""}>완료</option>
                        <option value="삭제" ${act.status === "삭제" ? "selected" : ""}>삭제</option>
                      </select>
                    </td>
                    <td style="text-align:center; white-space:nowrap;">
                      <button class="btn btn-outline btn-xs" data-click="MeetingManager.openEditActionItemModal" data-click-args="${UiEvents.args(String(act.id))}">✏️ 수정</button>
                      <button class="btn btn-outline btn-xs" data-click="MeetingManager.deleteActionItemDirect" data-click-args="${UiEvents.args(String(act.id))}" style="color:var(--danger);">🗑️</button>
                    </td>
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5) 하단 회의록 전용 내보내기 툴바 -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-main); border:1px solid var(--border-color); padding:12px 16px; border-radius:8px;">
        <span style="font-size:var(--fs-sm, 12px); color:var(--text-muted);">
          💡 회의록 작성 후 [✅ 작성 완료 (저장)] 버튼을 눌러야 저장됩니다. 저장하지 않고 다른 회의록을 선택하면 저장 여부를 확인합니다.
        </span>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" data-click="MeetingManager.completeMinutes" data-click-args='[true]'>✅ 작성 완료 (저장)</button>
          <button class="btn btn-secondary btn-sm" data-click="UiH.meetingDiscard" title="저장하지 않은 회의록 변경 내용을 취소합니다.">↩️ 변경 취소</button>
          <button class="btn btn-info btn-sm" data-click="MeetingManager.exportMeetingDocx" data-click-args="${UiEvents.args(String(mtg.id))}" style="background:var(--primary); color:white; border-color:var(--primary);">📥 워드 다운로드 (회의록)</button>
          <button class="btn btn-success btn-sm" data-click="MeetingManager.exportMeetingExcel" data-click-args="${UiEvents.args(String(mtg.id))}">📥 엑셀 다운로드 (회의록)</button>
        </div>
      </div>
    `;
  },
  openAddActionItemModal(meetingId) {
    this.editingActionItemId = null;
    const modal = document.getElementById("actionItemEditModal");
    if (!modal) return;
    document.getElementById("actionItemModalTitle").textContent = "⚡ 신규 Action Item 도출 등록";
    document.getElementById("modalAiMeetingId").value = meetingId || this.currentMeetingId || "";
    document.getElementById("modalAiTitle").value = "";
    document.getElementById("modalAiContent").value = "";
    document.getElementById("modalAiRequester").value = "김총괄 수석PM";
    document.getElementById("modalAiAssignee").value = "";
    document.getElementById("modalAiTargetDate").value = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-15";
    document.getElementById("modalAiStatus").value = "진행중";
    modal.style.display = "flex";
  },

  exportMeetingDocx(meetingId) {
    const m = (meetingsData || []).find(x => x.id === meetingId) || meetingsData[0];
    if (!m) return;

    if (typeof DocxBuilder === "undefined" || typeof DocxBuilder.buildMeetingMinutesDocx !== "function") {
      showToast("⚠️ 워드 생성 엔진을 초기화할 수 없습니다.", "error");
      return;
    }

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";
    const blob = DocxBuilder.buildMeetingMinutesDocx(m, projName);
    const filename = ExcelSync.stdName("회의록", [m.system, m.title], "docx", String(m.date || "").replace(/-/g, ""));
    if (typeof ExcelSync !== "undefined" && typeof ExcelSync._triggerDownload === "function") {
      ExcelSync._triggerDownload(blob, filename);
    }
    showToast(`📄 [회의록 워드 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },

  // 회의록 엑셀(XLSX) 다운로드
  exportMeetingExcel(meetingId) {
    const m = (meetingsData || []).find(x => x.id === meetingId) || meetingsData[0];
    if (!m) return;

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";

    const s1Rows = [
      { cells: [`[회의록] ${m.title}`], styleId: 3, height: 28 },
      { cells: ["프로젝트명", projName, "서브시스템", m.system, "회의일자", m.date, "회의시간", `${m.startTime}~${m.endTime}`], styleId: 2, height: 22 },
      { cells: ["회의장소", m.location || "-", "주관/발표", m.host || "-", "회의상태", m.status, "작성일시", m.updatedAt || "-"], styleId: 2, height: 22 },
      { cells: [], styleId: 0, height: 10 },
      { cells: ["【회의 목적 및 총괄 요약】"], styleId: 3, height: 24 },
      { cells: [m.summary || m.title], styleId: 2, height: 26 },
      { cells: [], styleId: 0, height: 10 },
      { cells: ["【참석자 명단】"], styleId: 3, height: 24 }
    ];

    (m.attendees || []).forEach(att => {
      s1Rows.push({
        cells: ["참석자", att.name, "소속부서", att.dept || "-", "역할", att.role || "-", "참석여부", att.attendance || "참석"],
        styleId: 2,
        height: 20
      });
    });

    s1Rows.push({ cells: [], styleId: 0, height: 12 });
    s1Rows.push({ cells: ["【회의 안건별 논의 및 결정사항】"], styleId: 3, height: 24 });
    s1Rows.push({ cells: ["안건번호", "안건명칭", "논의 내용 및 주요 발언 요지", "결정 사항 및 실행 합의"], styleId: 1, height: 24 });

    (m.agendas || []).forEach(a => {
      s1Rows.push({
        cells: [`안건 #${a.order}`, a.title, a.discussion || "-", a.decision || "-"],
        styleId: 2,
        height: 28
      });
    });

    s1Rows.push({ cells: [], styleId: 0, height: 12 });
    s1Rows.push({ cells: ["【도출 Action Item】"], styleId: 3, height: 24 });
    s1Rows.push({ cells: ["ID", "Action Item 명칭", "세부 수행과업", "요청자", "담당자", "완료목표일", "상태"], styleId: 1, height: 24 });

    (m.actionItems || []).forEach(act => {
      s1Rows.push({
        cells: [act.id, act.title, act.content || "-", act.requester || "-", act.assignee || "-", act.targetDate || "-", act.status || "진행중"],
        styleId: 2,
        height: 22
      });
    });

    // [ver1.0.4 요건 4] 회의록 엑셀 제목 및 헤더 짤림 방지: A~H열 셀 병합 및 컬럼 너비 확대
    const merges = ["A1:H1", "A5:H5", "A6:H6", "A8:H8"];
    // Agenda and Action Items banners
    let rIdx = 8 + (m.attendees || []).length + 1; // blank row
    rIdx++; // blank
    merges.push(`A${rIdx}:H${rIdx}`); // 안건 헤더
    rIdx += 1 + 1 + (m.agendas || []).length; // 안건 테이블
    rIdx++; // blank
    merges.push(`A${rIdx}:H${rIdx}`); // Action Item 헤더

    const blob = ExcelSync._buildXlsxBlob([
      {
        name: "회의록_상세",
        colWidths: [16, 28, 45, 45, 16, 16, 16, 16],
        rows: s1Rows,
        merges: merges
      }
    ]);
    const filename = ExcelSync.stdName("회의록", [m.system, m.title], "xlsx", String(m.date || "").replace(/-/g, ""));
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📊 [회의록 엑셀 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },

  // Action Item 통합 목록 엑셀 내려받기
  exportActionItemsExcel() {
    const allActions = this.getAllActionItems().filter(a => a.status !== "삭제");
    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";

    const rows = [
      { cells: [`[${projName}] 회의 도출 Action Item 통합 관리 대장`], styleId: 3, height: 28 },
      { cells: ["ID", "서브시스템", "연계 회의명", "회의일자", "Action Item 명칭", "세부 Task내용", "요청자", "담당자", "완료목표일", "상태"], styleId: 1, height: 24 }
    ];

    allActions.forEach(a => {
      rows.push({
        cells: [a.id, a.system || a.meetingSystem || "ALL", a.meetingTitle || "-", a.meetingDate || "-", a.title, a.content || "-", a.requester || "-", a.assignee || "-", a.targetDate || "-", a.status],
        styleId: 2,
        height: 22
      });
    });

    // [ver1.0.4 요건 4] Action Item 엑셀 제목 짤림 방지: A~J열 셀 병합
    const blob = ExcelSync._buildXlsxBlob([
      {
        name: "Action_Items_통합목록",
        colWidths: [14, 16, 32, 14, 34, 45, 14, 14, 14, 12],
        rows: rows,
        merges: ["A1:J1"]
      }
    ]);
    const filename = ExcelSync.stdName("ActionItem", [], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📊 [Action Items 엑셀 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },

  // [ver1.0.4 신규] 회의 일정 목록 전체/필터 엑셀 내려받기 (XLSX)
  exportScheduleListExcel() {
    const sysFilter = (document.getElementById("meetingFilterSubsystem") && document.getElementById("meetingFilterSubsystem").value) || "ALL";
    const statusFilter = (document.getElementById("meetingFilterStatus") && document.getElementById("meetingFilterStatus").value) || "ALL";
    const searchWord = (document.getElementById("meetingSearchInput") ? document.getElementById("meetingSearchInput").value : "").trim().toLowerCase();

    const filtered = (meetingsData || []).filter(item => {
      if (sysFilter !== "ALL" && item.system !== sysFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (searchWord) {
        const text = `${item.title} ${item.location} ${item.host} ${item.notes}`.toLowerCase();
        if (!text.includes(searchWord)) return false;
      }
      return true;
    });

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";
    const scopeLabel = sysFilter === "ALL" ? "전체 서브시스템" : `${sysFilter} 서브시스템`;

    const rows = [
      { cells: [`[${projName}] 프로젝트 회의 일정 관리 대장 (${scopeLabel})`], styleId: 3, height: 28 },
      { cells: ["No", "서브시스템", "회의 제목", "회의 일자", "회의 시간", "회의 장소", "주관/발표", "진행상태", "비고 및 주요 안건"], styleId: 1, height: 24 }
    ];

    filtered.forEach((m, idx) => {
      rows.push({
        cells: [idx + 1, m.system, m.title, m.date, `${m.startTime || ""}~${m.endTime || ""}`, m.location || "-", m.host || "-", m.status || "예정", m.notes || m.summary || "-"],
        styleId: 2,
        height: 22
      });
    });

    const blob = ExcelSync._buildXlsxBlob([
      {
        name: "회의일정_목록",
        colWidths: [8, 14, 38, 14, 14, 24, 16, 12, 35],
        rows: rows,
        merges: ["A1:I1"]
      }
    ]);
    const filename = ExcelSync.stdName("회의일정", [scopeLabel], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📊 [회의일정 엑셀 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },
});
