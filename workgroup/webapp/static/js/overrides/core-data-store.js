// Workgroup 판: core/data-store.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

var FileAutoSyncManager = {
  fileHandle: null,
  fileName: "",

  async openExistingFileHandle() {
    if (typeof Features !== "undefined" && !Features.on("local_file_sync")) return;
    if (!("showOpenFilePicker" in window)) {
      showToast("현재 브라우저는 File System Access API를 지원하지 않습니다. (Chrome/Edge PC 환경에서 지원)");
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "WBS 프로젝트 JSON 파일", accept: { "application/json": [".json"] } }],
        multiple: false
      });
      this.fileHandle = handle;
      this.fileName = handle.name;
      this.updateStatus(true);
      await this.reloadFromFileHandle(true);
    } catch (err) {
      if (err.name !== "AbortError") console.error("기존 JSON 열기 실패:", err);
    }
  },

  async reloadFromFileHandle(isInitialOpen = false) {
    if (!this.fileHandle) {
      showToast("먼저 [📂 기존 JSON 열기/연결] 또는 [💾 새 JSON 연결]로 로컬 파일을 지정해주세요.");
      return;
    }
    try {
      const file = await this.fileHandle.getFile();
      const data = JSON.parse(await file.text());
      DataRegistry.apply(data);
      if (typeof renderProjectTitles === "function") renderProjectTitles();
      // 파일에서 읽은 데이터는 "변경분"으로 취급 → 저장 시 저장소에 반영
      SyncManager.afterDataApplied(DataRegistry.KEYS, true);
      if (SyncManager.isAutoSave()) SyncManager.onDataChanged(true);
      if (typeof JsonCollabManager !== "undefined") JsonCollabManager.closeCollabModal();
      showToast(isInitialOpen
        ? `로컬 파일 [${this.fileName}] 을 열어 데이터를 로드하고 실시간 동기화를 연결했습니다.`
        : `로컬 파일 [${this.fileName}] 에서 최신 변경 데이터를 다시 읽어왔습니다.`);
    } catch (err) {
      showToast("로컬 JSON 파일 읽기 오류: " + err.message);
    }
  },

  async setupFileHandle() {
    if (typeof Features !== "undefined" && !Features.on("local_file_sync")) return;
    if (!("showSaveFilePicker" in window)) {
      showToast("현재 브라우저는 File System Access API를 지원하지 않습니다. (Chrome/Edge PC 환경에서 지원)");
      return;
    }
    try {
      this.fileHandle = await window.showSaveFilePicker({
        suggestedName: `WBS_Realtime_Sync_${projectConfig.reportDate}.json`,
        types: [{ description: "WBS 프로젝트 백업 JSON 파일", accept: { "application/json": [".json"] } }]
      });
      this.fileName = this.fileHandle.name;
      this.updateStatus(true);
      await this.syncNow(false);
      showToast(`로컬 파일 [${this.fileName}] 에 실시간 자동 동기화 연결이 완료되었습니다.`);
    } catch (err) {
      if (err.name !== "AbortError") console.error("파일 핸들 생성 실패:", err);
    }
  },

  async syncNow(showAlert = false) {
    if (typeof Features !== "undefined" && !Features.on("local_file_sync")) return;
    if (!this.fileHandle) return;
    try {
      const payload = Object.assign({ exportedAt: new Date().toISOString(), schemaVersion: `AX_PMYS_${APP_VERSION.version}` }, DataRegistry.collect());
      const writable = await this.fileHandle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      const badge = document.getElementById("fileSyncBadge");
      if (badge) {
        badge.innerText = `파일동기화 (${new Date().toLocaleTimeString()})`;
        badge.className = "status-badge-chip chip-completed";
      }
      if (showAlert) showToast(`로컬 파일 [${this.fileName}] 에 최신 데이터(게시판 · 채팅·회의·주간보고 포함)가 저장되었습니다.`);
    } catch (err) {
      const badge = document.getElementById("fileSyncBadge");
      if (badge) {
        badge.innerText = "동기화 권한필요";
        badge.className = "status-badge-chip chip-delayed";
      }
    }
  },

  updateStatus(connected) {
    const badge = document.getElementById("fileSyncBadge");
    const detail = document.getElementById("fileSyncDetailStatus");
    const btn = document.getElementById("btnFileHandleSync");
    if (connected && this.fileName) {
      if (badge) {
        badge.style.display = "inline-flex";
        badge.innerText = `동기화: ${this.fileName}`;
        badge.className = "status-badge-chip chip-completed";
      }
      if (detail) detail.innerHTML = `<span style="color:var(--success); font-weight:bold;">🟢 연결됨 (${escapeHtml(this.fileName)})</span> - 저장 시 자동 덮어쓰기 활성화`;
      if (btn) btn.innerText = `📁 [연결됨] ${this.fileName}`;
    } else {
      if (badge) badge.style.display = "none";
      if (detail) detail.innerHTML = "미연결 (버튼을 눌러 백업할 JSON 파일을 지정하세요)";
      if (btn) btn.innerText = "📁 동기화 파일 연결";
    }
  },

  disconnect() {
    this.fileHandle = null;
    this.fileName = "";
    this.updateStatus(false);
    showToast("로컬 파일 실시간 자동 동기화 연결이 해제되었습니다.");
  }
};

