#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Project Mgmt (협업) 서버 실행 파일 — 설정: conf/app.ini

    python start_server.py [--port 8080] [--host 0.0.0.0] [--quiet]

전사 시스템의 웹 서버(리버스 프록시)가 https://xxx.com/pprjmgmt/ 를 이 서버로 넘겨 주면 됩니다.
(하위 주소는 conf/app.ini [server] base_path)
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from server.main import main  # noqa: E402

if __name__ == "__main__":
    main()
