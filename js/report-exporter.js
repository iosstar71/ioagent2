// -------------------------------------------------------------
// [2026 v1.2.4] 주간/월간보고 Excel(.xlsx) & PPT(.pptx) 생성기
// + 업데이트 날짜·시간 기반 자동 백업 JSON 매니저(BackupHistoryManager)
// + 단일 서브시스템 지정 로컬 JSON 스마트 병합 매니저(JsonCollabManager)
// -------------------------------------------------------------

const BackupHistoryManager = {
  STORAGE_KEY: "WBS_BACKUP_JSON_HISTORY_V124",
  snapshots: [],

  init() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.snapshots = parsed.slice(0, 15);
      }
    } catch (e) {
      this.snapshots = [];
    }
    this.renderBackupHistoryTable();
  },

  _formatTimestamp(dateObj = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = dateObj.getFullYear();
    const mm = pad(dateObj.getMonth() + 1);
    const dd = pad(dateObj.getDate());
    const hh = pad(dateObj.getHours());
    const mi = pad(dateObj.getMinutes());
    const ss = pad(dateObj.getSeconds());
    return {
      fileStamp: `${yyyy}${mm}${dd}_${hh}${mi}${ss}`,
      displayTime: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
    };
  },

  createBackupSnapshot(actionType = "데이터업로드", targetSubsystem = "ALL", triggerFileDownload = true) {
    const now = new Date();
    const { fileStamp, displayTime } = this._formatTimestamp(now);
    const subCode = targetSubsystem === "ALL"
      ? "ALL"
      : ((typeof WBSEngine !== "undefined" && WBSEngine.getSubsystemCode) ? WBSEngine.getSubsystemCode(targetSubsystem) : targetSubsystem);
    const safeCode = String(subCode || "SUB").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
    const filename = `WBS_Backup_${safeCode}_${fileStamp}.json`;

    const payload = {
      schemaVersion: "2026_v1.2.4",
      backupCreatedAt: displayTime,
      backupReason: actionType,
      targetSubsystem: targetSubsystem,
      exportedBy: (typeof AuthManager !== "undefined" && AuthManager.currentUser) ? AuthManager.currentUser.empNo : "admin",
      projectConfig: JSON.parse(JSON.stringify(projectConfig || {})),
      subsystemsMeta: JSON.parse(JSON.stringify(subsystemsMeta || [])),
      standardDeliverablesMeta: JSON.parse(JSON.stringify(standardDeliverablesMeta || [])),
      projectUsers: (typeof projectUsers !== "undefined") ? JSON.parse(JSON.stringify(projectUsers)) : [],
      wbsData: JSON.parse(JSON.stringify(wbsData || [])),
      deliverablesData: JSON.parse(JSON.stringify(deliverablesData || [])),
      reqMasterData: JSON.parse(JSON.stringify(reqMasterData || [])),
      vocData: JSON.parse(JSON.stringify(vocData || []))
    };

    const snapEntry = {
      id: `BKP-${fileStamp}`,
      filename,
      createdAt: displayTime,
      actionType,
      targetSubsystem,
      wbsCount: payload.wbsData.length,
      delivCount: payload.deliverablesData.length,
      reqCount: payload.reqMasterData.length,
      vocCount: payload.vocData.length,
      payload
    };

    this.snapshots.unshift(snapEntry);
    if (this.snapshots.length > 12) this.snapshots = this.snapshots.slice(0, 12);

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.snapshots));
    } catch (e) {
      // 용량 초과 시 최신 5개만 유지
      try {
        this.snapshots = this.snapshots.slice(0, 5);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.snapshots));
      } catch (_) {}
    }

    const chkAutoDl = document.getElementById("chkAutoDownloadBackupJson");
    const shouldDownload = triggerFileDownload && (!chkAutoDl || chkAutoDl.checked);
    if (shouldDownload && typeof ExcelSync !== "undefined") {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      ExcelSync._triggerDownload(blob, filename);
    }

    this.renderBackupHistoryTable();
    return filename;
  },

  downloadSnapshotByIndex(idx) {
    const item = this.snapshots[idx];
    if (!item || !item.payload) return;
    const blob = new Blob([JSON.stringify(item.payload, null, 2)], { type: "application/json;charset=utf-8" });
    ExcelSync._triggerDownload(blob, item.filename);
    if (typeof showToast === "function") {
      showToast(`[백업 JSON 다운로드] ${item.filename} (${item.createdAt}) 파일이 다운로드되었습니다.`);
    }
  },

  restoreSnapshotByIndex(idx) {
    const item = this.snapshots[idx];
    if (!item || !item.payload) return;
    const p = item.payload;
    if (p.projectConfig) Object.assign(projectConfig, p.projectConfig);
    if (Array.isArray(p.subsystemsMeta)) subsystemsMeta = JSON.parse(JSON.stringify(p.subsystemsMeta));
    if (Array.isArray(p.standardDeliverablesMeta)) standardDeliverablesMeta = JSON.parse(JSON.stringify(p.standardDeliverablesMeta));
    if (Array.isArray(p.wbsData)) wbsData = JSON.parse(JSON.stringify(p.wbsData));
    if (Array.isArray(p.deliverablesData)) deliverablesData = JSON.parse(JSON.stringify(p.deliverablesData));
    if (Array.isArray(p.reqMasterData)) reqMasterData = JSON.parse(JSON.stringify(p.reqMasterData));
    if (Array.isArray(p.vocData)) vocData = JSON.parse(JSON.stringify(p.vocData));
    if (typeof rebuildAll === "function") rebuildAll(true);
    if (typeof showToast === "function") {
      showToast(`[백업 시점 복원 완료] ${item.createdAt} (${item.filename}) 백업 상태로 복원되었습니다.`);
    }
  },

  renderBackupHistoryTable() {
    const tbody = document.getElementById("backupHistoryTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!this.snapshots || this.snapshots.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:14px;">아직 생성된 업데이트 백업 JSON 이력이 없습니다. (JSON 병합 또는 엑셀 업로드 시 업데이트 날짜·시간으로 자동 생성됩니다)</td></tr>`;
      return;
    }
    this.snapshots.forEach((s, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:bold; color:var(--primary);">${escapeHtml(s.createdAt)}</td>
        <td><span class="status-badge-chip chip-progress">${escapeHtml(s.actionType)}</span></td>
        <td><b>${escapeHtml(s.targetSubsystem)}</b></td>
        <td style="font-family:monospace; font-size:11px;">${escapeHtml(s.filename)}</td>
        <td style="font-size:11px;">WBS ${s.wbsCount}건 · 산출물 ${s.delivCount}건 · REQ ${s.reqCount}건 · VOC ${s.vocCount}건</td>
        <td style="text-align:center;">
          <button class="btn btn-primary btn-sm" onclick="BackupHistoryManager.downloadSnapshotByIndex(${idx})">📥 JSON 다운</button>
          <button class="btn btn-warning btn-sm" onclick="BackupHistoryManager.restoreSnapshotByIndex(${idx})">⏪ 이 시점으로 복원</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
};

const ReportExporter = {
  _collectMetrics() {
    const repDate = projectConfig.reportDate || "2026-11-04";
    const repDay = WBSEngine.getDayOfWeekText(repDate);
    const projName = projectConfig.projectName || "차세대 통합 시스템 구축 프로젝트";
    const sysTitle = projectConfig.systemTitle || "Enterprise WBS & 프로젝트 통합 관리 시스템";

    const rootItems = wbsData.filter(d => d.level === 1);
    const totalWeight = rootItems.reduce((acc, d) => acc + (parseFloat(d.weight) || 1), 0) || 1;
    const totalPlan = Math.round(rootItems.reduce((acc, d) => acc + ((d.pProg || 0) * (parseFloat(d.weight) || 1)), 0) / totalWeight);
    const totalActual = Math.round(rootItems.reduce((acc, d) => acc + ((d.aProg || 0) * (parseFloat(d.weight) || 1)), 0) / totalWeight);
    const achieveRate = totalPlan > 0 ? ((totalActual / totalPlan) * 100).toFixed(1) : (totalActual > 0 ? "100.0" : "0.0");

    let cntTotal = wbsData.length, cntComp = 0, cntProg = 0, cntDel = 0, cntReady = 0;
    wbsData.forEach(t => {
      const st = WBSEngine.getTaskStatus(t, repDate).code;
      if (st === "completed") cntComp++;
      else if (st === "delayed") cntDel++;
      else if (st === "progress") cntProg++;
      else cntReady++;
    });

    const allSystems = [...new Set([...subsystemsMeta.map(m => m.name), ...wbsData.map(d => d.system)].filter(Boolean))];
    const sdlcList = (typeof WBSEngine !== "undefined" && WBSEngine.getActiveSdlcList) ? WBSEngine.getActiveSdlcList() : [];
    const activeRounds = (typeof getActiveDeliverableRounds === "function") ? getActiveDeliverableRounds() : ["1회차", "2회차"];

    const subsystemRows = allSystems.map(sys => {
      const meta = subsystemsMeta.find(m => m.name === sys) || { domain: "공통", type: "SDLC", weight: 10, pm: "-" };
      const domain = meta.domain || WBSEngine.getSubsystemDomain(sys);
      const root = wbsData.find(d => d.system === sys && d.level === 1);
      const leafTasks = wbsData.filter(d => d.system === sys && d.isLeaf);
      const pVal = root ? root.pProg : 0;
      const aVal = root ? root.aProg : 0;
      const rate = pVal > 0 ? Math.round((aVal / pVal) * 100) : (aVal > 0 ? 100 : 0);
      const delCnt = leafTasks.filter(t => WBSEngine.getTaskStatus(t, repDate).code === "delayed").length;
      const sdlcSpec = WBSEngine.getSubsystemSdlcSpec(sys);
      const typeLabel = meta.type === "REQ" ? "개선타입(REQ)" : (sdlcSpec ? sdlcSpec.name : "표준SDLC");
      return [domain, sys, typeLabel, meta.pm || "-", meta.weight || 10, leafTasks.length, `${pVal}%`, `${aVal}%`, `${rate}%`, delCnt];
    });

    // SDLC 타입별로 서브시스템 그룹핑
    const sdlcGroups = sdlcList.map(spec => {
      const groupSystems = allSystems.filter(sys => {
        const m = subsystemsMeta.find(x => x.name === sys);
        if (m && m.type === "REQ") return false;
        const curSpec = WBSEngine.getSubsystemSdlcSpec(sys);
        return curSpec && curSpec.code === spec.code;
      });
      const rows = groupSystems.map(sys => {
        const domain = WBSEngine.getSubsystemDomain(sys);
        const sysTasks = wbsData.filter(d => d.system === sys && d.isLeaf);
        const row = [domain, sys];
        spec.phases.forEach(ph => {
          const phTasks = sysTasks.filter(t => WBSEngine.matchTaskToPhase(t, ph, wbsData));
          let pAvg = 0, aAvg = 0;
          if (phTasks.length > 0) {
            const wSum = phTasks.reduce((acc, t) => acc + (parseFloat(t.weight) || 1), 0) || 1;
            pAvg = Math.round(phTasks.reduce((acc, t) => acc + (t.pProg * (parseFloat(t.weight) || 1)), 0) / wSum);
            aAvg = Math.round(phTasks.reduce((acc, t) => acc + (t.aProg * (parseFloat(t.weight) || 1)), 0) / wSum);
          }
          const r = pAvg > 0 ? Math.round((aAvg / pAvg) * 100) : (aAvg > 0 ? 100 : 0);
          row.push(`${pAvg}% / ${aAvg}% (${r}%)`);
        });
        const root = wbsData.find(d => d.system === sys && d.level === 1);
        const rp = root ? root.pProg : 0;
        const ra = root ? root.aProg : 0;
        const rr = rp > 0 ? Math.round((ra / rp) * 100) : 100;
        row.push(`${rp}% / ${ra}% (${rr}%)`);
        return row;
      });
      return { spec, systems: groupSystems, rows };
    });

    const sdlcRows = (sdlcGroups[0] && sdlcGroups[0].rows) ? sdlcGroups[0].rows : [];

    const integratedRows = allSystems.map(sys => {
      const sysReqs = reqMasterData.filter(r => r.system === sys && r.status !== "삭제");
      const reqDone = sysReqs.filter(r => r.status === "완료").length;
      const reqRate = sysReqs.length > 0 ? Math.round((reqDone / sysReqs.length) * 100) : 0;

      let totDeliv = 0, totDelivDone = 0;
      const roundCells = activeRounds.map(rnd => {
        const list = deliverablesData.filter(d => d.system === sys && d.round === rnd);
        const done = list.filter(d => d.status === "보완완료").length;
        totDeliv += list.length;
        totDelivDone += done;
        return `${done} / ${list.length}건`;
      });
      const delivRate = totDeliv > 0 ? Math.round((totDelivDone / totDeliv) * 100) : 0;

      const sysVocs = vocData.filter(v => v.system === sys && v.status !== "삭제");
      const vocDone = sysVocs.filter(v => v.status === "완료" || v.status === "제외").length;
      const vocRate = sysVocs.length > 0 ? Math.round((vocDone / sysVocs.length) * 100) : 0;

      const domain = (typeof WBSEngine !== "undefined") ? WBSEngine.getSubsystemDomain(sys) : "공통";
      return [
        domain,
        sys,
        `${reqDone} / ${sysReqs.length}건 (${reqRate}%)`,
        ...roundCells,
        `${delivRate}%`,
        `${vocDone} / ${sysVocs.length}건 (${vocRate}%)`
      ];
    });

    const delivStats = activeRounds.map(rnd => {
      const items = deliverablesData.filter(d => d.round === rnd);
      const done = items.filter(d => d.status === "보완완료").length;
      const rev = items.filter(d => d.status === "검토요청").length;
      const ing = items.filter(d => d.status === "작성중").length;
      const rdy = items.filter(d => d.status === "작성전").length;
      const rate = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
      return [rnd, items.length, done, rev, ing, rdy, `${rate}%`];
    });

    return {
      projName,
      sysTitle,
      repDate,
      repDay,
      sdlcList,
      sdlcGroups,
      activeRounds,
      periodStr: `${projectConfig.projectStartDate} ~ ${projectConfig.projectEndDate}`,
      totalPlan,
      totalActual,
      achieveRate,
      cntTotal,
      cntComp,
      cntProg,
      cntDel,
      cntReady,
      subsystemRows,
      sdlcRows,
      integratedRows,
      delivStats
    };
  },

  // [v1.0.5] 대시보드 PPT 보고서 기능 일시 비활성화 플래그 (true 로 변경 시 재활성화)
  PPTX_ENABLED: false,

  // [v1.0.5 버그수정] 대시보드 [📥 엑셀 보고서] = 주간보고 탭의 [전체 통합 엑셀] 다운로드와 동일 기능으로 대체
  //  - 기존 대시보드 전용 엑셀은 대제목 셀 병합이 없어 제목이 잘려 보이던 문제가 있었음
  //  - 주간보고 엑셀 엔진(대제목/요약 셀 병합 적용)을 그대로 재사용하여 출력물 일원화
  exportExcelReport() {
    if (typeof WeeklyReportManager === "undefined" || typeof WeeklyReportManager.exportExcel !== "function") {
      return this._exportExcelReportLegacy();
    }
    try {
      if (!WeeklyReportManager.currentWeekReport) WeeklyReportManager.init();
      WeeklyReportManager.exportExcel(true);
    } catch (e) {
      console.error("주간보고 엑셀 생성 실패:", e);
      showToast("⚠️ 엑셀 보고서 생성 중 오류가 발생했습니다: " + e.message, "error");
    }
  },

  // (구) 대시보드 전용 엑셀 보고서 - 참고용으로 보존 (화면에서는 호출하지 않음)
  _exportExcelReportLegacy() {
    const selEl = document.getElementById("reportPeriodTypeSelect");
    const reportType = selEl ? selEl.value : "WEEKLY";
    const typeLabel = reportType === "MONTHLY" ? "월간보고서" : "주간보고서";
    const m = this._collectMetrics();

    const s1Rows = [
      { cells: [`[${m.projName} - ${typeLabel}] 1. 종합대시보드 핵심 현황 (기준일: ${m.repDate} (${m.repDay}))`], styleId: 3, height: 28 },
      { cells: ["프로젝트명", m.projName, "수행기간", m.periodStr, "계획 진척율", `${m.totalPlan}%`, "실적 진척율", `${m.totalActual}%`, "종합 달성률", `${m.achieveRate}%`], styleId: 2, height: 22 },
      { cells: [], styleId: 0, height: 12 },
      { cells: ["[1] 서브시스템별 공정 진척 현황 (종합대시보드)"], styleId: 3, height: 25 },
      { cells: ["분야(상위그룹)", "서브시스템명", "관리유형", "담당PM", "가중치(%)", "실행과업수", "계획(%)", "실적(%)", "달성률(%)", "지연과업(건)"], styleId: 1, height: 24 }
    ];
    m.subsystemRows.forEach(r => s1Rows.push({ cells: r, styleId: 2, height: 20 }));

    s1Rows.push({ cells: [], styleId: 0, height: 12 });
    s1Rows.push({ cells: [`[2] 산출물 제출 회차별 통계 현황 (1회차 ~ ${m.activeRounds.length}회차)`], styleId: 3, height: 25 });
    s1Rows.push({ cells: ["제출회차", "전체(건)", "보완완료(건)", "검토요청(건)", "작성중(건)", "작성전(건)", "제출완료율"], styleId: 1, height: 24 });
    m.delivStats.forEach(r => s1Rows.push({ cells: r, styleId: 2, height: 20 }));

    const s2Rows = [
      { cells: [`[${m.projName} - ${typeLabel}] 2. 단계별 진척 현황 (동일 SDLC 유형별 그룹핑) 및 통합 진척표`], styleId: 3, height: 28 }
    ];
    m.sdlcGroups.forEach((grp, gIdx) => {
      const gHeaders = ["분야", "서브시스템", ...grp.spec.phases.map(p => p.name), "전체 합계"];
      s2Rows.push({ cells: [`[그룹 ${gIdx + 1}] ${grp.spec.name} (${grp.spec.desc || ""}) - 소속 서브시스템 ${grp.systems.length}개`], styleId: 3, height: 25 });
      s2Rows.push({ cells: gHeaders, styleId: 1, height: 24 });
      if (grp.rows.length === 0) {
        s2Rows.push({ cells: ["-", "해당 SDLC 타입으로 지정된 서브시스템 없음", ...grp.spec.phases.map(() => "-"), "-"], styleId: 2, height: 20 });
      } else {
        grp.rows.forEach(r => s2Rows.push({ cells: r, styleId: 2, height: 20 }));
      }
      s2Rows.push({ cells: [], styleId: 0, height: 10 });
    });

    s2Rows.push({ cells: [], styleId: 0, height: 12 });
    s2Rows.push({ cells: ["[2] 서브시스템별 요구사항(REQ) · 산출물 · VOC 통합 진척 현황표"], styleId: 3, height: 25 });
    s2Rows.push({ cells: ["분야", "서브시스템", "요구사항(완료/전체)", ...m.activeRounds.map(r => `${r} 산출물`), "산출물 종합진척율", "VOC 처리(완료·제외/전체)"], styleId: 1, height: 24 });
    m.integratedRows.forEach(r => s2Rows.push({ cells: r, styleId: 2, height: 20 }));

    const s3Rows = [
      { cells: [`[${m.projName} - ${typeLabel}] 3. 주요 진행·지연 WBS 과업 내역`], styleId: 3, height: 28 },
      { cells: ["WBS ID", "서브시스템", "작업명", "상태", "계획시작일", "계획종료일", "계획(%)", "실적(%)", "산출물 / 조치계획"], styleId: 1, height: 24 }
    ];
    wbsData
      .filter(t => t.isLeaf)
      .forEach(t => {
        const st = WBSEngine.getTaskStatus(t, m.repDate).label;
        s3Rows.push({
          cells: [t.id, t.system, t.name, st, t.pStart || "", t.pEnd || "", t.pProg, t.aProg, t.output || ""],
          styleId: 2,
          height: 20
        });
      });

    const blob = ExcelSync._buildXlsxBlob([
      { name: "1_종합대시보드_요약", colWidths: [20, 22, 14, 18, 14, 14, 14, 14, 14, 14], rows: s1Rows },
      { name: "2_단계별_통합진척현황", colWidths: [20, 22, 22, 22, 22, 22, 22, 22], rows: s2Rows },
      { name: "3_세부과업_진척현황", colWidths: [14, 18, 36, 12, 14, 14, 12, 12, 24], rows: s3Rows }
    ]);

    ExcelSync._triggerDownload(blob, `WBS_${typeLabel}_${m.repDate}.xlsx`);
    showToast(`[${typeLabel} 엑셀 생성 완료] 종합대시보드 및 단계별 진척 현황이 포함된 .xlsx 파일이 다운로드되었습니다.`);
  },

  exportPptxReport() {
    if (!this.PPTX_ENABLED) {
      showToast("📽️ PPT 보고서 기능은 현재 버전(v1.0.5)에서 일시 비활성화되었습니다. 엑셀 보고서 또는 주간보고 DOCX를 이용해 주세요.", "warning");
      return;
    }
    const selEl = document.getElementById("reportPeriodTypeSelect");
    const reportType = selEl ? selEl.value : "WEEKLY";
    const typeLabel = reportType === "MONTHLY" ? "월간보고서" : "주간보고서";
    const m = this._collectMetrics();

    const slide1Xml = this._buildPptSlideXml(
      `[${m.projName} ${typeLabel}] 1. 종합대시보드 KPI 및 서브시스템 공정 현황`,
      `기준일자: ${m.repDate} (${m.repDay}) | 수행기간: ${m.periodStr} | 전체 계획 ${m.totalPlan}% · 실적 ${m.totalActual}% (달성률 ${m.achieveRate}%)`,
      ["분야", "서브시스템명", "관리유형", "담당PM", "가중치(%)", "과업수", "계획(%)", "실적(%)", "달성률", "지연(건)"],
      m.subsystemRows,
      [1200000, 1400000, 1300000, 950000, 800000, 800000, 900000, 900000, 900000, 900000]
    );

    const sdlcHeaders = ["서브시스템", ...m.phases.map(p => p.label), "전체 합계"];
    const phaseColW = Math.floor(9500000 / (m.phases.length + 1));
    const sdlcColWidths = [1600000, ...m.phases.map(() => phaseColW), phaseColW];
    const slide2Xml = this._buildPptSlideXml(
      `[${m.projName} ${typeLabel}] 2. 단계별 진척 현황 (${m.sdlcSpec.shortLabel})`,
      `${m.sdlcSpec.label} 기준 계획 대비 실적 진척율 (기준일: ${m.repDate})`,
      sdlcHeaders,
      m.sdlcRows.length > 0 ? m.sdlcRows : [["데이터 없음", ...m.phases.map(() => "-"), "-"]],
      sdlcColWidths
    );

    const intHeaders = ["서브시스템", "요구사항(REQ)", ...m.activeRounds.map(r => `${r} 산출물`), "산출물 진척율", "VOC 처리"];
    const intColW = Math.floor(9400000 / (intHeaders.length - 1));
    const intColWidths = [1700000, ...intHeaders.slice(1).map(() => intColW)];
    const slide3Xml = this._buildPptSlideXml(
      `[${m.projName} ${typeLabel}] 3. 서브시스템별 요구사항 · 산출물 · VOC 통합 진척표`,
      `서브시스템 단위의 요구사항(REQ), 1~${m.activeRounds.length}회차 산출물, VOC 처리 달성률 종합 비교`,
      intHeaders,
      m.integratedRows,
      intColWidths
    );

    const topTasks = wbsData
      .filter(t => t.isLeaf)
      .slice(0, 7)
      .map(t => [
        t.id,
        t.system,
        t.name,
        WBSEngine.getTaskStatus(t, m.repDate).label,
        `${t.pStart || "-"} ~ ${t.pEnd || "-"}`,
        `${t.pProg}%`,
        `${t.aProg}%`
      ]);
    const slide4Xml = this._buildPptSlideXml(
      `[${m.projName} ${typeLabel}] 4. 주요 실행 과업 진척 및 일정 현황`,
      `전체 과업 ${m.cntTotal}건 (완료 ${m.cntComp}건 / 진행중 ${m.cntProg}건 / 지연 ${m.cntDel}건 / 착수전 ${m.cntReady}건)`,
      ["WBS ID", "서브시스템", "핵심 단위 과업명", "상태", "계획 일정", "계획(%)", "실적(%)"],
      topTasks.length > 0 ? topTasks : [["-", "-", "등록된 과업 없음", "-", "-", "0%", "0%"]],
      [1100000, 1450000, 3450000, 950000, 2150000, 1000000, 1000000]
    );

    const pptxBlob = this._packagePptxZip([slide1Xml, slide2Xml, slide3Xml, slide4Xml]);
    ExcelSync._triggerDownload(pptxBlob, `WBS_${typeLabel}_${m.repDate}.pptx`);
    showToast(`[${typeLabel} PPT 생성 완료] 4장 구성의 프레젠테이션(.pptx) 파일이 다운로드되었습니다.`);
  },

  _buildPptSlideXml(titleText, subTitleText, headers, rows, colWidthsEmu) {
    const esc = (s) => ExcelSync.escapeXml(s);
    const gridCols = colWidthsEmu.map(w => `<a:gridCol w="${w}"/>`).join("");

    const headerCells = headers
      .map(
        h => `<a:tc>
          <a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="ko-KR" sz="1050" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${esc(h)}</a:t></a:r></a:p></a:txBody>
          <a:tcPr marL="50000" marR="50000" marT="35000" marB="35000" anchor="ctr">
            <a:solidFill><a:srgbClr val="1E3A8A"/></a:solidFill>
          </a:tcPr>
        </a:tc>`
      )
      .join("");

    const dataRowsXml = rows
      .slice(0, 9)
      .map((r, rIdx) => {
        const bg = rIdx % 2 === 0 ? "F8FAFC" : "FFFFFF";
        const cellsXml = r
          .map(
            (cellVal, cIdx) => `<a:tc>
              <a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="${cIdx === 2 && headers.length === 7 ? "l" : "ctr"}"/><a:r><a:rPr lang="ko-KR" sz="950" b="${cIdx === 0 ? "1" : "0"}"><a:solidFill><a:srgbClr val="1E293B"/></a:solidFill><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${esc(cellVal)}</a:t></a:r></a:p></a:txBody>
              <a:tcPr marL="45000" marR="45000" marT="30000" marB="30000" anchor="ctr">
                <a:solidFill><a:srgbClr val="${bg}"/></a:solidFill>
              </a:tcPr>
            </a:tc>`
          )
          .join("");
        return `<a:tr h="420000">${cellsXml}</a:tr>`;
      })
      .join("");

    const totalW = colWidthsEmu.reduce((a, b) => a + b, 0);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="HeaderBanner"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="280000"/><a:ext cx="11277600" cy="650000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="1E293B"/></a:solidFill>
        </p:spPr>
        <p:txBody>
          <a:bodyPr anchor="ctr" lIns="180000"/>
          <a:lstStyle/>
          <a:p><a:r><a:rPr lang="ko-KR" sz="1900" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${esc(titleText)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="SubHeaderBanner"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="980000"/><a:ext cx="11277600" cy="400000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:solidFill><a:srgbClr val="EFF6FF"/></a:solidFill>
        </p:spPr>
        <p:txBody>
          <a:bodyPr anchor="ctr" lIns="150000"/>
          <a:lstStyle/>
          <a:p><a:r><a:rPr lang="ko-KR" sz="1200" b="1"><a:solidFill><a:srgbClr val="1E3A8A"/></a:solidFill><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${esc(subTitleText)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="4" name="SummaryTable"/>
          <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm><a:off x="457200" y="1520000"/><a:ext cx="${totalW}" cy="4600000"/></p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
            <a:tbl>
              <a:tblPr firstRow="1" bandRow="1"/>
              <a:tblGrid>${gridCols}</a:tblGrid>
              <a:tr h="460000">${headerCells}</a:tr>
              ${dataRowsXml}
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
  },

  _packagePptxZip(slideXmls) {
    const files = [];
    const slideOverrides = slideXmls
      .map(
        (_, i) =>
          `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
      )
      .join("");

    files.push({
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`
    });

    files.push({
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
    });

    const sldIds = slideXmls
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
      .join("");

    files.push({
      name: "ppt/presentation.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${sldIds}</p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`
    });

    const presRels = slideXmls
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
      )
      .join("");

    files.push({
      name: "ppt/_rels/presentation.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${presRels}
  <Relationship Id="rId${slideXmls.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`
    });

    files.push({
      name: "ppt/slideMasters/slideMaster1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`
    });

    files.push({
      name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
    });

    files.push({
      name: "ppt/slideLayouts/slideLayout1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`
    });

    files.push({
      name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
    });

    files.push({
      name: "ppt/theme/theme1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="WBSTheme">
  <a:themeElements>
    <a:clrScheme name="WBS">
      <a:dk1><a:srgbClr val="0F172A"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1E293B"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="1E3A8A"/></a:accent1>
      <a:accent2><a:srgbClr val="0284C7"/></a:accent2>
      <a:accent3><a:srgbClr val="10B981"/></a:accent3>
      <a:accent4><a:srgbClr val="F59E0B"/></a:accent4>
      <a:accent5><a:srgbClr val="EF4444"/></a:accent5>
      <a:accent6><a:srgbClr val="64748B"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="WBSFont">
      <a:majorFont><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/><a:cs typeface="맑은 고딕"/></a:majorFont>
      <a:minorFont><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/><a:cs typeface="맑은 고딕"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="WBSFmt">
      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`
    });

    slideXmls.forEach((sXml, i) => {
      files.push({ name: `ppt/slides/slide${i + 1}.xml`, content: sXml });
      files.push({
        name: `ppt/slides/_rels/slide${i + 1}.xml.rels`,
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
      });
    });

    const zipBlob = ExcelSync._createZipBlob(files);
    return new Blob([zipBlob], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });
  }
};

// -------------------------------------------------------------
// [2026 v1.2.4] 단일 서브시스템 제한 로컬 JSON 협업 매니저
// - 여러 서브시스템이 포함된 JSON이 올라와도 사용자가 지정한 [단 1개의 서브시스템 데이터]만 필터링하여 병합!
// - 병합 실행 시 업데이트 날짜 및 시간(YYYYMMDD_HHMMSS)으로 백업 JSON 자동 생성!
// -------------------------------------------------------------
const JsonCollabManager = {
  openCollabModal() {
    switchTab("tab-merge");
  },

  closeCollabModal() {
    // 스마트병합이 독립 탭(tab-merge)으로 분리되어 별도 모달 닫기 불필요
  },

  // 서브시스템별(또는 전체) 로컬 JSON 파일 내보내기
  exportSubsystemJson(selectId = "collabExportSubsystemSelect") {
    const selEl = document.getElementById(selectId);
    const targetSys = selEl ? selEl.value : "ALL";
    const repDate = projectConfig.reportDate || "2026-11-04";

    const isAll = targetSys === "ALL";
    const payload = {
      schemaVersion: "2026_v1.2.4",
      exportedAt: new Date().toISOString(),
      exportedBy: (typeof AuthManager !== "undefined" && AuthManager.currentUser) ? AuthManager.currentUser.empNo : "admin",
      targetSubsystem: targetSys,
      projectConfig: isAll ? projectConfig : undefined,
      subsystemsMeta: isAll ? subsystemsMeta : subsystemsMeta.filter(s => s.name === targetSys),
      standardDeliverablesMeta: isAll ? standardDeliverablesMeta : undefined,
      wbsData: isAll ? wbsData : wbsData.filter(d => d.system === targetSys),
      deliverablesData: isAll ? deliverablesData : deliverablesData.filter(d => d.system === targetSys),
      reqMasterData: isAll ? reqMasterData : reqMasterData.filter(r => r.system === targetSys),
      vocData: isAll ? vocData : vocData.filter(v => v.system === targetSys)
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const fileLabel = isAll ? "ALL_Master" : `Part_${targetSys}`;
    ExcelSync._triggerDownload(blob, `WBS_Collab_${fileLabel}_${repDate}.json`);
    showToast(
      isAll
        ? `[전체 마스터 JSON 내보내기 완료] WBS_Collab_${fileLabel}_${repDate}.json 파일이 다운로드되었습니다.`
        : `[${targetSys} 전용 JSON 내보내기 완료] 담당자 작업용 분할 JSON 파일이 다운로드되었습니다.`
    );
  },

  // [2026 v1.2.4 핵심 요건] 여러 서브시스템의 JSON이 올라와도 선택한 [단 1개의 서브시스템 데이터]만 병합!
  async mergeMultipleJsonFiles(e, targetSelectId = "mergeTargetSubsystemSelect") {
    const files = e && e.target && e.target.files ? Array.from(e.target.files) : [];
    if (e && e.target) e.target.value = "";
    if (files.length === 0) return;

    const selEl = document.getElementById(targetSelectId);
    const targetSys = selEl ? (selEl.value || "").trim() : "";
    if (!targetSys || targetSys === "ALL") {
      showToast("⚠️ [단일 서브시스템 지정 필수] JSON 병합 시에는 반드시 병합할 대상 서브시스템 1개를 선택해야 합니다.");
      return;
    }

    let matchedDataFound = false;
    let backupFilename = "";
    let countWbs = 0, countDeliv = 0, countReq = 0, countVoc = 0;

    for (const file of files) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || typeof data !== "object") continue;

        const fileWbs = Array.isArray(data.wbsData)
          ? data.wbsData.filter(d => (d.system || "").trim() === targetSys)
          : [];
        const fileDeliv = Array.isArray(data.deliverablesData)
          ? data.deliverablesData.filter(d => (d.system || "").trim() === targetSys)
          : [];
        const fileReq = Array.isArray(data.reqMasterData)
          ? data.reqMasterData.filter(r => (r.system || "").trim() === targetSys)
          : [];
        const fileVoc = Array.isArray(data.vocData)
          ? data.vocData.filter(v => (v.system || "").trim() === targetSys)
          : [];
        const fileSubMeta = Array.isArray(data.subsystemsMeta)
          ? data.subsystemsMeta.filter(s => s && (s.name === targetSys || s.code === targetSys))
          : [];

        if (fileWbs.length + fileDeliv.length + fileReq.length + fileVoc.length + fileSubMeta.length === 0) {
          continue;
        }

        // 최초 유효 매칭 시점에 업데이트 날짜·시간 기반 백업 JSON 1회 자동 생성
        if (!matchedDataFound) {
          matchedDataFound = true;
          backupFilename = BackupHistoryManager.createBackupSnapshot(`JSON병합(${targetSys})`, targetSys, true);
        }

        // 1. 대상 서브시스템 기준정보만 병합
        fileSubMeta.forEach(inSub => {
          const idx = subsystemsMeta.findIndex(s => s.name === targetSys);
          if (idx >= 0) subsystemsMeta[idx] = Object.assign({}, subsystemsMeta[idx], inSub, { name: targetSys });
          else subsystemsMeta.push(Object.assign({}, inSub, { name: targetSys }));
        });

        // 2. 대상 서브시스템의 WBS 데이터만 교체 병합 (다른 서브시스템은 절대 변경하지 않음!)
        if (fileWbs.length > 0) {
          wbsData = wbsData.filter(d => (d.system || "").trim() !== targetSys);
          wbsData.push(...fileWbs);
          countWbs = fileWbs.length;
        }

        // 3. 대상 서브시스템의 산출물 데이터만 Upsert
        if (fileDeliv.length > 0) {
          fileDeliv.forEach(inDeliv => {
            if (!inDeliv || !inDeliv.name) return;
            const idx = deliverablesData.findIndex(
              d => d.system === targetSys && d.round === inDeliv.round && d.name === inDeliv.name
            );
            if (idx >= 0) deliverablesData[idx] = Object.assign({}, deliverablesData[idx], inDeliv, { system: targetSys });
            else deliverablesData.push(Object.assign({}, inDeliv, { id: deliverablesData.length + 1, system: targetSys }));
            countDeliv++;
          });
        }

        // 4. 대상 서브시스템의 요구사항(REQ)만 Upsert
        if (fileReq.length > 0) {
          fileReq.forEach(inReq => {
            if (!inReq || !inReq.id) return;
            const idx = reqMasterData.findIndex(r => r.id === inReq.id && r.system === targetSys);
            if (idx >= 0) reqMasterData[idx] = Object.assign({}, reqMasterData[idx], inReq, { system: targetSys });
            else {
              // 다른 서브시스템 ID와 충돌 방지
              const anyIdx = reqMasterData.findIndex(r => r.id === inReq.id);
              if (anyIdx >= 0 && reqMasterData[anyIdx].system === targetSys) {
                reqMasterData[anyIdx] = Object.assign({}, reqMasterData[anyIdx], inReq, { system: targetSys });
              } else if (anyIdx < 0) {
                reqMasterData.push(Object.assign({}, inReq, { system: targetSys }));
              }
            }
            countReq++;
          });
        }

        // 5. 대상 서브시스템의 VOC만 Upsert
        if (fileVoc.length > 0) {
          fileVoc.forEach(inVoc => {
            if (!inVoc || !inVoc.id) return;
            const idx = vocData.findIndex(v => v.id === inVoc.id && v.system === targetSys);
            if (idx >= 0) vocData[idx] = Object.assign({}, vocData[idx], inVoc, { system: targetSys });
            else {
              const anyIdx = vocData.findIndex(v => v.id === inVoc.id);
              if (anyIdx >= 0 && vocData[anyIdx].system === targetSys) {
                vocData[anyIdx] = Object.assign({}, vocData[anyIdx], inVoc, { system: targetSys });
              } else if (anyIdx < 0) {
                vocData.push(Object.assign({}, inVoc, { system: targetSys }));
              }
            }
            countVoc++;
          });
        }
      } catch (err) {
        console.error("JSON 병합 오류:", file.name, err);
      }
    }

    if (matchedDataFound) {
      this.closeCollabModal();
      rebuildAll(true);
      BackupHistoryManager.renderBackupHistoryTable();
      showToast(
        `[단일 서브시스템(${targetSys}) 스마트 병합 완료]\n• 반영: WBS ${countWbs}건, 산출물 ${countDeliv}건, REQ ${countReq}건, VOC ${countVoc}건 (타 서브시스템 데이터는 자동 제외됨)\n• 백업 생성: ${backupFilename}`
      );
    } else {
      showToast(`업로드한 JSON 파일에서 선택한 [${targetSys}] 서브시스템의 데이터를 찾지 못했습니다.`);
    }
  }
};
