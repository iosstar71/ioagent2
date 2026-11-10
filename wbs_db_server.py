#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IOSTAR-PM 서버 실행 파일 (run_server.bat 이 이 파일을 실행)

서버 프로그램은 server/ 폴더에 기능별로 나뉘어 있습니다. (설정: conf/app.ini)
    python wbs_db_server.py [--port 8080] [--host 0.0.0.0] [--log-date] [--silent]
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from server.main import main  # noqa: E402

if __name__ == "__main__":
    main()
