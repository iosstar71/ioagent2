// [IOSTAR-PM] 산출물 관리
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
function renderDeliverablesTable() {
  const tbody = document.getElementById("deliverablesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dFilter = document.getElementById("delivDomainFilter") ? document.getElementById("delivDomainFilter").value : "ALL";
  const sysFilter = document.getElementById("delivSubsystemFilter") ? document.getElementById("delivSubsystemFilter").value : "ALL";
  const roundFilter = document.getElementById("delivRoundFilter") ? document.getElementById("delivRoundFilter").value : "ALL";
  const nameQuery = (document.getElementById("delivNameSearchInput") ? document.getElementById("delivNameSearchInput").value : "").trim().toLowerCase();

  const activeRounds = getActiveDeliverableRounds();
  const chipScope = [];
  deliverablesData.forEach((row, idx) => {
    if (!activeRounds.includes(row.round)) return;
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    if (roundFilter !== "ALL" && row.round !== roundFilter) return;
    if (nameQuery && !(row.name || "").toLowerCase().includes(nameQuery)) return;
    chipScope.push(row);
    if (typeof StatusChips !== "undefined" && !StatusChips.match("deliv", row)) return;

    const tr = document.createElement("tr");
    tr.setAttribute("data-rec-idx", idx);  // 오른쪽 상세 패널 (RecordPanel)
    const pDay = WBSEngine.getDayOfWeekText(row.pDate);
    const aDay = WBSEngine.getDayOfWeekText(row.aDate);

    tr.innerHTML = `
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "round", "$value", "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          ${getActiveDeliverableRounds().map(r => `<option value="${r}" ${row.round === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </td>
      <td>
        <select style="width:125px;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "system", "$value", "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "phase", "$value", "renderDashboard", "persistChanges")}">
          ${["요구사항정의단계", "분석설계단계", "구현단계", "통합테스트단계", "시험검증단계", "이행단계", "안정화단계", "이행안정화단계", "구축단계"].map(p => `<option value="${p}" ${row.phase === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.name)}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "name", "$value", "renderDashboard", "persistChanges")}"></td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.pDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "pDate", "$value", "renderDeliverablesTable", "persistChanges")}">
          <span class="day-of-week-tag ${pDay === "토" ? "day-sat" : (pDay === "일" ? "day-sun" : "")}">${pDay ? `(${pDay})` : ""}</span>
        </div>
      </td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.aDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "aDate", "$value", "renderDeliverablesTable", "persistChanges")}">
          <span class="day-of-week-tag ${aDay === "토" ? "day-sat" : (aDay === "일" ? "day-sun" : "")}">${aDay ? `(${aDay})` : ""}</span>
        </div>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "status", "$value", "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          <option value="작성전" ${row.status === "작성전" ? "selected" : ""}>작성전</option>
          <option value="작성중" ${row.status === "작성중" ? "selected" : ""}>작성중</option>
          <option value="검토요청" ${row.status === "검토요청" ? "selected" : ""}>검토요청</option>
          <option value="보완완료" ${row.status === "보완완료" ? "selected" : ""}>보완완료</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.manager || "")}" style="width:80px;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "manager", "$value", "persistChanges")}"></td>
      <td style="text-align:center;">${typeof AttachManager !== "undefined" ? AttachManager.cellHtml(idx, row) : ""}</td>
      <td><input type="text" value="${escapeHtml(row.remarks || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("deliverablesData", idx, "remarks", "$value", "persistChanges")}"></td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("deliverablesData", idx, "renderDeliverablesTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });
  if (typeof StatusChips !== "undefined") StatusChips.render("deliv", chipScope);
  if (typeof AttachManager !== "undefined") AttachManager.refreshSummary();  // 첨부파일 수 (서버 방식, 처음 한 번)
  if (typeof RecordPanel !== "undefined") RecordPanel.decorate("deliv");
}

function addNewDeliverable() {
  const sysFilter = document.getElementById("delivSubsystemFilter") ? document.getElementById("delivSubsystemFilter").value : "ALL";
  const roundFilter = document.getElementById("delivRoundFilter") ? document.getElementById("delivRoundFilter").value : "ALL";
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "PMO");
  const defaultRound = roundFilter !== "ALL" ? roundFilter : "1차";

  deliverablesData.push({
    id: deliverablesData.length + 1,
    round: defaultRound,
    system: defaultSys,
    phase: defaultRound === "2차" ? "구현단계" : "분석설계단계",
    name: "신규 산출물",
    pDate: WBSEngine.getNextWorkingDay(projectConfig.reportDate, projectConfig.holidays, projectConfig.projectEndDate),
    aDate: "",
    status: "작성전",
    manager: "담당자",
    remarks: ""
  });
  renderDeliverablesTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}

function openBulkDeliverableModal() {
  updateAllSubsystemFilterDropdowns();
  document.getElementById("bulkDeliverableModal").style.display = "flex";
}
function closeBulkDeliverableModal() {
  document.getElementById("bulkDeliverableModal").style.display = "none";
}

// [요건 7] 설정 탭의 표준산출물관리(standardDeliverablesMeta) 정보를 기반으로 서브시스템별·차수별 자동생성
function generateStandardDeliverables() {
  const targetSysVal = document.getElementById("bulkDelivTargetSystem") ? document.getElementById("bulkDelivTargetSystem").value : "ALL";
  const targetRoundVal = document.getElementById("bulkDelivTargetRound") ? document.getElementById("bulkDelivTargetRound").value : "ALL";

  const systems = targetSysVal === "ALL" ? getAllSubsystemNames() : [targetSysVal];
  let createdCount = 0;

  systems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys);
    const pmName = meta && meta.pm ? meta.pm : `${sys} 담당`;

    const activeRounds = getActiveDeliverableRounds();
    standardDeliverablesMeta.forEach(std => {
      const roundsToCreate = [];
      activeRounds.forEach((rLabel, rIdx) => {
        const flagKey = `round${rIdx + 1}`;
        if (std[flagKey] && (targetRoundVal === "ALL" || targetRoundVal === rLabel)) {
          roundsToCreate.push(rLabel);
        }
      });

      roundsToCreate.forEach(rnd => {
        const exists = deliverablesData.some(d => d.system === sys && d.name === std.name && d.round === rnd);
        if (!exists) {
          const validPDate = WBSEngine.getNextWorkingDay(
            std.defaultDate || projectConfig.reportDate,
            projectConfig.holidays,
            projectConfig.projectEndDate
          );
          deliverablesData.push({
            id: deliverablesData.length + 1,
            round: rnd,
            system: sys,
            phase: std.phase || (rnd === "2차" ? "구현단계" : "분석설계단계"),
            name: std.name,
            pDate: validPDate,
            aDate: "",
            status: "작성전",
            manager: pmName,
            remarks: std.remarks || `${rnd} 표준 산출물`
          });
          createdCount++;
        }
      });
    });
  });

  closeBulkDeliverableModal();
  renderDeliverablesTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
  showToast(`설정 탭의 표준산출물 프로젝트 설정을 바탕으로 총 ${createdCount}건의 산출물이 자동 생성되었습니다.`);
}

// =============================================================================
// 차수별 산출물 제출 계획일 일괄 변경 (프로젝트 설정 > Phase 설정 > 단계별 표준 산출물) — PM · 관리자
// =============================================================================
var DelivBulkDate = {
  can() { return typeof Permission !== "undefined" && Permission.isManager(); },
  _targets() {
    const round = (document.getElementById("delivBulkRound") || {}).value, sys = (document.getElementById("delivBulkSys") || {}).value || "ALL";
    const skip = !!(document.getElementById("delivBulkSkipDone") || {}).checked;
    return (deliverablesData || []).filter(d => d.round === round && (sys === "ALL" || d.system === sys) && !(skip && (d.aDate || d.status === "보완완료")));
  },
  render() {
    const box = document.getElementById("delivBulkBox"), r = document.getElementById("delivBulkRound"), sy = document.getElementById("delivBulkSys");
    if (!box || !r || !sy) return;
    box.hidden = !this.can();
    const keepR = r.value, keepS = sy.value;
    r.innerHTML = getActiveDeliverableRounds().map(x => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join("");
    sy.innerHTML = `<option value="ALL">전체 서브시스템</option>` + getAllSubsystemNames().map(x => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join("");
    if (keepR && r.querySelector(`option[value="${keepR}"]`)) r.value = keepR;
    if (keepS && Array.prototype.some.call(sy.options, o => o.value === keepS)) sy.value = keepS;
    this.info();
  },
  info() { const el = document.getElementById("delivBulkInfo"); if (el) el.textContent = `대상 ${this._targets().length}건`; },
  apply() {
    if (!this.can()) return showToast("⛔ 제출일 일괄 변경은 PM · 관리자만 할 수 있습니다.", "warning");
    const dEl = document.getElementById("delivBulkDate"), date = dEl ? dEl.value : "";
    if (!date) { if (typeof UiForm !== "undefined" && dEl) UiForm.invalid(dEl, "날짜를 고르세요"); return showToast("⚠️ 새 제출 계획일을 고르세요.", "warning"); }
    const list = this._targets();
    if (!list.length) return showToast("ℹ️ 조건에 맞는 산출물이 없습니다.");
    const round = document.getElementById("delivBulkRound").value, sys = document.getElementById("delivBulkSys").value;
    openConfirmDialog(`${round} 산출물 ${list.length}건(${sys === "ALL" ? "전체 서브시스템" : sys})의 제출 계획일을 ${date} 로 바꿉니다. 계속하시겠습니까?`, () => {
      list.forEach(d => { d.pDate = date; });
      if (typeof renderDeliverablesTable === "function") renderDeliverablesTable();
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof persistChanges === "function") persistChanges();
      this.info();
      showToast(`📅 ${round} 산출물 ${list.length}건의 제출 계획일을 ${date} 로 바꿨습니다. [저장]을 누르면 기록됩니다.`);
    });
  }
};
window.DelivBulkDate = DelivBulkDate;
document.addEventListener("change", e => { if (e.target && /^delivBulk(Round|Sys|SkipDone)$/.test(e.target.id || "")) DelivBulkDate.info(); });
