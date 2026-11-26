// =============================================================================
// [Local] 멤버 PC 에서 바꾼 암호를 PM 쪽에 반영 (MemberCred)
// -----------------------------------------------------------------------------
//  멤버가 [📤 내 작업 파일 다운로드 (JSON)] 하면 파일에 자기 암호 정보(해시 · 바꾼 시각 pwdAt)를 넣고,
//  PM 이 그 파일을 합칠 때 PM 쪽 멤버 정보의 암호를 바꾼 시각이 더 새 것으로 맞춤 → [💾 저장]하면 기록
//   - 암호 원문은 넣지 않음 (해시만). 마스터 파일 · 배포용 latest.json 에는 넣지 않음 (서버에 올라가는 파일이라)
//   - 받는 조건: 파일을 보낸 멤버 본인 정보 · 이 프로젝트의 멤버 · PL (관리자 · PM 계정은 파일로 바꾸지 않음),
//     파일의 범위가 그 멤버의 담당 서브시스템 안 · PM 이 그 뒤에 바꾸거나 초기화했으면(pwdAt 이 더 새로우면) 그대로
// =============================================================================
var MemberCred = {
  // 내 작업 파일에 넣을 내 암호 정보 (바꾼 적이 없거나 초기 암호 · 임시 암호면 없음)
  mine() {
    if (!SyncManager.isLocal()) return null;
    const me = AuthManager.getCurrentUser() || {};
    const u = AuthManager.findUser(me.empNo);
    if (!u || !u.pwdHash || u.pwdTemp || !u.pwdAt) return null;
    return { empNo: u.empNo, pwdHash: u.pwdHash, pwdAt: u.pwdAt };
  },
  // 파일의 암호 정보를 반영할 수 있는지 → { ok, why, user }
  check(cred, src) {
    if (!cred || !cred.empNo || !/^[0-9a-f]{64}$/.test(String(cred.pwdHash || ""))) return { ok: false, why: "암호 정보 형식이 맞지 않음" };
    if (src && src.exportedByEmpNo && String(src.exportedByEmpNo).toLowerCase() !== String(cred.empNo).toLowerCase()) return { ok: false, why: "보낸 멤버와 암호 정보의 멤버가 다름" };
    const u = (projectUsers || []).find(x => String(x.empNo || "").toLowerCase() === String(cred.empNo).toLowerCase());
    if (!u) return { ok: false, why: `이 프로젝트에 없는 멤버(${cred.empNo})` };
    const a = ProjectContext.member(u, ProjectContext.current);
    const role = AuthManager.normalizeRole(a && a.role);
    if (ProjectContext.isAdminUser(u) || !a || !["MEMBER", "LEAD"].includes(role)) return { ok: false, why: "관리자 · PM 계정의 암호는 파일로 바꾸지 않음" };
    if (src && src.targetScope && !SubsysList.isAll(src.targetScope) && !SubsysList.parse(src.targetScope).every(x => SubsysList.has(a.subsystem, x))) return { ok: false, why: "파일 범위가 그 멤버의 담당이 아님" };
    if (String(u.pwdAt || "") >= String(cred.pwdAt || "")) return { ok: false, why: "이미 같거나 더 새 암호", same: true, user: u };
    return { ok: true, user: u };
  },
  // 반영 → 화면 알림용 글 ("" = 바꾼 것 없음)
  apply(cred, src) {
    const c = this.check(cred, src);
    if (!c.ok) { if (!c.same) console.warn("[MemberCred] skipped:", c.why); return ""; }
    Object.assign(c.user, { pwdHash: cred.pwdHash, pwdTemp: false, pwdAt: cred.pwdAt });
    delete c.user.pwdReset;
    return I18N.tf("{id} 암호 갱신", { id: c.user.empNo });
  }
};
window.MemberCred = MemberCred;
