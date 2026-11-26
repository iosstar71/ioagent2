// Workgroup 판: modules/board/notice-comm.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(NoticeCommManager, {
  switchSubTab(tabName, persist = true) {
    this.currentSubTab = tabName;
    if (persist) localStorage.setItem("WBS_COMM_SUB_TAB", tabName);

    // subtab buttons
    ["NOTICES", "FEED", "CHAT"].forEach(t => {
      const btn = document.getElementById(`subtabBtn_${t}`);
      const pane = document.getElementById(`subpane_${t}`);
      if (btn) btn.classList.toggle("active", t === tabName);
      if (pane) {
        pane.style.display = t === tabName ? "block" : "none";
      }
    });

    if (tabName === "NOTICES") {
      this.renderNotices();
      if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.stopPolling();
    } else if (tabName === "FEED") {
      this.renderChannelOptions();
      this.renderCommunications();
      if (typeof RealtimeChatManager !== "undefined") RealtimeChatManager.stopPolling();
    } else if (tabName === "CHAT") {
      if (typeof RealtimeChatManager !== "undefined") {
        RealtimeChatManager.init();
      }
    }
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

    // 3. Chat Room Channels
    const chatContainer = document.getElementById("chatChannelListContainer");
    if (chatContainer && typeof RealtimeChatManager !== "undefined") {
      chatContainer.innerHTML = channels.map(c => `
        <button class="chat-channel-btn ${RealtimeChatManager.activeChannel === c ? 'active' : ''}" data-channel="${escapeHtml(c)}" data-click="RealtimeChatManager.setChannel" data-click-args="${UiEvents.args(String(c))}">
          <span># ${escapeHtml(c)}</span>
        </button>
      `).join("");
    }

    // 4. System Settings Channels Table
    this.renderSettingsChannelTable();
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
      if (typeof RealtimeChatManager !== "undefined" && RealtimeChatManager.activeChannel === name) {
        RealtimeChatManager.activeChannel = "전체";
      }
      this.renderChannelOptions();
      this.renderCommunications();
      persistChanges();
      showToast(`[# ${name}] 채널이 삭제되었습니다.`);
    });
  },

  renderAll() {
    if (typeof AttachManager !== "undefined") AttachManager.refreshSummary();  // 첨부파일 수 (서버 방식, 처음 한 번)
    this.renderChannelOptions();
    this.updateHeaderBadge();
    this.renderNotices();
    this.renderCommunications();
    this.updateModeButtons();
    if (this.currentSubTab === "CHAT" && typeof RealtimeChatManager !== "undefined") {
      RealtimeChatManager.checkServerConnection();
    }
  },



  // 2. 칸반 보드 & 담벼락 뷰 (Notion / Linear 스타일)
});
