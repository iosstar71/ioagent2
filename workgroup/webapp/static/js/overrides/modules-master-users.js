// Workgroup 판: modules/master/users.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
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

function renderProjectUsersTable() {
  const tbody = document.getElementById("projectUsersBody");
  const pid = ProjectContext.current;
  const rows = projectUsers.map((u, idx) => ({ u, idx })).filter(x => ProjectContext.isAdminUser(x.u) || ProjectContext.member(x.u, pid));
  const amAdmin = ProjectManager.isAdmin();
  if (tbody) {
    tbody.innerHTML = "";
    const info = document.getElementById("projectUsersScopeInfo");
    if (info) {
      const p = ProjectContext.info();
      info.style.display = "block";
      info.innerHTML = `🗂️ <b>${escapeHtml(p ? p.name : (projectConfig.projectName || pid))}</b> 프로젝트의 멤버입니다. 역할·담당 서브시스템·부서는 이 프로젝트에만 적용되고, 사번·이름·비밀번호는 계정 공통입니다. 다른 프로젝트의 멤버는 ${amAdmin ? "[📥 다른 프로젝트에서 복사]로" : "시스템관리자에게 요청하여"} 가져옵니다.`;
    }
    const copyBtn = document.getElementById("btnCopyUsers");
    if (copyBtn) copyBtn.style.display = amAdmin ? "" : "none";
    rows.forEach(({ u, idx }) => {
      const isAdminAccount = (u.empNo || "").toLowerCase() === "admin";
      const asg = ProjectManager.userAssignment(u);
      const role = asg.role;
      const roles = AuthManager.ROLES.filter(r => r !== "SYS_ADMIN" || amAdmin || asg.admin);
      const roleOpts = roles.map(r => `<option value="${r}" ${role === r ? "selected" : ""}>${AuthManager.ROLE_DESCS[r]}</option>`).join("");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="text" value="${escapeHtml(u.empNo)}" style="width:105px; font-weight:bold;" ${u._new ? "" : "readonly title='저장된 사번은 바꿀 수 없습니다.'"} data-change="setProjectUserEmpNo" data-change-args="${UiEvents.args(idx, "$trim")}"></td>
        <td><input type="text" value="${escapeHtml(u.name || "")}" style="width:100px;" data-change="UiH.set" data-change-args="${UiEvents.args("projectUsers", idx, "name", "$trim", "persistChanges")}"></td>
        <td>
          <select style="width:250px; font-weight:bold;" data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "role", "$value")}" ${isAdminAccount || (asg.admin && !amAdmin) ? "disabled title='시스템 관리자 계정은 모든 프로젝트에서 시스템 관리자 권한을 유지합니다.'" : ""}>${roleOpts}</select>
          ${asg.admin ? `<div class="pm-role-tag own">모든 프로젝트 공통</div>` : ""}
        </td>
        <td>
          <select style="width:125px;" data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "subsystem", "$value")}" ${asg.admin ? "disabled" : ""}>
            <option value="ALL" ${asg.subsystem === "ALL" ? "selected" : ""}>전체 서브시스템</option>
            ${getSubsystemOptionsHtml(asg.subsystem)}
          </select>
        </td>
        <td><input type="text" value="${escapeHtml(asg.dept || "")}" style="width:100%;" data-change="ProjectManager.setUserAssignment" data-change-args="${UiEvents.args(idx, "dept", "$value")}"></td>
        <td>
          <select style="width:90px;" data-change="UiH.set" data-change-args="${UiEvents.args("projectUsers", idx, "lang", "$value", "persistChanges")}">
            <option value="ko" ${(u.lang || "ko") === "ko" ? "selected" : ""}>한국어</option>
            <option value="en" ${u.lang === "en" ? "selected" : ""}>English</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            <input type="password" id="userNewPwd_${idx}" placeholder="새 비번 입력" autocomplete="off" style="width:105px; font-size:var(--fs-xs, 11px);">
            <button class="btn btn-sm" data-btn="save" data-click="updateProjectUserPassword" data-click-args="${UiEvents.args(idx)}">변경</button>
            <button class="btn btn-sm" data-btn="warn" data-click="resetProjectUserPassword" data-click-args="${UiEvents.args(idx)}" title="비밀번호를 초기값(1234)으로 초기화합니다.">🔄 초기화</button>
          </div>
        </td>
        <td><button class="btn btn-danger btn-sm" data-click="deleteProjectUser" data-click-args="${UiEvents.args(idx)}" ${isAdminAccount || (asg.admin && !amAdmin) ? "disabled title='기본 관리자(admin)와 시스템관리자 계정은 시스템관리자만 삭제할 수 있습니다.'" : "title='이 프로젝트에서 빼기 (다른 프로젝트 참여는 유지)'"}>×</button></td>
      `;
      tbody.appendChild(tr);
    });
  }
  // 권한 등급별 인원 통계 (이 프로젝트 기준)
  const list = rows.map(x => x.u);
  const count = r => list.filter(u => ProjectManager.userAssignment(u).role === r).length;
  const setText = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = `${n} 명`; };
  setText("userStatTotal", list.length);
  setText("userStatAdmin", count("SYS_ADMIN"));
  setText("userStatPm", count("PM"));
  setText("userStatLead", count("LEAD"));
  setText("userStatMember", count("MEMBER"));
}

function setProjectUserEmpNo(idx, value) {
  const u = projectUsers[idx];
  if (!u || !u._new) return;
  const v = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(v)) { showToast("⚠️ 사번은 영문/숫자/_.- 2~30자로 입력하세요."); return renderProjectUsersTable(); }
  const other = ProjectContext.findAny(v) || projectUsers.find((x, i) => i !== idx && String(x.empNo || "").toLowerCase() === v.toLowerCase());
  if (other && other !== u) {
    showToast(ProjectManager.isAdmin() ? `⚠️ 이미 있는 사번(${v})입니다. 다른 프로젝트 멤버라면 [📥 다른 프로젝트에서 복사]를 쓰세요.` : `⚠️ 이미 있는 사번(${v})입니다. 다른 프로젝트 멤버는 시스템관리자에게 복사를 요청하세요.`);
    return renderProjectUsersTable();
  }
  u.empNo = v;
  renderProjectUsersTable();
  persistChanges();
}

function applyBulkUserLanguage() {
  const sel = document.getElementById("bulkUserLangSelect");
  const lang = sel && sel.value === "en" ? "en" : "ko";
  openConfirmDialog(`모든 멤버(${projectUsers.length}명)의 언어를 [${lang === "en" ? "English" : "한국어"}]로 설정하시겠습니까? (다음 로그인부터 적용)`, () => {
    projectUsers.forEach(u => { u.lang = lang; });
    renderProjectUsersTable();
    persistChanges();
    showToast(`🌐 전체 멤버 언어가 [${lang === "en" ? "English" : "한국어"}]로 설정되었습니다. 저장 후 다음 로그인부터 적용됩니다.`);
  });
}

function addNewProjectUser() {
  const pid = ProjectContext.current;
  let seq = projectUsers.length;
  const taken = e => !!(ProjectContext.findAny(e) || projectUsers.some(u => String(u.empNo || "").toLowerCase() === e.toLowerCase()));
  while (taken(`emp0${seq}`)) seq++;
  const newEmpNo = `emp0${seq}`;
  const sub = subsystemsMeta[0] ? subsystemsMeta[0].name : "ALL";
  projectUsers.push({
    empNo: newEmpNo, name: `신규담당자${seq}`, role: "MEMBER", subsystem: sub, dept: "", lang: "ko",
    pwdHash: "", // 초기 기본 비밀번호 '1234' 적용
    projectRoles: { [pid]: { role: "MEMBER", subsystem: sub, dept: "프로젝트 수행팀" } },
    _new: true
  });
  renderProjectUsersTable();
  persistChanges();
  showToast(`신규 멤버 [${newEmpNo}] 을(를) 이 프로젝트에 추가했습니다. 사번을 바꿀 수 있습니다. (초기 비밀번호: 1234)`);
}

async function updateProjectUserPassword(idx) {
  const input = document.getElementById(`userNewPwd_${idx}`);
  if (!input || !input.value) {
    showToast("변경할 새 비밀번호를 입력해주세요.");
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
  u.pwdTemp = true; // 관리자가 지정한 임시 비밀번호 → 멤버가 첫 로그인 때 변경
  input.value = "";
  persistChanges();
  showToast(`[${u.name}(${u.empNo})] 인력의 비밀번호가 변경되었습니다.${SyncManager.isLocal() ? "" : " (저장 버튼을 눌러 서버에 반영하세요)"}`);
}

function resetProjectUserPassword(idx) {
  const u = projectUsers[idx];
  if (!u) return;
  openConfirmDialog(`[${u.name}(${u.empNo})] 멤버의 비밀번호를 초기값(1234)으로 초기화하시겠습니까?`, () => {
    u.pwdHash = "";
    u.pwdTemp = false;
    u.pwdReset = true;
    if (String(u.empNo).toLowerCase() === "admin") { try { localStorage.removeItem(AuthManager.LEGACY_ADMIN_HASH_KEY); } catch (e) {} }
    persistChanges();
    showToast(`🔄 [${u.name}(${u.empNo})] 비밀번호가 1234로 초기화되었습니다.${SyncManager.isLocal() ? "" : " (저장 버튼을 눌러 서버에 반영하세요)"}`);
  });
}

function deleteProjectUser(idx) {
  const u = projectUsers[idx];
  if (!u || (u.empNo || "").toLowerCase() === "admin") {
    showToast("기본 관리자(admin) 계정은 삭제할 수 없습니다.");
    return;
  }
  const pid = ProjectContext.current;
  const adminRow = ProjectContext.isAdminUser(u);
  if (adminRow && !ProjectManager.isAdmin()) return showToast("시스템관리자 계정은 시스템관리자만 삭제할 수 있습니다.");
  const full = ProjectContext.findAny(u.empNo) || u;
  const others = Object.keys(full.projectRoles || {}).filter(k => k !== pid);
  const msg = adminRow ? `[${u.name}(${u.empNo})] 시스템관리자 계정을 삭제하시겠습니까?`
    : others.length ? `[${u.name}(${u.empNo})] 멤버를 이 프로젝트에서 뺄까요? (다른 프로젝트 ${others.length}곳의 참여는 유지됩니다)`
    : `[${u.name}(${u.empNo})] 멤버를 이 프로젝트에서 뺄까요? 다른 프로젝트 참여가 없어 계정도 삭제됩니다.`;
  openConfirmDialog(msg, () => {
    if (!adminRow && others.length) {
      const pr = Object.assign({}, u.projectRoles);
      delete pr[pid];
      u.projectRoles = pr;
    } else {
      projectUsers.splice(idx, 1);
    }
    renderProjectUsersTable();
    persistChanges();
  });
}
