# -*- coding: utf-8 -*-
"""
[IOSTAR-PM v2.3.0] DB 서버 API 자동 테스트 (Python 표준 라이브러리만 사용)

프로그램 폴더를 임시 폴더로 복사한 뒤 빈 DB 로 wbs_db_server.py 를 기동하여 검증합니다.
(실제 운영 DB data/wbs_enterprise.db 는 건드리지 않음)

사용법 (프로그램 폴더에서):
    python tools/tests/test_server_api.py
"""
import hashlib
import json
import shutil
import socket
import sqlite3
import ssl
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


def copy_program(dst):
    """프로그램 폴더(설정 · 서버 · 화면 · 초기 데이터)를 시험용 폴더로 복사"""
    shutil.copy(ROOT / "wbs_db_server.py", dst / "wbs_db_server.py")
    for d in ("conf", "server", "webapp"):
        shutil.copytree(ROOT / d, dst / d, ignore=shutil.ignore_patterns("__pycache__"))
    (dst / "data").mkdir()
    shutil.copy(ROOT / "data" / "initial_data.json", dst / "data" / "initial_data.json")


class ServerApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="axpmys_test_"))
        copy_program(cls.tmp)
        cls.port = free_port()
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.pwd = {}
        cls.proc = subprocess.Popen([sys.executable, "wbs_db_server.py", "--port", str(cls.port), "--host", "127.0.0.1", "--silent"],
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
            urllib.request.urlopen(self.base + "/data/wbs_enterprise.db")
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
    def test_20_register_and_login(self):
        s, _ = self.call("/api/auth/register", {"user": {"empNo": "t_user", "name": "테스터", "subsystem": "W1", "pwdHash": h("abcd"), "lang": "en"}})
        self.assertEqual(s, 400)  # [v3.0.0] 가입할 프로젝트 필수
        s, _ = self.call("/api/auth/register", {"user": {"empNo": "t_user", "name": "테스터", "subsystem": "W1", "pwdHash": h("abcd"), "lang": "en"}, "projectId": "DEFAULT"})
        self.assertEqual(s, 200)
        s, d = self.login("t_user", "abcd")
        self.assertEqual(s, 200)
        self.assertEqual(d["user"]["role"], "MEMBER")
        self.assertFalse(d["user"]["mustChangePassword"])
        s, _ = self.call("/api/auth/register", {"user": {"empNo": "t_user", "name": "dup", "subsystem": "W1", "pwdHash": h("abcd")}, "projectId": "DEFAULT"})
        self.assertEqual(s, 409)

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
        conn = sqlite3.connect(str(self.tmp / "data" / "wbs_enterprise.db"))
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
            urllib.request.urlopen(urllib.request.Request(self.base + "/data/wbs_enterprise.db", method="HEAD"))
        self.assertEqual(ctx.exception.code, 403)
        req = urllib.request.Request(self.base + "/api/db/ping", headers={"Origin": "http://evil.example"})
        with urllib.request.urlopen(req) as r:
            self.assertIsNone(r.headers.get("Access-Control-Allow-Origin"))

    def test_27_app_ini_config(self):
        """[v1.2.0] app.ini 의 제품 이름·버전·기본 언어가 서버와 화면 설정에 그대로 반영"""
        import configparser
        cp = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
        cp.read(self.tmp / "conf" / "app.ini", encoding="utf-8")
        s, d = self.call("/api/db/ping", method="GET")
        self.assertEqual(d["version"], "ver" + cp["app"]["version"])
        with urllib.request.urlopen(self.base + "/static/js/config/app-config.js") as r:
            js = r.read().decode("utf-8")
        self.assertIn('"defaultLang": "ko"', js)
        self.assertIn('"productName": "%s"' % cp["app"]["product_name"], js)
        # [Standard v1.0.1] 판 표시 이름 (STANDARD → Standard)
        if cp["app"].get("edition", "").upper() == "STANDARD":
            self.assertIn('"editionName": "Standard"', js)
        # [v2.3.0] 화면 방식·기본 테마 ([ui] 섹션) 이 화면 설정에 전달
        if cp.has_section("ui"):
            self.assertIn('"defaultUi": "%s"' % cp["ui"].get("default_ui", "standard"), js)
            self.assertIn('"uiSwitch": %s' % ("false" if cp["ui"].get("allow_ui_switch", "1") == "0" else "true"), js)
            self.assertIn('"defaultTheme": "%s"' % cp["ui"].get("default_theme", "electric"), js)
        # Pretendard 글꼴 파일은 화면에서 받을 수 있어야 함 (CSP font-src 'self')
        with urllib.request.urlopen(self.base + "/static/fonts/Pretendard-Regular.subset.woff2") as r:
            self.assertEqual(r.status, 200)
            self.assertGreater(len(r.read()), 200000)

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
        conn = sqlite3.connect(str(self.tmp / "data" / "wbs_enterprise.db"))
        n = conn.execute("SELECT COUNT(*) FROM TB_WBS_TASK WHERE PROJECT_ID = ?", (pid,)).fetchone()[0]
        conn.close()
        self.assertEqual(n, 1)
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

    def test_45_self_password_reset(self):
        """[v3.0.2] 로그인 화면 비밀번호 초기화 → 1234 로 로그인되고 변경 필수"""
        s, d = self.call("/api/auth/reset-password", {"empNo": "pmo_kim"})
        self.assertEqual(s, 200, d)
        s, d = self.login("pmo_kim", "1234")
        self.assertEqual(s, 200, d)
        self.assertTrue(d["user"].get("mustChangePassword"))
        self.pwd.pop("pmo_kim", None)
        s, _ = self.call("/api/auth/reset-password", {"empNo": "nobody_x"})
        self.assertEqual(s, 404)

    def test_43_chat_per_project(self):
        self.call("/api/chat/send", {"channel": "전체", "message": "only-in-project"}, self.admin, project=self.pid)
        _, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET")
        self.assertFalse(any(m["message"] == "only-in-project" for m in d["messages"]))
        _, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET", project=self.pid)
        self.assertTrue(any(m["message"] == "only-in-project" for m in d["messages"]))

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

    def test_50_attachments(self):
        """[v3.6.0] 첨부파일: 올리기(버전) · 유형/크기 제한 · 권한 · 내려받기 · 휴지통 · 되살리기 · 완전 삭제"""
        lee, park = self.ready("lead_lee"), self.ready("lead_park")  # W1 담당 / W2 담당
        pdf = b"%PDF-1.4 iostar attachment test"
        s, d = self.upload(lee, "화면설계서.pdf", pdf)
        self.assertEqual((s, d["file"]["version"], d["file"]["size"]), (200, 1, len(pdf)), d)
        s, d = self.upload(lee, "화면설계서.pdf", pdf + b" v2")
        self.assertEqual((s, d["file"]["version"]), (200, 2))
        fid = d["file"]["id"]
        # 제한: 로그인 필요 · 담당이 아닌 서브시스템 · 허용하지 않는 확장자 · 실행 파일 내용 · 20MB 초과 · 빈 파일
        self.assertEqual(self.upload(None, "a.pdf", pdf)[0], 401)
        self.assertEqual(self.upload(lee, "a.pdf", pdf, system="W2", owner="Ftest0002")[0], 403)
        self.assertEqual(self.upload(lee, "tool.exe", pdf)[0], 415)
        self.assertEqual(self.upload(lee, "fake.pdf", b"MZ\x90\x00binary")[0], 415)
        s, d = self.upload(lee, "big.zip", b"", length=20 * 1024 * 1024 + 1)
        self.assertEqual((s, d.get("code")), (413, "FILE_TOO_LARGE"))
        self.assertEqual(self.upload(lee, "empty.txt", b"")[0], 400)
        self.assertEqual(self.upload(lee, "x.pdf", pdf, owner="../etc")[0], 400)
        # 목록 · 요약 (파일 이름 기준 1개, 버전 2개) · 정책
        s, d = self.call("/api/files/list", {"ownerType": "deliverable", "ownerId": "Ftest0001"}, park)
        self.assertEqual((s, [f["version"] for f in d["files"]]), (200, [2, 1]))
        self.assertNotIn("path", d["files"][0])
        s, d = self.call("/api/files/summary", {}, park)
        self.assertEqual(d["counts"]["deliverable"]["Ftest0001"], 1)
        self.assertEqual((d["policy"]["maxBytes"], d["policy"]["trashDays"], "hwp" in d["policy"]["extensions"]), (20 * 1024 * 1024, 30, True))
        # 내려받기: 프로젝트 참여자 누구나 / 로그인 없이는 불가 / 저장 폴더는 웹으로 직접 열 수 없음
        req = urllib.request.Request(self.base + "/api/files/download?id=" + fid, headers={"Authorization": "Bearer " + park})
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.read(), pdf + b" v2")
            self.assertIn("attachment", r.headers.get("Content-Disposition", ""))
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/api/files/download?id=" + fid)
        self.assertEqual(ctx.exception.code, 401)
        stored = list((self.tmp / "upload" / "DEFAULT").rglob(fid))
        self.assertEqual(len(stored), 1)
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(self.base + "/upload/" + stored[0].relative_to(self.tmp / "upload").as_posix())
        self.assertEqual(ctx.exception.code, 404)
        # 삭제(휴지통): 담당자만 / 휴지통 보기 · 되살리기 · 완전 삭제: PM · 시스템관리자만
        self.assertEqual(self.call("/api/files/delete", {"id": fid}, park)[0], 403)
        self.assertEqual(self.call("/api/files/delete", {"id": fid}, lee)[0], 200)
        _, d = self.call("/api/files/list", {"ownerType": "deliverable", "ownerId": "Ftest0001"}, lee)
        self.assertEqual([f["version"] for f in d["files"]], [1])
        self.assertEqual(self.call("/api/files/list", {"trash": True}, lee)[0], 403)
        self.assertEqual(self.call("/api/files/purge", {"id": fid}, lee)[0], 403)
        s, d = self.call("/api/files/list", {"trash": True}, self.admin)
        self.assertEqual((s, [f["id"] for f in d["files"]]), (200, [fid]))
        self.assertEqual(self.call("/api/files/restore", {"id": fid}, self.admin)[0], 200)
        _, d = self.call("/api/files/list", {"ownerType": "deliverable", "ownerId": "Ftest0001"}, lee)
        self.assertEqual(len(d["files"]), 2)
        self.assertEqual(self.call("/api/files/purge", {"id": fid}, self.admin)[0], 400)  # 휴지통에 있는 것만
        self.call("/api/files/delete", {"id": fid}, lee)
        self.assertEqual(self.call("/api/files/purge", {"id": fid}, self.admin)[0], 200)
        self.assertFalse(stored[0].exists())
        # 다른 프로젝트에서는 보이지 않음
        s, d = self.call("/api/files/list", {"ownerType": "deliverable", "ownerId": "Ftest0001"}, self.admin, project=self.pid)
        self.assertEqual((s, d["files"]), (200, []))

    def test_51_post_attachments_limit(self):
        """[v3.7.0] 공지 · 게시물 · 회의록 첨부: 한 건에 5개까지, 같은 이름은 새 버전, 삭제는 올린 사람과 PM · 시스템관리자"""
        lee, park = self.ready("lead_lee"), self.ready("lead_park")
        for kind in ("notice", "post", "meeting"):
            owner = "Fpost" + kind
            for i in range(5):
                s, d = self.upload(lee, f"첨부{i}.pdf", b"%PDF-1.4 x", kind=kind, owner=owner)
                self.assertEqual(s, 200, (kind, i, d))
            s, d = self.upload(lee, "첨부5.pdf", b"%PDF-1.4 x", kind=kind, owner=owner)
            self.assertEqual((s, d.get("code")), (400, "FILE_COUNT"), kind)
            s, d = self.upload(lee, "첨부0.pdf", b"%PDF-1.4 y", kind=kind, owner=owner)  # 같은 이름 = 새 버전 (개수에 넣지 않음)
            self.assertEqual((s, d["file"]["version"]), (200, 2), kind)
            fid = d["file"]["id"]
            self.assertEqual(self.call("/api/files/delete", {"id": fid}, park)[0], 403, kind)  # 올린 사람이 아님
            self.assertEqual(self.call("/api/files/delete", {"id": fid}, lee)[0], 200, kind)
        s, d = self.call("/api/files/summary", {}, park)
        self.assertEqual((d["counts"]["notice"]["Fpostnotice"], d["policy"]["maxCount"]["notice"], d["policy"]["maxCount"]["deliverable"]), (5, 5, 0))
        self.assertEqual(self.upload(lee, "a.pdf", b"%PDF", kind="wbs", owner="Fx")[0], 400)

    def test_52_admin_users(self):
        """[v3.7.0] 전체 사용자 통합 관리(시스템관리자 전용) + 두 번째 시스템관리자 admin2"""
        self.assertEqual(self.call("/api/admin/users/list", {}, self.ready("lead_lee"))[0], 403)
        s, d = self.call("/api/admin/users/list", {}, self.admin)
        self.assertEqual(s, 200, d)
        by = {u["empNo"]: u for u in d["users"]}
        self.assertTrue(by["admin2"]["sysAdmin"] and by["admin"]["sysAdmin"])
        self.assertNotIn("pwdHash", by["admin"])
        self.assertIn("DEFAULT", by["lead_lee"]["projectRoles"])
        self.assertTrue(any(p["id"] == "DEFAULT" and "W1" in p["subsystems"] for p in d["projects"]))
        admin2 = self.ready("admin2", project="")  # 시스템관리자는 프로젝트를 고르지 않아도 로그인
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
        self.call("/api/chat/send", {"channel": "전체", "message": "clear-me"}, self.admin, project=pid)
        lee = self.ready("lead_lee")
        self.assertEqual(self.call("/api/projects/clear-tasks", {"ids": [pid]}, lee, project=pid)[0], 403)
        self.assertEqual(self.call("/api/projects/clear-tasks", {"ids": ["DEFAULT", pid]}, self.ready("pmo_kim"))[0], 403)
        self.assertEqual(self.call("/api/projects/clear-tasks", {"ids": ["NOPE"]}, self.admin)[0], 404)
        before_default, _ = self.load(["wbsData"])
        s, d = self.call("/api/projects/clear-tasks", {"ids": [pid]}, self.admin, project=pid)
        self.assertEqual(s, 200, d)
        res = d["results"][0]
        self.assertTrue(res["counts"]["wbsData"] >= 1 and res["counts"]["noticesData"] >= 1)
        self.assertTrue((self.tmp / "data" / "backups" / res["backup"]).exists())
        data, _ = self.load(["projectConfig", "subsystemsMeta", "wbsData", "noticesData"], project=pid)
        self.assertEqual((data["wbsData"], data["noticesData"]), ([], []))
        self.assertTrue(data["projectConfig"].get("projectName") and len(data["subsystemsMeta"]) > 0)
        _, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET", project=pid)
        self.assertFalse(any(m["message"] == "clear-me" for m in d["messages"]))
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

    def test_55_system_backup_restore(self):
        """[v4.0.0] 시스템 전체 백업(첨부 선택) · 목록 · 내려받기 · 올리기 · 복원 · 자동 백업 설정 — 시스템관리자 전용"""
        self.assertEqual(self.call("/api/admin/backup/list", {}, self.ready("pmo_kim"))[0], 403)
        s, d = self.call("/api/admin/backup/create", {"withFiles": False}, self.admin)
        self.assertEqual(s, 200, d)
        name = d["name"]
        s, d = self.call("/api/admin/backup/create", {"withFiles": True}, self.admin)
        with_files = next(b for b in d["backups"] if b["name"] == d["name"])
        self.assertTrue(with_files["withFiles"])
        # 백업 뒤에 바꾼 공지는 복원하면 사라짐
        self.call("/api/db/save", {"changes": {"noticesData": {"parts": {"N-AFTER": {"id": "N-AFTER", "title": "after backup"}}, "base": {}}}}, self.admin)
        req = urllib.request.Request(self.base + "/api/admin/backup/download?name=" + name, headers={"Authorization": "Bearer " + self.admin})
        with urllib.request.urlopen(req) as r:
            blob = r.read()
        self.assertEqual(blob[:2], b"PK")
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=20)
        conn.request("POST", "/api/admin/backup/upload", body=blob, headers={"Authorization": "Bearer " + self.admin, "Content-Type": "application/octet-stream"})
        up = json.loads(conn.getresponse().read()); conn.close()
        self.assertTrue(up["ok"] and up["name"].endswith("_uploaded.zip"), up)
        s, d = self.call("/api/admin/backup/restore", {"name": up["name"]}, self.admin)
        self.assertEqual(s, 200, d)
        self.assertTrue(any(b["name"] == d["before"] and b["kind"] == "before-restore" for b in d["backups"]))
        admin = self.ready("admin")  # 계정은 백업 시점 그대로라 다시 로그인
        data, _ = self.load(["noticesData"], token=admin)
        self.assertFalse(any(n.get("id") == "N-AFTER" for n in data["noticesData"]))
        type(self).admin = admin
        s, d = self.call("/api/admin/backup/settings", {"enabled": True, "hours": 12, "keep": 3, "withFiles": False}, admin)
        self.assertEqual((s, d["auto"]["enabled"], d["auto"]["hours"], d["auto"]["keep"]), (200, True, 12, 3))
        self.call("/api/admin/backup/settings", {"enabled": False}, admin)
        self.assertEqual(self.call("/api/admin/backup/restore", {"name": "../x.zip"}, admin)[0], 400)

    def test_56_server_snapshots(self):
        """[v4.0.0] 복원 지점(스냅샷)을 서버에 보관 — PM 은 자기 프로젝트, 시스템관리자는 모두"""
        pm = self.ready("pmo_kim")
        meta = {"id": "BKP-T1", "createdAt": "2027-06-04 10:00:00", "actionType": "시험", "wbsCount": 1}
        s, d = self.call("/api/snapshots/save", {"projectId": "DEFAULT", "meta": meta, "payload": {"wbsData": [{"id": "1"}]}}, pm)
        self.assertEqual(s, 200, d)
        self.assertEqual(self.call("/api/snapshots/save", {"projectId": "DEFAULT", "meta": meta, "payload": {}}, self.ready("lead_lee"))[0], 403)
        s, d = self.call("/api/snapshots/list", {"projectId": "DEFAULT"}, pm)
        self.assertEqual([m["id"] for m in d["snapshots"]][:1], ["BKP-T1"])
        s, d = self.call("/api/snapshots/get", {"projectId": "DEFAULT", "id": "BKP-T1"}, pm)
        self.assertEqual(d["payload"]["wbsData"][0]["id"], "1")
        self.assertEqual(self.call("/api/snapshots/list", {"all": True}, pm)[0], 403)
        s, d = self.call("/api/snapshots/list", {"all": True}, self.admin)
        self.assertTrue(any(m["id"] == "BKP-T1" for m in d["snapshots"]))
        self.assertEqual(self.call("/api/snapshots/delete", {"projectId": "DEFAULT", "id": "BKP-T1"}, pm)[0], 200)

    # ---------------------------------------------------------------- 채팅
    def test_30_chat(self):
        s, _ = self.call("/api/chat/send", {"channel": "전체", "message": "hello"}, self.admin)
        self.assertEqual(s, 200)
        s, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET")
        self.assertEqual(s, 200)
        self.assertTrue(any(m["message"] == "hello" for m in d["messages"]))


