# -*- coding: utf-8 -*-
"""
[IOSTAR-PM v1.2.0] DB 서버 API 자동 테스트 (Python 표준 라이브러리만 사용)

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


class ServerApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="axpmys_test_"))
        for name in ("index.html", "wbs_db_server.py", "app.ini"):
            shutil.copy(ROOT / name, cls.tmp / name)
        (cls.tmp / "data").mkdir()
        shutil.copy(ROOT / "data" / "initial_data.json", cls.tmp / "data" / "initial_data.json")
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
    def login(cls, emp, pwd):
        return cls.call("/api/auth/login", {"empNo": emp, "pwdHash": h(pwd)})

    @classmethod
    def ready(cls, emp):
        """로그인 → 초기 비밀번호면 변경(필수) → 사용 가능한 토큰 반환"""
        cur = cls.pwd.get(emp, "1234")
        s, d = cls.login(emp, cur)
        assert s == 200, (emp, s, d)
        if d["user"].get("mustChangePassword"):
            new = "Test" + emp.replace("_", "") + "2026"
            s2, d2 = cls.call("/api/auth/change-password", {"empNo": emp, "oldHash": h(cur), "newHash": h(new)})
            assert s2 == 200, d2
            cls.pwd[emp] = new
            s, d = cls.login(emp, new)
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
        self.assertEqual(s, 200)
        s, d = self.login("t_user", "abcd")
        self.assertEqual(s, 200)
        self.assertEqual(d["user"]["role"], "MEMBER")
        self.assertFalse(d["user"]["mustChangePassword"])
        s, _ = self.call("/api/auth/register", {"user": {"empNo": "t_user", "name": "dup", "subsystem": "W1", "pwdHash": h("abcd")}})
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
        cp.read(self.tmp / "app.ini", encoding="utf-8")
        s, d = self.call("/api/db/ping", method="GET")
        self.assertEqual(d["version"], "ver" + cp["app"]["version"])
        with urllib.request.urlopen(self.base + "/js/app-config.js") as r:
            js = r.read().decode("utf-8")
        self.assertIn('"defaultLang": "ko"', js)
        self.assertIn('"productName": "%s"' % cp["app"]["product_name"], js)

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

    def test_41_project_role_override(self):
        pid = self.pid
        token = self.ready("lead_park")
        s, r = self.call("/api/db/save", {"changes": {"projectConfig": {"parts": {"*": {"projectName": "x"}}, "base": {"*": 1}}}}, token, project=pid)
        self.assertIn("projectConfig[*]", r.get("blocked", []))
        data, revs = self.load(["projectUsers"], project=pid)
        row = next(u for u in data["projectUsers"] if u["empNo"] == "lead_park")
        row["projectRoles"] = {pid: {"role": "PM", "subsystem": "ALL"}}
        s, _ = self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"lead_park": row}, "base": {"lead_park": revs["projectUsers"]["lead_park"]["rev"]}}}}, self.admin, project=pid)
        self.assertEqual(s, 200)
        _, me = self.call("/api/auth/me", {}, token, project=pid)
        self.assertEqual(me["user"]["role"], "PM")
        cfg, revs = self.load(["projectConfig"], token, project=pid)
        cfg["projectConfig"]["projectName"] = "2차 확산 과제(수정)"
        s, r = self.call("/api/db/save", {"changes": {"projectConfig": {"parts": {"*": cfg["projectConfig"]}, "base": {"*": revs["projectConfig"]["*"]["rev"]}}}}, token, project=pid)
        self.assertEqual(r.get("blocked"), [])
        _, me = self.call("/api/auth/me", {}, token)
        self.assertEqual(me["user"]["role"], "MEMBER")  # 기본 프로젝트에서는 기존 역할
        s, r = self.call("/api/projects/list", {}, self.admin)
        self.assertEqual(next(p for p in r["projects"] if p["id"] == pid)["name"], "2차 확산 과제(수정)")

    def test_42_restricted_project(self):
        s, r = self.call("/api/projects/create", {"name": "보안 과제", "startDate": "2028-01-01", "endDate": "2028-06-30", "restricted": True}, self.admin)
        pid = r["project"]["id"]
        token = self.ready("lead_lee")
        s, r = self.call("/api/db/load", {"keys": ["wbsData"]}, token, project=pid)
        self.assertEqual(s, 403)
        self.assertEqual(r.get("code"), "PROJECT_FORBIDDEN")
        _, lst = self.call("/api/projects/list", {}, token)
        self.assertNotIn(pid, [p["id"] for p in lst["projects"]])
        s, _ = self.call("/api/projects/update", {"id": pid, "members": ["lead_lee"]}, self.admin)
        self.assertEqual(s, 200)
        s, _ = self.call("/api/db/load", {"keys": ["wbsData"]}, token, project=pid)
        self.assertEqual(s, 200)
        s, _ = self.call("/api/projects/delete", {"id": pid}, token)
        self.assertEqual(s, 403)
        s, _ = self.call("/api/projects/delete", {"id": pid}, self.admin)
        self.assertEqual(s, 200)
        s, _ = self.call("/api/db/load", {"keys": ["wbsData"]}, self.admin, project=pid)
        self.assertEqual(s, 403)

    def test_43_chat_per_project(self):
        self.call("/api/chat/send", {"channel": "전체", "message": "only-in-project"}, self.admin, project=self.pid)
        _, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET")
        self.assertFalse(any(m["message"] == "only-in-project" for m in d["messages"]))
        _, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET", project=self.pid)
        self.assertTrue(any(m["message"] == "only-in-project" for m in d["messages"]))

    # ---------------------------------------------------------------- 채팅
    def test_30_chat(self):
        s, _ = self.call("/api/chat/send", {"channel": "전체", "message": "hello"}, self.admin)
        self.assertEqual(s, 200)
        s, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET")
        self.assertEqual(s, 200)
        self.assertTrue(any(m["message"] == "hello" for m in d["messages"]))


class SharedFilesTest(unittest.TestCase):
    """[v1.2.0] 국내판·G 버전 공용 파일(배치 파일·배포 도구)이 지문 목록과 같은지 확인"""

    def test_shared_files_match_manifest(self):
        r = subprocess.run([sys.executable, str(ROOT / "tools" / "check_shared_files.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)


class TlsAndUpgradeTest(unittest.TestCase):
    """[v1.0.10] HTTPS(사내 CA 인증서 검증) + v1.0.9 이하 SHA-256 비밀번호 → PBKDF2 자동 전환"""

    def test_https_and_legacy_upgrade(self):
        tmp = Path(tempfile.mkdtemp(prefix="axpmys_tls_"))
        try:
            for name in ("index.html", "wbs_db_server.py"):
                shutil.copy(ROOT / name, tmp / name)
            (tmp / "data").mkdir()
            shutil.copy(ROOT / "data" / "initial_data.json", tmp / "data" / "initial_data.json")
            subprocess.run([sys.executable, str(ROOT / "tools" / "make_cert.py"), "--out", str(tmp / "certs")],
                           check=True, stdout=subprocess.DEVNULL)
            # v1.0.9 형식 DB: 비밀번호를 SHA-256 1차 해시 그대로 저장
            port = free_port()
            sys.path.insert(0, str(tmp))
            try:
                import importlib
                srv = importlib.import_module("wbs_db_server")
                srv.DB_PATH = tmp / "data" / "wbs_enterprise.db"
                srv.LOG_SILENT_MODE = True
                srv.Store.init_schema()
                conn = sqlite3.connect(str(srv.DB_PATH))
                users = json.loads(conn.execute("SELECT JSON_TEXT FROM TB_WBS_DATASET WHERE DATA_KEY='projectUsers'").fetchone()[0])
                for u in users:
                    if u["empNo"] == "qa_han":
                        u["pwdHash"] = h("Legacy99x")
                conn.execute("UPDATE TB_WBS_DATASET SET JSON_TEXT=? WHERE DATA_KEY='projectUsers'", (json.dumps(users),))
                conn.commit()
                conn.close()
            finally:
                sys.path.remove(str(tmp))
                sys.modules.pop("wbs_db_server", None)
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
                req = urllib.request.Request(base + "/api/auth/login", data=json.dumps({"empNo": "qa_han", "pwdHash": h("Legacy99x")}).encode(),
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
