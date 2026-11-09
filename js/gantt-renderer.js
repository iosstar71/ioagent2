const GanttRenderer = {
  render(wbsData, holidays) {
    const tree = document.getElementById("ganttTreeList");
    const header = document.getElementById("ganttHeaderDays");
    const rows = document.getElementById("ganttRowsContainer");
    if (!tree || !header || !rows) return;
    tree.innerHTML = "";
    header.innerHTML = "";
    rows.innerHTML = "";

    const dFilterEl = document.getElementById("ganttDomainFilter");
    const sysFilterEl = document.getElementById("ganttSubsystemFilter");
    const lvlFilterEl = document.getElementById("ganttMaxLevelFilter");
    const scaleFilterEl = document.getElementById("ganttScaleFilter");
    const dFilter = dFilterEl ? dFilterEl.value : "ALL";
    const sysFilter = sysFilterEl ? sysFilterEl.value : "ALL";
    const maxLvl = lvlFilterEl ? parseInt(lvlFilterEl.value, 10) || 5 : 5;
    const scaleMode = scaleFilterEl ? scaleFilterEl.value : "WEEK"; // WEEK (주차별) | DAY (일자별) | MONTH (월단위)

    const startDate = new Date(projectConfig.projectStartDate || "2026-10-01");
    const endDate = new Date(projectConfig.projectEndDate || "2026-12-31");

    const filtered = wbsData.filter(t => {
      if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(t.system) !== dFilter) return false;
      if (sysFilter !== "ALL" && t.system !== sysFilter) return false;
      if ((t.level || 1) > maxLvl) return false;
      return true;
    });

    
    if (scaleMode === "MONTH") {
      // [2026 v1.7.8 고도화] 간트차트 월단위(MONTH) 타임라인 뷰
      const startY = startDate.getFullYear();
      const startM = startDate.getMonth();
      const endY = endDate.getFullYear();
      const endM = endDate.getMonth();

      const firstMonthStart = new Date(startY, startM, 1);
      const lastMonthEnd = new Date(endY, endM + 1, 0);

      const months = [];
      const cur = new Date(firstMonthStart);
      let mIdx = 1;
      while (cur <= lastMonthEnd) {
        const y = cur.getFullYear();
        const m = cur.getMonth() + 1;
        const mStart = new Date(y, m - 1, 1);
        const mEnd = new Date(y, m, 0);
        months.push({
          monthIdx: mIdx,
          year: y,
          month: m,
          label: `${y}년 ${m}월`,
          shortLabel: `${m}월`,
          startDate: mStart.toISOString().split("T")[0],
          endDate: mEnd.toISOString().split("T")[0],
          startMs: mStart.getTime(),
          endMs: mEnd.getTime(),
          totalDays: mEnd.getDate()
        });
        cur.setMonth(cur.getMonth() + 1);
        mIdx++;
        if (months.length > 48) break;
      }

      const totalProjectDays = Math.max(1, Math.round((lastMonthEnd.getTime() - firstMonthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const monthColWidth = 96;
      const totalWidth = months.length * monthColWidth;
      const pxPerDay = totalWidth / totalProjectDays;

      header.style.width = `${totalWidth}px`;
      header.innerHTML = "";

      months.forEach(mObj => {
        const col = document.createElement("div");
        col.className = "gantt-day-col";
        col.style.width = `${monthColWidth}px`;
        col.style.minWidth = `${monthColWidth}px`;
        col.style.textAlign = "center";
        col.style.lineHeight = "16px";
        col.style.paddingTop = "3px";
        col.style.borderRight = "1px solid var(--border-color)";
        col.style.background = "#f8fafc";
        col.title = `${mObj.label} (${mObj.startDate} ~ ${mObj.endDate}, 총 ${mObj.totalDays}일)`;
        col.innerHTML = `
          <span style="font-weight:bold; font-size:11.5px; color:var(--primary); display:block;">${mObj.shortLabel}</span>
          <span style="font-size:9.5px; color:var(--text-sub); display:block;">${mObj.year}년</span>
        `;
        header.appendChild(col);
      });

      filtered.forEach(task => {
        // Tree row
        const treeRow = document.createElement("div");
        treeRow.className = "gantt-row";
        treeRow.style.paddingLeft = `${(task.level - 1) * 12 + 8}px`;
        treeRow.innerHTML = `
          <span class="lvl-badge lvl-${task.level}">L${task.level}</span>
          <span style="font-size:11px; color:var(--text-muted); margin-right:4px;">[${escapeHtml(task.id)}]</span>
          <span style="font-weight:${task.level <= 2 ? "bold" : "normal"}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(task.name)}">
            ${escapeHtml(task.name)}
          </span>
        `;
        tree.appendChild(treeRow);

        // Chart row
        const chartRow = document.createElement("div");
        chartRow.className = "gantt-row";
        chartRow.style.width = `${totalWidth}px`;
        chartRow.style.position = "relative";

        // Vertical month gridlines
        months.forEach((_, idx) => {
          const gridLine = document.createElement("div");
          gridLine.style.position = "absolute";
          gridLine.style.left = `${idx * monthColWidth}px`;
          gridLine.style.top = "0";
          gridLine.style.bottom = "0";
          gridLine.style.width = "1px";
          gridLine.style.backgroundColor = "var(--border-color)";
          gridLine.style.opacity = "0.6";
          chartRow.appendChild(gridLine);
        });

        // Bar / Milestone calculation
        const pStart = task.pStart ? new Date(task.pStart) : null;
        const pEnd = task.pEnd ? new Date(task.pEnd) : null;
        const isMilestone = task.isLeaf && task.pStart === task.pEnd;

        if (pStart && pEnd && !isNaN(pStart.getTime()) && !isNaN(pEnd.getTime()) && pEnd >= firstMonthStart && pStart <= lastMonthEnd) {
          const barStartMs = Math.max(pStart.getTime(), firstMonthStart.getTime());
          const barEndMs = Math.min(pEnd.getTime(), lastMonthEnd.getTime());
          const diffStartDays = Math.max(0, Math.round((barStartMs - firstMonthStart.getTime()) / (1000 * 60 * 60 * 24)));
          const durationDays = Math.max(1, Math.round((barEndMs - barStartMs) / (1000 * 60 * 60 * 24)) + 1);

          const leftPx = Math.round(diffStartDays * pxPerDay);
          const widthPx = Math.max(22, Math.round(durationDays * pxPerDay) - 2);

          const st = WBSEngine.getTaskStatus(task, projectConfig.reportDate);
          let barColor = "var(--primary)";
          if (st.code === "completed") barColor = "var(--success)";
          else if (st.code === "delayed") barColor = "var(--danger)";
          else if (st.code === "progress") barColor = "var(--accent)";

          if (isMilestone) {
            const ms = document.createElement("div");
            ms.className = "gantt-milestone";
            ms.style.left = `${leftPx + 3}px`;
            ms.title = `[마일스톤] ${task.name} (${task.pStart})`;
            chartRow.appendChild(ms);
          } else {
            const bar = document.createElement("div");
            bar.className = "gantt-bar-box";
            bar.style.left = `${leftPx}px`;
            bar.style.width = `${widthPx}px`;
            bar.style.backgroundColor = barColor;
            bar.innerText = `${task.aProg}% (계획 ${task.pProg}%)`;
            bar.title = `[${task.system}] ${task.name} (${task.pStart} ~ ${task.pEnd})
계획: ${task.pProg}% | 실적: ${task.aProg}% | 상태: ${st.label}`;
            chartRow.appendChild(bar);
          }
        }

        rows.appendChild(chartRow);
      });
      return;
    }

    if (scaleMode === "WEEK") {
      // [2026 v1.2] 설정 탭에서 지정한 매주 시작 요일(weekStartDay: 0=일 ~ 6=토) 기준으로 주차 시작일 정렬
      const weekStartDay = parseInt(projectConfig.weekStartDay, 10);
      const targetStartDay = isNaN(weekStartDay) ? 1 : weekStartDay;

      const firstWeekStart = new Date(startDate);
      while (firstWeekStart.getDay() !== targetStartDay) {
        firstWeekStart.setDate(firstWeekStart.getDate() - 1);
      }

      const weeks = [];
      const cur = new Date(firstWeekStart);
      let wIdx = 1;
      while (cur <= endDate || weeks.length < 6) {
        const wkStart = new Date(cur);
        const wkEnd = new Date(cur);
        wkEnd.setDate(wkEnd.getDate() + 6);
        const isoStart = wkStart.toISOString().split("T")[0];
        const dayName = WBSEngine.getDayOfWeekText(isoStart);
        const mm = String(wkStart.getMonth() + 1).padStart(2, "0");
        const dd = String(wkStart.getDate()).padStart(2, "0");
        weeks.push({
          weekNum: wIdx,
          start: wkStart,
          end: wkEnd,
          isoStart: isoStart,
          titleLabel: `${wIdx}주차`,
          subLabel: `${mm}/${dd}(${dayName})`
        });
        cur.setDate(cur.getDate() + 7);
        wIdx++;
        if (weeks.length > 60) break;
      }

      const weekColWidth = 72;
      const pxPerDay = weekColWidth / 7;
      const totalWidth = weeks.length * weekColWidth;

      weeks.forEach(wk => {
        const col = document.createElement("div");
        col.className = "gantt-day-col";
        col.style.width = `${weekColWidth}px`;
        col.style.minWidth = `${weekColWidth}px`;
        col.style.lineHeight = "16px";
        col.style.paddingTop = "2px";
        col.innerHTML = `
          <span style="font-weight:bold; font-size:11px; color:var(--primary); display:block;">${wk.titleLabel}</span>
          <span style="font-size:9.5px; color:var(--text-sub); display:block;">${wk.subLabel}</span>
        `;
        col.title = `${wk.titleLabel}: ${wk.isoStart} ~ ${wk.end.toISOString().split("T")[0]}`;
        header.appendChild(col);
      });

      filtered.forEach(task => {
        const treeRow = document.createElement("div");
        treeRow.className = "gantt-row";
        treeRow.style.paddingLeft = `${(task.level - 1) * 12 + 8}px`;
        treeRow.innerHTML = `
          <span class="lvl-badge lvl-${task.level}">L${task.level}</span>
          <span style="font-size:11px; color:var(--text-muted); margin-right:4px;">[${escapeHtml(task.id)}]</span>
          <span style="font-weight:${task.level <= 2 ? "bold" : "normal"}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(task.name)}">
            ${escapeHtml(task.name)}
          </span>
        `;
        tree.appendChild(treeRow);

        const chartRow = document.createElement("div");
        chartRow.className = "gantt-row";
        chartRow.style.width = `${totalWidth}px`;

        // 주차 구분선 표시
        weeks.forEach((_, idx) => {
          const gridLine = document.createElement("div");
          gridLine.style.position = "absolute";
          gridLine.style.left = `${(idx + 1) * weekColWidth - 1}px`;
          gridLine.style.top = "0";
          gridLine.style.bottom = "0";
          gridLine.style.width = "1px";
          gridLine.style.background = "rgba(148, 163, 184, 0.22)";
          chartRow.appendChild(gridLine);
        });

        const tStart = new Date(task.pStart || startDate);
        const tEnd = new Date(task.pEnd || task.pStart || startDate);
        const diffStartDays = Math.max(0, (tStart - firstWeekStart) / (1000 * 60 * 60 * 24));
        const durationDays = Math.max(1, (tEnd - tStart) / (1000 * 60 * 60 * 24) + 1);
        const isMilestone = (task.name || "").includes("마일스톤") || (durationDays === 1 && task.isLeaf);

        const st = WBSEngine.getTaskStatus(task, projectConfig.reportDate);
        let barColor = "var(--primary)";
        if (st.code === "completed") barColor = "var(--success)";
        else if (st.code === "delayed") barColor = "var(--danger)";
        else if (st.code === "progress") barColor = "var(--accent)";

        if (isMilestone) {
          const ms = document.createElement("div");
          ms.className = "gantt-milestone";
          ms.style.left = `${Math.round(diffStartDays * pxPerDay + 3)}px`;
          ms.title = `[마일스톤] ${task.name} (${task.pStart})`;
          chartRow.appendChild(ms);
        } else {
          const bar = document.createElement("div");
          bar.className = "gantt-bar-box";
          bar.style.left = `${Math.round(diffStartDays * pxPerDay)}px`;
          bar.style.width = `${Math.max(22, Math.round(durationDays * pxPerDay) - 2)}px`;
          bar.style.backgroundColor = barColor;
          bar.innerText = `${task.aProg}% (계획 ${task.pProg}%)`;
          bar.title = `[${task.system}] ${task.name} (${task.pStart} ~ ${task.pEnd}) | 계획:${task.pProg}% / 실적:${task.aProg}%`;
          chartRow.appendChild(bar);
        }
        rows.appendChild(chartRow);
      });
    } else {
      // 일자별(DAY) 표시 모드
      const totalDays = Math.max(30, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
      const dayWidth = 26;

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayStr = d.toISOString().split("T")[0];
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = (holidays || []).some(h => h.date === dayStr);
        const dayName = WBSEngine.getDayOfWeekText(dayStr);

        const col = document.createElement("div");
        col.className = `gantt-day-col ${isWeekend ? "weekend" : ""} ${isHoliday ? "holiday" : ""}`;
        col.innerHTML = `<span>${d.getDate()}</span><span style="font-size:8px;display:block;line-height:8px;">${dayName}</span>`;
        col.title = `${dayStr} (${dayName}) ${isHoliday ? "(휴일)" : ""}`;
        header.appendChild(col);
      }

      filtered.forEach(task => {
        const treeRow = document.createElement("div");
        treeRow.className = "gantt-row";
        treeRow.style.paddingLeft = `${(task.level - 1) * 12 + 8}px`;
        treeRow.innerHTML = `
          <span class="lvl-badge lvl-${task.level}">L${task.level}</span>
          <span style="font-size:11px; color:var(--text-muted); margin-right:4px;">[${escapeHtml(task.id)}]</span>
          <span style="font-weight:${task.level <= 2 ? "bold" : "normal"}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(task.name)}">
            ${escapeHtml(task.name)}
          </span>
        `;
        tree.appendChild(treeRow);

        const chartRow = document.createElement("div");
        chartRow.className = "gantt-row";
        chartRow.style.width = `${totalDays * dayWidth}px`;

        const tStart = new Date(task.pStart || startDate);
        const tEnd = new Date(task.pEnd || task.pStart || startDate);
        const diffStart = Math.max(0, Math.floor((tStart - startDate) / (1000 * 60 * 60 * 24)));
        const duration = Math.max(1, Math.floor((tEnd - tStart) / (1000 * 60 * 60 * 24)) + 1);
        const isMilestone = (task.name || "").includes("마일스톤") || (duration === 1 && task.isLeaf);

        const st = WBSEngine.getTaskStatus(task, projectConfig.reportDate);
        let barColor = "var(--primary)";
        if (st.code === "completed") barColor = "var(--success)";
        else if (st.code === "delayed") barColor = "var(--danger)";
        else if (st.code === "progress") barColor = "var(--accent)";

        if (isMilestone) {
          const ms = document.createElement("div");
          ms.className = "gantt-milestone";
          ms.style.left = `${diffStart * dayWidth + 5}px`;
          ms.title = `[마일스톤] ${task.name} (${task.pStart})`;
          chartRow.appendChild(ms);
        } else {
          const bar = document.createElement("div");
          bar.className = "gantt-bar-box";
          bar.style.left = `${diffStart * dayWidth}px`;
          bar.style.width = `${Math.max(18, duration * dayWidth - 4)}px`;
          bar.style.backgroundColor = barColor;
          bar.innerText = `계획 ${task.pProg}% / 실적 ${task.aProg}%`;
          bar.title = `[${task.system}] ${task.name} (${task.pStart} ~ ${task.pEnd}) | 계획:${task.pProg}% / 실적:${task.aProg}%`;
          chartRow.appendChild(bar);
        }
        rows.appendChild(chartRow);
      });
    }
  }
};
