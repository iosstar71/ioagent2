const DashboardChart = {
  renderSCurve(canvasId, wbsData, reportDateStr, weekStartDayArg, selectedSystem = 'ALL') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 부모 컨테이너 크기 확인 및 0px 방어 (초기 렌더링 시 가로/세로 보정)
    const parent = canvas.parentElement;
    const parentWidth = (parent && parent.clientWidth > 0) ? parent.clientWidth : (canvas.clientWidth || 900);
    const parentHeight = (parent && parent.clientHeight > 0) ? parent.clientHeight : (canvas.clientHeight || 270);
    
    canvas.width = Math.max(300, parentWidth);
    canvas.height = Math.max(180, parentHeight);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pad = { top: 35, right: 65, bottom: 45, left: 50 };
    const w = Math.max(100, canvas.width - pad.left - pad.right);
    const h = Math.max(80, canvas.height - pad.top - pad.bottom);

    // [2026 v1.2.5] 분야 필터 및 서브시스템 필터 연동
    const dFilterEl = document.getElementById("scurveDomainFilter") || document.getElementById("dashDomainFilter");
    const selDomain = dFilterEl ? dFilterEl.value : "ALL";

    let targetTasks = [];
    if (selectedSystem === 'ALL') {
      if (selDomain === 'ALL') {
        targetTasks = wbsData.filter(d => d.level === 1);
      } else {
        targetTasks = wbsData.filter(d => d.level === 1 && (typeof WBSEngine !== "undefined" ? WBSEngine.getSubsystemDomain(d.system) === selDomain : true));
      }
      if (targetTasks.length === 0) {
        targetTasks = wbsData.filter(d => d.level === 1);
      }
    } else {
      targetTasks = wbsData.filter(d => d.system === selectedSystem && (d.level === 2 || (d.level === 1 && d.isLeaf)));
      if (targetTasks.length === 0) {
        targetTasks = wbsData.filter(d => d.system === selectedSystem && d.level === 1);
      }
    }

    let minDate = new Date((projectConfig && projectConfig.projectStartDate) || "2026-10-01");
    let maxDate = new Date((projectConfig && projectConfig.projectEndDate) || "2026-12-31");
    if (isNaN(minDate.getTime())) minDate = new Date("2026-10-01");
    if (isNaN(maxDate.getTime())) maxDate = new Date("2026-12-31");

    const repDate = new Date(reportDateStr || "2026-11-04");

    // [버그 수정] weekStartDay가 string("1") 또는 number(1)로 들어오더라도 안전하게 정수형 변환
    const targetStartDay = parseInt(weekStartDayArg !== undefined ? weekStartDayArg : (projectConfig && projectConfig.weekStartDay), 10) || 1;

    const weeks = [];
    let cur = new Date(minDate);
    let alignGuard = 0;
    while (cur.getDay() !== targetStartDay && alignGuard < 14) {
      cur.setDate(cur.getDate() - 1);
      alignGuard++;
    }

    let weekGuard = 0;
    while ((cur <= maxDate || weeks.length < 10) && weekGuard < 30) {
      const weekEnd = new Date(cur);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const isoStart = cur.toISOString().split("T")[0];
      const dayName = (typeof WBSEngine !== "undefined" && WBSEngine.getDayOfWeekText) ? WBSEngine.getDayOfWeekText(isoStart) : "";
      weeks.push({
        start: new Date(cur),
        end: weekEnd,
        label: `${cur.getMonth() + 1}/${cur.getDate()}${dayName ? `(${dayName})` : ""}`
      });
      cur.setDate(cur.getDate() + 7);
      weekGuard++;
      if (weeks.length >= 26) break;
    }

    const totalW = targetTasks.reduce((acc, d) => acc + (parseFloat(d.weight) || 1), 0) || 1;
    let currentActual = 0;
    targetTasks.forEach(d => { currentActual += ((parseFloat(d.aProg) || 0) * (parseFloat(d.weight) || 1)); });
    currentActual = Math.round(currentActual / totalW);

    const planCurve = [];
    const actualCurve = [];
    const achieveRates = [];
    const pastWeeks = weeks.filter(wk => wk.end <= repDate);

    weeks.forEach((wk, idx) => {
      let pSum = 0;
      targetTasks.forEach(task => {
        const s = new Date(task.pStart || minDate);
        const e = new Date(task.pEnd || maxDate);
        let prog = 0;
        if (wk.end < s) prog = 0;
        else if (wk.end >= e) prog = 100;
        else {
          const tot = Math.max(1, (e - s) / (1000 * 60 * 60 * 24));
          const el = Math.max(0, (wk.end - s) / (1000 * 60 * 60 * 24));
          prog = Math.min(100, Math.round((el / tot) * 100));
        }
        pSum += prog * (parseFloat(task.weight) || 1);
      });
      const weekPlan = Math.round(pSum / totalW);
      planCurve.push(weekPlan);

      if (wk.end <= repDate) {
        const ratio = (idx + 1) / (pastWeeks.length || 1);
        const actVal = Math.min(currentActual, Math.round(currentActual * Math.pow(ratio, 1.15)));
        actualCurve.push(actVal);
        const rate = weekPlan > 0 ? Math.min(150, Math.round((actVal / weekPlan) * 100)) : 100;
        achieveRates.push(rate);
      } else {
        actualCurve.push(null);
        achieveRates.push(null);
      }
    });

    // 1. 그리드 라인 & Y축 (좌측: 진척율 0~100%)
    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    for (let i = 0; i <= 100; i += 25) {
      const y = pad.top + h - (h * (i / 100));
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + w, y);
      ctx.stroke();
      ctx.fillText(`${i}%`, 15, y + 4);
    }

    // 2. 우측 Y축 (달성률 0~150%)
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("150%", pad.left + w + 10, pad.top + 5);
    ctx.fillText("100%", pad.left + w + 10, pad.top + h - (h * (100 / 150)));
    ctx.fillText("0%", pad.left + w + 10, pad.top + h);

    const stepX = w / Math.max(1, weeks.length - 1);
    const barWidth = Math.max(8, Math.min(22, stepX * 0.45));

    // 3. 달성률 막대 그래프
    achieveRates.forEach((rate, i) => {
      if (rate !== null) {
        const x = pad.left + i * stepX;
        const barH = (h * (Math.min(150, rate) / 150));
        const y = pad.top + h - barH;

        ctx.fillStyle = "rgba(245, 158, 11, 0.45)";
        ctx.fillRect(x - (barWidth / 2), y, barWidth, barH);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - (barWidth / 2), y, barWidth, barH);

        ctx.fillStyle = "#b45309";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${rate}%`, x, Math.max(pad.top + 10, y - 4));
      }
    });

    // 4. 누적 계획 진척율 곡선 (회색 선)
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#64748b";
    planCurve.forEach((val, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + h - (h * (val / 100));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 5. 누적 실적 진척율 곡선 (녹색 선 및 원형 포인트)
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#10b981";
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
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 6. X축 주차 레이블
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.font = "10px sans-serif";
    weeks.forEach((wk, i) => {
      const x = pad.left + i * stepX;
      ctx.fillText(wk.label, x, pad.top + h + 20);
    });

    // 7. 보고기준일 점선 표시
    const repIndex = weeks.findIndex(wk => wk.end >= repDate);
    if (repIndex >= 0) {
      const rx = pad.left + repIndex * stepX;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rx, pad.top);
      ctx.lineTo(rx, pad.top + h);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ef4444";
      ctx.textAlign = "center";
      ctx.fillText("보고기준일", rx, pad.top - 12);
    }
  }
};
