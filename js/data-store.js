// =============================================================================
// [IOSTAR-PM v1.0.6] 데이터 저장/동기화 계층 (Data Store & Sync)
// -----------------------------------------------------------------------------
//  - DataRegistry : 프로젝트 데이터셋(13종)의 단일 접근점 (수집/적용/백업/JSON 파일 저장 공통)
//  - Partition    : 데이터셋을 "파티션" 단위로 분할 (서브시스템 단위 / 행 ID 단위 / 전체)
//                   → 충돌 감지와 담당 서브시스템 저장 권한을 같은 단위로 처리
//  - Permission   : 역할(SYS_ADMIN / PM / LEAD / MEMBER)별 파티션 쓰기 권한
//  - LocalBackend : 브라우저 LocalStorage 저장소 (실시간 자동저장 지원)
//  - ServerBackend: 다중 사용자 DB 서버 (토큰 인증, 저장 버튼 방식)
//  - SyncManager  : 변경 감지(기준본 대비), 저장/새로고침, 충돌 경고(덮어쓰기/무시하기), 화면별 툴바
//
//  ※ 이 파일은 app.js 다음, access-control.js 이전에 로드합니다.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. 데이터셋 레지스트리
// -----------------------------------------------------------------------------
var DataRegistry = {
  // part: "system" = 서브시스템 단위 / "id"·"empNo" = 행 단위 / null = 데이터셋 전체
  // scope: 저장 권한 그룹
  DEFS: {
    projectConfig:            { part: null,     scope: "master",    label: "프로젝트 기준정보" },
    subsystemsMeta:           { part: null,     scope: "master",    label: "분야/서브시스템" },
    standardDeliverablesMeta: { part: null,     scope: "master",    label: "표준 산출물" },
    projectUsers:             { part: "empNo",  scope: "users",     label: "사용자" },
    wbsData:                  { part: "system", scope: "subsystem", label: "WBS 공정", volatile: ["pProg", "status"] },
    deliverablesData:         { part: "system", scope: "subsystem", label: "산출물" },
    reqMasterData:            { part: "system", scope: "subsystem", label: "요구사항" },
    vocData:                  { part: "system", scope: "subsystem", label: "VOC" },
    noticesData:              { part: "id",     scope: "shared",    label: "공지사항" },
    communicationsData:       { part: "id",     scope: "shared",    label: "소통 피드" },
    meetingsData:             { part: "id",     scope: "shared",    label: "회의" },
    weeklyReportsData:        { part: "id",     scope: "weekly",    label: "주간보고" },
    // [v2.4.0] 사용자별 할 일 (본인만 보고 고침 — DB 서버는 본인 항목만 내려줌)
    todosData:                { part: "id",     scope: "personal",  label: "내 할 일" },
    theme:                    { part: null,     scope: "pref",      label: "화면 테마" }
  },

  get KEYS() { return Object.keys(this.DEFS); },

  get(key) {
    switch (key) {
      case "projectConfig": return projectConfig;
      case "subsystemsMeta": return subsystemsMeta;
      case "standardDeliverablesMeta": return standardDeliverablesMeta;
      case "projectUsers": return projectUsers;
      case "wbsData": return wbsData;
      case "deliverablesData": return deliverablesData;
      case "reqMasterData": return reqMasterData;
      case "vocData": return vocData;
      case "noticesData": return typeof noticesData !== "undefined" ? noticesData : [];
      case "communicationsData": return typeof communicationsData !== "undefined" ? communicationsData : [];
      case "meetingsData": return typeof meetingsData !== "undefined" ? meetingsData : [];
      case "weeklyReportsData": return typeof weeklyReportsData !== "undefined" ? weeklyReportsData : [];
      case "todosData": return typeof todosData !== "undefined" && Array.isArray(todosData) ? todosData : [];
      case "theme": return document.body.getAttribute("data-theme") || (typeof defaultTheme === "function" ? defaultTheme() : "electric");
    }
    return undefined;
  },

  set(key, val) {
    if (val === undefined || val === null) return;
    switch (key) {
      case "projectConfig": if (typeof val === "object") projectConfig = Object.assign({}, projectConfig, val); break;
      case "subsystemsMeta": if (Array.isArray(val)) subsystemsMeta = val; break;
      case "standardDeliverablesMeta": if (Array.isArray(val)) standardDeliverablesMeta = val; break;
      case "projectUsers": if (Array.isArray(val) && val.length > 0) projectUsers = val; break;
      case "wbsData": if (Array.isArray(val)) wbsData = val; break;
      case "deliverablesData": if (Array.isArray(val)) deliverablesData = val; break;
      case "reqMasterData": if (Array.isArray(val)) reqMasterData = val; break;
      case "vocData": if (Array.isArray(val)) vocData = val; break;
      case "noticesData": if (Array.isArray(val)) noticesData = val; break;
      case "communicationsData": if (Array.isArray(val)) communicationsData = val; break;
      case "meetingsData": if (Array.isArray(val)) meetingsData = val; break;
      case "weeklyReportsData": if (Array.isArray(val)) weeklyReportsData = val; break;
      case "todosData": if (Array.isArray(val)) todosData = val; break;
      case "theme":
        if (typeof val === "string" && val) {
          if (typeof normalizeTheme === "function") val = normalizeTheme(val);
          document.body.setAttribute("data-theme", val);
          const sel = document.getElementById("themeSelector");
          if (sel) sel.value = val;
        }
        break;
    }
  },

  // 현재 메모리 데이터 수집 (keys 미지정 시 전체)
  collect(keys) {
    const out = {};
    (keys || this.KEYS).forEach(k => { out[k] = this.get(k); });
    return out;
  },

  // 데이터 일괄 적용 (구버전 백업/JSON 파일 호환: 없는 키는 건너뜀)
  apply(data, keys) {
    if (!data || typeof data !== "object") return false;
    (keys || this.KEYS).forEach(k => {
      if (k in data) this.set(k, data[k]);
    });
    if (Array.isArray(data.communicationsData)) Partition.ensureIds("communicationsData", communicationsData);
    return true;
  },

  clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
};

