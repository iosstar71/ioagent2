// =============================================================================
// Action Item (MeetingManager 의 일부) — 현황표 · 입력 창 · 상태 바꾸기
// modules/meeting/meeting-manager.js 다음에 불러옴
// =============================================================================
Object.assign(MeetingManager, {


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
    const rate = Metrics.pct(doneCount, totalCount);
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

    // 상태 칩: 서브시스템·담당자·검색 조건 범위의 상태별 건수
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


  // 기준정보 Action Item ID 접두사(prefix) 연동 채번기
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
});
