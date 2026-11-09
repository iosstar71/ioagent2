# -*- coding: utf-8 -*-
"""
[AX Project Management by YS v1.0.9] DB 서버 API 자동 테스트 (Python 표준 라이브러리만 사용)

프로그램 폴더를 임시 폴더로 복사한 뒤 빈 DB 로 wbs_db_server.py 를 기동하여 검증합니다.
(실제 운영 DB data/wbs_enterprise.db 는 건드리지 않음)

사용법 (프로그램 폴더에서):
    python tools/tests/test_server_api.py
"""
import hashlib
import json
import shutil
import socket
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
        for name in ("index.html", "wbs_db_server.py"):
            shutil.copy(ROOT / name, cls.tmp / name)
        (cls.tmp / "data").mkdir()
        shutil.copy(ROOT / "data" / "initial_data.json", cls.tmp / "data" / "initial_data.json")
        cls.port = free_port()
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.proc = subprocess.Popen([sys.executable, "wbs_db_server.py", "--port", str(cls.port), "--host", "127.0.0.1", "--silent"],
                                    cwd=cls.tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.base + "/api/db/ping", timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        cls.admin = cls.login("admin", "1234")[1]["token"]

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def call(cls, path, body=None, token=None, method="POST"):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
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

    def load(self, keys, token=None):
        s, d = self.call("/api/db/load", {"keys": keys}, token or self.admin)
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
        s, m = self.login("lead_lee", "1234")  # MEMBER / W1
        self.assertEqual(s, 200)
        data, revs = self.load(["wbsData"], m["token"])
        w = data["wbsData"]
        w1 = [r for r in w if r["system"] == "W1"]
        w2 = [r for r in w if r["system"] == "W2"]
        w1[0]["name"] += "_T"
        w2[0]["name"] += "_T"
        base = {"W1": revs["wbsData"]["W1"]["rev"], "W2": revs["wbsData"]["W2"]["rev"]}
        s, r = self.call("/api/db/save", {"changes": {"wbsData": {"parts": {"W1": w1, "W2": w2}, "base": base}}}, m["token"])
        self.assertEqual(s, 200)
        self.assertIn("wbsData[W2]", r["blocked"])
        saved = r["data"]["wbsData"]
        self.assertTrue(any(x["name"].endswith("_T") and x["system"] == "W1" for x in saved))
        self.assertFalse(any(x["name"].endswith("_T") and x["system"] == "W2" for x in saved))

    def test_11_member_cannot_write_master(self):
        _, m = self.login("lead_park", "1234")
        s, r = self.call("/api/db/save", {"changes": {"projectConfig": {"parts": {"*": {"x": 1}}, "base": {"*": 1}}}}, m["token"])
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
        s, _ = self.call("/api/auth/register", {"user": {"empNo": "t_user", "name": "dup", "subsystem": "W1", "pwdHash": h("abcd")}})
        self.assertEqual(s, 409)

    def test_21_change_password_and_reset(self):
        s, _ = self.call("/api/auth/change-password", {"empNo": "qa_han", "oldHash": h("1234"), "newHash": h("zzzz")})
        self.assertEqual(s, 200)
        self.assertEqual(self.login("qa_han", "zzzz")[0], 200)
        data, revs = self.load(["projectUsers"])
        row = next(u for u in data["projectUsers"] if u["empNo"] == "qa_han")
        row.update({"pwdHash": "", "pwdReset": True})
        s, _ = self.call("/api/db/save", {"changes": {"projectUsers": {"parts": {"qa_han": row}, "base": {"qa_han": revs["projectUsers"]["qa_han"]["rev"]}}}}, self.admin)
        self.assertEqual(s, 200)
        self.assertEqual(self.login("qa_han", "1234")[0], 200)

    def test_22_login_throttle(self):
        last = None
        for _ in range(6):
            last, _ = self.login("pm_throttle_check", "wrong")
        self.assertEqual(last, 429)

    # ---------------------------------------------------------------- 채팅
    def test_30_chat(self):
        s, _ = self.call("/api/chat/send", {"channel": "전체", "message": "hello"}, self.admin)
        self.assertEqual(s, 200)
        s, d = self.call("/api/chat/messages?channel=%EC%A0%84%EC%B2%B4", token=self.admin, method="GET")
        self.assertEqual(s, 200)
        self.assertTrue(any(m["message"] == "hello" for m in d["messages"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