class SharedFilesTest(unittest.TestCase):
    """[v1.2.0] 국내판·Standard·Neo 공용 파일(배치 파일·배포 도구)이 지문 목록과 같은지 확인"""

    def test_shared_files_match_manifest(self):
        r = subprocess.run([sys.executable, str(ROOT / "tools" / "check_shared_files.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)


class TlsAndUpgradeTest(unittest.TestCase):
    """[v1.0.10] HTTPS(사내 CA 인증서 검증) + v1.0.9 이하 SHA-256 비밀번호 → PBKDF2 자동 전환"""

    def test_https_and_legacy_upgrade(self):
        tmp = Path(tempfile.mkdtemp(prefix="axpmys_tls_"))
        try:
            copy_program(tmp)
            subprocess.run([sys.executable, str(ROOT / "tools" / "make_cert.py"), "--out", str(tmp / "certs")],
                           check=True, stdout=subprocess.DEVNULL)
            # v1.0.9 형식 DB: 비밀번호를 SHA-256 1차 해시 그대로 저장
            port = free_port()
            sys.path.insert(0, str(tmp))
            try:
                import importlib
                cfg = importlib.import_module("server.settings")
                cfg.DB_PATH = tmp / "data" / "wbs_enterprise.db"
                cfg.LOG_SILENT_MODE = True
                importlib.import_module("server.store").Store.init_schema()
                conn = sqlite3.connect(str(cfg.DB_PATH))
                users = json.loads(conn.execute("SELECT JSON_TEXT FROM TB_WBS_DATASET WHERE DATA_KEY='projectUsers'").fetchone()[0])
                for u in users:
                    if u["empNo"] == "qa_han":
                        u["pwdHash"] = h("Legacy99x")
                conn.execute("UPDATE TB_WBS_DATASET SET JSON_TEXT=? WHERE DATA_KEY='projectUsers'", (json.dumps(users),))
                conn.commit()
                conn.close()
            finally:
                sys.path.remove(str(tmp))
                for m in [m for m in sys.modules if m == "server" or m.startswith("server.")]:
                    sys.modules.pop(m, None)
            proc = subprocess.Popen([sys.executable, "wbs_db_server.py", "--port", str(port), "--host", "127.0.0.1", "--silent",
                                     "--cert", "certs/server.crt", "--key", "certs/server.key"],
                                    cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                ctx = ssl.create_default_context(cafile=str(tmp / "certs" / "ca.crt"))  # 인증서 검증 + 호스트 이름 확인
                base = f"https://127.0.0.1:{port}"
                for _ in range(50):
                    try:
                        urllib.request.urlopen(base + "/api/db/ping", timeout=1, context=ctx)
                        break
                    except Exception:
                        time.sleep(0.2)
                with urllib.request.urlopen(base + "/index.html", context=ctx) as r:
                    self.assertIn("max-age", r.headers.get("Strict-Transport-Security", ""))
                req = urllib.request.Request(base + "/api/auth/login", data=json.dumps({"empNo": "qa_han", "pwdHash": h("Legacy99x"), "loginProject": "DEFAULT"}).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
                with urllib.request.urlopen(req, context=ctx) as r:
                    self.assertEqual(r.status, 200)
                with self.assertRaises(Exception):
                    urllib.request.urlopen(f"http://127.0.0.1:{port}/api/db/ping", timeout=3)
            finally:
                proc.terminate()
                proc.wait(timeout=5)
            conn = sqlite3.connect(str(tmp / "data" / "wbs_enterprise.db"))
            users = json.loads(conn.execute("SELECT JSON_TEXT FROM TB_WBS_DATASET WHERE DATA_KEY='projectUsers'").fetchone()[0])
            conn.close()
            qa = next(u for u in users if u["empNo"] == "qa_han")
            self.assertTrue(qa["pwdHash"].startswith("pbkdf2_sha256$"))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
