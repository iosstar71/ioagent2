// Workgroup 판: modules/master/project-config.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(SystemTitle, {
  get() { return String((typeof APP_CONFIG !== "undefined" && APP_CONFIG.systemTitle) || "").trim(); },
  async save() {
    const el = document.getElementById("cfgSystemTitle");
    const v = el ? el.value.trim().slice(0, 40) : "";
    const res = await ServerBackend.request("/api/admin/system-title", { title: v });
    if (!res.ok) return showToast("❌ 시스템 타이틀 저장 실패: " + (res.message || ""));
    APP_CONFIG.systemTitle = res.title || "";
    renderProjectTitles();
    showToast(v ? `🏷️ 시스템 타이틀을 [${v}] 로 바꿨습니다. 다른 멤버는 화면을 새로 열면 보입니다.` : "🏷️ 시스템 타이틀을 기본값으로 되돌렸습니다.");
  },
  reset() { const el = document.getElementById("cfgSystemTitle"); if (el) el.value = ""; return this.save(); }
});
// (머리 부분 차이 — 손으로 확인) 

function renderProjectTitles() {
  // 저장된 시스템 명칭의 버전 표기는 현재 프로그램 버전으로 표시
  // [v1.0.10] 시스템 명칭 변경(IOSTAR-PM): 이전 명칭으로 저장된 시스템 타이틀은 새 명칭으로 교체
  if (/AX[ _]Project[ _]Management|AX_PMYS|^IOSTAR-PM/i.test(projectConfig.systemTitle || "")) projectConfig.systemTitle = APP_VERSION.title;
  const sysTitle = String(projectConfig.systemTitle || APP_VERSION.title).replace(/ver\d+\.\d+\.\d+/, "ver" + APP_VERSION.version);
  const projName = projectConfig.projectName || "차세대 통합 구축 프로젝트";

  const hSys = document.getElementById("headerSystemTitleText");
  const hProj = document.getElementById("headerProjectNameBadge");
  const bTitle = document.getElementById("pageBrowserTitle");
  // Standard·Neo: 머리글 제목은 제품 이름만 (버전은 옆 배지에 표시)
  if (hSys) hSys.textContent = SystemTitle.text();
  const hVer = document.getElementById("headerVersionBadge");
  if (hVer) hVer.textContent = (APP_VERSION.editionName ? APP_VERSION.editionName + " " : "") + "v" + APP_VERSION.version;
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
