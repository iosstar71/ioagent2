// =============================================================================
// [IOSTAR-PM v3.0.0] 브라우저 E2E 자동 테스트 (Playwright)
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
  console.log(`  ${cond ? "[PASS]" : "[FAIL]"} ${name}${!cond && detail ? "  -- " + detail : ""}`);
}

// opts.persistent: 디스크에 저장되는 브라우저 프로필 사용 (실제 사용 환경과 같음)
//   임시(시크릿) 프로필에서는 file:// 페이지를 다시 불러오는 순간 브라우저 저장소가 비워질 수 있어
//   계정 전환·프로젝트 전환(화면 다시 불러오기)을 검사하는 로컬 모드 시나리오는 이 옵션을 사용
async function newPage(opts = {}) {
  const ctxOpts = Object.assign({ viewport: { width: 1500, height: 950 }, acceptDownloads: true }, opts.ctx || {});
  const ctx = opts.persistent
    ? await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "axpmys_profile_")),
        Object.assign(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}, ctxOpts))
    : await browser.newContext(ctxOpts);
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = opts.persistent && ctx.pages().length ? ctx.pages()[0] : await ctx.newPage();
  page.errors = [];
  page.downloads = [];
  page.on("pageerror", e => page.errors.push(e.message));
  page.csp = [];
  page.on("console", m => { if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) page.csp.push(m.text()); });
  page.on("download", d => page.downloads.push(d));
  return page;
}

async function dismissAsk(page) {
  const vis = await page.$eval("#syncAskModal", e => e.style.display).catch(() => "none");
  if (vis === "flex") { await page.click("#syncAskBtns button:first-child"); await page.waitForTimeout(300); }
}

// docx(zip) 안의 파일 1개를 읽음 (외부 라이브러리 없이 zlib 사용)
function readZipEntry(file, name) {
  const zlib = require("zlib");
  const buf = fs.readFileSync(file);
  let off = 0;
  while (off < buf.length - 30 && buf.readUInt32LE(off) === 0x04034b50) {
    const method = buf.readUInt16LE(off + 8), csize = buf.readUInt32LE(off + 18);
    const nlen = buf.readUInt16LE(off + 26), xlen = buf.readUInt16LE(off + 28);
    const fname = buf.slice(off + 30, off + 30 + nlen).toString("utf8");
    const start = off + 30 + nlen + xlen;
    const data = buf.slice(start, start + csize);
    if (fname === name) return (method === 8 ? zlib.inflateRawSync(data) : data).toString("utf8");
    off = start + csize;
  }
  return "";
}

