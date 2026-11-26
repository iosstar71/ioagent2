// =============================================================================
// 샘플 프로젝트 자료 다듬기 — static/js/core/sample-snapshot.js 를 고쳐 씀 (몇 번 돌려도 결과가 같음)
//   node tools/build_sample.js
// 샘플은 교육 · 시연용이면서 시험의 기준 자료다. [🧪 샘플 프로젝트 추가] 로 만든 프로젝트 하나로
// 모든 화면 · 상태 · 경고를 볼 수 있도록 경우를 빠짐없이 넣는다. 넣어야 할 경우의 목록과 검사는
// tools/tests/sample_coverage.js (단위 시험에서 함께 돌고, E2E 는 이 샘플로 화면을 시험한다).
// 새 기능을 만들면: ① 여기에 그 기능의 경우를 넣고 ② sample_coverage.js 에 검사를 더하고 ③ 이 스크립트를 돌린다.
// =============================================================================
"use strict";
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "static/js/core/sample-snapshot.js");
const VAR = "WATERFALL_MANUFACTURING_SAMPLE_SNAPSHOT";
const HEAD = [
  "// 샘플 프로젝트 자료 (2027 스마트공장 제조: PMO 1 · 폭포수 표준형 2 · 개선과제형 1, 레벨 5 WBS, 주간보고 · 회의록 포함)",
  "//  두 판의 [🧪 샘플 프로젝트 추가](core/sample-project.js)가 이 자료로 새 프로젝트를 만든다. 샘플 자료는 이 파일 한 곳에만 둔다",
  "//  시험 기준 자료이기도 하다: 고칠 때는 tools/build_sample.js 를 고쳐 돌리고, 담긴 경우는 tools/tests/sample_coverage.js 로 확인한다",
  "//  엑셀로 보려면 샘플 프로젝트를 추가한 뒤 [다운로드 > 전체 자료]로 받는다"
];

function load() {
  const src = fs.readFileSync(FILE, "utf8");
  return new Function(src + ";return " + VAR)();
}
const byId = (list, id) => list.find(x => String(x.id) === String(id));
// 없으면 넣고 있으면 고침 (after: 이 id 뒤에 넣음)
function upsert(list, row, after) {
  const cur = byId(list, row.id);
  if (cur) return Object.assign(cur, row);
  const i = after !== undefined ? list.findIndex(x => String(x.id) === String(after)) : -1;
  if (i === -1) list.push(row); else list.splice(i + 1, 0, row);
  return row;
}
const set = (list, id, patch) => { const r = byId(list, id); if (!r) throw new Error("sample: no row " + id); return Object.assign(r, patch); };

