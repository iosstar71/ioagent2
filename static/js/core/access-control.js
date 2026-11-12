// =============================================================================
// [Project Mgmt v1.0.6] 인증·권한(RBAC) 관리자 (AuthManager 단일 정의)
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
    PM: "프로젝트관리자",
    LEAD: "총괄리더",
    MEMBER: "일반작업자"
  },
  ROLE_DESCS: {
    SYS_ADMIN: "👑 관리자 (전체 메뉴·시스템설정)",
    PM: "🛡️ 프로젝트 관리자 (기준정보·스마트병합·전체 데이터)",
    LEAD: "⭐ 총괄 리더 (담당 서브시스템 — 담당을 ALL 로 지정하면 프로젝트 전체)",
    MEMBER: "👤 일반 작업자 (담당 서브시스템 데이터만 저장)"
  },
  // 여기에 없는 탭은 모든 작업자 접근 가능
  TAB_POLICY: {
    "tab-config": ["SYS_ADMIN"],
    "tab-master": ["SYS_ADMIN", "PM"]
  },

  currentUser: null,
  sessionAuthenticated: false,
  lockMode: "LOGIN", // LOGIN (작업자 선택/잠금) | CONFIG (권한 메뉴 진입 인증)
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

  // 초기 암호 = 작업자 ID + "123!" (예: hong → hong123!) — 암호를 정하지 않았거나 초기화한 작업자
  INITIAL_PWD_SUFFIX: "123!",
  INITIAL_PWD_HINT: "작업자 ID + 123!",
  initialPassword(empNo) { return String(empNo || "") + this.INITIAL_PWD_SUFFIX; },
  // 새 암호 규칙: 8자 이상, 영문과 숫자를 모두 포함, 초기 암호 사용 불가
  PWD_MIN_LENGTH: 8,
  validateNewPassword(pwd, empNo) {
    const p = String(pwd || "");
    if (empNo && p.toLowerCase() === this.initialPassword(empNo).toLowerCase()) return "초기 암호(작업자 ID + 123!)는 새 암호로 쓸 수 없습니다.";
    if (p.length < this.PWD_MIN_LENGTH) return `암호는 ${this.PWD_MIN_LENGTH}자 이상이어야 합니다.`;
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "암호는 영문과 숫자를 모두 포함해야 합니다.";
    if (/^(1234|12345678|password1?|qwer1234|admin1234)$/i.test(p)) return "추측하기 쉬운 암호는 사용할 수 없습니다.";
    return "";
  },
  // 초기 암호 사용 중이거나 관리자가 지정한 임시 암호이면 첫 작업자 선택 때 변경 필수
  mustChangeLocal(u) { return !!u && (!u.pwdHash || !!u.pwdTemp); },

  // ---------------------------------------------------------------------------
  // 보안 정책
  // ---------------------------------------------------------------------------
  getAuthPolicy() {
    try { return AppStore.getItem(this.STORAGE_POLICY_KEY) || "STARTUP_ONLY"; } catch (e) { return "STARTUP_ONLY"; }
  },
  setAuthPolicy(policy) {
    try { AppStore.setItem(this.STORAGE_POLICY_KEY, policy); } catch (e) {}
    const labels = {
      STARTUP_ONLY: "최초 접속(작업자 선택) 시 1회 인증 (권장)",
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

  _guestUser() { return { empNo: "", name: "작업자 미선택", role: "MEMBER", subsystem: "", dept: "", lang: "ko" }; },
  getCurrentUser() { return this.currentUser || this._guestUser(); },
  getCurrentRole() { return this.normalizeRole(this.getCurrentUser().role); },

  findUser(empNo) {
    const key = String(empNo || "").trim().toLowerCase();
    return (projectUsers || []).find(u => String(u.empNo || "").toLowerCase() === key) || null;
  },

  _buildSessionUser(u) {
    // [v1.0.10] 프로젝트별 역할: 서버 모드는 서버가 계산한 값, 로컬 모드는 작업자 행의 projectRoles 로 계산
    const eff = (u.projectId && u.baseRole) ? u : ProjectContext.effective(u);
    return {
      empNo: eff.empNo,
      name: eff.name || eff.empNo,
      role: this.normalizeRole(eff.role),
      baseRole: this.normalizeRole(eff.baseRole || u.role),
      projectId: eff.projectId || ProjectContext.current,
      subsystem: eff.subsystem || "ALL",
      dept: eff.dept || "",
      lang: eff.lang || "ko"
    };
  },

  canAccessTab(role, tabId) {
    const allowed = this.TAB_POLICY[tabId];
    return !allowed || allowed.indexOf(this.normalizeRole(role)) !== -1;
  },

  getTabMeta(tabId) {
    const metas = {
      "tab-config": { name: "⚙️ 시스템 설정", reqRoleLabel: "관리자(SYS_ADMIN)", defaultEmpNo: "admin" },
      "tab-master": { name: "🗂️ 기준정보", reqRoleLabel: "프로젝트 관리자(PM) 또는 관리자(SYS_ADMIN)", defaultEmpNo: "pm" }
    };
    return metas[tabId] || { name: "관리 메뉴", reqRoleLabel: "관리자", defaultEmpNo: "admin" };
  },

  updateUserBadge() {
    const badge = document.getElementById("headerCurrentUserBadge");
    if (!badge) return;
    const u = this.getCurrentUser();
    const norm = this.normalizeRole(u.role);
    badge.className = "db-status-pill " + (norm === "MEMBER" ? "local" : "connected");
    badge.innerHTML = u.empNo
      ? `👤 ${escapeHtml(u.name)}(${escapeHtml(u.empNo)} · ${this.roleLabel(norm)}${norm === "MEMBER" || norm === "LEAD" ? " · " + escapeHtml(u.subsystem || "ALL") : ""})`
      : "👤 작업자 미선택";
  },

  // ---------------------------------------------------------------------------
  // 세션
  // ---------------------------------------------------------------------------
  _saveSession() {
    try {
      const u = this.getCurrentUser();
      sessionStorage.setItem(this.SESSION_USER_KEY, JSON.stringify({ empNo: u.empNo, authenticated: this.sessionAuthenticated, user: u }));
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
    if (sess && sess.authenticated && this.findUser(sess.empNo) && !(this.mustChangeLocal(this.findUser(sess.empNo)) && policy !== "OFF" && policy !== "CONFIG_ONLY")) {
      await this._completeLogin(this.findUser(sess.empNo), { silent: true });
      return;
    }
    if (policy === "OFF" || policy === "CONFIG_ONLY") {
      await this._completeLogin(this.findUser("admin") || projectUsers[0], { silent: true, authenticated: policy === "OFF" });
      return;
    }
    this.openLogin();
  },

  // ---------------------------------------------------------------------------
  // 작업자 선택 화면
  // ---------------------------------------------------------------------------
  _overlay(show) {
    const o = document.getElementById("securityLockOverlay");
    if (o) o.style.display = show ? "flex" : "none";
  },

  _setText(id, text, html) {
    const el = document.getElementById(id);
    if (!el) return;
    if (html) el.innerHTML = text; else el.textContent = text;
  },

  _err(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = msg ? "block" : "none";
    el.textContent = msg || "";
  },

  openLogin(title, desc) {
    this.lockMode = "LOGIN";
    this.pendingTabId = null;
    this._showPane("loginFormPane");
    const server = !SyncManager.isLocal();
    this._setText("lockModalTitle", title || "🔐 작업자 선택");
    this._setText("lockModalDesc",
      (desc || "작업자 ID과 암호를 입력하여 작업자를 선택하세요.") +
      `<br><span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">* 초기 암호: <b>작업자 ID + 123!</b> (예: admin → admin123!)</span>`, true);
    const info = document.getElementById("lockServerInfo");
    if (info) {
      info.style.display = "block";
      const notice = typeof ModeGuard !== "undefined" && ModeGuard.loginNotice ? `<div style="margin-top:4px;">${ModeGuard.loginNotice}</div>` : "";
      info.innerHTML = (server
        ? `🗄️ 서버 (${escapeHtml(DbConnector.getApiBase())}) — 작업자를 고른 뒤 [💾 저장]으로 저장합니다.`
        : "💻 시험용 로컬 저장소 — 이 PC 브라우저에만 저장됩니다.") + notice;
      info.style.textAlign = "left";
    }
    const cancel = document.getElementById("btnLockCancel");
    if (cancel) cancel.style.display = "none";
    const reg = document.getElementById("registerLinkRow");
    if (reg) reg.style.display = "block";
    this._setText("btnLockSubmit", "▶ 작업 시작");
    const langSel = document.getElementById("inputLoginLang");
    if (langSel) langSel.value = (typeof I18N !== "undefined" ? I18N.lang : "ko");
    const projRow = document.getElementById("loginProjectRow");
    if (projRow) projRow.style.display = "";
    const psel = document.getElementById("inputLoginProject");
    if (psel) psel.disabled = false;
    this.fillLoginProjects().then(() => { if (typeof WorkerPick !== "undefined") WorkerPick.load(); });
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
  requestTabAccess(tabId) {
    const hasPerm = this.canAccessTab(this.getCurrentRole(), tabId);
    const policy = this.getAuthPolicy();
    if (hasPerm && policy !== "STARTUP_AND_CONFIG" && policy !== "CONFIG_ONLY") {
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
      `<span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">권한이 있는 계정으로 인증하면 해당 계정으로 전환됩니다.</span>`, true);
    const info = document.getElementById("lockServerInfo");
    if (info) info.style.display = "none";
    // [v3.0.1] 권한 인증은 지금 프로젝트에서 — 프로젝트 줄은 보이되 바꿀 수 없음
    const projRow = document.getElementById("loginProjectRow");
    if (projRow) projRow.style.display = "";
    this.fillLoginProjects(true);
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
    this._saveSession();
    this.openLogin(
      isIdle ? "⏱️ 자리 비움 자동 잠금" : "🔒 화면 잠금 / 계정 전환",
      isIdle ? "일정 시간 동안 입력이 없어 자동 잠금되었습니다. 다시 작업자를 선택하세요." : "계속 작업하거나 다른 계정으로 전환하려면 작업자를 선택하세요."
    );
  },

  onServerAuthExpired() {
    if (this._expiredNotified) return;
    this._expiredNotified = true;
    this.sessionAuthenticated = false;
    ServerBackend.setToken("");
    this.openLogin("🔐 서버 인증 만료", "서버 작업자 선택 세션이 만료되었습니다. 다시 작업자를 선택하세요. (화면의 미저장 변경 내용은 유지됩니다)");
  },

  // ---------------------------------------------------------------------------
  // 작업자 선택 처리
  // ---------------------------------------------------------------------------
  // [v3.0.0] 작업자 선택 화면 프로젝트 목록 (보관된 프로젝트 제외) — 마지막에 선택한 프로젝트를 미리 선택
  LOGIN_PROJECT_KEY: "PPRJMGMT_LOGIN_PROJECT",
  async fillLoginProjects(lockCurrent) {
    const sel = document.getElementById("inputLoginProject");
    if (!sel) return;
    if (lockCurrent) {
      const info = ProjectContext.info ? ProjectContext.info() : null;
      const name = (info && info.name) || projectConfig.projectName || ProjectContext.current;
      sel.innerHTML = `<option value="${escapeAttr(ProjectContext.current)}" selected>${escapeHtml(name)}</option>`;
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    let list = [];
    if (SyncManager.isLocal()) {
      list = ProjectContext.localList().filter(p => p.status !== "ARCHIVED").map(p => ({ id: p.id, name: p.id === ProjectContext.DEFAULT && ProjectContext.isDefault() ? (projectConfig.projectName || p.name) : p.name }));
    } else {
      const res = await ServerBackend.request("/api/projects/public", {});
      if (res.ok && Array.isArray(res.projects)) list = res.projects;
    }
    let last = "";
    try { last = AppStore.getItem(this.LOGIN_PROJECT_KEY) || ""; } catch (e) {}
    const pick = list.some(p => p.id === last) ? last : (list.some(p => p.id === ProjectContext.current) ? ProjectContext.current : "");
    sel.innerHTML = `<option value="">— 프로젝트 선택 —</option>` + list.map(p => `<option value="${escapeAttr(p.id)}" ${p.id === pick ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("");
    if (typeof I18N !== "undefined") I18N.translateTree(sel.parentNode);
  },
  loginProject() {
    const sel = document.getElementById("inputLoginProject");
    return sel ? String(sel.value || "") : "";
  },

  async _verifyLocal(empNo, pwd) {
    const u = ProjectContext.findAny(empNo) || this.findUser(empNo);
    if (!u) return { ok: false, message: `등록되지 않은 작업자 ID(${empNo})입니다. 관리자 · PM 에게 등록을 요청하세요.` };
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
    if (!empNo || !pwd) {
      this._err("lockErrorMessage", "작업자 ID과 암호를 입력하세요.");
      return;
    }

    // [v3.0.0] 작업할 프로젝트: 관리자 외에는 필수 (권한 인증 창에서는 지금 프로젝트)
    const project = this.lockMode === "CONFIG" ? ProjectContext.current : this.loginProject();
    let result;
    if (SyncManager.isLocal()) {
      result = await this._verifyLocal(empNo, pwd);
      if (result.ok && !ProjectContext.isAdminUser(result.user)) {
        if (!project) result = { ok: false, message: "작업할 프로젝트를 선택하세요.", noCount: true };
        else if (!ProjectContext.member(result.user, project)) result = { ok: false, message: "선택한 프로젝트의 작업자가 아닙니다. 프로젝트를 확인하세요.", noCount: true };
      }
      if (result.ok && this.mustChangeLocal(result.user) && this.getAuthPolicy() !== "OFF") result.mustChange = true;
    } else {
      const res = await ServerBackend.request("/api/auth/login", { empNo, pwdHash: await this.hashPassword(pwd), lang, loginProject: project });
      if (res.ok) {
        ServerBackend.setToken(res.token);
        if (Array.isArray(res.projects)) ProjectContext.projects = res.projects;
        result = { ok: true, user: res.user, mustChange: !!(res.user && res.user.mustChangePassword) };
      } else {
        result = { ok: false, message: res.network ? `DB 서버에 연결할 수 없습니다 (${DbConnector.getApiBase()}). run_server.bat 실행 여부를 확인하세요.` : (res.message || "작업자 선택 실패") };
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
        this._err("lockErrorMessage", "🛡️ 5회 연속 실패로 30초간 작업자 선택이 제한됩니다.");
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
    if (result.mustChange) {
      this._forced = { user: result.user, lang, landing, oldPwd: pwd, project };
      this.showPwdChange(true, true);
      return;
    }
    await this._completeLogin(result.user, { lang, landing, project });
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
      try { sessionStorage.setItem("AX_PMYS_LANDING_TAB", opts.landing || "tab-home"); } catch (e) {}
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
      try { sessionStorage.setItem("AX_PMYS_LANDING_TAB", opts.landing || "tab-home"); } catch (e) {}
      showToast(`👤 계정 전환: ${next.name}(${next.empNo}) — 권한을 다시 적용합니다...`);
      setTimeout(() => AppStore.reload(), 300);
      return;
    }

    this.currentUser = next;
    this.sessionAuthenticated = opts.authenticated !== false;
    this._expiredNotified = false;
    this._saveSession();
    this._overlay(false);
    if (typeof UiScale !== "undefined") UiScale.apply(); // [v3.1.0] 작업자별 글자 크기
    this.updateUserBadge();
    this.resetIdleTimer();

    // 작업자별 언어 적용 (작업자 선택 시 선택한 언어를 작업자 설정으로 저장)
    if (typeof I18N !== "undefined") {
      I18N.setLanguage(next.lang || "ko");
      if (opts.lang) this._rememberUserLang(next.empNo, opts.lang);
    }
    // [v2.3.0] 작업자별 화면 방식(Standard / Neo): 지금 화면과 다르면 그 방식으로 다시 불러옴
    if (typeof UiMode !== "undefined" && UiMode.afterLogin(this.findUser(next.empNo) || next)) return;

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

  // ---------------------------------------------------------------------------
  // 신규 작업자 등록 (기본 권한: 일반 작업자)
  // ---------------------------------------------------------------------------
  _showPane(name) {
    ["loginFormPane", "registerFormPane", "pwdChangeFormPane"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === name ? "block" : "none";
    });
  },

  // [v1.0.7] 작업자 선택 화면 암호 변경
  showPwdChange(show, forced = false) {
    if (!show) {
      if (this._forced && !SyncManager.isLocal()) ServerBackend.setToken("");
      this._forced = null;
      this.openLogin();
      return;
    }
    if (!forced) this._forced = null;
    this._showPane("pwdChangeFormPane");
    this._setText("lockModalTitle", forced ? "🔑 암호 변경 필요" : "🔑 암호 변경");
    this._setText("lockModalDesc", forced
      ? "초기 암호 또는 관리자가 지정한 임시 암호로 작업자를 선택했습니다. 새 암호로 변경해야 계속 사용할 수 있습니다. (8자 이상, 영문+숫자)"
      : "작업자 ID과 현재 암호를 확인한 후 새 암호로 변경합니다. (8자 이상, 영문+숫자)");
    this._err("pcErrorMessage", "");
    const emp = document.getElementById("pcEmpNo");
    const loginEmp = document.getElementById("inputSecurityEmpNo");
    if (emp) emp.value = loginEmp ? loginEmp.value : "";
    ["pcOldPwd", "pcNewPwd", "pcNewPwd2"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    if (forced && this._forced) {
      if (emp) emp.value = this._forced.user.empNo;
      const old = document.getElementById("pcOldPwd");
      if (old) old.value = this._forced.oldPwd;
    }
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("securityLockOverlay"));
    setTimeout(() => { const f = forced ? document.getElementById("pcNewPwd") : (emp && emp.value ? document.getElementById("pcOldPwd") : emp); if (f) f.focus(); }, 60);
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
      const row = Object.assign({}, chk.user, { pwdHash: newHash, pwdTemp: false });
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
      await this._completeLogin(user, { lang: forced.lang, landing: forced.landing, project: forced.project });
      return;
    }
    showToast(`🔑 [${empNo}] 암호가 변경되었습니다. 새 암호로 작업자를 선택하세요.`);
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

// =============================================================================
// [Project Mgmt] 작업자 선택 목록 — 고른 프로젝트의 작업자(이름 · 작업자 ID)를 보여 줌 (전사 SSO 계정과 별개)
// =============================================================================
var WorkerPick = {
  async load() {
    const list = document.getElementById("workerPickList");
    if (!list) return;
    const pid = AuthManager.loginProject();
    let workers = [];
    if (SyncManager.isLocal()) {
      const users = (ProjectContext.allUsers && ProjectContext.allUsers.length ? ProjectContext.allUsers : (DataRegistry.get("projectUsers") || []));
      workers = users.filter(u => ProjectContext.isAdminUser(u) || (pid && ProjectContext.member(u, pid))).map(u => ({ empNo: u.empNo, name: u.name }));
    } else {
      const res = await ServerBackend.request("/api/projects/workers", { projectId: pid });
      if (res.ok && Array.isArray(res.workers)) workers = res.workers;
    }
    list.innerHTML = workers.map(w => `<option value="${escapeAttr(w.empNo)}">${escapeHtml(w.name || w.empNo)}</option>`).join("");
  },

  // [Local] 처음 쓰는 PC: PM 이 보낸 종합본으로 프로젝트 · 작업자 목록을 이 브라우저에 넣음
  async startFromPackage(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    let items;
    try { items = await ProjectTransfer.parse(file); } catch (err) { return AuthManager._err("lockErrorMessage", "파일을 읽지 못했습니다: " + err.message); }
    const it = items && items[0];
    if (!it || !it.users || !it.users.length) return AuthManager._err("lockErrorMessage", "PM 이 보낸 종합본(작업자 목록 포함) 파일이 아닙니다.");
    const list = ProjectContext.localList();
    const norm = s => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
    let pid = (list.find(p => norm(p.name) === norm(it.name)) || {}).id;
    if (!pid) {
      const def = LocalBackend._read(ProjectContext.DEFAULT) || {};
      const empty = !(def.subsystemsMeta || []).length && !(def.wbsData || []).length;
      pid = empty ? ProjectContext.DEFAULT : await ProjectTransfer.create(it.name, it.data.projectConfig || {});
    }
    // 화면의 빈 자료가 자동 저장되어 덮어쓰지 않도록 자동 저장을 멈추고 저장소에만 씀 → 다시 불러옴
    SyncManager._suspendAuto = true;
    if (SyncManager._autoTimer) { clearTimeout(SyncManager._autoTimer); SyncManager._autoTimer = null; }
    ProjectTransfer.writeLocal(pid, it);
    const l2 = ProjectContext.localList();
    const row = l2.find(p => p.id === pid);
    if (row) { row.name = it.name; ProjectContext.saveLocalList(l2); }
    try { AppStore.setItem(AuthManager.LOGIN_PROJECT_KEY, pid); } catch (err) {}
    showToast(`📥 [${it.name}] 종합본을 이 브라우저에 넣었습니다 — 작업자 ${it.users.length}명. 내 이름을 골라 시작하세요 (처음 암호: 작업자 ID + 123!).`);
    setTimeout(() => AppStore.reload(), 900);
  }
};
window.WorkerPick = WorkerPick;
