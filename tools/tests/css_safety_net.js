// =============================================================================
// CSS safety net — "the screens look exactly the same" check, and !important pruning
// -----------------------------------------------------------------------------
//  Captures the computed style of every visible element on every screen
//  (6 themes x all tabs / sub tabs / open menus / detail panel / left menu / large text)
//  with the sample project, and compares two style sheets.
//
//  node tools/tests/css_safety_net.js --compare <old.css>   current style.css vs old.css (exit 1 if any screen differs)
//  node tools/tests/css_safety_net.js --save <file.json>      remember how every screen looks now (index.html + style.css)
//  node tools/tests/css_safety_net.js --check <file.json>     compare with --save (use when moving inline styles into classes)
//  node tools/tests/css_safety_net.js --prune-important     remove every !important whose removal changes nothing,
//                                                           write static/css/style.css (verified as a whole)
//  Only rules that match something on the captured screens are touched; rules for :hover / :focus,
//  pseudo elements and @media / @supports blocks are left as they are.
//  Console output is English (shared tool rule).
// =============================================================================
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const WEB = fs.existsSync(path.join(ROOT, "webapp", "index.html")) ? path.join(ROOT, "webapp") : ROOT;
const CSS_FILE = path.join(WEB, "static", "css", "style.css");
const PY = process.platform === "win32" ? "python" : "python3";
const THEMES = ["urban-slate", "brown", "navy", "classic", "dark", "electric"];

function freePort() { return new Promise(r => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); }); }

// ---- CSS: top-level rules and their !important declarations ----
function scanRules(css) {
  const rules = []; let i = 0, depth = 0;
  const skipComment = j => css.indexOf("*/", j) + 2;
  while (i < css.length) {
    if (css.startsWith("/*", i)) { i = skipComment(i); continue; }
    const b = css.indexOf("{", i); if (b < 0) break;
    const sel = css.slice(i, b);
    let d = 0, j = b;
    for (; j < css.length; j++) { if (css.startsWith("/*", j)) { j = skipComment(j) - 1; continue; } if (css[j] === "{") d++; else if (css[j] === "}") { d--; if (!d) break; } }
    if (!sel.trim().startsWith("@")) rules.push({ sel: sel.trim(), bodyStart: b + 1, bodyEnd: j });
    i = j + 1;
  }
  void depth;
  return rules;
}
function candidates(css) {
  const out = [];
  scanRules(css).forEach((r, ri) => {
    if (/:hover|:focus|:active|:visited|::|:-webkit-|:-moz-/.test(r.sel)) return;
    const body = css.slice(r.bodyStart, r.bodyEnd);
    const re = /\s*!important/g; let m;
    while ((m = re.exec(body))) {
      const before = body.slice(0, m.index); const d = before.slice(Math.max(before.lastIndexOf(";"), before.lastIndexOf("{")) + 1);
      const prop = d.slice(0, d.indexOf(":")).trim().toLowerCase();
      out.push({ id: out.length, rule: ri, sel: r.sel, prop, decl: d.trim(), at: r.bodyStart + m.index, len: m[0].length });
    }
  });
  return out;
}
// !important 가 없는 선언 통째로 (쓰이지 않는 선언 지우기용)
function declCandidates(css, selRe) {
  const out = [];
  scanRules(css).forEach(r => {
    if (!selRe.test(r.sel) || /:hover|:focus|:active|::/.test(r.sel)) return;
    const body = css.slice(r.bodyStart, r.bodyEnd); const re = /[^;{}]+;?/g; let m;
    while ((m = re.exec(body))) {
      const d = m[0]; if (!d.includes(":") || /!important/.test(d) || d.trim().startsWith("/*")) continue;
      const prop = d.slice(0, d.indexOf(":")).trim().toLowerCase(); if (!/^-?[a-z][a-z0-9-]*$/.test(prop)) continue;
      out.push({ id: out.length, sel: r.sel, prop, decl: d.trim(), at: r.bodyStart + m.index, len: d.length });
    }
  });
  return out;
}
function withRemoved(css, list) {
  const sorted = list.slice().sort((a, b) => b.at - a.at);
  let s = css;
  sorted.forEach(c => { s = s.slice(0, c.at) + s.slice(c.at + c.len); });
  return s;
}

