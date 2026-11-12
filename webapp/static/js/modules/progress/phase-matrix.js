// [IOSTAR-PM] 단계별 진척 현황 (SDLC · REQ 매트릭스)
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// -------------------------------------------------------------
// [요건 8] 단계별 진척 현황 (SDLC 매트릭스 + REQ 매트릭스 + 요구사항·산출물·VOC 통합 진척표)
// -------------------------------------------------------------
function renderPhaseMatrix() {
  const phaseCardContainer = document.getElementById("phaseMatrixContainer");
  const enhTbody = document.getElementById("enhancementMatrixBody");
  const intTbody = document.getElementById("integratedProgressBody");
  if (!phaseCardContainer || !enhTbody || !intTbody) return;

  const dFilterEl = document.getElementById("matrixDomainFilter");
  const sFilterEl = document.getElementById("matrixSubsystemFilter");
  const selDomain = (dFilterEl && dFilterEl.value) ? dFilterEl.value : "ALL";
  const selSubsys = (sFilterEl && sFilterEl.value) ? sFilterEl.value : "ALL";

  const allSystemsRaw = getAllSubsystemNames();
  const allSystems = allSystemsRaw.filter(sys => {
    if (selDomain !== "ALL" && WBSEngine.getSubsystemDomain(sys) !== selDomain) return false;
    if (selSubsys !== "ALL" && sys !== selSubsys) return false;
    return true;
  });

  const activeRounds = getActiveDeliverableRounds(); // Defined by projectConfig.maxDeliverableRounds (1~4)

  // [요건 1-2] Section 1 (Top): 서브시스템별 요구사항(REQ) · 산출물 · 추가 VOC 통합 진척 현황표
  const intTable = document.getElementById("integratedProgressTable");
  if (intTable) {
    const thead = intTable.querySelector("thead");
    if (thead) {
      const roundThs = activeRounds.map(r => `<th>${r}(완료/전체)</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th rowspan="2" style="width: 105px;">분야</th>
          <th rowspan="2" style="width: 130px;">서브시스템</th>
          <th rowspan="2" style="width: 110px;">관리유형</th>
          <th colspan="3" class="col-phase">WBS 공정 진척</th>
          <th colspan="4" style="background:#f0fdf4; color:#166534;">🎯 요구사항(REQ) 진척</th>
          <th colspan="${activeRounds.length + 2}" style="background:#eff6ff; color:#1e40af;">📑 산출물 제출 진척 (${activeRounds.length}회차 운영)</th>
          <th colspan="5" style="background:#fef3c7; color:#92400e;">💬 추가 VOC / 이슈 진척 (대기·진행 분리)</th>
        </tr>
        <tr>
          <th>계획</th><th>실적</th><th>달성률</th>
          <th>전체</th><th>진행</th><th>완료</th><th>완료율</th>
          ${roundThs}<th>검토/작성중</th><th>완료율</th>
          <th>유효전체</th><th>대기</th><th>진행중</th><th>완료·제외</th><th>달성률</th>
        </tr>
      `;
    }
  }

  intTbody.innerHTML = "";
  let sumReqTot = 0, sumReqPrg = 0, sumReqCmp = 0;
  const sumRoundStats = {};
  activeRounds.forEach(r => { sumRoundStats[r] = { tot: 0, cmp: 0 }; });
  let sumDIng = 0, sumDAllTot = 0, sumDAllCmp = 0;
  let sumVocTot = 0, sumVocWait = 0, sumVocProg = 0, sumVocDone = 0;
  let sumWP = 0, sumWA = 0, sumWCount = 0;

  allSystems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys) || { type: "SDLC" };
    const domain = WBSEngine.getSubsystemDomain(sys);
    const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
    const wP = sysRoot ? sysRoot.pProg : 0;
    const wA = sysRoot ? sysRoot.aProg : 0;
    const wRate = wP > 0 ? Math.round((wA / wP) * 100) : 100;
    sumWP += wP; sumWA += wA; sumWCount++;

    const sReqs = reqMasterData.filter(r => r.system === sys && r.status !== "삭제");
    const rPrg = sReqs.filter(r => r.status === "진행").length;
    const rCmp = sReqs.filter(r => r.status === "완료").length;
    const rRate = sReqs.length > 0 ? Math.round((rCmp / sReqs.length) * 100) : 0;
    sumReqTot += sReqs.length; sumReqPrg += rPrg; sumReqCmp += rCmp;

    let sysDTot = 0, sysDCmp = 0;
    const roundTds = activeRounds.map(rnd => {
      const list = deliverablesData.filter(d => d.system === sys && d.round === rnd);
      const cmp = list.filter(d => d.status === "보완완료").length;
      sysDTot += list.length;
      sysDCmp += cmp;
      sumRoundStats[rnd].tot += list.length;
      sumRoundStats[rnd].cmp += cmp;
      return `<td>${cmp} / ${list.length}건</td>`;
    }).join("");

    const dAll = deliverablesData.filter(d => d.system === sys && activeRounds.includes(d.round));
    const dIng = dAll.filter(d => d.status === "작성중" || d.status === "검토요청").length;
    const dRate = sysDTot > 0 ? Math.round((sysDCmp / sysDTot) * 100) : 0;
    sumDIng += dIng; sumDAllTot += sysDTot; sumDAllCmp += sysDCmp;

    // VOC: 대기와 진행중 분리
    const sVocs = vocData.filter(v => v.system === sys && v.status !== "삭제");
    const vWait = sVocs.filter(v => v.status === "착수전" || v.status === "대기" || v.status === "보류").length;
    const vProg = sVocs.filter(v => v.status === "진행").length;
    const vDone = sVocs.filter(v => v.status === "완료" || v.status === "제외").length;
    const vRate = sVocs.length > 0 ? Math.round((vDone / sVocs.length) * 100) : 0;
    sumVocTot += sVocs.length; sumVocWait += vWait; sumVocProg += vProg; sumVocDone += vDone;

    const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
    const typeBadge = meta.type === "REQ"
      ? `<span class="status-tag tag-completed">개선타입(REQ)</span>`
      : `<span class="status-tag tag-progress">${escapeHtml(curSpec ? curSpec.name : "SDLC")}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(domain)}</span></td>
      <td><strong>${escapeHtml(sys)}</strong></td>
      <td>${typeBadge}</td>
      <td>${wP}%</td>
      <td><strong>${wA}%</strong></td>
      <td style="font-weight:bold; color:${wRate >= 90 ? "#15803d" : (wRate >= 70 ? "#b45309" : "#b91c1c")}">${wRate}%</td>
      <td>${sReqs.length}건</td>
      <td>${rPrg}건</td>
      <td><strong>${rCmp}건</strong></td>
      <td style="font-weight:bold; color:#166534;">${rRate}%</td>
      ${roundTds}
      <td>${dIng}건</td>
      <td style="font-weight:bold; color:#1e40af;">${dRate}%</td>
      <td>${sVocs.length}건</td>
      <td style="color:#b45309;">${vWait}건</td>
      <td style="color:#2563eb;">${vProg}건</td>
      <td><strong>${vDone}건</strong></td>
      <td style="font-weight:bold; color:#92400e;">${vRate}%</td>
    `;
    intTbody.appendChild(tr);
  });

  const avgWP = sumWCount > 0 ? Math.round(sumWP / sumWCount) : 0;
  const avgWA = sumWCount > 0 ? Math.round(sumWA / sumWCount) : 0;
  const avgWRate = avgWP > 0 ? Math.round((avgWA / avgWP) * 100) : 100;
  const totRRate = sumReqTot > 0 ? Math.round((sumReqCmp / sumReqTot) * 100) : 0;
  const totDRate = sumDAllTot > 0 ? Math.round((sumDAllCmp / sumDAllTot) * 100) : 0;
  const totVRate = sumVocTot > 0 ? Math.round((sumVocDone / sumVocTot) * 100) : 0;
  const sumRoundTds = activeRounds.map(r => `<td><b>${sumRoundStats[r].cmp} / ${sumRoundStats[r].tot}건</b></td>`).join("");

  const sumRow = document.createElement("tr");
  sumRow.className = "matrix-total-row";
  sumRow.innerHTML = `
    <td colspan="3"><strong>[선택 범위 합계 (${allSystems.length}개 서브시스템)]</strong></td>
    <td>${avgWP}%</td>
    <td><strong>${avgWA}%</strong></td>
    <td><b>${avgWRate}%</b></td>
    <td><b>${sumReqTot}건</b></td>
    <td><b>${sumReqPrg}건</b></td>
    <td><b>${sumReqCmp}건</b></td>
    <td style="color:#166534;"><b>${totRRate}%</b></td>
    ${sumRoundTds}
    <td><b>${sumDIng}건</b></td>
    <td style="color:#1e40af;"><b>${totDRate}%</b></td>
    <td><b>${sumVocTot}건</b></td>
    <td style="color:#b45309;"><b>${sumVocWait}건</b></td>
    <td style="color:#2563eb;"><b>${sumVocProg}건</b></td>
    <td><b>${sumVocDone}건</b></td>
    <td style="color:#92400e;"><b>${totVRate}%</b></td>
  `;
  intTbody.appendChild(sumRow);

  // [요건 1-1, 1-3] Section 2 (Middle): 서브시스템에 매핑되어 있는 SDLC 타입만 진척 표출
  const mappedSdlcSpecs = [];
  const seenSdlcCodes = new Set();
  allSystems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys);
    if (meta && meta.type === "REQ") return;
    const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
    if (curSpec && !seenSdlcCodes.has(curSpec.code)) {
      seenSdlcCodes.add(curSpec.code);
      mappedSdlcSpecs.push(curSpec);
    }
  });

  let sdlcTablesHtml = "";
  if (mappedSdlcSpecs.length === 0) {
    sdlcTablesHtml = `
      <div style="text-align:center; color:var(--text-muted); padding:20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px;">
        ℹ️ 현재 조회 조건에 매핑된 SDLC 폭포수형 서브시스템이 없습니다. (개선과제형 REQ 또는 다른 서브시스템을 조회하세요)
      </div>
    `;
  } else {
    mappedSdlcSpecs.forEach((spec, sIdx) => {
      const groupSystems = allSystems.filter(sys => {
        const meta = subsystemsMeta.find(m => m.name === sys);
        if (meta && meta.type === "REQ") return false;
        const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
        return curSpec && curSpec.code === spec.code;
      });

      const topThs = spec.phases.map(p => `<th colspan="3" class="col-phase sdlc-ph ${sIdx === 0 ? "" : "sdlc-ph-alt"}">${escapeHtml(p.name)} (${p.weight}%)</th>`).join("");
      const subThs = spec.phases.map(() => `<th>계획</th><th>실적</th><th>달성률</th>`).join("");

      let groupRowsHtml = "";
      const totalStats = { all: { p: 0, a: 0, w: 0 } };
      spec.phases.forEach(ph => { totalStats[ph.key] = { p: 0, a: 0, w: 0 }; });

      groupSystems.forEach(sys => {
        const domain = WBSEngine.getSubsystemDomain(sys);
        const sysTasks = wbsData.filter(d => d.system === sys && d.isLeaf);
        let sysTotalP = 0, sysTotalA = 0, sysTotalW = 0;

        let phTds = "";
        spec.phases.forEach(ph => {
          const phTasks = sysTasks.filter(t => WBSEngine.matchTaskToPhase(t, ph, wbsData));
          let pAvg = 0, aAvg = 0, wSum = 0;
          if (phTasks.length > 0) {
            wSum = phTasks.reduce((acc, t) => acc + WBSEngine.wOf(t), 0);
            const ew = t => wSum > 0 ? WBSEngine.wOf(t) : 1;
            const eSum = wSum > 0 ? wSum : phTasks.length;
            pAvg = Math.round(phTasks.reduce((acc, t) => acc + (t.pProg * ew(t)), 0) / eSum);
            aAvg = Math.round(phTasks.reduce((acc, t) => acc + (t.aProg * ew(t)), 0) / eSum);
            // 단계 합계는 서브시스템 가중치를 곱해 합침 (서브시스템 안은 100 기준 점수)
            const sf = WBSEngine.sysWeight(sys) || 1;
            totalStats[ph.key].p += pAvg * eSum * sf;
            totalStats[ph.key].a += aAvg * eSum * sf;
            totalStats[ph.key].w += eSum * sf;
          }
          const rate = pAvg > 0 ? Math.round((aAvg / pAvg) * 100) : 100;
          phTds += `<td>${pAvg}%</td><td><strong>${aAvg}%</strong></td><td style="color:${rate >= 90 ? "#15803d" : (rate >= 70 ? "#b45309" : "#b91c1c")}">${rate}%</td>`;
          sysTotalP += pAvg * wSum;
          sysTotalA += aAvg * wSum;
          sysTotalW += wSum;
        });

        const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
        const rootP = sysRoot ? sysRoot.pProg : (sysTotalW > 0 ? Math.round(sysTotalP / sysTotalW) : 0);
        const rootA = sysRoot ? sysRoot.aProg : (sysTotalW > 0 ? Math.round(sysTotalA / sysTotalW) : 0);
        const rootRate = rootP > 0 ? Math.round((rootA / rootP) * 100) : 100;

        // 전체 = 서브시스템 진척률 × 서브시스템 가중치 (기준정보)
        const sysW = WBSEngine.sysWeight(sys) || 1;
        totalStats.all.p += rootP * sysW;
        totalStats.all.a += rootA * sysW;
        totalStats.all.w += sysW;

        groupRowsHtml += `
          <tr>
            <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(domain)}</span></td>
            <td><strong>${escapeHtml(sys)}</strong></td>
            ${phTds}
            <td class="col-total">${rootP}%</td>
            <td class="col-total"><strong>${rootA}%</strong></td>
            <td class="col-total" style="color:${rootRate >= 90 ? "#15803d" : (rootRate >= 70 ? "#b45309" : "#b91c1c")}">${rootRate}%</td>
          </tr>
        `;
      });

      // 그룹 소계
      let sumPhTds = "";
      spec.phases.forEach(ph => {
        const totW = totalStats[ph.key].w || 1;
        const totP = Math.round(totalStats[ph.key].p / totW);
        const totA = Math.round(totalStats[ph.key].a / totW);
        const totRate = totP > 0 ? Math.round((totA / totP) * 100) : 100;
        sumPhTds += `<td>${totP}%</td><td><strong>${totA}%</strong></td><td style="color:#b45309;font-weight:bold;">${totRate}%</td>`;
      });
      const allW = totalStats.all.w || 1;
      const allP = Math.round(totalStats.all.p / allW);
      const allA = Math.round(totalStats.all.a / allW);
      const allRate = allP > 0 ? Math.round((allA / allP) * 100) : 100;

      groupRowsHtml += `
        <tr class="matrix-total-row">
          <td colspan="2"><strong>[${escapeHtml(spec.name)} 그룹 소계]</strong></td>
          ${sumPhTds}
          <td class="col-total sdlc-sum">${allP}%</td>
          <td class="col-total sdlc-sum"><strong>${allA}%</strong></td>
          <td class="col-total sdlc-sum" style="color:var(--primary);font-weight:bold;">${allRate}%</td>
        </tr>
      `;

      sdlcTablesHtml += `
        <div style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 10px; background:var(--bg-main); border-radius:6px; border:1px solid ${sIdx === 0 ? "#bae6fd" : "#ddd6fe"};">
            <span style="font-weight:bold; font-size:var(--fs-sm, 12px); color:var(--primary);">
              📂 SDLC 유형: ${escapeHtml(spec.name)} (${escapeHtml(spec.desc || "")}) — 소속 서브시스템 ${groupSystems.length}개
            </span>
          </div>
          <div class="table-container">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th rowspan="2" style="width: 105px;">분야</th>
                  <th rowspan="2" style="width: 130px;">서브시스템</th>
                  ${topThs}
                  <th colspan="3" class="col-total sdlc-ph-total">그룹 합계</th>
                </tr>
                <tr>
                  ${subThs}
                  <th>계획</th><th>실적</th><th>달성률</th>
                </tr>
              </thead>
              <tbody>${groupRowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    });
  }

  phaseCardContainer.innerHTML = sdlcTablesHtml;

  // Section 3 (Bottom): 개선타입(REQ) 서브시스템 요건별 진척 매트릭스
  enhTbody.innerHTML = "";
  const reqSystems = allSystems.filter(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys);
    return meta && meta.type === "REQ";
  });

  if (reqSystems.length === 0) {
    enhTbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:15px;">조회 조건에 해당하는 개선타입(REQ) 서브시스템이 없습니다.</td></tr>`;
  } else {
    reqSystems.forEach(sys => {
      const domain = WBSEngine.getSubsystemDomain(sys);
      const sysReqs = reqMasterData.filter(r => r.system === sys);
      if (sysReqs.length === 0) {
        const distinctReqs = [...new Set(wbsData.filter(d => d.system === sys).map(d => d.reqId).filter(Boolean))];
        distinctReqs.forEach(reqId => {
          sysReqs.push({ id: reqId, system: sys, name: `${reqId} 개선 요건`, status: "진행" });
        });
      }

      sysReqs.forEach(req => {
        const linkedTasks = wbsData.filter(t => t.system === sys && t.reqId === req.id && t.isLeaf);
        const taskCount = linkedTasks.length;
        const pAvg = taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.pProg, 0) / taskCount) : 0;
        const aAvg = taskCount > 0 ? Math.round(linkedTasks.reduce((acc, t) => acc + t.aProg, 0) / taskCount) : 0;
        const rate = pAvg > 0 ? Math.round((aAvg / pAvg) * 100) : (aAvg >= 100 ? 100 : 0);

        const row = document.createElement("tr");
        row.innerHTML = `
          <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(domain)}</span></td>
          <td><strong>${escapeHtml(sys)}</strong></td>
          <td><span class="lvl-badge lvl-3">${escapeHtml(req.id)}</span></td>
          <td>${escapeHtml(req.name)}</td>
          <td style="text-align:center;"><b>${taskCount}</b>개</td>
          <td style="text-align:right;">${pAvg}%</td>
          <td style="text-align:right;"><strong>${aAvg}%</strong></td>
          <td style="text-align:right; font-weight:bold; color:${rate >= 90 ? "#15803d" : (rate >= 70 ? "#b45309" : "#b91c1c")}">${rate}%</td>
          <td style="text-align:center;"><span class="status-tag ${aAvg >= 100 ? "tag-completed" : (aAvg >= pAvg ? "tag-progress" : "tag-delayed")}">${aAvg >= 100 ? "완료" : (aAvg > 0 ? "진행" : "착수전")}</span></td>
        `;
        enhTbody.appendChild(row);
      });
    });
  }
}

