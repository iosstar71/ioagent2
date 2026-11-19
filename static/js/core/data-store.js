// =============================================================================
// 데이터 저장/동기화 계층 (Data Store & Sync) — 세 파일로 나뉨
//  core/data-registry.js (DataRegistry · Partition · Permission) → core/data-backends.js (ProjectContext · LocalBackend · ServerBackend) → 이 파일 (SyncManager · SyncUI)
// -----------------------------------------------------------------------------
//  - DataRegistry : 프로젝트 데이터셋(13종)의 단일 접근점 (수집/적용/백업/JSON 파일 저장 공통)
//  - Partition    : 데이터셋을 "파티션" 단위로 분할 (서브시스템 단위 / 행 ID 단위 / 전체)
//                   → 충돌 감지와 담당 서브시스템 저장 권한을 같은 단위로 처리
//  - Permission   : 역할(SYS_ADMIN / PM / LEAD / MEMBER)별 파티션 쓰기 권한
//  - LocalBackend : 브라우저 LocalStorage 저장소 (실시간 자동저장 지원)
//  - ServerBackend: 다중 작업자 DB 서버 (토큰 인증, 저장 버튼 방식)
//  - SyncManager  : 변경 감지(기준본 대비), 저장/새로고침, 충돌 경고(덮어쓰기/무시하기), 화면별 툴바
//
//  ※ 이 파일은 app.js 다음, access-control.js 이전에 로드합니다.
// =============================================================================

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
    "tab-mywork": null,
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
    "tab-config": ["projectConfig", "theme", "processTypes"]
  },

  backend() {
    return (typeof DbConnector !== "undefined" && DbConnector.isServerMode()) ? ServerBackend : LocalBackend;
  },
  isLocal() { return this.backend() === LocalBackend; },
  // 자동저장은 쓰지 않음: 두 판 모두 [저장]을 눌러야 기록 → [새로고침]으로 마지막 저장 상태로 되돌릴 수 있음
  isAutoSave() { return false; },

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
        // 기준일 · 화면 기본값(내보내기 테마 · 화면 배치 · 밀도)만 다르면 알리지 않음
        const ui = { reportDate: "", exportSettings: null, layoutType: null, uiDensity: null };
        const a = Object.assign({}, base, ui);
        const b = Object.assign({}, projectConfig, ui);
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
    // 보관된 프로젝트는 관리자 외에는 읽기 전용
    const proj = ProjectContext.info();
    if (proj && proj.status === "ARCHIVED" && Permission.user().baseRole !== "SYS_ADMIN") {
      if (opts.notify || !this._archivedNotified) showToast("📦 사용 중지(보관)된 프로젝트는 읽기 전용입니다. 변경 내용은 저장되지 않습니다.");
      this._archivedNotified = true;
      return { ok: false, archived: true };
    }
    // 작업자를 고르기 전에는 저장하지 않음 (화면 기본값 정리 등) — 작업자를 고른 뒤 저장
    if (typeof AuthManager !== "undefined" && !AuthManager.currentUser) return { ok: false, notPicked: true };
    const scopeKeys = keys || DataRegistry.KEYS;
    if (opts.notify) await this._saveDrafts(scopeKeys);   // [저장] 단추: 작성 중인 주간보고 · 회의록도 함께
    const d = this.diff(scopeKeys);
    const blockedList = this.blockedSummary(d);
    const changes = {};
    Object.keys(d).forEach(k => { if (Object.keys(d[k].parts).length) changes[k] = { parts: d[k].parts, base: d[k].base }; });
    // [Workgroup] onlyParts: {key: Set(파티션)} — 체크인할 서브시스템만 저장
    if (opts.onlyParts) Object.keys(changes).forEach(k => {
      const only = opts.onlyParts[k];
      if (!only) return;
      Object.keys(changes[k].parts).forEach(p => { if (!only.has(p)) { delete changes[k].parts[p]; delete changes[k].base[p]; } });
      if (!Object.keys(changes[k].parts).length) delete changes[k];
    });

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
      res = await this.backend().save(changes, force, this.whoAmI(), opts);
    } finally {
      this._busy = false;
    }
    if (res.locked && typeof LockManager === "object") {
      this.setStatus("저장 안 됨 (체크아웃)", "warn");
      return LockManager.onBlocked(changes, res.locked, opts);
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
    if (typeof LockManager === "object" && LockManager.active()) LockManager.afterSave();
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

  // 다른 작업자가 먼저 저장한 데이터가 있을 때: 덮어쓰기 / 무시하기 / 취소
  handleConflict(changes, conflicts, opts) {
    return new Promise(resolve => {
      const lines = conflicts.map(c => {
        const def = DataRegistry.DEFS[c.key] || { label: c.key };
        const part = c.part && c.part !== Partition.WHOLE ? ` [${c.part}]` : "";
        return `• ${def.label}${part} — ${c.by || "다른 멤버"} ${c.at ? "(" + c.at + ")" : ""}`;
      });
      SyncUI.openConflictModal(lines, async choice => {
        if (choice === "overwrite") {
          resolve(await this._commit(changes, true, opts));
        } else if (choice === "ignore") {
          // 충돌 단위는 다른 작업자 저장본을 받아오고, 충돌이 없는 내 변경만 저장
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
          else { showToast("↩️ 내 변경을 무시하고 다른 멤버가 저장한 최신 데이터를 불러왔습니다."); resolve({ ok: true }); }
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
  // 화면 설정(기준일 · 테마)과 처음 열 때의 기본값 정리는 묻지 않고 바로 기록 (Standalone — 작업 자료는 [저장]을 눌러야 기록)
  async saveSettingsQuiet() {
    if (!this.isLocal() || this._busy || this._suspendAuto) return;
    if (typeof AuthManager !== "undefined" && !AuthManager.currentUser) return;
    if (this.isDirty(["projectConfig"])) await this.save(["projectConfig"], { notify: false });
  },
  // [저장]을 누르면 작성 중인 주간보고 · 회의록 초안도 저장 (그대로 두면 화면을 옮길 때마다 "미저장"을 물음)
  async _saveDrafts(scopeKeys) {
    try {
      if (scopeKeys.indexOf("weeklyReportsData") !== -1 && typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.currentWeekReport && WeeklyReportManager.isDirty()) await WeeklyReportManager.completeReport(false);
      if (scopeKeys.indexOf("meetingsData") !== -1 && typeof MeetingManager !== "undefined" && MeetingManager.isDraftDirty && MeetingManager.isDraftDirty()) await MeetingManager.completeMinutes(false);
    } catch (e) { console.warn("[SyncManager] draft save failed", e); }
  },
  // 새로고침 때 화면에서 고른 조건(필터 · 검색어)은 그대로 둠: 다시 그린 뒤 같은 값으로 되돌림
  _captureUiState() {
    const out = [];
    document.querySelectorAll(".tab-pane select[id], .tab-pane input[id]").forEach(el => {
      if (!/filter|search|select|view|sort|level|range|month|week/i.test(el.id) || /^cfg|^pm|^reg|^modal|^new/i.test(el.id)) return;
      if (el.type === "file" || el.type === "password") return;
      out.push([el.id, el.type === "checkbox" ? el.checked : el.value]);
    });
    return out;
  },
  _restoreUiState(saved) {
    const changed = [];
    saved.forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") { if (el.checked !== v) { el.checked = v; changed.push(el); } return; }
      if (el.value === v) return;
      if (el.tagName === "SELECT" && !Array.prototype.some.call(el.options, o => o.value === v)) return;
      el.value = v; changed.push(el);
    });
    this._suspendAuto = true;
    try { changed.forEach(el => el.dispatchEvent(new Event(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "keyup", { bubbles: true }))); }
    finally { this._suspendAuto = false; }
  },

  async refresh(keys, opts = {}) {
    const scopeKeys = keys || DataRegistry.KEYS;
    if (!opts.skipConfirm && this.isDirty(scopeKeys)) {
      const choice = await SyncUI.ask(
        "🔄 새로고침 확인",
        `저장하지 않은 변경 ${this.dirtyCount(scopeKeys)}건이 있습니다.\n새로고침하면 마지막으로 저장된 자료로 화면이 바뀝니다 (저장하지 않은 변경은 사라짐).`,
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
    const uiState = this._captureUiState();
    DataRegistry.apply(res.data, loadedKeys);
    this.afterDataApplied(loadedKeys, false, res.revs);
    this._restoreUiState(uiState);
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

  // 최초 로드 (앱 시작 / 작업자 선택 직후)
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
          showToast("🚀 처음 실행: 이 브라우저에 빈 프로젝트를 준비했습니다. (관리자: admin)");
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
    const r = await this.save(null, { notify: false, force: true, lockBypass: true });  // [Workgroup] 복원 · 초기화 (서버가 관리자 · PM 만 허용)
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
      box.title = text;
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
    const local = SyncManager.isAutoSave();
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
    // 머리말 저장 상태는 점 하나 (변경 대기 = 주의 색), 글자는 마우스를 올리면 보임
    const sbox = document.getElementById("storageStatusBox");
    if (sbox) { sbox.toggleAttribute("data-dirty", all > 0); if (mode) sbox.title = mode.innerText; }
    // [Workgroup] 메뉴 배지는 자료가 바뀔 때만 갱신 (예전 2초 주기 갱신 없앰)
    if (typeof NeoBadges !== "undefined" && typeof UiMode !== "undefined" && UiMode.isNeo() && document.getElementById("gNav")) NeoBadges.refresh();
    if (typeof LockManager === "object") LockManager.renderBadge();   // Workgroup 체크아웃 (브라우저에도 LockManager 함수가 있어 object 로 확인)
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
          <div class="modal-content u-r-10 u-p-20" style="max-width:520px; width:92%; background:var(--bg-card,#fff); box-shadow:0 12px 32px rgba(0,0,0,0.25);">
            <h3 class="u-mb-10" id="syncAskTitle" style="font-size:var(--fs-lg, 16px);"></h3>
            <div class="u-fs-base u-mb-16 u-c-main" id="syncAskMsg" style="white-space:pre-line; line-height:1.6;"></div>
            <div class="u-gap-8 u-jc-end u-wrap" id="syncAskBtns" style="display:flex;"></div>
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
      "⚠️ 저장 충돌 — 다른 멤버가 이미 저장한 데이터가 있습니다",
      "내가 화면을 불러온 이후 아래 데이터를 다른 멤버가 먼저 저장했습니다.\n\n" + lines.join("\n") +
      "\n\n• 덮어쓰기: 내 데이터로 저장합니다. (다른 멤버의 해당 변경은 사라집니다)\n• 무시하기: 충돌된 항목은 다른 멤버의 저장본을 불러오고, 충돌이 없는 내 변경만 저장합니다.",
      [
        { id: "overwrite", label: "⚠️ 덮어쓰기", cls: "btn-danger" },
        { id: "ignore", label: "↩️ 무시하기 (최신본 적용)", cls: "btn-primary" },
        { id: "cancel", label: "취소", cls: "btn-secondary" }
      ]
    ).then(cb);
  }
};


