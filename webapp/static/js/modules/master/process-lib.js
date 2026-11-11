// =============================================================================
// [IOSTAR-PM v3.9.0] 공정 유형 라이브러리 (ProcessLib)
// -----------------------------------------------------------------------------
//  - SDLC 유형 · 개선과제(REQ) 유형의 정의(단계 · 가중치 · 대표 산출물 · 매칭 키워드)는
//    [시스템 설정 > 🔄 공정 유형]에서 시스템관리자가 관리 → 모든 프로젝트 공통 (processTypes)
//  - 프로젝트는 [기준정보 > 공정단계정보]에서 쓸 유형만 활성화하고, 단계별 계획 일정만 정함
//    활성화하면 그 정의를 프로젝트에 복사해 둠 (projectConfig.customSdlcTypes / reqSdlcPhases)
//    → 라이브러리가 바뀌어도 진행 중인 프로젝트는 그대로, [🔄 최신 반영]을 눌러야 바뀜 (계획 일정은 단계 이름으로 이어 받음)
// =============================================================================
var ProcessLib = {
  raw: null,
  MAX: 12,
  _c(v) { return JSON.parse(JSON.stringify(v)); },
  _stripDates(t) {
    const c = this._c(t);
    (c.phases || []).forEach(p => { delete p.pStart; delete p.pEnd; });
    delete c.isRecommended;
    return c;
  },
  valid(v) { return !!v && Array.isArray(v.sdlc) && Array.isArray(v.req); },
  // 저장된 라이브러리가 없으면 기본 유형 + 지금 프로젝트의 유형으로 만든 기본 목록 (저장은 관리자가 고칠 때)
  seed() {
    const add = (list, t) => { if (t && t.code && !list.some(x => x.code === t.code)) list.push(this._stripDates(t)); };
    const sdlc = [], req = [];
    const P = (typeof WBSEngine !== "undefined" && WBSEngine.DEFAULT_SDLC_PRESETS) || {};
    ["SDLC_PMO", "SDLC_SMART_MFG", "SDLC_WATERFALL", "SDLC_AGILE", "SDLC_COTS", "SDLC_INFRA"].forEach(k => add(sdlc, P[k]));
    const pc = typeof projectConfig !== "undefined" ? projectConfig : {};
    (pc.customSdlcTypes || []).forEach(t => add(sdlc, t));
    const R = typeof ReqPhaseManager !== "undefined" ? ReqPhaseManager.PRESETS : {};
    Object.keys(R).forEach(k => add(req, R[k]));
    Object.keys(pc.customReqPresets || {}).forEach(k => add(req, pc.customReqPresets[k]));
    return { sdlc, req };
  },
  lib() { return this.valid(this.raw) ? this.raw : this.seed(); },
  sdlcTypes() { return this.lib().sdlc; },
  reqTypes() { return this.lib().req; },
  findSdlc(code) { return this.sdlcTypes().find(t => t.code === code) || null; },
  findReq(code) { return this.reqTypes().find(t => t.code === code) || null; },
  isAdmin() { return typeof ProjectManager !== "undefined" && ProjectManager.isAdmin(); },
  canManageProject() { const u = AuthManager.getCurrentUser(); return !!u && (u.role === "SYS_ADMIN" || u.role === "PM"); },

  // ---- 프로젝트 복사본 ----
  mergeDates(defPhases, oldPhases) {
    const old = {};
    (oldPhases || []).forEach(p => { if (p && p.name) old[p.name] = p; });
    return this._c(defPhases || []).map(p => {
      const o = old[p.name];
      if (o && o.pStart) p.pStart = o.pStart;
      if (o && o.pEnd) p.pEnd = o.pEnd;
      return p;
    });
  },
  _shape(phases) { return JSON.stringify((phases || []).map(p => [p.name, parseFloat(p.weight) || 0, p.output || "", (p.keywords || []).join(",")])); },
  projectSdlc(code) { return (projectConfig.customSdlcTypes || []).find(t => t.code === code) || null; },
  sdlcDiffers(code) {
    const lib = this.findSdlc(code), cur = this.projectSdlc(code);
    return !!lib && !!cur && (lib.name !== cur.name || this._shape(lib.phases) !== this._shape(cur.phases));
  },
  reqDiffers() {
    const lib = this.findReq(projectConfig.activeReqPreset);
    return !!lib && this._shape(lib.phases) !== this._shape(ReqPhaseManager.getPhases());
  },
  applySdlcToProject(code) {
    const lib = this.findSdlc(code);
    if (!lib) return false;
    if (!Array.isArray(projectConfig.customSdlcTypes)) projectConfig.customSdlcTypes = [];
    const list = projectConfig.customSdlcTypes;
    const i = list.findIndex(t => t.code === code);
    const copy = this._c(lib);
    copy.phases = this.mergeDates(lib.phases, i !== -1 ? list[i].phases : []);
    if (i !== -1) list[i] = copy; else list.push(copy);
    return true;
  },
  applyReqToProject(code) {
    const lib = this.findReq(code);
    if (!lib) return false;
    projectConfig.reqSdlcPhases = this.mergeDates(lib.phases, projectConfig.reqSdlcPhases || []);
    projectConfig.activeReqPreset = code;
    return true;
  },
  refreshSdlc(code) {
    if (!this.canManageProject()) return showToast("🚫 PM · 시스템관리자만 바꿀 수 있습니다.");
    if (!this.applySdlcToProject(code)) return;
    renderCustomSdlcCards();
    rebuildAll(true);
    showToast(`🔄 [${(this.findSdlc(code) || {}).name || code}] 시스템 설정의 최신 단계 구성을 이 프로젝트에 반영했습니다. (계획 일정은 단계 이름이 같으면 유지)`);
  },

  // ---- 프로젝트: 단계 계획 일정만 고치는 창 (기존 SDLC 편집 창 재사용) ----
  openDates(code) {
    const t = this.projectSdlc(code) || this.findSdlc(code);
    if (!t) return;
    _editingSdlcMode = { target: "dates", code };
    _editingSdlcPhasesTemp = this._c(t.phases || []);
    this._openModal(`📅 [${t.name}] 단계별 계획 일정 (이 프로젝트)`, t, true);
  },

  // ---- 시스템 설정: 라이브러리 편집 ----
  editable() {
    if (!this.valid(this.raw)) this.raw = this._c(this.seed());
    return this.raw;
  },
  KIND: { sdlc: "SDLC 유형", req: "개선과제 유형" },
  openNew(kind) {
    if (!this.isAdmin()) return;
    if (this.lib()[kind].length >= this.MAX) return showToast(`⚠️ ${this.KIND[kind]}은 ${this.MAX}개까지 등록할 수 있습니다.`);
    _editingSdlcMode = { target: "lib", kind, idx: -1 };
    _editingSdlcPhasesTemp = kind === "req"
      ? [{ key: "r1", name: "요구사항 분석", weight: 20, output: "요구사항정의서", keywords: ["요구사항", "분석"] },
         { key: "r2", name: "개선 설계", weight: 30, output: "개선설계서", keywords: ["설계"] },
         { key: "r3", name: "개선 개발 · 적용", weight: 30, output: "개발소스/적용확인서", keywords: ["개발", "구현", "적용"] },
         { key: "r4", name: "효과 검증 · 완료", weight: 20, output: "효과검증서", keywords: ["검증", "완료"] }]
      : [{ key: "p1", name: "요구분석", weight: 25, output: "요구명세서", keywords: ["분석", "요구"] },
         { key: "p2", name: "설계", weight: 25, output: "설계서", keywords: ["설계"] },
         { key: "p3", name: "구현", weight: 35, output: "프로그램", keywords: ["구현", "개발"] },
         { key: "p4", name: "검증이행", weight: 15, output: "검증보고서", keywords: ["검증", "테스트", "이행"] }];
    const code = `${kind === "req" ? "REQ" : "SDLC"}_CUSTOM_${Date.now().toString().slice(-4)}`;
    this._openModal(`🛠️ 새 ${this.KIND[kind]} 등록`, { code, name: `새 ${this.KIND[kind]}`, desc: "" }, false, true);
  },
  openEdit(kind, idx) {
    if (!this.isAdmin()) return;
    const t = this.lib()[kind][idx];
    if (!t) return;
    _editingSdlcMode = { target: "lib", kind, idx };
    _editingSdlcPhasesTemp = this._c(t.phases || []);
    this._openModal(`🛠️ [${t.name}] ${this.KIND[kind]} 편집`, t, false, false);
  },
  _openModal(title, t, datesOnly, codeEditable) {
    const m = document.getElementById("customSdlcModal");
    m.classList.toggle("pl-lib", !datesOnly);
    m.classList.toggle("pl-dates", !!datesOnly);
    document.getElementById("customSdlcModalTitle").textContent = title;
    const code = document.getElementById("editSdlcCode");
    code.value = t.code; code.readOnly = !codeEditable;
    ["editSdlcName", "editSdlcDesc"].forEach(id => { document.getElementById(id).readOnly = !!datesOnly; });
    document.getElementById("editSdlcName").value = t.name || "";
    document.getElementById("editSdlcDesc").value = t.desc || "";
    renderEditSdlcPhasesTable();
    m.style.display = "flex";
    if (typeof I18N !== "undefined") I18N.translateTree(m);
  },
  // saveCustomSdlcFromModal 에서 부름
  saveModal(mode, code, name, desc) {
    if (mode.target === "dates") {
      if (!this.canManageProject()) return showToast("🚫 PM · 시스템관리자만 바꿀 수 있습니다.");
      const bad = _editingSdlcPhasesTemp.find(p => p.pStart && p.pEnd && p.pStart > p.pEnd);
      if (bad) return showToast(`[${bad.name}] 단계의 계획 종료일이 시작일보다 빠릅니다.`);
      if (!this.projectSdlc(mode.code)) this.applySdlcToProject(mode.code);
      const t = this.projectSdlc(mode.code);
      t.phases.forEach((p, i) => { const e = _editingSdlcPhasesTemp[i] || {}; if (e.pStart) p.pStart = e.pStart; else delete p.pStart; if (e.pEnd) p.pEnd = e.pEnd; else delete p.pEnd; });
      closeCustomSdlcModal();
      renderCustomSdlcCards();
      rebuildAll(true);
      return showToast(`📅 [${t.name}] 단계별 계획 일정을 저장했습니다.`);
    }
    if (!this.isAdmin()) return showToast("🚫 공정 유형은 시스템관리자만 바꿀 수 있습니다.");
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(code)) return showToast("⚠️ 유형 코드는 영문 · 숫자 · _ - 로 2~40자여야 합니다.");
    if (!name) return showToast("⚠️ 유형 이름을 입력하세요.");
    if (!_editingSdlcPhasesTemp.length) return showToast("⚠️ 단계를 1개 이상 등록하세요.");
    const lib = this.editable();
    const list = lib[mode.kind];
    const other = (mode.kind === "sdlc" ? lib.req : lib.sdlc).concat(list.filter((t, i) => i !== mode.idx));
    if (other.some(t => t.code === code)) return showToast(`⚠️ 이미 있는 유형 코드입니다: ${code}`);
    const obj = this._stripDates({ code, name, desc, phases: _editingSdlcPhasesTemp });
    if (mode.idx >= 0) list[mode.idx] = obj; else list.push(obj);
    closeCustomSdlcModal();
    this.renderAdmin();
    persistChanges();
    showToast(`💾 [${name}] ${this.KIND[mode.kind]}을 저장했습니다. 프로젝트에는 [기준정보 > 공정단계정보]에서 활성화하거나 [🔄 최신 반영]으로 적용됩니다.`);
  },
  remove(kind, idx) {
    if (!this.isAdmin()) return;
    const lib = this.lib();
    const t = lib[kind][idx];
    if (!t) return;
    if (lib[kind].length <= 1) return showToast(`⚠️ ${this.KIND[kind]}은 1개 이상 있어야 합니다.`);
    openConfirmDialog(`[${t.name}] ${this.KIND[kind]}을 라이브러리에서 삭제할까요?\n이미 이 유형을 쓰고 있는 프로젝트는 복사해 둔 단계로 계속 동작합니다.`, () => {
      this.editable()[kind].splice(idx, 1);
      this.renderAdmin();
      persistChanges();
      showToast(`🗑 [${t.name}] ${this.KIND[kind]}을 삭제했습니다.`);
    });
  },
  resetDefaults() {
    if (!this.isAdmin()) return;
    openConfirmDialog("공정 유형 라이브러리를 기본 유형(PMO · 스마트제조 · 폭포수 · 애자일 · 패키지 · 인프라 / 개선과제 4종)으로 되돌릴까요?\n이미 쓰고 있는 프로젝트는 복사해 둔 단계로 계속 동작합니다.", () => {
      const keep = projectConfig.customSdlcTypes;
      projectConfig.customSdlcTypes = [];
      const reqKeep = projectConfig.customReqPresets;
      projectConfig.customReqPresets = {};
      this.raw = this._c(this.seed());
      projectConfig.customSdlcTypes = keep;
      projectConfig.customReqPresets = reqKeep;
      this.renderAdmin();
      persistChanges();
      showToast("🔄 공정 유형 라이브러리를 기본 유형으로 되돌렸습니다.");
    });
  },
  renderAdmin() {
    const card = (t, kind, idx) => {
      const ph = (t.phases || []).map((p, i) => `${i + 1}.${escapeHtml(p.name)}(${p.weight}%)`).join(" ➔ ");
      const sum = (t.phases || []).reduce((a, p) => a + (parseFloat(p.weight) || 0), 0);
      return `<div class="step-card pl-card">
        <div class="pl-card-head">
          <div><strong>${escapeHtml(t.name)}</strong> <code>${escapeHtml(t.code)}</code></div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-secondary btn-sm" data-click="ProcessLib.openEdit" data-click-args="${UiEvents.args(kind, idx)}">✏️ 편집</button>
            <button class="btn btn-danger btn-sm" data-click="ProcessLib.remove" data-click-args="${UiEvents.args(kind, idx)}">삭제</button>
          </div>
        </div>
        <p>${escapeHtml(t.desc || "")}</p>
        <div class="pl-phases"><b>단계 ${(t.phases || []).length}개</b> (가중치 합계 <span style="color:${Math.round(sum) === 100 ? "#15803d" : "#dc2626"}">${sum}%</span>) — ${ph}</div>
      </div>`;
    };
    const lib = this.lib();
    const s = document.getElementById("plSdlcCards"), r = document.getElementById("plReqCards");
    if (s) s.innerHTML = lib.sdlc.map((t, i) => card(t, "sdlc", i)).join("");
    if (r) r.innerHTML = lib.req.map((t, i) => card(t, "req", i)).join("");
    const st = document.getElementById("plStatus");
    if (st) st.textContent = this.valid(this.raw) ? `SDLC ${lib.sdlc.length}개 · 개선과제 ${lib.req.length}개 (저장된 라이브러리)` : `SDLC ${lib.sdlc.length}개 · 개선과제 ${lib.req.length}개 (기본 유형 — 고치면 저장됩니다)`;
    const pane = document.querySelector('.master-subpane[data-subpane="process"]');
    if (pane && typeof I18N !== "undefined") I18N.translateTree(pane);
  },
  goAdmin() {
    if (typeof GShell !== "undefined") GShell.go("tab-config"); else switchTab("tab-config");
    SubTabs.show("config", "process");
  }
};
window.ProcessLib = ProcessLib;
var _editingSdlcMode = null;
