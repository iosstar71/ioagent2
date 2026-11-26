// [Project Mgmt] 기준정보: 프로젝트 기본 설정 · ID 규칙
// -------------------------------------------------------------
// 프로젝트 기본 설정 및 대한민국 공휴일 생성기
// -------------------------------------------------------------
let projectConfig = {
  systemTitle: APP_VERSION.title,
  projectName: "기본 프로젝트",
  domains: ["기본분야"],
  channels: [], // 게시판 채널은 프로젝트별 (없으면 전체 + 이 프로젝트의 서브시스템)
  customSdlcTypes: Object.keys(WBSEngine.DEFAULT_SDLC_PRESETS).map(k => JSON.parse(JSON.stringify(WBSEngine.DEFAULT_SDLC_PRESETS[k]))),   // 기본 유형 정의는 WBSEngine 한 곳
  activeSdlcCodes: ["SDLC_PMO", "SDLC_SMART_MFG", "SDLC_WATERFALL", "SDLC_AGILE"],
  activeReqPreset: "",
  // 개선과제형(REQ) 서브시스템 공정 단계 기준정보 (4단계)
  reqSdlcPhases: JSON.parse(JSON.stringify(WBSEngine.DEFAULT_REQ_PRESETS.REQ_MFG_2027.phases)),
  maxDeliverableRounds: 2,
  // 처음 값: 올해 1월 1일 ~ 12월 31일, 기준일 = 오늘 (기준정보에서 바꿈)
  projectStartDate: `${new Date().getFullYear()}-01-01`,
  projectEndDate: `${new Date().getFullYear()}-12-31`,
  weekStartDay: 1, // 월요일 시작
  reportDate: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  roleHomeSettings: {
    SYS_ADMIN: "EXECUTIVE",
    PM: "EXECUTIVE",
    MEMBER: "PORTAL"
  },
  exportSettings: {
    xlsxTheme: "Navy Classic",
    xlsxFontSize: 10,
    docxTheme: "Official Navy",
    docxFontSize: 10,
    docxFont: "맑은 고딕"
  },
  idPrefixConfig: {
    wbsPrefix: "",
    wbsUseSubCode: false,
    reqPrefix: "REQ",
    reqUseSubCode: true,
    crPrefix: "CR",
    crUseSubCode: true,
    vocPrefix: "VOC",
    vocUseSubCode: true,
    actPrefix: "ACT",
    actUseSubCode: true
  },
  holidays: []
};

// 시스템 타이틀: 화면 왼쪽 위 · 브라우저 탭 이름 — 프로젝트와 무관하게 하나 (Admin > 프로젝트 에서 정함)
var SystemTitle = {
  KEY: "IOSTAR_SYSTEM_TITLE",
  get() { try { return String(AppStore.getItem(this.KEY) || "").trim(); } catch (e) { return ""; } },
  text() { return this.get() || APP_VERSION.name; },
  _store(v) { try { if (v) AppStore.setItem(this.KEY, v); else AppStore.removeItem(this.KEY); } catch (e) {} },
  fill() { const el = document.getElementById("cfgSystemTitle"); if (el && document.activeElement !== el) el.value = this.get(); },
  save() {
    const el = document.getElementById("cfgSystemTitle");
    const v = el ? el.value.trim().slice(0, 40) : "";
    this._store(v);
    renderProjectTitles();
    showToast(v ? `🏷️ 시스템 타이틀을 [${v}] 로 바꿨습니다.` : "🏷️ 시스템 타이틀을 기본값으로 되돌렸습니다.");
  },
  reset() { const el = document.getElementById("cfgSystemTitle"); if (el) el.value = ""; this.save(); }
};
window.SystemTitle = SystemTitle;