// ---- browser: states and computed-style hashes ----
async function openApp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csssafety_"));
  // 한 코드 저장소의 index.html 에는 판 표시가 있어 Standalone 판으로 그려서 엶 (static 은 링크 — 고친 CSS 가 그대로 보임)
  const app = path.join(tmp, "pprjmgmt");
  if (WEB === ROOT && fs.existsSync(path.join(ROOT, "tools", "edition.py"))) {
    fs.mkdirSync(app);
    fs.readdirSync(ROOT).filter(f => f === "static" || /\.html$/.test(f)).forEach(f => fs.symlinkSync(path.join(ROOT, f), path.join(app, f)));
    fs.unlinkSync(path.join(app, "index.html"));
    execFileSync(PY, [path.join(ROOT, "tools", "edition.py"), "render", "standalone", path.join(app, "index.html")], { stdio: "ignore" });
  } else fs.symlinkSync(WEB, app);
  const port = await freePort();
  const srv = spawn(PY, ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: tmp, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  // 실행마다 같은 화면이 되도록: 무작위 값 고정, 시계는 오늘 정오에서 시작
  await page.addInitScript(() => {
    let seed = 12345; Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const RealDate = Date, t0 = new RealDate(); t0.setHours(12, 0, 0, 0); const start = RealDate.now(), base = t0.getTime();
    class FixedDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(base + (RealDate.now() - start)); } static now() { return base + (RealDate.now() - start); } }
    window.Date = FixedDate;
  });
  await page.goto(`http://127.0.0.1:${port}/pprjmgmt/index.html`); await page.waitForTimeout(1500);
  await page.fill("#inputSecurityEmpNo", "admin"); await page.fill("#inputSecurityPassword", "1234"); await page.click("#btnLockSubmit"); await page.waitForTimeout(1300);
  if (await page.$eval("#pwdChangeFormPane", e => getComputedStyle(e).display !== "none").catch(() => false)) {   // 처음 들어올 때 암호 변경
    await page.fill("#pcNewPwd", "Pmadmin2026x"); await page.fill("#pcNewPwd2", "Pmadmin2026x");
    await page.click('#pwdChangeFormPane [data-click="AuthManager.changePasswordFromLogin"]'); await page.waitForTimeout(1500);
  }
  if (await page.evaluate(() => typeof SampleProject !== "undefined")) {
    await page.evaluate(() => SampleProject.add()); await page.waitForTimeout(300); await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(1200);
    await page.evaluate(async () => { const x = ProjectContext.localList().find(x => /샘플/.test(x.name)); if (x) await ProjectManager.switchTo(x.id); }); await page.waitForTimeout(2000);
  }
  // 시험용 스타일시트로 바꿔 끼울 자리 (원래 link 는 끔)
  await page.evaluate(() => {
    document.querySelectorAll('link[rel="stylesheet"][href*="style.css"]').forEach(l => l.disabled = true);
    const st = document.createElement("style"); st.id = "cssUnderTest"; document.head.appendChild(st);
    const fx = document.createElement("style"); fx.textContent = "#toastContainer,.toast-container{display:none!important}*{transition:none!important;animation:none!important}"; document.head.appendChild(fx);
    window.__STATES = [];
    const T = ["tab-mywork","tab-home","tab-dashboard","tab-matrix","tab-wbs","tab-gantt","tab-req","tab-voc","tab-deliverables","tab-weekly-report","tab-meeting","tab-notices","tab-merge","tab-config","tab-master"];
    const S = window.__STATES, go = t => { GShell.go(t); window.scrollTo(0, 0); };
    T.forEach(t => S.push({ name: t, run: () => go(t) }));
    ["basic","holiday","phase","deliv","users","ui-screen","ui-channel"].forEach(n => S.push({ name: "master:" + n, run: () => { go("tab-master"); MasterSubTabs.show(n); } }));
    ["project","users","process","security","data","db"].forEach(n => S.push({ name: "config:" + n, run: () => { go("tab-config"); SubTabs.show("config", n); } }));
    ["minutes","actionitems"].forEach(n => S.push({ name: "meeting:" + n, run: () => { go("tab-meeting"); MeetingManager.switchSubTab(n); }, after: () => MeetingManager.switchSubTab("schedule") }));
    S.push({ name: "merge:backup", run: () => { go("tab-merge"); SubTabs.show("merge", "backup"); } });
    ["gUiMenu","gUserMenu","gStatusMenu","gPkgMenu","gAdminMenu"].forEach(id => S.push({ name: "menu:" + id, run: () => { go("tab-home"); const m = document.getElementById(id); if (m) m.hidden = false; }, after: () => { const m = document.getElementById(id); if (m) m.hidden = true; } }));
    // 대화상자: 빈 상태로 열어 틀 모양만 봄 (인라인 스타일을 클래스로 옮길 때 확인)
    document.querySelectorAll(".modal-overlay[id]").forEach(m => S.push({ name: "modal:" + m.id, run: () => { go("tab-home"); m.style.display = "flex"; }, after: () => { m.style.display = ""; } }));
    S.push({ name: "wbs:detail", run: () => { go("tab-wbs"); const i = wbsData.findIndex(t => t.isLeaf); if (i >= 0) NeoDetail.open(i); }, after: () => NeoDetail.close() });
    S.push({ name: "sidebar:wbs", run: () => { LayoutManager.setLayout("sidebar-left", false); go("tab-wbs"); }, after: () => LayoutManager.setLayout("top-nav", false) });
    S.push({ name: "large:home", run: () => { UiScale.set(1.3); go("tab-home"); }, after: () => UiScale.set(1) });
    const P = ["color","backgroundColor","backgroundImage","borderTopColor","borderRightColor","borderBottomColor","borderLeftColor","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
      "borderTopStyle","borderLeftStyle","borderTopLeftRadius","borderBottomRightRadius","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","paddingTop","paddingRight","paddingBottom","paddingLeft",
      "marginTop","marginRight","marginBottom","marginLeft","display","width","height","minWidth","maxWidth","boxShadow","opacity","textDecorationLine","visibility","position","top","left","gap","cursor",
      "whiteSpace","textAlign","verticalAlign","zIndex","overflowX","overflowY","transform","filter","outlineStyle","flexDirection","justifyContent","alignItems","fill","stroke"];
    // 메모리를 아끼려고 문자열을 모으지 않고 바로 해시에 섞음
    window.__ALLP = P;
    window.__snap = (theme, props, sels) => {
      const P = props || window.__ALLP;
      document.body.setAttribute("data-theme", theme);
      let x = 2166136261, n = 0;
      const mix = str => { for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } };
      // sels 가 있으면 그 규칙이 걸리는 요소와 그 안쪽만 (묶음 시험을 빠르게 — 마지막 전체 확인은 모든 요소)
      let all = document.body.getElementsByTagName("*");
      if (sels) {
        const set = new Set();
        sels.forEach(sl => { let found = []; try { found = document.querySelectorAll(sl.replace(/::?(before|after|placeholder|selection)\b/g, "")); } catch (e) {}
          found.forEach(e => { set.add(e); for (const d of e.getElementsByTagName("*")) set.add(d); if (e.parentElement) set.add(e.parentElement); }); });
        all = [...set];
      }
      for (let k = 0; k < all.length; k++) {
        const e = all[k];
        if (e.tagName === "SCRIPT" || e.tagName === "STYLE" || e.tagName === "OPTION") continue;
        const cs = getComputedStyle(e); if (cs.display === "none") continue;
        if (!e.offsetParent && cs.position !== "fixed" && !(e instanceof SVGElement)) continue;
        for (let j = 0; j < P.length; j++) mix(cs[P[j]]);
        if (window.__DUMP) window.__DUMP.push(e.tagName + "." + (typeof e.className === "string" ? e.className : "") + " | " + P.map(p => p + "=" + cs[p]).join(" "));
        n++;
      }
      return (x >>> 0).toString(36) + ":" + n;
    };
    // 화면에 보이는 요소에 걸리는지 (숨은 화면의 요소는 그 화면에서 판정)
    window.__matches = sels => sels.map(s => { try { return [...document.querySelectorAll(s.replace(/::?(before|after|placeholder|selection)\b/g, ""))].some(e => e.offsetParent || getComputedStyle(e).position === "fixed" || e instanceof SVGElement && e.getBoundingClientRect().width > 0); } catch (e) { return false; } });
  });
  return { page, close: async () => { await browser.close(); srv.kill(); } };
}

