// =============================================================================
// [Project Mgmt v4.1.0] 🔀 스마트 병합 > 📋 자료 내려받기·올리기 — 목록표 + 공통 올리기 미리 보기 (MergeTable)
// -----------------------------------------------------------------------------
//  목록표: 자료마다 한 줄 (범위 · 건수 · 올리기 권한). 체크한 자료를 엑셀 / JSON 한 파일로 내려받음
//    - 서브시스템 단위: WBS · 요구사항 · 산출물 · VOC · 주간보고 · 회의록 (올리기 = 담당 서브시스템, 전체는 관리자 · PM · 담당이 ALL 인 리더)
//    - 프로젝트 단위 : 공지사항 · 소통 피드 · 프로젝트 기준정보 · 서브시스템 기준정보 · 작업자 (올리기 = 관리자 · PM)
//  올리기 미리 보기 (모든 올리기 공통 — 각 화면의 📤 엑셀 올리기 포함):
//    파일을 읽어 자료마다 [파일 행 · 반영할 행 · 제외할 행(범위 밖 · 권한 없음) · 반영 방법]을 보여 주고
//    [반영]을 누르면 복원 지점을 만든 뒤 반영, [취소]면 아무것도 바꾸지 않음
// =============================================================================
var MergeTable = {
  ITEMS: [
    { k: "wbs", unit: "sys", icon: "📋", label: "WBS 공정표", desc: "계층 공정 · 가중치 · 계획/실적 일정 · 진척률" },
    { k: "req", unit: "sys", icon: "📌", label: "요구사항(REQ)", desc: "과제 · 추가 요구사항, 유형 · 상태" },
    { k: "deliverables", unit: "sys", icon: "📑", label: "산출물", desc: "차수별 산출물 계획/실적 · 검수 상태" },
    { k: "voc", unit: "sys", icon: "📣", label: "VOC / 이슈", desc: "현업 요청 · 우선순위 · 목표일 · 조치" },
    { k: "weekly", unit: "sys", icon: "📝", label: "주간보고", desc: "서브시스템 주간보고 (전체 범위면 통합 보고서 포함)" },
    { k: "meetings", unit: "sys", icon: "📅", label: "회의록 · Action Item", desc: "서브시스템 회의 (+ 통합 회의)" },
    { k: "notices", unit: "prj", icon: "📢", label: "공지", desc: "프로젝트 공지" },
    { k: "comms", unit: "prj", icon: "💬", label: "게시판", desc: "채널별 게시글" },
    { k: "config", unit: "prj", icon: "🗂️", label: "프로젝트 설정", desc: "기본정보 · 도메인 · SDLC · 공휴일 · 표준 산출물" },
    { k: "subsystems", unit: "prj", icon: "🏢", label: "서브시스템 프로젝트 설정", desc: "도메인 · 코드/명 · SDLC 모델 · 가중치 · 담당" },
    { k: "users", unit: "prj", icon: "👥", label: "멤버(참여자)", desc: "멤버 ID · 이름 · 이 프로젝트의 역할 · 담당 · 부서" }
  ],
  DATA_KEY: { wbs: "wbsData", req: "reqMasterData", deliverables: "deliverablesData", voc: "vocData", weekly: "weeklyReportsData", meetings: "meetingsData",
    notices: "noticesData", comms: "communicationsData", config: "projectConfig", subsystems: "subsystemsMeta", users: "projectUsers" },
  WORK: ["wbs", "req", "deliverables", "voc"],
  COLLAB: ["weekly", "meetings", "notices", "comms"],
  // 시트 이름으로 자료 찾기 (먼저 맞는 것)
  SHEET_RX: [
    ["config", /프로젝트\s*기준|기본\s*정보|config/i], ["subsystems", /서브시스템/], ["users", /작업자|사용자|멤버|인력|user/i],
    ["weekly", /주간\s*보고/], ["meetings", /회의/], ["notices", /공지/], ["comms", /소통/],
    ["wbs", /wbs|공정표/i], ["deliverables", /산출물/], ["req", /요구|req/i], ["voc", /voc|이슈/i]
  ],
  _plan: null,
  INFO_SHEET: "파일정보",

  item(k) { return this.ITEMS.find(i => i.k === k); },
  _lockOn() { return false; },  // Local 판: 체크아웃 잠금 없음 (담당 서브시스템 배정으로 대신)
  scope() { const el = document.getElementById("workDataSubsysSelect"); return el && el.value ? el.value : "ALL"; },
  _sysOf(r) { return String((r && r.system) || "").trim(); },
  _inSys(r, scope) { const s = this._sysOf(r); return s === scope || (typeof WBSEngine !== "undefined" && WBSEngine.getSubsystemCode(s) === scope); },

  // 올리기 권한: { ok, why }
  canUpload(k, scope) {
    const it = this.item(k);
    if (!it) return { ok: false, why: "알 수 없는 자료" };
    if (it.unit === "prj") return SmartMergeCenter.isAdminOrPm() ? { ok: true } : { ok: false, why: "관리자 · PM 만" };
    if (!scope || scope === "ALL") return SmartMergeCenter.canBulkWork() ? { ok: true } : { ok: false, why: "전체 범위는 관리자 · PM · 총괄리더만 — 담당 서브시스템을 고르세요" };
    if (!Permission.canWriteSubsystem(scope)) return { ok: false, why: `${scope} 는 담당 서브시스템이 아님` };
    // [Workgroup] 다른 사람이 체크아웃한 서브시스템은 올릴 수 없음
    if (this.WORK.includes(k) && this._lockOn() && LockManager.byOther(scope)) return { ok: false, why: `${LockManager.who(LockManager.holder(scope))} 님이 체크아웃(편집 중)` };
    return { ok: true };
  },

  // 지금 자료 (범위 적용)
  records(k, scope) {
    const it = this.item(k);
    if (this.COLLAB.includes(k)) return SmartMergeCenter._collabRecords(k, it.unit === "prj" ? "ALL" : scope);
    if (k === "config") return SmartMergeCenter.buildConfigRows();
    if (k === "subsystems") return subsystemsMeta || [];
    if (k === "users") return SmartMergeCenter._projectUserRows(false);
    const all = DataRegistry.get(this.DATA_KEY[k]) || [];
    return !scope || scope === "ALL" ? all : all.filter(r => this._inSys(r, scope));
  },
  count(k, scope) { return k === "config" ? 1 : this.records(k, scope).length; },

  // ---- 목록표 ----
  render() {
    const body = document.getElementById("mtBody");
    if (!body) return;
    const scope = this.scope();
    const keep = {};
    body.querySelectorAll(".mt-chk").forEach(c => { keep[c.value] = c.checked; });
    const first = !Object.keys(keep).length;
    const scopeLbl = scope === "ALL" ? "전체 서브시스템" : scope;
    const row = it => {
      const p = this.canUpload(it.k, scope);
      const checked = first ? it.unit === "sys" : keep[it.k];
      return `<tr>
        <td style="text-align:center;"><input type="checkbox" class="mt-chk" value="${it.k}" ${checked ? "checked" : ""}></td>
        <td><b>${it.icon} ${escapeHtml(it.label)}</b><div class="mt-desc">${escapeHtml(it.desc)}</div></td>
        <td>${it.unit === "sys" ? `<span class="status-badge-chip chip-progress">${escapeHtml(scopeLbl)}</span>` : `<span class="status-badge-chip chip-ready">프로젝트 전체</span>`}</td>
        <td style="text-align:right;"><b id="cntBadge_${it.k}">${it.k === "config" ? "-" : this.count(it.k, scope)}</b></td>
        <td>${p.ok ? `<span class="mt-ok">✅ 가능</span>` : `<span class="mt-lock" title="${escapeAttr(p.why)}">🔒 ${escapeHtml(p.why)}</span>`}</td>
      </tr>`;
    };
    const grp = (t, unit) => `<tr class="mt-group"><td colspan="5">${t}</td></tr>` + this.ITEMS.filter(i => i.unit === unit).map(row).join("");
    body.innerHTML = grp("🏢 서브시스템 단위 — 위에서 고른 범위만 다운로드하고 합칩니다", "sys") + grp("🗂️ 프로젝트 단위 — 범위와 관계없이 프로젝트 전체", "prj");
    const all = document.getElementById("mtAll");
    if (all) all.checked = this.selected().length === this.ITEMS.length;
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(body);
  },
  selected() { return [...document.querySelectorAll("#mtBody .mt-chk")].filter(c => c.checked).map(c => c.value); },
  toggleAll(checked) { document.querySelectorAll("#mtBody .mt-chk").forEach(c => { c.checked = !!checked; }); },
  selectUnit(unit) { document.querySelectorAll("#mtBody .mt-chk").forEach(c => { c.checked = this.item(c.value).unit === unit; }); },

  // ---- 내려받기 ----
  sheetFor(k, scope) {
    const it = this.item(k);
    if (this.COLLAB.includes(k)) return SmartMergeCenter._collabSheet(k, it.unit === "prj" ? "ALL" : scope);
    const schema = ExcelSync.TAB_SCHEMAS[k];
    if (!schema) return null;
    const nums = { wbs: ["level", "weight", "pProg", "aProg"], subsystems: ["weight"] }[k] || [];
    const recs = k === "users" ? SmartMergeCenter._projectUserRows(true) : this.records(k, scope);
    const rows = [{ cells: schema.map(c => c.label), styleId: 1, height: 25 }].concat(recs.map(r => ({
      cells: schema.map(c => {
        if (nums.includes(c.key)) { const n = parseFloat(r[c.key]); return isNaN(n) ? 0 : n; }
        return ExcelSync.formatExportCell(k, c.key, r[c.key]);
      }), styleId: 2, height: 20
    })));
    return { name: SmartMergeCenter.SHEET_NAMES[k] || k.toUpperCase(), colWidths: schema.map(c => c.width || 16), rows };
  },
  download(format) {
    const keys = this.selected();
    if (!keys.length) return showToast("⚠️ 다운로드할 자료를 1개 이상 체크하세요.");
    const scope = this.scope();
    const tag = keys.length === this.ITEMS.length ? "ALL" : keys.join("_").toUpperCase();
    if (format === "JSON") {
      const payload = { schemaVersion: `AX_PMYS_${APP_VERSION.version}_MERGE`, exportCategory: "MERGE_TABLE", projectId: ProjectContext.current,
        projectName: ProjectData.currentName(), targetScope: scope, selectedItems: keys, exportedAt: new Date().toISOString(),
        basedOn: projectConfig.packageStamp || "", exportedBy: (AuthManager.getCurrentUser() || {}).name || "" };
      keys.forEach(k => {
        if (k === "config") { payload.projectConfig = projectConfig; payload.standardDeliverablesMeta = standardDeliverablesMeta; }
        else if (k === "users") payload.projectUsers = SmartMergeCenter._projectUserRows(false);
        else payload[this.DATA_KEY[k]] = this.records(k, scope);
      });
      const name = ExcelSync.stdName("자료", [scope, tag], "json");
      ExcelSync._triggerDownload(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }), name);
      return showToast(`📥 [자료 ${keys.length}종 · ${scope}] JSON 다운로드: ${name}`);
    }
    const sheets = keys.map(k => this.sheetFor(k, scope)).filter(Boolean);
    // 파일 정보 시트: 어느 종합본을 받아 작업했는지 · 보낸 사람 (PM 이 올릴 때 이전 종합본이면 경고)
    sheets.push({ name: this.INFO_SHEET, colWidths: [18, 40], rows: [
      { cells: ["항목", "값"], styleId: 1, height: 22 },
      { cells: ["기준 마스터 파일", projectConfig.packageStamp || ""], styleId: 2, height: 20 },
      { cells: ["보낸 사람", (AuthManager.getCurrentUser() || {}).name || ""], styleId: 2, height: 20 },
      { cells: ["범위", scope === "ALL" ? "전체" : scope], styleId: 2, height: 20 },
      { cells: ["프로젝트", ProjectData.currentName()], styleId: 2, height: 20 },
      { cells: ["다운로드한 시각", new Date().toLocaleString()], styleId: 2, height: 20 }] });
    const name = ExcelSync.stdName("자료", [scope, tag], "xlsx");
    ExcelSync._triggerDownload(ExcelSync._buildXlsxBlob(sheets), name);
    showToast(`📥 [자료 ${keys.length}종 · ${scope}] 엑셀 다운로드: ${name}`);
  },

  // ---- 올리기 ----
  pick() { UiH.clickEl("mtUpInput"); },
  async upload(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    await this.previewFile(file, { scope: this.scope(), checked: this.selected(), title: "📋 자료 업로드" });
  },

  // 파일 읽기 → { json } 또는 { sheets }
  async parseFile(file) {
    if (/\.json$/i.test(file.name)) {
      let d = JSON.parse(await file.text());
      if (d && Array.isArray(d.items) && d.items[0] && d.items[0].data) d = d.items[0].data;     // 프로젝트 백업 (JSON)
      else if (d && d.data && typeof d.data === "object" && !Array.isArray(d.data)) d = Object.assign({}, d.data, d.projectUsers ? { projectUsers: d.projectUsers } : {});
      return { json: d };
    }
    const all = await ExcelSync._parseUploadedFile(file);
    // 파일 정보 시트 (기준 종합본 · 보낸 사람) 는 자료로 읽지 않고 따로
    const info = all.find(sh => String(sh.name || "").replace(/^\d+_/, "") === this.INFO_SHEET);
    const meta = {};
    if (info) (info.rows || []).forEach(r => {
      const k = String((r && r[0]) || "").trim(), v = String((r && r[1]) || "").trim();
      if (k === "기준 종합본" || k === "기준 마스터 파일") meta.basedOn = v;
      else if (k === "보낸 사람") meta.exportedBy = v;
    });
    return { sheets: all.filter(sh => sh !== info), meta };
  },

  // 시트마다 어떤 자료인지 (이름 → 머리줄)
  _sheetKey(sh) {
    const name = String(sh.name || "").replace(/^\d+_/, "");
    const hit = this.SHEET_RX.find(([, rx]) => rx.test(name));
    if (hit) return hit[0];
    const rows = (sh.rows || []).slice(0, 12);
    for (const cells of rows) {
      const m = ExcelSync._matchHeaderToSchema(cells || []);
      if (m) return m.tabKey;
      for (const k of ["users", "config"]) if (ExcelSync._matchHeaderToSchema(cells || [], k)) return k;
      for (const k of this.COLLAB) if ((cells || []).map(c => String(c || "").trim()).includes(SmartMergeCenter.COLLAB_DEFS[k].cols[0][1])) return k;
    }
    return null;
  },

  // 파일에서 자료 k 의 행 (없으면 null). onlyKey: 한 가지 자료만 올리는 화면 — 알 수 없는 시트도 그 자료로 봄
  extract(parsed, k, onlyKey) {
    if (parsed.json) {
      const d = parsed.json;
      if (k === "config") return d.projectConfig && typeof d.projectConfig === "object" ? [Object.assign({}, d.projectConfig, Array.isArray(d.standardDeliverablesMeta) ? { __std: d.standardDeliverablesMeta } : {})] : null;
      if (Array.isArray(d)) return onlyKey ? d : null;
      return Array.isArray(d[this.DATA_KEY[k]]) ? d[this.DATA_KEY[k]] : null;
    }
    const mine = parsed.sheets.filter(sh => { const sk = this._sheetKey(sh); return sk === k || (!sk && onlyKey); });
    if (!mine.length) return null;
    if (this.COLLAB.includes(k)) return SmartMergeCenter._collabRecordsFromSheets(k, mine);
    if (["config", "subsystems", "users"].includes(k)) return SmartMergeCenter._extractMasterSheetRows(mine, k);
    return SmartMergeCenter._extractRowsFromSheets(mine, k);
  },

  // 자료 한 가지의 반영 계획
  _planOne(k, rows, scope) {
    const it = this.item(k);
    const sc = it.unit === "prj" ? "ALL" : scope;
    const perm = this.canUpload(k, scope);
    const fileRows = rows.length;
    let apply = rows, why = "", how = "";
    if (it.unit === "sys" && sc !== "ALL") {
      if (this.WORK.includes(k)) apply = rows.filter(r => this._inSys(r, sc));
      else apply = rows.filter(r => SmartMergeCenter.COLLAB_DEFS[k].inScope(r, sc));
      if (apply.length < fileRows) why = `${sc} 범위 밖 ${fileRows - apply.length}행`;
    }
    // [Workgroup] 전체 범위: 다른 사람이 체크아웃한 서브시스템 행은 빼고, 나머지는 서브시스템별로 바꿈
    let lockedOut = [];
    if (this.WORK.includes(k) && sc === "ALL" && this._lockOn()) {
      lockedOut = [...new Set(apply.map(r => this._sysOf(r)))].filter(x => LockManager.byOther(x));
      if (lockedOut.length) {
        const before = apply.length;
        apply = apply.filter(r => !lockedOut.includes(this._sysOf(r)));
        why = `🔒 ${lockedOut.join(", ")} 체크아웃 중 ${before - apply.length}행`;
      }
    }
    const cur = this.count(k, sc);
    if (this.WORK.includes(k)) how = sc === "ALL" ? (lockedOut.length ? `서브시스템별 바꾸기 (${lockedOut.join(", ")} 제외)` : `전체 바꾸기 (지금 ${cur}건 → ${apply.length}건)`) : `${sc} 자료 바꾸기 (지금 ${cur}건 → ${apply.length}건, 다른 서브시스템은 그대로)`;
    else if (this.COLLAB.includes(k)) how = "같은 ID 는 고치고 새 ID 는 추가";
    else if (k === "config") how = "프로젝트 설정을 파일 내용으로 바꾸기";
    else if (k === "subsystems") how = `서브시스템 목록 바꾸기 (지금 ${cur}개 → ${apply.length}개)`;
    else if (k === "users") how = "이 프로젝트의 역할 · 담당 · 부서를 추가 · 갱신 (목록에 없는 멤버는 그대로)";
    if (!perm.ok) { why = `🔒 ${perm.why}`; apply = []; }
    return { k, label: `${it.icon} ${it.label}`, scope: sc, fileRows, rows: apply, ignored: fileRows - apply.length, why, how, ok: perm.ok && apply.length > 0, lockedOut };
  },

  // 공통 미리 보기: opts = { scope, keys(이 자료만), checked(처음 체크할 자료), title, onDone }
  async previewFile(file, opts = {}) {
    let parsed;
    try { parsed = await this.parseFile(file); }
    catch (err) { return showToast(`⚠️ 파일을 읽지 못했습니다: ${err.message}`); }
    const keys = opts.keys || this.ITEMS.map(i => i.k);
    const only = keys.length === 1 ? keys[0] : null;
    const scope = opts.scope || "ALL";
    const plan = [];
    keys.forEach(k => {
      let rows = null;
      try { rows = this.extract(parsed, k, only); } catch (err) { rows = null; }
      if (rows && rows.length) plan.push(this._planOne(k, rows, scope));
    });
    if (!plan.length) return showToast(`⚠️ [${file.name}] 에서 올릴 자료를 찾지 못했습니다. 이 화면에서 다운로드한 양식(엑셀 / JSON)을 쓰세요.`);
    this._plan = { file: file.name, scope, items: plan, json: !!parsed.json, onDone: opts.onDone };
    // [Local] 오래된 종합본을 받아 작업한 파일이면 알림 (그 사이 다른 사람 자료가 바뀌었을 수 있음)
    const src = parsed.json || parsed.meta || {};
    const based = src.basedOn, cur = projectConfig.packageStamp;
    const stale = based && cur && based < cur ? `⚠️ 이 파일은 이전 마스터 파일(${based})을 받아 작업한 것입니다. 지금 마스터 파일은 ${cur} 입니다 — 반영할 행을 꼭 확인하세요. ` : "";
    const who = src.exportedBy ? `보낸 사람: ${src.exportedBy} · ` : "";
    const checked = opts.checked && opts.checked.length ? opts.checked : keys;
    document.getElementById("mpTitle").textContent = `${opts.title || "📤 업로드"} — 미리 보기`;
    document.getElementById("mpFile").textContent = `${file.name} · 범위: ${scope === "ALL" ? "전체" : scope}`;
    document.getElementById("mpBody").innerHTML = plan.map((p, i) => `<tr class="${p.ok ? "" : "mp-off"}">
        <td style="text-align:center;"><input type="checkbox" class="mp-chk" data-i="${i}" ${p.ok && checked.includes(p.k) ? "checked" : ""} ${p.ok ? "" : "disabled"}></td>
        <td><b>${escapeHtml(p.label)}</b></td>
        <td style="text-align:right;">${p.fileRows}</td>
        <td style="text-align:right;"><b class="mp-apply">${p.rows.length}</b></td>
        <td style="text-align:right;">${p.ignored ? `<span class="mp-ign" title="${escapeAttr(p.why)}">${p.ignored}</span>` : "0"}${p.why ? `<div class="mt-desc">${escapeHtml(p.why)}</div>` : ""}</td>
        <td class="mt-desc">${escapeHtml(p.how)}</td>
      </tr>`).join("");
    const auto = typeof BackupHistoryManager !== "undefined" && BackupHistoryManager.autoDownload && BackupHistoryManager.autoDownload();
    document.getElementById("mpNote").textContent = `${stale}${who}[반영]을 누르면 지금 상태를 스냅샷으로 먼저 남깁니다${auto ? " (백업 JSON 파일도 다운로드음)" : ""}. 체크한 자료만 반영합니다.`;
    const m = document.getElementById("mergePreviewModal");
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(m);
    m.style.display = "flex";
  },
  close() {
    const m = document.getElementById("mergePreviewModal");
    if (m) m.style.display = "none";
    this._plan = null;
  },

  confirm() {
    const plan = this._plan;
    if (!plan) return;
    const picks = [...document.querySelectorAll("#mpBody .mp-chk")].filter(c => c.checked && !c.disabled).map(c => plan.items[+c.dataset.i]);
    if (!picks.length) return showToast("⚠️ 반영할 자료를 1개 이상 체크하세요.");
    this.close();
    this._applyWithCheckout(plan, picks);
  },
  // [Workgroup] 반영할 서브시스템 중 아직 체크아웃하지 않은 곳은 먼저 체크아웃 (다른 사람이 잡은 곳은 미리 보기에서 이미 제외)
  async _applyWithCheckout(plan, picks) {
    if (this._lockOn()) {
      const touched = new Set();
      picks.filter(p => this.WORK.includes(p.k)).forEach(p => {
        if (p.scope !== "ALL") touched.add(p.scope); else p.rows.forEach(r => touched.add(this._sysOf(r)));
      });
      const need = [...touched].filter(x => x && !LockManager.mine(x) && !LockManager.byOther(x));
      if (need.length && !(await LockManager.checkout(need, { reload: false, quiet: true, snapshot: false }))) {
        return showToast("⛔ 체크아웃하지 못한 서브시스템이 있어 반영하지 않았습니다. [🔐 체크아웃 현황]을 확인하세요.");
      }
      if (need.length) showToast(`📝 ${need.join(", ")} 체크아웃했습니다. 반영 뒤 [💾 저장] 또는 [✅ 체크인]하세요.`);
    }
    try {
      const backup = BackupHistoryManager.createBackupSnapshot(`자료업로드(${picks.map(p => p.k).join("+")}:${plan.scope})`, plan.scope, true);
      const done = this.apply(picks, plan.json);
      if (typeof plan.onDone === "function") plan.onDone(done);
      showToast(`✅ [업로드 반영 완료] ${done.join(", ")} · 스냅샷: ${backup}`);
    } catch (err) {
      showToast("⚠️ 업로드 반영 오류: " + err.message);
    }
  },

  // 반영 (기준정보 → 서브시스템 → 작업자 → 업무 → 협업 순서)
  apply(picks, isJson) {
    const done = [];
    const by = k => picks.find(p => p.k === k);
    const cfg = by("config");
    if (cfg) {
      if (isJson) {
        const c = Object.assign({}, cfg.rows[0]);
        if (Array.isArray(c.__std)) standardDeliverablesMeta = c.__std;
        delete c.__std;
        delete c.uiTheme;
        projectConfig = Object.assign({}, projectConfig, c);
      } else SmartMergeCenter.applyConfigRows(cfg.rows);
      done.push("프로젝트 설정");
    }
    const subs = by("subsystems");
    if (subs) {
      subsystemsMeta = subs.rows;
      normalizeAndDeduplicateSubsystems();
      if (typeof NoticeCommManager !== "undefined" && NoticeCommManager.cleanObsoleteChannelData) NoticeCommManager.cleanObsoleteChannelData();
      done.push(`서브시스템 ${subsystemsMeta.length}개`);
    }
    const users = by("users");
    if (users) { SmartMergeCenter._mergeUsersList(users.rows); done.push(`멤버 ${users.rows.length}명`); }
    this.WORK.forEach(k => {
      const p = by(k);
      if (!p) return;
      if (p.scope === "ALL" && p.lockedOut && p.lockedOut.length) {
        // 잠긴 서브시스템은 그대로 두고, 파일에 있는 서브시스템만 바꿈
        [...new Set(p.rows.map(r => this._sysOf(r)))].forEach(x => SmartMergeCenter._mergeWorkArrayData(k, p.rows.filter(r => this._sysOf(r) === x), x));
      } else SmartMergeCenter._mergeWorkArrayData(k, p.rows, p.scope);
      done.push(`${this.item(k).label} ${p.rows.length}건`);
    });
    this.COLLAB.forEach(k => {
      const p = by(k);
      if (!p) return;
      const r = SmartMergeCenter._upsertCollab(k, p.rows, p.scope);
      if (r) done.push(r);
    });
    ExcelSync._ensureWbsAndSubsystemsIntegrity();
    if (typeof syncSubsystemWeights === "function") syncSubsystemWeights();
    if (cfg) SmartMergeCenter.syncConfigInputs();
    rebuildAll(true);
    if (typeof NoticeCommManager !== "undefined") NoticeCommManager.renderAll();
    if (by("meetings") && typeof MeetingManager !== "undefined") MeetingManager.onDataReloaded();
    if (by("weekly") && typeof WeeklyReportManager !== "undefined") WeeklyReportManager.onDataReloaded();
    if (typeof SmartMergeCenter !== "undefined") SmartMergeCenter.refreshMergeUiPermissions();
    return done;
  }
};
window.MergeTable = MergeTable;
