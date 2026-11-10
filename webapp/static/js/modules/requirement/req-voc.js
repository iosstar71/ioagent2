// [IOSTAR-PM] 요구사항 · VOC 관리
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// -------------------------------------------------------------
// [요건 6] 요구사항 관리 탭 (서브시스템별 필터 & 리스트 선택)
// -------------------------------------------------------------
function renderReqMasterTable() {
  const tbody = document.getElementById("reqMasterTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dFilter = document.getElementById("reqDomainFilter") ? document.getElementById("reqDomainFilter").value : "ALL";
  const sysFilter = document.getElementById("reqSubsystemFilter") ? document.getElementById("reqSubsystemFilter").value : "ALL";
  let statTotal = 0, statReady = 0, statProg = 0, statComp = 0, statHold = 0, statDel = 0;

  const chipScope = [];
  reqMasterData.forEach((row, idx) => {
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    chipScope.push(row);
    if (typeof StatusChips !== "undefined" && !StatusChips.match("req", row)) return;

    statTotal++;
    if (row.status === "착수전") statReady++;
    else if (row.status === "진행") statProg++;
    else if (row.status === "완료") statComp++;
    else if (row.status === "보류") statHold++;
    else if (row.status === "삭제") statDel++;

    const linkedTasks = wbsData.filter(t => t.reqId === row.id && t.isLeaf);
    const taskCount = linkedTasks.length;
    const avgProg = taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.aProg, 0) / taskCount) : 0;

    let tagClass = "tag-ready";
    if (row.status === "진행") tagClass = "tag-progress";
    else if (row.status === "완료") tagClass = "tag-completed";
    else if (row.status === "보류") tagClass = "tag-hold";
    else if (row.status === "삭제") tagClass = "tag-del";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(row.id)}" style="width:98px; font-weight:bold;" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "id", "$value", "renderPhaseMatrix", "persistChanges")}"></td>
      <td>
        <select style="width:125px;" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "system", "$value", "renderReqMasterTable", "renderPhaseMatrix", "renderDashboard", "persistChanges")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.name)}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "name", "$value", "renderPhaseMatrix", "persistChanges")}"></td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "type", "$value", "persistChanges")}">
          <option value="기능" ${row.type === "기능" ? "selected" : ""}>기능</option>
          <option value="비기능" ${row.type === "비기능" ? "selected" : ""}>비기능</option>
          <option value="화면" ${row.type === "화면" ? "selected" : ""}>화면</option>
          <option value="인터페이스" ${row.type === "인터페이스" ? "selected" : ""}>인터페이스</option>
          <option value="연계" ${row.type === "연계" ? "selected" : ""}>연계</option>
          <option value="보안" ${row.type === "보안" ? "selected" : ""}>보안</option>
          <option value="관리" ${row.type === "관리" ? "selected" : ""}>관리</option>
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "priority", "$value", "persistChanges")}">
          <option value="긴급" ${row.priority === "긴급" ? "selected" : ""}>긴급</option>
          <option value="상" ${row.priority === "상" ? "selected" : ""}>상</option>
          <option value="중" ${row.priority === "중" ? "selected" : ""}>중</option>
          <option value="하" ${row.priority === "하" ? "selected" : ""}>하</option>
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "accept", "$value", "persistChanges")}">
          <option value="수용" ${row.accept === "수용" ? "selected" : ""}>수용</option>
          <option value="불가" ${row.accept === "불가" ? "selected" : ""}>불가</option>
          <option value="검토중" ${row.accept === "검토중" ? "selected" : ""}>검토중</option>
        </select>
      </td>
      <td style="text-align:center;"><b>${taskCount}</b>개</td>
      <td style="text-align:right;"><b>${avgProg}%</b></td>
      <td>
        <select class="status-tag ${tagClass}" data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, "status", "$value", "renderReqMasterTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          <option value="착수전" ${row.status === "착수전" ? "selected" : ""}>착수전</option>
          <option value="진행" ${row.status === "진행" ? "selected" : ""}>진행</option>
          <option value="완료" ${row.status === "완료" ? "selected" : ""}>완료</option>
          <option value="보류" ${row.status === "보류" ? "selected" : ""}>보류</option>
          <option value="삭제" ${row.status === "삭제" ? "selected" : ""}>삭제</option>
        </select>
      </td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("reqMasterData", idx, "renderReqMasterTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  if (typeof StatusChips !== "undefined") StatusChips.render("req", chipScope);
  document.getElementById("tab-req-stat-total").innerText = statTotal;
  document.getElementById("tab-req-stat-ready").innerText = statReady;
  document.getElementById("tab-req-stat-progress").innerText = statProg;
  document.getElementById("tab-req-stat-completed").innerText = statComp;
  document.getElementById("tab-req-stat-hold").innerText = statHold;
  document.getElementById("tab-req-stat-deleted").innerText = statDel;
}

function addNewReq() {
  const sysFilter = document.getElementById("reqSubsystemFilter") ? document.getElementById("reqSubsystemFilter").value : "ALL";
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "서브시스템A");

  const newReqId = buildNextEntityId("REQ", defaultSys);
  reqMasterData.push({
    id: newReqId,
    system: defaultSys,
    name: "신규 요구사항 명세",
    type: "기능",
    priority: "중",
    accept: "수용",
    status: "착수전"
  });
  renderReqMasterTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}

