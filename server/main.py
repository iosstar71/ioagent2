# -*- coding: utf-8 -*-
"""[IOSTAR-PM 서버] 서버 기동 (HTTP/HTTPS)"""
import argparse
import pathlib
import ssl
from http.server import ThreadingHTTPServer

from . import settings
from .settings import APP_CONFIG, APP_NAME, BASE_DIR, DATA_DIR, EXTRA_ALLOWED_ORIGINS, FILE_MAX_BYTES, UPLOAD_DIR, WEB_DIR
from .logger import write_server_log
from . import user_admin
from .files import FileStore
from .store import Store
from .handler import WbsHttpHandler


class WbsServer(ThreadingHTTPServer):
    """요청마다 스레드 처리. HTTPS 사용 시 TLS 연결 수립(handshake)도 요청 스레드에서 수행하여 느린 접속이 다른 접속을 막지 않도록 함"""
    daemon_threads = True
    ssl_context = None

    def finish_request(self, request, client_address):
        if not self.ssl_context:
            return super().finish_request(request, client_address)
        try:
            request.settimeout(15)
            tls = self.ssl_context.wrap_socket(request, server_side=True)
            tls.settimeout(None)
        except (ssl.SSLError, OSError) as e:
            write_server_log(f"[TLS] Handshake failed from {client_address[0]}: {e.__class__.__name__}")
            return
        try:
            super().finish_request(tls, client_address)
        finally:
            try:
                tls.close()
            except OSError:
                pass


def make_tls_context(cert_file, key_file):
    """[v1.0.10] HTTPS: TLS 1.2 이상, 인증서(PEM)와 개인키(PEM) 파일 사용"""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.minimum_version = ssl.TLSVersion.TLSv1_2
    ctx.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
    return ctx


def main():
    parser = argparse.ArgumentParser(description=f"{APP_NAME} Secure Multi-User DB Server")
    cfg = APP_CONFIG
    parser.add_argument("--port", type=int, default=int(cfg["port"]), help="HTTP Server Port (default: app.ini [server] port)")
    parser.add_argument("--host", type=str, default=cfg["host"], help="Bind address (default: app.ini)")
    parser.add_argument("--db", type=str, default=cfg["db_file"], help="SQLite DB file name inside ./data (default: app.ini)")
    parser.add_argument("--log-dir", type=str, default=cfg["log_dir"], help="Directory for daily log files (default: app.ini)")
    parser.add_argument("--log-date", action="store_true", help="Enable date-based log file (logs/server_YYYYMMDD.log)")
    parser.add_argument("--silent", action="store_true", help="Suppress console log (file only)")
    parser.add_argument("--no-console", action="store_true", help="Alias for --silent")
    parser.add_argument("--cert", type=str, default="", help="HTTPS certificate file (PEM). Default: app.ini cert_file if it exists")
    parser.add_argument("--key", type=str, default="", help="HTTPS private key file (PEM). Default: app.ini key_file if it exists")
    parser.add_argument("--no-tls", action="store_true", help="Start with HTTP even if certificate files exist")
    parser.add_argument("--allow-origin", action="append", default=[], help="Extra origin allowed to call the API (repeatable)")
    parser.add_argument("--pbkdf2-iterations", type=int, default=settings.PBKDF2_ITERATIONS, help=argparse.SUPPRESS)
    args = parser.parse_args()
    settings.PBKDF2_ITERATIONS = max(1000, int(args.pbkdf2_iterations))
    EXTRA_ALLOWED_ORIGINS.update(o.rstrip("/") for o in args.allow_origin if o)

    db_name = pathlib.Path(args.db).name
    if not db_name.lower().endswith((".db", ".sqlite", ".sqlite3")):
        raise SystemExit("[ERROR] --db accepts only a .db/.sqlite/.sqlite3 file name.")
    settings.DB_PATH = DATA_DIR / db_name
    settings.LOG_SILENT_MODE = args.silent or args.no_console
    settings.LOG_DATE_MODE = args.log_date or settings.LOG_SILENT_MODE
    settings.LOG_DIR = BASE_DIR / args.log_dir if not pathlib.Path(args.log_dir).is_absolute() else pathlib.Path(args.log_dir)

    Store.init_schema()
    FileStore.init_schema()
    user_admin.ensure_second_admin()
    server = WbsServer((args.host, args.port), WbsHttpHandler)
    scheme = "http"
    resolve = lambda v: pathlib.Path(v) if pathlib.Path(v).is_absolute() else BASE_DIR / v  # noqa: E731
    if not (args.cert or args.key) and not args.no_tls and resolve(cfg["cert_file"]).exists() and resolve(cfg["key_file"]).exists():
        args.cert, args.key = cfg["cert_file"], cfg["key_file"]  # [v1.2.0] 인증서가 있으면 자동 HTTPS
    if (args.cert or args.key) and not args.no_tls:
        cert = resolve(args.cert)
        key = resolve(args.key)
        if not cert.exists() or not key.exists():
            raise SystemExit(f"[ERROR] Certificate or key file not found: {cert} / {key}")
        server.ssl_context = make_tls_context(cert, key)
        settings.TLS_ACTIVE = True
        scheme = "https"
    print("============================================================================")
    print(f"[{APP_NAME}] Multi-user DB server started (login authentication required)")
    print(f"  * Browser URL        : {scheme}://127.0.0.1:{args.port}  (LAN: {scheme}://<server-ip>:{args.port})")
    print(f"  * Encryption (TLS)   : {'ON (TLS 1.2+)' if settings.TLS_ACTIVE else 'OFF - use --cert/--key to enable HTTPS'}")
    print(f"  * Web root directory : {WEB_DIR}")
    print(f"  * Attachment folder  : {UPLOAD_DIR}  (max {FILE_MAX_BYTES // 1024 // 1024}MB per file)")
    print(f"  * SQLite DB file     : {settings.DB_PATH}")
    print("  * Initial admin      : admin / 1234  (change the password after first login)")
    print("============================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[SHUTDOWN] Server stopped by user request.")


if __name__ == "__main__":
    main()