function renderSubsystemCards(systems) {
  const container = document.getElementById("subsystemCardsContainer");
  if (!container) return;
  container.innerHTML = "";

  const dFilterEl = document.getElementById("dashDomainFilter");
  const selDomain = dFilterEl ? dFilterEl.value : "ALL";

  const targetSystems = selDomain === "ALL"
    ? systems
    : systems.filter(s => (typeof WBSEngine !== "undefined" ? WBSEngine.getSubsystemDomain(s) === selDomain : true));

  targetSystems.forEach(sys => {
    const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
    const meta = subsystemsMeta.find(m => m.name === sys) || { domain: "공통", type: "SDLC", weight: 10, pm: "-" };
    const domain = meta.domain || ((typeof WBSEngine !== "undefined") ? WBSEngine.getSubsystemDomain(sys) : "공통");
    const leafTasks = wbsData.filter(d => d.system === sys && d.isLeaf);
    const pVal = sysRoot ? sysRoot.pProg : 0;
    const aVal = sysRoot ? sysRoot.aProg : 0;
    const rate = pVal > 0 ? Math.round((aVal / pVal) * 100) : 100;

    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "0";
    card.innerHTML = `
      <div class="card-title">
        <span>
          <span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px); margin-right:4px;">${escapeHtml(domain)}</span>
          <b>${escapeHtml(sys)}</b>
          <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted); font-weight:normal;">(${meta.type === "REQ" ? "개선타입(REQ)" : "SDLC형"} · 가중치 ${meta.weight}% · PM: ${escapeHtml(meta.pm || "-")})</span>
        </span>
        <span class="status-tag ${rate >= 90 ? "tag-completed" : (rate >= 70 ? "tag-progress" : "tag-delayed")}">달성률 ${rate}%</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:var(--fs-sm, 12px);">
        <span>계획 진척율: <b>${pVal}%</b></span>
        <span>실행 과업: <b>${leafTasks.length}개</b></span>
        <span>실적 진척율: <b style="color:var(--success); font-size:var(--fs-md, 14px);">${aVal}%</b></span>
      </div>
      <div style="background:#e2e8f0; height:8px; border-radius:4px; overflow:hidden;">
        <div style="background:var(--success); width:${Math.min(100, aVal)}%; height:100%;"></div>
      </div>
    `;
    container.appendChild(card);
  });
}
