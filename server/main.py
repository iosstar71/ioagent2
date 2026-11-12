# -*- coding: utf-8 -*-
"""[Project Mgmt 서버] 서버 기동 (HTTP — TLS 는 전사 시스템 웹 서버가 담당)"""
import argparse
import pathlib
from http.server import ThreadingHTTPServer

from . import settings
from .settings import APP_CONFIG, APP_NAME, BASE_PATH, DATA_DIR, EXTRA_ALLOWED_ORIGINS
from .store import Store
from .handler import WbsHttpHandler


class AppServer(ThreadingHTTPServer):
    daemon_threads = True


def main():
    cfg = APP_CONFIG
    parser = argparse.ArgumentParser(description=f"{APP_NAME} server")
    parser.add_argument("--port", type=int, default=int(cfg["port"]), help="port (default: app.ini)")
    parser.add_argument("--host", type=str, default=cfg["host"], help="bind address (default: app.ini)")
    parser.add_argument("--db", type=str, default=cfg["db_file"], help="SQLite file name inside ./data (default: app.ini)")
    parser.add_argument("--quiet", "--silent", action="store_true", help="do not print errors to the console (logs/error.log only)")
    parser.add_argument("--allow-origin", action="append", default=[], help="extra origin allowed to call the API (repeatable)")
    parser.add_argument("--pbkdf2-iterations", type=int, default=settings.PBKDF2_ITERATIONS, help=argparse.SUPPRESS)
    args = parser.parse_args()
    settings.PBKDF2_ITERATIONS = max(1000, int(args.pbkdf2_iterations))
    EXTRA_ALLOWED_ORIGINS.update(o.rstrip("/") for o in args.allow_origin if o)
    db_name = pathlib.Path(args.db).name
    if not db_name.lower().endswith((".db", ".sqlite", ".sqlite3")):
        raise SystemExit("[ERROR] --db accepts only a .db/.sqlite/.sqlite3 file name.")
    settings.DB_PATH = DATA_DIR / db_name
    settings.LOG_CONSOLE = not args.quiet
    Store.init_schema()
    server = AppServer((args.host, args.port), WbsHttpHandler)
    print(f"[{APP_NAME}] http://127.0.0.1:{args.port}{BASE_PATH}/  (DB: {settings.DB_PATH.name}, errors: logs/error.log)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("stopped")


if __name__ == "__main__":
    main()