async function setCss(page, css) { await page.evaluate(c => { document.getElementById("cssUnderTest").textContent = c; }, css); }

// state x theme -> hash (only states in `only`, if given)
async function snapshot(page, only, props, themes, wait, sels) {
  return page.evaluate(async ([themes, only, props, wait, sels]) => {
    const res = {};
    await new Promise(r => setTimeout(r, 1500));   // 첫 화면의 늦게 붙는 아이콘 · 배지가 다 붙을 때까지
    for (let si = 0; si < window.__STATES.length; si++) {
      if (only && !only.includes(si)) continue;
      const st = window.__STATES[si];
      st.run(); await new Promise(r => setTimeout(r, wait || 250));   // 늦게 그려지는 화면(Phase 진척 등)까지 기다림
      for (const th of themes) res[si + "|" + th] = window.__snap(th, props, sels);
      if (st.after) st.after();
    }
    return res;
  }, [themes || THEMES, only || null, props || null, wait || 0, sels || null]);
}
async function matchesPerState(page, sels) {
  return page.evaluate(async sels => {
    const out = [];
    for (let si = 0; si < window.__STATES.length; si++) {
      const st = window.__STATES[si]; st.run(); await new Promise(r => setTimeout(r, 60));
      out.push(window.__matches(sels));
      if (st.after) st.after();
    }
    return out;
  }, sels);
}
const same = (a, b, keys) => keys.every(k => a[k] === b[k]);
// 선언 속성이 바꿀 수 있는 계산 스타일 (크기 · 위치는 항상 함께 봄 — 밀려나는 것 확인)
const SIDES = ["Top", "Right", "Bottom", "Left"];
function propsFor(list) {
  const out = new Set(["width", "height", "display", "visibility"]);
  const camel = p => p.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  list.forEach(c => {
    const p = c.prop;
    if (p === "background") ["backgroundColor", "backgroundImage"].forEach(x => out.add(x));
    else if (p === "border" || /^border-(top|right|bottom|left)$/.test(p) || p === "border-color" || p === "border-width" || p === "border-style")
      SIDES.forEach(s => ["Color", "Width", "Style"].forEach(k => out.add("border" + s + k)));
    else if (p === "border-radius") ["borderTopLeftRadius", "borderBottomRightRadius", "borderTopRightRadius", "borderBottomLeftRadius"].forEach(x => out.add(x));
    else if (p === "padding" || p === "margin") SIDES.forEach(s => out.add(p + s));
    else if (p === "font") ["fontSize", "fontWeight", "fontStyle", "lineHeight", "fontFamily"].forEach(x => out.add(x));
    else if (p === "overflow") ["overflowX", "overflowY"].forEach(x => out.add(x));
    else if (p === "text-decoration") out.add("textDecorationLine");
    else if (p === "flex") ["flexGrow", "flexShrink", "flexBasis"].forEach(x => out.add(x));
    else if (p === "gap") ["rowGap", "columnGap"].forEach(x => out.add(x));
    else if (p === "outline") ["outlineStyle", "outlineWidth", "outlineColor"].forEach(x => out.add(x));
    else if (p === "inset") ["top", "right", "bottom", "left"].forEach(x => out.add(x));
    else out.add(camel(p));
    if (p === "color") ["borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "fill", "stroke", "outlineColor", "textDecorationColor", "caretColor"].forEach(x => out.add(x));
    if (/^(font|line-height|letter-spacing)/.test(p)) ["lineHeight", "fontSize"].forEach(x => out.add(x));
  });
  return [...out];
}

async function compare(oldCss) {
  const { page, close } = await openApp();
  const cur = fs.readFileSync(CSS_FILE, "utf8");
  await setCss(page, oldCss); const a = await snapshot(page);
  await setCss(page, cur); const b = await snapshot(page);
  const diff = Object.keys(a).filter(k => a[k] !== b[k]);
  const names = await page.evaluate(() => window.__STATES.map(s => s.name));
  await close();
  if (!diff.length) { console.log(`[OK] all ${Object.keys(a).length} screen x theme states look the same`); return 0; }
  console.log(`[FAIL] ${diff.length} states differ:`); diff.slice(0, 30).forEach(k => { const [si, th] = k.split("|"); console.log("   - " + names[si] + " / " + th); });
  return 1;
}

async function pruneSlow() {
  const css = fs.readFileSync(CSS_FILE, "utf8");
  const cand = candidates(css);
  let { page, close } = await openApp();
  await setCss(page, css);
  const sels = [...new Set(cand.map(c => c.sel))];
  const per = await matchesPerState(page, sels);
  const selIdx = new Map(sels.map((s, i) => [s, i]));
  const statesOf = c => per.map((row, si) => (row[selIdx.get(c.sel)] ? si : -1)).filter(x => x >= 0);
  const live = cand.filter(c => statesOf(c).length);
  console.log(`!important total=${(css.match(/!important/g) || []).length}  candidates=${cand.length}  shown on screens=${live.length}`);
  const names = await page.evaluate(() => window.__STATES.map(s => s.name));
  void names;
  let accepted = [];
  const keysFor = list => { const s = new Set(); list.forEach(c => statesOf(c).forEach(x => s.add(x))); return [...s]; };
  async function safe(fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await fn(); } catch (e) { try { await close(); } catch (x) {} ({ page, close } = await openApp()); }
    }
    throw new Error("browser kept crashing");
  }
  // 한 묶음 시험: 그 묶음이 나타나는 화면에서, 그 속성과 관련된 스타일만 (지우기 전/후)
  async function ok(list) {
    const only = keysFor(list), props = propsFor(list);
    return safe(async () => {
      const sels = [...new Set(list.map(c => c.sel.split(",")).flat().map(x => x.trim()))];
      await setCss(page, withRemoved(css, accepted)); const before = await snapshot(page, only, props, null, 60, sels);
      await setCss(page, withRemoved(css, accepted.concat(list))); const after = await snapshot(page, only, props, null, 60, sels);
      return same(after, before, Object.keys(before));
    });
  }
  async function tryChunk(chunk) {
    if (!chunk.length) return;
    if (await ok(chunk)) { accepted = accepted.concat(chunk); return; }
    if (chunk.length === 1) return;
    const mid = Math.ceil(chunk.length / 2);
    await tryChunk(chunk.slice(0, mid)); await tryChunk(chunk.slice(mid));
  }
  const SIZE = 24;
  for (let i = 0; i < live.length; i += SIZE) {
    await tryChunk(live.slice(i, i + SIZE));
    console.log(`  checked ${Math.min(i + SIZE, live.length)}/${live.length}, removable ${accepted.length}`);
  }
  // 전체 확인: 모든 화면 x 테마 x 모든 속성
  const fin = await safe(async () => {
    await setCss(page, css); const a0 = await snapshot(page);
    await setCss(page, withRemoved(css, accepted)); const a1 = await snapshot(page);
    return Object.keys(a0).filter(k => a0[k] !== a1[k]);
  });
  await close();
  if (fin.length) { console.log(`[FAIL] final check differs in ${fin.length} states — nothing written`); return 1; }
  // 지금 파일(그동안 고쳐졌을 수 있음)에 같은 규칙 · 같은 선언을 찾아 !important 만 지움
  let cur = fs.readFileSync(CSS_FILE, "utf8"); let done = 0;
  const rulesNow = scanRules(cur);
  const edits = [];
  accepted.forEach(c => {
    const r = rulesNow.find(x => x.sel === c.sel && cur.slice(x.bodyStart, x.bodyEnd).includes(c.decl + " !important") && !edits.some(e => e.rule === x && e.decl === c.decl));
    if (!r) return;
    const at = r.bodyStart + cur.slice(r.bodyStart, r.bodyEnd).indexOf(c.decl + " !important") + c.decl.length;
    edits.push({ rule: r, decl: c.decl, at });
  });
  edits.sort((x, y) => y.at - x.at).forEach(e => { cur = cur.slice(0, e.at) + cur.slice(e.at + " !important".length); done++; });
  fs.writeFileSync(CSS_FILE, cur);
  fs.writeFileSync(path.join(os.tmpdir(), "css_prune_removed.json"), JSON.stringify(accepted.map(c => ({ sel: c.sel, decl: c.decl }))));
  console.log(`[OK] removed ${done} !important (now ${(cur.match(/!important/g) || []).length}); screens unchanged in every state x theme`);
  return 0;
}

