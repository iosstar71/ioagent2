// =============================================================================
// [Project Mgmt (협업) Local 1.0] 브라우저 E2E 자동 테스트 (Playwright)
// -----------------------------------------------------------------------------
//  실행: node tools/tests/e2e/run_e2e.js   (프로그램 폴더에서)
//  배포 zip 을 풀어 정적 웹 서버(python -m http.server)의 /pprjmgmt/ 아래에서 시험 — 서버 프로그램 없음
//  1) 빈 상태 시작 · Local 표시 · IndexedDB 저장(전사 시스템 localStorage 는 건드리지 않음) · 뺀 기능 · 외부 통신 없음
//  2) 파일 주고받기: PM 이 종합본 → 작업자 PC 에서 [종합본으로 시작] → 담당 자료 파일 → PM 미리 보기 반영
//     → 이전 종합본 기준 파일 경고 → 작업자가 새 종합본을 가져와도 내 담당 자료는 그대로
// =============================================================================
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
const PY = process.platform === "win32" ? "python" : "python3";
const results = [];
let browser;

function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? "[PASS]" : "[FAIL]"} ${name}${!cond && detail ? "  -- " + detail : ""}`);
}
function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.external = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("request", r => { if (!r.url().includes("/pprjmgmt/") && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) page.external.push(r.url()); });
  return page;
}
async function waitApp(page) {
  await page.waitForFunction(() => {
    try { return window.AppBoot && AppBoot.uiReady && AuthManager.currentUser && AuthManager.currentUser.empNo && document.getElementById("securityLockOverlay").style.display === "none"; }
    catch (e) { return false; }
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function pickWorker(page, emp, store, project) {
  if (project) await page.selectOption("#inputLoginProject", project).catch(() => {});
  await page.fill("#inputSecurityEmpNo", emp);
  await page.fill("#inputSecurityPassword", store[emp] || (emp + "123!"));
  await page.click("#btnLockSubmit");
  await page.waitForTimeout(1300);
  const forced = await page.$eval("#pwdChangeFormPane", e => getComputedStyle(e).display !== "none").catch(() => false);
  if (forced) {
    const np = "Pm" + emp.replace(/[^A-Za-z0-9]/g, "") + "2026x";
    await page.fill("#pcNewPwd", np); await page.fill("#pcNewPwd2", np);
    await page.click('#pwdChangeFormPane [data-click="AuthManager.changePasswordFromLogin"]');
    await page.waitForTimeout(900);
    store[emp] = np;
  }
  await waitApp(page);
}
// 화면이 내려받는 파일을 가로채 { name, text } 로 돌려줌
async function grab(page, js) {
  return page.evaluate(async js => {
    const o = ExcelSync._triggerDownload; let got = null;
    ExcelSync._triggerDownload = (b, n) => { got = { b, n }; };
    try { await eval(js); } finally { ExcelSync._triggerDownload = o; }
    return got ? { name: got.n, text: await got.b.text() } : null;
  }, js);
}
// 시험 환경(Playwright)이 한글 경로 파일을 넣지 못하는 경우가 있어 임시 파일 이름은 영문으로
function tmpFile(name, text) { const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pm_f_")), name.replace(/[^\x20-\x7e]/g, "_")); fs.writeFileSync(p, text); return p; }

async function startStatic() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm_e2e_"));
  execFileSync(PY, [path.join(ROOT, "tools", "make_release.py"), tmp], { stdio: "ignore" });
  const zip = fs.readdirSync(tmp).find(f => f.endsWith(".zip"));
  execFileSync(PY, ["-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", path.join(tmp, zip), tmp]);
  const entries = fs.readdirSync(path.join(tmp, "pprjmgmt"));
  const port = await freePort();
  const proc = spawn(PY, ["-m", "http.server", String(port), "--bind", "127.0.0.1"], { cwd: tmp, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1200));
  return { tmp, entries, zip, url: `http://127.0.0.1:${port}/pprjmgmt/`, stop() { try { proc.kill(); } catch (e) {} setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500); } };
}

