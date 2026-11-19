// Workgroup 판: modules/board/notice-comm.js 의 다른 부분 (서버 DB · 로그인 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
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

  renderNotices() {
    const listEl = document.getElementById("noticesListContainer");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!Array.isArray(noticesData) || noticesData.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted); font-size:var(--fs-base, 13px);">등록된 공지이 없습니다. 상단 [➕ 신규 공지 등록] 버튼을 눌러 등록하세요.</div>';
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
      listEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:var(--fs-base, 13px);">검색 조건에 일치하는 공지이 없습니다.</div>';
      return;
    }

    sorted.forEach(item => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.style.border = item.isPinned ? "2px solid #f59e0b" : "1px solid var(--border-color)";
      card.style.background = item.isPinned ? "var(--tint-warn)" : "#ffffff";
      card.style.marginBottom = "12px";
      card.style.padding = "14px 18px";
      card.style.borderRadius = "8px";
      card.style.boxShadow = item.isPinned ? "0 2px 8px rgba(245, 158, 11, 0.15)" : "0 1px 3px rgba(0,0,0,0.04)";

      const priorityBadge = item.priority === "긴급"
        ? '<span class="badge" style="background:var(--chart-bad-text); color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">🚨 긴급</span>'
        : (item.priority === "중요" ? '<span class="badge" style="background:var(--chart-warn-text); color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">⚠️ 중요</span>' : '<span class="badge" style="background:var(--primary); color:#fff; font-size:calc(10.5px * var(--fs-scale, 1));">일반</span>');

      const canManage = this.hasNoticePermission(item);
      const actionButtons = canManage ? `
        <button class="btn btn-sm ${item.isPinned ? 'btn-secondary' : 'btn-primary'}" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.togglePinNotice" data-click-args="${UiEvents.args(String(item.id))}">
          ${item.isPinned ? '📌 고정해제' : '📌 상단고정'}
        </button>
        <button class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.openEditNoticeModal" data-click-args="${UiEvents.args(String(item.id))}">✏️ 수정</button>
        <button class="btn btn-danger btn-sm" style="padding:3px 8px; font-size:var(--fs-xs, 11px);" data-click="NoticeCommManager.deleteNotice" data-click-args="${UiEvents.args(String(item.id))}">🗑️ 삭제</button>
      ` : '<span style="font-size:calc(10.5px * var(--fs-scale, 1)); color:var(--text-muted); padding:2px 6px; background:var(--bg-main); border-radius:4px;">🔒 조회전용</span>';

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            ${item.isPinned ? '<span style="font-size:calc(15px * var(--fs-scale, 1));" title="상단 고정 공지">📌</span>' : ''}
            ${priorityBadge}
            <strong style="font-size:var(--fs-md, 14px); color:var(--text-main);">${escapeHtml(item.title)}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">작성자: <b>${escapeHtml(item.author)}</b> (${escapeHtml(item.date)})</span>
            ${typeof AttachManager !== "undefined" ? AttachManager.btnHtml("notice", String(item.id), item) : ""}
            ${actionButtons}
          </div>
        </div>
        <div style="font-size:var(--fs-base, 13px); line-height:1.7; color:var(--text-sub); white-space:pre-wrap; background:rgba(0,0,0,0.02); padding:10px 14px; border-radius:6px; border:1px solid rgba(0,0,0,0.05);">${escapeHtml(item.content)}</div>
      `;
      listEl.appendChild(card);
    });
  },

  renderFeedView(container) {
    const filtered = this.activeChannel === "전체"
      ? communicationsData
      : communicationsData.filter(c => c.channel === this.activeChannel);

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:45px 20px; background:var(--bg-main); border:1px dashed var(--border-color); border-radius:8px; margin:10px 0;">
          <div style="font-size:var(--fs-2xl, 24px); margin-bottom:6px;">💬</div>
          <div style="font-size:var(--fs-md, 14px); font-weight:bold; color:var(--primary); margin-bottom:4px;">[# ${escapeHtml(this.activeChannel)}] 채널에 등록된 소통 안건이 없습니다.</div>
          <div style="font-size:calc(11.5px * var(--fs-scale, 1)); color:var(--text-muted); margin-bottom:12px;">상단 작성 영역에서 글을 작성하거나, 전체 채널로 전환하세요.</div>
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
      card.style.border = "1px solid var(--border-color)";
      card.style.borderRadius = "8px";
      card.style.padding = "14px 18px";
      card.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";

      let repliesHtml = "";
      if (Array.isArray(post.replies) && post.replies.length > 0) {
        repliesHtml = '<div style="margin-top:12px; padding-left:14px; border-left:3px solid var(--primary); display:flex; flex-direction:column; gap:8px;">';
        post.replies.forEach(rep => {
          repliesHtml += `
            <div style="background:var(--tint-info); padding:10px 12px; border-radius:6px; font-size:var(--fs-sm, 12px); border:1px solid var(--tint-info);">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span style="font-weight:bold; color:var(--tint-info-text);">💬 ${escapeHtml(rep.author)} (${escapeHtml(rep.role || "")})</span>
                <span style="color:var(--text-muted); font-size:calc(10.5px * var(--fs-scale, 1));">${escapeHtml(rep.date || "")}</span>
              </div>
              <div style="color:var(--text-sub); white-space:pre-wrap; line-height:1.5;">${escapeHtml(rep.content)}</div>
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

      const displayTitle = post.title || (post.taskId ? `[Task #${post.taskId}] ${post.content.slice(0, 30)}...` : (post.content.length > 30 ? post.content.slice(0, 30) + "..." : post.content));
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="badge" style="background:var(--primary); color:#fff; font-size:var(--fs-2xs, 10px);">#${escapeHtml(post.channel || "전체")}</span>
            ${post.taskId ? `<span class="badge" style="background:#7c3aed; color:#fff; font-size:var(--fs-2xs, 10px);">Task #WBS-${escapeHtml(post.taskId)}</span>` : ""}
            <strong style="color:var(--text-main); font-size:calc(13.5px * var(--fs-scale, 1));">${escapeHtml(post.author)}</strong>
            <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">(${escapeHtml(post.role || "")})</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:var(--fs-xs, 11px); color:var(--text-muted);">${escapeHtml(post.date)}</span>
            ${typeof AttachManager !== "undefined" ? AttachManager.btnHtml("post", String(post.id), post) : ""}
            ${postActionButtons}
          </div>
        </div>
        <div style="font-size:var(--fs-md, 14px); font-weight:bold; color:var(--primary, var(--tint-info-text)); margin-bottom:6px; display:flex; align-items:center; gap:6px;">
          <span>📌</span> <span>${escapeHtml(displayTitle)}</span>
        </div>
        <div style="font-size:var(--fs-base, 13px); line-height:1.6; color:var(--text-main); margin-bottom:8px; white-space:pre-wrap;">${escapeHtml(post.content)}</div>
        ${repliesHtml}
        <div style="margin-top:12px; display:flex; gap:8px;">
          <input type="text" id="replyInput_${post.id}" placeholder="스레드 답글 입력 후 Enter 또는 클릭..." style="flex:1; padding:6px 12px; font-size:var(--fs-sm, 12px); border:1px solid var(--border-color); border-radius:4px;" data-keydown="NoticeCommManager.addReply" data-keydown-args="${UiEvents.args(String(post.id))}" data-keydown-key="Enter">
          <button class="btn btn-secondary btn-sm" data-click="NoticeCommManager.addReply" data-click-args="${UiEvents.args(String(post.id))}">💬 답글</button>
        </div>
      `;
      feedWrap.appendChild(card);
    });

    container.appendChild(feedWrap);
  },

  // 2. 칸반 보드 & 담벼락 뷰 (Notion / Linear 스타일)
});