// 화면 모양 기억 · 비교 (index.html 의 인라인 스타일을 클래스로 옮길 때 — 페이지와 CSS 를 함께 봄)
async function saveOrCheck(file, mode) {
  const { page, close } = await openApp();
  await setCss(page, fs.readFileSync(CSS_FILE, "utf8"));
  const cur = await snapshot(page);
  const names = await page.evaluate(() => window.__STATES.map(s => s.name));
  await close();
  if (mode === "save") { fs.writeFileSync(file, JSON.stringify({ names, cur })); console.log(`[OK] saved ${Object.keys(cur).length} screen x theme states -> ${file}`); return 0; }
  const old = JSON.parse(fs.readFileSync(file, "utf8"));
  const diff = Object.keys(old.cur).filter(k => old.cur[k] !== cur[k]);
  if (!diff.length) { console.log(`[OK] all ${Object.keys(cur).length} screen x theme states look the same`); return 0; }
  console.log(`[FAIL] ${diff.length} states differ:`); diff.slice(0, 30).forEach(k => { const [si, th] = k.split("|"); console.log("   - " + old.names[si] + " / " + th); });
  return 1;
}

// 한 화면의 요소별 스타일을 파일로 (두 판을 비교해 어디가 다른지 찾을 때): --dump <화면 이름> <file>
async function dump(name, file) {
  const { page, close } = await openApp();
  await setCss(page, fs.readFileSync(CSS_FILE, "utf8"));
  const lines = await page.evaluate(async name => {
    for (const st of window.__STATES) { st.run(); await new Promise(r => setTimeout(r, 250)); if (st.name === name) { window.__DUMP = []; window.__snap("urban-slate"); const d = window.__DUMP; window.__DUMP = null; return d; } if (st.after) st.after(); }
    return [];
  }, name);
  await close(); fs.writeFileSync(file, lines.join("\n")); console.log(`[OK] ${lines.length} elements -> ${file}`); return 0;
}

