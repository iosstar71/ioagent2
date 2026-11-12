# -*- coding: utf-8 -*-
"""
[Project Mgmt (협업)] 서버 API 자동 테스트 (Python 표준 라이브러리만 사용)

프로그램 폴더를 임시 폴더로 복사한 뒤 시험 자료(tools/tests/fixtures)로 start_server.py 를 기동하여 검증합니다.
(실제 운영 DB data/pprjmgmt.db 는 건드리지 않음)

사용법 (프로그램 폴더에서):
    python tools/tests/test_server_api.py
"""
import hashlib
import json
import shutil
import socket
import sqlite3
import http.client
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SALT = "WBS_OFFLINE_SECURITY_SALT_2026"


def h(pwd):
    return hashlib.sha256((pwd + SALT).encode("utf-8")).hexdigest()


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def copy_program(dst, lock_mode="off", lock_hours=None):
    """프로그램 폴더(설정 · 서버 · 화면 · 초기 데이터)를 시험용 폴더로 복사
    [Workgroup] 기존 저장 · 권한 시험은 체크아웃 잠금을 끄고(lock_mode=off), 잠금 시험(LockApiTest)은 required 로"""
    shutil.copy(ROOT / "start_server.py", dst / "start_server.py")
    shutil.copy(ROOT / "index.html", dst / "index.html")
    for d in ("conf", "server", "static"):
        shutil.copytree(ROOT / d, dst / d, ignore=shutil.ignore_patterns("__pycache__"))
    ini = dst / "conf" / "app.ini"
    text = ini.read_text(encoding="utf-8")
    text = "\n".join(("lock_mode=" + lock_mode) if l.startswith("lock_mode=") else (("lock_hours=" + str(lock_hours)) if lock_hours and l.startswith("lock_hours=") else l)
                     for l in text.split("\n"))
    ini.write_text(text, encoding="utf-8")
    (dst / "data").mkdir()
    # 시험 자료: 예전 샘플(작업자 · 서브시스템)을 시험용으로만 씀 — 배포본의 data/initial_data.json 은 비어 있음
    shutil.copy(ROOT / "tools" / "tests" / "fixtures" / "sample_initial_data.json", dst / "data" / "initial_data.json")


class ServerApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="axpmys_test_"))
        copy_program(cls.tmp)
        cls.port = free_port()
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.pwd = {}
        cls.proc = subprocess.Popen([sys.executable, "start_server.py", "--port", str(cls.port), "--host", "127.0.0.1", "--quiet"],
                                    cwd=cls.tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/api/db/ping", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        cls.admin = cls.ready("admin")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def call(cls, path, body=None, token=None, method="POST", project=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        if project:
            headers["X-Project-Id"] = project
        data = None if method == "GET" else json.dumps(body or {}).encode()
        req = urllib.request.Request(cls.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    @classmethod
    def login(cls, emp, pwd, project="DEFAULT"):
        return cls.call("/api/auth/login", {"empNo": emp, "pwdHash": h(pwd), "loginProject": project})

    @classmethod
    def ready(cls, emp, project="DEFAULT"):
        """로그인 → 초기 비밀번호면 변경(필수) → 사용 가능한 토큰 반환"""
        cur = cls.pwd.get(emp, "1234")
        s, d = cls.login(emp, cur, project)
        assert s == 200, (emp, s, d)
        if d["user"].get("mustChangePassword"):
            new = "Test" + emp.replace("_", "") + "2026"
            s2, d2 = cls.call("/api/auth/change-password", {"empNo": emp, "oldHash": h(cur), "newHash": h(new)})
            assert s2 == 200, d2
            cls.pwd[emp] = new
            s, d = cls.login(emp, new, project)
        return d["token"]

    def load(self, keys, token=None, project=None):
        s, d = self.call("/api/db/load", {"keys": keys}, token or self.admin, project=project)
        self.assertEqual(s, 200)
        return d["data"], d["revs"]

    # ---------------------------------------------------------------- 인증
    def test_01_auth_required(self):
        s, _ = self.call("/api/db/load", {})
        self.assertEqual(s, 401)

    def test_02_ping_and_static_block(self):
        s, d = self.call("/api/db/ping", method="GET")
        self.assertEqual(s, 200)
        self.assertTrue(d["ok"])
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/data/pprjmgmt.db")
        self.assertEqual(ctx.exception.code, 403)

    def test_03_password_hash_hidden(self):
        data, _ = self.load(["projectUsers"])
        self.assertTrue(all(u.get("pwdHash", "") == "" for u in data["projectUsers"]))

    # ---------------------------------------------------------------- 권한 / 충돌
    def test_10_member_saves_only_own_subsystem(self):
        token = self.ready("lead_lee")  # MEMBER / W1
        data, revs = self.load(["wbsData"], token)
        w = data["wbsData"]
        w1 = [r for r in w if r["system"] == "W1"]
        w2 = [r for r in w if r["system"] == "W2"]
        w1[0]["name"] += "_T"
        w2[0]["name"] += "_T"
        base = {"W1": revs["wbsData"]["W1"]["rev"], "W2": revs["wbsData"]["W2"]["rev"]}
        s, r = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W1": w1, "W2": w2}, "base": base}}}, token)
        self.assertEqual(s, 200)
        self.assertIn("wbsData[W2]", r["blocked"])
        saved = r["data"]["wbsData"]
        self.assertTrue(any(x["name"].endswith("_T") and x["system"] == "W1" for x in saved))
        self.assertFalse(any(x["name"].endswith("_T") and x["system"] == "W2" for x in saved))

    def test_11_member_cannot_write_master(self):
        token = self.ready("lead_park")
        s, r = self.call("/api/db/save", {"changes": {"projectConfig": {"parts": {"*": {"x": 1}}, "base": {"*": 1}}}}, token)
        self.assertEqual(s, 200)
        self.assertIn("projectConfig[*]", r["blocked"])

    def test_12_conflict_and_force(self):
        data, revs = self.load(["vocData"])
        v = data["vocData"]
        part = v[0]["system"]
        rows = [x for x in v if x["system"] == part]
        base = {part: revs["vocData"][part]["rev"]}
        rows[0]["title"] += "_A"
        s, _ = self.call("/api/db/save", {"changes": {"vocData": {"parts": {part: rows}, "base": base}}}, self.admin)
        self.assertEqual(s, 200)
        rows[0]["title"] += "_B"
        s, r = self.call("/api/db/save", {"changes": {"vocData": {"parts": {part: rows}, "base": base}}}, self.admin)
        self.assertEqual(s, 409)
        self.assertEqual(r["conflicts"][0]["part"], part)
        s, r = self.call("/api/db/save", {"changes": {"vocData": {"parts": {part: rows}, "base": base}}, "force": True}, self.admin)
        self.assertEqual(s, 200)

    # ---------------------------------------------------------------- 사용자
    def test_21_change_password_and_reset(self):
        s, _ = self.call("/api/auth/change-password", {"empNo": "qa_han", "oldHash": h("1234"), "newHash": h("zzzz")})
        self.assertEqual(s, 200)
        s, d = self.login("qa_han", "zzzz")
        self.assertEqual(s, 200)
        self.assertFalse(d["user"]["mustChangePassword"])
        data, revs = self.load(["projectUsers"])
        row = next(u for u in data["projectUsers"] if u["empNo"] == "qa_han")
        row.update({"pwdHash": "", "pwdReset": True})
        s, _ = self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"qa_han": row}, "base": {"qa_han": revs["projectUsers"]["qa_han"]["rev"]}}}}, self.admin)
        self.assertEqual(s, 200)
        s, d = self.login("qa_han", "1234")
        self.assertEqual(s, 200)
        self.assertTrue(d["user"]["mustChangePassword"])  # 초기화 후 첫 로그인 → 변경 필수

    def test_22_login_throttle(self):
        last = None
        for _ in range(6):
            last, _ = self.login("pm_throttle_check", "wrong")
        self.assertEqual(last, 429)

    # ---------------------------------------------------------------- 보안 (v1.0.10)
    def test_23_default_password_must_change(self):
        s, d = self.login("pmo_kim", self.pwd.get("pmo_kim", "1234"))
        self.assertEqual(s, 200)
        if d["user"]["mustChangePassword"]:
            s, r = self.call("/api/db/load", {"keys": ["wbsData"]}, d["token"])
            self.assertEqual(s, 403)
            self.assertEqual(r.get("code"), "MUST_CHANGE_PASSWORD")
            s, _ = self.call("/api/auth/change-password", {"empNo": "pmo_kim", "oldHash": h("1234"), "newHash": h("1234")})
            self.assertEqual(s, 400)  # 초기 비밀번호로 변경 불가

    def test_24_pbkdf2_storage_and_no_raw_hash(self):
        conn = sqlite3.connect(str(self.tmp / "data" / "pprjmgmt.db"))
        users = json.loads(conn.execute("SELECT JSON_TEXT FROM TB_WBS_DATASET WHERE DATA_KEY='projectUsers'").fetchone()[0])
        conn.close()
        stored = [u["pwdHash"] for u in users if u.get("pwdHash")]
        self.assertTrue(stored)
        self.assertTrue(all(p.startswith("pbkdf2_sha256$") for p in stored))
        self.assertFalse(any(h(v) in stored for v in ("1234", "zzzz")))

    def test_25_member_cannot_set_password_via_dataset(self):
        token = self.ready("lead_lee")
        data, revs = self.load(["projectUsers"], token)
        me = next(u for u in data["projectUsers"] if u["empNo"] == "lead_lee")
        me["pwdHash"] = h("hacked1")
        self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"lead_lee": me}, "base": {"lead_lee": revs["projectUsers"]["lead_lee"]["rev"]}}}}, token)
        self.assertEqual(self.login("lead_lee", "hacked1")[0], 401)

    def test_26_security_headers(self):
        with urllib.request.urlopen(self.base + "/index.html") as r:
            csp = r.headers.get("Content-Security-Policy", "")
        self.assertIn("script-src 'self';", csp)
        self.assertNotIn("unsafe-inline' ; script", csp)
        with urllib.request.urlopen(urllib.request.Request(self.base + "/index.html", method="HEAD")) as r:
            self.assertIn("script-src 'self';", r.headers.get("Content-Security-Policy", ""))
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(urllib.request.Request(self.base + "/data/pprjmgmt.db", method="HEAD"))
        self.assertEqual(ctx.exception.code, 403)
        req = urllib.request.Request(self.base + "/api/db/ping", headers={"Origin": "http://evil.example"})
        with urllib.request.urlopen(req) as r:
            self.assertIsNone(r.headers.get("Access-Control-Allow-Origin"))

    def test_28_personal_todos_private(self):
        """[v2.4.0] 내 할 일(todosData)은 본인 항목만 내려받고, 다른 사람 항목은 읽기·고치기·지우기 모두 불가"""
        member = self.ready("lead_lee")
        mine = {"id": "TD-admin-1", "owner": "admin", "kind": "todo", "title": "ADMIN-PRIVATE", "done": False}
        s, r = self.call("/api/db/save", {"changes": {"todosData": {"parts": {"TD-admin-1": mine}, "base": {}}}}, self.admin)
        self.assertEqual(s, 200, r)
        self.assertEqual([t["id"] for t in r["data"]["todosData"]], ["TD-admin-1"])
        theirs = {"id": "TD-lee-1", "owner": "lead_lee", "kind": "todo", "title": "LEE-PRIVATE", "done": False}
        s, r = self.call("/api/db/save", {"changes": {"todosData": {"parts": {"TD-lee-1": theirs}, "base": {}}}}, member)
        self.assertEqual(s, 200, r)
        # 저장 응답·불러오기 모두 본인 항목만 (버전 정보 포함)
        self.assertEqual([t["id"] for t in r["data"]["todosData"]], ["TD-lee-1"])
        self.assertEqual(set(r["revs"]["todosData"].keys()), {"TD-lee-1"})
        data, revs = self.load(["todosData"], member)
        self.assertEqual([t["title"] for t in data["todosData"]], ["LEE-PRIVATE"])
        self.assertNotIn("TD-admin-1", revs["todosData"])
        data, _ = self.load(["todosData"], self.admin)
        self.assertEqual([t["title"] for t in data["todosData"]], ["ADMIN-PRIVATE"])
        # 다른 사람 항목을 내 것으로 바꿔 쓰기 / 지우기 / 남의 이름으로 만들기 → 거부
        hijack = dict(mine, owner="lead_lee", title="HIJACK")
        s, r = self.call("/api/db/save", {"changes": {"todosData": {"parts": {"TD-admin-1": hijack, "TD-x": dict(theirs, id="TD-x", owner="admin")}, "base": {"TD-admin-1": 1}}}}, member)
        self.assertEqual(s, 200, r)
        self.assertIn("todosData[TD-admin-1]", r["blocked"])
        self.assertIn("todosData[TD-x]", r["blocked"])
        s, r = self.call("/api/db/save", {"changes": {"todosData": {"parts": {"TD-admin-1": None}, "base": {"TD-admin-1": 1}}}}, member)
        self.assertIn("todosData[TD-admin-1]", r["blocked"])
        data, _ = self.load(["todosData"], self.admin)
        self.assertEqual([t["title"] for t in data["todosData"]], ["ADMIN-PRIVATE"])

    # ---------------------------------------------------------------- 여러 프로젝트 (v1.0.10)
    def test_40_project_isolation(self):
        s, r = self.call("/api/projects/create", {"name": "2차 확산 과제", "startDate": "2028-01-01", "endDate": "2028-12-31", "copyFrom": "DEFAULT"}, self.admin)
        self.assertEqual(s, 200, r)
        pid = r["project"]["id"]
        s, r = self.call("/api/projects/list", {}, self.admin)
        self.assertIn(pid, [p["id"] for p in r["projects"]])
        data, revs = self.load(["projectConfig", "subsystemsMeta", "wbsData"], project=pid)
        self.assertEqual(data["projectConfig"]["projectName"], "2차 확산 과제")
        self.assertTrue(data["subsystemsMeta"])  # 기준정보 복사
        self.assertEqual(data["wbsData"], [])
        row = {"id": "1", "level": 1, "system": "W1", "name": "NEW-PROJECT-TASK", "isLeaf": True}
        s, _ = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W1": [row]}, "base": {"W1": 0}}}}, self.admin, project=pid)
        self.assertEqual(s, 200)
        d_default, _ = self.load(["wbsData"])
        self.assertFalse(any(t["name"] == "NEW-PROJECT-TASK" for t in d_default["wbsData"]))
        d_new, _ = self.load(["wbsData"], project=pid)
        self.assertEqual([t["name"] for t in d_new["wbsData"]], ["NEW-PROJECT-TASK"])
        conn = sqlite3.connect(str(self.tmp / "data" / "pprjmgmt.db"))
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        conn.close()
        self.assertNotIn("TB_WBS_TASK", tables)  # 조회용 미러 표 없음 (용량)
        type(self).pid = pid

    def test_41_project_users_and_login(self):
        """[v3.0.0] 사용자 정보는 프로젝트별 · 로그인 시 프로젝트 선택 · 시스템관리자 외에는 로그인한 프로젝트만"""
        pid = self.pid
        self.ready("lead_park")  # 초기 비밀번호 변경
        # 로그인: 프로젝트 미선택 → 400 (시스템관리자는 미선택 가능), 참여하지 않은 프로젝트 → 403
        s, d = self.login("lead_park", self.pwd["lead_park"], "")
        self.assertEqual((s, d.get("code")), (400, "PROJECT_REQUIRED"))
        s, d = self.login("lead_park", self.pwd["lead_park"], pid)
        self.assertEqual((s, d.get("code")), (403, "NOT_PROJECT_MEMBER"))
        s, d = self.call("/api/auth/login", {"empNo": "admin", "pwdHash": h(self.pwd["admin"])})
        self.assertEqual(s, 200, d)
        # 새 프로젝트 사용자 목록: 시스템관리자만 (DEFAULT 참여자는 보이지 않음)
        data, _ = self.load(["projectUsers"], project=pid)
        self.assertTrue(all(u["role"] == "SYS_ADMIN" for u in data["projectUsers"]))
        # 다른 프로젝트에서 사용자 복사 (시스템관리자) → 역할·담당 함께 복사, 이미 있으면 건너뜀
        s, r = self.call("/api/projects/members", {"fromProject": "DEFAULT"}, self.admin, project=pid)
        self.assertIn("lead_park", [m["empNo"] for m in r["members"]])
        s, r = self.call("/api/projects/copy-users", {"fromProject": "DEFAULT", "empNos": ["lead_park", "lead_lee"]}, self.admin, project=pid)
        self.assertEqual(sorted(r["copied"]), ["lead_lee", "lead_park"])
        s, r = self.call("/api/projects/copy-users", {"fromProject": "DEFAULT", "empNos": ["lead_park"]}, self.admin, project=pid)
        self.assertEqual(r["skipped"], ["lead_park"])
        member_tok = self.ready("lead_lee")
        s, r = self.call("/api/projects/copy-users", {"fromProject": "DEFAULT"}, member_tok)
        self.assertEqual(s, 403)
        data, revs = self.load(["projectUsers"], project=pid)
        self.assertEqual(sorted(u["empNo"] for u in data["projectUsers"] if u["role"] != "SYS_ADMIN"), ["lead_lee", "lead_park"])
        self.assertEqual(set(next(u for u in data["projectUsers"] if u["empNo"] == "lead_park")["projectRoles"].keys()), {pid})
        # 이 프로젝트에서만 PM 으로 (부서도 프로젝트별)
        row = next(u for u in data["projectUsers"] if u["empNo"] == "lead_park")
        row["projectRoles"] = {pid: {"role": "PM", "subsystem": "ALL", "dept": "2차 PMO"}}
        s, _ = self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"lead_park": row}, "base": {"lead_park": revs["projectUsers"]["lead_park"]["rev"]}}}}, self.admin, project=pid)
        self.assertEqual(s, 200)
        s, d = self.login("lead_park", self.pwd["lead_park"], pid)
        self.assertEqual(s, 200, d)
        token = d["token"]
        self.assertEqual((d["user"]["role"], d["user"]["dept"]), ("PM", "2차 PMO"))
        # 로그인한 프로젝트만: 다른 프로젝트 접근·목록 불가
        s, d = self.call("/api/db/load", {"keys": ["wbsData"]}, token, project="DEFAULT")
        self.assertEqual((s, d.get("code")), (403, "PROJECT_LOCKED"))
        _, lst = self.call("/api/projects/list", {}, token, project=pid)
        self.assertEqual([p["id"] for p in lst["projects"]], [pid])
        # 기본 프로젝트에서는 원래 역할(MEMBER) 그대로
        _, d = self.login("lead_park", self.pwd["lead_park"], "DEFAULT")
        self.assertEqual(d["user"]["role"], "MEMBER")
        # PM 은 자기 프로젝트 기준정보 수정 가능, 다른 프로젝트에만 있는 사번을 덮어쓰기는 불가
        cfg, revs = self.load(["projectConfig"], token, project=pid)
        cfg["projectConfig"]["projectName"] = "2차 확산 과제(수정)"
        s, r = self.call("/api/db/save", {"changes": {"projectConfig": {"parts": {"*": cfg["projectConfig"]}, "base": {"*": revs["projectConfig"]["*"]["rev"]}}}}, token, project=pid)
        self.assertEqual(r.get("blocked"), [])
        s, r = self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"qa_han": {"empNo": "qa_han", "name": "가로채기", "role": "MEMBER"}}, "base": {}}}}, token, project=pid)
        self.assertIn("projectUsers[qa_han]", r["blocked"])
        # 이 프로젝트에서 사용자 삭제 = 이 프로젝트에서만 빠짐 (기본 프로젝트 로그인은 그대로)
        data, revs = self.load(["projectUsers"], token, project=pid)
        s, r = self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"lead_lee": None}, "base": {"lead_lee": revs["projectUsers"]["lead_lee"]["rev"]}}}}, token, project=pid)
        self.assertEqual(r.get("blocked"), [])
        s, d = self.login("lead_lee", self.pwd["lead_lee"], pid)
        self.assertEqual(s, 403)
        s, d = self.login("lead_lee", self.pwd["lead_lee"], "DEFAULT")
        self.assertEqual(s, 200)
        s, r = self.call("/api/projects/list", {}, self.admin)
        self.assertEqual(next(p for p in r["projects"] if p["id"] == pid)["name"], "2차 확산 과제(수정)")
        # 공개 프로젝트 목록 (로그인 화면용): 이름만
        s, r = self.call("/api/projects/public", {})
        self.assertEqual(s, 200)
        self.assertIn(pid, [p["id"] for p in r["projects"]])
        self.assertEqual(set(r["projects"][0].keys()), {"id", "name"})

    def test_42_project_create_delete_admin_only(self):
        s, r = self.call("/api/projects/create", {"name": "보안 과제", "startDate": "2028-01-01", "endDate": "2028-06-30"}, self.admin)
        pid = r["project"]["id"]
        cfg, _ = self.load(["projectConfig"], project=pid)
        self.assertEqual(cfg["projectConfig"]["channels"][0], "전체")  # 소통 채널은 프로젝트별
        token = self.ready("lead_lee")
        s, r = self.call("/api/projects/create", {"name": "x", "startDate": "2028-01-01", "endDate": "2028-06-30"}, token)
        self.assertEqual(s, 403)
        s, r = self.call("/api/db/load", {"keys": ["wbsData"]}, token, project=pid)
        self.assertEqual(s, 403)
        s, _ = self.call("/api/projects/delete", {"id": pid}, token)
        self.assertEqual(s, 403)
        s, _ = self.call("/api/projects/delete", {"id": pid}, self.admin)
        self.assertEqual(s, 200)
        s, _ = self.call("/api/db/load", {"keys": ["wbsData"]}, self.admin, project=pid)
        self.assertEqual(s, 403)

    def test_44_progress_range(self):
        """[v3.0.0] 진척률은 0~100 만 저장"""
        data, revs = self.load(["wbsData"])
        rows = [dict(r) for r in data["wbsData"] if r["system"] == "A1"]
        rows[-1]["aProg"] = 150
        rows[-2]["aProg"] = -5
        rows[-3]["weight"] = -1
        s, r = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"A1": rows}, "base": {"A1": revs["wbsData"]["A1"]["rev"]}}}}, self.admin)
        self.assertEqual(s, 200)
        data, _ = self.load(["wbsData"])
        a1 = [r for r in data["wbsData"] if r["system"] == "A1"]
        self.assertEqual((a1[-1]["aProg"], a1[-2]["aProg"], a1[-3]["weight"]), (100, 0, 0))

    # ---------------------------------------------------------------- 첨부파일
    def upload(self, token, name, body, system="W1", owner="Ftest0001", length=None, kind="deliverable"):
        q = urllib.parse.urlencode({"ownerType": kind, "ownerId": owner, "system": system, "name": name})
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            conn.putrequest("POST", "/api/files/upload?" + q)
            conn.putheader("Content-Type", "application/octet-stream")
            conn.putheader("Content-Length", str(len(body) if length is None else length))
            if token:
                conn.putheader("Authorization", "Bearer " + token)
            conn.endheaders()
            if length is None:
                conn.send(body)
            r = conn.getresponse()
            return r.status, json.loads(r.read() or b"{}")
        finally:
            conn.close()

    def test_52_admin_users(self):
        """전체 작업자 관리(관리자 전용) — 처음에는 admin 하나만 (admin2 없음)"""
        self.assertEqual(self.call("/api/admin/users/list", {}, self.ready("lead_lee"))[0], 403)
        s, d = self.call("/api/admin/users/list", {}, self.admin)
        self.assertEqual(s, 200, d)
        by = {u["empNo"]: u for u in d["users"]}
        self.assertTrue(by["admin"]["sysAdmin"] and "admin2" not in by)
        self.assertNotIn("pwdHash", by["admin"])
        self.assertIn("DEFAULT", by["lead_lee"]["projectRoles"])
        self.assertTrue(any(p["id"] == "DEFAULT" and "W1" in p["subsystems"] for p in d["projects"]))
        # 두 번째 관리자를 직접 만들어 규칙 확인
        s, d = self.call("/api/admin/users/save", {"isNew": True, "empNo": "admin2", "name": "관리자2", "sysAdmin": True, "projectRoles": {}}, self.admin)
        self.assertEqual(s, 200, d)
        admin2 = self.ready("admin2", project="")  # 관리자는 프로젝트를 고르지 않아도 됨
        self.assertEqual(self.call("/api/admin/users/list", {}, admin2)[0], 200)
        # 새 사용자 등록 + 두 프로젝트에 서로 다른 역할
        req = {"isNew": True, "empNo": "ua_new", "name": "통합관리 시험", "dept": "QA", "sysAdmin": False,
               "projectRoles": {"DEFAULT": {"role": "LEAD", "subsystem": "W2"}, self.pid: {"role": "PM", "subsystem": "ALL"}, "NOPE": {"role": "PM"}}}
        s, d = self.call("/api/admin/users/save", req, self.admin)
        self.assertEqual(s, 200, d)
        row = next(u for u in d["users"] if u["empNo"] == "ua_new")
        self.assertEqual((sorted(row["projectRoles"]), row["projectRoles"]["DEFAULT"]["role"], row["pwdDefault"]), (sorted(["DEFAULT", self.pid]), "LEAD", True))
        self.assertEqual(self.call("/api/admin/users/save", req, self.admin)[0], 409)  # 같은 사번으로 다시 등록
        s, d = self.login("ua_new", "1234", self.pid)
        self.assertEqual((s, d["user"]["role"]), (200, "PM"))
        # 권한 바꾸기 · 지킬 규칙 · 삭제
        req.update({"isNew": False, "projectRoles": {"DEFAULT": {"role": "MEMBER", "subsystem": "W1"}}})
        s, d = self.call("/api/admin/users/save", req, self.admin)
        self.assertEqual(sorted(next(u for u in d["users"] if u["empNo"] == "ua_new")["projectRoles"]), ["DEFAULT"])
        self.assertEqual(self.login("ua_new", "1234", self.pid)[0], 403)
        s, d = self.call("/api/admin/users/save", {"empNo": "admin", "name": "시스템관리자", "sysAdmin": False}, admin2)
        self.assertTrue(s == 200 and next(u for u in d["users"] if u["empNo"] == "admin")["sysAdmin"])  # admin 은 항상 시스템관리자
        self.assertEqual(self.call("/api/admin/users/save", {"empNo": "admin2", "name": "시스템관리자2", "sysAdmin": False}, admin2)[0], 400)  # 자기 권한 해제 불가
        self.assertEqual(self.call("/api/admin/users/delete", {"empNo": "admin"}, self.admin)[0], 400)
        s, d = self.call("/api/admin/users/delete", {"empNo": "ua_new"}, self.admin)
        self.assertEqual((s, any(u["empNo"] == "ua_new" for u in d["users"])), (200, False))

    def test_53_clear_project_tasks(self):
        """[v3.8.0] 프로젝트 Task 정보 초기화: 기준정보 유지 · 서버 백업 파일 · 권한 (PM 은 자기 프로젝트 1개, 여러 개는 시스템관리자)"""
        pid = self.pid
        row = {"id": "9.9", "level": 1, "system": "W1", "name": "CLEAR-ME", "pProg": 0, "aProg": 0}
        _, revs = self.load(["wbsData"], project=pid)
        s, d = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W1": [row]}, "base": {"W1": (revs["wbsData"].get("W1") or {}).get("rev", 0)}},
                                                     "noticesData": {"parts": {"N-CLR": {"id": "N-CLR", "title": "x"}}, "base": {}}}}, self.admin, project=pid)
        self.assertEqual(s, 200, d)
        lee = self.ready("lead_lee")
        self.assertEqual(self.call("/api/projects/clear-tasks", {"ids": [pid]}, lee, project=pid)[0], 403)
        self.assertEqual(self.call("/api/projects/clear-tasks", {"ids": ["DEFAULT"]}, self.ready("pmo_kim"))[0], 403)  # 초기화는 관리자만
        self.assertEqual(self.call("/api/projects/clear-tasks", {"ids": ["NOPE"]}, self.admin)[0], 404)
        before_default, _ = self.load(["wbsData"])
        s, d = self.call("/api/projects/clear-tasks", {"ids": [pid]}, self.admin, project=pid)
        self.assertEqual(s, 200, d)
        res = d["results"][0]
        self.assertTrue(res["counts"]["wbsData"] >= 1 and res["counts"]["noticesData"] >= 1)
        self.assertFalse((self.tmp / "data" / "backups").exists())  # 서버에 백업 파일을 남기지 않음 (용량)
        data, _ = self.load(["projectConfig", "subsystemsMeta", "wbsData", "noticesData"], project=pid)
        self.assertEqual((data["wbsData"], data["noticesData"]), ([], []))
        self.assertTrue(data["projectConfig"].get("projectName") and len(data["subsystemsMeta"]) > 0)
        after_default, _ = self.load(["wbsData"])
        self.assertEqual(len(after_default["wbsData"]), len(before_default["wbsData"]))  # 다른 프로젝트는 그대로
        # 지우기 전 화면에서 그 행을 다시 저장하면 충돌로 알려 줌 (지운 자료가 몰래 되살아나지 않게)
        s, d = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W1": [row]}, "base": {"W1": 1}}}}, self.admin, project=pid)
        self.assertEqual(s, 409, d)

    def test_54_lead_scope(self):
        """[v4.0.0] 총괄리더는 담당 서브시스템만 (담당 ALL 이면 전체)"""
        for emp, sub in (("lead_w1", "W1"), ("lead_all", "ALL")):
            s, d = self.call("/api/admin/users/save", {"isNew": True, "empNo": emp, "name": emp, "sysAdmin": False,
                                                       "projectRoles": {"DEFAULT": {"role": "LEAD", "subsystem": sub}}}, self.admin)
            self.assertEqual(s, 200, d)
        w1, al = self.ready("lead_w1"), self.ready("lead_all")
        data, revs = self.load(["wbsData"], token=al)
        rows = {p: [r for r in data["wbsData"] if r["system"] == p] for p in ("W1", "W2")}
        base = {p: (revs["wbsData"].get(p) or {}).get("rev", 0) for p in ("W1", "W2")}
        s, d = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W2": rows["W2"]}, "base": {"W2": base["W2"]}}}}, w1)
        self.assertIn("wbsData[W2]", d.get("blocked", []))
        s, d = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W1": rows["W1"]}, "base": {"W1": base["W1"]}}}}, w1)
        self.assertEqual((s, d.get("blocked")), (200, []), d)
        s, d = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W2": rows["W2"]}, "base": {"W2": base["W2"]}}}}, al)
        self.assertEqual((s, d.get("blocked")), (200, []), d)

    # ---------------------------------------------------------------- Project Mgmt (협업) 1.0
    def test_60_base_path_web_root_and_config(self):
        """하위 주소 /pprjmgmt · 패키지 폴더가 웹 루트(index.html 맨 위) · 내부 파일 차단 · 화면 설정"""
        with urllib.request.urlopen(self.base + "/pprjmgmt/api/db/ping") as r:
            self.assertTrue(json.loads(r.read())["ok"])
        with urllib.request.urlopen(self.base + "/pprjmgmt/") as r:
            self.assertIn("script-src 'self';", r.headers.get("Content-Security-Policy", ""))
            self.assertIn("Project Mgmt", r.read().decode("utf-8"))
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", "/pprjmgmt")
        r = conn.getresponse()
        self.assertEqual((r.status, r.getheader("Location")), (301, "/pprjmgmt/"))
        conn.close()
        with urllib.request.urlopen(self.base + "/pprjmgmt/static/js/config/app-config.js") as r:
            js = r.read().decode("utf-8")
        for part in ('"productName": "Project Mgmt"', '"editionName": "협업"', '"version": "1.0.0"', '"basePath": "/pprjmgmt"', '"lock": {"mode": '):
            self.assertIn(part, js)
        # 이 시험 서버는 잠금을 끄고 띄움 — 배포 설정은 체크아웃해야 저장(required)
        self.assertIn("lock_mode=required", (ROOT / "conf" / "app.ini").read_text(encoding="utf-8"))
        for path in ("/pprjmgmt/data/pprjmgmt.db", "/pprjmgmt/start_server.py", "/pprjmgmt/conf/app.ini", "/pprjmgmt/server/store.py",
                     "/pprjmgmt/data/initial_data.json", "/pprjmgmt/README.txt", "/pprjmgmt/run_server.bat", "/start_server.py"):
            with self.assertRaises(urllib.error.HTTPError, msg=path) as ctx:
                urllib.request.urlopen(self.base + path)
            self.assertEqual(ctx.exception.code, 403, path)

    def test_61_removed_features(self):
        """채팅 · 첨부파일 · 자가 등록 · 암호 자가 초기화 · 서버 복원 지점 · 서버 백업 목록은 없음"""
        for path in ("/api/chat/send", "/api/files/upload", "/api/files/list", "/api/auth/register", "/api/auth/reset-password",
                     "/api/snapshots/save", "/api/admin/backup/create", "/api/admin/backup/list"):
            self.assertEqual(self.call(path, {}, self.admin)[0], 404, path)

    def test_62_worker_list(self):
        """작업자 선택 목록: 그 프로젝트 작업자 + 관리자, 암호 · 역할 정보 없음"""
        s, d = self.call("/api/projects/workers", {"projectId": "DEFAULT"})
        self.assertEqual(s, 200)
        ids = [w["empNo"] for w in d["workers"]]
        self.assertTrue("admin" in ids and "lead_lee" in ids, ids)
        self.assertTrue(all(set(w) == {"empNo", "name"} for w in d["workers"]))

    def test_63_backup_download_restore_and_usage(self):
        """시스템 백업: .db 내려받기 → 복원 (서버에 남기지 않음) · 사용 용량 · DB 정리"""
        self.assertEqual(self.call("/api/admin/usage", {}, self.ready("pmo_kim"))[0], 403)
        s, d = self.call("/api/admin/usage", {}, self.admin)
        self.assertTrue(s == 200 and d["total"] < d["limit"] and d["db"] > 0, d)
        req = urllib.request.Request(self.base + "/api/admin/backup/download", headers={"Authorization": "Bearer " + self.admin})
        with urllib.request.urlopen(req) as r:
            blob = r.read()
        self.assertEqual(blob[:15], b"SQLite format 3")
        self.call("/api/db/save", {"changes": {"noticesData": {"parts": {"N-AFTER": {"id": "N-AFTER", "title": "after backup"}}, "base": {}}}}, self.admin)
        for body, ok in ((b"not a db", False), (blob, True)):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
            conn.request("POST", "/api/admin/backup/upload", body=body, headers={"Authorization": "Bearer " + self.admin, "Content-Type": "application/octet-stream"})
            r = conn.getresponse()
            self.assertEqual(r.status == 200 and json.loads(r.read()).get("ok"), ok)
            conn.close()
        data, _ = self.load(["noticesData"])
        self.assertFalse(any(n.get("id") == "N-AFTER" for n in data["noticesData"]))
        self.assertEqual(sorted(p.name for p in (self.tmp / "data").iterdir() if p.suffix == ".db"), ["pprjmgmt.db"])  # 임시 파일 남지 않음
        self.assertFalse((self.tmp / "data" / "backups").exists())
        self.assertEqual(self.call("/api/admin/vacuum", {}, self.admin)[0], 200)

    def test_64_error_log_only(self):
        """정상 사용 중에는 로그 파일이 생기지 않음 (오류만 logs/error.log)"""
        logs = self.tmp / "logs"
        self.assertTrue(not logs.exists() or all(f.name == "error.log" for f in logs.iterdir()))


