# -*- coding: utf-8 -*-
"""
[IOSTAR-PM v3.9.0] 2027년 제조 분야 샘플 프로젝트 자료 만들기

구성: PMO 1개(PMO 거버넌스형) · 폭포수 표준형 2개(MES · QMS) · 개선과제형 1개(OEE) — 레벨 4단계 WBS
      + 요구사항 · VOC · 산출물 · 회의록(Action Item) · 공지 · 업무 소통 · 사용자 · 마일스톤
기준일: 2027-06-04 (금) — 상반기 단계는 대부분 완료, 일부 지연 · 진행 중 Task 포함

    python tools/build_sample_2027.py <출력 JSON>

화면 쪽 마무리(공휴일 · 계획 진척률 계산 · 주간보고 작성 · 엑셀 내려받기)는 tools/finish_sample_2027.js 가 합니다.
"""
import datetime as dt
import json
import sys

REPORT_DATE = dt.date(2027, 6, 4)
D = dt.date.fromisoformat


def iso(d):
    return d.isoformat()


def split_range(start, end, n):
    """기간을 n 개로 나눈 (시작, 종료) — 평일 기준 대략 균등"""
    s, e = D(start), D(end)
    days = (e - s).days + 1
    out, cur = [], s
    for i in range(n):
        last = s + dt.timedelta(days=round(days * (i + 1) / n) - 1) if i < n - 1 else e
        while last.weekday() >= 5 and last > cur:
            last -= dt.timedelta(days=1)
        st = cur
        while st.weekday() >= 5 and st < last:
            st += dt.timedelta(days=1)
        out.append((iso(st), iso(last)))
        cur = last + dt.timedelta(days=1)
    return out


# ---------------------------------------------------------------------------
# 서브시스템 · 사람
# ---------------------------------------------------------------------------
SUBS = [
    {"domain": "관리공통", "code": "PMO", "name": "PMO", "type": "SDLC", "sdlcCode": "SDLC_PMO", "weight": 10, "pm": "김총괄 수석PM",
     "desc": "[PMO 사업관리] 전체 공정 · 품질 · 위험 관리, 감리 대응, 경영 보고, 종료 · 인수인계"},
    {"domain": "생산운영", "code": "MES", "name": "MES", "type": "SDLC", "sdlcCode": "SDLC_WATERFALL", "weight": 35, "pm": "이생산 책임",
     "desc": "[생산실행시스템 고도화] 작업지시 · 생산실적 · LOT 추적, ERP · 설비 연계 (폭포수 표준형)"},
    {"domain": "생산운영", "code": "QMS", "name": "QMS", "type": "SDLC", "sdlcCode": "SDLC_WATERFALL", "weight": 30, "pm": "박품질 책임",
     "desc": "[품질관리시스템 구축] 수입 · 공정 · 출하 검사, SPC, 부적합(NCR) · CAPA (폭포수 표준형)"},
    {"domain": "공정개선", "code": "OEE", "name": "OEE", "type": "REQ", "sdlcCode": "", "weight": 25, "pm": "최설비 책임",
     "desc": "[설비 가동률(OEE) 개선 과제] PLC · 센서 데이터 수집, 가동률 · 미소정지 분석 (개선과제형)"},
]
USERS = [
    ("admin", "시스템관리자", "SYS_ADMIN", "ALL", "시스템 총괄관리자"),
    ("admin2", "시스템관리자2", "SYS_ADMIN", "ALL", "시스템 총괄관리자"),
    ("pmo_kim", "김총괄 수석PM", "PM", "ALL", "PMO사업단 / 프로젝트 총괄"),
    ("pmo_yoon", "윤품질 선임", "MEMBER", "PMO", "PMO사업단 / 품질보증 · 감리 대응"),
    ("mes_lee", "이생산 책임", "LEAD", "MES", "생산혁신팀 / MES 총괄리더"),
    ("mes_jung", "정개발 선임", "MEMBER", "MES", "생산혁신팀 / MES 개발"),
    ("qms_park", "박품질 책임", "LEAD", "QMS", "품질보증팀 / QMS 총괄리더"),
    ("qms_han", "한검사 선임", "MEMBER", "QMS", "품질보증팀 / QMS 개발"),
    ("oee_choi", "최설비 책임", "LEAD", "OEE", "설비기술팀 / 가동률 개선 총괄리더"),
    ("oee_kang", "강센서 선임", "MEMBER", "OEE", "설비기술팀 / PLC · 센서 연계"),
]
LEAD = {"PMO": "김총괄 수석PM", "MES": "이생산 책임", "QMS": "박품질 책임", "OEE": "최설비 책임"}