// 빠른 정리: 화면마다 한 번만 열어 두고, 그 화면에서 규칙 묶음을 지워 보며(반씩 나눠) 모양이 바뀌는 !important 를 찾음
//  모든 화면에서 한 번도 모양을 바꾸지 않은 것만 지움 → 마지막에 모든 화면 x 테마 x 모든 속성으로 다시 확인
async function prune2() {
  const css = fs.readFileSync(CSS_FILE, "utf8");
  const cand = candidates(css).map(c => Object.assign(c, { props: propsFor([c]), sels: c.sel.split(",").map(x => x.trim()) }));
  let { page, close } = await openApp();
  await setCss(page, css);
  const names = await page.evaluate(() => window.__STATES.map(s => s.name));
  console.log(`!important total=${(css.match(/!important/g) || []).length}  candidates=${cand.length}  screens=${names.length}`);
  await page.evaluate(([css, cand, themes]) => {
    window.__CSS = css; window.__CAND = cand; window.__THEMES = themes;
    window.__removed = ids => { const l = ids.map(i => window.__CAND[i]).sort((a, b) => b.at - a.at); let s = window.__CSS; l.forEach(c => { s = s.slice(0, c.at) + s.slice(c.at + c.len); }); return s; };
  }, [css, cand, THEMES]);
  // 한 화면: 관련 후보 중 지우면 모양이 바뀌는 것(harmful) 찾기
  async function harmfulIn(si, pool) {
    return page.evaluate(async ([si, pool]) => {
      const st = window.__STATES[si]; st.run(); await new Promise(r => setTimeout(r, 250));
      const C = window.__CAND, css = document.getElementById("cssUnderTest");
      const live = pool.filter(i => window.__matches(C[i].sels).some(Boolean));
      const out = [];
      const look = ids => { const props = [...new Set(ids.map(i => C[i].props).flat())], sels = [...new Set(ids.map(i => C[i].sels).flat())];
        return window.__THEMES.map(th => window.__snap(th, props, sels)).join(","); };
      async function test(ids) {
        css.textContent = window.__CSS; const a = look(ids);
        css.textContent = window.__removed(ids); const b = look(ids);
        css.textContent = window.__CSS; return a === b;
      }
      async function bis(ids) { if (!ids.length) return; if (await test(ids)) return; if (ids.length === 1) { out.push(ids[0]); return; } const m = Math.ceil(ids.length / 2); await bis(ids.slice(0, m)); await bis(ids.slice(m)); }
      await bis(live);
      if (st.after) st.after();
      return { out, live: live.length };
    }, [si, pool]);
  }
  const all = cand.map(c => c.id);
  let harmful = new Set();
  // 진행 저장 (오래 걸려서 끊겨도 이어서): 같은 style.css 일 때만 이어 씀
  const PROG = path.join(os.tmpdir(), "css_prune_progress.json");
  const cssKey = require("crypto").createHash("sha1").update(css).digest("hex");
  let doneUpTo = 0;
  try { const pg = JSON.parse(fs.readFileSync(PROG, "utf8")); if (pg.cssKey === cssKey) { harmful = new Set(pg.harmful); doneUpTo = pg.next; console.log(`  resuming at screen ${doneUpTo + 1}`); } } catch (e) {}
  for (let si = doneUpTo; si < names.length; si++) {
    let r; for (let k = 0; k < 3; k++) { try { r = await harmfulIn(si, all.filter(i => !harmful.has(i))); break; } catch (e) { try { await close(); } catch (x) {} ({ page, close } = await openApp()); await setCss(page, css); await page.evaluate(([css, cand, themes]) => { window.__CSS = css; window.__CAND = cand; window.__THEMES = themes; window.__removed = ids => { const l = ids.map(i => window.__CAND[i]).sort((a, b) => b.at - a.at); let s = window.__CSS; l.forEach(c => { s = s.slice(0, c.at) + s.slice(c.at + c.len); }); return s; }; }, [css, cand, THEMES]); } }
    if (!r) throw new Error("browser kept crashing");
    r.out.forEach(i => harmful.add(i));
    console.log(`  ${si + 1}/${names.length} ${names[si]}: related ${r.live}, needed so far ${harmful.size}`);
    fs.writeFileSync(PROG, JSON.stringify({ cssKey, next: si + 1, harmful: [...harmful] }));
  }
  const unstable = new Set();
  // 전체 확인 (모든 요소 · 모든 속성). 다르면 다른 화면에서 지우는 것 전체를 다시 반씩 나눠 봄
  for (let round = 0; round < 4; round++) {
    const rem = all.filter(i => !harmful.has(i));
    // 원래 → 지움 → 원래 순서로 돌려, 원래끼리 같은(흔들리지 않는) 화면만 판정
    await setCss(page, css); await snapshot(page); const a0 = await snapshot(page);
    await page.evaluate(ids => { document.getElementById("cssUnderTest").textContent = window.__removed(ids); }, rem); const a1 = await snapshot(page);
    await setCss(page, css); const a2 = await snapshot(page);
    Object.keys(a0).forEach(k => { if (a0[k] !== a2[k]) unstable.add(+k.split("|")[0]); });
    const bad = [...new Set(Object.keys(a0).filter(k => a0[k] !== a1[k] && a1[k] !== a2[k]).map(k => +k.split("|")[0]))].filter(si => !unstable.has(si));
    if (!bad.length) {
      let cur = fs.readFileSync(CSS_FILE, "utf8");
      if (cur !== css) { console.log("[FAIL] style.css changed while running — nothing written"); await close(); return 1; }
      cur = withRemoved(css, rem.map(i => cand[i]));
      fs.writeFileSync(CSS_FILE, cur);
      await close();
      if (unstable.size) console.log(`  not judged here (check with --save / --check): ${[...unstable].map(i => names[i]).join(", ")}`);
      console.log(`[OK] removed ${rem.length} !important (now ${(cur.match(/!important/g) || []).length}); every screen x theme looks the same`);
      return 0;
    }
    console.log(`  final check: ${bad.length} screens differ (${bad.map(i => names[i]).join(", ")}) — checking them again`);
    await setCss(page, css);
    for (const si of bad) {
      // 그 화면에서 달라진 요소만 보며, 지울 목록을 반씩 나눠 원인 규칙을 찾음 (빠름)
      const r = await page.evaluate(async ([si, rem]) => {
        const st = window.__STATES[si]; st.run(); await new Promise(r => setTimeout(r, 250));
        const css = document.getElementById("cssUnderTest"), P = window.__ALLP, out = [];
        const els = () => [...document.body.getElementsByTagName("*")];
        const sig = (e) => { const cs = getComputedStyle(e); return P.map(p => cs[p]).join("|"); };
        const base = {}, watch = {};
        for (const th of window.__THEMES) {
          document.body.setAttribute("data-theme", th);
          css.textContent = window.__CSS; const all = els(); const a = all.map(sig);
          css.textContent = window.__removed(rem); const b = all.map(sig);
          const idx = a.map((x, k) => (x !== b[k] ? k : -1)).filter(k => k >= 0);
          if (idx.length) { watch[th] = idx; base[th] = idx.map(k => a[k]); }
        }
        const themes = Object.keys(watch);
        async function test(ids) {
          for (const th of themes) {
            document.body.setAttribute("data-theme", th);
            css.textContent = window.__removed(ids); const all = els();
            if (watch[th].some((k, n) => !all[k] || sig(all[k]) !== base[th][n])) { css.textContent = window.__CSS; return false; }
          }
          css.textContent = window.__CSS; return true;
        }
        async function bis(ids) { if (!ids.length) return; if (await test(ids)) return; if (ids.length === 1) { out.push(ids[0]); return; } const m = Math.ceil(ids.length / 2); await bis(ids.slice(0, m)); await bis(ids.slice(m)); }
        // 지우지 않았는데도 달라지면 이 화면은 스타일을 바꿀 때 다시 그려져 흔들림 → 판정하지 않음 (마지막에 --check 로 확인)
        if (themes.length && !(await test([]))) { if (st.after) st.after(); return { out, unstable: true }; }
        if (themes.length) await bis(rem);
        if (st.after) st.after(); return { out };
      }, [si, all.filter(i => !harmful.has(i))]);
      if (r.unstable) { unstable.add(si); console.log(`  recheck ${names[si]}: redraws when styles change — left to the final --check`); continue; }
      r.out.forEach(i => harmful.add(i));
      fs.writeFileSync(PROG, JSON.stringify({ cssKey, next: names.length, harmful: [...harmful] }));
      console.log(`  recheck ${names[si]}: +${r.out.length}, needed so far ${harmful.size}`);
    }
  }
  await close(); console.log("[FAIL] could not reach a safe set"); return 1;
}

