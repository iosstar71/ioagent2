// Workgroup 판: modules/report/report-exporter.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(BackupHistoryManager, {
  _serverMode() {
    return typeof SyncManager !== "undefined" && !SyncManager.isLocal() && typeof ProjectData !== "undefined" && ProjectData.canManage() && typeof ServerBackend !== "undefined" && !!ServerBackend.token;
  },
});

Object.assign(JsonCollabManager, {
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
        `[단일 서브시스템(${targetSys}) 파일 Merge 완료]\n• 반영: WBS ${countWbs}건, 산출물 ${countDeliv}건, REQ ${countReq}건, VOC ${countVoc}건 (타 서브시스템 데이터는 자동 제외됨)\n• 백업 생성: ${backupFilename}`
      );
    } else {
      showToast(`업로드한 JSON 파일에서 선택한 [${targetSys}] 서브시스템의 데이터를 찾지 못했습니다.`);
    }
  }
});
