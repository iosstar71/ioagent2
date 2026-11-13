// =============================================================================
// [Project Mgmt Local] 브라우저 저장소 (AppStore) — localStorage 대신 IndexedDB "pprjmgmt" 사용
// -----------------------------------------------------------------------------
//  - 전사 시스템과 같은 주소(xxx.com)를 쓰므로 localStorage(주소 전체가 약 5MB 를 나눠 씀)를 쓰지 않고
//    이 프로그램 전용 IndexedDB 에 저장 (용량이 크고 다른 시스템 자료와 섞이지 않음)
//  - 화면 코드는 그대로 동기 방식으로 씀: 시작할 때 전부 메모리로 읽어 두고, 쓰기는 바로 IndexedDB 에 반영
//  - IndexedDB 를 쓸 수 없는 브라우저(일부 사생활 보호 모드)는 localStorage 에 "pprjmgmt:" 접두어로 저장
//  - 화면을 다시 불러올 때는 AppStore.reload() — 저장이 끝난 뒤 다시 불러옴
// =============================================================================
var AppStore = {
  DB: "pprjmgmt",
  STORE: "kv",
  PREFIX: "pprjmgmt:",
  _m: new Map(),
  _db: null,
  _fallback: false,
  _pending: 0,
  _waiters: [],

  ready() {
    if (this._readyP) return this._readyP;
    this._readyP = new Promise(resolve => {
      const useFallback = () => {
        this._fallback = true;
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.PREFIX)) this._m.set(k.slice(this.PREFIX.length), localStorage.getItem(k));
          }
        } catch (e) {}
        resolve();
      };
      let req;
      try { req = indexedDB.open(this.DB, 1); } catch (e) { return useFallback(); }
      req.onupgradeneeded = () => { req.result.createObjectStore(this.STORE); };
      req.onerror = () => useFallback();
      req.onsuccess = () => {
        this._db = req.result;
        try {
          const tx = this._db.transaction(this.STORE, "readonly");
          const st = tx.objectStore(this.STORE);
          const cur = st.openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (c) { this._m.set(String(c.key), c.value); c.continue(); }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => useFallback();
        } catch (e) { useFallback(); }
      };
      // 브라우저가 저장소를 임의로 비우지 않도록 요청 (지원 브라우저만)
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    });
    return this._readyP;
  },

  _tx(fn) {
    if (this._fallback || !this._db) return;
    this._pending++;
    try {
      const tx = this._db.transaction(this.STORE, "readwrite");
      fn(tx.objectStore(this.STORE));
      const done = () => { this._pending--; if (!this._pending) { const w = this._waiters; this._waiters = []; w.forEach(f => f()); } };
      tx.oncomplete = done;
      tx.onerror = done;
      tx.onabort = done;
    } catch (e) { this._pending--; }
  },

  getItem(k) { k = String(k); return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) {
    k = String(k); v = String(v);
    this._m.set(k, v);
    if (this._fallback) { localStorage.setItem(this.PREFIX + k, v); return; }  // 용량 초과는 호출한 쪽에서 처리 (localStorage 와 같음)
    this._tx(st => st.put(v, k));
  },
  removeItem(k) {
    k = String(k);
    this._m.delete(k);
    if (this._fallback) { try { localStorage.removeItem(this.PREFIX + k); } catch (e) {} return; }
    this._tx(st => st.delete(k));
  },
  key(i) { return [...this._m.keys()][i] ?? null; },
  get length() { return this._m.size; },
  // 이 프로그램 자료만 지움 (전사 시스템 자료는 그대로)
  clear() {
    const keys = [...this._m.keys()];
    this._m.clear();
    if (this._fallback) { keys.forEach(k => { try { localStorage.removeItem(this.PREFIX + k); } catch (e) {} }); return; }
    this._tx(st => st.clear());
  },
  // 쓰기가 모두 끝날 때까지 기다림
  flush() { return this._pending ? new Promise(r => this._waiters.push(r)) : Promise.resolve(); },
  async reload() { await this.flush(); window.location.reload(); },
  // 사용량 (바이트, 대략)
  usageBytes() {
    let n = 0;
    this._m.forEach((v, k) => { n += (k.length + String(v).length) * 2; });
    return n;
  }
};
window.AppStore = AppStore;