// 정리 진행 파일의 "지워도 됨" 목록을 모두 지웠을 때 한 화면에서 바뀌는 요소 · 속성 (원인 찾기): --explain <화면 이름>
async function explain(name) {
  const css = fs.readFileSync(CSS_FILE, "utf8"), cand = candidates(css);
  const pg = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "css_prune_progress.json"), "utf8"));
  const rem = cand.filter(c => pg.harmful.indexOf(c.id) === -1);
  const { page, close } = await openApp();
  const grab = async c => { await setCss(page, c); return page.evaluate(async name => {
    for (const st of window.__STATES) { st.run(); await new Promise(r => setTimeout(r, 250)); if (st.name === name) { window.__DUMP = []; window.__snap("urban-slate"); const d = window.__DUMP; window.__DUMP = null; return d; } if (st.after) st.after(); }
    return []; }, name); };
  const A = await grab(css), B = await grab(withRemoved(css, rem));
  let n = 0;
  for (let i = 0; i < Math.min(A.length, B.length) && n < 15; i++) if (A[i] !== B[i]) {
    n++; const [ka, va] = A[i].split(" | "), vb = B[i].split(" | ")[1]; const pa = va.split(" "), pb = vb.split(" ");
    console.log(ka.slice(0, 80), pa.filter((x, j) => x !== pb[j]).map((x, j) => x + " -> " + pb[pa.indexOf(x)]).join("  "));
  }
  console.log(`elements ${A.length} vs ${B.length}, differing shown ${n}`);
  await close(); return 0;
}

