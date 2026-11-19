// =============================================================================
// 현재 프로젝트 · 저장소 (ProjectContext · LocalBackend · ServerBackend) — data-registry.js 다음, data-store.js 보다 먼저 불러옴
// =============================================================================

// -----------------------------------------------------------------------------
// 4. 저장소 백엔드
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 현재 프로젝트 (여러 프로젝트 관리)
//  - 작업자 계정(projectUsers)·화면 테마(theme)는 한 곳에 저장, 그 밖의 데이터는 프로젝트별 저장
//  - 작업자 정보(역할·담당·부서)는 프로젝트별 참여 정보로 관리, 화면에는 그 프로젝트 작업자만
//  - 기본 프로젝트(DEFAULT)는 v1.0.9 이하 저장 위치를 그대로 사용 (기존 데이터 이관 불필요)
// -----------------------------------------------------------------------------
var ProjectContext = {
  DEFAULT: "DEFAULT",
  KEY: "AX_PMYS_CURRENT_PROJECT",
  REG_KEY: "AX_PMYS_PROJECTS",
  GLOBAL_KEYS: ["projectUsers", "theme", "processTypes"],
  current: "DEFAULT",
  projects: [],

  init() {
    let pid = "";
    try { pid = sessionStorage.getItem(this.KEY) || AppStore.getItem(this.KEY) || ""; } catch (e) {}
    this.current = /^[A-Za-z0-9_-]{1,32}$/.test(pid) ? pid : this.DEFAULT;
    return this.current;
  },
  set(pid) {
    this.current = pid || this.DEFAULT;
    try { sessionStorage.setItem(this.KEY, this.current); AppStore.setItem(this.KEY, this.current); } catch (e) {}
  },
  isGlobal(key) { return this.GLOBAL_KEYS.indexOf(key) !== -1; },
  isDefault() { return this.current === this.DEFAULT; },
  info(pid) { return (this.projects || []).find(p => p.id === (pid || this.current)) || null; },

  // 로컬 저장소 모드의 프로젝트 목록
  localList() {
    let list = [];
    try { list = JSON.parse(AppStore.getItem(this.REG_KEY) || "[]") || []; } catch (e) { list = []; }
    if (!list.some(p => p.id === this.DEFAULT)) {
      list.unshift({ id: this.DEFAULT, name: (typeof projectConfig !== "undefined" && projectConfig.projectName) || "기본 프로젝트", status: "ACTIVE", restricted: false, members: [], createdAt: "", createdBy: "system" });
    }
    return list;
  },
  saveLocalList(list) {
    try { AppStore.setItem(this.REG_KEY, JSON.stringify(list)); } catch (e) {}
  },

  // ---- 작업자 정보는 프로젝트별 (서버 wbs_db_server.py 와 같은 규칙) ----
  //  계정(작업자 ID·이름·암호)은 하나, 프로젝트마다 참여 정보 projectRoles[프로젝트ID] = { role, subsystem, dept }
  //  관리자는 모든 프로젝트에 보이고, 그 밖의 작업자는 참여한 프로젝트에만 보임
  allUsers: [],
  isAdminUser(u) { return !!u && AuthManager.normalizeRole(u.baseRole || u.role) === "SYS_ADMIN"; },
  member(u, pid) {
    const a = u && u.projectRoles && u.projectRoles[pid || this.current];
    return a && typeof a === "object" ? a : null;
  },
  visibleUsers(list, pid) {
    return (list || []).filter(u => u && (this.isAdminUser(u) || this.member(u, pid)));
  },
  findAny(empNo) {
    const k = String(empNo || "").toLowerCase();
    return (this.allUsers.length ? this.allUsers : (typeof projectUsers !== "undefined" ? projectUsers : [])).find(u => String(u.empNo || "").toLowerCase() === k) || null;
  },
  // 이전 버전(참여 정보 없음) 작업자 행: 기본 프로젝트 참여로 간주 (샘플·백업 복원 데이터)
  ensureLegacyMembership(list) {
    (list || []).forEach(u => {
      if (!u || this.isAdminUser(u) || (u.projectRoles && typeof u.projectRoles === "object")) return;
      const role = AuthManager.normalizeRole(u.role);
      u.projectRoles = { [this.DEFAULT]: { role: role === "SYS_ADMIN" ? "PM" : role, subsystem: u.subsystem || "ALL", dept: u.dept || "" } };
    });
    return list;
  },
  // 로컬 저장소 1회 이관: 지금까지 접근할 수 있던 프로젝트마다 참여 정보를 만들어 둠
  MIGRATE_KEY: "IOSTAR_MEMBERSHIP_V3",
  migrateLocalUsers(list) {
    let done = false;
    try { done = AppStore.getItem(this.MIGRATE_KEY) === "1"; } catch (e) {}
    if (done || !Array.isArray(list)) return false;
    const projects = this.localList();
    let changed = false;
    list.forEach(u => {
      if (!u || this.isAdminUser(u)) return;
      const pr = Object.assign({}, u.projectRoles || {});
      const emp = String(u.empNo || "").toLowerCase();
      projects.forEach(p => {
        const old = !p.restricted || (p.members || []).some(m => String(m).toLowerCase() === emp);
        if (old && !pr[p.id]) {
          const role = AuthManager.normalizeRole(u.role);
          pr[p.id] = { role: role === "SYS_ADMIN" ? "PM" : role, subsystem: u.subsystem || "ALL", dept: u.dept || "" };
          changed = true;
        }
      });
      u.projectRoles = pr;
    });
    try { AppStore.setItem(this.MIGRATE_KEY, "1"); } catch (e) {}
    return changed;
  },

  effective(u, pid) {
    const id = pid || this.current;
    const out = Object.assign({}, u);
    const base = (typeof AuthManager !== "undefined") ? AuthManager.normalizeRole(u.baseRole || u.role) : u.role;
    out.baseRole = base;
    out.projectId = id;
    if (base === "SYS_ADMIN") return out;
    const a = this.member(u, id);
    if (a) {
      const r = AuthManager.normalizeRole(a.role);
      out.role = r === "SYS_ADMIN" ? "PM" : r;
      out.subsystem = a.subsystem || "ALL";
      if (a.dept) out.dept = a.dept;
    } else {
      out.role = "MEMBER";
      out.subsystem = "";
    }
    return out;
  },
  canAccess(u, project) {
    if (!project) return false;
    if (this.isAdminUser(u)) return true;
    const row = this.findAny(u.empNo) || u;
    return !!this.member(row, project.id);
  }
};

