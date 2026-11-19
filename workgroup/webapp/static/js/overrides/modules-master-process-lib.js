// Workgroup 판: modules/master/process-lib.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ProcessLib, {
  refreshSdlc(code) {
    if (!this.canManageProject()) return showToast("🚫 PM · 시스템관리자만 바꿀 수 있습니다.");
    if (!this.applySdlcToProject(code)) return;
    renderCustomSdlcCards();
    rebuildAll(true);
    showToast(`🔄 [${(this.findSdlc(code) || {}).name || code}] 시스템 설정의 최신 단계 구성을 이 프로젝트에 반영했습니다. (계획 일정은 단계 이름이 같으면 유지)`);
  },

  // ---- 프로젝트: 단계 계획 일정만 고치는 창 (기존 SDLC 편집 창 재사용) ----
  saveModal(mode, code, name, desc) {
    if (mode.target === "dates") {
      if (!this.canManageProject()) return showToast("🚫 PM · 시스템관리자만 바꿀 수 있습니다.");
      const bad = _editingSdlcPhasesTemp.find(p => p.pStart && p.pEnd && p.pStart > p.pEnd);
      if (bad) return showToast(`[${bad.name}] 단계의 계획 종료일이 시작일보다 빠릅니다.`);
      const wSum = Math.round(_editingSdlcPhasesTemp.reduce((a, p) => a + (parseFloat(p.weight) || 0), 0) * 10) / 10;
      if (wSum > 100) return showToast(`⚠️ 단계 가중치 합계가 100 을 넘을 수 없습니다 (지금 ${wSum}).`, "warning");
      if (!this.projectSdlc(mode.code)) this.applySdlcToProject(mode.code);
      const t = this.projectSdlc(mode.code);
      t.phases.forEach((p, i) => { const e = _editingSdlcPhasesTemp[i] || {}; p.weight = parseFloat(e.weight) || 0; if (e.pStart) p.pStart = e.pStart; else delete p.pStart; if (e.pEnd) p.pEnd = e.pEnd; else delete p.pEnd; });
      closeCustomSdlcModal();
      renderCustomSdlcCards();
      rebuildAll(true);
      return showToast(`📅 [${t.name}] 단계별 가중치 · 계획 일정을 바꿨습니다. [저장]을 누르면 기록됩니다.`);
    }
    if (!this.isAdmin()) return showToast("🚫 SDLC 유형은 시스템관리자만 바꿀 수 있습니다.");
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(code)) return showToast("⚠️ 유형 코드는 영문 · 숫자 · _ - 로 2~40자여야 합니다.");
    if (!name) return showToast("⚠️ 유형 이름을 입력하세요.");
    if (!_editingSdlcPhasesTemp.length) return showToast("⚠️ 단계를 1개 이상 등록하세요.");
    const lib = this.editable();
    const list = lib[mode.kind];
    const other = (mode.kind === "sdlc" ? lib.req : lib.sdlc).concat(list.filter((t, i) => i !== mode.idx));
    if (other.some(t => t.code === code)) return showToast(`⚠️ 이미 있는 유형 코드입니다: ${code}`);
    const obj = this._stripDates({ code, name, desc, phases: _editingSdlcPhasesTemp });
    if (mode.idx >= 0) list[mode.idx] = obj; else list.push(obj);
    closeCustomSdlcModal();
    this.renderAdmin();
    persistChanges();
    showToast(`💾 [${name}] ${this.KIND[mode.kind]}을 저장했습니다. 프로젝트에는 [프로젝트 설정 > Phase 설정]에서 활성화하거나 [🔄 최신 반영]으로 적용됩니다.`);
  },
});
