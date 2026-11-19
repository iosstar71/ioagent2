// Workgroup 판: modules/master/users.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(SubTabs, {
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

