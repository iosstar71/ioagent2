@echo off
rem ============================================================================
rem [AX Project Management by YS - ver1.0.6] Multi-User DB Server Launcher
rem ============================================================================
chcp 65001 > nul
cd /d "%~dp0"

echo ============================================================================
echo [AX Project Management by YS - ver1.0.6] Multi-User DB Web Server (Port: 8080)
echo Current Directory: %~dp0
echo ============================================================================

set TARGET_PY=wbs_db_server.py
if not exist "%TARGET_PY%" (
    if exist "server\wbs_db_server.py" set TARGET_PY=server\wbs_db_server.py
)
if not exist "%TARGET_PY%" (
    echo [ERROR] wbs_db_server.py file cannot be found.
    pause
    exit /b 1
)

set PY_CMD=
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PY_CMD=python
) else (
    where py >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set PY_CMD=py -3
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] Python 3 is either not installed or has not been added to your PATH.
    echo Please install Python and try running it again.
    pause
    exit /b 1
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
set CHOICE=1
set /p CHOICE="Enter your choice (1/2/3) [Default: 1]: "

if "%CHOICE%"=="3" goto RUN_SILENT
if "%CHOICE%"=="2" goto RUN_LOGDATE
goto RUN_STANDARD

:RUN_STANDARD
echo [*] Starting server in standard console mode... (login required: default admin / 1234)
%PY_CMD% "%TARGET_PY%" --port 8080
goto END

:RUN_LOGDATE
echo [*] Starting server with date-based logging (creates 'logs/' folder)...
%PY_CMD% "%TARGET_PY%" --port 8080 --log-date
goto END

:RUN_SILENT
echo [*] Starting server in silent mode...
echo [*] Execution logs are saved to date-based files in the 'logs/' folder and will not appear in the console.
echo [*] Press Ctrl+C in this window to stop the server.
%PY_CMD% "%TARGET_PY%" --port 8080 --log-date --silent
goto END

:END
pause
