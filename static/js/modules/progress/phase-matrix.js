// [Project Mgmt] 단계별 진척 현황 (SDLC · REQ 매트릭스)
// -------------------------------------------------------------
// [요건 8] 단계별 진척 현황 (SDLC 매트릭스 + REQ 매트릭스 + 요구사항·산출물·VOC 종합 진척표)
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

  // [요건 1-2] Section 1 (Top): 서브시스템별 요구사항(REQ) · 산출물 · 추가 VOC 종합 진척 현황표
  const intTable = document.getElementById("integratedProgressTable");
  if (intTable) {
    const thead = intTable.querySelector("thead");
    if (thead) {
      const roundThs = activeRounds.map(r => `<th>${r}(완료/전체)</th>`).join("");
      thead.innerHTML = `
        <tr>
          <th rowspan="2" class="pm-w-dom">도메인</th>
          <th rowspan="2" class="pm-w-sys">서브시스템</th>
          <th rowspan="2" class="pm-w-type">관리유형</th>
          <th rowspan="2" class="pm-w-wt" title="종합 진척률 = 서브시스템별 진척률 × 서브시스템 가중치">가중치</th>
          <th colspan="3" class="col-phase">WBS 공정 진척</th>
          <th colspan="5" class="col-req">🎯 요구사항(REQ) 진척</th>
          <th colspan="6" class="col-voc">💬 VOC · 결함 처리</th>
          <th colspan="${activeRounds.length + 2}" class="col-deliv">📑 산출물 제출 진척 (${activeRounds.length}차 운영)</th>
        </tr>
        <tr>
          <th>계획</th><th>실적</th><th>달성률</th>
          <th>전체</th><th title="VOC 에서 등록한 추가 요구사항">추가</th><th>진행</th><th>완료</th><th>완료율</th>
          <th>접수</th><th>판정 대기</th><th>미결</th><th title="완료 + 요구 반영">처리</th><th title="통합테스트 단계 · 판정 결함 중 미결">테스트 결함 미결</th><th>처리율</th>
          ${roundThs}<th>검토/작성중</th><th>완료율</th>
        </tr>
      `;
    }
  }

  intTbody.innerHTML = "";
  let sumReqTot = 0, sumReqAdd = 0, sumReqPrg = 0, sumReqCmp = 0;
  const sumRoundStats = {};
  activeRounds.forEach(r => { sumRoundStats[r] = { tot: 0, cmp: 0 }; });
  let sumDIng = 0, sumDAllTot = 0, sumDAllCmp = 0;
  let sumVocTot = 0, sumVocUnd = 0, sumVocOpen = 0, sumVocDone = 0, sumDefOpen = 0, sumDefTot = 0;
  let sumWP = 0, sumWA = 0, sumWCount = 0;

  allSystems.forEach(sys => {
    const meta = subsystemsMeta.find(m => m.name === sys) || { type: "SDLC" };
    const domain = WBSEngine.getSubsystemDomain(sys);
    const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
    const wP = sysRoot ? sysRoot.pProg : 0;
    const wA = sysRoot ? sysRoot.aProg : 0;
    const wRate = Metrics.achv(wP, wA);
    sumWP += wP; sumWA += wA; sumWCount++;

    const rs = Metrics.reqStats(reqMasterData.filter(r => r.system === sys)), sReqs = rs.list, rPrg = rs.prog, rCmp = rs.done, rRate = rs.rate;
    sumReqTot += sReqs.length; sumReqAdd += rs.added; sumReqPrg += rPrg; sumReqCmp += rCmp;

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
    const dRate = Metrics.pct(sysDCmp, sysDTot);
    sumDIng += dIng; sumDAllTot += sysDTot; sumDAllCmp += sysDCmp;

    // VOC · 결함 (Metrics: 처리 = 완료 + 요구 반영, 테스트 결함 = 통합테스트 · 결함)
    const sysVocs = vocData.filter(v => v.system === sys);
    const vs = Metrics.vocStats(sysVocs), ds = Metrics.defectStats(sysVocs, projectConfig.reportDate);
    const vOpen = Metrics.vocOpen(sysVocs).length;
    sumVocTot += vs.total; sumVocUnd += vs.undecided; sumVocOpen += vOpen; sumVocDone += vs.done; sumDefOpen += ds.open; sumDefTot += ds.total;

    const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
    const typeBadge = meta.type === "REQ"
      ? `<span class="status-tag tag-completed">개선타입(REQ)</span>`
      : `<span class="status-tag tag-progress">${escapeHtml(curSpec ? curSpec.name : "SDLC")}</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge pm-dom">${escapeHtml(domain)}</span></td>
      <td><strong>${escapeHtml(sys)}</strong></td>
      <td>${typeBadge}</td>
      <td class="ai-c">${WBSEngine.sysWeight(sys)}%</td>
      <td>${wP}%</td>
      <td><strong>${wA}%</strong></td>
      <td class="u-bold ${PhaseView.rateCls(wRate)}">${wRate}%</td>
      <td>${sReqs.length}건</td>
      <td>${rs.added ? `<b>${rs.added}건</b>` : "0"}</td>
      <td>${rPrg}건</td>
      <td><strong>${rCmp}건</strong></td>
      <td class="u-bold u-c-success">${rRate}%</td>
      <td>${vs.total}건</td>
      <td class="${vs.undecided ? "u-c-warning u-bold" : ""}">${vs.undecided}건</td>
      <td>${vOpen}건</td>
      <td><strong>${vs.done}건</strong></td>
      <td>${ds.total ? `<b class="${ds.open ? "u-c-danger" : ""}">${ds.open}</b> / ${ds.total}건` : "-"}</td>
      <td class="u-bold">${vs.rate}%</td>
      ${roundTds}
      <td>${dIng}건</td>
      <td class="u-bold u-c-info">${dRate}%</td>
    `;
    intTbody.appendChild(tr);
  });

  // 합계 = 서브시스템별 진척률 × 서브시스템 가중치 (Summary 의 종합 진척률과 같은 계산)
  const selRoots = wbsData.filter(d => d.level === 1 && allSystems.includes(d.system));
  const wSel = selRoots.length ? WBSEngine.weightedProgress(selRoots) : null;
  const avgWP = wSel ? wSel.plan : (sumWCount > 0 ? Math.round(sumWP / sumWCount) : 0);
  const avgWA = wSel ? wSel.actual : (sumWCount > 0 ? Math.round(sumWA / sumWCount) : 0);
  const avgWRate = Metrics.achv(avgWP, avgWA);
  const totRRate = Metrics.pct(sumReqCmp, sumReqTot);
  const totDRate = Metrics.pct(sumDAllCmp, sumDAllTot);
  const totVRate = Metrics.pct(sumVocDone, sumVocTot);
  const sumRoundTds = activeRounds.map(r => `<td><b>${sumRoundStats[r].cmp} / ${sumRoundStats[r].tot}건</b></td>`).join("");

  const sumRow = document.createElement("tr");
  sumRow.className = "matrix-total-row";
  sumRow.innerHTML = `
    <td colspan="4"><strong>[선택 범위 합계 (${allSystems.length}개 서브시스템)]</strong></td>
    <td>${avgWP}%</td>
    <td><strong>${avgWA}%</strong></td>
    <td><b>${avgWRate}%</b></td>
    <td><b>${sumReqTot}건</b></td>
    <td><b>${sumReqAdd}건</b></td>
    <td><b>${sumReqPrg}건</b></td>
    <td><b>${sumReqCmp}건</b></td>
    <td class="u-c-success"><b>${totRRate}%</b></td>
    <td><b>${sumVocTot}건</b></td>
    <td class="u-c-warning"><b>${sumVocUnd}건</b></td>
    <td><b>${sumVocOpen}건</b></td>
    <td><b>${sumVocDone}건</b></td>
    <td>${sumDefTot ? `<b>${sumDefOpen} / ${sumDefTot}건</b>` : "-"}</td>
    <td><b>${totVRate}%</b></td>
    ${sumRoundTds}
    <td><b>${sumDIng}건</b></td>
    <td class="u-c-info"><b>${totDRate}%</b></td>
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
      <div class="u-tc u-c-muted u-p-20 u-bg-main u-r-6 pm-empty">
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
            // 단계 합계는 서브시스템 가중치를 곱해 합침 (서브시스템 안은 100 기준 점수) — 아직 계획 전(계획 0 · 실적 0)인 칸은 합계에서 뺌
            if (!(pAvg <= 0 && aAvg <= 0)) {
              const sf = WBSEngine.sysWeight(sys) || 1;
              totalStats[ph.key].p += pAvg * eSum * sf;
              totalStats[ph.key].a += aAvg * eSum * sf;
              totalStats[ph.key].w += eSum * sf;
            }
          }
          if (pAvg <= 0 && aAvg <= 0) { phTds += `<td class="rate-na">-</td><td class="rate-na">-</td><td class="rate-na">-</td>`; return; }   // 계획 전
          const rate = Metrics.achv(pAvg, aAvg);
          // 칸 아래: 지연 Task 수 · 기준선 대비 밀린 일수 (누르면 그 단계 Task 를 WBS 에서)
          const iss = WBSEngine.phaseIssues(phTasks, projectConfig.reportDate, t => Baseline.varOf(t, projectConfig));
          phTds += `<td>${pAvg}%</td><td><strong>${aAvg}%</strong></td><td class="pm-cell ${PhaseView.rateCls(rate)}" data-click="PhaseView.openWbs" data-click-args="${UiEvents.args(sys, ph.name)}" title="${escapeAttr(I18N.tf("{s} · {p} Task 를 WBS 에서 보기", { s: sys, p: ph.name }))}">${rate}%${PhaseView.issueHtml(iss)}</td>`;
          sysTotalP += pAvg * wSum;
          sysTotalA += aAvg * wSum;
          sysTotalW += wSum;
        });

        const sysRoot = wbsData.find(d => d.system === sys && d.level === 1);
        const rootP = sysRoot ? sysRoot.pProg : (sysTotalW > 0 ? Math.round(sysTotalP / sysTotalW) : 0);
        const rootA = sysRoot ? sysRoot.aProg : (sysTotalW > 0 ? Math.round(sysTotalA / sysTotalW) : 0);
        const rootRate = Metrics.achv(rootP, rootA);
        const rootNA = rootP <= 0 && rootA <= 0;   // 계획 전: "-" 로 표시하고 합계에서 뺌

        // 전체 = 서브시스템 진척률 × 서브시스템 가중치 (기준정보)
        const sysW = WBSEngine.sysWeight(sys) || 1;
        if (!rootNA) {
          totalStats.all.p += rootP * sysW;
          totalStats.all.a += rootA * sysW;
          totalStats.all.w += sysW;
        }

        groupRowsHtml += `
          <tr>
            <td><span class="badge pm-dom">${escapeHtml(domain)}</span></td>
            <td><strong>${escapeHtml(sys)}</strong></td>
            ${phTds}
            ${rootNA ? `<td class="col-total rate-na">-</td><td class="col-total rate-na">-</td><td class="col-total rate-na">-</td>` : `<td class="col-total">${rootP}%</td>
            <td class="col-total"><strong>${rootA}%</strong></td>
            <td class="col-total ${PhaseView.rateCls(rootRate)}">${rootRate}%</td>`}
          </tr>
        `;
      });

      // 그룹 소계
      let sumPhTds = "";
      spec.phases.forEach(ph => {
        if (!totalStats[ph.key].w) { sumPhTds += `<td class="rate-na">-</td><td class="rate-na">-</td><td class="rate-na">-</td>`; return; }
        const totW = totalStats[ph.key].w || 1;
        const totP = Math.round(totalStats[ph.key].p / totW);
        const totA = Math.round(totalStats[ph.key].a / totW);
        const totRate = Metrics.achv(totP, totA);
        sumPhTds += `<td>${totP}%</td><td><strong>${totA}%</strong></td><td class="u-bold rate-warn">${totRate}%</td>`;
      });
      const allW = totalStats.all.w || 1;
      const allP = Math.round(totalStats.all.p / allW);
      const allA = Math.round(totalStats.all.a / allW);
      const allRate = Metrics.achv(allP, allA);

      groupRowsHtml += `
        <tr class="matrix-total-row">
          <td colspan="2"><strong>[<span>${escapeHtml(spec.name)}</span> <span>그룹 소계</span>]</strong></td>
          ${sumPhTds}
          <td class="col-total sdlc-sum">${allP}%</td>
          <td class="col-total sdlc-sum"><strong>${allA}%</strong></td>
          <td class="col-total sdlc-sum u-c-primary u-bold">${allRate}%</td>
        </tr>
      `;

      sdlcTablesHtml += `
        <div class="u-mb-16">
          <div class="pm-group-head${sIdx === 0 ? "" : " alt"}">
            <span class="u-bold u-fs-sm u-c-primary">
              📂 <span>SDLC 유형:</span> <span>${escapeHtml(spec.name)}</span> (<span>${escapeHtml(spec.desc || "")}</span>) — <span>${I18N.tf("소속 서브시스템 {n}개", { n: groupSystems.length })}</span>
            </span>
          </div>
          <div class="table-container">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th rowspan="2" class="pm-w-dom">도메인</th>
                  <th rowspan="2" class="pm-w-sys">서브시스템</th>
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
    enhTbody.innerHTML = `<tr><td class="u-tc u-c-muted u-p-15" colspan="9">조회 조건에 해당하는 개선타입(REQ) 서브시스템이 없습니다.</td></tr>`;
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
        const rate = Metrics.achv(pAvg, aAvg);
        const rateNA = pAvg <= 0 && aAvg <= 0;   // 계획 전

        const row = document.createElement("tr");
        row.innerHTML = `
          <td><span class="badge pm-dom">${escapeHtml(domain)}</span></td>
          <td><strong>${escapeHtml(sys)}</strong></td>
          <td><span class="lvl-badge lvl-3">${escapeHtml(req.id)}</span></td>
          <td>${escapeHtml(req.name)}</td>
          <td class="u-tc"><b>${taskCount}</b>개</td>
          <td class="u-tr">${pAvg}%</td>
          <td class="u-tr"><strong>${aAvg}%</strong></td>
          ${rateNA ? `<td class="rate-na u-tr">-</td>` : `<td class="u-tr u-bold ${PhaseView.rateCls(rate)}">${rate}%</td>`}
          <td class="u-tc"><span class="status-tag ${aAvg >= 100 ? "tag-completed" : (aAvg >= pAvg ? "tag-progress" : "tag-delayed")}">${aAvg >= 100 ? "완료" : (aAvg > 0 ? "진행" : "대기")}</span></td>
        `;
        enhTbody.appendChild(row);
      });
    });
  }
  PhaseView.renderDeliv(allSystems, activeRounds);
  PhaseView.renderVoc(allSystems, selDomain === "ALL" && selSubsys === "ALL");
}

