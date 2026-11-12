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
const FILE_URL = "file://" + path.join(ROOT, "webapp", "index.html").replace(/\\/g, "/");
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
  const staticSrv = spawn(py, ["-m", "http.server", String(staticPort), "--bind", "127.0.0.1", "--directory", path.join(ROOT, "webapp")], { stdio: "ignore" });
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
  const loginBox = await page.evaluate(() => { const m = document.querySelector(".security-lock-modal").getBoundingClientRect(), bt = document.getElementById("btnLockSubmit").getBoundingClientRect();
    return { h: Math.round(m.height), w: Math.round(m.width), btnBottom: Math.round(bt.bottom), vh: innerHeight, lang: !!document.getElementById("inputLoginLang"), proj: !!document.getElementById("inputLoginProject") }; });
  check("Login box is a compact two-column layout (login button visible without scrolling)", loginBox.h <= 500 && loginBox.w > loginBox.h && loginBox.btnBottom < loginBox.vh && loginBox.lang && loginBox.proj, JSON.stringify(loginBox));
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
  const sizeBlocked = await page.evaluate(() => { const r = WeeklyReportManager.currentWeekReport; const keep = r.issuesNotes; const big = "가".repeat(33000); r.issuesNotes = big; const ok = WeeklyReportManager._checkSize(0, false); r.issuesNotes = keep; return !ok; });
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
  await page.evaluate(() => { SubTabs.show("merge", "merge"); document.getElementById("workDataSubsysSelect").value = "ALL"; SmartMergeCenter.updateCountBadges();
    document.querySelectorAll("#mtBody .mt-chk").forEach(c => { c.checked = ["notices", "comms"].includes(c.value); }); MergeTable.download("JSON"); });
  await page.waitForTimeout(1000);
  const d = page.downloads[dl0];
  const tmp = path.join(os.tmpdir(), `axpmys_collab_${Date.now()}.json`);
  await d.saveAs(tmp);
  const j = JSON.parse(fs.readFileSync(tmp, "utf8")); j.noticesData[0].title = "E2E-ROUNDTRIP"; fs.writeFileSync(tmp, JSON.stringify(j));
  await page.setInputFiles("#mtUpInput", tmp); await page.waitForTimeout(800);
  const pv = await page.evaluate(() => ({ shown: getComputedStyle(document.getElementById("mergePreviewModal")).display, rows: [...document.querySelectorAll("#mpBody tr")].map(tr => tr.innerText.replace(/\s+/g, " ")) }));
  await page.click("#mpOkBtn"); await page.waitForTimeout(500);
  check("v4.1: Smart merge list table — notices/posts JSON export -> upload shows the preview, [반영] applies", pv.shown === "flex" && pv.rows.length === 2 && await page.evaluate(() => noticesData[0].title) === "E2E-ROUNDTRIP", JSON.stringify(pv));
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
  check("v3: new project starts with the system admins only; communication channels are per project (its subsystems)", fresh.users.join(",") === "admin,admin2" && fresh.ch === fresh.subs, JSON.stringify(fresh));
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
  check("Themes: Electric (default) · Navy · Matte · Graphite (Teal removed); left menu option", side && themes === "electric,navy,green,brown,matte,dark", themes);
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
    // [v3.2.0] 글자 크기 = 토큰(--fs-scale), 화면 확대(zoom) 아님 — 본문 글자 13px → 16.9px, 화면 폭은 그대로
    out.zoom = document.documentElement.style.getPropertyValue("--fs-scale") + "|" + document.documentElement.style.zoom + "|" + getComputedStyle(document.body).fontSize + "|" + (document.documentElement.scrollWidth <= window.innerWidth);
    UiScale.set(1); changeTheme("navy"); GShell.closeMenus();
    out.zoomBack = document.documentElement.style.getPropertyValue("--fs-scale") + getComputedStyle(document.body).fontSize;
    GShell.go("tab-wbs"); await new Promise(r => setTimeout(r, 300));
    const t = document.getElementById("wbsTable");
    const f1 = t.classList.contains("wbs-fold"), w1 = t.scrollWidth <= t.parentElement.clientWidth + 2;
    WbsFold.toggle(); await new Promise(r => setTimeout(r, 100));
    const f2 = t.classList.contains("wbs-fold"), ownerShown = getComputedStyle(t.querySelector("th.col-fold")).display !== "none";
    const foldCols = [...t.querySelectorAll("thead th.col-fold")].map(th => th.textContent.trim()).join(",");
    WbsFold.toggle();
    out.fold = { f1, w1, f2, ownerShown, foldCols, dow: document.querySelectorAll("#wbsTableBody .wbs-dow").length > 0 };
    return out;
  });
  check("v3.1.0: 5 report themes (old names mapped); labelled header buttons; UI menu with theme swatches and text size; WBS owner/deliverable columns fold to fit, weekdays shown",
    ui310.exportThemes === "Official Navy,Office Blue,Office Gray,Office Green,Matte Slate" && ui310.oldMapped === "Office Green,Matte Slate,Official Navy" && ui310.btnWide && ui310.swatches === 6 && ui310.theme === "matte" && ui310.zoom === "1.3||16.9px|true" && ui310.zoomBack === "13px" &&
    ui310.fold.f1 && ui310.fold.w1 && !ui310.fold.f2 && ui310.fold.ownerShown && ui310.fold.dow && ui310.fold.foldCols === "가중치,REQ ID,담당자,산출물/조치", JSON.stringify(ui310));
  // [v3.2.0] 큰 글씨: 아주 크게(130%)에서도 모든 화면에 페이지 가로 넘침 없음, 머리글 한 줄, WBS 는 접으면 화면 안
  const big = await page.evaluate(async () => {
    UiScale.set(1.3); const over = [];
    for (const t of ["tab-home", "tab-dashboard", "tab-matrix", "tab-wbs", "tab-gantt", "tab-req", "tab-voc", "tab-deliverables", "tab-weekly-report", "tab-meeting", "tab-notices", "tab-master", "tab-config"]) {
      GShell.go(t); await new Promise(r => setTimeout(r, 200));
      if (document.documentElement.scrollWidth > window.innerWidth + 1) over.push(t);
    }
    const h = document.querySelector("header");
    GShell.go("tab-wbs"); await new Promise(r => setTimeout(r, 200));
    const t = document.getElementById("wbsTable"); const folded = t.classList.contains("wbs-fold"), fit = t.scrollWidth <= t.parentElement.clientWidth + 2;
    const fs = getComputedStyle(document.querySelector("#wbsTableBody td")).fontSize;
    UiScale.set(1);
    return { over, header: h.scrollWidth <= h.clientWidth, folded, fit, fs };
  });
  check("v3.2.0: text size 130% (tokens) — no page overflow on any screen, header fits, folded WBS fits the screen", big.over.length === 0 && big.header && big.folded && big.fit && parseFloat(big.fs) > 14, JSON.stringify(big));
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
  check("Standard: settings offer 3 themes / 2 menu positions; old values mapped; badge shows edition name", cfgOpts.themes === "electric,navy,green,brown,matte,dark" && cfgOpts.layouts === "top-nav,sidebar-left" && cfgOpts.cards === 2 && cfgOpts.t === "navy" && cfgOpts.l === "top-nav" && cfgOpts.badge === cfgOpts.ed, JSON.stringify(cfgOpts));

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
      ok: wbsData.filter(t => t.system === "W1").slice(-4).every(t => (t.level === 2 || t.level === 3) && t.pStart >= projectConfig.projectStartDate && t.pEnd <= projectConfig.projectEndDate && !WBSEngine.isHoliday(t.pStart, projectConfig.holidays) && !WBSEngine.isHoliday(t.pEnd, projectConfig.holidays) && /^\d+(\.\d+){1,2}$/.test(t.id)) }));
    check("Template append: existing WBS kept, phase tasks added under the same L1 (business-day dates, renumbered)", w1.shown && w1.rows >= 2 && w1b.l1 === 1 && w1b.n === w1.n + w1.rows && w1b.ok, JSON.stringify({ w1, w1b }));
    await page.click('#tab-wbs [data-click="WbsTemplate.open"]'); await page.waitForTimeout(300);
    await page.selectOption("#tplSystemSelect", "PMO"); await page.waitForTimeout(200);
    await page.check('input[name="tplMode"][value="replace"]'); await page.waitForTimeout(200);
    const pre = await page.evaluate(() => document.querySelectorAll("#tplPreviewBody tr").length);
    await page.click("#tplApplyBtn"); await page.waitForTimeout(300);
    await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(800);
    const pmo = await page.evaluate(() => { const r = wbsData.filter(t => t.system === "PMO"); return { n: r.length, l1: r.filter(t => t.level === 1).length, names: r.map(t => t.name).slice(1), others: wbsData.filter(t => t.system === "W2").length }; });
    check("Template replace (after confirm): old PMO tasks removed, rebuilt from template; other subsystems untouched", pmo.n === pre && pmo.l1 === 1 && pmo.others > 0 && pmo.names.indexOf("착수단계") !== -1, JSON.stringify(pmo));

    // [v3.7.0] 템플릿: 단계(L2)마다 세부 과업(L3) 2개 · 담당자 = 서브시스템 총괄리더 · 산출물 비움 · 기준정보의 단계 계획 일정 반영 / 다른 서브시스템 WBS 복사
    const tpl37 = await page.evaluate(() => {
      const r = wbsData.filter(t => t.system === "PMO");
      const l2 = r.filter(t => t.level === 2), l3 = r.filter(t => t.level === 3);
      const pair = r.findIndex(t => t.level === 2);
      return { l2: l2.length, l3: l3.length, same: r[pair + 1].level === 3 && r[pair + 2].level === 3 && r[pair + 1].pStart === r[pair].pStart && r[pair + 2].pEnd === r[pair].pEnd,
        owner: [...new Set(r.map(t => t.owner))], lead: WbsTemplate.leadOf("PMO"), out: r.every(t => !t.output) };
    });
    check("Template v3.7: two L3 tasks under each L2 with the same plan dates, owner = subsystem lead, deliverable left empty", tpl37.l3 === tpl37.l2 * 2 && tpl37.same && tpl37.owner.length === 1 && tpl37.owner[0] === tpl37.lead && !!tpl37.lead && tpl37.out, JSON.stringify(tpl37));
    const tplDate = await page.evaluate(() => {
      projectConfig.reqSdlcPhases = ReqPhaseManager.getPhases();
      projectConfig.reqSdlcPhases[0].pStart = "2027-02-01"; projectConfig.reqSdlcPhases[0].pEnd = "2027-02-26";
      const rows = WbsTemplate.build("W2", "REQ", true);
      const lead2 = projectUsers.filter(u => AuthManager.normalizeRole(u.role) === "LEAD" && u.subsystem === "W2").map(u => u.name)[0] || projectUsers.filter(u => u.subsystem === "W2").map(u => u.name)[0];
      delete projectConfig.reqSdlcPhases[0].pStart; delete projectConfig.reqSdlcPhases[0].pEnd;
      return { l2: [rows[1].pStart, rows[1].pEnd], l3: [rows[2].pStart, rows[3].pEnd], owner: rows[1].owner, lead2,
        heads: [...document.querySelectorAll("#editSdlcPhasesTable th")].map(th => th.textContent).join("|") };
    });
    check("Master phase plan dates (SDLC / REQ) flow into the template L2 and L3 tasks", tplDate.l2.join() === "2027-02-01,2027-02-26" && tplDate.l3.join() === "2027-02-01,2027-02-26" && tplDate.owner === tplDate.lead2 && tplDate.heads.includes("계획 시작") && tplDate.heads.includes("계획 종료"), JSON.stringify(tplDate));
    await page.click('#tab-wbs [data-click="WbsTemplate.open"]'); await page.waitForTimeout(300);
    await page.selectOption("#tplSystemSelect", "A1"); await page.waitForTimeout(200);
    await page.selectOption("#tplTypeSelect", "COPY:W2"); await page.waitForTimeout(200);
    await page.check('input[name="tplMode"][value="replace"]'); await page.waitForTimeout(200);
    const cpBtn = await page.evaluate(() => ({ btn: document.getElementById("tplApplyBtn").textContent, shown: !document.getElementById("tplExisting").hidden }));
    await page.click("#tplApplyBtn"); await page.waitForTimeout(300);
    await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(800);
    const cp = await page.evaluate(() => { const a = wbsData.filter(t => t.system === "A1"), w = wbsData.filter(t => t.system === "W2");
      return { n: a.length, w: w.length, lv: a.map(t => t.level).join("") === w.map(t => t.level).join(""), dates: a.every((t, i) => t.pStart === w[i].pStart && t.pEnd === w[i].pEnd),
        clean: a.every(t => !t.aStart && !t.aEnd && !(parseFloat(t.aProg) > 0)), owner: [...new Set(a.map(t => t.owner))], lead: WbsTemplate.leadOf("A1") }; });
    check("WBS copy from another subsystem (replace chosen): same structure and plan dates, actuals cleared, owner = target subsystem lead", cpBtn.shown && cp.n === cp.w && cp.lv && cp.dates && cp.clean && cp.owner.length === 1 && cp.owner[0] === cp.lead, JSON.stringify({ cpBtn, cp }));

    // [v3.7.0] 기준정보 표준 산출물: 단계 순 표시 / 서브 탭 줄 고정 / 전체 사용자 통합 관리 / admin2 / 프로젝트 사용 중지 표시
    await page.evaluate(() => { GShell.go("tab-master"); MasterSubTabs.show("phase"); }); await page.waitForTimeout(500);
    const stdSort = await page.evaluate(() => { const order = ["요구사항정의단계", "분석설계단계", "구현단계", "통합테스트단계", "시험검증단계", "이행단계", "안정화단계", "이행안정화단계", "구축단계"];
      const ph = [...document.querySelectorAll("#standardDeliverablesBody tr td:nth-child(2) select")].map(el => order.indexOf(el.value));
      return { n: ph.length, sorted: ph.every((v, i) => i === 0 || ph[i - 1] <= v), dirty: SyncManager.dirtyCount() }; });
    check("Master: standard deliverables are listed in phase order (viewing does not mark data as changed)", stdSort.n > 3 && stdSort.sorted, JSON.stringify(stdSort));
    await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(300);
    const stick = await page.evaluate(() => ({ bar: Math.round(document.querySelector("#tab-master .master-subtab-bar").getBoundingClientRect().top), nav: Math.round(document.querySelector(".g-nav").getBoundingClientRect().bottom), y: window.scrollY,
      hdr: Math.round(document.querySelector("header").getBoundingClientRect().top), hdrB: Math.round(document.querySelector("header").getBoundingClientRect().bottom), navT: Math.round(document.querySelector(".g-nav").getBoundingClientRect().top),
      barB: Math.round(document.querySelector("#tab-master .master-subtab-bar").getBoundingClientRect().bottom) }));
    await page.evaluate(() => window.scrollTo(0, 0));
    check("Header, menu row and sub-tab bar all stay fixed while scrolling (fixed area under 160px)", stick.y > 300 && stick.hdr === 0 && Math.abs(stick.navT - stick.hdrB) <= 1 && Math.abs(stick.bar - stick.nav) <= 1 && stick.barB <= 160, JSON.stringify(stick));
    // [v3.7.1] 계획 0 · 실적 0 은 지연이 아님 (달성률 100% 로 보고 정상 표시)
    const zero = await page.evaluate(() => ({ rate: BulletChart.rate({ plan: 0, actual: 0 }), lv: BulletChart.level({ plan: 0, actual: 0 }), late: BulletChart.level({ plan: 50, actual: 10 }) }));
    check("Plan 0 / actual 0 is not shown as delayed (rate treated as on track)", zero.rate === 100 && zero.lv === "ok" && zero.late === "bad", JSON.stringify(zero));
    await page.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "users"); }); await page.waitForTimeout(600);
    const ua1 = await page.evaluate(() => ({ rows: document.querySelectorAll("#uaBody tr").length, all: UserAdmin.users.length, admin2: UserAdmin.users.some(u => u.empNo === "admin2" && u.sysAdmin),
      chip: (document.querySelector("#uaBody .ua-chip:not(.ua-admin)") || {}).textContent || "", sum: document.getElementById("uaSummary").textContent }));
    await page.evaluate(() => UserAdmin.openNew()); await page.waitForTimeout(300);
    await page.fill("#uaEmpNo", "ua_e2e"); await page.fill("#uaName", "통합 사용자"); await page.fill("#uaDept", "시험팀");
    await page.evaluate(() => { const tr = document.querySelector("#uaProjectRows tr"); tr.querySelector(".ua-join").checked = true; UserAdmin.syncEditRows(); tr.querySelector(".ua-role").value = "LEAD"; tr.querySelector(".ua-sub").value = "W1"; });
    await page.click('#userAdminModal [data-click="UserAdmin.saveEdit"]'); await page.waitForTimeout(900);
    const ua2 = await page.evaluate(() => { const u = UserAdmin.users.find(x => x.empNo === "ua_e2e"); const v = projectUsers.find(x => x.empNo === "ua_e2e");
      return { saved: !!u && u.projectRoles[ProjectContext.current].role === "LEAD" && u.projectRoles[ProjectContext.current].subsystem === "W1", inProject: !!v, lead: WbsTemplate.leadOf("W1") }; });
    await page.evaluate(() => UserAdmin.remove("ua_e2e")); await page.waitForTimeout(300);
    await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(900);
    const ua3 = await page.evaluate(() => ({ gone: !UserAdmin.users.some(x => x.empNo === "ua_e2e") && !projectUsers.some(x => x.empNo === "ua_e2e") }));
    check("System settings > All users: every user with project roles in one table (admin2 present)", ua1.rows === ua1.all && ua1.all >= 9 && ua1.admin2 && ua1.chip.includes("·") && ua1.sum.includes("시스템관리자 2명"), JSON.stringify(ua1));
    check("All users: add a user with a project role (LEAD of W1 becomes the template owner), then delete", ua2.saved && ua2.inProject && ua2.lead === "통합 사용자" && ua3.gone, JSON.stringify({ ua2, ua3 }));

    const heads = await page.evaluate(() => [...document.querySelectorAll(".tab-pane")].map(p => { const h = p.querySelector(":scope > .sub-header-bar.neo-ph"); return [p.id, !!h && !!h.querySelector(".neo-ph-main .sub-title") && !!h.querySelector(".neo-ph-desc"), p.querySelectorAll(".sync-toolbar-state").length <= 1 && (!p.querySelector(".sync-toolbar-state") || !!h.querySelector(".sync-toolbar-state"))]; }).filter(x => !(x[1] && x[2])));
    check("Neo: every screen has the unified header (title + description + save status on the right)", heads.length === 0, JSON.stringify(heads));

    await page.evaluate(() => GShell.go("tab-weekly-report")); await page.waitForTimeout(600);
    await page.click('#tab-weekly-report .neo-dd[data-dd="down"] .neo-dd-btn'); await page.waitForTimeout(200);
    const dd = await page.evaluate(() => { const m = document.querySelector('#tab-weekly-report .neo-dd[data-dd="down"] .neo-dd-menu'); return { open: !m.hidden, items: m.querySelectorAll(".neo-dd-item").length, loose: document.querySelectorAll('#tab-weekly-report .neo-ph-actions > button[data-btn$="-down"]').length }; });
    const dl0 = page.downloads.length;
    await page.click('#tab-weekly-report .neo-dd-menu .neo-dd-item[data-click-args*="EXCEL"]'); await page.waitForTimeout(1500);
    const ddClosed = await page.evaluate(() => document.querySelector('#tab-weekly-report .neo-dd-menu').hidden);
    check("Neo: header download buttons grouped in the [⬇ Download] menu; item downloads and closes the menu", dd.open && dd.items === 4 && dd.loose === 0 && page.downloads.length > dl0 && ddClosed, JSON.stringify({ dd, ddClosed, dl: page.downloads.length - dl0 }));

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

  // [v3.3.0] 통합 주간보고는 작성 완료 서브시스템만 · 간트 마일스톤 고정 · 경영 보고 장표(PPT/PDF) · 엑셀 내려받기/올리기 표준
  const v330 = await page.evaluate(async () => {
    const out = {};
    const W = WeeklyReportManager;
    const integ = W.buildWeekIntegrated(W.listWeek);
    const done = integ.integratedFrom.done;
    const mdl = WeeklyExport.model(integ);
    out.onlyDone = mdl.sections[1].tables[0].rows.every(r => done.indexOf(r[0]) !== -1 || !getAllSubsystemNames().includes(r[0])) && mdl.sections[0].tables[0].rows.every(r => done.indexOf(r[1]) !== -1);
    out.done = done.join(",");
    // 간트: 아래로 스크롤해도 통합 마일스톤 행은 머리글 아래
    GShell.go("tab-gantt"); await new Promise(r => setTimeout(r, 400));
    const gw = document.querySelector(".gantt-wrapper"); gw.scrollTop = 500; await new Promise(r => setTimeout(r, 100));
    const ms = document.querySelector("#ganttRowsContainer .gantt-ms-row");
    out.msPinned = !!ms && Math.abs(ms.getBoundingClientRect().top - gw.getBoundingClientRect().top - 36) <= 3;
    gw.scrollTop = 0;
    // 경영 보고 장표
    const names = [], orig = ExcelSync._triggerDownload;
    ExcelSync._triggerDownload = (blob, name) => names.push([name, blob.size]);
    const deck = ExecDeck.build(ExecDeck.week());
    ExecDeck.downloadPptx();
    out.deck = { slides: deck.slides.length, sys: deck.slides.filter(x => done.indexOf(x.name) !== -1).length, html: /class="slide"/.test(ExecDeck.toHtml(deck)), file: names[0] && names[0][0], size: names[0] && names[0][1] };
    // 엑셀 표준: 화면 머리줄 메뉴 · 파일 이름 · 서브시스템 범위 올리기
    out.menus = ["tab-wbs", "tab-req", "tab-voc", "tab-deliverables"].map(t => document.querySelectorAll(`#${t} .neo-dd [data-click="DataIO.download"], #${t} .neo-dd [data-click="DataIO.pick"]`).length).join(",");
    GShell.go("tab-req"); document.getElementById("reqSubsystemFilter").value = "W1"; renderReqMasterTable();
    let blob = null;
    ExcelSync._triggerDownload = (b, name) => { blob = b; names.push([name, b.size]); };
    DataIO.download("req");
    ExcelSync._triggerDownload = orig;
    out.reqFile = names[names.length - 1][0];
    const before = reqMasterData.filter(r => r.system === "W1").length, others = reqMasterData.filter(r => r.system !== "W1").length;
    await DataIO.upload("req", new File([blob], "req.xlsx"));
    await new Promise(r => setTimeout(r, 200));
    out.preview = [...document.querySelectorAll("#mpBody tr")].map(tr => tr.innerText.replace(/\s+/g, " ")).join("|");
    document.getElementById("mpOkBtn").click(); await new Promise(r => setTimeout(r, 400));
    out.up = { before, after: reqMasterData.filter(r => r.system === "W1").length, others, othersAfter: reqMasterData.filter(r => r.system !== "W1").length };
    document.getElementById("reqSubsystemFilter").value = "ALL"; renderReqMasterTable();
    out.oldWords = /엑셀 다운로드|엑셀 업로드/.test(document.body.innerText);
    return out;
  });
  check("v3.3.0: integrated weekly report has only completed subsystems; gantt milestone row pinned; executive deck (cover, agenda, progress, per-subsystem) as PPT and print page; standard Excel menus, file names and scoped upload",
    v330.onlyDone && v330.msPinned && v330.deck.slides >= 6 && v330.deck.sys === v330.done.split(",").filter(Boolean).length && v330.deck.html && /_경영보고_\d{4}W\d{2}_PPT\.pptx$/.test(v330.deck.file) && v330.deck.size > 5000 &&
    v330.menus === "2,2,2,2" && /^[A-Za-z0-9-]+_요구사항_W1_\d{8}\.xlsx$/.test(v330.reqFile) && v330.up.after === v330.up.before && v330.up.othersAfter === v330.up.others && !v330.oldWords, JSON.stringify(v330));

  // [v3.4.0] 간트 B안 막대 · 불릿 차트(대시보드 · 브리핑 홈) · 경영 보고 장표 구성
  const v340 = await page.evaluate(async () => {
    const out = {};
    const t = wbsData.find(x => x.isLeaf && x.pProg >= 30 && x.pProg < 100); const keep = t.aProg; t.aProg = Math.max(0, t.pProg - 20); rebuildAll();
    GShell.go("tab-gantt"); await new Promise(r => setTimeout(r, 400));
    out.gantt = { bars: document.querySelectorAll(".gantt-pbar").length, fill: document.querySelectorAll(".gantt-pbar .gp-fill").length, late: document.querySelectorAll(".gantt-pbar.late .gp-gap").length, mark: document.querySelectorAll(".gantt-pbar .gp-mark").length, summary: document.querySelectorAll(".gantt-pbar.summary").length };
    t.aProg = keep; rebuildAll();
    GShell.go("tab-dashboard"); await new Promise(r => setTimeout(r, 300));
    out.dashBullet = document.querySelectorAll("#dashBulletChart .bl-row").length;
    GShell.go("tab-home"); HomeScreenManager.setStyle("EXECUTIVE"); await new Promise(r => setTimeout(r, 300));
    out.homeBullet = document.querySelectorAll("#tab-home .bl-row").length; // [v3.5.0] 홈에서는 뺌
    HomeScreenManager.setStyle(HomeScreenManager.roleDefault());
    const deck = ExecDeck.build(ExecDeck.week());
    out.names = deck.slides.map(x => x.name).join(",");
    const texts = deck.slides.map(sl => sl.els.filter(e => e.t === "text").map(e => e.paras.map(q => q.text).join(" ")).join(" ")).join(" ");
    out.noOldSlide = !/요구사항 · 산출물 · VOC 현황/.test(texts) && !/진행 요약|계획 요약|등록 요약/.test(texts);
    out.hasPoly = deck.slides.some(sl => sl.els.some(e => e.t === "poly"));
    return out;
  });
  check("v3.4.0: gantt bars show actual fill, plan marker, delay hatching and summary bars; bullet chart on the dashboard (not on home); executive deck order (progress → S-curve → bullet → REQ·VOC → SDLC matrix → delays → subsystems)",
    v340.gantt.bars > 10 && v340.gantt.fill === v340.gantt.bars && v340.gantt.late >= 1 && v340.gantt.mark >= 1 && v340.gantt.summary >= 1 && v340.dashBullet >= 1 && v340.homeBullet === 0 &&
    /^표지,목차,종합 진척 현황,S-커브,불릿 차트,요구사항·VOC,SDLC 매트릭스(,SDLC 매트릭스)*,지연·마일스톤,/.test(v340.names) && v340.noOldSlide && v340.hasPoly, JSON.stringify(v340));

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
  check("v3: PM logs into the chosen project only (role from that project, no project switch, users of that project only)", locked.pid === "P001" && locked.role === "PM" && locked.sel === "none" && locked.badge === "E2E 신규 프로젝트" && stay === "P001" && locked.users === "admin,admin2,lead_lee,pmo_kim", JSON.stringify({ locked, stay }));
  await page.evaluate(() => AuthManager.manualLock()); await page.waitForTimeout(400);
  await login(page, "admin", LOCAL_PWD, ""); await waitApp(page);
  const adm = await page.evaluate(() => ({ role: AuthManager.getCurrentRole(), sel: getComputedStyle(document.getElementById("headerProjectSelect")).display }));
  check("v3: admin can log in without choosing a project and can switch projects", adm.role === "SYS_ADMIN" && adm.sel !== "none", JSON.stringify(adm));
  // [v3.8.0] 화면 테마는 프로젝트별 / 프로젝트 단위 백업 · 복원 · Task 정보 초기화
  await page.evaluate(() => ProjectManager.switchTo("DEFAULT")); await page.waitForTimeout(1200); await waitApp(page, "DEFAULT");
  await page.evaluate(() => changeTheme("brown")); await page.waitForTimeout(300);
  await page.evaluate(() => SyncManager.save(null, { notify: false })); await page.waitForTimeout(300);
  await page.evaluate(() => ProjectManager.switchTo("P001")); await page.waitForTimeout(1200); await waitApp(page, "P001");
  const thP = await page.evaluate(() => document.body.dataset.theme);
  await page.evaluate(() => ProjectManager.switchTo("DEFAULT")); await page.waitForTimeout(1200); await waitApp(page, "DEFAULT");
  const thD = await page.evaluate(() => ({ t: document.body.dataset.theme, pc: projectConfig.uiTheme }));
  check("v3.8: screen theme is per project (Brown in this project, other project keeps the system default)", thD.t === "brown" && thD.pc === "brown" && thP !== "brown", JSON.stringify({ thP, thD }));
  await page.evaluate(() => { GShell.go("tab-master"); MasterSubTabs.show("ui-report"); }); await page.waitForTimeout(400);
  const shared = await page.evaluate(() => ({ rep: !!document.querySelector("#masterSub-ui-report #shared-report #cfgExportThemeSelect, #masterSub-ui-report #shared-report select"),
    note: (document.querySelector("#masterSub-ui-report .proj-scope-note") || {}).textContent || "" }));
  await page.evaluate(() => MasterSubTabs.show("ui-channel")); await page.waitForTimeout(300);
  const sharedCh = await page.evaluate(() => !!document.querySelector("#masterSub-ui-channel #shared-channel"));
  check("v3.8: Master data has Screen/Theme, Report form and Channel sub-tabs (same project settings as System settings)", shared.rep && shared.note.includes("프로젝트별 설정") && sharedCh, JSON.stringify({ shared, sharedCh }));
  const p1Before = await page.evaluate(() => { const st = LocalBackend._read("P001") || {}; return { wbs: (st.wbsData || []).length, subs: (st.subsystemsMeta || []).length }; });
  await page.evaluate(() => ProjectData._clear(["P001"], ["P001"])); await page.waitForTimeout(500);
  const p1After = await page.evaluate(() => { const st = LocalBackend._read("P001") || {}; return { wbs: (st.wbsData || []).length, subs: (st.subsystemsMeta || []).length, cfg: !!st.projectConfig, snap: BackupHistoryManager.snapshots[0].projectId }; });
  check("v3.8: Task reset of another project (local): its tasks cleared, master data kept, snapshot tagged with that project", p1After.wbs === 0 && p1After.subs === p1Before.subs && p1After.cfg && p1After.snap === "P001", JSON.stringify({ p1Before, p1After }));
  await page.evaluate(() => { GShell.go("tab-merge"); SubTabs.show("merge", "backup"); }); await page.waitForTimeout(800);
  const before38 = await page.evaluate(() => ({ wbs: wbsData.length, req: reqMasterData.length, mtg: meetingsData.length, notice: noticesData.length, subs: subsystemsMeta.length, name: projectConfig.projectName,
    rows: document.querySelectorAll("#backupHistoryTableBody tr").length, other: BackupHistoryManager.snapshots.filter(s => s.projectId === "P001").length }));
  const backupBlob = await page.evaluate(async () => { const o = ExcelSync._triggerDownload; let got = null; ExcelSync._triggerDownload = (blob, name) => { got = { name, blob }; };
    ProjectData.exportProject(); ExcelSync._triggerDownload = o; return got ? { name: got.name, text: await got.blob.text() } : null; });
  const bkNoReset = await page.evaluate(() => !document.querySelector('#mergeBackupPane [data-click="ProjectData.clearFromConfig"], #mergeBackupPane #cfgClearTarget') && !!document.getElementById("bkAutoStatus"));
  await page.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "data"); }); await page.waitForTimeout(700);
  await page.selectOption("#cfgClearTarget", "DEFAULT"); await page.waitForTimeout(200);
  await page.click('#daActions [data-click="DataAdmin.run"][data-click-args*="tasks"]'); await page.waitForTimeout(300);
  const daOk0 = await page.evaluate(() => document.getElementById("daConfirmOk").disabled);
  await page.fill("#daConfirmInput", await page.evaluate(() => document.getElementById("daConfirmExpect").textContent));
  await page.click("#daConfirmOk"); await page.waitForTimeout(900);
  check("v4.1: reset moved to System settings > Data management (typed project-name confirmation); Backup · Restore keeps only an auto-backup status line", bkNoReset && daOk0);
  await page.evaluate(() => { GShell.go("tab-merge"); SubTabs.show("merge", "backup"); }); await page.waitForTimeout(600);
  const cleared = await page.evaluate(() => ({ wbs: wbsData.length, req: reqMasterData.length, del: deliverablesData.length, mtg: meetingsData.length, notice: noticesData.length, comm: communicationsData.length,
    wr: weeklyReportsData.length, voc: vocData.length, subs: subsystemsMeta.length, name: projectConfig.projectName, std: standardDeliverablesMeta.length }));
  check("v3.8: Task reset of this project (Master > Backup): WBS · REQ · deliverables · weekly · VOC · meetings · notices · posts cleared; basic and master data kept",
    cleared.wbs + cleared.req + cleared.del + cleared.mtg + cleared.notice + cleared.comm + cleared.wr + cleared.voc === 0 && cleared.subs === before38.subs && cleared.std > 0 && cleared.name === before38.name, JSON.stringify(cleared));
  await page.evaluate(async (txt) => { const f = new File([txt], "project_backup.json", { type: "application/json" }); await ProjectData.importProject({ target: { files: [f], value: "" } }); }, backupBlob.text);
  await page.waitForTimeout(300);
  await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(1000);
  const restored = await page.evaluate(() => ({ wbs: wbsData.length, req: reqMasterData.length, mtg: meetingsData.length, notice: noticesData.length, name: projectConfig.projectName,
    p1locked: [...document.querySelectorAll("#backupHistoryTableBody tr")].filter(tr => /P001|서버 신규|신규/.test(tr.children[2].textContent)).every(tr => tr.querySelector('[data-click*="restore"]').disabled) }));
  check("v3.8/4.0: project backup JSON → restore brings this project back (another project's restore point cannot be restored here)", backupBlob.name.includes("프로젝트백업") && restored.wbs === before38.wbs && restored.req === before38.req
    && restored.mtg === before38.mtg && restored.notice === before38.notice && restored.name === before38.name && before38.other >= 1 && restored.p1locked, JSON.stringify({ before38, restored, file: backupBlob.name }));
  // [v3.9.0] 공정 유형: 시스템 설정에서 관리, 프로젝트는 활성화 · 계획 일정만
  await page.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "process"); }); await page.waitForTimeout(500);
  const pl1 = await page.evaluate(() => ({ sdlc: document.querySelectorAll("#plSdlcCards .pl-card").length, req: document.querySelectorAll("#plReqCards .pl-card").length }));
  await page.evaluate(() => ProcessLib.openNew("sdlc")); await page.waitForTimeout(300);
  await page.fill("#editSdlcCode", "SDLC_E2E"); await page.fill("#editSdlcName", "E2E 시험 유형");
  const libModal = await page.evaluate(() => getComputedStyle(document.querySelector("#customSdlcModal td.col-date")).display);
  await page.click('#customSdlcModal [data-click="saveCustomSdlcFromModal"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { GShell.go("tab-master"); MasterSubTabs.show("phase"); }); await page.waitForTimeout(500);
  const pl2 = await page.evaluate(() => ({ card: [...document.querySelectorAll("#customSdlcCardsContainer .step-card")].some(c => c.textContent.includes("E2E 시험 유형")),
    editBtn: !!document.querySelector('#customSdlcCardsContainer [data-click="openEditSdlcModal"]'), reqInputs: document.querySelectorAll("#reqPhasesTableBody input[type=text]").length,
    reqDates: document.querySelectorAll("#reqPhasesTableBody input[type=date]").length, saved: !!(ProcessLib.raw && ProcessLib.raw.sdlc.some(t => t.code === "SDLC_E2E")) }));
  const act39 = await page.evaluate(() => { const before = getProjectActiveSdlcCodes().slice(); if (before.length >= 4) toggleSdlcActiveState(before[before.length - 1]);
    toggleSdlcActiveState("SDLC_E2E"); return { active: getProjectActiveSdlcCodes().includes("SDLC_E2E"), copied: !!(projectConfig.customSdlcTypes || []).find(t => t.code === "SDLC_E2E") }; });
  await page.evaluate(() => ProcessLib.openDates("SDLC_E2E")); await page.waitForTimeout(300);
  const dm = await page.evaluate(() => ({ nameDisabled: document.querySelector("#editSdlcPhasesBody input[type=text]").disabled, dateOn: !document.querySelector("#editSdlcPhasesBody input[type=date]").disabled }));
  await page.evaluate(() => { _editingSdlcPhasesTemp[0].pStart = "2027-02-01"; _editingSdlcPhasesTemp[0].pEnd = "2027-02-26"; saveCustomSdlcFromModal(); }); await page.waitForTimeout(300);
  const pd = await page.evaluate(() => { const t = projectConfig.customSdlcTypes.find(x => x.code === "SDLC_E2E"); return [t.phases[0].pStart, t.phases[0].pEnd].join(); });
  check("v3.9: process types managed in System settings (library); project only activates them and sets phase plan dates",
    pl1.sdlc >= 6 && pl1.req >= 4 && libModal === "none" && pl2.card && !pl2.editBtn && pl2.reqInputs === 0 && pl2.reqDates > 0 && pl2.saved && act39.active && act39.copied && dm.nameDisabled && dm.dateOn && pd === "2027-02-01,2027-02-26",
    JSON.stringify({ pl1, libModal, pl2, act39, dm, pd }));
  // [v3.9.0] 스마트병합: 서브시스템별 내려받기에 주간보고 · 회의록 포함
  await page.evaluate(() => { GShell.go("tab-merge"); SmartMergeCenter.refreshMergeUiPermissions(); }); await page.waitForTimeout(500);
  const sm39 = await page.evaluate(() => { document.getElementById("workDataSubsysSelect").value = "W1"; SmartMergeCenter.updateCountBadges();
    const o = ExcelSync._triggerDownload; let got = null; ExcelSync._triggerDownload = (blob, name) => { got = { name, blob }; };
    SubTabs.show("merge", "merge"); MergeTable.selectUnit("sys"); MergeTable.download("JSON"); ExcelSync._triggerDownload = o;
    return got.blob.text().then(t => { const j = JSON.parse(t); return { keys: Object.keys(j).filter(k => /Data$/.test(k)), wr: (j.weeklyReportsData || []).every(r => r.scope === "SYS" && r.scopeValue === "W1"),
      mt: (j.meetingsData || []).every(m => m.system === "W1" || m.system === "ALL"), mtN: (j.meetingsData || []).length, badge: document.getElementById("cntBadge_meetings").textContent,
      collabBoxes: ["weekly", "meetings"].filter(k => document.getElementById("chkCollab_" + k)).length }; }); });
  check("v3.9: Smart merge per-subsystem download includes weekly reports and meeting minutes of that subsystem only",
    ["wbsData", "reqMasterData", "deliverablesData", "vocData", "weeklyReportsData", "meetingsData"].every(k => sm39.keys.includes(k)) && sm39.wr && sm39.mt && sm39.mtN > 0 && sm39.badge === String(sm39.mtN) && sm39.collabBoxes === 0, JSON.stringify(sm39));
  // [v4.1.0] 공통 미리 보기: 범위 밖 행은 제외, [취소]는 아무것도 바꾸지 않음
  const mp41 = await page.evaluate(async () => {
    document.getElementById("workDataSubsysSelect").value = "ALL"; SmartMergeCenter.updateCountBadges(); MergeTable.selectUnit("sys");
    const o = ExcelSync._triggerDownload; let blob = null; ExcelSync._triggerDownload = b => { blob = b; }; MergeTable.download("EXCEL"); ExcelSync._triggerDownload = o;
    const before = wbsData.length;
    await MergeTable.previewFile(new File([blob], "all.xlsx"), { scope: "W1" });
    const row = [...document.querySelectorAll("#mpBody tr")].find(tr => tr.innerText.includes("WBS"));
    const cells = [...row.children].map(td => td.innerText.trim());
    MergeTable.close();
    return { before, after: wbsData.length, file: +cells[2], apply: +cells[3], ign: parseInt(cells[4], 10), w1: wbsData.filter(t => t.system === "W1").length,
      closed: getComputedStyle(document.getElementById("mergePreviewModal")).display, lockPrj: MergeTable.canUpload("users", "W1").ok };
  });
  check("v4.1: upload preview — rows outside the chosen subsystem are listed as excluded, [취소] changes nothing",
    mp41.file === mp41.before && mp41.apply === mp41.w1 && mp41.ign === mp41.file - mp41.w1 && mp41.after === mp41.before && mp41.closed === "none" && mp41.lockPrj, JSON.stringify(mp41));
  // [v4.1.0] 데이터 관리: 다른 프로젝트(지금 프로젝트 아님)를 제조 샘플로 → 전체 초기화 (로컬)
  const da41 = await page.evaluate(async () => {
    GShell.go("tab-config"); SubTabs.show("config", "data"); await new Promise(r => setTimeout(r, 500));
    document.getElementById("cfgClearTarget").value = "P001"; DataAdmin.renderActions();
    const factoryLocked = !document.querySelector('#daActions [data-click-args*="factory"]');
    const name = DataAdmin.target().name;
    DataAdmin.run("sample"); document.getElementById("daConfirmInput").value = name; DataAdmin.closeAsk(true);
    await new Promise(r => setTimeout(r, 800));
    const s1 = LocalBackend._read("P001");
    const a = { wbs: s1.wbsData.length, subs: s1.subsystemsMeta.length, name: s1.projectConfig.projectName };
    DataAdmin.run("project"); document.getElementById("daConfirmInput").value = name; DataAdmin.closeAsk(true);
    await new Promise(r => setTimeout(r, 800));
    const s2 = LocalBackend._read("P001");
    return { name, factoryLocked, a, b: { wbs: s2.wbsData.length, subs: s2.subsystemsMeta.length, name: s2.projectConfig.projectName }, cur: ProjectContext.current, curWbs: wbsData.length,
      snap: BackupHistoryManager.snapshots.filter(x => x.projectId === "P001").length };
  });
  check("v4.1: Data management resets another project (sample restore → full reset) without touching the current one; factory reset only for the current project",
    da41.factoryLocked && da41.a.wbs === 126 && da41.a.subs === 4 && da41.a.name === da41.name && da41.b.wbs === 0 && da41.b.subs === 0 && da41.b.name === da41.name && da41.cur === "DEFAULT" && da41.curWbs > 0 && da41.snap >= 2, JSON.stringify(da41));
  // [v3.9.0] 2027 제조 샘플 엑셀(전체 일괄)을 빈 프로젝트에 올리기
  await page.evaluate(() => ProjectManager.switchTo("P001")); await page.waitForTimeout(1200); await waitApp(page, "P001");
  const xb64 = fs.readFileSync(path.join(ROOT, "Sample", "2027_제조_스마트공장_샘플_4레벨.xlsx")).toString("base64");
  const up39 = await page.evaluate(async (b64) => {
    GShell.go("tab-merge"); SmartMergeCenter.refreshMergeUiPermissions();
    document.getElementById("masterPkgSubsysSelect").value = "ALL";
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await SmartMergeCenter.uploadMasterPackage({ target: { files: [new File([u], "sample.xlsx")], value: "" } }, "EXCEL");
    await new Promise(r => setTimeout(r, 800));
    return { name: projectConfig.projectName, wbs: wbsData.length, l4: wbsData.filter(t => t.level === 4).length, req: reqMasterData.length, voc: vocData.length, deliv: deliverablesData.length,
      mtg: meetingsData.length, wr: weeklyReportsData.length, subs: subsystemsMeta.map(m => m.code + ":" + (m.type === "REQ" ? "REQ" : m.sdlcCode)).join(","),
      sdlc: WBSEngine.getActiveSdlcList().map(s => s.code).join(","), req0: (ReqPhaseManager.getPhases()[0] || {}).name, lead: WbsTemplate.leadOf("QMS") };
  }, xb64);
  check("v3.9: 2027 manufacturing sample Excel (PMO 1 · waterfall 2 · improvement 1, 4-level WBS) uploads into an empty project",
    up39.name.includes("2027") && up39.wbs === 126 && up39.l4 === 72 && up39.req === 19 && up39.voc === 8 && up39.deliv === 17 && up39.mtg === 6 && up39.wr === 10
    && up39.subs === "PMO:SDLC_PMO,MES:SDLC_WATERFALL,QMS:SDLC_WATERFALL,OEE:REQ" && up39.sdlc === "SDLC_PMO,SDLC_WATERFALL" && up39.req0 === "설비통신 인터페이스설계" && up39.lead === "박품질 책임", JSON.stringify(up39));
  // [v3.9.1] 올리기 때 자동 백업 파일을 내려받지 않음 (기본) / 기준정보 > 백업·초기화 엑셀 백업 → 복원
  const dlBefore = page.downloads.length;
  const xr = await page.evaluate(async () => {
    const o = ExcelSync._triggerDownload; let blob = null, name = "";
    ExcelSync._triggerDownload = (b, n) => { blob = b; name = n; };
    ProjectData.exportProject("EXCEL"); ExcelSync._triggerDownload = o;
    const before = { wbs: wbsData.length, wr: weeklyReportsData.length, mtg: meetingsData.length, notice: noticesData.length, subs: subsystemsMeta.length, users: projectUsers.length };
    ProjectData.TASK_KEYS.forEach(k => DataRegistry.set(k, [])); rebuildAll(true);
    await ProjectData.importProject({ target: { files: [new File([blob], name)], value: "" } });
    return { name, before };
  });
  await page.waitForTimeout(400);
  await page.click("#confirmDialogOkBtn"); await page.waitForTimeout(2000);
  const xr2 = await page.evaluate(() => ({ wbs: wbsData.length, wr: weeklyReportsData.length, mtg: meetingsData.length, notice: noticesData.length, subs: subsystemsMeta.length, users: projectUsers.length,
    auto: BackupHistoryManager.autoDownload(), pkgUploadBtn: !!document.querySelector('#tab-merge button[data-click-args*="masterPkgExcelInput"]') }));
  await page.waitForTimeout(300);
  check("v3.9.1: project backup as Excel → restore brings the whole project back; uploads no longer download an automatic backup file by default",
    /프로젝트백업.*\.xlsx$/.test(xr.name) && xr2.wbs === xr.before.wbs && xr2.wr === xr.before.wr && xr2.mtg === xr.before.mtg && xr2.notice === xr.before.notice && xr2.subs === xr.before.subs
    && !xr2.auto && page.downloads.length === dlBefore && !xr2.pkgUploadBtn, JSON.stringify({ xr, xr2, dl: page.downloads.length - dlBefore }));
  // [v4.0.0] 로컬: 종합본 가져오기 — 내 담당 서브시스템은 내 자료 유지
  const cons = await page.evaluate(async () => {
    GShell.go("tab-merge"); await new Promise(r => setTimeout(r, 300));
    const o = ExcelSync._triggerDownload; let got = null; ExcelSync._triggerDownload = (bl, n) => { got = { bl, n }; };
    SmartMergeCenter.downloadMasterPackage("JSON"); ExcelSync._triggerDownload = o;
    const j = JSON.parse(await got.bl.text());
    const sys = (subsystemsMeta[0] || {}).name;
    j.wbsData = j.wbsData.map(t => Object.assign({}, t, { name: t.name + "_종합" }));
    const realUser = AuthManager.currentUser; AuthManager.currentUser = Object.assign({}, realUser, { role: "MEMBER", subsystem: sys });
    try {
      await SmartMergeCenter.importConsolidated({ target: { files: [new File([JSON.stringify(j)], "consolidated.json")], value: "" } });
      await new Promise(r => setTimeout(r, 300)); closeConfirmDialog(true); await new Promise(r => setTimeout(r, 900));
    } finally { AuthManager.currentUser = realUser; }
    return { box: getComputedStyle(document.getElementById("consolidateBox")).display, mine: wbsData.filter(t => t.system === sys).every(t => !t.name.endsWith("_종합")),
      others: wbsData.filter(t => t.system !== sys).length > 0 && wbsData.filter(t => t.system !== sys).every(t => t.name.endsWith("_종합")) };
  });
  check("v4.0 local: consolidated package import keeps my subsystem's own data and takes the rest from the package", cons.box !== "none" && cons.mine && cons.others, JSON.stringify(cons));
  check("No page errors in local mode", page.errors.length === 0, page.errors.join(" | "));
  await page.context().close();
}

