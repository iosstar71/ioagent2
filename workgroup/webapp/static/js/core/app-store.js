// =============================================================================
// Workgroup 판 브라우저 저장소 — 자료는 서버 DB 에 있고, 브라우저에는 화면 설정 정도만 남긴다.
// Standalone 판의 AppStore(IndexedDB)와 같은 이름 · 같은 쓰는 법을 localStorage 로 제공한다
// (공통 화면 코드가 AppStore 를 그대로 쓸 수 있게).
// =============================================================================
var AppStore = {
  ready() { return Promise.resolve(); },
  getItem(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  setItem(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  removeItem(k) { try { localStorage.removeItem(k); } catch (e) {} },
  key(i) { try { return localStorage.key(i); } catch (e) { return null; } },
  get length() { try { return localStorage.length; } catch (e) { return 0; } },
  keys() { const out = []; try { for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i)); } catch (e) {} return out; },
  flush() { return Promise.resolve(); },
  reload() { location.reload(); },
  usageBytes() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || "").length) * 2; } } catch (e) {} return n; }
};
window.AppStore = AppStore;
