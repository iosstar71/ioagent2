// [IOSTAR-PM] 기준정보: 사용자 · 하위 탭 · 마일스톤 · 진척 기준
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =============================================================================
// [기준정보 > 사용자 정보] 투입인력 계정 · 권한(4단계) · 담당 서브시스템 · 언어
// =============================================================================
// [v3.0.0] 사용자 정보는 프로젝트별 — 이 프로젝트의 사용자(시스템관리자 + 참여자)만 표시
//  역할·담당 서브시스템·부서는 이 프로젝트에만 적용, 사번·이름·비밀번호는 계정 공통
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

// 새로 추가한 행의 사번 변경 (다른 프로젝트·이 프로젝트에 이미 있는 사번은 불가)
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

// 언어 일괄 설정 (전체 사용자)
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

// 서브탭 공통 관리자 (기준정보 / 시스템 설정)
var SubTabs = {
  KEY: "AX_PMYS_SUBTAB_",
  show(group, name) {
    // 화면·테마 · 보고서 템플릿 · 게시판 채널은 프로젝트 설정에만 있음 (Admin 에서 예전 탭을 열면 프로젝트 탭으로)
    if ((group === "config" && name === "report") || (group === "master" && name === "ui-report")) {   // 보고서 설정은 [보고] 메뉴 한 곳
      if (typeof ReportTabs !== "undefined") return ReportTabs.open("settings");
      name = group === "config" ? "project" : "basic";
    }
    if (group === "config" && ["screen", "channel"].indexOf(name) !== -1) name = "project";
    if (typeof SharedPanes !== "undefined") SharedPanes.place(group, name);  // [v3.8.0] 프로젝트별 설정 화면 (시스템 설정 ↔ 기준정보)
    document.querySelectorAll(`.master-subtab-bar[data-group="${group}"] .master-subtab-btn`).forEach(b => b.classList.toggle("active", b.dataset.subtab === name));
    document.querySelectorAll(`.master-subpane[data-group="${group}"]`).forEach(p => p.classList.toggle("active", p.dataset.subpane === name));
    try { sessionStorage.setItem(this.KEY + group, name); } catch (e) {}
    if (group === "master") {
      if (name === "holiday") { ProgressBasisManager.render(); JudgeRules.render(); }
      if (name === "users") renderProjectUsersTable();
      if (name === "basic") { MilestoneManager.render(); if (typeof WeekFmt !== "undefined") WeekFmt.renderSettings(); if (typeof ProjectManager !== "undefined") ProjectManager.renderPanels(); }
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
  restore(group, def) {
    let name = def;
    try { name = sessionStorage.getItem(this.KEY + group) || def; } catch (e) {}
    // 없어졌거나 숨겨진 서브 탭이면 기본 탭으로
    const btn = document.querySelector(`.master-subtab-bar[data-group="${group}"] .master-subtab-btn[data-subtab="${name}"]`);
    if (!btn || btn.style.display === "none") name = def;
    this.show(group, name);
  }
};

// 기준정보 서브탭 (프로젝트 기본정보 / 공정단계정보 / 휴일정보 / 사용자 정보)
var MasterSubTabs = {
  show(name) { SubTabs.show("master", name); },
  restore() { SubTabs.restore("master", "basic"); }
};

// [v1.0.7] 주요 마일스톤 (통합 / 서브시스템별) — projectConfig.milestones
var MilestoneManager = {
  list() {
    if (!Array.isArray(projectConfig.milestones)) projectConfig.milestones = [];
    return projectConfig.milestones;
  },
  render() {
    const body = document.getElementById("milestoneTableBody");
    if (!body) return;
    const list = this.list();
    const rep = projectConfig.reportDate || "";
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:14px; color:var(--text-muted);">등록된 마일스톤이 없습니다. [➕ 마일스톤 추가]로 등록하세요.</td></tr>`;
      return;
    }
    const subs = getAllSubsystemNames();
    body.innerHTML = list
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => String(a.m.date).localeCompare(String(b.m.date)))
      .map(({ m, idx }) => {
        const opts = [`<option value="ALL" ${!m.scope || m.scope === "ALL" ? "selected" : ""}>🏁 통합 (프로젝트 전체)</option>`]
          .concat(subs.map(s => `<option value="${escapeHtml(s)}" ${m.scope === s ? "selected" : ""}>🔧 ${escapeHtml(s)}</option>`)).join("");
        const passed = m.date && m.date <= rep;
        return `<tr>
          <td><select style="width:150px;" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "scope", "$value")}">${opts}</select></td>
          <td><input type="text" value="${escapeHtml(m.name || "")}" style="width:100%; font-weight:bold;" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "name", "$value")}"></td>
          <td><input type="date" value="${escapeHtml(m.date || "")}" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "date", "$value")}"></td>
          <td><input type="text" value="${escapeHtml(m.desc || "")}" style="width:100%;" data-change="MilestoneManager.update" data-change-args="${UiEvents.args(idx, "desc", "$value")}"></td>
          <td style="text-align:center;">${passed ? '<span class="status-tag tag-completed">경과</span>' : '<span class="status-tag tag-ready">예정</span>'}</td>
          <td style="text-align:center;"><button class="btn btn-sm" data-btn="danger" data-click="MilestoneManager.remove" data-click-args="${UiEvents.args(idx)}">×</button></td>
        </tr>`;
      }).join("");
  },
  add(kind) {
    const subs = getAllSubsystemNames();
    const own = Permission.ownSubsystem();
    const scope = kind === "ALL" ? "ALL" : (subs.includes(own) ? own : (subs[0] || "ALL"));
    this.list().push({ id: `MS-${Date.now().toString(36)}`, scope, name: kind === "ALL" ? "신규 통합 마일스톤" : "신규 서브시스템 마일스톤", date: projectConfig.reportDate || projectConfig.projectStartDate, desc: "" });
    this.changed();
  },
  update(idx, field, value) {
    const m = this.list()[idx];
    if (!m) return;
    m[field] = String(value || "").trim();
    this.changed();
  },
  remove(idx) {
    const m = this.list()[idx];
    if (!m) return;
    openConfirmDialog(`[${m.name}] 마일스톤을 삭제하시겠습니까?`, () => {
      this.list().splice(idx, 1);
      this.changed();
    });
  },
  changed() {
    this.render();
    renderGantt();
    persistChanges();
  }
};

