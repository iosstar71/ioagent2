// Workgroup 판: modules/dataio/merge-table.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(MergeTable, {
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
});