// 화면 준비 완료(로그인 완료·잠금 화면 닫힘)까지 대기 — 계정 전환·프로젝트 전환은 화면을 다시 불러오므로 고정 대기 대신 사용
async function waitApp(page, extra) {
  await page.waitForFunction(extra => {
    try {
      const ok = window.AppBoot && AppBoot.uiReady && AuthManager.currentUser && AuthManager.currentUser.empNo &&
        document.getElementById("securityLockOverlay").style.display === "none";
      return ok && (!extra || ProjectContext.current === extra);
    } catch (e) { return false; }
  }, extra || null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
}

// 시나리오별 현재 비밀번호 (초기 1234 → 첫 로그인 때 변경 필수)
const LOCAL_PWD = {};
const SERVER_PWD = {};
// [v3.0.0] 로그인 화면에서 프로젝트 선택 — 시스템관리자는 선택하지 않아도 됨(null), 그 외 사용자는 기본값 DEFAULT
async function login(page, emp, store = LOCAL_PWD, project) {
  if (project === undefined) project = emp === "admin" ? null : "DEFAULT";
  if (project !== null) {
    await page.waitForFunction(p => !!document.querySelector(`#inputLoginProject option[value="${p}"]`) || p === "", project, { timeout: 8000 }).catch(() => {});
    await page.selectOption("#inputLoginProject", project).catch(() => {});
  }
  await page.fill("#inputSecurityEmpNo", emp);
  await page.fill("#inputSecurityPassword", store[emp] || "1234");
  await page.click("#btnLockSubmit");
  await page.waitForTimeout(1300);
  const forced = await page.$eval("#pwdChangeFormPane", e => getComputedStyle(e).display !== "none").catch(() => false);
  if (forced) {
    const np = "Axpm" + emp.replace(/[^A-Za-z0-9]/g, "") + "2026";
    await page.fill("#pcNewPwd", np);
    await page.fill("#pcNewPwd2", np);
    await page.click('#pwdChangeFormPane [data-click="AuthManager.changePasswordFromLogin"]');
    await page.waitForTimeout(800);
    store[emp] = np;
  }
  await waitApp(page);
  return forced;
}

let STATIC_URL = "";
async function localScenarios() {
  console.log("\n[Local storage mode scenarios]");
  const staticPort = await freePort();
  const py = process.platform === "win32" ? "python" : "python3";
  const staticSrv = spawn(py, ["-m", "http.server", String(staticPort), "--bind", "127.0.0.1", "--directory", ROOT], { stdio: "ignore" });
  STATIC_URL = `http://127.0.0.1:${staticPort}/index.html`;
  await new Promise(r => setTimeout(r, 1200));
  try {
    await localMain();
  } finally {
    try { staticSrv.kill(); } catch (e) {}
  }
}

async function localMain() {
  // 1) 파일 직접 실행 + 서버 모드 설정 → 로컬 모드 안내 후 전환
  let page = await newPage({ init: () => { if (!sessionStorage.getItem("__t")) { sessionStorage.setItem("__t", "1"); localStorage.setItem("WBS_DB_CONNECTOR_CONFIG_2026_V1_1", JSON.stringify({ mode: "SQLITE" })); } } });
  await page.goto(FILE_URL); await page.waitForTimeout(1000);
  const ask = await page.$eval("#syncAskTitle", e => e.textContent).catch(() => "");
  check("file:// launch shows local storage mode notice", ask.includes("로컬 저장소"), ask);
  await dismissAsk(page);
  check("file:// launch -> switched to LOCAL mode", await page.evaluate(() => DbConnector.config.mode) === "LOCAL");
  await page.context().close();

  // 이전에 English 를 쓴 브라우저여도 로그인 화면은 app.ini 기본 언어(한국어)로 시작
  // 메인 시나리오는 정적 웹 서버(http://, DB 서버 없음)로 열어 로컬 저장소 모드로 실행
  //  (테스트 브라우저는 file:// 페이지를 다시 불러올 때 브라우저 저장소를 잃는 경우가 있어
  //   계정 전환·프로젝트 전환처럼 화면을 다시 불러오는 검사는 http:// 에서 수행)
  page = await newPage({ init: () => { try { localStorage.setItem("AX_PMYS_LAST_LANG", "en"); } catch (e) {} } });
  await page.goto(STATIC_URL); await page.waitForTimeout(900);
  check("Login screen starts in Korean with the default theme (app.ini default_lang=ko, default_theme=electric)", await page.evaluate(() => I18N.lang === "ko" && APP_CONFIG.defaultLang === "ko" && document.body.dataset.theme === APP_CONFIG.defaultTheme && document.getElementById("headerVersionBadge").textContent === (APP_CONFIG.editionName ? APP_CONFIG.editionName + " " : "") + "v" + APP_CONFIG.version));
  check("Login screen displayed", await page.$eval("#securityLockOverlay", e => e.style.display) === "flex");
  const forcedAdmin = await login(page, "admin");
  check("Initial password 1234 -> forced password change", forcedAdmin);
  check("Admin login", await page.evaluate(() => AuthManager.getCurrentRole()) === "SYS_ADMIN");

  // 2) 모든 탭 이동
  const tabs = await page.$$eval(".tab-btn", bs => bs.map(b => ((b.getAttribute("data-click-args") || "").match(/tab-[a-z-]+/) || [])[0]).filter(Boolean));
  let tabOk = true;
  for (const t of tabs) { await page.evaluate(t => switchTab(t), t); await page.waitForTimeout(120); if (await page.evaluate(() => document.querySelector(".tab-pane.active").id) !== t) tabOk = false; }
  check(`Navigate all tabs (${tabs.length})`, tabOk);
  check("Oracle / Excel-Access disabled", await page.evaluate(() => document.getElementById("btnDbMode_ORACLE").disabled && document.getElementById("btnDbMode_EXCEL_ACCESS").disabled));

  // 3) WBS 레벨 변경 → 하위 과업 동반 + 재채번
  const lvl = await page.evaluate(() => {
    activateTab("tab-wbs");
    const idx = wbsData.findIndex((t, i) => i > 3 && t.level === 3 && wbsData[i + 1] && wbsData[i + 1].level === 4);
    const ref = wbsData[idx], child = wbsData[idx + 1];
    changeTaskLevel(idx, -1);
    return { parent: ref.level, child: child.level, childId: child.id, parentId: ref.id };
  });
  check("Level change moves child tasks together", lvl.parent === 2 && lvl.child === 3, JSON.stringify(lvl));
  check("WBS ID renumbered (no gaps)", lvl.childId.startsWith(lvl.parentId + ".") && lvl.childId.split(".").length === lvl.parentId.split(".").length + 1);

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
  check("100% apply: plan end in report week -> plan end date", act.t1);
  check("100% apply: otherwise -> report date, actual start corrected", act.t2 && act.t2s);
  check("Actual 1%p below plan -> Delayed", act.st === "지연");
  const delayed = await page.evaluate(() => {
    const t = wbsData.find(x => x.isLeaf && x.pProg >= 10 && x.pProg < 100);
    if (t) { t.aProg = t.pProg - 5; rebuildAll(); }
    document.getElementById("wbsStatusFilter").value = "지연"; renderWbsTable();
    const rows = document.querySelectorAll("#wbsTableBody tr").length;
    const leaf = wbsData.filter(x => x.isLeaf && x.status === "지연").length;
    document.getElementById("wbsStatusFilter").value = "ALL"; renderWbsTable();
    return { rows, leaf, stored: t ? t.status : "-" };
  });
  check("Delayed status saved / leaf delayed task filter", delayed.stored === "지연" && delayed.rows === delayed.leaf && delayed.rows > 0, JSON.stringify(delayed));

  // [v3.0.0] 계획·실적 진척률: 마이너스·100 초과 입력 불가
  await page.evaluate(() => { activateTab("tab-wbs"); renderWbsTable(); }); await page.waitForTimeout(300);
  const pin = page.locator(`#wbsTableBody input:not([readonly])[data-change="UiH.set"][data-change-args*='"aProg"']`).first();
  const pinArgs = await pin.getAttribute("data-change-args");
  const pIdx = JSON.parse(pinArgs)[1];
  const pBefore = await page.evaluate(i => wbsData[i].aProg, pIdx);
  const pRes = [];
  for (const v of ["-5", "150"]) {
    await pin.fill(v); await pin.press("Tab"); await page.waitForTimeout(300);
    pRes.push(await page.evaluate(i => wbsData[i].aProg, pIdx));
  }
  const pToast = await page.evaluate(() => Array.prototype.some.call(document.querySelectorAll("#toastContainer *"), e => /0 ~ 100/.test(e.textContent)));
  const pOk = await page.evaluate(() => UiH.set("wbsData", wbsData.findIndex(t => t.isLeaf), "pProg", -1) === false && UiH.set("wbsData", wbsData.findIndex(t => t.isLeaf), "pProg", 101) === false && UiH.validPct(0) && UiH.validPct(100));
  check("v3: progress below 0 or above 100 is rejected (value kept, warning shown)", pRes.every(v => Number(v) === Number(pBefore)) && pToast && pOk, JSON.stringify({ pBefore, pRes, pToast, pOk }));

  // [v3.0.2] WBS 담당자: 상위에 지정 → 하위 자동 지정(다른 담당자는 유지), 새 하위 Task 는 상위 담당자, 표 폭은 화면 안
  const own = await page.evaluate(() => {
    activateTab("tab-wbs");
    const i = wbsData.findIndex(t => t.id === "1.2"), end = WbsOwner.subtreeEnd(i);
    wbsData[i + 2].owner = "다른 담당";
    WbsOwner.set(i, "김총괄, 이순신");
    const kids = wbsData.slice(i + 1, end);
    addChildTask(i);
    const child = wbsData.find((t, k) => k > i && t.name === wbsData[i].name + " - 하위과업");
    const tbl = document.getElementById("wbsTable");
    const col = [...tbl.querySelectorAll("thead th")].map(th => th.textContent.trim());
    return { p: wbsData[i].owner, auto: kids.filter(t => t.owner === "김총괄").length, kept: kids.filter(t => t.owner === "다른 담당").length, n: kids.length, child: child && child.owner,
      fit: tbl.scrollWidth <= tbl.parentElement.clientWidth + 2, before: col.indexOf("담당자") === col.indexOf("산출물/조치") - 1, list: document.querySelectorAll("#wbsOwnerList option").length };
  });
  check("v3.0.2: WBS owner (one person) set on a parent fills the children (other owners kept), new child inherits; column before deliverables; table fits the screen", own.p === "김총괄" && own.auto === own.n - 1 && own.kept === 1 && own.child === "김총괄" && own.fit && own.before && own.list > 0, JSON.stringify(own));

  // 5) 간트 목록·차트 스크롤 정렬
  await page.evaluate(() => activateTab("tab-gantt")); await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const w = document.querySelector(".gantt-wrapper"); w.scrollTop = 900; w.scrollLeft += 200;
    const t = document.querySelectorAll("#ganttTreeList .gantt-row"), c = document.querySelectorAll("#ganttRowsContainer .gantt-row");
    return { a: Math.round(t[30].getBoundingClientRect().top), b: Math.round(c[30].getBoundingClientRect().top), line: !!document.querySelector(".gantt-report-line"), ms: document.querySelectorAll(".gantt-pm-milestone").length };
  });
  check("Gantt list/chart rows aligned after scroll", g.a === g.b && g.a > 0, `${g.a}/${g.b}`);
  check("Gantt base-date line / milestones shown", g.line && g.ms > 0, `milestones=${g.ms}`);

  // 6) 주간보고: 목록 → 생성 → 항목 제외/추가 → 작성 완료 → 묶음 다운로드
  await page.evaluate(() => activateTab("tab-weekly-report")); await page.waitForTimeout(400);
  const listRows = await page.$$eval("#wrSavedListBody tr", r => r.length);
  const expectRows = await page.evaluate(() => 1 + getAllSubsystemNames().length);
  check("Weekly report list = integrated + subsystems (no domain rows)", listRows === expectRows, `${listRows}/${expectRows}`);
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
  check("Weekly report: excluded item kept after WBS reload", wr.excludedKept);
  check("Weekly report: manual item kept", wr.manualKept);
  const saved = await page.evaluate(async () => {
    const ok = await WeeklyReportManager.completeReport(false);
    const stored = (JSON.parse(localStorage.getItem("WBS_ENTERPRISE_SYSTEM_DATA_V164")).weeklyReportsData || []);
    return { ok, stored: stored.some(r => r.scope === "SYS" && r.scopeValue === "W1" && r.currentWeekTasks.some(t => t.manual)) };
  });
  check("Weekly report: complete & save", saved.ok && saved.stored, JSON.stringify(saved));
  const sizeBlocked = await page.evaluate(() => { const r = WeeklyReportManager.currentWeekReport; const big = "가".repeat(33000); r.issuesNotes = big; const ok = WeeklyReportManager._checkSize(0, false); r.issuesNotes = ""; return !ok; });
  check("Weekly report: >32,000 chars blocked", sizeBlocked);
  const before = page.downloads.length;
  const integ = await page.evaluate(() => {
    const r = WeeklyReportManager.buildWeekIntegrated(WeeklyReportManager.listWeek);
    return { done: r.integratedFrom.done, manual: r.currentWeekTasks.some(t => t.manual && t.name === "E2E 직접 입력"), note: !!r.coverageNote };
  });
  check("Integrated weekly report merges completed subsystem reports", integ.done.includes("W1") && integ.manual && integ.note, JSON.stringify(integ));
  await page.evaluate(() => { WeeklyReportManager.exportWeek("EXCEL"); WeeklyReportManager.exportWeek("WORD"); WeeklyReportManager.exportWeek("WORD_TEXT"); });
  await page.waitForTimeout(1500);
  check("Top Excel / Word (tables) / Word (text) weekly downloads", page.downloads.length - before === 3);
  const docx = page.downloads[before + 1];
  const docxPath = path.join(os.tmpdir(), `axpmys_weekly_${Date.now()}.docx`);
  await docx.saveAs(docxPath);
  const xml = readZipEntry(docxPath, "word/document.xml");
  const tables = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(m => m[0]);
  const badTables = tables.filter(t => {
    const grid = (t.match(/<w:gridCol /g) || []).length;
    return [...t.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].some(r => (r[0].match(/<w:tc>/g) || []).length !== grid);
  }).length;
  check("Word weekly report tables: header/data/grid columns consistent", tables.length > 0 && badTables === 0, `tables=${tables.length}, bad=${badTables}`);
  // [v3.1.0] 파일 이름 규칙 · 엑셀/워드 같은 목차 · 작성 시점 자료(snapshot)
  const names = await page.evaluate(() => {
    const out = [], orig = ExcelSync._triggerDownload;
    ExcelSync._triggerDownload = (blob, name) => out.push(name);
    try { WeeklyReportManager.exportWeek("EXCEL"); WeeklyReportManager.exportWeek("WORD"); WeeklyReportManager.exportWeek("WORD_TEXT"); } finally { ExcelSync._triggerDownload = orig; }
    return out;
  });
  const sections = (xml.match(/[1-6]\. (개요 및 핵심 지표|금주 추진 실적|차주 추진 계획|이슈 · 요구사항 · VOC|회의 · Action Item|작성 현황)/g) || []).length;
  check("v3.1.0: weekly file names follow the rule (code_주간보고_yyyyWnn_scope_format_rev) and Word has the 6 unified sections", names.length === 3 && /^[A-Za-z0-9_-]+_주간보고_\d{4}W\d{2}_ALL_XLSX_(v\d+|AUTO)\.xlsx$/.test(names[0]) && /_DOC-T_/.test(names[1]) && /_DOC-N_/.test(names[2]) && sections >= 6, JSON.stringify({ names, sections }));
  const snap = await page.evaluate(() => {
    const W = WeeklyReportManager;
    const saved = weeklyReportsData.find(r => r.scope === "SYS" && r.scopeValue === "W1");
    const t = wbsData.find(x => x.isLeaf && x.system === "W1" && saved.currentWeekTasks.some(c => c.wbsId === x.id));
    const w1 = mdl => (mdl.sections[0].tables[0].rows.find(r => r[1] === "W1") || [])[6];
    const before = w1(WeeklyExport.model(saved));
    const leaves = wbsData.filter(x => x.isLeaf && x.system === "W1"), orig = leaves.map(x => x.aProg);
    leaves.forEach(x => { x.aProg = 0; }); rebuildAll();
    const live = w1(WeeklyExport.model(Object.assign({}, saved, { snapshot: null })));
    const after = w1(WeeklyExport.model(saved));
    const row = WeeklyExport.model(saved).sections[1].tables[0].rows.find(r => r[1] === t.id);
    leaves.forEach((x, i) => { x.aProg = orig[i]; }); rebuildAll();
    return { has: !!saved.snapshot, rev: saved.revision, before, after, live, rowActual: row && row[5], storedActual: (saved.currentWeekTasks.find(c => c.wbsId === t.id) || {}).aProg, doc: WeeklyExport.docNo(saved), size: W.reportSize(saved) < JSON.stringify(saved).length };
  });
  check("v3.1.0: a completed weekly report keeps the data of when it was written (snapshot), revision and document number", snap.has && snap.rev >= 1 && snap.before === snap.after && snap.live !== snap.after && snap.rowActual === snap.storedActual + "%" && /_S-W1_v\d+$/.test(snap.doc) && snap.size, JSON.stringify(snap));

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
  check("Collaboration data (JSON) export -> import", await page.evaluate(() => noticesData[0].title) === "E2E-ROUNDTRIP");
  fs.unlinkSync(tmp);

  // 7-2) 여러 프로젝트 (로컬): 만들기 → 전환 → 데이터 분리 → 프로젝트별 역할 → 기본 프로젝트 복귀
  const defaultWbs = await page.evaluate(() => wbsData.length);
  // [Standard v1.0.1] 시스템 설정 > 🗂️ 프로젝트 > [➕ 새 프로젝트 등록] 바로가기로 만들기
  await page.click("#gAdminBtn"); await page.waitForTimeout(200);
  await page.click('#gAdminItems [data-click-args*="tab-config"]'); await page.waitForTimeout(400);
  await page.click('.master-subtab-btn[data-subtab="project"]'); await page.waitForTimeout(600);
  const cfgPanel = await page.evaluate(() => ({ rows: document.querySelectorAll("#cfgProjectPanel tbody tr").length, btns: document.querySelectorAll('#cfgProjectPanel [data-click="ProjectManager.openNew"], #cfgProjectPanel [data-click="ProjectManager.open"]').length }));
  await page.click('#cfgProjectPanel [data-click="ProjectManager.openNew"]'); await page.waitForTimeout(500);
  const focusNew = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check("Settings > Project: list + [manage]/[new project] shortcuts (focus on name)", cfgPanel.rows === 1 && cfgPanel.btns === 2 && focusNew === "pmNewName", JSON.stringify({ cfgPanel, focusNew }));
  await page.fill("#pmNewName", "E2E 신규 프로젝트"); await page.fill("#pmNewStart", "2028-01-01"); await page.fill("#pmNewEnd", "2028-12-31");
  await page.click('#projectManagerModal [data-click="ProjectManager.create"]'); await page.waitForTimeout(600);
  await page.click('#projectManagerModal [data-click="ProjectManager.close"]');
  const cfgRows = await page.evaluate(() => document.querySelectorAll("#cfgProjectPanel tbody tr").length);
  check("Settings > Project list refreshes after create", cfgRows === 2, String(cfgRows));
  const pcount = await page.$$eval("#headerProjectSelect option", o => o.length);
  await page.selectOption("#headerProjectSelect", "P001"); await page.waitForTimeout(800); await waitApp(page, "P001");
  const np = await page.evaluate(() => ({ pid: ProjectContext.current, wbs: wbsData.length, subs: subsystemsMeta.length, name: projectConfig.projectName, user: AuthManager.getCurrentUser().empNo}));
  check("Local: create project + switch (data separated, master copied)", pcount === 2 && np.pid === "P001" && np.wbs === 0 && np.subs > 0 && np.name === "E2E 신규 프로젝트" && np.user === "admin", JSON.stringify({ pcount, np }));
  // [v3.0.0] 새 프로젝트: 사용자는 시스템관리자만, 소통 채널은 이 프로젝트의 서브시스템으로
  const fresh = await page.evaluate(() => ({ users: projectUsers.map(u => u.empNo), ch: (projectConfig.channels || []).join(","), subs: ["전체"].concat(subsystemsMeta.map(m => m.code || m.name)).join(",") }));
  check("v3: new project starts with admin only; communication channels are per project (its subsystems)", fresh.users.join(",") === "admin" && fresh.ch === fresh.subs, JSON.stringify(fresh));
  // 다른 프로젝트에서 사용자 복사 (기준정보 > 사용자 > [📥 다른 프로젝트에서 복사])
  await page.evaluate(() => { GShell.go("tab-master"); SubTabs.show("master", "users"); }); await page.waitForTimeout(400);
  await page.click("#btnCopyUsers"); await page.waitForTimeout(700);
  const ucList = await page.$$eval("#ucBody .uc-pick", c => c.map(x => x.value));
  await page.evaluate(() => document.querySelectorAll("#ucBody .uc-pick").forEach(c => { c.checked = c.value === "lead_lee" || c.value === "pmo_kim"; }));
  await page.click('[data-click="UserCopy.copy"]'); await page.waitForTimeout(800);
  const copied = await page.evaluate(() => ({ list: projectUsers.filter(u => ProjectContext.member(u)).map(u => u.empNo + ":" + ProjectContext.member(u).role).sort(), rows: document.querySelectorAll("#projectUsersTableBody tr").length }));
  check("v3: copy users from another project (role/subsystem kept, only chosen users)", ucList.length >= 4 && copied.list.join(",") === "lead_lee:MEMBER,pmo_kim:PM", JSON.stringify({ ucList, copied }));
  await page.evaluate(() => { const i = projectUsers.findIndex(u => u.empNo === "lead_lee"); ProjectManager.setUserAssignment(i, "role", "PM"); });
  await page.waitForTimeout(800);
  await page.evaluate(() => ProjectManager.switchTo("DEFAULT")); await page.waitForTimeout(800); await waitApp(page, "DEFAULT");
  const back = await page.evaluate(() => ({ pid: ProjectContext.current, wbs: wbsData.length, role: ProjectContext.effective(AuthManager.findUser("lead_lee"), "P001").role, baseRole: ProjectContext.effective(AuthManager.findUser("lead_lee"), "DEFAULT").role, ch: (projectConfig.channels || []).length }));
  check("Local: back to default project keeps data; per-project role (P001=PM, DEFAULT=MEMBER)", back.pid === "DEFAULT" && back.wbs === defaultWbs && back.role === "PM" && back.baseRole === "MEMBER", JSON.stringify(back));

  // 7-3) G 화면 틀 (B2)
  const gfit = [];
  for (const w of [1024, 1280, 1366]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(150);
    for (const g of ["ov", "sc", "sq", "co"]) {
      await page.click(`.g-group[data-group="${g}"]`); await page.waitForTimeout(120);
      gfit.push(await page.evaluate(() => { const n = document.querySelector(".g-nav-top"), h = document.querySelector("header"); return n.scrollWidth <= n.clientWidth && h.scrollWidth <= h.clientWidth + 1; }));
    }
  }
  await page.setViewportSize({ width: 1500, height: 950 });
  check("G: one-row header and two-level menu fit at 1024/1280/1366px (no horizontal scroll)", gfit.every(Boolean), JSON.stringify(gfit));
  await page.click('.g-group[data-group="co"]'); await page.waitForTimeout(200);
  const grp = await page.evaluate(() => document.querySelector(".tab-pane.active").id);
  await page.keyboard.press("Control+k"); await page.waitForTimeout(200);
  await page.keyboard.type("VOC-"); await page.waitForTimeout(200); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
  const pal = await page.evaluate(() => document.querySelector(".tab-pane.active").id);
  check("G: group click opens group screen; Ctrl+K search navigates", ["tab-weekly-report", "tab-meeting", "tab-notices"].indexOf(grp) !== -1 && pal === "tab-voc", grp + " / " + pal);
  await page.evaluate(() => LayoutManager.setLayout("sidebar-left", false)); await page.waitForTimeout(300);
  const side = await page.evaluate(() => { const s = document.querySelector(".g-nav-side"); return getComputedStyle(s).display !== "none" && s.querySelectorAll(".g-side-item").length >= 14; });
  await page.evaluate(() => LayoutManager.setLayout("top-nav", false));
  const themes = await page.$$eval("#themeSelector option", o => o.map(x => x.value).join(","));
  check("Themes: Electric (default) · Navy · Matte · Graphite (Teal removed); left menu option", side && themes === "electric,navy,matte,dark", themes);
  // [v3.1.0] 보고서 테마 5가지 · 머리글 [🎨 화면] 메뉴(테마 견본 · 글자 크기) · WBS 담당자·산출물 접기
  const ui310 = await page.evaluate(async () => {
    const out = {};
    out.exportThemes = [...document.querySelectorAll("#cfgExportUnifiedTheme option")].map(o => o.value).join(",");
    out.oldMapped = [ExcelSync.normalizeExportTheme("Pastel Mint"), ExcelSync.normalizeExportTheme("Warm Brown"), ExcelSync.normalizeExportTheme("Official Blue")].join(",");
    const btns = ["btnHeaderManual", "gUiBtn", "gAdminBtn"].map(id => document.getElementById(id).getBoundingClientRect().width);
    out.btnWide = btns.every(w => w >= 60);
    document.getElementById("gUiBtn").click(); await new Promise(r => setTimeout(r, 150));
    out.swatches = document.querySelectorAll("#gUiMenu .g-swatch").length;
    document.querySelector('#gUiMenu .g-swatch[data-theme-pick="matte"]').click(); await new Promise(r => setTimeout(r, 150));
    out.theme = document.body.dataset.theme;
    document.querySelector('#gUiMenu .g-scale[data-scale="1.3"]').click(); await new Promise(r => setTimeout(r, 150));
    out.zoom = document.documentElement.style.zoom;
    UiScale.set(1); changeTheme("navy"); GShell.closeMenus();
    out.zoomBack = document.documentElement.style.zoom;
    GShell.go("tab-wbs"); await new Promise(r => setTimeout(r, 300));
    const t = document.getElementById("wbsTable");
    const f1 = t.classList.contains("wbs-fold"), w1 = t.scrollWidth <= t.parentElement.clientWidth + 2;
    WbsFold.toggle(); await new Promise(r => setTimeout(r, 100));
    const f2 = t.classList.contains("wbs-fold"), ownerShown = getComputedStyle(t.querySelector("th.col-fold")).display !== "none";
    WbsFold.toggle();
    out.fold = { f1, w1, f2, ownerShown, dow: document.querySelectorAll("#wbsTableBody .wbs-dow").length > 0 };
    return out;
  });
  check("v3.1.0: 5 report themes (old names mapped); labelled header buttons; UI menu with theme swatches and text size; WBS owner/deliverable columns fold to fit, weekdays shown",
    ui310.exportThemes === "Official Navy,Office Blue,Office Gray,Office Green,Matte Slate" && ui310.oldMapped === "Office Green,Matte Slate,Official Navy" && ui310.btnWide && ui310.swatches === 4 && ui310.theme === "matte" && ui310.zoom === "1.3" && ui310.zoomBack === "" &&
    ui310.fold.f1 && ui310.fold.w1 && !ui310.fold.f2 && ui310.fold.ownerShown && ui310.fold.dow, JSON.stringify(ui310));
  // [Standard v1.0.1] 1단(묶음)·2단(하위) 메뉴 구분, 간트 머리글 테마, 설정 화면 선택지 정리, 판 이름 표시
  await page.click('.g-group[data-group="sc"]'); await page.waitForTimeout(150);
  await page.click('.g-nav-top .g-sub[data-tab="tab-gantt"]'); await page.waitForTimeout(500);
  const look = await page.evaluate(() => {
    const cs = s => getComputedStyle(document.querySelector(s));
    const head = cs(".gantt-header").backgroundColor, tree = cs(".gantt-tree-head").backgroundColor;
    const probe = document.createElement("div"); probe.style.background = "var(--header-bg)"; document.body.appendChild(probe);
    const hb = getComputedStyle(probe).backgroundColor; probe.remove();
    return { gAct: cs(".g-group.active").backgroundColor, sAct: cs(".g-sub.active").backgroundColor, sBorder: cs(".g-sub.active").borderBottomWidth, crumb: !!document.querySelector(".g-crumb"), head, tree, hb };
  });
  check("Standard: group menu (filled box) vs sub menu (underline tab) are visually distinct", look.crumb && look.gAct !== look.sAct && parseInt(look.sBorder, 10) >= 2, JSON.stringify(look));
  check("Standard: gantt header row uses the theme header color", look.head === look.hb && look.tree === look.hb, JSON.stringify(look));
  const cfgOpts = await page.evaluate(() => { changeTheme("ocean"); const t = document.body.dataset.theme; LayoutManager.setLayout("focused-card", false); const l = document.body.dataset.layout;
    return { themes: [...document.querySelectorAll("#cfgThemeSelect option")].map(o => o.value).join(","), layouts: [...document.querySelectorAll("#cfgLayoutTypeSelect option")].map(o => o.value).join(","), cards: document.querySelectorAll(".layout-option-card").length, t, l, badge: document.getElementById("headerVersionBadge").textContent, ed: (APP_CONFIG.editionName ? APP_CONFIG.editionName + " " : "") + "v" + APP_CONFIG.version }; });
  await page.evaluate(() => { changeTheme("navy"); LayoutManager.setLayout("top-nav", false); });
  check("Standard: settings offer 3 themes / 2 menu positions; old values mapped; badge shows edition name", cfgOpts.themes === "electric,navy,matte,dark" && cfgOpts.layouts === "top-nav,sidebar-left" && cfgOpts.cards === 2 && cfgOpts.t === "navy" && cfgOpts.l === "top-nav" && cfgOpts.badge === cfgOpts.ed, JSON.stringify(cfgOpts));

  // [Neo 2.1] 확인할 일 · WBS 상세 패널 · 메뉴 건수 배지 · 상태 칩 필터 · 왼쪽 메뉴 접기 · 어두운 화면
  // [v3.0.0] 화면은 Neo 하나 — 화면 방식 선택 없음
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => [...document.fonts].some(f => f.family.replace(/"/g, "") === "Pretendard" && f.status === "loaded"));
  const neoMode = await page.evaluate(() => ({ mode: UiMode.current, sw: UiMode.canSwitch(), cls: document.body.classList.contains("ui-neo"), sel: !!document.getElementById("gUiModeSelect") || !!document.getElementById("cfgUiModeSelect"), ph: document.querySelectorAll(".neo-ph").length, todo: document.querySelectorAll("#neoTodoCard .neo-todo-chip").length }));
  check("v3: Neo is the only UI (no UI-mode switch), Neo screens + dashboard to-do summary, Pretendard font loaded", neoMode.mode === "neo" && !neoMode.sw && neoMode.cls && !neoMode.sel && neoMode.ph >= 10 && neoMode.todo === 6 && fontOk, JSON.stringify({ neoMode, fontOk }));
  if (await page.evaluate(() => typeof NeoTodo !== "undefined")) {
    await page.evaluate(() => { changeTheme("navy"); LayoutManager.setLayout("top-nav", false); GShell.go("tab-dashboard"); }); await page.waitForTimeout(500);
    const before = await page.evaluate(() => ({ chips: document.querySelectorAll("#neoTodoCard .neo-todo-chip").length, delayed: NeoTodo.collect(null).delayed.length }));
    // 진행 중 최하위 과업 하나를 지연으로 만들기 (실적 = 계획 - 20)
    const target = await page.evaluate(() => { const t = wbsData.find(x => x.isLeaf && x.pProg >= 30 && x.aProg < 100 && NeoUtil.status(x).code !== "delayed"); const o = t.aProg; t.aProg = t.pProg - 20; rebuildAll(); return { id: t.id, orig: o }; });
    await page.waitForTimeout(700);
    await page.evaluate(() => GShell.go("tab-dashboard")); await page.waitForTimeout(500);
    const dashLine = await page.evaluate(() => (document.querySelector("#neoTodoCard .neo-todo-chip") || {}).textContent || "");
    // 대시보드 → [홈의 내 할 일에서 보기] → 내 할 일 홈의 확인할 일(자동) 지연 과업
    await page.click('#neoTodoCard [data-click="TodoCenter.openHome"]'); await page.waitForTimeout(600);
    const after = await page.evaluate(id => ({ delayed: NeoTodo.collect(null).delayed.length, style: HomeScreenManager.getCurrentMode(), tab: document.querySelector(".tab-pane.active").id,
      listed: !!Array.prototype.find.call(document.querySelectorAll("#homeTodoContainer .todo-auto-group:first-of-type .todo-auto-main, #homeTodoContainer .todo-auto-main"), b => b.textContent.indexOf(id) !== -1),
      badge: (document.querySelector('.g-nav-top [data-tab="tab-wbs"] .neo-badge') || document.querySelector('.g-group[data-group="sc"] .g-group-count:not([hidden])') || {}).textContent || "" }), target.id);
    check("Neo: dashboard summary line links to the My To-do home, which lists the new delayed task; menu badge", before.chips === 6 && dashLine.indexOf(String(after.delayed)) !== -1 && after.tab === "tab-home" && after.style === "TODO" && after.delayed === before.delayed + 1 && after.listed && Number(after.badge) >= 1, JSON.stringify({ before, dashLine, after }));
    const item = await page.$(`#homeTodoContainer .todo-auto-main[data-click-args*='"${target.id}"']`);
    await item.click(); await page.waitForTimeout(900);
    const det = await page.evaluate(() => ({ tab: document.querySelector(".tab-pane.active").id, open: NeoDetail.isOpen(), id: NeoDetail._id, sel: !!document.querySelector("#wbsTableBody tr.neo-sel") }));
    check("Neo: auto to-do item opens WBS with the right-side detail panel (row highlighted)", det.tab === "tab-wbs" && det.open && det.sel && !!det.id, JSON.stringify(det));
    await page.fill('#neoDetail input[data-change-args*="aProg"]', String(target.orig)); await page.keyboard.press("Tab"); await page.waitForTimeout(900);
    const edited = await page.evaluate(id => { const t = wbsData.find(x => x.id === id); const tr = document.querySelector(`#wbsTableBody tr[data-wbs-id="${id}"]`); return { a: t.aProg, still: NeoDetail.isOpen(), cell: tr ? Array.prototype.some.call(tr.querySelectorAll("input"), i => i.value === String(t.aProg)) : null }; }, det.id);
    check("Neo: editing in the detail panel updates WBS data and table", Number(edited.a) === Number(target.orig) && edited.still && edited.cell !== false, JSON.stringify(edited));
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    await page.click('#neoStatusChips .neo-chip[data-click-args*="완료"]'); await page.waitForTimeout(500);
    const chips = await page.evaluate(() => { const rows = [...document.querySelectorAll("#wbsTableBody tr[data-wbs-id]")]; const act = document.querySelector("#neoStatusChips .neo-chip.active");
      return { n: rows.length, allDone: rows.every(r => wbsData.find(t => t.id === r.getAttribute("data-wbs-id")).status === "완료"), active: act && act.getAttribute("data-click-args"), cnt: act && Number(act.querySelector("b").textContent), closed: !NeoDetail.isOpen() }; });
    check("Neo: status chip filter shows only that status (count matches); Esc closes panel", chips.n > 0 && chips.allDone && chips.n === chips.cnt && /완료/.test(chips.active) && chips.closed, JSON.stringify(chips));
    await page.click('#neoStatusChips .neo-chip[data-click-args*="ALL"]'); await page.waitForTimeout(300);
    await page.evaluate(() => GShell.go("tab-dashboard")); await page.waitForTimeout(400);
    await page.click('.neo-click-chips .chip-progress'); await page.waitForTimeout(600);
    const dchip = await page.evaluate(() => [document.querySelector(".tab-pane.active").id, document.getElementById("wbsStatusFilter").value]);
    await page.evaluate(() => NeoDetail.open(wbsData.findIndex(t => t.isLeaf))); await page.evaluate(() => GShell.go("tab-voc")); await page.waitForTimeout(300);
    const leave = await page.evaluate(() => NeoDetail.isOpen());
    await page.evaluate(() => GShell.go("tab-wbs")); await page.waitForTimeout(300);
    check("Neo: detail panel closes when leaving the WBS screen", leave === false, String(leave));
    check("Neo: dashboard status chip opens WBS filtered by that status", dchip[0] === "tab-wbs" && dchip[1] === "진행중", JSON.stringify(dchip));
    await page.evaluate(() => NeoChips.set("ALL"));
    await page.evaluate(() => LayoutManager.setLayout("sidebar-left", false)); await page.waitForTimeout(300);
    await page.click("#neoSideToggle"); await page.waitForTimeout(300);
    const side = await page.evaluate(() => ({ w: Math.round(document.getElementById("gNav").getBoundingClientRect().width), title: document.querySelector(".g-side-item").title }));
    await page.click("#neoSideToggle"); await page.waitForTimeout(200);
    const side2 = await page.evaluate(() => Math.round(document.getElementById("gNav").getBoundingClientRect().width));
    await page.evaluate(() => LayoutManager.setLayout("top-nav", false));
    check("Neo: left menu collapses to icons (with tooltips) and expands again", side.w <= 64 && !!side.title && side2 >= 190, JSON.stringify({ side, side2 }));
    // 어두운 화면: 화면 안에 밝은 바탕 상자가 남아 있지 않은지 (모든 화면)
    await page.evaluate(() => changeTheme("dark"));
    const bright = [];
    for (const t of ["tab-home", "tab-dashboard", "tab-matrix", "tab-wbs", "tab-gantt", "tab-req", "tab-voc", "tab-deliverables", "tab-weekly-report", "tab-meeting", "tab-notices", "tab-master", "tab-merge", "tab-config"]) {
      await page.evaluate(t => GShell.go(t), t); await page.waitForTimeout(250);
      bright.push(...await page.evaluate(t => { const out = []; document.querySelectorAll(".tab-pane.active *").forEach(e => { if (!e.offsetParent) return; const r = e.getBoundingClientRect(); if (r.width * r.height < 600) return;
        const m = getComputedStyle(e).backgroundColor.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/); if (!m || (m[4] !== undefined && +m[4] < 0.5)) return;
        if ((0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 > 0.72) out.push(t + ":" + e.tagName + "." + String(e.className).split(" ")[0]); }); return out; }, t));
    }
    await page.evaluate(() => { changeTheme("navy"); GShell.go("tab-home"); });
    check("Neo: Graphite (dark) has no bright boxes left on any screen", bright.length === 0, bright.slice(0, 8).join(", "));
  }

  // [Neo 2.2] WBS 템플릿 (등록된 서브시스템만 · 추가/교체) · 화면 머리줄 · 내려받기 메뉴 · 주간보고 2단 화면
  if (await page.evaluate(() => typeof NeoPage !== "undefined")) {
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.evaluate(() => GShell.go("tab-wbs")); await page.waitForTimeout(400);
    await page.click('#tab-wbs [data-click="WbsTemplate.open"]'); await page.waitForTimeout(400);
    const tplOpts = await page.evaluate(() => ({ opts: [...document.querySelectorAll("#tplSystemSelect option")].map(o => o.value), metas: subsystemsMeta.map(m => m.name || m.code), freeInput: !!document.getElementById("newSubSystemName") }));
    check("Template: only registered subsystems can be chosen (no free text)", JSON.stringify(tplOpts.opts) === JSON.stringify(tplOpts.metas) && !tplOpts.freeInput, JSON.stringify(tplOpts));
    await page.selectOption("#tplSystemSelect", "W1"); await page.waitForTimeout(250);
    const w1 = await page.evaluate(() => ({ n: wbsData.filter(t => t.system === "W1").length, l1: wbsData.filter(t => t.system === "W1" && t.level === 1).length, shown: !document.getElementById("tplExisting").hidden, rows: document.querySelectorAll("#tplPreviewBody tr").length }));
    await page.click("#tplApplyBtn"); await page.waitForTimeout(800);
    const w1b = await page.evaluate(() => ({ n: wbsData.filter(t => t.system === "W1").length, l1: wbsData.filter(t => t.system === "W1" && t.level === 1).length,
      ok: wbsData.filter(t => t.system === "W1").slice(-4).every(t => t.level === 2 && t.pStart >= projectConfig.projectStartDate && t.pEnd <= projectConfig.projectEndDate && !WBSEngine.isHoliday(t.pStart, projectConfig.holidays) && !WBSEngine.isHoliday(t.pEnd, projectConfig.holidays) && /^\d+\.\d+$/.test(t.id)) }));
    check("Template append: existing WBS kept, phase tasks added under the same L1 (business-day dates, renumbered)", w1.shown && w1.rows >= 2 && w1b.l1 === 1 && w1b.n === w1.n + w1.rows && w1b.ok, JSON.stringify({ w1, w1b }));
    await page.click('#tab-wbs [data-click="WbsTemplate.open"]'); await page.waitForTimeout(300);
    await page.selectOption("#tplSystemSelect", "PMO"); await page.waitForTimeout(200);
    await page.check('input[name="tplMode"][value="replace"]'); await page.waitForTimeout(200);
    const pre = await page.evaluate(() => document.querySelectorAll("#tplPreviewBody tr").length);
    await page.click("#tplApplyBtn"); await page.waitForTimeout(300);
    await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(800);
    const pmo = await page.evaluate(() => { const r = wbsData.filter(t => t.system === "PMO"); return { n: r.length, l1: r.filter(t => t.level === 1).length, names: r.map(t => t.name).slice(1), others: wbsData.filter(t => t.system === "W2").length }; });
    check("Template replace (after confirm): old PMO tasks removed, rebuilt from template; other subsystems untouched", pmo.n === pre && pmo.l1 === 1 && pmo.others > 0 && pmo.names.indexOf("착수단계") !== -1, JSON.stringify(pmo));

    const heads = await page.evaluate(() => [...document.querySelectorAll(".tab-pane")].map(p => { const h = p.querySelector(":scope > .sub-header-bar.neo-ph"); return [p.id, !!h && !!h.querySelector(".neo-ph-main .sub-title") && !!h.querySelector(".neo-ph-desc"), p.querySelectorAll(".sync-toolbar-state").length <= 1 && (!p.querySelector(".sync-toolbar-state") || !!h.querySelector(".sync-toolbar-state"))]; }).filter(x => !(x[1] && x[2])));
    check("Neo: every screen has the unified header (title + description + save status on the right)", heads.length === 0, JSON.stringify(heads));

    await page.evaluate(() => GShell.go("tab-weekly-report")); await page.waitForTimeout(600);
    await page.click('#tab-weekly-report .neo-dd[data-dd="down"] .neo-dd-btn'); await page.waitForTimeout(200);
    const dd = await page.evaluate(() => { const m = document.querySelector('#tab-weekly-report .neo-dd[data-dd="down"] .neo-dd-menu'); return { open: !m.hidden, items: m.querySelectorAll(".neo-dd-item").length, loose: document.querySelectorAll('#tab-weekly-report .neo-ph-actions > button[data-btn$="-down"]').length }; });
    const dl0 = page.downloads.length;
    await page.click('#tab-weekly-report .neo-dd-menu .neo-dd-item[data-click-args*="EXCEL"]'); await page.waitForTimeout(1500);
    const ddClosed = await page.evaluate(() => document.querySelector('#tab-weekly-report .neo-dd-menu').hidden);
    check("Neo: header download buttons grouped in the [⬇ Download] menu; item downloads and closes the menu", dd.open && dd.items === 3 && dd.loose === 0 && page.downloads.length > dl0 && ddClosed, JSON.stringify({ dd, ddClosed, dl: page.downloads.length - dl0 }));

    const split = await page.evaluate(() => { const l = document.getElementById("wrListCard").getBoundingClientRect(), d = document.getElementById("wrDetailPanel").getBoundingClientRect(); return { side: l.right <= d.left + 1 && Math.abs(l.top - d.top) < 40, sw: document.documentElement.scrollWidth <= window.innerWidth }; });
    await page.click('#wrSavedListBody tr.wr-list-row:nth-child(3)'); await page.waitForTimeout(900);
    const pick = await page.evaluate(() => ({ banner: document.getElementById("wrScopeBanner").textContent, active: (document.querySelector("#wrSavedListBody tr.wr-list-row.active td:nth-child(2)") || {}).textContent || "" }));
    check("Neo: weekly report is two panes (list left, report right); picking a unit opens it on the right", split.side && split.sw && /W1/.test(pick.banner) && /W1/.test(pick.active), JSON.stringify({ split, pick }));
    await page.evaluate(() => GShell.go("tab-home"));
  }
  // [v2.4.0] 홈 스타일 3가지 · 내 할 일 (사용자별, 본인만)
  await page.evaluate(() => GShell.go("tab-home")); await page.waitForTimeout(400);
  const styles = [];
  for (const st of ["EXECUTIVE", "PORTAL", "TODO"]) {
    await page.click(`.home-style-btn[data-home-style="${st}"]`); await page.waitForTimeout(300);
    styles.push(await page.evaluate(st => { const ids = { EXECUTIVE: "homeExecutiveContainer", PORTAL: "homePortalContainer", TODO: "homeTodoContainer" };
      return Object.keys(ids).every(k => (document.getElementById(ids[k]).style.display !== "none") === (k === st)) && document.querySelector(".home-style-btn.active").dataset.homeStyle === st; }, st));
  }
  const roleOpts = await page.evaluate(() => [...document.querySelectorAll("#cfgRoleHomeMember option")].map(o => o.value).join(","));
  check("Home: three styles (Briefing / Workbench / My To-do) switch from the home header; role settings offer the same three", styles.every(Boolean) && roleOpts === "EXECUTIVE,PORTAL,TODO", JSON.stringify({ styles, roleOpts }));
  await page.fill("#todoNewTitle", "E2E-TODO 산출물 검토"); await page.fill("#todoNewDue", await page.evaluate(() => projectConfig.reportDate)); await page.selectOption("#todoNewPri", "H");
  await page.selectOption("#todoNewLinkType", "VOC"); await page.fill("#todoNewLinkId", "VOC-06"); await page.click('#homeTodoContainer [data-click="TodoCenter.add"]'); await page.waitForTimeout(500);
  await page.fill("#todoNewTitle", "E2E-TODO 두번째"); await page.press("#todoNewTitle", "Enter"); await page.waitForTimeout(500);
  await page.click('#homeTodoContainer .todo-auto-list [data-click="TodoCenter.fromAuto"]'); await page.waitForTimeout(500);
  const td1 = await page.evaluate(() => ({ n: TodoCenter.todos().length, first: TodoCenter.todos()[0], today: TodoCenter.stats().today, homeCount: document.getElementById("homeTodoCount").textContent, auto: TodoCenter.todos().filter(t => t.autoKey).length }));
  check("To-do: add own items (title, due, priority, link) and copy an automatic item; today's count shown on the home button", td1.n === 3 && td1.first.owner === "admin" && td1.first.priority === "H" && td1.first.link && td1.first.link.id === "VOC-06" && td1.auto === 1 && td1.today >= 1 && Number(td1.homeCount) >= 1, JSON.stringify(td1));
  const firstId = await page.evaluate(() => TodoCenter.todos().find(t => t.title === "E2E-TODO 두번째").id);
  await page.click(`#homeTodoContainer [data-change="TodoCenter.toggle"][data-change-args*="${firstId}"]`); await page.waitForTimeout(400);
  await page.click(`#homeTodoContainer [data-click="TodoCenter.edit"]`); await page.waitForTimeout(300);
  await page.fill('[data-todo-edit="title"]', "E2E-TODO 수정됨"); await page.click('[data-click="TodoCenter.saveEdit"]'); await page.waitForTimeout(400);
  const hideKey = await page.evaluate(() => TodoCenter.autoGroups().groups.find(g => g.items.length).items[0].k);
  await page.click(`#homeTodoContainer [data-click="TodoCenter.hide"][data-click-args*='${JSON.stringify(hideKey).slice(1, -1)}']`); await page.waitForTimeout(400);
  const td2 = await page.evaluate(k => ({ done: TodoCenter.todos().find(t => t.title === "E2E-TODO 두번째").done, edited: TodoCenter.todos().some(t => t.title === "E2E-TODO 수정됨"), hidden: TodoCenter.isHidden(k) }), hideKey);
  await page.reload(); await waitApp(page);
  const td3 = await page.evaluate(k => ({ n: TodoCenter.todos().length, hidden: TodoCenter.isHidden(k), style: HomeScreenManager.getCurrentMode() }), hideKey);
  check("To-do: complete, edit, hide an automatic item for 7 days; all kept after reload; chosen home style remembered", td2.done && td2.edited && td2.hidden && td3.n === 3 && td3.hidden && td3.style === "TODO", JSON.stringify({ td2, td3 }));
  await page.evaluate(() => HomeScreenManager.setStyle(HomeScreenManager.roleDefault()));

  // 8) 일반 사용자 권한: 다른 서브시스템 변경은 저장 시 원복
  await page.evaluate(() => AuthManager.manualLock()); await page.waitForTimeout(300);
  await login(page, "lead_lee"); await page.waitForTimeout(800);
  const memberTodo = await page.evaluate(() => ({ mine: TodoCenter.todos().length, all: todosData.length, style: HomeScreenManager.getCurrentMode() }));
  check("To-do: another user does not see admin's to-dos; member's default home is My To-do", memberTodo.mine === 0 && memberTodo.style === "TODO", JSON.stringify(memberTodo));
  const memberAdmin = await page.evaluate(() => [GShell.allowed("tab-master"), GShell.allowed("tab-config"), document.querySelectorAll('#gAdminItems [data-click-args*="tab-master"], #gAdminItems [data-click-args*="tab-config"]').length]);
  check("G: member does not see Master data / Settings in the ⚙ menu", !memberAdmin[0] && !memberAdmin[1] && memberAdmin[2] === 0, JSON.stringify(memberAdmin));
  const weak = await page.evaluate(() => [AuthManager.validateNewPassword("abcd1234") === "", AuthManager.validateNewPassword("abc12") !== "", AuthManager.validateNewPassword("abcdefgh") !== ""]);
  check("Password rule: 8+ chars with letters and digits", weak.every(Boolean), JSON.stringify(weak));
  const perm = await page.evaluate(async () => {
    const w2 = wbsData.find(t => t.system === "W2" && t.isLeaf); const orig = w2.name; w2.name += "_X"; persistChanges();
    for (let i = 0; i < 25; i++) {  // 자동저장(0.4초 후) 처리 완료까지 최대 5초 대기
      await new Promise(r => setTimeout(r, 200));
      if (wbsData.find(t => t.id === w2.id).name === orig) return true;
    }
    const u = AuthManager.getCurrentUser();
    return JSON.stringify({ user: u.empNo, role: u.role, sub: u.subsystem, pid: ProjectContext.current, busy: SyncManager._busy, susp: SyncManager._suspendAuto, timer: !!SyncManager._autoTimer, sw: ProjectManager._switching, auto: SyncManager.isAutoSave(), name: wbsData.find(t => t.id === w2.id).name });
  });
  check("Member: other subsystem changes reverted", perm === true, String(perm));
  // [v3.0.2] 요구사항 · VOC · 산출물 · Action Item 상태 칩 필터
  const chips = await page.evaluate(() => {
    const out = {};
    GShell.go("tab-req"); StatusChips.set("req", "완료");
    out.req = [document.querySelectorAll("#reqMasterTableBody tr").length, reqMasterData.filter(r => r.status === "완료").length, !!document.querySelector("#reqStatusChips .neo-chip.active")];
    StatusChips.set("req", "ALL");
    GShell.go("tab-voc"); StatusChips.set("voc", "진행");
    out.voc = [document.querySelectorAll("#vocTableBody tr").length, vocData.filter(r => r.status === "진행").length];
    StatusChips.set("voc", "ALL");
    GShell.go("tab-deliverables"); StatusChips.set("deliv", "보완완료");
    out.deliv = [document.querySelectorAll("#deliverablesTableBody tr").length, Number(document.querySelector("#delivStatusChips .neo-chip.active b").textContent)];
    StatusChips.set("deliv", "ALL");
    GShell.go("tab-meeting"); MeetingManager.renderActionItemsTracker(); StatusChips.set("ai", "완료");
    out.ai = [document.getElementById("aiFilterStatus").value, Number(document.querySelector("#aiStatusChips .neo-chip.active b").textContent)];
    StatusChips.set("ai", "ALL");
    return out;
  });
  check("v3.0.2: status chip filters on requirements, VOC, deliverables and Action Items", chips.req[0] === chips.req[1] && chips.req[2] && chips.voc[0] === chips.voc[1] && chips.deliv[0] === chips.deliv[1] && chips.deliv[0] > 0 && chips.ai[0] === "완료", JSON.stringify(chips));
  // [v3.0.2] 단계별 진척 SDLC 머리글은 테마 색 · 공지 게시판에 옛 버전 표시 없음 · 머리글 요일 보임 · 홈 스타일 단추 위치 고정
  const look302 = await page.evaluate(async () => {
    const bg = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).backgroundColor : ""; };
    changeTheme("matte"); GShell.go("tab-matrix"); await new Promise(r => setTimeout(r, 300));
    const matte = bg("#phaseMatrixContainer th.sdlc-ph");
    changeTheme("electric"); await new Promise(r => setTimeout(r, 100));
    const elec = bg("#phaseMatrixContainer th.sdlc-ph");
    const dow = getComputedStyle(document.getElementById("globalReportDayOfWeek")).color;
    GShell.go("tab-notices");
    const oldVer = /ver1\.0\.4/.test(document.getElementById("tab-notices").textContent);
    GShell.go("tab-home");
    const pos = [];
    for (const st of ["EXECUTIVE", "PORTAL", "TODO", "EXECUTIVE"]) { HomeScreenManager.setStyle(st); await new Promise(r => setTimeout(r, 120)); pos.push([...document.querySelectorAll(".home-style-btn")].map(b => Math.round(b.getBoundingClientRect().left)).join(",")); }
    changeTheme("navy");
    return { matte, elec, dow, oldVer, pos };
  });
  check("v3.0.2: SDLC phase headers follow the theme; no old version badge on notices; header weekday readable; home style buttons stay in place", look302.matte !== look302.elec && look302.matte !== "rgb(30, 58, 138)" && look302.dow === "rgb(241, 245, 249)" && !look302.oldVer && new Set(look302.pos).size === 1, JSON.stringify(look302));

  // [v3.0.0] 로그인 시 프로젝트 선택 필수(관리자 제외) · PM 이하는 자기 프로젝트만
  await page.evaluate(() => AuthManager.manualLock()); await page.waitForTimeout(400);
  const loginOpts = await page.$$eval("#inputLoginProject option", o => o.map(x => x.value));
  await page.selectOption("#inputLoginProject", "");
  await page.fill("#inputSecurityEmpNo", "lead_lee"); await page.fill("#inputSecurityPassword", LOCAL_PWD["lead_lee"] || "1234");
  await page.click("#btnLockSubmit"); await page.waitForTimeout(700);
  const needProj = await page.evaluate(() => ({ msg: document.getElementById("lockErrorMessage").textContent, locked: document.getElementById("securityLockOverlay").style.display === "flex" }));
  check("v3: login screen lists projects; non-admin must choose a project", loginOpts.join(",") === ",DEFAULT,P001" && needProj.locked && /프로젝트/.test(needProj.msg), JSON.stringify({ loginOpts, needProj }));
  // [v3.0.2] 로그인 화면 비밀번호 초기화 (테스트 버전: 사번만으로 1234) → 1234 로 로그인하면 변경 필수
  await page.click("#lnkSelfReset"); await page.waitForTimeout(300);
  await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(700);
  const rst = await page.evaluate(() => { const u = ProjectContext.findAny("lead_lee"); return { hash: u && u.pwdHash, toast: Array.prototype.some.call(document.querySelectorAll("#toastContainer *"), e => /1234로 초기화/.test(e.textContent)) }; });
  delete LOCAL_PWD["lead_lee"];
  const forcedAfterReset = await login(page, "lead_lee", LOCAL_PWD, "P001"); await waitApp(page, "P001");
  check("v3.0.2: login-screen password reset to 1234 (no extra auth, test version) → next sign-in must change the password", rst.hash === "" && rst.toast && forcedAfterReset, JSON.stringify({ rst, forcedAfterReset }));
  const locked = await page.evaluate(() => ({ pid: ProjectContext.current, role: AuthManager.getCurrentRole(), sel: getComputedStyle(document.getElementById("headerProjectSelect")).display, badge: document.getElementById("headerProjectNameBadge").textContent, users: projectUsers.map(u => u.empNo).sort().join(",") }));
  await page.evaluate(() => ProjectManager.switchTo("DEFAULT")); await page.waitForTimeout(1200);
  const stay = await page.evaluate(() => ProjectContext.current);
  check("v3: PM logs into the chosen project only (role from that project, no project switch, users of that project only)", locked.pid === "P001" && locked.role === "PM" && locked.sel === "none" && locked.badge === "E2E 신규 프로젝트" && stay === "P001" && locked.users === "admin,lead_lee,pmo_kim", JSON.stringify({ locked, stay }));
  await page.evaluate(() => AuthManager.manualLock()); await page.waitForTimeout(400);
  await login(page, "admin", LOCAL_PWD, ""); await waitApp(page);
  const adm = await page.evaluate(() => ({ role: AuthManager.getCurrentRole(), sel: getComputedStyle(document.getElementById("headerProjectSelect")).display }));
  check("v3: admin can log in without choosing a project and can switch projects", adm.role === "SYS_ADMIN" && adm.sel !== "none", JSON.stringify(adm));
  check("No page errors in local mode", page.errors.length === 0, page.errors.join(" | "));
  await page.context().close();
}

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}

