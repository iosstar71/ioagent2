// Workgroup 판: modules/deliverable/deliverables.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

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