function renderProjectTitles() {
  // 저장된 시스템 명칭의 버전 표기는 현재 프로그램 버전으로 표시
  // 시스템 명칭 변경(Project Mgmt): 이전 명칭으로 저장된 시스템 타이틀은 새 명칭으로 교체
  if (/AX[ _]Project[ _]Management|AX_PMYS/i.test(projectConfig.systemTitle || "")) projectConfig.systemTitle = APP_VERSION.title;
  const sysTitle = APP_VERSION.title;  // 시스템 이름은 고정: Project Mgmt (협업)
  const projName = projectConfig.projectName || "프로젝트";

  const hSys = document.getElementById("headerSystemTitleText");
  const hProj = document.getElementById("headerProjectNameBadge");
  const bTitle = document.getElementById("pageBrowserTitle");
  // Standard·Neo: 머리글 제목은 제품 이름만 (버전은 옆 배지에 표시)
  if (hSys) hSys.textContent = SystemTitle.text();
  const hVer = document.getElementById("headerVersionBadge");
  if (hVer) hVer.textContent = (APP_VERSION.variant ? APP_VERSION.variant + " " : "") + "v" + APP_VERSION.version;
  // 버전은 머리말에서 빼고 사용자 메뉴에 표시
  const uVer = document.getElementById("gUserVer");
  if (uVer) uVer.textContent = `${APP_VERSION.brand || "IOSTAR-PM"} ${APP_VERSION.editionName || APP_VERSION.variant || ""} v${APP_VERSION.version}`;
  if (hProj) hProj.textContent = projName;
  if (bTitle) bTitle.textContent = `${SystemTitle.get() || sysTitle} (${projName})`;

  SystemTitle.fill();
  const inProj = document.getElementById("cfgProjectName");
  if (inProj) inProj.value = projName;

  // SDLC는 1-2-B 커스텀 SDLC 카드로 관리됨

  const maxR = Math.min(4, Math.max(1, parseInt(projectConfig.maxDeliverableRounds || 2, 10)));
  const maxRSel = document.getElementById("cfgMaxDeliverableRounds");
  if (maxRSel) maxRSel.value = String(maxR);
}

function updateMaxDeliverableRounds(newMax) {
  const maxR = Math.min(4, Math.max(1, parseInt(newMax, 10) || 2));
  projectConfig.maxDeliverableRounds = maxR;
  if (Array.isArray(standardDeliverablesMeta)) {
    standardDeliverablesMeta.forEach(item => {
      for (let r = maxR + 1; r <= 4; r++) {
        item[`round${r}`] = false;
      }
    });
  }
  updateDeliverableRoundDropdowns();
  renderStandardDeliverablesMetaTable();
  renderDeliverablesTable();
  rebuildAll();
  showToast(`[산출물 제출 차수 설정] 1차 ~ ${maxR}차 운영으로 동기화되었습니다. (초과 차수 비선택 초기화 완료)`);
}

function updateProjectTitles() {
  const inProj = document.getElementById("cfgProjectName");
  if (inProj && inProj.value.trim()) projectConfig.projectName = inProj.value.trim();
  renderProjectTitles();
  persistChanges();
  showToast(`시스템 타이틀 및 프로젝트명([${projectConfig.projectName}])이 반영되었습니다.`);
}

