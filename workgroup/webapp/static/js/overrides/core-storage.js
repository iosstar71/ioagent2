// Workgroup 판: core/storage.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(StorageManager, {


  // [v3.9.0] 2027 제조 분야 샘플 (PMO 1 · 폭포수 표준형 2 · 개선과제형 1, 레벨 4 WBS, 주간보고 · 회의록 포함)
  //  지금 프로젝트의 자료만 바꾸고, 샘플 담당자 계정은 없으면 이 프로젝트 참여자로 추가 (다른 사용자 · 프로젝트는 그대로)
  _applySample() {
      {
        BackupHistoryManager.createBackupSnapshot("제조샘플복원직전백업", "ALL", false);
        const c = DataRegistry.clone(WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT);
        DataRegistry.apply(c, ["projectConfig", "subsystemsMeta", "standardDeliverablesMeta", "wbsData", "deliverablesData", "reqMasterData", "vocData",
          "noticesData", "communicationsData", "meetingsData", "weeklyReportsData"]);
        const users = DataRegistry.clone(ProjectContext.allUsers && ProjectContext.allUsers.length ? ProjectContext.allUsers : DataRegistry.get("projectUsers"));
        (c.projectUsers || []).forEach(su => {
          const u = users.find(x => String(x.empNo).toLowerCase() === String(su.empNo).toLowerCase());
          const a = { role: su.role, subsystem: su.subsystem, dept: su.dept };
          if (u) { if (!ProjectContext.isAdminUser(u)) u.projectRoles = Object.assign({}, u.projectRoles, { [ProjectContext.current]: a }); }
          else users.push(Object.assign({}, su, { projectRoles: { [ProjectContext.current]: a } }));
        });
        DataRegistry.set("projectUsers", users);
        this._afterBulkReplace("✅ [2027 제조 샘플 복원 완료] PMO · MES · QMS(폭포수) · OEE(개선과제) 샘플로 바꿨습니다. (같은 내용의 엑셀: Sample/2027_제조_스마트공장_샘플_4레벨.xlsx)");
      }
  },

  _factoryBlank() {
      {
        BackupHistoryManager.createBackupSnapshot("완전초기화직전백업", "ALL", false);
        const curYear = new Date().getFullYear();
        projectConfig = {
          systemTitle: APP_VERSION.title,
          projectName: "신규 프로젝트",
          domains: ["기본분야"],
          customSdlcTypes: [
            DataRegistry.clone(WBSEngine.DEFAULT_SDLC_PRESETS.COMPACT),
            DataRegistry.clone(WBSEngine.DEFAULT_SDLC_PRESETS.DETAILED)
          ],
          maxDeliverableRounds: 2,
          projectStartDate: `${curYear}-01-01`,
          projectEndDate: `${curYear}-12-31`,
          weekStartDay: 1,
          reportDate: `${curYear}-01-01`,
          progressBasis: "CALENDAR",
          idPrefixConfig: { wbsPrefix: "WBS", wbsUseSubCode: true, reqPrefix: "REQ", reqUseSubCode: true, vocPrefix: "VOC", vocUseSubCode: true },
          holidays: []
        };
        subsystemsMeta = [];
        standardDeliverablesMeta = [];
        wbsData = [];
        deliverablesData = [];
        reqMasterData = [];
        vocData = [];
        noticesData = [];
        communicationsData = [];
        meetingsData = [];
        weeklyReportsData = [];
        RealtimeChatManager.messages = [];
        NoticeCommManager.activeChannel = "전체";
        DataRegistry.set("projectUsers", [
          { empNo: "admin", name: "관리자", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" },
          { empNo: "admin2", name: "관리자2", role: "SYS_ADMIN", subsystem: "ALL", dept: "시스템 총괄관리자", pwdHash: "", lang: "ko" },
          { empNo: "pm", name: "프로젝트관리자", role: "PM", subsystem: "ALL", dept: "프로젝트 총괄 PM", pwdHash: "", lang: "ko",
            projectRoles: { [ProjectContext.current]: { role: "PM", subsystem: "ALL", dept: "프로젝트 총괄 PM" } } }
        ]);
        try {
          localStorage.removeItem(AuthManager.STORAGE_POLICY_KEY);
          localStorage.removeItem(AuthManager.STORAGE_AUTOLOCK_KEY);
        } catch (e) {}
        DataRegistry.set("theme", defaultTheme());
        this._afterBulkReplace("✅ [완전 초기화 완료] 모든 설정, 프로젝트 설정 및 업무 데이터가 초기 상태로 초기화되었습니다.");
      }
  }
});

