// =============================================================================
// [Project Mgmt (협업) 1.0] 브라우저 E2E 자동 테스트 (Playwright)
// -----------------------------------------------------------------------------
//  실행: node tools/tests/e2e/run_e2e.js   (프로그램 폴더에서, 배포 zip 을 만들어 풀고 /pprjmgmt 아래에서 시험)
//  1) 빈 상태로 시작: admin 하나 · 프로젝트 정보 없음 · 채팅 / 첨부 / 샘플 / 영어 없음 · 작업자 선택 화면
//  2) 두 작업자 체크아웃 · 체크인 · 보류 · 3자 비교 · 강제 해제 (시험 자료: tools/tests/fixtures)
//  3) 주기 통신 없음 · 사용 용량 · 오류만 로그 · 하위 주소
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
  page.downloads = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("download", d => page.downloads.push(d));
  return page;
}
async function waitApp(page) {
  await page.waitForFunction(() => {
    try { return window.AppBoot && AppBoot.uiReady && AuthManager.currentUser && AuthManager.currentUser.empNo && document.getElementById("securityLockOverlay").style.display === "none"; }
    catch (e) { return false; }
  }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}
// 작업자 선택 (처음 암호 1234 → 바꾸기)
async function pickWorker(page, emp, store, project) {
  if (project) {
    await page.waitForFunction(p => !!document.querySelector(`#inputLoginProject option[value="${p}"]`), project, { timeout: 8000 }).catch(() => {});
    await page.selectOption("#inputLoginProject", project).catch(() => {});
  }
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
// 배포 zip 을 풀어 서버 실행 (fixture=true 면 시험 자료로 시작)
async function startPackage(fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pm_e2e_"));
  execFileSync(PY, [path.join(ROOT, "tools", "make_release.py"), tmp], { stdio: "ignore" });
  const zip = fs.readdirSync(tmp).find(f => f.endsWith(".zip"));
  execFileSync(PY, ["-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", path.join(tmp, zip), tmp]);
  const dir = path.join(tmp, "pprjmgmt");
  if (fixture) fs.copyFileSync(path.join(ROOT, "tools", "tests", "fixtures", "sample_initial_data.json"), path.join(dir, "data", "initial_data.json"));
  const port = await freePort();
  const proc = spawn(PY, ["start_server.py", "--port", String(port), "--host", "127.0.0.1", "--quiet"], { cwd: dir, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1500));
  return { dir, tmp, proc, url: `http://127.0.0.1:${port}/pprjmgmt/`, stop() { try { proc.kill(); } catch (e) {} setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500); } };
}

async function cleanStart() {
  console.log("\n[Clean start under /pprjmgmt]");
  const srv = await startPackage(false);
  const PWD = {};
  try {
    const a = await newPage();
    await a.goto(srv.url); await a.waitForTimeout(1500);
    const login = await a.evaluate(() => ({ title: document.getElementById("lockModalTitle").textContent, workers: [...document.querySelectorAll("#workerPickList option")].map(o => o.value),
      noLang: !document.getElementById("inputLoginLang"), noRegister: !document.querySelector('[data-click="AuthManager.showRegister"]'), noReset: !document.getElementById("lnkSelfReset"),
      text: document.getElementById("securityLockOverlay").innerText }));
    check("Worker selection screen (not a login): only admin in the worker list, no self-registration / password self-reset / language choice, SSO note shown",
      login.title.includes("작업자 선택") && login.workers.join() === "admin" && login.noLang && login.noRegister && login.noReset && login.text.includes("SSO") && !/로그인 화면|Iostar|IOSTAR/.test(login.text), JSON.stringify(login).slice(0, 400));
    await pickWorker(a, "admin", PWD);
    const st = await a.evaluate(() => ({ head: document.getElementById("headerSystemTitleText").textContent, ver: document.getElementById("headerVersionBadge").textContent, title: document.title,
      proj: projectConfig.projectName, counts: [wbsData, reqMasterData, vocData, deliverablesData, meetingsData, weeklyReportsData, noticesData, communicationsData].map(x => x.length).join(","),
      subs: subsystemsMeta.length, users: (ProjectContext.allUsers || projectUsers).map(u => u.empNo).join(","), base: DbConnector.getApiBase().replace(/^https?:\/\/[^/]+/, ""),
      week: document.getElementById("globalReportWeek").textContent, report: projectConfig.reportDate, today: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) }));
    check("Starts empty: Project Mgmt (협업) v1.0.0, no project data, only admin, API under /pprjmgmt, report date = today with a week number",
      st.head === "Project Mgmt (협업)" && st.ver === "v1.0.0" && st.title.startsWith("Project Mgmt (협업)") && st.counts === "0,0,0,0,0,0,0,0" && st.subs === 0 && st.users === "admin"
      && st.base === "/pprjmgmt" && /^W\d+$/.test(st.week) && st.report === st.today, JSON.stringify(st));
    const removed = await a.evaluate(() => ({ chat: !document.getElementById("subtabBtn_CHAT") && typeof RealtimeChatManager === "undefined", attach: typeof AttachManager === "undefined" && !document.getElementById("attachModal"),
      sample: typeof WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT === "undefined" && !document.querySelector('[data-click*="Sample"]') && typeof StorageManager.resetToSampleData === "undefined",
      manual: typeof ManualViewer === "undefined" && !document.getElementById("btnHeaderManual"), en: typeof I18N_EN === "undefined",
      enterprise: typeof Features === "undefined" && !document.getElementById("btnDbMode_ORACLE") && typeof FileAutoSyncManager === "undefined" && typeof ServerHeartbeat === "undefined",
      dataActions: Object.keys(DataAdmin.ACTIONS).join(",") }));
    check("Removed: chat, attachments, samples + sample restore, manual, English, enterprise-only DB options / file sync / heartbeat",
      removed.chat && removed.attach && removed.sample && removed.manual && removed.en && removed.enterprise && removed.dataActions === "tasks,project,factory", JSON.stringify(removed));
    // 모든 화면 이동
    for (const t of ["tab-home", "tab-dashboard", "tab-matrix", "tab-gantt", "tab-wbs", "tab-req", "tab-voc", "tab-deliverables", "tab-weekly-report", "tab-meeting", "tab-notices", "tab-master", "tab-merge", "tab-config"]) {
      await a.evaluate(t => GShell.go(t), t); await a.waitForTimeout(200);
    }
    check("All screens open on an empty project without page errors", a.errors.length === 0, a.errors.slice(0, 3).join(" | "));
    // 데이터 관리: 용량
    await a.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "data"); }); await a.waitForTimeout(800);
    const usage = await a.evaluate(() => document.getElementById("daUsage").textContent);
    check("Data management shows disk usage against the 10MB limit", /한도 10\.00MB/.test(usage) && /\d+%/.test(usage), usage);
    // 시스템 백업 내려받기 (.db)
    const dl0 = a.downloads.length;
    await a.evaluate(() => { GShell.go("tab-merge"); SubTabs.show("merge", "backup"); }); await a.waitForTimeout(500);
    await a.evaluate(() => SystemBackup.download()); await a.waitForTimeout(1200);
    const d = a.downloads[dl0];
    check("System backup downloads one .db file (nothing kept on the server)", !!d && /\.db$/.test(d.suggestedFilename()) && !fs.existsSync(path.join(srv.dir, "data", "backups")), d ? d.suggestedFilename() : "none");
    // 주기 통신 없음
    let calls = 0; const onReq = r => { if (r.url().includes("/api/")) calls++; };
    a.on("request", onReq); await a.waitForTimeout(25000); a.off("request", onReq);
    check("No periodic server calls while idle (25 s)", calls === 0, String(calls));
    const logs = path.join(srv.dir, "logs");
    check("Server writes no log files during normal use (errors only)", !fs.existsSync(logs) || fs.readdirSync(logs).every(f => f === "error.log"), fs.existsSync(logs) ? fs.readdirSync(logs).join(",") : "none");
  } finally {
    srv.stop();
  }
}

