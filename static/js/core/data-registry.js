// =============================================================================
// 자료 묶음 레지스트리 · 파티션 · 쓰기 권한 (DataRegistry · Partition · Permission) — core/data-store.js 에서 나눔. data-backends.js · data-store.js 보다 먼저 불러옴
// =============================================================================


// -----------------------------------------------------------------------------
// 1. 데이터셋 레지스트리
// -----------------------------------------------------------------------------
var DataRegistry = {
  // part: "system" = 서브시스템 단위 / "id"·"empNo" = 행 단위 / null = 데이터셋 전체
  // scope: 저장 권한 그룹
  DEFS: {
    projectConfig:            { part: null,     scope: "master",    label: "프로젝트 설정" },
    subsystemsMeta:           { part: null,     scope: "master",    label: "도메인/서브시스템" },
    standardDeliverablesMeta: { part: null,     scope: "master",    label: "표준 산출물" },
    projectUsers:             { part: "empNo",  scope: "users",     label: "멤버" },
    wbsData:                  { part: "system", scope: "subsystem", label: "WBS", volatile: ["pProg", "status"] },
    deliverablesData:         { part: "system", scope: "subsystem", label: "산출물" },
    reqMasterData:            { part: "system", scope: "subsystem", label: "요구사항" },
    vocData:                  { part: "system", scope: "subsystem", label: "VOC" },
    noticesData:              { part: "id",     scope: "shared",    label: "공지" },
    communicationsData:       { part: "id",     scope: "shared",    label: "게시판" },
    meetingsData:             { part: "id",     scope: "shared",    label: "회의" },
    weeklyReportsData:        { part: "id",     scope: "weekly",    label: "주간보고" },
    // 작업자별 할 일 (본인만 보고 고침 — DB 서버는 본인 항목만 내려줌)
    todosData:                { part: "id",     scope: "personal",  label: "내 할 일" },
    theme:                    { part: null,     scope: "pref",      label: "화면 테마" },
    // 공정 유형 라이브러리 (SDLC · 개선과제) — 시스템 설정에서 관리자가 관리, 모든 프로젝트 공통
    processTypes:             { part: null,     scope: "system",    label: "SDLC 유형" }
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
      case "processTypes": return typeof ProcessLib !== "undefined" ? ProcessLib.raw : null;
      case "theme":  // 시스템 기본 테마 (프로젝트 테마는 projectConfig.uiTheme)
        if (typeof ThemeScope !== "undefined") {
          if (ThemeScope.global === undefined) ThemeScope.global = typeof defaultTheme === "function" ? defaultTheme() : "urban-slate";
          return ThemeScope.global;
        }
        return document.body.getAttribute("data-theme") || (typeof defaultTheme === "function" ? defaultTheme() : "urban-slate");
    }
    return undefined;
  },

  set(key, val) {
    if (val === undefined || val === null) return;
    switch (key) {
      case "projectConfig":
        if (typeof val === "object") {
          projectConfig = Object.assign({}, projectConfig, val);
          if (!val.uiTheme) delete projectConfig.uiTheme;  // 다른 프로젝트의 테마가 남지 않게
          if (typeof ThemeScope !== "undefined") ThemeScope.apply();
        }
        break;
      case "subsystemsMeta": if (Array.isArray(val)) subsystemsMeta = val; break;
      case "standardDeliverablesMeta": if (Array.isArray(val)) standardDeliverablesMeta = val; break;
      case "projectUsers":
        // 이 프로젝트의 작업자(관리자 + 참여자)만 화면에 둠 — 전체 목록은 ProjectContext.allUsers
        if (Array.isArray(val) && val.length > 0) {
          ProjectContext.ensureLegacyMembership(val);
          ProjectContext.allUsers = val;
          projectUsers = ProjectContext.visibleUsers(val, ProjectContext.current);
        }
        break;
      case "wbsData": if (Array.isArray(val)) wbsData = val; break;
      case "deliverablesData": if (Array.isArray(val)) deliverablesData = val; break;
      case "reqMasterData": if (Array.isArray(val)) reqMasterData = val; break;
      case "vocData": if (Array.isArray(val)) vocData = val; break;
      case "noticesData": if (Array.isArray(val)) noticesData = val; break;
      case "communicationsData": if (Array.isArray(val)) communicationsData = val; break;
      case "meetingsData": if (Array.isArray(val)) meetingsData = val; break;
      case "weeklyReportsData": if (Array.isArray(val)) weeklyReportsData = val; break;
      case "todosData": if (Array.isArray(val)) todosData = val; break;
      case "processTypes": if (typeof ProcessLib !== "undefined" && typeof val === "object") ProcessLib.raw = val; break;
      case "theme":
        if (typeof val === "string" && val) {
          if (typeof normalizeTheme === "function") val = normalizeTheme(val);
          if (typeof ThemeScope !== "undefined") { ThemeScope.global = val; ThemeScope.apply(); break; }
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
    this.normalizeTerms(data);
    (keys || this.KEYS).forEach(k => {
      if (k in data) this.set(k, data[k]);
    });
    if (Array.isArray(data.communicationsData)) Partition.ensureIds("communicationsData", communicationsData);
    return true;
  },

  clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); },

  // 예전 값 이름 바꾸기는 Migrate(core/migrate.js) 한 곳에서
  normalizeTerms(data) { return Migrate.data(data); }
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
// 담당 서브시스템 값: "ALL"(전체) 또는 "A" · "A,B"(여러 개, 쉼표) — 멤버 정보의 subsystem 한 칸에 저장 (서버 permission.py 와 같은 규칙)
// -----------------------------------------------------------------------------
var SubsysList = {
  parse(v) {
    const list = String(v == null ? "" : v).split(",").map(x => x.trim()).filter(Boolean);
    return !list.length || list.includes("ALL") ? ["ALL"] : [...new Set(list)];
  },
  join(list) { const l = this.parse((list || []).join(",")); return l.join(","); },
  isAll(v) { return this.parse(v)[0] === "ALL"; },
  has(v, sys) { const l = this.parse(v); return l[0] === "ALL" || l.includes(String(sys == null ? "" : sys).trim()); },
  // 화면 표시: "A, B" / 전체
  label(v) { return this.isAll(v) ? "ALL" : this.parse(v).join(", "); }
};
window.SubsysList = SubsysList;

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
  // 전체 서브시스템 데이터 수정 가능 여부 — 관리자 · PM, 총괄리더는 담당이 ALL 일 때만 (리더 · 작업자는 담당 서브시스템)
  canEditAllSubsystems() { const r = this.role(); return r === "SYS_ADMIN" || r === "PM" || (r === "LEAD" && SubsysList.isAll(this.ownSubsystem())); },
  // 담당 서브시스템 원래 값 ("ALL" · "A" · "A,B") — 목록은 ownSubsystems(), 화면 표시는 SubsysList.label
  ownSubsystem() { return String(this.user().subsystem || "ALL"); },
  ownSubsystems() { return SubsysList.parse(this.ownSubsystem()); },
  // 담당 중 첫 서브시스템 (기본 선택값) — 전체 담당이면 "ALL"
  firstOwnSubsystem() { return this.ownSubsystems()[0]; },

  canWriteSubsystem(sys) {
    if (this.canEditAllSubsystems()) return true;
    return SubsysList.has(this.ownSubsystem(), sys);
  },

  // row: 현재 행(또는 삭제 시 기준본 행)
  canWritePart(key, part, row) {
    const def = DataRegistry.DEFS[key];
    if (!def) return false;
    const role = this.role();
    switch (def.scope) {
      case "master": return role === "SYS_ADMIN" || role === "PM";
      case "pref": return role === "SYS_ADMIN" || role === "PM";
      case "system": return role === "SYS_ADMIN";
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
