// Workgroup 판: modules/dataio/merge-table.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(MergeTable, {
  ITEMS: [
    { k: "wbs", unit: "sys", icon: "📋", label: "WBS 공정표", desc: "계층 공정 · 가중치 · 계획/실적 일정 · 진척률" },
    { k: "req", unit: "sys", icon: "📌", label: "요구사항(REQ)", desc: "과제 · 추가 요구사항, 유형 · 상태" },
    { k: "deliverables", unit: "sys", icon: "📑", label: "산출물", desc: "차수별 산출물 계획/실적 · 검수 상태" },
    { k: "voc", unit: "sys", icon: "📣", label: "VOC / 이슈", desc: "현업 요청 · 우선순위 · 목표일 · 조치" },
    { k: "weekly", unit: "sys", icon: "📝", label: "주간보고", desc: "서브시스템 주간보고 (전체 범위면 종합 보고서 포함)" },
    { k: "meetings", unit: "sys", icon: "📅", label: "회의록 · Action Item", desc: "서브시스템 회의 (+ 종합 회의)" },
    { k: "notices", unit: "prj", icon: "📢", label: "공지", desc: "프로젝트 공지" },
    { k: "comms", unit: "prj", icon: "💬", label: "게시판", desc: "채널별 게시글 (채팅 제외)" },
    { k: "config", unit: "prj", icon: "🗂️", label: "프로젝트 설정", desc: "기본정보 · 도메인 · SDLC · 공휴일 · 표준 산출물" },
    { k: "subsystems", unit: "prj", icon: "🏢", label: "서브시스템 프로젝트 설정", desc: "도메인 · 코드/명 · SDLC 모델 · 가중치 · 담당" },
    { k: "users", unit: "prj", icon: "👥", label: "멤버(참여자)", desc: "멤버 ID · 이름 · 이 프로젝트의 역할 · 담당 · 부서" }
  ],
  _lockOn() { return typeof LockManager !== "undefined" && LockManager.active(); },
  download(format) {
    const keys = this.selected();
    if (!keys.length) return showToast("⚠️ 다운로드할 자료를 1개 이상 체크하세요.");
    const scope = this.scope();
    const tag = keys.length === this.ITEMS.length ? "ALL" : keys.join("_").toUpperCase();
    if (format === "JSON") {
      const payload = { schemaVersion: `AX_PMYS_${APP_VERSION.version}_MERGE`, exportCategory: "MERGE_TABLE", projectId: ProjectContext.current,
        projectName: ProjectData.currentName(), targetScope: scope, selectedItems: keys, exportedAt: new Date().toISOString() };
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
    const name = ExcelSync.stdName("자료", [scope, tag], "xlsx");
    ExcelSync._triggerDownload(ExcelSync._buildXlsxBlob(sheets), name);
    showToast(`📥 [자료 ${keys.length}종 · ${scope}] 엑셀 다운로드: ${name}`);
  },

  // ---- 올리기 ----
  async parseFile(file) {
    if (/\.json$/i.test(file.name)) {
      let d = JSON.parse(await file.text());
      if (d && Array.isArray(d.items) && d.items[0] && d.items[0].data) d = d.items[0].data;     // 프로젝트 백업 (JSON)
      else if (d && d.data && typeof d.data === "object" && !Array.isArray(d.data)) d = Object.assign({}, d.data, d.projectUsers ? { projectUsers: d.projectUsers } : {});
      return { json: d };
    }
    return { sheets: await ExcelSync._parseUploadedFile(file) };
  },

  // 시트마다 어떤 자료인지 (이름 → 머리줄)
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
    document.getElementById("mpNote").textContent = `[반영]을 누르면 지금 상태를 스냅샷으로 먼저 남깁니다${auto ? " (백업 JSON 파일도 다운로드음)" : ""}. 체크한 자료만 반영합니다.`;
    const m = document.getElementById("mergePreviewModal");
    if (typeof I18N !== "undefined" && I18N.translateTree) I18N.translateTree(m);
    m.style.display = "flex";
  },
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
      const keys = k === "deliverables" && typeof AttachManager !== "undefined" ? AttachManager.rememberKeys() : null;
      if (p.scope === "ALL" && p.lockedOut && p.lockedOut.length) {
        // 잠긴 서브시스템은 그대로 두고, 파일에 있는 서브시스템만 바꿈
        [...new Set(p.rows.map(r => this._sysOf(r)))].forEach(x => SmartMergeCenter._mergeWorkArrayData(k, p.rows.filter(r => this._sysOf(r) === x), x));
      } else SmartMergeCenter._mergeWorkArrayData(k, p.rows, p.scope);
      if (keys) AttachManager.reapplyKeys(keys);  // 첨부파일 연결 유지
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
});
