/**
 * =========================================================================
 * IOSTAR-PM ver1.0.7
 * 모듈명: MeetingManager (회의일정 캘린더 · 회의록 작성 · Action Item 통합 관리)
 * =========================================================================
 * 주요 기능:
 * 1) 🗓️ 회의일정 관리: 연도/월별 인터랙티브 프로젝트 캘린더 및 일정 CRUD
 * 2) 📝 회의록 작성: 회의 기본정보, 참석자 관리, 안건별 상세 논의/결정사항, 도출 Action Item 연계
 * 3) ⚡ Action Item 현황: 전사/서브시스템/일자/상태별 통합 트래커 및 원클릭 상태 전환
 * 4) 📄 보고서 연동: 회의록 독립 워드/XLSX 다운로드 및 주간보고 연계
 * [v1.0.6] 회의록은 편집본(draft)에 작성 → [✅ 작성 완료] 클릭 시 저장
 *          저장하지 않고 다른 회의록/화면으로 이동하면 [저장 / 무시 / 취소] 선택
 */

var MeetingManager = {
  activeSubTab: "schedule", // "schedule" | "minutes" | "actionitems"
  currentMeetingId: null,
  calendarYear: 2027,
  calendarMonth: 5, // 1-indexed (5 = 5월)
  editingMeetingId: null,
  editingActionItemId: null,
  _draft: null,      // 회의록 편집본 (작성 완료 전까지 meetingsData 에 반영하지 않음)
  _draftBase: "",    // 편집 시작 시점 원본 (변경 여부 판단)

  _now() { return new Date().toISOString().replace("T", " ").substring(0, 19); },
  _clone(v) { return JSON.parse(JSON.stringify(v)); },
  _findMeeting(id) { return (meetingsData || []).find(x => x.id === id) || null; },
  _canon(m) {
    if (!m) return "";
    const c = Object.assign({}, m);
    delete c.actionItems;
    delete c.updatedAt;
    delete c.fileKey;  // 첨부파일 연결 값은 회의록 내용 변경으로 보지 않음
    return JSON.stringify(c);
  },

  // 현재 회의록 편집본 (없으면 원본에서 생성)
  _ensureDraft(id) {
    const src = this._findMeeting(id);
    if (!src) { this._draft = null; return null; }
    if (!this._draft || this._draft.id !== id) {
      this._draft = this._clone(src);
      this._draftBase = this._canon(src);
    }
    // Action Item 은 별도 저장(모달) 대상이므로 항상 원본을 표시
    this._draft.actionItems = src.actionItems || [];
    return this._draft;
  },
  _editMeeting() { return this._ensureDraft(this.currentMeetingId); },

  isDraftDirty() {
    return !!(this._draft && this._findMeeting(this._draft.id) && this._canon(this._draft) !== this._draftBase);
  },

  discardDraft() {
    this._draft = null;
    this._draftBase = "";
  },

  // 다른 회의록/화면으로 이동 전 확인: 미저장이면 [저장/무시/취소] → 선택 후 onProceed 실행
  confirmLeave(onProceed) {
    if (!this.isDraftDirty()) return true;
    SyncUI.ask(
      "📝 회의록 미저장",
      `작성 중인 회의록 [${this._draft.title}] 이 저장되지 않았습니다.\n저장하시겠습니까?`,
      [
        { id: "save", label: "💾 저장 (작성 완료)", cls: "btn-primary" },
        { id: "ignore", label: "무시 (변경 취소)", cls: "btn-danger" },
        { id: "cancel", label: "계속 작성", cls: "btn-secondary" }
      ]
    ).then(async choice => {
      if (choice === "cancel") { this._restoreFilterSelections(); return; }
      if (choice === "save") await this.completeMinutes(false);
      else this.discardDraft();
      if (typeof onProceed === "function") onProceed();
    });
    return false;
  },

  _rememberFilterSelections() {
    this._filterSnapshot = ["minutesFilterSubsystem", "minutesFilterMonth", "minutesMeetingSelector"].map(id => {
      const el = document.getElementById(id);
      return [id, el ? el.value : null];
    });
  },
  _restoreFilterSelections() {
    (this._filterSnapshot || []).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (el && v !== null) el.value = v;
    });
    this.renderMinutesEditor(this.currentMeetingId);
  },

  // 저장소에서 다시 불러온 경우: 미저장 편집본은 유지, 삭제된 회의는 편집본 폐기
  onDataReloaded() {
    if (this._draft && (!this._findMeeting(this._draft.id) || !this.isDraftDirty())) this.discardDraft();
    if (this.currentMeetingId && !this._findMeeting(this.currentMeetingId)) this.currentMeetingId = meetingsData[0] ? meetingsData[0].id : null;
    const pane = document.getElementById("tab-meeting");
    if (pane && pane.classList.contains("active")) this.render();
  },

  // [✅ 작성 완료] 편집본을 확정하여 저장
  async completeMinutes(notify = true) {
    const d = this._draft;
    if (!d) return;
    const target = this._findMeeting(d.id);
    if (!target) return;
    const actionItems = target.actionItems || [];
    Object.assign(target, this._clone(d), { actionItems, status: "완료", minutesCompleted: true, updatedAt: this._now() });
    this.discardDraft();
    const res = await SyncManager.save(["meetingsData"], { notify: false });
    if (notify && (res.ok || res.nothing)) showToast(`✅ [회의록 작성 완료] '${target.title}' 회의록이 저장되었습니다.`);
    this.render();
  },

  // 회의 일정·Action Item 등 모달 저장 시 즉시 저장
  _saveNow() {
    return SyncManager.save(["meetingsData"], { notify: false });
  },

  // 모달에서 회의 기본정보가 바뀐 경우 작성 중인 편집본에도 반영 (편집본의 다른 변경은 유지)
  _syncDraftFields(target, fields) {
    if (!this._draft || !target || this._draft.id !== target.id) return;
    fields.forEach(f => { this._draft[f] = target[f]; });
    const pending = this._canon(this._draft) !== this._draftBase;
    this._draftBase = this._canon(target);
    if (!pending) this._draft = this._clone(target);
  },

  init() {
    this.ensureInitialData();
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    const d = new Date(repDate);
    if (!isNaN(d.getTime())) {
      this.calendarYear = d.getFullYear();
      this.calendarMonth = d.getMonth() + 1;
    }
    if (!this.currentMeetingId && Array.isArray(meetingsData) && meetingsData.length > 0) {
      this.currentMeetingId = meetingsData[0].id;
    }
    this.populateSubsystemDropdowns();
    this.populateMonthFilterDropdowns();
    this.render();
  },

  // [ver1.0.4 버그 픽스] 회의 관리 전용 서브시스템 드롭다운 동적 연동
  // [ver1.0.4 신규] 회의 일정 및 회의록 월별(Month) 필터 드롭다운 옵션 구축
  populateMonthFilterDropdowns() {
    const monthSet = new Set();
    (meetingsData || []).forEach(m => {
      if (m.date && m.date.length >= 7) monthSet.add(m.date.substring(0, 7));
    });
    const curYear = this.calendarYear || 2027;
    for (let i = 1; i <= 12; i++) {
      monthSet.add(`${curYear}-${String(i).padStart(2, "0")}`);
    }
    const sortedMonths = Array.from(monthSet).sort();

    const buildOptions = (selectedVal) => {
      return `<option value="ALL">전체 월 (All Months)</option>` + sortedMonths.map(ym => {
        const parts = ym.split("-");
        const label = `${parts[0]}년 ${parseInt(parts[1], 10)}월`;
        return `<option value="${ym}" ${ym === selectedVal ? "selected" : ""}>${label}</option>`;
      }).join("");
    };

    const fMonth = document.getElementById("meetingFilterMonth");
    if (fMonth) {
      const cur = fMonth.value || "ALL";
      fMonth.innerHTML = buildOptions(cur);
    }
    const minMonth = document.getElementById("minutesFilterMonth");
    if (minMonth) {
      const cur = minMonth.value || "ALL";
      minMonth.innerHTML = buildOptions(cur);
    }
  },

  onMinutesMonthFilterChanged() {
    if (!this.confirmLeave(() => this.onMinutesMonthFilterChanged())) return;
    this.updateMinutesMeetingSelector();
    const sel = document.getElementById("minutesMeetingSelector");
    if (sel && sel.value) {
      this.openMinutesForMeeting(sel.value);
    } else {
      const container = document.getElementById("minutesEditorContainer");
      if (container) {
        container.innerHTML = `<div class="card" style="padding:30px; text-align:center; color:var(--text-muted); font-size:var(--fs-sm, 12px);">ℹ️ 선택된 조회 조건(서브시스템 및 월)에 해당하는 등록된 회의가 없습니다.</div>`;
      }
    }
  },

  populateSubsystemDropdowns() {
    const subs = (typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : [];
    // 1. 회의일정 캘린더 상단 서브시스템 필터
    const fSel = document.getElementById("meetingFilterSubsystem");
    if (fSel) {
      const curVal = fSel.value || "ALL";
      fSel.innerHTML = `<option value="ALL">전체 서브시스템</option>` +
        subs.map(s => `<option value="${s}">${s}</option>`).join("");
      if (subs.includes(curVal)) fSel.value = curVal;
      else fSel.value = "ALL";
    }
    // 2. 신규/수정 회의 모달 서브시스템 선택
    const mSel = document.getElementById("modalMtgSystem");
    if (mSel) {
      const curVal = mSel.value || "ALL";
      mSel.innerHTML = `<option value="ALL">ALL (전체 공통)</option>` +
        subs.map(s => `<option value="${s}">${s}</option>`).join("");
      if (subs.includes(curVal)) mSel.value = curVal;
      else mSel.value = "ALL";
    }
    // 3. Action Item 트래커 상단 서브시스템 필터 (ID: aiFilterSubsystem & fallback meetingAiFilterSubsystem)
    const aSel = document.getElementById("aiFilterSubsystem") || document.getElementById("meetingAiFilterSubsystem");
    if (aSel) {
      const curVal = aSel.value || "ALL";
      aSel.innerHTML = `<option value="ALL">전체 서브시스템</option>` +
        subs.map(s => `<option value="${s}">${s}</option>`).join("");
      if (subs.includes(curVal)) aSel.value = curVal;
      else aSel.value = "ALL";
    }
    // 4. 회의록 작성·상세 상단 서브시스템 필터 (ID: minutesFilterSubsystem)
    const minSel = document.getElementById("minutesFilterSubsystem");
    if (minSel) {
      const curVal = minSel.value || "ALL";
      minSel.innerHTML = `<option value="ALL">전체 서브시스템</option>` +
        subs.map(s => `<option value="${s}">${s}</option>`).join("");
      if (subs.includes(curVal)) minSel.value = curVal;
      else minSel.value = "ALL";
    }
    // 5. Action Item 모달 내 서브시스템 선택
    const actSysSel = document.getElementById("modalActionItemSubsystem");
    if (actSysSel) {
      const curVal = actSysSel.value || "ALL";
      actSysSel.innerHTML = `<option value="ALL">ALL (전체 공통)</option>` +
        subs.map(s => `<option value="${s}">${s}</option>`).join("");
      if (subs.includes(curVal)) actSysSel.value = curVal;
      else actSysSel.value = "ALL";
    }
  },

  onFilterChanged() {
    this.renderCalendar();
    this.renderScheduleList();
    const sysFilter = (document.getElementById("meetingFilterSubsystem") && document.getElementById("meetingFilterSubsystem").value) || "ALL";
    const aiSel = document.getElementById("aiFilterSubsystem") || document.getElementById("meetingAiFilterSubsystem");
    if (aiSel && aiSel.value !== sysFilter) {
      aiSel.value = sysFilter;
      this.renderActionItemsTracker();
    }
    const minSel = document.getElementById("minutesFilterSubsystem");
    if (minSel && minSel.value !== sysFilter) {
      minSel.value = sysFilter;
      this.updateMinutesMeetingSelector();
    }
  },

  onMinutesSubsystemFilterChanged() {
    if (!this.confirmLeave(() => this.onMinutesSubsystemFilterChanged())) return;
    this.updateMinutesMeetingSelector();
    const sel = document.getElementById("minutesMeetingSelector");
    if (sel && sel.value) {
      this.openMinutesForMeeting(sel.value);
    } else {
      const container = document.getElementById("minutesEditorContainer");
      if (container) {
        container.innerHTML = `<div class="card" style="padding:30px; text-align:center; color:var(--text-muted); font-size:var(--fs-sm, 12px);">ℹ️ 선택된 서브시스템에 등록된 회의가 없습니다. '새 회의 일정 등록'을 통해 일정을 추가하세요.</div>`;
      }
    }
  },

  // [ver1.0.4 요건 2] 회의록 목록 서브시스템 및 월별(Month) 다중 필터 조회
  getFilteredMinutesMeetings() {
    const minSys = (document.getElementById("minutesFilterSubsystem") && document.getElementById("minutesFilterSubsystem").value) || "ALL";
    const minMonth = (document.getElementById("minutesFilterMonth") && document.getElementById("minutesFilterMonth").value) || "ALL";

    return (meetingsData || []).filter(m => {
      if (minSys !== "ALL" && m.system !== minSys) return false;
      if (minMonth !== "ALL") {
        if (!m.date) return false;
        if (minMonth.length >= 7) {
          if (!m.date.startsWith(minMonth)) return false;
        } else {
          const mNum = parseInt(m.date.split("-")[1], 10);
          if (mNum !== parseInt(minMonth, 10)) return false;
        }
      }
      return true;
    });
  },

  updateMinutesMeetingSelector() {
    const sel = document.getElementById("minutesMeetingSelector");
    if (!sel) return;
    const filteredMtgs = this.getFilteredMinutesMeetings();
    if (filteredMtgs.length === 0) {
      sel.innerHTML = '<option value="">(선택된 조건에 등록된 회의 없음)</option>';
      return;
    }
    sel.innerHTML = filteredMtgs.map(m => `
      <option value="${m.id}" ${m.id === this.currentMeetingId ? "selected" : ""}>
        [${m.system}] ${m.date} ${escapeHtml(m.title)} (${m.status})
      </option>
    `).join("");
    if (!filteredMtgs.some(m => m.id === this.currentMeetingId)) {
      this.currentMeetingId = filteredMtgs[0].id;
      sel.value = this.currentMeetingId;
    }
  },


  // [v3.9.0] 회의가 없는 프로젝트(새 프로젝트 · Task 정보 초기화 뒤)에 예전 예시 회의를 넣지 않음
  ensureInitialData() {
    if (!Array.isArray(meetingsData)) meetingsData = [];
  },

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
            discussion: "작업자 장갑 착용 상태에서 버튼 오터치를 방지하기 위해 10대 다빈도 비가동 사유 1-Touch 입력 레이아웃 시연 및 피드백 청취.",
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
            discussion: "금주 종합 실적 진척률 55% 달성 목표 확인 및 단위과업 일정 준수 상태 점검 예정.",
            decision: "(회의 진행 후 기록 예정)"
          },
          {
            id: "AGD-06",
            order: 2,
            title: "6월 핵심 과업 모듈 개발 환경 및 테스트베드 공동 활용 방안",
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
            assignee: "시스템관리자",
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

  switchSubTab(tabName) {
    if (this.activeSubTab === "minutes" && tabName !== "minutes" && !this.confirmLeave(() => this.switchSubTab(tabName))) return;
    this.activeSubTab = tabName;
    document.querySelectorAll(".meeting-sub-tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.subtab === tabName);
    });
    document.querySelectorAll(".meeting-sub-panel").forEach(panel => {
      panel.style.display = (panel.id === `meeting-panel-${tabName}`) ? "block" : "none";
    });
    this.render();
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
  changeMonth(delta) {
    let m = this.calendarMonth + delta;
    let y = this.calendarYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    this.calendarYear = y;
    this.calendarMonth = m;
    this.renderCalendar();
    this.renderScheduleList();
  },

  setMonth(m) {
    this.calendarMonth = parseInt(m, 10);
    this.renderCalendar();
    this.renderScheduleList();
  },

  renderCalendar() {
    const titleEl = document.getElementById("meetingCalTitle");
    if (titleEl) {
      titleEl.textContent = `${this.calendarYear}년 ${this.calendarMonth}월 회의 캘린더`;
    }
    const monthSel = document.getElementById("meetingCalMonthSelect");
    if (monthSel) {
      monthSel.value = String(this.calendarMonth);
    }

    const gridEl = document.getElementById("meetingCalendarGrid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const y = this.calendarYear;
    const m = this.calendarMonth;
    const firstDay = new Date(y, m - 1, 1).getDay(); // 0(Sun) ~ 6(Sat)
    const totalDays = new Date(y, m, 0).getDate();

    // [ver1.0.4 시인성 고도화] 캘린더 요일 헤더 및 날짜/회의 시인성 100% 보장
    const calCard = document.getElementById("meetingCalendarCard");
    if (calCard) {
      calCard.style.cssText = "background:var(--bg-card, #ffffff); border:1px solid var(--border-color, #cbd5e1); border-radius:8px; overflow:hidden; margin-bottom:14px; width:100%; box-sizing:border-box; color:var(--text-main); box-shadow:0 2px 6px rgba(0,0,0,0.05);";
      const calNav = calCard.querySelector(".cal-nav-bar");
      if (calNav) {
        calNav.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:var(--lvl-1-bg, #f1f5f9); border-bottom:2px solid var(--primary, #1e3a8a); flex-wrap:wrap; gap:10px; color:var(--text-main);";
      }
      const titleSpan = document.getElementById("meetingCalTitle");
      if (titleSpan) {
        titleSpan.style.color = "var(--primary, #1e3a8a)";
        titleSpan.style.fontWeight = "800";
      }
    }

    // Days of week header: High-contrast, theme-resilient colors
    // 평일 요일 타이틀(월,화,수,목,금)이 어떤 테마에서도 100% 선명하게 표시되도록 보장
    const daysArr = [
      { name: "일", color: "#dc2626", bg: "rgba(220, 38, 38, 0.08)", isSun: true },
      { name: "월", color: "var(--text-main, #1e293b)", bg: "var(--lvl-1-bg, #f1f5f9)" },
      { name: "화", color: "var(--text-main, #1e293b)", bg: "var(--lvl-1-bg, #f1f5f9)" },
      { name: "수", color: "var(--text-main, #1e293b)", bg: "var(--lvl-1-bg, #f1f5f9)" },
      { name: "목", color: "var(--text-main, #1e293b)", bg: "var(--lvl-1-bg, #f1f5f9)" },
      { name: "금", color: "var(--text-main, #1e293b)", bg: "var(--lvl-1-bg, #f1f5f9)" },
      { name: "토", color: "#0284c7", bg: "rgba(2, 132, 199, 0.08)", isSat: true }
    ];

    const headerRow = document.createElement("div");
    headerRow.className = "cal-header-row";
    headerRow.style.cssText = "display:grid !important; grid-template-columns:repeat(7, 1fr) !important; width:100%; background:var(--lvl-1-bg, #f1f5f9); border-bottom:2px solid var(--border-color, #cbd5e1); box-sizing:border-box;";
    headerRow.innerHTML = daysArr.map((d, idx) => `
      <div class="cal-header-cell ${d.isSun ? "sunday" : (d.isSat ? "saturday" : "")}" style="padding:10px 4px; text-align:center; font-size:var(--fs-base, 13px); font-weight:800; color:${d.color} !important; background:${d.bg}; border-right:${idx < 6 ? "1px solid var(--border-color, #e2e8f0)" : "none"};">${d.name}</div>
    `).join("");
    gridEl.appendChild(headerRow);

    // Days container with strict 7-column grid
    const daysGrid = document.createElement("div");
    daysGrid.className = "cal-days-grid";
    daysGrid.style.cssText = "display:grid !important; grid-template-columns:repeat(7, 1fr) !important; width:100%; box-sizing:border-box; background:var(--border-color, #e2e8f0); gap:1px;";

    // Blank cells before first day
    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-cell empty";
      blank.style.cssText = "min-height:96px; padding:6px; box-sizing:border-box; background:var(--bg-main, #f8fafc); opacity:0.55; cursor:default;";
      daysGrid.appendChild(blank);
    }

    // [ver1.0.4 요건 1] 시스템 설정의 공휴일/사용자휴일 Map 완벽 구축
    const holidays = (typeof projectConfig !== "undefined" && Array.isArray(projectConfig.holidays)) ? projectConfig.holidays : [];
    const holidayMap = new Map();
    holidays.forEach(h => {
      if (!h) return;
      if (typeof h === "string") {
        holidayMap.set(h, { name: "공휴일", type: "NATIONAL" });
      } else if (h.date) {
        holidayMap.set(h.date, { name: h.name || "휴일", type: h.type || "NATIONAL" });
      }
    });

    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "";
    // [ver1.0.4 요건 2] 캘린더 화면 서브시스템 필터 연동
    const sysFilter = (document.getElementById("meetingFilterSubsystem") && document.getElementById("meetingFilterSubsystem").value) || "ALL";

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayOfWeek = new Date(y, m - 1, day).getDay();
      const isSun = (dayOfWeek === 0);
      const isSat = (dayOfWeek === 6);
      const holidayInfo = holidayMap.get(dateStr);
      const isHoliday = Boolean(holidayInfo);
      const holidayName = holidayInfo ? holidayInfo.name : "";
      const isCustomHoliday = holidayInfo && holidayInfo.type === "CUSTOM";
      const isToday = (dateStr === repDate);

      const cell = document.createElement("div");
      cell.className = `cal-cell ${isSun || isHoliday ? "holiday" : ""} ${isSat ? "saturday" : ""} ${isToday ? "today-cell" : ""}`;
      if (!cell.dataset) cell.dataset = {}; cell.dataset.date = dateStr; cell.setAttribute("data-date", dateStr);
      cell.style.cssText = "min-height:96px; padding:6px; box-sizing:border-box; background:var(--bg-card, #ffffff); cursor:pointer; color:var(--text-main); transition:background 0.15s ease, transform 0.1s ease;";
      if (isHoliday) {
        cell.style.backgroundColor = isCustomHoliday ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)";
      } else if (isToday) {
        cell.style.backgroundColor = "var(--lvl-2-bg, #eff6ff)";
        cell.style.outline = "2px solid var(--primary, #3b82f6)";
        cell.style.zIndex = "1";
      }
      cell.onmouseenter = () => { if (!isToday) cell.style.backgroundColor = "var(--lvl-3-bg, #f1f5f9)"; };
      cell.onmouseleave = () => { if (!isToday) cell.style.backgroundColor = isHoliday ? (isCustomHoliday ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)") : "var(--bg-card, #ffffff)"; };

      // [ver1.0.4 요건 2] 서브시스템 필터 적용된 일자별 회의 목록
      const dayMtgs = (meetingsData || []).filter(item => {
        if (item.date !== dateStr) return false;
        if (sysFilter !== "ALL" && item.system !== sysFilter) return false;
        return true;
      });

      let mtgsHtml = "";
      dayMtgs.forEach(mtg => {
        const sysColor = this.getSubsystemColor(mtg.system);
        const isDone = mtg.status === "완료";
        const isCanceled = mtg.status === "취소";
        const statusBorder = isDone ? "#16a34a" : (isCanceled ? "#94a3b8" : "var(--primary, #1e3a8a)");
        const pillBg = isDone ? "#f0fdf4" : (isCanceled ? "#f8fafc" : "var(--lvl-2-bg, #eff6ff)");
        const pillBorder = isDone ? "#bbf7d0" : (isCanceled ? "#e2e8f0" : "var(--border-color, #cbd5e1)");
        
        mtgsHtml += `
          <div class="cal-meeting-pill ${isDone ? 'done' : (isCanceled ? 'canceled' : 'scheduled')}" 
               style="display:flex; align-items:center; gap:4px; padding:3px 6px; margin-bottom:4px; border-radius:4px; border:1px solid ${pillBorder}; border-left:3.5px solid ${statusBorder} !important; background:${pillBg}; cursor:pointer;"
               data-click="MeetingManager.openMinutesForMeeting" data-click-args="${UiEvents.args(String(mtg.id))}" data-click-stop="1" 
               title="[${mtg.system}] ${escapeHtml(mtg.title)} (${mtg.startTime}~${mtg.endTime})">
            <span class="cal-sys-tag" style="background:${sysColor}; color:#ffffff !important; padding:1px 4px; border-radius:3px; font-size:calc(8.5px * var(--fs-scale, 1)); font-weight:800; flex-shrink:0;">${escapeHtml(mtg.system)}</span>
            <span class="cal-time" style="font-size:calc(9.5px * var(--fs-scale, 1)); font-weight:700; color:var(--text-sub, #475569) !important; flex-shrink:0;">${escapeHtml(mtg.startTime || "")}</span>
            <span class="cal-title" style="font-size:var(--fs-xs, 11px); font-weight:700; color:var(--text-main, #0f172a) !important; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escapeHtml(mtg.title)}</span>
          </div>
        `;
      });

      cell.innerHTML = `
        <div class="cal-date-header">
          <span class="cal-day-num ${isToday ? "badge-today" : ""}" style="font-size:calc(12.5px * var(--fs-scale, 1)); font-weight:800; color:${isToday ? "#ffffff !important" : ((isSun || isHoliday) ? "#dc2626 !important" : (isSat ? "#0284c7 !important" : "var(--text-main, #1e293b) !important"))};">${day}</span>
          ${isHoliday ? `<span class="cal-holiday-tag" title="${escapeHtml(holidayName)}" style="background:${isCustomHoliday ? "#fef3c7" : "#fee2e2"}; color:${isCustomHoliday ? "#b45309" : "#dc2626"}; font-size:var(--fs-2xs, 10px); padding:1px 5px; border-radius:4px; font-weight:bold; margin-left:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:68px; display:inline-block;">${escapeHtml(holidayName)}</span>` : ""}
          <button class="cal-quick-add-btn" data-click="MeetingManager.openNewMeetingModal" data-click-args="${UiEvents.args(String(dateStr))}" title="이 날짜에 회의 등록">＋</button>
        </div>
        <div class="cal-meetings-list">${mtgsHtml}</div>
      `;

      cell.onclick = (e) => {
        if (!e.target.closest(".cal-meeting-pill")) {
          MeetingManager.openNewMeetingModal(dateStr);
        }
      };

      daysGrid.appendChild(cell);
    }

    gridEl.appendChild(daysGrid);
  },

  getSubsystemColor(sys) {
    const palette = {
      "ALL": "#1e3a8a",
      "PMO": "#0f766e",
      "W1": "#2563eb",
      "W2": "#4f46e5",
      "P1": "#7c3aed",
      "A1": "#059669",
      "A2": "#d97706",
      "S1": "#dc2626",
      "MES": "#2563eb",
      "QMS": "#059669"
    };
    return palette[sys] || "#475569";
  },

  renderScheduleList() {
    const tbody = document.getElementById("meetingScheduleTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const sysFilter = (document.getElementById("meetingFilterSubsystem") && document.getElementById("meetingFilterSubsystem").value) || "ALL";
    const monthFilter = (document.getElementById("meetingFilterMonth") && document.getElementById("meetingFilterMonth").value) || "ALL";
    const statusFilter = (document.getElementById("meetingFilterStatus") && document.getElementById("meetingFilterStatus").value) || "ALL";
    const searchWord = ((document.getElementById("meetingSearchInput") && document.getElementById("meetingSearchInput").value) || "").trim().toLowerCase();

    const filtered = (meetingsData || []).filter(m => {
      if (sysFilter !== "ALL" && m.system !== sysFilter) return false;
      if (monthFilter !== "ALL" && (!m.date || !m.date.startsWith(monthFilter))) return false;
      if (statusFilter !== "ALL" && m.status !== statusFilter) return false;
      if (searchWord) {
        const str = `${m.title} ${m.location} ${m.host} ${m.system} ${m.notes || ""}`.toLowerCase();
        if (!str.includes(searchWord)) return false;
      }
      return true;
    });

    // Sort by date desc, then startTime
    filtered.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

    // Update count badge
    const badge = document.getElementById("meetingTotalCountBadge");
    if (badge) badge.textContent = `${filtered.length}건`;

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--text-muted);">ℹ️ 등록된 회의 일정이 없습니다. 새 회의를 등록해주세요.</td></tr>`;
      return;
    }

    filtered.forEach((m, idx) => {
      const tr = document.createElement("tr");
      const sysColor = this.getSubsystemColor(m.system);
      const stColor = m.status === "완료" ? "#15803d" : (m.status === "취소" ? "#94a3b8" : "#2563eb");
      const agCount = (m.agendas || []).length;
      const actCount = (m.actionItems || []).length;
      const actDone = (m.actionItems || []).filter(a => a.status === "완료").length;

      tr.innerHTML = `
        <td style="text-align:center;">${idx + 1}</td>
        <td style="text-align:center;">
          <span class="badge" style="background:${sysColor}; color:white; font-size:var(--fs-xs, 11px); padding:2px 6px;">${escapeHtml(m.system)}</span>
        </td>
        <td>
          <a href="#" data-click="MeetingManager.openMinutesForMeeting" data-click-args="${UiEvents.args(String(m.id))}" style="font-weight:bold; color:#1e40af; text-decoration:none;">
            ${escapeHtml(m.title)}
          </a>
        </td>
        <td style="text-align:center; font-weight:bold;">${m.date}</td>
        <td style="text-align:center;">${m.startTime} ~ ${m.endTime}</td>
        <td>${escapeHtml(m.location || "-")}</td>
        <td style="text-align:center;">${escapeHtml(m.host || "-")}</td>
        <td style="text-align:center;">
          <span style="font-size:var(--fs-xs, 11px); font-weight:bold; color:${stColor}; background:${m.status === "완료" ? "#f0fdf4" : "#eff6ff"}; padding:2px 8px; border-radius:12px; border:1px solid ${stColor};">
            ${m.status}
          </span>
        </td>
        <td style="text-align:center; white-space:nowrap;">
          <button class="btn btn-primary btn-xs" data-click="MeetingManager.openMinutesForMeeting" data-click-args="${UiEvents.args(String(m.id))}" title="회의록 작성 및 안건/ActionItem 편집">📝 회의록</button>
          <button class="btn btn-outline btn-xs" data-click="MeetingManager.openEditMeetingModal" data-click-args="${UiEvents.args(String(m.id))}" title="회의 일정 기본정보 수정">✏️ 수정</button>
          <button class="btn btn-outline btn-xs" data-click="MeetingManager.deleteMeeting" data-click-args="${UiEvents.args(String(m.id))}" style="color:var(--danger);" title="회의 삭제">🗑️ 삭제</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

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

  openEditMeetingModal(id) {
    const m = (meetingsData || []).find(x => x.id === id);
    if (!m) return;
    this.editingMeetingId = id;
    const modal = document.getElementById("meetingScheduleModal");
    if (!modal) return;

    document.getElementById("meetingModalTitle").textContent = "✏️ 회의 일정 정보 수정";
    document.getElementById("modalMtgTitle").value = m.title || "";
    document.getElementById("modalMtgDate").value = m.date || "";
    document.getElementById("modalMtgStartTime").value = m.startTime || "10:00";
    document.getElementById("modalMtgEndTime").value = m.endTime || "11:30";
    document.getElementById("modalMtgLocation").value = m.location || "";
    document.getElementById("modalMtgHost").value = m.host || "";
    document.getElementById("modalMtgStatus").value = m.status || "예정";
    document.getElementById("modalMtgNotes").value = m.notes || "";

    const sysSel = document.getElementById("modalMtgSystem");
    if (sysSel) {
      const subs = getAllSubsystemNames();
      sysSel.innerHTML = `<option value="ALL">ALL (전체 공통)</option>` + subs.map(s => `<option value="${s}">${s}</option>`).join("");
      sysSel.value = m.system || "ALL";
    }

    modal.style.display = "flex";
  },

  closeMeetingModal() {
    const modal = document.getElementById("meetingScheduleModal");
    if (modal) modal.style.display = "none";
  },

  saveMeetingModal() {
    const title = (document.getElementById("modalMtgTitle").value || "").trim();
    const date = document.getElementById("modalMtgDate").value;
    if (!title || !date) {
      showToast("⚠️ 회의 제목과 회의 일자는 필수 입력 항목입니다.", "warning");
      return;
    }

    const sys = document.getElementById("modalMtgSystem").value || "ALL";
    const startTime = document.getElementById("modalMtgStartTime").value || "10:00";
    const endTime = document.getElementById("modalMtgEndTime").value || "11:30";
    const location = (document.getElementById("modalMtgLocation").value || "").trim();
    const host = (document.getElementById("modalMtgHost").value || "").trim();
    const status = document.getElementById("modalMtgStatus").value || "예정";
    const notes = (document.getElementById("modalMtgNotes").value || "").trim();

    if (this.editingMeetingId) {
      const target = meetingsData.find(x => x.id === this.editingMeetingId);
      if (target) {
        target.title = title;
        target.system = sys;
        target.date = date;
        target.startTime = startTime;
        target.endTime = endTime;
        target.location = location;
        target.host = host;
        target.status = status;
        target.notes = notes;
        target.updatedAt = new Date().toISOString().replace("T", " ").substring(0, 19);
        this._syncDraftFields(target, ["title", "system", "date", "startTime", "endTime", "location", "host", "status", "notes"]);
      }
      showToast("✅ 회의 일정이 성공적으로 수정되었습니다.");
    } else {
      const newId = `MTG-${date.replace(/-/g, "")}-${String(meetingsData.length + 1).padStart(2, "0")}`;
      const newMtg = {
        id: newId,
        system: sys,
        title: title,
        date: date,
        startTime: startTime,
        endTime: endTime,
        location: location,
        host: host,
        status: status,
        notes: notes,
        attendees: [
          { name: host, dept: "주관부서", role: "주관/발표", attendance: "참석" }
        ],
        agendas: [
          {
            id: `AGD-${Date.now().toString().slice(-4)}`,
            order: 1,
            title: `${title} - 주요 안건 협의`,
            discussion: "회의 상세 논의 내용 및 발언 요지 기록",
            decision: "합의 사항 및 결정 내역 기록"
          }
        ],
        actionItems: [],
        summary: title,
        updatedAt: new Date().toISOString().replace("T", " ").substring(0, 19)
      };
      meetingsData.push(newMtg);
      this.currentMeetingId = newId;
      showToast("✅ 신규 회의 일정이 성공적으로 등록되었습니다.");
    }

    this.closeMeetingModal();
    this._saveNow();
    this.render();
  },

  deleteMeeting(id) {
    openConfirmDialog("🗑️ 해당 회의 일정과 작성된 회의록 및 도출 Action Item을 삭제하시겠습니까?", () => {
      const idx = meetingsData.findIndex(x => x.id === id);
      if (idx !== -1) {
        meetingsData.splice(idx, 1);
        if (this.currentMeetingId === id) {
          this.currentMeetingId = meetingsData[0] ? meetingsData[0].id : null;
        }
        this._saveNow();
        this.render();
        showToast("🗑️ 회의 일정이 삭제되었습니다.");
      }
    });
  },

  // =========================================================================
  // 2. 회의록 작성 및 상세 편집 (Minutes Editor)
  // =========================================================================
  openMinutesForMeeting(id) {
    if (this._draft && this._draft.id !== id && !this.confirmLeave(() => this.openMinutesForMeeting(id))) return;
    this._rememberFilterSelections();
    this.currentMeetingId = id;
    this.switchSubTab("minutes");
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
          <div style="text-align:center; padding:40px; color:var(--text-muted); background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px;">
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
        <div style="text-align:center; padding:40px; color:var(--text-muted); background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px;">
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
      ? `<span class="badge" style="background:#15803d; color:white;">완료</span>`
      : `<span class="badge" style="background:#2563eb; color:white;">${mtg.status}</span>`;

    container.innerHTML = `
      <!-- 1) 회의 기본 정보 카드 -->
      <div class="card" style="margin-bottom:14px; border-left:4px solid ${sysColor};">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:${sysColor}; color:white; font-size:var(--fs-sm, 12px);">${escapeHtml(mtg.system)}</span>
            <span style="font-size:var(--fs-lg, 16px); font-weight:bold; color:#0f172a;">${escapeHtml(mtg.title)}</span>
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
        <div class="grid-4" style="margin-top:8px; font-size:var(--fs-sm, 12px); background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
          <div><b style="color:#64748b;">📅 회의 일자:</b> <strong>${mtg.date}</strong></div>
          <div><b style="color:#64748b;">⏰ 회의 시간:</b> ${mtg.startTime} ~ ${mtg.endTime}</div>
          <div><b style="color:#64748b;">📍 회의 장소:</b> ${escapeHtml(mtg.location || "-")}</div>
          <div><b style="color:#64748b;">👤 주관/발표:</b> <strong>${escapeHtml(mtg.host || "-")}</strong></div>
        </div>
        <div style="margin-top:8px; font-size:var(--fs-sm, 12px);">
          <b style="color:#475569;">💡 회의 목적 및 총괄 요약:</b>
          <input type="text" id="minutesSummaryInput" value="${escapeHtml(mtg.summary || mtg.title)}" data-change="MeetingManager.updateMinutesSummary" data-change-args='["$value"]' style="width:100%; margin-top:4px; font-size:var(--fs-sm, 12px); padding:4px 8px; border:1px solid #cbd5e1; border-radius:4px;">
        </div>
      </div>

      <!-- 2) 회의 참석자 카드 -->
      <div class="card" style="margin-bottom:14px;">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>👥 회의 참석자 명단 (${(mtg.attendees || []).length}명)</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <select id="selQuickAddUser" style="font-size:var(--fs-xs, 11px); padding:2px 6px;">
              <option value="">-- 등록된 사용자 빠른 선택 --</option>
              ${((typeof projectUsers !== "undefined" && Array.isArray(projectUsers)) ? projectUsers : []).map(u => `<option value="${escapeHtml(u.name)}|${escapeHtml(u.dept)}">${escapeHtml(u.name)} (${escapeHtml(u.dept || u.role)})</option>`).join("")}
            </select>
            <input type="text" id="inCustomAttendee" placeholder="성명(소속/역할)" style="font-size:var(--fs-xs, 11px); padding:2px 6px; width:130px;">
            <button class="btn btn-secondary btn-xs" data-click="MeetingManager.addAttendee">＋ 참석자 추가</button>
          </div>
        </div>
        <div id="attendeesChipsContainer" style="display:flex; flex-wrap:wrap; gap:8px; padding-top:6px;">
          ${((mtg.attendees || []).map((att, aIdx) => `
            <div class="attendee-chip" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:20px; padding:4px 10px; font-size:var(--fs-xs, 11px); display:inline-flex; align-items:center; gap:6px;">
              <span style="font-weight:bold; color:#1e3a8a;">${escapeHtml(att.name)}</span>
              <span style="color:#64748b; font-size:var(--fs-2xs, 10px);">(${escapeHtml(att.dept || "부서")}/${escapeHtml(att.role || "참석")})</span>
              <select data-change="MeetingManager.updateAttendance" data-change-args="${UiEvents.args(aIdx, "$value")}" style="font-size:var(--fs-2xs, 10px); padding:1px 3px; border:none; background:transparent; font-weight:bold; color:${att.attendance === "불참" ? "#dc2626" : "#15803d"};">
                <option value="참석" ${att.attendance !== "불참" && att.attendance !== "위임" ? "selected" : ""}>참석</option>
                <option value="불참" ${att.attendance === "불참" ? "selected" : ""}>불참</option>
                <option value="위임" ${att.attendance === "위임" ? "selected" : ""}>위임</option>
              </select>
              <span data-click="MeetingManager.removeAttendee" data-click-args="${UiEvents.args(aIdx)}" style="cursor:pointer; color:#94a3b8; font-weight:bold; margin-left:2px;" title="참석자 삭제">✕</span>
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
            <div class="agenda-item-card" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px; width:75%;">
                  <span style="background:#1e3a8a; color:white; font-size:var(--fs-xs, 11px); font-weight:bold; padding:2px 8px; border-radius:10px;">안건 #${gIdx + 1}</span>
                  <input type="text" value="${escapeHtml(agd.title)}" data-change="MeetingManager.updateAgendaTitle" data-change-args="${UiEvents.args(gIdx, "$value")}" placeholder="안건 명칭을 입력하세요" style="font-weight:bold; font-size:var(--fs-base, 13px); width:100%; border:1px solid #cbd5e1; border-radius:4px; padding:3px 8px;">
                </div>
                <button class="btn btn-outline btn-xs" data-click="MeetingManager.removeAgenda" data-click-args="${UiEvents.args(gIdx)}" style="color:var(--danger);" title="안건 삭제">🗑️ 안건 삭제</button>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                <div>
                  <label style="font-size:var(--fs-xs, 11px); font-weight:bold; color:#1e40af; display:block; margin-bottom:4px;">
                    💬 논의 내용 및 주요 발언 요지
                  </label>
                  <textarea rows="4" data-change="MeetingManager.updateAgendaDiscussion" data-change-args="${UiEvents.args(gIdx, "$value")}" style="width:100%; font-size:var(--fs-xs, 11px); padding:6px; border:1px solid #cbd5e1; border-radius:4px; resize:vertical;" placeholder="회의 중 논의된 기술적 쟁점, 원인 분석, 상호 발언 요점을 상세히 기록하세요.">${escapeHtml(agd.discussion || "")}</textarea>
                </div>
                <div>
                  <label style="font-size:var(--fs-xs, 11px); font-weight:bold; color:#166534; display:block; margin-bottom:4px;">
                    ✅ 결정 사항 및 실행 합의 내용
                  </label>
                  <textarea rows="4" data-change="MeetingManager.updateAgendaDecision" data-change-args="${UiEvents.args(gIdx, "$value")}" style="width:100%; font-size:var(--fs-xs, 11px); padding:6px; border:1px solid #cbd5e1; border-radius:4px; resize:vertical; background:#f0fdf4;" placeholder="안건 논의 결과 도출된 합의 사항, 후속 일정, 정책 결정을 구체적으로 기록하세요.">${escapeHtml(agd.decision || "")}</textarea>
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
                    <td style="text-align:center; font-weight:bold; color:#1e40af;">${escapeHtml(act.id)}</td>
                    <td style="font-weight:bold;">${escapeHtml(act.title)}</td>
                    <td>${escapeHtml(act.content || "-")}</td>
                    <td style="text-align:center;">${escapeHtml(act.requester || "-")}</td>
                    <td style="text-align:center; font-weight:bold; color:#0369a1;">${escapeHtml(act.assignee || "-")}</td>
                    <td style="text-align:center;">${escapeHtml(act.targetDate || "-")}</td>
                    <td style="text-align:center;">
                      <select data-change="MeetingManager.updateActionItemStatusDirect" data-change-args="${UiEvents.args(String(act.id), "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 4px; font-weight:bold; color:${act.status === "완료" ? "#15803d" : "#2563eb"};">
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
      <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px;">
        <span style="font-size:var(--fs-sm, 12px); color:#64748b;">
          💡 회의록 작성 후 [✅ 작성 완료 (저장)] 버튼을 눌러야 저장됩니다. 저장하지 않고 다른 회의록을 선택하면 저장 여부를 확인합니다.
        </span>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" data-click="MeetingManager.completeMinutes" data-click-args='[true]'>✅ 작성 완료 (저장)</button>
          <button class="btn btn-secondary btn-sm" data-click="UiH.meetingDiscard" title="저장하지 않은 회의록 변경 내용을 취소합니다.">↩️ 변경 취소</button>
          <button class="btn btn-info btn-sm" data-click="MeetingManager.exportMeetingDocx" data-click-args="${UiEvents.args(String(mtg.id))}" style="background:#2563eb; color:white; border-color:#2563eb;">📥 워드 내려받기 (회의록)</button>
          <button class="btn btn-success btn-sm" data-click="MeetingManager.exportMeetingExcel" data-click-args="${UiEvents.args(String(mtg.id))}">📥 엑셀 내려받기 (회의록)</button>
        </div>
      </div>
    `;
  },

  toggleMeetingStatus(id) {
    const m = (meetingsData || []).find(x => x.id === id);
    if (!m) return;
    m.status = (m.status === "완료") ? "진행중" : "완료";
    m.updatedAt = new Date().toISOString().replace("T", " ").substring(0, 19);
    this._syncDraftFields(m, ["status"]);
    this._saveNow();
    this.render();
    showToast(`회의 상태가 [${m.status}]로 갱신되었습니다.`);
  },

  updateMinutesSummary(val) {
    const m = this._editMeeting();
    if (m) {
      m.summary = val.trim();
    }
  },

  addAttendee() {
    const m = this._editMeeting();
    if (!m) return;
    const quickSel = document.getElementById("selQuickAddUser");
    const customIn = document.getElementById("inCustomAttendee");

    let name = "", dept = "부서", role = "참석";
    if (customIn && customIn.value.trim()) {
      const raw = customIn.value.trim();
      name = raw;
      if (raw.includes("(") && raw.includes(")")) {
        name = raw.split("(")[0].trim();
        dept = raw.split("(")[1].replace(")", "").trim();
      }
      customIn.value = "";
    } else if (quickSel && quickSel.value) {
      const parts = quickSel.value.split("|");
      name = parts[0];
      dept = parts[1] || "부서";
    }

    if (!name) {
      showToast("⚠️ 추가할 참석자의 성명을 입력하거나 사용자를 선택하세요.", "warning");
      return;
    }

    if (!Array.isArray(m.attendees)) m.attendees = [];
    m.attendees.push({ name, dept, role, attendance: "참석" });
    this.renderMinutesEditor(this.currentMeetingId);
    showToast(`[${name}] 참석자가 명단에 추가되었습니다.`);
  },

  removeAttendee(idx) {
    const m = this._editMeeting();
    if (m && Array.isArray(m.attendees)) {
      m.attendees.splice(idx, 1);
      this.renderMinutesEditor(this.currentMeetingId);
    }
  },

  updateAttendance(idx, status) {
    const m = this._editMeeting();
    if (m && Array.isArray(m.attendees) && m.attendees[idx]) {
      m.attendees[idx].attendance = status;
    }
  },

  addAgenda() {
    const m = this._editMeeting();
    if (!m) return;
    if (!Array.isArray(m.agendas)) m.agendas = [];
    const newOrder = m.agendas.length + 1;
    m.agendas.push({
      id: `AGD-${Date.now().toString().slice(-4)}`,
      order: newOrder,
      title: `신규 안건 #${newOrder}`,
      discussion: "",
      decision: ""
    });
    this.renderMinutesEditor(this.currentMeetingId);
    showToast(`안건 #${newOrder} 항목이 추가되었습니다.`);
  },

  removeAgenda(idx) {
    const m = this._editMeeting();
    if (!m || !Array.isArray(m.agendas)) return;
    m.agendas.splice(idx, 1);
    m.agendas.forEach((a, i) => a.order = i + 1);
    this.renderMinutesEditor(this.currentMeetingId);
    showToast("안건이 삭제되었습니다.");
  },

  updateAgendaTitle(idx, val) {
    const m = this._editMeeting();
    if (m && m.agendas && m.agendas[idx]) {
      m.agendas[idx].title = val.trim();
    }
  },

  updateAgendaDiscussion(idx, val) {
    const m = this._editMeeting();
    if (m && m.agendas && m.agendas[idx]) {
      m.agendas[idx].discussion = val.trim();
    }
  },

  updateAgendaDecision(idx, val) {
    const m = this._editMeeting();
    if (m && m.agendas && m.agendas[idx]) {
      m.agendas[idx].decision = val.trim();
    }
  },

  saveCurrentMinutes() {
    return this.completeMinutes(true);
  },

  // =========================================================================
  // 3. Action Item 현황 (통합 트래커 & 필터)
  // =========================================================================
  getAllActionItems() {
    const list = [];
    (meetingsData || []).forEach(m => {
      (m.actionItems || []).forEach(act => {
        list.push({
          ...act,
          meetingTitle: m.title,
          meetingDate: m.date,
          meetingSystem: m.system,
          meetingHost: m.host
        });
      });
    });
    return list;
  },

  renderActionItemsTracker() {
    const allActions = this.getAllActionItems();
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";

    // 1) Calculate KPIs
    const totalCount = allActions.filter(a => a.status !== "삭제").length;
    const progCount = allActions.filter(a => a.status === "진행중").length;
    const doneCount = allActions.filter(a => a.status === "완료").length;
    const rate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
    const delayedCount = allActions.filter(a => a.status === "진행중" && a.targetDate && a.targetDate < repDate).length;

    // Update KPI UI
    const elTot = document.getElementById("aiKpiTotal");
    const elProg = document.getElementById("aiKpiProg");
    const elDone = document.getElementById("aiKpiDone");
    const elRate = document.getElementById("aiKpiRate");
    const elDelay = document.getElementById("aiKpiDelay");

    if (elTot) elTot.textContent = `${totalCount}건`;
    if (elProg) elProg.textContent = `${progCount}건`;
    if (elDone) elDone.textContent = `${doneCount}건`;
    if (elRate) elRate.textContent = `${rate}%`;
    if (elDelay) elDelay.textContent = `${delayedCount}건`;

    // 2) Populate Assignee filter options dynamically
    const assFilter = document.getElementById("aiFilterAssignee");
    if (assFilter && assFilter.options.length <= 1) {
      const assignees = Array.from(new Set(allActions.map(a => a.assignee).filter(Boolean)));
      assignees.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        assFilter.appendChild(opt);
      });
    }

    // 3) Filter logic
    const selSys = (document.getElementById("aiFilterSubsystem") && document.getElementById("aiFilterSubsystem").value) || "ALL";
    const selStatus = (document.getElementById("aiFilterStatus") && document.getElementById("aiFilterStatus").value) || "ALL";
    const selAss = (document.getElementById("aiFilterAssignee") && document.getElementById("aiFilterAssignee").value) || "ALL";
    const searchWord = ((document.getElementById("aiSearchInput") && document.getElementById("aiSearchInput").value) || "").trim().toLowerCase();

    // [v3.0.2] 상태 칩: 서브시스템·담당자·검색 조건 범위의 상태별 건수
    if (typeof StatusChips !== "undefined") {
      StatusChips.render("ai", allActions.filter(a => a.status !== "삭제" && (selSys === "ALL" || (a.system || a.meetingSystem) === selSys) && (selAss === "ALL" || a.assignee === selAss) &&
        (!searchWord || `${a.id} ${a.title} ${a.content || ""} ${a.requester || ""} ${a.assignee || ""} ${a.meetingTitle || ""}`.toLowerCase().includes(searchWord))));
    }
    const filtered = allActions.filter(a => {
      if (a.status === "삭제") return false;
      if (selSys !== "ALL" && (a.system || a.meetingSystem) !== selSys) return false;
      if (selStatus !== "ALL") {
        if (selStatus === "지연") {
          if (!(a.status === "진행중" && a.targetDate && a.targetDate < repDate)) return false;
        } else if (a.status !== selStatus) {
          return false;
        }
      }
      if (selAss !== "ALL" && a.assignee !== selAss) return false;
      if (searchWord) {
        const hay = `${a.id} ${a.title} ${a.content || ""} ${a.requester || ""} ${a.assignee || ""} ${a.meetingTitle || ""}`.toLowerCase();
        if (!hay.includes(searchWord)) return false;
      }
      return true;
    });

    // Sort: 진행중 first, then targetDate asc
    filtered.sort((a, b) => {
      if (a.status === "진행중" && b.status === "완료") return -1;
      if (a.status === "완료" && b.status === "진행중") return 1;
      return (a.targetDate || "9999").localeCompare(b.targetDate || "9999");
    });

    const tbody = document.getElementById("aiTrackerTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:24px; color:var(--text-muted);">ℹ️ 조회 조건에 부합하는 Action Item이 없습니다.</td></tr>`;
      return;
    }

    filtered.forEach((act, idx) => {
      const tr = document.createElement("tr");
      const isDelayed = (act.status === "진행중" && act.targetDate && act.targetDate < repDate);
      const sysTag = act.system || act.meetingSystem || "ALL";
      const sysColor = this.getSubsystemColor(sysTag);

      tr.innerHTML = `
        <td style="text-align:center;">${idx + 1}</td>
        <td style="text-align:center; font-weight:bold; color:#1e40af;">${escapeHtml(act.id)}</td>
        <td style="text-align:center;">
          <span class="badge" style="background:${sysColor}; color:white; font-size:var(--fs-2xs, 10px);">${escapeHtml(sysTag)}</span>
        </td>
        <td>
          <a href="#" data-click="MeetingManager.openMinutesForMeeting" data-click-args="${UiEvents.args(String(act.meetingId))}" style="color:#0369a1; text-decoration:none; font-size:var(--fs-xs, 11px);">
            ${escapeHtml(act.meetingTitle || "-")}
          </a>
        </td>
        <td style="text-align:center; font-size:var(--fs-xs, 11px);">${escapeHtml(act.meetingDate || "-")}</td>
        <td style="font-weight:bold;">${escapeHtml(act.title)}</td>
        <td style="font-size:var(--fs-xs, 11px); color:#475569;">${escapeHtml(act.content || "-")}</td>
        <td style="text-align:center; font-size:var(--fs-xs, 11px);">${escapeHtml(act.requester || "-")}</td>
        <td style="text-align:center; font-weight:bold; color:#1e40af;">${escapeHtml(act.assignee || "-")}</td>
        <td style="text-align:center;">
          <span style="font-size:var(--fs-xs, 11px); font-weight:bold; color:${isDelayed ? "#dc2626" : "#334155"}; ${isDelayed ? "background:#fee2e2; padding:2px 6px; border-radius:4px;" : ""}">
            ${escapeHtml(act.targetDate || "-")} ${isDelayed ? "⚠️지연" : ""}
          </span>
        </td>
        <td style="text-align:center;">
          <select data-change="MeetingManager.updateActionItemStatusDirect" data-change-args="${UiEvents.args(String(act.id), "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 4px; font-weight:bold; color:${act.status === "완료" ? "#15803d" : "#2563eb"};">
            <option value="진행중" ${act.status === "진행중" ? "selected" : ""}>진행중</option>
            <option value="완료" ${act.status === "완료" ? "selected" : ""}>완료</option>
            <option value="삭제" ${act.status === "삭제" ? "selected" : ""}>삭제</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });
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

  openEditActionItemModal(actionId) {
    let targetAct = null;
    let targetMtg = null;
    (meetingsData || []).forEach(m => {
      (m.actionItems || []).forEach(a => {
        if (a.id === actionId) {
          targetAct = a;
          targetMtg = m;
        }
      });
    });
    if (!targetAct) return;

    this.editingActionItemId = actionId;
    const modal = document.getElementById("actionItemEditModal");
    if (!modal) return;
    document.getElementById("actionItemModalTitle").textContent = "✏️ Action Item 정보 수정";
    document.getElementById("modalAiMeetingId").value = targetMtg ? targetMtg.id : "";
    document.getElementById("modalAiTitle").value = targetAct.title || "";
    document.getElementById("modalAiContent").value = targetAct.content || "";
    document.getElementById("modalAiRequester").value = targetAct.requester || "";
    document.getElementById("modalAiAssignee").value = targetAct.assignee || "";
    document.getElementById("modalAiTargetDate").value = targetAct.targetDate || "";
    document.getElementById("modalAiStatus").value = targetAct.status || "진행중";
    modal.style.display = "flex";
  },

  closeActionItemModal() {
    const modal = document.getElementById("actionItemEditModal");
    if (modal) modal.style.display = "none";
  },

  // [ver1.0.4 요건 3] 기준정보 Action Item ID 접두사(prefix) 연동 채번기
  generateActionItemId(meeting) {
    if (typeof getNextEntityId === "function") {
      try {
        return getNextEntityId("ACT", meeting ? meeting.system : "ALL");
      } catch (e) {}
    }
    const c = (typeof projectConfig !== "undefined" && projectConfig.idPrefixConfig) || {};
    const prefix = (c.actPrefix || "ACT").trim().replace(/-+$/, "");
    const sCode = meeting ? (typeof WBSEngine !== "undefined" ? WBSEngine.getSubsystemCode(meeting.system) : meeting.system) : "";
    const allActions = this.getAllActionItems();
    const count = allActions.length + 1;
    if (c.actUseSubCode !== false && sCode && sCode !== "ALL") {
      return `${prefix}-${sCode}-${String(count).padStart(2, "0")}`;
    }
    return `${prefix}-${String(count).padStart(2, "0")}`;
  },

  saveActionItemModal() {
    const title = (document.getElementById("modalAiTitle").value || "").trim();
    const meetingId = document.getElementById("modalAiMeetingId").value;
    if (!title || !meetingId) {
      showToast("⚠️ Action Item 명칭과 연계 회의는 필수입니다.", "warning");
      return;
    }

    const m = (meetingsData || []).find(x => x.id === meetingId);
    if (!m) {
      showToast("⚠️ 연계할 회의를 찾을 수 없습니다.", "error");
      return;
    }
    if (!Array.isArray(m.actionItems)) m.actionItems = [];

    const content = (document.getElementById("modalAiContent").value || "").trim();
    const requester = (document.getElementById("modalAiRequester").value || "").trim();
    const assignee = (document.getElementById("modalAiAssignee").value || "").trim();
    const targetDate = document.getElementById("modalAiTargetDate").value;
    const status = document.getElementById("modalAiStatus").value || "진행중";

    if (this.editingActionItemId) {
      const act = m.actionItems.find(x => x.id === this.editingActionItemId);
      if (act) {
        act.title = title;
        act.content = content;
        act.requester = requester;
        act.assignee = assignee;
        act.targetDate = targetDate;
        act.status = status;
      }
      showToast("✅ Action Item이 수정되었습니다.");
    } else {
      const newId = this.generateActionItemId(m);
      m.actionItems.push({
        id: newId,
        meetingId: m.id,
        title: title,
        content: content,
        requester: requester,
        assignee: assignee,
        system: m.system,
        meetingDate: m.date,
        targetDate: targetDate,
        status: status
      });
      showToast("✅ 신규 Action Item이 성공적으로 등록되었습니다.");
    }

    this.closeActionItemModal();
    this._saveNow();
    this.render();
  },

  updateActionItemStatusDirect(actionId, newStatus) {
    (meetingsData || []).forEach(m => {
      (m.actionItems || []).forEach(a => {
        if (a.id === actionId) {
          a.status = newStatus;
        }
      });
    });
    this._saveNow();
    this.render();
    showToast(`Action Item 상태가 [${newStatus}]로 갱신되었습니다.`);
  },

  deleteActionItemDirect(actionId) {
    openConfirmDialog("🗑️ 해당 Action Item을 삭제 처리하시겠습니까?", () => {
      (meetingsData || []).forEach(m => {
        const idx = (m.actionItems || []).findIndex(a => a.id === actionId);
        if (idx !== -1) {
          m.actionItems.splice(idx, 1);
        }
      });
      this._saveNow();
      this.render();
      showToast("🗑️ Action Item이 삭제되었습니다.");
    });
  },

  // =========================================================================
  // 4. 주간보고 및 파일 내보내기 연동 (Weekly Report & Export Integration)
  // =========================================================================
  getWeeklyMeetings(startDate, endDate) {
    return (meetingsData || []).filter(m => m.date >= startDate && m.date <= endDate);
  },

  getNextWeekMeetings(startDate, endDate) {
    return (meetingsData || []).filter(m => m.date >= startDate && m.date <= endDate);
  },

  // 회의록 단독 워드 생성
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
    showToast(`📄 [회의록 워드 내려받기 완료] ${filename} 파일이 저장되었습니다.`);
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
    showToast(`📊 [회의록 엑셀 내려받기 완료] ${filename} 파일이 저장되었습니다.`);
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
    showToast(`📊 [Action Items 엑셀 내려받기 완료] ${filename} 파일이 저장되었습니다.`);
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
    showToast(`📊 [회의일정 엑셀 내려받기 완료] ${filename} 파일이 저장되었습니다.`);
  },
};

window.MeetingManager = MeetingManager;
