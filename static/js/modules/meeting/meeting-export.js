// =============================================================================
// 회의 다운로드 (MeetingManager 의 일부) — 회의록 워드 · 엑셀(양식: meeting-template.js), Action Item · 일정 목록 엑셀
// modules/meeting/meeting-manager.js 다음에 불러옴
// =============================================================================
Object.assign(MeetingManager, {

  // 회의록 단독 워드 생성
  exportMeetingDocx(meetingId) {
    const m = (meetingsData || []).find(x => x.id === meetingId) || meetingsData[0];
    if (!m) return;

    if (typeof DocxBuilder === "undefined" || typeof DocxBuilder.buildMeetingMinutesDocx !== "function") {
      showToast("⚠️ 워드 생성 엔진을 초기화할 수 없습니다.", "error");
      return;
    }

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";
    const blob = DocxBuilder.buildMeetingMinutesDocx(m, projName);
    const filename = ExcelSync.stdName("회의록", [m.system, m.title], "docx", String(m.date || "").replace(/-/g, ""));
    if (typeof ExcelSync !== "undefined" && typeof ExcelSync._triggerDownload === "function") {
      ExcelSync._triggerDownload(blob, filename);
    }
    showToast(`📄 [회의록 워드 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },


  // 회의록 엑셀(XLSX) 다운로드 — 회의록 양식(올린 양식, 없으면 기본 양식)에 채움 (MeetingTemplate)
  exportMeetingExcel(meetingId) { return MeetingTemplate.exportExcel(meetingId); },

  exportActionItemsExcel() {
    const allActions = this.getAllActionItems().filter(a => a.status !== "삭제");
    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";

    const rows = [
      { cells: [`[${projName}] 회의 도출 Action Item 통합 관리 대장`], styleId: 3, height: 28 },
      { cells: ["ID", "서브시스템", "연계 회의명", "회의일자", "Action Item 명칭", "세부 Task내용", "요청자", "담당자", "완료목표일", "상태"], styleId: 1, height: 24 }
    ];

    allActions.forEach(a => {
      rows.push({
        cells: [a.id, a.system || a.meetingSystem || "ALL", a.meetingTitle || "-", a.meetingDate || "-", a.title, a.content || "-", a.requester || "-", a.assignee || "-", a.targetDate || "-", a.status],
        styleId: 2,
        height: 22
      });
    });

    // Action Item 엑셀 제목 짤림 방지: A~J열 셀 병합
    const blob = ExcelSync._buildXlsxBlob([
      {
        name: "Action_Items_통합목록",
        colWidths: [14, 16, 32, 14, 34, 45, 14, 14, 14, 12],
        rows: rows,
        merges: ["A1:J1"]
      }
    ]);
    const filename = ExcelSync.stdName("ActionItem", [], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📊 [Action Items 엑셀 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },


  // 회의 일정 목록 전체/필터 엑셀 내려받기 (XLSX)
  exportScheduleListExcel() {
    const sysFilter = (document.getElementById("meetingFilterSubsystem") && document.getElementById("meetingFilterSubsystem").value) || "ALL";
    const statusFilter = (document.getElementById("meetingFilterStatus") && document.getElementById("meetingFilterStatus").value) || "ALL";
    const searchWord = (document.getElementById("meetingSearchInput") ? document.getElementById("meetingSearchInput").value : "").trim().toLowerCase();

    const filtered = (meetingsData || []).filter(item => {
      if (sysFilter !== "ALL" && item.system !== sysFilter) return false;
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (searchWord) {
        const text = `${item.title} ${item.location} ${item.host} ${item.notes}`.toLowerCase();
        if (!text.includes(searchWord)) return false;
      }
      return true;
    });

    const projName = (typeof projectConfig !== "undefined" && projectConfig.projectName) || "프로젝트";
    const scopeLabel = sysFilter === "ALL" ? "전체 서브시스템" : `${sysFilter} 서브시스템`;

    const rows = [
      { cells: [`[${projName}] 프로젝트 회의 일정 관리 대장 (${scopeLabel})`], styleId: 3, height: 28 },
      { cells: ["No", "서브시스템", "회의 제목", "회의 일자", "회의 시간", "회의 장소", "주관/발표", "진행상태", "비고 및 주요 안건"], styleId: 1, height: 24 }
    ];

    filtered.forEach((m, idx) => {
      rows.push({
        cells: [idx + 1, m.system, m.title, m.date, `${m.startTime || ""}~${m.endTime || ""}`, m.location || "-", m.host || "-", m.status || "예정", m.notes || m.summary || "-"],
        styleId: 2,
        height: 22
      });
    });

    const blob = ExcelSync._buildXlsxBlob([
      {
        name: "회의일정_목록",
        colWidths: [8, 14, 38, 14, 14, 24, 16, 12, 35],
        rows: rows,
        merges: ["A1:I1"]
      }
    ]);
    const filename = ExcelSync.stdName("회의일정", [scopeLabel], "xlsx");
    ExcelSync._triggerDownload(blob, filename);
    showToast(`📊 [회의일정 엑셀 다운로드 완료] ${filename} 파일이 저장되었습니다.`);
  },
});
