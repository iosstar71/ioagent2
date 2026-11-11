// =============================================================================
// [IOSTAR-PM v3.6.0] 첨부파일 (AttachManager) — 산출물 · 공지 · 게시물 · 회의록의 📎 (v3.7.0 에서 공지 · 게시물 · 회의록 추가)
// -----------------------------------------------------------------------------
//  - DB 서버 방식에서만 사용 (파일은 서버의 upload 폴더에 저장, 로컬 저장소 방식 · Standalone 은 안내만)
//  - 정책(서버 conf/app.ini [files]): 파일 1개 최대 20MB · 허용 확장자 · 같은 이름은 새 버전 ·
//    삭제하면 휴지통 30일 보관 뒤 자동 완전 삭제 (그 전에는 PM · 시스템관리자가 되살리기)
//  - 권한: 올리기 · 삭제 = 그 서브시스템 담당자와 PM · 총괄리더, 내려받기 = 프로젝트 참여자 전체
//          공지 · 게시물은 글쓴이와 PM · 시스템관리자, 회의록은 프로젝트 참여자 (삭제는 올린 사람과 PM · 시스템관리자)
//  - 공지 · 게시물 · 회의록은 한 건에 파일 5개까지
//  - 대상 행과 파일은 행의 fileKey(처음 첨부할 때 자동 부여)로 연결
// =============================================================================
var AttachManager = {
  FALLBACK: { maxBytes: 20 * 1024 * 1024, trashDays: 30, keepVersions: 10,
    extensions: "pdf hwp hwpx doc docx xls xlsx ppt pptx txt csv md png jpg jpeg gif bmp webp zip 7z".split(" ") },
  counts: {},
  policy: null,
  usedBytes: 0,
  trashCount: 0,
  cur: null,       // { type, ref, row, files, showOld, trash }
  _loadedFor: "",

  // 첨부 대상: 자료(데이터셋) · 행 찾기 · 창 제목 · 올릴 수 있는지
  TYPES: {
    deliverable: {
      dataset: "deliverablesData", name: "산출물",
      row: ref => deliverablesData[ref],
      title: r => `[${r.system}] ${r.round || ""} · ${r.name || ""}`,
      writable: r => AttachManager.canWrite(r.system)
    },
    notice: {
      dataset: "noticesData", name: "공지",
      row: ref => (noticesData || []).find(n => String(n.id) === String(ref)),
      title: r => `[공지] ${r.title || ""}`,
      writable: r => NoticeCommManager.hasNoticePermission(r)
    },
    post: {
      dataset: "communicationsData", name: "게시물",
      row: ref => (communicationsData || []).find(n => String(n.id) === String(ref)),
      title: r => `[게시물] ${r.title || String(r.content || "").slice(0, 40)}`,
      writable: r => NoticeCommManager.hasCommPermission(r)
    },
    meeting: {
      dataset: "meetingsData", name: "회의록",
      row: ref => (meetingsData || []).find(n => String(n.id) === String(ref)),
      title: r => `[회의] ${r.date || ""} · ${r.title || ""}`,
      writable: () => true
    }
  },

  available() {
    return typeof DbConnector !== "undefined" && DbConnector.isServerMode() && typeof ServerBackend !== "undefined" && !!ServerBackend.token;
  },
  rules() { return this.policy || this.FALLBACK; },
  isManager() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
    return !!u && (u.role === "SYS_ADMIN" || u.role === "PM");
  },
  canWrite(system) {
    return typeof Permission === "undefined" || !Permission.canWriteSubsystem || Permission.canWriteSubsystem(system);
  },
  fmtSize(n) {
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + "MB";
    if (n >= 1024) return Math.round(n / 1024) + "KB";
    return n + "B";
  },
  newKey() {
    const a = new Uint8Array(9);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return "F" + Array.from(a).map(b => b.toString(16).padStart(2, "0")).join("");
  },
  countOf(row, type) {
    return (row && row.fileKey && (this.counts[type || "deliverable"] || {})[row.fileKey]) || 0;
  },
  maxCount(type) { return ((this.rules().maxCount || {})[type]) || (type === "deliverable" ? 0 : 5); },
  isMine(f) {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
    return !!u && String(f.uploadedBy || "").toLowerCase() === String(u.empNo || "").toLowerCase();
  },

  // 산출물 표의 📎 칸
  cellHtml(idx, row) { return this.btnHtml("deliverable", idx, row); },
  // 📎 단추 (산출물 표 · 공지 · 게시물 · 회의록) — 파일 수는 updateBadges 로 다시 그림
  btnHtml(type, ref, row, label) {
    const n = this.countOf(row, type);
    return `<button type="button" class="btn btn-sm attach-btn${n ? " has-files" : ""}" data-atype="${type}" data-aref="${escapeAttr(String(ref))}" data-alabel="${escapeAttr(label || "")}" data-click="AttachManager.open" data-click-args="${UiEvents.args(type, ref)}" title="첨부파일 ${n ? n + "개" : "없음"} — 눌러서 올리기 · 내려받기">📎${label ? " " + escapeHtml(label) : ""}${n ? `<b>${n}</b>` : ""}</button>`;
  },
  updateBadges() {
    document.querySelectorAll(".attach-btn[data-atype]").forEach(btn => {
      const type = btn.dataset.atype;
      const ref = type === "deliverable" ? parseInt(btn.dataset.aref, 10) : btn.dataset.aref;
      const row = this.TYPES[type] && this.TYPES[type].row(ref);
      const n = this.countOf(row, type);
      const label = btn.dataset.alabel || "";
      btn.classList.toggle("has-files", !!n);
      btn.innerHTML = `📎${label ? " " + escapeHtml(label) : ""}${n ? `<b>${n}</b>` : ""}`;
      btn.title = `첨부파일 ${n ? n + "개" : "없음"} — 눌러서 올리기 · 내려받기`;
    });
  },

  // 프로젝트의 대상별 파일 수 (산출물 화면을 열 때 · 올리기/삭제 뒤)
  async refreshSummary(force) {
    if (!this.available()) { this.counts = {}; return; }
    const key = ProjectContext.current + "|" + ServerBackend.token;
    if (!force && this._loadedFor === key) return;
    this._loadedFor = key;
    const res = await ServerBackend.request("/api/files/summary", {});
    if (!res.ok) { this._loadedFor = ""; return; }
    this.counts = res.counts || {};
    this.policy = res.policy || null;
    this.usedBytes = res.usedBytes || 0;
    this.trashCount = res.trashCount || 0;
    this.updateBadges();
  },

  async open(type, ref) {
    const def = this.TYPES[type];
    const row = def && def.row(ref);
    if (!row) return;
    if (!this.available()) {
      showToast("📎 첨부파일은 DB 서버 방식으로 접속했을 때만 쓸 수 있습니다. (run_server.bat 으로 서버를 켜고 서버 주소로 접속)");
      return;
    }
    this.cur = { type, ref, row, files: [], showOld: false, trash: false };
    document.getElementById("attachModal").style.display = "flex";
    await this.reload();
  },
  async openTrash() {
    if (!this.available() || !this.isManager()) return;
    this.cur = { type: "deliverable", ref: null, row: null, files: [], showOld: true, trash: true };
    document.getElementById("attachModal").style.display = "flex";
    await this.reload();
  },
  close() {
    document.getElementById("attachModal").style.display = "none";
    this.cur = null;
  },

  async reload() {
    const c = this.cur;
    if (!c) return;
    if (c.trash) {
      const res = await ServerBackend.request("/api/files/list", { trash: true });
      c.files = res.ok ? res.files : [];
      if (res.policy) this.policy = res.policy;
      if (!res.ok) showToast("⚠️ " + (res.message || "휴지통을 불러오지 못했습니다."));
    } else if (c.row.fileKey) {
      const res = await ServerBackend.request("/api/files/list", { ownerType: c.type, ownerId: c.row.fileKey });
      c.files = res.ok ? res.files : [];
      if (res.policy) this.policy = res.policy;
      if (!res.ok) showToast("⚠️ " + (res.message || "첨부파일 목록을 불러오지 못했습니다."));
    } else {
      c.files = [];
    }
    this.render();
  },

  toggleOld() {
    if (!this.cur) return;
    this.cur.showOld = !this.cur.showOld;
    this.render();
  },

  render() {
    const c = this.cur;
    if (!c) return;
    const p = this.rules();
    const def = this.TYPES[c.type];
    const writable = !c.trash && def.writable(c.row);
    const mb = Math.round(p.maxBytes / 1024 / 1024);
    const max = c.trash ? 0 : this.maxCount(c.type);
    document.getElementById("attachTitle").textContent = c.trash ? "🗑 첨부파일 휴지통" : "📎 첨부파일";
    document.getElementById("attachTarget").textContent = c.trash
      ? `삭제한 파일은 ${p.trashDays}일 동안 보관한 뒤 자동으로 완전 삭제합니다.`
      : def.title(c.row);
    document.getElementById("attachDrop").style.display = writable ? "" : "none";
    document.getElementById("attachPolicy").textContent = c.trash ? ""
      : `${max ? `파일 ${max}개까지 · ` : ""}파일 1개 최대 ${mb}MB · 올릴 수 있는 유형: ${p.extensions.join(", ")} · 같은 이름으로 다시 올리면 새 버전(최근 ${p.keepVersions}개 보관) · 삭제하면 휴지통에 ${p.trashDays}일 보관`;
    document.getElementById("attachReadonly").style.display = (!c.trash && !writable) ? "" : "none";
    const trashBtn = document.getElementById("attachTrashBtn");
    trashBtn.style.display = (!c.trash && this.isManager()) ? "" : "none";
    trashBtn.textContent = `🗑 휴지통${this.trashCount ? " (" + this.trashCount + ")" : ""}`;

    // 같은 이름은 최신 버전만 먼저 보이고, [이전 버전] 을 누르면 모두 표시
    const latest = {};
    c.files.forEach(f => { const k = f.ownerId + "|" + f.name.toLowerCase(); if (!latest[k] || f.version > latest[k].version) latest[k] = f; });
    const olderCount = c.trash ? 0 : c.files.length - Object.keys(latest).length;
    const rows = c.trash || c.showOld ? c.files : c.files.filter(f => latest[f.ownerId + "|" + f.name.toLowerCase()] === f);
    const oldBtn = document.getElementById("attachOldBtn");
    oldBtn.style.display = olderCount ? "" : "none";
    oldBtn.textContent = c.showOld ? "최신 버전만 보기" : `이전 버전 ${olderCount}개 보기`;

    const body = document.getElementById("attachListBody");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="attach-empty">${c.trash ? "휴지통이 비어 있습니다." : "첨부한 파일이 없습니다."}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(f => {
      const isLatest = c.trash || latest[f.ownerId + "|" + f.name.toLowerCase()] === f;
      const acts = c.trash
        ? `<button class="btn btn-sm btn-secondary" data-click="AttachManager.restore" data-click-args="${UiEvents.args(f.id)}">되살리기</button>
           <button class="btn btn-sm btn-danger" data-click="AttachManager.purge" data-click-args="${UiEvents.args(f.id)}">완전 삭제</button>`
        : `<button class="btn btn-sm btn-primary" data-click="AttachManager.download" data-click-args="${UiEvents.args(f.id)}">내려받기</button>
           ${writable && (c.type === "deliverable" || this.isManager() || this.isMine(f)) ? `<button class="btn btn-sm btn-danger" data-click="AttachManager.remove" data-click-args="${UiEvents.args(f.id)}">삭제</button>` : ""}`;
      return `<tr class="${isLatest ? "" : "attach-old"}">
        <td class="attach-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</td>
        <td>v${f.version}</td>
        <td>${this.fmtSize(f.size)}</td>
        <td>${escapeHtml(f.uploadedName || f.uploadedBy || "")}<br><span class="attach-date">${escapeHtml(c.trash ? "삭제 " + f.deletedAt : f.uploadedAt || "")}</span></td>
        <td class="attach-acts">${acts}</td>
      </tr>`;
    }).join("");
  },

  // 올리기 전 화면에서 먼저 확인 (서버도 같은 규칙으로 다시 확인)
  check(file) {
    const p = this.rules();
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!p.extensions.includes(ext)) return `올릴 수 없는 파일 유형입니다: .${ext || "(확장자 없음)"}`;
    if (file.size > p.maxBytes) return `파일이 너무 큽니다: ${this.fmtSize(file.size)} (최대 ${Math.round(p.maxBytes / 1024 / 1024)}MB)`;
    if (!file.size) return "빈 파일은 올릴 수 없습니다.";
    return "";
  },

  pick() { document.getElementById("attachFileInput").click(); },
  onPicked(input) {
    const files = Array.from(input.files || []);
    input.value = "";
    this.uploadFiles(files);
  },
  onDrop(e) {
    e.preventDefault();
    document.getElementById("attachDrop").classList.remove("drag");
    this.uploadFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
  },

  async uploadFiles(files) {
    const c = this.cur;
    if (!c || c.trash || !files.length) return;
    const def = this.TYPES[c.type];
    if (!def.writable(c.row)) { showToast(c.type === "deliverable" ? `🚫 ${c.row.system} 서브시스템은 담당이 아니어서 올릴 수 없습니다.` : "🚫 글쓴이와 PM · 시스템관리자만 파일을 올릴 수 있습니다."); return; }
    const max = this.maxCount(c.type);
    if (max) {  // 공지 · 게시물 · 회의록: 한 건에 파일 5개까지 (같은 이름은 새 버전이라 개수에 넣지 않음)
      const names = new Set(c.files.map(f => f.name.toLowerCase()));
      const fresh = new Set(files.map(f => f.name.toLowerCase()).filter(n => !names.has(n)));
      if (names.size + fresh.size > max) { showToast(`⚠️ 파일은 한 건에 ${max}개까지 붙일 수 있습니다. (지금 ${names.size}개, 새로 ${fresh.size}개)`); return; }
    }
    if (!c.row.fileKey) {  // 대상 행과 파일을 잇는 열쇠 — 처음 첨부할 때 한 번 부여하고 바로 저장 (저장 전에 화면을 닫아도 연결이 남도록)
      c.row.fileKey = this.newKey();
      if (c.type === "meeting" && typeof MeetingManager !== "undefined" && MeetingManager._draft && String(MeetingManager._draft.id) === String(c.row.id)) MeetingManager._draft.fileKey = c.row.fileKey;
      const saved = await SyncManager.save([def.dataset]);
      const live = def.row(c.ref);  // 저장하면서 목록이 새로 바뀌었을 수 있음
      if (!saved || !saved.ok) {
        delete c.row.fileKey;
        if (live) delete live.fileKey;
        showToast(`⚠️ ${def.name} 목록을 먼저 저장해야 첨부할 수 있습니다. [💾 저장] 후 다시 올리세요.`);
        return;
      }
      if (live && !live.fileKey) live.fileKey = c.row.fileKey;
    }
    const status = document.getElementById("attachStatus");
    let done = 0;
    const failed = [];
    for (const file of files) {
      const bad = this.check(file);
      if (bad) { failed.push(`${file.name}: ${bad}`); continue; }
      status.textContent = `올리는 중… ${file.name} (${done + failed.length + 1}/${files.length})`;
      const res = await this._send(c, file);
      if (res.ok) done++;
      else failed.push(`${file.name}: ${res.message || "올리기 실패"}`);
    }
    status.textContent = "";
    if (done) showToast(`✅ 첨부파일 ${done}개를 올렸습니다.`);
    if (failed.length) showToast("⚠️ 올리지 못한 파일 — " + failed.join(" / "));
    await this.reload();
    await this.refreshSummary(true);
  },

  async _send(c, file) {
    const q = new URLSearchParams({ ownerType: c.type, ownerId: c.row.fileKey, system: c.type === "deliverable" ? (c.row.system || "") : "", name: file.name });
    try {
      const res = await fetch(ServerBackend.baseUrl() + "/api/files/upload?" + q.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Project-Id": ProjectContext.current, "Authorization": "Bearer " + ServerBackend.token },
        body: file,
        cache: "no-store"
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && typeof AuthManager !== "undefined" && AuthManager.onServerAuthExpired) AuthManager.onServerAuthExpired();
      return json;
    } catch (err) {
      return { ok: false, message: err.message || "서버 연결 실패" };
    }
  },

  async download(id) {
    const f = this.cur && this.cur.files.find(x => x.id === id);
    if (!f) return;
    try {
      const res = await fetch(ServerBackend.baseUrl() + "/api/files/download?id=" + encodeURIComponent(id), {
        headers: { "X-Project-Id": ProjectContext.current, "Authorization": "Bearer " + ServerBackend.token }, cache: "no-store"
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        showToast("⚠️ " + (j.message || "내려받지 못했습니다."));
        return;
      }
      ExcelSync._triggerDownload(await res.blob(), f.name);
    } catch (err) {
      showToast("⚠️ 내려받기 오류: " + (err.message || "서버 연결 실패"));
    }
  },

  remove(id) {
    const f = this.cur && this.cur.files.find(x => x.id === id);
    if (!f) return;
    openConfirmDialog(`[${f.name}] v${f.version} 을(를) 삭제할까요? 휴지통에 ${this.rules().trashDays}일 동안 보관되며, 그동안 PM · 시스템관리자가 되살릴 수 있습니다.`, async () => {
      const res = await ServerBackend.request("/api/files/delete", { id });
      showToast(res.ok ? "🗑 첨부파일을 휴지통으로 옮겼습니다." : "⚠️ " + (res.message || "삭제하지 못했습니다."));
      await this.reload();
      await this.refreshSummary(true);
    });
  },
  async restore(id) {
    const res = await ServerBackend.request("/api/files/restore", { id });
    showToast(res.ok ? "✅ 첨부파일을 되살렸습니다." : "⚠️ " + (res.message || "되살리지 못했습니다."));
    await this.refreshSummary(true);
    await this.reload();
  },
  purge(id) {
    const f = this.cur && this.cur.files.find(x => x.id === id);
    if (!f) return;
    openConfirmDialog(`[${f.name}] v${f.version} 을(를) 완전히 삭제할까요? 되돌릴 수 없습니다.`, async () => {
      const res = await ServerBackend.request("/api/files/purge", { id });
      showToast(res.ok ? "🗑 첨부파일을 완전히 삭제했습니다." : "⚠️ " + (res.message || "삭제하지 못했습니다."));
      await this.refreshSummary(true);
      await this.reload();
    });
  },

  // 엑셀 올리기로 산출물 행이 바뀌어도 첨부 연결(fileKey)이 끊기지 않게 (서브시스템 + 회차 + 산출물명으로 이어 붙임)
  _rowKey(r) { return [r.system, r.round, r.name].map(v => String(v || "").trim()).join("|"); },
  rememberKeys() {
    const map = {};
    (deliverablesData || []).forEach(r => { if (r.fileKey) map[this._rowKey(r)] = r.fileKey; });
    return map;
  },
  reapplyKeys(map) {
    (deliverablesData || []).forEach(r => { if (!r.fileKey && map[this._rowKey(r)]) r.fileKey = map[this._rowKey(r)]; });
  },

  init() {
    const drop = document.getElementById("attachDrop");
    if (!drop || this._ready) return;
    this._ready = true;
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", e => this.onDrop(e));
  }
};
window.AttachManager = AttachManager;
window.addEventListener("DOMContentLoaded", () => AttachManager.init());
