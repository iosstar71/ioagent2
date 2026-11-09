// =============================================================================
// [AX Project Management by YS v1.0.8] 브라우저 E2E 자동 테스트 (Playwright)
// -----------------------------------------------------------------------------
//  준비: Node.js 18+ 와 Playwright(Chromium) 설치
//        npm install playwright      (폐쇄망은 사전 반입한 node_modules / 브라우저 사용)
//  실행: node tools/tests/e2e/run_e2e.js            (프로그램 폴더에서)
//        node tools/tests/e2e/run_e2e.js --local     (서버 모드 시나리오 제외)
//  - 로컬 저장소 모드: file:// 로 index.html 을 열어 검증
//  - 서버 모드: 프로그램 폴더를 임시 폴더로 복사하여 빈 DB 로 wbs_db_server.py 를 기동 후 검증
// =============================================================================
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
const FILE_URL = "file://" + path.join(ROOT, "index.html").replace(/\\/g, "/");
const results = [];
let browser;

function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "  ✅" : "  ❌"} ${name}${detail ? "  — " + detail : ""}`);
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1500, height: 950 }, acceptDownloads: true }, opts.ctx || {}));
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.errors = [];
  page.downloads = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("download", d => page.downloads.push(d));
  return page;
}

async function dismissAsk(page) {
  const vis = await page.$eval("#syncAskModal", e => e.style.display).catch(() => "none");
  if (vis === "flex") { await page.click("#syncAskBtns button:first-child"); await page.waitForTimeout(300); }
}

async function login(page, emp, pwd = "1234") {
  await page.fill("#inputSecurityEmpNo", emp);
  await page.fill("#inputSecurityPassword", pwd);
  await page.click("#btnLockSubmit");
  await page.waitForTimeout(1300);
}

async function localScenarios() {
  console.log("\n[로컬 저장소 모드 시나리오]");
  // 1) 파일 직접 실행 + 서버 모드 설정 → 로컬 모드 안내 후 전환
  let page = await newPage({ init: () => { if (!sessionStorage.getItem("__t")) { sessionStorage.setItem("__t", "1"); localStorage.setItem("WBS_DB_CONNECTOR_CONFIG_2026_V1_1", JSON.stringify({ mode: "SQLITE" })); } } });
  await page.goto(FILE_URL); await page.waitForTimeout(1000);
  const ask = await page.$eval("#syncAskTitle", e => e.textContent).catch(() => "");
  check("파일 직접 실행 시 로컬 저장소 모드 안내", ask.includes("로컬 저장소"), ask);
  await dismissAsk(page);
  check("파일 직접 실행 → LOCAL 모드 전환", await page.evaluate(() => DbConnector.config.mode) === "LOCAL");
  await page.context().close();

  page = await newPage();
  await page.goto(FILE_URL); await page.waitForTimeout(900);
  check("로그인 화면 표시", await page.$eval("#securityLockOverlay", e => e.style.display) === "flex");
  await login(page, "admin");
  check("관리자 로그인", await page.evaluate(() => AuthManager.getCurrentRole()) === "SYS_ADMIN");

  // 2) 모든 탭 이동
  const tabs = await page.$$eval(".tab-btn", bs => bs.map(b => ((b.getAttribute("onclick") || "").match(/tab-[a-z-]+/) || [])[0]).filter(Boolean));
  let tabOk = true;
  for (const t of tabs) { await page.evaluate(t => switchTab(t), t); await page.waitForTimeout(120); if (await page.evaluate(() => document.querySelector(".tab-pane.active").id) !== t) tabOk = false; }
  check(`전체 탭 이동 (${tabs.length}개)`, tabOk);
  check("Oracle · Excel/Access 비활성화", await page.evaluate(() => document.getElementById("btnDbMode_ORACLE").disabled && document.getElementById("btnDbMode_EXCEL_ACCESS").disabled));

  // 3) WBS 레벨 변경 → 하위 과업 동반 + 재채번
  const lvl = await page.evaluate(() => {
    activateTab("tab-wbs");
    const idx = wbsData.findIndex((t, i) => i > 3 && t.level === 3 && wbsData[i + 1] && wbsData[i + 1].level === 4);
    const ref = wbsData[idx], child = wbsData[idx + 1];
    changeTaskLevel(idx, -1);
    return { parent: ref.level, child: child.level, childId: child.id, parentId: ref.id };
  });
  check("레벨 변경 시 하위 과업 동반 이동", lvl.parent === 2 && lvl.child === 3, JSON.stringify(lvl));
  check("WBS ID 재채번 (중간 번호 누락 없음)", lvl.childId.startsWith(lvl.parentId + ".") && lvl.childId.split(".").length === lvl.parentId.split(".").length + 1);

  // 4) 실적 자동반영 날짜 규칙 + 지연 상태
  const act = await page.evaluate(() => {
    const rep = projectConfig.reportDate;
    const wk = WBSEngine.getWeekRange(rep, projectConfig.weekStartDay);
    const t1 = { pStart: "2027-01-04", pEnd: wk.end, pProg: 100, aProg: 0, aStart: "" };
    const t2 = { pStart: "2027-01-04", pEnd: "2027-02-01", pProg: 100, aProg: 0, aStart: "2027-12-01" };
    applyPlanToActual(t1); applyPlanToActual(t2);
    const st = WBSEngine.getTaskStatus({ pProg: 50, aProg: 49 }, rep).label;
    return { t1: t1.aEnd === wk.end, t2: t2.aEnd === rep, t2s: t2.aStart === t2.aEnd, st };
  });
  check("100% 반영: 계획완료일이 기준일 주차 → 계획완료일", act.t1);
  check("100% 반영: 그 외 → 기준일, 실적시작일 보정", act.t2 && act.t2s);
  check("계획 대비 실적 1%p 부족 → 지연", act.st === "지연");
  const delayed = await page.evaluate(() => {
    const t = wbsData.find(x => x.isLeaf && x.pProg >= 10 && x.pProg < 100);
    if (t) { t.aProg = t.pProg - 5; rebuildAll(); }
    document.getElementById("wbsStatusFilter").value = "지연"; renderWbsTable();
    const rows = document.querySelectorAll("#wbsTableBody tr").length;
    const leaf = wbsData.filter(x => x.isLeaf && x.status === "지연").length;
    document.getElementById("wbsStatusFilter").value = "ALL"; renderWbsTable();
    return { rows, leaf, stored: t ? t.status : "-" };
  });
  check("지연 상태 저장 · 최하위 지연 Task 조회", delayed.stored === "지연" && delayed.rows === delayed.leaf && delayed.rows > 0, JSON.stringify(delayed));

  // 5) 간트 목록·차트 스크롤 정렬
  await page.evaluate(() => activateTab("tab-gantt")); await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const w = document.querySelector(".gantt-wrapper"); w.scrollTop = 900; w.scrollLeft += 200;
    const t = document.querySelectorAll("#ganttTreeList .gantt-row"), c = document.querySelectorAll("#ganttRowsContainer .gantt-row");
    return { a: Math.round(t[30].getBoundingClientRect().top), b: Math.round(c[30].getBoundingClientRect().top), line: !!document.querySelector(".gantt-report-line"), ms: document.querySelectorAll(".gantt-pm-milestone").length };
  });
  check("간트 목록·차트 행 정렬 유지 (스크롤 후)", g.a === g.b && g.a > 0, `${g.a}/${g.b}`);
  check("간트 기준일선 · 마일스톤 표시", g.line && g.ms > 0, `milestones=${g.ms}`);

  // 6) 주간보고: 목록 → 생성 → 항목 제외/추가 → 작성 완료 → 묶음 다운로드
  await page.evaluate(() => activateTab("tab-weekly-report")); await page.waitForTimeout(400);
  const listRows = await page.$$eval("#wrSavedListBody tr", r => r.length);
  check("주차별 보고서 목록 (통합+분야+서브시스템)", listRows > 3, `${listRows}행`);
  await page.evaluate(() => WeeklyReportManager.openUnit(WeeklyReportManager.listWeek, "SYS", "W1")); await page.waitForTimeout(300);
  const wr = await page.evaluate(() => {
    const r = WeeklyReportManager.currentWeekReport;
    const first = r.currentWeekTasks[0];
    if (first) WeeklyReportManager.removeItem("cur", first.id);
    WeeklyReportManager.addManualItem("cur");
    const m = r.currentWeekTasks.find(t => t.manual); m.name = "E2E 직접 입력";
    WeeklyReportManager.syncWbsTasks();
    const r2 = WeeklyReportManager.currentWeekReport;
    return { excludedKept: !first || !r2.currentWeekTasks.some(t => t.wbsId === first.wbsId), manualKept: r2.currentWeekTasks.some(t => t.manual && t.name === "E2E 직접 입력") };
  });
  check("주간보고 항목 제외 유지 (WBS 다시 불러오기 후)", wr.excludedKept);
  check("주간보고 직접 입력 항목 유지", wr.manualKept);
  const saved = await page.evaluate(async () => {
    const ok = await WeeklyReportManager.completeReport(false);
    const stored = (JSON.parse(localStorage.getItem("WBS_ENTERPRISE_SYSTEM_DATA_V164")).weeklyReportsData || []);
    return { ok, stored: stored.some(r => r.scope === "SYS" && r.scopeValue === "W1" && r.currentWeekTasks.some(t => t.manual)) };
  });
  check("주간보고 작성 완료 저장", saved.ok && saved.stored, JSON.stringify(saved));
  const sizeBlocked = await page.evaluate(() => { const r = WeeklyReportManager.currentWeekReport; const big = "가".repeat(33000); r.issuesNotes = big; const ok = WeeklyReportManager._checkSize(0, false); r.issuesNotes = ""; return !ok; });
  check("주간보고 32,000자 초과 차단", sizeBlocked);
  const before = page.downloads.length;
  await page.evaluate(() => { WeeklyReportManager.exportWeekBundle("EXCEL"); WeeklyReportManager.exportWeekBundle("WORD"); });
  await page.waitForTimeout(1500);
  check("주차 통합 묶음 엑셀/워드 다운로드", page.downloads.length - before === 2);

  // 7) 협업 데이터 JSON 왕복
  await page.evaluate(() => activateTab("tab-merge")); await page.waitForTimeout(300);
  const dl0 = page.downloads.length;
  await page.evaluate(() => { document.getElementById("workDataSubsysSelect").value = "ALL"; SmartMergeCenter.downloadCollabData("JSON"); });
  await page.waitForTimeout(1000);
  const d = page.downloads[dl0];
  const tmp = path.join(os.tmpdir(), `axpmys_collab_${Date.now()}.json`);
  await d.saveAs(tmp);
  const j = JSON.parse(fs.readFileSync(tmp, "utf8")); j.noticesData[0].title = "E2E-ROUNDTRIP"; fs.writeFileSync(tmp, JSON.stringify(j));
  await page.setInputFiles("#collabJsonInput", tmp); await page.waitForTimeout(800);
  check("협업 데이터(JSON) 내보내기 → 가져오기", await page.evaluate(() => noticesData[0].title) === "E2E-ROUNDTRIP");
  fs.unlinkSync(tmp);

  // 8) 일반 사용자 권한: 다른 서브시스템 변경은 저장 시 원복
  await page.evaluate(() => AuthManager.manualLock()); await page.waitForTimeout(300);
  await login(page, "lead_lee"); await page.waitForTimeout(800);
  const perm = await page.evaluate(async () => {
    const w2 = wbsData.find(t => t.system === "W2" && t.isLeaf); const orig = w2.name; w2.name += "_X"; persistChanges();
    await new Promise(r => setTimeout(r, 1200));
    return wbsData.find(t => t.id === w2.id).name === orig;
  });
  check("일반 사용자: 타 서브시스템 변경 원복", perm);
  check("로컬 모드 화면 오류 없음", page.errors.length === 0, page.errors.join(" | "));
  await page.context().close();
}

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}

function copyApp(dst) {
  for (const f of ["index.html", "wbs_db_server.py"]) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  for (const dir of ["css", "js"]) fs.cpSync(path.join(ROOT, dir), path.join(dst, dir), { recursive: true });
  fs.mkdirSync(path.join(dst, "data"));
  fs.copyFileSync(path.join(ROOT, "data", "initial_data.json"), path.join(dst, "data", "initial_data.json"));
}

async function serverScenarios() {
  console.log("\n[DB 서버 모드 시나리오]");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axpmys_e2e_"));
  copyApp(tmp);
  const port = await freePort();
  const py = process.platform === "win32" ? "python" : "python3";
  const srv = spawn(py, ["wbs_db_server.py", "--port", String(port), "--host", "127.0.0.1", "--silent"], { cwd: tmp, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}/index.html`;
  try {
    await new Promise(r => setTimeout(r, 1500));
    // 서버 주소 + 처음 접속 → 서버 DB 모드 기본값
    let a = await newPage();
    await a.goto(url); await a.waitForTimeout(1200);
    check("서버 주소 첫 접속 → 서버 DB 모드 기본", await a.evaluate(() => DbConnector.config.mode) === "SQLITE");
    await login(a, "admin");
    // 서버 주소 + 로컬 모드 저장값 → 전환 질문
    const b = await newPage({ init: () => { if (!localStorage.getItem("__seen")) { localStorage.setItem("__seen", "1"); localStorage.setItem("WBS_DB_CONNECTOR_CONFIG_2026_V1_1", JSON.stringify({ mode: "LOCAL" })); } } });
    await b.goto(url); await b.waitForTimeout(1500);
    const q = await b.$eval("#syncAskTitle", e => e.textContent).catch(() => "");
    check("서버 주소 + 로컬 모드 → 서버 DB 모드 전환 질문", q.includes("서버 DB 모드로 전환"), q);
    await dismissAsk(b);
    check("전환 선택 → 서버 DB 모드", await b.evaluate(() => DbConnector.config.mode) === "SQLITE");
    await login(b, "pmo_kim");

    // 동시 저장 충돌
    await a.evaluate(() => { wbsData.find(t => t.system === "W1" && t.isLeaf).name += "_A"; return SyncManager.save(["wbsData"]); });
    await a.waitForTimeout(800);
    await b.evaluate(() => { wbsData.find(t => t.system === "W1" && t.isLeaf).name += "_B"; SyncManager.save(["wbsData"]); });
    await b.waitForTimeout(1000);
    check("다른 사용자 선저장 → 충돌 경고", (await b.$eval("#syncAskTitle", e => e.textContent)).includes("저장 충돌"));
    await b.click("#syncAskBtns button:nth-child(2)"); await b.waitForTimeout(1000);
    check("무시하기 → 최신본 적용", await b.evaluate(() => wbsData.find(t => t.system === "W1" && t.isLeaf).name.endsWith("_A")));

    // 서버 중지 → 연결 끊김 표시
    srv.kill();
    await new Promise(r => setTimeout(r, 800));
    await a.evaluate(() => ServerHeartbeat.check()); await a.waitForTimeout(800);
    check("서버 중지 → 연결 끊김 배너", await a.evaluate(() => { const bar = document.getElementById("serverOfflineBar"); return !!bar && bar.style.display === "block"; }));
    check("서버 모드 화면 오류 없음", a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(" | "));
  } finally {
    try { srv.kill(); } catch (e) {}
    setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500);
  }
}

(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    await localScenarios();
    if (!process.argv.includes("--local")) await serverScenarios();
  } catch (e) {
    check("테스트 실행 오류", false, e.message);
  } finally {
    await browser.close();
  }
  const fail = results.filter(r => !r.ok);
  console.log(`\n결과: ${results.length - fail.length} / ${results.length} 통과`);
  process.exit(fail.length ? 1 : 0);
})();
