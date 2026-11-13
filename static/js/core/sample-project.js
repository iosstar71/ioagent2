// =============================================================================
// [Standalone] 🧪 샘플 프로젝트 추가 — 교육 · 시연용 (관리자 · PM)
//  - 처음 상태에는 넣지 않고, 버튼을 누를 때만 새 프로젝트로 추가 (지금 프로젝트는 그대로)
//  - 샘플 멤버는 그 프로젝트 참여자로 추가 (처음 암호: 멤버 ID + 123!)
//  - 예전 용어 · 가중치 값은 불러올 때 자동으로 바뀜 (대기 · N차 · 서브시스템 100 기준)
// =============================================================================
var SampleProject = {
  NAME: "🧪 샘플 프로젝트 (스마트공장)",
  async add() {
    if (typeof WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT === "undefined") return showToast("⚠️ 샘플 자료가 없습니다.");
    if (!ProjectManager.canCreate()) return showToast("⛔ 프로젝트 추가는 관리자 · PM 만 할 수 있습니다.");
    const norm = s => String(s || "").replace(/\s+/g, " ").trim();
    if (ProjectContext.localList().some(p => norm(p.name) === norm(this.NAME))) return showToast("ℹ️ 샘플 프로젝트가 이미 있습니다. 머리말의 프로젝트 목록에서 고르세요.");
    openConfirmDialog(`🧪 샘플 프로젝트를 새 프로젝트로 추가합니다.\n지금 프로젝트는 그대로이고, 머리말 프로젝트 목록에서 "${this.NAME}" 를 골라 볼 수 있습니다. 계속할까요?`, async () => {
      try {
        const snap = JSON.parse(JSON.stringify(WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT));
        const users = (snap.projectUsers || []).filter(u => u && u.empNo && !ProjectContext.isAdminUser(u))
          .map(u => ({ empNo: u.empNo, name: u.name, role: u.role, subsystem: u.subsystem, dept: u.dept, lang: u.lang || "ko" }));
        delete snap.projectUsers;
        snap.projectConfig = Object.assign({}, snap.projectConfig || {}, { projectName: this.NAME });
        delete snap.projectConfig.weightModel;   // 처음 열 때 서브시스템 100 기준으로 바뀜
        const pid = await ProjectTransfer.create(this.NAME, snap.projectConfig);
        ProjectTransfer.writeLocal(pid, { name: this.NAME, data: snap, users });
        if (typeof ProjectManager.refreshList === "function") await ProjectManager.refreshList();
        showToast(`✅ 샘플 프로젝트를 추가했습니다 (멤버 ${users.length}명, 처음 암호: 멤버 ID + 123!). 머리말 프로젝트 목록에서 고르세요.`);
        if (typeof ProjectManager.renderSummary === "function") ProjectManager.renderSummary();
      } catch (e) {
        showToast("⚠️ 샘플 프로젝트를 추가하지 못했습니다: " + e.message);
      }
    });
  }
};
window.SampleProject = SampleProject;
