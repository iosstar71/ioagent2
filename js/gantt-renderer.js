// =============================================================================
// [IOSTAR-PM v1.0.7] WBS 간트차트 렌더러
//  - 표시 단위: 주차(WEEK) / 일자(DAY) / 월(MONTH) 공통 타임라인 엔진
//  - 기준일(보고 기준일) 세로선 표시 (v1.0.7)
//  - 프로젝트 마일스톤 표시 (v1.0.7): 통합 마일스톤은 최상단 행, 서브시스템 마일스톤은 해당 L1 행에 ◆ 표시
// =============================================================================
const GanttRenderer = {
  DAY_MS: 24 * 60 * 60 * 1000,

  _iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  _date(s) { return new Date(String(s).slice(0, 10) + "T00:00:00"); },

  // 표시 단위별 머리글 열과 픽셀 환산 정보
  buildTimeline(scaleMode, startDate, endDate, holidays) {
    const cols = [];
    let origin, pxPerDay;
    if (scaleMode === "MONTH") {
      origin = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const last = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
      const colW = 96;
      const cur = new Date(origin);
      while (cur <= last && cols.length < 48) {
        const y = cur.getFullYear(), m = cur.getMonth() + 1;
        const mEnd = new Date(y, m, 0);
        cols.push({
          width: colW, days: mEnd.getDate(),
          html: `<span class="gh-main" style="font-size:11.5px;">${m}월</span><span class="gh-sub">${y}년</span>`,
          title: `${y}년 ${m}월 (${this._iso(cur)} ~ ${this._iso(mEnd)})`
        });
        cur.setMonth(cur.getMonth() + 1);
      }
      const totalDays = Math.round((last - origin) / this.DAY_MS) + 1;
      const totalWidth = cols.length * colW;
      pxPerDay = totalWidth / totalDays;
      return { cols, origin, pxPerDay, totalWidth };
    }
    if (scaleMode === "WEEK") {
      const wsd = parseInt(projectConfig.weekStartDay, 10);
      const target = isNaN(wsd) ? 1 : wsd;
      origin = new Date(startDate);
      while (origin.getDay() !== target) origin.setDate(origin.getDate() - 1);
      const colW = 72;
      const cur = new Date(origin);
      let w = 1;
      while ((cur <= endDate || cols.length < 6) && cols.length <= 60) {
        const end = new Date(cur);
        end.setDate(end.getDate() + 6);
        const iso = this._iso(cur);
        cols.push({
          width: colW, days: 7,
          html: `<span class="gh-main" style="font-size:11px;">${w}주차</span><span class="gh-sub">${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getDate()).padStart(2, "0")}(${WBSEngine.getDayOfWeekText(iso)})</span>`,
          title: `${w}주차: ${iso} ~ ${this._iso(end)}`
        });
        cur.setDate(cur.getDate() + 7);
        w++;
      }
      pxPerDay = colW / 7;
      return { cols, origin, pxPerDay, totalWidth: cols.length * colW };
    }
    // DAY
    origin = new Date(startDate);
    const dayW = 26;
    const totalDays = Math.max(30, Math.floor((endDate - startDate) / this.DAY_MS) + 1);
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(origin);
      d.setDate(d.getDate() + i);
      const iso = this._iso(d);
      const dow = d.getDay();
      const isHoliday = (holidays || []).some(h => h.date === iso);
      const dn = WBSEngine.getDayOfWeekText(iso);
      cols.push({
        width: dayW, days: 1,
        cls: `${dow === 0 || dow === 6 ? "weekend" : ""} ${isHoliday ? "holiday" : ""}`,
        html: `<span>${d.getDate()}</span><span style="font-size:8px;display:block;line-height:8px;">${dn}</span>`,
        title: `${iso} (${dn}) ${isHoliday ? "(휴일)" : ""}`
      });
    }
    return { cols, origin, pxPerDay: dayW, totalWidth: totalDays * dayW };
  },

  _x(tl, dateStr) {
    return Math.round(((this._date(dateStr) - tl.origin) / this.DAY_MS) * tl.pxPerDay);
  },

  _treeRow(html, level, extraStyle) {
    const row = document.createElement("div");
    row.className = "gantt-row";
    row.style.paddingLeft = `${((level || 1) - 1) * 12 + 8}px`;
    if (extraStyle) row.style.cssText += extraStyle;
    row.innerHTML = html;
    return row;
  },

  _chartRow(tl) {
    const row = document.createElement("div");
    row.className = "gantt-row";
    row.style.width = `${tl.totalWidth}px`;
    row.style.position = "relative";
    let x = 0;
    tl.cols.forEach(c => {
      x += c.width;
      const g = document.createElement("div");
      g.style.cssText = `position:absolute; left:${x - 1}px; top:0; bottom:0; width:1px; background:rgba(148,163,184,0.22);`;
      row.appendChild(g);
    });
    return row;
  },

  // 마일스톤 ◆ 표시
  _milestoneMarker(tl, ms, isIntegrated) {
    const el = document.createElement("div");
    const x = this._x(tl, ms.date);
    const done = ms.date <= (projectConfig.reportDate || "");
    el.className = "gantt-pm-milestone" + (isIntegrated ? " integrated" : "");
    el.style.left = `${x - 7}px`;
    el.title = `[${isIntegrated ? "통합" : ms.scope} 마일스톤] ${ms.name} (${ms.date})${ms.desc ? "\n" + ms.desc : ""}`;
    el.innerHTML = `<span class="gantt-pm-diamond${done ? " passed" : ""}">◆</span><span class="gantt-pm-label">${escapeHtml(ms.name)}</span>`;
    return el;
  },

  render(wbsData, holidays) {
    const tree = document.getElementById("ganttTreeList");
    const header = document.getElementById("ganttHeaderDays");
    const rows = document.getElementById("ganttRowsContainer");
    if (!tree || !header || !rows) return;
    tree.innerHTML = "";
    header.innerHTML = "";
    rows.innerHTML = "";

    const val = (id, def) => { const el = document.getElementById(id); return el && el.value ? el.value : def; };
    const dFilter = val("ganttDomainFilter", "ALL");
    const sysFilter = val("ganttSubsystemFilter", "ALL");
    const maxLvl = parseInt(val("ganttMaxLevelFilter", "5"), 10) || 5;
    const scaleMode = val("ganttScaleFilter", "WEEK");

    const startDate = this._date(projectConfig.projectStartDate || "2026-10-01");
    const endDate = this._date(projectConfig.projectEndDate || "2026-12-31");
    const tl = this.buildTimeline(scaleMode, startDate, endDate, holidays);

    header.style.width = `${tl.totalWidth}px`;
    // 목록 머리글 (차트 머리글과 높이를 맞춰 행 위치 정렬)
    const head = document.createElement("div");
    head.className = "gantt-tree-head";
    head.textContent = "📋 WBS 목록";
    tree.appendChild(head);
    const pane = document.getElementById("ganttPane");
    if (pane) pane.style.width = `${tl.totalWidth}px`;
    tl.cols.forEach(c => {
      const col = document.createElement("div");
      col.className = `gantt-day-col ${c.cls || ""}`;
      col.style.width = `${c.width}px`;
      col.style.minWidth = `${c.width}px`;
      col.style.lineHeight = "16px";
      col.style.paddingTop = "2px";
      col.innerHTML = c.html;
      col.title = c.title;
      header.appendChild(col);
    });

    const filtered = wbsData.filter(t => {
      if (dFilter !== "ALL" && WBSEngine.getSubsystemDomain(t.system) !== dFilter) return false;
      if (sysFilter !== "ALL" && t.system !== sysFilter) return false;
      return (t.level || 1) <= maxLvl;
    });

    // 마일스톤
    const milestones = (projectConfig.milestones || []).filter(m => m && m.date && m.name);
    const integrated = milestones.filter(m => !m.scope || m.scope === "ALL");
    const bySystem = new Map();
    milestones.filter(m => m.scope && m.scope !== "ALL").forEach(m => {
      if (!bySystem.has(m.scope)) bySystem.set(m.scope, []);
      bySystem.get(m.scope).push(m);
    });

    if (integrated.length && sysFilter === "ALL") {
      tree.appendChild(this._treeRow(
        `<span class="lvl-badge" style="background:#7c3aed; color:#fff;">MS</span>
         <span style="font-weight:bold; color:#7c3aed;">🏁 프로젝트 통합 마일스톤 (${integrated.length})</span>`, 1, "background:rgba(124,58,237,0.06);"));
      const row = this._chartRow(tl);
      row.style.background = "rgba(124,58,237,0.06)";
      integrated.forEach(m => row.appendChild(this._milestoneMarker(tl, m, true)));
      rows.appendChild(row);
    }

    filtered.forEach(task => {
      tree.appendChild(this._treeRow(`
        <span class="lvl-badge lvl-${task.level}">L${task.level}</span>
        <span style="font-size:11px; color:var(--text-muted); margin-right:4px;">[${escapeHtml(task.id)}]</span>
        <span style="font-weight:${task.level <= 2 ? "bold" : "normal"}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>`, task.level));

      const row = this._chartRow(tl);
      if (task.pStart) {
        const pEnd = task.pEnd || task.pStart;
        const left = Math.max(0, this._x(tl, task.pStart));
        const width = Math.max(18, this._x(tl, pEnd) + Math.round(tl.pxPerDay) - left - 2);
        const st = WBSEngine.getTaskStatus(task, projectConfig.reportDate);
        const color = st.code === "completed" ? "var(--success)" : st.code === "delayed" ? "var(--danger)" : st.code === "progress" ? "var(--accent)" : "var(--primary)";
        const isPoint = task.isLeaf && task.pStart === pEnd;
        if (isPoint || (task.name || "").includes("마일스톤")) {
          const ms = document.createElement("div");
          ms.className = "gantt-milestone";
          ms.style.left = `${left + 3}px`;
          ms.title = `[마일스톤 과업] ${task.name} (${task.pStart})`;
          row.appendChild(ms);
        } else {
          const bar = document.createElement("div");
          bar.className = "gantt-bar-box";
          bar.style.left = `${left}px`;
          bar.style.width = `${width}px`;
          bar.style.backgroundColor = color;
          bar.innerText = `${task.aProg}% (계획 ${task.pProg}%)`;
          bar.title = `[${task.system}] ${task.name} (${task.pStart} ~ ${pEnd})\n계획: ${task.pProg}% | 실적: ${task.aProg}% | 상태: ${st.label}`;
          row.appendChild(bar);
        }
      }
      // 서브시스템 마일스톤은 해당 서브시스템 L1 행에 표시
      if (task.level === 1 && bySystem.has(task.system)) {
        bySystem.get(task.system).forEach(m => row.appendChild(this._milestoneMarker(tl, m, false)));
      }
      rows.appendChild(row);
    });

    // 같은 행 강조 (목록 ↔ 차트)
    const treeRows = [...tree.querySelectorAll(".gantt-row")];
    const chartRows = [...rows.querySelectorAll(".gantt-row")];
    treeRows.forEach((tr, i) => {
      const cr = chartRows[i];
      if (!cr) return;
      const on = () => { tr.classList.add("gantt-row-hover"); cr.classList.add("gantt-row-hover"); };
      const off = () => { tr.classList.remove("gantt-row-hover"); cr.classList.remove("gantt-row-hover"); };
      [tr, cr].forEach(el => { el.addEventListener("mouseenter", on); el.addEventListener("mouseleave", off); });
    });

    // 기준일 세로선 (머리글 + 전체 행)
    const rep = projectConfig.reportDate;
    if (rep) {
      const x = this._x(tl, rep) + Math.round(tl.pxPerDay / 2);
      if (x >= 0 && x <= tl.totalWidth) {
        rows.style.position = "relative";
        const line = document.createElement("div");
        line.className = "gantt-report-line";
        line.style.left = `${x}px`;
        line.title = `기준일: ${rep}`;
        rows.appendChild(line);
        const tag = document.createElement("div");
        tag.className = "gantt-report-tag";
        tag.style.left = `${x}px`;
        tag.textContent = `기준일 ${rep.slice(5).replace("-", "/")}`;
        header.appendChild(tag);
        // 처음 표시할 때 기준일이 화면 가운데 오도록 자동 스크롤 (목록·차트는 하나의 스크롤 영역)
        const wrap = tree.parentElement;
        if (wrap && !wrap.dataset.userScrolled) {
          wrap.scrollLeft = Math.max(0, x + tree.offsetWidth - wrap.clientWidth / 2);
          if (!wrap.dataset.scrollBound) {
            wrap.dataset.scrollBound = "1";
            wrap.addEventListener("wheel", () => { wrap.dataset.userScrolled = "1"; }, { passive: true });
            wrap.addEventListener("mousedown", () => { wrap.dataset.userScrolled = "1"; });
          }
        }
      }
    }
  }
};
