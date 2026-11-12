// =============================================================================
// [IOSTAR-PM Workgroup 0.1] 서브시스템 체크아웃 · 체크인 (LockManager) — DB 서버 방식
// -----------------------------------------------------------------------------
//  체크아웃 = 편집 시작(잠금) · 체크인 = 저장하고 잠금 해제 · 체크아웃 취소 = 변경 버리고 해제 · 강제 해제 = PM · 관리자
//  범위: 서브시스템의 WBS · 요구사항 · 산출물 · VOC (주간보고 · 회의록 · 공지 · 소통은 지금처럼 문서별 동시수정 검사)
//  주기 통신 없음: 잠금 현황은 불러오기 · 저장 · 체크아웃/체크인 · [🔄 상태 확인] 때 서버가 함께 알려 줌
//  저장이 막히면(423): 내 변경 백업 받기 / 보류(브라우저에 보관, 잠기지 않은 변경만 저장) / 버리고 최신 받기
//  다시 체크아웃할 때 그 사이 다른 사람이 바꿨으면 3자 비교(받았던 때 · 다른 사람 결과 · 내 것)로 합침
//  서버 규칙: server/locks.py · 설정: conf/app.ini [lock] · Enterprise 확장: docs/ENTERPRISE_ROADMAP.md
// =============================================================================
var LockManager = {
  KEYS: ["wbsData", "reqMasterData", "deliverablesData", "vocData"],
  KINDS: { wbs: "wbsSubsystemFilter", req: "reqSubsystemFilter", voc: "vocSubsystemFilter", deliverables: "delivSubsystemFilter" },
  TAB_KIND: { "tab-wbs": "wbs", "tab-req": "req", "tab-voc": "voc", "tab-deliverables": "deliverables" },
  ACTIONS: { CHECKOUT: "체크아웃", CHECKIN: "체크인", CANCEL: "체크아웃 취소", FORCE: "강제 해제", EXPIRE: "만료 해제", RESET: "초기화 · 복원으로 해제" },
  locks: [],
  log: [],
  serverTime: "",

  active() { return typeof Features !== "undefined" && Features.lockMode() !== "off" && typeof SyncManager !== "undefined" && !SyncManager.isLocal(); },
  required() { return this.active() && Features.lockMode() === "required"; },
  me() { return String((Permission.user() || {}).empNo || "").toLowerCase(); },
  scope(sys) { return "SUB:" + sys; },
  sysOf(scope) { return String(scope || "").replace(/^SUB:/, ""); },
  holder(sys) { return this.locks.find(l => l.scope === this.scope(sys)) || null; },
  mine(sys) { const h = this.holder(sys); return !!h && String(h.empNo).toLowerCase() === this.me(); },
  byOther(sys) { const h = this.holder(sys); return !!h && String(h.empNo).toLowerCase() !== this.me(); },
  mySystems() { return this.locks.filter(l => l.scope.startsWith("SUB:") && String(l.empNo).toLowerCase() === this.me()).map(l => this.sysOf(l.scope)); },
  isManager() { const r = Permission.role(); return r === "SYS_ADMIN" || r === "PM"; },
  hm(t) { return String(t || "").slice(11, 16); },
  who(h) { return h ? `${h.name || h.empNo}` : ""; },

  // 서버 응답의 잠금 현황 반영 (불러오기 · 저장 · 잠금 API 공통)
  update(lk) {
    if (!lk || !Array.isArray(lk.locks)) return;
    this.locks = lk.locks;
    if (Array.isArray(lk.log)) this.log = lk.log;
    if (lk.serverTime) this.serverTime = lk.serverTime;
    this.render();
  },
  async refresh(silent) {
    if (!this.active()) return;
    const res = await ServerBackend.request("/api/locks/list", {});
    if (res.ok) this.update(res);
    else if (!silent) showToast("⚠️ 체크아웃 현황을 불러오지 못했습니다: " + (res.message || ""));
    if (!silent && res.ok) showToast("🔄 체크아웃 현황을 새로 받았습니다.");
  },

  // ---- 체크아웃 ----
  async checkout(systems, opts = {}) {
    if (!this.active()) return showToast("ℹ️ 체크아웃은 DB 서버 방식에서만 씁니다.");
    systems = [].concat(systems).filter(Boolean);
    const res = await ServerBackend.request("/api/locks/checkout", { scopes: systems.map(s => this.scope(s)), memo: opts.memo || "" });
    this.update(res);
    if (!res.got && !res.ok) { showToast("❌ 체크아웃 실패: " + (res.message || "")); return false; }
    if ((res.taken || []).length) showToast(`⛔ ${res.taken.map(t => `${this.sysOf(t.scope)} — ${this.who(t)} 편집 중 (${this.hm(t.since)}~)`).join(", ")}`);
    if ((res.denied || []).length) showToast(`🚫 ${res.denied.map(s => this.sysOf(s)).join(", ")} 은(는) 담당이 아니어서 체크아웃할 수 없습니다.`);
    const got = (res.got || []).map(s => this.sysOf(s));
    if (!got.length) return false;
    if (opts.reload !== false) await this.syncParts(got);
    if (opts.snapshot !== false && typeof BackupHistoryManager !== "undefined") BackupHistoryManager.createBackupSnapshot(`체크아웃(${got.join("+")})`, got.length === 1 ? got[0] : "ALL", false);
    if (!opts.quiet) showToast(`📝 ${got.join(", ")} 체크아웃 — 최신 자료로 편집을 시작합니다. 끝나면 [✅ 체크인]을 누르세요. (${Features.lockHours()}시간 동안 활동이 없으면 자동 해제)`);
    return got.length === systems.length;
  },

  // ---- 체크인 (저장 + 해제) ----
  async checkin(systems) {
    systems = [].concat(systems || this.mySystems()).filter(s => this.mine(s));
    if (!systems.length) return showToast("ℹ️ 체크인할 내 체크아웃이 없습니다.");
    const memo = await this.askMemo(`✅ 체크인 — ${systems.join(", ")}`, "저장하고 잠금을 풉니다. 작업 메모(선택)는 체크아웃 현황 기록에 남습니다.");
    if (memo === null) return;
    const only = this.partsFilter(systems);
    if (SyncManager.dirtyCount(this.KEYS) && this.dirtySystems().some(s => systems.includes(s))) {
      const r = await SyncManager.save(this.KEYS, { notify: false, onlyParts: only });
      if (!r.ok && !r.nothing) return;
    }
    const res = await ServerBackend.request("/api/locks/checkin", { scopes: systems.map(s => this.scope(s)), memo });
    this.update(res);
    this.clearHold(systems);
    showToast(`✅ ${systems.join(", ")} 체크인 완료 — 저장하고 잠금을 풀었습니다.`);
  },

  // ---- 체크아웃 취소 (변경 버림 + 해제) ----
  async cancel(systems) {
    systems = [].concat(systems).filter(s => this.mine(s));
    if (!systems.length) return;
    const dirty = this.dirtySystems().filter(s => systems.includes(s));
    if (dirty.length) {
      const c = await SyncUI.ask("↩️ 체크아웃 취소", `${dirty.join(", ")} 의 저장하지 않은 변경을 버리고 잠금을 풉니다. 계속할까요?`,
        [{ id: "ok", label: "↩️ 변경 버리고 취소", cls: "btn-danger" }, { id: "cancel", label: "닫기", cls: "btn-secondary" }]);
      if (c !== "ok") return;
      this.revertParts(dirty);
    }
    const res = await ServerBackend.request("/api/locks/cancel", { scopes: systems.map(s => this.scope(s)) });
    this.update(res);
    this.clearHold(systems);
    showToast(`↩️ ${systems.join(", ")} 체크아웃을 취소했습니다.`);
  },

  // ---- 강제 해제 (PM · 시스템관리자, 사유 필수) ----
  async forceRelease(sys) {
    if (!this.isManager()) return;
    const h = this.holder(sys);
    if (!h) return;
    const reason = await this.askMemo(`🔓 강제 해제 — ${sys} (${this.who(h)})`, `${this.who(h)} 님의 체크아웃(${this.hm(h.since)}~)을 풉니다. 그 사람의 저장하지 않은 변경은 저장할 때 막히고 백업 안내를 받습니다. 사유를 입력하세요. (필수)`, true);
    if (!reason) return;
    const res = await ServerBackend.request("/api/locks/force-release", { scopes: [this.scope(sys)], reason });
    if (!res.ok) return showToast("❌ " + (res.message || "강제 해제 실패"));
    this.update(res);
    this.refresh(true);
    showToast(`🔓 ${sys} 잠금을 강제로 풀었습니다. (사유: ${reason})`);
  },

  // ---- 변경 범위 ----
  dirtySystems() {
    const d = SyncManager.diff(this.KEYS);
    const out = new Set();
    Object.keys(d).forEach(k => Object.keys(d[k].parts).forEach(p => out.add(p)));
    return [...out];
  },
  partsFilter(systems) { const o = {}; this.KEYS.forEach(k => { o[k] = new Set(systems); }); return o; },
  revertParts(systems) {
    this.KEYS.forEach(k => {
      const baseVals = SyncManager.baselineVal[k] || new Map();
      const restore = {};
      systems.forEach(s => { restore[s] = baseVals.has(s) ? DataRegistry.clone(baseVals.get(s)) : null; });
      DataRegistry.set(k, Partition.merge(k, DataRegistry.get(k), restore));
    });
    SyncManager.afterDataApplied(this.KEYS, true);
  },
  // 한 서브시스템(파티션)만 기준본 갱신
  _setPartBase(k, p, val, rev) {
    const b = SyncManager.baseline[k] || (SyncManager.baseline[k] = new Map());
    const bv = SyncManager.baselineVal[k] || (SyncManager.baselineVal[k] = new Map());
    const br = SyncManager.baseRevs[k] || (SyncManager.baseRevs[k] = {});
    if (val === undefined || val === null) { b.delete(p); bv.delete(p); } else { b.set(p, Partition.canon(k, val)); bv.set(p, DataRegistry.clone(val)); }
    br[p] = rev || 0;
  },

  // 체크아웃 직후: 그 서브시스템을 서버 최신본으로 (내 변경이 있고 그 사이 남도 바꿨으면 3자 비교)
  async syncParts(systems) {
    const res = await ServerBackend.load(this.KEYS);
    if (!res.ok) { showToast("⚠️ 최신 자료를 받지 못했습니다: " + (res.error || "")); return; }
    const holds = this.readHold();
    const compare = [];
    this.KEYS.forEach(k => {
      const server = Partition.split(k, res.data[k] || []);
      const cur = Partition.split(k, DataRegistry.get(k));
      const baseVals = SyncManager.baselineVal[k] || new Map();
      systems.forEach(p => {
        const sv = server.get(p), mv = cur.get(p);
        const rev = ((res.revs[k] || {})[p] || {}).rev || 0;
        const hold = holds[k + "|" + p];
        const bv = hold ? hold.base : baseVals.get(p);
        const canon = v => Partition.canon(k, v || []);
        const myDirty = canon(mv) !== canon(bv);
        const theirs = canon(sv) !== canon(bv);
        if (!myDirty) DataRegistry.set(k, Partition.merge(k, DataRegistry.get(k), { [p]: sv === undefined ? null : sv }));
        else if (theirs && canon(sv) !== canon(mv)) compare.push({ k, p, base: bv || [], theirs: sv || [], mine: mv || [] });
        this._setPartBase(k, p, sv, rev);
      });
    });
    if (compare.length) await this.openCompare(compare);
    SyncManager.afterDataApplied(this.KEYS, true);
  },

  // ---- 저장이 막혔을 때 (서버 423) ----
  async onBlocked(changes, locked, opts) {
    const byScope = {};
    locked.forEach(l => { byScope[l.part] = l; });
    const systems = Object.keys(byScope);
    const others = systems.filter(s => byScope[s].reason === "LOCKED");
    const free = systems.filter(s => byScope[s].reason === "CHECKOUT_REQUIRED");
    const rest = this._without(changes, systems);
    if (!others.length) {
      const c = await SyncUI.ask("📝 체크아웃 필요", `${free.join(", ")} 은(는) 체크아웃하지 않아 저장하지 않았습니다.\n체크아웃(편집 잠금)하고 저장할까요? 다른 사람이 그 사이 저장했으면 비교 화면을 보여 줍니다.`,
        [{ id: "co", label: "📝 체크아웃하고 저장", cls: "btn-primary" }, { id: "backup", label: "💾 내 변경 백업 받기", cls: "btn-secondary" }, { id: "cancel", label: "닫기", cls: "btn-secondary" }]);
      if (c === "backup") this.downloadMine(free);
      if (c !== "co") { SyncManager.setStatus("저장 안 됨 (체크아웃 필요)", "warn"); return { ok: false, locked: true }; }
      const ok = await this.checkout(free, { reload: false, quiet: true });
      if (!ok) return { ok: false, locked: true };
      return SyncManager._commit(changes, !!opts.force, opts);
    }
    const lines = others.map(s => { const l = byScope[s]; return `• ${s} — ${l.name || l.empNo} 님이 ${this.hm(l.since)}부터 편집 중 (마지막 활동 ${this.hm(l.lastAt)})`; }).join("\n");
    const cnt = Object.keys(changes).reduce((a, k) => a + Object.keys(changes[k].parts).filter(p => others.includes(p)).length, 0);
    const c = await SyncUI.ask("⛔ 다른 사람이 체크아웃 중 — 저장할 수 없습니다", `${lines}\n\n내 변경: ${cnt}개 단위 (저장되지 않음). 어떻게 할까요?\n· 보류: 내 변경을 이 브라우저에 보관하고(새로고침해도 남음) 잠기지 않은 변경만 저장합니다. 그 사람이 체크인한 뒤 체크아웃하면 비교 화면에서 합칩니다.`,
      [{ id: "hold", label: "⏸ 보류 (나머지만 저장)", cls: "btn-primary" }, { id: "backup", label: "💾 내 변경 백업 받기", cls: "btn-secondary" },
       { id: "discard", label: "🗑 내 변경 버리고 최신 받기", cls: "btn-danger" }, { id: "cancel", label: "닫기", cls: "btn-secondary" }]);
    if (c === "backup") { this.downloadMine(others); this.hold(others); }
    if (c === "hold") this.hold(others);
    if (c === "discard") {
      const set = new Set();
      Object.keys(changes).forEach(k => others.forEach(p => { if (p in changes[k].parts) set.add(k + "\u0000" + p); }));
      await SyncManager.reloadParts(Object.keys(changes).filter(k => this.KEYS.includes(k)), set);
      this.clearHold(others);
    }
    SyncManager.setStatus(c === "discard" ? "최신 받음" : "보류 중 변경 있음", "warn");
    if ((c === "hold" || c === "backup" || c === "discard") && Object.keys(rest).length) {
      const leftover = free.length ? this._without(rest, free) : rest;
      if (Object.keys(leftover).length) return SyncManager._commit(leftover, !!opts.force, opts);
    }
    return { ok: false, locked: true };
  },
  _without(changes, systems) {
    const out = {};
    Object.keys(changes).forEach(k => {
      const parts = {}, base = {};
      Object.keys(changes[k].parts).forEach(p => {
        if (this.KEYS.includes(k) && systems.includes(p)) return;
        parts[p] = changes[k].parts[p]; base[p] = changes[k].base[p];
      });
      if (Object.keys(parts).length) out[k] = { parts, base };
    });
    return out;
  },

  // ---- 보류 (브라우저 보관) ----
  holdKey() { return `IOSTAR_WG_HOLD::${ProjectContext.current}::${this.me()}`; },
  readHold() { try { return JSON.parse(localStorage.getItem(this.holdKey()) || "{}") || {}; } catch (e) { return {}; } },
  writeHold(h) { try { if (Object.keys(h).length) localStorage.setItem(this.holdKey(), JSON.stringify(h)); else localStorage.removeItem(this.holdKey()); } catch (e) {} this.renderBadge(); },
  hold(systems) {
    const h = this.readHold();
    const now = new Date().toLocaleString();
    this.KEYS.forEach(k => {
      const cur = Partition.split(k, DataRegistry.get(k));
      const base = SyncManager.baselineVal[k] || new Map();
      systems.forEach(p => {
        if (Partition.canon(k, cur.get(p) || []) === Partition.canon(k, base.get(p) || [])) return;
        const prev = h[k + "|" + p];
        h[k + "|" + p] = { rows: DataRegistry.clone(cur.get(p) || []), base: prev ? prev.base : DataRegistry.clone(base.get(p) || []), at: now };
      });
    });
    this.writeHold(h);
    showToast(`⏸ ${systems.join(", ")} 변경을 이 브라우저에 보류했습니다. 그 사람이 체크인한 뒤 [📝 체크아웃]하면 비교해서 합칩니다.`);
  },
  clearHold(systems) {
    const h = this.readHold();
    Object.keys(h).forEach(key => { if (systems.includes(key.split("|")[1])) delete h[key]; });
    this.writeHold(h);
  },
  holdCount() { return Object.keys(this.readHold()).length; },
  // 저장한 뒤: 더 이상 바뀐 것이 없는(저장된) 보류는 지움
  afterSave() {
    const h = this.readHold();
    let changed = false;
    Object.keys(h).forEach(key => {
      const [k, p] = key.split("|");
      const cur = Partition.split(k, DataRegistry.get(k)).get(p) || [];
      const base = (SyncManager.baselineVal[k] || new Map()).get(p) || [];
      if (Partition.canon(k, cur) === Partition.canon(k, base)) { delete h[key]; changed = true; }
    });
    if (changed) this.writeHold(h);
  },
  // 로그인 · 다시 불러온 뒤: 보류한 변경을 화면에 다시 올림 (저장 전 상태로)
  restoreHeld() {
    if (!this.active()) return;
    const h = this.readHold();
    const keys = Object.keys(h);
    if (!keys.length) return;
    keys.forEach(key => {
      const [k, p] = key.split("|");
      if (!this.KEYS.includes(k)) return;
      DataRegistry.set(k, Partition.merge(k, DataRegistry.get(k), { [p]: h[key].rows }));
    });
    SyncManager.afterDataApplied(this.KEYS, true);
    const sys = [...new Set(keys.map(x => x.split("|")[1]))];
    showToast(`⏸ 보류 중인 변경 ${keys.length}건(${sys.join(", ")})을 화면에 다시 올렸습니다. [📝 체크아웃]하면 최신 자료와 비교해 저장합니다.`);
  },
  downloadMine(systems) {
    const out = { schemaVersion: `IOSTAR_WG_PENDING_v1`, exportCategory: "MERGE_TABLE", projectId: ProjectContext.current, projectName: ProjectData.currentName(),
      exportedBy: Permission.user().empNo, exportedAt: new Date().toISOString(), targetScope: systems.length === 1 ? systems[0] : "ALL", note: "체크아웃 대기 중 내 변경 — 스마트 병합 [📤 파일 올리기]로 다시 반영할 수 있음" };
    this.KEYS.forEach(k => { out[k] = (DataRegistry.get(k) || []).filter(r => systems.includes(String(r.system || ""))); });
    const name = ExcelSync.stdName("내변경백업", [systems.join("_")], "json");
    ExcelSync._triggerDownload(new Blob([JSON.stringify(out, null, 2)], { type: "application/json;charset=utf-8" }), name);
    showToast(`💾 내 변경을 내려받았습니다: ${name}`);
  },

  // ---- 3자 비교 ----
  rowKey(k, r) { return k === "deliverablesData" ? `${r.round || ""}|${r.phase || ""}|${r.name || ""}` : String(r.id || ""); },
  rowLabel(k, r) { return k === "deliverablesData" ? `${r.phase || ""} · ${r.name || ""} (${r.round || ""}회차)` : `${r.id || ""} ${r.name || r.title || ""}`; },
  LABEL: { wbsData: "WBS", reqMasterData: "요구사항", deliverablesData: "산출물", vocData: "VOC" },
  _cmpRows(items) {
    const rows = [];
    items.forEach(it => {
      const m = (arr) => { const o = new Map(); (arr || []).forEach(r => o.set(this.rowKey(it.k, r), r)); return o; };
      const B = m(it.base), T = m(it.theirs), M = m(it.mine);
      const keys = [...new Set([...T.keys(), ...M.keys(), ...B.keys()])];
      const eq = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
      keys.forEach(key => {
        const b = B.get(key), t = T.get(key), me = M.get(key);
        let state, pick;
        if (eq(me, t)) { state = "same"; pick = "theirs"; }
        else if (eq(me, b)) { state = "theirs"; pick = "theirs"; }
        else if (eq(t, b)) { state = "mine"; pick = "mine"; }
        else { state = "conflict"; pick = ""; }
        if (state === "same") return;
        const any = me || t || b;
        const fields = me && t ? Object.keys(Object.assign({}, t, me)).filter(f => !eq(t[f], me[f]) && !["pProg", "status", "isLeaf"].includes(f)).slice(0, 4) : [];
        rows.push({ k: it.k, p: it.p, key, state, pick, label: this.rowLabel(it.k, any), t, me, fields });
      });
    });
    return rows;
  },
  openCompare(items) {
    return new Promise(resolve => {
      const rows = this._cmpRows(items);
      this._cmp = { items, rows, resolve };
      const st = { mine: ["chip-progress", "내 것만 바뀜"], theirs: ["chip-ready", "다른 사람만 바뀜"], conflict: ["chip-delayed", "둘 다 바뀜"] };
      const desc = r => r.state !== "conflict" ? "" : (!r.t ? "다른 사람이 지움" : !r.me ? "내가 지움" : r.fields.map(f => `${f}: ${escapeHtml(String(r.t[f] ?? ""))} → <b>${escapeHtml(String(r.me[f] ?? ""))}</b>`).join(" · "));
      document.getElementById("lkCmpBody").innerHTML = rows.map((r, i) => `<tr>
          <td>${this.LABEL[r.k]} · ${escapeHtml(r.p)}</td>
          <td>${escapeHtml(r.label)}<div class="mt-desc">${desc(r)}</div></td>
          <td><span class="status-badge-chip ${st[r.state][0]}">${st[r.state][1]}</span></td>
          <td><select class="lk-pick" data-i="${i}"><option value="" ${!r.pick ? "selected" : ""}>— 고르세요 —</option><option value="mine" ${r.pick === "mine" ? "selected" : ""}>내 것</option><option value="theirs" ${r.pick === "theirs" ? "selected" : ""}>다른 사람 것</option></select></td>
        </tr>`).join("") || `<tr><td colspan="4" style="text-align:center;">차이 없음</td></tr>`;
      const n = rows.filter(r => r.state === "conflict").length;
      document.getElementById("lkCmpSum").textContent = `차이 ${rows.length}행 — 내 것만 ${rows.filter(r => r.state === "mine").length} · 다른 사람만 ${rows.filter(r => r.state === "theirs").length} · 둘 다 ${n} (둘 다 바뀐 행은 골라야 반영됩니다)`;
      const m = document.getElementById("lkCompareModal");
      if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(m);
      m.style.display = "flex";
    });
  },
  // 둘 다 바뀐 행만 한꺼번에 고름 (한쪽만 바뀐 행은 자동 선택 그대로)
  pickAll(which) {
    const c = this._cmp;
    document.querySelectorAll("#lkCmpBody .lk-pick").forEach(s => { if (!c || (c.rows[+s.dataset.i] || {}).state === "conflict") s.value = which; });
  },
  compareDone(apply) {
    const c = this._cmp;
    if (!c) return;
    const picks = [...document.querySelectorAll("#lkCmpBody .lk-pick")].map(s => s.value);
    if (apply === "mine" || apply === "theirs") picks.fill(apply);
    else if (picks.some((v, i) => !v && c.rows[i])) return showToast("⚠️ 둘 다 바뀐 행은 [내 것] / [다른 사람 것]을 골라야 합니다.");
    document.getElementById("lkCompareModal").style.display = "none";
    this._cmp = null;
    c.items.forEach(it => {
      const T = (it.theirs || []).slice();
      const chosen = new Map();
      c.rows.forEach((r, i) => { if (r.k === it.k && r.p === it.p) chosen.set(r.key, picks[i] === "mine" ? r.me : r.t); });
      const out = [];
      T.forEach(r => { const key = this.rowKey(it.k, r); if (chosen.has(key)) { const v = chosen.get(key); if (v) out.push(v); chosen.delete(key); } else out.push(r); });
      (it.mine || []).forEach(r => { const key = this.rowKey(it.k, r); if (chosen.has(key) && chosen.get(key)) { out.push(chosen.get(key)); chosen.delete(key); } });
      DataRegistry.set(it.k, Partition.merge(it.k, DataRegistry.get(it.k), { [it.p]: out }));
    });
    showToast("🔀 비교 결과를 화면에 반영했습니다. [💾 저장] 또는 [✅ 체크인]으로 저장하세요.");
    c.resolve(true);
  },

  // ---- 메모 · 사유 입력 창 ----
  askMemo(title, text, required) {
    return new Promise(resolve => {
      this._memo = { resolve, required };
      document.getElementById("lkMemoTitle").textContent = title;
      document.getElementById("lkMemoText").textContent = text;
      document.getElementById("lkMemoInput").value = "";
      document.getElementById("lkMemoModal").style.display = "flex";
      setTimeout(() => document.getElementById("lkMemoInput").focus(), 50);
    });
  },
  memoDone(ok) {
    const m = this._memo;
    if (!m) return;
    const v = document.getElementById("lkMemoInput").value.trim();
    if (ok && m.required && !v) return showToast("⚠️ 사유를 입력하세요.");
    document.getElementById("lkMemoModal").style.display = "none";
    this._memo = null;
    m.resolve(ok ? v : null);
  },

  // ---- 화면 ----
  kindScope(kind) { const el = document.getElementById(this.KINDS[kind]); return el && el.value ? el.value : "ALL"; },
  injectBars() {
    Object.keys(this.TAB_KIND).forEach(tab => {
      const pane = document.getElementById(tab);
      if (!pane || pane.querySelector(".lk-bar")) return;
      const bar = document.createElement("div");
      bar.className = "lk-bar";
      bar.dataset.kind = this.TAB_KIND[tab];
      const tb = pane.querySelector(".sync-toolbar");
      if (tb && tb.parentNode) tb.parentNode.insertBefore(bar, tb.nextSibling); else pane.insertBefore(bar, pane.firstChild);
    });
    if (!this._bound) {
      this._bound = true;
      document.addEventListener("change", e => { if (e.target && Object.values(this.KINDS).includes(e.target.id)) this.render(); });
    }
  },
  barHtml(kind) {
    const sys = this.kindScope(kind);
    const mineList = this.mySystems();
    if (sys === "ALL") {
      const others = this.locks.filter(l => l.scope.startsWith("SUB:") && !mineList.includes(this.sysOf(l.scope)));
      return `🔐 <b>체크아웃</b> — 내 편집: ${mineList.length ? mineList.map(escapeHtml).join(", ") : "없음"} · 다른 사람: ${others.length ? others.map(l => `${escapeHtml(this.sysOf(l.scope))}(${escapeHtml(this.who(l))})`).join(", ") : "없음"}
        <span class="lk-hint">서브시스템을 고르면 체크아웃 · 체크인할 수 있습니다.</span>
        <button class="btn btn-sm" data-btn="neutral" data-click="LockManager.refresh">🔄 상태 확인</button>
        <button class="btn btn-sm" data-btn="nav" data-click="LockManager.openBoard">🔐 체크아웃 현황</button>`;
    }
    const h = this.holder(sys);
    const can = Permission.canWriteSubsystem(sys);
    if (!h) return `🟢 <b>${escapeHtml(sys)}</b> 비어 있음 ${can ? `<button class="btn btn-sm" data-btn="save" data-click="LockManager.checkout" data-click-args="${UiEvents.args(sys)}">📝 체크아웃 (편집 시작)</button>` : `<span class="lk-hint">담당이 아니어서 읽기만 할 수 있습니다.</span>`}
      ${this.required() && can ? `<span class="lk-hint">체크아웃해야 저장할 수 있습니다.</span>` : ""}
      <button class="btn btn-sm" data-btn="neutral" data-click="LockManager.refresh">🔄 상태 확인</button>`;
    if (this.mine(sys)) return `📝 <b>${escapeHtml(sys)}</b> 내가 편집 중 (${this.hm(h.since)}~ · 만료 ${this.hm(h.expiresAt)}, 활동하면 연장)
      <button class="btn btn-sm" data-btn="save" data-click="LockManager.checkin" data-click-args="${UiEvents.args([sys])}">✅ 체크인 (저장 · 잠금 해제)</button>
      <button class="btn btn-sm" data-btn="warn" data-click="LockManager.cancel" data-click-args="${UiEvents.args([sys])}">↩️ 체크아웃 취소</button>`;
    return `⛔ <b>${escapeHtml(sys)}</b> ${escapeHtml(this.who(h))} 님이 편집 중 (${this.hm(h.since)}~ · 마지막 활동 ${this.hm(h.lastAt)}) — 읽기만 할 수 있습니다.
      <button class="btn btn-sm" data-btn="neutral" data-click="LockManager.refresh">🔄 상태 확인</button>
      ${this.isManager() ? `<button class="btn btn-sm" data-btn="danger" data-click="LockManager.forceRelease" data-click-args="${UiEvents.args(sys)}">🔓 강제 해제</button>` : ""}`;
  },
  render() {
    const on = this.active();
    this.injectBars();
    document.querySelectorAll(".lk-bar").forEach(bar => {
      bar.style.display = on ? "" : "none";
      if (!on) return;
      const kind = bar.dataset.kind;
      const sys = this.kindScope(kind);
      bar.dataset.state = sys === "ALL" ? "all" : !this.holder(sys) ? "free" : this.mine(sys) ? "mine" : "other";
      bar.innerHTML = this.barHtml(kind);
      const pane = bar.closest(".tab-pane");
      if (pane) pane.classList.toggle("lk-readonly", sys !== "ALL" && this.byOther(sys));
    });
    this.renderBadge();
    this.renderBoard();
  },
  renderBadge() {
    let el = document.getElementById("lkBadge");
    if (!el) {
      const save = document.getElementById("btnHeaderSaveAll");
      if (!save || !save.parentNode) return;
      el = document.createElement("button");
      el.id = "lkBadge";
      el.type = "button";
      el.className = "btn btn-sm lk-badge";
      el.setAttribute("data-click", "LockManager.openBoard");
      save.parentNode.insertBefore(el, save);
    }
    if (!this.active()) { el.style.display = "none"; return; }
    const mine = this.mySystems(), held = this.holdCount();
    const uncheck = this.required() ? this.dirtySystems().filter(s => !this.mine(s)) : [];
    el.style.display = mine.length || held || uncheck.length ? "" : "none";
    el.innerHTML = [mine.length ? `📝 ${mine.map(escapeHtml).join("·")}` : "", held ? `⏸ 보류 ${held}` : "", uncheck.length ? `⚠️ 미체크아웃 변경 ${uncheck.map(escapeHtml).join("·")}` : ""].filter(Boolean).join(" ");
    el.title = "체크아웃 현황 열기";
  },

  // ---- 체크아웃 현황 (스마트 병합 > 🔐 체크아웃 현황) ----
  openBoard() {
    if (typeof GShell !== "undefined") GShell.go("tab-merge"); else switchTab("tab-merge");
    SubTabs.show("merge", "locks");
    this.refresh(true);
  },
  renderBoard() {
    const body = document.getElementById("lkBoardBody");
    if (!body) return;
    const note = document.getElementById("lkBoardNote");
    if (!this.active()) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:14px;">${SyncManager.isLocal() ? "로컬 저장소 방식에서는 체크아웃을 쓰지 않습니다. 담당 서브시스템만 스마트 병합으로 올릴 수 있습니다." : "체크아웃 기능이 꺼져 있습니다. (conf/app.ini [lock] lock_mode)"}</td></tr>`;
      if (note) note.textContent = "";
      return;
    }
    if (note) note.textContent = `방식: ${Features.lockMode() === "required" ? "체크아웃해야 저장" : "남이 잡은 것만 막음"} · 유효 ${Features.lockHours()}시간 (활동하면 연장) · 기준 ${this.serverTime || "-"} (자동으로 새로고침하지 않음 — [🔄])`;
    const subs = typeof getAllSubsystemNames === "function" ? getAllSubsystemNames() : [];
    body.innerHTML = subs.map(s => {
      const h = this.holder(s);
      const can = Permission.canWriteSubsystem(s);
      const act = !h ? (can ? `<button class="btn btn-sm" data-btn="save" data-click="LockManager.checkout" data-click-args="${UiEvents.args(s)}">📝 체크아웃</button>` : "-")
        : this.mine(s) ? `<button class="btn btn-sm" data-btn="save" data-click="LockManager.checkin" data-click-args="${UiEvents.args([s])}">✅ 체크인</button> <button class="btn btn-sm" data-btn="warn" data-click="LockManager.cancel" data-click-args="${UiEvents.args([s])}">↩️ 취소</button>`
        : (this.isManager() ? `<button class="btn btn-sm" data-btn="danger" data-click="LockManager.forceRelease" data-click-args="${UiEvents.args(s)}">🔓 강제 해제</button>` : "-");
      return `<tr><td><b>${escapeHtml(s)}</b></td>
        <td>${!h ? `<span class="status-badge-chip chip-ready">비어 있음</span>` : this.mine(s) ? `<span class="status-badge-chip chip-progress">내가 편집 중</span>` : `<span class="status-badge-chip chip-delayed">편집 중</span>`}</td>
        <td>${h ? escapeHtml(this.who(h)) + (h.memo ? `<div class="mt-desc">${escapeHtml(h.memo)}</div>` : "") : ""}</td>
        <td>${h ? `${escapeHtml(this.hm(h.since))} ~ / 활동 ${escapeHtml(this.hm(h.lastAt))}` : ""}</td>
        <td>${h ? escapeHtml(String(h.expiresAt).slice(5, 16)) : ""}</td>
        <td style="white-space:nowrap;">${act}</td></tr>`;
    }).join("");
    const lb = document.getElementById("lkLogBody");
    if (lb) lb.innerHTML = this.log.length ? this.log.map(l => `<tr><td>${escapeHtml(String(l.at).slice(5, 16))}</td><td>${escapeHtml(this.sysOf(l.scope))}</td><td>${escapeHtml(this.ACTIONS[l.action] || l.action)}</td><td>${escapeHtml(l.name || l.empNo)}</td><td>${escapeHtml(l.by && l.by !== l.empNo ? l.by : "")}</td><td>${escapeHtml(l.memo || "")}</td></tr>`).join("")
      : `<tr><td colspan="6" style="text-align:center;">기록 없음</td></tr>`;
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(document.getElementById("mergeLocksPane"));
  }
};
window.LockManager = LockManager;
