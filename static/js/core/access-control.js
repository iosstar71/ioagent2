// =============================================================================
// 인증·권한(RBAC) 관리자 (AuthManager 단일 정의)
// -----------------------------------------------------------------------------
//  - v1.0.5 까지 app.js / access-control.js 여러 곳에서 canAccessTab·switchTab·activateTab 이
//    서로 다른 규칙으로 재정의되어 권한 검사가 무력화되던 문제를 이 파일 하나로 일원화
//  - 역할: SYS_ADMIN(관리자) / PM(프로젝트관리자) / LEAD(총괄리더) / MEMBER(일반작업자)
//      · LEAD  : 담당 서브시스템 업무 데이터 수정·저장 (담당이 ALL 이면 전체, 기준정보/시스템설정 제외) — v4.0.0
//      · MEMBER: 담당 서브시스템 데이터만 저장 (다른 서브시스템 변경은 저장 시 원복)
//  - 작업자 선택: 최초 접속 시 작업자 선택 + 신규 작업자 등록(기본 권한 MEMBER) + 작업자별 언어 선택
//  - DB 서버 모드: 서버 작업자 선택(토큰) 인증 — wbs_db_server.py /api/auth/*
// =============================================================================
var AuthManager = {
  SALT: "WBS_OFFLINE_SECURITY_SALT_2026",
  LEGACY_ADMIN_HASH_KEY: "WBS_SECURITY_PASSWORD_HASH", // v1.0.5 이하 admin 암호 보관 위치 (이관용)
  STORAGE_POLICY_KEY: "WBS_SECURITY_AUTH_POLICY_2026",
  STORAGE_AUTOLOCK_KEY: "WBS_SECURITY_AUTOLOCK_MIN_2026",
  SESSION_USER_KEY: "AX_PMYS_SESSION_USER",
  LAST_LANG_KEY: "AX_PMYS_LAST_LANG",

  ROLES: ["SYS_ADMIN", "PM", "LEAD", "MEMBER"],
  ROLE_LABELS: {
    SYS_ADMIN: "관리자",
    PM: "PM",
    LEAD: "PL",
    MEMBER: "멤버"
  },
  ROLE_DESCS: {
    SYS_ADMIN: "👑 관리자 (전체 메뉴·시스템설정)",
    PM: "🛡️ 프로젝트 관리자 (프로젝트 설정·파일 Merge·전체 데이터)",
    LEAD: "⭐ PL (담당 서브시스템 — 담당을 ALL 로 지정하면 프로젝트 전체)",
    MEMBER: "👤 멤버 (담당 서브시스템 데이터만 저장)"
  },
  // 여기에 없는 탭은 모든 작업자 접근 가능
  TAB_POLICY: {
    "tab-config": ["SYS_ADMIN"],
    "tab-master": ["SYS_ADMIN", "PM"]
  },

  currentUser: null,
  sessionAuthenticated: false,
  lockMode: "LOGIN", // LOGIN (멤버 선택/잠금) | CONFIG (권한 메뉴 진입 인증)
  pendingTabId: null,
  failedAttempts: 0,
  lockoutUntil: 0,
  idleTimer: null,

  // ---------------------------------------------------------------------------
  // 해시 (HTTP 비보안 컨텍스트에서도 동작하는 순수 JS SHA-256)
  // ---------------------------------------------------------------------------
  _sha256PureJs(asciiBytes) {
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const rotr = (n, x) => (x >>> n) | (x << (32 - n));
    const msgLen = asciiBytes.length;
    const bitLenHi = Math.floor((msgLen * 8) / 0x100000000);
    const bitLenLo = (msgLen * 8) >>> 0;
    const padLen = ((msgLen + 9 + 63) & ~63);
    const padded = new Uint8Array(padLen);
    padded.set(asciiBytes);
    padded[msgLen] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padLen - 8, bitLenHi, false);
    dv.setUint32(padLen - 4, bitLenLo, false);

    let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
    let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;
    const W = new Uint32Array(64);

    for (let offset = 0; offset < padLen; offset += 64) {
      for (let t = 0; t < 16; t++) {
        W[t] = dv.getUint32(offset + t * 4, false);
      }
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
        const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0;
        d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      H0 = (H0 + a) >>> 0; H1 = (H1 + b) >>> 0; H2 = (H2 + c) >>> 0; H3 = (H3 + d) >>> 0;
      H4 = (H4 + e) >>> 0; H5 = (H5 + f) >>> 0; H6 = (H6 + g) >>> 0; H7 = (H7 + h) >>> 0;
    }
    return [H0, H1, H2, H3, H4, H5, H6, H7].map(v => v.toString(16).padStart(8, "0")).join("");
  },


  async hashPassword(password) {
    const rawStr = String(password || "") + this.SALT;
    const bytes = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(rawStr)
      : new Uint8Array(Array.from(rawStr).map(c => c.charCodeAt(0) & 0xff));
    if (window.crypto && window.crypto.subtle && window.isSecureContext) {
      try {
        const buf = await window.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      } catch (e) { /* fallthrough */ }
    }
    return this._sha256PureJs(bytes);
  },

  // 초기 암호 = 1234 (두 판 공통) — 암호를 정하지 않았거나 초기화한 멤버. 처음 들어올 때 반드시 바꿈
  INITIAL_PWD: "1234",
  INITIAL_PWD_HINT: "1234",
  initialPassword(empNo) { void empNo; return this.INITIAL_PWD; },
  // 암호를 바꾼 시각 (pwdAt) — 멤버 PC 에서 바꾼 암호를 PM 이 합칠 때 더 새 것만 반영 (MemberCred)
  pwdStamp() { return new Date().toISOString(); },
  // 새 암호 규칙: 8자 이상, 영문과 숫자를 모두 포함, 초기 암호 사용 불가
  PWD_MIN_LENGTH: 8,
  validateNewPassword(pwd, empNo) {
    const p = String(pwd || "");
    if (empNo && p.toLowerCase() === this.initialPassword(empNo).toLowerCase()) return "초기 암호(1234)는 새 암호로 쓸 수 없습니다.";
    if (p.length < this.PWD_MIN_LENGTH) return `암호는 ${this.PWD_MIN_LENGTH}자 이상이어야 합니다.`;
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "암호는 영문과 숫자를 모두 포함해야 합니다.";
    if (/^(1234|12345678|password1?|qwer1234|admin1234)$/i.test(p)) return "추측하기 쉬운 암호는 사용할 수 없습니다.";
    return "";
  },
  // 초기 암호(1234)를 쓰고 있거나 관리자가 초기화한 암호이면 처음 멤버를 고를 때 변경 필수 (Workgroup 과 같음)
  mustChangeLocal(u) {
    if (!u) return false;
    if (u.pwdHash && !u.pwdTemp) return false;
    if (!u.pwdHash && String(u.empNo).toLowerCase() === "admin") { try { if (AppStore.getItem(this.LEGACY_ADMIN_HASH_KEY)) return false; } catch (e) {} }
    return true;
  },

  // ---------------------------------------------------------------------------
  // 보안 정책
  // ---------------------------------------------------------------------------
  // 기본 = ID_ONLY (Standalone): 멤버는 ID 만으로 시작, 프로젝트 설정 · Admin 메뉴는 암호 확인 (세션에 한 번)
  getAuthPolicy() {
    try { return AppStore.getItem(this.STORAGE_POLICY_KEY) || "ID_ONLY"; } catch (e) { return "ID_ONLY"; }
  },
  idOnlyLogin() { return SyncManager.isLocal() && this.getAuthPolicy() === "ID_ONLY"; },
  // 이번 세션에서 암호로 확인한 멤버인지 (ID_ONLY 에서 권한 메뉴에 들어갈 때)
  pwdVerified: false,
  setAuthPolicy(policy) {
    try { AppStore.setItem(this.STORAGE_POLICY_KEY, policy); } catch (e) {}
    const labels = {
      ID_ONLY: "아이디만 확인 — 프로젝트 설정 · Admin 은 암호 (기본)",
      STARTUP_ONLY: "최초 접속(멤버 선택) 시 1회 인증 (권장)",
      STARTUP_AND_CONFIG: "최초 접속 시 + 권한 메뉴 진입 시 재인증",
      CONFIG_ONLY: "권한 메뉴 진입 시에만 인증 (로컬 모드 전용)",
      OFF: "인증 사용 안 함 (로컬 모드 전용 · 관리자로 동작)"
    };
    showToast(`보안 인증 정책이 [${labels[policy] || policy}] 로 변경되었습니다.`);
  },
  getAutoLockMinutes() {
    try {
      const v = AppStore.getItem(this.STORAGE_AUTOLOCK_KEY);
      return v !== null ? parseInt(v, 10) : 15;
    } catch (e) { return 15; }
  },
  setAutoLockMinutes(mins) {
    const m = parseInt(mins, 10) || 0;
    try { AppStore.setItem(this.STORAGE_AUTOLOCK_KEY, String(m)); } catch (e) {}
    this.resetIdleTimer();
    showToast(m > 0 ? `${m}분간 미사용 시 자동 잠금이 작동하도록 설정되었습니다.` : "미사용 자동 잠금이 해제되었습니다.");
  },
  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const mins = this.getAutoLockMinutes();
    if (!mins || mins <= 0) return;
    this.idleTimer = setTimeout(() => {
      if (this.sessionAuthenticated && this.getAuthPolicy() !== "OFF") this.manualLock(true);
    }, mins * 60 * 1000);
  },

  // ---------------------------------------------------------------------------
  // 역할/작업자
  // ---------------------------------------------------------------------------
  normalizeRole(role) {
    const r = String(role || "").toUpperCase();
    if (r === "SYS_ADMIN" || r === "ADMIN") return "SYS_ADMIN";
    if (r === "PM") return "PM";
    if (r === "LEAD" || r === "LEADER" || r === "TOTAL_LEAD") return "LEAD";
    return "MEMBER";
  },
  roleLabel(role) { return this.ROLE_LABELS[this.normalizeRole(role)]; },

  _guestUser() { return { empNo: "", name: "멤버 미선택", role: "MEMBER", subsystem: "", dept: "", lang: "ko" }; },
  getCurrentUser() { return this.currentUser || this._guestUser(); },
  getCurrentRole() { return this.normalizeRole(this.getCurrentUser().role); },

  findUser(empNo) {
    const key = String(empNo || "").trim().toLowerCase();
    return (projectUsers || []).find(u => String(u.empNo || "").toLowerCase() === key) || null;
  },

  _buildSessionUser(u) {
    // 프로젝트별 역할: 서버 모드는 서버가 계산한 값, 로컬 모드는 작업자 행의 projectRoles 로 계산
    const eff = (u.projectId && u.baseRole) ? u : ProjectContext.effective(u);
    return {
      empNo: eff.empNo,
      name: eff.name || eff.empNo,
      role: this.normalizeRole(eff.role),
      baseRole: this.normalizeRole(eff.baseRole || u.role),
      projectId: eff.projectId || ProjectContext.current,
      subsystem: eff.subsystem || "ALL",
      dept: eff.dept || "",
      lang: eff.lang || "ko",
      noDownload: !!eff.noDownload   // [Workgroup] 다운로드 제한 (서버가 정함)
    };
  },

  canAccessTab(role, tabId) {
    const allowed = this.TAB_POLICY[tabId];
    return !allowed || allowed.indexOf(this.normalizeRole(role)) !== -1;
  },

  getTabMeta(tabId) {
    const metas = {
      "tab-config": { name: "⚙️ Admin", reqRoleLabel: "관리자(SYS_ADMIN)", defaultEmpNo: "admin" },
      "tab-master": { name: "🗂️ 프로젝트 설정", reqRoleLabel: "프로젝트 관리자(PM) 또는 관리자(SYS_ADMIN)", defaultEmpNo: "pm" }
    };
    return metas[tabId] || { name: "관리 메뉴", reqRoleLabel: "관리자", defaultEmpNo: "admin" };
  },

  // ---------------------------------------------------------------------------
  // 세션
  // ---------------------------------------------------------------------------
  _saveSession() {
    try {
      const u = this.getCurrentUser();
      sessionStorage.setItem(this.SESSION_USER_KEY, JSON.stringify({ empNo: u.empNo, authenticated: this.sessionAuthenticated, pwdVerified: !!this.pwdVerified, user: u }));
    } catch (e) {}
  },
  _readSession() {
    try { return JSON.parse(sessionStorage.getItem(this.SESSION_USER_KEY) || "null"); } catch (e) { return null; }
  },
  _clearSession() {
    try { sessionStorage.removeItem(this.SESSION_USER_KEY); } catch (e) {}
    if (typeof ServerBackend !== "undefined") ServerBackend.setToken("");
  },

  // ---------------------------------------------------------------------------
  // 시작: 세션 복원 → 작업자 선택 화면
  // ---------------------------------------------------------------------------
  async init() {
    const polSel = document.getElementById("cfgAuthPolicySelect");
    const lockSel = document.getElementById("cfgAutoLockMinutesSelect");
    if (polSel) polSel.value = this.getAuthPolicy();
    if (lockSel) lockSel.value = String(this.getAutoLockMinutes());
    ["mousemove", "keydown", "click"].forEach(evt => window.addEventListener(evt, () => this.resetIdleTimer(), { passive: true }));
    this.installTabGuards();

    const server = !SyncManager.isLocal();
    const sess = this._readSession();

    if (server) {
      ServerBackend.loadToken();
      if (ServerBackend.token) {
        const me = await ServerBackend.request("/api/auth/me", {});
        if (me.ok && me.user && !me.user.mustChangePassword) {
          if (Array.isArray(me.projects)) ProjectContext.projects = me.projects;
          if (me.user.projectId && me.user.projectId !== ProjectContext.current) ProjectContext.set(me.user.projectId);
          await this._completeLogin(me.user, { silent: true });
          return;
        }
        ServerBackend.setToken("");
      }
      this.openLogin();
      return;
    }

    // 로컬 저장소 모드
    const policy = this.getAuthPolicy();
    if (sess && sess.authenticated && this.findUser(sess.empNo) && !(this.mustChangeLocal(this.findUser(sess.empNo)) && !["OFF", "CONFIG_ONLY", "ID_ONLY"].includes(policy) && !sess.pwdVerified)) {
      await this._completeLogin(this.findUser(sess.empNo), { silent: true, pwdVerified: !!sess.pwdVerified });
      return;
    }
    if (policy === "OFF" || policy === "CONFIG_ONLY") {
      await this._completeLogin(this.findUser("admin") || projectUsers[0], { silent: true, authenticated: policy === "OFF" });
      return;
    }
    this.openLogin();
  },

  // 권한 메뉴(기준정보/시스템설정) 진입 시 권한 계정 인증
  requestTabAccess(tabId) {
    const hasPerm = this.canAccessTab(this.getCurrentRole(), tabId);
    const policy = this.getAuthPolicy();
    // ID_ONLY: 권한 메뉴는 이번 세션에서 암호를 확인한 멤버만 (한 번 확인하면 다시 묻지 않음)
    if (this.idOnlyLogin()) {
      if (hasPerm && this.pwdVerified) return this._guardedActivate(tabId);
    } else if (hasPerm && policy !== "STARTUP_AND_CONFIG" && policy !== "CONFIG_ONLY") {
      this._guardedActivate(tabId);
      return;
    }
    if (hasPerm && policy === "CONFIG_ONLY" && this.sessionAuthenticated) {
      this._guardedActivate(tabId);
      return;
    }
    const meta = this.getTabMeta(tabId);
    this.lockMode = "CONFIG";
    this.pendingTabId = tabId;
    this._showPane("loginFormPane");
    this._setText("lockModalTitle", `${meta.name} 권한 인증`);
    this._setText("lockModalDesc",
      `<b>[${meta.name}]</b> 메뉴는 <b>${meta.reqRoleLabel}</b> 권한이 필요합니다.<br>` +
      `<span class="u-fs-xs u-c-muted">권한이 있는 계정으로 인증하면 해당 계정으로 전환됩니다.</span>`, true);
    const info = document.getElementById("lockServerInfo");
    if (info) info.style.display = "none";
    // 권한 인증은 지금 프로젝트에서 — 프로젝트 줄은 보이되 바꿀 수 없음
    const projRow = document.getElementById("loginProjectRow");
    if (projRow) projRow.style.display = "";
    this.fillLoginProjects(true);
    this._showPwdField(true);
    const emp = document.getElementById("inputSecurityEmpNo");
    if (emp) emp.value = hasPerm ? this.getCurrentUser().empNo : meta.defaultEmpNo;
    const cancel = document.getElementById("btnLockCancel");
    if (cancel) cancel.style.display = "inline-flex";
    const reg = document.getElementById("registerLinkRow");
    if (reg) reg.style.display = "none";
    this._setText("btnLockSubmit", `🔓 인증 후 이동`);
    this._err("lockErrorMessage", "");
    const pwd = document.getElementById("inputSecurityPassword");
    if (pwd) pwd.value = "";
    this._overlay(true);
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("securityLockOverlay"));
    setTimeout(() => { if (pwd) pwd.focus(); }, 80);
  },

  cancelUnlock() {
    if (this.lockMode === "LOGIN") return;
    this.pendingTabId = null;
    this._err("lockErrorMessage", "");
    this._overlay(false);
  },

  manualLock(isIdle = false) {
    const active = document.querySelector(".tab-pane.active");
    if (active && this.TAB_POLICY[active.id]) this._innerActivate("tab-home");
    this.sessionAuthenticated = false;
    this.pwdVerified = false;
    this._saveSession();
    this.openLogin(
      isIdle ? "⏱️ 자리 비움 자동 잠금" : "🔒 화면 잠금 / 계정 전환",
      isIdle ? "일정 시간 동안 입력이 없어 자동 잠금되었습니다. 다시 멤버를 선택하세요." : "계속 작업하거나 다른 계정으로 전환하려면 멤버를 선택하세요."
    );
  },

  onServerAuthExpired() {
    if (this._expiredNotified) return;
    this._expiredNotified = true;
    this.sessionAuthenticated = false;
    ServerBackend.setToken("");
    this.openLogin("🔐 서버 인증 만료", "서버 멤버 선택 세션이 만료되었습니다. 다시 멤버를 선택하세요. (화면의 미저장 변경 내용은 유지됩니다)");
  },

  async _verifyLocal(empNo, pwd) {
    const u = ProjectContext.findAny(empNo) || this.findUser(empNo);
    if (!u) return { ok: false, message: `등록되지 않은 멤버 ID(${empNo})입니다. 관리자 · PM 에게 등록을 요청하세요.` };
    const inputHash = await this.hashPassword(pwd);
    let target = u.pwdHash;
    if (!target && String(u.empNo).toLowerCase() === "admin") {
      try { target = AppStore.getItem(this.LEGACY_ADMIN_HASH_KEY) || ""; } catch (e) {}
    }
    if (!target) target = await this.hashPassword(this.initialPassword(u.empNo));
    return inputHash === target ? { ok: true, user: u } : { ok: false, message: "암호가 일치하지 않습니다." };
  },

  async unlock() {
    const now = Date.now();
    if (this.lockoutUntil > now) {
      this._err("lockErrorMessage", `🛡️ 보안 잠금: ${Math.ceil((this.lockoutUntil - now) / 1000)}초 후 다시 시도할 수 있습니다.`);
      return;
    }
    const empNo = (document.getElementById("inputSecurityEmpNo").value || "").trim();
    const pwdEl = document.getElementById("inputSecurityPassword");
    const pwd = pwdEl.value;
    const langSel = document.getElementById("inputLoginLang");
    const lang = langSel ? langSel.value : "ko";
    // ID_ONLY: 멤버 선택은 ID 만 (권한 메뉴 인증 창에서는 암호)
    const idOnly = this.lockMode === "LOGIN" && this.idOnlyLogin();
    if (!empNo || (!pwd && !idOnly)) {
      this._err("lockErrorMessage", idOnly ? "멤버 ID을 입력하세요." : "멤버 ID과 암호를 입력하세요.");
      return;
    }

    // 작업할 프로젝트: 관리자 외에는 필수 (권한 인증 창에서는 지금 프로젝트)
    const project = this.lockMode === "CONFIG" ? ProjectContext.current : this.loginProject();
    let result;
    if (idOnly) {
      const u = ProjectContext.findAny(empNo) || this.findUser(empNo);
      result = u ? { ok: true, user: u } : { ok: false, message: `등록되지 않은 멤버 ID(${empNo})입니다. 관리자 · PM 에게 등록을 요청하세요.`, noCount: true };
      if (result.ok && !ProjectContext.isAdminUser(result.user)) {
        if (!project) result = { ok: false, message: "작업할 프로젝트를 선택하세요.", noCount: true };
        else if (!ProjectContext.member(result.user, project)) result = { ok: false, message: "선택한 프로젝트의 멤버가 아닙니다. 프로젝트를 확인하세요.", noCount: true };
      }
    } else if (SyncManager.isLocal()) {
      result = await this._verifyLocal(empNo, pwd);
      if (result.ok && !ProjectContext.isAdminUser(result.user)) {
        if (!project) result = { ok: false, message: "작업할 프로젝트를 선택하세요.", noCount: true };
        else if (!ProjectContext.member(result.user, project)) result = { ok: false, message: "선택한 프로젝트의 멤버가 아닙니다. 프로젝트를 확인하세요.", noCount: true };
      }
      if (result.ok && this.mustChangeLocal(result.user) && this.getAuthPolicy() !== "OFF") result.mustChange = true;
    } else {
      const res = await ServerBackend.request("/api/auth/login", { empNo, pwdHash: await this.hashPassword(pwd), lang, loginProject: project });
      if (res.ok) {
        ServerBackend.setToken(res.token);
        if (Array.isArray(res.projects)) ProjectContext.projects = res.projects;
        result = { ok: true, user: res.user, mustChange: !!(res.user && res.user.mustChangePassword) };
      } else {
        result = { ok: false, message: res.network ? `DB 서버에 연결할 수 없습니다 (${DbConnector.getApiBase()}). run_server.bat 실행 여부를 확인하세요.` : (res.message || "멤버 선택 실패") };
      }
    }

    if (!result.ok && result.noCount) {
      this._err("lockErrorMessage", `⚠️ ${result.message}`);
      return;
    }
    if (!result.ok) {
      this.failedAttempts++;
      if (this.failedAttempts >= 5) {
        this.lockoutUntil = Date.now() + 30000;
        this.failedAttempts = 0;
        this._err("lockErrorMessage", "🛡️ 5회 연속 실패로 30초간 멤버 선택이 제한됩니다.");
      } else {
        this._err("lockErrorMessage", `⚠️ ${result.message} (실패 ${this.failedAttempts}/5회)`);
      }
      pwdEl.focus();
      pwdEl.select();
      return;
    }

    if (this.lockMode === "CONFIG" && this.pendingTabId && !this.canAccessTab(result.user.role, this.pendingTabId)) {
      const meta = this.getTabMeta(this.pendingTabId);
      this._err("lockErrorMessage", `⛔ 권한 부족: [${result.user.name}(${result.user.empNo})] 계정은 [${meta.name}] 접근 권한이 없습니다.`);
      return;
    }

    this.failedAttempts = 0;
    pwdEl.value = "";
    const landing = this.lockMode === "CONFIG" ? this.pendingTabId : null;
    if (project) { try { AppStore.setItem(this.LOGIN_PROJECT_KEY, project); } catch (e) {} }
    const pwdVerified = !idOnly;
    if (result.mustChange) {
      this._forced = { user: result.user, lang, landing, oldPwd: pwd, project, pwdVerified };
      this.showPwdChange(true, true);
      return;
    }
    await this._completeLogin(result.user, { lang, landing, project, pwdVerified });
  },

  async _completeLogin(user, opts = {}) {
    const prev = this.currentUser ? this.currentUser.empNo : null;
    const next = this._buildSessionUser(user);
    if (opts.lang) next.lang = opts.lang;
    this.pwdVerified = !!opts.pwdVerified;

    // 고른 프로젝트가 지금 화면의 프로젝트와 다르면: 그 프로젝트로 바꿔 다시 불러옴
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
      setTimeout(() => AppStore.reload(), 200);
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
      setTimeout(() => AppStore.reload(), 300);
      return;
    }

    this.currentUser = next;
    this.sessionAuthenticated = opts.authenticated !== false;
    this._expiredNotified = false;
    this._saveSession();
    this._overlay(false);
    if (typeof UiScale !== "undefined") UiScale.apply(); // 작업자별 글자 크기
    this.updateUserBadge();
    this.resetIdleTimer();

    // 작업자별 언어 적용 (작업자 선택 시 선택한 언어를 작업자 설정으로 저장)
    if (typeof I18N !== "undefined") {
      I18N.setLanguage(next.lang || "ko");
      if (opts.lang) this._rememberUserLang(next.empNo, opts.lang);
    }
    // 작업자별 화면 방식(Standard / Neo): 지금 화면과 다르면 그 방식으로 다시 불러옴

    await AppBoot.afterLogin();

    let landing = opts.landing;
    try {
      landing = landing || sessionStorage.getItem("AX_PMYS_LANDING_TAB");
      sessionStorage.removeItem("AX_PMYS_LANDING_TAB");
    } catch (e) {}
    const active = document.querySelector(".tab-pane.active");
    this._guardedActivate(landing || (active ? active.id : "tab-home"));
    if (!opts.silent) {
      showToast(`✅ ${next.name}(${next.empNo} · ${this.roleLabel(next.role)}) 님으로 작업을 시작했습니다.`);
    }
  },

  // 계정 전환 전 미저장 변경 처리
  async _flushBeforeSwitch() {
    if (SyncManager.isAutoSave()) {
      await SyncManager.flushAutoSave();
      return true;
    }
    if (!SyncManager.isDirty()) return true;
    const choice = await SyncUI.ask("계정 전환", `저장하지 않은 변경 ${SyncManager.dirtyCount()}건이 있습니다.`, [
      { id: "save", label: "💾 저장 후 전환", cls: "btn-primary" },
      { id: "discard", label: "🗑️ 저장하지 않고 전환", cls: "btn-danger" },
      { id: "cancel", label: "취소", cls: "btn-secondary" }
    ]);
    if (choice === "cancel") return false;
    if (choice === "save") {
      const r = await SyncManager.save(null, { notify: false });
      return !!(r.ok || r.nothing);
    }
    return true;
  },

  // 작업자 언어 설정 저장 (본인 계정)
  async _rememberUserLang(empNo, lang) {
    try { AppStore.setItem(this.LAST_LANG_KEY, lang); } catch (e) {}
    const u = this.findUser(empNo);
    if (!u || u.lang === lang) return;
    u.lang = lang;
    await SyncManager.save(["projectUsers"], { notify: false });
  },

  async changePasswordFromLogin() {
    const v = id => (document.getElementById(id) ? document.getElementById(id).value : "");
    const empNo = v("pcEmpNo").trim();
    const oldPwd = v("pcOldPwd"), n1 = v("pcNewPwd"), n2 = v("pcNewPwd2");
    if (!empNo || !oldPwd || !n1 || !n2) return this._err("pcErrorMessage", "모든 항목을 입력하세요.");
    const rule = this.validateNewPassword(n1, empNo);
    if (rule) return this._err("pcErrorMessage", rule);
    if (n1 !== n2) return this._err("pcErrorMessage", "새 암호와 확인 입력이 일치하지 않습니다.");
    if (n1 === oldPwd) return this._err("pcErrorMessage", "현재 암호와 다른 암호를 입력하세요.");
    const newHash = await this.hashPassword(n1);
    if (SyncManager.isLocal()) {
      const chk = await this._verifyLocal(empNo, oldPwd);
      if (!chk.ok) return this._err("pcErrorMessage", chk.message);
      const row = Object.assign({}, chk.user, { pwdHash: newHash, pwdTemp: false, pwdAt: this.pwdStamp() });
      delete row.pwdReset;
      const res = await LocalBackend.save({ projectUsers: { parts: { [row.empNo]: row }, base: {} } }, true, `password(${row.empNo})`);
      if (!res.ok) return this._err("pcErrorMessage", res.error || "변경 실패");
      DataRegistry.set("projectUsers", res.data.projectUsers);
      SyncManager.setBaseline(["projectUsers"], res.revs);
      if (String(row.empNo).toLowerCase() === "admin") { try { AppStore.removeItem(this.LEGACY_ADMIN_HASH_KEY); } catch (e) {} }
    } else {
      const res = await ServerBackend.request("/api/auth/change-password", { empNo, oldHash: await this.hashPassword(oldPwd), newHash });
      if (!res.ok) return this._err("pcErrorMessage", res.network ? "DB 서버에 연결할 수 없습니다." : (res.message || "변경 실패"));
    }
    const forced = this._forced;
    this._forced = null;
    if (forced && String(forced.user.empNo).toLowerCase() === empNo.toLowerCase()) {
      showToast(`🔑 [${empNo}] 암호가 변경되었습니다.`);
      const user = SyncManager.isLocal() ? (this.findUser(empNo) || forced.user) : Object.assign({}, forced.user, { mustChangePassword: false });
      await this._completeLogin(user, { lang: forced.lang, landing: forced.landing, project: forced.project, pwdVerified: true });
      return;
    }
    showToast(`🔑 [${empNo}] 암호가 변경되었습니다. 새 암호로 멤버를 선택하세요.`);
    const emp = document.getElementById("inputSecurityEmpNo");
    if (emp) emp.value = empNo;
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
    const me = this.getCurrentUser();
    const rule = this.validateNewPassword(n1, me.empNo);
    if (rule) return showToast(rule);
    const newHash = await this.hashPassword(n1);
    if (SyncManager.isLocal()) {
      const check = await this._verifyLocal(me.empNo, cur);
      if (!check.ok) return showToast("현재 암호가 일치하지 않습니다.");
      const u = this.findUser(me.empNo);
      u.pwdHash = newHash;
      u.pwdTemp = false;
      u.pwdAt = this.pwdStamp();
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
  _innerActivate: null,

  installTabGuards() {
    if (this._innerActivate) return;
    this._innerActivate = activateTab;
    const self = this;
    activateTab = function (tabId) { return self._guardedActivate(tabId); };
    switchTab = function (tabId) {
      if (self.TAB_POLICY[tabId]) {
        const pane = document.getElementById(tabId);
        if (pane && pane.classList.contains("active") && self.canAccessTab(self.getCurrentRole(), tabId)) return;
        self.requestTabAccess(tabId);
        return;
      }
      self._guardedActivate(tabId);
    };
    window.activateTab = activateTab;
    window.switchTab = switchTab;
  },

  _guardedActivate(tabId) {
    if (!this.canAccessTab(this.getCurrentRole(), tabId)) {
      const meta = this.getTabMeta(tabId);
      showToast(`⛔ [${meta.name}] 메뉴는 ${meta.reqRoleLabel} 권한이 필요합니다.`);
      if (tabId !== "tab-home") this._innerActivate("tab-home");
      return false;
    }
    this._innerActivate(tabId);
    return true;
  },

  applyTabPermissions() {
    const role = this.getCurrentRole();
    document.querySelectorAll(".tab-btn").forEach(btn => {
      const m = UiEvents.describe(btn).match(/['"](tab-[a-z-]+)['"]/);
      if (!m || !this.TAB_POLICY[m[1]]) return;
      const ok = this.canAccessTab(role, m[1]);
      btn.classList.toggle("tab-locked", !ok);
      btn.style.opacity = ok ? "" : "0.55";
      let mark = btn.querySelector(".tab-lock-mark");
      if (!ok && !mark) {
        mark = document.createElement("span");
        mark.className = "tab-lock-mark";
        mark.style.cssText = "margin-left:3px; font-size:var(--fs-2xs, 10px);";
        mark.textContent = "🔒";
        btn.appendChild(mark);
      } else if (ok && mark) {
        mark.remove();
      }
    });
    const active = document.querySelector(".tab-pane.active");
    if (active && !this.canAccessTab(role, active.id)) this._innerActivate("tab-home");
    if (typeof SmartMergeCenter !== "undefined") SmartMergeCenter.refreshMergeUiPermissions();
  }
};

window.AuthManager = AuthManager;