function freePort() {
  return new Promise(res => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}

// [Workgroup] 기존 서버 시나리오는 체크아웃 잠금을 끄고(off), 잠금 시나리오는 required 로
function copyApp(dst, lockMode = "off") {
  fs.copyFileSync(path.join(ROOT, "wbs_db_server.py"), path.join(dst, "wbs_db_server.py"));
  for (const dir of ["conf", "server", "webapp"]) fs.cpSync(path.join(ROOT, dir), path.join(dst, dir), { recursive: true, filter: (s) => !s.includes("__pycache__") });
  const ini = path.join(dst, "conf", "app.ini");
  fs.writeFileSync(ini, fs.readFileSync(ini, "utf8").replace(/^lock_mode=.*$/m, "lock_mode=" + lockMode));
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

    // [v3.6.0] 첨부파일 (산출물 📎): 올리기 → 새 버전 → 유형 제한 → 내려받기 → 삭제(휴지통) → 되살리기
    await a.evaluate(() => switchTab("tab-deliverables")); await a.waitForTimeout(500);
    await a.click("#deliverablesTableBody .attach-btn"); await a.waitForTimeout(600);
    const pdf = Buffer.from("%PDF-1.4 e2e attachment");
    await a.setInputFiles("#attachFileInput", { name: "e2e_설계서.pdf", mimeType: "application/pdf", buffer: pdf }); await a.waitForTimeout(1200);
    const at1 = await a.evaluate(() => ({ rows: document.querySelectorAll("#attachListBody tr").length, name: (document.querySelector("#attachListBody .attach-name") || {}).textContent,
      key: /^F[0-9a-f]{18}$/.test(AttachManager.cur.row.fileKey || ""), policy: document.getElementById("attachPolicy").textContent, badge: (document.querySelector("#deliverablesTableBody .attach-btn b") || {}).textContent }));
    check("Attachment: upload from the deliverables screen -> listed, row linked, count badge, policy text (20MB)", at1.rows === 1 && at1.name === "e2e_설계서.pdf" && at1.key && at1.policy.includes("20MB") && at1.badge === "1", JSON.stringify(at1));
    await a.setInputFiles("#attachFileInput", [{ name: "e2e_설계서.pdf", mimeType: "application/pdf", buffer: Buffer.concat([pdf, Buffer.from(" v2")]) }, { name: "run.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") }]);
    await a.waitForTimeout(1500);
    const at2 = await a.evaluate(() => ({ rows: document.querySelectorAll("#attachListBody tr").length, ver: document.querySelector("#attachListBody tr td:nth-child(2)").textContent,
      old: document.getElementById("attachOldBtn").textContent, toast: document.body.innerText.includes("run.exe") }));
    check("Attachment: same name -> new version (older hidden), blocked file type is rejected with a message", at2.rows === 1 && at2.ver === "v2" && at2.old.includes("1") && at2.toast, JSON.stringify(at2));
    const dl = await a.evaluate(async () => { const o = ExcelSync._triggerDownload; let got = null; ExcelSync._triggerDownload = (blob, name) => { got = { name, size: blob.size }; };
      await AttachManager.download(AttachManager.cur.files[0].id); ExcelSync._triggerDownload = o; return got; });
    check("Attachment: download returns the latest version with its original name", dl && dl.name === "e2e_설계서.pdf" && dl.size === pdf.length + 3, JSON.stringify(dl));
    await a.evaluate(() => AttachManager.remove(AttachManager.cur.files[0].id)); await a.waitForTimeout(300);
    await a.evaluate(() => closeConfirmDialog(true)); await a.waitForTimeout(1200);
    const at3 = await a.evaluate(() => ({ ver: document.querySelector("#attachListBody tr td:nth-child(2)").textContent, trash: AttachManager.trashCount }));
    await a.evaluate(() => AttachManager.openTrash()); await a.waitForTimeout(800);
    const at4 = await a.evaluate(() => ({ rows: document.querySelectorAll("#attachListBody tr").length, title: document.getElementById("attachTitle").textContent }));
    await a.evaluate(() => AttachManager.restore(AttachManager.cur.files[0].id)); await a.waitForTimeout(1000);
    const at5 = await a.evaluate(() => AttachManager.trashCount);
    check("Attachment: delete -> trash (previous version shown), manager restores from trash", at3.ver === "v1" && at3.trash === 1 && at4.rows === 1 && at4.title.includes("휴지통") && at5 === 0, JSON.stringify({ at3, at4, at5 }));
    await a.evaluate(() => AttachManager.close());
    // [v3.7.0] 공지 · 회의록 첨부: 한 건에 5개까지
    await a.evaluate(() => { GShell.go("tab-notices"); NoticeCommManager.switchSubTab("NOTICES"); }); await a.waitForTimeout(600);
    await a.click('#noticesListContainer .attach-btn[data-atype="notice"]'); await a.waitForTimeout(600);
    const mk = n => ({ name: `공지첨부${n}.pdf`, mimeType: "application/pdf", buffer: pdf });
    await a.setInputFiles("#attachFileInput", [1, 2, 3, 4, 5].map(mk)); await a.waitForTimeout(2500);
    await a.setInputFiles("#attachFileInput", [mk(6)]); await a.waitForTimeout(800);
    const nt = await a.evaluate(() => ({ rows: document.querySelectorAll("#attachListBody tr").length, policy: document.getElementById("attachPolicy").textContent, title: document.getElementById("attachTarget").textContent,
      badge: (document.querySelector('#noticesListContainer .attach-btn[data-atype="notice"] b') || {}).textContent, toast: document.body.innerText.includes("5개까지 붙일 수 있습니다") }));
    await a.evaluate(() => AttachManager.close());
    await a.evaluate(() => { GShell.go("tab-meeting"); MeetingManager.switchSubTab("minutes"); }); await a.waitForTimeout(700);
    await a.click('#minutesEditorContainer .attach-btn[data-atype="meeting"]'); await a.waitForTimeout(600);
    await a.setInputFiles("#attachFileInput", [{ name: "회의자료.pdf", mimeType: "application/pdf", buffer: pdf }]); await a.waitForTimeout(1500);
    const mt = await a.evaluate(() => ({ rows: document.querySelectorAll("#attachListBody tr").length, title: document.getElementById("attachTarget").textContent, dirty: MeetingManager.isDraftDirty(),
      badge: (document.querySelector('#minutesEditorContainer .attach-btn[data-atype="meeting"] b') || {}).textContent }));
    await a.evaluate(() => AttachManager.close());
    check("Attachment on a notice: up to 5 files per item (6th rejected), count badge on the notice card", nt.rows === 5 && nt.policy.includes("파일 5개까지") && nt.title.includes("[공지]") && nt.badge === "5" && nt.toast, JSON.stringify(nt));
    check("Attachment on meeting minutes: file listed, badge shown, minutes draft not marked as changed", mt.rows === 1 && mt.title.includes("[회의]") && mt.badge === "1" && !mt.dirty, JSON.stringify(mt));

    // [v3.8.0] 시스템 설정 > 백업·복원·초기화: 고른 프로젝트의 Task 정보만 초기화 (서버)
    await a.evaluate(() => { GShell.go("tab-config"); SubTabs.show("config", "data"); }); await a.waitForTimeout(900);
    const tgt = await a.evaluate(() => [...document.querySelectorAll("#cfgClearTarget option")].map(o => o.value));
    await a.selectOption("#cfgClearTarget", "P001"); await a.waitForTimeout(200);
    await a.click('#daActions [data-click="DataAdmin.run"][data-click-args*="tasks"]'); await a.waitForTimeout(300);
    await a.fill("#daConfirmInput", await a.evaluate(() => document.getElementById("daConfirmExpect").textContent));
    await a.click("#daConfirmOk"); await a.waitForTimeout(1500);
    const clr = await a.evaluate(async () => { const p1 = await ServerBackend.request("/api/db/load", { keys: ["wbsData", "subsystemsMeta", "projectConfig"], projectId: "P001" });
      return { p1wbs: (p1.data.wbsData || []).length, p1cfg: !!(p1.data.projectConfig || {}).projectName, cur: ProjectContext.current, curWbs: wbsData.length }; });
    check("v3.8 server: System settings Task reset of a chosen project clears only its tasks (project info kept, current project untouched)",
      tgt.includes("P001") && tgt.includes("__ALL__") && clr.p1wbs === 0 && clr.p1cfg && clr.cur === "DEFAULT" && clr.curWbs > 0, JSON.stringify({ tgt, clr }));

    // [v4.1.0] 데이터 관리 (서버): 다른 프로젝트를 제조 샘플로 → 전체 초기화 — 바꿀 때 파일에 없는 기존 서브시스템도 지움
    const da41s = await a.evaluate(async () => {
      document.getElementById("cfgClearTarget").value = "P001"; DataAdmin.renderActions();
      const name = DataAdmin.target().name;
      const load = async () => { const r = await ServerBackend.request("/api/db/load", { keys: ["wbsData", "subsystemsMeta", "projectConfig"], projectId: "P001" }); return { wbs: (r.data.wbsData || []).length, subs: (r.data.subsystemsMeta || []).length, name: (r.data.projectConfig || {}).projectName }; };
      await DataAdmin._do("sample", DataAdmin.target()); const s1 = await load();
      await DataAdmin._do("project", DataAdmin.target()); const s2 = await load();
      const chat = await ServerBackend.request("/api/chat/clear", { projectId: "P001" });
      return { name, s1, s2, chat: chat.ok, cur: ProjectContext.current };
    });
    check("v4.1 server: Data management sample restore → full reset of another project (old subsystems removed, name kept, chat clear by project)",
      da41s.s1.wbs === 126 && da41s.s1.subs === 4 && da41s.s2.wbs === 0 && da41s.s2.subs === 0 && da41s.s2.name === da41s.name && da41s.chat && da41s.cur === "DEFAULT", JSON.stringify(da41s));

    // [v3.9.2] 시스템 설정 > 프로젝트: 파일로 내려받기 → 새 프로젝트로 추가 (같은 이름이면 새 이름) / 모든 프로젝트 JSON
    await a.evaluate(async () => {
      GShell.go("tab-merge"); SubTabs.show("merge", "backup"); await new Promise(r => setTimeout(r, 800));
      const o = ExcelSync._triggerDownload; const got = []; ExcelSync._triggerDownload = (bl, n) => got.push({ bl, n });
      document.getElementById("ptDownTarget").value = "DEFAULT"; await ProjectTransfer.download("EXCEL");
      document.getElementById("ptDownTarget").value = "__ALL__"; await ProjectTransfer.download("JSON");
      ExcelSync._triggerDownload = o;
      const bundle = JSON.parse(await got[1].bl.text());
      document.getElementById("ptUpTarget").value = "__NEW__";
      window.__ptGot = got; window.__bundle = bundle;
      window.__up = ProjectTransfer.upload({ target: { files: [new File([got[0].bl], got[0].n)], value: "" } });
    });
    await a.waitForTimeout(1200);
    const dupShown = await a.evaluate(() => ({ shown: getComputedStyle(document.getElementById("dupProjectModal")).display === "flex", name: document.getElementById("dupProjectName").textContent, def: document.getElementById("dupNewName").value }));
    await a.fill("#dupNewName", "서버 복사 프로젝트"); await a.click("#dupOkBtn");
    const pt = await a.evaluate(async () => {
      await window.__up; await new Promise(r => setTimeout(r, 800));
      const got = window.__ptGot, bundle = window.__bundle;
      const p = ProjectData.projects().find(x => x.name === "서버 복사 프로젝트");
      const res = p ? await ServerBackend.request("/api/db/load", { keys: ["wbsData", "meetingsData", "weeklyReportsData", "subsystemsMeta", "projectConfig"], projectId: p.id }) : { data: {} };
      const ul = await ServerBackend.request("/api/admin/users/list", {});
      const members = (ul.users || []).filter(u => p && u.projectRoles && u.projectRoles[p.id]).length;
      return { files: got.map(g => g.n), bundleN: (bundle.projects || []).length, bundleSchema: bundle.schemaVersion, pid: p && p.id, wbs: (res.data.wbsData || []).length, cur: wbsData.length,
        mtg: (res.data.meetingsData || []).length, wr: (res.data.weeklyReportsData || []).length, subs: (res.data.subsystemsMeta || []).length, name: (res.data.projectConfig || {}).projectName, members, curPid: ProjectContext.current };
    });
    // 같은 이름 → [그 프로젝트에 덮어쓰기]: 새 프로젝트가 늘지 않음
    const nBefore = await a.evaluate(() => ProjectData.projects().length);
    await a.evaluate(async () => {
      const o = ExcelSync._triggerDownload; let got = null; ExcelSync._triggerDownload = (bl, n) => { got = { bl, n }; };
      document.getElementById("ptDownTarget").value = "P001"; await ProjectTransfer.download("JSON"); ExcelSync._triggerDownload = o;
      document.getElementById("ptUpTarget").value = "__NEW__";
      window.__up2 = ProjectTransfer.upload({ target: { files: [new File([got.bl], got.n)], value: "" } });
    });
    await a.waitForTimeout(1200);
    await a.check('input[name="dupAction"][value="overwrite"]'); await a.click("#dupOkBtn");
    const ow = await a.evaluate(async () => { await window.__up2; await new Promise(r => setTimeout(r, 600)); return { n: ProjectData.projects().length }; });
    check("v4.0 server: same project name on upload → choose new name or overwrite (modal)", dupShown.shown && dupShown.name.length > 0 && dupShown.def.includes("(2)") && ow.n === nBefore, JSON.stringify({ dupShown, ow, nBefore }));
    // 시스템 전체 백업 (시스템관리자): 만들기 → 목록
    const sb40 = await a.evaluate(async () => { document.getElementById("bkWithFiles").checked = false; await SystemBackup.create();
      return { rows: document.querySelectorAll("#bkServerList tr").length, server: getComputedStyle(document.getElementById("bkServerBox")).display, first: (SystemBackup.list[0] || {}).kind, locked: document.querySelectorAll("#mergeBackupPane .bk-locked").length }; });
    check("v4.0 server: admin creates a system backup in Smart merge > Backup · Restore (listed, nothing locked)", sb40.rows >= 1 && sb40.server !== "none" && sb40.first === "manual" && sb40.locked === 0, JSON.stringify(sb40));
    // PM: 같은 화면, 지금 프로젝트만 · 시스템 전체 부분 비활성
    const pmv = await b.evaluate(async () => { GShell.go("tab-merge"); SubTabs.show("merge", "backup"); await new Promise(r => setTimeout(r, 900));
      return { tab: getComputedStyle(document.getElementById("mergeBackupTabBtn")).display, down: [...document.querySelectorAll("#ptDownTarget option")].map(o => o.value), up: [...document.querySelectorAll("#ptUpTarget option")].map(o => o.value),
        noReset: !document.querySelector('#mergeBackupPane [data-click*="reset"], #mergeBackupPane [data-click*="clear"]'), locked: [...document.querySelectorAll("#mergeBackupPane .bk-locked")].length,
        createDisabled: document.querySelector('[data-click="SystemBackup.create"]').disabled, denied: (ProjectData.clearTasks(["DEFAULT"]), getComputedStyle(document.getElementById("confirmDialogModal")).display === "none") }; });
    check("v4.0 server: PM sees Backup · Restore for the current project only; system-wide parts are disabled", pmv.tab !== "none" && pmv.down.join() === "DEFAULT" && pmv.up.join() === "DEFAULT" && pmv.noReset
      && pmv.locked >= 1 && pmv.createDisabled && pmv.denied, JSON.stringify(pmv));
    check("v3.9.2 server: download a project (Excel) / all projects (JSON), and upload a file as a new project (duplicate name renamed)",
      pt.files.length === 2 && pt.bundleN >= 2 && pt.bundleSchema === "IOSTAR_PROJECTS_BUNDLE_v1" && !!pt.pid && pt.wbs === pt.cur && pt.mtg > 0 && pt.subs > 0 && pt.name === "서버 복사 프로젝트" && pt.members > 0 && pt.curPid === "DEFAULT", JSON.stringify(pt));

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


// [Workgroup 0.1] 두 사용자 체크아웃 · 체크인 · 보류 · 3자 비교 · 강제 해제 · 주기 통신 없음
async function lockScenarios() {
  console.log("\n[Workgroup check-out / check-in scenarios]");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axpmys_lock_"));
  copyApp(tmp, "required");
  const port = await freePort();
  const py = process.platform === "win32" ? "python" : "python3";
  const srv = spawn(py, ["wbs_db_server.py", "--port", String(port), "--host", "127.0.0.1", "--silent"], { cwd: tmp, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}/index.html`;
  const PWD = {};
  try {
    await new Promise(r => setTimeout(r, 1500));
    const adm = await newPage();
    await adm.goto(url); await adm.waitForTimeout(1000);
    await login(adm, "admin", PWD);
    await adm.evaluate(async () => {
      for (const emp of ["wg_a", "wg_b"]) await ServerBackend.request("/api/admin/users/save", { isNew: true, empNo: emp, name: emp === "wg_a" ? "가작업" : "나작업", sysAdmin: false, projectRoles: { DEFAULT: { role: "MEMBER", subsystem: "W1" } } });
    });
    const A = await newPage(), B = await newPage();
    for (const [p, emp] of [[A, "wg_a"], [B, "wg_b"]]) { await p.goto(url); await p.waitForTimeout(1000); await login(p, emp, PWD); }
    const showW1 = p => p.evaluate(() => { GShell.go("tab-wbs"); const f = document.getElementById("wbsSubsystemFilter"); f.value = "W1"; f.dispatchEvent(new Event("change", { bubbles: true })); LockManager.render(); });
    await showW1(A); await showW1(B);
    const free = await A.evaluate(() => document.querySelector("#tab-wbs .lk-bar").dataset.state);
    await A.click('#tab-wbs .lk-bar [data-click="LockManager.checkout"]'); await A.waitForTimeout(1200);
    const aState = await A.evaluate(() => ({ st: document.querySelector("#tab-wbs .lk-bar").dataset.state, badge: document.getElementById("lkBadge").textContent }));
    await B.evaluate(() => LockManager.refresh(true)); await B.waitForTimeout(600);
    const bState = await B.evaluate(() => ({ st: document.querySelector("#tab-wbs .lk-bar").dataset.state, ro: document.getElementById("tab-wbs").classList.contains("lk-readonly"), text: document.querySelector("#tab-wbs .lk-bar").textContent }));
    check("Workgroup: A checks out W1 (free → mine, header badge); B sees '편집 중' and the W1 screen is read-only",
      free === "free" && aState.st === "mine" && aState.badge.includes("W1") && bState.st === "other" && bState.ro && bState.text.includes("가작업"), JSON.stringify({ free, aState, bState }));
    // B 가 (모르고) 고친 뒤 저장 → 막힘 → 보류
    const ids = await A.evaluate(() => wbsData.filter(t => t.system === "W1" && t.isLeaf).slice(0, 2).map(t => t.id));
    await B.evaluate(id => { wbsData.find(t => t.id === id).name += "_B"; SyncManager.save(["wbsData"]); }, ids[0]);
    await B.waitForTimeout(1000);
    const askT = await B.$eval("#syncAskTitle", e => e.textContent).catch(() => "");
    await B.click('#syncAskBtns button:nth-child(1)'); await B.waitForTimeout(600);
    const held = await B.evaluate(() => ({ n: LockManager.holdCount(), badge: document.getElementById("lkBadge").textContent }));
    check("Workgroup: B's save is refused while A has W1 checked out (who · since shown) and B keeps the change on hold",
      askT.includes("체크아웃 중") && held.n === 1 && held.badge.includes("보류"), JSON.stringify({ askT, held }));
    // 새로고침해도 보류 유지
    await B.reload(); await B.waitForTimeout(1500); await waitApp(B);
    const kept = await B.evaluate(id => wbsData.find(t => t.id === id).name.endsWith("_B") && LockManager.holdCount() === 1, ids[0]);
    check("Workgroup: held change survives a page reload (shown again, still unsaved)", kept);
    // A: 같은 행 + 다른 행 고치고 체크인 (메모)
    await A.evaluate(ids => { wbsData.find(t => t.id === ids[0]).name += "_A"; wbsData.find(t => t.id === ids[1]).name += "_A2"; persistChanges(); LockManager.checkin(["W1"]); }, ids);
    await A.waitForTimeout(500);
    await A.fill("#lkMemoInput", "설계 일정 조정"); await A.click("#lkMemoOk"); await A.waitForTimeout(1500);
    const aDone = await A.evaluate(() => ({ mine: LockManager.mySystems().length, dirty: SyncManager.dirtyCount(["wbsData"]) }));
    // B: 체크아웃 → 3자 비교 → 내 것 → 저장
    await showW1(B);
    await B.evaluate(() => { window.__co = LockManager.checkout("W1"); }); await B.waitForTimeout(1500);
    const cmp = await B.evaluate(() => ({ shown: getComputedStyle(document.getElementById("lkCompareModal")).display, rows: [...document.querySelectorAll("#lkCmpBody tr")].map(tr => tr.innerText.replace(/\s+/g, " ")) }));
    await B.click('#lkCompareModal [data-click-args=\'["mine"]\'][data-click="LockManager.pickAll"]'); await B.click("#lkCmpOk"); await B.evaluate(() => window.__co); await B.waitForTimeout(500);
    await B.evaluate(() => SyncManager.save(["wbsData"])); await B.waitForTimeout(1200);
    const final = await adm.evaluate(async ids => { const r = await ServerBackend.request("/api/db/load", { keys: ["wbsData"] }); const w = r.data.wbsData;
      return { r0: w.find(t => t.id === ids[0]).name, r1: w.find(t => t.id === ids[1]).name }; }, ids);
    const bAfter = await B.evaluate(() => ({ hold: LockManager.holdCount() }));
    check("Workgroup: after A checks in (memo), B checks out → 3-way compare (conflict row + A-only row) → B's choice saved, A's other change kept",
      aDone.mine === 0 && aDone.dirty === 0 && cmp.shown === "flex" && cmp.rows.some(r => r.includes("둘 다 바뀜")) && cmp.rows.some(r => r.includes("다른 사람만 바뀜"))
      && /_B$/.test(final.r0) && /_A2$/.test(final.r1) && bAfter.hold === 0, JSON.stringify({ aDone, cmp, final, bAfter }));
    // 강제 해제 (관리자) + 기록
    await adm.evaluate(() => { LockManager.openBoard(); }); await adm.waitForTimeout(800);
    await adm.evaluate(() => { LockManager.forceRelease("W1"); }); await adm.waitForTimeout(400);
    await adm.fill("#lkMemoInput", "퇴근 후 남은 잠금"); await adm.click("#lkMemoOk"); await adm.waitForTimeout(1200);
    const board = await adm.evaluate(() => ({ rows: document.querySelectorAll("#lkBoardBody tr").length, log: [...document.querySelectorAll("#lkLogBody tr")].slice(0, 6).map(tr => tr.innerText.replace(/\s+/g, " ")) }));
    check("Workgroup: admin force-releases W1 with a reason; the check-out board lists subsystems and the log shows check-in memo and force release",
      board.rows >= 3 && board.log.some(l => l.includes("강제 해제") && l.includes("퇴근")) && board.log.some(l => l.includes("체크인") && l.includes("설계 일정")), JSON.stringify(board));
    // 주기 통신 없음 + 채팅 잠금
    let calls = 0; const onReq = r => { if (r.url().includes("/api/")) calls++; };
    A.on("request", onReq); await A.waitForTimeout(25000); A.off("request", onReq);
    const chat = await A.evaluate(async () => { GShell.go("tab-notices"); await RealtimeChatManager.init(); return { on: RealtimeChatManager.isConnected, timer: !!RealtimeChatManager.pollTimer, hb: !!ServerHeartbeat.timer, text: (document.getElementById("chatServerStatusText") || {}).textContent || "" }; });
    check("Workgroup: no periodic server calls while idle (25 s); chat is locked like local storage mode; no heartbeat timer",
      calls === 0 && !chat.on && !chat.timer && !chat.hb && chat.text.includes("사용 안 함"), JSON.stringify({ calls, chat }));
    check("Workgroup: no page errors", A.errors.length + B.errors.length + adm.errors.length === 0, A.errors.concat(B.errors, adm.errors).join(" | "));
  } finally {
    try { srv.kill(); } catch (e) {}
    setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true }), 500);
  }
}

(async () => {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    if (!process.argv.includes("--lock")) await localScenarios();
    if (!process.argv.includes("--local") && !process.argv.includes("--lock")) await serverScenarios();
    if (!process.argv.includes("--local")) await lockScenarios();
  } catch (e) {
    check("Test runner error", false, e.message);
  } finally {
    await browser.close();
  }
  const fail = results.filter(r => !r.ok);
  console.log(`\nResult: ${results.length - fail.length} / ${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})();