// 두 작업자 체크아웃 · 체크인 · 보류 · 3자 비교 · 강제 해제
async function lockScenarios() {
  console.log("\n[Check-out / check-in with two workers]");
  const srv = await startPackage(true);
  const PWD = {};
  try {
    const adm = await newPage();
    await adm.goto(srv.url); await adm.waitForTimeout(1000);
    await pickWorker(adm, "admin", PWD);
    await adm.evaluate(async () => {
      for (const emp of ["wg_a", "wg_b"]) await ServerBackend.request("/api/admin/users/save", { isNew: true, empNo: emp, name: emp === "wg_a" ? "가작업" : "나작업", sysAdmin: false, projectRoles: { DEFAULT: { role: "MEMBER", subsystem: "W1" } } });
    });
    const A = await newPage(), B = await newPage();
    await A.goto(srv.url); await A.waitForTimeout(1000);
    const wl = await A.evaluate(async () => { document.getElementById("inputLoginProject").value = "DEFAULT"; await WorkerPick.load(); return [...document.querySelectorAll("#workerPickList option")].map(o => o.value); });
    check("Worker list for the chosen project shows its workers", wl.includes("wg_a") && wl.includes("wg_b") && wl.includes("admin"), wl.join(","));
    await pickWorker(A, "wg_a", PWD, "DEFAULT");
    await B.goto(srv.url); await B.waitForTimeout(1000);
    await pickWorker(B, "wg_b", PWD, "DEFAULT");
    const showW1 = p => p.evaluate(() => { GShell.go("tab-wbs"); const f = document.getElementById("wbsSubsystemFilter"); f.value = "W1"; f.dispatchEvent(new Event("change", { bubbles: true })); LockManager.render(); });
    await showW1(A); await showW1(B);
    await A.click('#tab-wbs .lk-bar [data-click="LockManager.checkout"]'); await A.waitForTimeout(1200);
    await B.evaluate(() => LockManager.refresh(true)); await B.waitForTimeout(600);
    const bState = await B.evaluate(() => ({ st: document.querySelector("#tab-wbs .lk-bar").dataset.state, ro: document.getElementById("tab-wbs").classList.contains("lk-readonly"), text: document.querySelector("#tab-wbs .lk-bar").textContent }));
    check("A checks out W1; B sees it being edited by A and the W1 screen is read-only", bState.st === "other" && bState.ro && bState.text.includes("가작업"), JSON.stringify(bState));
    const ids = await A.evaluate(() => wbsData.filter(t => t.system === "W1" && t.isLeaf).slice(0, 2).map(t => t.id));
    await B.evaluate(id => { wbsData.find(t => t.id === id).name += "_B"; SyncManager.save(["wbsData"]); }, ids[0]);
    await B.waitForTimeout(1000);
    const askT = await B.$eval("#syncAskTitle", e => e.textContent).catch(() => "");
    await B.click("#syncAskBtns button:nth-child(1)"); await B.waitForTimeout(600);
    check("B's save is refused while A has W1 checked out; B keeps the change on hold", askT.includes("체크아웃 중") && await B.evaluate(() => LockManager.holdCount()) === 1, askT);
    await A.evaluate(ids => { wbsData.find(t => t.id === ids[0]).name += "_A"; wbsData.find(t => t.id === ids[1]).name += "_A2"; persistChanges(); LockManager.checkin(["W1"]); }, ids);
    await A.waitForTimeout(500);
    await A.fill("#lkMemoInput", "설계 일정 조정"); await A.click("#lkMemoOk"); await A.waitForTimeout(1500);
    await showW1(B);
    await B.evaluate(() => { window.__co = LockManager.checkout("W1"); }); await B.waitForTimeout(1500);
    const cmp = await B.evaluate(() => [...document.querySelectorAll("#lkCmpBody tr")].map(tr => tr.innerText.replace(/\s+/g, " ")));
    await B.click('#lkCompareModal [data-click-args=\'["mine"]\'][data-click="LockManager.pickAll"]'); await B.click("#lkCmpOk"); await B.evaluate(() => window.__co); await B.waitForTimeout(500);
    await B.evaluate(() => SyncManager.save(["wbsData"])); await B.waitForTimeout(1200);
    const fin = await adm.evaluate(async ids => { const r = await ServerBackend.request("/api/db/load", { keys: ["wbsData"] }); return ids.map(id => r.data.wbsData.find(t => t.id === id).name); }, ids);
    check("After A checks in, B checks out → 3-way compare → B's choice saved and A's other change kept", cmp.some(r => r.includes("둘 다 바뀜")) && /_B$/.test(fin[0]) && /_A2$/.test(fin[1]), JSON.stringify({ cmp, fin }));
    await adm.evaluate(() => { LockManager.openBoard(); }); await adm.waitForTimeout(800);
    await adm.evaluate(() => { LockManager.forceRelease("W1"); }); await adm.waitForTimeout(400);
    await adm.fill("#lkMemoInput", "퇴근 후 남은 잠금"); await adm.click("#lkMemoOk"); await adm.waitForTimeout(1200);
    const log = await adm.evaluate(() => [...document.querySelectorAll("#lkLogBody tr")].slice(0, 6).map(tr => tr.innerText.replace(/\s+/g, " ")));
    check("Admin force-releases with a reason; the log shows check-in memo and force release", log.some(l => l.includes("강제 해제") && l.includes("퇴근")) && log.some(l => l.includes("체크인") && l.includes("설계 일정")), JSON.stringify(log));
    check("No page errors", A.errors.length + B.errors.length + adm.errors.length === 0, A.errors.concat(B.errors, adm.errors).join(" | "));
  } finally {
    srv.stop();
  }
}

(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await cleanStart();
    await lockScenarios();
  } catch (e) {
    check("Test runner error", false, e.message);
  } finally {
    await browser.close();
  }
  const fail = results.filter(r => !r.ok);
  console.log(`\nResult: ${results.length - fail.length} / ${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})();
