// =============================================================================
// [AX Project Management by YS v1.0.5] 권한 기반 탭 접근 제어 (RBAC) 및 계정 전환 관리자
// -----------------------------------------------------------------------------
// 버그 원인 (v1.0.4)
//  - app.js 하단에서 switchTab 이 `activateTab(tabId)` 만 호출하도록 재정의되어
//    권한 검사 로직이 통째로 무력화됨 → 일반 사용자도 시스템설정/기준정보/사용자 탭 진입 가능
//  - AuthManager.canAccessTab 이 3곳에서 서로 다른 규칙으로 중복 재정의됨
//  - 로그인/계정 전환 시 currentUser 에서 담당 서브시스템(subsystem) 정보가 누락되고,
//    화면 권한 재검사·홈 이동·리로드가 이루어지지 않음
//
// 조치 (본 파일은 반드시 app.js 다음에 마지막으로 로드)
//  1) 탭 접근 정책 단일화 (TAB_POLICY)
//  2) switchTab / activateTab 최종 래핑 → 어떤 경로로 호출되어도 권한 검사
//  3) 탭 버튼에 🔒 잠금 표시 및 권한 상태 동기화
//  4) 계정 전환 감지 시: 변경사항 저장 → 세션 사용자 기록 → 홈 화면으로 리로드 → 권한 재검사
// =============================================================================
(function () {
  if (typeof AuthManager === "undefined") return;

  var SESSION_USER_KEY = "AX_PMYS_SESSION_USER";
  var SESSION_NOTICE_KEY = "AX_PMYS_SESSION_SWITCH_NOTICE";

  // 1) 탭 접근 정책 (여기에 없는 탭은 모든 사용자 접근 가능)
  //    - 스마트병합(tab-merge)은 모든 사용자 진입 가능, 내부에서 전체/기준정보 업로드 권한을 별도 분리
  AuthManager.TAB_POLICY = {
    "tab-config": ["SYS_ADMIN"],
    "tab-master": ["SYS_ADMIN", "PM"],
    "tab-users": ["SYS_ADMIN", "PM"]
  };

  AuthManager.canAccessTab = function (role, tabId) {
    var allowed = this.TAB_POLICY[tabId];
    if (!allowed) return true;
    return allowed.indexOf(this.normalizeRole(role)) !== -1;
  };

  AuthManager.getCurrentRole = function () {
    var u = this.getCurrentUser();
    return this.normalizeRole(u && u.role);
  };

  var _baseGetTabMeta = AuthManager.getTabMeta;
  AuthManager.getTabMeta = function (tabId) {
    var meta = _baseGetTabMeta ? _baseGetTabMeta.call(this, tabId) : null;
    if (meta && meta.name !== "관리 메뉴") return meta;
    if (tabId === "tab-users") {
      return { name: "👥 사용자 권한 관리", reqRoleLabel: "프로젝트 관리자(사번: pm) 또는 시스템 관리자(사번: admin)", defaultEmpNo: "pm" };
    }
    return meta || { name: "관리 메뉴", reqRoleLabel: "관리자", defaultEmpNo: "admin" };
  };

  // 2) 전체 사용자 정보(담당 서브시스템 포함)로 currentUser 구성
  AuthManager._buildSessionUser = function (u) {
    return {
      empNo: u.empNo,
      name: u.name,
      role: this.normalizeRole(u.role),
      subsystem: u.subsystem || "ALL",
      dept: u.dept || ""
    };
  };

  AuthManager._saveSessionUser = function (authenticated) {
    try {
      var u = this.getCurrentUser();
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify({ empNo: u.empNo, authenticated: !!authenticated, at: Date.now() }));
    } catch (e) {}
  };

  AuthManager._clearSessionAuth = function () {
    try {
      var raw = sessionStorage.getItem(SESSION_USER_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      s.authenticated = false;
      sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(s));
    } catch (e) {}
  };

  // 새로고침/리로드 후에도 같은 브라우저 탭 세션 동안 접속 계정 유지
  AuthManager.restoreSession = function () {
    try {
      var raw = sessionStorage.getItem(SESSION_USER_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      var u = (typeof projectUsers !== "undefined" ? projectUsers : []).find(function (x) {
        return (x.empNo || "").toLowerCase() === String(s.empNo || "").toLowerCase();
      });
      if (!u) return null;
      this.currentUser = this._buildSessionUser(u);
      return s;
    } catch (e) {
      return null;
    }
  };

  // 3) 탭 버튼 잠금 표시 동기화
  AuthManager.applyTabPermissions = function () {
    var role = this.getCurrentRole();
    var self = this;
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      var oc = btn.getAttribute("onclick") || "";
      var m = oc.match(/['"](tab-[a-z-]+)['"]/);
      if (!m) return;
      var tabId = m[1];
      if (!self.TAB_POLICY[tabId]) return;
      var ok = self.canAccessTab(role, tabId);
      btn.classList.toggle("tab-locked", !ok);
      btn.setAttribute("data-locked", ok ? "false" : "true");
      if (!btn.getAttribute("data-orig-title")) btn.setAttribute("data-orig-title", btn.getAttribute("title") || "");
      btn.setAttribute("title", ok
        ? btn.getAttribute("data-orig-title")
        : "🔒 " + self.getTabMeta(tabId).reqRoleLabel + " 권한이 필요합니다. (클릭 시 권한 계정 인증)");
      btn.style.opacity = ok ? "" : "0.55";
      var lockMark = btn.querySelector(".tab-lock-mark");
      if (!ok && !lockMark) {
        lockMark = document.createElement("span");
        lockMark.className = "tab-lock-mark";
        lockMark.style.marginLeft = "3px";
        lockMark.style.fontSize = "10px";
        lockMark.textContent = "🔒";
        btn.appendChild(lockMark);
      } else if (ok && lockMark) {
        lockMark.remove();
      }
    });

    // 현재 열려 있는 탭이 권한 밖이면 즉시 홈으로 이동
    var activePane = document.querySelector(".tab-pane.active");
    if (activePane && !this.canAccessTab(role, activePane.id)) {
      _guardedActivate("tab-home");
    }
    if (typeof SmartMergeCenter !== "undefined" && typeof SmartMergeCenter.refreshMergeUiPermissions === "function") {
      try { SmartMergeCenter.refreshMergeUiPermissions(); } catch (e) {}
    }
  };

  // 4) activateTab / switchTab 최종 래핑 (이후 어떤 재정의보다 우선하도록 마지막에 로드)
  var _innerActivate = activateTab;
  function _guardedActivate(tabId) {
    if (!AuthManager.canAccessTab(AuthManager.getCurrentRole(), tabId)) {
      var meta = AuthManager.getTabMeta(tabId);
      if (typeof showToast === "function") {
        showToast("⛔ [" + meta.name + "] 메뉴는 " + meta.reqRoleLabel + " 권한이 필요합니다.", "warning");
      }
      if (tabId !== "tab-home") _innerActivate("tab-home");
      return false;
    }
    _innerActivate(tabId);
    return true;
  }
  activateTab = _guardedActivate;
  window.activateTab = _guardedActivate;

  var _guardedSwitch = function (tabId) {
    var restricted = !!AuthManager.TAB_POLICY[tabId];
    if (restricted) {
      var pane = document.getElementById(tabId);
      if (pane && pane.classList.contains("active") && AuthManager.canAccessTab(AuthManager.getCurrentRole(), tabId)) {
        return; // 이미 열린 권한 탭
      }
      // 권한 부족 또는 보안 정책상 재인증 필요 시 인증창, 그렇지 않으면 즉시 이동
      AuthManager.requestTabAccess(tabId);
      return;
    }
    _guardedActivate(tabId);
    if (tabId === "tab-merge" && typeof SmartMergeCenter !== "undefined" && typeof SmartMergeCenter.refreshMergeUiPermissions === "function") {
      SmartMergeCenter.refreshMergeUiPermissions();
    }
  };
  switchTab = _guardedSwitch;
  window.switchTab = _guardedSwitch;

  // requestTabAccess: 현재 역할 기준으로 판정 (role 정규화 포함)
  var _baseRequestTabAccess = AuthManager.requestTabAccess;
  AuthManager.requestTabAccess = function (tabId) {
    var hasPerm = this.canAccessTab(this.getCurrentRole(), tabId || "tab-config");
    var policy = this.getAuthPolicy();
    if (hasPerm && (policy === "OFF" || (this.sessionAuthenticated && policy !== "STARTUP_AND_CONFIG"))) {
      _guardedActivate(tabId);
      return;
    }
    _baseRequestTabAccess.call(this, tabId);
  };

  // 5) 계정 전환 처리: 저장 → 세션 기록 → 홈(또는 인증 요청 탭)으로 리로드
  AuthManager._flushBeforeReload = async function () {
    try {
      if (typeof _persistTimer !== "undefined" && _persistTimer) persistChanges(true);
      if (typeof DbConnector !== "undefined") {
        if (DbConnector.config.saveMode === "MANUAL" && DbConnector.hasPendingChanges) {
          await DbConnector.manualCommitAll(false);
        } else if (DbConnector.config.mode !== "LOCAL" && DbConnector.config.connected) {
          await DbConnector.saveToDb(false);
        } else if (typeof StorageManager !== "undefined") {
          StorageManager.saveAll(false);
        }
      }
    } catch (e) {
      console.warn("계정 전환 전 저장 실패:", e);
    }
  };

  AuthManager.onUserChanged = async function (prevEmpNo, landingTab) {
    var u = this.getCurrentUser();
    this._saveSessionUser(this.sessionAuthenticated);
    try {
      sessionStorage.setItem(SESSION_NOTICE_KEY, JSON.stringify({
        from: prevEmpNo || "",
        to: u.empNo,
        name: u.name,
        role: this.normalizeRole(u.role),
        landing: landingTab && this.canAccessTab(u.role, landingTab) ? landingTab : "tab-home"
      }));
    } catch (e) {}
    if (typeof showToast === "function") showToast("👤 계정 전환: " + u.name + " (" + u.empNo + ") — 권한을 재확인하고 홈 화면으로 다시 불러옵니다...");
    var overlay = document.getElementById("securityLockOverlay");
    if (overlay) overlay.style.display = "none";
    await this._flushBeforeReload();
    setTimeout(function () { window.location.reload(); }, 250);
  };

  // 로그인(잠금 해제): 기존 로직 수행 후 계정이 바뀌었으면 리로드, 같으면 권한만 재적용
  var _baseUnlock = AuthManager.unlock;
  AuthManager.unlock = async function () {
    var prev = this.getCurrentUser().empNo;
    var pendingTab = this.pendingTabId;
    var wasConfigMode = this.lockMode === "CONFIG";
    await _baseUnlock.call(this);
    if (!this.sessionAuthenticated) return;
    var overlay = document.getElementById("securityLockOverlay");
    if (overlay && overlay.style.display !== "none") return; // 인증 실패/권한 부족
    // 담당 서브시스템 등 전체 사용자 정보 보강
    var cur = this.getCurrentUser();
    var full = (projectUsers || []).find(function (x) { return (x.empNo || "").toLowerCase() === String(cur.empNo || "").toLowerCase(); });
    if (full) this.currentUser = this._buildSessionUser(full);
    if ((prev || "").toLowerCase() !== String(this.currentUser.empNo || "").toLowerCase()) {
      await this.onUserChanged(prev, wasConfigMode ? pendingTab : "tab-home");
      return;
    }
    this._saveSessionUser(true);
    this.applyTabPermissions();
  };

  // 헤더 등에서 직접 사용자 전환 시
  AuthManager.switchUser = function (empNo) {
    var u = (projectUsers || []).find(function (x) { return x.empNo === empNo; });
    if (!u) return;
    var prev = this.getCurrentUser().empNo;
    this.currentUser = this._buildSessionUser(u);
    this.updateUserBadge();
    if (prev !== u.empNo) this.onUserChanged(prev, "tab-home");
  };

  // 잠금 시 세션 인증 해제 (리로드 시 로그인 우회 방지)
  var _baseManualLock = AuthManager.manualLock;
  AuthManager.manualLock = function (isIdle) {
    var active = document.querySelector(".tab-pane.active");
    if (active && this.TAB_POLICY[active.id]) _innerActivate("tab-home");
    this._clearSessionAuth();
    _baseManualLock.call(this, isIdle);
  };

  // 6) 시작 시: 세션 계정 복원 → 보안 정책 적용 (같은 탭 세션의 인증 상태 유지)
  var _baseInitSecurity = AuthManager.initSecurityPolicy;
  AuthManager.initSecurityPolicy = function () {
    var restored = this.restoreSession();
    _baseInitSecurity.call(this);
    if (restored && restored.authenticated) {
      this.sessionAuthenticated = true;
      var overlay = document.getElementById("securityLockOverlay");
      if (overlay) overlay.style.display = "none";
    }
    this.updateUserBadge();
  };

  window.addEventListener("DOMContentLoaded", function () {
    // app.js 의 초기화가 끝난 뒤 실행
    setTimeout(function () {
      var notice = null;
      try {
        notice = JSON.parse(sessionStorage.getItem(SESSION_NOTICE_KEY) || "null");
        sessionStorage.removeItem(SESSION_NOTICE_KEY);
      } catch (e) {}

      AuthManager.updateUserBadge();
      AuthManager.applyTabPermissions();
      if (typeof HomeScreenManager !== "undefined") HomeScreenManager.applyRoleMode();

      if (notice) {
        _guardedActivate(notice.landing || "tab-home");
        var roleText = notice.role === "SYS_ADMIN" ? "시스템관리자" : (notice.role === "PM" ? "프로젝트관리자" : "일반사용자");
        if (typeof showToast === "function") {
          showToast("✅ [계정 전환 완료] " + notice.name + "(" + notice.to + " · " + roleText + ") 계정으로 전환되어 화면 접근 권한을 재적용했습니다.");
        }
      } else {
        _guardedActivate("tab-home");
      }
    }, 150);
  });
})();
