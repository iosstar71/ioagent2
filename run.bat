@echo off
rem Build if needed, then run. Usage: run.bat [port] [duckdb file]
cd /d "%~dp0"
if not exist target\olap-pilot-0.1.0.jar call mvn -q -B package || exit /b 1
java -jar target\olap-pilot-0.1.0.jar %*