// 판정 기준: 지연 판정 차이(%p) · 확인할 일 마감 임박 일수 — [적용] 시 전체 다시 계산
var JudgeRules = {
  render() {
    const g = document.getElementById("cfgDelayGap"), d = document.getElementById("cfgDueDays");
    if (g) g.value = WBSEngine.delayGap();
    if (d) d.value = WBSEngine.dueDays();
  },
  apply() {
    const g = parseFloat((document.getElementById("cfgDelayGap") || {}).value);
    const d = parseInt((document.getElementById("cfgDueDays") || {}).value, 10);
    if (isNaN(g) || g < 0 || g > 100) return showToast("⚠️ 지연 판정 차이는 0 ~ 100 사이 숫자로 입력하세요.");
    if (isNaN(d) || d < 1 || d > 90) return showToast("⚠️ 마감 임박 일수는 1 ~ 90 사이로 입력하세요.");
    projectConfig.delayGap = Math.round(g * 10) / 10;
    projectConfig.dueDays = d;
    rebuildAll();
    this.render();
    showToast(`🚦 판정 기준을 적용했습니다: 지연 = 계획보다 ${projectConfig.delayGap}%p 이상 늦거나 계획종료일 경과 미완료 · 체크할 일 = ${d}일 안 마감`);
  }
};

// 계획 진척률 산정 기준 (달력 일수 / 영업일) — 선택 후 [적용] 시 전체 재계산
var ProgressBasisManager = {
  LABELS: { CALENDAR: "달력 일수 기준 (주말·공휴일 포함)", BUSINESS: "영업일 기준 (주말·공휴일 제외)" },
  current() { return projectConfig.progressBasis === "BUSINESS" ? "BUSINESS" : "CALENDAR"; },
  render() {
    const sel = document.getElementById("cfgProgressBasisSelect");
    if (sel) sel.value = this.current();
    this.onSelectChanged();
  },
  onSelectChanged() {
    const sel = document.getElementById("cfgProgressBasisSelect");
    const st = document.getElementById("progressBasisStatus");
    if (!sel || !st) return;
    const pending = sel.value !== this.current();
    st.innerHTML = pending
      ? `<span style="color:var(--chart-warn-text); font-weight:bold;">⚠️ 변경 대기: [적용]을 눌러야 진척률이 다시 계산됩니다.</span>`
      : `현재 적용: <b>${this.LABELS[this.current()]}</b>`;
  },
  apply() {
    const sel = document.getElementById("cfgProgressBasisSelect");
    if (!sel) return;
    projectConfig.progressBasis = sel.value === "BUSINESS" ? "BUSINESS" : "CALENDAR";
    rebuildAll();
    this.onSelectChanged();
    showToast(`📐 계획 진척률 산정 기준이 [${this.LABELS[projectConfig.progressBasis]}]으로 적용되어 전체 진척률을 다시 계산했습니다.`);
  }
};

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

// [v1.0.7] 사용자별 비밀번호 초기화 (초기 비밀번호 1234)
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

// [v3.0.0] 사용자 삭제 = 이 프로젝트에서 빼기 (다른 프로젝트 참여가 없으면 계정도 삭제)
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
