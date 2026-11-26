// =============================================================================
// [Local] 멤버 자료 여러 파일 한꺼번에 합치기 (MergeBatch) — MergeTable.upload 에서 파일을 2개 이상 고르면
// -----------------------------------------------------------------------------
//  파일마다 [보낸 사람 · 범위(서브시스템, 여러 개 가능) · 기준 마스터 파일 · 보낸 시각 · 담긴 자료]를 표로 보여 주고
//  체크한 파일을 차례로 반영 (반영 전에 스냅샷 한 번). 파일의 범위는 파일 안의 targetScope 로 판단
//   - 범위가 전체(ALL)인 파일은 다른 멤버 자료를 덮어쓸 수 있어 여기서는 빼고, 하나씩 올리기로 안내
//   - 같은 서브시스템이 겹치는 파일이 여럿이면 가장 새 것만 체크 (나머지는 표시만)
//   - 이전 마스터 파일을 받아 작업한 파일은 "이전 기준" 으로 표시 (반영은 가능)
//   - 서브시스템 단위 자료(WBS · 요구사항 · 산출물 · VOC · 주간보고 · 회의록)만 반영. 프로젝트 단위 자료는 하나씩 올리기로
//   - 파일에 멤버 암호 정보가 있으면 함께 반영 (멤버 PC 에서 바꾼 암호 — MemberCred)
// =============================================================================
var MergeBatch = {
  _list: [],

  async open(files) {
    if (MergeTable._lockOn()) return showToast("ℹ️ 체크아웃 잠금을 쓰는 동안에는 파일을 하나씩 올리세요.");
    const subs = getAllSubsystemNames();
    const cur = projectConfig.packageStamp || "";
    const keys = MergeTable.ITEMS.filter(i => i.unit === "sys").map(i => i.k);
    const list = [];
    for (const file of files) {
      const row = { file, name: file.name, ok: true, notes: [], keys: [], counts: {} };
      try { row.parsed = await MergeTable.parseFile(file); } catch (err) { row.ok = false; row.notes.push(I18N.tf("읽지 못함: {m}", { m: err.message })); list.push(row); continue; }
      const src = row.parsed.json || row.parsed.meta || {};
      row.by = src.exportedBy || "";
      row.empNo = src.exportedByEmpNo || "";
      row.based = src.basedOn || "";
      row.at = src.exportedAt || new Date(file.lastModified || 0).toISOString();
      row.cred = typeof MemberCred !== "undefined" ? src.memberCredential || null : null;   // [Local] 멤버 PC 에서 바꾼 암호
      const sc = src.targetScope && !SubsysList.isAll(src.targetScope) ? SubsysList.parse(src.targetScope) : [];
      const unknown = sc.filter(x => !subs.includes(x));
      row.scope = sc.length ? SubsysList.join(sc) : "ALL";
      if (!sc.length) { row.ok = false; row.notes.push("범위가 전체인 파일 — 다른 멤버 자료를 덮어쓸 수 있어 하나씩 올리세요"); }
      else if (unknown.length) { row.ok = false; row.notes.push(I18N.tf("이 프로젝트에 없는 서브시스템: {s}", { s: unknown.join(", ") })); }
      keys.forEach(k => {
        let rows = null;
        try { rows = MergeTable.extract(row.parsed, k, null); } catch (e) { rows = null; }
        if (rows && rows.length) { row.keys.push(k); row.counts[k] = rows; }
      });
      if (row.cred) { const c = MemberCred.check(row.cred, src); if (!c.ok && !c.same) row.notes.push(I18N.tf("암호 정보 반영 안 함: {w}", { w: c.why })); }
      if (row.ok && !row.keys.length && !row.cred) { row.ok = false; row.notes.push("반영할 서브시스템 자료가 없음"); }
      if (row.ok) {
        const denied = row.keys.map(k => MergeTable.canUpload(k, row.scope)).find(p => !p.ok);
        if (denied) { row.ok = false; row.notes.push(denied.why); }
      }
      row.stale = !!(row.based && cur && row.based < cur);
      if (row.stale) row.notes.push(I18N.tf("이전 기준({a}) — 지금 {b}", { a: row.based, b: cur }));
      list.push(row);
    }
    // 같은 서브시스템이 겹치면 가장 새 파일만 체크
    const ordered = list.filter(r => r.ok).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const taken = new Set();
    ordered.forEach(r => {
      const mine = SubsysList.parse(r.scope);
      const dup = mine.filter(x => taken.has(x));
      r.checked = !dup.length;
      if (dup.length) r.notes.push(I18N.tf("{s} 는 더 새 파일이 있음", { s: dup.join(", ") }));
      mine.forEach(x => taken.add(x));
    });
    this._list = list;
    this.render();
  },

  render() {
    const m = document.getElementById("mergeBatchModal");
    const label = k => MergeTable.item(k).label;
    document.getElementById("mbBody").innerHTML = this._list.map((r, i) => `<tr class="${r.ok ? "" : "mp-off"}">
        <td class="u-tc"><input type="checkbox" class="mb-chk" data-i="${i}" ${r.ok && r.checked ? "checked" : ""} ${r.ok ? "" : "disabled"}></td>
        <td><b>${escapeHtml(r.name)}</b></td>
        <td>${escapeHtml(r.by || "-")}${r.empNo ? `<div class="mt-desc">${escapeHtml(r.empNo)}</div>` : ""}</td>
        <td><span class="status-badge-chip chip-progress">${escapeHtml(MergeTable._scopeLabel(r.scope))}</span></td>
        <td class="${r.stale ? "mb-stale" : ""}">${escapeHtml(r.based || "-")}</td>
        <td class="mt-desc">${escapeHtml(String(r.at || "").replace("T", " ").slice(0, 16))}</td>
        <td class="mt-desc">${r.keys.map(k => `<span>${escapeHtml(label(k))} ${r.counts[k].length}</span>`).join(" · ")}${r.cred ? ` · <span>${escapeHtml(I18N.t("암호 정보"))}</span>` : ""}</td>
        <td class="mt-desc">${r.notes.map(n => `<div>${escapeHtml(n)}</div>`).join("")}</td>
      </tr>`).join("");
    I18N.translateTree(m);
    m.style.display = "flex";
  },
  close() { document.getElementById("mergeBatchModal").style.display = "none"; this._list = []; },

  confirm() {
    const picks = [...document.querySelectorAll("#mbBody .mb-chk")].filter(c => c.checked && !c.disabled).map(c => this._list[+c.dataset.i]);
    if (!picks.length) return showToast("⚠️ 반영할 파일을 1개 이상 체크하세요.");
    // 체크한 파일끼리 서브시스템이 겹치면 나중 파일이 앞 파일을 덮으므로 막음
    const seen = {}, clash = [];
    picks.forEach(r => SubsysList.parse(r.scope).forEach(x => { if (seen[x]) clash.push(x); seen[x] = true; }));
    if (clash.length) return showToast(I18N.tf("⚠️ {s} 서브시스템이 겹치는 파일을 함께 체크했습니다. 하나만 체크하세요.", { s: [...new Set(clash)].join(", ") }));
    this.close();
    try {
      const backup = BackupHistoryManager.createBackupSnapshot(`멤버자료합치기(${picks.length}개)`, "ALL", true);
      const done = [];
      picks.forEach(r => {
        const plan = r.keys.map(k => MergeTable._planOne(k, r.counts[k], r.scope)).filter(p => p.ok);
        const parts = plan.length ? MergeTable.apply(plan, !!r.parsed.json) : [];
        const pw = r.cred ? MemberCred.apply(r.cred, r.parsed.json || r.parsed.meta || {}) : "";
        done.push(`${r.by || r.empNo || r.name} [${MergeTable._scopeLabel(r.scope)}] ${parts.join(", ")}${pw ? " · " + pw : ""}`);
      });
      showToast(I18N.tf("✅ [멤버 자료 {n}개 반영] 스냅샷: {b} — [💾 저장]을 눌러 기록하세요.", { n: picks.length, b: backup }));
      console.info("[MergeBatch]", done.join("\n"));
      if (typeof AuditLogPane !== "undefined") AuditLogPane.event("MERGE", `멤버 자료 ${picks.length}개`, `스냅샷 ${backup}`);
    } catch (err) {
      showToast("⚠️ 반영 오류: " + err.message);
    }
  }
};
window.MergeBatch = MergeBatch;
