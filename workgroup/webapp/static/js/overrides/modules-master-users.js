// Workgroup 판: modules/master/users.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(SubTabs, {
  show(group, name) {
    // 화면·테마 · 보고서 템플릿 · 게시판 채널은 프로젝트 설정에만 있음 (Admin 에서 예전 탭을 열면 프로젝트 탭으로)
    if ((group === "config" && name === "report") || (group === "master" && name === "ui-report")) {   // 보고서 설정은 [보고] 메뉴 한 곳
      if (typeof ReportTabs !== "undefined") return ReportTabs.open("settings");
      name = group === "config" ? "project" : "basic";
    }
    if (group === "config" && ["screen", "channel"].indexOf(name) !== -1) name = "project";
    if (typeof SharedPanes !== "undefined") SharedPanes.place(group, name);  // 프로젝트별 설정 화면 (시스템 설정 ↔ 기준정보)
    document.querySelectorAll(`.master-subtab-bar[data-group="${group}"] .master-subtab-btn`).forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
    document.querySelectorAll(`.master-subpane[data-group="${group}"]`).forEach(p => p.classList.toggle("active", p.dataset.subpane === name));
    try { sessionStorage.setItem(this.KEY + group, name); } catch (e) {}
    if (group === "master") {
      if (name === "holiday") { ProgressBasisManager.render(); JudgeRules.render(); if (typeof WeekFmt !== "undefined") WeekFmt.renderSettings(); }
      if (name === "deliv" && typeof DelivBulkDate !== "undefined") DelivBulkDate.render();
      if (name === "phase") { renderDomainChips(); renderSubsystemsMetaTable(); }
      if (name === "users") renderProjectUsersTable();
      if (name === "basic") { MilestoneManager.render(); if (typeof ProjectManager !== "undefined") ProjectManager.renderPanels(); }
      if (name === "backup" && typeof ProjectData !== "undefined") ProjectData.renderMasterPane();
    }
    if (group === "config" && name === "db") DbConnector.renderConfigForm();
    if (group === "config" && name === "project" && typeof ProjectManager !== "undefined") ProjectManager.renderPanels();
    if (group === "merge" && name === "backup" && typeof BackupPane !== "undefined") BackupPane.render();
    if (group === "merge" && name === "locks" && typeof LockManager !== "undefined") { LockManager.renderBoard(); LockManager.refresh(true); }
    if (group === "config" && name === "users" && typeof UserAdmin !== "undefined") UserAdmin.load();
    if (group === "config" && name === "process" && typeof ProcessLib !== "undefined") ProcessLib.renderAdmin();
    if (group === "config" && name === "data" && typeof DataAdmin !== "undefined") DataAdmin.render();
    if (group === "master" && name === "phase") {
      document.querySelectorAll('#masterSub-phase [data-admin-only]').forEach(b => { b.style.display = typeof ProcessLib !== "undefined" && ProcessLib.isAdmin() ? "" : "none"; });
      if (typeof renderCustomSdlcCards === "function") renderCustomSdlcCards();
      if (typeof ReqPhaseManager !== "undefined") ReqPhaseManager.renderTable();
    }
  },
});



function applyBulkUserLanguage() {
  const sel = document.getElementById("bulkUserLangSelect");
  const lang = sel && sel.value === "en" ? "en" : "ko";
  openConfirmDialog(`모든 멤버(${projectUsers.length}명)의 언어를 [${lang === "en" ? "English" : "한국어"}]로 설정하시겠습니까? (다음 멤버 선택부터 적용)`, () => {
    projectUsers.forEach(u => { u.lang = lang; });
    renderProjectUsersTable();
    persistChanges();
    showToast(`🌐 전체 멤버 언어가 [${lang === "en" ? "English" : "한국어"}]로 설정되었습니다. 저장 후 다음 멤버 선택부터 적용됩니다.`);
  });
}


async function updateProjectUserPassword(idx) {
  const input = document.getElementById(`userNewPwd_${idx}`);
  if (!input || !input.value) {
    showToast("변경할 새 암호를 입력해주세요.");
    return;
  }
  const rule = AuthManager.validateNewPassword(input.value);
  if (rule) {
    showToast(rule);
    return;
  }
  const u = projectUsers[idx];
  const hash = await AuthManager.hashPassword(input.value);
  u.pwdHash = hash;
  u.pwdTemp = true; // 관리자가 지정한 임시 암호 → 멤버가 첫 멤버 선택 때 변경
  input.value = "";
  persistChanges();
  showToast(`[${u.name}(${u.empNo})] 인력의 암호가 변경되었습니다.${SyncManager.isLocal() ? "" : " (저장 버튼을 눌러 서버에 반영하세요)"}`);
}

function resetProjectUserPassword(idx) {
  const u = projectUsers[idx];
  if (!u) return;
  openConfirmDialog(`[${u.name}(${u.empNo})] 멤버의 암호를 초기값(1234)으로 초기화하시겠습니까?`, () => {
    u.pwdHash = "";
    u.pwdTemp = false;
    u.pwdReset = true;
    if (String(u.empNo).toLowerCase() === "admin") { try { localStorage.removeItem(AuthManager.LEGACY_ADMIN_HASH_KEY); } catch (e) {} }
    persistChanges();
    showToast(`🔄 [${u.name}(${u.empNo})] 암호가 1234로 초기화되었습니다.${SyncManager.isLocal() ? "" : " (저장 버튼을 눌러 서버에 반영하세요)"}`);
  });
}