var LocalBackend = {
  STORAGE_KEY: "WBS_ENTERPRISE_SYSTEM_DATA_V164", // v1.0.5 이하 저장 데이터와 호환 (기본 프로젝트)
  REVS_KEY: "AX_PMYS_LOCAL_PART_REVS",
  name: "LOCAL",

  // 프로젝트별 저장 위치 (기본 프로젝트는 기존 키 그대로)
  _skey(pid) { return pid === ProjectContext.DEFAULT ? this.STORAGE_KEY : `${this.STORAGE_KEY}::${pid}`; },
  _rkey(pid) { return pid === ProjectContext.DEFAULT ? this.REVS_KEY : `${this.REVS_KEY}::${pid}`; },
  _pidFor(key) { return ProjectContext.isGlobal(key) ? ProjectContext.DEFAULT : ProjectContext.current; },

  _read(pid = ProjectContext.current) {
    try {
      const raw = AppStore.getItem(this._skey(pid));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  _readRevs(pid = ProjectContext.current) {
    try { return JSON.parse(AppStore.getItem(this._rkey(pid)) || "{}") || {}; } catch (e) { return {}; }
  },
  _write(pid, stored, revs) {
    AppStore.setItem(this._skey(pid), JSON.stringify(stored));
    AppStore.setItem(this._rkey(pid), JSON.stringify(revs));
  },
  hasData() { return !!this._read(ProjectContext.current); },

  async load(keys) {
    const data = {};
    const revs = {};
    const cache = {};
    // 로컬 저장소 작업자 1회 이관 (프로젝트별 참여 정보)
    try {
      const st = this._read(ProjectContext.DEFAULT);
      if (st && Array.isArray(st.projectUsers)) {
        if (ProjectContext.migrateLocalUsers(st.projectUsers)) this._write(ProjectContext.DEFAULT, st, this._readRevs(ProjectContext.DEFAULT));
        // 관리자 계정을 둘 둠 (admin · admin2, 처음 암호 1234) — 예전 설치에 admin2 가 없으면 한 번만 추가
        if (AppStore.getItem("IOSTAR_SECOND_ADMIN") !== "1") {
          AppStore.setItem("IOSTAR_SECOND_ADMIN", "1");
          if (!st.projectUsers.some(u => String(u.empNo || "").toLowerCase() === "admin2")) {
            const at = st.projectUsers.findIndex(u => String(u.empNo || "").toLowerCase() === "admin") + 1;
            st.projectUsers.splice(at, 0, { empNo: "admin2", name: "관리자2", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko", projectRoles: {} });
            const rv = this._readRevs(ProjectContext.DEFAULT);
            if (rv.projectUsers) rv.projectUsers.admin2 = { rev: 1, by: "system", at: new Date().toLocaleString() };
            this._write(ProjectContext.DEFAULT, st, rv);
          }
        }
      } else {
        AppStore.setItem(ProjectContext.MIGRATE_KEY, "1"); // 새로 설치: 이관할 이전 데이터 없음
      }
    } catch (e) { console.warn("[LocalBackend] member migration skipped", e); }
    (keys || DataRegistry.KEYS).forEach(k => {
      const pid = this._pidFor(k);
      if (!cache[pid]) cache[pid] = { stored: this._read(pid) || {}, revs: this._readRevs(pid) };
      if (k in cache[pid].stored) data[k] = cache[pid].stored[k];
      revs[k] = cache[pid].revs[k] || {};
    });
    return { ok: true, data, revs };
  },

  async save(changes, force, who) {
    const groups = {};
    Object.keys(changes).forEach(k => {
      const pid = this._pidFor(k);
      if (!groups[pid]) groups[pid] = { stored: this._read(pid) || {}, revs: this._readRevs(pid), keys: [] };
      groups[pid].keys.push(k);
    });
    const conflicts = [];
    Object.keys(groups).forEach(pid => {
      const g = groups[pid];
      g.keys.forEach(k => {
        const kRevs = g.revs[k] || {};
        const ch = changes[k];
        Object.keys(ch.parts).forEach(p => {
          const cur = kRevs[p] ? kRevs[p].rev : 0;
          const base = ch.base[p] || 0;
          if (cur !== base) conflicts.push({ key: k, part: p, by: kRevs[p] ? kRevs[p].by : "", at: kRevs[p] ? kRevs[p].at : "" });
        });
      });
    });
    if (conflicts.length && !force) return { ok: false, conflict: true, conflicts };

    const now = new Date().toLocaleString();
    const out = {};
    const outRevs = {};
    try {
      Object.keys(groups).forEach(pid => {
        const g = groups[pid];
        g.keys.forEach(k => {
          const ch = changes[k];
          const base = (k in g.stored) ? g.stored[k] : DataRegistry.get(k);
          g.stored[k] = Partition.merge(k, base, ch.parts);
          g.revs[k] = g.revs[k] || {};
          Object.keys(ch.parts).forEach(p => {
            const cur = g.revs[k][p] ? g.revs[k][p].rev : 0;
            g.revs[k][p] = { rev: cur + 1, by: who || "", at: now };
          });
          out[k] = g.stored[k];
          outRevs[k] = g.revs[k];
        });
        g.stored.savedAt = new Date().toISOString();
        this._write(pid, g.stored, g.revs);
      });
    } catch (e) {
      return { ok: false, error: "브라우저 저장소 용량 초과 또는 접근 불가: " + e.message };
    }
    if (out.projectConfig && out.projectConfig.projectName && typeof ProjectManager !== "undefined") ProjectManager.syncLocalName(out.projectConfig.projectName);
    return { ok: true, data: out, revs: outRevs };
  },

  // 전체 덮어쓰기 (초기화/샘플 복원/백업 복원 전용) — 공통 데이터는 기본 프로젝트 위치에 저장
  replaceAll(data) {
    const now = new Date().toLocaleString();
    // 초기화·샘플·백업으로 새로 쓰는 데이터는 이미 프로젝트별 작업자 규칙을 따름 (1회 이관 불필요)
    try { AppStore.setItem(ProjectContext.MIGRATE_KEY, "1"); } catch (e) {}
    const groups = {};
    DataRegistry.KEYS.forEach(k => {
      const pid = this._pidFor(k);
      if (!groups[pid]) groups[pid] = { stored: this._read(pid) || {}, revs: this._readRevs(pid) };
      const g = groups[pid];
      g.stored[k] = data[k];
      g.revs[k] = g.revs[k] || {};
      Partition.split(k, data[k]).forEach((_, p) => {
        g.revs[k][p] = { rev: (g.revs[k][p] ? g.revs[k][p].rev : 0) + 1, by: "reset", at: now };
      });
    });
    const all = {};
    Object.keys(groups).forEach(pid => {
      groups[pid].stored.savedAt = new Date().toISOString();
      this._write(pid, groups[pid].stored, groups[pid].revs);
      Object.assign(all, groups[pid].revs);
    });
    const out = {};
    DataRegistry.KEYS.forEach(k => { out[k] = all[k] || {}; });
    return out;
  },

  // 새 프로젝트 저장 공간 만들기 / 지우기
  createProjectStore(pid, data) {
    const now = new Date().toLocaleString();
    const revs = {};
    Object.keys(data).forEach(k => {
      revs[k] = {};
      Partition.split(k, data[k]).forEach((_, p) => { revs[k][p] = { rev: 1, by: "create", at: now }; });
    });
    this._write(pid, Object.assign({ savedAt: new Date().toISOString() }, data), revs);
  },
  removeProjectStore(pid) {
    if (pid === ProjectContext.DEFAULT) return;
    try { AppStore.removeItem(this._skey(pid)); AppStore.removeItem(this._rkey(pid)); } catch (e) {}
  },

  usageBytes() {
    try {
      let n = 0;
      for (let i = 0; i < AppStore.length; i++) {
        const k = AppStore.key(i);
        if (k && k.indexOf(this.STORAGE_KEY) === 0) n += new Blob([AppStore.getItem(k) || ""]).size;
      }
      return n;
    } catch (e) { return 0; }
  }
};

var ServerBackend = {
  name: "SERVER",
  TOKEN_KEY: "AX_PMYS_SERVER_TOKEN",
  token: "",

  baseUrl() { return (typeof DbConnector !== "undefined" && DbConnector.getApiBase) ? DbConnector.getApiBase() : ""; },

  loadToken() {
    try { this.token = sessionStorage.getItem(this.TOKEN_KEY) || ""; } catch (e) { this.token = ""; }
    return this.token;
  },
  setToken(t) {
    this.token = t || "";
    try {
      if (t) sessionStorage.setItem(this.TOKEN_KEY, t);
      else sessionStorage.removeItem(this.TOKEN_KEY);
    } catch (e) {}
  },

  async request(path, body, method = "POST", timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { "Content-Type": "application/json", "X-Project-Id": ProjectContext.current };
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    try {
      const res = await fetch(this.baseUrl() + path, {
        method,
        headers,
        body: method === "GET" ? undefined : JSON.stringify(body || {}),
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => ({}));
      json.httpStatus = res.status;
      if (typeof ConnState !== "undefined" && !ConnState.online) ConnState.setOnline(true);
      if (res.status === 401) {
        json.authRequired = true;
        if (typeof AuthManager !== "undefined" && AuthManager.onServerAuthExpired) AuthManager.onServerAuthExpired();
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      // 주기 확인 없이, 작업자 요청이 실패했을 때 연결 끊김 표시
      if (typeof ConnState !== "undefined" && ConnState.online) ConnState.setOnline(false);
      return { ok: false, network: true, message: err && err.name === "AbortError" ? "서버 응답 시간 초과" : (err.message || "서버 연결 실패") };
    }
  },

  async load(keys) {
    const res = await this.request("/api/db/load", { keys: keys || null });
    if (!res.ok) return { ok: false, error: res.message || "DB 조회 실패", network: res.network, authRequired: res.authRequired };
    return { ok: true, data: res.data || {}, revs: res.revs || {} };
  },

  async save(changes, force, who, opts = {}) {
    const res = await this.request("/api/db/save", { changes, force: !!force, lockBypass: !!opts.lockBypass }, "POST", 20000);
    // [Workgroup] 체크아웃 잠금으로 막힘 — 아무것도 저장되지 않음
    if (res.httpStatus === 423 || res.locked) return { ok: false, locked: res.locked || [] };
    if (res.httpStatus === 409 || res.conflict) return { ok: false, conflict: true, conflicts: res.conflicts || [] };
    if (!res.ok) return { ok: false, error: res.message || "DB 저장 실패", network: res.network, authRequired: res.authRequired };
    return { ok: true, data: res.data || {}, revs: res.revs || {}, blocked: res.blocked || [] };
  }
};
