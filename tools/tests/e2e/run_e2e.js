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
// 버전은 conf/app.ini 에서 읽음 (버전을 올릴 때 시험을 고치지 않게)
const APP_VER = (fs.readFileSync(path.join(ROOT, "conf", "app.ini"), "utf8").match(/^version=(.+)$/m) || [])[1].trim();
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
  await page.fill("#inputSecurityPassword", store[emp] || "1234");
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
    // 계산 단위 시험 (tools/tests/unit — 1초)
    { let out = "", ok = true; try { out = execFileSync("node", [path.join(ROOT, "tools", "tests", "unit", "run_unit.js")], { encoding: "utf8" }); } catch (e) { ok = false; out = String(e.stdout || e.message); }
      check("Calculation unit tests pass (Metrics · WBSEngine · Migrate · templates)", ok, out.trim().split("\n").slice(-3).join(" | ")); }
    console.log("\n[Static package under /pprjmgmt]");
    check("Package is static files only (index.html at the top, no server program)", web.zip === `IOSTAR-PM-Standalone_v${APP_VER}.zip` && web.entries.includes("index.html") && web.entries.includes("static")
      && !web.entries.some(f => /server|\.py$|conf|data/.test(f)), web.entries.join(","));
    const pm = await newPage();
    await pm.goto(web.url);
    await pm.evaluate(() => localStorage.setItem("enterprise_app_key", "keep"));
    await pm.reload(); await pm.waitForTimeout(1500);
    const login = await pm.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), start: !!document.getElementById("localStartInput"),
      brand: document.querySelector(".login-brand-name").textContent }));
    check("Worker selection: admin · admin2 only, [start from 종합본] button, Local shown", login.workers === "admin,admin2" && login.start && login.brand.includes("Standalone"), JSON.stringify(login));
    await pm.fill("#inputSecurityEmpNo", "admin"); await pm.fill("#inputSecurityPassword", "admin123!");
    await pm.click("#btnLockSubmit"); await pm.waitForTimeout(900);
    const pw = await pm.evaluate(() => ({ err: (document.getElementById("lockErrorMessage") || {}).textContent || "", hint: document.getElementById("lockModalDesc").textContent,
      noReuse: !!AuthManager.validateNewPassword("1234", "hong"), ok: AuthManager.validateNewPassword("Hong2026x", "hong") === "" }));
    check("Initial password is 1234 for every member (old ID+123! rejected; cannot be kept as the new password)", /일치하지/.test(pw.err) && pw.hint.includes("1234") && pw.noReuse && pw.ok, JSON.stringify(pw));
    await pickWorker(pm, "admin", PWD);
    check("First login with the initial password forces a password change (same as Workgroup)", !!PWD.admin && await pm.evaluate(() => !!(AuthManager.currentUser && AuthManager.currentUser.empNo === "admin")), JSON.stringify(PWD));
    const st = await pm.evaluate(() => ({ ver: document.getElementById("headerVersionBadge").textContent, title: document.title, mode: DbConnector.config.mode, wbs: wbsData.length, subs: subsystemsMeta.length,
      users: (ProjectContext.allUsers || projectUsers).map(u => u.empNo).join(), ls: Object.keys(localStorage).join(), idb: AppStore.length > 0 && !AppStore._fallback,
      gone: [typeof RealtimeChatManager, typeof AttachManager, typeof Features, typeof ServerHeartbeat].every(t => t === "undefined") && !document.getElementById("subtabBtn_CHAT") && !document.querySelector('[data-subtab="locks"]') }));
    check("Starts empty in Local mode; data in IndexedDB only (the enterprise system's localStorage untouched); chat / attachments / samples / server features gone",
      st.ver === `Standalone v${APP_VER}` && st.title.includes("PM Hub") && st.title.includes("IOSTAR-PM Standalone") && st.mode === "LOCAL" && st.wbs === 0 && st.subs === 0 && st.users === "admin,admin2" && st.ls === "enterprise_app_key" && st.idb && st.gone, JSON.stringify(st));
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
    await wa.evaluate(async () => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 수정)"; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
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
    await wa.evaluate(async () => { wbsData.find(t => t.id === "1.1").aProg = 30; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
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
    await pm.evaluate(async () => { wbsData.find(t => t.id === "2.1").name = "W2 설계 (PM 수정)"; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
    const pkg3 = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("JSON")');
    await wa.evaluate(async () => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 2차)"; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
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
    await wa.evaluate(async () => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 3차)"; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
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
    await pm.evaluate(async () => { wbsData.find(t => t.id === "2.1").name = "W2 설계 (PM 4차)"; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
    await pm.waitForTimeout(1100);
    const lj = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("SERVER")');
    const s5 = JSON.parse(lj.text).packageStamp;
    fs.writeFileSync(path.join(web.tmp, "pprjmgmt", "shared", "latest.json"), lj.text);
    check("PM makes the deploy 종합본 named latest.json (whole project, new version)", lj.name === "latest.json" && JSON.parse(lj.text).targetScope === "ALL" && s5 > s4, lj.name + " " + s5);
    const wb = await newPage();
    await wb.goto(web.url); await wb.waitForTimeout(2500);
    // 자료가 없는 새 PC: 서버의 마스터 파일로 시작할지 묻는다 → [이 마스터 파일로 시작]
    const askShown = await wb.$eval("#syncAskModal", e => getComputedStyle(e).display === "flex").catch(() => false);
    if (askShown) { await wb.click("#syncAskBtns button:first-child"); await wb.waitForTimeout(3500); }
    await wb.waitForFunction(() => window.AppBoot && document.querySelectorAll("#workerPickList option").length > 1, null, { timeout: 8000 }).catch(() => {});
    const nb = await wb.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), proj: document.getElementById("inputLoginProject").selectedOptions[0].textContent }));
    await pickWorker(wb, "wg_b", PWD);
    const nb2 = await wb.evaluate(() => ({ wbs: wbsData.length, w2: wbsData.find(t => t.id === "2.1").name, own: Permission.ownSubsystem() }));
    check("New PC opening the site is asked, then starts from the server 종합본 (no file to pass around)",
      askShown && nb.workers.includes("wg_b") && nb.proj.includes(j1.projectName) && nb2.wbs === 4 && nb2.w2 === "W2 설계 (PM 4차)" && nb2.own === "W2", JSON.stringify({ nb, nb2 }));
    await wa.evaluate(async () => { wbsData.find(t => t.id === "1.1").name = "W1 설계 (가작업 4차)"; rebuildAll(true); persistChanges(true); await SyncManager.save(null, { notify: false }); });
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
    // 다음 시험이 빈 PC 로 화면을 열 때 질문 창이 뜨지 않도록 배포 폴더의 마스터 파일을 치움
    fs.rmSync(path.join(web.tmp, "pprjmgmt", "shared", "latest.json"), { force: true });
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
    await wc.waitForTimeout(1200); await wc.evaluate(async () => { await SyncManager.save(null, { notify: false }); await AppStore.flush(); });
    await wc.reload(); await wc.waitForTimeout(1500); await waitApp(wc); await wc.evaluate(() => GShell.go("tab-wbs")); await wc.waitForTimeout(600);
    const c2 = await W();
    check("Weights keep 1 decimal (33.33→33.3); warning colours stay after saving and reloading", c2.a11 === 33.3 && c2.warn === 4 && c2.chip, JSON.stringify(c2));
    await wc.evaluate(() => WbsWeight.runFix()); await wc.waitForTimeout(400);
    const c3 = await W();
    check("[⚖️ 가중치 오류 보정] splits only the flagged groups by planned days (a1/a2 50/50, a11 10d / a12 20d → 16.7/33.3); no warnings left",
      c3.a1 === 50 && c3.a2 === 50 && c3.a11 === 16.7 && c3.a12 === 33.3 && c3.warn === 0 && !c3.chip, JSON.stringify(c3));
    check("Project total = each subsystem's progress × subsystem weight (A 70 : B 30)", c3.tot === Math.round(c3.A * 0.7 + c3.B * 0.3), JSON.stringify(c3));
    await wc.evaluate(() => { WbsDetail.open(wbsData.findIndex(t => t.name === "a12")); WbsDetail.run("addChildTask"); }); await wc.waitForTimeout(400);
    const p1 = await wc.evaluate(() => ({ lv: WbsDetail.row().level, name: WbsDetail.row().name }));
    await wc.evaluate(() => WbsDetail.level(-1)); await wc.waitForTimeout(400);
    const p2 = await wc.evaluate(() => ({ lv: WbsDetail.row().level, name: WbsDetail.row().name, max: Math.max(...wbsData.map(t => t.level)) }));
    check("Detail panel: [+ 하위] opens the new child, and [◀ 레벨 올리기] moves it back up (follows the Task after renumbering)",
      p1.lv === 4 && /하위 Task/.test(p1.name) && p2.lv === 3 && p2.name === p1.name && p2.max <= 5, JSON.stringify({ p1, p2 }));
    // 실적 일괄 반영 규칙 · 일정 역전 색 · 단계별 조회 · 판정 기준
    console.log("\n[Actual apply rules, stage filter, judgement rules]");
    await wc.evaluate(() => {
      WbsDetail.close();
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
      r.due = CheckList.DUE_DAYS; projectConfig.dueDays = 14; r.due2 = CheckList.DUE_DAYS; delete projectConfig.dueDays;
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
    await wc.selectOption("#vocJudgeFilter", "결함"); await wc.waitForTimeout(300);
    const vt = await wc.evaluate(() => ({ rows: document.querySelectorAll("#vocTableBody tr").length, st: vocData[1].status, judge: vocData[1].vocType, old: vocData[0].vocType,
      badges: !!document.getElementById("tab-voc-stat-total"), heads: document.querySelectorAll("#vocTable thead th").length, cells: (document.querySelector("#vocTableBody tr") || { children: [] }).children.length }));
    await wc.selectOption("#vocJudgeFilter", "ALL");
    check("VOC 판정: old 구분 버그 → 결함, VOC → 미판정; judgement filter; header and row cells from one column list; no duplicate status-count row",
      vt.rows === 1 && vt.st === "대기" && vt.judge === "결함" && vt.old === "미판정" && !vt.badges && vt.heads === vt.cells, JSON.stringify(vt));
    const cr = await wc.evaluate(async () => {
      VocRules.set(0, "vocType", "개선 요청"); VocRules.register(0); await new Promise(r => setTimeout(r, 150));
      document.getElementById("confirmDialogOkBtn").click(); await new Promise(r => setTimeout(r, 200));
      const req = reqMasterData.find(r => r.srcVoc === "VOC-1");
      const vs = Metrics.vocStats(vocData);
      return { st: vocData[0].status, link: vocData[0].reqLink, req: req && [req.id, req.origin], open: Metrics.vocOpen(vocData).map(v => v.id), done: vs.done, total: vs.total };
    });
    check("VOC 개선 요청 → [추가 요구사항으로 등록]: CR ID in requirements, VOC 요구 반영 (counted as handled, not open)",
      cr.st === "요구 반영" && cr.req && /^CR-/.test(cr.req[0]) && cr.req[1] === "추가" && cr.link === cr.req[0] && cr.open.indexOf("VOC-1") === -1 && cr.done === 1, JSON.stringify(cr));
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
      th.opts === "urban-slate,brown,navy,classic,dark,electric" && th.def === "urban-slate" && th.legacy === "urban-slate,navy,urban-slate,brown,dark"
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
      r.panel = WbsDetail.isOpen() && tr.classList.contains("neo-sel"); WbsDetail.close();
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
      // ID 규칙 카드와 주차 표시 카드는 같은 줄에 나란히 (1.5.1 배치)
      o.rule = !!c && !!document.getElementById("weekFmtBox") && c.nextElementSibling && c.nextElementSibling.contains(document.getElementById("weekFmtBox")) && (IdRules.render(), c.querySelectorAll(".rule-id-box").length === 5);
      o.card = [...document.querySelectorAll(".exec-report-card .exec-report-btns button")].map(b => b.getAttribute("data-click") + (b.getAttribute("data-click-args") || "")).join();
      o.exp = ExcelSync.EXPORT_THEMES.join() + "|" + ["Official Navy", "Office Blue", "Office Gray", "Office Green", "Matte Slate"].map(v => ExcelSync.normalizeExportTheme(v)).join();
      const th = document.body.getAttribute("data-theme"); document.body.setAttribute("data-theme", "classic");
      const probe = document.createElement("button"); probe.className = "g-side-item"; document.body.appendChild(probe);
      o.navy = getComputedStyle(probe).color; probe.remove(); document.body.setAttribute("data-theme", th);
      return o; });
    check("Action Items are added only in minutes and edited in the right panel; ID rules and week display side by side; Summary card = 종합보고서 PPT + weekly Word; export colours Navy · Gray · Mint; Navy side menu text is light",
      ph1.noAdd && ph1.open && ph1.saved === "b/완료/true" && ph1.rule && ph1.card === 'ExecDeck.downloadPptx,ExecReport.download["WORD"]'
      && ph1.exp === "Navy,Gray,Mint|Navy,Navy,Gray,Mint,Gray" && ph1.navy === "rgb(227, 236, 250)", JSON.stringify(ph1));
    // 2차: [보고] 메뉴 — 주간보고 작성 · 출력 / 종합보고서 출력 / 보고서 설정(PM 이상)
    const ph2 = await wc.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
      GShell.go("tab-weekly-report"); await wait(400);
      o.label = GShell.label("tab-weekly-report");
      o.tabs = [...document.querySelectorAll("[data-rp-tab]")].filter(b => !b.hidden).map(b => b.getAttribute("data-rp-tab")).join();
      ReportTabs.show("deck"); await wait(300);
      o.deck = document.getElementById("rpDeckWeek").options.length > 0 && document.querySelectorAll("#rpDeckSlides li").length >= 3;
      const og = ExcelSync._triggerDownload; let name = ""; ExcelSync._triggerDownload = (b, n) => { name = n; };
      try { ReportTabs.downloadDeck(); } finally { ExcelSync._triggerDownload = og; }
      o.file = /_종합보고서_\d{4}W\d{2}_PPT\.pptx$/.test(name);
      ReportTabs.show("settings"); await wait(300);
      const sel = document.getElementById("cfgExportUnifiedTheme");
      o.settings = document.getElementById("reportSub-settings").contains(sel) && !!sel.offsetParent && sel.options.length === 3;
      o.oneplace = !document.querySelector('.master-subtab-btn[data-subtab="ui-report"]') && !!document.querySelector(".master-subtab-link");
      MasterSubTabs.show("ui-report"); await wait(300);
      o.redirect = document.querySelector(".tab-pane.active").id + "/" + ReportTabs.cur;
      const role = AuthManager.getCurrentRole; AuthManager.getCurrentRole = () => "MEMBER"; ReportTabs.sync();
      o.member = ReportTabs.cur + "/" + document.querySelector('[data-rp-tab="settings"]').hidden;
      AuthManager.getCurrentRole = role; ReportTabs.sync(); ReportTabs.show("weekly");
      return o; });
    check("Menu 보고: weekly report / summary report (PPT) / report settings in one place; settings for PM and above only; old settings tab redirects here",
      ph2.label === "보고" && ph2.tabs === "weekly,deck,settings" && ph2.deck && ph2.file && ph2.settings && ph2.oneplace && ph2.redirect === "tab-weekly-report/settings" && ph2.member === "weekly/true", JSON.stringify(ph2));
    // 3차: 종합보고서 구성(요약형 · 종합형 · 상세형 · 직접 선택)과 디자인 세트 5종, 상세 패널 자리
    const ph3 = await wc.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), o = {}, wn = ExecDeck.week();
      const keep = JSON.stringify((projectConfig.exportSettings || {}).deck || null);
      o.def = ExecDeck.options().preset + "/" + ExecDeck.options().design;
      ReportTabs.open("settings"); await wait(400);
      o.ui = [document.querySelectorAll("#deckPresetBox .deck-preset").length, document.querySelectorAll("#deckSectionBox input").length, document.querySelectorAll("#deckDesignBox .deck-design").length].join();
      const names = () => ExecDeck.build(wn).slides.map(x => x.name);
      DeckSettings.setPreset("brief"); o.brief = names().join();
      DeckSettings.setPreset("standard"); const st = names(); o.standard = st.indexOf("목차") === 1 && st.indexOf("S-커브") !== -1 && st.indexOf("서브시스템") === -1 && !st.some(n => getAllSubsystemNames().indexOf(n) !== -1);
      document.querySelector('#deckSectionBox input[data-change-args*="scurve"]').click(); await wait(100);
      o.custom = ExecDeck.options().preset + "/" + (names().indexOf("S-커브") === -1);
      DeckSettings.setPreset("detail");
      o.designs = ExecDeck.DESIGNS.map(d => { DeckSettings.setDesign(d.id); const deck = ExecDeck.build(wn); return deck.c.design === d.id && ExecDeck.toPptxBlob(deck).size > 5000 && ExecDeck.toHtml(deck).length > 5000; }).join();
      DeckSettings.setDesign("sidebar"); const sb = ExecDeck.build(wn).slides[2].els.filter(e => !e.fixed); o.sidebar = sb.every(e => e.x >= 2.29 && e.x + e.w <= ExecDeck.W + 0.01);
      projectConfig.exportSettings.deck = JSON.parse(keep) || undefined; if (!projectConfig.exportSettings.deck) delete projectConfig.exportSettings.deck;
      DeckSettings.render(); ReportTabs.show("weekly");
      reqMasterData = (reqMasterData || []).concat([{ id: "REQ-PD", system: "A", name: "p", type: "기능", priority: "중", accept: "수용", status: "대기" }]);
      GShell.go("tab-req"); renderReqMasterTable(); await wait(300);
      document.querySelector("#reqMasterTableBody .rec-open-btn").click(); await wait(400);
      const pn = document.getElementById("recPanel").getBoundingClientRect(), hd = document.querySelector("#tab-req > .sub-header-bar").getBoundingClientRect();
      o.dock = pn.top >= hd.bottom && pn.top - hd.bottom < 20 && hd.right > pn.left + 100;
      RecordPanel.close(); reqMasterData = reqMasterData.filter(r => r.id !== "REQ-PD"); renderReqMasterTable();
      return o; });
    check("Summary report: default keeps the old contents (detailed, Classic Band); presets brief / standard / detailed + per-slide choice; 5 design sets build PPT and preview; detail panel starts under the screen header",
      ph3.def === "detail/classic" && ph3.ui === "4,10,5" && ph3.brief === "표지,종합 진척 현황,지연·마일스톤" && ph3.standard && ph3.custom === "custom/true" && ph3.designs === "true,true,true,true,true" && ph3.sidebar && ph3.dock, JSON.stringify(ph3));
    // 요건 반영: 서브메뉴 줄 통일 · 저장 방식 · 머리글 · Admin 프로젝트 · 자료 묶음 · 제출일 일괄 변경 · 테마 6종 · 달성률 "-"
    const rq = await wc.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), o = {};
      o.subTabs = ["meetingSubTabs", "rpTabs", "boardSubTabs"].every(id => { const e = document.getElementById(id); return e && e.classList.contains("master-subtab-bar") && !e.closest(".sub-header-bar"); });
      o.noAuto = SyncManager.isAutoSave() === false;
      await SyncManager.save(null, { notify: false });
      const before = JSON.stringify(reqMasterData || []);
      reqMasterData = (reqMasterData || []).concat([{ id: "REQ-RV", system: "A", name: "revert me", status: "대기" }]); persistChanges();
      await wait(700); o.dirty = SyncManager.isDirty();
      GShell.go("tab-req"); await wait(300); const f = document.getElementById("reqSearchInput") || document.querySelector("#tab-req input[type=text]");
      await SyncManager.refresh(null, { skipConfirm: true, silent: true }); await wait(300);
      o.reverted = JSON.stringify(reqMasterData || []) === before && !SyncManager.isDirty();
      o.header = !!document.getElementById("btnHeaderRefreshAll") && document.getElementById("btnHeaderRefreshAll").tagName === "BUTTON" && !document.getElementById("gStatusMenu") && !document.getElementById("btnProjectManager");
      o.who = document.getElementById("gUserWho").textContent.includes("—") && !/admin\)/.test(document.getElementById("headerCurrentUserBadge").textContent);
      await ProjectManager.open(); await wait(500);
      o.admin = document.querySelector(".tab-pane.active").id === "tab-config" && !!document.getElementById("pmNewName") && !!document.getElementById("cfgSystemTitle") && !document.getElementById("projectManagerModal");
      document.getElementById("cfgSystemTitle").value = "E2E 타이틀"; SystemTitle.save(); o.title = document.getElementById("headerSystemTitleText").textContent; SystemTitle.reset();
      GShell.go("tab-merge"); SubTabs.show("merge", "merge"); await wait(400);
      MergeTable.selectGroup("work"); const w = MergeTable.selected().join(); MergeTable.selectGroup("base"); const b2 = MergeTable.selected().join();
      o.groups = w === "wbs,req,deliverables,voc,weekly,meetings" && /config/.test(b2) && !/wbs/.test(b2) && !document.querySelector(".mt-pkg");
      const keepD = deliverablesData; deliverablesData = [{ id: 1, round: "1차", system: "A", name: "d1", pDate: "2027-01-01", status: "작성전" }, { id: 2, round: "1차", system: "A", name: "d2", pDate: "2027-01-01", aDate: "2027-01-02", status: "보완완료" }];
      GShell.go("tab-master"); MasterSubTabs.show("deliv"); await wait(300);
      document.getElementById("delivBulkRound").value = "1차"; document.getElementById("delivBulkDate").value = "2027-03-31"; DelivBulkDate.apply(); await wait(200);
      document.getElementById("confirmDialogOkBtn").click(); await wait(300);
      o.bulk = deliverablesData[0].pDate === "2027-03-31" && deliverablesData[1].pDate === "2027-01-01"; deliverablesData = keepD;
      const hl = document.querySelector("#gAdminMenu #btnHeaderManual"); ManualViewer.open(); const fr = document.querySelector("#manualViewerModal iframe"); const shown = getComputedStyle(document.getElementById("manualViewerModal")).display === "flex"; ManualViewer.close();
      o.help = !!hl && hl.tagName === "BUTTON" && hl.nextElementSibling && /오픈소스 고지/.test(hl.nextElementSibling.textContent) && shown && fr && fr.getAttribute("src") === "manual.html" && /사용자 매뉴얼/.test(await (await fetch("manual.html")).text());
      GShell.go("tab-config"); SubTabs.show("config", "data"); await wait(400);
      o.delRow = /프로젝트 삭제/.test(document.getElementById("daActions").textContent) && typeof DataAdmin.removeProject === "function" && typeof ProjectManager.removeNow === "function";
      o.tabs = [...document.querySelectorAll('.master-subtab-bar[data-group="master"] .master-subtab-btn')].slice(0, 3).map(x => x.textContent.trim()).join("|");
      await SyncManager.refresh(null, { skipConfirm: true, silent: true });
      const cur = document.body.getAttribute("data-theme");
      changeTheme("classic"); await wait(300); o.classic = document.querySelectorAll("svg[data-ico]").length === 0;
      changeTheme("navy"); await wait(300); o.navy = document.body.getAttribute("data-theme") === "navy" && document.querySelectorAll("svg[data-ico]").length > 10 && getComputedStyle(document.body).getPropertyValue("--pf-14").trim() !== "#7A5236";
      changeTheme(cur); await wait(300);
      return o; });
    check("Requests: sub menus in one row; no autosave (edit → dirty → refresh restores); header refresh button, member name; project management and system title in Admin; data set presets; bulk submit dates; 6 themes (Classic shows emoji, Navy palette)",
      rq.subTabs && rq.noAuto && rq.dirty && rq.reverted && rq.header && rq.who && rq.admin && rq.title === "E2E 타이틀" && rq.groups && rq.bulk && /프로젝트 기본정보\|.*프로젝트 부가정보\|.*서브시스템/.test(rq.tabs) && rq.classic && rq.navy && rq.help && rq.delRow, JSON.stringify(rq));
    const en = await newPage();
    await en.goto(web.url); await en.waitForTimeout(1500);
    await en.selectOption("#inputLoginLang", "en"); await en.waitForTimeout(300);
    const enT = await en.evaluate(() => ({ title: document.getElementById("lockModalTitle").textContent, btn: document.getElementById("btnLockSubmit").textContent.trim() }));
    check("English UI is available on the member selection screen", /Choose member/.test(enT.title) && /Start/.test(enT.btn), JSON.stringify(enT));
    const enIco = await en.evaluate(() => { const b = [...document.querySelectorAll(".login-2col button, .login-2col a")].filter(x => x.offsetParent && x.querySelector("svg.iostar-ico")); return b.map(x => x.textContent.trim()).join(" | "); });
    check("English text still applies next to the line icons (emoji-free lookup)", enIco && !/[가-힣]/.test(enIco), enIco);
    // ---------------------------------------------------------------------------------------------
    // 샘플 프로젝트로 시험 — 1.5 부터 화면 시험은 [🧪 샘플 프로젝트 추가] 로 만든 자료를 씀 (담긴 경우: tools/tests/sample_coverage.js)
    // ---------------------------------------------------------------------------------------------
    console.log("\n[Sample project: the shared test data set]");
    const sx = await newPage();
    await sx.goto(web.url); await sx.waitForTimeout(1500);
    const SPW = {};
    await pickWorker(sx, "admin", SPW);
    await sx.evaluate(() => SampleProject.add()); await sx.waitForTimeout(300); await sx.click("#confirmDialogOkBtn"); await sx.waitForTimeout(1200);
    const spid = await sx.evaluate(() => { const p = ProjectContext.localList().find(x => /샘플/.test(x.name)); return p && p.id; });
    await sx.evaluate(pid => ProjectManager.switchTo(pid), spid);
    await sx.waitForTimeout(2500);
    if (await sx.evaluate(() => document.getElementById("securityLockOverlay").style.display !== "none").catch(() => false)) await pickWorker(sx, "admin", SPW, spid);
    await waitApp(sx);
    const s0 = await sx.evaluate(() => ({ pid: ProjectContext.current, wbs: wbsData.length, l5: wbsData.filter(t => t.level === 5).length, pred: wbsData.filter(t => t.pred).length, bl: (projectConfig.baselines || []).length }));
    check("Sample project opens as its own project (L5 Tasks, predecessors, baseline)", s0.pid === spid && s0.wbs > 100 && s0.l5 === 2 && s0.pred === 6 && s0.bl === 1, JSON.stringify(s0));
    // 모든 화면 · 보고 서브탭을 샘플 자료로 열어 봄
    for (const t of ["tab-mywork", "tab-home", "tab-dashboard", "tab-matrix", "tab-gantt", "tab-wbs", "tab-req", "tab-voc", "tab-deliverables", "tab-weekly-report", "tab-meeting", "tab-notices", "tab-master", "tab-merge", "tab-config"]) {
      await sx.evaluate(t => { try { GShell.go(t); } catch (e) {} }, t); await sx.waitForTimeout(200);
    }
    check("Every screen opens on the sample project without page errors", sx.errors.length === 0, sx.errors.slice(0, 3).join(" | "));

    console.log("\n[Predecessor warnings (v1.5)]");
    await sx.evaluate(() => { GShell.go("tab-wbs"); WbsStatusChips.set("ALL"); document.getElementById("wbsMaxLevelFilter").value = "5"; renderWbsTable(); }); await sx.waitForTimeout(300);
    const pwv = await sx.evaluate(() => {
      const icons = [...document.querySelectorAll("#wbsTableBody .wbs-pred")];
      const chip = [...document.querySelectorAll("#neoStatusChips .neo-chip")].find(b => /선행/.test(b.textContent));
      const tip = (document.querySelector('#wbsTableBody tr[data-wbs-id="2.3.2.1"] .wbs-pred') || {}).title || "";
      return { icons: icons.length, warn: icons.filter(i => i.classList.contains("warn")).length, tags: document.querySelectorAll("#wbsTableBody .status-tag.tag-pred").length, chip: chip ? chip.textContent.replace(/\s+/g, " ").trim() : "", tip };
    });
    check("WBS table: ⛓ before Tasks with predecessors (orange when warned, tooltip names the predecessor), '⛓ 선행 지연' tag in the status column; status button '선행 지연 4'",
      pwv.icons === 6 && pwv.warn === 4 && pwv.tags === 4 && /선행 지연 4/.test(pwv.chip) && /선행 2\.2\.2\.2 선행 지연 \(계획 종료 04\/30\)/.test(pwv.tip), JSON.stringify(pwv));
    const grp = await sx.evaluate(() => {
      const rows = () => [...document.querySelectorAll("#wbsTableBody tr")].map(r => ({ id: r.dataset.wbsId, head: r.classList.contains("wbs-group-head"), lvl: wbsData.find(t => t.id === r.dataset.wbsId).level }));
      WbsStatusChips.set("선행 지연");
      const a = rows();
      document.getElementById("wbsMaxLevelFilter").value = "2"; renderWbsTable();
      const b = rows();
      const cnt = (document.querySelector('#wbsTableBody tr[data-wbs-id="3"] .wbs-head-cnt') || {}).textContent || "";
      WbsStatusChips.set("지연");
      const c = rows();
      document.getElementById("wbsMaxLevelFilter").value = "5"; WbsStatusChips.set("ALL");
      return { aMatch: a.filter(x => !x.head).map(x => x.id).join(), aHeads: a.filter(x => x.head).length, bHeadMax: Math.max(...b.filter(x => x.head).map(x => x.lvl)), bMatch: b.filter(x => !x.head).length,
        cLeaf: c.filter(x => !x.head).length, cDelayed: wbsData.filter(t => t.isLeaf && t.status === "지연").length, cHeadMax: Math.max(...c.filter(x => x.head).map(x => x.lvl)), firstIsHead: c[0] && c[0].head, cnt };
    });
    check("Status buttons show the matching Tasks with their upper Tasks as group heads, down to the chosen level",
      grp.aMatch === "2.3.2.1,3.3.1.3,3.3.2.2,4.3.1.1" && grp.aHeads >= 6 && grp.bHeadMax === 2 && grp.bMatch === 4 && grp.cLeaf === grp.cDelayed && grp.cHeadMax <= 2 && grp.firstIsHead && grp.cnt === "선행 지연 2건", JSON.stringify(grp));
    const pd = await sx.evaluate(async () => {
      const idx = wbsData.findIndex(t => t.id === "2.4.1.1");
      WbsDetail.open(idx); await new Promise(r => setTimeout(r, 150));
      const ins = [...document.querySelectorAll("#neoDetail .neo-pred-in")].map(i => i.value);
      const lines = [...document.querySelectorAll("#neoDetail .neo-pred-line")].length;
      WbsDetail.open(wbsData.findIndex(t => t.id === "2.3.2.1")); await new Promise(r => setTimeout(r, 150));
      const warnLine = (document.querySelector("#neoDetail .neo-pred-line.warn") || {}).textContent || "";
      WbsDetail.setPred(1, "2.3"); await new Promise(r => setTimeout(r, 150));          // 자기 상위 Task → 거부
      const afterBad = wbsData.find(t => t.id === "2.3.2.1").pred;
      WbsDetail.setPred(1, "2.3.1.1"); await new Promise(r => setTimeout(r, 150));
      const afterOk = wbsData.find(t => t.id === "2.3.2.1").pred;
      WbsDetail.setPred(1, ""); await new Promise(r => setTimeout(r, 150));
      WbsDetail.setPred(1, "2.4.1.1"); await new Promise(r => setTimeout(r, 150));   // 2.4.1.1 의 선행이 2.3.2.1 → 순환이라 거부
      const loop = wbsData.find(t => t.id === "2.3.2.1").pred;
      const cleared = wbsData.find(t => t.id === "2.3.2.1").pred;
      WbsDetail.close();
      return { ins, lines, warnLine: warnLine.replace(/\s+/g, " ").trim(), afterBad, afterOk, cleared, loop };
    });
    check("Detail panel: 3 predecessor inputs with name · status · plan end; own upper Task and loops (A→B→A) refused; set and clear",
      pd.ins.join() === "2.3.1.3,2.3.2.1,2.3.2.2" && pd.lines === 3 && /2\.2\.2\.2.*지연.*선행 지연/.test(pd.warnLine) && pd.afterBad === "2.2.2.2" && pd.afterOk === "2.2.2.2, 2.3.1.1" && pd.cleared === "2.2.2.2" && pd.loop === "2.2.2.2", JSON.stringify(pd));
    const rn = await sx.evaluate(() => {
      const name = id => (wbsData.find(t => t.id === id) || {}).name;
      const target = name("2.2.2.2");
      addSiblingTask(wbsData.findIndex(t => t.id === "2.2.2.1"));        // 2.2.2.2 앞에 Task 가 생겨 번호가 밀림
      const moved = wbsData.find(t => t.name === "ERP 생산계획 연계 개발").pred;
      const follows = name(moved) === target;
      deleteWbsRow(wbsData.findIndex(t => t.name === target));            // 선행 Task 를 지우면 선행 지정도 빠짐
      const afterDel = wbsData.find(t => t.name === "ERP 생산계획 연계 개발").pred || "";
      return { moved, follows, afterDel };
    });
    check("Predecessors follow renumbered WBS IDs, and a deleted predecessor is removed", rn.moved === "2.2.2.3" && rn.follows && rn.afterDel === "", JSON.stringify(rn));
    await sx.reload(); await sx.waitForTimeout(1500);   // 위 편집은 저장하지 않았으므로 다시 열면 저장된 샘플 그대로
    if (await sx.evaluate(() => document.getElementById("securityLockOverlay").style.display !== "none").catch(() => false)) await pickWorker(sx, "admin", SPW, spid);
    await waitApp(sx);
    const vw = await sx.evaluate(async () => {
      GShell.go("tab-gantt"); await new Promise(r => setTimeout(r, 400));
      const dots = document.querySelectorAll("#ganttRowsContainer .gantt-pred-dot").length;
      const c = CheckList.collect(null, false);
      const g = TodoCenter.autoGroups().groups.find(x => x.key === "pred");
      const rep = WeeklyExport.takeSnapshot({ startDate: projectConfig.reportDate, endDate: projectConfig.reportDate, nextStartDate: projectConfig.reportDate, nextEndDate: projectConfig.reportDate });
      return { dots, hit: c.predHit.length, grp: g ? g.items.length : -1, snap: (rep.predHit || []).map(x => x.id).join() };
    });
    check("Gantt orange dot, check list '선행 지연 영향', weekly report snapshot list the same 4 Tasks",
      vw.dots === 4 && vw.hit === 4 && vw.grp === 4 && vw.snap.split(",").length === 4, JSON.stringify(vw));
    const xlp = await sx.evaluate(() => {
      const raw = { id: "9.1", level: "2", system: "MES", name: "x", pred: "1.2, 1.3;1.4 1.5" };
      return { norm: ExcelSync._normalizeRowData("wbs", raw, 0).pred, col: ExcelSync.TAB_SCHEMAS.wbs.some(c => c.key === "pred" && c.label === "선행 Task") };
    });
    const wbsX = await grab(sx, 'DataIO.download("wbs")');
    check("Excel WBS has a '선행 Task' column; upload reads up to 3 predecessors", !!wbsX && xlp.col && xlp.norm === "1.2, 1.3, 1.4", JSON.stringify({ xlp, file: wbsX && wbsX.name }));
    const ci = await sx.evaluate(() => {
      const out = {};
      const box = document.createElement("div"); box.innerHTML = '<button class="btn btn-sm" data-btn="save">✅ 체크인</button>'; document.body.appendChild(box);
      for (const th of ["urban-slate", "brown", "navy", "dark", "electric"]) {
        changeTheme(th); Icons.apply(box);
        const b = box.querySelector("button"), svg = b.querySelector("svg");
        out[th] = svg ? getComputedStyle(svg).color === getComputedStyle(b).color : "no-svg";
      }
      changeTheme("urban-slate"); box.remove();
      return out;
    });
    check("Check-in button: the ✅ icon takes the button text colour in every theme (no green on blue)", Object.values(ci).every(v => v === true), JSON.stringify(ci));
    console.log("\n[v1.5.1 fixes on the sample project]");
    const v1 = await sx.evaluate(async () => {
      GShell.go("tab-voc"); await new Promise(r => setTimeout(r, 300));
      const st = document.getElementById("vocStageFilter"); st.value = "통합테스트"; renderVocTable();
      StatusChips.set("voc", "진행");
      const before = vocData.length;
      addNewVoc(); await new Promise(r => setTimeout(r, 200));
      const v = vocData[vocData.length - 1];
      const shown = !!document.querySelector(`#vocTableBody tr[data-rec-id="${CSS.escape(v.id)}"]`) || [...document.querySelectorAll("#vocTableBody tr")].some(tr => tr.textContent.includes(v.id));
      const out = { added: vocData.length - before, stage: v.stage, manual: !!v.stageManual, shown, chip: StatusChips.get("voc") };
      vocData.pop(); st.value = "ALL"; StatusChips.set("voc", "ALL");
      return out;
    });
    check("VOC added while the stage filter is 통합테스트: gets that stage (set by hand) and stays visible", v1.added === 1 && v1.stage === "통합테스트" && v1.manual && v1.shown && v1.chip === "ALL", JSON.stringify(v1));
    const v2 = await sx.evaluate(async () => {
      GShell.go("tab-matrix"); await new Promise(r => setTimeout(r, 400));
      const vis = () => { const c = document.getElementById("phaseDefectBox"); return !!c && !c.hidden; };
      const at0 = vis(), rep0 = projectConfig.reportDate;
      syncGlobalDate("2027-10-08"); GShell.go("tab-matrix"); await new Promise(r => setTimeout(r, 400));
      const atTest = vis(), d = Metrics.defectStats(vocData, projectConfig.reportDate);
      syncGlobalDate(rep0); await new Promise(r => setTimeout(r, 300));
      return { at0, atTest, total: d.total, open: d.open };
    });
    check("Test defect status (Phase progress [4]) shows only with integration-test VOCs received by the report date (hidden 06-04, shown 10-08)", !v2.at0 && v2.atTest && v2.total === 2 && v2.open === 1, JSON.stringify(v2));
    const v3 = await sx.evaluate(async () => {
      GShell.go("tab-mywork"); await new Promise(r => setTimeout(r, 300));
      const me = TodoCenter.me();
      todosData.push({ id: "TD-E2E", owner: me, kind: "todo", title: "연결 수정 시험", due: "", priority: "M", link: null, done: false, doneAt: "", createdAt: "2027-06-04 09:00:00" });
      TodoCenter.edit("TD-E2E"); await new Promise(r => setTimeout(r, 150));
      document.querySelector('[data-todo-edit="linkType"]').value = "VOC";
      document.querySelector('[data-todo-edit="linkId"]').value = "VOC-MES-01";
      TodoCenter.saveEdit("TD-E2E"); await new Promise(r => setTimeout(r, 150));
      const a = JSON.stringify(todosData.find(t => t.id === "TD-E2E").link);
      TodoCenter.edit("TD-E2E"); await new Promise(r => setTimeout(r, 150));
      document.querySelector('[data-todo-edit="linkType"]').value = "";
      TodoCenter.saveEdit("TD-E2E"); await new Promise(r => setTimeout(r, 150));
      const b = todosData.find(t => t.id === "TD-E2E").link;
      todosData.splice(todosData.findIndex(t => t.id === "TD-E2E"), 1);
      return { a, b };
    });
    const v3m = await sx.evaluate(async () => {
      const box = document.getElementById("todoNewTitle");
      box.value = "첫 줄\n둘째 줄"; TodoCenter.add(); await new Promise(r => setTimeout(r, 300));
      const t = todosData.filter(x => x.kind !== "hide").slice(-1)[0];
      const li = [...document.querySelectorAll("#homeTodoContainer .todo-title")].find(x => x.textContent.includes("첫 줄"));
      const out = { tag: box.tagName, title: t && t.title, br: !!(li && li.querySelector("br")) };
      if (t) todosData.splice(todosData.indexOf(t), 1);
      return out;
    });
    check("My Work: a to-do can have several lines (textarea, shown with line breaks)", v3m.tag === "TEXTAREA" && v3m.title === "첫 줄\n둘째 줄" && v3m.br, JSON.stringify(v3m));
    check("My Work: a to-do's link can be changed and removed when editing", v3.a === '{"type":"VOC","id":"VOC-MES-01"}' && v3.b === null, JSON.stringify(v3));
    const v4 = await sx.evaluate(async () => {
      GShell.go("tab-gantt"); await new Promise(r => setTimeout(r, 400));
      document.getElementById("ganttBlSlip").checked = true; renderGantt();
      const slips = [...document.querySelectorAll("#ganttRowsContainer .gantt-bslip")].map(x => x.textContent);
      const legend = document.getElementById("ganttBaselineBar").textContent.replace(/\s+/g, " ");
      document.getElementById("ganttBlSlip").checked = false;
      BaselineUI.clear(); await new Promise(r => setTimeout(r, 150));
      document.getElementById("confirmDialogOkBtn").click(); await new Promise(r => setTimeout(r, 400));
      const cleared = { list: Baseline.list(projectConfig).length, bHist: wbsData.filter(t => t.bHist).length, lines: document.querySelectorAll("#ganttRowsContainer .gantt-bline").length,
        btn: /기준선 확정/.test(document.getElementById("ganttBaselineBar").textContent) };
      return { slips, legend, cleared };
    });
    check("Gantt: baseline legend + buttons, slipped days in red (+7일), [밀린 Task만]; [기준선 지우기] clears the history",
      v4.slips.length >= 2 && v4.slips.every(x => x === "+7일") && /기준선 다시 확정/.test(v4.legend) && /기준선 지우기/.test(v4.legend) && v4.cleared.list === 0 && v4.cleared.bHist === 0 && v4.cleared.lines === 0 && v4.cleared.btn, JSON.stringify(v4));
    const v5 = await sx.evaluate(async () => {
      GShell.go("tab-master"); MasterSubTabs.show("holiday"); await new Promise(r => setTimeout(r, 400));
      const cards = [...document.querySelectorAll("#masterSub-holiday .pane-grid-2 > .card")];
      const h = cards.map(c => Math.round(c.getBoundingClientRect().height)), t = cards.map(c => Math.round(c.getBoundingClientRect().top));
      return { n: cards.length, wide: cards.filter(c => c.classList.contains("pg-wide")).length, row1: h[0] === h[1] && t[0] === t[1], row3: h[3] === h[4] && t[3] === t[4] };
    });
    check("Project extra info: 2-column rows of equal height, baseline and holidays full width", v5.n === 6 && v5.wide === 2 && v5.row1 && v5.row3, JSON.stringify(v5));
    console.log("\n[v1.6 screens: Summary · Dashboard · Phase progress]");
    const s16 = await sx.evaluate(async () => {
      GShell.go("tab-dashboard"); await new Promise(r => setTimeout(r, 500));
      const pane = document.getElementById("tab-dashboard");
      const first = pane.querySelector(":scope > .dash-filter");
      const kpi = pane.querySelector(".grid-4");
      const d = { filterFirst: !!first && !!kpi && !!(first.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING), cards: document.querySelectorAll("#dashSumGrid .dash-sum").length, oldCards: !!document.getElementById("subsystemCardsContainer"),
        side: getComputedStyle(document.querySelector(".dash-charts")).gridTemplateColumns.split(" ").length, height: Math.round(pane.getBoundingClientRect().height),
        tip: (document.querySelector("#dashBulletChart .bl-row title") || {}).textContent || "" };
      GShell.go("tab-matrix"); await new Promise(r => setTimeout(r, 500));
      // (기준선은 앞 시험에서 지웠으므로 여기서는 지연 표시만 — 기준선 +N일은 단위 시험 phaseIssues)
      const cell = [...document.querySelectorAll("#phaseMatrixContainer td.pm-cell")].find(td => /지연 1/.test(td.textContent));
      d.cell = cell ? cell.textContent.replace(/\s+/g, " ").trim() : "";
      d.deliv = document.querySelectorAll("#phaseDelivTable tbody tr").length;
      d.vocStage = !!document.querySelector("#phaseVocStageBox .voc-stage-table");
      if (cell) { cell.click(); await new Promise(r => setTimeout(r, 500)); }
      d.wbs = { tab: document.querySelector(".tab-pane.active").id, sys: document.getElementById("wbsSubsystemFilter").value, phase: document.getElementById("wbsPhaseFilter").value, rows: document.querySelectorAll("#wbsTableBody tr").length };
      GShell.go("tab-home"); await new Promise(r => setTimeout(r, 500));
      d.risks = [...document.querySelectorAll("#execRiskList .exec-risk .status-tag")].map(x => x.textContent);
      d.ms = document.querySelectorAll("#execMsList li").length;
      d.domainOnSummary = !!document.querySelector("#tab-home #execDomainPortfolioBody");
      return d;
    });
    check("Dashboard: scope filter on top, S-curve | bullet side by side, 4 summary cards, no subsystem cards, bullet tooltip with PM · Tasks; shorter screen",
      s16.filterFirst && s16.cards === 4 && !s16.oldCards && s16.side === 2 && /PM .* Task \d+개/.test(s16.tip) && s16.height < 1500, JSON.stringify(s16));
    check("Phase progress: cells show 지연 n (· 기준선 +N일) and open that phase in WBS; [3] deliverables by phase; [4] VOC by stage",
      /지연 1/.test(s16.cell) && s16.deliv >= 3 && s16.vocStage && s16.wbs.tab === "tab-wbs" && s16.wbs.sys !== "ALL" && s16.wbs.phase !== "ALL" && s16.wbs.rows > 0, JSON.stringify({ cell: s16.cell, deliv: s16.deliv, wbs: s16.wbs }));
    check("Summary: key risks (one of each kind first: 지연 · 선행 지연 · 범위 협의) and upcoming milestones; domain table moved to Dashboard",
      s16.risks.length === 5 && ["지연", "선행 지연", "범위 협의"].every(k => s16.risks.includes(k)) && s16.ms >= 3 && !s16.domainOnSummary, JSON.stringify({ risks: s16.risks, ms: s16.ms }));
    check("Sample project tests ran without page errors", sx.errors.length === 0 && sx.external.length === 0, sx.errors.concat(sx.external).slice(0, 3).join(" | "));

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