// -----------------------------------------------------------------------------
// 2. 파티션 유틸 (서버 wbs_db_server.py 의 동일 로직과 짝을 이룸)
// -----------------------------------------------------------------------------
var Partition = {
  WHOLE: "*",

  ensureIds(key, rows) {
    const def = DataRegistry.DEFS[key];
    if (!def || def.part !== "id" || !Array.isArray(rows)) return;
    rows.forEach((r, i) => {
      if (r && typeof r === "object" && !r.id) r.id = `${key.replace("Data", "").toUpperCase()}-${Date.now().toString(36)}-${i}`;
    });
  },

  partOf(key, row) {
    const def = DataRegistry.DEFS[key];
    if (!def || !def.part) return this.WHOLE;
    const v = row && typeof row === "object" ? row[def.part] : "";
    return String(v === undefined || v === null ? "" : v);
  },

  // value → Map(part → rows[] | row | value)
  split(key, value) {
    const def = DataRegistry.DEFS[key];
    const m = new Map();
    if (!def || !def.part || !Array.isArray(value)) {
      m.set(this.WHOLE, value);
      return m;
    }
    value.forEach(row => {
      const p = this.partOf(key, row);
      if (def.part === "system") {
        if (!m.has(p)) m.set(p, []);
        m.get(p).push(row);
      } else {
        m.set(p, row);
      }
    });
    return m;
  },

  // 비교용 정규화 문자열 (계산 필드 제외)
  canon(key, partVal) {
    const def = DataRegistry.DEFS[key] || {};
    const vol = def.volatile || [];
    return JSON.stringify(partVal, (k, v) => (vol.includes(k) ? undefined : v));
  },

  // 서버와 동일한 병합: base(전체 값) + changedParts{part: rows|row|null}
  merge(key, base, changedParts) {
    const def = DataRegistry.DEFS[key];
    if (!def || !def.part) {
      return Object.prototype.hasOwnProperty.call(changedParts, this.WHOLE) ? changedParts[this.WHOLE] : base;
    }
    const baseArr = Array.isArray(base) ? base : [];
    if (def.part === "system") {
      const order = [];
      const groups = new Map();
      baseArr.forEach(r => {
        const p = this.partOf(key, r);
        if (!groups.has(p)) { groups.set(p, []); order.push(p); }
        groups.get(p).push(r);
      });
      Object.keys(changedParts).forEach(p => {
        const rows = changedParts[p];
        if (!groups.has(p)) order.push(p);
        groups.set(p, Array.isArray(rows) ? rows : []);
      });
      const out = [];
      order.forEach(p => (groups.get(p) || []).forEach(r => out.push(r)));
      return out;
    }
    const out = [];
    const seen = new Set();
    baseArr.forEach(r => {
      const p = this.partOf(key, r);
      seen.add(p);
      if (Object.prototype.hasOwnProperty.call(changedParts, p)) {
        if (changedParts[p]) out.push(changedParts[p]);
      } else {
        out.push(r);
      }
    });
    Object.keys(changedParts).forEach(p => {
      if (!seen.has(p) && changedParts[p]) out.push(changedParts[p]);
    });
    return out;
  }
};

// -----------------------------------------------------------------------------
// 3. 저장 권한 (서버에서도 동일 규칙으로 재검증)
// -----------------------------------------------------------------------------
var Permission = {
  user() {
    return (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser) ? AuthManager.getCurrentUser() : { role: "SYS_ADMIN", subsystem: "ALL" };
  },
  role() {
    const u = this.user();
    return (typeof AuthManager !== "undefined" && AuthManager.normalizeRole) ? AuthManager.normalizeRole(u.role) : "SYS_ADMIN";
  },
  isManager() { const r = this.role(); return r === "SYS_ADMIN" || r === "PM"; },
  // 전체 서브시스템 데이터 수정 가능 여부 (관리자·PM·총괄리더)
  canEditAllSubsystems() { const r = this.role(); return r === "SYS_ADMIN" || r === "PM" || r === "LEAD"; },
  ownSubsystem() { return String(this.user().subsystem || "ALL"); },

  canWriteSubsystem(sys) {
    if (this.canEditAllSubsystems()) return true;
    const own = this.ownSubsystem();
    return own === "ALL" || own === String(sys || "");
  },

  // row: 현재 행(또는 삭제 시 기준본 행)
  canWritePart(key, part, row) {
    const def = DataRegistry.DEFS[key];
    if (!def) return false;
    const role = this.role();
    switch (def.scope) {
      case "master": return role === "SYS_ADMIN" || role === "PM";
      case "pref": return role === "SYS_ADMIN" || role === "PM";
      case "users":
        if (role === "SYS_ADMIN" || role === "PM") return true;
        return String(part).toLowerCase() === String(this.user().empNo || "").toLowerCase();
      case "subsystem": return this.canWriteSubsystem(part);
      case "weekly": {
        if (this.canEditAllSubsystems()) return true;
        const r = row || {};
        return r.scope === "SYS" && this.canWriteSubsystem(r.scopeValue);
      }
      case "shared": return true;
      case "personal": {
        const r = row || (DataRegistry.get(key) || []).find(x => String(x.id) === String(part)) || {};
        return String(r.owner || "").toLowerCase() === String(this.user().empNo || "").toLowerCase();
      }
    }
    return false;
  }
};

