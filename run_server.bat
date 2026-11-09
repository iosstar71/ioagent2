@echo off
rem ============================================================================
rem [IOSTAR-PM shared] Multi-User DB Server Launcher (all editions share this file)
rem  - Product name, port, DB file, HTTPS certificate paths: app.ini
rem  - HTTPS starts automatically when the certificate files in app.ini exist (make_cert.bat)
rem ============================================================================
chcp 65001 > nul
setlocal
cd /d "%~dp0"

rem --- read app.ini (key=value) ---
set "CFG_product_name=IOSTAR-PM"
set "CFG_edition=KR"
set "CFG_edition_name="
set "CFG_version="
set "CFG_port=8080"
if exist "app.ini" (
    for /f "usebackq eol=; tokens=1,* delims==" %%A in ("app.ini") do set "CFG_%%A=%%B"
)
if not defined CFG_edition_name set "CFG_edition_name=%CFG_edition%"

echo ============================================================================
echo [%CFG_product_name% %CFG_edition_name% ver%CFG_version%] Multi-User DB Web Server (Port: %CFG_port%)
echo Current Directory: %~dp0
echo ============================================================================

set "TARGET_PY=wbs_db_server.py"
if not exist "%TARGET_PY%" (
    echo [ERROR] wbs_db_server.py file cannot be found.
    pause
    exit /b 1
)

rem --- Python: bundled python\python.exe first, then installed Python ---
set "PY_CMD="
if exist "%~dp0python\python.exe" set PY_CMD="%~dp0python\python.exe"
if not defined PY_CMD (
    where python >nul 2>nul && set "PY_CMD=python"
)
if not defined PY_CMD (
    where py >nul 2>nul && set "PY_CMD=py -3"
)
if not defined PY_CMD (
    echo [ERROR] Python 3 was not found.
    echo Use the Windows package that includes the 'python' folder, or install Python 3 and add it to PATH.
    pause
    exit /b 1
)
echo [*] Python  : %PY_CMD%
if exist "certs\server.crt" (
    echo [*] Protocol: HTTPS ^(certificate found in certs folder^)
) else (
    echo [*] Protocol: HTTP  ^(run make_cert.bat to enable HTTPS^)
)

if "%~1"=="--silent" goto RUN_SILENT
if "%~1"=="--log-date" goto RUN_LOGDATE
if "%~1"=="3" goto RUN_SILENT
if "%~1"=="2" goto RUN_LOGDATE
if "%~1"=="1" goto RUN_STANDARD

echo.
echo Select Logging Mode
echo  [1] Standard Mode (Console real-time access ^& query logs)
echo  [2] Daily Log Mode (Console + logs/server_YYYYMMDD.log automatic daily split)
echo  [3] Silent Mode (Background file logging only, no console logs)
echo.
set "CHOICE=1"
set /p CHOICE="Enter your choice (1/2/3) [Default: 1]: "

if "%CHOICE%"=="3" goto RUN_SILENT
if "%CHOICE%"=="2" goto RUN_LOGDATE
goto RUN_STANDARD

:RUN_STANDARD
echo [*] Starting server in standard console mode... (login required: default admin / 1234)
%PY_CMD% "%TARGET_PY%"
goto END

:RUN_LOGDATE
echo [*] Starting server with date-based logging (creates 'logs/' folder)...
%PY_CMD% "%TARGET_PY%" --log-date
goto END

:RUN_SILENT
echo [*] Starting server in silent mode...
echo [*] Execution logs are saved to date-based files in the 'logs/' folder and will not appear in the console.
echo [*] Press Ctrl+C in this window to stop the server.
%PY_CMD% "%TARGET_PY%" --log-date --silent
goto END

:END
endlocal
pause