// 화면 몇 개에서 원인 !important 찾기 (정리 진행 파일에 더함): --blame <화면 이름,화면 이름,...>
async function blame(list) {
  const css = fs.readFileSync(CSS_FILE, "utf8"), cand = candidates(css);
  const PROG = path.join(os.tmpdir(), "css_prune_progress.json"), pg = JSON.parse(fs.readFileSync(PROG, "utf8"));
  const harmful = new Set(pg.harmful);
  const { page, close } = await openApp();
  await setCss(page, css);
  await page.evaluate(([css, cand, themes]) => { window.__CSS = css; window.__CAND = cand; window.__THEMES = themes; window.__removed = ids => { const l = ids.map(i => window.__CAND[i]).sort((a, b) => b.at - a.at); let s = window.__CSS; l.forEach(c => { s = s.slice(0, c.at) + s.slice(c.at + c.len); }); return s; }; }, [css, cand, THEMES]);
  const names = await page.evaluate(() => window.__STATES.map(s => s.name));
  const one = (si, rem) => {
  return page.evaluate(async ([si, rem]) => {
        const st = window.__STATES[si]; st.run(); await new Promise(r => setTimeout(r, 250));
        const css = document.getElementById("cssUnderTest"), P = window.__ALLP, out = [];
        const els = () => [...document.body.getElementsByTagName("*")];
        const sig = (e) => { const cs = getComputedStyle(e); return P.map(p => cs[p]).join("|"); };
        const base = {}, watch = {};
        for (const th of window.__THEMES) {
          document.body.setAttribute("data-theme", th);
          css.textContent = window.__CSS; const all = els(); const a = all.map(sig);
          css.textContent = window.__removed(rem); const b = all.map(sig);
          const idx = a.map((x, k) => (x !== b[k] ? k : -1)).filter(k => k >= 0);
          if (idx.length) { watch[th] = idx; base[th] = idx.map(k => a[k]); }
        }
        const themes = Object.keys(watch);
        async function test(ids) {
          for (const th of themes) {
            document.body.setAttribute("data-theme", th);
            css.textContent = window.__removed(ids); const all = els();
            if (watch[th].some((k, n) => !all[k] || sig(all[k]) !== base[th][n])) { css.textContent = window.__CSS; return false; }
          }
          css.textContent = window.__CSS; return true;
        }
        async function bis(ids) { if (!ids.length) return; if (await test(ids)) return; if (ids.length === 1) { out.push(ids[0]); return; } const m = Math.ceil(ids.length / 2); await bis(ids.slice(0, m)); await bis(ids.slice(m)); }
        // 지우지 않았는데도 달라지면 이 화면은 스타일을 바꿀 때 다시 그려져 흔들림 → 판정하지 않음 (마지막에 --check 로 확인)
        if (themes.length && !(await test([]))) { if (st.after) st.after(); return { out, unstable: true }; }
        if (themes.length) await bis(rem);
        if (st.after) st.after(); return { out };
      }, [si, rem]);
  };
  for (const nm of list.split(",")) {
    const si = names.indexOf(nm); if (si < 0) { console.log("  no screen " + nm); continue; }
    const r = await one(si, cand.map(c => c.id).filter(i => !harmful.has(i)));
    if (r.unstable) { console.log(`  ${nm}: redraws when styles change`); continue; }
    r.out.forEach(i => harmful.add(i));
    console.log(`  ${nm}: +${r.out.length} ${r.out.map(i => cand[i].sel.slice(0, 50) + " {" + cand[i].prop + "}").join(" ; ")}`);
  }
  fs.writeFileSync(PROG, JSON.stringify(Object.assign(pg, { harmful: [...harmful] })));
  await close(); return 0;
}

