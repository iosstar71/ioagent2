// Workgroup 판: modules/requirement/req-phase.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ReqPhaseManager, {
  applyPreset(presetCode) {
    // [v3.9.0] 개선과제 유형은 시스템 설정의 공정 유형 라이브러리에서 고름 (계획 일정은 단계 이름이 같으면 유지)
    if (typeof ProcessLib !== "undefined" && ProcessLib.findReq(presetCode)) {
      if (!ProcessLib.canManageProject()) return showToast("🚫 PM · 시스템관리자만 바꿀 수 있습니다.");
      ProcessLib.applyReqToProject(presetCode);
      const t = ProcessLib.findReq(presetCode);
      this.renderTable();
      if (typeof MasterSyncEngine !== "undefined") MasterSyncEngine.syncAll(true, "req-preset"); else rebuildAll(true);
      return showToast(`개선과제 단계를 [${t.name}] 유형으로 적용했습니다.`);
    }
    const preset = this.PRESETS[presetCode] || this.PRESETS.REQ_MFG_2027;
    projectConfig.reqSdlcPhases = JSON.parse(JSON.stringify(preset.phases));
    projectConfig.activeReqPreset = presetCode;
    this.renderTable();
    if (typeof MasterSyncEngine !== "undefined") {
      MasterSyncEngine.syncAll(true, "req-preset");
    } else {
      rebuildAll(true);
    }
    showToast(`개선과제 단계가 [${preset.name}] 프리셋으로 전환 적용되었습니다.`);
  },
});
