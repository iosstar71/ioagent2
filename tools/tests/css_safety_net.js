// =============================================================================
// CSS safety net — "the screens look exactly the same" check, and !important pruning
// -----------------------------------------------------------------------------
//  Captures the computed style of every visible element on every screen
//  (5 themes x all tabs / sub tabs / open menus / detail panel / left menu / large text)
//  with the sample project, and compares two style sheets.
//
//  node tools/tests/css_safety_net.js --compare <old.css>   current style.css vs old.css (exit 1 if any screen differs)
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
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const WEB = fs.existsSync(path.join(ROOT, "webapp", "index.html")) ? path.join(ROOT, "webapp") : ROOT;
const CSS_FILE = path.join(WEB, "static", "css", "style.css");
const PY = process.platform === "win32" ? "python" : "python3";
const THEMES = ["urban-slate", "brown", "classic", "dark", "electric"];

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
function withRemoved(css, list) {
  const sorted = list.slice().sort((a, b) => b.at - a.at);
  let s = css;
  sorted.forEach(c => { s = s.slice(0, c.at) + s.slice(c.at + c.len); });
  return s;
}

// ---- browser: states and computed-style hashes ----
async function openApp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "csssafety_"));
  fs.symlinkSync(WEB, path.join(tmp, "pprjmgmt"));
  const port = await freePort();
  const srv = spawn(PY, ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: tmp, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`http://127.0.0.1:${port}/pprjmgmt/index.html`); await page.waitForTimeout(1500);
  await page.fill("#inputSecurityEmpNo", "admin"); await page.fill("#inputSecurityPassword", "admin123!"); await page.click("#btnLockSubmit"); await page.waitForTimeout(1500);
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
    ["basic","phase","holiday","users","ui-screen","ui-report","ui-channel"].forEach(n => S.push({ name: "master:" + n, run: () => { go("tab-master"); MasterSubTabs.show(n); } }));
    ["project","users","process","security","data","db"].forEach(n => S.push({ name: "config:" + n, run: () => { go("tab-config"); SubTabs.show("config", n); } }));
    S.push({ name: "merge:backup", run: () => { go("tab-merge"); SubTabs.show("merge", "backup"); } });
    ["gUiMenu","gUserMenu","gStatusMenu","gPkgMenu","gAdminMenu"].forEach(id => S.push({ name: "menu:" + id, run: () => { go("tab-home"); const m = document.getElementById(id); if (m) m.hidden = false; }, after: () => { const m = document.getElementById(id); if (m) m.hidden = true; } }));
    S.push({ name: "wbs:detail", run: () => { go("tab-wbs"); const i = wbsData.findIndex(t => t.isLeaf); if (i >= 0) NeoDetail.open(i); }, after: () => NeoDetail.close() });
    S.push({ name: "sidebar:wbs", run: () => { LayoutManager.setLayout("sidebar-left", false); go("tab-wbs"); }, after: () => LayoutManager.setLayout("top-nav", false) });
    S.push({ name: "large:home", run: () => { UiScale.set(1.3); go("tab-home"); }, after: () => UiScale.set(1) });
    const P = ["color","backgroundColor","backgroundImage","borderTopColor","borderRightColor","borderBottomColor","borderLeftColor","borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
      "borderTopStyle","borderLeftStyle","borderTopLeftRadius","borderBottomRightRadius","fontSize","fontWeight","fontStyle","lineHeight","letterSpacing","paddingTop","paddingRight","paddingBottom","paddingLeft",
      "marginTop","marginRight","marginBottom","marginLeft","display","width","height","minWidth","maxWidth","boxShadow","opacity","textDecorationLine","visibility","position","top","left","gap","cursor",
      "whiteSpace","textAlign","verticalAlign","zIndex","overflowX","overflowY","transform","filter","outlineStyle","flexDirection","justifyContent","alignItems","fill","stroke"];
    // 메모리를 아끼려고 문자열을 모으지 않고 바로 해시에 섞음
    window.__ALLP = P;
    window.__snap = (theme, props) => {
      const P = props || window.__ALLP;
      document.body.setAttribute("data-theme", theme);
      let x = 2166136261, n = 0;
      const mix = str => { for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } };
      const all = document.body.getElementsByTagName("*");
      for (let k = 0; k < all.length; k++) {
        const e = all[k];
        if (e.tagName === "SCRIPT" || e.tagName === "STYLE" || e.tagName === "OPTION") continue;
        const cs = getComputedStyle(e); if (cs.display === "none") continue;
        if (!e.offsetParent && cs.position !== "fixed" && !(e instanceof SVGElement)) continue;
        for (let j = 0; j < P.length; j++) mix(cs[P[j]]);
        n++;
      }
      return (x >>> 0).toString(36) + ":" + n;
    };
    window.__matches = sels => sels.map(s => { try { return !!document.querySelector(s.replace(/::?(before|after|placeholder|selection)\b/g, "")); } catch (e) { return false; } });
  });
  return { page, close: async () => { await browser.close(); srv.kill(); } };
}

async function setCss(page, css) { await page.evaluate(c => { document.getElementById("cssUnderTest").textContent = c; }, css); }

// state x theme -> hash (only states in `only`, if given)
async function snapshot(page, only, props, themes) {
  return page.evaluate(async ([themes, only, props]) => {
    const res = {};
    for (let si = 0; si < window.__STATES.length; si++) {
      if (only && !only.includes(si)) continue;
      const st = window.__STATES[si];
      st.run(); await new Promise(r => setTimeout(r, 60));
      for (const th of themes) res[si + "|" + th] = window.__snap(th, props);
      if (st.after) st.after();
    }
    return res;
  }, [themes || THEMES, only || null, props || null]);
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

async function prune() {
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
      await setCss(page, withRemoved(css, accepted)); const before = await snapshot(page, only, props);
      await setCss(page, withRemoved(css, accepted.concat(list))); const after = await snapshot(page, only, props);
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
  const SIZE = 16;
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

(async () => {
  const a = process.argv;
  let code = 0;
  if (a.includes("--prune-important")) code = await prune();
  else if (a.includes("--compare")) code = await compare(fs.readFileSync(a[a.indexOf("--compare") + 1], "utf8"));
  else console.log("usage: --compare <old.css> | --prune-important");
  process.exit(code);
})();
