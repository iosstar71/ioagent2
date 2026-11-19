// =============================================================================
// 멤버 선택(로그인) 화면 (AuthManager 의 일부) · 멤버 목록(WorkerPick)
// 암호 · 권한 · 세션 규칙은 core/access-control.js. 그 다음에 불러옴
// =============================================================================
Object.assign(AuthManager, {

  updateUserBadge() {
    const badge = document.getElementById("headerCurrentUserBadge");
    if (!badge) return;
    const u = this.getCurrentUser();
    const norm = this.normalizeRole(u.role);
    badge.className = "db-status-pill " + (norm === "MEMBER" ? "local" : "connected");
    // 머리글 · 멤버 메뉴: 이름 — 권한 (ID 는 표시하지 않음)
    const who = u.empNo ? `${u.name || u.empNo} — ${this.roleLabel(norm)}${norm === "MEMBER" || norm === "LEAD" ? " · " + (u.subsystem || "ALL") : ""}` : "멤버 미선택";
    badge.innerHTML = `👤 ${escapeHtml(u.empNo ? (u.name || u.empNo) : who)}`;
    badge.title = who;
    // 이름(자료)과 권한(화면 글)을 나눠 써서 영어 화면에서 권한이 번역되게
    const whoEl = document.getElementById("gUserWho");
    if (whoEl) whoEl.innerHTML = u.empNo ? `<span>${escapeHtml(u.name || u.empNo)}</span> — <span>${escapeHtml(this.roleLabel(norm))}</span>${norm === "MEMBER" || norm === "LEAD" ? " · " + escapeHtml(u.subsystem || "ALL") : ""}` : `<span>${escapeHtml(who)}</span>`;
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
    this._setText("lockModalTitle", title || "🔐 멤버 선택");
    this._setText("lockModalDesc",
      (desc || "멤버 ID과 암호를 입력하여 멤버를 선택하세요.") +
      `<br><span class="u-fs-xs u-c-muted">* 초기 암호: <b>1234</b></span>`, true);
    const info = document.getElementById("lockServerInfo");
    if (info) {
      info.style.display = "block";
      const notice = typeof ModeGuard !== "undefined" && ModeGuard.loginNotice ? `<div class="u-mt-4">${ModeGuard.loginNotice}</div>` : "";
      info.innerHTML = (server
        ? `🗄️ 서버 (${escapeHtml(DbConnector.getApiBase())}) — 멤버를 고른 뒤 [💾 저장]으로 저장합니다.`
        : "💻 Standalone — 자료는 이 PC 브라우저에만 저장됩니다. PM 과는 마스터 파일 · 내 작업 파일로 주고받습니다.") + notice;
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


  // ---------------------------------------------------------------------------
  // 작업자 선택 처리
  // ---------------------------------------------------------------------------
  // 작업자 선택 화면 프로젝트 목록 (보관된 프로젝트 제외) — 마지막에 선택한 프로젝트를 미리 선택
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


  // ---------------------------------------------------------------------------
  // 신규 작업자 등록 (기본 권한: 일반 작업자)
  // ---------------------------------------------------------------------------
  _showPane(name) {
    ["loginFormPane", "registerFormPane", "pwdChangeFormPane"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === name ? "block" : "none";
    });
  },


  // 작업자 선택 화면 암호 변경
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
      ? "초기 암호 또는 관리자가 지정한 임시 암호로 멤버를 선택했습니다. 새 암호로 변경해야 계속 사용할 수 있습니다. (8자 이상, 영문+숫자)"
      : "멤버 ID과 현재 암호를 확인한 후 새 암호로 변경합니다. (8자 이상, 영문+숫자)");
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
});