// -----------------------------------------------------------------------------
// 4. 저장소 백엔드
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// [v1.0.10] 현재 프로젝트 (여러 프로젝트 관리)
//  - 사용자 계정(projectUsers)·화면 테마(theme)는 모든 프로젝트 공통, 그 밖의 데이터는 프로젝트별 저장
//  - 기본 프로젝트(DEFAULT)는 v1.0.9 이하 저장 위치를 그대로 사용 (기존 데이터 이관 불필요)
// -----------------------------------------------------------------------------
var ProjectContext = {
  DEFAULT: "DEFAULT",
  KEY: "AX_PMYS_CURRENT_PROJECT",
  REG_KEY: "AX_PMYS_PROJECTS",
  GLOBAL_KEYS: ["projectUsers", "theme"],
  current: "DEFAULT",
  projects: [],

  init() {
    let pid = "";
    try { pid = sessionStorage.getItem(this.KEY) || localStorage.getItem(this.KEY) || ""; } catch (e) {}
    this.current = /^[A-Za-z0-9_-]{1,32}$/.test(pid) ? pid : this.DEFAULT;
    return this.current;
  },
  set(pid) {
    this.current = pid || this.DEFAULT;
    try { sessionStorage.setItem(this.KEY, this.current); localStorage.setItem(this.KEY, this.current); } catch (e) {}
  },
  isGlobal(key) { return this.GLOBAL_KEYS.indexOf(key) !== -1; },
  isDefault() { return this.current === this.DEFAULT; },
  info(pid) { return (this.projects || []).find(p => p.id === (pid || this.current)) || null; },

  // 로컬 저장소 모드의 프로젝트 목록
  localList() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(this.REG_KEY) || "[]") || []; } catch (e) { list = []; }
    if (!list.some(p => p.id === this.DEFAULT)) {
      list.unshift({ id: this.DEFAULT, name: (typeof projectConfig !== "undefined" && projectConfig.projectName) || "기본 프로젝트", status: "ACTIVE", restricted: false, members: [], createdAt: "", createdBy: "system" });
    }
    return list;
  },
  saveLocalList(list) {
    try { localStorage.setItem(this.REG_KEY, JSON.stringify(list)); } catch (e) {}
  },

  // 프로젝트별 역할 (서버 wbs_db_server.py effective_user 와 같은 규칙)
  effective(u, pid) {
    const id = pid || this.current;
    const out = Object.assign({}, u);
    const base = (typeof AuthManager !== "undefined") ? AuthManager.normalizeRole(u.role) : u.role;
    out.baseRole = base;
    out.projectId = id;
    if (base === "SYS_ADMIN" || id === this.DEFAULT) return out;
    const a = u.projectRoles && u.projectRoles[id];
    if (a && typeof a === "object") {
      const r = AuthManager.normalizeRole(a.role);
      out.role = r === "SYS_ADMIN" ? "PM" : r;
      out.subsystem = a.subsystem || u.subsystem || "ALL";
    }
    return out;
  },
  canAccess(u, project) {
    if (!project) return false;
    if (AuthManager.normalizeRole(u.baseRole || u.role) === "SYS_ADMIN" || !project.restricted) return true;
    return (project.members || []).some(m => String(m).toLowerCase() === String(u.empNo || "").toLowerCase());
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
      const raw = localStorage.getItem(this._skey(pid));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  _readRevs(pid = ProjectContext.current) {
    try { return JSON.parse(localStorage.getItem(this._rkey(pid)) || "{}") || {}; } catch (e) { return {}; }
  },
  _write(pid, stored, revs) {
    localStorage.setItem(this._skey(pid), JSON.stringify(stored));
    localStorage.setItem(this._rkey(pid), JSON.stringify(revs));
  },
  hasData() { return !!this._read(ProjectContext.current); },

  async load(keys) {
    const data = {};
    const revs = {};
    const cache = {};
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
    try { localStorage.removeItem(this._skey(pid)); localStorage.removeItem(this._rkey(pid)); } catch (e) {}
  },

  usageBytes() {
    try {
      let n = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(this.STORAGE_KEY) === 0) n += new Blob([localStorage.getItem(k) || ""]).size;
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
      if (res.status === 401) {
        json.authRequired = true;
        if (typeof AuthManager !== "undefined" && AuthManager.onServerAuthExpired) AuthManager.onServerAuthExpired();
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, network: true, message: err && err.name === "AbortError" ? "서버 응답 시간 초과" : (err.message || "서버 연결 실패") };
    }
  },

  async load(keys) {
    const res = await this.request("/api/db/load", { keys: keys || null });
    if (!res.ok) return { ok: false, error: res.message || "DB 조회 실패", network: res.network, authRequired: res.authRequired };
    return { ok: true, data: res.data || {}, revs: res.revs || {} };
  },

  async save(changes, force) {
    const res = await this.request("/api/db/save", { changes, force: !!force }, "POST", 20000);
    if (res.httpStatus === 409 || res.conflict) return { ok: false, conflict: true, conflicts: res.conflicts || [] };
    if (!res.ok) return { ok: false, error: res.message || "DB 저장 실패", network: res.network, authRequired: res.authRequired };
    return { ok: true, data: res.data || {}, revs: res.revs || {}, blocked: res.blocked || [] };
  }
};