// -------------------------------------------------------------
// [요건 6] 추가 VOC / 이슈관리 탭 (서브시스템별 필터 & 리스트 선택)
// -------------------------------------------------------------
function renderVocTable() {
  const tbody = document.getElementById("vocTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const dFilter = document.getElementById("vocDomainFilter") ? document.getElementById("vocDomainFilter").value : "ALL";
  const sysFilter = document.getElementById("vocSubsystemFilter") ? document.getElementById("vocSubsystemFilter").value : "ALL";
  let statTotal = 0, statReady = 0, statProg = 0, statComp = 0, statExcl = 0, statHold = 0, statDel = 0;

  const chipScope = [];
  vocData.forEach((row, idx) => {
    if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(row.system) !== dFilter) return;
    if (sysFilter !== "ALL" && row.system !== sysFilter) return;
    chipScope.push(row);
    if (typeof StatusChips !== "undefined" && !StatusChips.match("voc", row)) return;

    statTotal++;
    if (row.status === "착수전") statReady++;
    else if (row.status === "진행") statProg++;
    else if (row.status === "완료") statComp++;
    else if (row.status === "제외") statExcl++;
    else if (row.status === "보류") statHold++;
    else if (row.status === "삭제") statDel++;

    const reqDay = WBSEngine.getDayOfWeekText(row.reqDate);
    const targetDay = WBSEngine.getDayOfWeekText(row.targetDate);

    let tagClass = "tag-ready";
    if (row.status === "진행") tagClass = "tag-progress";
    else if (row.status === "완료") tagClass = "tag-completed";
    else if (row.status === "제외") tagClass = "tag-excluded";
    else if (row.status === "보류") tagClass = "tag-hold";
    else if (row.status === "삭제") tagClass = "tag-del";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(row.id)}</strong></td>
      <td>
        <select style="width:125px;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "system", "$value", "renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          ${getSubsystemOptionsHtml(row.system)}
        </select>
      </td>
      <td>
        <select data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "priority", "$value", "renderDashboard", "persistChanges")}">
          <option value="긴급" ${row.priority === "긴급" ? "selected" : ""}>긴급</option>
          <option value="상" ${row.priority === "상" ? "selected" : ""}>상</option>
          <option value="중" ${row.priority === "중" ? "selected" : ""}>중</option>
          <option value="하" ${row.priority === "하" ? "selected" : ""}>하</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.title)}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "title", "$value", "renderDashboard", "persistChanges")}"></td>
      <td><input type="text" value="${escapeHtml(row.requester || "")}" style="width:80px;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "requester", "$value", "persistChanges")}"></td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.reqDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "reqDate", "$value", "renderVocTable", "persistChanges")}">
          <span class="day-of-week-tag ${reqDay === "토" ? "day-sat" : (reqDay === "일" ? "day-sun" : "")}">${reqDay ? `(${reqDay})` : ""}</span>
        </div>
      </td>
      <td>
        <div class="date-input-wrap">
          <input type="date" value="${row.targetDate || ""}" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "targetDate", "$value", "renderVocTable", "persistChanges")}">
          <span class="day-of-week-tag ${targetDay === "토" ? "day-sat" : (targetDay === "일" ? "day-sun" : "")}">${targetDay ? `(${targetDay})` : ""}</span>
        </div>
      </td>
      <td>
        <select class="status-tag ${tagClass}" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "status", "$value", "renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">
          <option value="착수전" ${row.status === "착수전" ? "selected" : ""}>착수전</option>
          <option value="진행" ${row.status === "진행" ? "selected" : ""}>진행</option>
          <option value="완료" ${row.status === "완료" ? "selected" : ""}>완료</option>
          <option value="제외" ${row.status === "제외" ? "selected" : ""}>제외</option>
          <option value="보류" ${row.status === "보류" ? "selected" : ""}>보류</option>
          <option value="삭제" ${row.status === "삭제" ? "selected" : ""}>삭제</option>
        </select>
      </td>
      <td><input type="text" value="${escapeHtml(row.action || "")}" style="width:100%;" data-change="UiH.set" data-change-args="${UiEvents.args("vocData", idx, "action", "$value", "persistChanges")}"></td>
      <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("vocData", idx, "renderVocTable", "renderDashboard", "renderPhaseMatrix", "persistChanges")}">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  const validTotal = statTotal - statDel;
  const achieveRate = validTotal > 0 ? (((statComp + statExcl) / validTotal) * 100).toFixed(1) : "0.0";

  if (typeof StatusChips !== "undefined") StatusChips.render("voc", chipScope);
  document.getElementById("tab-voc-stat-total").innerText = statTotal;
  document.getElementById("tab-voc-stat-ready").innerText = statReady;
  document.getElementById("tab-voc-stat-progress").innerText = statProg;
  document.getElementById("tab-voc-stat-completed").innerText = statComp;
  document.getElementById("tab-voc-stat-excluded").innerText = statExcl;
  document.getElementById("tab-voc-stat-hold").innerText = statHold;
  document.getElementById("tab-voc-stat-deleted").innerText = statDel;
  document.getElementById("tab-voc-stat-rate").innerText = `${achieveRate}%`;
}

function addNewVoc() {
  const sysFilter = document.getElementById("vocSubsystemFilter") ? document.getElementById("vocSubsystemFilter").value : "ALL";
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "서브시스템A");

  const newVocId = buildNextEntityId("VOC", defaultSys);
  vocData.push({
    id: newVocId,
    system: defaultSys,
    title: "신규 VOC 요청사항",
    priority: "중",
    requester: "요청부서",
    reqDate: WBSEngine.getNextWorkingDay(projectConfig.reportDate, projectConfig.holidays, projectConfig.projectEndDate),
    targetDate: "",
    status: "착수전",
    action: ""
  });
  renderVocTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}
