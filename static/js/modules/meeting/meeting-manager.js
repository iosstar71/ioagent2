/**
 * =========================================================================
 * PM Hub
 * 모듈명: MeetingManager (회의일정 캘린더 · 회의록 작성 · Action Item 통합 관리)
 * =========================================================================
 * 주요 기능:
 * 1) 🗓️ 회의일정 관리: 연도/월별 인터랙티브 프로젝트 캘린더 및 일정 CRUD
 * 2) 📝 회의록 작성: 회의 기본정보, 참석자 관리, 안건별 상세 논의/결정사항, 도출 Action Item 연계
 * 3) ⚡ Action Item 현황: 전사/서브시스템/일자/상태별 통합 트래커 및 원클릭 상태 전환
 * 4) 📄 보고서 연동: 회의록 독립 워드/XLSX 다운로드 및 주간보고 연계
 * 회의록은 편집본(draft)에 작성 → [✅ 작성 완료] 클릭 시 저장
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

  // 회의 관리 전용 서브시스템 드롭다운 동적 연동
  // 회의 일정 및 회의록 월별(Month) 필터 드롭다운 옵션 구축
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

  // 회의록 목록 서브시스템 및 월별(Month) 다중 필터 조회
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


  // 회의가 없는 프로젝트(새 프로젝트 · Task 정보 초기화 뒤)에 예전 예시 회의를 넣지 않음
  ensureInitialData() {
    if (!Array.isArray(meetingsData)) meetingsData = [];
  },


  switchSubTab(tabName) {
    if (tabName !== "actionitems" && typeof RecordPanel !== "undefined" && RecordPanel._kind === "action") RecordPanel.close();
    if (this.activeSubTab === "minutes" && tabName !== "minutes" && !this.confirmLeave(() => this.switchSubTab(tabName))) return;
    this.activeSubTab = tabName;
    document.querySelectorAll("#meetingSubTabs [data-subtab]").forEach(btn => {
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
};

window.MeetingManager = MeetingManager;
