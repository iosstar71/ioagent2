// =============================================================================
// WBS 오른쪽 상세 패널 — ID 나 행을 누르면 한 Task 의 모든 항목(일정 · 실적 · 선행 Task · 기준선 · 연결)을 한 곳에서 보고 고침
//  - WbsDetail
// =============================================================================

// -----------------------------------------------------------------------------
// 2. WBS 오른쪽 상세 패널
// -----------------------------------------------------------------------------
var WbsDetail = {
  _id: null,

  // 과업은 ID 로 찾음 (다시 계산하면 행 객체가 새로 만들어질 수 있음)
  // 행 객체로 따라감 (레벨 이동 · 추가로 WBS ID 가 다시 매겨져도 같은 과업 유지)
  _ref: null,
  idx() {
    if (this._ref) { const i = wbsData.indexOf(this._ref); if (i !== -1) { this._id = String(this._ref.id); return i; } }
    // 저장 뒤 자료가 새 객체로 바뀐 경우: ID 로 다시 찾아 이어 감
    const i = this._id === null ? -1 : wbsData.findIndex(t => String(t.id) === this._id);
    this._ref = i === -1 ? null : wbsData[i];
    return i;
  },
  row() { const i = this.idx(); return i === -1 ? null : wbsData[i]; },
  _panel() {
    let p = document.getElementById("neoDetail");
    if (p) return p;
    p = document.createElement("aside");
    p.id = "neoDetail";
    p.className = "neo-detail";
    p.hidden = true;
    p.setAttribute("aria-label", "WBS Task 상세");
    document.body.appendChild(p);
    return p;
  },
  open(idx) {
    const row = wbsData[idx];
    if (!row) return;
    this._id = String(row.id);
    this._ref = row;
    this.render();
  },
  close() {
    this._id = null;
    this._ref = null;
    const p = document.getElementById("neoDetail");
    if (p) p.hidden = true;
    document.body.classList.remove("neo-detail-open");
    this.markRow();
  },
  isOpen() { const p = document.getElementById("neoDetail"); return !!(p && !p.hidden); },

  // 표에서 현재 보이는 과업 순서대로 이전/다음
  step(dir) {
    const ids = Array.prototype.map.call(document.querySelectorAll("#wbsTableBody tr[data-wbs-id]"), r => r.getAttribute("data-wbs-id"));
    const cur = this._id === null ? -1 : ids.indexOf(this._id);
    const next = ids[cur + dir];
    if (!next) return;
    const idx = wbsData.findIndex(t => t.id === next);
    if (idx !== -1) this.open(idx);
  },

  // 한 칸 수정: 표와 같은 처리(값 저장 → 다시 계산/저장 → 표·패널 다시 그림)
  set(field, value) {
    const idx = this.idx();
    if (idx === -1) return this.close();
    if (field === "owner") return WbsOwner.set(idx, value);
    if (field === "weight") { WbsWeight.set(idx, value); return this.render(); }
    const after = {
      name: ["persistChanges"], output: ["persistChanges"],
      reqId: ["renderPhaseMatrix", "renderReqMasterTable", "persistChanges"],
      weight: ["rebuildAll"], pStart: ["rebuildAll"], pEnd: ["rebuildAll"], aStart: ["rebuildAll"], aEnd: ["rebuildAll"], aProg: ["rebuildAll"]
    }[field] || ["persistChanges"];
    const num = field === "weight" || field === "aProg";
    const v = num ? (value === "" ? "" : parseFloat(value)) : value;
    if (!UiH.set("wbsData", idx, field, v, ...after)) return this.render();
    if (after.indexOf("rebuildAll") === -1) renderWbsTable();
    this.render();
  },
  // 선행 Task 칸 i (0~2): WBS ID 목록에서 고름. 자기 자신 · 자기 상위/하위 Task 는 받지 않음
  setPred(i, value) {
    const idx = this.idx();
    if (idx === -1) return;
    const row = wbsData[idx];
    const ids = WBSEngine.predIds(row);
    const v = String(value || "").trim();
    if (v) {
      const p = wbsData.find(t => String(t.id) === v);
      const rel = p && (p === row || String(p.id).startsWith(row.id + ".") || String(row.id).startsWith(p.id + "."));
      if (!p || rel) { showToast(p ? "⚠️ 자기 자신이나 상위 · 하위 Task 는 선행으로 지정할 수 없습니다." : I18N.tf("⚠️ WBS ID [{id}] 를 찾을 수 없습니다.", { id: v })); return this.render(); }
      if (WBSEngine.predCycle(wbsData, row, v)) { showToast(I18N.tf("⚠️ [{id}] 는 이미 이 Task 뒤에 오도록 연결되어 있어 선행으로 지정할 수 없습니다 (순환).", { id: v })); return this.render(); }
    }
    ids[i] = v;
    const next = ids.filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).slice(0, WBSEngine.PRED_MAX).join(", ");
    if (!UiH.set("wbsData", idx, "pred", next, "persistChanges")) return this.render();
    renderWbsTable();
    this.render();
  },
  // 선행 Task 칸 3개 + 고른 선행의 이름 · 상태 · 계획 종료 한 줄씩
  _predHtml(row) {
    const chk = WBSEngine.predCheck(row, wbsData, DayUtil.rep());
    const ids = WBSEngine.predIds(row);
    const inputs = [0, 1, 2].map(i => `<input type="text" class="neo-pred-in" list="neoPredList" value="${escapeAttr(ids[i] || "")}" placeholder="${i === 0 ? "WBS ID" : ""}" data-change="WbsDetail.setPred" data-change-args="${UiEvents.args(i, "$value")}">`).join("");
    const opts = wbsData.filter(t => t !== row).map(t => `<option value="${escapeAttr(t.id)}">${escapeHtml(t.name || "")}</option>`).join("");
    const lines = chk.list.map(x => {
      if (x.missing) return `<div class="neo-pred-line warn"><code>${escapeHtml(x.id)}</code> <span>${I18N.t("찾을 수 없는 Task")}</span></div>`;
      const st = DayUtil.status(x.task);
      const why = x.reasons.map(r => `<span class="neo-pred-why">${WBSEngine.PRED_REASON[r]}</span>`).join("");
      return `<div class="neo-pred-line${x.reasons.length ? " warn" : ""}"><code>${escapeHtml(x.id)}</code> <span class="neo-pred-name">${escapeHtml(x.task.name || "")}</span>
        <span class="status-tag ${st.cssClass}">${st.label}</span> <span class="neo-muted">${I18N.tf("계획 종료 {d}", { d: x.task.pEnd || "-" })}</span>${why}</div>`;
    }).join("");
    return `<div class="neo-detail-sec">
          <div class="neo-detail-sec-title">⛓ 선행 Task <span class="neo-muted">(${I18N.tf("최대 {n}개 · 선택", { n: WBSEngine.PRED_MAX })})</span></div>
          <div class="neo-pred-ins">${inputs}</div><datalist id="neoPredList">${opts}</datalist>
          ${lines || '<div class="neo-muted">먼저 끝나야 하는 Task 가 있으면 지정합니다. 늦어지면 경고만 표시합니다.</div>'}
        </div>`;
  },
  run(fnName) {
    const idx = this.idx();
    if (idx === -1) return;
    const fn = UiEvents.resolve(fnName);
    const before = new Set(wbsData);
    if (fn) fn.fn.call(fn.owner, idx);
    // 하위 · 동위 추가: 새 과업을 상세 패널에 바로 엶 (레벨 이동 · 입력을 이어서 할 수 있게)
    const added = wbsData.find(t => !before.has(t));
    if (added) { this._ref = added; this._id = String(added.id); }
    setTimeout(() => this.render(), 80);
  },
  // 레벨 올리기(-1) · 내리기(+1)
  level(delta) {
    const idx = this.idx();
    if (idx === -1) return;
    const row = wbsData[idx];
    changeTaskLevel(idx, delta);
    this._ref = row; this._id = String(row.id);   // 다시 매긴 ID 로 따라감
    setTimeout(() => this.render(), 80);
  },

  render() {
    const p = this._panel();
    const row = this.row();
    if (!row) return this.close();
    // 다시 그려도 입력 중이던 칸(Tab 으로 옮겨 간 칸)의 포커스 유지
    const act = document.activeElement;
    const focusKey = act && p.contains(act) ? act.getAttribute("data-change-args") : null;
    const st = DayUtil.status(row);
    const leaf = !!row.isLeaf;
    const ro = leaf ? "" : "readonly";
    const field = (label, key, type, extra = "") => `
      <label class="neo-field"><span>${label}</span>
        <input type="${type}" value="${escapeAttr(row[key] === undefined || row[key] === null ? "" : String(row[key]))}" ${extra} data-change="WbsDetail.set" data-change-args="${UiEvents.args(key, "$value")}"></label>`;
    const req = (reqMasterData || []).find(r => r.id && r.id === row.reqId);
    const posts = (communicationsData || []).filter(c => c.taskId && String(c.taskId) === String(row.id));
    const kids = (() => { const i = wbsData.indexOf(row); return leaf ? 0 : getSubtreeEndIndex(i) - i - 1; })();
    const pp = Math.max(0, Math.min(100, parseFloat(String(row.pProg)) || 0)), ap = Math.max(0, Math.min(100, parseFloat(String(row.aProg)) || 0));
    const due = row.pEnd && ap < 100 ? DayUtil.dueText(row.pEnd) : "";
    p.innerHTML = `
      <div class="neo-detail-head">
        <div class="neo-detail-title">
          <span class="lvl-badge lvl-${row.level}">L${row.level}</span>
          <code>${escapeHtml(row.id)}</code>
          <span class="status-tag ${st.cssClass}">${st.label}</span>
        </div>
        <div class="neo-detail-nav">
          <button type="button" class="btn btn-xs" data-click="WbsDetail.step" data-click-args="${UiEvents.args(-1)}" title="이전 Task">▲</button>
          <button type="button" class="btn btn-xs" data-click="WbsDetail.step" data-click-args="${UiEvents.args(1)}" title="다음 Task">▼</button>
          <button type="button" class="btn btn-xs" data-btn="cancel" data-click="WbsDetail.close" title="닫기 (Esc)">✕</button>
        </div>
      </div>
      <div class="neo-detail-body">
        <label class="neo-field neo-field-wide"><span>Task명</span>
          <textarea rows="2" data-change="WbsDetail.set" data-change-args="${UiEvents.args("name", "$value")}">${escapeHtml(row.name || "")}</textarea></label>
        <div class="neo-detail-meta">
          <span>🏢 ${escapeHtml(row.system || "-")}</span>
          <span>${leaf ? "최하위 Task" : `상위 Task · 하위 ${kids}개`}</span>
          ${due ? `<span class="neo-due${DayUtil.daysLeft(row.pEnd) < 0 ? " late" : ""}">계획종료 ${due}</span>` : ""}
        </div>
        <div class="neo-progress">
          <div class="neo-progress-row"><span>계획</span><div class="neo-bar"><i style="width:${pp}%"></i></div><b>${pp}%</b></div>
          <div class="neo-progress-row actual"><span>실적</span><div class="neo-bar"><i style="width:${ap}%"></i></div><b>${ap}%</b></div>
        </div>
        <div class="neo-grid2">
          ${field("계획시작", "pStart", "date", ro)}
          ${field("계획종료", "pEnd", "date", ro)}
          ${field("실제 시작", "aStart", "date", ro)}
          ${field("실제 종료", "aEnd", "date", ro)}
          ${field("실적 진척률(%)", "aProg", "number", `min="0" max="100" ${ro}`)}
          ${field("가중치", "weight", "number", `min="0" step="0.1"${WbsWeight.warnMap().has(row) ? ` class="weight-warn" title="${escapeAttr(WbsWeight.warnMap().get(row))}"` : ""}`)}
          ${field("REQ ID", "reqId", "text")}
          ${field("담당자", "owner", "text", `list="wbsOwnerList" maxlength="40" title="목록에서 고르거나 직접 입력 (1명)${leaf ? "" : " — 하위 Task 에도 자동 지정"}"`)}
          ${field("산출물", "output", "text")}
        </div>
        ${BaselineUI.taskHtml(row)}
        ${this._predHtml(row)}
        ${leaf ? "" : '<div class="neo-note">상위 Task 의 일정·진척률은 하위 Task 에서 자동으로 합산됩니다.</div>'}
        <div class="neo-detail-actions">
          <button type="button" class="btn btn-sm" data-btn="warn" data-click="WbsDetail.run" data-click-args="${UiEvents.args("fillRowActualFromPlan")}" ${leaf ? "" : "disabled"}>⚡ 계획을 실적에 반영</button>
          <button type="button" class="btn btn-sm" data-btn="add" data-click="WbsDetail.run" data-click-args="${UiEvents.args("addChildTask")}" ${row.level >= 5 ? "disabled" : ""}>+ 하위</button>
          <button type="button" class="btn btn-sm" data-btn="add" data-click="WbsDetail.run" data-click-args="${UiEvents.args("addSiblingTask")}">+ 동위</button>
          <button type="button" class="btn btn-sm" data-click="WbsDetail.level" data-click-args="${UiEvents.args(-1)}" title="상위 레벨로 올리기 (하위 Task 포함)" ${row.level <= 2 ? "disabled" : ""}>◀ 레벨 올리기</button>
          <button type="button" class="btn btn-sm" data-click="WbsDetail.level" data-click-args="${UiEvents.args(1)}" title="하위 레벨로 내리기 (하위 Task 포함, 최대 L5)" ${row.level <= 1 || row.level >= 5 ? "disabled" : ""}>레벨 내리기 ▶</button>
        </div>
        <div class="neo-detail-sec">
          <div class="neo-detail-sec-title">🔗 연결된 요구사항</div>
          ${req ? `<button type="button" class="neo-link" data-click="CheckList.reveal" data-click-args="${UiEvents.args("tab-req", req.id)}"><span><code>${escapeHtml(req.id)}</code> · ${escapeHtml(req.status || "")}</span><span>${escapeHtml(req.name || "")}</span></button>`
            : `<div class="neo-muted">${row.reqId ? `요구사항 [${escapeHtml(row.reqId)}] 을 찾을 수 없습니다.` : "REQ ID 를 입력하면 연결됩니다."}</div>`}
        </div>
        <div class="neo-detail-sec">
          <div class="neo-detail-sec-title">💬 이 Task 소통 글 (${posts.length})</div>
          ${posts.length ? posts.slice(0, 5).map(c => `<div class="neo-post"><b>${escapeHtml(c.author || "")}</b> <span class="neo-muted">${escapeHtml(c.date || "")}</span><div>${escapeHtml((c.title || c.content || "").slice(0, 80))}</div></div>`).join("")
            : '<div class="neo-muted">등록된 글이 없습니다.</div>'}
        </div>
      </div>`;
    p.hidden = false;
    document.body.classList.add("neo-detail-open");
    ButtonStandard.apply(p);
    I18N.translateTree(p);
    if (focusKey) {
      const el = Array.prototype.find.call(p.querySelectorAll("[data-change-args]"), x => x.getAttribute("data-change-args") === focusKey);
      if (el) el.focus();
    }
    this.markRow();
  },
  markRow() {
    document.querySelectorAll("#wbsTableBody tr.neo-sel").forEach(r => r.classList.remove("neo-sel"));
    if (this._id === null) return;
    const tr = /** @type {HTMLElement} */ (document.querySelector(`#wbsTableBody tr[data-wbs-id="${CSS.escape(this._id)}"]`));
    if (tr) {
      tr.classList.add("neo-sel");
      const box = tr.closest(".table-container");
      if (box) {
        const top = tr.offsetTop, h = box.clientHeight;
        if (top < box.scrollTop || top > box.scrollTop + h - 40) box.scrollTop = Math.max(0, top - h / 3);
      }
    }
  },
  // 표가 다시 그려진 뒤 (renderWbsTable 끝에서 호출)
  afterTable() {
    if (!this.isOpen()) return;
    if (!this.row()) return this.close();
    this.render();
  }
};
