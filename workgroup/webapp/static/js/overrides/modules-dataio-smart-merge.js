// Workgroup 판: modules/dataio/smart-merge.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(SmartMergeCenter, {


  // 1) 항목별 다운로드 (모든 사용자 허용)
  // [v3.3.0] scopeOverride: 화면 머리줄 [⬇ 내려받기]에서 그 화면의 서브시스템 조회 범위로 내려받을 때
  async importConsolidated(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    if (!SyncManager.isLocal()) return showToast("ℹ️ DB 서버 방식은 모두 같은 저장소를 쓰므로 마스터 파일 적용가 필요 없습니다.");
    let items;
    try { items = await ProjectTransfer.parse(file); } catch (err) { return showToast("⚠️ 파일을 읽지 못했습니다: " + err.message); }
    if (!items.length) return showToast("⚠️ 마스터 파일(④ 전체 다운로드) 파일이 아닙니다.");
    const src = items[0].data;
    const all = Permission.canEditAllSubsystems();
    const own = SubsysList.label(Permission.ownSubsystem());
    const keep = all ? [] : Permission.ownSubsystems();
    const mine = sys => keep.includes(String(sys || ""));
    openConfirmDialog(`📥 [마스터 파일 적용] ${file.name}\n이 브라우저의 [${ProjectData.currentName()}] 자료를 마스터 파일로 맞춥니다.\n` +
      (keep.length ? `· 내 담당 서브시스템(${own}) 자료는 지금 내 작업 파일을 그대로 둡니다.\n` : "· 모든 서브시스템을 마스터 파일 내용으로 바꿉니다.\n") +
      `· 멤버 계정은 바꾸지 않습니다. 바꾸기 전에 스냅샷을 만듭니다. 계속할까요?`, () => {
      BackupHistoryManager.createBackupSnapshot("마스터 파일가져오기직전백업", "ALL", false);
      const cur = ProjectData.collect();
      const by = (k, f) => (src[k] || []).filter(r => !f(r)).concat((cur[k] || []).filter(f));
      ["wbsData", "reqMasterData", "deliverablesData", "vocData"].forEach(k => DataRegistry.set(k, by(k, r => mine(r.system))));
      DataRegistry.set("weeklyReportsData", by("weeklyReportsData", r => r.scope === "SYS" && mine(r.scopeValue)));
      DataRegistry.set("meetingsData", by("meetingsData", r => mine(r.system)));
      ["noticesData", "communicationsData"].forEach(k => DataRegistry.set(k, src[k] || []));
      const keepName = projectConfig.projectName;
      if (src.projectConfig) projectConfig = Object.assign({}, projectConfig, src.projectConfig, { projectName: keepName });
      if (Array.isArray(src.subsystemsMeta) && src.subsystemsMeta.length) subsystemsMeta = src.subsystemsMeta;
      if (Array.isArray(src.standardDeliverablesMeta)) standardDeliverablesMeta = src.standardDeliverablesMeta;
      StorageManager._afterBulkReplace(`✅ 마스터 파일을 가져왔습니다.${keep.length ? ` (내 담당 ${own} 자료는 그대로)` : ""} (${ProjectData.countText(ProjectData.collect())})`);
    });
  },

  // [v3.9.1] 프로젝트 전체 엑셀(기준정보 · 업무 · 사용자 · 협업 시트) — 스마트병합 ④ 내려받기와 기준정보 > 백업 공용
});
