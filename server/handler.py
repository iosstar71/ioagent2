# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] HTTP 요청 처리 · API 경로"""
import urllib.parse
import json
import pathlib
from http.server import SimpleHTTPRequestHandler

from . import settings
from .settings import (
    APP_CONFIG_URL,
    WEB_DIR,
    APP_CONFIG,
    app_features,
    APP_NAME,
    BASE_DIR,
    BLOCKED_URL_EXTENSIONS,
    BLOCKED_URL_PREFIXES,
    CSP_PAGES,
    CSP_POLICY,
    DEFAULT_PROJECT,
    EXTRA_ALLOWED_ORIGINS,
    MAX_BODY_BYTES,
    PROJECT_ID_CHARS,
    VERSION,
    load_app_config,
)
from .common import AuthError, MANAGER_ROLES, SecurityError, now_str
from .security import verify_pwd
from .permission import can_access_project, effective_user, is_sys_admin, membership
from . import backup, file_api, locks, project_reset, snapshots, user_admin
from .files import FileStore
from .logger import write_server_log
from .store import Store
from .session import LoginThrottle, Sessions, public_user


# ---------------------------------------------------------------------------
# HTTP 핸들러
# ---------------------------------------------------------------------------
class WbsHttpHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def log_message(self, fmt, *args):
        write_server_log(f"{self.address_string()} {fmt % args}")

    def _origin_allowed(self, origin):
        """같은 서버 주소(Host)에서 연 화면만 API 호출 허용 (+ --allow-origin 으로 지정한 주소)"""
        if not origin or origin == "null":
            return False
        if origin in EXTRA_ALLOWED_ORIGINS:
            return True
        host = (self.headers.get("Host") or "").lower()
        return urllib.parse.urlparse(origin).netloc.lower() == host

    def end_headers(self):
        origin = self.headers.get("Origin")
        if self._origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Origin, X-Project-Id")
        if getattr(self, "_csp", False):
            self.send_header("Content-Security-Policy", CSP_POLICY)
        if getattr(self, "_static", False):
            self.send_header("Cache-Control", "no-cache")
        if settings.TLS_ACTIVE:
            self.send_header("Strict-Transport-Security", "max-age=15552000")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _token(self):
        auth = self.headers.get("Authorization", "")
        return auth[7:].strip() if auth.lower().startswith("bearer ") else ""

    def _project_id(self, req=None):
        pid = str((req or {}).get("projectId") or self.headers.get("X-Project-Id") or DEFAULT_PROJECT).strip()
        return pid if pid and len(pid) <= 32 and set(pid) <= PROJECT_ID_CHARS else DEFAULT_PROJECT

    def _require_user(self, roles=None, allow_must_change=False, req=None):
        """로그인 사용자 + 요청한 프로젝트(X-Project-Id)의 역할을 적용한 사용자 정보"""
        base = Sessions.refresh_user(self._token())
        if not base:
            raise AuthError("로그인이 필요합니다. (세션 만료 또는 미인증)", 401)
        if base.get("mustChange") and not allow_must_change:
            raise AuthError("초기 비밀번호 또는 임시 비밀번호를 사용 중입니다. 비밀번호를 변경한 뒤 사용할 수 있습니다.", 403, "MUST_CHANGE_PASSWORD")
        project = Store.get_project(self._project_id(req))
        if not project or not can_access_project(base, project):
            raise AuthError("이 프로젝트에 접근할 권한이 없습니다.", 403, "PROJECT_FORBIDDEN")
        # [v3.0.0] 시스템관리자가 아니면 로그인한 프로젝트에서만 작업
        if base.get("role") != "SYS_ADMIN" and base.get("loginProject") and project["id"] != base["loginProject"]:
            raise AuthError("로그인한 프로젝트에서만 작업할 수 있습니다. 다른 프로젝트는 다시 로그인하세요.", 403, "PROJECT_LOCKED")
        info = effective_user(base, project)
        info["projectStatus"] = project["status"]
        if roles and info["role"] not in roles:
            raise AuthError("이 작업에 대한 권한이 없습니다.", 403)
        return info

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/db/ping":
                self._send_json(200, {"ok": True, "version": VERSION, "message": f"{APP_NAME} DB Server Running", "authRequired": True})
                return
            if path == "/api/files/download":
                file_api.download(self)
                return
            if path == "/api/admin/backup/download":
                backup.download(self)
                return
            if path == "/api/chat/messages":
                info = self._require_user()
                channel = urllib.parse.parse_qs(parsed.query).get("channel", ["전체"])[0]
                self._send_json(200, {"ok": True, "messages": Store.chat_list(channel, info["projectId"]), "channel": channel, "serverTime": now_str()})
                return
        except AuthError as ae:
            self._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401, "code": ae.code})
            return
        lower = path.lower()
        if any(lower.startswith(p) for p in BLOCKED_URL_PREFIXES) or pathlib.Path(lower).suffix in BLOCKED_URL_EXTENSIONS:
            self.send_error(403, "Forbidden: Direct access to server or database files is restricted.")
            return
        if path == APP_CONFIG_URL:
            self._send_app_config()
            return
        self._csp = path in CSP_PAGES
        self._static = True  # [v3.0.1] 화면 파일은 매번 서버에 확인 (업그레이드 후 이전 화면이 캐시로 남지 않게)
        super().do_GET()

    def _send_app_config(self):
        """app.ini 를 바꾸면 화면 빌드 없이 바로 반영되도록 화면 설정을 즉시 만들어 보냄"""
        c = load_app_config(BASE_DIR)
        data = {"productName": c["product_name"], "brand": c["product_name"], "displayName": c.get("display_name", ""), "edition": c["edition"], "editionName": c["edition_name"],
                "version": c["version"], "defaultLang": c["default_lang"],
                "defaultUi": c["default_ui"], "uiSwitch": c["allow_ui_switch"] == "1", "defaultTheme": c["default_theme"],
                "selfReset": str(c.get("self_password_reset", "1")).strip().lower() not in ("0", "false", "no"), **app_features(c)}
        body = ("var APP_CONFIG = " + json.dumps(data, ensure_ascii=False) + ";\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        # GET 과 같은 차단 규칙·보안 헤더 적용 (서버·DB·인증서 파일 정보 노출 방지)
        path = urllib.parse.urlparse(self.path).path
        lower = path.lower()
        if lower.startswith("/api/") or any(lower.startswith(p) for p in BLOCKED_URL_PREFIXES) or pathlib.Path(lower).suffix in BLOCKED_URL_EXTENSIONS:
            self.send_error(403, "Forbidden")
            return
        self._csp = path in CSP_PAGES
        super().do_HEAD()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if urllib.parse.urlparse(self.path).path == "/api/files/upload":
            file_api.upload(self)  # 파일 내용 그대로 받는 요청 (JSON 아님, 크기 제한은 첨부파일 정책)
            return
        if urllib.parse.urlparse(self.path).path == "/api/admin/backup/upload":
            backup.upload(self)  # 시스템 백업 zip 그대로 받는 요청
            return
        if length > MAX_BODY_BYTES:
            self._send_json(413, {"ok": False, "message": "요청 데이터 크기가 허용 한도(15MB)를 초과했습니다."})
            return
        try:
            req = json.loads(self.rfile.read(length).decode("utf-8") if length else "{}")
        except Exception:
            self._send_json(400, {"ok": False, "message": "잘못된 JSON 요청 형식입니다."})
            return
        path = urllib.parse.urlparse(self.path).path
        try:
            handler = self.ROUTES.get(path)
            if not handler:
                self._send_json(404, {"ok": False, "message": "알 수 없는 API 경로입니다."})
                return
            handler(self, req)
        except AuthError as ae:
            self._send_json(ae.status, {"ok": False, "message": str(ae), "authRequired": ae.status == 401,
                                        "code": ae.code, "mustChangePassword": ae.code == "MUST_CHANGE_PASSWORD"})
        except SecurityError as se:
            self._send_json(403, {"ok": False, "message": str(se)})
        except Exception as e:  # pragma: no cover - 예기치 못한 오류
            write_server_log(f"[ERROR] {path}: {e}")
            self._send_json(500, {"ok": False, "message": str(e)})

    # ---- 인증 API ----
    def api_bootstrap(self, req):
        pid = self._project_id(req)
        if not Store.get_project(pid):
            pid = DEFAULT_PROJECT
        cfg, _ = Store.load(["projectConfig"], pid)
        self._send_json(200, {"ok": True, "version": VERSION,
                              "projectName": (cfg.get("projectConfig") or {}).get("projectName", ""),
                              "subsystems": Store.get_subsystem_names(pid)})

    def api_login(self, req):
        emp = str(req.get("empNo", "")).strip()
        pwd_hash = str(req.get("pwdHash", ""))
        LoginThrottle.check(emp)
        row = next((u for u in Store.get_users() if str(u.get("empNo", "")).lower() == emp.lower()), None)
        if not row or not verify_pwd(row.get("pwdHash"), pwd_hash):
            LoginThrottle.fail(emp)
            write_server_log(f"[AUTH] Login failed: {emp} ({self.address_string()})")
            raise AuthError("사번 또는 비밀번호가 일치하지 않습니다.", 401)
        # [v3.0.0] 로그인할 프로젝트: 시스템관리자는 선택하지 않아도 됨, 그 밖에는 참여 중인 프로젝트를 반드시 선택
        login_pid = str(req.get("loginProject") or "").strip()
        project = Store.get_project(login_pid) if login_pid else None
        if is_sys_admin(row):
            login_pid = project["id"] if project else ""
        else:
            if not project:
                LoginThrottle.ok(emp)
                raise AuthError("로그인할 프로젝트를 선택하세요.", 400, "PROJECT_REQUIRED")
            if not membership(row, project["id"]):
                LoginThrottle.ok(emp)
                raise AuthError("선택한 프로젝트의 사용자가 아닙니다. 프로젝트를 확인하세요.", 403, "NOT_PROJECT_MEMBER")
        LoginThrottle.ok(emp)
        token, info = Sessions.create(row)
        if req.get("lang") in ("ko", "en"):
            info["lang"] = req["lang"]
        info["projectRoles"] = row.get("projectRoles") or {}
        info["loginProject"] = login_pid
        write_server_log(f"[AUTH] Login: {info['empNo']} ({info['role']})")
        eff = effective_user(info, Store.get_project(login_pid) if login_pid else None) if login_pid else self._effective_for(info, req)
        self._send_json(200, {"ok": True, "token": token, "user": public_user(eff), "loginProject": login_pid,
                              "projects": self._visible_projects(info)})

    def api_projects_public(self, req):
        """[v3.0.0] 로그인 화면의 프로젝트 선택 목록 (이름만, 보관된 프로젝트 제외)"""
        self._send_json(200, {"ok": True, "projects": [{"id": p["id"], "name": p["name"]} for p in Store.list_projects() if p.get("status") != "ARCHIVED"]})

    def api_projects_copy_users(self, req):
        """[v3.0.0] 다른 프로젝트의 사용자를 지금 프로젝트로 복사 (시스템관리자)"""
        info = self._require_user(roles={"SYS_ADMIN"}, req=req)
        src = str(req.get("fromProject") or "")
        if not Store.get_project(src):
            raise AuthError("복사할 프로젝트를 찾을 수 없습니다.", 404)
        copied, skipped = Store.copy_users(info, src, info["projectId"], req.get("empNos"))
        write_server_log(f"[PROJECT] Users copied {src} -> {info['projectId']}: {len(copied)} by {info['empNo']}")
        self._send_json(200, {"ok": True, "copied": copied, "skipped": skipped})

    def api_projects_members(self, req):
        """[v3.0.0] 다른 프로젝트의 사용자 목록 (복사할 사용자 고르기, 시스템관리자)"""
        self._require_user(roles={"SYS_ADMIN"}, req=req)
        src = str(req.get("fromProject") or "")
        self._send_json(200, {"ok": True, "members": Store.project_members(src)})

    def _visible_projects(self, base):
        # [v3.0.0] 시스템관리자가 아니면 로그인한 프로젝트만 (프로젝트 바꾸기 불가)
        if base.get("role") != "SYS_ADMIN" and base.get("loginProject"):
            return [p for p in Store.list_projects() if p["id"] == base["loginProject"] and can_access_project(base, p)]
        return [p for p in Store.list_projects() if can_access_project(base, p)]

    def _effective_for(self, base, req):
        project = Store.get_project(self._project_id(req))
        if not project or not can_access_project(base, project):
            project = Store.get_project(DEFAULT_PROJECT)
        return effective_user(base, project)

    def api_logout(self, req):
        Sessions.drop(self._token())
        self._send_json(200, {"ok": True})

    def api_me(self, req):
        base = Sessions.refresh_user(self._token())
        if not base:
            raise AuthError("로그인이 필요합니다. (세션 만료 또는 미인증)", 401)
        self._send_json(200, {"ok": True, "user": public_user(dict(self._effective_for(base, req), mustChange=base.get("mustChange"))),
                              "projects": self._visible_projects(base)})

    def api_register(self, req):
        row = Store.register_user(req.get("user") or {}, str(req.get("projectId") or "").strip() or None)
        write_server_log(f"[AUTH] New user registered: {row['empNo']} ({row['subsystem']})")
        self._send_json(200, {"ok": True, "user": Store.public_value("projectUsers", [row])[0]})

    def api_change_password(self, req):
        """로그인 화면 비밀번호 변경 (토큰 없이 사번 + 현재 비밀번호 검증)"""
        emp = str(req.get("empNo", "")).strip()
        if not emp:
            raise AuthError("사번을 입력하세요.", 400)
        LoginThrottle.check(emp)
        try:
            Store.change_password(emp, str(req.get("oldHash", "")), str(req.get("newHash", "")))
        except AuthError:
            LoginThrottle.fail(emp)
            raise
        LoginThrottle.ok(emp)
        write_server_log(f"[AUTH] Password changed (login screen): {emp}")
        self._send_json(200, {"ok": True, "message": "비밀번호가 변경되었습니다."})

    def api_reset_password(self, req):
        """[v3.0.2] 로그인 화면 비밀번호 초기화 (테스트 버전: 별도 인증 없음) — app.ini [security] self_password_reset=0 이면 거부"""
        if str(APP_CONFIG.get("self_password_reset", "1")).strip().lower() in ("0", "false", "no"):
            raise AuthError("비밀번호 초기화가 꺼져 있습니다. 시스템관리자에게 요청하세요.", 403, "RESET_DISABLED")
        emp = str(req.get("empNo", "")).strip()
        if not emp:
            raise AuthError("사번을 입력하세요.", 400)
        LoginThrottle.check(emp)
        Store.self_reset_password(emp)
        write_server_log(f"[AUTH] Password reset to default (login screen, no auth): {emp}")
        self._send_json(200, {"ok": True, "message": "비밀번호를 1234로 초기화했습니다."})

    def api_password(self, req):
        info = self._require_user(allow_must_change=True)
        Store.change_password(info["empNo"], str(req.get("oldHash", "")), str(req.get("newHash", "")))
        self._send_json(200, {"ok": True, "message": "비밀번호가 변경되었습니다."})

    # ---- 데이터 API ----
    def api_db_test(self, req):
        self._require_user()
        conn = Store.connect()
        conn.close()
        self._send_json(200, {"ok": True, "message": f"SQLite DB 연결 확인 ({settings.DB_PATH.name})"})

    def api_db_init(self, req):
        self._require_user(roles={"SYS_ADMIN"})
        self._send_json(200, {"ok": True, "message": Store.init_schema()})

    def api_db_load(self, req):
        info = self._require_user(req=req)
        keys = req.get("keys")
        data, revs = Store.load(keys if isinstance(keys, list) else None, info["projectId"], info)
        # [Workgroup] 불러올 때 잠금 현황을 함께 보냄 (주기 조회 없이 화면이 잠금 상태를 앎) + 내 잠금 연장
        lk = locks._run(lambda cur: (locks.touch(cur, info, info["projectId"]), locks.listing(cur, info["projectId"], False))[1])
        self._send_json(200, {"ok": True, "data": data, "revs": revs, "locks": lk})

    def api_db_save(self, req):
        info = self._require_user(req=req)
        if info.get("projectStatus") == "ARCHIVED" and info.get("baseRole") != "SYS_ADMIN":
            raise AuthError("보관된 프로젝트는 읽기 전용입니다.", 403, "PROJECT_ARCHIVED")
        changes = req.get("changes") or {}
        pid = info["projectId"]
        result = Store.save(info, changes, bool(req.get("force")), pid,
                            guard=lambda cur: locks.save_guard(cur, info, pid, changes, bool(req.get("lockBypass"))))
        if result.get("locked"):
            lk = locks._run(lambda cur: locks.listing(cur, pid, False))
            self._send_json(423, dict(result, locks=lk, message="다른 사람이 체크아웃했거나 체크아웃하지 않은 서브시스템이 있어 저장하지 않았습니다."))
            return
        if result.get("ok"):
            result["locks"] = locks._run(lambda cur: (locks.touch(cur, info, pid), locks.listing(cur, pid, False))[1])
        if result.get("conflict"):
            self._send_json(409, result)
            return
        if result.get("blocked"):
            write_server_log(f"[AUTH] Unauthorized save rejected: {info['empNo']} -> {result['blocked']}")
        self._send_json(200, result)

    # ---- 채팅 API ----
    def api_chat_send(self, req):
        info = self._require_user()
        message = str(req.get("message", "")).strip()
        if not message:
            self._send_json(400, {"ok": False, "message": "채팅 메시지 내용을 입력해주세요."})
            return
        msg = Store.chat_send(info, str(req.get("channel") or "전체"), message[:2000], req.get("id"), info["projectId"])
        self._send_json(200, {"ok": True, "message": msg})

    def api_chat_clear(self, req):
        info = self._require_user(roles=MANAGER_ROLES)
        Store.chat_clear(info["projectId"])
        self._send_json(200, {"ok": True, "message": "채팅 대화내역이 모두 삭제되었습니다."})

    # ---- [v1.0.10] 프로젝트 API ----
    def api_projects_list(self, req):
        base = self._require_user()
        projects = self._visible_projects(base)
        if base.get("baseRole") == "SYS_ADMIN":
            users = Store.get_users()
            for p in projects:
                p["memberCount"] = sum(1 for u in users if not is_sys_admin(u) and membership(u, p["id"]))
        self._send_json(200, {"ok": True, "projects": projects, "current": base["projectId"]})

    def api_projects_create(self, req):
        info = self._require_user()
        if info.get("baseRole") != "SYS_ADMIN":
            raise AuthError("프로젝트는 시스템관리자만 만들 수 있습니다.", 403)
        p = Store.create_project(info, req)
        write_server_log(f"[PROJECT] Created {p['id']} by {info['empNo']}")
        self._send_json(200, {"ok": True, "project": p})

    def _require_project_manager(self, pid):
        base = Sessions.refresh_user(self._token())
        if not base:
            raise AuthError("로그인이 필요합니다. (세션 만료 또는 미인증)", 401)
        if base.get("mustChange"):
            raise AuthError("비밀번호를 변경한 뒤 사용할 수 있습니다.", 403, "MUST_CHANGE_PASSWORD")
        project = Store.get_project(pid)
        if not project:
            raise AuthError("프로젝트를 찾을 수 없습니다.", 404)
        eff = effective_user(base, project)
        if eff["role"] not in MANAGER_ROLES or not can_access_project(base, project):
            raise AuthError("이 프로젝트를 관리할 권한이 없습니다.", 403)
        return eff

    def api_projects_update(self, req):
        pid = str(req.get("id") or "")
        eff = self._require_project_manager(pid)
        p = Store.update_project(pid, req, eff.get("baseRole") == "SYS_ADMIN")
        self._send_json(200, {"ok": True, "project": p})

    def api_projects_delete(self, req):
        self._require_user(roles={"SYS_ADMIN"})
        Store.delete_project(str(req.get("id") or ""))
        locks.release_all(str(req.get("id") or ""), "admin", "프로젝트 삭제")
        FileStore.drop_project(str(req.get("id") or ""))
        write_server_log(f"[PROJECT] Deleted {req.get('id')}")
        self._send_json(200, {"ok": True})

    ROUTES = {
        **file_api.ROUTES,
        **user_admin.ROUTES,
        **project_reset.ROUTES,
        **backup.ROUTES,
        **snapshots.ROUTES,
        **locks.ROUTES,
        "/api/projects/list": api_projects_list,
        "/api/projects/create": api_projects_create,
        "/api/projects/update": api_projects_update,
        "/api/projects/delete": api_projects_delete,
        "/api/projects/public": api_projects_public,
        "/api/projects/copy-users": api_projects_copy_users,
        "/api/projects/members": api_projects_members,
        "/api/auth/bootstrap": api_bootstrap,
        "/api/auth/login": api_login,
        "/api/auth/logout": api_logout,
        "/api/auth/me": api_me,
        "/api/auth/register": api_register,
        "/api/auth/password": api_password,
        "/api/auth/change-password": api_change_password,
        "/api/auth/reset-password": api_reset_password,
        "/api/db/test": api_db_test,
        "/api/db/init": api_db_init,
        "/api/db/load": api_db_load,
        "/api/db/save": api_db_save,
        "/api/chat/send": api_chat_send,
        "/api/chat/clear": api_chat_clear,
    }
