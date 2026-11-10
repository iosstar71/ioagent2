// =============================================================================
// [IOSTAR-PM Standard v1.0.1] 브라우저 E2E 자동 테스트 (Playwright)
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
async function login(page, emp, store = LOCAL_PWD) {
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
  await page.evaluate(() => { const i = projectUsers.findIndex(u => u.empNo === "lead_lee"); ProjectManager.setUserAssignment(i, "role", "PM"); });
  await page.waitForTimeout(800);
  await page.evaluate(() => ProjectManager.switchTo("DEFAULT")); await page.waitForTimeout(800); await waitApp(page, "DEFAULT");
  const back = await page.evaluate(() => ({ pid: ProjectContext.current, wbs: wbsData.length, role: ProjectContext.effective(AuthManager.findUser("lead_lee"), "P001").role, baseRole: AuthManager.normalizeRole(AuthManager.findUser("lead_lee").role) }));
  check("Local: back to default project keeps data; per-project role (P001=PM, base=MEMBER)", back.pid === "DEFAULT" && back.wbs === defaultWbs && back.role === "PM" && back.baseRole === "MEMBER", JSON.stringify(back));

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
  // [v2.3.0] 화면 방식: 기본은 Standard (Neo 요소 숨김), 사용자 메뉴에서 Neo 로 바꾸면 다시 불러온 뒤 Neo 기능 동작
  const stdMode = await page.evaluate(() => ({ def: APP_CONFIG.defaultUi, mode: UiMode.current, cls: document.body.classList.contains("ui-neo"), todo: getComputedStyle(document.getElementById("neoTodoCard")).display, ph: !!document.querySelector(".neo-ph"),
    sel: getComputedStyle(document.getElementById("wbsStatusFilter")).display, theme: document.body.dataset.theme, font: document.fonts.check("13px Pretendard") }));
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => [...document.fonts].some(f => f.family.replace(/"/g, "") === "Pretendard" && f.status === "loaded"));
  check("Unified: default UI mode is Standard (Neo parts hidden), Pretendard font loaded", stdMode.mode === stdMode.def && !stdMode.cls && stdMode.todo === "none" && !stdMode.ph && stdMode.sel !== "none" && fontOk, JSON.stringify({ stdMode, fontOk }));
  // Standard 방식에서도 WBS 템플릿: 등록된 서브시스템만 · 기존 WBS 가 있으면 추가/교체 선택
  await page.evaluate(() => GShell.go("tab-wbs")); await page.waitForTimeout(300);
  await page.click('#tab-wbs [data-click="WbsTemplate.open"]'); await page.waitForTimeout(300);
  await page.selectOption("#tplSystemSelect", "W2"); await page.waitForTimeout(200);
  const stdTpl = await page.evaluate(() => ({ same: JSON.stringify([...document.querySelectorAll("#tplSystemSelect option")].map(o => o.value)) === JSON.stringify(subsystemsMeta.map(m => m.name || m.code)),
    free: !!document.getElementById("newSubSystemName"), modes: [...document.querySelectorAll('#tplExisting input[name="tplMode"]')].map(r => r.value).join(","), shown: !document.getElementById("tplExisting").hidden }));
  await page.evaluate(() => WbsTemplate.close());
  check("Standard mode: WBS template offers registered subsystems only and append/replace when WBS exists", stdTpl.same && !stdTpl.free && stdTpl.shown && stdTpl.modes === "append,replace", JSON.stringify(stdTpl));
  await page.selectOption("#gUiModeSelect", "neo").catch(async () => { await page.evaluate(() => UiMode.set("neo")); });
  await page.waitForTimeout(1500); await waitApp(page);
  const neoMode = await page.evaluate(() => ({ mode: UiMode.current, cls: document.body.classList.contains("ui-neo"), saved: AuthManager.findUser("admin").uiMode, ph: document.querySelectorAll(".neo-ph").length, todo: document.querySelectorAll("#neoTodoCard .neo-todo-col").length }));
  check("Unified: switching to Neo reloads with Neo screens and saves the choice on the user", neoMode.mode === "neo" && neoMode.cls && neoMode.saved === "neo" && neoMode.ph >= 10 && neoMode.todo === 5, JSON.stringify(neoMode));
  if (await page.evaluate(() => typeof NeoTodo !== "undefined" && UiMode.isNeo())) {
    await page.evaluate(() => { changeTheme("navy"); LayoutManager.setLayout("top-nav", false); GShell.go("tab-dashboard"); }); await page.waitForTimeout(500);
    const before = await page.evaluate(() => ({ cols: document.querySelectorAll("#neoTodoCard .neo-todo-col").length, delayed: NeoTodo.collect(null).delayed.length }));
    // 진행 중 최하위 과업 하나를 지연으로 만들기 (실적 = 계획 - 20)
    const target = await page.evaluate(() => { const t = wbsData.find(x => x.isLeaf && x.pProg >= 30 && x.aProg < 100 && NeoUtil.status(x).code !== "delayed"); const o = t.aProg; t.aProg = t.pProg - 20; rebuildAll(); return { id: t.id, orig: o }; });
    await page.waitForTimeout(700);
    await page.evaluate(() => GShell.go("tab-dashboard")); await page.waitForTimeout(500);
    const after = await page.evaluate(id => ({ delayed: NeoTodo.collect(null).delayed.length, listed: !!Array.prototype.find.call(document.querySelectorAll("#neoTodoCard .neo-todo-delay .neo-todo-item"), b => b.textContent.indexOf(id) !== -1),
      badge: (document.querySelector('.g-nav-top [data-tab="tab-wbs"] .neo-badge') || document.querySelector('.g-group[data-group="sc"] .g-group-count:not([hidden])') || {}).textContent || "" }), target.id);
    check("Neo: dashboard to-do lists the new delayed task + menu badge", before.cols === 5 && after.delayed === before.delayed + 1 && after.listed && Number(after.badge) >= 1, JSON.stringify({ before, after }));
    const item = await page.$(`#neoTodoCard .neo-todo-delay .neo-todo-item`);
    await item.click(); await page.waitForTimeout(900);
    const det = await page.evaluate(() => ({ tab: document.querySelector(".tab-pane.active").id, open: NeoDetail.isOpen(), id: NeoDetail._id, sel: !!document.querySelector("#wbsTableBody tr.neo-sel") }));
    check("Neo: to-do item opens WBS with the right-side detail panel (row highlighted)", det.tab === "tab-wbs" && det.open && det.sel && !!det.id, JSON.stringify(det));
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
  // 다른 사용자는 각자 화면 방식 (admin = Neo, lead_lee = 기본 Standard) → 마지막에 admin 을 Standard 로 되돌림
  await page.evaluate(() => UiMode.set("standard")); await page.waitForTimeout(1500); await waitApp(page);
  const backStd = await page.evaluate(() => ({ mode: UiMode.current, saved: AuthManager.findUser("admin").uiMode, ph: !!document.querySelector(".neo-ph") }));
  check("Unified: switching back to Standard restores the standard screens", backStd.mode === "standard" && backStd.saved === "standard" && !backStd.ph, JSON.stringify(backStd));

  // 8) 일반 사용자 권한: 다른 서브시스템 변경은 저장 시 원복
  await page.evaluate(() => AuthManager.manualLock()); await page.waitForTimeout(300);
  await login(page, "lead_lee"); await page.waitForTimeout(800);
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
