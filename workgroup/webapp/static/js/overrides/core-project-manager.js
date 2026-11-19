// Workgroup 판: core/project-manager.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ProjectManager, {
  async afterLogin() {
    await this.refreshList();
    // [v3.0.0] 관리자가 아닌데 이 프로젝트의 사용자가 아니면 다시 멤버 선택 (프로젝트 선택)
    if (!this.isAdmin() && !ProjectContext.info()) {
      AuthManager.openLogin("🗂️ 프로젝트 멤버 선택", "이 프로젝트의 멤버가 아닙니다. 참여 중인 프로젝트를 선택해 다시 멤버 선택하세요.");
      return false;
    }
    if (!ProjectContext.info()) {
      // 접근할 수 없거나 없는 프로젝트 → 기본 프로젝트로
      if (!ProjectContext.isDefault()) {
        showToast("⚠️ 선택했던 프로젝트에 접근할 수 없어 기본 프로젝트로 전환합니다.");
        ProjectContext.set(ProjectContext.DEFAULT);
        if (!this.isServer()) { setTimeout(() => window.location.reload(), 400); return false; }
      }
    }
    this.renderSelector();
    setTimeout(() => SyncManager.saveSettingsQuiet(), 600);   // 처음 열 때 채워진 기본값(기준일 등)은 변경으로 세지 않음
    return true;
  },

  renderSelector() {
    const sel = document.getElementById("headerProjectSelect");
    if (!sel) return;
    const list = ProjectContext.projects.length ? ProjectContext.projects : [{ id: ProjectContext.current, name: projectConfig.projectName || ProjectContext.current, status: "ACTIVE" }];
    sel.innerHTML = list.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === ProjectContext.current ? "selected" : ""}>${escapeHtml(p.name || p.id)}${p.status === "ARCHIVED" ? " (사용 중지)" : ""}</option>`).join("");
    // [v3.0.0] 프로젝트 전환은 관리자만 — 그 밖의 사용자는 프로젝트 이름만 표시
    const badge = document.getElementById("headerProjectNameBadge");
    const admin = this.isAdmin();
    sel.style.display = admin ? "" : "none";
    if (badge) {
      badge.style.display = admin ? "none" : "";
      badge.textContent = (ProjectContext.info() || {}).name || projectConfig.projectName || ProjectContext.current;
      badge.title = "멤버 선택한 프로젝트 (다른 프로젝트는 다시 멤버 선택하여 선택)";
    }
    const btn = document.getElementById("btnProjectManager");
    if (btn) btn.style.display = this.canCreate() || this.canManage(ProjectContext.info()) ? "" : "none";
    const cur = ProjectContext.info();
    const arch = document.getElementById("projectArchivedBar");
    if (arch) arch.style.display = cur && cur.status === "ARCHIVED" ? "block" : "none";
  },

  // ---- 전환 ----

  // ---- 관리 창 ----
  // 프로젝트 관리는 Admin > 프로젝트 탭 안에서 (예전 팝업 창 대신)

  // ---- 만들기 ----
});

Object.assign(UserCopy, {
});