// -----------------------------------------------------------------------------
// 5. 동기화 관리자
// -----------------------------------------------------------------------------
var SyncManager = {
  baseline: {},     // key → Map(part → canonical string)
  baselineVal: {},  // key → Map(part → 원본 값 clone) : 권한 없는 변경 원복용
  baseRevs: {},     // key → {part: rev}
  _autoTimer: null,
  _busy: false,

  // 화면(탭)별 저장/새로고침 대상 데이터셋
  TAB_KEYS: {
    "tab-home": null,
    "tab-dashboard": ["wbsData", "deliverablesData", "reqMasterData", "vocData"],
    "tab-matrix": ["wbsData", "reqMasterData"],
    "tab-gantt": ["wbsData"],
    "tab-wbs": ["wbsData"],
    "tab-req": ["reqMasterData"],
    "tab-voc": ["vocData"],
    "tab-deliverables": ["deliverablesData"],
    "tab-weekly-report": ["weeklyReportsData"],
    "tab-meeting": ["meetingsData"],
    "tab-merge": ["wbsData", "deliverablesData", "reqMasterData", "vocData", "subsystemsMeta", "projectConfig", "projectUsers"],
    "tab-notices": ["noticesData", "communicationsData"],
    "tab-master": ["projectConfig", "subsystemsMeta", "standardDeliverablesMeta", "projectUsers"],
    "tab-config": ["projectConfig", "theme"]
  },

  backend() {
    return (typeof DbConnector !== "undefined" && DbConnector.isServerMode()) ? ServerBackend : LocalBackend;
  },
  isLocal() { return this.backend() === LocalBackend; },
  isAutoSave() { return this.isLocal(); }, // 실시간 자동저장은 로컬 저장소 모드에서만

  whoAmI() {
    const u = Permission.user();
    return `${u.name || ""}(${u.empNo || ""})`;
  },

  // ---- 기준본 관리 ----
  setBaseline(keys, revs) {
    (keys || DataRegistry.KEYS).forEach(k => {
      const cur = DataRegistry.get(k);
      Partition.ensureIds(k, cur);
      const parts = Partition.split(k, cur);
      const canon = new Map();
      const vals = new Map();
      parts.forEach((v, p) => { canon.set(p, Partition.canon(k, v)); vals.set(p, DataRegistry.clone(v)); });
      this.baseline[k] = canon;
      this.baselineVal[k] = vals;
      if (revs && revs[k]) {
        const r = {};
        Object.keys(revs[k]).forEach(p => { r[p] = typeof revs[k][p] === "object" ? revs[k][p].rev : revs[k][p]; });
        this.baseRevs[k] = r;
      } else if (!this.baseRevs[k]) {
        this.baseRevs[k] = {};
      }
    });
    this.updateIndicators();
  },

  // ---- 변경 감지 ----
  // 반환: { key: { parts:{p:val|null}, base:{p:rev}, blocked:[p...] } }
  diff(keys) {
    const out = {};
    (keys || DataRegistry.KEYS).forEach(k => {
      const base = this.baseline[k];
      if (!base) return;
      const cur = Partition.split(k, DataRegistry.get(k));
      const parts = {};
      const blocked = [];
      const baseVals = this.baselineVal[k] || new Map();
      const consider = (p, val, row) => {
        if (Permission.canWritePart(k, p, row)) parts[p] = val;
        else blocked.push(p);
      };
      cur.forEach((v, p) => {
        if (base.get(p) !== Partition.canon(k, v)) consider(p, v, Array.isArray(v) ? null : v);
      });
      base.forEach((_, p) => {
        if (!cur.has(p)) consider(p, null, baseVals.get(p));
      });
      if (Object.keys(parts).length || blocked.length) {
        const b = {};
        Object.keys(parts).forEach(p => { b[p] = (this.baseRevs[k] || {})[p] || 0; });
        out[k] = { parts: DataRegistry.clone(parts), base: b, blocked };
      }
    });
    return out;
  },

  dirtyCount(keys) {
    const d = this.diff(keys);
    let n = 0;
    Object.keys(d).forEach(k => { n += Object.keys(d[k].parts).length; });
    return n;
  },
  isDirty(keys) { return this.dirtyCount(keys) > 0; },

  // 권한 없는 파티션 변경 원복 (기준정보 원복 시 기준일/테마는 개인 화면 설정으로 유지)
  revertBlocked(diffResult) {
    let n = 0;
    Object.keys(diffResult).forEach(k => {
      const blocked = diffResult[k].blocked || [];
      if (!blocked.length) return;
      if (k === "theme") return;
      const baseVals = this.baselineVal[k] || new Map();
      if (!DataRegistry.DEFS[k].part) {
        const v = DataRegistry.clone(baseVals.get(Partition.WHOLE));
        if (k === "projectConfig") {
          // 기준일(reportDate)은 개인 조회 설정으로 유지
          if (v) { v.reportDate = projectConfig.reportDate; projectConfig = v; }
        } else {
          DataRegistry.set(k, v);
        }
        n++;
        return;
      }
      const restore = {};
      blocked.forEach(p => { restore[p] = baseVals.has(p) ? DataRegistry.clone(baseVals.get(p)) : null; });
      DataRegistry.set(k, Partition.merge(k, DataRegistry.get(k), restore));
      n += blocked.length;
    });
    return n;
  },

  blockedSummary(diffResult) {
    const list = [];
    Object.keys(diffResult).forEach(k => {
      const bl = diffResult[k].blocked || [];
      if (!bl.length || k === "theme") return;
      if (k === "projectConfig") {
        const base = (this.baselineVal[k] || new Map()).get(Partition.WHOLE) || {};
        const a = Object.assign({}, base, { reportDate: "" });
        const b = Object.assign({}, projectConfig, { reportDate: "" });
        if (JSON.stringify(a) === JSON.stringify(b)) return;
      }
      const label = DataRegistry.DEFS[k].label;
      const parts = DataRegistry.DEFS[k].part === "system" ? ` [${bl.join(", ")}]` : ` ${bl.length}건`;
      list.push(label + parts);
    });
    return list;
  },

  // ---- 저장 ----
  async save(keys, opts = {}) {
    if (typeof ProjectManager !== "undefined" && ProjectManager._switching) return { ok: false, switching: true };
    if (this._busy) { this._pendingSave = { keys, opts }; return { ok: false, busy: true }; }
    // [v1.0.10] 보관된 프로젝트는 시스템관리자 외에는 읽기 전용
    const proj = ProjectContext.info();
    if (proj && proj.status === "ARCHIVED" && Permission.user().baseRole !== "SYS_ADMIN") {
      if (opts.notify || !this._archivedNotified) showToast("📦 보관된 프로젝트는 읽기 전용입니다. 변경 내용은 저장되지 않습니다.");
      this._archivedNotified = true;
      return { ok: false, archived: true };
    }
    const scopeKeys = keys || DataRegistry.KEYS;
    const d = this.diff(scopeKeys);
    const blockedList = this.blockedSummary(d);
    const changes = {};
    Object.keys(d).forEach(k => { if (Object.keys(d[k].parts).length) changes[k] = { parts: d[k].parts, base: d[k].base }; });

    if (blockedList.length) {
      const reverted = this.revertBlocked(d);
      if (reverted > 0 || blockedList.length) {
        const own = Permission.ownSubsystem();
        showToast(`⛔ 저장 권한 없음: ${blockedList.join(" / ")} 변경은 저장되지 않고 원래 값으로 복원되었습니다. (담당: ${own})`);
      }
    }
    if (!Object.keys(changes).length) {
      if (blockedList.length) this.afterDataApplied(Object.keys(d), true);
      if (opts.notify) showToast("💾 저장할 변경 내용이 없습니다. (최신 상태)");
      if (FileAutoSyncManager.fileHandle && opts.forceFile) FileAutoSyncManager.syncNow(false);
      this.updateIndicators();
      return { ok: true, nothing: true };
    }
    return this._commit(changes, !!opts.force, opts);
  },

  async _commit(changes, force, opts) {
    this._busy = true;
    this.setStatus("저장 중...", "busy");
    let res;
    try {
      res = await this.backend().save(changes, force, this.whoAmI());
    } finally {
      this._busy = false;
    }
    if (res.conflict) {
      this.setStatus("저장 충돌", "warn");
      return this.handleConflict(changes, res.conflicts, opts);
    }
    if (!res.ok) {
      this.setStatus("저장 실패", "error");
      showToast(`❌ 저장 실패: ${res.error || "알 수 없는 오류"}${res.network ? " — 서버 연결을 확인하세요. (변경 내용은 화면에 유지됩니다)" : ""}`);
      return res;
    }
    const savedKeys = Object.keys(res.data || {});
    DataRegistry.apply(res.data, savedKeys);
    this.afterDataApplied(savedKeys, false, res.revs);
    if (res.blocked && res.blocked.length) {
      showToast(`⛔ 서버 권한 검증: ${res.blocked.join(", ")} 변경은 저장되지 않았습니다.`);
    }
    const cnt = Object.keys(changes).reduce((a, k) => a + Object.keys(changes[k].parts).length, 0);
    this.setStatus(`저장됨 (${new Date().toLocaleTimeString()})`, "ok");
    if (typeof FileAutoSyncManager !== "undefined") FileAutoSyncManager.syncNow(false);
    if (opts.notify) {
      const labels = Object.keys(changes).map(k => DataRegistry.DEFS[k].label).join(", ");
      showToast(`💾 저장 완료: ${labels} (${cnt}개 단위 변경 · ${this.isLocal() ? "로컬 저장소" : "DB 서버"})`);
    }
    if (this._pendingSave) {
      const p = this._pendingSave;
      this._pendingSave = null;
      setTimeout(() => this.save(p.keys, p.opts), 50);
    }
    return { ok: true };
  },

  // 다른 사용자가 먼저 저장한 데이터가 있을 때: 덮어쓰기 / 무시하기 / 취소
  handleConflict(changes, conflicts, opts) {
    return new Promise(resolve => {
      const lines = conflicts.map(c => {
        const def = DataRegistry.DEFS[c.key] || { label: c.key };
        const part = c.part && c.part !== Partition.WHOLE ? ` [${c.part}]` : "";
        return `• ${def.label}${part} — ${c.by || "다른 사용자"} ${c.at ? "(" + c.at + ")" : ""}`;
      });
      SyncUI.openConflictModal(lines, async choice => {
        if (choice === "overwrite") {
          resolve(await this._commit(changes, true, opts));
        } else if (choice === "ignore") {
          // 충돌 단위는 다른 사용자 저장본을 받아오고, 충돌이 없는 내 변경만 저장
          const conflictSet = new Set(conflicts.map(c => c.key + "\u0000" + c.part));
          const remaining = {};
          Object.keys(changes).forEach(k => {
            const parts = {};
            const base = {};
            Object.keys(changes[k].parts).forEach(p => {
              if (!conflictSet.has(k + "\u0000" + p)) { parts[p] = changes[k].parts[p]; base[p] = changes[k].base[p]; }
            });
            if (Object.keys(parts).length) remaining[k] = { parts, base };
          });
          const conflictKeys = [...new Set(conflicts.map(c => c.key))];
          await this.reloadParts(conflictKeys, conflictSet);
          if (Object.keys(remaining).length) resolve(await this._commit(remaining, false, opts));
          else { showToast("↩️ 내 변경을 무시하고 다른 사용자가 저장한 최신 데이터를 불러왔습니다."); resolve({ ok: true }); }
        } else {
          this.setStatus("저장 취소 (미저장 변경 유지)", "warn");
          resolve({ ok: false, cancelled: true });
        }
      });
    });
  },

  // 충돌 파티션만 서버 최신본으로 교체 (나머지 내 변경은 유지)
  async reloadParts(keys, conflictSet) {
    const res = await this.backend().load(keys);
    if (!res.ok) { showToast("❌ 최신 데이터 조회 실패: " + (res.error || "")); return; }
    keys.forEach(k => {
      const serverVal = res.data[k];
      const serverParts = Partition.split(k, serverVal);
      const replace = {};
      conflictSet.forEach(entry => {
        const [ck, p] = entry.split("\u0000");
        if (ck !== k) return;
        replace[p] = serverParts.has(p) ? serverParts.get(p) : null;
      });
      const merged = DataRegistry.DEFS[k].part ? Partition.merge(k, DataRegistry.get(k), replace) : serverVal;
      // 기준본은 서버 최신본으로, 화면값은 충돌 단위만 교체
      DataRegistry.set(k, serverVal);
      this.setBaseline([k], res.revs);
      DataRegistry.set(k, merged);
    });
    this.afterDataApplied(keys, true);
  },

  // ---- 새로고침 ----
  async refresh(keys, opts = {}) {
    const scopeKeys = keys || DataRegistry.KEYS;
    if (!opts.skipConfirm && this.isDirty(scopeKeys)) {
      const choice = await SyncUI.ask(
        "🔄 새로고침 확인",
        `저장하지 않은 변경 ${this.dirtyCount(scopeKeys)}건이 있습니다.\n새로고침하면 다른 사용자가 저장한 최신 데이터로 화면이 바뀝니다.`,
        [
          { id: "save", label: "💾 저장 후 새로고침", cls: "btn-primary" },
          { id: "discard", label: "🗑️ 변경 버리고 새로고침", cls: "btn-danger" },
          { id: "cancel", label: "취소", cls: "btn-secondary" }
        ]
      );
      if (choice === "cancel") return { ok: false, cancelled: true };
      if (choice === "save") {
        const r = await this.save(scopeKeys, { notify: false });
        if (!r.ok && !r.nothing) return r;
      }
    }
    this.setStatus("불러오는 중...", "busy");
    const res = await this.backend().load(scopeKeys);
    if (!res.ok) {
      this.setStatus("조회 실패", "error");
      if (!opts.silent) showToast("❌ 데이터 새로고침 실패: " + (res.error || ""));
      return res;
    }
    const loadedKeys = scopeKeys.filter(k => k in res.data);
    DataRegistry.apply(res.data, loadedKeys);
    this.afterDataApplied(loadedKeys, false, res.revs);
    this.setStatus(`최신 (${new Date().toLocaleTimeString()})`, "ok");
    if (!opts.silent) {
      const where = keys ? loadedKeys.map(k => DataRegistry.DEFS[k].label).join(", ") : "전체 데이터";
      showToast(`🔄 새로고침 완료: ${where} — ${this.isLocal() ? "로컬 저장소" : "DB 서버"} 최신 저장본 기준으로 진척률을 재계산했습니다.`);
    }
    return { ok: true };
  },

  // 데이터 적용 후 공통 처리: 재계산 → 기준본 갱신 → 화면 재렌더
  afterDataApplied(keys, keepBaseline, revs) {
    if (typeof normalizeAndDeduplicateSubsystems === "function" && (keys.includes("subsystemsMeta") || keys.includes("wbsData"))) {
      // 서브시스템 명칭 정규화는 기준정보 편집 시에만 수행 (조회 데이터는 그대로 사용)
    }
    if (typeof WBSEngine !== "undefined" && Array.isArray(wbsData)) {
      WBSEngine.sortAndAutoNumber(wbsData);
      if (typeof WBSEngine.markLeafNodes === "function") WBSEngine.markLeafNodes(wbsData);
      WBSEngine.calculatePlanProgress(wbsData, projectConfig.reportDate);
      WBSEngine.rollup(wbsData);
    }
    if (!keepBaseline) this.setBaseline(keys, revs);
    this._suspendAuto = true;
    try {
      if (typeof populateConfigInputsFromState === "function") populateConfigInputsFromState();
      const rEl = document.getElementById("globalReportDate");
      if (rEl && projectConfig.reportDate) rEl.value = projectConfig.reportDate;
      if (typeof MasterSyncEngine !== "undefined") MasterSyncEngine.syncAll(false, "data-applied");
      if (typeof HomeScreenManager !== "undefined") HomeScreenManager.render();
      if (typeof MeetingManager !== "undefined" && keys.includes("meetingsData")) MeetingManager.onDataReloaded();
      if (typeof WeeklyReportManager !== "undefined" && keys.includes("weeklyReportsData")) WeeklyReportManager.onDataReloaded();
    } finally {
      this._suspendAuto = false;
    }
    this.updateIndicators();
  },

  // 최초 로드 (앱 시작 / 로그인 직후)
  async initialLoad() {
    const be = this.backend();
    if (be === LocalBackend) {
      if (!LocalBackend.hasData() && !ProjectContext.isDefault()) {
        // 지워졌거나 없는 프로젝트 → 기본 프로젝트로
        ProjectContext.set(ProjectContext.DEFAULT);
      }
      if (!LocalBackend.hasData()) {
        if (typeof InitialDataLoader !== "undefined" && InitialDataLoader.apply()) {
          const revs = LocalBackend.replaceAll(DataRegistry.collect());
          this.afterDataApplied(DataRegistry.KEYS, false, revs);
          showToast("🚀 최초 실행: 초기 프로젝트 데이터(initial_data.json)를 브라우저 로컬 저장소에 설정했습니다.");
          return { ok: true, initial: true };
        }
      }
    }
    const res = await be.load(null);
    if (!res.ok) {
      showToast("⚠️ 저장소 조회 실패: " + (res.error || "") + " — 화면의 현재 데이터로 동작합니다.");
      this.setBaseline(DataRegistry.KEYS, {});
      return res;
    }
    DataRegistry.apply(res.data);
    this.afterDataApplied(DataRegistry.KEYS, false, res.revs);
    return { ok: true };
  },

  // 데이터 일괄 교체(샘플 복원/초기화/백업 복원) 후 저장
  async replaceAllAndSave(notifyText) {
    if (this.isLocal()) {
      const revs = LocalBackend.replaceAll(DataRegistry.collect());
      this.afterDataApplied(DataRegistry.KEYS, false, revs);
      if (notifyText) showToast(notifyText);
      return { ok: true };
    }
    // 서버 모드: 변경분 저장(덮어쓰기) — 관리자 권한 필요
    this.afterDataApplied(DataRegistry.KEYS, true);
    const r = await this.save(null, { notify: false, force: true });
    if (r.ok && notifyText) showToast(notifyText);
    return r;
  },

  // ---- persistChanges() 진입점 ----
  onDataChanged(immediate) {
    this.updateIndicators();
    if (!this.isAutoSave() || this._suspendAuto) return;
    if (this._autoTimer) clearTimeout(this._autoTimer);
    const run = () => { this._autoTimer = null; this.save(null, { notify: false }); };
    if (immediate) run();
    else this._autoTimer = setTimeout(run, 400);
  },

  flushAutoSave() {
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
      return this.save(null, { notify: false });
    }
    return Promise.resolve({ ok: true });
  },

  // ---- 표시 ----
  setStatus(text, kind) {
    const el = document.getElementById("storageStatusText");
    const box = document.getElementById("storageStatusBox");
    if (el) el.innerText = text;
    if (box) {
      box.setAttribute("data-kind", kind || "");
      if (kind === "ok") { box.classList.add("saved"); setTimeout(() => box.classList.remove("saved"), 1500); }
    }
  },

  updateIndicators() {
    if (this._indTimer) return;
    this._indTimer = setTimeout(() => {
      this._indTimer = null;
      SyncUI.refreshIndicators();
    }, 120);
  }
};