# ---------------------------------------------------------------------------
# WBS (L1 서브시스템 → L2 공정 단계 → L3 활동 → L4 Task)
#   L2 이름 = 공정 유형의 단계 이름 (단계별 진척 매트릭스와 맞춤)
#   L4: (이름, 산출물, 요구사항 ID, 실적 조정) — 조정: None=일정대로, 숫자=기준일 실적(%) 고정(지연 · 앞섬 표현)
# ---------------------------------------------------------------------------
PLAN = {
    "PMO": ("PMO 사업관리 및 품질보증", [
        ("착수단계", 20, "2027-01-04", "2027-02-26", [
            ("사업 착수 및 수행계획 수립", [("사업수행계획서 작성 및 승인", "사업수행계획서", "REQ-PMO-01", None),
                                     ("착수보고회 개최", "착수보고서", "", None),
                                     ("WBS 기준선(Baseline) 확정", "WBS 통합공정표", "REQ-PMO-01", None)]),
            ("관리 기준 · 조직 구성", [("프로젝트 조직 및 R&R 확정", "", "", None),
                                  ("품질 · 위험 관리 계획 수립", "품질관리계획서", "REQ-PMO-02", None)]),
        ]),
        ("실행통제단계", 60, "2027-03-02", "2027-11-30", [
            ("공정 · 진척 통제", [("주간 공정회의 운영 및 진척 보고", "주간보고서", "REQ-PMO-01", None),
                               ("지연 Task 만회 대책 수립 · 관리", "", "", None),
                               ("월간 경영 보고", "월간보고서", "", None)]),
            ("품질 보증 · 감리 대응", [("1단계 분석설계 산출물 품질 검토", "품질검토결과서", "REQ-PMO-02", None),
                                   ("중간 감리 수검 및 시정조치", "감리시정조치결과서", "REQ-PMO-03", None),
                                   ("2단계 구현 산출물 품질 검토", "품질검토결과서", "REQ-PMO-02", None)]),
        ]),
        ("종료단계", 20, "2027-12-01", "2027-12-31", [
            ("사업 종료 및 인수인계", [("보안 점검 및 취약점 조치", "보안점검결과서", "REQ-PMO-03", None),
                                   ("사업완료보고서 작성", "사업완료보고서", "", None),
                                   ("운영 인수인계 및 교육", "인수인계서", "", None)]),
        ]),
    ]),
    "MES": ("생산실행시스템(MES) 고도화", [
        ("분석", 15, "2027-01-11", "2027-02-26", [
            ("현행 생산 업무 분석", [("생산계획 · 작업지시 업무 현황 분석", "현행업무분석서", "REQ-MES-01", None),
                                ("현장 공정 흐름(라우팅) 조사", "", "REQ-MES-02", None)]),
            ("요구사항 정의", [("MES 기능 요구사항 정의서 작성", "요구사항정의서", "REQ-MES-01", None),
                           ("요구사항 검토회 및 확정", "", "", None)]),
        ]),
        ("설계", 25, "2027-03-02", "2027-04-30", [
            ("화면 · UI 설계", [("작업지시 · 실적 화면 스토리보드 설계", "화면설계서", "REQ-MES-02", None),
                             ("현장 단말(태블릿) UI 설계", "화면설계서", "REQ-MES-04", None)]),
            ("DB · 인터페이스 설계", [("생산 DB(ERD) 설계", "DB설계서", "", None),
                                 ("ERP · 설비 인터페이스 정의서 작성", "인터페이스정의서", "REQ-MES-05", 85)]),
        ]),
        ("개발", 35, "2027-05-03", "2027-08-31", [
            ("작업지시 · 실적 모듈 개발", [("작업지시 발행 모듈 개발", "소스코드", "REQ-MES-02", None),
                                     ("생산실적 수집 모듈 개발", "소스코드", "REQ-MES-03", None),
                                     ("LOT 추적(Traceability) 기능 개발", "소스코드", "REQ-MES-03", None)]),
            ("인터페이스 개발", [("ERP 생산계획 연계 개발", "소스코드", "REQ-MES-05", None),
                             ("설비 데이터 수집 연계 개발", "소스코드", "REQ-MES-05", None)]),
        ]),
        ("테스트", 15, "2027-09-01", "2027-10-29", [
            ("통합테스트", [("통합테스트 시나리오 작성", "통합테스트시나리오", "", None),
                        ("통합테스트 수행 및 결함 조치", "통합테스트결과서", "", None)]),
            ("성능 · 사용자 테스트", [("부하 테스트(동시 사용자 200명)", "성능시험결과서", "REQ-MES-06", None),
                                 ("현장 사용자 인수 테스트", "인수시험결과서", "", None)]),
        ]),
        ("이행", 10, "2027-11-01", "2027-12-17", [
            ("시스템 전환", [("데이터 이관 및 검증", "데이터이관결과서", "", None),
                         ("운영 전환(컷오버) 및 오픈", "이행결과보고서", "", None)]),
            ("안정화", [("오픈 후 안정화 지원", "", "", None),
                     ("운영 매뉴얼 작성 및 교육", "운영자매뉴얼", "", None)]),
        ]),
    ]),
    "QMS": ("품질관리시스템(QMS) 구축", [
        ("분석", 15, "2027-01-18", "2027-03-05", [
            ("현행 품질 업무 분석", [("수입 · 공정 · 출하 검사 업무 분석", "현행업무분석서", "REQ-QMS-01", None),
                                ("품질 이슈(불량) 처리 프로세스 조사", "", "REQ-QMS-04", None)]),
            ("요구사항 정의", [("QMS 기능 요구사항 정의서 작성", "요구사항정의서", "REQ-QMS-01", None),
                           ("요구사항 검토 및 확정", "", "", None)]),
        ]),
        ("설계", 25, "2027-03-08", "2027-05-14", [
            ("화면 · UI 설계", [("검사 기준정보 화면 설계", "화면설계서", "REQ-QMS-02", None),
                             ("SPC 관리도 화면 설계", "화면설계서", "REQ-QMS-03", 70)]),
            ("DB · 인터페이스 설계", [("품질 DB(ERD) 설계", "DB설계서", "", None),
                                 ("MES 검사 실적 인터페이스 정의", "인터페이스정의서", "REQ-QMS-05", None)]),
        ]),
        ("개발", 35, "2027-05-17", "2027-09-10", [
            ("검사 · SPC 모듈 개발", [("검사 기준 관리 모듈 개발", "소스코드", "REQ-QMS-02", None),
                                 ("검사 실적 등록 모듈 개발", "소스코드", "REQ-QMS-02", None),
                                 ("SPC 통계 분석 모듈 개발", "소스코드", "REQ-QMS-03", None)]),
            ("부적합 · 연계 개발", [("부적합(NCR) · CAPA 처리 모듈 개발", "소스코드", "REQ-QMS-04", None),
                                ("MES 검사 실적 연계 개발", "소스코드", "REQ-QMS-05", None)]),
        ]),
        ("테스트", 15, "2027-09-13", "2027-11-05", [
            ("통합테스트", [("통합테스트 시나리오 작성", "통합테스트시나리오", "", None),
                        ("통합테스트 수행 및 결함 조치", "통합테스트결과서", "", None)]),
            ("사용자 테스트", [("품질팀 사용자 인수 테스트", "인수시험결과서", "", None),
                           ("검사 데이터 정합성 검증", "", "", None)]),
        ]),
        ("이행", 10, "2027-11-08", "2027-12-24", [
            ("시스템 전환", [("검사 기준 데이터 이관", "데이터이관결과서", "", None),
                         ("운영 전환 및 오픈", "이행결과보고서", "", None)]),
            ("안정화", [("오픈 후 안정화 지원", "", "", None),
                     ("품질팀 운영 교육", "운영자매뉴얼", "", None)]),
        ]),
    ]),
    "OEE": ("설비 가동률(OEE) 개선 과제", [
        ("설비통신 인터페이스설계", 20, "2027-02-01", "2027-03-31", [
            ("설비 통신 현황 조사", [("가공라인 설비(PLC · CNC) 통신 현황 조사", "설비현황조사서", "REQ-OEE-01", None),
                                ("통신 프로토콜(OPC-UA · Modbus) 정의", "", "REQ-OEE-01", None)]),
            ("인터페이스 설계", [("설비 데이터 수집 항목 정의서 작성", "통신인터페이스정의서", "REQ-OEE-02", None),
                             ("에지 게이트웨이 구성 설계", "", "", None)]),
        ]),
        ("PLC/센서 데이터수집연계", 35, "2027-04-01", "2027-07-30", [
            ("PLC 데이터 수집", [("PLC 태그 매핑 및 수집 드라이버 개발", "수집게이트웨이모듈", "REQ-OEE-02", None),
                             ("수집 데이터 버퍼링 · 재전송 처리", "", "REQ-OEE-02", 40)]),
            ("센서 연계", [("진동 · 온도 센서 IoT 연계", "", "REQ-OEE-03", None),
                        ("수집 데이터 품질 검증", "", "", None)]),
        ]),
        ("가동률/미소정지 로직구현", 30, "2027-06-01", "2027-09-30", [
            ("가동률 산출 로직", [("OEE(가용성 · 성능 · 품질) 산출 엔진 구현", "가동률산출엔진", "REQ-OEE-04", None),
                              ("비가동 사유 코드 체계 적용", "", "REQ-OEE-04", None)]),
            ("미소정지 감지", [("미소정지 감지 알고리즘 구현", "", "REQ-OEE-05", None),
                           ("가동률 대시보드 화면 개발", "", "REQ-OEE-05", None)]),
        ]),
        ("라인 시운전 및 종합안정화", 15, "2027-10-01", "2027-12-24", [
            ("라인 시운전", [("1라인 시운전 및 데이터 검증", "시운전검수보고서", "", None),
                          ("전 라인 확대 적용", "", "", None)]),
            ("종합 안정화", [("가동률 개선 효과 측정", "효과검증보고서", "", None),
                          ("운영 이관 및 교육", "인수인계서", "", None)]),
        ]),
    ]),
}


