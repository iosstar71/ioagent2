// =============================================================================
// 주간보고 화면 (WeeklyReportManager 의 일부) — 목록 · 작성 화면 그리기 · 입력 읽기 · 크기 표시 · 지난 보고 창
// 보고서 만들기 · 저장 · 범위 규칙은 modules/weekly/weekly-report.js. 그 다음에 불러옴
// =============================================================================
Object.assign(WeeklyReportManager, {

  populateWeekDropdown() {
    const sel = document.getElementById("wrWeekSelect");
    if (!sel) return;
    const curW = this.listWeek || this.selectedWeek || 1;
    sel.innerHTML = this.getAllWeeks().map(w => `<option value="${w.weekNum}">${escapeHtml(w.fullLabel)}</option>`).join("");
    sel.value = String(curW);
  },


  // 작성 단위 선택: 종합 / 서브시스템별 (v1.0.9: 분야별 보고서 제외)
  populateSubsystemDropdown() {
    const sel = document.getElementById("wrSubsystemSelect");
    if (!sel) return;
    const opt = (v, label) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`;
    sel.innerHTML =
      opt("ALL|", "📊 종합 (전체)") +
      `<optgroup label="서브시스템별">${getAllSubsystemNames().map(s => opt(`SYS|${s}`, `🔧 ${s}`)).join("")}</optgroup>`;
    sel.value = `${this.scope || "ALL"}|${this.scopeValue || ""}`;
  },


  _listRow(weekLabel, weekNum, sc, r, isCur, mine) {
    const status = r ? ((r.status || "DONE") === "DONE" ? '<span class="status-tag tag-completed">작성완료</span>' : '<span class="status-tag tag-progress">작성중</span>') : '<span class="status-tag tag-ready">미작성</span>';
    const arg = UiEvents.args(weekNum, sc.scope, String(sc.value || ""));
    return `<tr class="wr-list-row ${isCur ? "active" : ""}" data-click="WeeklyReportManager.openUnit" data-click-args="${arg}">
      <td>${escapeHtml(weekLabel)}</td>
      <td>${sc.scope === "ALL" ? "📊 " : sc.scope === "DOMAIN" ? "🏢 " : "🔧 "}${escapeHtml(this.scopeLabel(sc.scope, sc.value))}${mine ? " ⭐" : ""}</td>
      <td>${escapeHtml(r ? (r.author || "-") : "-")}</td>
      <td class="u-tc">${status}</td>
      <td class="u-tc">${r ? `${(r.currentWeekTasks || []).length} / ${(r.nextWeekTasks || []).length}` : "-"}</td>
      <td class="u-fs-xs">${escapeHtml(r ? (r.updatedAt || "-") : "-")}</td>
      <td class="u-tc"><button class="btn btn-xs" data-btn="${r ? "nav" : "add"}" data-click="WeeklyReportManager.openUnit" data-click-args="${arg}" data-click-stop="1" title="${r ? "저장된 보고서 보기" : "이 단위의 주간보고를 생성합니다 (WBS 기준 자동 편성)"}">${r ? "보기" : "📝 생성"}</button></td>
    </tr>`;
  },


  renderSavedList() {
    const body = document.getElementById("wrSavedListBody");
    if (!body) return;
    const own = Permission.ownSubsystem();
    const cur = this.currentWeekReport;
    const isCurRow = (weekNum, sc) => !!cur && cur.weekNo === weekNum && (cur.scope || "ALL") === sc.scope && (cur.scopeValue || "") === (sc.value || "");
    const showAll = document.getElementById("wrListShowAll") && document.getElementById("wrListShowAll").checked;
    const summary = document.getElementById("wrListSummary");
    if (showAll) {
      const list = (weeklyReportsData || []).filter(r => r.scope !== "DOMAIN").sort((a, b) => (b.weekNo - a.weekNo) || String(a.id).localeCompare(String(b.id)));
      if (summary) summary.textContent = `저장된 보고서 ${list.length}건`;
      body.innerHTML = list.length
        ? list.map(r => { const sc = this.reportScope(r); return this._listRow(r.weekLabel || ("W" + r.weekNo), r.weekNo, sc, r, isCurRow(r.weekNo, sc), sc.scope === "SYS" && SubsysList.has(own, sc.value) && !SubsysList.isAll(own)); }).join("")
        : `<tr><td class="u-tc u-p-14 u-c-muted" colspan="7">저장된 주간보고가 없습니다.</td></tr>`;
      return;
    }
    const weeks = this.getAllWeeks();
    const wNum = this.listWeek || this.selectedWeek || (this.findWeekForDate(projectConfig.reportDate) || {}).weekNum;
    const wObj = weeks.find(w => w.weekNum === wNum) || weeks[0];
    if (!wObj) { body.innerHTML = ""; return; }
    let units = this._unitsOfWeek();
    // 일반 작업자: 담당 서브시스템을 맨 위에 표시
    if (!Permission.canEditAllSubsystems()) units = units.sort((a, b) => (b.scope === "SYS" && SubsysList.has(own, b.value)) - (a.scope === "SYS" && SubsysList.has(own, a.value)));
    const rows = units.map(sc => ({ sc, r: this._findSaved(wObj, sc.scope, sc.value) }));
    const done = rows.filter(x => x.r).length;
    if (summary) summary.textContent = `작성 ${done} / ${rows.length} 단위`;
    body.innerHTML = rows.map(({ sc, r }) => this._listRow(wObj.fullLabel, wObj.weekNum, sc, r, isCurRow(wObj.weekNum, sc), sc.scope === "SYS" && SubsysList.has(own, sc.value) && !SubsysList.isAll(own))).join("");
  },

  renderSizeMeter() {
    const el = document.getElementById("wrSizeMeter");
    if (!el || !this.currentWeekReport) return;
    const size = this.reportSize();
    const pct = Math.min(100, Math.round(size / this.MAX_REPORT_CHARS * 100));
    el.className = "wr-size-meter" + (pct >= 100 ? " over" : pct >= 85 ? " warn" : "");
    el.innerHTML = `📏 보고서 크기 <b>${size.toLocaleString()}</b> / ${this.MAX_REPORT_CHARS.toLocaleString()}자 <span class="wr-size-bar"><span style="width:${pct}%"></span></span>`;
    el.title = "엑셀 셀 최대 32,767자 제한에 맞춰 주간보고 1건의 전체 내용을 32,000자 이내로 제한합니다.";
  },

  onSizeInput() {
    this.readInputsIntoCurrentReport();
    this.renderSizeMeter();
  },

  _fillAddSelects() {
    [["cur", "wrAddCurWbsSelect"], ["nxt", "wrAddNxtWbsSelect"]].forEach(([kind, id]) => {
      const sel = document.getElementById(id);
      if (!sel || !this.currentWeekReport) return;
      const cands = this._candidateTasks(kind);
      sel.innerHTML = `<option value="">-- 추가할 WBS Task 선택 (${cands.length}건) --</option>` +
        cands.map(t => `<option value="${escapeHtml(t.id)}">[${escapeHtml(t.system)}] ${escapeHtml(t.id)} ${escapeHtml(t.name)}</option>`).join("");
    });
  },


  renderScopeBanner() {
    const el = document.getElementById("wrScopeBanner");
    if (!el || !this.currentWeekReport) return;
    const rep = this.currentWeekReport;
    const writable = this.canWrite(rep);
    const saved = (weeklyReportsData || []).some(r => r.id === rep.id);
    const dirty = this._canon(rep) !== this._draftBase;
    el.innerHTML = `📝 <b>${escapeHtml(rep.weekLabel)}</b> · 작성 단위: <b>${escapeHtml(this.scopeLabel(this.scope, this.scopeValue))}</b>
      · 상태: <b>${saved ? "저장됨" : "신규 (미저장)"}</b>${dirty ? ' · <span class="u-bold" style="color:var(--chart-warn-text);">● 변경 내용 있음 (작성 완료를 눌러 저장)</span>' : ""}
      ${writable ? "" : ` · <span class="u-bold" style="color:var(--chart-bad-text);">🔒 조회 전용 (담당 서브시스템 ${escapeHtml(Permission.ownSubsystem())} 보고서만 저장 가능)</span>`}
      ${rep.snapshot ? `<span class="wr-basis snap" title="지표·요구사항·VOC·회의·Action Item 은 작성 완료 시점 자료로 표시·다운로드 합니다.">📌 작성 완료 시점 자료 (${escapeHtml(rep.snapshot.takenAt)})</span>`
        : `<span class="wr-basis live" title="작성 완료하면 그 시점의 자료가 보고서와 함께 저장됩니다.">⏱ 현재 자료 기준</span>`}
      <div class="wr-docno">문서 번호 <code>${escapeHtml(WeeklyExport.docNo(rep))}</code></div>`;
    const btn = document.getElementById("btnWrComplete");
    if (btn) {
      btn.disabled = !writable;
      btn.style.opacity = writable ? "1" : "0.5";
    }
  },


  // 금주/차주 항목 행 (WBS 연동 항목 / 직접 입력 항목)
  _taskRow(kind, t) {
    const tr = document.createElement("tr");
    const id = escapeHtml(t.id);
    const k = `'${kind}', '${id}'`;
    const sysCell = t.manual
      ? `<select class="u-fs-xs" style="width:96px;" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "system", "$value")}">${this.scopeSystems(this.scope, this.scopeValue).map(sy => `<option value="${escapeHtml(sy)}" ${sy === t.system ? "selected" : ""}>${escapeHtml(sy)}</option>`).join("")}</select>`
      : `<span class="badge u-bg-main u-c-sub">${escapeHtml(t.system)}</span>`;
    const nameCell = t.manual
      ? `<input type="text" class="wr-manual-name u-w100 u-fs-xs u-bold" maxlength="200" value="${escapeHtml(t.name || "")}" placeholder="보고 항목명 입력" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "name", "$value")}">`
      : escapeHtml(t.name);
    const sched = t.manual
      ? `<input type="date" value="${escapeHtml(t.pEnd || "")}" style="font-size:var(--fs-2xs, 10px); width:120px;" title="목표일 (선택)" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "pEnd", "$value")}">`
      : `<span class="u-c-sub u-nowrap u-bg-main u-r-3 u-bd" style="font-size:var(--fs-2xs, 10px); padding:2px 5px;">📅 ${escapeHtml(t.pStart || "-")} ~ ${escapeHtml(t.pEnd || "-")}</span>`;
    const statusOpts = (kind === "cur" ? ["완료", "진행중", "지연", "계획"] : ["계획", "진행중"])
      .map(v => `<option value="${v}" ${t.status === v ? "selected" : ""}>${v}</option>`).join("");
    const detail = `<textarea class="wr-detail" rows="2" maxlength="1000" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "detail", "$value")}">${escapeHtml(t.detail || "")}</textarea>`;
    // 담당자: WBS 과업은 WBS 담당자(보고서에 함께 저장), 직접 입력 항목은 입력
    const ownerCell = t.manual
      ? `<input class="u-w100 u-fs-xs" type="text" maxlength="40" list="wbsOwnerList" value="${escapeHtml(t.owner || "")}" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "owner", "$value")}">`
      : `<span class="wr-owner">${escapeHtml(t.owner || "-")}</span>`;
    const remove = `<button class="btn btn-xs" data-btn="danger" title="이 항목을 보고서에서 제외" data-click="WeeklyReportManager.removeItem" data-click-args="${UiEvents.args(k)}">✕</button>`;
    const wbsCell = t.manual ? `<span class="wr-manual-tag">직접입력</span>` : `<strong>${escapeHtml(t.wbsId)}</strong>`;
    const lvl = t.manual ? "-" : `L${t.level || 4}`;
    const done = t.manual ? "" : (t.aEnd || (t.aProg >= 100 ? (t.pEnd || "") : ""));
    const schedCell = t.manual ? sched : `<div class="wr-sched">${escapeHtml(t.pStart || "-")} ~ ${escapeHtml(t.pEnd || "-")}${kind === "cur" && done ? `<br><b>완료 ${escapeHtml(done)}</b>` : ""}</div>`;
    const idCell = `${wbsCell}${t.manual ? "" : `<span class="wr-lvl">${lvl}</span>`}`;
    tr.innerHTML = kind === "cur" ? `
      <td>${sysCell}</td><td>${idCell}</td><td class="u-tl">${nameCell}</td><td>${ownerCell}</td><td>${schedCell}</td>
      <td>${t.manual ? "-" : (t.pProg ?? 0) + "%"}</td><td><strong>${t.manual ? "-" : (t.aProg ?? 0) + "%"}</strong></td>
      <td><select class="u-fs-xs" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "status", "$value")}" style="padding:2px 4px;">${statusOpts}</select></td>
      <td>${detail}</td><td class="u-tc">${remove}</td>` : `
      <td>${sysCell}</td><td>${idCell}</td><td class="u-tl">${nameCell}</td><td>${ownerCell}</td><td>${schedCell}</td>
      <td>${t.manual ? "-" : (t.pProg ?? 0) + "%"}</td>
      <td><select class="u-fs-xs" data-change="WeeklyReportManager.updateItem" data-change-args="${UiEvents.args(k, "status", "$value")}" style="padding:2px 4px;">${statusOpts}</select></td>
      <td>${detail}</td><td class="u-tc">${remove}</td>`;
    if (t.manual) tr.style.background = "rgba(254,243,199,0.35)";
    return tr;
  },


  render() {
    if (!this.currentWeekReport) return;
    const rep = this.currentWeekReport;
    const scopeSystems = this.scopeSystems(this.scope, this.scopeValue);
    const filterSys = "ALL"; // 보고서 자체가 작성 단위로 구성됨
    const inScope = sys => this.scope === "ALL" || scopeSystems.includes(sys);
    this.renderScopeBanner();
    this.renderSavedList();
    this._fillAddSelects();
    this.renderSizeMeter();
    const setCnt = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setCnt("wrCurCount", (rep.currentWeekTasks || []).length);
    setCnt("wrNxtCount", (rep.nextWeekTasks || []).length);

    const inAuthor = document.getElementById("wrAuthorInput");
    const inCurSum = document.getElementById("wrCurrentSummary");
    const inNxtSum = document.getElementById("wrNextSummary");
    const inIssues = document.getElementById("wrIssuesNotes");

    if (inAuthor) inAuthor.value = rep.author || "";
    this._openedAuthor = rep.author || "";
    if (inCurSum) inCurSum.value = rep.currentWeekSummary || "";
    if (inNxtSum) inNxtSum.value = rep.nextWeekSummary || "";
    if (inIssues) inIssues.value = rep.issuesNotes || "";
    const wObj = this.getAllWeeks().find(w => w.weekNum === rep.weekNo);
    document.querySelectorAll(".lbl-wr-week").forEach(el => { el.textContent = wObj ? wObj.label : ""; });

    const curTbody = document.getElementById("wrCurrentTasksBody");
    if (curTbody) {
      curTbody.innerHTML = "";
      const tasks = (rep.currentWeekTasks || []).filter(t => filterSys === "ALL" || t.system === filterSys);
      if (tasks.length === 0) {
        curTbody.innerHTML = `<tr><td class="u-tc u-c-muted u-p-20" colspan="10">ℹ️ 금주 실적 항목이 없습니다. [➕ WBS Task 추가] 또는 [➕ 직접 입력 항목 추가]로 등록하세요.</td></tr>`;
      } else {
        tasks.forEach(t => curTbody.appendChild(this._taskRow("cur", t)));
      }
    }

    const nxtTbody = document.getElementById("wrNextTasksBody");
    if (nxtTbody) {
      nxtTbody.innerHTML = "";
      const tasks = (rep.nextWeekTasks || []).filter(t => filterSys === "ALL" || t.system === filterSys);
      if (tasks.length === 0) {
        nxtTbody.innerHTML = `<tr><td class="u-tc u-c-muted u-p-20" colspan="9">ℹ️ 차주 계획 항목이 없습니다. [➕ WBS Task 추가] 또는 [➕ 직접 입력 항목 추가]로 등록하세요.</td></tr>`;
      } else {
        tasks.forEach(t => nxtTbody.appendChild(this._taskRow("nxt", t)));
      }
    // 금주 진행 회의 및 차주 예정 회의 실시간 렌더링
    if (typeof MeetingManager !== "undefined") {
      // 작성 완료본은 작성 시점의 회의 목록
      const snapMtg = list => (list || []).map(m => Object.assign({}, m, { agendas: null, summary: m.decisions }));
      const curMtgs = rep.snapshot ? snapMtg(rep.snapshot.meetingsCur) : MeetingManager.getWeeklyMeetings(rep.startDate, rep.endDate);
      const curMtgsBody = document.getElementById("wrCurrentMeetingsBody");
      if (curMtgsBody) {
        curMtgsBody.innerHTML = "";
        const filteredMtgs = curMtgs.filter(m => m.system === "ALL" || inScope(m.system));
        if (filteredMtgs.length === 0) {
          curMtgsBody.innerHTML = `<tr><td class="u-tc u-p-16 u-c-muted" colspan="6">ℹ️ 금주 진행된 회의 일정이 없습니다.</td></tr>`;
        } else {
          filteredMtgs.forEach((m, mIdx) => {
            const tr = document.createElement("tr");
            const decs = (m.agendas || []).map(a => `${a.title}: ${a.decision || "합의"}`).join("<br>");
            tr.innerHTML = `
              <td class="u-tc">${mIdx + 1}</td>
              <td class="u-tc">
                <span class="badge" style="background:${MeetingManager.getSubsystemColor(m.system)}; color:white; font-size:var(--fs-2xs, 10px);">${escapeHtml(m.system)}</span>
              </td>
              <td><strong>${escapeHtml(m.title)}</strong></td>
              <td class="u-tc u-fs-xs">${m.date} (${m.startTime}~${m.endTime})</td>
              <td class="u-tc u-fs-xs">${escapeHtml(m.host || "-")} / ${escapeHtml(m.location || "-")}</td>
              <td class="u-fs-xs u-c-main">${decs || escapeHtml(m.summary || "정상 완료")}</td>
            `;
            curMtgsBody.appendChild(tr);
          });
        }
      }

      const nxtMtgs = rep.snapshot ? snapMtg(rep.snapshot.meetingsNext) : MeetingManager.getNextWeekMeetings(rep.nextStartDate, rep.nextEndDate);
      const nxtMtgsBody = document.getElementById("wrNextMeetingsBody");
      if (nxtMtgsBody) {
        nxtMtgsBody.innerHTML = "";
        const filteredNxt = nxtMtgs.filter(m => m.system === "ALL" || inScope(m.system));
        if (filteredNxt.length === 0) {
          nxtMtgsBody.innerHTML = `<tr><td class="u-tc u-p-16 u-c-muted" colspan="6">ℹ️ 차주 예정된 회의 일정이 없습니다.</td></tr>`;
        } else {
          filteredNxt.forEach((m, mIdx) => {
            const tr = document.createElement("tr");
            const agds = (m.agendas || []).map(a => a.title).join(", ");
            tr.innerHTML = `
              <td class="u-tc">${mIdx + 1}</td>
              <td class="u-tc">
                <span class="badge" style="background:${MeetingManager.getSubsystemColor(m.system)}; color:white; font-size:var(--fs-2xs, 10px);">${escapeHtml(m.system)}</span>
              </td>
              <td><strong>${escapeHtml(m.title)}</strong></td>
              <td class="u-tc u-fs-xs">${m.date} (${m.startTime}~${m.endTime})</td>
              <td class="u-tc u-fs-xs">${escapeHtml(m.host || "-")} / ${escapeHtml(m.location || "-")}</td>
              <td class="u-fs-xs u-c-sub">${escapeHtml(agds || m.summary || "공정 협의")}</td>
            `;
            nxtMtgsBody.appendChild(tr);
          });
        }
      }
    }
    }
  },


  readInputsIntoCurrentReport() {
    if (!this.currentWeekReport) return;
    const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };
    const map = { wrAuthorInput: "author", wrCurrentSummary: "currentWeekSummary", wrNextSummary: "nextWeekSummary", wrIssuesNotes: "issuesNotes" };
    Object.keys(map).forEach(id => {
      const v = val(id);
      if (v !== null) this.currentWeekReport[map[id]] = v;
    });
  },


  openHistoryModal() {
    this.readInputsIntoCurrentReport();
    const modal = document.getElementById("wrHistoryModal");
    if (!modal) return;
    this.renderHistoryList();
    modal.style.display = "flex";
  },


  closeHistoryModal() {
    const modal = document.getElementById("wrHistoryModal");
    if (modal) modal.style.display = "none";
  },

    renderHistoryList() {
    const listEl = document.getElementById("wrHistoryList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!Array.isArray(weeklyReportsData) || weeklyReportsData.length === 0) {
      listEl.innerHTML = `
        <div class="u-p-20 u-tc u-c-muted u-fs-sm">
          ℹ️ 저장된 이전 주간보고서 이력이 없습니다.<br>
          현재 주간보고서를 저장(💾 주간보고 저장)하시면 이력으로 보관됩니다.
        </div>
      `;
      this.renderHistoryPreview(null);
      return;
    }

    if (this.selectedHistoryIdx >= weeklyReportsData.length) {
      this.selectedHistoryIdx = 0;
    }

    weeklyReportsData.forEach((r, idx) => {
      const isSel = idx === this.selectedHistoryIdx;
      const item = document.createElement("div");
      item.style.padding = "10px 12px";
      item.style.marginBottom = "8px";
      item.style.borderRadius = "6px";
      item.style.border = isSel ? "2px solid var(--primary)" : "1px solid var(--border-color)";
      item.style.cursor = "pointer";
      item.style.background = isSel ? "var(--tint-info)" : "#ffffff";
      item.style.transition = "all 0.15s ease";
      item.innerHTML = `
        <div class="u-flex u-jc-between u-ai-center u-mb-4">
          <strong style="font-size:calc(12.5px * var(--fs-scale, 1)); color:${isSel ? "var(--tint-info-text)" : "var(--text-main)"};">📅 ${escapeHtml(r.weekLabel)}</strong>
          <span class="badge u-c-info" style="background:var(--tint-info); font-size:var(--fs-2xs, 10px);">${escapeHtml(r.reportDate || "")}</span>
        </div>
        <div class="u-fs-xs u-c-muted u-mb-4">
          👤 작성: ${escapeHtml(r.author || "PM")} | 갱신: ${escapeHtml(r.updatedAt ? r.updatedAt.substring(0, 10) : "-")}
        </div>
        <div class="u-fs-xs u-c-sub" style="line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
          ${escapeHtml(r.currentWeekSummary || "(요약 없음)")}
        </div>
        <div class="u-mt-6 u-flex u-jc-end">
          <button class="btn btn-outline btn-xs u-c-primary u-bg-card" style="border-color:var(--border-color); font-size:calc(10.5px * var(--fs-scale, 1));" data-click="WeeklyReportManager.copyHistoryToCurrent" data-click-args="${UiEvents.args(idx)}" data-click-stop="1" title="이 보고서 내용을 즉시 이번주로 복사">
            📋 바로 복사
          </button>
        </div>
      `;
      item.onclick = () => {
        this.selectedHistoryIdx = idx;
        this.renderHistoryList();
        this.renderHistoryPreview(r);
      };
      listEl.appendChild(item);
    });

    if (weeklyReportsData[this.selectedHistoryIdx]) {
      this.renderHistoryPreview(weeklyReportsData[this.selectedHistoryIdx]);
    }
  },


  renderHistoryPreview(r) {
    const prevEl = document.getElementById("wrHistoryPreview");
    if (!prevEl) return;
    if (!r) {
      prevEl.innerHTML = `
        <div class="u-tc u-c-muted" style="padding:40px;">
          선택된 이전 보고서가 없습니다.
        </div>
      `;
      return;
    }

    const cCount = Array.isArray(r.currentWeekTasks) ? r.currentWeekTasks.length : 0;
    const nCount = Array.isArray(r.nextWeekTasks) ? r.nextWeekTasks.length : 0;

    prevEl.innerHTML = `
      <div class="u-bg-main u-bd u-r-8 u-p-12 u-mb-12">
        <div class="u-flex u-jc-between u-ai-center u-mb-8">
          <h4 class="u-m0 u-c-primary" style="font-size:var(--fs-md, 14px);">📋 [${escapeHtml(r.weekLabel)}] 보고서 상세 미리보기</h4>
          <span class="badge u-c-info u-fs-xs" style="background:var(--tint-info);">Task: 금주 ${cCount}건 / 차주 ${nCount}건</span>
        </div>
        <div class="u-fs-xs u-c-sub u-flex u-gap-16">
          <span><b>작성자:</b> ${escapeHtml(r.author || "PM")}</span>
          <span><b>기준일자:</b> ${escapeHtml(r.reportDate || "-")}</span>
          <span><b>금주기간:</b> ${escapeHtml(r.startDate || "")} ~ ${escapeHtml(r.endDate || "")}</span>
        </div>
      </div>

      <div class="u-flex u-col u-gap-10">
        <div class="u-bg-card u-bd u-r-6 u-p-10">
          <div class="u-bold u-fs-115 u-c-info u-mb-4 u-flex u-ai-center u-gap-6">
            <span>🎯</span> 【금주 중점 추진 실적 총괄 요약】
          </div>
          <div class="u-fs-115 u-c-main" style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(r.currentWeekSummary || "(작성된 요약 없음)")}</div>
        </div>

        <div class="u-bg-card u-bd u-r-6 u-p-10">
          <div class="u-bold u-fs-115 u-c-info u-mb-4 u-flex u-ai-center u-gap-6">
            <span>🚀</span> 【차주 중점 추진 목표 및 계획 요약】
          </div>
          <div class="u-fs-115 u-c-main" style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(r.nextWeekSummary || "(작성된 요약 없음)")}</div>
        </div>

        <div class="u-bg-card u-bd u-r-6 u-p-10">
          <div class="u-bold u-fs-115 u-mb-4 u-flex u-ai-center u-gap-6" style="color:var(--chart-warn-text);">
            <span>⚠️</span> 【주요 현안 및 지원 요청사항】
          </div>
          <div class="u-fs-115 u-c-main" style="white-space:pre-wrap; line-height:1.5;">${escapeHtml(r.issuesNotes || "(현안 및 특이사항 없음)")}</div>
        </div>
      </div>

      <div class="u-mt-14 u-tc">
        <button class="btn btn-primary btn-sm u-bold" style="padding:6px 16px;" data-click="WeeklyReportManager.copyHistoryToCurrent" data-click-args="${UiEvents.args(this.selectedHistoryIdx)}">
          📋 위 [${escapeHtml(r.weekLabel)}] 보고서 내용을 이번 주로 복사 적용하기
        </button>
      </div>
    `;
  },


  copyHistoryToCurrent(targetIdx) {
    const idx = (targetIdx !== undefined) ? targetIdx : this.selectedHistoryIdx;
    const src = weeklyReportsData[idx];
    if (!src || !this.currentWeekReport) return;

    if (src.currentWeekSummary) this.currentWeekReport.currentWeekSummary = src.currentWeekSummary;
    if (src.nextWeekSummary) this.currentWeekReport.nextWeekSummary = src.nextWeekSummary;
    if (src.issuesNotes) this.currentWeekReport.issuesNotes = src.issuesNotes;
    if (src.author) this.currentWeekReport.author = src.author;

    this.render();
    this.closeHistoryModal();
    showToast(`📋 [내용 복사 완료] [${src.weekLabel}] 보고서 내용이 현재 주차로 복사되었습니다.`);
  },
});
