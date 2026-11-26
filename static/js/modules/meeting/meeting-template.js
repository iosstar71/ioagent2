// =============================================================================
// 회의록 엑셀 양식 (MeetingTemplate) — 회사 회의록 양식(xlsx)에 회의 내용을 채워 내려받음
// -----------------------------------------------------------------------------
//  양식: 프로젝트 설정의 올린 양식(projectConfig.reportTemplates.meeting — [💾 저장]하면 기록, 마스터 파일 JSON · latest.json ·
//        Workgroup 서버로 팀에 함께 감) → 없으면 기본 양식(BUILTIN_REPORT_TEMPLATES.meeting, 회사 회의록 양식 기준)
//  채우기 규칙은 XlsxTemplate (자리표시 {{이름}} · 반복 {{안건.제목}} …). 자리표시 목록은 KEYS
//  안건은 최소 MIN_AGENDAS 개, Action Item 은 최소 MIN_ACTIONS 줄 자리를 남김 (손으로 적을 칸)
// =============================================================================
var MeetingTemplate = {
  MIN_AGENDAS: 5,
  MIN_ACTIONS: 4,
  MAX_BYTES: 1024 * 1024,
  KEYS: [
    ["제목", "[서브시스템] 회의명 (서브시스템이 없으면 회의명)"], ["회의명", "회의명"], ["서브시스템", "서브시스템"], ["프로젝트명", "프로젝트명"],
    ["일정", "일자 시작~종료 (예: 2027-05-28 10:00~11:30)"], ["일자", "회의 일자"], ["시작", "시작 시각"], ["종료", "종료 시각"],
    ["장소", "회의 장소"], ["주관", "주관 · 발표"], ["상태", "회의 상태"], ["요약", "회의 목적 · 총괄 요약"],
    ["참석자목록", "참석자 한 줄에 한 명: 부서 이름 역할 (불참 · 대리 등은 괄호)"], ["참석자수", "참석자 수"], ["작성일", "내려받은 날"],
    ["안건.번호 · 안건.제목 · 안건.논의 · 안건.결정", "반복 (안건마다 — 이웃한 여러 줄을 한 묶음으로 복사, 최소 5개 자리)"],
    ["액션.번호 · 액션.내용 · 액션.담당자 · 액션.완료예정일 · 액션.상태 · 액션.비고", "반복 (Action Item 마다, 최소 4줄 자리) — 완료예정일은 엑셀 날짜 값(칸의 날짜 서식으로 보임)"]
  ],

  // 회의 → 자리표시 값
  values(m) {
    const projName = ProjectData.currentName();
    const dash = (a, b) => [a, b].filter(Boolean).join("~");
    const att = (m.attendees || []).map(a => [a.dept, a.name, a.role].filter(Boolean).join(" ") + (a.attendance && a.attendance !== "참석" ? ` (${a.attendance})` : ""));
    const agendas = (m.agendas || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((a, i) => ({ 번호: i + 1, 제목: a.title || "", 논의: a.discussion || "", 결정: a.decision || "" }));
    for (let i = agendas.length; i < this.MIN_AGENDAS; i++) agendas.push({ 번호: i + 1, 제목: "", 논의: "", 결정: "" });
    const acts = (m.actionItems || []).filter(a => a.status !== "삭제")
      .map((a, i) => ({ 번호: i + 1, 내용: [a.title, a.content].filter(Boolean).join(" — "), 담당자: a.assignee || "", 완료예정일: this.excelDate(a.targetDate), 상태: a.status || "", 비고: a.status && a.status !== "대기" ? a.status : "" }));
    for (let i = acts.length; i < this.MIN_ACTIONS; i++) acts.push({ 번호: i + 1, 내용: "", 담당자: "", 완료예정일: "", 상태: "", 비고: "" });
    return {
      제목: m.system ? `[${m.system}] ${m.title || ""}` : (m.title || ""), 회의명: m.title || "", 서브시스템: m.system || "", 프로젝트명: projName,
      일정: [m.date, dash(m.startTime, m.endTime)].filter(Boolean).join(" "), 일자: m.date || "", 시작: m.startTime || "", 종료: m.endTime || "",
      장소: m.location || "", 주관: m.host || "", 상태: m.status || "", 요약: m.summary || "",
      참석자목록: att.join("\n"), 참석자수: att.length, 작성일: new Date().toISOString().slice(0, 10),
      안건: agendas, 액션: acts
    };
  },

  // YYYY-MM-DD → 엑셀 날짜 값 (칸의 날짜 서식으로 보임). 날짜가 아니면 글 그대로
  excelDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
    return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : (v || "");
  },

  // 지금 쓰는 양식 → { name, bytes, custom, at, by }
  current() {
    const own = ((projectConfig.reportTemplates || {}).meeting) || null;
    const src = own && own.b64 ? own : BUILTIN_REPORT_TEMPLATES.meeting;
    const bin = atob(src.b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { name: src.name, bytes, custom: !!(own && own.b64), at: own && own.at, by: own && own.by };
  },

  // 회의록 엑셀 내려받기 (회의록 화면의 [📥 엑셀 다운로드])
  async exportExcel(meetingId) {
    const m = (meetingsData || []).find(x => x.id === meetingId) || meetingsData[0];
    if (!m) return;
    const tpl = this.current();
    let r;
    try { r = await XlsxTemplate.fill(tpl.bytes, this.values(m)); }
    catch (e) { console.error("[MeetingTemplate] fill", e); return showToast(I18N.tf("⚠️ 회의록 양식을 채우지 못했습니다: {m}", { m: e.message })); }
    const filename = ExcelSync.stdName("회의록", [m.system, m.title], "xlsx", String(m.date || "").replace(/-/g, ""));
    ExcelSync._triggerDownload(r.blob, filename);
    const warn = r.unknown.length ? I18N.tf(" · 모르는 자리표시 {k} — 빈칸으로 둠", { k: r.unknown.map(k => `{{${k}}}`).join(", ") }) : "";
    showToast(I18N.tf("📄 [회의록 엑셀] {f} ({t}){w}", { f: filename, t: tpl.custom ? I18N.t("올린 양식") : I18N.t("기본 양식"), w: warn }));
  },

  // ---- 보고서 설정 화면 (보고 > 보고서 설정) ----
  canEdit() { return Permission.isManager(); },
  renderSettings() {
    const box = document.getElementById("mtplBox");
    if (!box) return;
    const t = this.current(), edit = this.canEdit();
    const who = t.custom ? I18N.tf("올린 양식: {n} · {a}{b}", { n: t.name, a: String(t.at || "").slice(0, 16).replace("T", " "), b: t.by ? ` · ${t.by}` : "" }) : I18N.tf("기본 양식: {n}", { n: t.name });
    box.innerHTML = `<div class="mtpl-now"><b>${escapeHtml(who)}</b></div>
      <div class="mtpl-btns">
        ${edit ? `<button type="button" class="btn btn-sm" data-btn="excel-up" data-click="UiH.clickEl" data-click-args='["mtplInput"]'>📤 양식 올리기</button>` : ""}
        <button type="button" class="btn btn-sm" data-btn="excel-down" data-click="MeetingTemplate.downloadCurrent">📥 지금 양식 내려받기</button>
        ${edit && t.custom ? `<button type="button" class="btn btn-sm" data-btn="cancel" data-click="MeetingTemplate.reset">↩️ 기본 양식으로</button>` : ""}
      </div>
      <div class="lk-hint">${escapeHtml(I18N.t("회사 회의록 양식(xlsx)의 값이 들어갈 칸에 아래 이름을 {{이름}} 으로 적어 올립니다. 올린 양식은 [💾 저장]하면 기록되고 팀에 함께 전달됩니다 (Standalone: 마스터 파일 JSON · 배포용 latest.json, Workgroup: 서버). 올리기 · 되돌리기는 PM · 관리자만."))}</div>
      <details class="mtpl-keys"><summary>${escapeHtml(I18N.tf("자리표시 목록 ({n}개)", { n: this.KEYS.length }))}</summary>
        <table class="m-table"><tbody>${this.KEYS.map(([k, d]) => `<tr><td><code>${escapeHtml(k.split(" · ").map(x => `{{${x}}}`).join(" · "))}</code></td><td>${escapeHtml(d)}</td></tr>`).join("")}</tbody></table></details>`;
    I18N.translateTree(box);
  },
  downloadCurrent() {
    const t = this.current();
    ExcelSync._triggerDownload(new Blob([t.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), t.name);
  },
  async upload(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (e && e.target) e.target.value = "";
    if (!file) return;
    if (!this.canEdit()) return showToast("⛔ 회의록 양식은 PM · 관리자만 바꿀 수 있습니다.");
    if (!/\.xlsx$/i.test(file.name)) return showToast("⚠️ 엑셀(xlsx) 양식만 올릴 수 있습니다.");
    if (file.size > this.MAX_BYTES) return showToast("⚠️ 양식 파일이 너무 큽니다 (1MB 까지).");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // 올리기 전에 한 번 채워 봄 (양식이 깨졌거나 자리표시 오타가 있는지)
    let r;
    try { r = await XlsxTemplate.fill(bytes, this.values(this._sample())); }
    catch (err) { return showToast(I18N.tf("⚠️ 양식을 읽지 못했습니다: {m}", { m: err.message })); }
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    projectConfig.reportTemplates = Object.assign({}, projectConfig.reportTemplates, { meeting: { name: file.name, b64: btoa(bin), at: new Date().toISOString(), by: (AuthManager.getCurrentUser() || {}).name || "" } });
    persistChanges();
    this.renderSettings();
    showToast(I18N.tf("📤 회의록 양식을 올렸습니다: {n}{w} — [💾 저장]하면 기록됩니다.", { n: file.name, w: r.unknown.length ? I18N.tf(" · 모르는 자리표시 {k}", { k: r.unknown.map(k => `{{${k}}}`).join(", ") }) : "" }));
  },
  reset() {
    if (!this.canEdit()) return;
    openConfirmDialog(I18N.t("올린 회의록 양식을 지우고 기본 양식으로 되돌릴까요? ([💾 저장]하면 기록됩니다)"), () => {
      const rt = Object.assign({}, projectConfig.reportTemplates);
      delete rt.meeting;
      projectConfig.reportTemplates = rt;
      persistChanges();
      this.renderSettings();
      showToast("↩️ 기본 회의록 양식으로 되돌렸습니다.");
    });
  },
  // 양식 확인용 예시 회의
  _sample() {
    return { title: "예시 회의", system: "", date: "2027-01-01", startTime: "10:00", endTime: "11:00", location: "회의실", attendees: [{ dept: "PMO", name: "홍길동", role: "PM" }],
      agendas: [{ order: 1, title: "안건", discussion: "논의", decision: "결정" }], actionItems: [{ title: "할 일", assignee: "홍길동", targetDate: "2027-01-08", status: "대기" }] };
  }
};
window.MeetingTemplate = MeetingTemplate;
