// Workgroup 판: core/access-control.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(AuthManager, {
  validateNewPassword(pwd) {
    const p = String(pwd || "");
    if (p.length < this.PWD_MIN_LENGTH) return `암호는 ${this.PWD_MIN_LENGTH}자 이상이어야 합니다.`;
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "암호는 영문과 숫자를 모두 포함해야 합니다.";
    if (/^(1234|12345678|password1?|qwer1234|admin1234)$/i.test(p)) return "추측하기 쉬운 암호는 사용할 수 없습니다.";
    return "";
  },
  // 초기 암호(1234) 사용 중이거나 관리자가 지정한 임시 암호이면 첫 멤버 선택 때 변경 필수
  mustChangeLocal(u) { return !!u && (!u.pwdHash || !!u.pwdTemp); },

  // ---------------------------------------------------------------------------
  // 보안 정책
  // ---------------------------------------------------------------------------
  openLogin(title, desc) {
    this.lockMode = "LOGIN";
    this.pendingTabId = null;
    this._showPane("loginFormPane");
    const server = !SyncManager.isLocal();
    this._setText("lockModalTitle", title || "🔐 시스템 멤버 선택");
    this._setText("lockModalDesc",
      (desc || "멤버 ID과 암호를 입력하여 멤버 선택하세요.") +
      `<br><span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">* 초기 암호: <b>1234</b> (기본 관리자 멤버 ID: admin)</span>`, true);
    const info = document.getElementById("lockServerInfo");
    if (info) {
      info.style.display = "block";
      const notice = typeof ModeGuard !== "undefined" && ModeGuard.loginNotice ? `<div style="margin-top:4px;">${ModeGuard.loginNotice}</div>` : "";
      info.innerHTML = (server
        ? `🗄️ DB 서버 모드 (${escapeHtml(DbConnector.getApiBase())}) — 서버 인증 후 저장 버튼으로 저장합니다.`
        : "💻 로컬 저장소 모드 — 변경 내용이 이 PC 브라우저에 실시간 자동저장됩니다.") + notice;
      info.style.textAlign = "left";
    }
    const cancel = document.getElementById("btnLockCancel");
    if (cancel) cancel.style.display = "none";
    const reg = document.getElementById("registerLinkRow");
    if (reg) reg.style.display = "block";
    const rst = document.getElementById("lnkSelfReset");
    if (rst) { rst.style.display = this.selfResetAllowed() ? "" : "none"; if (rst.previousElementSibling) rst.previousElementSibling.style.display = rst.style.display; }
    this._setText("btnLockSubmit", "🔓 멤버 선택");
    const langSel = document.getElementById("inputLoginLang");
    if (langSel) langSel.value = (typeof I18N !== "undefined" ? I18N.lang : "ko");
    const projRow = document.getElementById("loginProjectRow");
    if (projRow) projRow.style.display = "";
    const psel = document.getElementById("inputLoginProject");
    if (psel) psel.disabled = false;
    this.fillLoginProjects();
    const emp = document.getElementById("inputSecurityEmpNo");
    if (emp && !emp.value) emp.value = (this._readSession() || {}).empNo || "";
    this._err("lockErrorMessage", "");
    const pwd = document.getElementById("inputSecurityPassword");
    if (pwd) pwd.value = "";
    this._overlay(true);
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("securityLockOverlay"));
    setTimeout(() => { const f = emp && !emp.value ? emp : pwd; if (f) f.focus(); }, 80);
  },

  // 권한 메뉴(기준정보/시스템설정) 진입 시 권한 계정 인증
  manualLock(isIdle = false) {
    const active = document.querySelector(".tab-pane.active");
    if (active && this.TAB_POLICY[active.id]) this._innerActivate("tab-home");
    this.sessionAuthenticated = false;
    this._saveSession();
    this.openLogin(
      isIdle ? "⏱️ 자리 비움 자동 잠금" : "🔒 화면 잠금 / 계정 전환",
      isIdle ? "일정 시간 동안 입력이 없어 자동 잠금되었습니다. 다시 멤버 선택하세요." : "계속 작업하거나 다른 계정으로 전환하려면 멤버 선택하세요."
    );
  },

  onServerAuthExpired() {
    if (this._expiredNotified) return;
    this._expiredNotified = true;
    this.sessionAuthenticated = false;
    ServerBackend.setToken("");
    this.openLogin("🔐 서버 인증 만료", "서버 멤버 선택 세션이 만료되었습니다. 다시 멤버 선택하세요. (화면의 미저장 변경 내용은 유지됩니다)");
  },

  // ---------------------------------------------------------------------------
  // 멤버 선택 처리
  // ---------------------------------------------------------------------------
  // [v3.0.0] 멤버 선택 화면 프로젝트 목록 (보관된 프로젝트 제외) — 마지막에 멤버 선택한 프로젝트를 미리 선택
  LOGIN_PROJECT_KEY: "IOSTAR_LOGIN_PROJECT",
  async _verifyLocal(empNo, pwd) {
    const u = ProjectContext.findAny(empNo) || this.findUser(empNo);
    if (!u) return { ok: false, message: `등록되지 않은 멤버 ID(${empNo})입니다. 신규 멤버 등록을 이용하세요.` };
    const inputHash = await this.hashPassword(pwd);
    let target = u.pwdHash;
    if (!target && String(u.empNo).toLowerCase() === "admin") {
      try { target = localStorage.getItem(this.LEGACY_ADMIN_HASH_KEY) || ""; } catch (e) {}
    }
    if (!target) target = await this.hashPassword("1234");
    return inputHash === target ? { ok: true, user: u } : { ok: false, message: "암호가 일치하지 않습니다." };
  },


  async _completeLogin(user, opts = {}) {
    const prev = this.currentUser ? this.currentUser.empNo : null;
    const next = this._buildSessionUser(user);
    if (opts.lang) next.lang = opts.lang;

    // [v3.0.0] 고른 프로젝트가 지금 화면의 프로젝트와 다르면: 그 프로젝트로 바꿔 다시 불러옴
    if (opts.project && opts.project !== ProjectContext.current) {
      const ok = prev ? await this._flushBeforeSwitch() : true;
      if (!ok) return;
      if (typeof ProjectManager !== "undefined") ProjectManager._switching = true;
      this.currentUser = next;
      this.sessionAuthenticated = true;
      this._saveSession();
      ProjectContext.set(opts.project);
      try { sessionStorage.setItem("AX_PMYS_LANDING_TAB", opts.landing || (typeof HomeScreenManager !== "undefined" ? HomeScreenManager.landingTab() : "tab-home")); } catch (e) {}
      showToast("🗂️ 선택한 프로젝트로 들어갑니다...");
      setTimeout(() => window.location.reload(), 200);
      return;
    }

    // 이미 다른 계정으로 작업 중이었다면: 미저장 변경 처리 후 화면을 다시 불러옴 (권한 재적용)
    if (prev && prev.toLowerCase() !== String(next.empNo).toLowerCase()) {
      const ok = await this._flushBeforeSwitch();
      if (!ok) return;
      this.currentUser = next;
      this.sessionAuthenticated = true;
      this._saveSession();
      try { sessionStorage.setItem("AX_PMYS_LANDING_TAB", opts.landing || (typeof HomeScreenManager !== "undefined" ? HomeScreenManager.landingTab() : "tab-home")); } catch (e) {}
      showToast(`👤 계정 전환: ${next.name}(${next.empNo}) — 권한을 다시 적용합니다...`);
      setTimeout(() => window.location.reload(), 300);
      return;
    }

    this.currentUser = next;
    this.sessionAuthenticated = opts.authenticated !== false;
    this._expiredNotified = false;
    this._saveSession();
    this._overlay(false);
    if (typeof UiScale !== "undefined") UiScale.apply(); // [v3.1.0] 사용자별 글자 크기
    this.updateUserBadge();
    this.resetIdleTimer();

    // 사용자별 언어 적용 (멤버 선택 시 선택한 언어를 사용자 설정으로 저장)
    if (typeof I18N !== "undefined") {
      I18N.setLanguage(next.lang || "ko");
      if (opts.lang) this._rememberUserLang(next.empNo, opts.lang);
    }
    // [v2.3.0] 사용자별 화면 방식(Standard / Neo): 지금 화면과 다르면 그 방식으로 다시 불러옴

    await AppBoot.afterLogin();

    let landing = opts.landing;
    try {
      landing = landing || sessionStorage.getItem("AX_PMYS_LANDING_TAB");
      sessionStorage.removeItem("AX_PMYS_LANDING_TAB");
    } catch (e) {}
    const active = document.querySelector(".tab-pane.active");
    this._guardedActivate(landing || (active ? active.id : "tab-home"));
    if (!opts.silent) {
      showToast(`✅ ${next.name}(${next.empNo} · ${this.roleLabel(next.role)}) 님으로 멤버 선택되었습니다.`);
    }
  },

  // 계정 전환 전 미저장 변경 처리

  async changePasswordFromLogin() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value : "");
    const empNo = v("pcEmpNo").trim();
    const oldPwd = v("pcOldPwd"), n1 = v("pcNewPwd"), n2 = v("pcNewPwd2");
    if (!empNo || !oldPwd || !n1 || !n2) return this._err("pcErrorMessage", "모든 항목을 입력하세요.");
    const rule = this.validateNewPassword(n1);
    if (rule) return this._err("pcErrorMessage", rule);
    if (n1 !== n2) return this._err("pcErrorMessage", "새 암호와 확인 입력이 일치하지 않습니다.");
    if (n1 === oldPwd) return this._err("pcErrorMessage", "현재 암호와 다른 암호를 입력하세요.");
    const newHash = await this.hashPassword(n1);
    if (SyncManager.isLocal()) {
      const chk = await this._verifyLocal(empNo, oldPwd);
      if (!chk.ok) return this._err("pcErrorMessage", chk.message);
      const row = Object.assign({}, chk.user, { pwdHash: newHash, pwdTemp: false });
      delete row.pwdReset;
      const res = await LocalBackend.save({ projectUsers: { parts: { [row.empNo]: row }, base: {} } }, true, `password(${row.empNo})`);
      if (!res.ok) return this._err("pcErrorMessage", res.error || "변경 실패");
      DataRegistry.set("projectUsers", res.data.projectUsers);
      SyncManager.setBaseline(["projectUsers"], res.revs);
      if (String(row.empNo).toLowerCase() === "admin") { try { localStorage.removeItem(this.LEGACY_ADMIN_HASH_KEY); } catch (e) {} }
    } else {
      const res = await ServerBackend.request("/api/auth/change-password", { empNo, oldHash: await this.hashPassword(oldPwd), newHash });
      if (!res.ok) return this._err("pcErrorMessage", res.network ? "DB 서버에 연결할 수 없습니다." : (res.message || "변경 실패"));
    }
    const forced = this._forced;
    this._forced = null;
    if (forced && String(forced.user.empNo).toLowerCase() === empNo.toLowerCase()) {
      showToast(`🔑 [${empNo}] 암호가 변경되었습니다.`);
      const user = SyncManager.isLocal() ? (this.findUser(empNo) || forced.user) : Object.assign({}, forced.user, { mustChangePassword: false });
      await this._completeLogin(user, { lang: forced.lang, landing: forced.landing, project: forced.project });
      return;
    }
    showToast(`🔑 [${empNo}] 암호가 변경되었습니다. 새 암호로 멤버 선택하세요.`);
    const emp = document.getElementById("inputSecurityEmpNo");
    if (emp) emp.value = empNo;
    this.openLogin();
  },

  // [v3.0.2] 멤버 선택 화면 암호 초기화 (테스트 버전: 별도 인증 없이 1234 로 초기화, 다음 멤버 선택 때 변경 필수)
  //  DB 서버는 app.ini [security] self_password_reset=0 이면 거부 — 운영 전환 시 끄거나 이 기능을 빼야 함
  selfResetAllowed() {
    return !(typeof APP_CONFIG !== "undefined" && APP_CONFIG.selfReset === false);
  },
  selfResetPassword() {
    if (!this.selfResetAllowed()) return this._err("lockErrorMessage", "암호 초기화가 꺼져 있습니다. 관리자에게 요청하세요.");
    const empInput = document.getElementById("inputSecurityEmpNo");
    const empNo = empInput ? empInput.value.trim() : "";
    if (!empNo) { this._err("lockErrorMessage", "초기화할 멤버 ID을 먼저 입력하세요."); if (empInput) empInput.focus(); return; }
    openConfirmDialog(`[${empNo}] 암호를 초기값(1234)으로 초기화할까요? 다음 멤버 선택 때 새 암호로 바꿔야 합니다.`, () => this._doSelfReset(empNo));
  },
  async _doSelfReset(empNo) {
    if (SyncManager.isLocal()) {
      const u = ProjectContext.findAny(empNo) || this.findUser(empNo);
      if (!u) return this._err("lockErrorMessage", `등록되지 않은 멤버 ID(${empNo})입니다.`);
      const row = Object.assign({}, u, { pwdHash: "", pwdTemp: false });
      delete row.pwdReset;
      const res = await LocalBackend.save({ projectUsers: { parts: { [row.empNo]: row }, base: {} } }, true, `password-reset(${row.empNo})`);
      if (!res.ok) return this._err("lockErrorMessage", res.error || "초기화 실패");
      DataRegistry.set("projectUsers", res.data.projectUsers);
      SyncManager.setBaseline(["projectUsers"], res.revs);
      if (String(row.empNo).toLowerCase() === "admin") { try { localStorage.removeItem(this.LEGACY_ADMIN_HASH_KEY); } catch (e) {} }
    } else {
      const res = await ServerBackend.request("/api/auth/reset-password", { empNo });
      if (!res.ok) return this._err("lockErrorMessage", res.network ? "DB 서버에 연결할 수 없습니다." : (res.message || "초기화 실패"));
    }
    this._err("lockErrorMessage", "");
    const pwd = document.getElementById("inputSecurityPassword");
    if (pwd) { pwd.value = ""; pwd.focus(); }
    showToast(`🔄 [${empNo}] 암호를 1234로 초기화했습니다. 1234로 멤버 선택한 뒤 새 암호로 바꾸세요.`);
  },

  async showRegister(show) {
    this._showPane(show ? "registerFormPane" : "loginFormPane");
    if (!show) return;
    this._setText("lockModalTitle", "👤 신규 멤버 등록");
    this._setText("lockModalDesc", "등록 후 바로 멤버 선택할 수 있습니다. (기본 권한: 멤버)");
    this._err("regErrorMessage", "");
    // [v3.0.0] 멤버 선택 화면에서 고른 프로젝트의 사용자로 등록
    const pid = this.loginProject();
    const psel = document.getElementById("inputLoginProject");
    const pname = psel && psel.selectedIndex > 0 ? psel.options[psel.selectedIndex].textContent : "";
    this._setText("regProjectInfo", pid ? `가입 프로젝트: ${escapeHtml(pname || pid)}` : "⚠️ 멤버 선택 화면에서 가입할 프로젝트를 먼저 선택하세요.", true);
    const sel = document.getElementById("regSubsystem");
    if (sel) {
      let subs = (subsystemsMeta || []).map(s => s.name);
      if (SyncManager.isLocal() && pid && pid !== ProjectContext.current) {
        const st = LocalBackend._read(pid) || {};
        subs = (st.subsystemsMeta || []).map(s => s.name);
      }
      if (!SyncManager.isLocal()) {
        const info = await ServerBackend.request("/api/auth/bootstrap", { projectId: pid }, "POST");
        if (info.ok && Array.isArray(info.subsystems)) subs = info.subsystems;
      }
      sel.innerHTML = subs.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    }
    const lang = document.getElementById("regLang");
    if (lang) lang.value = (typeof I18N !== "undefined" ? I18N.lang : "ko");
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("securityLockOverlay"));
  },

  async register() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
    const empNo = v("regEmpNo");
    const name = v("regName");
    const subsystem = v("regSubsystem");
    const dept = v("regDept");
    const p1 = document.getElementById("regPwd").value;
    const p2 = document.getElementById("regPwd2").value;
    const lang = v("regLang") || "ko";
    if (!/^[A-Za-z0-9_.-]{2,30}$/.test(empNo)) return this._err("regErrorMessage", "멤버 ID은 영문/숫자/_.- 2~30자로 입력하세요.");
    if (!name) return this._err("regErrorMessage", "성명을 입력하세요.");
    if (!subsystem) return this._err("regErrorMessage", "담당 서브시스템을 선택하세요.");
    const rule = this.validateNewPassword(p1);
    if (rule) return this._err("regErrorMessage", rule);
    if (p1 !== p2) return this._err("regErrorMessage", "암호 확인이 일치하지 않습니다.");
    const pid = this.loginProject();
    if (!pid) return this._err("regErrorMessage", "멤버 선택 화면에서 가입할 프로젝트를 먼저 선택하세요.");

    const newUser = {
      empNo, name, role: "MEMBER", subsystem, dept: dept || "",
      pwdHash: await this.hashPassword(p1), lang,
      projectRoles: { [pid]: { role: "MEMBER", subsystem, dept: dept || "" } },
      registeredAt: new Date().toISOString().slice(0, 19).replace("T", " ")
    };

    if (SyncManager.isLocal()) {
      await LocalBackend.load(["projectUsers"]).then(r => { if (r.data.projectUsers) DataRegistry.set("projectUsers", r.data.projectUsers); });
      if (ProjectContext.findAny(empNo)) return this._err("regErrorMessage", `이미 등록된 멤버 ID(${empNo})입니다.`);
      const res = await LocalBackend.save({ projectUsers: { parts: { [empNo]: newUser }, base: { [empNo]: 0 } } }, false, "self-register");
      if (!res.ok) return this._err("regErrorMessage", res.error || "등록 실패 (이미 등록된 멤버 ID일 수 있습니다)");
      DataRegistry.set("projectUsers", res.data.projectUsers);
      SyncManager.setBaseline(["projectUsers"], res.revs);
    } else {
      const res = await ServerBackend.request("/api/auth/register", { user: newUser, projectId: pid });
      if (!res.ok) return this._err("regErrorMessage", res.message || "등록 실패");
    }
    showToast(`✅ [${name}(${empNo})] 멤버 등록 완료 — 멤버 권한(${subsystem})으로 멤버 선택하세요.`);
    ["regEmpNo", "regName", "regDept", "regPwd", "regPwd2"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const emp = document.getElementById("inputSecurityEmpNo");
    if (emp) emp.value = empNo;
    if (typeof I18N !== "undefined") I18N.preview(lang);
    this.openLogin();
  },

  // ---------------------------------------------------------------------------
  // 암호 변경 (본인)
  // ---------------------------------------------------------------------------
  async changePassword() {
    const cur = document.getElementById("cfgCurrentPassword").value;
    const n1 = document.getElementById("cfgNewPassword").value;
    const n2 = document.getElementById("cfgConfirmPassword").value;
    if (!cur || !n1 || !n2) return showToast("모든 암호 필드를 입력해주세요.");
    if (n1 !== n2) return showToast("새 암호와 확인 입력이 일치하지 않습니다.");
    const rule = this.validateNewPassword(n1);
    if (rule) return showToast(rule);
    const me = this.getCurrentUser();
    const newHash = await this.hashPassword(n1);
    if (SyncManager.isLocal()) {
      const check = await this._verifyLocal(me.empNo, cur);
      if (!check.ok) return showToast("현재 암호가 일치하지 않습니다.");
      const u = this.findUser(me.empNo);
      u.pwdHash = newHash;
      u.pwdTemp = false;
      await SyncManager.save(["projectUsers"], { notify: false });
    } else {
      const res = await ServerBackend.request("/api/auth/password", { oldHash: await this.hashPassword(cur), newHash });
      if (!res.ok) return showToast("암호 변경 실패: " + (res.message || ""));
    }
    ["cfgCurrentPassword", "cfgNewPassword", "cfgConfirmPassword"].forEach(id => { document.getElementById(id).value = ""; });
    showToast(`🔑 ${me.name}(${me.empNo}) 계정의 암호가 변경되었습니다.`);
  },

  // ---------------------------------------------------------------------------
  // 탭 접근 제어 (activateTab / switchTab 단일 래핑)
  // ---------------------------------------------------------------------------
});
