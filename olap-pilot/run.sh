#!/bin/sh
# 빌드 후 실행한다. 사용법: ./run.sh [포트] [DuckDB 파일 경로]
cd "$(dirname "$0")" || exit 1
[ -f target/olap-pilot-0.1.0.jar ] || mvn -q -B package || exit 1
exec java -jar target/olap-pilot-0.1.0.jar "$@"