// -----------------------------------------------------------------------------
// 6. 화면 요소: 공통 툴바(저장/새로고침), 확인 모달, 충돌 모달
// -----------------------------------------------------------------------------
var SyncUI = {
  init() {
    this.injectTabToolbars();
    this.injectHeaderButtons();
    this.refreshIndicators();
    window.addEventListener("beforeunload", e => {
      if (!SyncManager.isAutoSave() && SyncManager.isDirty()) {
        e.preventDefault();
        e.returnValue = "저장하지 않은 변경 내용이 있습니다.";
        return e.returnValue;
      }
    });
  },

  injectHeaderButtons() {
    const zone = document.querySelector(".header-zone-action");
    if (!zone || document.getElementById("btnHeaderSaveAll")) return;
    const old = document.getElementById("btnHeaderManualSave");
    const wrap = document.createElement("span");
    wrap.style.display = "inline-flex";
    wrap.style.gap = "6px";
    wrap.innerHTML = `
      <button id="btnHeaderSaveAll" class="btn btn-primary btn-sm" data-click="SyncManager.save" data-click-args='[null, {"notify": true, "forceFile": true}]' title="모든 화면의 변경 내용을 한 번에 저장합니다.">💾 전체 저장</button>
      <button id="btnHeaderRefreshAll" class="btn btn-secondary btn-sm" data-click="SyncManager.refresh" data-click-args='[null]' title="저장소(DB 서버/로컬)에서 최신 데이터를 다시 불러와 모든 화면을 새로고침합니다.">🔄 전체 새로고침</button>`;
    if (old) old.replaceWith(wrap);
    else zone.prepend(wrap);
  },

  injectTabToolbars() {
    Object.keys(SyncManager.TAB_KEYS).forEach(tabId => {
      const pane = document.getElementById(tabId);
      if (!pane || pane.querySelector(":scope > .sync-toolbar")) return;
      const keys = SyncManager.TAB_KEYS[tabId];
      const bar = document.createElement("div");
      bar.className = "sync-toolbar";
      bar.setAttribute("data-tab", tabId);
      bar.innerHTML = `
        <span class="sync-toolbar-scope">🗂️ ${keys ? keys.map(k => DataRegistry.DEFS[k].label).join(" · ") : "전체 데이터"}</span>
        <span class="sync-toolbar-state" data-keys="${keys ? keys.join(",") : ""}">-</span>
        <button class="btn btn-primary btn-xs" data-click="SyncManager.save" data-click-args="${UiEvents.args(keys || null, { notify: true })}" title="이 화면의 변경 내용을 저장합니다.">💾 저장</button>
        <button class="btn btn-secondary btn-xs" data-click="SyncManager.refresh" data-click-args="${UiEvents.args(keys || null)}" title="이 화면의 데이터를 저장소의 최신 데이터로 다시 불러옵니다.">🔄 새로고침</button>`;
      pane.insertBefore(bar, pane.firstChild);
    });
  },

  refreshIndicators() {
    const local = SyncManager.isLocal();
    document.querySelectorAll(".sync-toolbar-state").forEach(el => {
      const ks = el.getAttribute("data-keys");
      const keys = ks ? ks.split(",") : null;
      const n = SyncManager.dirtyCount(keys);
      el.className = "sync-toolbar-state " + (n > 0 ? "dirty" : "clean");
      el.textContent = n > 0
        ? `● 미저장 변경 ${n}건${local ? " (자동저장 대기)" : ""}`
        : (local ? "✓ 실시간 자동저장" : "✓ 저장됨");
    });
    const all = SyncManager.dirtyCount();
    const btn = document.getElementById("btnHeaderSaveAll");
    if (btn) {
      btn.innerText = all > 0 ? `💾 전체 저장 (${all})` : "💾 전체 저장";
      btn.className = all > 0 ? "btn btn-warning btn-sm manual-save-dirty" : "btn btn-primary btn-sm";
    }
    const mode = document.getElementById("storageStatusText");
    if (mode && all > 0 && !SyncManager._busy) mode.innerText = local ? "자동저장 대기" : `미저장 ${all}건`;
  },

  // 범용 선택 모달 → Promise<choiceId>
  ask(title, message, buttons) {
    return new Promise(resolve => {
      let modal = document.getElementById("syncAskModal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "syncAskModal";
        modal.className = "modal-overlay";
        modal.style.cssText = "display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:10050; align-items:center; justify-content:center;";
        modal.innerHTML = `
          <div class="modal-content" style="max-width:520px; width:92%; background:var(--bg-card,#fff); border-radius:10px; padding:20px; box-shadow:0 12px 32px rgba(0,0,0,0.25);">
            <h3 id="syncAskTitle" style="margin-bottom:10px; font-size:16px;"></h3>
            <div id="syncAskMsg" style="white-space:pre-line; font-size:13px; line-height:1.6; margin-bottom:16px; color:var(--text-main);"></div>
            <div id="syncAskBtns" style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;"></div>
          </div>`;
        document.body.appendChild(modal);
      }
      const tr = v => (typeof I18N !== "undefined" ? I18N.t(v, true) : v);
      modal.querySelector("#syncAskTitle").textContent = tr(title);
      modal.querySelector("#syncAskMsg").textContent = message.split("\n").map(line => tr(line)).join("\n");
      const box = modal.querySelector("#syncAskBtns");
      box.innerHTML = "";
      buttons.forEach(b => {
        const el = document.createElement("button");
        el.className = "btn btn-sm " + (b.cls || "btn-secondary");
        el.textContent = tr(b.label);
        el.onclick = () => { modal.style.display = "none"; resolve(b.id); };
        box.appendChild(el);
      });
      modal.style.display = "flex";
      if (typeof I18N !== "undefined") I18N.translateTree(modal);
    });
  },

  openConflictModal(lines, cb) {
    this.ask(
      "⚠️ 저장 충돌 — 다른 사용자가 이미 저장한 데이터가 있습니다",
      "내가 화면을 불러온 이후 아래 데이터를 다른 사용자가 먼저 저장했습니다.\n\n" + lines.join("\n") +
      "\n\n• 덮어쓰기: 내 데이터로 저장합니다. (다른 사용자의 해당 변경은 사라집니다)\n• 무시하기: 충돌된 항목은 다른 사용자의 저장본을 불러오고, 충돌이 없는 내 변경만 저장합니다.",
      [
        { id: "overwrite", label: "⚠️ 덮어쓰기", cls: "btn-danger" },
        { id: "ignore", label: "↩️ 무시하기 (최신본 적용)", cls: "btn-primary" },
        { id: "cancel", label: "취소", cls: "btn-secondary" }
      ]
    ).then(cb);
  }
};