// =============================================================================
// 멤버 선택 목록 — 고른 프로젝트의 작업자(이름 · 멤버 ID)를 보여 줌 (전사 SSO 계정과 별개)
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
    if (SyncManager.isLocal()) this.showPending();
  },

  // [Local] 작업자 선택 화면에서 PM 이 보낸 종합본 올리기
  //   - 이 PC 에 그 프로젝트 자료가 없으면: 종합본으로 바로 시작
  //   - 있으면 고르기: ① 최신 종합본으로 맞추기(내 담당 작업 유지, 작업자를 고른 뒤 반영) ② 전부 바꾸기 ③ 이 PC 자료 그대로
  PENDING_KEY: "PPRJMGMT_PENDING_PKG",
  SERVER_PKG_URL: "shared/latest.json",     // 배포 폴더(pprjmgmt/shared/)에 PM 이 넣어 올린 최신 마스터 파일
  SKIP_KEY: "PPRJMGMT_SERVER_SKIP",          // 이번 서버 마스터 파일은 반영하지 않기로 한 버전
  _pkg: null,
  _norm(s) { return String(s || "").replace(/\s+/g, " ").trim().toLowerCase(); },
  _stampOf(d) { return String(((d || {}).projectConfig || {}).packageStamp || ""); },
  async startFromPackage(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    let items;
    try { items = await ProjectTransfer.parse(file); } catch (err) { return AuthManager._err("lockErrorMessage", "파일을 읽지 못했습니다: " + err.message); }
    const it = items && items[0];
    if (!it || !it.users || !it.users.length) return AuthManager._err("lockErrorMessage", "PM 이 보낸 마스터 파일(멤버 목록 포함) 파일이 아닙니다.");
    AuthManager._err("lockErrorMessage", "");
    const pid = (ProjectContext.localList().find(p => this._norm(p.name) === this._norm(it.name)) || {}).id;
    const st = pid ? (LocalBackend._read(pid) || {}) : null;
    const has = !!st && ((st.subsystemsMeta || []).length > 0 || (st.wbsData || []).length > 0);
    if (!has) return this._replaceAll(it, pid);
    this._pkg = { it, pid, file: file.name, mine: this._stampOf(st) };
    this._renderChoice(false);
  },
  _box() { return document.getElementById("localPkgChoice"); },
  _renderChoice(confirmReplace) {
    const box = this._box(), p = this._pkg;
    if (!box || !p) return;
    const fs = this._stampOf(p.it.data), ms = p.mine;
    const cmp = fs && ms ? (fs > ms ? "🆕 이 PC 가 가진 것보다 새 마스터 파일입니다." : fs === ms ? "ℹ️ 이 PC 가 이미 반영한 마스터 파일과 같습니다." : "⚠️ 이 PC 가 가진 것보다 오래된 마스터 파일입니다.") : "";
    const b = (kind, label, btn) => `<button type="button" class="btn btn-sm${btn === "primary" ? " btn-primary" : ""}" data-btn="${btn}" data-click="WorkerPick.choose" data-click-args='["${kind}"]'>${label}</button>`;
    box.innerHTML = `<div class="pkg-info"><b>📥 ${escapeHtml(p.file)}</b> — 프로젝트 [${escapeHtml(p.it.name)}]<br>마스터 파일 버전: ${escapeHtml(fs || "표시 없음")} · 이 PC: ${escapeHtml(ms || "표시 없음")}${cmp ? "<br>" + cmp : ""}<br>이 PC 에 이 프로젝트 자료가 있습니다. 어떻게 할까요?</div>` +
      (confirmReplace
        ? `<div class="pkg-warn">⚠️ 이 PC 의 [${escapeHtml(p.it.name)}] 자료를 모두 지우고 마스터 파일로 바꿉니다. 아직 PM 에게 보내지 않은 내 작업은 사라집니다.</div><div class="pkg-btns">${b("replaceNow", "⚠️ 네, 전부 바꿉니다", "danger")}${b("back", "돌아가기", "")}</div>`
        : `<div class="pkg-btns">${b("latest", "🔄 최신 마스터 파일로 맞추기 (내 담당 작업 유지, 권장)", "primary")}${b("keep", "이 PC 자료 그대로 쓰기", "")}${b("replace", "♻️ 마스터 파일로 전부 바꾸기 (이 PC 자료 버림)", "")}</div>` +
          `<div class="login-hint">최신으로 맞추기: 멤버를 고르고 [▶ 작업 시작]을 누르면 반영됩니다. 내 담당 서브시스템은 이 PC 작업을 그대로 두고 나머지만 마스터 파일로 바뀝니다 (PM · 관리자는 전부 마스터 파일로).</div>`);
    box.style.display = "block";
  },
  choose(kind) {
    const p = this._pkg, box = this._box();
    if (kind === "keep" || !p) { this._pkg = null; if (box) { box.style.display = "none"; box.innerHTML = ""; } return showToast("이 PC 자료를 그대로 씁니다."); }
    if (kind === "replace") return this._renderChoice(true);
    if (kind === "back") return this._renderChoice(false);
    if (kind === "replaceNow") return this._replaceAll(p.it, p.pid);
    if (kind === "latest") {
      this._suspend();
      ProjectTransfer.writeUsersLocal(p.pid, p.it.users);   // 새로 들어온 멤버도 바로 고를 수 있게
      AppStore.setItem(this.PENDING_KEY, JSON.stringify({ pid: p.pid, name: p.it.name, file: p.file, stamp: this._stampOf(p.it.data), item: p.it }));
      try { AppStore.setItem(AuthManager.LOGIN_PROJECT_KEY, p.pid); } catch (err) {}
      showToast(`📥 [${p.it.name}] 최신 마스터 파일을 받아 두었습니다. 멤버를 고르고 [▶ 작업 시작]을 누르면 반영됩니다.`);
      setTimeout(() => AppStore.reload(), 900);
    }
  },
  _suspend() {
    // 화면의 자료가 자동 저장되어 덮어쓰지 않도록 자동 저장을 멈추고 저장소에만 씀 → 다시 불러옴
    SyncManager._suspendAuto = true;
    if (SyncManager._autoTimer) { clearTimeout(SyncManager._autoTimer); SyncManager._autoTimer = null; }
  },
  // [Local] 화면을 처음 불러올 때 배포 폴더의 최신 종합본(shared/latest.json)을 읽음 (app-boot start)
  //   - 이 PC 에 그 프로젝트 자료가 없으면: 그 종합본으로 바로 시작
  //   - 이 PC 보다 새 버전이면: 받아 두고 작업자를 고르면 반영 (내 담당 서브시스템은 이 PC 작업 유지)
  //   - 같거나 오래된 버전 · 파일 없음: 아무것도 안 함
  //   반환 true = 화면을 다시 불러오는 중
  async checkServerPackage() {
    if (location.protocol === "file:") return false;   // 폴더의 index.html 을 바로 열었을 때는 배포 폴더가 없음
    let text;
    try {
      const r = await fetch(this.SERVER_PKG_URL + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return false;
      text = await r.text();
    } catch (e) { return false; }
    let items;
    try { items = await ProjectTransfer.parse(new File([text], "latest.json")); } catch (e) { return false; }
    const it = items && items[0];
    if (!it || !it.users || !it.users.length) return false;
    const fs = this._stampOf(it.data);
    const pid = (ProjectContext.localList().find(p => this._norm(p.name) === this._norm(it.name)) || {}).id;
    const st = pid ? (LocalBackend._read(pid) || {}) : null;
    const has = !!st && ((st.subsystemsMeta || []).length > 0 || (st.wbsData || []).length > 0);
    // 이 브라우저의 어느 프로젝트든 같은 마스터 파일(같은 판)을 이미 가지고 있으면 아무것도 하지 않음 (이 파일을 만든 PM 의 PC 등)
    if (fs && ProjectContext.localList().some(x => this._stampOf(LocalBackend._read(x.id) || {}) === fs)) return false;
    if (!has) {
      // 이 주소(브라우저)에 자료가 없을 때: 바로 넣지 않고 묻는다 — 내 PC 파일로 쓰던 것과 별개의 시스템으로 빈 상태에서 시작할 수도 있게
      try { if (AppStore.getItem(this.SKIP_KEY) === (fs || "nostamp")) return false; } catch (e) {}
      document.body.classList.add("theme-ready");   // 아직 화면을 숨겨 둔 상태라 질문 창이 보이도록
      const pick = await SyncUI.ask("🌐 서버에 마스터 파일이 있습니다",
        `이 주소의 배포 폴더에 [${it.name}] 마스터 파일(멤버 ${it.users.length}명)이 올라와 있습니다.\n이 자료로 시작할까요?\n\n` +
        "· 시작하면 이 주소에서 쓰는 자료가 됩니다. 내 PC 의 index.html 로 열어 쓰던 자료와는 따로 저장됩니다.\n" +
        "· [빈 상태로 시작]을 고르면 이 파일은 다시 묻지 않습니다 (새 마스터 파일이 올라오면 다시 묻습니다). 나중에 [📦 마스터 파일 ▾ > 가져오기]로 넣을 수 있습니다.",
        [{ id: "use", label: "📥 이 마스터 파일로 시작", cls: "btn-primary" }, { id: "empty", label: "빈 상태로 시작", cls: "btn-secondary" }]);
      if (pick !== "use") { try { AppStore.setItem(this.SKIP_KEY, fs || "nostamp"); } catch (e) {} return false; }
      this._replaceAll(it, pid, "🌐 서버의 최신 마스터 파일");
      return true;
    }
    const ms = this._stampOf(st);
    if (!fs || (ms && fs <= ms)) return false;
    try { if (AppStore.getItem(this.SKIP_KEY) === fs) return false; } catch (e) {}
    const p = this._pending();
    if (p && p.stamp === fs) return false;
    this._suspend();
    ProjectTransfer.writeUsersLocal(pid, it.users);
    AppStore.setItem(this.PENDING_KEY, JSON.stringify({ pid, name: it.name, file: "🌐 서버의 최신 마스터 파일", stamp: fs, item: it, server: true }));
    try { AppStore.setItem(AuthManager.LOGIN_PROJECT_KEY, pid); } catch (err) {}
    await AppStore.reload();
    return true;
  },
  async _replaceAll(it, pid, label) {
    if (!pid) {
      const def = LocalBackend._read(ProjectContext.DEFAULT) || {};
      const empty = !(def.subsystemsMeta || []).length && !(def.wbsData || []).length;
      pid = empty ? ProjectContext.DEFAULT : await ProjectTransfer.create(it.name, it.data.projectConfig || {});
    }
    this._suspend();
    ProjectTransfer.writeLocal(pid, it);
    const l2 = ProjectContext.localList();
    const row = l2.find(p => p.id === pid);
    if (row) { row.name = it.name; ProjectContext.saveLocalList(l2); }
    try { AppStore.setItem(AuthManager.LOGIN_PROJECT_KEY, pid); } catch (err) {}
    try { AppStore.removeItem(this.PENDING_KEY); } catch (err) {}
    try { AppStore.setItem("PPRJMGMT_START_MSG", `${label || "📥 마스터 파일"} [${it.name}]으로 시작합니다 — 멤버 ${it.users.length}명. 내 이름을 골라 시작하세요 (처음 암호: 1234).`); } catch (err) {}
    showToast(`📥 [${it.name}] 마스터 파일을 이 브라우저에 넣었습니다 — 멤버 ${it.users.length}명. 내 이름을 골라 시작하세요 (처음 암호: 1234).`);
    setTimeout(() => AppStore.reload(), 900);
  },
  _pending() { try { return JSON.parse(AppStore.getItem(this.PENDING_KEY) || "null"); } catch (e) { return null; } },
  // 작업자 선택 화면: 받아 둔 종합본이 있으면 알림
  showPending() {
    const box = this._box(), p = this._pending();
    if (!box || this._pkg) return;
    if (!p) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.innerHTML = `<div class="pkg-info">📥 ${p.server ? "새 마스터 파일이 올라와 있습니다" : "받아 둔 마스터 파일"}: <b>${escapeHtml(p.file)}</b> [${escapeHtml(p.name)}] (${escapeHtml(p.stamp || "버전 표시 없음")})<br>이 프로젝트로 멤버를 고르면 반영됩니다 (내 담당 서브시스템은 이 PC 작업 유지).</div><div class="pkg-btns"><button type="button" class="btn btn-sm" data-click="WorkerPick.cancelPending">이번 마스터 파일은 반영하지 않기</button></div>`;
    box.style.display = "block";
  },
  cancelPending() { const p = this._pending(); try { if (p && p.server) AppStore.setItem(this.SKIP_KEY, p.stamp); AppStore.removeItem(this.PENDING_KEY); } catch (e) {} this.showPending(); showToast("받아 둔 마스터 파일을 취소했습니다. 이 PC 자료를 그대로 씁니다."); },
  // 작업자 선택 뒤 (app-boot afterLogin): 받아 둔 종합본을 지금 프로젝트에 반영
  applyPending() {
    const p = this._pending();
    if (!p || !p.item || p.pid !== ProjectContext.current) return;
    try { AppStore.removeItem(this.PENDING_KEY); } catch (e) {}
    // PM · 관리자는 전부 바뀌므로 서버 종합본은 한 번 묻고 반영 (아니오 = 이번 버전은 반영 안 함)
    if (p.server && Permission.canEditAllSubsystems()) {
      try { AppStore.setItem(this.SKIP_KEY, p.stamp); } catch (e) {}
      return openConfirmDialog(`🌐 서버에 이 PC 보다 새 마스터 파일(${p.stamp})이 있습니다.\nPM · 관리자는 프로젝트 자료 전체가 마스터 파일로 바뀝니다 (바꾸기 전에 스냅샷을 만듦). 반영할까요?\n(취소하면 이번 마스터 파일은 다시 묻지 않습니다.)`, () => SmartMergeCenter.applyConsolidated(p.item, p.file));
    }
    SmartMergeCenter.applyConsolidated(p.item, p.file);
  },
  // 다시 불러온 뒤 알림
  startMessage() {
    let m = null;
    try { m = AppStore.getItem("PPRJMGMT_START_MSG"); if (m) AppStore.removeItem("PPRJMGMT_START_MSG"); } catch (e) {}
    if (m) setTimeout(() => showToast(m), 600);
  }
};
window.WorkerPick = WorkerPick;
