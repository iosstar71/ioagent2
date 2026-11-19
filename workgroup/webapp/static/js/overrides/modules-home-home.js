// Workgroup 판: modules/home/home.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(HomeScreenManager, {
  setStyle(mode) {
    if (this.STYLES.indexOf(mode) === -1) return;
    try {
      if (mode === this.roleDefault()) localStorage.removeItem(this._styleKey());
      else localStorage.setItem(this._styleKey(), mode);
    } catch (e) {}
    this.render();
  },

  openSettings() {
    if (typeof AuthManager !== "undefined" && AuthManager.TAB_POLICY["tab-master"] && !AuthManager.canAccessTab(AuthManager.getCurrentRole(), "tab-master")) {
      showToast("ℹ️ 홈 스타일은 위쪽 [브리핑 · 워크벤치 · 내 할 일] 단추로 바꿀 수 있습니다. 역할별 기본 홈은 시스템 관리자가 정합니다.");
      return;
    }
    switchTab("tab-master");
    setTimeout(() => {
      try { MasterSubTabs.show("ui-screen"); } catch (e) {}
      const el = document.getElementById("cfgRoleHomeSysAdmin");
      const card = el && el.closest(".card");
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "start" }); card.classList.add("g-flash-card"); setTimeout(() => card.classList.remove("g-flash-card"), 1800); }
    }, 200);
  },

  renderExecutive() {
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";
    const repDay = (typeof WBSEngine !== "undefined" && WBSEngine.getDayOfWeekText) ? WBSEngine.getDayOfWeekText(repDate) : "화";

    // 1. Calculate overall metrics
    const rootItems = (wbsData || []).filter(d => d.level === 1);
    const wp = WBSEngine.weightedProgress(rootItems);   // 서브시스템별 진척률 × 서브시스템 가중치
    const totalPlan = wp.plan;
    const totalActual = wp.actual;
    const gap = totalActual - totalPlan;
    const achieveRate = Metrics.achv(totalPlan, totalActual, 1).toFixed(1);
    const achieveNum = parseFloat(achieveRate);

    // Hero Banner DOM
    const heroTitle = document.getElementById("execHeroProjTitle");
    const heroMeta = document.getElementById("execHeroMeta");
    const heroAchieve = document.getElementById("execHeroAchieveRate");
    const heroGap = document.getElementById("execHeroGap");
    const heroPlan = document.getElementById("execHeroPlanRate");
    const heroActual = document.getElementById("execHeroActualRate");
    const heroBadge = document.getElementById("execHeroStatusBadge");

    if (heroTitle) heroTitle.textContent = projName;
    if (heroMeta) {
      let wLabel = "2027년 22주차";
      if (typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.findWeekForDate) {
        const wObj = WeeklyReportManager.findWeekForDate(repDate);
        if (wObj) wLabel = wObj.fullLabel;
      }
      heroMeta.innerHTML = `공정 기준일: <b>${repDate} (${repDay})</b> | 대상: <b>${wLabel}</b> | 총괄 PM: <b>${escapeHtml(((projectUsers || []).find(u => AuthManager.normalizeRole(u.role) === "PM") || {}).name || "-")}</b>`;
    }
    const achieveText = totalPlan <= 0 && totalActual <= 0 ? "-" : `${achieveRate}%`;   // 계획 전이면 "-"
    if (heroAchieve) heroAchieve.textContent = achieveText;
    if (heroGap) {
      heroGap.textContent = `공정 GAP: ${gap >= 0 ? "+" : ""}${gap}%p (${gap >= 0 ? "목표 초과" : "계획 대비 지연"})`;
      heroGap.setAttribute("data-level", gap >= 0 ? "ok" : (gap >= -5 ? "warn" : "bad"));
    }
    if (heroPlan) heroPlan.textContent = `${totalPlan}%`;
    if (heroActual) heroActual.textContent = `${totalActual}%`;
    if (heroBadge) {
      if (achieveNum >= 90) {
        heroBadge.textContent = "🟢 정상 공정 궤도";
        heroBadge.setAttribute("data-level", "ok");
      } else if (achieveNum >= 70) {
        heroBadge.textContent = "🟡 주의 및 경계 관리";
        heroBadge.setAttribute("data-level", "warn");
      } else {
        heroBadge.textContent = "🔴 공정 지연 리스크";
        heroBadge.setAttribute("data-level", "bad");
      }
    }

    // 2. 5-KPI Strip
    // 지연 판정은 WBS·대시보드와 같은 기준 (최하위 Task, 계획 대비 실적 1%p 이상 부족)
    const delayedTasks = (wbsData || []).filter(t => t.isLeaf && WBSEngine.getTaskStatus(t, repDate).code === "delayed");
    const delayedCount = delayedTasks.length;

    const elKpiActual = document.getElementById("execKpiWbsActual");
    const elKpiSub = document.getElementById("execKpiWbsSub");
    if (elKpiActual) elKpiActual.textContent = `${totalActual}%`;
    if (elKpiSub) elKpiSub.textContent = `목표 계획: ${totalPlan}% (달성률 ${totalPlan <= 0 && totalActual <= 0 ? "-" : achieveRate + "%"})`;

    const elKpiDelay = document.getElementById("execKpiDelayed");
    const elKpiDelaySub = document.getElementById("execKpiDelayedSub");
    if (elKpiDelay) {
      elKpiDelay.textContent = `${delayedCount}건`;
      elKpiDelay.style.color = delayedCount === 0 ? "var(--chart-good-text)" : "var(--chart-bad-text)";
    }
    if (elKpiDelaySub) {
      elKpiDelaySub.textContent = delayedCount === 0 ? "지연 리스크 정상 통제" : "중점 만회 대책 필요";
      elKpiDelaySub.style.color = delayedCount === 0 ? "var(--chart-good-text)" : "var(--chart-bad-text)";
    }

    const rs = Metrics.reqStats(reqMasterData), validReqs = rs.list, reqDone = rs.done, reqRate = rs.rate;
    const elKpiReq = document.getElementById("execKpiReqRate");
    const elKpiReqSub = document.getElementById("execKpiReqSub");
    if (elKpiReq) elKpiReq.textContent = `${reqRate}%`;
    if (elKpiReqSub) elKpiReqSub.textContent = `완료 ${reqDone}건 / 전체 ${validReqs.length}건`;

    const activeRounds = (typeof getActiveDeliverableRounds === "function") ? getActiveDeliverableRounds() : ["1차", "2차"];
    const ds = Metrics.delivStats(deliverablesData, activeRounds), validDelivs = ds.list, delivDone = ds.done, delivRate = ds.rate;
    const vs = Metrics.vocStats(vocData), validVocs = vs.list, vocWait = vs.wait, vocProg = vs.prog, vocDone = vs.done, vocRate = vs.rate;

    const elKpiDelivVoc = document.getElementById("execKpiDelivVoc");
    const elKpiDelivVocSub = document.getElementById("execKpiDelivVocSub");
    if (elKpiDelivVoc) elKpiDelivVoc.textContent = `산출물 ${delivRate}% · VOC ${vocRate}%`;
    if (elKpiDelivVocSub) elKpiDelivVocSub.textContent = `산출물 ${delivDone}/${validDelivs.length}건 승인 | VOC ${vocDone}/${validVocs.length}건 조치`;

    // 3. Subsystem Traffic Light Tiles Grid
    const gridEl = document.getElementById("execSubsystemGrid");
    if (gridEl) {
      gridEl.innerHTML = "";
      const sysNames = (typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : [];
      sysNames.forEach(sys => {
        const root = (wbsData || []).find(d => d.system === sys && d.level === 1);
        const pProg = root ? root.pProg : 0;
        const aProg = root ? root.aProg : 0;
        const rate = Metrics.achv(pProg, aProg, 1).toFixed(1);
        const rateNum = parseFloat(rate);

        const meta = (subsystemsMeta || []).find(s => s.name === sys) || {};
        const pmName = meta.pm || "담당PM";
        const sysType = meta.type || "SDLC";
        const sysDelays = (wbsData || []).filter(t => t.system === sys && t.isLeaf && t.pProg > t.aProg && t.pEnd && t.pEnd < repDate).length;

        let lightIcon = "🟢";
        let lightText = "정상";
        let cardBorder = "var(--chart-good-text)";
        let rateColor = "var(--chart-good-text)";

        if (rateNum < 70) {
          lightIcon = "🔴";
          lightText = "경고";
          cardBorder = "var(--chart-bad)";
          rateColor = "var(--chart-bad-text)";
        } else if (rateNum < 90) {
          lightIcon = "🟡";
          lightText = "주의";
          cardBorder = "var(--chart-warn)";
          rateColor = "var(--chart-warn-text)";
        }

        const tile = document.createElement("div");
        tile.className = "card";
        tile.style.margin = "0";
        tile.style.border = `1px solid ${cardBorder}`;
        tile.style.borderTop = `4px solid ${cardBorder}`;
        tile.style.padding = "12px 14px";
        tile.style.cursor = "pointer";
        tile.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
        tile.onmouseenter = () => { tile.style.transform = "translateY(-2px)"; tile.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)"; };
        tile.onmouseleave = () => { tile.style.transform = "none"; tile.style.boxShadow = "none"; };
        tile.onclick = () => HomeScreenManager.jumpToSubsystem(sys);
        tile.title = `${sys} (${pmName}) 상세 공정 WBS 화면으로 이동`;

        tile.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:800; font-size:var(--fs-base, 13px); color:var(--text-main);">${escapeHtml(sys)}</div>
            <div style="font-size:var(--fs-xs, 11px); font-weight:700; display:flex; align-items:center; gap:3px;">
              <span>${lightIcon}</span>
              <span style="color:${rateColor};">${lightText}</span>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">달성률</span>
            <span style="font-size:calc(20px * var(--fs-scale, 1)); font-weight:900; color:${rateColor};">${pProg <= 0 && aProg <= 0 ? "-" : rate + "%"}</span>
          </div>
          <div style="width:100%; background:var(--track); height:6px; border-radius:3px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${Math.min(100, aProg)}%; background:${cardBorder}; height:100%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:var(--fs-xs, 11px); color:var(--text-sub); border-top:1px dashed var(--track); padding-top:6px;">
            <span>계획 <b>${pProg}%</b> / 실적 <b>${aProg}%</b></span>
            <span>${sysDelays > 0 ? `<b style="color:var(--chart-bad);">지연 ${sysDelays}</b>` : '<span style="color:var(--chart-good-text);">지연 0</span>'}</span>
          </div>
          <div style="font-size:var(--fs-2xs, 10px); color:var(--text-muted); margin-top:4px; display:flex; justify-content:space-between;">
            <span>PM: ${escapeHtml(pmName)} · <span>${I18N.tf("가중치 {n}%", { n: WBSEngine.sysWeight(sys) })}</span></span>
            <span class="badge" style="font-size:calc(9px * var(--fs-scale, 1)); padding:1px 4px;">${sysType}</span>
          </div>
        `;
        gridEl.appendChild(tile);
      });
    }

    // 4. Domain Portfolio Table
    const domTbody = document.getElementById("execDomainPortfolioBody");
    if (domTbody) {
      domTbody.innerHTML = "";
      const domains = (typeof projectConfig !== "undefined" && projectConfig.domains) ? projectConfig.domains : ["관리공통", "개선공정", "신규공정"];
      domains.forEach(dName => {
        const dSubs = (subsystemsMeta || []).filter(s => s.domain === dName).map(s => s.name);
        const dTasks = (wbsData || []).filter(t => dSubs.includes(t.system) && t.isLeaf);
        const dRoots = (wbsData || []).filter(t => dSubs.includes(t.system) && t.level === 1);
        const dwp = dRoots.length ? WBSEngine.weightedProgress(dRoots) : { plan: 0, actual: 0 };
        // 분야 비중 = 그 분야 서브시스템 가중치 합 / 전체 서브시스템 가중치 합
        const allSw = (subsystemsMeta || []).reduce((acc, m) => acc + WBSEngine.sysWeight(m.name), 0);
        const dWeight = allSw > 0 ? Math.round(dSubs.reduce((acc, n) => acc + WBSEngine.sysWeight(n), 0) / allSw * 1000) / 10 : 0;
        const dPlan = dwp.plan;
        const dActual = dwp.actual;
        const dRate = Metrics.achv(dPlan, dActual);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${escapeHtml(dName)}</strong></td>
          <td>${dTasks.length}개</td>
          <td>${dWeight}%</td>
          <td>${dPlan}%</td>
          <td><strong>${dActual}%</strong></td>
          <td style="font-weight:700; color:${dRate >= 90 ? "var(--chart-good-text)" : (dRate >= 70 ? "var(--chart-warn-text)" : "var(--chart-bad-text)")};">${dRate}%</td>
          <td><span class="status-tag ${dRate >= 90 ? "tag-completed" : (dRate >= 70 ? "tag-progress" : "tag-delayed")}">${dRate >= 90 ? "정상" : (dRate >= 70 ? "주의" : "지연")}</span></td>
        `;
        domTbody.appendChild(tr);
      });
    }
  },});
