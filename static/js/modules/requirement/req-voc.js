// =============================================================================
// 요구사항 · VOC 목록
//  - 표의 열은 COLS 배열 한 곳에서 머리글과 행을 함께 만든다 (ListTable)
//  - VOC: 단계(자동) · 판정 · 심각도(결함일 때) · 추가 요구사항 등록 — 규칙은 VocRules, 기준(목록 · 집계)은 Metrics
// =============================================================================

// 열 정의로 표 머리글 · 행 그리기
//  col: { h: 머리글, cls: 열 꾸밈 클래스, f: 필드, type: text|select|date|system|html|del, opts(row), td(row, idx), when(row) }
var ListTable = {
  head(cols) { return `<tr>${cols.map(c => `<th class="${c.cls || ""}"${c.tip ? ` title="${escapeAttr(c.tip)}"` : ""}>${c.h}</th>`).join("")}</tr>`; },
  cell(c, row, idx, change) {
    if (c.when && !c.when(row)) return `<td class="${c.cls || ""} u-tc u-c-muted">-</td>`;
    if (c.td) return `<td class="${c.cls || ""}">${c.td(row, idx)}</td>`;
    const v = row[c.f] == null ? "" : String(row[c.f]);
    const ch = change(c, idx);
    if (c.type === "select" || c.type === "system") {
      const opts = c.type === "system" ? null : c.opts(row);
      const inner = opts ? (opts.indexOf(v) === -1 && v ? [v].concat(opts) : opts).map(o => `<option value="${escapeAttr(o)}"${o === v ? " selected" : ""}>${escapeHtml(o || "-")}</option>`).join("")
        : getSubsystemOptionsHtml(v);
      return `<td class="${c.cls || ""}"><select class="${c.selCls ? c.selCls(row) : ""}" ${ch}>${inner}</select></td>`;
    }
    if (c.type === "date") {
      const day = WBSEngine.getDayOfWeekText(v);
      return `<td class="${c.cls || ""}"><div class="date-input-wrap"><input type="date" value="${escapeAttr(v)}" ${ch}>
        <span class="day-of-week-tag ${day === "토" ? "day-sat" : (day === "일" ? "day-sun" : "")}">${day ? `(${day})` : ""}</span></div></td>`;
    }
    return `<td class="${c.cls || ""}"><input class="u-w100${c.bold ? " u-bold" : ""}" type="text" value="${escapeAttr(v)}" ${ch}></td>`;
  },
  render(tableId, cols, rows, change, rowAttr) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const thead = table.querySelector("thead"), tbody = table.querySelector("tbody");
    const head = this.head(cols);
    if (thead.innerHTML.trim() !== head) thead.innerHTML = head;
    tbody.innerHTML = rows.map(({ row, idx }) => `<tr data-rec-idx="${idx}"${rowAttr ? rowAttr(row) : ""}>${cols.map(c => this.cell(c, row, idx, change)).join("")}</tr>`).join("");
  },
  // 선택 상자 채우기 (건수 표시, 지금 값 유지)
  fillFilter(id, values, counts, allLabel) {
    const sel = document.getElementById(id);
    if (!sel) return "ALL";
    const cur = sel.value || "ALL";
    const tr = x => (typeof I18N !== "undefined" ? I18N.t(x) : x);
    sel.innerHTML = `<option value="ALL">${escapeHtml(tr(allLabel))} (${counts.ALL || 0})</option>` +
      values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(tr(v || "미지정"))} (${counts[v] || 0})</option>`).join("");
    sel.value = values.indexOf(cur) !== -1 ? cur : "ALL";
    return sel.value;
  }
};

const STATUS_TAG = { "대기": "tag-ready", "진행": "tag-progress", "완료": "tag-completed", "보류": "tag-hold", "삭제": "tag-del", "요구 반영": "tag-moved" };
const PRIORITY_OPTS = ["긴급", "상", "중", "하"];
const filterVal = id => { const el = document.getElementById(id); return el ? el.value : "ALL"; };

// -----------------------------------------------------------------------------
// 요구사항
// -----------------------------------------------------------------------------
var ReqList = {
  ORIGINS: ["초기", "추가"],
  originOf: r => (r.origin === "추가" ? "추가" : "초기"),
  change(c, idx) {
    const redraw = c.redraw ? ["renderReqMasterTable", "renderDashboard", "renderPhaseMatrix"] : ["renderPhaseMatrix"];
    return `data-change="UiH.set" data-change-args="${UiEvents.args("reqMasterData", idx, c.f, "$value", ...redraw, "persistChanges")}"`;
  },
  COLS: [
    { h: "요구사항 ID", cls: "lt-c-id", f: "id", bold: true },
    { h: "구분", cls: "lt-c-origin", tip: "초기 = 처음 정한 요구사항 · 추가 = VOC 에서 등록한 추가 요구사항",
      td: r => r.origin === "추가" ? `<span class="req-origin-add">추가</span>${r.srcVoc ? ` <code class="u-fs-xs">← ${escapeHtml(r.srcVoc)}</code>` : ""}` : `<span class="u-c-muted">초기</span>` },
    { h: "서브시스템", cls: "lt-c-sys", f: "system", type: "system", redraw: true },
    { h: "요구사항 명칭 / 명세", cls: "lt-c-title", f: "name" },
    { h: "유형", cls: "lt-c-type", f: "type", type: "select", opts: () => ["기능", "비기능", "화면", "인터페이스", "연계", "보안", "관리"] },
    { h: "중요도", cls: "lt-c-pri", f: "priority", type: "select", opts: () => PRIORITY_OPTS },
    { h: "수용 여부", cls: "lt-c-accept", f: "accept", type: "select", opts: () => ["수용", "불가", "검토중"] },
    { h: "연계 Task", cls: "lt-c-num u-tc", td: r => `<b>${ReqList._tasks(r).length}</b>개` },
    { h: "평균 실적(%)", cls: "lt-c-num u-tr", td: r => { const t = ReqList._tasks(r); return `<b>${t.length ? Math.round(t.reduce((a, x) => a + (parseFloat(x.aProg) || 0), 0) / t.length) : 0}%</b>`; } },
    { h: "진행 상태", cls: "lt-c-status", f: "status", type: "select", redraw: true, opts: () => ["대기", "진행", "완료", "보류", "삭제"], selCls: r => "status-tag " + (STATUS_TAG[r.status] || "tag-ready") },
    { h: "삭제", cls: "lt-c-del", td: (r, idx) => `<button class="btn btn-danger btn-sm" data-click="ReqList.remove" data-click-args="${UiEvents.args(idx)}">×</button>` }
  ],
  _tasks(r) { return wbsData.filter(t => t.reqId === r.id && t.isLeaf); },
  // VOC 에서 등록한 요구사항을 지우면 그 VOC 를 다시 대기로 (확인 후)
  remove(idx) {
    const r = reqMasterData[idx];
    if (!r) return;
    const voc = r.srcVoc && vocData.find(v => v.id === r.srcVoc && v.reqLink === r.id);
    const go = () => {
      reqMasterData.splice(idx, 1);
      if (voc) { voc.reqLink = ""; if (voc.status === "요구 반영") { voc.status = "대기"; delete voc.closedDate; } }
      ["renderReqMasterTable", "renderVocTable", "renderDashboard", "renderPhaseMatrix"].forEach(n => { const t = UiEvents.resolve(n); if (t) t.fn.call(t.owner); });
      persistChanges();
    };
    if (voc) openConfirmDialog(I18N.tf("{id} 는 {voc} 에서 등록한 추가 요구사항입니다. 지우면 그 VOC 는 다시 '대기' 가 됩니다. 지울까요?", { id: r.id, voc: voc.id }), go);
    else go();
  }
};

function renderReqMasterTable() {
  if (!document.getElementById("reqMasterTableBody")) return;
  const dF = filterVal("reqDomainFilter"), sF = filterVal("reqSubsystemFilter");
  const scope = reqMasterData.map((row, idx) => ({ row, idx }))
    .filter(({ row }) => (dF === "ALL" || WBSEngine.getSubsystemDomain(row.system) === dF) && (sF === "ALL" || row.system === sF));
  const cnt = { ALL: scope.length };
  scope.forEach(({ row }) => { const o = ReqList.originOf(row); cnt[o] = (cnt[o] || 0) + 1; });
  const oF = ListTable.fillFilter("reqOriginFilter", ReqList.ORIGINS, cnt, "전체");
  const byOrigin = scope.filter(({ row }) => oF === "ALL" || ReqList.originOf(row) === oF);
  StatusChips.render("req", byOrigin.map(x => x.row));
  const rows = byOrigin.filter(({ row }) => StatusChips.match("req", row));
  ListTable.render("reqMasterTable", ReqList.COLS, rows, (c, idx) => ReqList.change(c, idx));
  const st = Metrics.reqStats(scope.map(x => x.row));
  const sum = document.getElementById("reqListSummary");
  if (sum) sum.textContent = I18N.tf("초기 {a} · 추가 {b} · 완료율 {r}%", { a: st.initial, b: st.added, r: st.rate });
  RecordPanel.decorate("req");
}

function addNewReq() {
  const sysFilter = filterVal("reqSubsystemFilter");
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "서브시스템A");
  reqMasterData.push({ id: buildNextEntityId("REQ", defaultSys), system: defaultSys, name: "신규 요구사항 명세", type: "기능", priority: "중", accept: "수용", status: "대기" });
  renderReqMasterTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}

// -----------------------------------------------------------------------------
// VOC · 결함
// -----------------------------------------------------------------------------
var VocRules = {
  REDRAW: ["renderVocTable", "renderDashboard", "renderPhaseMatrix"],
  // 표 · 상세 패널이 같은 길로 고침. 연결된 값(단계 · 종료일 · 심각도)도 여기서 맞춤
  set(idx, field, value) {
    const v = vocData[idx];
    if (!v) return;
    if (field === "status" && value === "요구 반영" && !v.reqLink) {
      showToast("⚠️ '요구 반영' 은 [추가 요구사항으로 등록] 으로만 바뀝니다.", "warning");
      return this._after(true);
    }
    v[field] = value;
    if (field === "reqDate" || field === "system") {
      if (!v.stageManual) v.stage = WBSEngine.vocStageFor(v.system, v.reqDate) || v.stage || "";
    } else if (field === "stage") {
      if (value) v.stageManual = true;
      else { delete v.stageManual; v.stage = WBSEngine.vocStageFor(v.system, v.reqDate); }
    } else if (field === "vocType") {
      if (value !== "결함") delete v.severity;
    } else if (field === "status") {
      if (Metrics.VOC_DONE.indexOf(value) !== -1) { if (!v.closedDate) v.closedDate = projectConfig.reportDate; }
      else delete v.closedDate;
    }
    this._after(["title", "requester", "action"].indexOf(field) === -1);
  },
  _after(redraw) {
    if (redraw) this.REDRAW.forEach(n => { const t = UiEvents.resolve(n); if (t) t.fn.call(t.owner); });
    persistChanges();
  },
  canRegister(v) { return !!v && Metrics.judgeOf(v) === "개선 요청" && !v.reqLink && v.status !== "삭제"; },
  // [추가 요구사항으로 등록] — 요구사항 목록에 "추가" 로 만들고 VOC 는 "요구 반영"
  register(idx) {
    const v = vocData[idx];
    if (!this.canRegister(v)) return;
    openConfirmDialog(I18N.tf("{id} 를 추가 요구사항으로 등록합니다. 이후 일정 · 산출물은 요구사항에서 관리합니다.", { id: v.id }), () => {
      const id = buildNextEntityId("CR", v.system);
      reqMasterData.push({ id, system: v.system, name: v.title || v.id, type: "기능", priority: ["긴급", "상", "중", "하"].indexOf(v.priority) !== -1 ? v.priority : "중",
        accept: "수용", status: "대기", origin: "추가", srcVoc: v.id, addedDate: projectConfig.reportDate });
      v.reqLink = id; v.status = "요구 반영"; v.closedDate = projectConfig.reportDate;
      renderReqMasterTable();
      this._after(true);
      if (RecordPanel.isOpen()) RecordPanel.render();
      showToast(I18N.tf("추가 요구사항 {id} 를 만들었습니다.", { id }));
    });
  }
};

var VocList = {
  change(c, idx) { return `data-change="VocRules.set" data-change-args="${UiEvents.args(idx, c.f, "$value")}"`; },
  COLS: [
    { h: "VOC ID", cls: "lt-c-id", td: r => `<strong>${escapeHtml(r.id)}</strong>` },
    { h: "단계", cls: "lt-c-stage", f: "stage", type: "select", opts: () => [""].concat(Metrics.VOC_STAGES), tip: "접수일이 들어가는 Phase 로 자동 지정 (고치면 그대로 유지, 비우면 다시 자동)" },
    { h: "판정", cls: "lt-c-judge", f: "vocType", type: "select", opts: () => Metrics.VOC_JUDGE, tip: "결함 · 개선 요청 · 설명 종결 · 이슈 — 분석 뒤 PL 이 정함" },
    { h: "서브시스템", cls: "lt-c-sys", f: "system", type: "system" },
    { h: "우선순위", cls: "lt-c-pri", f: "priority", type: "select", opts: () => PRIORITY_OPTS },
    { h: "심각도", cls: "lt-c-pri", f: "severity", type: "select", opts: () => [""].concat(Metrics.VOC_SEVERITY), when: r => Metrics.judgeOf(r) === "결함" },
    { h: "요청 제목 / 이슈 내용", cls: "lt-c-title", f: "title" },
    { h: "요청자", cls: "lt-c-who", f: "requester" },
    { h: "접수일자", cls: "lt-c-date", f: "reqDate", type: "date" },
    { h: "목표완료일", cls: "lt-c-date", f: "targetDate", type: "date" },
    { h: "처리상태", cls: "lt-c-status", f: "status", type: "select", selCls: r => "status-tag " + (STATUS_TAG[r.status] || "tag-ready"),
      opts: r => Metrics.VOC_STATUS.filter(s => s !== "요구 반영" || r.status === "요구 반영") },
    { h: "처리결과 및 조치계획", cls: "lt-c-action", f: "action" },
    { h: "삭제", cls: "lt-c-del", td: (r, idx) => `<button class="btn btn-danger btn-sm" data-click="UiH.removeAt" data-click-args="${UiEvents.args("vocData", idx, ...VocRules.REDRAW, "persistChanges")}">×</button>` }
  ],
  _counts(rows, of) { const c = { ALL: rows.length }; rows.forEach(({ row }) => { const k = of(row); c[k] = (c[k] || 0) + 1; }); return c; }
};

function renderVocTable() {
  if (!document.getElementById("vocTableBody")) return;
  const dF = filterVal("vocDomainFilter"), sF = filterVal("vocSubsystemFilter");
  const scope = vocData.map((row, idx) => ({ row, idx }))
    .filter(({ row }) => (dF === "ALL" || WBSEngine.getSubsystemDomain(row.system) === dF) && (sF === "ALL" || row.system === sF));
  const stF = ListTable.fillFilter("vocStageFilter", Metrics.VOC_STAGES.concat([""]), VocList._counts(scope, r => r.stage || ""), "전체 단계");
  const byStage = scope.filter(({ row }) => stF === "ALL" || (row.stage || "") === stF);
  const jF = ListTable.fillFilter("vocJudgeFilter", Metrics.VOC_JUDGE, VocList._counts(byStage, r => Metrics.judgeOf(r)), "전체 판정");
  const byJudge = byStage.filter(({ row }) => jF === "ALL" || Metrics.judgeOf(row) === jF);
  StatusChips.render("voc", byJudge.map(x => x.row));
  const rows = byJudge.filter(({ row }) => StatusChips.match("voc", row));
  ListTable.render("vocTable", VocList.COLS, rows, (c, idx) => VocList.change(c, idx),
    r => Metrics.judgeOf(r) === "미판정" && r.status !== "삭제" ? ' class="voc-undecided"' : "");
  const st = Metrics.vocStats(byStage.map(x => x.row));
  const sum = document.getElementById("vocListSummary");
  if (sum) sum.textContent = I18N.tf("판정 대기 {u} · 처리율 {r}%", { u: st.undecided, r: st.rate });
  RecordPanel.decorate("voc");
}

function addNewVoc() {
  const sysFilter = filterVal("vocSubsystemFilter"), jF = filterVal("vocJudgeFilter");
  const defaultSys = sysFilter !== "ALL" ? sysFilter : (subsystemsMeta[0] ? subsystemsMeta[0].name : "서브시스템A");
  const reqDate = projectConfig.reportDate;
  vocData.push({
    id: buildNextEntityId("VOC", defaultSys),
    system: defaultSys,
    vocType: Metrics.VOC_JUDGE.indexOf(jF) !== -1 ? jF : "미판정",
    stage: WBSEngine.vocStageFor(defaultSys, reqDate),
    title: "신규 VOC 요청사항",
    priority: "중",
    requester: "요청부서",
    reqDate,
    targetDate: "",
    status: "대기",
    action: ""
  });
  renderVocTable();
  renderDashboard();
  renderPhaseMatrix();
  persistChanges();
}
