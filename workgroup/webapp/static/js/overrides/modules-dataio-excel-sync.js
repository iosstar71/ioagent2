// Workgroup 판: modules/dataio/excel-sync.js 의 다른 부분 (서버 DB · 멤버 선택 · 체크아웃 잠금 등). 공통 파일 다음에 불러와 같은 이름을 덮어씀
// 공통 쪽을 고칠 때 이 파일의 같은 이름도 함께 확인한다 (docs/EDITIONS.md)

Object.assign(ExcelSync, {
  HEADER_ALIASES: {
    users: {
      empNo: ["멤버 ID(id)", "멤버 ID", "멤버 ID (멤버 선택 id)", "id", "empno"],
      name: ["성명", "이름", "사용자명", "name"],
      role: ["권한등급(sys_admin/pm/lead/member)", "권한등급(sys_admin/pm/member)", "권한등급", "권한", "시스템 권한 등급", "role"],
      subsystem: ["담당서브시스템", "담당 서브시스템", "서브시스템", "subsystem"],
      dept: ["소속부서/담당역할", "소속 부서 / 담당 역할", "부서", "역할", "dept"],
      lang: ["언어(ko/en)", "언어", "language", "lang"]
    },
    config: {
      category: ["설정구분", "구분", "카테고리", "category"],
      key: ["설정키/코드", "설정키", "코드", "key"],
      value: ["설정값/명칭", "설정값", "명칭", "value"],
      extra1: ["세부속성1(가중치/요일)", "세부속성1", "extra1"],
      extra2: ["세부속성2(산출물/비고)", "세부속성2", "extra2"],
      extra3: ["세부속성3(매칭키워드)", "세부속성3", "extra3"]
    },
    subsystems: {
      domain: ["분야", "분야(상위그룹)", "상위분야", "그룹", "도메인", "domain"],
      code: ["서브시스템코드", "코드", "서브시스템 코드/명", "code"],
      name: ["서브시스템명", "서브시스템", "시스템명", "name"],
      type: ["프로젝트유형(sdlc/req)", "프로젝트유형", "프로젝트 관리 유형", "유형", "type"],
      sdlcCode: ["sdlc타입코드", "sdlc코드", "sdlc타입", "sdlccode"],
      weight: ["가중치(%)", "가중치", "weight"],
      pm: ["담당자", "담당자/pm", "pm", "담당pm"],
      desc: ["과업개요", "서브시스템 개요 및 과업 범위", "개요", "설명", "desc"]
    },
    wbs: {
      id: ["wbs id", "wbsid", "id", "번호"],
      level: ["레벨", "레벨 / 단계이동", "level", "lvl", "단계레벨"],
      system: ["서브시스템", "서브시스템 (l1)", "서브시스템(l1)", "서브시스템명", "system"],
      name: ["작업명", "Task명", "태스크명", "task", "name"],
      weight: ["가중치(%)", "가중치", "weight"],
      reqId: ["요구사항 id", "요구사항id", "req id", "reqid"],
      pStart: ["계획시작일", "계획시작", "계획 시작일", "pstart"],
      pEnd: ["계획종료일", "계획종료", "계획 종료일", "pend"],
      aStart: ["실적시작일", "실적시작", "실적 시작일", "astart"],
      aEnd: ["실적종료일", "실적종료", "실적 종료일", "aend"],
      pProg: ["계획(%)", "계획진척율", "계획진척률", "계획", "pprog"],
      aProg: ["실적(%)", "실적진척율", "실적진척률", "실적", "aprog"],
      owner: ["담당자", "담당", "owner", "assignee"],
      output: ["산출물 / 조치계획", "산출물/조치계획", "산출물", "조치계획", " 비고", "output"]
    },
    deliverables: {
      round: ["제출차수", "제출 차수", "차수", "round"],
      system: ["서브시스템", "서브시스템명", "구분", "system"],
      phase: ["단계구분", "단계 구분", "단계", "phase"],
      name: ["산출물명", "산출물 명칭", "name"],
      pDate: ["계획제출일", "계획일자", "계획일", "pdate"],
      aDate: ["실제제출일", "실제일자", "실제일", "제출일", "adate"],
      status: ["진행상태", "진행 상태", "상태", "status"],
      manager: ["담당자", "작성자", "manager"],
      remarks: ["검토의견 및 조치내역", "검토 의견 및 보완 조치내역", "검토의견", "비고", "remarks"]
    },
    req: {
      id: ["요구사항 id", "요구사항id", "req id", "id"],
      system: ["서브시스템", "서브시스템명", "system"],
      name: ["요구사항 명칭", "요구사항 명칭 / 명세", "요구사항명", "개선 요건 명칭 및 과업", "name"],
      type: ["유형", "구분", "type"],
      priority: ["중요도", "우선순위", "priority"],
      accept: ["수용여부", "수용 여부", "accept"],
      status: ["진행상태", "진행 상태", "상태", "요건 상태", "status"]
    },
    voc: {
      id: ["voc id", "vocid", "id"],
      vocType: ["구분", "유형", "type"],
      system: ["서브시스템", "서브시스템명", "system"],
      priority: ["우선순위", "중요도", "priority"],
      title: ["요청제목", "요청 제목 / 이슈 내용", "제목", "이슈내용", "title"],
      requester: ["요청자", "요청부서", "requester"],
      reqDate: ["접수일자", "접수일", "요청일", "reqdate"],
      targetDate: ["목표완료일", "목표일자", "완료목표일", "targetdate"],
      status: ["처리상태", "처리 상태", "상태", "status"],
      action: ["처리결과 및 조치계획", "조치계획", "처리결과", "비고", "action"]
    }
  },

  // 무시할 UI 전용 계산 컬럼 (화면 표 복사 시 자동 스킵)
  _triggerDownload(blob, filename) {
    // [v1.0.5] 윈도우 파일명 금지문자 치환 및 다운로드 안정화
    const safeName = String(filename || "download").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, " ").trim() || "download";
    if (typeof window !== "undefined" && window.navigator && typeof window.navigator.msSaveOrOpenBlob === "function") {
      window.navigator.msSaveOrOpenBlob(blob, safeName);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 4000);
  },

  // ---------------------------------------------------------------------------
  // 2. 엑셀 내려받기 (단일 탭 & 마스터 통합본 - 표준 .xlsx 워크북 출력)
  // ---------------------------------------------------------------------------
});

Object.assign(DocxBuilder, {
});