window.FileAutoSyncManager = FileAutoSyncManager;

Object.assign(LocalBackend, {
  async load(keys) {
    const data = {};
    const revs = {};
    const cache = {};
    // [v3.0.0] 로컬 저장소 사용자 1회 이관 (프로젝트별 참여 정보)
    try {
      const st = this._read(ProjectContext.DEFAULT);
      if (st && Array.isArray(st.projectUsers)) {
        if (ProjectContext.migrateLocalUsers(st.projectUsers)) this._write(ProjectContext.DEFAULT, st, this._readRevs(ProjectContext.DEFAULT));
        // [v3.7.0] 시스템관리자 계정 하나 더 (admin2 / 초기 비밀번호 1234) — 없을 때 한 번만 추가
        if (localStorage.getItem("IOSTAR_SECOND_ADMIN") !== "1") {
          localStorage.setItem("IOSTAR_SECOND_ADMIN", "1");
          if (!st.projectUsers.some(u => String(u.empNo || "").toLowerCase() === "admin2")) {
            const at = st.projectUsers.findIndex(u => String(u.empNo || "").toLowerCase() === "admin") + 1;
            st.projectUsers.splice(at, 0, { empNo: "admin2", name: "시스템관리자2", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko", projectRoles: {} });
            const rv = this._readRevs(ProjectContext.DEFAULT);
            if (rv.projectUsers) rv.projectUsers.admin2 = { rev: 1, by: "system", at: new Date().toLocaleString() };
            this._write(ProjectContext.DEFAULT, st, rv);
          }
        }
      } else {
        localStorage.setItem(ProjectContext.MIGRATE_KEY, "1"); // 새로 설치: 이관할 이전 데이터 없음
      }
    } catch (e) {}
    (keys || DataRegistry.KEYS).forEach(k => {
      const pid = this._pidFor(k);
      if (!cache[pid]) cache[pid] = { stored: this._read(pid) || {}, revs: this._readRevs(pid) };
      if (k in cache[pid].stored) data[k] = cache[pid].stored[k];
      revs[k] = cache[pid].revs[k] || {};
    });
    return { ok: true, data, revs };
  },
});

Object.assign(ServerBackend, {
  async request(path, body, method = "POST", timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { "Content-Type": "application/json", "X-Project-Id": ProjectContext.current };
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    try {
      const res = await fetch(this.baseUrl() + path, {
        method,
        headers,
        body: method === "GET" ? undefined : JSON.stringify(body || {}),
        signal: controller.signal,
        cache: "no-store"
      });
      clearTimeout(timer);
      const json = await res.json().catch(() => ({}));
      json.httpStatus = res.status;
      if (typeof ServerHeartbeat !== "undefined" && !ServerHeartbeat.online) ServerHeartbeat.setOnline(true);
      if (res.status === 401) {
        json.authRequired = true;
        if (typeof AuthManager !== "undefined" && AuthManager.onServerAuthExpired) AuthManager.onServerAuthExpired();
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      // [Workgroup] 주기 확인 대신, 사용자 요청이 실패했을 때 연결 끊김 표시
      if (typeof ServerHeartbeat !== "undefined" && ServerHeartbeat.online && !(typeof Features !== "undefined" && Features.on("server_heartbeat"))) ServerHeartbeat.setOnline(false);
      return { ok: false, network: true, message: err && err.name === "AbortError" ? "서버 응답 시간 초과" : (err.message || "서버 연결 실패") };
    }
  },

  async load(keys) {
    const res = await this.request("/api/db/load", { keys: keys || null });
    if (!res.ok) return { ok: false, error: res.message || "DB 조회 실패", network: res.network, authRequired: res.authRequired };
    if (res.locks && typeof LockManager !== "undefined") LockManager.update(res.locks);  // [Workgroup] 잠금 현황을 함께 받음
    return { ok: true, data: res.data || {}, revs: res.revs || {} };
  },

  async save(changes, force, who, opts = {}) {
    const res = await this.request("/api/db/save", { changes, force: !!force, lockBypass: !!opts.lockBypass }, "POST", 20000);
    if (res.locks && typeof LockManager !== "undefined") LockManager.update(res.locks);
    // [Workgroup] 체크아웃 잠금으로 막힘 — 아무것도 저장되지 않음
    if (res.httpStatus === 423 || res.locked) return { ok: false, locked: res.locked || [] };
    if (res.httpStatus === 409 || res.conflict) return { ok: false, conflict: true, conflicts: res.conflicts || [] };
    if (!res.ok) return { ok: false, error: res.message || "DB 저장 실패", network: res.network, authRequired: res.authRequired };
    return { ok: true, data: res.data || {}, revs: res.revs || {}, blocked: res.blocked || [] };
  }
});

Object.assign(SyncManager, {
  blockedSummary(diffResult) {
    const list = [];
    Object.keys(diffResult).forEach(k => {
      const bl = diffResult[k].blocked || [];
      if (!bl.length || k === "theme") return;
      if (k === "projectConfig") {
        const base = (this.baselineVal[k] || new Map()).get(Partition.WHOLE) || {};
        const a = Object.assign({}, base, { reportDate: "" });
        const b = Object.assign({}, projectConfig, { reportDate: "" });
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
    // [v1.0.10] 보관된 프로젝트는 시스템관리자 외에는 읽기 전용
    const proj = ProjectContext.info();
    if (proj && proj.status === "ARCHIVED" && Permission.user().baseRole !== "SYS_ADMIN") {
      if (opts.notify || !this._archivedNotified) showToast("📦 사용 중지(보관)된 프로젝트는 읽기 전용입니다. 변경 내용은 저장되지 않습니다.");
      this._archivedNotified = true;
      return { ok: false, archived: true };
    }
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
      if (FileAutoSyncManager.fileHandle && opts.forceFile) FileAutoSyncManager.syncNow(false);
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
    if (res.locked && typeof LockManager !== "undefined") {
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
    if (typeof LockManager !== "undefined" && LockManager.active()) LockManager.afterSave();
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

  // 다른 사용자가 먼저 저장한 데이터가 있을 때: 덮어쓰기 / 무시하기 / 취소
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
          showToast("🚀 최초 실행: 초기 프로젝트 데이터(initial_data.json)를 브라우저 로컬 저장소에 설정했습니다.");
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
    if (typeof LockManager !== "undefined") LockManager.restoreHeld();  // [Workgroup] 보류한 변경 다시 올림
    return { ok: true };
  },

  // 데이터 일괄 교체(샘플 복원/초기화/백업 복원) 후 저장
});

Object.assign(SyncUI, {
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
    if (typeof LockManager !== "undefined") LockManager.renderBadge();
  },

  // 범용 선택 모달 → Promise<choiceId>
});
