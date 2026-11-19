// =============================================================================
// [IOSTAR-PM Workgroup 0.1] 기능 켜고 끄기 (Features) — conf/app.ini [features] · [lock]
// -----------------------------------------------------------------------------
//  - 끈 기능은 코드를 지우지 않고 화면에서 비활성 (Enterprise 판에서 켜거나 교체 — docs/ENTERPRISE_ROADMAP.md)
//  - Workgroup 판 원칙: 화면이 일정 시간마다 서버에 묻지 않음 (사용자가 무언가를 할 때만 통신)
//  - 사용: Features.on("chat") / Features.lockMode() / Features.lockHours()
// =============================================================================
var Features = {
  DEFAULTS: { chat: false, server_heartbeat: false, db_oracle: false, db_excel_access: false, local_file_sync: false },
  LABELS: { chat: "실시간 채팅", server_heartbeat: "서버 연결 감시", db_oracle: "Oracle DB", db_excel_access: "Excel/Access DB", local_file_sync: "로컬 파일 직접 동기화" },
  cfg() { return typeof APP_CONFIG !== "undefined" ? APP_CONFIG : {}; },
  on(name) {
    const f = this.cfg().features;
    if (f && name in f) return !!f[name];
    return !!this.DEFAULTS[name];
  },
  edition() { return this.cfg().edition || "MAIN"; },
  isWorkgroup() { return this.edition() === "WORKGROUP"; },
  lockMode() { const l = this.cfg().lock; return l && l.mode ? l.mode : "off"; },
  lockHours() { const l = this.cfg().lock; return l && l.hours ? l.hours : 4; },
  // 꺼진 기능 안내 문구 (화면 공통)
  offText(name) { return `${this.LABELS[name] || name} 기능은 Workgroup 판에서 쓰지 않습니다. (Enterprise 판 예정)`; }
};
window.Features = Features;
