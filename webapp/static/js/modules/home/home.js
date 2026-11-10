// [IOSTAR-PM] 홈 화면
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =========================================================================
// [IOSTAR-PM ver1.0.4] 맞춤형 홈 화면 관리자 (HomeScreenManager)
// 🏛️ 2. 이그제큐티브 브리핑 룸 / 🚀 3. 하이브리드 스마트 포털 및 권한별 설정
// =========================================================================
var HomeScreenManager = {
  _sessionMode: null, // (이전 버전 호환)
  // [v2.4.0] 홈 스타일 3가지 — 역할별 기본값(시스템 설정) + 사용자가 홈 위쪽 단추로 고른 스타일(사용자별 기억)
  STYLES: ["EXECUTIVE", "PORTAL", "TODO"],
  STYLE_LABELS: { EXECUTIVE: "📊 브리핑", PORTAL: "🧰 워크벤치", TODO: "✅ 내 할 일" },
  STYLE_KEY: "IOSTAR_HOME_STYLE_",

  init() {
    this.ensureConfig();
    this.syncConfigUi();
  },

  ensureConfig() {
    if (typeof projectConfig === "undefined") return;
    if (!projectConfig.roleHomeSettings) {
      projectConfig.roleHomeSettings = {
        SYS_ADMIN: "EXECUTIVE",
        PM: "EXECUTIVE",
        MEMBER: "TODO"
      };
    }
    if (!projectConfig.exportSettings) {
      projectConfig.exportSettings = {
        exportTheme: "Official Navy",
        exportFontSize: 10,
        exportFont: "맑은 고딕",
        xlsxTheme: "Official Navy",
        xlsxFontSize: 10,
        docxTheme: "Official Navy",
        docxFontSize: 10,
        docxFont: "맑은 고딕"
      };
    } else {
      if (!projectConfig.exportSettings.exportTheme) {
        projectConfig.exportSettings.exportTheme = projectConfig.exportSettings.unifiedTheme || projectConfig.exportSettings.docxTheme || projectConfig.exportSettings.xlsxTheme || "Official Navy";
      }
      if (!projectConfig.exportSettings.exportFont) {
        projectConfig.exportSettings.exportFont = projectConfig.exportSettings.docxFont || projectConfig.exportSettings.xlsxFont || "맑은 고딕";
      }
      if (!projectConfig.exportSettings.exportFontSize) {
        projectConfig.exportSettings.exportFontSize = projectConfig.exportSettings.docxFontSize || projectConfig.exportSettings.xlsxFontSize || 10;
      }
    }
  },

  syncConfigUi() {
    this.ensureConfig();
    const cfg = projectConfig.roleHomeSettings || {};
    const exp = projectConfig.exportSettings || {};

    const selAdmin = document.getElementById("cfgRoleHomeSysAdmin");
    const selPM = document.getElementById("cfgRoleHomePM");
    const selMember = document.getElementById("cfgRoleHomeMember");

    if (selAdmin) selAdmin.value = cfg.SYS_ADMIN || "EXECUTIVE";
    if (selPM) selPM.value = cfg.PM || "EXECUTIVE";
    if (selMember) selMember.value = cfg.MEMBER || "TODO";

    const selUnifiedTheme = document.getElementById("cfgExportUnifiedTheme");
    const selUnifiedFont = document.getElementById("cfgExportUnifiedFont");
    const selUnifiedSize = document.getElementById("cfgExportUnifiedFontSize");

    const curTheme = exp.exportTheme || exp.unifiedTheme || exp.docxTheme || exp.xlsxTheme || "Official Navy";
    const curFont = exp.exportFont || exp.docxFont || exp.xlsxFont || "맑은 고딕";
    const curSize = String(exp.exportFontSize || exp.docxFontSize || exp.xlsxFontSize || 10);

    if (selUnifiedTheme) selUnifiedTheme.value = ExcelSync.normalizeExportTheme(curTheme);
    const fc = document.getElementById("cfgFileCode");
    if (fc) fc.value = projectConfig.fileCode || "";
    this.renderFileNameSample();
    if (selUnifiedFont) selUnifiedFont.value = curFont;
    if (selUnifiedSize) selUnifiedSize.value = curSize;
  },

  // 역할별 기본 홈 스타일
  roleDefault() {
    this.ensureConfig();
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : { role: "SYS_ADMIN" };
    const normRole = (typeof AuthManager !== "undefined" && typeof AuthManager.normalizeRole === "function")
      ? AuthManager.normalizeRole(curUser.role)
      : (curUser.role ? curUser.role.toUpperCase() : "MEMBER");

    const settings = projectConfig.roleHomeSettings || {};
    const ok = m => (this.STYLES.indexOf(m) !== -1 ? m : null);
    if (normRole === "SYS_ADMIN") return ok(settings.SYS_ADMIN) || "EXECUTIVE";
    if (normRole === "PM" || normRole === "LEAD") return ok(settings.PM) || "EXECUTIVE";
    return ok(settings.MEMBER) || "TODO";
  },

  _styleKey() {
    const u = typeof AuthManager !== "undefined" ? AuthManager.getCurrentUser() : null;
    return this.STYLE_KEY + String((u && u.empNo) || "guest").toLowerCase();
  },
  userStyle() {
    try { const v = localStorage.getItem(this._styleKey()); return this.STYLES.indexOf(v) !== -1 ? v : null; } catch (e) { return null; }
  },
  getEffectiveMode() {
    return this.userStyle() || this.roleDefault();
  },

  getCurrentMode() {
    return this.getEffectiveMode();
  },

  // 사용자가 홈 위쪽 단추로 홈 스타일을 고름 (사용자별 기억, 역할 기본값과 같으면 기억 지움)
  setStyle(mode) {
    if (this.STYLES.indexOf(mode) === -1) return;
    try {
      if (mode === this.roleDefault()) localStorage.removeItem(this._styleKey());
      else localStorage.setItem(this._styleKey(), mode);
    } catch (e) {}
    this.render();
  },

  setSessionMode(mode) { this.setStyle(mode); },

  openSettings() {
    if (typeof AuthManager !== "undefined" && AuthManager.TAB_POLICY["tab-config"] && !AuthManager.canAccessTab(AuthManager.getCurrentRole(), "tab-config")) {
      showToast("ℹ️ 홈 스타일은 위쪽 [브리핑 · 워크벤치 · 내 할 일] 단추로 바꿀 수 있습니다. 역할별 기본 홈은 시스템 관리자가 정합니다.");
      return;
    }
    switchTab("tab-config");
    setTimeout(() => {
      try { SubTabs.show("config", "screen"); } catch (e) {}
      const el = document.getElementById("cfgRoleHomeSysAdmin");
      const card = el && el.closest(".card");
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "start" }); card.classList.add("g-flash-card"); setTimeout(() => card.classList.remove("g-flash-card"), 1800); }
    }, 200);
  },

  applyRoleMode() {
    this._sessionMode = null; // Clear manual override when user changes
    this.render();
  },

  previewMode(mode) {
    switchTab("tab-home");
    this.setStyle(mode);
  },

  onRoleHomeSettingChange(role, mode) {
    this.ensureConfig();
    projectConfig.roleHomeSettings[role] = mode;
    if (typeof persistChanges === "function") persistChanges();
    this.render();
    showToast(`🏠 [${role}] 역할의 기본 홈을 [${this.STYLE_LABELS[mode] || mode}](으)로 정했습니다.`);
  },

  onExportSettingChange(key, value) {
    this.ensureConfig();
    projectConfig.exportSettings[key] = value;
    if (key === "exportTheme" || key === "unifiedTheme") {
      projectConfig.exportSettings.exportTheme = value;
      projectConfig.exportSettings.unifiedTheme = value;
      projectConfig.exportSettings.xlsxTheme = value;
      projectConfig.exportSettings.docxTheme = value;
    } else if (key === "exportFont") {
      projectConfig.exportSettings.exportFont = value;
      projectConfig.exportSettings.docxFont = value;
      projectConfig.exportSettings.xlsxFont = value;
    } else if (key === "exportFontSize") {
      const num = parseInt(value, 10) || 10;
      projectConfig.exportSettings.exportFontSize = num;
      projectConfig.exportSettings.docxFontSize = num;
      projectConfig.exportSettings.xlsxFontSize = num;
    }
    if (typeof persistChanges === "function") persistChanges();
    showToast(`📊 공통 보고서 스타일이 '${value}'(으)로 일원화 설정되었습니다. 주간보고 워드, 회의록 워드, 공정표 XLSX 다운로드 시 즉시 반영됩니다.`);
  },

  // [v3.1.0] 주간보고 파일 이름 약칭
  onFileCodeChange(v) {
    projectConfig.fileCode = WeeklyExport.safe(v).slice(0, 20);
    const fc = document.getElementById("cfgFileCode");
    if (fc) fc.value = projectConfig.fileCode;
    this.renderFileNameSample();
    if (typeof persistChanges === "function") persistChanges();
  },
  renderFileNameSample() {
    const el = document.getElementById("cfgFileNameSample");
    if (!el || typeof WeeklyExport === "undefined") return;
    el.textContent = `예) ${WeeklyExport.fileCode()}_주간보고_2027W22_ALL_DOC-T_v2.docx`;
  },

  render() {
    this.ensureConfig();
    const mode = this.getCurrentMode();
    const roleDef = this.roleDefault();
    document.querySelectorAll(".home-style-btn").forEach(btn => {
      const on = btn.getAttribute("data-home-style") === mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const badge = document.getElementById("homeModeStatusBadge");
    if (badge) {
      badge.textContent = mode === roleDef ? "역할 기본 홈" : "내가 고른 홈";
      badge.title = `역할 기본: ${this.STYLE_LABELS[roleDef]}`;
    }
    // [v3.0.2] 홈 스타일 단추는 머리줄 맨 오른쪽에 고정 (안내 문구 길이가 바뀌어도 단추 위치가 움직이지 않게)
    const sw = document.querySelector("#tab-home .home-style-switch");
    if (sw && sw.parentElement) {
      if (badge && badge.parentElement === sw.parentElement && badge.nextElementSibling !== sw) sw.parentElement.insertBefore(badge, sw);
      if (sw.parentElement.lastElementChild !== sw) sw.parentElement.appendChild(sw);
    }

    if (mode === "EXECUTIVE" && typeof ExecReport !== "undefined") { try { ExecReport.render(); } catch (e) { console.warn(e); } }
    const boxes = { EXECUTIVE: "homeExecutiveContainer", PORTAL: "homePortalContainer", TODO: "homeTodoContainer" };
    Object.keys(boxes).forEach(k => {
      const el = document.getElementById(boxes[k]);
      if (el) el.style.display = k === mode ? "block" : "none";
    });
    if (mode === "EXECUTIVE") this.renderExecutive();
    else if (mode === "PORTAL") this.renderPortal();
    else if (typeof TodoCenter !== "undefined") TodoCenter.render();
    if (typeof TodoCenter !== "undefined") TodoCenter.updateCounts();
    if (typeof I18N !== "undefined") I18N.translateTree(document.getElementById("tab-home"));
  },

  renderExecutive() {
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "27년 가동률 시스템 개선";
    const repDay = (typeof WBSEngine !== "undefined" && WBSEngine.getDayOfWeekText) ? WBSEngine.getDayOfWeekText(repDate) : "화";

    // 1. Calculate overall metrics
    const rootItems = (wbsData || []).filter(d => d.level === 1);
    const totalWeight = rootItems.reduce((acc, d) => acc + (parseFloat(d.weight) || 1), 0) || 1;
    const totalPlan = Math.round(rootItems.reduce((acc, d) => acc + (d.pProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
    const totalActual = Math.round(rootItems.reduce((acc, d) => acc + (d.aProg * (parseFloat(d.weight) || 1)), 0) / totalWeight);
    const gap = totalActual - totalPlan;
    const achieveRate = totalPlan > 0 ? ((totalActual / totalPlan) * 100).toFixed(1) : (totalActual > 0 ? "100.0" : "0.0");
    const achieveNum = parseFloat(achieveRate);

    // Hero Banner DOM
    const heroTitle = document.getElementById("execHeroProjTitle");
    const heroMeta = document.getElementById("execHeroMeta");
    const heroAchieve = document.getElementById("execHeroAchieveRate");
    const heroGap = document.getElementById("execHeroGap");
    const heroPlan = document.getElementById("execHeroPlanRate");
    const heroActual = document.getElementById("execHeroActualRate");
    const heroBadge = document.getElementById("execHeroStatusBadge");

    if (heroTitle) heroTitle.textContent = projName;
    if (heroMeta) {
      let wLabel = "2027년 22주차";
      if (typeof WeeklyReportManager !== "undefined" && WeeklyReportManager.findWeekForDate) {
        const wObj = WeeklyReportManager.findWeekForDate(repDate);
        if (wObj) wLabel = wObj.fullLabel;
      }
      heroMeta.innerHTML = `공정 기준일: <b>${repDate} (${repDay})</b> | 대상: <b>${wLabel}</b> | 총괄 PM: <b>${escapeHtml(((projectUsers || []).find(u => AuthManager.normalizeRole(u.role) === "PM") || {}).name || "-")}</b>`;
    }
    if (heroAchieve) heroAchieve.textContent = `${achieveRate}%`;
    if (heroGap) {
      heroGap.textContent = `공정 GAP: ${gap >= 0 ? "+" : ""}${gap}%p (${gap >= 0 ? "목표 초과" : "계획 대비 지연"})`;
      heroGap.style.color = gap >= 0 ? "#86efac" : (gap >= -5 ? "#fde047" : "#fca5a5");
    }
    if (heroPlan) heroPlan.textContent = `${totalPlan}%`;
    if (heroActual) heroActual.textContent = `${totalActual}%`;
    if (heroBadge) {
      if (achieveNum >= 90) {
        heroBadge.textContent = "🟢 정상 공정 궤도";
        heroBadge.style.background = "#22c55e";
      } else if (achieveNum >= 70) {
        heroBadge.textContent = "🟡 주의 및 경계 관리";
        heroBadge.style.background = "#eab308";
      } else {
        heroBadge.textContent = "🔴 공정 지연 리스크";
        heroBadge.style.background = "#ef4444";
      }
    }

    // 2. 5-KPI Strip
    // [v2.4.0] 지연 판정은 WBS·대시보드와 같은 기준 (최하위 Task, 계획 대비 실적 1%p 이상 부족)
    const delayedTasks = (wbsData || []).filter(t => t.isLeaf && WBSEngine.getTaskStatus(t, repDate).code === "delayed");
    const delayedCount = delayedTasks.length;

    const elKpiActual = document.getElementById("execKpiWbsActual");
    const elKpiSub = document.getElementById("execKpiWbsSub");
    if (elKpiActual) elKpiActual.textContent = `${totalActual}%`;
    if (elKpiSub) elKpiSub.textContent = `목표 계획: ${totalPlan}% (달성률 ${achieveRate}%)`;

    const elKpiDelay = document.getElementById("execKpiDelayed");
    const elKpiDelaySub = document.getElementById("execKpiDelayedSub");
    if (elKpiDelay) {
      elKpiDelay.textContent = `${delayedCount}건`;
      elKpiDelay.style.color = delayedCount === 0 ? "#15803d" : "#b91c1c";
    }
    if (elKpiDelaySub) {
      elKpiDelaySub.textContent = delayedCount === 0 ? "지연 리스크 정상 통제" : "중점 만회 대책 필요";
      elKpiDelaySub.style.color = delayedCount === 0 ? "#15803d" : "#b91c1c";
    }

    const validReqs = (reqMasterData || []).filter(r => r.status !== "삭제");
    const reqDone = validReqs.filter(r => r.status === "완료").length;
    const reqRate = validReqs.length > 0 ? Math.round((reqDone / validReqs.length) * 100) : 0;
    const elKpiReq = document.getElementById("execKpiReqRate");
    const elKpiReqSub = document.getElementById("execKpiReqSub");
    if (elKpiReq) elKpiReq.textContent = `${reqRate}%`;
    if (elKpiReqSub) elKpiReqSub.textContent = `완료 ${reqDone}건 / 전체 ${validReqs.length}건`;

    const activeRounds = (typeof getActiveDeliverableRounds === "function") ? getActiveDeliverableRounds() : ["1회차", "2회차"];
    const validDelivs = (deliverablesData || []).filter(d => activeRounds.includes(d.round));
    const delivDone = validDelivs.filter(d => d.status === "보완완료").length;
    const delivRate = validDelivs.length > 0 ? Math.round((delivDone / validDelivs.length) * 100) : 0;

    const validVocs = (vocData || []).filter(v => v.status !== "삭제");
    const vocWait = validVocs.filter(v => v.status === "착수전" || v.status === "대기" || v.status === "보류").length;
    const vocProg = validVocs.filter(v => v.status === "진행").length;
    const vocDone = validVocs.filter(v => v.status === "완료" || v.status === "제외").length;
    const vocRate = validVocs.length > 0 ? Math.round((vocDone / validVocs.length) * 100) : 0;

    const elKpiDelivVoc = document.getElementById("execKpiDelivVoc");
    const elKpiDelivVocSub = document.getElementById("execKpiDelivVocSub");
    if (elKpiDelivVoc) elKpiDelivVoc.textContent = `산출물 ${delivRate}% · VOC ${vocRate}%`;
    if (elKpiDelivVocSub) elKpiDelivVocSub.textContent = `산출물 ${delivDone}/${validDelivs.length}건 승인 | VOC ${vocDone}/${validVocs.length}건 조치`;

    // 3. Subsystem Traffic Light Tiles Grid
    const gridEl = document.getElementById("execSubsystemGrid");
    if (gridEl) {
      gridEl.innerHTML = "";
      const sysNames = (typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : [];
      sysNames.forEach(sys => {
        const root = (wbsData || []).find(d => d.system === sys && d.level === 1);
        const pProg = root ? root.pProg : 0;
        const aProg = root ? root.aProg : 0;
        const rate = pProg > 0 ? ((aProg / pProg) * 100).toFixed(1) : (aProg > 0 ? "100.0" : "0.0");
        const rateNum = parseFloat(rate);

        const meta = (subsystemsMeta || []).find(s => s.name === sys) || {};
        const pmName = meta.pm || "담당PM";
        const sysType = meta.type || "SDLC";
        const sysDelays = (wbsData || []).filter(t => t.system === sys && t.isLeaf && t.pProg > t.aProg && t.pEnd && t.pEnd < repDate).length;

        let lightIcon = "🟢";
        let lightText = "정상";
        let cardBorder = "#10b981";
        let rateColor = "#15803d";

        if (rateNum < 70) {
          lightIcon = "🔴";
          lightText = "경고";
          cardBorder = "#ef4444";
          rateColor = "#b91c1c";
        } else if (rateNum < 90) {
          lightIcon = "🟡";
          lightText = "주의";
          cardBorder = "#f59e0b";
          rateColor = "#b45309";
        }

        const tile = document.createElement("div");
        tile.className = "card";
        tile.style.margin = "0";
        tile.style.border = `1px solid ${cardBorder}`;
        tile.style.borderTop = `4px solid ${cardBorder}`;
        tile.style.padding = "12px 14px";
        tile.style.cursor = "pointer";
        tile.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
        tile.onmouseenter = () => { tile.style.transform = "translateY(-2px)"; tile.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)"; };
        tile.onmouseleave = () => { tile.style.transform = "none"; tile.style.boxShadow = "none"; };
        tile.onclick = () => HomeScreenManager.jumpToSubsystem(sys);
        tile.title = `${sys} (${pmName}) 상세 공정 WBS 화면으로 이동`;

        tile.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:800; font-size:var(--fs-base, 13px); color:#1e293b;">${escapeHtml(sys)}</div>
            <div style="font-size:var(--fs-xs, 11px); font-weight:700; display:flex; align-items:center; gap:3px;">
              <span>${lightIcon}</span>
              <span style="color:${rateColor};">${lightText}</span>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:#64748b;">달성률</span>
            <span style="font-size:calc(20px * var(--fs-scale, 1)); font-weight:900; color:${rateColor};">${rate}%</span>
          </div>
          <div style="width:100%; background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${Math.min(100, aProg)}%; background:${cardBorder}; height:100%;"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:var(--fs-xs, 11px); color:#475569; border-top:1px dashed #e2e8f0; padding-top:6px;">
            <span>계획 <b>${pProg}%</b> / 실적 <b>${aProg}%</b></span>
            <span>${sysDelays > 0 ? `<b style="color:#ef4444;">지연 ${sysDelays}</b>` : '<span style="color:#10b981;">지연 0</span>'}</span>
          </div>
          <div style="font-size:var(--fs-2xs, 10px); color:#94a3b8; margin-top:4px; display:flex; justify-content:space-between;">
            <span>PM: ${escapeHtml(pmName)}</span>
            <span class="badge" style="font-size:calc(9px * var(--fs-scale, 1)); padding:1px 4px;">${sysType}</span>
          </div>
        `;
        gridEl.appendChild(tile);
      });
    }

    // 4. Domain Portfolio Table
    const domTbody = document.getElementById("execDomainPortfolioBody");
    if (domTbody) {
      domTbody.innerHTML = "";
      const domains = (typeof projectConfig !== "undefined" && projectConfig.domains) ? projectConfig.domains : ["관리공통", "개선공정", "신규공정"];
      domains.forEach(dName => {
        const dSubs = (subsystemsMeta || []).filter(s => s.domain === dName).map(s => s.name);
        const dTasks = (wbsData || []).filter(t => dSubs.includes(t.system) && t.isLeaf);
        const dRoots = (wbsData || []).filter(t => dSubs.includes(t.system) && t.level === 1);
        const dWeight = dRoots.reduce((acc, t) => acc + (parseFloat(t.weight) || 1), 0);
        const dPlan = dWeight > 0 ? Math.round(dRoots.reduce((acc, t) => acc + (t.pProg * (parseFloat(t.weight) || 1)), 0) / dWeight) : 0;
        const dActual = dWeight > 0 ? Math.round(dRoots.reduce((acc, t) => acc + (t.aProg * (parseFloat(t.weight) || 1)), 0) / dWeight) : 0;
        const dRate = dPlan > 0 ? Math.round((dActual / dPlan) * 100) : (dActual > 0 ? 100 : 0);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${escapeHtml(dName)}</strong></td>
          <td>${dTasks.length}개</td>
          <td>${dWeight}%</td>
          <td>${dPlan}%</td>
          <td><strong>${dActual}%</strong></td>
          <td style="font-weight:700; color:${dRate >= 90 ? "#15803d" : (dRate >= 70 ? "#b45309" : "#b91c1c")};">${dRate}%</td>
          <td><span class="status-tag ${dRate >= 90 ? "tag-completed" : (dRate >= 70 ? "tag-progress" : "tag-delayed")}">${dRate >= 90 ? "정상" : (dRate >= 70 ? "주의" : "지연")}</span></td>
        `;
        domTbody.appendChild(tr);
      });
    }
  },

  jumpToSubsystem(sysName) {
    const sel = document.getElementById("wbsSubsystemFilter");
    if (sel) {
      sel.value = sysName;
      if (typeof onDomainFilterChanged === "function") {
        onDomainFilterChanged("wbsDomainFilter", "wbsSubsystemFilter");
      }
    }
    switchTab("tab-wbs");
    showToast(`🏢 [${sysName}] 서브시스템 WBS 공정 화면으로 이동했습니다.`);
  },

  renderPortal() {
    this.renderPortalFilterOptions();
    this.renderPortalTasks();
    this.renderPortalSummaryCards();
    this.renderPortalNotices();
    this.renderPortalChat();
  },

  renderPortalFilterOptions() {
    const sel = document.getElementById("portalTaskFilterSubsystem");
    if (!sel) return;
    const curVal = sel.value || "ALL";
    const sysNames = (typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : [];
    sel.innerHTML = `<option value="ALL">전체 서브시스템</option>` + sysNames.map(s => `<option value="${s}" ${s === curVal ? "selected" : ""}>${s} 서브시스템</option>`).join("");
  },

  renderPortalTasks() {
    const tbody = document.getElementById("portalTasksTableBody");
    const badge = document.getElementById("portalTaskCountBadge");
    if (!tbody) return;
    tbody.innerHTML = "";

    const sel = document.getElementById("portalTaskFilterSubsystem");
    const filterSys = sel ? sel.value : "ALL";
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";

    let uncompleted = (wbsData || []).filter(t => t.isLeaf && (t.aProg < 100 || t.status !== "완료"));
    if (filterSys !== "ALL") {
      uncompleted = uncompleted.filter(t => t.system === filterSys);
    }

    if (badge) badge.textContent = `${uncompleted.length}건 진행중`;

    if (uncompleted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-muted); font-size:var(--fs-sm, 12px);">🎉 모든 과업이 100% 완료되었거나 필터 조건에 해당하는 미완료 Task이 없습니다.</td></tr>`;
      return;
    }

    uncompleted.slice(0, 15).forEach(t => {
      const st = WBSEngine.getTaskStatus(t, repDate);
      const stTag = `<span class="status-tag ${st.cssClass}">${st.label}</span>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="badge" style="background:#f1f5f9; color:#334155; font-size:var(--fs-2xs, 10px);">${escapeHtml(t.system)}</span></td>
        <td><strong>${escapeHtml(t.id)}</strong></td>
        <td style="text-align:left; font-weight:600; color:#1e293b;">${escapeHtml(t.name)}</td>
        <td style="font-size:var(--fs-xs, 11px); color:#64748b;">${escapeHtml(t.pStart || "-")} ~ ${escapeHtml(t.pEnd || "-")}</td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <div style="flex:1; background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden;">
              <div style="width:${t.aProg || 0}%; background:#2563eb; height:100%;"></div>
            </div>
            <span style="font-size:var(--fs-xs, 11px); font-weight:700; color:#2563eb; width:30px; text-align:right;">${t.aProg || 0}%</span>
          </div>
        </td>
        <td>${stTag}</td>
        <td style="text-align:center;">
          <button class="btn btn-success btn-xs" data-click="HomeScreenManager.markTaskComplete" data-click-args="${UiEvents.args(String(t.id))}" style="padding:2px 8px; font-weight:700; font-size:var(--fs-2xs, 10px);" title="이 과업의 실적을 즉시 100% 완료 상태로 반영">
            ✓ 100% 완료
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  markTaskComplete(taskId) {
    const task = (wbsData || []).find(t => t.id === taskId);
    if (!task) return;
    task.aProg = 100;
    task.status = "완료";
    const repDate = (typeof projectConfig !== "undefined" && projectConfig.reportDate) || "2027-06-01";
    if (!task.aEnd) task.aEnd = repDate;

    if (typeof WBSEngine !== "undefined" && typeof WBSEngine.rollup === "function") {
      WBSEngine.rollup(wbsData);
    }

    this.render();
    if (typeof renderWbsTable === "function") renderWbsTable();
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof renderPhaseMatrix === "function") renderPhaseMatrix();
    if (typeof StorageManager !== "undefined") StorageManager.saveAll(false);
    showToast(`✅ [과업 완료] WBS [${task.id}] '${task.name}' 과업이 100% 완료 처리되었습니다.`);
  },

  renderPortalSummaryCards() {
    const sel = document.getElementById("portalTaskFilterSubsystem");
    const filterSys = sel ? sel.value : "ALL";

    // REQ
    let reqs = (reqMasterData || []).filter(r => r.status !== "삭제");
    if (filterSys !== "ALL") reqs = reqs.filter(r => r.system === filterSys);
    const reqDone = reqs.filter(r => r.status === "완료").length;
    const reqRate = reqs.length > 0 ? Math.round((reqDone / reqs.length) * 100) : 0;
    const elRVal = document.getElementById("portalReqStatValue");
    const elRSub = document.getElementById("portalReqStatSub");
    if (elRVal) elRVal.textContent = `${reqDone}/${reqs.length}건`;
    if (elRSub) elRSub.textContent = `완료율 ${reqRate}%`;

    // Deliv
    const activeRounds = (typeof getActiveDeliverableRounds === "function") ? getActiveDeliverableRounds() : ["1회차", "2회차"];
    let delivs = (deliverablesData || []).filter(d => activeRounds.includes(d.round));
    if (filterSys !== "ALL") delivs = delivs.filter(d => d.system === filterSys);
    const delivDone = delivs.filter(d => d.status === "보완완료").length;
    const delivRate = delivs.length > 0 ? Math.round((delivDone / delivs.length) * 100) : 0;
    const elDVal = document.getElementById("portalDelivStatValue");
    const elDSub = document.getElementById("portalDelivStatSub");
    if (elDVal) elDVal.textContent = `${delivDone}/${delivs.length}건`;
    if (elDSub) elDSub.textContent = `승인율 ${delivRate}%`;

    // VOC
    let vocs = (vocData || []).filter(v => v.status !== "삭제");
    if (filterSys !== "ALL") vocs = vocs.filter(v => v.system === filterSys);
    const vocDone = vocs.filter(v => v.status === "완료" || v.status === "제외").length;
    const vocRate = vocs.length > 0 ? Math.round((vocDone / vocs.length) * 100) : 0;
    const elVVal = document.getElementById("portalVocStatValue");
    const elVSub = document.getElementById("portalVocStatSub");
    if (elVVal) elVVal.textContent = `${vocDone}/${vocs.length}건`;
    if (elVSub) elVSub.textContent = `조치율 ${vocRate}%`;
  },

  renderPortalNotices() {
    const listEl = document.getElementById("portalNoticesList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const notices = (typeof noticesData !== "undefined" && Array.isArray(noticesData))
      ? noticesData
      : ((typeof projectNoticesData !== "undefined" && Array.isArray(projectNoticesData)) ? projectNoticesData : []);

    if (notices.length === 0) {
      listEl.innerHTML = `<div style="font-size:var(--fs-xs, 11px); color:#64748b; padding:12px; text-align:center;">등록된 공지사항이 없습니다. 상단 [공지 전체보기] 버튼을 눌러 등록하세요.</div>`;
      return;
    }
    notices.slice(0, 4).forEach(n => {
      const item = document.createElement("div");
      item.style.padding = "7px 10px";
      item.style.borderLeft = n.priority === "긴급" ? "3px solid #ef4444" : (n.priority === "중요" ? "3px solid #f59e0b" : "3px solid #3b82f6");
      item.style.background = "#f8fafc";
      item.style.borderRadius = "4px";
      item.style.cursor = "pointer";
      item.style.transition = "background 0.15s ease, transform 0.15s ease";
      item.onmouseenter = () => { item.style.background = "#eff6ff"; item.style.transform = "translateX(2px)"; };
      item.onmouseleave = () => { item.style.background = "#f8fafc"; item.style.transform = "none"; };
      item.title = "클릭 시 공지사항 탭으로 바로 이동합니다.";
      item.onclick = () => {
        switchTab("tab-notices");
        if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.switchSubTab === "function") {
          NoticeCommManager.switchSubTab("NOTICES");
        }
      };
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:calc(11.5px * var(--fs-scale, 1));">
          <strong style="color:var(--primary);">${n.isPinned ? "📌 " : ""}${escapeHtml(n.title)}</strong>
          <span style="font-size:var(--fs-2xs, 10px); color:#64748b;">${escapeHtml(n.date || "")}</span>
        </div>
        <div style="font-size:var(--fs-xs, 11px); color:#475569; margin-top:3px; line-height:1.4;">${escapeHtml((n.content || "").substring(0, 55))}${n.content && n.content.length > 55 ? "..." : ""}</div>
      `;
      listEl.appendChild(item);
    });
  },

  renderPortalChat() {
    const stream = document.getElementById("portalChatStream");
    if (!stream) return;
    stream.innerHTML = "";

    // 소통 피드 데이터(communicationsData) 우선 연동
    const comms = (typeof communicationsData !== "undefined" && Array.isArray(communicationsData) && communicationsData.length > 0)
      ? communicationsData
      : ((typeof teamChatMessages !== "undefined" && Array.isArray(teamChatMessages)) ? teamChatMessages : []);

    if (comms.length === 0) {
      stream.innerHTML = `<div style="color:#94a3b8; font-size:var(--fs-xs, 11px); text-align:center; padding:16px;">등록된 소통 피드 메시지가 없습니다. 하단 입력창에서 메시지를 작성해보세요.</div>`;
      return;
    }

    const recent = comms.slice(0, 6);
    recent.forEach(m => {
      const p = document.createElement("div");
      p.style.marginBottom = "6px";
      p.style.padding = "5px 8px";
      p.style.borderRadius = "4px";
      p.style.background = "#ffffff";
      p.style.border = "1px solid #e2e8f0";
      p.style.fontSize = "var(--fs-xs, 11px)";
      p.style.cursor = "pointer";
      p.style.transition = "background 0.15s ease";
      p.onmouseenter = () => { p.style.background = "#eff6ff"; };
      p.onmouseleave = () => { p.style.background = "#ffffff"; };
      p.title = "클릭 시 소통 피드 탭으로 바로 이동합니다.";
      p.onclick = () => {
        switchTab("tab-notices");
        if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.switchSubTab === "function") {
          NoticeCommManager.switchSubTab("FEED");
        }
      };

      const sender = m.author || m.sender || "팀원";
      const channel = m.channel ? `[#${m.channel}] ` : "";
      const text = m.content || m.text || "";
      const time = m.createdAt ? m.createdAt.substring(5, 16) : (m.time || "");

      p.innerHTML = `<span style="font-weight:700; color:#2563eb;">${escapeHtml(channel)}${escapeHtml(sender)}:</span> <span style="color:#334155;">${escapeHtml(text)}</span> <span style="color:#94a3b8; font-size:calc(9.5px * var(--fs-scale, 1)); margin-left:4px;">(${escapeHtml(time)})</span>`;
      stream.appendChild(p);
    });
    stream.scrollTop = stream.scrollHeight;
  },

  sendQuickMessage() {
    const input = document.getElementById("portalChatInput");
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();

    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : { name: "관리자", subsystem: "PMO", role: "SYS_ADMIN" };

    const nowStr = new Date().toISOString().substring(0, 16).replace("T", " ");

    const newPost = {
      id: Date.now(),
      channel: "전체",
      author: curUser.name || "담당자",
      subsystem: curUser.subsystem || "PMO",
      role: curUser.role || "MEMBER",
      content: text,
      createdAt: nowStr,
      likes: 0,
      replies: [],
      taskId: null,
      taskName: null
    };

    if (typeof communicationsData === "undefined") globalThis.communicationsData = [];
    communicationsData.unshift(newPost);

    if (typeof teamChatMessages === "undefined") globalThis.teamChatMessages = [];
    teamChatMessages.push({
      id: newPost.id,
      sender: newPost.author,
      text: text,
      time: new Date().toTimeString().substring(0, 5)
    });

    input.value = "";
    this.renderPortalChat();
    if (typeof NoticeCommManager !== "undefined" && typeof NoticeCommManager.renderFeed === "function") {
      NoticeCommManager.renderFeed();
    }
    if (typeof StorageManager !== "undefined" && typeof StorageManager.saveAll === "function") {
      StorageManager.saveAll(false);
    }
    showToast("💬 팀 소통 피드에 새 메시지가 등록되었습니다.");
  }
};

window.HomeScreenManager = HomeScreenManager;
