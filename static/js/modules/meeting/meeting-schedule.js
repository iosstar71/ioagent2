// =============================================================================
// 회의일정 (MeetingManager 의 일부) — 달력 · 일정 목록 · 일정 입력 창
// modules/meeting/meeting-manager.js 다음에 불러옴
// =============================================================================
Object.assign(MeetingManager, {

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
    const calStatus = (document.getElementById("meetingFilterStatus") || {}).value || "ALL";
    const firstDay = new Date(y, m - 1, 1).getDay(); // 0(Sun) ~ 6(Sat)
    const totalDays = new Date(y, m, 0).getDate();

    // 캘린더 요일 헤더 및 날짜/회의 시인성 100% 보장
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

    // 시스템 설정의 공휴일/작업자휴일 Map 완벽 구축
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
    // 캘린더 화면 서브시스템 필터 연동
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

      // 서브시스템 필터 적용된 일자별 회의 목록
      const dayMtgs = (meetingsData || []).filter(item => {
        if (item.date !== dateStr) return false;
        if (sysFilter !== "ALL" && item.system !== sysFilter) return false;
        if (calStatus !== "ALL" && item.status !== calStatus) return false;   // 상태 필터는 캘린더와 목록에 함께 적용
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
    // 상태 버튼(칩): 상태를 뺀 나머지 조건에 맞는 회의 수
    if (typeof StatusChips !== "undefined") StatusChips.render("mtg", (meetingsData || []).filter(m => {
      if (sysFilter !== "ALL" && m.system !== sysFilter) return false;
      if (monthFilter !== "ALL" && (!m.date || !m.date.startsWith(monthFilter))) return false;
      if (searchWord && !`${m.title} ${m.location} ${m.host} ${m.system} ${m.notes || ""}`.toLowerCase().includes(searchWord)) return false;
      return true;
    }));

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
  // 4. 주간보고 및 파일 내보내기 연동 (Weekly Report & Export Integration)
  // =========================================================================
  getWeeklyMeetings(startDate, endDate) {
    return (meetingsData || []).filter(m => m.date >= startDate && m.date <= endDate);
  },


  getNextWeekMeetings(startDate, endDate) {
    return (meetingsData || []).filter(m => m.date >= startDate && m.date <= endDate);
  },
});
