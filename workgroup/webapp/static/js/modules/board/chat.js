// [IOSTAR-PM] 실시간 채팅
//  (v3.6.0: app.js 를 업무별 파일로 나눔 — 불러오는 순서는 index.html 참고)
// =============================================================================
// [ver1.0.4] 실시간 팀 채팅 매니저 (서버 연결 시에만 활성화)
// =============================================================================
// =============================================================================
// 실시간 채팅 (DB 서버 모드 전용)
//  - 로컬 저장소 모드: "오프라인" 표시 및 채팅 기능 비활성화 (v1.0.6)
//  - DB 서버 모드: 로그인 토큰으로 서버 채팅 API 사용 (2.5초 주기 동기화)
// =============================================================================
var RealtimeChatManager = {
  isConnected: false,
  activeChannel: "전체",
  pollTimer: null,
  messages: [],

  async init() {
    this.renderChannelButtons();
    await this.checkServerConnection(false);
    if (this.isConnected) await this.startPolling();
  },

  renderChannelButtons() {
    const chatContainer = document.getElementById("chatChannelListContainer");
    if (!chatContainer) return;
    const channels = (typeof NoticeCommManager !== "undefined" && NoticeCommManager.getChannels)
      ? NoticeCommManager.getChannels()
      : ["전체", ...((typeof getAllSubsystemNames === "function") ? getAllSubsystemNames() : ["PMO", "W1", "W2", "P1", "A1", "A2", "S1"])];
    
    chatContainer.innerHTML = channels.map(c => `
      <button class="chat-channel-btn ${this.activeChannel === c ? 'active' : ''}" data-channel="${escapeHtml(c)}" data-click="RealtimeChatManager.setChannel" data-click-args="${UiEvents.args(String(c))}">
        <span># ${escapeHtml(c)}</span>
      </button>
    `).join("");
  },

  async checkServerConnection(showFeedback = false) {
    // [Workgroup] 채팅 꺼짐 (app.ini [features] chat=0): 로컬 저장소 방식처럼 잠금 — 주기 통신 없음
    if (typeof Features !== "undefined" && !Features.on("chat")) {
      this.setConnected(false, "사용 안 함 (Workgroup 판 — 채팅은 Enterprise 판 예정)");
      if (showFeedback) showToast("💬 " + Features.offText("chat"));
      return false;
    }
    if (SyncManager.isLocal()) {
      this.setConnected(false, "오프라인 (로컬 저장소 모드에서는 채팅을 사용할 수 없습니다)");
      if (showFeedback) showToast("💬 채팅은 DB 서버 모드에서만 사용할 수 있습니다. (시스템 설정 > DB 연동에서 서버 모드 선택)");
      return false;
    }
    const res = await ServerBackend.request("/api/chat/messages?channel=" + encodeURIComponent(this.activeChannel), null, "GET");
    const ok = !!res.ok;
    this.setConnected(ok, ok ? "서버 정상 연결 (실시간 채팅 활성화)" : "오프라인 (DB 서버 연결 실패)");
    if (ok) this.renderMessages(res.messages || [], true);
    if (showFeedback) showToast(ok ? "🟢 채팅 서버와 정상 연결되었습니다." : "⚠️ 채팅 서버에 연결할 수 없습니다. run_server.bat 실행 여부를 확인하세요.");
    return ok;
  },

  setConnected(connected, statusText) {
    this.isConnected = connected;
    const dot = document.getElementById("chatServerStatusDot");
    const indicator = document.getElementById("chatServerStatusText");
    const offlineBanner = document.getElementById("chatServerOfflineBanner");
    const activeArea = document.getElementById("chatActiveArea");
    const input = document.getElementById("chatMessageInput");
    const sendBtn = document.getElementById("btnChatSend");
    if (dot) {
      dot.style.color = connected ? "#10b981" : "#94a3b8";
      dot.textContent = connected ? "● 온라인" : "● 오프라인";
    }
    if (indicator) {
      indicator.textContent = statusText;
      indicator.style.color = connected ? "#059669" : "#64748b";
    }
    if (offlineBanner) offlineBanner.style.display = connected ? "none" : "flex";
    if (activeArea) activeArea.classList.toggle("chat-offline-disabled", !connected);
    if (input) {
      input.disabled = !connected;
      input.placeholder = connected ? "메시지를 입력하세요... (Enter 키로 전송)" : "오프라인 - 채팅 사용 불가";
    }
    if (sendBtn) sendBtn.disabled = !connected;
    if (!connected) this.stopPolling();
  },

  async startPolling() {
    this.stopPolling();
    if (typeof Features !== "undefined" && !Features.on("chat")) return;
    await this.fetchMessages(true);
    this.pollTimer = setInterval(async () => {
      const pane = document.getElementById("tab-notices");
      const subpane = document.getElementById("subpane_CHAT");
      if (pane && pane.classList.contains("active") && subpane && subpane.style.display !== "none") {
        if (this.isConnected) {
          await this.fetchMessages(false);
        }
      }
    }, 2500);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  setChannel(ch) {
    this.activeChannel = ch;
    this.renderChannelButtons();
    const curTitle = document.getElementById("chatCurrentChannelTitle");
    if (curTitle) curTitle.textContent = `# ${ch} 채널`;
    if (this.isConnected) this.fetchMessages(true);
  },

  async fetchMessages(forceScroll = false) {
    if (!this.isConnected) return;
    const res = await ServerBackend.request("/api/chat/messages?channel=" + encodeURIComponent(this.activeChannel), null, "GET");
    if (res.ok && Array.isArray(res.messages)) this.renderMessages(res.messages, forceScroll);
    else if (res.network) this.setConnected(false, "오프라인 (DB 서버 연결 끊김)");
  },

  renderMessages(msgs, forceScroll = false) {
    this.messages = msgs;
    const stream = document.getElementById("chatMessagesStream");
    if (!stream) return;

    if (!Array.isArray(msgs) || msgs.length === 0) {
      stream.innerHTML = `<div style="text-align:center; padding:60px 20px; color:#94a3b8; font-size:var(--fs-base, 13px);">
        💬 <b>#${escapeHtml(this.activeChannel)}</b> 채널에 등록된 실시간 메시지가 없습니다.<br>
        팀원들에게 첫 메시지를 전송해보세요! (Enter 키로 즉시 전송)
      </div>`;
      return;
    }

    const curUser = (typeof AuthManager !== "undefined" && typeof AuthManager.getCurrentUser === "function" ? AuthManager.getCurrentUser() : (AuthManager?.currentUser || { name: "관리자", empNo: "admin" }));
    let html = "";
    msgs.forEach(m => {
      const isMe = m.senderEmpNo === curUser.empNo || m.senderName === curUser.name;
      html += `
        <div style="display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:12px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:var(--fs-xs, 11px); color:#64748b;">
            <strong style="color:${isMe ? '#2563eb' : '#1e293b'}; font-size:var(--fs-sm, 12px);">${escapeHtml(m.senderName)}</strong>
            <span>(${escapeHtml(m.userRole || "MEMBER")})</span>
            <span style="font-size:var(--fs-2xs, 10px); color:#94a3b8;">${escapeHtml(m.createdAt || "")}</span>
          </div>
          <div style="max-width:75%; padding:9px 15px; border-radius:${isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px'}; background:${isMe ? '#2563eb' : '#f1f5f9'}; color:${isMe ? '#ffffff' : '#1e293b'}; font-size:var(--fs-base, 13px); line-height:1.55; word-break:break-word; box-shadow:0 1px 2px rgba(0,0,0,0.06);">
            ${escapeHtml(m.message)}
          </div>
        </div>
      `;
    });
    stream.innerHTML = html;
    if (forceScroll || stream.scrollHeight - stream.scrollTop - stream.clientHeight < 160) {
      stream.scrollTop = stream.scrollHeight;
    }
  },

  async sendMessage() {
    if (!this.isConnected) {
      showToast("💬 오프라인 상태에서는 채팅을 사용할 수 없습니다.");
      return;
    }
    const input = document.getElementById("chatMessageInput");
    const msg = (input && input.value || "").trim();
    if (!msg) return;
    const res = await ServerBackend.request("/api/chat/send", { id: Date.now().toString(), channel: this.activeChannel, message: msg });
    if (res.ok) {
      input.value = "";
      await this.fetchMessages(true);
    } else {
      showToast("⚠️ 메시지 전송 실패: " + (res.message || ""));
    }
  },

  async clearAllChat() {
    if (!this.isConnected) {
      showToast("💬 채팅은 DB 서버 모드에서만 사용할 수 있습니다.");
      return;
    }
    openConfirmDialog("⚠️ 서버의 모든 채팅 기록을 삭제하시겠습니까? (업무 데이터는 보존됩니다)", async () => {
      const res = await ServerBackend.request("/api/chat/clear", {});
      if (!res.ok) { showToast("⚠️ 채팅 삭제 실패: " + (res.message || "")); return; }
      this.messages = [];
      this.renderMessages([], true);
      showToast("🧹 채팅 대화기록이 모두 초기화되었습니다.");
    });
  }
};
window.RealtimeChatManager = RealtimeChatManager;


window.addEventListener("resize", () => {
  if (typeof LayoutManager !== "undefined") LayoutManager.adjustSidebar();
});
