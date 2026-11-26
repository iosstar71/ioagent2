// =============================================================================
// 날짜 도움 함수 (기준일 · 남은 날 · 마감 표시) — 여러 화면이 함께 씀
//  - DayUtil: addDays · rep(기준일) · status(Task 상태) · store(화면 설정 기억) · daysLeft · dueText
// =============================================================================

var DayUtil = {
  addDays(iso, n) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  rep() { return (projectConfig.reportDate) || new Date().toISOString().slice(0, 10); },
  status(t) { return WBSEngine.getTaskStatus(t, this.rep()); },
  store(key, val) {
    try {
      if (val === undefined) return AppStore.getItem(key);
      AppStore.setItem(key, val);
    } catch (e) { return null; }
    return val;
  },
  // 기준일 기준 마감까지 남은 날 (음수 = 지남)
  daysLeft(iso) {
    if (!iso) return null;
    return Math.round((new Date(iso + "T00:00:00").getTime() - new Date(this.rep() + "T00:00:00").getTime()) / 86400000);
  },
  dueText(iso) {
    const n = this.daysLeft(iso);
    if (n === null) return "";
    if (n < 0) return `${-n}일 지남`;
    if (n === 0) return "오늘 마감";
    return `D-${n}`;
  }
};
