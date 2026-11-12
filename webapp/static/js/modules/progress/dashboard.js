// [Project Mgmt] 종합 대시보드
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// -------------------------------------------------------------
// [요건 8] 종합대시보드 렌더링 (서브시스템 카드 + 산출물 통계표 + VOC 통계표)
// -------------------------------------------------------------
function renderDashboard() {
  const repDate = projectConfig.reportDate;
  // [v3.4.0] 불릿 차트 (대시보드 서브시스템 필터 반영)
  if (typeof BulletChart !== "undefined") {
    try { const sf = document.getElementById("dashSubsystemFilter"); BulletChart.render("dashBulletChart", BulletChart.liveRows(sf ? sf.value : "ALL")); } catch (e) { console.warn(e); }
  }

  // [ver1.0.4 신규] 대시보드 4대 영역 통합 필터링 (분야 / 서브시스템)
  const dFilterEl = document.getElementById("dashDomainFilter");
  const sFilterEl = document.getElementById("dashSubsystemFilter") || document.getElementById("scurveSystemFilter");
  const selDomain = dFilterEl ? dFilterEl.value : "ALL";
  const selSubsys = sFilterEl ? sFilterEl.value : "ALL";

  const allSystemsRaw = getAllSubsystemNames();
  const activeSystems = allSystemsRaw.filter(sys => {
    if (selDomain !== "ALL" && WBSEngine.getSubsystemDomain(sys) !== selDomain) return false;
    if (selSubsys !== "ALL" && sys !== selSubsys) return false;
    return true;
  });
  // [Neo 2.1] 확인할 일 (대시보드 조회 범위 기준)
  if (typeof NeoTodo !== "undefined") { try { NeoTodo.render(activeSystems); } catch (e) { console.error(e); } }

  // KPI 계산 (선택 서브시스템에 맞춰 동적 집계)
  const scopeTasks = (selDomain === "ALL" && selSubsys === "ALL")
    ? wbsData
    : wbsData.filter(d => activeSystems.includes(d.system));

  const rootItems = scopeTasks.filter(d => d.level === 1);
  const totalWeight = rootItems.reduce((acc, d) => acc + (parseFloat(d.weight) || 1), 0) || 1;
  const totalPlan = Math.round(rootItems.reduce((acc, d) => acc + (d.pProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
  const totalActual = Math.round(rootItems.reduce((acc, d) => acc + (d.aProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
  const achieveRate = totalPlan > 0 ? ((totalActual / totalPlan) * 100).toFixed(1) : "100.0";

  const delayedTasks = scopeTasks.filter(d => WBSEngine.getTaskStatus(d, repDate).code === "delayed");

  document.getElementById("kpi-plan").innerText = `${totalPlan}%`;
  document.getElementById("kpi-actual").innerText = `${totalActual}%`;
  document.getElementById("kpi-rate").innerText = `${achieveRate}%`;
  document.getElementById("kpi-delayed").innerText = `${delayedTasks.length} 건`;

  let cntTotal = scopeTasks.length, cntComp = 0, cntProg = 0, cntDel = 0, cntReady = 0;
  scopeTasks.forEach(t => {
    const st = WBSEngine.getTaskStatus(t, repDate).code;
    if (st === "completed") cntComp++;
    else if (st === "delayed") cntDel++;
    else if (st === "progress") cntProg++;
    else cntReady++;
  });
  document.getElementById("stat-count-total").innerText = cntTotal;
  document.getElementById("stat-count-completed").innerText = cntComp;
  document.getElementById("stat-count-progress").innerText = cntProg;
  document.getElementById("stat-count-delayed").innerText = cntDel;
  document.getElementById("stat-count-ready").innerText = cntReady;

  // 요구사항 통계 (선택 범위 연동)
  const scopeReqs = (selDomain === "ALL" && selSubsys === "ALL")
    ? reqMasterData
    : reqMasterData.filter(r => activeSystems.includes(r.system));

  let reqTot = scopeReqs.length, reqRdy = 0, reqPrg = 0, reqCmp = 0, reqHld = 0, reqDel = 0;
  scopeReqs.forEach(r => {
    if (r.status === "착수전") reqRdy++;
    else if (r.status === "진행") reqPrg++;
    else if (r.status === "완료") reqCmp++;
    else if (r.status === "보류") reqHld++;
    else if (r.status === "삭제") reqDel++;
  });
  const reqValid = reqTot - reqDel;
  const reqRate = reqValid > 0 ? ((reqCmp / reqValid) * 100).toFixed(1) : "0.0";
  document.getElementById("req-stat-total").innerText = reqTot;
  document.getElementById("req-stat-ready").innerText = reqRdy;
  document.getElementById("req-stat-progress").innerText = reqPrg;
  document.getElementById("req-stat-completed").innerText = reqCmp;
  document.getElementById("req-stat-hold").innerText = reqHld;
  document.getElementById("req-stat-deleted").innerText = reqDel;
  if (document.getElementById("req-stat-rate")) document.getElementById("req-stat-rate").innerText = `${reqRate}%`;

  // VOC 통계 (선택 범위 연동)
  const scopeVocsAll = (selDomain === "ALL" && selSubsys === "ALL")
    ? vocData
    : vocData.filter(v => activeSystems.includes(v.system));

  let vocTot = scopeVocsAll.length, vocRdy = 0, vocPrg = 0, vocCmp = 0, vocExc = 0, vocHld = 0, vocDel = 0;
  scopeVocsAll.forEach(v => {
    if (v.status === "착수전") vocRdy++;
    else if (v.status === "진행") vocPrg++;
    else if (v.status === "완료") vocCmp++;
    else if (v.status === "제외") vocExc++;
    else if (v.status === "보류") vocHld++;
    else if (v.status === "삭제") vocDel++;
  });
  const vocValid = vocTot - vocDel;
  const vocRate = vocValid > 0 ? (((vocCmp + vocExc) / vocValid) * 100).toFixed(1) : "0.0";

  document.getElementById("voc-stat-total").innerText = vocTot;
  document.getElementById("voc-stat-ready").innerText = vocRdy;
  document.getElementById("voc-stat-progress").innerText = vocPrg;
  document.getElementById("voc-stat-completed").innerText = vocCmp;
  document.getElementById("voc-stat-excluded").innerText = vocExc;
  document.getElementById("voc-stat-hold").innerText = vocHld;
  document.getElementById("voc-stat-deleted").innerText = vocDel;
  document.getElementById("voc-stat-achieve").innerText = `${vocRate}%`;

  // [1] 서브시스템별 공정 진척 현황 카드 (선택 필터 연동 적용)
  renderSubsystemCards(activeSystems);

  // [2] S-Curve 주별 진척율 (선) 및 달성률 (막대) (선택 필터 연동 적용)
  const scBadge = document.getElementById("scurveFilterBadge");
  if (scBadge) {
    scBadge.textContent = (selDomain === "ALL" && selSubsys === "ALL")
      ? "전체 서브시스템 (통합)"
      : `${selDomain !== "ALL" ? `[${selDomain}] ` : ""}${selSubsys !== "ALL" ? selSubsys : "전체"}`;
  }
  DashboardChart.renderSCurve("scurveCanvas", wbsData, repDate, projectConfig.weekStartDay, selSubsys, selDomain);

  // [3] 서브시스템 · 회차별 산출물 제출 현황 통계 (선택 필터 연동 적용)
  const activeRounds = getActiveDeliverableRounds();
  const dashDelivTable = document.getElementById("dashDeliverablesTable");
  if (dashDelivTable) {
    const thead = dashDelivTable.querySelector("thead");
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>서브시스템</th>
          ${activeRounds.map(r => `<th>${r}(완료/전체)</th>`).join("")}
          <th>보완완료</th>
          <th>검토/작성중</th>
          <th>작성전</th>
          <th>제출완료율</th>
        </tr>
      `;
    }
  }
  const dashDelivTbody = document.querySelector("#dashDeliverablesTable tbody");
  dashDelivTbody.innerHTML = "";
  const validDelivs = deliverablesData.filter(d => activeRounds.includes(d.round) && activeSystems.includes(d.system));
  const doneDelivs = validDelivs.filter(d => d.status === "보완완료").length;
  const totDelivRate = validDelivs.length > 0 ? Math.round((doneDelivs / validDelivs.length) * 100) : 0;
  document.getElementById("dash-deliv-total").innerText = validDelivs.length;
  document.getElementById("dash-deliv-done").innerText = doneDelivs;
  if (document.getElementById("dash-deliv-rate")) document.getElementById("dash-deliv-rate").innerText = `${totDelivRate}%`;

  const roundSums = {};
  activeRounds.forEach(r => { roundSums[r] = { done: 0, tot: 0 }; });
  let sDone = 0, sIng = 0, sRdy = 0;

  if (activeSystems.length === 0) {
    dashDelivTbody.innerHTML = `<tr><td colspan="${activeRounds.length + 5}" style="text-align:center; padding:20px; color:#64748b;">선택된 조회 조건(분야: ${selDomain}, 서브시스템: ${selSubsys})에 해당하는 산출물이 없습니다.</td></tr>`;
  } else {
    activeSystems.forEach(sys => {
      const dAll = validDelivs.filter(d => d.system === sys);
      const rCells = activeRounds.map((r, rIdx) => {
        const list = dAll.filter(d => d.round === r);
        const dCnt = list.filter(d => d.status === "보완완료").length;
        roundSums[r].done += dCnt;
        roundSums[r].tot += list.length;
        const cls = rIdx % 2 === 0 ? "badge-round-1" : "badge-round-2";
        return `<td><span class="badge-round ${cls}">${dCnt} / ${list.length}건</span></td>`;
      }).join("");

      const done = dAll.filter(d => d.status === "보완완료").length;
      const ing = dAll.filter(d => d.status === "작성중" || d.status === "검토요청").length;
      const rdy = dAll.filter(d => d.status === "작성전").length;
      const rate = dAll.length > 0 ? Math.round((done / dAll.length) * 100) : 0;

      sDone += done; sIng += ing; sRdy += rdy;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(sys)}</strong></td>
        ${rCells}
        <td>${done}</td>
        <td>${ing}</td>
        <td>${rdy}</td>
        <td style="font-weight:bold; color:${rate >= 80 ? "#15803d" : "#b45309"}">${rate}%</td>
      `;
      dashDelivTbody.appendChild(tr);
    });

    const totRateVal = validDelivs.length > 0 ? Math.round((sDone / validDelivs.length) * 100) : 0;
    const totRCells = activeRounds.map(r => `<td><b>${roundSums[r].done} / ${roundSums[r].tot}건</b></td>`).join("");
    const totalRow = document.createElement("tr");
    totalRow.className = "matrix-total-row";
    totalRow.innerHTML = `
      <td><strong>[선택 합계]</strong></td>
      ${totRCells}
      <td><b>${sDone}</b></td>
      <td><b>${sIng}</b></td>
      <td><b>${sRdy}</b></td>
      <td style="font-weight:bold; color:#1e40af">${totRateVal}%</td>
    `;
    dashDelivTbody.appendChild(totalRow);
  }

  // [4] 서브시스템별 VOC / 이슈 처리 현황 통계 (선택 필터 연동 적용)
  const dashVocTbody = document.querySelector("#dashVocTable tbody");
  dashVocTbody.innerHTML = "";
  const scopeVocs = vocData.filter(v => activeSystems.includes(v.system) && v.status !== "삭제");
  const openVocs = scopeVocs.filter(v => v.status !== "완료" && v.status !== "제외").length;
  const doneVocs = scopeVocs.filter(v => v.status === "완료" || v.status === "제외").length;
  const scopeVocRate = scopeVocs.length > 0 ? Math.round((doneVocs / scopeVocs.length) * 100) : 0;
  document.getElementById("dash-voc-open").innerText = openVocs;
  document.getElementById("dash-voc-done").innerText = doneVocs;

  let vTotSum = 0, vCmpSum = 0, vExcSum = 0, vPrgSum = 0, vRdySum = 0;
  if (activeSystems.length === 0) {
    dashVocTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#64748b;">선택된 조회 조건(분야: ${selDomain}, 서브시스템: ${selSubsys})에 해당하는 VOC가 없습니다.</td></tr>`;
  } else {
    activeSystems.forEach(sys => {
      const vAll = scopeVocs.filter(v => v.system === sys);
      const vCmp = vAll.filter(v => v.status === "완료").length;
      const vExc = vAll.filter(v => v.status === "제외").length;
      const vPrg = vAll.filter(v => v.status === "진행").length;
      const vRdy = vAll.filter(v => v.status === "착수전" || v.status === "보류").length;
      const vRate = vAll.length > 0 ? Math.round(((vCmp + vExc) / vAll.length) * 100) : 0;

      vTotSum += vAll.length; vCmpSum += vCmp; vExcSum += vExc; vPrgSum += vPrg; vRdySum += vRdy;

      dashVocTbody.innerHTML += `
        <tr>
          <td><strong>${escapeHtml(sys)}</strong></td>
          <td><b>${vAll.length}건</b></td>
          <td><b style="color:var(--success);">${vCmp}건</b></td>
          <td>${vExc}건</td>
          <td>${vPrg}건</td>
          <td>${vRdy}건</td>
          <td><b style="color:${vRate >= 80 ? "#15803d" : "#b45309"};">${vRate}%</b></td>
        </tr>
      `;
    });
    dashVocTbody.innerHTML += `
      <tr class="matrix-total-row">
        <td><strong>[선택 합계]</strong></td>
        <td><b>${vTotSum}건</b></td>
        <td><b style="color:var(--success);">${vCmpSum}건</b></td>
        <td><b>${vExcSum}건</b></td>
        <td><b>${vPrgSum}건</b></td>
        <td><b>${vRdySum}건</b></td>
        <td><b style="color:var(--success);">${scopeVocRate}%</b></td>
      </tr>
    `;
  }
}
