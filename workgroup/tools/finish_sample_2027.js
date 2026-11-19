// =============================================================================
// [IOSTAR-PM v3.9.0] 2027 제조 샘플 마무리 (개발 도구 — Node.js + Playwright 필요)
//   1) tools/build_sample_2027.py 가 만든 JSON 을 화면에 넣고 공휴일 · 계획 진척률 · 상위 Task 집계를 계산
//   2) 서브시스템별 · 통합 주간보고를 2주 치 작성 완료
//   3) Sample/2027_제조_스마트공장_샘플_4레벨.xlsx (스마트병합 전체 일괄 양식) 와
//      webapp/static/js/core/sample-snapshot.js ([제조 샘플 복원] 자료) 를 만듦
//   사용: python tools/build_sample_2027.py sample.json && node tools/finish_sample_2027.js sample.json
//         python tools/build_sample_erp.py erp.json && node tools/finish_sample_2027.js erp.json   (ERP 샘플 — 엑셀만)
//   샘플 JSON 의 _meta: xlsx(파일 이름) · snapshot(제조 샘플 복원 자료로도 쓸지) · sdlc · req · leads · notes · allNotes
// =============================================================================
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

(async () => {
  const sample = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto("file://" + path.join(ROOT, "webapp", "index.html"));
  await p.waitForTimeout(1500);
  await p.fill("#inputSecurityEmpNo", "admin"); await p.fill("#inputSecurityPassword", "1234"); await p.click("#btnLockSubmit"); await p.waitForTimeout(1200);
  await p.fill("#pcNewPwd", "Sample2027x"); await p.fill("#pcNewPwd2", "Sample2027x");
  await p.click('#pwdChangeFormPane [data-click="AuthManager.changePasswordFromLogin"]'); await p.waitForTimeout(2500);

  await p.evaluate(s => {
    const base = DataRegistry.clone(projectConfig);
    const cfg = Object.assign({}, base, s.projectConfig);
    delete cfg.uiTheme;
    cfg.systemTitle = APP_VERSION.title;
    cfg.customSdlcTypes = s._meta.sdlc.map(c => ProcessLib._stripDates(ProcessLib.findSdlc(c)));
    cfg.customReqPresets = {};
    cfg.holidays = getKoreanNationalHolidays(2027, 2027).filter(h => h.date >= "2027-01-01" && h.date <= "2027-12-31");
    projectConfig = cfg;
    ProcessLib.applyReqToProject(s._meta.req || "REQ_STANDARD");
    subsystemsMeta = s.subsystemsMeta;
    standardDeliverablesMeta = s.standardDeliverablesMeta;
    ["wbsData", "reqMasterData", "vocData", "deliverablesData", "meetingsData", "noticesData", "communicationsData"].forEach(k => DataRegistry.set(k, s[k]));
    weeklyReportsData = [];
    const users = DataRegistry.get("projectUsers").filter(u => ProjectContext.isAdminUser(u));
    s.projectUsers.forEach(u => { if (!users.some(x => x.empNo === u.empNo)) users.push(Object.assign({}, u, u.role === "SYS_ADMIN" ? {} : { projectRoles: { [ProjectContext.current]: { role: u.role, subsystem: u.subsystem, dept: u.dept } } })); });
    DataRegistry.set("projectUsers", users);
    StorageManager._afterBulkReplace("sample");
  }, sample);
  await p.waitForTimeout(1500);
  await p.evaluate(() => rebuildAll(true)); await p.waitForTimeout(800);

  // 주간보고: 기준일 주와 그 전 주, 서브시스템별 + 통합
  const NOTES = { notes: sample._meta.notes, leads: sample._meta.leads, all: sample._meta.allNotes };
  const done = await p.evaluate(async (NOTES) => {
    GShell.go("tab-weekly-report");
    await new Promise(r => setTimeout(r, 400));
    const W = WeeklyReportManager;
    // 화면 입력 칸에 넣어야 [작성 완료] 때 그대로 저장됨
    const setText = (a, b, c, who) => [["wrCurrentSummary", a], ["wrNextSummary", b], ["wrIssuesNotes", c], ["wrAuthorInput", who]]
      .forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
    const cur = W.findWeekForDate(projectConfig.reportDate).weekNum;
    let n = 0;
    for (const wk of [cur - 1, cur]) {
      for (const sys of Object.keys(NOTES.notes)) {
        W.openUnit(wk, "SYS", sys); await new Promise(r => setTimeout(r, 150));
        const t = NOTES.notes[sys];
        setText(t[0], t[1], t[2], NOTES.leads[sys]);
        await W.completeReport(false); n++;
      }
      W.openUnit(wk, "ALL", ""); await new Promise(r => setTimeout(r, 200));
      setText(NOTES.all[0], NOTES.all[1], NOTES.all[2], NOTES.leads.PMO);
      await W.completeReport(false); n++;
    }
    return n;
  }, NOTES);
  await p.evaluate(() => SyncManager.save(null, { notify: false })); await p.waitForTimeout(800);

  // 엑셀(스마트병합 전체 일괄) + 샘플 스냅샷
  const xlsx = await p.evaluate(async () => {
    GShell.go("tab-merge"); await new Promise(r => setTimeout(r, 300));
    const sel = document.getElementById("masterPkgSubsysSelect"); if (sel) sel.value = "ALL";
    const o = ExcelSync._triggerDownload; let blob = null;
    ExcelSync._triggerDownload = bl => { blob = bl; };
    SmartMergeCenter.downloadMasterPackage("EXCEL");
    ExcelSync._triggerDownload = o;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const xlsxPath = path.join(ROOT, "Sample", sample._meta.xlsx);
  fs.writeFileSync(xlsxPath, Buffer.from(xlsx, "base64"));
  const snap = await p.evaluate(() => {
    const all = DataRegistry.collect();
    const out = {};
    ["projectConfig", "subsystemsMeta", "standardDeliverablesMeta", "projectUsers", "wbsData", "deliverablesData", "reqMasterData", "vocData",
      "noticesData", "communicationsData", "meetingsData", "weeklyReportsData"].forEach(k => { out[k] = all[k]; });
    out.projectUsers = out.projectUsers.filter(u => !ProjectContext.isAdminUser(u)).map(u => {
      const a = (u.projectRoles || {})[ProjectContext.current] || {};
      return { empNo: u.empNo, name: u.name, role: a.role || u.role, subsystem: a.subsystem || u.subsystem, dept: a.dept || u.dept, pwdHash: "", lang: "ko" };
    });
    delete out.projectConfig.uiTheme;
    return out;
  });
  const js = "// [IOSTAR-PM v3.9.0] 2027 제조 분야 샘플 (PMO 1 · 폭포수 표준형 2 · 개선과제형 1, 레벨 4 WBS) — [제조 샘플 복원] 자료\n" +
    "//  자동 생성: python tools/build_sample_2027.py → node tools/finish_sample_2027.js (직접 수정 금지)\n" +
    "//  같은 내용의 엑셀: Sample/2027_제조_스마트공장_샘플_4레벨.xlsx (스마트병합 [④ 전체 일괄] 올리기로 반영)\n" +
    "var WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT = " + JSON.stringify(snap) + ";\n";
  if (sample._meta.snapshot) fs.writeFileSync(path.join(ROOT, "webapp", "static", "js", "core", "sample-snapshot.js"), js);
  const counts = await p.evaluate(() => ({ wbs: wbsData.length, req: reqMasterData.length, voc: vocData.length, deliv: deliverablesData.length, mtg: meetingsData.length, wr: weeklyReportsData.length, notice: noticesData.length, comm: communicationsData.length }));
  console.log("[OK]", xlsxPath, Math.round(fs.statSync(xlsxPath).size / 1024) + "KB", JSON.stringify(counts), "weekly completed:", done, "errors:", errs);
  await b.close();
})();
