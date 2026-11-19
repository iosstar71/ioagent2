@echo off
rem ============================================================================
rem [IOSTAR-PM shared] Automated tests (API + browser E2E)
rem ============================================================================
chcp 65001 > nul
cd /d "%~dp0"
set PY_CMD=python
where python >nul 2>nul || set PY_CMD=py -3
if exist "%~dp0python\python.exe" set PY_CMD="%~dp0python\python.exe"
echo [0/2] Shared files check (Standard / Neo editions)
%PY_CMD% tools\check_shared_files.py
if errorlevel 1 set FAILED=1
echo.
echo [1/2] DB server API tests
%PY_CMD% tools\tests\test_server_api.py
if errorlevel 1 set FAILED=1
echo.
echo [2/2] Browser E2E tests (requires Node.js + Playwright)
where node >nul 2>nul
if errorlevel 1 (
  echo [SKIP] Node.js is not installed - E2E tests skipped. See tools\tests\README.md
) else (
  node tools\tests\e2e\run_e2e.js
  if errorlevel 1 set FAILED=1
)
echo.
if defined FAILED (echo [RESULT] Some tests FAILED.) else (echo [RESULT] All tests passed.)
pause
