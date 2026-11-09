@echo off
rem ============================================================================
rem [IOSTAR-PM shared] HTTPS certificate generator
rem  - Creates certs\ca.crt (install on client PCs) and certs\server.crt / server.key
rem  - Extra host names / IPs: make_cert.bat --host 10.10.1.20 --host pms.company.local
rem  - Renew only the server certificate (keep CA): make_cert.bat --renew
rem ============================================================================
chcp 65001 > nul
cd /d "%~dp0"
set PY_CMD=
if exist "%~dp0python\python.exe" (
    set PY_CMD="%~dp0python\python.exe"
) else (
    where python >nul 2>nul && set PY_CMD=python
    if not defined PY_CMD where py >nul 2>nul && set PY_CMD=py -3
)
if not defined PY_CMD (
    echo [ERROR] Python 3 was not found.
    pause
    exit /b 1
)
%PY_CMD% tools\make_cert.py %*
echo.
echo Next steps:
echo  1. Restart run_server.bat - it starts in HTTPS mode automatically.
echo  2. Install certs\ca.crt on each client PC: double-click - Install Certificate -
echo     Local Machine - "Trusted Root Certification Authorities". (or deploy by Group Policy)
echo  3. Open https://^<server-ip^>:^<port^> in Chrome or Edge. (port: app.ini, default 8080)
pause