// ID 규칙 (WBS · REQ · 추가 요구사항 · VOC · Action Item) — 종류마다 접두사 + 서브시스템 코드 결합 여부, 한 표로
//  projectConfig.idPrefixConfig 의 <k>Prefix · <k>UseSubCode 에 저장 (WBS ID 는 wbs-engine.js 가 같은 값을 읽음)
var IdRules = {
  KINDS: [
    { k: "wbs", label: "WBS ID 접두사", def: "", sub: false, ph: "접두사 없음" },
    { k: "req", label: "REQ ID 접두사", def: "REQ", sub: true },
    { k: "cr", label: "추가 요구사항 ID 접두사", def: "CR", sub: true, hint: "VOC 에서 등록한 추가 요구사항" },
    { k: "voc", label: "VOC ID 접두사", def: "VOC", sub: true },
    { k: "act", label: "Action Item 접두사", def: "ACT", sub: true }
  ],
  _c() { if (!projectConfig.idPrefixConfig) projectConfig.idPrefixConfig = {}; return projectConfig.idPrefixConfig; },
  conf(k) {
    const c = this._c(), d = this.KINDS.find(x => x.k === k);
    const sub = c[k + "UseSubCode"];
    return { prefix: String(c[k + "Prefix"] || d.def).trim(), sub: sub === undefined ? d.sub : !!sub };
  },
  base(k, sCode) {
    const { prefix, sub } = this.conf(k);
    const parts = [prefix.replace(/-+$/, "")];
    if (sub && sCode && sCode !== "ALL") parts.push(String(sCode).replace(/-+$/, ""));
    return parts.filter(Boolean).join("-");
  },
  // 다음 번호 = 같은 앞부분 ID 중 가장 큰 번호 + 1 (지운 번호를 다시 쓰지 않음)
  next(k, sCode, ids) {
    const b = this.base(k, sCode), pre = b + "-";
    const max = (ids || []).reduce((m, id) => {
      const s = String(id || "");
      if (!s.startsWith(pre)) return m;
      const n = parseInt(s.slice(pre.length), 10);
      return isNaN(n) || String(n) !== s.slice(pre.length).replace(/^0+(?=\d)/, "") ? m : Math.max(m, n);
    }, 0);
    return `${pre}${String(max + 1).padStart(2, "0")}`;
  },
  sample(k) { return k === "wbs" ? (this.base(k, this._sampleCode()) ? this.base(k, this._sampleCode()) + "-" : "") + "1.1.1" : this.base(k, this._sampleCode()) + "-01"; },
  _sampleCode() { return (subsystemsMeta[1] && subsystemsMeta[1].code) || (subsystemsMeta[0] && subsystemsMeta[0].code) || "EQP"; },
  render() {
    const box = document.getElementById("idRuleGrid");
    if (!box) return;
    box.innerHTML = this.KINDS.map((d, i) => {
      const c = this.conf(d.k);
      return `<div class="rule-id-box">
        <strong class="rule-id-name">${i + 1}. ${d.label}</strong>${d.hint ? `<span class="lk-hint">${d.hint}</span>` : ""}
        <input type="text" id="cfgIdPrefix_${d.k}" value="${escapeAttr(c.prefix)}" placeholder="${escapeAttr(d.ph || d.def)}" data-change="updateIdPrefixConfig">
        <label class="rule-id-check"><input type="checkbox" id="cfgIdSub_${d.k}"${c.sub ? " checked" : ""} data-change="updateIdPrefixConfig"> 서브시스템 코드 결합</label>
        <code class="rule-id-sample">${escapeHtml(this.sample(d.k))}</code>
      </div>`;
    }).join("");
    if (typeof I18N !== "undefined") I18N.translateTree(box);
  },
  read() {
    const c = this._c();
    this.KINDS.forEach(d => {
      const el = document.getElementById("cfgIdPrefix_" + d.k), ck = document.getElementById("cfgIdSub_" + d.k);
      if (el) c[d.k + "Prefix"] = el.value.trim() || d.def;
      if (ck) c[d.k + "UseSubCode"] = ck.checked;
    });
  },
  // 전체 다시 매기기 — 서브시스템별 1번부터. 참조(WBS reqId · VOC reqLink · 요구사항 srcVoc)도 함께 바꿈
  renumberAll() {
    const code = sys => WBSEngine.getSubsystemCode(sys);
    const run = (k, list, sysOf) => {
      const cnt = {}, map = {};
      list.forEach(r => {
        const b = this.base(k, code(sysOf(r)));
        cnt[b] = (cnt[b] || 0) + 1;
        const id = `${b}-${String(cnt[b]).padStart(2, "0")}`;
        if (r.id) map[r.id] = id;
        r.id = id;
      });
      return map;
    };
    const reqMap = Object.assign(run("req", reqMasterData.filter(r => r.origin !== "추가"), r => r.system),
      run("cr", reqMasterData.filter(r => r.origin === "추가"), r => r.system));
    const vocMap = run("voc", vocData, v => v.system);
    wbsData.forEach(t => { if (t.reqId && reqMap[t.reqId]) t.reqId = reqMap[t.reqId]; });
    vocData.forEach(v => { if (v.reqLink && reqMap[v.reqLink]) v.reqLink = reqMap[v.reqLink]; });
    reqMasterData.forEach(r => { if (r.srcVoc && vocMap[r.srcVoc]) r.srcVoc = vocMap[r.srcVoc]; });
    if (typeof meetingsData !== "undefined" && Array.isArray(meetingsData)) {
      const cnt = {};
      meetingsData.forEach(m => (m.actionItems || []).forEach(a => {
        const b = this.base("act", WBSEngine.getSubsystemCode(m.system) || "COM");
        cnt[b] = (cnt[b] || 0) + 1;
        a.id = `${b}-${String(cnt[b]).padStart(2, "0")}`;
      }));
      if (typeof MeetingManager !== "undefined") MeetingManager.render();
    }
  }
};

function renderIdPrefixSettings() { IdRules.render(); }

function applyIdPrefixSettings(reNumberAll = false) {
  IdRules.read();
  if (reNumberAll) IdRules.renumberAll();
  IdRules.render();
  rebuildAll();
  showToast(reNumberAll ? "WBS · 요구사항 · 추가 요구사항 · VOC · Action Item 전체 ID에 접두사 및 서브시스템 코드 규칙이 일괄 적용되었습니다."
    : "ID 규칙이 변경되었습니다. (새로 만드는 것부터 적용)");
}

function updateIdPrefixConfig() {
  applyIdPrefixSettings(false);
}

// 새 ID: "REQ" · "CR"(추가 요구사항) · "VOC" · "ACT"
function buildNextEntityId(entityType, sysName) {
  const k = String(entityType || "").toLowerCase();
  if (k === "act") {
    const all = typeof MeetingManager !== "undefined" ? MeetingManager.getAllActionItems() : [];
    return IdRules.next("act", WBSEngine.getSubsystemCode(sysName), all.map(a => a.id));
  }
  const list = k === "voc" ? vocData : reqMasterData;
  return IdRules.next(k === "cr" || k === "req" ? k : "voc", WBSEngine.getSubsystemCode(sysName), list.map(r => r.id));
}
