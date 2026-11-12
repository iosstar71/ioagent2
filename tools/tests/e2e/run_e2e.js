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
    console.log("\n[Static package under /pprjmgmt]");
    check("Package is static files only (index.html at the top, no server program)", web.zip.endsWith("_local.zip") && web.entries.includes("index.html") && web.entries.includes("static")
      && !web.entries.some(f => /server|\.py$|conf|data/.test(f)), web.entries.join(","));
    const pm = await newPage();
    await pm.goto(web.url);
    await pm.evaluate(() => localStorage.setItem("enterprise_app_key", "keep"));
    await pm.reload(); await pm.waitForTimeout(1500);
    const login = await pm.evaluate(() => ({ workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value).join(), start: !!document.getElementById("localStartInput"),
      brand: document.querySelector(".login-brand-name").textContent }));
    check("Worker selection: only admin, [start from 종합본] button, Local shown", login.workers === "admin" && login.start && login.brand.includes("Local"), JSON.stringify(login));
    await pickWorker(pm, "admin", PWD);
    const st = await pm.evaluate(() => ({ ver: document.getElementById("headerVersionBadge").textContent, title: document.title, mode: DbConnector.config.mode, wbs: wbsData.length, subs: subsystemsMeta.length,
      users: (ProjectContext.allUsers || projectUsers).map(u => u.empNo).join(), ls: Object.keys(localStorage).join(), idb: AppStore.length > 0 && !AppStore._fallback,
      gone: [typeof RealtimeChatManager, typeof AttachManager, typeof Features, typeof ServerHeartbeat, typeof WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT].every(t => t === "undefined") && !document.getElementById("subtabBtn_CHAT") && !document.querySelector('[data-subtab="locks"]') }));
    check("Starts empty in Local mode; data in IndexedDB only (the enterprise system's localStorage untouched); chat / attachments / samples / server features gone",
      st.ver === "Local v1.0.0" && st.title.includes("Local") && st.mode === "LOCAL" && st.wbs === 0 && st.subs === 0 && st.users === "admin" && st.ls === "enterprise_app_key" && st.idb && st.gone, JSON.stringify(st));
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
    check("PM downloads a 종합본 (JSON) with a version stamp and the worker list", /종합본/.test(pkg1.name) && !!j1.packageStamp && j1.projectUsers.map(u => u.empNo).join() === "wg_a,wg_b", pkg1.name + " " + j1.packageStamp);

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
    check("PM merges the worker's file through the preview (W1 only); no stale warning for a current file", merged === "W1 설계 (가작업 수정)" && !pv1.note.includes("이전 종합본") && pv1.note.includes("가작업"), JSON.stringify(pv1));
    // PM 이 새 종합본을 낸 뒤, 예전 종합본 기준 파일을 올리면 경고
    await pm.waitForTimeout(1100);
    const pkg2 = await grab(pm, 'SmartMergeCenter.downloadMasterPackage("JSON")');
    await pm.evaluate(async t => { await MergeTable.previewFile(new File([t], "old.json"), { scope: "W1" }); }, mine.text);
    const warn = await pm.evaluate(() => document.getElementById("mpNote").textContent);
    await pm.evaluate(() => MergeTable.close());
    check("A file based on an older 종합본 shows a warning in the preview", warn.includes("이전 종합본"), warn);
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
    // 데이터 관리: 브라우저 저장 용량
    await pm.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "data"); }); await pm.waitForTimeout(700);
    const usage = await pm.evaluate(() => document.getElementById("daUsage").textContent);
    check("Data management shows browser storage usage", usage.includes("IndexedDB"), usage);
    check("No requests outside /pprjmgmt (no server, no external calls) and no page errors",
      pm.external.length + wa.external.length === 0 && pm.errors.length + wa.errors.length === 0, pm.external.concat(wa.external, pm.errors, wa.errors).slice(0, 4).join(" | "));
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
