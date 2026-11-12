#!/bin/sh
# Project Mgmt (협업) server launcher - settings: conf/app.ini
cd "$(dirname "$0")" && exec python3 start_server.py "$@"