async function main() {
  const web = await startStatic();
  const PWD = {};
  try {
    // UI 스타일 부채(!important · 인라인 스타일 · 고정 색)가 늘지 않았는지 (CLAUDE.md 규칙)
    { let out = "", ok = true; try { out = execFileSync(PY, [path.join(ROOT, "tools", "check_ui_debt.py")], { encoding: "utf8" }); } catch (e) { ok = false; out = String(e.stdout || e.message); }
      check("UI style debt did not go up (!important · inline styles · fixed colours per screen)", ok, out.trim().split("\n").slice(-4).join(" | ")); }
    console.log("\n[Static package under /pprjmgmt]");
    check("Package is static files only (index.html at the top, no server program)", web.zip === "IOSTAR-PM-Standalone_v1.0.0.zip" && web.entries.includes("index.html") && web.entries.includes("static")
      && !web.entries.some(f => /server|\.py$|conf|data/.test(f)), web.entries.join(","));
    const pm = await newPage();
    await pm.goto(web.url);
    await pm.evaluate(() => localStorage.setItem("enterprise_app_key", "keep"));
    await pm.reload(); await pm.waitForTimeout(1500);
    const login = await pm.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), start: !!document.getElementById("localStartInput"),
      brand: document.querySelector(".login-brand-name").textContent }));
    check("Worker selection: only admin, [start from 종합본] button, Local shown", login.workers === "admin" && login.start && login.brand.includes("Standalone"), JSON.stringify(login));
    await pm.fill("#inputSecurityEmpNo", "admin"); await pm.fill("#inputSecurityPassword", "1234");
    await pm.click("#btnLockSubmit"); await pm.waitForTimeout(900);
    const pw = await pm.evaluate(() => ({ err: (document.getElementById("lockErrorMessage") || {}).textContent || "", hint: document.getElementById("lockModalDesc").textContent,
      noReuse: !!AuthManager.validateNewPassword("hong123!", "hong"), ok: AuthManager.validateNewPassword("Hong2026x", "hong") === "" }));
    check("Initial password is worker ID + 123! (old 1234 rejected; cannot be kept as the new password)", /일치하지/.test(pw.err) && pw.hint.includes("123!") && pw.noReuse && pw.ok, JSON.stringify(pw));
    await pickWorker(pm, "admin", PWD);
    check("Local: picking a worker with the initial password does not force a password change", !PWD.admin && await pm.evaluate(() => !!(AuthManager.currentUser && AuthManager.currentUser.empNo === "admin")), JSON.stringify(PWD));
    const st = await pm.evaluate(() => ({ ver: document.getElementById("headerVersionBadge").textContent, title: document.title, mode: DbConnector.config.mode, wbs: wbsData.length, subs: subsystemsMeta.length,
      users: (ProjectContext.allUsers || projectUsers).map(u => u.empNo).join(), ls: Object.keys(localStorage).join(), idb: AppStore.length > 0 && !AppStore._fallback,
      gone: [typeof RealtimeChatManager, typeof AttachManager, typeof Features, typeof ServerHeartbeat].every(t => t === "undefined") && !document.getElementById("subtabBtn_CHAT") && !document.querySelector('[data-subtab="locks"]') }));
    check("Starts empty in Local mode; data in IndexedDB only (the enterprise system's localStorage untouched); chat / attachments / samples / server features gone",
      st.ver === "Standalone v1.0.0" && st.title.includes("PM Hub") && st.title.includes("IOSTAR-PM Standalone") && st.mode === "LOCAL" && st.wbs === 0 && st.subs === 0 && st.users === "admin" && st.ls === "enterprise_app_key" && st.idb && st.gone, JSON.stringify(st));
    for (const t of ["tab-home", "tab-dashboard", "tab-gantt", "tab-wbs", "tab-req", "tab-voc", "tab-deliverables", "tab-weekly-report", "tab-meeting", "tab-notices", "tab-master", "tab-merge", "tab-config"]) {
      await pm.evaluate(t => GShell.go(t), t); await pm.waitForTimeout(150);
    }
    check("All screens open on an empty project without page errors", pm.errors.length === 0, pm.errors.slice(0, 3).join(" | "));

    console.log("\n[File exchange between PM and a worker]");
    // PM: 서브시스템 · 작업자 · Task 만들기
    await pm.evaluate(async () => {
      projectConfig.projectName = "협업 시험 프로젝트";
      subsystemsMeta = [{ domain: "기본분야", code: "W1", name: "W1", type: "SDLC", sdlcCode: "SDLC_COMPACT", weight: 50, pm: "" }, { domain: "기본분야", code: "W2", name: "W2", type: "SDLC", sdlcCode: "SDLC_COMPACT", weight: 50, pm: "" }];
      wbsData = [{ id: "1", level: 1, system: "W1", name: "W1 공정", weight: 100, pProg: 0, aProg: 0 }, { id: "1.1", level: 2, system: "W1", name: "W1 설계", weight: 100, pProg: 0, aProg: 0 },
                 { id: "2", level: 1, system: "W2", name: "W2 공정", weight: 100, pProg: 0, aProg: 0 }, { id: "2.1", level: 2, system: "W2", name: "W2 설계", weight: 100, pProg: 0, aProg: 0 }];
      rebuildAll(true); persistChanges(true);
      await new Promise(r => setTimeout(r, 300));
      for (const [emp, sys] of [["wg_a", "W1"], ["wg_b", "W2"]]) await UserAdmin._save({ isNew: true, empNo: emp, name: emp === "wg_a" ? "가작업" : "나작업", dept: "", sysAdmin: false, projectRoles: { [ProjectContext.current]: { role: "MEMBER", subsystem: sys } } });
    });
    const pkg1 = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("JSON")');
    const j1 = JSON.parse(pkg1.text);
    check("PM downloads a 종합본 (JSON) with a version stamp and the worker list", /마스터파일/.test(pkg1.name) && !!j1.packageStamp && j1.projectUsers.map(u => u.empNo).join() === "wg_a,wg_b", pkg1.name + " " + j1.packageStamp);

    // 작업자 PC: 종합본으로 시작
    const wa = await newPage();
    await wa.goto(web.url); await wa.waitForTimeout(1500);
    await wa.setInputFiles("#localStartInput", tmpFile(pkg1.name, pkg1.text));
    await wa.waitForTimeout(2500);
    await wa.waitForFunction(() => window.AppBoot && document.querySelectorAll("#workerPickList option").length > 1, null, { timeout: 8000 }).catch(() => {});
    const wl = await wa.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), proj: document.getElementById("inputLoginProject").selectedOptions[0].textContent }));

    check("Worker PC: [start from 종합본] brings in the project and the worker list", wl.workers.includes("wg_a") && wl.proj.includes(j1.projectName), JSON.stringify(wl));
    await pickWorker(wa, "wg_a", PWD);
    const wst = await wa.evaluate(() => ({ subs: subsystemsMeta.length, wbs: wbsData.length, own: Permission.ownSubsystem(), stamp: projectConfig.packageStamp }));
    await pm.click("#gPkgBtn"); await pm.waitForTimeout(200);
    const pmMenu = await pm.evaluate(() => ({ open: !document.getElementById("gPkgMenu").hidden, items: [...document.querySelectorAll("#gPkgMenu .g-menu-item")].map(b => b.textContent.split(/\s{2,}|작업자에게|배포 폴더|받은 엑셀|PM ·|내 담당|어느/)[0].trim()) }));
    await pm.click("#gPkgBtn"); await wa.click("#gPkgBtn"); await wa.waitForTimeout(200);
    const waMenu = await wa.evaluate(() => [...document.querySelectorAll("#gPkgMenu .g-menu-item")].map(b => b.getAttribute("data-click") + (b.getAttribute("data-click-args") || "")).join());
    await wa.click("#gPkgBtn");
    const viaMenu = await grab(wa, 'LocalPkg.sendMine("JSON")');
    check("Top [📦 종합본] menu: PM gets package / latest.json / merge; a worker gets import + send-my-data, and it downloads only the own subsystem",
      pmMenu.open && pmMenu.items.length === 5 && /latest\.json/.test(pmMenu.items.join()) && /consolidateInput/.test(waMenu) && /sendMine\["EXCEL"\]/.test(waMenu) && !/SERVER/.test(waMenu)
      && !!viaMenu && JSON.parse(viaMenu.text).targetScope === "W1", JSON.stringify({ pmMenu, waMenu, n: viaMenu && viaMenu.name }));
    check("Worker sees the same project data (own subsystem W1) and the package version", wst.subs === 2 && wst.wbs === 4 && wst.own === "W1" && wst.stamp === j1.packageStamp, JSON.stringify(wst));
    // 작업자: 담당 자료 고치고 파일로 내려받기
    await wa.evaluate(() => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 수정)"; rebuildAll(true); persistChanges(true); });
    const mine = await grab(wa, '(async () => { GShell.go("tab-merge"); SubTabs.show("merge", "merge"); const s = document.getElementById("workDataSubsysSelect"); s.value = "W1"; SmartMergeCenter.updateCountBadges(); MergeTable.selectUnit("sys"); MergeTable.download("JSON"); })()');
    const jm = JSON.parse(mine.text);
    check("Worker downloads own-subsystem data (JSON) marked with the package it was based on", jm.targetScope === "W1" && jm.basedOn === j1.packageStamp && jm.wbsData.every(t => t.system === "W1"), mine.name);
    // PM: 미리 보기로 반영
    await pm.evaluate(async t => { await MergeTable.previewFile(new File([t], "wg_a.json"), { scope: "W1", title: "📋 자료 올리기" }); }, mine.text);
    const pv1 = await pm.evaluate(() => ({ note: document.getElementById("mpNote").textContent, rows: [...document.querySelectorAll("#mpBody tr")].length }));
    await pm.click("#mpOkBtn"); await pm.waitForTimeout(600);
    const merged = await pm.evaluate(() => wbsData.find(t => t.id === "1.1").name);
    check("PM merges the worker's file through the preview (W1 only); no stale warning for a current file", merged === "W1 설계 (가작업 수정)" && !pv1.note.includes("이전 마스터 파일") && pv1.note.includes("가작업"), JSON.stringify(pv1));
    // PM 이 새 종합본을 낸 뒤, 예전 종합본 기준 파일을 올리면 경고
    await pm.waitForTimeout(1100);
    const pkg2 = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("JSON")');
    await pm.evaluate(async t => { await MergeTable.previewFile(new File([t], "old.json"), { scope: "W1" }); }, mine.text);
    const warn = await pm.evaluate(() => document.getElementById("mpNote").textContent);
    await pm.evaluate(() => MergeTable.close());
    check("A file based on an older 종합본 shows a warning in the preview", warn.includes("이전 마스터 파일"), warn);
    // 작업자 자료를 엑셀로 보내도 됨: 파일정보 시트(기준 종합본 · 보낸 사람)로 같은 경고, 미리 보기로 반영
    await wa.evaluate(() => { wbsData.find(t => t.id === "1.1").aProg = 30; rebuildAll(true); persistChanges(true); });
    const xl = await wa.evaluate(async () => {
      const o = ExcelSync._triggerDownload; let got = null;
      ExcelSync._triggerDownload = (b, n) => { got = { b, n }; };
      try { GShell.go("tab-merge"); SubTabs.show("merge", "merge"); const s = document.getElementById("workDataSubsysSelect"); s.value = "W1"; MergeTable.selectUnit("sys"); MergeTable.download("EXCEL"); } finally { ExcelSync._triggerDownload = o; }
      const buf = new Uint8Array(await got.b.arrayBuffer()); let bin = ""; buf.forEach(x => { bin += String.fromCharCode(x); });
      return { name: got.n, b64: btoa(bin) };
    });
    await pm.evaluate(async x => { const bin = atob(x.b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await MergeTable.previewFile(new File([u], "wg_a.xlsx"), { scope: "W1", title: "📋 자료 올리기" }); }, xl);
    const pvx = await pm.evaluate(() => ({ note: document.getElementById("mpNote").textContent, wbs: [...document.querySelectorAll("#mpBody tr")].filter(r => /WBS/.test(r.textContent)).map(r => r.querySelector(".mp-apply").textContent).join() }));
    await pm.click("#mpOkBtn"); await pm.waitForTimeout(600);
    const xa = await pm.evaluate(() => wbsData.find(t => t.id === "1.1").aProg);
    check("Worker data can also go as Excel: the file carries its 종합본 version and sender (stale warning), PM merges it through the preview",
      /\.xlsx$/.test(xl.name) && pvx.note.includes("이전 마스터 파일") && pvx.note.includes("가작업") && parseInt(pvx.wbs, 10) > 0 && xa === 30, JSON.stringify({ n: xl.name, pvx, xa }));
    // 작업자가 새 종합본을 가져와도 내 담당(W1) 작업은 그대로, W2 는 종합본대로
    await pm.evaluate(() => { wbsData.find(t => t.id === "2.1").name = "W2 설계 (PM 수정)"; rebuildAll(true); persistChanges(true); });
    const pkg3 = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("JSON")');
    await wa.evaluate(() => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 2차)"; rebuildAll(true); persistChanges(true); });
    await wa.evaluate(async t => { await SmartMergeCenter.importConsolidated({ target: { files: [new File([t], "pkg3.json")], value: "" } }); }, pkg3.text);
    await wa.waitForTimeout(300);
    await wa.click("#confirmDialogOkBtn"); await wa.waitForTimeout(800);
    const after = await wa.evaluate(() => ({ w1: wbsData.find(t => t.id === "1.1").name, w2: wbsData.find(t => t.id === "2.1").name, stamp: projectConfig.packageStamp }));
    check("Worker imports a newer 종합본: own W1 work kept, W2 updated, package version updated",
      after.w1 === "W1 설계 (가작업 2차)" && after.w2 === "W2 설계 (PM 수정)" && after.stamp === JSON.parse(pkg3.text).packageStamp, JSON.stringify(after));
    // 다시 열어도 자료 유지 (IndexedDB)
    await wa.reload(); await wa.waitForTimeout(1500); await waitApp(wa);
    const kept = await wa.evaluate(() => wbsData.find(t => t.id === "1.1").name);
    check("Data survives a reload (stored in IndexedDB)", kept === "W1 설계 (가작업 2차)", kept);
    // 작업자 선택 화면에서 새 종합본 올리기 → 고르기 (최신으로 맞추기 / 전부 바꾸기 / 그대로)
    await pm.evaluate(async () => { wbsData.find(t => t.id === "2.1").name = "W2 설계 (PM 3차)"; rebuildAll(true); persistChanges(true);
      await UserAdmin._save({ isNew: true, empNo: "wg_c", name: "다작업", dept: "", sysAdmin: false, projectRoles: { [ProjectContext.current]: { role: "MEMBER", subsystem: "W2" } } }); });
    await pm.waitForTimeout(1100);
    const pkg4 = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("JSON")');
    const s4 = JSON.parse(pkg4.text).packageStamp;
    await wa.evaluate(() => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 3차)"; rebuildAll(true); persistChanges(true); });
    await wa.waitForTimeout(500);
    const toLogin = async () => { await wa.evaluate(() => { AuthManager._clearSession(); return AppStore.reload(); }); await wa.waitForTimeout(1800); };
    const choice = () => wa.evaluate(() => { const b = document.getElementById("localPkgChoice"); return { shown: getComputedStyle(b).display !== "none", text: b.textContent }; });
    const pickChoice = k => wa.evaluate(k => document.querySelector(`#localPkgChoice button[data-click-args*='"${k}"']`).click(), k);
    await toLogin();
    await wa.setInputFiles("#localStartInput", tmpFile(pkg4.name, pkg4.text)); await wa.waitForTimeout(1200);
    const ch = await choice();
    check("Login screen: a 종합본 on a PC that already has data asks latest / replace all / keep, and says it is newer",
      ch.shown && ch.text.includes("최신 마스터 파일로 맞추기") && ch.text.includes("전부 바꾸기") && ch.text.includes("그대로") && ch.text.includes("새 마스터 파일"), ch.text.slice(0, 240));
    await pickChoice("keep"); await wa.waitForTimeout(300);
    const kp = await choice();
    await pickWorker(wa, "wg_a", PWD);
    const k1 = await wa.evaluate(() => ({ w1: wbsData.find(t => t.id === "1.1").name, w2: wbsData.find(t => t.id === "2.1").name }));
    check("[이 PC 자료 그대로] changes nothing", !kp.shown && k1.w1 === "W1 설계 (가작업 3차)" && k1.w2 === "W2 설계 (PM 수정)", JSON.stringify(k1));
    await toLogin();
    await wa.setInputFiles("#localStartInput", tmpFile(pkg4.name, pkg4.text)); await wa.waitForTimeout(1200);
    await pickChoice("latest"); await wa.waitForTimeout(2600);
    const pend = await wa.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), note: document.getElementById("localPkgChoice").textContent }));
    await pickWorker(wa, "wg_a", PWD); await wa.waitForTimeout(800);
    const l1 = await wa.evaluate(() => ({ w1: wbsData.find(t => t.id === "1.1").name, w2: wbsData.find(t => t.id === "2.1").name, stamp: projectConfig.packageStamp, pending: !!AppStore.getItem("PPRJMGMT_PENDING_PKG") }));
    check("[최신 종합본으로 맞추기]: new worker selectable at once; after picking the worker own W1 work kept, W2 and version updated",
      pend.workers.includes("wg_c") && pend.note.includes("받아 둔 마스터 파일") && l1.w1 === "W1 설계 (가작업 3차)" && l1.w2 === "W2 설계 (PM 3차)" && l1.stamp === s4 && !l1.pending, JSON.stringify({ pend, l1 }));
    await toLogin();
    await wa.setInputFiles("#localStartInput", tmpFile(pkg4.name, pkg4.text)); await wa.waitForTimeout(1200);
    const same = await choice();
    await pickChoice("replace"); await wa.waitForTimeout(300);
    const warnR = await choice();
    await pickChoice("replaceNow"); await wa.waitForTimeout(2600);
    await pickWorker(wa, "wg_a", PWD);
    const r1 = await wa.evaluate(() => wbsData.find(t => t.id === "1.1").name);
    check("[종합본으로 전부 바꾸기] asks once more, then this PC matches the 종합본 exactly (same-version note shown)",
      same.text.includes("같습니다") && warnR.text.includes("사라집니다") && r1 === "W1 설계 (가작업 수정)", JSON.stringify({ r1, same: same.text.slice(0, 120) }));
    // 배포 폴더의 최신 종합본(shared/latest.json): 화면을 열 때 자동으로 읽음
    await pm.evaluate(() => { wbsData.find(t => t.id === "2.1").name = "W2 설계 (PM 4차)"; rebuildAll(true); persistChanges(true); });
    await pm.waitForTimeout(1100);
    const lj = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("SERVER")');
    const s5 = JSON.parse(lj.text).packageStamp;
    fs.writeFileSync(path.join(web.tmp, "pprjmgmt", "shared", "latest.json"), lj.text);
    check("PM makes the deploy 종합본 named latest.json (whole project, new version)", lj.name === "latest.json" && JSON.parse(lj.text).targetScope === "ALL" && s5 > s4, lj.name + " " + s5);
    const wb = await newPage();
    await wb.goto(web.url); await wb.waitForTimeout(3500);
    await wb.waitForFunction(() => window.AppBoot && document.querySelectorAll("#workerPickList option").length > 1, null, { timeout: 8000 }).catch(() => {});
    const nb = await wb.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), proj: document.getElementById("inputLoginProject").selectedOptions[0].textContent }));
    await pickWorker(wb, "wg_b", PWD);
    const nb2 = await wb.evaluate(() => ({ wbs: wbsData.length, w2: wbsData.find(t => t.id === "2.1").name, own: Permission.ownSubsystem() }));
    check("New PC opening the site starts from the server 종합본 automatically (no file to pass around)",
      nb.workers.includes("wg_b") && nb.proj.includes(j1.projectName) && nb2.wbs === 4 && nb2.w2 === "W2 설계 (PM 4차)" && nb2.own === "W2", JSON.stringify({ nb, nb2 }));
    await wa.evaluate(() => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 4차)"; rebuildAll(true); persistChanges(true); });
    await wa.waitForTimeout(500);
    await toLogin(); await wa.waitForTimeout(1500);
    const sn = await choice();
    await pickWorker(wa, "wg_a", PWD); await wa.waitForTimeout(800);
    const sv = await wa.evaluate(() => ({ w1: wbsData.find(t => t.id === "1.1").name, w2: wbsData.find(t => t.id === "2.1").name, stamp: projectConfig.packageStamp }));
    check("PC with data: a newer server 종합본 is announced on the worker screen and applied after picking the worker (own W1 kept)",
      sn.shown && sn.text.includes("새 마스터 파일이 올라와 있습니다") && sv.w1 === "W1 설계 (가작업 4차)" && sv.w2 === "W2 설계 (PM 4차)" && sv.stamp === s5, JSON.stringify({ sn: sn.text.slice(0, 120), sv }));
    await toLogin();
    const again = await choice();
    await pm.reload(); await pm.waitForTimeout(1800); await waitApp(pm);
    const pmSame = await pm.evaluate(() => ({ w2: wbsData.find(t => t.id === "2.1").name, pending: !!AppStore.getItem("PPRJMGMT_PENDING_PKG"), dlg: getComputedStyle(document.getElementById("confirmDialogModal")).display }));
    check("Same version is not applied again (worker PC and the PM's own PC are left alone)", !again.shown && pmSame.w2 === "W2 설계 (PM 4차)" && !pmSame.pending && pmSame.dlg === "none", JSON.stringify({ again, pmSame }));
    // WBS 가중치: 서브시스템 100 기준 · 상위 변경 시 하위 자동 조정 · 경고색 유지 · 오류 보정 · 서브시스템 가중치로 종합
    console.log("\n[WBS weights and levels]");
    const wc = await newPage();
    await wc.goto(web.url); await wc.waitForTimeout(1500);
    await pickWorker(wc, "admin", {});
    await wc.evaluate(() => {
      projectConfig.reportDate = "2026-11-15";
      subsystemsMeta = [{ domain: "기본분야", code: "A", name: "A", type: "SDLC", sdlcCode: "SDLC_COMPACT", weight: 70, pm: "" }, { domain: "기본분야", code: "B", name: "B", type: "SDLC", sdlcCode: "SDLC_COMPACT", weight: 30, pm: "" }];
      wbsData = [{ level: 1, system: "A", name: "A", weight: 100 }, { level: 2, system: "A", name: "a1", weight: 60 },
        { level: 3, system: "A", name: "a11", weight: 30, pStart: "2026-11-01", pEnd: "2026-11-10", aProg: 100 }, { level: 3, system: "A", name: "a12", weight: 30, pStart: "2026-11-11", pEnd: "2026-11-30", aProg: 0 },
        { level: 2, system: "A", name: "a2", weight: 40, pStart: "2026-11-01", pEnd: "2026-11-30", aProg: 50 },
        { level: 1, system: "B", name: "B", weight: 100 }, { level: 2, system: "B", name: "b1", weight: 100, pStart: "2026-11-01", pEnd: "2026-11-30", aProg: 0 }];
      rebuildAll(true); GShell.go("tab-wbs");
    });
    await wc.waitForTimeout(600);
    const W = () => wc.evaluate(() => { const g = n => wbsData.find(t => t.name === n); return { a1: g("a1").weight, a11: g("a11").weight, a12: g("a12").weight, a2: g("a2").weight,
      warn: document.querySelectorAll("#wbsTableBody input.weight-warn").length, chip: getComputedStyle(document.getElementById("wbsWeightErrChip")).display !== "none",
      A: g("A").aProg, B: g("B").aProg, tot: WBSEngine.weightedProgress(wbsData.filter(t => t.level === 1)).actual }; });
    await wc.evaluate(() => WbsWeight.set(wbsData.findIndex(t => t.name === "a1"), "50"));
    const c1 = await W();
    check("Changing an upper weight rescales its lower Tasks (a1 60→50: a11/a12 25/25); sibling sum ≠ 100 is flagged",
      c1.a11 === 25 && c1.a12 === 25 && c1.warn === 2 && c1.chip, JSON.stringify(c1));
    await wc.evaluate(() => WbsWeight.set(wbsData.findIndex(t => t.name === "a11"), "33.33"));
    await wc.waitForTimeout(1200); await wc.evaluate(() => AppStore.flush());
    await wc.reload(); await wc.waitForTimeout(1500); await waitApp(wc); await wc.evaluate(() => GShell.go("tab-wbs")); await wc.waitForTimeout(600);
    const c2 = await W();
    check("Weights keep 1 decimal (33.33→33.3); warning colours stay after saving and reloading", c2.a11 === 33.3 && c2.warn === 4 && c2.chip, JSON.stringify(c2));
    await wc.evaluate(() => WbsWeight.runFix()); await wc.waitForTimeout(400);
    const c3 = await W();
    check("[⚖️ 가중치 오류 보정] splits only the flagged groups by planned days (a1/a2 50/50, a11 10d / a12 20d → 16.7/33.3); no warnings left",
      c3.a1 === 50 && c3.a2 === 50 && c3.a11 === 16.7 && c3.a12 === 33.3 && c3.warn === 0 && !c3.chip, JSON.stringify(c3));
    check("Project total = each subsystem's progress × subsystem weight (A 70 : B 30)", c3.tot === Math.round(c3.A * 0.7 + c3.B * 0.3), JSON.stringify(c3));
    await wc.evaluate(() => { NeoDetail.open(wbsData.findIndex(t => t.name === "a12")); NeoDetail.run("addChildTask"); }); await wc.waitForTimeout(400);
    const p1 = await wc.evaluate(() => ({ lv: NeoDetail.row().level, name: NeoDetail.row().name }));
    await wc.evaluate(() => NeoDetail.level(-1)); await wc.waitForTimeout(400);
    const p2 = await wc.evaluate(() => ({ lv: NeoDetail.row().level, name: NeoDetail.row().name, max: Math.max(...wbsData.map(t => t.level)) }));
    check("Detail panel: [+ 하위] opens the new child, and [◀ 레벨 올리기] moves it back up (follows the Task after renumbering)",
      p1.lv === 4 && /하위 Task/.test(p1.name) && p2.lv === 3 && p2.name === p1.name && p2.max <= 5, JSON.stringify({ p1, p2 }));
    // 실적 일괄 반영 규칙 · 일정 역전 색 · 단계별 조회 · 판정 기준
    console.log("\n[Actual apply rules, stage filter, judgement rules]");
    await wc.evaluate(() => {
      NeoDetail.close();
      projectConfig.reportDate = "2026-11-18"; projectConfig.weekStartDay = 1;   // 기준 주차 11-16(월) ~ 11-22
      subsystemsMeta = [{ domain: "기본분야", code: "A", name: "A", type: "SDLC", sdlcCode: "SDLC_WATERFALL", weight: 100, pm: "" }];
      wbsData = [{ level: 1, system: "A", name: "A 구축", weight: 100 },
        { level: 2, system: "A", name: "분석", weight: 50 },
        { level: 3, system: "A", name: "t1", weight: 25, pStart: "2026-11-02", pEnd: "2026-11-10" },
        { level: 3, system: "A", name: "t2", weight: 25, pStart: "2026-11-17", pEnd: "2026-11-19" },
        { level: 2, system: "A", name: "설계", weight: 50 },
        { level: 3, system: "A", name: "t3", weight: 20, pStart: "2026-11-10", pEnd: "2026-11-17" },
        { level: 3, system: "A", name: "t4", weight: 15, pStart: "2026-11-25", pEnd: "2026-11-30" },
        { level: 3, system: "A", name: "t5", weight: 15, pStart: "2026-11-01", pEnd: "2026-11-12", aStart: "2026-11-20" }];
      rebuildAll(true); GShell.go("tab-wbs");
      const f = document.getElementById("wbsSubsystemFilter"); if (f) f.value = "ALL";
    });
    await wc.waitForTimeout(800);
    await wc.evaluate(() => fillActualFromPlan());
    await wc.waitForTimeout(500);
    const ap = await wc.evaluate(() => { const g = n => { const t = wbsData.find(x => x.name === n); return [t.aProg, t.aStart || "", t.aEnd || ""].join("|"); };
      return { t1: g("t1"), t2: g("t2"), t3: g("t3"), t4: g("t4"), t5: g("t5"), rev: document.querySelectorAll("#wbsTableBody input.date-reversed").length }; });
    check("Bulk actual apply: every Task with plan > 0; start = week start if planned earlier (else plan start); end = plan end in the week, else the report date",
      ap.t1 === "100|2026-11-16|2026-11-18" && ap.t2 === "50|2026-11-17|" && ap.t3 === "100|2026-11-16|2026-11-17" && /^0?\|\|$/.test(ap.t4), JSON.stringify(ap));
    check("Existing actual dates are kept; a start later than the end is coloured as reversed", ap.t5 === "100|2026-11-20|2026-11-18" && ap.rev === 2, JSON.stringify(ap));
    const chips = await wc.evaluate(() => {
      wbsData.find(t => t.name === "t4").pStart = "2026-11-28";   // 토요일 → 휴일
      wbsData.find(t => t.name === "t3").weight = 25;              // 가중치 합 오류
      rebuildAll(true);
      const c = id => { const e = document.getElementById(id); return getComputedStyle(e).display === "none" ? "" : e.textContent; };
      const col = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).borderTopColor : ""; };
      const g = document.getElementById("wbsErrGroup");
      return { grp: getComputedStyle(g).display !== "none" && !g.closest("div[style*='margin-left: auto']") && !!g.closest(".filter-item"), w: c("wbsWeightErrChip"), h: c("wbsHolidayErrChip"), d: c("wbsDateErrChip"), banner: !!document.querySelector(".holiday-alert-banner"),
        same: new Set([col("#wbsTableBody input.weight-warn"), col("#wbsTableBody input.holiday-date-highlight"), col("#wbsTableBody input.date-reversed")]).size };
    });
    check("WBS errors: one colour; counts in their own 오류 group apart from the buttons; no schedule notice banner",
      /가중치 \d+건/.test(chips.w) && chips.h === "휴일 2건" && chips.d === "날짜 1건" && chips.grp && !chips.banner && chips.same === 1, JSON.stringify(chips));
    await wc.selectOption("#wbsPhaseFilter", "설계"); await wc.waitForTimeout(300);
    const ph = await wc.evaluate(() => ({ opts: [...document.querySelectorAll("#wbsPhaseFilter option")].map(o => o.value).join(), rows: [...document.querySelectorAll("#wbsTableBody tr[data-wbs-id]")].map(r => wbsData.find(t => t.id === r.getAttribute("data-wbs-id")).name).join() }));
    await wc.selectOption("#wbsPhaseFilter", "ALL"); await wc.waitForTimeout(200);
    check("WBS stage filter (top of the filters) shows only that stage's Tasks with their upper Tasks", ph.opts.startsWith("ALL,분석,설계") && ph.rows === "A 구축,설계,t3,t4,t5", JSON.stringify(ph));
    const jr = await wc.evaluate(() => {
      const st = (p, a, pEnd) => WBSEngine.getTaskStatus({ pProg: p, aProg: a, pEnd }, "2026-11-18").label;
      const r = { gap3: st(50, 47, "2026-12-01"), gap5: st(50, 45, "2026-12-01"), overdue: st(100, 97, "2026-11-10") };
      projectConfig.delayGap = 2; r.gap3b = st(50, 47, "2026-12-01"); delete projectConfig.delayGap;
      const W = (t) => WeeklyReportManager.isTaskInWeek(Object.assign({ isLeaf: true }, t), "2026-11-16", "2026-11-22");
      r.wk = [W({ pStart: "2026-11-20", pEnd: "2026-11-30" }), W({ pStart: "2026-10-01", pEnd: "2026-12-31", aStart: "2026-10-01" }), W({ pStart: "2026-12-01", pEnd: "2026-12-05" }), W({ pStart: "2026-10-01", pEnd: "2026-10-05", aEnd: "2026-10-05", aProg: 100 })].join();
      r.due = NeoTodo.DUE_DAYS; projectConfig.dueDays = 14; r.due2 = NeoTodo.DUE_DAYS; delete projectConfig.dueDays;
      return r;
    });
    const od = await wc.evaluate(() => {
      const old = { level: 3, system: "A", name: "오래 밀린 일", id: "9.9.9", isLeaf: true, pStart: "2026-09-01", pEnd: "2026-09-10", pProg: 100, aProg: 20, weight: 0 };
      wbsData.push(old);
      try {
        const rep = WeeklyReportManager.buildReport(WeeklyReportManager.findWeekForDate("2026-11-18"), "SYS", "A");
        const it = (rep.currentWeekTasks || []).find(x => x.wbsId === "9.9.9");
        return it ? { status: it.status, detail: it.detail } : null;
      } finally { wbsData.splice(wbsData.indexOf(old), 1); }
    });
    check("Weekly report: a long-overdue unfinished Task is listed this week as 지연 with days overdue",
      !!od && od.status === "지연" && /계획종료 2026-09-10/.test(od.detail) && /일 경과/.test(od.detail), JSON.stringify(od));
    check("Status: delayed when actual trails plan by ≥ the set gap (default 5%p) or the plan end has passed; this-week list and due-days follow the settings",
      jr.gap3 !== "지연" && jr.gap5 === "지연" && jr.overdue === "지연" && jr.gap3b === "지연" && jr.wk === "true,true,false,false" && jr.due === 7 && jr.due2 === 14, JSON.stringify(jr));
    // 메뉴 · 첫 화면 · 영어 화면 · VOC 구분 · 샘플 프로젝트
    console.log("\n[Menus, English UI, VOC type, sample project]");
    const mn = await wc.evaluate(() => ({ groups: [...document.querySelectorAll(".g-group")].map(g => g.textContent.trim()).join("|"), land: HomeScreenManager.landingTab(),
      mw: !!document.querySelector("#tab-mywork #homeTodoContainer") && !!document.querySelector("#tab-mywork #homePortalContainer"), sw: !!document.querySelector(".home-style-switch") }));
    check("Menus: My Work · Dashboard(Summary · Dashboard · Phase) · 일정 · 요구 · VOC · 산출물 · 보고 · 소통; admin lands on Summary; My Work holds check list + own Tasks",
      /My Work/.test(mn.groups) && /Dashboard/.test(mn.groups) && /요구 · VOC · 산출물/.test(mn.groups) && /보고 · 소통/.test(mn.groups) && mn.land === "tab-home" && mn.mw && !mn.sw, JSON.stringify(mn));
    await wc.evaluate(() => { vocData = [{ id: "VOC-1", system: "A", title: "v", status: "대기" }, { id: "VOC-2", system: "A", title: "b", status: "착수전", vocType: "버그" }];
      DataRegistry.normalizeTerms({ vocData }); GShell.go("tab-voc"); });
    await wc.selectOption("#vocTypeFilter", "버그"); await wc.waitForTimeout(300);
    const vt = await wc.evaluate(() => ({ rows: document.querySelectorAll("#vocTableBody tr").length, st: vocData[1].status, dash: (() => { renderDashboard(); return document.getElementById("voc-stat-total") ? document.getElementById("voc-stat-total").textContent : "" })() }));
    await wc.selectOption("#vocTypeFilter", "ALL");
    check("VOC 구분 (VOC / 버그 / 이슈) filters the list only; old 착수전 reads as 대기", vt.rows === 1 && vt.st === "대기", JSON.stringify(vt));
    await wc.evaluate(() => SampleProject.add()); await wc.waitForTimeout(300); await wc.click("#confirmDialogOkBtn"); await wc.waitForTimeout(1200);
    const sp = await wc.evaluate(() => { const p = ProjectContext.localList().find(x => /샘플/.test(x.name)); const st = p ? LocalBackend._read(p.id) : null;
      return { has: !!p, wbs: st ? (st.wbsData || []).length : 0, members: p ? ProjectTransfer._usersOf(p.id, ProjectContext.allUsers).length : 0 }; });
    check("[🧪 샘플 프로젝트 추가] adds a separate sample project with its members (no reload needed)", sp.has && sp.wbs > 20 && sp.members >= 8, JSON.stringify(sp));
    const th = await wc.evaluate(() => {
      const r = { opts: [...document.querySelectorAll("#cfgThemeSelect option")].map(o => o.value).join(","), def: defaultTheme(),
        legacy: ["green", "navy", "matte", "mocha", "graphite"].map(normalizeTheme).join(",") };
      changeTheme("brown");
      r.body = document.body.getAttribute("data-theme");
      r.chart = ChartTheme.get().actual;
      r.logo = getComputedStyle(document.querySelector(".brand-logo")).content || "";
      changeTheme("dark"); r.chartDark = ChartTheme.get().actual; r.logoDark = getComputedStyle(document.querySelector(".brand-logo")).content || "";
      changeTheme("urban-slate");
      const btn = [...document.querySelectorAll("button")].find(b => b.offsetParent && b.querySelector("svg.iostar-ico"));
      r.icons = document.querySelectorAll("svg.iostar-ico").length;
      r.btnEmoji = btn ? /[\u{1F300}-\u{1FAFF}]/u.test(btn.textContent) : true;
      return r;
    });
    check("Themes: 5 (Slate default · Walnut · Navy · Obsidian · Pop); old values map over; logo · chart colours follow the theme; emoji drawn as line icons",
      th.opts === "urban-slate,brown,classic,dark,electric" && th.def === "urban-slate" && th.legacy === "urban-slate,classic,urban-slate,brown,dark"
      && th.body === "brown" && th.chart && th.chart !== th.chartDark && /iostar_mono/.test(th.logo) && !/iostar_mono/.test(th.logoDark) && th.icons > 20 && !th.btnEmoji, JSON.stringify(th));
    const ux = await wc.evaluate(async () => {
      GShell.go("tab-home"); await new Promise(r => setTimeout(r, 300));
      const r = { ver: (document.getElementById("gUserVer") || {}).textContent || "", verHidden: getComputedStyle(document.getElementById("headerVersionBadge")).display === "none",
        dotW: Math.round(document.getElementById("storageStatusBox").getBoundingClientRect().width), dotTitle: document.getElementById("storageStatusBox").title,
        heroInline: document.querySelectorAll("#execHeroBanner [style]").length, heroLevel: document.getElementById("execHeroStatusBadge").getAttribute("data-level") };
      GShell.go("tab-mywork"); await new Promise(r => setTimeout(r, 300));
      const h = document.getElementById("mwHello"); r.hello = !!h && !h.hidden && /오늘의 핵심|Today/.test(h.textContent);
      GShell.go("tab-wbs"); await new Promise(r => setTimeout(r, 400));
      r.openBtns = document.querySelectorAll("#wbsTableBody .wbs-open-btn").length; r.rows = document.querySelectorAll("#wbsTableBody tr").length;
      const tr = document.querySelectorAll("#wbsTableBody tr")[2]; const td = tr && tr.querySelector("td:nth-child(6)");
      if (td) td.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      r.panel = NeoDetail.isOpen() && tr.classList.contains("neo-sel"); NeoDetail.close();
      return r;
    });
    check("UX: version in the member menu (not the header), save status is a dot with a tooltip, Summary header uses classes, My Work greeting, WBS open button + row click opens the detail panel",
      /v\d/.test(ux.ver) && ux.verHidden && ux.dotW <= 34 && !!ux.dotTitle && ux.heroInline === 0 && !!ux.heroLevel && ux.hello && ux.openBtns > 0 && ux.openBtns === ux.rows && ux.panel, JSON.stringify(ux));
    const rp = await wc.evaluate(async () => {
      const out = {};
      for (const [tab, tb, kind] of [["tab-req", "reqMasterTableBody", "req"], ["tab-voc", "vocTableBody", "voc"], ["tab-deliverables", "deliverablesTableBody", "deliv"]]) {
        GShell.go(tab); await new Promise(r => setTimeout(r, 300));
        const rows = document.querySelectorAll(`#${tb} > tr`).length, btn = document.querySelector(`#${tb} .rec-open-btn`);
        if (!btn) { out[kind] = "rows:" + rows; continue; }
        btn.click(); await new Promise(r => setTimeout(r, 200));
        const open = RecordPanel.isOpen(), sel = document.querySelector('#recPanel select[data-change-args*="status"]');
        const v = sel.options[sel.options.length - 1].value === sel.value ? sel.options[0].value : sel.options[sel.options.length - 1].value;
        sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true }));
        const saved = UiH._array(RecordPanel.SCHEMAS[kind].data)[RecordPanel.idx()].status === v;
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        out[kind] = [rows > 0, open, saved, !RecordPanel.isOpen()].join();
      }
      openPromptDialog("t", "abc", v => { window.__pv = v; }); await new Promise(r => setTimeout(r, 100));
      document.getElementById("promptDialogField").value = "xyz"; closePromptDialog(true); out.prompt = window.__pv;
      const b = document.createElement("button"); b.setAttribute("data-btn", "excel-down"); b.setAttribute("data-click", "GShell.closeMenus"); document.body.appendChild(b); b.click();
      out.busy = b.classList.contains("is-busy"); b.remove();
      out.themes = typeof THEMES !== "undefined" && document.querySelectorAll(".g-swatch").length === THEMES.length && document.querySelectorAll("#cfgThemeSelect option").length === THEMES.length;
      return out;
    });
    check("Right detail panel for REQ · VOC · deliverables (open, edit, Esc); in-app prompt; busy lock on download buttons; theme pickers drawn from the registry",
      Object.keys(rp).filter(k => ["req", "voc", "deliv"].includes(k)).every(k => rp[k] === "true,true,true,true" || /^rows:0$/.test(rp[k])) && rp.prompt === "xyz" && rp.busy && rp.themes, JSON.stringify(rp));
    // 1차 정리: 표기 규칙 묶음 · Action Item 수정 패널 · 보고서 카드 · 양식 색상 3가지 · Navy 왼쪽 메뉴
    const ph1 = await wc.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
      const keep = meetingsData;
      meetingsData = [{ id: "M-T", title: "t", date: "2027-05-20", system: "ALL", actionItems: [{ id: "ACT-T1", meetingId: "M-T", title: "a", status: "진행중", targetDate: "2027-05-25" }] }];
      GShell.go("tab-meeting"); MeetingManager.switchSubTab("actionitems"); await wait(300);
      o.noAdd = !document.querySelector('#meeting-panel-actionitems [data-click="MeetingManager.openAddActionItemModal"]');
      document.querySelector("#aiTrackerTableBody td.ai-title").click(); await wait(200);
      o.open = RecordPanel.isOpen() && RecordPanel._kind === "action";
      const ta = document.querySelector("#recPanel textarea"); ta.value = "b"; ta.dispatchEvent(new Event("change", { bubbles: true })); await wait(400);
      const sel = document.querySelector("#recPanel select"); sel.value = "완료"; sel.dispatchEvent(new Event("change", { bubbles: true })); await wait(200);
      const a = meetingsData[0].actionItems[0]; o.saved = a.title + "/" + a.status + "/" + RecordPanel.isOpen();
      RecordPanel.close(); meetingsData = keep; MeetingManager.render();
      const c = document.getElementById("ruleCard");
      o.rule = !!c && !!c.querySelector("#weekFmtBox") && c.querySelectorAll(".rule-id-box").length === 4;
      o.card = [...document.querySelectorAll(".exec-report-card .exec-report-btns button")].map(b => b.getAttribute("data-click") + (b.getAttribute("data-click-args") || "")).join();
      o.exp = ExcelSync.EXPORT_THEMES.join() + "|" + ["Official Navy", "Office Blue", "Office Gray", "Office Green", "Matte Slate"].map(v => ExcelSync.normalizeExportTheme(v)).join();
      const th = document.body.getAttribute("data-theme"); document.body.setAttribute("data-theme", "classic");
      const probe = document.createElement("button"); probe.className = "g-side-item"; document.body.appendChild(probe);
      o.navy = getComputedStyle(probe).color; probe.remove(); document.body.setAttribute("data-theme", th);
      return o; });
    check("Action Items are added only in minutes and edited in the right panel; ID + week rules in one card; Summary card = 종합보고서 PPT + weekly Word; export colours Navy · Gray · Mint; Navy side menu text is light",
      ph1.noAdd && ph1.open && ph1.saved === "b/완료/true" && ph1.rule && ph1.card === 'ExecDeck.downloadPptx,ExecReport.download["WORD"]'
      && ph1.exp === "Navy,Gray,Mint|Navy,Navy,Gray,Mint,Gray" && ph1.navy === "rgb(227, 236, 250)", JSON.stringify(ph1));
    const en = await newPage();
    await en.goto(web.url); await en.waitForTimeout(1500);
    await en.selectOption("#inputLoginLang", "en"); await en.waitForTimeout(300);
    const enT = await en.evaluate(() => ({ title: document.getElementById("lockModalTitle").textContent, btn: document.getElementById("btnLockSubmit").textContent.trim() }));
    check("English UI is available on the member selection screen", /Choose member/.test(enT.title) && /Start/.test(enT.btn), JSON.stringify(enT));
    const enIco = await en.evaluate(() => { const b = [...document.querySelectorAll(".login-2col button, .login-2col a")].filter(x => x.offsetParent && x.querySelector("svg.iostar-ico")); return b.map(x => x.textContent.trim()).join(" | "); });
    check("English text still applies next to the line icons (emoji-free lookup)", enIco && !/[가-힣]/.test(enIco), enIco);
    // Workgroup(서버 판)에서 내려받은 프로젝트 백업(JSON)을 새 프로젝트로 올림 (같은 자료 형식)
    const wgJson = fs.readFileSync(path.join(ROOT, "tools", "tests", "fixtures", "workgroup_project_backup.json"), "utf8");
    const wg = await pm.evaluate(async (txt) => {
      GShell.go("tab-merge"); if (typeof SubTabs !== "undefined") SubTabs.show("merge", "backup"); await new Promise(r => setTimeout(r, 600));
      if (typeof ProjectTransfer.render === "function") await ProjectTransfer.render();
      document.getElementById("ptUpTarget").value = "__NEW__";
      await ProjectTransfer.upload({ target: { files: [new File([txt], "workgroup_project_backup.json")], value: "" } });
      await new Promise(r => setTimeout(r, 600));
      const p = ProjectContext.localList().find(x => x.name === "Workgroup 서버 프로젝트 (호환 시험)");
      const st = p ? LocalBackend._read(p.id) : null;
      return { pid: p && p.id, wbs: st ? (st.wbsData || []).length : 0, req: st ? (st.reqMasterData || []).length : 0, src: JSON.parse(txt).data.wbsData.length,
        members: p ? ProjectTransfer._usersOf(p.id, ProjectContext.allUsers).length : 0, from: JSON.parse(txt).appVersion };
    }, wgJson);
    check("A Workgroup project backup (JSON, v0.4.0) uploads into Standalone as a new project (Tasks · REQ · members)",
      !!wg.pid && wg.wbs === wg.src && wg.req > 0 && wg.members >= 8, JSON.stringify(wg));
    // 데이터 관리: 브라우저 저장 용량
    await pm.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "data"); }); await pm.waitForTimeout(700);
    const usage = await pm.evaluate(() => document.getElementById("daUsage").textContent);
    check("Data management shows browser storage usage", usage.includes("IndexedDB"), usage);
    check("No requests outside /pprjmgmt (no server, no external calls) and no page errors",
      pm.external.length + wa.external.length + wb.external.length + wc.external.length + en.external.length === 0 && pm.errors.length + wa.errors.length + wb.errors.length + wc.errors.length + en.errors.length === 0, pm.external.concat(wa.external, wb.external, wc.external, pm.errors, wa.errors, wb.errors, wc.errors).slice(0, 4).join(" | "));
    void pkg2;
  } finally {
    web.stop();
  }
}

(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await main();
  } catch (e) {
    check("Test runner error", false, e.message);
  } finally {
    await browser.close();
  }
  const fail = results.filter(r => !r.ok);
  console.log(`\nResult: ${results.length - fail.length} / ${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})();
