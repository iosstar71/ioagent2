@echo off
rem ============================================================================
rem [AX Project Management by YS - ver1.0.5] Standalone.html (single-file) builder
rem  - Rebuilds js/initial-data.js from data/initial_data.json
rem  - Inlines css/*.css and js/*.js into Standalone.html
rem ============================================================================
chcp 65001 > nul
cd /d "%~dp0"

set PY_CMD=
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set PY_CMD=python
) else (
    where py >nul 2>nul
    if %ERRORLEVEL% equ 0 set PY_CMD=py -3
)
if "%PY_CMD%"=="" (
    echo [ERROR] Python 3 is not installed or not in PATH.
    pause
    exit /b 1
)

%PY_CMD% tools\build_standalone.py
pause