function build(S) {
  const cfg = S.projectConfig;
  // ---- 프로젝트 설정: 범위 협의 알림이 보이도록 기준을 낮춤 (MES 개선 요청 3건)
  cfg.scopeAlert = 3;

  // ---- WBS: L5 Task (생산실적 수집 모듈을 둘로 나눔 — 기준선 후 추가된 Task 도 됨)
  const w = S.wbsData;
  set(w, "2.3.1.2", { isLeaf: false });
  upsert(w, { id: "2.3.1.2.2", level: 5, system: "MES", name: "실적 보정 · 승인 화면 개발", weight: 50, reqId: "REQ-MES-02", pStart: "2027-06-03", pEnd: "2027-06-11", aStart: "2027-06-03", aEnd: "", pProg: 22, aProg: 20, owner: "정개발 선임", output: "실적 보정 화면", isLeaf: true, status: "진행중" }, "2.3.1.2");
  upsert(w, { id: "2.3.1.2.1", level: 5, system: "MES", name: "실적 수집 API 개발", weight: 50, reqId: "REQ-MES-02", pStart: "2027-05-24", pEnd: "2027-06-02", aStart: "2027-05-24", aEnd: "2027-06-02", pProg: 100, aProg: 100, owner: "정개발 선임", output: "실적 수집 API", isLeaf: true, status: "완료" }, "2.3.1.2");

  // ---- WBS: 선행 Task (최대 3개) — 경고 세 가지 + 경고 없음 + 여러 개 + 다른 서브시스템
  const preds = {
    "2.3.2.1": "2.2.2.2",                    // 선행 지연 (인터페이스 정의서가 늦음)
    "3.3.2.2": "2.3.2.2",                    // 일정 겹침 (MES 설비 연계가 끝나기 전에 시작 계획) · 다른 서브시스템
    "3.3.1.3": "2.3.1.2",                    // 선행 미완료 상태에서 시작 (실제 시작을 앞당김)
    "4.3.1.1": "4.2.1.2",                    // 선행 지연 + 미완료 상태에서 시작
    "2.3.1.3": "2.3.1.1",                    // 선행 완료 — 경고 없음 (회색 ⛓)
    "2.4.1.1": "2.3.1.3, 2.3.2.1, 2.3.2.2"   // 선행 3개
  };
  Object.keys(preds).forEach(id => set(w, id, { pred: preds[id] }));
  set(w, "3.3.1.3", { aStart: "2027-06-03", aProg: 5, status: "진행중" });

  // ---- 기준선 1 (착수 때) — 설계 Task 2건은 그 뒤 1주 밀림, L5 는 기준선 후 추가
  cfg.baselines = [{ no: 1, date: "2027-01-29", by: "김총괄 수석PM", reason: "착수보고 승인 — 최초 기준선" }];
  cfg.baselineCompare = "first";
  const shifted = { "2.2.2.2": ["2027-04-16", "2027-04-23"], "3.2.1.2": ["2027-03-24", "2027-04-02"] };
  w.forEach(t => {
    if (!t.isLeaf || !t.pStart || !t.pEnd || t.level === 5) { delete t.bHist; return; }
    t.bHist = { 1: shifted[t.id] || [t.pStart, t.pEnd] };
  });

  // ---- 요구사항: 보류 · 삭제 · 추가 요구사항(CR, VOC 에서 등록)
  const r = S.reqMasterData;
  set(r, "REQ-OEE-05", { status: "보류" });
  upsert(r, { id: "REQ-PMO-04", system: "PMO", name: "(중복 등록) 주간 보고 양식 통합", type: "관리", priority: "하", accept: "수용", status: "삭제" });
  upsert(r, { id: "CR-QMS-01", system: "QMS", name: "검사 성적서 PDF 일괄 출력", type: "기능", priority: "중", accept: "수용", status: "대기", origin: "추가", srcVoc: "VOC-QMS-03", addedDate: "2027-05-27" });

  // ---- VOC: 판정 5종 · 상태 6종 · 통합테스트 결함(심각도 · 해결일 · 지연) · 범위 협의 알림 · 보류(지연 아님)
  const v = S.vocData;
  const base = { requester: "", action: "" };
  upsert(v, Object.assign({}, base, { id: "VOC-MES-04", system: "MES", priority: "높음", vocType: "이슈", title: "야간 라인 네트워크 끊김 시 실적 유실 우려", requester: "생산2팀 반장", reqDate: "2027-05-30", targetDate: "2027-06-20", status: "진행", action: "단말 로컬 저장 후 재전송 방안 검토" }));
  upsert(v, Object.assign({}, base, { id: "VOC-MES-05", system: "MES", priority: "보통", vocType: "개선 요청", title: "작업지시 화면 글자 크기 확대", requester: "생산1팀 작업자", reqDate: "2027-06-01", targetDate: "2027-06-18", status: "진행", action: "VOC 안에서 처리 (작은 개선)" }));
  upsert(v, Object.assign({}, base, { id: "VOC-QMS-03", system: "QMS", priority: "보통", vocType: "개선 요청", title: "검사 성적서 PDF 일괄 출력 요청", requester: "품질팀 대리", reqDate: "2027-05-24", targetDate: "2027-07-30", status: "요구 반영", reqLink: "CR-QMS-01", closedDate: "2027-05-27", action: "범위가 커서 추가 요구사항으로 등록" }));
  // 통합테스트 결함은 MES · QMS 통합테스트 기간(9~10월) 접수 — 기준일(06-04)에는 결함 현황이 보이지 않고, 기준일을 10월로 바꾸면 나타남
  ["VOC-OEE-03", "VOC-OEE-04", "VOC-OEE-05"].forEach(id => { const i = v.findIndex(x => x.id === id); if (i !== -1) v.splice(i, 1); });
  upsert(v, Object.assign({}, base, { id: "VOC-MES-06", system: "MES", priority: "긴급", vocType: "결함", severity: "치명", title: "작업지시 확정 시 LOT 번호 중복 발번", requester: "생산1팀 반장", reqDate: "2027-09-17", targetDate: "2027-09-22", status: "완료", closedDate: "2027-09-21", action: "LOT 채번 잠금 처리" }));
  upsert(v, Object.assign({}, base, { id: "VOC-MES-07", system: "MES", priority: "높음", vocType: "결함", stage: "통합테스트", stageManual: true, severity: "보통", title: "실적 보정 승인 후 화면이 갱신되지 않음", requester: "생산2팀 대리", reqDate: "2027-09-20", targetDate: "2027-09-24", status: "진행", action: "승인 후 목록 다시 불러오기 수정 중" }));
  upsert(v, Object.assign({}, base, { id: "VOC-QMS-04", system: "QMS", priority: "보통", vocType: "미판정", title: "SPC 관리도 한계선이 두 번 그려짐", requester: "품질팀 사원", reqDate: "2027-09-28", targetDate: "2027-10-06", status: "대기" }));
  upsert(v, Object.assign({}, base, { id: "VOC-PMO-02", system: "PMO", priority: "보통", vocType: "개선 요청", title: "주간보고 자동 메일 발송", requester: "경영지원팀", reqDate: "2027-04-20", targetDate: "2027-05-20", status: "보류", action: "2단계에서 검토 (보류는 지연으로 세지 않음)" }));
  upsert(v, Object.assign({}, base, { id: "VOC-PMO-03", system: "PMO", priority: "보통", vocType: "미판정", title: "(중복 접수) 주간보고 메일", requester: "경영지원팀", reqDate: "2027-04-21", targetDate: "2027-05-20", status: "삭제" }));

  set(v, "VOC-OEE-01", { targetDate: "2027-06-02" });   // 목표일이 기준일보다 앞 — 지연 VOC
  // ---- 산출물: 차수별 · 지연(계획 제출일 지남)은 기존 5 · 7번
  // ---- Action Item: 기한 지난 진행중
  const m = byId(S.meetingsData, "MTG-20270602-01") || S.meetingsData[2];
  m.actionItems = m.actionItems || [];
  upsert(m.actionItems, { id: "ACT-602-01-2", meetingId: m.id, title: "OEE 결함 재현 데이터 공유", content: "센서 누락 구간 로그 전달", requester: "최설비 책임", assignee: "강센서 선임", system: "OEE", meetingDate: m.date, targetDate: "2027-06-01", status: "진행" });

  // ---- 게시판: 글 상태 3종
  ["OPEN", "PROGRESS", "RESOLVED"].forEach((st, i) => { if (S.communicationsData[i]) S.communicationsData[i].status = st; });
  return S;
}

function write(S) {
  const body = HEAD.join("\n") + "\nvar " + VAR + " = " + JSON.stringify(S) + ";\n";
  fs.writeFileSync(FILE, body);
}

if (require.main === module) {
  const S = build(load());
  write(S);
  console.log(`[OK] sample written: WBS ${S.wbsData.length} · REQ ${S.reqMasterData.length} · VOC ${S.vocData.length} · meetings ${S.meetingsData.length}`);
}
module.exports = { load, build };