// -----------------------------------------------------------------------------
// 7. 로컬 JSON 파일 실시간 연결 (File System Access API)
//    저장 시 채팅을 제외한 모든 데이터(공지·소통·회의·주간보고 포함)를 파일에 기록
// -----------------------------------------------------------------------------
var FileAutoSyncManager = {
  fileHandle: null,
  fileName: "",

  async openExistingFileHandle() {
    if (!("showOpenFilePicker" in window)) {
      showToast("현재 브라우저는 File System Access API를 지원하지 않습니다. (Chrome/Edge PC 환경에서 지원)");
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "WBS 프로젝트 JSON 파일", accept: { "application/json": [".json"] } }],
        multiple: false
      });
      this.fileHandle = handle;
      this.fileName = handle.name;
      this.updateStatus(true);
      await this.reloadFromFileHandle(true);
    } catch (err) {
      if (err.name !== "AbortError") console.error("기존 JSON 열기 실패:", err);
    }
  },

  async reloadFromFileHandle(isInitialOpen = false) {
    if (!this.fileHandle) {
      showToast("먼저 [📂 기존 JSON 열기/연결] 또는 [💾 새 JSON 연결]로 로컬 파일을 지정해주세요.");
      return;
    }
    try {
      const file = await this.fileHandle.getFile();
      const data = JSON.parse(await file.text());
      DataRegistry.apply(data);
      if (typeof renderProjectTitles === "function") renderProjectTitles();
      // 파일에서 읽은 데이터는 "변경분"으로 취급 → 저장 시 저장소에 반영
      SyncManager.afterDataApplied(DataRegistry.KEYS, true);
      if (SyncManager.isAutoSave()) SyncManager.onDataChanged(true);
      if (typeof JsonCollabManager !== "undefined") JsonCollabManager.closeCollabModal();
      showToast(isInitialOpen
        ? `로컬 파일 [${this.fileName}] 을 열어 데이터를 로드하고 실시간 동기화를 연결했습니다.`
        : `로컬 파일 [${this.fileName}] 에서 최신 변경 데이터를 다시 읽어왔습니다.`);
    } catch (err) {
      showToast("로컬 JSON 파일 읽기 오류: " + err.message);
    }
  },

  async setupFileHandle() {
    if (!("showSaveFilePicker" in window)) {
      showToast("현재 브라우저는 File System Access API를 지원하지 않습니다. (Chrome/Edge PC 환경에서 지원)");
      return;
    }
    try {
      this.fileHandle = await window.showSaveFilePicker({
        suggestedName: `WBS_Realtime_Sync_${projectConfig.reportDate}.json`,
        types: [{ description: "WBS 프로젝트 백업 JSON 파일", accept: { "application/json": [".json"] } }]
      });
      this.fileName = this.fileHandle.name;
      this.updateStatus(true);
      await this.syncNow(false);
      showToast(`로컬 파일 [${this.fileName}] 에 실시간 자동 동기화 연결이 완료되었습니다.`);
    } catch (err) {
      if (err.name !== "AbortError") console.error("파일 핸들 생성 실패:", err);
    }
  },

  async syncNow(showAlert = false) {
    if (!this.fileHandle) return;
    try {
      const payload = Object.assign({ exportedAt: new Date().toISOString(), schemaVersion: `AX_PMYS_${APP_VERSION.version}` }, DataRegistry.collect());
      const writable = await this.fileHandle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      const badge = document.getElementById("fileSyncBadge");
      if (badge) {
        badge.innerText = `파일동기화 (${new Date().toLocaleTimeString()})`;
        badge.className = "status-badge-chip chip-completed";
      }
      if (showAlert) showToast(`로컬 파일 [${this.fileName}] 에 최신 데이터(공지·소통·회의·주간보고 포함)가 저장되었습니다.`);
    } catch (err) {
      const badge = document.getElementById("fileSyncBadge");
      if (badge) {
        badge.innerText = "동기화 권한필요";
        badge.className = "status-badge-chip chip-delayed";
      }
    }
  },

  updateStatus(connected) {
    const badge = document.getElementById("fileSyncBadge");
    const detail = document.getElementById("fileSyncDetailStatus");
    const btn = document.getElementById("btnFileHandleSync");
    if (connected && this.fileName) {
      if (badge) {
        badge.style.display = "inline-flex";
        badge.innerText = `동기화: ${this.fileName}`;
        badge.className = "status-badge-chip chip-completed";
      }
      if (detail) detail.innerHTML = `<span style="color:var(--success); font-weight:bold;">🟢 연결됨 (${escapeHtml(this.fileName)})</span> - 저장 시 자동 덮어쓰기 활성화`;
      if (btn) btn.innerText = `📁 [연결됨] ${this.fileName}`;
    } else {
      if (badge) badge.style.display = "none";
      if (detail) detail.innerHTML = "미연결 (버튼을 눌러 백업할 JSON 파일을 지정하세요)";
      if (btn) btn.innerText = "📁 동기화 파일 연결";
    }
  },

  disconnect() {
    this.fileHandle = null;
    this.fileName = "";
    this.updateStatus(false);
    showToast("로컬 파일 실시간 자동 동기화 연결이 해제되었습니다.");
  }
};

window.DataRegistry = DataRegistry;
window.ProjectContext = ProjectContext;
window.Partition = Partition;
window.Permission = Permission;
window.LocalBackend = LocalBackend;
window.ServerBackend = ServerBackend;
window.SyncManager = SyncManager;
window.SyncUI = SyncUI;
window.FileAutoSyncManager = FileAutoSyncManager;