// Phase 진척 [2] 칸 표시 · [3] 단계별 산출물 · [4] 단계별 VOC · 테스트 결함 (셈은 WBSEngine · Metrics · VocBoard)
var PhaseView = {
  rateCls(r) { return r >= 90 ? "rate-good" : (r >= 70 ? "rate-warn" : "rate-bad"); },
  issueHtml(iss) {
    const parts = [];
    if (iss.delayed) parts.push(`<span class="pm-iss-del">${escapeHtml(I18N.tf("지연 {n}", { n: iss.delayed }))}</span>`);
    if (iss.slip) parts.push(`<span class="pm-iss-slip">${escapeHtml(I18N.tf("기준선 +{n}일", { n: iss.slip }))}</span>`);
    return parts.length ? `<div class="pm-iss">${parts.join("")}</div>` : "";
  },
  // 그 서브시스템 · 단계의 Task 를 WBS 에서 (단계별 조회 + 서브시스템 조회)
  openWbs(sys, phase) {
    GShell.go("tab-wbs");
    setTimeout(() => {
      const set = (id, v) => { const el = /** @type {HTMLSelectElement} */ (document.getElementById(id)); if (el) el.value = v; };
      set("wbsDomainFilter", "ALL"); set("wbsSubsystemFilter", sys); set("wbsStatusFilter", "ALL"); set("wbsMaxLevelFilter", "5");
      renderWbsTable();
      set("wbsPhaseFilter", phase);
      renderWbsTable();
    }, 150);
  },
  renderDeliv(systems, rounds) {
    const t = document.getElementById("phaseDelivTable");
    if (!t) return;
    const order = (standardDeliverablesMeta || []).map(d => d.phase);
    const rows = Metrics.delivByPhase(deliverablesData.filter(d => systems.includes(d.system)), rounds, projectConfig.reportDate, order);
    const tot = Metrics.delivStats(deliverablesData.filter(d => systems.includes(d.system)), rounds);
    const late = rows.reduce((a, r) => a + r.late, 0);
    t.innerHTML = `<thead><tr><th class="pm-w-phase">단계</th>${rounds.map(r => `<th>${escapeHtml(r)} (완료/전체)</th>`).join("")}<th>완료 / 전체</th><th>계획 제출일 지남</th><th>완료율</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr><td class="u-tl"><b>${escapeHtml(r.phase || "미지정")}</b></td>${rounds.map(x => `<td>${r.byRound[x].done} / ${r.byRound[x].total}</td>`).join("")}
        <td>${r.done} / ${r.total}</td><td>${r.late ? `<b class="u-c-danger">${r.late}</b>` : 0}</td><td class="u-bold ${this.rateCls(r.rate)}">${r.rate}%</td></tr>`).join("")
        : `<tr><td class="u-tc u-c-muted u-p-15" colspan="${rounds.length + 4}">${I18N.t("조회 조건에 해당하는 산출물이 없습니다.")}</td></tr>`}
        ${rows.length ? `<tr class="matrix-total-row"><td class="u-tl"><b>${I18N.t("합계")}</b></td>${rounds.map(x => `<td><b>${rows.reduce((a, r) => a + r.byRound[x].done, 0)} / ${rows.reduce((a, r) => a + r.byRound[x].total, 0)}</b></td>`).join("")}
        <td><b>${tot.done} / ${tot.total}</b></td><td><b>${late}</b></td><td class="u-bold u-c-info">${tot.rate}%</td></tr>` : ""}</tbody>`;
    I18N.translateTree(t);
  },
  renderVoc(systems, whole) {
    const box = document.getElementById("phaseVocStageBox");
    if (!box) return;
    const scope = whole ? vocData : vocData.filter(v => systems.includes(v.system));
    box.innerHTML = VocBoard.stageTable(scope);
    const d = document.getElementById("phaseDefectBox");
    d.hidden = !Metrics.hasTestStage(scope, projectConfig.reportDate);
    if (!d.hidden) document.getElementById("phaseDefectBody").innerHTML = VocBoard.defectHtml(scope, projectConfig.reportDate);
    I18N.translateTree(document.getElementById("phaseVocCard"));
  }
};
window.PhaseView = PhaseView;
