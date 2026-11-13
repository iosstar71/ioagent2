// =============================================================================
// S-Curve 차트 엔진: 프로젝트 전 기간(시작일~종료일 전체 주차) 표시 및 화면 폭 기반 자동 폰트/여백 축소
// =============================================================================
const DashboardChart = {
  renderSCurve(canvasId, wbsData, reportDateStr, weekStartDayArg, selectedSystem = "ALL") {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    const parentWidth = (parent && parent.clientWidth > 0) ? parent.clientWidth : (canvas.clientWidth || 960);
    const parentHeight = (parent && parent.clientHeight > 0) ? parent.clientHeight : (canvas.clientHeight || 280);

    canvas.width = Math.max(360, parentWidth);
    canvas.height = Math.max(210, parentHeight);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dFilterEl = document.getElementById("dashDomainFilter");
    const selDomain = dFilterEl ? dFilterEl.value : "ALL";

    let targetTasks = [];
    if (selectedSystem === "ALL") {
      if (selDomain === "ALL") {
        targetTasks = wbsData.filter(d => d.level === 1);
      } else {
        targetTasks = wbsData.filter(d => d.level === 1 && (typeof WBSEngine !== "undefined" ? WBSEngine.getSubsystemDomain(d.system) === selDomain : true));
      }
      if (targetTasks.length === 0) targetTasks = wbsData.filter(d => d.level === 1);
    } else {
      targetTasks = wbsData.filter(d => d.system === selectedSystem && (d.level === 2 || (d.level === 1 && d.isLeaf)));
      if (targetTasks.length === 0) targetTasks = wbsData.filter(d => d.system === selectedSystem && d.level === 1);
    }

    let minDate = new Date((projectConfig && projectConfig.projectStartDate) || "2027-01-01");
    let maxDate = new Date((projectConfig && projectConfig.projectEndDate) || "2027-12-31");
    if (isNaN(minDate.getTime())) minDate = new Date("2027-01-01");
    if (isNaN(maxDate.getTime())) maxDate = new Date("2027-12-31");

    const repDate = new Date(reportDateStr || (projectConfig && projectConfig.reportDate) || "2027-06-01");
    const targetStartDay = parseInt(weekStartDayArg !== undefined ? weekStartDayArg : (projectConfig && projectConfig.weekStartDay), 10);
    const validStartDay = isNaN(targetStartDay) ? 5 : targetStartDay;

    // 전 기간 주차 생성 (중간 절단 없이 시작일부터 종료일까지 모든 주차 생성, 최대 156주(3년)까지 지원)
    const weeks = [];
    let cur = new Date(minDate);
    let alignGuard = 0;
    while (cur.getDay() !== validStartDay && alignGuard < 14) {
      cur.setDate(cur.getDate() - 1);
      alignGuard++;
    }

    let weekGuard = 0;
    while (cur <= maxDate && weekGuard < 156) {
      const weekEnd = new Date(cur);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const mNum = cur.getMonth() + 1;
      const dNum = cur.getDate();
      weeks.push({
        weekNo: weekGuard + 1,
        start: new Date(cur),
        end: weekEnd,
        shortLabel: `${mNum}/${dNum}`,
        monthNum: mNum
      });
      cur.setDate(cur.getDate() + 7);
      weekGuard++;
    }

    const totalWeeks = weeks.length;
    const pad = { top: 32, right: 48, bottom: totalWeeks > 35 ? 48 : 40, left: 42 };
    const w = Math.max(120, canvas.width - pad.left - pad.right);
    const h = Math.max(90, canvas.height - pad.top - pad.bottom);

    // 과업별 비중 (합 1): L1 이면 서브시스템 가중치 × L1 비율, 서브시스템 안이면 가중치 비율
    const shares = targetTasks.length && targetTasks.every(t => t.level === 1) ? WBSEngine.rootShares(targetTasks) : null;
    const totalW = targetTasks.reduce((acc, d) => acc + WBSEngine.wOf(d), 0);
    const share = d => shares ? (shares.get(d) || 0) : (totalW > 0 ? WBSEngine.wOf(d) / totalW : 1 / (targetTasks.length || 1));
    let currentActual = 0;
    targetTasks.forEach(d => { currentActual += (parseFloat(d.aProg) || 0) * share(d); });
    currentActual = Math.round(currentActual);

    const planCurve = [];
    const actualCurve = [];
    const achieveRates = [];
    const pastWeeks = weeks.filter(wk => wk.start <= repDate);

    // 최하위 Task 기준으로 주차마다 계획 · 실적을 다시 계산 (실적은 실적시작 · 완료일로 되짚음 — 지난 주 실제 흐름)
    const leaves = WbsWeight.leafShares(new Map(targetTasks.map(t => [t, share(t)])));
    const isoOf = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const repIso = isoOf(repDate);
    void pastWeeks;
    weeks.forEach((wk, idx) => {
      const endIso = isoOf(wk.end);
      let pSum = 0;
      leaves.forEach((s, t) => { pSum += WbsWeight.planAt(t, endIso) * s; });
      const weekPlan = Math.round(pSum);
      planCurve.push(weekPlan);
      void idx;

      if (wk.start <= repDate) {
        const at = endIso < repIso ? endIso : repIso;
        let aSum = 0;
        leaves.forEach((s, t) => { aSum += WbsWeight.actualAt(t, at, repIso) * s; });
        const actVal = at === repIso ? currentActual : Math.min(currentActual, Math.round(aSum));
        actualCurve.push(actVal);
        const rate = weekPlan > 0 ? Math.min(150, Math.round((actVal / weekPlan) * 100)) : 100;
        achieveRates.push(rate);
      } else {
        actualCurve.push(null);
        achieveRates.push(null);
      }
    });

    const C = typeof ChartTheme !== "undefined" ? ChartTheme.get() : {};
    // 1. 가로 그리드 라인 & 좌측 Y축 (누적 진척률 0~100%)
    ctx.strokeStyle = C.grid||"#e2e8f0";
    ctx.fillStyle = C.axis||"#64748b";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 100; i += 25) {
      const y = pad.top + h - (h * (i / 100));
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();
      ctx.fillText(`${i}%`, pad.left - 6, y + 3);
    }

    // 2. 우측 Y축 (계획 대비 달성률 0~150%)
    ctx.fillStyle = C.rateText||"#d97706";
    ctx.textAlign = "left";
    ctx.fillText("150%", pad.left + w + 6, pad.top + 4);
    ctx.fillText("100%", pad.left + w + 6, pad.top + h - (h * (100 / 150)) + 3);
    ctx.fillText("0%", pad.left + w + 6, pad.top + h + 3);

    const stepX = w / Math.max(1, totalWeeks - 1);
    // 주차 수에 따라 막대 폭 및 폰트 크기 자동 축소
    const barWidth = Math.max(3, Math.min(18, stepX * 0.55));
    const rateFontSize = stepX < 16 ? 7 : (stepX < 24 ? 8 : 9.5);
    const xLabelFontSize = stepX < 14 ? 7 : (stepX < 20 ? 8 : (stepX < 28 ? 9 : 10));

    // 3. 달성률 막대 그래프
    achieveRates.forEach((rate, i) => {
      if (rate !== null) {
        const x = pad.left + i * stepX;
        const barH = h * (Math.min(150, rate) / 150);
        const y = pad.top + h - barH;

        ctx.fillStyle = C.rateFill||"rgba(245, 158, 11, 0.38)";
        ctx.fillRect(x - barWidth / 2, y, barWidth, barH);
        ctx.strokeStyle = C.rateLine||"#f59e0b";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x - barWidth / 2, y, barWidth, barH);

        // 막대 상단 달성률 수치 표시 (폭이 좁으면 폰트를 줄이거나 짝수/마지막 주차에 선명하게 표시)
        if (stepX >= 15 || i % 2 === 0 || i === pastWeeks.length - 1) {
          ctx.fillStyle = C.rateText||"#b45309";
          ctx.font = `bold ${rateFontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(`${rate}%`, x, Math.max(pad.top + 9, y - 3));
        }
      }
    });

    // 4. 누적 계획 진척률 곡선 (전 기간 1월~12월 회색 실선)
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = C.plan||"#64748b";
    planCurve.forEach((val, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + h - (h * (val / 100));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 계획 포인트 점 (전 기간 표시)
    planCurve.forEach((val, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + h - (h * (val / 100));
      ctx.fillStyle = C.sub||"#94a3b8";
      ctx.beginPath();
      ctx.arc(x, y, stepX < 18 ? 1.8 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 5. 누적 실적 진척률 곡선 (녹색 실선 및 포인트)
    ctx.beginPath();
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = C.actual||"#10b981";
    let firstActual = true;
    actualCurve.forEach((val, i) => {
      if (val !== null) {
        const x = pad.left + i * stepX;
        const y = pad.top + h - (h * (val / 100));
        if (firstActual) {
          ctx.moveTo(x, y);
          firstActual = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.stroke();

    actualCurve.forEach((val, i) => {
      if (val !== null) {
        const x = pad.left + i * stepX;
        const y = pad.top + h - (h * (val / 100));
        ctx.fillStyle = C.actual||"#10b981";
        ctx.beginPath();
        ctx.arc(x, y, stepX < 18 ? 2.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 6. X축 전 기간 주차 레이블 표시 (화면에 모자라면 글씨 크기를 자동 축소하고 2줄 교차 배치하여 53주 전 기간 모두 식별 가능)
    ctx.fillStyle = C.label||"#334155";
    ctx.textAlign = "center";
    ctx.font = `${xLabelFontSize}px sans-serif`;

    weeks.forEach((wk, i) => {
      const x = pad.left + i * stepX;
      // 눈금 틱 표시
      ctx.strokeStyle = C.grid||"#cbd5e1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, pad.top + h);
      ctx.lineTo(x, pad.top + h + 4);
      ctx.stroke();

      // 주차 간격이 좁을 때(예: 52주) 글씨 크기를 줄이고 홀수/짝수 행 높이를 위아래로 어긋나게 배치해 겹침 없이 모든 주차 표시
      const yOffset = (stepX < 24 && i % 2 === 1) ? (pad.top + h + 25) : (pad.top + h + 14);
      ctx.fillText(wk.shortLabel, x, yOffset);
    });

    // 하단 전체 기간 요약 캡션
    ctx.fillStyle = C.axis||"#64748b";
    ctx.font = "9.5px sans-serif";
    ctx.textAlign = "right";
    const pStartStr = (projectConfig && projectConfig.projectStartDate) || "2027-01-01";
    const pEndStr = (projectConfig && projectConfig.projectEndDate) || "2027-12-31";
    ctx.fillText(`전 기간 표시: ${pStartStr} ~ ${pEndStr} (총 ${totalWeeks}주)`, pad.left + w, pad.top - 10);

    // 7. 보고기준일 수직 점선 표시
    let repIndex = weeks.findIndex(wk => wk.end >= repDate);
    if (repIndex < 0) repIndex = weeks.length - 1;
    if (repIndex >= 0) {
      const rx = pad.left + repIndex * stepX;
      ctx.strokeStyle = C.today||"#ef4444";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rx, pad.top);
      ctx.lineTo(rx, pad.top + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.today||"#ef4444";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`기준일(${reportDateStr || projectConfig.reportDate})`, rx, pad.top - 10);
    }
  }
};
