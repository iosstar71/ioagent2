// =============================================================================
// [Standalone] 저장할 때 JSON 파일도 남기기 (SaveFolder)
// -----------------------------------------------------------------------------
//  자료는 브라우저(IndexedDB)에만 있으므로 기록 삭제 · PC 교체에 대비해 [저장] 때 고른 폴더에 프로젝트 백업 JSON 도 씀
//   - 폴더: 처음 저장할 때 고름 (Chrome · Edge — File System Access API). 폴더는 브라우저가 기억하고, 다시 열면 권한만 한 번 다시 허용
//   - 파일: <폴더>/<프로젝트ID>_<프로젝트명>.json  (프로젝트 백업 형식 — [Admin > 프로젝트] 올리기 · [받은 마스터 파일 적용]으로 되살림)
//            덮어쓰기 전 파일은 <폴더>/backups/ 에 남김 (프로젝트마다 최근 KEEP 개)
//   - 폴더를 고를 수 없는 브라우저 · 폴더를 고르지 않기로 한 세션: 저장할 때마다 같은 JSON 을 내려받음
//   - 멤버 암호(해시)는 넣지 않음 (파일이 밖으로 나가도 암호가 함께 나가지 않게)
// =============================================================================
var SaveFolder = {
  DB: "pprjmgmt-files",
  KEEP: 10,
  handle: null,
  _mode: "",          // 이번 세션: "" 아직 안 물음 · "folder" · "download" · "off"
  supported() { return typeof window.showDirectoryPicker === "function"; },

  // 폴더 핸들은 문자열이 아니라서 AppStore 가 아닌 별도 IndexedDB 에 둠
  _db() {
    return new Promise((ok, no) => {
      const req = indexedDB.open(this.DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("h");
      req.onsuccess = () => ok(req.result);
      req.onerror = () => no(req.error);
    });
  },
  async _get() {
    try {
      const db = await this._db();
      return await new Promise(ok => { const r = db.transaction("h").objectStore("h").get("dir"); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
    } catch (e) { console.warn("[SaveFolder] read handle", e); return null; }
  },
  async _put(h) {
    try {
      const db = await this._db();
      await new Promise(ok => { const t = db.transaction("h", "readwrite"); if (h) t.objectStore("h").put(h, "dir"); else t.objectStore("h").delete("dir"); t.oncomplete = ok; t.onerror = ok; });
    } catch (e) { console.warn("[SaveFolder] keep handle", e); }
  },
  _loaded: false,
  async load() { this._loaded = true; if (this.supported()) { this.handle = await this._get(); if (this.handle) this._mode = "folder"; } this.renderInfo(); },
  label() { return this.handle ? this.handle.name : ""; },

  async connect() {
    if (!this.supported()) return showToast("ℹ️ 이 브라우저는 폴더 저장을 지원하지 않습니다 (Chrome · Edge). 저장할 때 JSON 파일을 내려받습니다.");
    let h;
    try { h = await window.showDirectoryPicker({ id: "pprjmgmt-save", mode: "readwrite" }); }
    catch (e) { return; }   // 고르지 않음
    this.handle = h;
    this._mode = "folder";
    await this._put(h);
    this.renderInfo();
    showToast(`📁 저장 폴더: ${h.name} — 이제 [💾 저장]할 때 프로젝트 JSON 파일도 이 폴더에 남깁니다.`);
    await this.write(true);
  },
  async disconnect() {
    this.handle = null;
    this._mode = "";
    await this._put(null);
    this.renderInfo();
    showToast("📁 저장 폴더 연결을 끊었습니다.");
  },
  async _permitted(ask) {
    if (!this.handle) return false;
    const o = { mode: "readwrite" };
    try {
      if ((await this.handle.queryPermission(o)) === "granted") return true;
      return ask ? (await this.handle.requestPermission(o)) === "granted" : false;
    } catch (e) { console.warn("[SaveFolder] permission", e); return false; }
  },

  // 지금 프로젝트의 백업 JSON (ProjectTransfer 의 프로젝트 백업 형식과 같음)
  payload() {
    const pid = ProjectContext.current;
    const name = ProjectData.currentName();
    return {
      schemaVersion: ProjectData.SCHEMA, appVersion: APP_VERSION.version, projectId: pid, projectName: name,
      exportedAt: new Date().toISOString(), exportedBy: (AuthManager.getCurrentUser() || {}).empNo || "",
      data: ProjectData.collect(), users: ProjectTransfer._usersOf(pid)
    };
  },
  fileName() {
    const safe = v => String(v || "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 60);
    return `${safe(ProjectContext.current)}_${safe(ProjectData.currentName())}.json`;
  },

  // [저장] 뒤 (SyncManager._commit) — 처음이면 어떻게 남길지 물음
  async afterSave() {
    if (!this._loaded) await this.load();
    if (this._mode === "off") return;
    if (!this._mode) {
      if (!this.supported()) this._mode = "download";
      else {
        const c = await SyncUI.ask("저장 파일 (JSON)", "브라우저에 저장한 자료를 JSON 파일로도 남깁니다. 브라우저 기록을 지우거나 PC 를 바꿔도 이 파일로 되살릴 수 있습니다.", [
          { id: "folder", label: "📁 폴더 고르기 (권장 — 저장할 때마다 자동)", cls: "btn-primary" },
          { id: "download", label: "📥 이번에는 내려받기", cls: "btn-secondary" },
          { id: "off", label: "남기지 않음 (이번 세션)", cls: "btn-secondary" }
        ]);
        if (c === "folder") return this.connect();
        this._mode = c === "download" ? "download" : "off";
        if (c !== "download") return;
      }
    }
    await this.write(true);
  },

  async write(ask) {
    const text = JSON.stringify(this.payload(), null, 2);
    const name = this.fileName();
    if (this._mode === "folder" && this.handle) {
      if (await this._permitted(ask)) {
        try {
          const dir = this.handle;
          await this._backupOld(dir, name);
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(text);
          await w.close();
          this.renderInfo(new Date());
          return true;
        } catch (e) {
          console.error("[SaveFolder] write", e);
          showToast(`⚠️ 저장 폴더에 JSON 파일을 쓰지 못했습니다: ${e.message} — 내려받기로 남깁니다.`);
        }
      } else {
        showToast("⚠️ 저장 폴더 사용 권한이 없어 JSON 파일을 내려받기로 남깁니다. [📦 마스터 파일 > 📁 저장 폴더]에서 다시 연결하세요.");
      }
    }
    ExcelSync._triggerDownload(new Blob([text], { type: "application/json;charset=utf-8" }), name);
    return true;
  },
  // 덮어쓰기 전 파일 → backups/<이름>_<시각>.json (최근 KEEP 개)
  async _backupOld(dir, name) {
    let old;
    try { old = await (await dir.getFileHandle(name)).getFile(); } catch (e) { return; }   // 처음 쓰는 파일
    const bdir = await dir.getDirectoryHandle("backups", { create: true });
    const stamp = new Date(old.lastModified || Date.now()).toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const base = name.replace(/\.json$/i, "");
    const w = await (await bdir.getFileHandle(`${base}_${stamp}.json`, { create: true })).createWritable();
    await w.write(await old.text());
    await w.close();
    const mine = [];
    for await (const [n] of bdir.entries()) if (n.startsWith(base + "_") && n.endsWith(".json")) mine.push(n);
    mine.sort();
    for (const n of mine.slice(0, Math.max(0, mine.length - this.KEEP))) { try { await bdir.removeEntry(n); } catch (e) { console.warn("[SaveFolder] prune", e); } }
  },

  // [📦 마스터 파일] 메뉴에 보이는 상태 줄
  renderInfo(at) {
    if (at) this._lastAt = at;
    const el = document.getElementById("saveFolderInfo");
    if (!el) return;
    el.textContent = this.handle
      ? I18N.tf("📁 저장 폴더: {n}", { n: this.handle.name }) + (this._lastAt ? ` · ${this._lastAt.toLocaleTimeString()}` : "")
      : (this.supported() ? I18N.t("📁 저장 폴더 없음 — 저장할 때 고릅니다") : I18N.t("📥 저장할 때 JSON 을 내려받습니다"));
  }
};
window.SaveFolder = SaveFolder;