// 정확한 정리: 화면마다, 이미 지우기로 한 것(acc)과 함께 지워 원래와 비교 (모든 요소 · 6개 테마). 오래 걸려 진행을 저장
//  --prune-important : 끝나면 style.css 를 고쳐 씀. 그 뒤 --save/--check 로 새 창에서 한 번 더 확인할 것
async function prune3(selRe) {
  const css = fs.readFileSync(CSS_FILE, "utf8");
  const cand = (selRe ? declCandidates(css, selRe) : candidates(css)).map(c => Object.assign(c, { sels: c.sel.split(",").map(x => x.trim()) }));
  const PROG = path.join(os.tmpdir(), selRe ? "css_prune3_decl_progress.json" : "css_prune3_progress.json");
  const cssKey = require("crypto").createHash("sha1").update(css).digest("hex");
  let st = { cssKey, next: 0, acc: [], rejected: [], unstable: [] };
  try { const pg = JSON.parse(fs.readFileSync(PROG, "utf8")); if (pg.cssKey === cssKey) st = pg; } catch (e) {}
  let { page, close } = await openApp();
  const prep = async () => { await setCss(page, css); await page.evaluate(([css, cand, themes]) => {
    window.__CSS = css; window.__CAND = cand; window.__THEMES = themes;
    window.__removed = ids => { const l = ids.map(i => window.__CAND[i]).sort((a, b) => b.at - a.at); let s = window.__CSS; l.forEach(c => { s = s.slice(0, c.at) + s.slice(c.at + c.len); }); return s; };
  }, [css, cand, THEMES]); };
  await prep();
  const names = await page.evaluate(() => window.__STATES.map(s => s.name));
  console.log(`!important total=${(css.match(/!important/g) || []).length}  candidates=${cand.length}  screens=${names.length}  resume at ${st.next + 1}`);
  for (let si = st.next; si < names.length; si++) {
    let r = null;
    for (let k = 0; k < 3 && !r; k++) {
      try {
        r = await page.evaluate(async ([si, acc, rejected]) => {
          const S = window.__STATES[si]; S.run(); await new Promise(r => setTimeout(r, 400));
          const el = document.getElementById("cssUnderTest");
          const look = () => window.__THEMES.map(th => window.__snap(th)).join(",");
          el.textContent = window.__CSS; const base = look(); const base2 = look();
          if (base !== base2) { if (S.after) S.after(); return { unstable: true, acc, rejected }; }
          const ok = ids => { el.textContent = window.__removed(ids); const h = look(); el.textContent = window.__CSS; return h === base; };
          let A = acc.slice(); const rej = rejected.slice();
          // 앞 화면에서 지우기로 한 것이 이 화면을 바꾸면 하나씩 찾아 되살림
          let guard = 0;
          while (A.length && !ok(A) && guard++ < 500) {
            let lo = 1, hi = A.length;   // ok(A[0..k)) 가 처음 깨지는 k
            while (lo < hi) { const m = (lo + hi) >> 1; if (ok(A.slice(0, m))) lo = m + 1; else hi = m; }
            rej.push(A[lo - 1]); A.splice(lo - 1, 1);
          }
          const C = window.__CAND, seen = new Set(A.concat(rej));
          const pool = C.filter(c => !seen.has(c.id) && window.__matches(c.sels).some(Boolean)).map(c => c.id);
          const bis = ids => { if (!ids.length) return; if (ok(A.concat(ids))) { A = A.concat(ids); return; } if (ids.length === 1) { rej.push(ids[0]); return; } const m = Math.ceil(ids.length / 2); bis(ids.slice(0, m)); bis(ids.slice(m)); };
          bis(pool);
          if (S.after) S.after();
          return { acc: A, rejected: rej, tried: pool.length };
        }, [si, st.acc, st.rejected]);
      } catch (e) { try { await close(); } catch (x) {} ({ page, close } = await openApp()); await prep(); }
    }
    if (!r) throw new Error("browser kept crashing");
    if (r.unstable) st.unstable.push(names[si]);
    st.acc = r.acc; st.rejected = r.rejected; st.next = si + 1;
    fs.writeFileSync(PROG, JSON.stringify(st));
    console.log(`  ${si + 1}/${names.length} ${names[si]}: ${r.unstable ? "moves by itself — skipped" : "tried " + r.tried}, removable ${st.acc.length}, kept ${st.rejected.length}`);
  }
  await close();
  const out = withRemoved(css, st.acc.map(i => cand[i]));
  fs.writeFileSync(CSS_FILE, out);
  console.log(`[OK] removed ${st.acc.length} ${selRe ? "unused declarations" : "!important"} (now ${(out.match(/!important/g) || []).length}). Screens that move by themselves: ${st.unstable.join(", ") || "none"}. Confirm with --save/--check.`);
  return 0;
}

(async () => {
  const a = process.argv;
  let code = 0;
  if (a.includes("--prune-important")) code = await prune3();
  else if (a.includes("--prune-unused")) code = await prune3(new RegExp(a[a.indexOf("--prune-unused") + 1]));   // 쓰이지 않는 선언 지우기 (선택자 정규식)
  else if (a.includes("--blame")) code = await blame(a[a.indexOf("--blame") + 1]);
  else if (a.includes("--explain")) code = await explain(a[a.indexOf("--explain") + 1]);
  else if (a.includes("--dump")) code = await dump(a[a.indexOf("--dump") + 1], a[a.indexOf("--dump") + 2]);
  else if (a.includes("--save")) code = await saveOrCheck(a[a.indexOf("--save") + 1], "save");
  else if (a.includes("--check")) code = await saveOrCheck(a[a.indexOf("--check") + 1], "check");
  else if (a.includes("--compare")) code = await compare(fs.readFileSync(a[a.indexOf("--compare") + 1], "utf8"));
  else console.log("usage: --save <file> | --check <file> | --compare <old.css> | --prune-important");
  process.exit(code);
})();
