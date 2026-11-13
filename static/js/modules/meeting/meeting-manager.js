/**
 * =========================================================================
 * Project Mgmt ver1.0.7
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

  // 예시 회의는 넣지 않음 (빈 상태로 시작)
  getDefaultMeetings() { return []; },

  switchSubTab(tabName) {
    if (tabName !== "actionitems" && typeof RecordPanel !== "undefined" && RecordPanel._kind === "action") RecordPanel.close();
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
      calCard.style.cssText = "background:var(--bg-card, #ffffff); border:1px solid var(--border-color, var(--border-color)); border-radius:8px; overflow:hidden; margin-bottom:14px; width:100%; box-sizing:border-box; color:var(--text-main); box-shadow:0 2px 6px rgba(0,0,0,0.05);";
      const calNav = calCard.querySelector(".cal-nav-bar");
      if (calNav) {
        calNav.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:var(--lvl-1-bg, var(--bg-main)); border-bottom:2px solid var(--primary, var(--tint-info-text)); flex-wrap:wrap; gap:10px; color:var(--text-main);";
      }
      const titleSpan = document.getElementById("meetingCalTitle");
      if (titleSpan) {
        titleSpan.style.color = "var(--primary, var(--tint-info-text))";
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
    headerRow.style.cssText = "display:grid !important; grid-template-columns:repeat(7, 1fr) !important; width:100%; background:var(--lvl-1-bg, var(--bg-main)); border-bottom:2px solid var(--border-color, var(--border-color)); box-sizing:border-box;";
    headerRow.innerHTML = daysArr.map((d, idx) => `
      <div class="cal-header-cell ${d.isSun ? "sunday" : (d.isSat ? "saturday" : "")}" style="padding:10px 4px; text-align:center; font-size:var(--fs-base, 13px); font-weight:800; color:${d.color} !important; background:${d.bg}; border-right:${idx < 6 ? "1px solid var(--border-color, var(--border-color))" : "none"};">${d.name}</div>
    `).join("");
    gridEl.appendChild(headerRow);

    // Days container with strict 7-column grid
    const daysGrid = document.createElement("div");
    daysGrid.className = "cal-days-grid";
    daysGrid.style.cssText = "display:grid !important; grid-template-columns:repeat(7, 1fr) !important; width:100%; box-sizing:border-box; background:var(--border-color, var(--border-color)); gap:1px;";

    // Blank cells before first day
    for (let i = 0; i < firstDay; i++) {
      const blank = document.createElement("div");
      blank.className = "cal-cell empty";
      blank.style.cssText = "min-height:96px; padding:6px; box-sizing:border-box; background:var(--bg-main, var(--bg-main)); opacity:0.55; cursor:default;";
      daysGrid.appendChild(blank);
    }

    // [ver1.0.4 요건 1] 시스템 설정의 공휴일/작업자휴일 Map 완벽 구축
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
        cell.style.backgroundColor = "var(--lvl-2-bg, var(--tint-info))";
        cell.style.outline = "2px solid var(--primary, var(--primary))";
        cell.style.zIndex = "1";
      }
      cell.onmouseenter = () => { if (!isToday) cell.style.backgroundColor = "var(--lvl-3-bg, var(--bg-main))"; };
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
            <span class="cal-time" style="font-size:calc(9.5px * var(--fs-scale, 1)); font-weight:700; color:var(--text-sub, var(--text-sub)) !important; flex-shrink:0;">${escapeHtml(mtg.startTime || "")}</span>
            <span class="cal-title" style="font-size:var(--fs-xs, 11px); font-weight:700; color:var(--text-main, var(--text-main)) !important; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${escapeHtml(mtg.title)}</span>
          </div>
        `;
      });

      cell.innerHTML = `
        <div class="cal-date-header">
          <span class="cal-day-num ${isToday ? "badge-today" : ""}" style="font-size:calc(12.5px * var(--fs-scale, 1)); font-weight:800; color:${isToday ? "#ffffff !important" : ((isSun || isHoliday) ? "var(--chart-bad-text) !important" : (isSat ? "var(--primary) !important" : "var(--text-main, var(--text-main)) !important"))};">${day}</span>
          ${isHoliday ? `<span class="cal-holiday-tag" title="${escapeHtml(holidayName)}" style="background:${isCustomHoliday ? "var(--tint-warn)" : "#fee2e2"}; color:${isCustomHoliday ? "var(--chart-warn-text)" : "var(--chart-bad-text)"}; font-size:var(--fs-2xs, 10px); padding:1px 5px; border-radius:4px; font-weight:bold; margin-left:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:68px; display:inline-block;">${escapeHtml(holidayName)}</span>` : ""}
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
          <a href="#" data-click="MeetingManager.openMinutesForMeeting" data-click-args="${UiEvents.args(String(m.id))}" style="font-weight:bold; color:var(--tint-info-text); text-decoration:none;">
            ${escapeHtml(m.title)}
          </a>
        </td>
        <td style="text-align:center; font-weight:bold;">${m.date}</td>
        <td style="text-align:center;">${m.startTime} ~ ${m.endTime}</td>
        <td>${escapeHtml(m.location || "-")}</td>
        <td style="text-align:center;">${escapeHtml(m.host || "-")}</td>
        <td style="text-align:center;">
          <span style="font-size:var(--fs-xs, 11px); font-weight:bold; color:${stColor}; background:${m.status === "완료" ? "var(--tint-ok)" : "var(--tint-info)"}; padding:2px 8px; border-radius:12px; border:1px solid ${stColor};">
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
    document.getElementById("modalMtgHost").value = (AuthManager.getCurrentUser() || {}).name || "";
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
              <span style="color:var(--text-muted); font-size:var(--fs-2xs, 10px);">(${escapeHtml(att.dept || "부서")}/${escapeHtml(att.role || "참석")})</span>
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
      showToast("⚠️ 추가할 참석자의 성명을 입력하거나 멤버를 선택하세요.", "warning");
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
      tr.setAttribute("data-rec-key", String(act.id));
      tr.className = "ai-row";
      tr.title = "행을 누르면 오른쪽에서 수정합니다";
      const opt = v => `<option value="${v}"${act.status === v ? " selected" : ""}>${v}</option>`;
      tr.innerHTML = `
        <td class="ai-c">${idx + 1}</td>
        <td class="ai-c ai-id">${escapeHtml(act.id)}</td>
        <td class="ai-c"><span class="badge ai-sys" data-sys-color="${escapeAttr(this.getSubsystemColor(sysTag))}">${escapeHtml(sysTag)}</span></td>
        <td><a href="#" class="ai-link" data-click="MeetingManager.openMinutesForMeeting" data-click-args="${UiEvents.args(String(act.meetingId))}">${escapeHtml(act.meetingTitle || "-")}</a></td>
        <td class="ai-c ai-sm">${escapeHtml(act.meetingDate || "-")}</td>
        <td class="ai-title">${escapeHtml(act.title)}</td>
        <td class="ai-sm ai-sub">${escapeHtml(act.content || "-")}</td>
        <td class="ai-c ai-sm">${escapeHtml(act.requester || "-")}</td>
        <td class="ai-c ai-id">${escapeHtml(act.assignee || "-")}</td>
        <td class="ai-c"><span class="ai-due${isDelayed ? " is-late" : ""}">${escapeHtml(act.targetDate || "-")} ${isDelayed ? "⚠️지연" : ""}</span></td>
        <td class="ai-c ai-act">
          <select class="ai-status" data-state="${act.status === "완료" ? "done" : "open"}" data-change="MeetingManager.updateActionItemStatusDirect" data-change-args="${UiEvents.args(String(act.id), "$value")}">${opt("진행중")}${opt("완료")}${opt("삭제")}</select>
        </td>
      `;
      const sys = tr.querySelector(".ai-sys");
      if (sys) sys.style.background = sys.getAttribute("data-sys-color");
      tbody.appendChild(tr);
    });
    if (typeof RecordPanel !== "undefined") RecordPanel.decorate("action");
  },

  // 오른쪽 패널에서 고친 값 반영 (Action Item 목록 · 회의록 화면 공통)
  updateActionItemField(actionId, field, value) {
    const ok = ["title", "content", "requester", "assignee", "targetDate", "status"];
    if (ok.indexOf(field) === -1) return;
    if (field === "title" && !String(value || "").trim()) { showToast("⚠️ Action Item 명칭은 비울 수 없습니다.", "warning"); return; }
    let hit = null;
    (meetingsData || []).forEach(m => (m.actionItems || []).forEach(a => { if (String(a.id) === String(actionId)) hit = a; }));
    if (!hit) return;
    hit[field] = field === "targetDate" || field === "status" ? value : String(value || "").trim();
    this._saveNow();
    this.render();
  },
  // 패널의 [회의록 열기]
  openMinutesFromPanel(meetingId) {
    if (typeof RecordPanel !== "undefined") RecordPanel.close();
    this.openMinutesForMeeting(meetingId);
  },

  openAddActionItemModal(meetingId) {
    this.editingActionItemId = null;
    const modal = document.getElementById("actionItemEditModal");
    if (!modal) return;
    document.getElementById("actionItemModalTitle").textContent = "⚡ 신규 Action Item 도출 등록";
    document.getElementById("modalAiMeetingId").value = meetingId || this.currentMeetingId || "";
    document.getElementById("modalAiTitle").value = "";
    document.getElementById("modalAiContent").value = "";
    document.getElementById("modalAiRequester").value = (AuthManager.getCurrentUser() || {}).name || "";
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

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";
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

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";

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
    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";

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

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";
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
};

window.MeetingManager = MeetingManager;
