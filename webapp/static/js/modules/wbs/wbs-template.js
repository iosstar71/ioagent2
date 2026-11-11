// [IOSTAR-PM] 간트 · 공휴일 표 · WBS 템플릿
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
function renderGantt() {
  if (typeof GanttRenderer !== "undefined") {
    GanttRenderer.render(wbsData, projectConfig.holidays);
  }
}

function renderHolidays() {
  const tbody = document.querySelector("#holidayTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const filter = document.getElementById("holidayTypeFilter") ? document.getElementById("holidayTypeFilter").value : "ALL";

  projectConfig.holidays.forEach((h, i) => {
    if (filter === "CUSTOM" && h.type !== "CUSTOM") return;
    if (filter === "NATIONAL" && h.type !== "NATIONAL") return;

    const dayName = WBSEngine.getDayOfWeekText(h.date);
    const typeBadge = h.type === "CUSTOM"
      ? `<span class="status-tag tag-progress" style="font-size:calc(9px * var(--fs-scale, 1));">사용자휴일</span>`
      : `<span class="status-tag tag-completed" style="font-size:calc(9px * var(--fs-scale, 1));">법정공휴일</span>`;

    tbody.innerHTML += `
      <tr>
        <td>${typeBadge}</td>
        <td><input type="text" value="${escapeHtml(h.name)}" data-change="UiH.set" data-change-args="${UiEvents.args("projectConfig.holidays", i, "name", "$value", "persistChanges")}"></td>
        <td>
          <div class="date-input-wrap">
            <input type="date" value="${h.date}" data-change="UiH.set" data-change-args="${UiEvents.args("projectConfig.holidays", i, "date", "$value", "renderHolidays", "rebuildAll")}">
            <span class="day-of-week-tag ${dayName === "토" ? "day-sat" : (dayName === "일" ? "day-sun" : "")}">(${dayName})</span>
          </div>
        </td>
        <td><button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("projectConfig.holidays", i, "renderHolidays", "rebuildAll")}">×</button></td>
      </tr>
    `;
  });
}

function addCustomHolidayRow() {
  projectConfig.holidays.push({ type: "CUSTOM", name: "사용자 특별휴일", date: projectConfig.reportDate });
  renderHolidays();
  rebuildAll();
}

function saveConfig() {
  projectConfig.weekStartDay = parseInt(document.getElementById("cfgWeekStartDay").value, 10);
  rebuildAll();
}

// =============================================================================
// [Neo 2.2] 서브시스템별 WBS 템플릿 추가
//  - 기준정보에 등록된 서브시스템만 선택 (이전: 이름을 직접 입력하면 서브시스템이 자동 등록됨)
//  - 템플릿은 서브시스템 유형에 맞게 자동 선택 (SDLC → 지정한 SDLC 단계 / REQ → 개선과제 단계), 다른 템플릿도 선택 가능
//  - 단계별 계획 기간은 프로젝트 기간을 가중치 비율로 나눠 자동 지정 (이전: 2026년 고정 날짜)
//  - 이미 WBS 가 있으면 추가(Append: 기존 L1 아래에 덧붙임) 또는 교체(Replace: 기존 과업 삭제 후 새로 생성) 선택
// =============================================================================
var WbsTemplate = {
  metas() { return (subsystemsMeta || []).filter(m => m && (m.name || m.code)); },
  sysKey(m) { return String(m.name || m.code).trim(); },
  existing(sys) { return wbsData.filter(t => String(t.system || "").trim() === sys); },
  _val(id) { const el = document.getElementById(id); return el ? el.value : ""; },
  mode() { const r = document.querySelector('input[name="tplMode"]:checked'); return r ? r.value : "append"; },

  open(preset) {
    const sel = document.getElementById("tplSystemSelect");
    const list = this.metas();
    const cur = preset || this._val("wbsSubsystemFilter");
    sel.innerHTML = list.map(m => {
      const k = this.sysKey(m);
      const n = this.existing(k).length;
      return `<option value="${escapeAttr(k)}" ${k === cur ? "selected" : ""}>${escapeHtml(k)}${m.domain ? ` · ${escapeHtml(m.domain)}` : ""} (${m.type === "REQ" ? "개선 REQ" : "SDLC"})${n ? ` — 기존 과업 ${n}개` : " — 과업 없음"}</option>`;
    }).join("");
    document.getElementById("tplNoSystem").hidden = list.length > 0;
    sel.disabled = !list.length;
    const radio = document.querySelector('input[name="tplMode"][value="append"]');
    if (radio) radio.checked = true;
    this.render();
    const m = document.getElementById("templateModal");
    m.style.display = "flex";
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(m);
    if (typeof I18N !== "undefined") I18N.translateTree(m);
  },
  close() { document.getElementById("templateModal").style.display = "none"; },
  goMaster() { this.close(); if (typeof GShell !== "undefined") GShell.go("tab-master"); else switchTab("tab-master"); },

  // 서브시스템을 바꾸면 템플릿 선택지와 기존 과업 안내를 다시 표시
  render() {
    const sys = this._val("tplSystemSelect");
    const meta = this.metas().find(m => this.sysKey(m) === sys);
    const tsel = document.getElementById("tplTypeSelect");
    const opts = WBSEngine.getActiveSdlcList().map(sp => [`SDLC:${sp.code}`, `SDLC · ${sp.name}`]);
    if (meta && meta.type !== "REQ" && meta.sdlcCode && !opts.some(o => o[0] === `SDLC:${meta.sdlcCode}`)) {
      const sp = WBSEngine.getSdlcSpecByCode(meta.sdlcCode);
      opts.unshift([`SDLC:${sp.code}`, `SDLC · ${sp.name}`]);
    }
    opts.push(["REQ", "개선(REQ) 단계 · 기준정보의 개선과제 공정 단계"]);
    const def = !meta ? "" : meta.type === "REQ" ? "REQ" : `SDLC:${meta.sdlcCode || (opts[0] && opts[0][0].slice(5))}`;
    // [v3.7.0] 다른 서브시스템의 WBS 복사 (WBS 가 있는 서브시스템만)
    const copies = this.metas().map(m => this.sysKey(m)).filter(k => k !== sys && this.existing(k).length)
      .map(k => [`COPY:${k}`, `${k} 의 WBS 복사 (과업 ${this.existing(k).length}개)`]);
    const optHtml = list => list.map(([v, l]) => `<option value="${escapeAttr(v)}" ${v === def ? "selected" : ""}>${escapeHtml(l)}${v === def ? " (서브시스템 설정)" : ""}</option>`).join("");
    tsel.innerHTML = `<optgroup label="표준 단계 템플릿 (기준정보)">${optHtml(opts)}</optgroup>` + (copies.length ? `<optgroup label="다른 서브시스템 WBS 복사">${optHtml(copies)}</optgroup>` : "");
    tsel.disabled = !meta;
    const n = sys ? this.existing(sys).length : 0;
    document.getElementById("tplExisting").hidden = !n;
    document.getElementById("tplExistingCount").textContent = n;
    this.renderPreview();
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("templateModal"));
  },

  phases(type) {
    if (type === "REQ") {
      const ph = typeof ReqPhaseManager !== "undefined" ? ReqPhaseManager.getPhases() : [];
      return { label: "개선(REQ)", phases: ph };
    }
    const sp = WBSEngine.getSdlcSpecByCode(String(type || "").replace(/^SDLC:/, ""));
    return { label: sp.name, phases: sp.phases || [] };
  },

  // 프로젝트 기간을 단계 가중치 비율로 나눈 계획 기간
  schedule(phases) {
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const s = new Date((projectConfig.projectStartDate || projectConfig.reportDate || iso(new Date())) + "T00:00:00");
    let e = new Date((projectConfig.projectEndDate || "") + "T00:00:00");
    if (isNaN(e) || e < s) { e = new Date(s); e.setMonth(e.getMonth() + 6); }
    const days = Math.max(phases.length, Math.round((e - s) / 86400000) + 1);
    const total = phases.reduce((a, p) => a + (parseFloat(p.weight) || 1), 0) || 1;
    let cur = new Date(s), acc = 0;
    return phases.map((p, i) => {
      acc += parseFloat(p.weight) || 1;
      // [v3.7.0] 기준정보(SDLC · 개선 공정)에 단계 계획 시작 · 종료일이 있으면 그 일정 그대로
      if (/^\d{4}-\d{2}-\d{2}$/.test(p.pStart || "") && /^\d{4}-\d{2}-\d{2}$/.test(p.pEnd || "") && p.pStart <= p.pEnd) {
        cur = new Date(new Date(p.pEnd + "T00:00:00").getTime() + 86400000);
        return [p.pStart, p.pEnd];
      }
      const end = i === phases.length - 1 ? new Date(e) : new Date(s.getTime() + (Math.round(days * acc / total) - 1) * 86400000);
      // 시작일은 다음 평일, 종료일은 이전 평일로 (주말·공휴일 제외, 단계 기간을 벗어나지 않게)
      const hol = projectConfig.holidays || [];
      const st = WBSEngine.getNextWorkingDay(iso(cur), hol, iso(end < cur ? cur : end));
      let en = new Date(end < cur ? cur : end);
      for (let g = 0; g < 10 && WBSEngine.isHoliday(iso(en), hol) && iso(en) > st; g++) en.setDate(en.getDate() - 1);
      const r = [st, iso(en)];
      cur = new Date((end < cur ? cur : end).getTime() + 86400000);
      return r;
    });
  },

  // [v3.7.0] 서브시스템의 기본 담당자: 그 서브시스템 총괄리더(여럿이면 먼저 조회된 사람)
  //   → 없으면 그 서브시스템 담당 사용자 → 전체 담당 총괄리더 순
  leadOf(sys) {
    const users = (typeof projectUsers !== "undefined" ? projectUsers : []).filter(u => u && u.name);
    const role = u => (typeof AuthManager !== "undefined" ? AuthManager.normalizeRole(u.role) : String(u.role || ""));
    const of = u => String(u.subsystem || "").trim();
    const hit = users.find(u => role(u) === "LEAD" && of(u) === sys)
      || users.find(u => of(u) === sys && role(u) !== "SYS_ADMIN")
      || users.find(u => role(u) === "LEAD" && (of(u) === "ALL" || of(u) === ""));
    return hit ? String(hit.name).slice(0, 40) : "";
  },

  build(sys, type, withRoot) {
    if (String(type).startsWith("COPY:")) return this.buildCopy(sys, String(type).slice(5), withRoot);
    const meta = this.metas().find(m => this.sysKey(m) === sys) || {};
    const t = this.phases(type);
    const slots = this.schedule(t.phases);
    const owner = this.leadOf(sys);
    const starts = slots.map(x => x[0]).sort(), ends = slots.map(x => x[1]).sort();
    const base = { id: "", system: sys, reqId: "", aStart: "", aEnd: "", pProg: 0, aProg: 0, output: "", owner };  // 산출물은 비워 둠
    const rows = [];
    if (withRoot) {
      rows.push(Object.assign({}, base, { level: 1, name: `${sys} ${type === "REQ" ? "개선 과업" : "구축"} (${t.label})`, weight: parseFloat(meta.weight) || 10,
        pStart: starts[0] || "", pEnd: ends[ends.length - 1] || "" }));
    }
    t.phases.forEach((p, i) => {
      const name = p.name || p.taskName || `단계 ${i + 1}`;
      rows.push(Object.assign({}, base, { level: 2, name, weight: parseFloat(p.weight) || 1, pStart: slots[i][0], pEnd: slots[i][1] }));
      // 단계(L2)마다 세부 과업(L3) 2개 — 계획 일정은 단계와 같게
      [1, 2].forEach(n => rows.push(Object.assign({}, base, { level: 3, name: `${name} 세부 과업 ${n}`, weight: 1, pStart: slots[i][0], pEnd: slots[i][1] })));
    });
    return rows;
  },

  // 다른 서브시스템의 WBS 복사: 구조 · 과업명 · 가중치 · 계획 일정 · 산출물은 그대로, 실적은 비우고 담당자는 대상 서브시스템 총괄리더로
  buildCopy(sys, src, withRoot) {
    const owner = this.leadOf(sys);
    const rename = n => String(n || "").split(src).join(sys);
    return this.existing(src).filter(t => withRoot || (parseInt(t.level, 10) || 1) !== 1).map(t => ({
      id: "", level: parseInt(t.level, 10) || 1, system: sys, name: rename(t.name), weight: parseFloat(t.weight) || 1, reqId: "",
      pStart: t.pStart || "", pEnd: t.pEnd || "", aStart: "", aEnd: "", pProg: 0, aProg: 0, output: t.output || "", owner
    }));
  },

  // 추가(Append) 시 기존 L1 이 있으면 단계 과업만 덧붙임
  _plan() {
    const sys = this._val("tplSystemSelect"), type = this._val("tplTypeSelect");
    if (!sys || !type) return null;
    const ex = this.existing(sys);
    const mode = ex.length ? this.mode() : "new";
    const hasRoot = ex.some(t => (parseInt(t.level, 10) || 1) === 1);
    const rows = this.build(sys, type, mode !== "append" || !hasRoot);
    return { sys, type, ex, mode, rows };
  },

  renderPreview() {
    const body = document.getElementById("tplPreviewBody");
    const note = document.getElementById("tplPreviewNote");
    const btn = document.getElementById("tplApplyBtn");
    const plan = this._plan();
    if (!plan) { body.innerHTML = ""; note.textContent = ""; btn.disabled = true; return; }
    body.innerHTML = plan.rows.map(r => `<tr><td><span class="lvl-badge lvl-${r.level}">L${r.level}</span></td><td style="padding-left:${(r.level - 1) * 14 + 6}px;">${escapeHtml(r.name)}</td><td style="text-align:right;">${r.weight}</td><td>${r.pStart} ~ ${r.pEnd}</td><td>${escapeHtml(r.output)}</td></tr>`).join("");
    note.textContent = plan.mode === "replace" ? `— 기존 ${plan.ex.length}개 삭제 후 ${plan.rows.length}개 생성`
      : plan.mode === "append" ? `— 기존 ${plan.ex.length}개 뒤에 ${plan.rows.length}개 추가` : `— ${plan.rows.length}개 생성`;
    const copy = String(plan.type).startsWith("COPY:");
    const lead = this.leadOf(plan.sys);
    note.textContent += ` · 담당자: ${lead || "(지정할 총괄리더 없음 — 비워 둠)"}`;
    btn.textContent = plan.mode === "replace" ? "♻️ 교체 실행" : copy ? "➕ WBS 복사" : "➕ 템플릿 추가";
    btn.setAttribute("data-btn", plan.mode === "replace" ? "danger" : "add");
    btn.disabled = false;
    if (typeof ButtonStandard !== "undefined") ButtonStandard.apply(btn.parentNode);
    if (typeof I18N !== "undefined") { I18N.translateTree(body); I18N.translateTree(note.parentNode); I18N.translateTree(btn.parentNode); }
  },

  apply() {
    const plan = this._plan();
    if (!plan) return showToast("대상 서브시스템을 선택하세요.");
    if (typeof Permission !== "undefined" && !Permission.canWriteSubsystem(plan.sys)) {
      return showToast(`⚠️ [${plan.sys}] 서브시스템의 WBS 를 바꿀 권한이 없습니다.`);
    }
    const run = () => {
      if (plan.mode === "replace") {
        for (let i = wbsData.length - 1; i >= 0; i--) if (String(wbsData[i].system || "").trim() === plan.sys) wbsData.splice(i, 1);
      }
      // 같은 서브시스템 과업 묶음의 끝에 넣음 (정렬·재채번은 rebuildAll 에서 처리)
      let at = -1;
      wbsData.forEach((t, i) => { if (String(t.system || "").trim() === plan.sys) at = i; });
      if (at === -1) wbsData.push(...plan.rows); else wbsData.splice(at + 1, 0, ...plan.rows);
      this.close();
      rebuildAll(true);
      const fl = document.getElementById("wbsSubsystemFilter");
      if (fl && [...fl.options].some(o => o.value === plan.sys)) { fl.value = plan.sys; renderWbsTable(); }
      const what = String(plan.type).startsWith("COPY:") ? `[${String(plan.type).slice(5)}] WBS 복사본` : "템플릿";
      showToast(plan.mode === "replace" ? `♻️ [${plan.sys}] WBS 를 ${what}(으)로 교체했습니다. (기존 ${plan.ex.length}개 삭제, ${plan.rows.length}개 생성)`
        : `✅ [${plan.sys}] WBS 에 ${what} 과업 ${plan.rows.length}개를 추가했습니다.`);
    };
    if (plan.mode === "replace") {
      openConfirmDialog(`⚠️ [${plan.sys}] 서브시스템의 기존 WBS 과업 ${plan.ex.length}개(입력한 실적·진척률 포함)를 모두 지우고 템플릿 과업 ${plan.rows.length}개로 교체합니다.\n계속하시겠습니까?`, run);
    } else run();
  }
};
// 이전 이름 호환
function openTemplateModal() { WbsTemplate.open(); }
function closeTemplateModal() { WbsTemplate.close(); }
