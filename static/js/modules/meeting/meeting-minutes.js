// =============================================================================
// 회의록 작성 (MeetingManager 의 일부) — 편집본(draft)에 쓰고 [작성 완료] 때 저장. 참석자 · 안건
// modules/meeting/meeting-manager.js 다음에 불러옴
// =============================================================================
Object.assign(MeetingManager, {

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
});
