// [Project Mgmt] 공지사항 · 업무 소통
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =============================================================================
// [ver1.0.4 신규] 프로젝트 공지사항 등록 및 팀원 간 소통 기능 매니저
// =============================================================================
// =============================================================================
// [ver1.0.4 신규] 프로젝트 공지사항 등록 및 다중 뷰 모드(피드/칸반/스탠드업) 소통 매니저
// =============================================================================
// =============================================================================
// [ver1.0.4] 공지사항, 업무소통 피드 서브 탭 매니저
// =============================================================================
var NoticeCommManager = {

  hasNoticePermission(item) {
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : (AuthManager?.currentUser || { role: "MEMBER", empNo: "unknown", name: "unknown" });
    const norm = (curUser.role || "MEMBER").toUpperCase();
    if (norm === "SYS_ADMIN" || norm === "PM") return true;
    if (item.authorEmpNo && curUser.empNo && String(item.authorEmpNo).trim() === String(curUser.empNo).trim()) return true;
    if (item.author && curUser.name && String(item.author).trim() === String(curUser.name).trim()) return true;
    return false;
  },

  hasCommPermission(item) {
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : (AuthManager?.currentUser || { role: "MEMBER", empNo: "unknown", name: "unknown" });
    const norm = (curUser.role || "MEMBER").toUpperCase();
    if (norm === "SYS_ADMIN" || norm === "PM") return true;
    if (item.authorEmpNo && curUser.empNo && String(item.authorEmpNo).trim() === String(curUser.empNo).trim()) return true;
    if (item.author && curUser.name && String(item.author).trim() === String(curUser.name).trim()) return true;
    return false;
  },

  hasChannelPermission() {
    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function")
      ? AuthManager.getCurrentUser()
      : (AuthManager?.currentUser || { role: "MEMBER" });
    const norm = (curUser.role || "MEMBER").toUpperCase();
    return norm === "SYS_ADMIN" || norm === "PM";
  },

  openEditNoticeModal(id) {
    const target = noticesData.find(n => n.id === id);
    if (!target) return;
    if (!this.hasNoticePermission(target)) {
      showToast("⚠️ 본인이 작성한 공지이거나 관리자/PM 권한만 수정할 수 있습니다.", "warning");
      return;
    }
    const modal = document.getElementById("editNoticeModal");
    if (!modal) return;
    document.getElementById("editNoticeId").value = target.id;
    document.getElementById("editNoticeTitleInput").value = target.title;
    document.getElementById("editNoticePrioritySelect").value = target.priority || "일반";
    document.getElementById("editNoticePinnedCheckbox").checked = !!target.isPinned;
    document.getElementById("editNoticeContentInput").value = target.content;
    modal.style.display = "flex";
  },

  closeEditNoticeModal() {
    const modal = document.getElementById("editNoticeModal");
    if (modal) modal.style.display = "none";
  },

  submitEditNotice() {
    const id = document.getElementById("editNoticeId")?.value;
    const target = noticesData.find(n => n.id === id);
    if (!target) return;
    if (!this.hasNoticePermission(target)) {
      showToast("⚠️ 수정 권한이 없습니다.", "warning");
      return;
    }

    const title = (document.getElementById("editNoticeTitleInput")?.value || "").trim();
    const content = (document.getElementById("editNoticeContentInput")?.value || "").trim();
    const priority = document.getElementById("editNoticePrioritySelect")?.value || "일반";
    const isPinned = document.getElementById("editNoticePinnedCheckbox")?.checked || false;

    if (!title || !content) {
      showToast("공지 제목과 상세 내용을 모두 입력해주세요.", "warning");
      return;
    }

    target.title = title;
    target.content = content;
    target.priority = priority;
    target.isPinned = isPinned;

    this.closeEditNoticeModal();
    this.renderNotices();
    this.updateHeaderBadge();
    persistChanges();
    showToast("✅ 공지사항이 성공적으로 수정되었습니다.");
  },

  openEditCommPost(id) {
    const post = communicationsData.find(c => c.id === id);
    if (!post) return;
    if (!this.hasCommPermission(post)) {
      showToast("⚠️ 본인이 작성한 게시글이거나 관리자/PM 권한만 수정할 수 있습니다.", "warning");
      return;
    }
    const newContent = prompt("수정할 소통 피드 내용을 입력하세요:", post.content);
    if (newContent !== null && newContent.trim()) {
      post.content = newContent.trim();
      persistChanges();
      this.renderCommunications();
      showToast("✅ 소통 게시글이 수정되었습니다.");
    }
  },

  deleteCommPost(id) {
    const post = communicationsData.find(c => c.id === id);
    if (!post) return;
    if (!this.hasCommPermission(post)) {
      showToast("⚠️ 본인이 작성한 게시글이거나 관리자/PM 권한만 삭제할 수 있습니다.", "warning");
      return;
    }
    openConfirmDialog("해당 소통 게시글을 삭제하시겠습니까?", () => {
      communicationsData = communicationsData.filter(c => c.id !== id);
      persistChanges();
      this.renderCommunications();
      showToast("소통 게시글이 삭제되었습니다.");
    });
  },

  deleteReply(postId, repId) {
    const post = communicationsData.find(c => c.id === postId);
    if (!post || !Array.isArray(post.replies)) return;
    const rep = post.replies.find(r => r.id === repId);
    if (!rep) return;
    if (!this.hasCommPermission(rep)) {
      showToast("⚠️ 본인 작성 답글이거나 관리자/PM 권한만 삭제할 수 있습니다.", "warning");
      return;
    }
    openConfirmDialog("해당 답글을 삭제하시겠습니까?", () => {
      post.replies = post.replies.filter(r => r.id !== repId);
      persistChanges();
      this.renderCommunications();
      showToast("답글이 삭제되었습니다.");
    });
  },

  editChannel(oldName) {
    if (!this.hasChannelPermission()) {
      showToast("⚠️ 채널 정보 수정은 관리자(admin) 또는 프로젝트 관리자(PM)만 가능합니다.", "warning");
      return;
    }
    if (oldName === "전체") {
      showToast("기본 '전체' 채널명은 변경할 수 없습니다.", "warning");
      return;
    }
    const newName = prompt(`[# ${oldName}] 채널의 새로운 명칭을 입력하세요:`, oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) {
      const cleanName = newName.trim().replace(/^#\s*/, "");
      if (projectConfig.channels.includes(cleanName)) {
        showToast("이미 존재하는 채널명입니다.", "warning");
        return;
      }
      const idx = projectConfig.channels.indexOf(oldName);
      if (idx !== -1) {
        projectConfig.channels[idx] = cleanName;
        // update communications channel if needed
        communicationsData.forEach(c => { if (c.channel === oldName) c.channel = cleanName; });
        if (this.activeChannel === oldName) this.activeChannel = cleanName;
        this.renderChannelOptions();
        this.renderCommunications();
        persistChanges();
        showToast(`✅ 채널명이 [# ${cleanName}]으로 변경되었습니다.`);
      }
    }
  },

  currentSubTab: "NOTICES", // NOTICES | FEED
  viewMode: "FEED",         // FEED | KANBAN | STANDUP
  activeChannel: "전체",
  noticePriorityFilter: "ALL",
  noticeSearchKeyword: "",

  // [ver1.0.4] 공지사항 바로가기 전용 핸들러
  goToNotice() {
    if (typeof switchTab === "function") switchTab("tab-notices");
    this.switchSubTab("NOTICES", true);
    setTimeout(() => {
      const el = document.getElementById("noticesContainer") || document.getElementById("subpane_NOTICES");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  },

  init() {
    const savedSubTab = AppStore.getItem("WBS_COMM_SUB_TAB");
    if (savedSubTab) this.currentSubTab = savedSubTab;
    const savedMode = AppStore.getItem("WBS_COMM_VIEW_MODE");
    if (savedMode) this.viewMode = savedMode;
    this.switchSubTab(this.currentSubTab, false);
    this.updateHeaderBadge();
  },

  switchSubTab(tabName, persist = true) {
    this.currentSubTab = tabName;
    if (persist) AppStore.setItem("WBS_COMM_SUB_TAB", tabName);

    // subtab buttons
    ["NOTICES", "FEED"].forEach(t => {
      const btn = document.getElementById(`subtabBtn_${t}`);
      const pane = document.getElementById(`subpane_${t}`);
      if (btn) {
        if (t === tabName) {
          btn.classList.add("active");
          btn.style.background = "var(--primary)";
          btn.style.color = "#ffffff";
          btn.style.borderColor = "var(--primary)";
        } else {
          btn.classList.remove("active");
          btn.style.background = "#f8fafc";
          btn.style.color = "var(--text-sub)";
          btn.style.borderColor = "var(--border-color)";
        }
      }
      if (pane) {
        pane.style.display = t === tabName ? "block" : "none";
      }
    });

    if (tabName === "NOTICES") {
      this.renderNotices();
    } else if (tabName === "FEED") {
      this.renderChannelOptions();
      this.renderCommunications();
    }
  },

  setViewMode(mode) {
    this.viewMode = mode;
    AppStore.setItem("WBS_COMM_VIEW_MODE", mode);
    this.renderCommunications();
    this.updateModeButtons();
    showToast(`소통 UI 뷰가 [${mode === "FEED" ? "💬 채널 피드형" : (mode === "KANBAN" ? "📋 칸반 보드형" : "⏱️ 데일리 스탠드업형")}]으로 전환되었습니다.`);
  },

          cleanObsoleteChannelData() {
    const validChannels = this.getChannels();
    if (Array.isArray(communicationsData)) {
      communicationsData = communicationsData.filter(c => c && (c.channel === "전체" || validChannels.includes(c.channel)));
    }
    if (Array.isArray(noticesData)) {
      noticesData = noticesData.filter(n => !n.channel || n.channel === "전체" || validChannels.includes(n.channel));
    }
  },

  setChannel(ch) {
    this.activeChannel = ch || "전체";
    this.cleanObsoleteChannelData();
    this.renderChannelOptions();
    this.renderCommunications();
    const postSel = document.getElementById("commPostChannelSelect");
    if (postSel && ch !== "전체") {
      postSel.value = ch;
    }
  },

  filterNoticesByPriority(p) {
    this.noticePriorityFilter = p;
    this.renderNotices();
  },

  filterNoticesByKeyword(kw) {
    this.noticeSearchKeyword = (kw || "").trim().toLowerCase();
    this.renderNotices();
  },

  updateHeaderBadge() {
    const badge = document.getElementById("headerNoticeCountBadge");
    if (badge && Array.isArray(noticesData)) {
      const urgentCount = noticesData.filter(n => n.priority === "긴급").length;
      badge.textContent = urgentCount > 0 ? `🚨 긴급공지 ${urgentCount}` : `📢 공지 ${noticesData.length}`;
      badge.style.display = noticesData.length > 0 ? "inline-flex" : "none";
    }
  },

  updateModeButtons() {
    ["FEED", "KANBAN", "STANDUP"].forEach(m => {
      const btn = document.getElementById(`btnViewMode_${m}`);
      if (btn) {
        if (this.viewMode === m) {
          btn.className = "btn btn-primary btn-sm";
          btn.style.fontWeight = "800";
        } else {
          btn.className = "btn btn-secondary btn-sm";
          btn.style.fontWeight = "normal";
        }
      }
    });
  },

  
  getChannels() {
    // [v3.0.0] 채널 기본값은 이 프로젝트의 서브시스템 (다른 프로젝트·샘플 채널을 쓰지 않음)
    const defaultSubs = (subsystemsMeta || []).map(m => m.code || m.name).filter(Boolean);
    if (projectConfig && Array.isArray(projectConfig.channels) && projectConfig.channels.length > 0) {
      // Remove any obsolete channels like 포털UI, 코어서비스, etc.
      const obsolete = ["포털UI", "코어서비스", "데이터연계", "인프라보안"];
      projectConfig.channels = projectConfig.channels.filter(c => !obsolete.includes(c));
      if (!projectConfig.channels.includes("전체")) projectConfig.channels.unshift("전체");
      return projectConfig.channels;
    }
    const cleanList = ["전체", ...defaultSubs];
    if (projectConfig) projectConfig.channels = cleanList;
    return cleanList;
  },

  renderChannelOptions() {
    const channels = this.getChannels();
    
    // 1. Post Channel Select in Feed
    const postSel = document.getElementById("commPostChannelSelect");
    if (postSel) {
      const curVal = postSel.value;
      postSel.innerHTML = channels.map(c => `<option value="${escapeHtml(c)}">${c === "전체" ? "🌐 " : "💬 "}# ${escapeHtml(c)} 채널</option>`).join("");
      if (channels.includes(curVal)) postSel.value = curVal;
    }

    // 2. Feed Channel Filter Buttons (Requirement 2)
    const filterContainer = document.getElementById("feedChannelFilterContainer");
    if (filterContainer) {
      filterContainer.innerHTML = channels.map(c => {
        const count = c === "전체"
          ? (Array.isArray(communicationsData) ? communicationsData.length : 0)
          : (Array.isArray(communicationsData) ? communicationsData.filter(p => p.channel === c).length : 0);
        const isActive = (this.activeChannel === c);
        const btnClass = isActive ? "btn btn-sm btn-primary feed-channel-chip active" : "btn btn-sm btn-secondary feed-channel-chip";
        const activeStyle = isActive
          ? "background:var(--primary) !important; color:#fff !important; border-color:var(--primary) !important; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.2); transform:scale(1.02);"
          : "background:#f1f5f9; color:#334155; border:1px solid #cbd5e1;";
        const label = isActive ? `✓ #${escapeHtml(c)} (${count})` : `#${escapeHtml(c)} (${count})`;
        return `
          <button class="${btnClass}" style="${activeStyle} font-size:calc(11.5px * var(--fs-scale, 1)); padding:4px 9px; border-radius:4px; transition:all 0.15s ease;" data-channel="${escapeHtml(c)}" data-click="NoticeCommManager.setChannel" data-click-args="${UiEvents.args(String(c))}">
            ${label}
          </button>
        `;
      }).join("");
    }

    // Active Channel Indicator Update
    const ind = document.getElementById("feedActiveChannelIndicator");
    if (ind) {
      const count = this.activeChannel === "전체"
        ? (Array.isArray(communicationsData) ? communicationsData.length : 0)
        : (Array.isArray(communicationsData) ? communicationsData.filter(p => p.channel === this.activeChannel).length : 0);
      ind.textContent = `📢 선택된 채널: #${this.activeChannel} (총 ${count}건)`;
      ind.style.background = "var(--primary)";
    }


    // 4. System Settings Channels Table
    this.renderSettingsChannelTable();
  },

  renderSettingsChannelTable() {
    const tbody = document.getElementById("settingsChannelTableBody");
    if (!tbody) return;
    const channels = this.getChannels();
    tbody.innerHTML = "";
    channels.forEach((c, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:center;"><b>${idx + 1}</b></td>
        <td><strong style="color:#0f172a;"># ${escapeHtml(c)}</strong></td>
        <td style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#64748b;">${c === "전체" ? "전사 공통 기본 채널 (고정)" : "프로젝트 커스텀 소통 채널"}</td>
        <td style="text-align:center;">
          ${c === "전체" ? '<span style="font-size:var(--fs-xs, 11px); color:#94a3b8; font-weight:bold;">고정</span>' : `<button class="btn btn-danger btn-sm" data-click="NoticeCommManager.deleteChannel" data-click-args="${UiEvents.args(String(c))}">삭제</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  addChannel() {
    const input = document.getElementById("newChannelNameInput");
    const name = (input?.value || "").trim().replace(/^#\s*/, "");
    if (!name) {
      showToast("추가할 채널명을 입력해주세요.", "warning");
      return;
    }
    if (!projectConfig.channels) projectConfig.channels = this.getChannels();
    if (projectConfig.channels.includes(name)) {
      showToast("이미 등록된 채널명입니다.", "warning");
      return;
    }
    projectConfig.channels.push(name);
    if (input) input.value = "";
    this.renderChannelOptions();
    persistChanges();
    showToast(`✅ [# ${name}] 채널이 등록되었습니다.`);
  },

  deleteChannel(name) {
    if (name === "전체") {
      showToast("기본 '전체' 채널은 삭제할 수 없습니다.", "warning");
      return;
    }
    openConfirmDialog(`[# ${name}] 채널을 삭제하시겠습니까?`, () => {
      if (!projectConfig.channels) projectConfig.channels = this.getChannels();
      projectConfig.channels = projectConfig.channels.filter(c => c !== name);
      if (this.activeChannel === name) this.activeChannel = "전체";
      this.renderChannelOptions();
      this.renderCommunications();
      persistChanges();
      showToast(`[# ${name}] 채널이 삭제되었습니다.`);
    });
  },

  clearAllCommunications() {
    openConfirmDialog("⚠️ 작성된 모든 업무 소통 피드 및 답글을 완전히 초기화하시겠습니까? (삭제된 데이터는 복구할 수 없습니다)", () => {
      communicationsData = [];
      this.renderCommunications();
      persistChanges();
      showToast("🧹 모든 업무 소통 피드가 초기화(삭제)되었습니다.");
    });
  },

  clearAllNotices() {
    openConfirmDialog("⚠️ 등록된 모든 프로젝트 공지사항을 완전히 초기화하시겠습니까?", () => {
      noticesData = [];
      this.renderNotices();
      this.updateHeaderBadge();
      persistChanges();
      showToast("🧹 모든 공지사항이 초기화(삭제)되었습니다.");
    });
  },

  renderAll() {
    this.renderChannelOptions();
    this.updateHeaderBadge();
    this.renderNotices();
    this.renderCommunications();
    this.updateModeButtons();
  },

  renderNotices() {
    const listEl = document.getElementById("noticesListContainer");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!Array.isArray(noticesData) || noticesData.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8; font-size:var(--fs-base, 13px);">등록된 공지사항이 없습니다. 상단 [➕ 신규 공지사항 등록] 버튼을 눌러 등록하세요.</div>';
      return;
    }

    let filtered = noticesData;
    if (this.noticePriorityFilter && this.noticePriorityFilter !== "ALL") {
      filtered = filtered.filter(n => n.priority === this.noticePriorityFilter);
    }
    if (this.noticeSearchKeyword) {
      filtered = filtered.filter(n => (n.title || "").toLowerCase().includes(this.noticeSearchKeyword) || (n.content || "").toLowerCase().includes(this.noticeSearchKeyword));
    }

    const sorted = [...filtered].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.date || "").localeCompare(a.date || "");
    });

    if (sorted.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:var(--fs-base, 13px);">검색 조건에 일치하는 공지사항이 없습니다.</div>';
      return;
    }

    sorted.forEach(item => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.style.border = item.isPinned ? "2px solid #f59e0b" : "1px solid #cbd5e1";
      card.style.background = item.isPinned ? "#fffbeb" : "#ffffff";
      card.style.marginBottom = "12px";
      card.style.padding = "14px 18px";
      card.style.borderRadius = "8px";
      card.style.boxShadow = item.isPinned ? "0 2px 8px rgba(245, 158, 11, 0.15)" : "0 1px 3px rgba(0,0,0,0.04)";

      const priorityBadge = item.priority === "긴급"
        ? '<span class="badge" style="background:#dc2626; color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">🚨 긴급</span>'
        : (item.priority === "중요" ? '<span class="badge" style="background:#d97706; color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">⚠️ 중요</span>' : '<span class="badge" style="background:#0284c7; color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">일반</span>');

      const canManage = this.hasNoticePermission(item);
      const actionButtons = canManage ? `
        <button class="btn btn-sm ${item.isPinned ? 'btn-secondary' : 'btn-primary'}" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.togglePinNotice" data-click-args="${UiEvents.args(String(item.id))}">
          ${item.isPinned ? '📌 고정해제' : '📌 상단고정'}
        </button>
        <button class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.openEditNoticeModal" data-click-args="${UiEvents.args(String(item.id))}">✏️ 수정</button>
        <button class="btn btn-danger btn-sm" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.deleteNotice" data-click-args="${UiEvents.args(String(item.id))}">🗑️ 삭제</button>
      ` : '<span style="font-size:calc(10.5px * var(--fs-scale, 1)); color:#94a3b8; padding:2px 6px; background:#f1f5f9; border-radius:4px;">🔒 조회전용</span>';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${item.isPinned ? '<span style="font-size:calc(15px * var(--fs-scale, 1));" title="상단 고정 공지">📌</span>' : ''}
            ${priorityBadge}
            <strong style="font-size:var(--fs-md, 14px); color:#0f172a;">${escapeHtml(item.title)}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:#64748b;">작성자: <b>${escapeHtml(item.author)}</b> (${escapeHtml(item.date)})</span>
            ${actionButtons}
          </div>
        </div>
        <div style="font-size:var(--fs-base, 13px); line-height:1.7; color:#334155; white-space:pre-wrap; background:rgba(0,0,0,0.02); padding:10px 14px; border-radius:6px; border:1px solid rgba(0,0,0,0.05);">${escapeHtml(item.content)}</div>
      `;
      listEl.appendChild(card);
    });
  },

  renderCommunications() {
    this.cleanObsoleteChannelData();
    const container = document.getElementById("commMainDisplayArea");
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(communicationsData) || communicationsData.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;">작성된 소통 글이 없습니다. 상단에서 첫 번째 업무 소통 피드를 게시해보세요.</div>';
      return;
    }

    if (this.viewMode === "KANBAN") {
      this.renderKanbanView(container);
    } else if (this.viewMode === "STANDUP") {
      this.renderStandupView(container);
    } else {
      this.renderFeedView(container);
    }
  },

  // 1. 채널 피드 & 스레드 뷰 (Slack / Teams 스타일)
  renderFeedView(container) {
    const filtered = this.activeChannel === "전체"
      ? communicationsData
      : communicationsData.filter(c => c.channel === this.activeChannel);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:45px 20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; margin:10px 0;">
          <div style="font-size:var(--fs-2xl, 24px); margin-bottom:6px;">💬</div>
          <div style="font-size:var(--fs-md, 14px); font-weight:bold; color:var(--primary); margin-bottom:4px;">[# ${escapeHtml(this.activeChannel)}] 채널에 등록된 소통 안건이 없습니다.</div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#64748b; margin-bottom:12px;">상단 작성 영역에서 글을 작성하거나, 전체 채널로 전환하세요.</div>
          <button class="btn btn-primary btn-sm" data-click="NoticeCommManager.setChannel" data-click-args='["전체"]'>🌐 전체 채널 보기</button>
        </div>
      `;
      return;
    }

    const sorted = [...filtered].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const feedWrap = document.createElement("div");
    feedWrap.style.display = "flex";
    feedWrap.style.flexDirection = "column";
    feedWrap.style.gap = "14px";

    sorted.forEach(post => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.style.background = "#ffffff";
      card.style.border = "1px solid #cbd5e1";
      card.style.borderRadius = "8px";
      card.style.padding = "14px 18px";
      card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";

      let repliesHtml = "";
      if (Array.isArray(post.replies) && post.replies.length > 0) {
        repliesHtml = '<div style="margin-top:12px; padding-left:14px; border-left:3px solid #38bdf8; display:flex; flex-direction:column; gap:8px;">';
        post.replies.forEach(rep => {
          repliesHtml += `
            <div style="background:#f0f9ff; padding:10px 12px; border-radius:6px; font-size:var(--fs-sm, 12px); border:1px solid #e0f2fe;">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-weight:bold; color:#0369a1;">💬 ${escapeHtml(rep.author)} (${escapeHtml(rep.role || "")})</span>
                <span style="color:#94a3b8; font-size:calc(10.5px * var(--fs-scale, 1));">${escapeHtml(rep.date || "")}</span>
              </div>
              <div style="color:#334155; white-space:pre-wrap; line-height:1.5;">${escapeHtml(rep.content)}</div>
            </div>
          `;
        });
        repliesHtml += '</div>';
      }

      const canManagePost = this.hasCommPermission(post);
      const postActionButtons = canManagePost ? `
        <button class="btn btn-secondary btn-sm" style="padding:2px 7px; font-size:calc(10.5px * var(--fs-scale, 1));" data-click="NoticeCommManager.openEditCommPost" data-click-args="${UiEvents.args(String(post.id))}">✏️ 수정</button>
        <button class="btn btn-danger btn-sm" style="padding:2px 7px; font-size:calc(10.5px * var(--fs-scale, 1));" data-click="NoticeCommManager.deleteCommPost" data-click-args="${UiEvents.args(String(post.id))}">🗑️ 삭제</button>
      ` : "";

      const displayTitle = post.title || (post.taskId ? `[과업 #${post.taskId}] ${post.content.slice(0, 30)}...` : (post.content.length > 30 ? post.content.slice(0, 30) + "..." : post.content));
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:#0284c7; color:#fff; font-size:var(--fs-2xs, 10px);">#${escapeHtml(post.channel || "전체")}</span>
            ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:var(--fs-2xs, 10px);">과업 #WBS-${escapeHtml(post.taskId)}</span>` : ""}
            <strong style="color:#0f172a; font-size:calc(13.5px * var(--fs-scale, 1));">${escapeHtml(post.author)}</strong>
            <span style="font-size:var(--fs-xs, 11px); color:#64748b;">(${escapeHtml(post.role || "")})</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:#94a3b8;">${escapeHtml(post.date)}</span>
            ${postActionButtons}
          </div>
        </div>
        <div style="font-size:var(--fs-md, 14px); font-weight:bold; color:var(--primary, #1e3a8a); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
          <span>📌</span> <span>${escapeHtml(displayTitle)}</span>
        </div>
        <div style="font-size:var(--fs-base, 13px); line-height:1.6; color:#1e293b; margin-bottom:8px; white-space:pre-wrap;">${escapeHtml(post.content)}</div>
        ${repliesHtml}
        <div style="margin-top:12px; display:flex; gap:8px;">
          <input type="text" id="replyInput_${post.id}" placeholder="스레드 답글 입력 후 Enter 또는 클릭..." style="flex:1; padding:6px 12px; font-size:var(--fs-sm, 12px); border:1px solid #cbd5e1; border-radius:4px;" data-keydown="NoticeCommManager.addReply" data-keydown-args="${UiEvents.args(String(post.id))}" data-keydown-key="Enter">
          <button class="btn btn-secondary btn-sm" data-click="NoticeCommManager.addReply" data-click-args="${UiEvents.args(String(post.id))}">💬 답글</button>
        </div>
      `;
      feedWrap.appendChild(card);
    });

    container.appendChild(feedWrap);
  },

  // 2. 칸반 보드 & 담벼락 뷰 (Notion / Linear 스타일)
  renderKanbanView(container) {
    const kanbanWrap = document.createElement("div");
    kanbanWrap.style.display = "grid";
    kanbanWrap.style.gridTemplateColumns = "repeat(3, 1fr)";
    kanbanWrap.style.gap = "14px";

    const cols = [
      { id: "OPEN", title: "💬 논의/질의 중", bg: "#f8fafc", border: "#cbd5e1", badge: "#0284c7" },
      { id: "PROGRESS", title: "⚙️ 조치/협의 진행", bg: "#eff6ff", border: "#93c5fd", badge: "#2563eb" },
      { id: "RESOLVED", title: "✅ 해결/합의 완료", bg: "#f0fdf4", border: "#86efac", badge: "#16a34a" }
    ];

    cols.forEach(col => {
      const colDiv = document.createElement("div");
      colDiv.style.background = col.bg;
      colDiv.style.border = `1px solid ${col.border}`;
      colDiv.style.borderRadius = "8px";
      colDiv.style.padding = "12px";
      colDiv.style.minHeight = "440px";

      const targetPosts = this.activeChannel === "전체"
        ? communicationsData
        : communicationsData.filter(c => c.channel === this.activeChannel);

      const colPosts = targetPosts.filter((c, i) => {
        const status = c.status || (i % 3 === 0 ? "OPEN" : (i % 3 === 1 ? "PROGRESS" : "RESOLVED"));
        return status === col.id;
      });

      colDiv.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid ${col.border};">
          <strong style="font-size:calc(13.5px * var(--fs-scale, 1)); color:#1e293b;">${col.title}</strong>
          <span class="badge" style="background:${col.badge}; color:#fff; font-size:var(--fs-2xs, 10px);">${colPosts.length}건</span>
        </div>
        <div id="kanbanCol_${col.id}" style="display:flex; flex-direction:column; gap:10px;"></div>
      `;

      const listContainer = colDiv.querySelector(`#kanbanCol_${col.id}`);
      colPosts.forEach(post => {
        const itemCard = document.createElement("div");
        itemCard.style.background = "#ffffff";
        itemCard.style.border = "1px solid #cbd5e1";
        itemCard.style.borderRadius = "6px";
        itemCard.style.padding = "12px";
        itemCard.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
        const cardTitle = post.title || (post.taskId ? `[과업 #${post.taskId}] ${post.content.slice(0, 25)}...` : (post.content.length > 25 ? post.content.slice(0, 25) + "..." : post.content));
        itemCard.innerHTML = `
          <div style="border-bottom:1px solid #f1f5f9; padding-bottom:6px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                <span class="badge" style="background:#0284c7; color:#fff; font-size:calc(9.5px * var(--fs-scale, 1)); padding:2px 6px;">#${escapeHtml(post.channel || "전체")}</span>
                ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:calc(9px * var(--fs-scale, 1)); padding:2px 6px;">과업 #${escapeHtml(post.taskId)}</span>` : ""}
              </div>
              <span style="font-size:calc(10.5px * var(--fs-scale, 1)); color:#94a3b8;">${escapeHtml((post.date || "").split(" ")[0])}</span>
            </div>
            <div class="kanban-card-title" style="font-size:calc(13.5px * var(--fs-scale, 1)); font-weight:800; color:var(--primary, #1e3a8a); line-height:1.45; word-break:keep-all;">
              📌 ${escapeHtml(cardTitle)}
            </div>
          </div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:#475569; margin-bottom:10px; line-height:1.55; max-height:60px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">${escapeHtml(post.content)}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:var(--fs-xs, 11px); color:#64748b; border-top:1px dashed #e2e8f0; padding-top:6px;">
            <span style="font-weight:600;">👤 ${escapeHtml(post.author)}</span>
            <select data-change="NoticeCommManager.updatePostStatus" data-change-args="${UiEvents.args(String(post.id), "$value")}" style="font-size:var(--fs-xs, 11px); padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; font-weight:bold; background:#ffffff; color:#1e293b;">
              <option value="OPEN" ${col.id==='OPEN'?'selected':''}>논의중</option>
              <option value="PROGRESS" ${col.id==='PROGRESS'?'selected':''}>조치중</option>
              <option value="RESOLVED" ${col.id==='RESOLVED'?'selected':''}>해결완료</option>
            </select>
          </div>
        `;
        listContainer.appendChild(itemCard);
      });

      kanbanWrap.appendChild(colDiv);
    });

    container.appendChild(kanbanWrap);
  },

  // 3. 데일리 스탠드업 & 타임라인 뷰 (Jira / Monday 스타일)
  renderStandupView(container) {
    const standupWrap = document.createElement("div");
    standupWrap.style.display = "flex";
    standupWrap.style.flexDirection = "column";
    standupWrap.style.gap = "14px";

    const summaryBox = document.createElement("div");
    summaryBox.style.background = "linear-gradient(135deg, #1e293b, #0f172a)";
    summaryBox.style.color = "#fff";
    summaryBox.style.borderRadius = "8px";
    summaryBox.style.padding = "14px 18px";
    summaryBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-size:var(--fs-md, 14px); font-weight:bold; color:#38bdf8;">⏱️ 프로젝트 일일 스탠드업 &amp; 블로커 현황판</span>
        <span style="font-size:var(--fs-xs, 11px); color:#94a3b8;">기준일자: ${escapeHtml(projectConfig.reportDate || "2026-06-30")}</span>
      </div>
      <div style="display:flex; gap:16px; font-size:var(--fs-sm, 12px); color:#cbd5e1;">
        <span>• 등록된 소통 안건: <b>${communicationsData.length}건</b></span>
        <span>• 긴급 공지: <b>${noticesData.filter(n=>n.priority==='긴급').length}건</b></span>
        <span>• WBS 연계 이슈: <b>${communicationsData.filter(c=>c.taskId).length}건</b></span>
      </div>
    `;
    standupWrap.appendChild(summaryBox);

    const targetPosts = this.activeChannel === "전체"
      ? communicationsData
      : communicationsData.filter(c => c.channel === this.activeChannel);

    targetPosts.forEach((post, pIdx) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.gap = "12px";
      item.style.alignItems = "flex-start";
      item.innerHTML = `
        <div style="width:28px; height:28px; border-radius:50%; background:#2563eb; color:#fff; display:flex; align-items:center; justify-content:center; font-size:var(--fs-sm, 12px); font-weight:bold; flex-shrink:0;">
          ${pIdx + 1}
        </div>
        <div style="flex:1; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <div>
              <strong style="color:var(--primary); font-size:var(--fs-base, 13px);">${escapeHtml(post.author)}</strong>
              <span style="font-size:var(--fs-xs, 11px); color:#64748b; margin-left:4px;">(${escapeHtml(post.role || "")})</span>
              ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:calc(9.5px * var(--fs-scale, 1)); margin-left:6px;">#WBS-${escapeHtml(post.taskId)}</span>` : ""}
            </div>
            <span style="font-size:var(--fs-xs, 11px); color:#94a3b8;">${escapeHtml(post.date)}</span>
          </div>
          <div style="font-size:calc(12.5px * var(--fs-scale, 1)); line-height:1.6; color:#334155;">${escapeHtml(post.content)}</div>
        </div>
      `;
      standupWrap.appendChild(item);
    });

    container.appendChild(standupWrap);
  },

  updatePostStatus(id, newStatus) {
    const post = communicationsData.find(c => c.id === id);
    if (post) {
      post.status = newStatus;
      persistChanges();
      this.renderCommunications();
      showToast(`소통 안건 상태가 [${newStatus}]으로 변경되었습니다.`);
    }
  },

  openNewNoticeModal() {
    const modal = document.getElementById("newNoticeModal");
    if (modal) {
      modal.style.display = "flex";
      const titleInput = document.getElementById("noticeTitleInput");
      if (titleInput) {
        titleInput.value = "";
        setTimeout(() => titleInput.focus(), 80);
      }
      const contentInput = document.getElementById("noticeContentInput");
      if (contentInput) contentInput.value = "";
    }
  },

  closeNewNoticeModal() {
    const modal = document.getElementById("newNoticeModal");
    if (modal) modal.style.display = "none";
  },

  submitNewNotice() {
    const title = (document.getElementById("noticeTitleInput")?.value || "").trim();
    const content = (document.getElementById("noticeContentInput")?.value || "").trim();
    const priority = document.getElementById("noticePrioritySelect")?.value || "일반";
    const isPinned = document.getElementById("noticePinnedCheckbox")?.checked || false;

    if (!title || !content) {
      showToast("공지사항 제목과 상세 내용을 모두 입력해주세요.", "warning");
      return;
    }

    const curUser = (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser()) || { name: "관리자", empNo: "admin" };
    const today = (projectConfig && projectConfig.reportDate) || new Date().toISOString().slice(0, 10);

    const newNotice = {
      id: "NOT-" + Date.now().toString().slice(-4),
      title: title,
      content: content,
      author: curUser.name || "관리자",
      authorEmpNo: curUser.empNo || "admin",
      date: today,
      priority: priority,
      isPinned: isPinned,
      viewCount: 1
    };

    if (!Array.isArray(noticesData)) noticesData = [];
    noticesData.unshift(newNotice);

    this.closeNewNoticeModal();
    this.renderNotices();
    this.updateHeaderBadge();
    persistChanges();
    showToast("📢 신규 공지사항이 등록되었습니다.");
  },

  togglePinNotice(id) {
    const target = noticesData.find(n => n.id === id);
    if (target) {
      target.isPinned = !target.isPinned;
      this.renderNotices();
      this.updateHeaderBadge();
      persistChanges();
      showToast(target.isPinned ? "📌 공지사항이 상단에 고정되었습니다." : "공지사항 상단 고정이 해제되었습니다.");
    }
  },

  deleteNotice(id) {
    openConfirmDialog("해당 공지사항을 삭제하시겠습니까?", () => {
      noticesData = noticesData.filter(n => n.id !== id);
      this.renderNotices();
      this.updateHeaderBadge();
      persistChanges();
      showToast("공지사항이 삭제되었습니다.");
    });
  },

  submitNewCommPost() {
    const content = (document.getElementById("commPostContentInput")?.value || "").trim();
    const channel = document.getElementById("commPostChannelSelect")?.value || "전체";
    const taskId = (document.getElementById("commPostTaskIdInput")?.value || "").trim();

    if (!content) {
      showToast("소통 피드 내용을 입력해주세요.", "warning");
      return;
    }

    const titleInput = document.getElementById("commPostTitleInput");
    const titleVal = (titleInput?.value || "").trim();
    const curUser = (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser()) || { name: "팀원", empNo: "user", role: "MEMBER", subsystem: "PORTAL" };
    const nowStr = ((projectConfig && projectConfig.reportDate) || new Date().toISOString().slice(0, 10)) + " " + new Date().toTimeString().slice(0, 5);

    const newPost = {
      id: "COMM-" + Date.now().toString().slice(-4),
      title: titleVal || (content.length > 25 ? content.slice(0, 25) + "..." : content),
      channel: channel,
      taskId: taskId,
      author: curUser.name || "팀원",
      authorEmpNo: curUser.empNo || "user",
      role: curUser.subsystem || curUser.role || "MEMBER",
      content: content,
      date: nowStr,
      status: "OPEN",
      replies: []
    };

    if (!Array.isArray(communicationsData)) communicationsData = [];
    communicationsData.unshift(newPost);

    const input = document.getElementById("commPostContentInput");
    if (input) input.value = "";
    this.renderCommunications();
    persistChanges();
    showToast("💬 소통 피드가 게시되었습니다.");
  },

  addReply(postId) {
    const input = document.getElementById(`replyInput_${postId}`);
    const text = (input?.value || "").trim();
    if (!text) {
      showToast("답글 내용을 입력해주세요.", "warning");
      return;
    }

    const target = communicationsData.find(c => c.id === postId);
    if (!target) return;

    const curUser = (typeof AuthManager !== "undefined" && AuthManager.getCurrentUser()) || { name: "팀원", empNo: "user", role: "MEMBER", subsystem: "CORE" };
    const nowStr = ((projectConfig && projectConfig.reportDate) || new Date().toISOString().slice(0, 10)) + " " + new Date().toTimeString().slice(0, 5);

    if (!Array.isArray(target.replies)) target.replies = [];
    target.replies.push({
      id: "REP-" + Date.now().toString().slice(-4),
      author: curUser.name || "팀원",
      authorEmpNo: curUser.empNo || "user",
      role: curUser.subsystem || curUser.role || "MEMBER",
      content: text,
      date: nowStr
    });

    input.value = "";
    this.renderCommunications();
    persistChanges();
    showToast("답글이 등록되었습니다.");
  }
};