class LockApiTest(unittest.TestCase):
    """[Workgroup 0.1] 서브시스템 체크아웃 · 체크인 (lock_mode=required)"""
    call = ServerApiTest.__dict__["call"]
    login = ServerApiTest.__dict__["login"]
    ready = ServerApiTest.__dict__["ready"]

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="axpmys_lock_"))
        copy_program(cls.tmp, "required")
        cls.port = free_port()
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.pwd = {}
        cls.proc = subprocess.Popen([sys.executable, "start_server.py", "--port", str(cls.port), "--host", "127.0.0.1", "--quiet"],
                                    cwd=cls.tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/api/db/ping", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        cls.admin = cls.ready("admin")
        for emp in ("wg_a", "wg_b"):
            s, d = cls.call("/api/admin/users/save", {"isNew": True, "empNo": emp, "name": emp.upper(), "sysAdmin": False,
                                                      "projectRoles": {"DEFAULT": {"role": "MEMBER", "subsystem": "W1"}}}, cls.admin)
            assert s == 200, d
        cls.a, cls.b = cls.ready("wg_a"), cls.ready("wg_b")

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def save_w1(self, token, suffix, bypass=False):
        s, d = self.call("/api/db/load", {"keys": ["wbsData"]}, token)
        rows = [r for r in d["data"]["wbsData"] if r["system"] == "W1"]
        rows[0]["name"] = rows[0]["name"].split("#")[0] + "#" + suffix
        body = {"changes": {"wbsData": {"parts": {"W1": rows}, "base": {"W1": d["revs"]["wbsData"]["W1"]["rev"]}}}}
        if bypass:
            body["lockBypass"] = True
        return self.call("/api/db/save", body, token)

    def test_1_checkout_blocks_others(self):
        s, d = self.call("/api/locks/checkout", {"scopes": ["SUB:W1"], "memo": "설계 일정"}, self.a)
        self.assertEqual((s, d["ok"], d["got"]), (200, True, ["SUB:W1"]), d)
        s, d = self.save_w1(self.b, "b")
        self.assertEqual(s, 423, d)
        self.assertEqual((d["locked"][0]["reason"], d["locked"][0]["empNo"]), ("LOCKED", "wg_a"))
        s, d = self.call("/api/locks/checkout", {"scopes": ["SUB:W1"]}, self.b)
        self.assertFalse(d["ok"])
        self.assertEqual(d["taken"][0]["empNo"], "wg_a")
        s, d = self.save_w1(self.a, "a")
        self.assertEqual(s, 200, d)
        self.assertTrue(any(l["scope"] == "SUB:W1" for l in d["locks"]["locks"]))
        s, d = self.call("/api/db/load", {"keys": ["meetingsData"]}, self.b)
        self.assertEqual(d["locks"]["locks"][0]["empNo"], "wg_a")
        s, d = self.call("/api/locks/checkin", {"scopes": ["SUB:W1"], "memo": "끝"}, self.a)
        self.assertEqual(d["released"], ["SUB:W1"])

    def test_2_checkout_required(self):
        s, d = self.save_w1(self.b, "b2")
        self.assertEqual((s, d["locked"][0]["reason"]), (423, "CHECKOUT_REQUIRED"), d)
        self.call("/api/locks/checkout", {"scopes": ["SUB:W1"]}, self.b)
        s, d = self.save_w1(self.b, "b2")
        self.assertEqual(s, 200, d)
        s, d = self.call("/api/locks/cancel", {"scopes": ["SUB:W1"]}, self.b)
        self.assertEqual(d["released"], ["SUB:W1"])

    def test_3_force_release_and_bypass(self):
        self.call("/api/locks/checkout", {"scopes": ["SUB:W1"]}, self.a)
        self.assertEqual(self.call("/api/locks/force-release", {"scopes": ["SUB:W1"], "reason": "x"}, self.b)[0], 403)
        self.assertEqual(self.call("/api/locks/force-release", {"scopes": ["SUB:W1"]}, self.admin)[0], 400)
        s, d = self.save_w1(self.admin, "adm", bypass=True)
        self.assertEqual(s, 200, d)
        s, d = self.call("/api/locks/force-release", {"scopes": ["SUB:W1"], "reason": "퇴근"}, self.admin)
        self.assertEqual(d["released"], ["SUB:W1"])
        s, d = self.call("/api/locks/list", {}, self.admin)
        self.assertEqual(d["log"][0]["action"], "FORCE")
        self.assertEqual(d["log"][0]["memo"], "퇴근")

    def test_4_expiry(self):
        self.call("/api/locks/checkout", {"scopes": ["SUB:W1"]}, self.a)
        con = sqlite3.connect(str(self.tmp / "data" / "pprjmgmt.db"))
        con.execute("UPDATE TB_LOCK SET EXPIRES = 1")
        con.commit()
        con.close()
        s, d = self.call("/api/locks/checkout", {"scopes": ["SUB:W1"]}, self.b)
        self.assertTrue(d["ok"], d)
        s, d = self.call("/api/locks/list", {}, self.b)
        self.assertIn("EXPIRE", [l["action"] for l in d["log"]])
        self.call("/api/locks/cancel", {"scopes": ["SUB:W1"]}, self.b)


class PackageSizeTest(unittest.TestCase):
    """운영 한도 10MB: 배포 묶음(풀었을 때)은 그 절반 이하"""

    def test_package_size(self):
        r = subprocess.run([sys.executable, str(ROOT / "tools" / "make_release.py"), tempfile.mkdtemp(prefix="pm_rel_")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("unpacked", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