function copyApp(dst) {
  for (const f of ["index.html", "wbs_db_server.py", "app.ini"]) fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  for (const dir of ["css", "js"]) fs.cpSync(path.join(ROOT, dir), path.join(dst, dir), { recursive: true });
  fs.mkdirSync(path.join(dst, "data"));
  fs.copyFileSync(path.join(ROOT, "data", "initial_data.json"), path.join(dst, "data", "initial_data.json"));
}

async function serverScenarios() {
  console.log("\n[DB server mode scenarios]");
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
    check("First visit via server URL -> server DB mode by default", await a.evaluate(() => DbConnector.config.mode) === "SQLITE");
    const resp = await a.request.get(url);
    const csp = resp.headers()["content-security-policy"] || "";
    check("index.html served with CSP (script-src 'self')", /script-src 'self'(;|$)/.test(csp), csp);
    await login(a, "admin", SERVER_PWD);
    // 실제 클릭으로 모든 탭 이동 + 표 입력 (CSP 위반 없이 동작)
    // G: 묶음 → 하위 메뉴를 실제로 눌러 모든 업무 화면 이동, ⚙ 관리 메뉴로 관리 화면 이동
    let visited = 0;
    for (const g of ["ov", "sc", "sq", "co"]) {
      await a.click(`.g-group[data-group="${g}"]`); await a.waitForTimeout(150);
      const subs = await a.$$eval(".g-nav-top .g-sub", bs => bs.map(b => b.getAttribute("data-tab")));
      for (const t of subs) { await a.click(`.g-nav-top .g-sub[data-tab="${t}"]`); await a.waitForTimeout(120); visited += await a.evaluate(t => document.querySelector(".tab-pane.active").id === t ? 1 : 0, t); }
    }
    await a.click("#gAdminBtn"); await a.click('#gAdminItems [data-click-args*="tab-master"]'); await a.waitForTimeout(200);
    const tabOk = visited >= 11 && await a.evaluate(() => document.querySelector(".tab-pane.active").id === "tab-master");
    await a.click('.g-group[data-group="sc"]'); await a.waitForTimeout(150);
    await a.click('.g-nav-top .g-sub[data-tab="tab-wbs"]'); await a.waitForTimeout(400);
    const nameInput = a.locator(`#tab-wbs [data-change="UiH.set"][data-change-args*='"name"']`).first();
    await nameInput.fill("CSP-UI-EDIT"); await nameInput.press("Tab"); await a.waitForTimeout(300);
    const edited = await a.evaluate(() => wbsData.some(t => t.name === "CSP-UI-EDIT"));
    check("Real clicks/inputs work under CSP (all tabs + table edit)", tabOk && edited && a.csp.length === 0, a.csp.slice(0, 2).join(" | "));
    await a.waitForTimeout(300);
    const bar = await a.evaluate(() => { const b = document.getElementById("gSaveBar"); return !!b && !b.hidden && /1/.test(document.getElementById("gSaveBarText").textContent); });
    await a.keyboard.press("Control+s"); await a.waitForTimeout(1200);
    const barAfter = await a.evaluate(() => document.getElementById("gSaveBar").hidden);
    check("G: unsaved-changes bar appears in server mode and Ctrl+S saves all", bar && barAfter, JSON.stringify([bar, barAfter]));
    // 서버 주소 + 로컬 모드 저장값 → 전환 질문
    const b = await newPage({ init: () => { if (!localStorage.getItem("__seen")) { localStorage.setItem("__seen", "1"); localStorage.setItem("WBS_DB_CONNECTOR_CONFIG_2026_V1_1", JSON.stringify({ mode: "LOCAL" })); } } });
    await b.goto(url); await b.waitForTimeout(1500);
    const q = await b.$eval("#syncAskTitle", e => e.textContent).catch(() => "");
    check("Server URL + local mode -> asks to switch to server DB mode", q.includes("서버 DB 모드로 전환"), q);
    await dismissAsk(b);
    check("Switch chosen -> server DB mode", await b.evaluate(() => DbConnector.config.mode) === "SQLITE");
    await login(b, "pmo_kim", SERVER_PWD);

    // 동시 저장 충돌
    await a.evaluate(() => { wbsData.find(t => t.system === "W1" && t.isLeaf).name += "_A"; return SyncManager.save(["wbsData"]); });
    await a.waitForTimeout(800);
    await b.evaluate(() => { wbsData.find(t => t.system === "W1" && t.isLeaf).name += "_B"; SyncManager.save(["wbsData"]); });
    await b.waitForTimeout(1000);
    check("Another user saved first -> conflict warning", (await b.$eval("#syncAskTitle", e => e.textContent)).includes("저장 충돌"));
    await b.click("#syncAskBtns button:nth-child(2)"); await b.waitForTimeout(1000);
    check("Ignore -> latest version applied", await b.evaluate(() => wbsData.find(t => t.system === "W1" && t.isLeaf).name.endsWith("_A")));

    // 여러 프로젝트 (서버): 만들기 → 전환 → 데이터 분리
    const defW = await a.evaluate(() => wbsData.length);
    await a.evaluate(() => ProjectManager.open()); await a.waitForTimeout(500);
    await a.fill("#pmNewName", "서버 신규 프로젝트"); await a.fill("#pmNewStart", "2028-01-01"); await a.fill("#pmNewEnd", "2028-12-31");
    await a.click('#projectManagerModal [data-click="ProjectManager.create"]'); await a.waitForTimeout(800);
    await a.evaluate(() => ProjectManager.switchTo("P001")); await a.waitForTimeout(800); await waitApp(a, "P001");
    const sp = await a.evaluate(() => ({ pid: ProjectContext.current, wbs: wbsData.length, name: projectConfig.projectName, opts: document.querySelectorAll("#headerProjectSelect option").length }));
    await a.evaluate(() => { wbsData.push({ id: "1", level: 1, system: subsystemsMeta[0].name, name: "SERVER-P001-TASK", isLeaf: true, pStart: "2028-01-03", pEnd: "2028-02-01", weight: 1, aProg: 0 }); return SyncManager.save(["wbsData"]); });
    await a.waitForTimeout(800);
    await a.evaluate(() => ProjectManager.switchTo("DEFAULT")); await a.waitForTimeout(800); await waitApp(a, "DEFAULT");
    const sb = await a.evaluate(() => ({ pid: ProjectContext.current, wbs: wbsData.length, leak: wbsData.some(t => t.name === "SERVER-P001-TASK") }));
    const bView = await b.evaluate(async () => { await ProjectManager.refreshList(); const r = await ServerBackend.request("/api/projects/list", {}); return { list: (ProjectContext.projects || []).map(p => p.id).join(","), api: (r.projects || []).map(p => p.id).join(","), sel: getComputedStyle(document.getElementById("headerProjectSelect")).display }; });
    check("Server v3: PM sees only the project they logged into (new project hidden, no project switch)", bView.list === "DEFAULT" && bView.sel === "none", JSON.stringify(bView));
    check("Server: create project + switch + save stays in that project", sp.pid === "P001" && sp.wbs === 0 && sp.name === "서버 신규 프로젝트" && sp.opts === 2 && sb.pid === "DEFAULT" && sb.wbs === defW && !sb.leak, JSON.stringify([sp, sb]));

    // 서버 중지 → 연결 끊김 표시
    srv.kill();
    await new Promise(r => setTimeout(r, 800));
    await a.evaluate(() => ServerHeartbeat.check()); await a.waitForTimeout(800);
    check("Server stopped -> disconnected banner", await a.evaluate(() => { const bar = document.getElementById("serverOfflineBar"); return !!bar && bar.style.display === "block"; }));
    check("No page errors in server mode", a.errors.length === 0 && b.errors.length === 0, a.errors.concat(b.errors).join(" | "));
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
    check("Test runner error", false, e.message);
  } finally {
    await browser.close();
  }
  const fail = results.filter(r => !r.ok);
  console.log(`\nResult: ${results.length - fail.length} / ${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})();