def actual(p_start, p_end, fixed):
    """기준일(2027-06-04) 실적: 끝난 Task 100%, 진행 중은 경과율, fixed 가 있으면 그 값(지연 · 앞섬)"""
    s, e = D(p_start), D(p_end)
    if s > REPORT_DATE:
        return 0, "", ""
    if fixed is not None:
        return fixed, p_start, (p_end if fixed >= 100 else "")
    if e <= REPORT_DATE:
        return 100, p_start, p_end
    ratio = ((REPORT_DATE - s).days + 1) / ((e - s).days + 1)
    return max(5, min(95, round(ratio * 100 / 5) * 5)), p_start, ""


def build_wbs():
    rows = []
    for n1, sub in enumerate(SUBS, 1):
        code = sub["code"]
        title, phases = PLAN[code]
        owner = LEAD[code]
        rows.append({"id": str(n1), "level": 1, "system": code, "name": title, "weight": sub["weight"], "reqId": "",
                     "pStart": phases[0][2], "pEnd": phases[-1][3], "aStart": phases[0][2], "aEnd": "", "pProg": 0, "aProg": 0,
                     "owner": owner, "output": ""})
        for n2, (pname, pw, ps, pe, acts) in enumerate(phases, 1):
            rows.append({"id": f"{n1}.{n2}", "level": 2, "system": code, "name": pname, "weight": pw, "reqId": "",
                         "pStart": ps, "pEnd": pe, "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "owner": owner, "output": ""})
            act_ranges = split_range(ps, pe, len(acts)) if code != "PMO" or pname != "실행통제단계" else [(ps, pe)] * len(acts)
            for n3, ((aname, tasks), (as_, ae)) in enumerate(zip(acts, act_ranges), 1):
                rows.append({"id": f"{n1}.{n2}.{n3}", "level": 3, "system": code, "name": aname, "weight": 50, "reqId": "",
                             "pStart": as_, "pEnd": ae, "aStart": "", "aEnd": "", "pProg": 0, "aProg": 0, "owner": owner, "output": ""})
                t_ranges = split_range(as_, ae, len(tasks))
                for n4, ((tname, out, req, fixed), (ts, te)) in enumerate(zip(tasks, t_ranges), 1):
                    a, a_s, a_e = actual(ts, te, fixed)
                    rows.append({"id": f"{n1}.{n2}.{n3}.{n4}", "level": 4, "system": code, "name": tname,
                                 "weight": round(100 / len(tasks)), "reqId": req, "pStart": ts, "pEnd": te,
                                 "aStart": a_s, "aEnd": a_e, "pProg": 0, "aProg": a, "owner": owner, "output": out})
    return rows


REQS = [
    ("REQ-PMO-01", "PMO", "전 서브시스템 WBS 일정 · 진척 통합 관리 및 주간 보고", "관리", "상", "진행"),
    ("REQ-PMO-02", "PMO", "단계별 산출물 품질 검토 및 감리 대응 체계 운영", "품질", "상", "진행"),
    ("REQ-PMO-03", "PMO", "보안 점검 및 감리 시정조치 이행 관리", "관리", "중", "착수전"),
    ("REQ-MES-01", "MES", "생산계획 수립부터 작업지시 발행까지 시스템화", "기능", "상", "진행"),
    ("REQ-MES-02", "MES", "현장 공정 라우팅 기반 작업지시 · 실적 화면 제공", "화면", "상", "진행"),
    ("REQ-MES-03", "MES", "LOT 단위 생산이력 추적(Traceability)", "기능", "상", "착수전"),
    ("REQ-MES-04", "MES", "현장 태블릿 단말 터치 UI 지원", "화면", "중", "완료"),
    ("REQ-MES-05", "MES", "ERP 생산계획 · 설비 데이터 실시간 연계", "인터페이스", "상", "진행"),
    ("REQ-MES-06", "MES", "동시 사용자 200명 응답시간 3초 이내", "비기능", "중", "착수전"),
    ("REQ-QMS-01", "QMS", "수입 · 공정 · 출하 검사 업무 전산화", "기능", "상", "진행"),
    ("REQ-QMS-02", "QMS", "품목별 검사 기준(항목 · 규격) 관리", "기능", "상", "진행"),
    ("REQ-QMS-03", "QMS", "SPC 관리도 및 공정능력(Cpk) 분석", "기능", "상", "진행"),
    ("REQ-QMS-04", "QMS", "부적합(NCR) 발생 · CAPA 조치 이력 관리", "기능", "중", "착수전"),
    ("REQ-QMS-05", "QMS", "MES 검사 실적 자동 연계", "인터페이스", "중", "진행"),
    ("REQ-OEE-01", "OEE", "가공라인 설비 통신 표준(OPC-UA) 수립", "인터페이스", "상", "완료"),
    ("REQ-OEE-02", "OEE", "PLC 가동 신호 1초 주기 수집 및 유실 0.1% 이하", "인터페이스", "상", "진행"),
    ("REQ-OEE-03", "OEE", "진동 · 온도 센서 이상 징후 수집", "기능", "중", "진행"),
    ("REQ-OEE-04", "OEE", "설비 · 라인별 OEE 자동 산출", "기능", "상", "진행"),
    ("REQ-OEE-05", "OEE", "미소정지 자동 감지 및 대시보드 제공", "화면", "중", "착수전"),
]
VOCS = [
    ("VOC-MES-01", "MES", "긴급", "야간 교대 시 작업지시 일괄 확인 화면 요청", "생산1팀 반장", "2027-03-15", "2027-04-15", "완료", "교대 인수인계 화면에 작업지시 일괄 확인 기능 반영"),
    ("VOC-MES-02", "MES", "상", "작업지시 화면 바코드 스캔 입력 지원", "생산2팀 현장 관리자", "2027-04-20", "2027-06-30", "진행", "현장 스캐너 기종 확인 후 7월 적용 예정"),
    ("VOC-MES-03", "MES", "중", "생산실적 엑셀 내려받기 양식 추가", "생산관리팀", "2027-05-25", "2027-07-30", "착수전", "양식 검토 중"),
    ("VOC-QMS-01", "QMS", "상", "검사 성적서 PDF 자동 발행", "품질보증팀", "2027-04-02", "2027-06-15", "진행", "성적서 양식 확정, 출력 모듈 개발 중"),
    ("VOC-QMS-02", "QMS", "중", "SPC 관리도 이상 패턴 알림(문자)", "공정품질팀", "2027-05-10", "2027-08-31", "착수전", "알림 채널(문자 · 메신저) 협의 필요"),
    ("VOC-OEE-01", "OEE", "긴급", "CNC 2호기 수집 데이터 간헐적 누락", "설비보전팀", "2027-05-20", "2027-06-10", "진행", "에지 게이트웨이 버퍼 증설 및 재전송 로직 보완 중"),
    ("VOC-OEE-02", "OEE", "중", "비가동 사유 입력 단축 버튼 요청", "가공1팀 반장", "2027-04-12", "2027-05-31", "완료", "다빈도 사유 8개 단축 버튼 적용"),
    ("VOC-PMO-01", "PMO", "중", "주간보고 서브시스템별 양식 통일 요청", "경영기획팀", "2027-02-10", "2027-03-05", "완료", "주간보고 표준 양식 배포 및 적용"),
]
DELIVS = [
    # (회차, 서브시스템, 단계, 이름, 계획, 실제, 상태, 비고)
    ("1회차", "PMO", "요구사항정의단계", "사업수행계획서 및 WBS 통합공정표", "2027-01-29", "2027-01-28", "보완완료", "착수보고 승인, 기준선 확정"),
    ("1회차", "PMO", "요구사항정의단계", "품질관리계획서", "2027-02-26", "2027-02-26", "보완완료", ""),
    ("1회차", "MES", "요구사항정의단계", "MES 요구사항정의서", "2027-02-26", "2027-02-25", "보완완료", "요구사항 검토회 반영"),
    ("1회차", "MES", "분석설계단계", "MES 화면설계서", "2027-04-16", "2027-04-16", "보완완료", ""),
    ("1회차", "MES", "분석설계단계", "MES 인터페이스정의서", "2027-04-30", "", "검토요청", "ERP 연계 항목 보완 요청"),
    ("1회차", "QMS", "요구사항정의단계", "QMS 요구사항정의서", "2027-03-05", "2027-03-05", "보완완료", ""),
    ("1회차", "QMS", "분석설계단계", "QMS 화면설계서", "2027-05-14", "", "작성중", "SPC 화면 설계 지연"),
    ("1회차", "QMS", "분석설계단계", "QMS DB설계서", "2027-05-14", "2027-05-13", "보완완료", ""),
    ("1회차", "OEE", "요구사항정의단계", "설비 통신인터페이스정의서", "2027-03-31", "2027-03-30", "보완완료", ""),
    ("1회차", "PMO", "분석설계단계", "1단계 분석설계 품질검토결과서", "2027-05-28", "2027-05-28", "보완완료", "감리 지적 3건 조치 완료"),
    ("2회차", "MES", "구현단계", "MES 프로그램 소스 및 단위테스트결과서", "2027-08-31", "", "작성전", ""),
    ("2회차", "MES", "통합테스트단계", "MES 통합테스트결과서", "2027-10-29", "", "작성전", ""),
    ("2회차", "QMS", "구현단계", "QMS 프로그램 소스 및 단위테스트결과서", "2027-09-10", "", "작성전", ""),
    ("2회차", "QMS", "통합테스트단계", "QMS 통합테스트결과서", "2027-11-05", "", "작성전", ""),
    ("2회차", "OEE", "구현단계", "가동률 산출엔진 및 수집모듈", "2027-09-30", "", "작성전", ""),
    ("2회차", "OEE", "이행안정화단계", "시운전검수보고서 · 효과검증보고서", "2027-12-24", "", "작성전", ""),
    ("2회차", "PMO", "이행안정화단계", "사업완료보고서 및 인수인계서", "2027-12-31", "", "작성전", ""),
]
STD_DELIV = [
    ("요구사항정의단계", "사업수행계획서 및 WBS 통합공정표", True, False), ("요구사항정의단계", "요구사항정의서", True, False),
    ("분석설계단계", "화면설계서", True, False), ("분석설계단계", "DB설계서 · 인터페이스정의서", True, False),
    ("구현단계", "프로그램 소스 및 단위테스트결과서", False, True), ("통합테스트단계", "통합테스트결과서", False, True),
    ("이행안정화단계", "이행결과보고서 · 운영자매뉴얼", False, True), ("이행안정화단계", "사업완료보고서 및 인수인계서", False, True),
]


def meetings():
    def mtg(mid, sys, title, date, st, et, place, host, status, agendas, acts, summary):
        return {"id": mid, "system": sys, "title": title, "date": date, "startTime": st, "endTime": et, "location": place, "host": host,
                "status": status, "notes": "", "summary": summary,
                "attendees": [{"name": host, "dept": "", "role": "주관", "attendance": "참석"},
                              {"name": "김총괄 수석PM", "dept": "PMO사업단", "role": "총괄", "attendance": "참석"}],
                "agendas": [{"id": f"AGD-{i + 1:02d}", "order": i + 1, "title": a[0], "discussion": a[1], "decision": a[2]} for i, a in enumerate(agendas)],
                "actionItems": [{"id": f"ACT-{mid[-6:]}-{i + 1}", "meetingId": mid, "title": t, "content": c, "requester": host, "assignee": who,
                                 "system": sys, "meetingDate": date, "targetDate": due, "status": s} for i, (t, c, who, due, s) in enumerate(acts)],
                "updatedAt": f"{date} 18:00:00"}
    return [
        mtg("MTG-20270521-01", "ALL", "5월 4주차 통합 공정회의", "2027-05-21", "14:00", "15:30", "본관 4층 대회의실", "김총괄 수석PM", "완료",
            [("서브시스템별 주간 진척 점검", "MES · QMS 설계 단계 마무리, OEE 수집 연계 진행 중", "QMS SPC 화면 설계 지연 만회 계획 제출"),
             ("1단계 감리 수검 준비", "분석설계 산출물 확정본 5/28 제출", "각 서브시스템 PL 5/26까지 자체 검토")],
            [("QMS SPC 화면 설계 만회 계획 제출", "추가 인력 1명 투입안 포함", "박품질 책임", "2027-05-26", "완료")],
            "설계 단계 마무리 점검 및 감리 수검 준비"),
        mtg("MTG-20270528-01", "MES", "MES ERP 연계 인터페이스 기술 협의", "2027-05-28", "10:00", "11:30", "생산혁신팀 회의실", "이생산 책임", "완료",
            [("ERP 생산계획 수신 주기 협의", "현행 일 1회 배치 → 시간 단위 연계 필요", "1시간 주기 배치 + 긴급 수동 수신 기능 제공"),
             ("인터페이스정의서 보완 항목", "작업장 코드 매핑 누락 확인", "매핑표 추가 후 재검토 요청")],
            [("인터페이스정의서 작업장 코드 매핑 보완", "ERP 작업장 코드 120건 매핑", "정개발 선임", "2027-06-08", "진행"),
             ("ERP 연계 테스트 계정 발급 요청", "ERP 운영팀 협조", "이생산 책임", "2027-06-04", "완료")],
            "ERP 연계 주기 확정 및 인터페이스정의서 보완"),
        mtg("MTG-20270602-01", "OEE", "CNC 수집 데이터 누락 원인 분석 회의", "2027-06-02", "15:00", "16:00", "제1공장 설비기술팀", "최설비 책임", "완료",
            [("CNC 2호기 데이터 누락 원인", "에지 게이트웨이 버퍼 부족으로 고속 샘플링 시 유실", "버퍼 10MB 증설 및 재전송 로직 보완")],
            [("에지 게이트웨이 버퍼 증설 및 재전송 로직 보완", "유실률 0.1% 이하 목표", "강센서 선임", "2027-06-11", "진행")],
            "수집 누락 원인 확인 및 조치 방향 결정"),
        mtg("MTG-20270604-01", "QMS", "QMS SPC 화면 설계 검토 회의", "2027-06-04", "13:30", "15:00", "품질보증팀 회의실", "박품질 책임", "진행중",
            [("SPC 관리도 화면 설계 검토", "X-bar R · p 관리도 우선 적용", "6/9까지 설계 확정"),
             ("공정능력(Cpk) 산출 기준", "규격 미등록 품목 처리 기준 필요", "규격 미등록 품목은 산출 제외 표시")],
            [("SPC 화면 설계서 보완 및 확정", "관리도 2종 우선", "한검사 선임", "2027-06-09", "진행")],
            "SPC 화면 설계 확정 방향 검토"),
        mtg("MTG-20270611-01", "ALL", "6월 2주차 통합 공정회의", "2027-06-11", "14:00", "15:30", "본관 4층 대회의실", "김총괄 수석PM", "예정",
            [("서브시스템별 주간 진척 점검", "", ""), ("개발 단계 착수 점검", "", "")], [], ""),
        mtg("MTG-20270609-01", "MES", "작업지시 모듈 개발 진척 점검", "2027-06-09", "10:00", "11:00", "생산혁신팀 회의실", "이생산 책임", "예정",
            [("작업지시 발행 모듈 개발 현황", "", "")], [], ""),
    ]


WEEKLY_NOTES = {
    "PMO": ["1단계 분석설계 감리 수검 완료(조건부 적합, 지적 3건)", "감리 시정조치 완료 확인 및 개발 단계 진척 점검", "감리 지적 3건 6/11까지 조치 필요"],
    "MES": ["설계 단계 완료, 작업지시 · 실적 모듈 개발 진행", "ERP 연계 인터페이스정의서 보완 및 작업지시 모듈 개발", "ERP 인터페이스정의서 보완(작업장 코드 매핑) 지연"],
    "QMS": ["DB 설계 · 인터페이스 정의 완료, 검사 기준 관리 모듈 개발", "SPC 관리도 화면 설계 확정 및 검사 실적 모듈 개발 착수", "SPC 화면 설계 지연(70%) — 6/9 확정 목표, 인력 1명 추가"],
    "OEE": ["PLC 태그 매핑 · 수집 드라이버 개발 진행", "수집 버퍼 증설 · 재전송 로직 보완, 가동률 산출 엔진 착수", "CNC 2호기 수집 데이터 간헐 누락 — 버퍼 증설 조치 중"],
}
WEEKLY_ALL = ["MES · QMS 설계 단계 마무리, OEE 데이터 수집 연계 진행 / 1단계 감리 조건부 적합",
              "감리 시정조치 완료, 개발 단계 본격 착수 및 지연 Task(QMS SPC 설계) 만회",
              "QMS SPC 화면 설계 지연, OEE CNC 2호기 수집 누락 — 각 담당 조치 중"]


def build():
    wbs = build_wbs()
    cfg = {
        "projectName": "2027 스마트공장 제조혁신 (샘플)",
        "domains": ["관리공통", "생산운영", "공정개선"],
        "channels": ["전체", "PMO", "MES", "QMS", "OEE"],
        "activeSdlcCodes": ["SDLC_PMO", "SDLC_WATERFALL"],
        "activeReqPreset": "REQ_EQUIPMENT",
        "maxDeliverableRounds": 2,
        "projectStartDate": "2027-01-04",
        "projectEndDate": "2027-12-31",
        "weekStartDay": 5,
        "reportDate": iso(REPORT_DATE),
        "progressBasis": "CALENDAR",
        "fileCode": "MFG27",
        "roleHomeSettings": {"SYS_ADMIN": "EXECUTIVE", "PM": "EXECUTIVE", "MEMBER": "TODO"},
        "idPrefixConfig": {"wbsPrefix": "", "wbsUseSubCode": False, "reqPrefix": "REQ", "reqUseSubCode": True,
                           "vocPrefix": "VOC", "vocUseSubCode": True, "actPrefix": "ACT", "actUseSubCode": True},
        "milestones": [
            {"id": "MS-01", "scope": "ALL", "name": "착수보고", "date": "2027-01-29", "note": "사업수행계획 승인"},
            {"id": "MS-02", "scope": "ALL", "name": "1단계 분석설계 감리", "date": "2027-05-28", "note": "분석설계 산출물 검수"},
            {"id": "MS-03", "scope": "OEE", "name": "1라인 시운전", "date": "2027-10-15", "note": "가동률 데이터 검증"},
            {"id": "MS-04", "scope": "ALL", "name": "2단계 종료 감리", "date": "2027-11-26", "note": "구현 · 테스트 산출물 검수"},
            {"id": "MS-05", "scope": "ALL", "name": "시스템 오픈", "date": "2027-12-01", "note": "MES · QMS 운영 전환"},
        ],
    }
    users = [{"empNo": e, "name": n, "role": r, "subsystem": s, "dept": d, "pwdHash": "", "lang": "ko"} for e, n, r, s, d in USERS]
    data = {
        "_meta": {"title": "2027 제조 분야 샘플 (PMO 1 · 폭포수 2 · 개선과제 1, 레벨 4 WBS)", "reportDate": iso(REPORT_DATE),
                  # tools/finish_sample_2027.js 가 쓰는 마무리 설정
                  "xlsx": "2027_제조_스마트공장_샘플_4레벨.xlsx", "snapshot": True, "sdlc": ["SDLC_PMO", "SDLC_WATERFALL"], "req": "REQ_EQUIPMENT",
                  "leads": LEAD, "notes": WEEKLY_NOTES, "allNotes": WEEKLY_ALL},
        "projectConfig": cfg,
        "subsystemsMeta": SUBS,
        "standardDeliverablesMeta": [{"phase": p, "name": n, "round1": r1, "round2": r2, "round3": False, "round4": False,
                                      "defaultDate": "2027-05-28" if r1 else "2027-11-26", "remarks": ""} for p, n, r1, r2 in STD_DELIV],
        "projectUsers": users,
        "wbsData": wbs,
        "reqMasterData": [{"id": i, "system": s, "name": n, "type": t, "priority": p, "accept": "수용", "status": st} for i, s, n, t, p, st in REQS],
        "vocData": [{"id": i, "system": s, "priority": p, "title": t, "requester": rq, "reqDate": rd, "targetDate": td, "status": st, "action": a}
                    for i, s, p, t, rq, rd, td, st, a in VOCS],
        "deliverablesData": [{"id": k + 1, "round": r, "system": s, "phase": ph, "name": n, "pDate": pd, "aDate": ad, "status": st,
                              "manager": LEAD[s], "remarks": rm} for k, (r, s, ph, n, pd, ad, st, rm) in enumerate(DELIVS)],
        "meetingsData": meetings(),
        "noticesData": [
            {"id": "NOT-01", "title": "📢 [필독] 1단계 분석설계 감리 결과 및 시정조치 안내", "content": "■ 감리 결과: 조건부 적합 (지적 3건)\n■ 시정조치 기한: 2027-06-11(금)\n■ 대상: MES 인터페이스정의서, QMS 화면설계서", "author": "김총괄 수석PM", "authorEmpNo": "pmo_kim", "date": "2027-05-31", "priority": "긴급", "isPinned": True, "viewCount": 18},
            {"id": "NOT-02", "title": "개발 단계 형상관리 기준 안내", "content": "개발 소스는 형상관리 서버 브랜치 규칙(feature/서브시스템-기능)을 따릅니다.", "author": "윤품질 선임", "authorEmpNo": "pmo_yoon", "date": "2027-05-03", "priority": "중요", "isPinned": False, "viewCount": 9},
            {"id": "NOT-03", "title": "6월 주간 공정회의 일정", "content": "매주 금요일 14:00, 본관 4층 대회의실 (6/11, 6/18, 6/25)", "author": "김총괄 수석PM", "authorEmpNo": "pmo_kim", "date": "2027-06-01", "priority": "일반", "isPinned": False, "viewCount": 4},
        ],
        "communicationsData": [
            {"id": "COMM-01", "title": "MES 작업지시 모듈 개발 착수 공유", "channel": "MES", "taskId": "2.3.1.1", "author": "이생산 책임", "authorEmpNo": "mes_lee", "role": "MES",
             "content": "작업지시 발행 모듈 개발을 착수했습니다. 화면설계서 v1.2 기준으로 진행합니다.", "date": "2027-05-04 09:30", "replies": []},
            {"id": "COMM-02", "title": "OEE 수집 누락 조치 진행 상황", "channel": "OEE", "taskId": "4.2.1.2", "author": "강센서 선임", "authorEmpNo": "oee_kang", "role": "OEE",
             "content": "CNC 2호기 버퍼 증설 테스트 중입니다. 6/10까지 결과 공유드리겠습니다.", "date": "2027-06-03 17:10",
             "replies": [{"id": "REP-01", "author": "최설비 책임", "authorEmpNo": "oee_choi", "role": "OEE", "content": "재전송 로직도 함께 확인 부탁드립니다.", "date": "2027-06-03 17:40"}]},
            {"id": "COMM-03", "title": "주간보고 작성 안내", "channel": "전체", "taskId": "", "author": "김총괄 수석PM", "authorEmpNo": "pmo_kim", "role": "PMO",
             "content": "서브시스템별 주간보고는 매주 목요일까지 작성 완료 부탁드립니다.", "date": "2027-05-20 10:00", "replies": []},
        ],
        "weeklyReportsData": [],
    }
    return data


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "sample_2027.json"
    data = build()
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"[OK] {out}: WBS {len(data['wbsData'])} · REQ {len(data['reqMasterData'])} · VOC {len(data['vocData'])} · "
          f"산출물 {len(data['deliverablesData'])} · 회의 {len(data['meetingsData'])}")
