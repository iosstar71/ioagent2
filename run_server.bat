@echo off
rem ============================================================================
rem Project Mgmt (협업) server launcher - settings: conf\app.ini
rem ============================================================================
chcp 65001 > nul
setlocal
cd /d "%~dp0"
set "PY_CMD="
where python >nul 2>nul && set "PY_CMD=python"
if not defined PY_CMD ( where py >nul 2>nul && set "PY_CMD=py -3" )
if not defined PY_CMD (
    echo [ERROR] Python 3 was not found. Install Python 3 and add it to PATH.
    pause
    exit /b 1
)
%PY_CMD% start_server.py %*
endlocal
pause
