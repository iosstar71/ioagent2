@echo off
rem ============================================================================
rem [AX Project Management by YS - ver1.0.8] 자동 테스트 실행 (API + 브라우저 E2E)
rem ============================================================================
chcp 65001 > nul
cd /d "%~dp0"
set PY_CMD=python
where python >nul 2>nul || set PY_CMD=py -3
echo [1/2] DB 서버 API 테스트
%PY_CMD% tools\tests\test_server_api.py
if errorlevel 1 set FAILED=1
echo.
echo [2/2] 브라우저 E2E 테스트 (Node.js + Playwright 필요)
where node >nul 2>nul
if errorlevel 1 (
  echo [SKIP] Node.js 가 설치되어 있지 않아 E2E 테스트를 건너뜁니다. tools\tests\README.md 참고
) else (
  node tools\tests\e2e\run_e2e.js
  if errorlevel 1 set FAILED=1
)
echo.
if defined FAILED (echo [결과] 실패한 테스트가 있습니다.) else (echo [결과] 모든 테스트 통과)
pause
