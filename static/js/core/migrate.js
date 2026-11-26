// =============================================================================
// 예전 자료 변환 — 한 곳에 모음
// -----------------------------------------------------------------------------
//  기능을 바꿔 자료의 모양 · 값이 달라지면, 예전 자료를 새 모양으로 바꾸는 단계를 여기에 추가한다.
//  (화면 코드 곳곳에 "예전 값이면 …" 을 흩어 두지 않는다. 자료 정의: docs/DATA_MODEL.md)
//
//  data(data)  — 자료 묶음을 불러올 때 (저장소 · 백업 · 마스터 파일). 값 이름만 바뀐 것
//  project()   — 프로젝트를 열거나 다시 계산할 때. 자료 형식 변환. 바뀌었으면 true (부르는 쪽이 조용히 저장)
//
//  다른 곳에 두는 변환 (화면 설정 값이라 그 자리에서 읽을 때 바꿈) — 목록만 여기에 적어 둔다
//   - 테마 예전 값 → 지금 테마           : common/tabs-theme.js  THEME_ALIASES
//   - 메뉴 위치 예전 값 → 위쪽 메뉴      : common/layout.js
//   - 첫 화면 예전 값 PORTAL → My Work  : modules/home/home.js
//   - 엑셀 · 워드 색 예전 이름          : modules/dataio/excel-sync.js  normalizeExportTheme
//   - 참여 정보 없는 예전 멤버 행        : core/data-store.js  ProjectContext.migrateLocalUsers
//   - 엑셀 시트 · 열 예전 이름(읽기)      : modules/dataio/excel-sync.js (시트 이름 별칭)
// =============================================================================
var Migrate = {
  // 지금 자료 모양의 번호. 자료 모양을 바꾸면 1 올리고 PROJECT_STEPS 에 단계를 더한다
  VERSION: 3,

  DATA_STEPS: [
    {
      id: "terms",
      desc: "상태 '착수전' → '대기', 산출물 차수 'N회차' → 'N차'",
      run(data) {
        const st = r => { if (r && r.status === "착수전") r.status = "대기"; };
        ["reqMasterData", "vocData", "wbsData"].forEach(k => { if (Array.isArray(data[k])) data[k].forEach(st); });
        if (Array.isArray(data.deliverablesData)) data.deliverablesData.forEach(d => {
          st(d);
          if (d && typeof d.round === "string") d.round = d.round.replace(/^(\d)회차$/, "$1차");
        });
      }
    },
    {
      id: "voc-judge",
      desc: "VOC 구분 → 판정 (VOC→미판정, 버그→결함), 상태 '제외' → 완료 + 설명 종결, 끝난 VOC 의 종료일(없으면 목표일)",
      run(data) {
        if (!Array.isArray(data.vocData)) return;
        data.vocData.forEach(v => {
          if (!v) return;
          const j = Metrics.judgeOf(v);
          v.vocType = j;
          if (v.status === "제외") { v.status = "완료"; if (j === "미판정") v.vocType = "설명 종결"; }
          if (Metrics.VOC_DONE.indexOf(v.status) !== -1 && !v.closedDate && v.targetDate) v.closedDate = v.targetDate;
        });
      }
    }
  ],

  PROJECT_STEPS: [
    {
      id: "weight-model",
      desc: "WBS 가중치: 서브시스템 안 형제 Task 합계 100 기준으로 (projectConfig.weightModel)",
      run: () => typeof WbsWeight !== "undefined" && WbsWeight.migrateIfNeeded()
    },
    {
      id: "sdlc-used-types",
      desc: "프로젝트 SDLC 유형 목록(activeSdlcCodes) = 서브시스템들이 고른 유형 (미리 고르는 방식 없앰)",
      run: () => {
        if (typeof SdlcBoard === "undefined") return false;
        const before = JSON.stringify(projectConfig.activeSdlcCodes || null);
        SdlcBoard.syncActive(true);
        return JSON.stringify(projectConfig.activeSdlcCodes || null) !== before;
      }
    },
    {
      id: "voc-stage",
      desc: "단계가 빈 VOC 에 접수일 · 서브시스템 Phase 일정으로 단계 채움 (접수 때 정한 단계는 바꾸지 않음)",
      run: () => typeof vocData !== "undefined" && WBSEngine.fillVocStages(vocData) > 0
    },
    {
      id: "schema-version",
      desc: "자료 모양 번호 기록 (projectConfig.schemaVersion)",
      run: () => {
        if ((parseInt(projectConfig.schemaVersion, 10) || 0) >= Migrate.VERSION) return false;
        projectConfig.schemaVersion = Migrate.VERSION;
        return true;
      }
    }
  ],

  data(data) {
    if (!data || typeof data !== "object") return data;
    this.DATA_STEPS.forEach(s => s.run(data));
    return data;
  },

  project() {
    if (typeof projectConfig === "undefined" || !projectConfig) return false;
    let changed = false;
    this.PROJECT_STEPS.forEach(s => {
      try { if (s.run()) changed = true; } catch (e) { console.warn("[Migrate]", s.id, e); }
    });
    return changed;
  }
};
window.Migrate = Migrate;
