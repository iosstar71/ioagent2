// Workgroup 판: modules/admin/user-admin.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(UserAdmin, {
  async _delete(empNo) {
    if (this.isServer()) {
      const res = await ServerBackend.request("/api/admin/users/delete", { empNo });
      if (!res.ok) return res.message || "삭제하지 못했습니다.";
      this._apply(res);
    } else {
      const { st, list } = this._localUsers();
      const key = String(empNo).toLowerCase();
      if (key === "admin") return "기본 관리자(admin) 계정은 삭제할 수 없습니다.";
      if (key === String(AuthManager.getCurrentUser().empNo).toLowerCase()) return "지금 멤버 선택한 계정은 삭제할 수 없습니다.";
      st.projectUsers = list.filter(u => String(u.empNo || "").toLowerCase() !== key);
      this._localWrite(st, empNo);
    }
    await SyncManager.refresh(["projectUsers"], { silent: true, skipConfirm: true });
    if (!this.isServer()) await this.load();
    return "";
  },

  // ---- 목록 ----
});
