// [Project Mgmt] 화면 배치 · 표 밀도
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =============================================================================
// [ver1.0.4] LayoutManager: 화면 레이아웃 타입 & 테이블 밀도(Density) 제어
// =============================================================================
var LayoutManager = {
  // [Standard v1.0.1] 메뉴 위치 2가지 (이전 버전의 다른 레이아웃 값은 위쪽 메뉴로)
  LAYOUT_LABELS: {
    "top-nav": "⬆️ 위쪽 메뉴 (기본)",
    "sidebar-left": "⬅️ 왼쪽 메뉴"
  },
  DENSITIES: ["standard", "compact"],

  init() {
    const savedLayout = (projectConfig && projectConfig.layoutType) || AppStore.getItem("WBS_LAYOUT_TYPE") || "top-nav";
    const savedDensity = (projectConfig && projectConfig.uiDensity) || AppStore.getItem("WBS_UI_DENSITY") || "standard";
    this.setLayout(savedLayout, false);
    this.setDensity(savedDensity, false);
    this.syncThemeSelect();
    this.adjustSidebar();
  },

  adjustSidebar() {
    const header = document.querySelector("header");
    const tabBar = document.querySelector(".tab-bar");
    if (document.body.getAttribute("data-layout") === "sidebar-left") {
      if (header && tabBar) {
        const h = Math.max(header.offsetHeight || 0, 75);
        tabBar.style.top = h + "px";
      }
    } else {
      if (tabBar) tabBar.style.top = "";
    }
  },

  setLayout(layoutType, notify = false) {
    const valid = this.LAYOUT_LABELS[layoutType] ? layoutType : "top-nav";
    document.body.setAttribute("data-layout", valid);
    if (projectConfig) projectConfig.layoutType = valid;
    try { AppStore.setItem("WBS_LAYOUT_TYPE", valid); } catch (e) {}

    // 상단 헤더 드롭다운 및 설정 탭 드롭다운 동기화
    const hdrSel = document.getElementById("headerLayoutSelector");
    if (hdrSel) hdrSel.value = valid;
    const cfgSel = document.getElementById("cfgLayoutTypeSelect");
    if (cfgSel) cfgSel.value = valid;

    // 설정 탭 레이아웃 카드 active 클래스 업데이트
    Object.keys(this.LAYOUT_LABELS).forEach(k => {
      const card = document.getElementById(`layoutCard_${k}`);
      if (card) {
        if (k === valid) card.classList.add("active");
        else card.classList.remove("active");
      }
    });

    const badge = document.getElementById("currentLayoutStatusBadge");
    if (badge) badge.textContent = `현재 메뉴 위치: ${this.LAYOUT_LABELS[valid]}`;

    this.adjustSidebar();

    // 레이아웃 변경 시 대시보드 및 간트차트 폭 재계산
    setTimeout(() => {
      if (typeof renderDashboard === "function") renderDashboard();
      if (typeof renderGantt === "function") renderGantt();
      this.adjustSidebar();
    }, 60);

    if (notify) {
      persistChanges();
      if (typeof showToast === "function") {
        showToast(`메뉴 위치를 [${this.LAYOUT_LABELS[valid]}](으)로 바꿨습니다.`);
      }
    }
  },

  setDensity(densityMode, notify = false) {
    const valid = this.DENSITIES.includes(densityMode) ? densityMode : "standard";
    document.body.setAttribute("data-density", valid);
    if (projectConfig) projectConfig.uiDensity = valid;
    try { AppStore.setItem("WBS_UI_DENSITY", valid); } catch (e) {}

    const cfgDen = document.getElementById("cfgDensitySelect");
    if (cfgDen) cfgDen.value = valid;
    const hdrDen = document.getElementById("gDensitySelect");
    if (hdrDen) hdrDen.value = valid;

    if (notify) {
      persistChanges();
      const labelMap = { standard: "기본", compact: "촘촘" };
      if (typeof showToast === "function") {
        showToast(`화면 밀도를 [${labelMap[valid]}](으)로 바꿨습니다.`);
      }
    }
  },

  syncThemeSelect() {
    const curTheme = document.body.getAttribute("data-theme") || defaultTheme();
    const hdrTheme = document.getElementById("themeSelector");
    if (hdrTheme) hdrTheme.value = curTheme;
    const cfgTheme = document.getElementById("cfgThemeSelect");
    if (cfgTheme) cfgTheme.value = curTheme;
  }
};
