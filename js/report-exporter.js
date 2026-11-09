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

  // 대시보드 [📥 엑셀 보고서] = 주간보고 탭의 [전체 통합 엑셀]과 동일한 출력물 (v1.0.5부터 일원화)
  exportExcelReport() {
    try {
      if (!WeeklyReportManager.currentWeekReport) WeeklyReportManager.init();
      WeeklyReportManager.exportExcel(true);
    } catch (e) {
      console.error("주간보고 엑셀 생성 실패:", e);
      showToast("⚠️ 엑셀 보고서 생성 중 오류가 발생했습니다: " + e.message, "error");
    }
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
