@echo off
title EDGAR Diagnostics
echo ============================================================
echo  EDGAR TERMINAL - DIAGNOSTIC REPORT
echo ============================================================
echo.

echo [1] Python check:
python --version
if errorlevel 1 echo   FAIL: python not found in PATH
echo.

echo [2] Pip check:
pip --version
if errorlevel 1 echo   FAIL: pip not found in PATH
echo.

echo [3] Node.js check:
node --version
if errorlevel 1 echo   FAIL: node not found in PATH
echo.

echo [4] npm check:
npm --version
if errorlevel 1 echo   FAIL: npm not found in PATH
echo.

echo [5] Backend folder:
if exist "%~dp0backend\main.py" (echo   OK: main.py found) else (echo   FAIL: main.py NOT found at %~dp0backend\)
echo.

echo [6] Frontend folder:
if exist "%~dp0frontend\package.json" (echo   OK: package.json found) else (echo   FAIL: package.json NOT found)
echo.

echo [7] node_modules:
if exist "%~dp0frontend\node_modules" (echo   OK: node_modules exists) else (echo   MISSING: need to run npm install)
echo.

echo [8] uvicorn check:
python -m uvicorn --version
if errorlevel 1 echo   FAIL: uvicorn not installed (run: pip install uvicorn)
echo.

echo [9] fastapi check:
python -c "import fastapi; print('  OK: fastapi', fastapi.__version__)"
if errorlevel 1 echo   FAIL: fastapi not installed
echo.

echo [10] yfinance check:
python -c "import yfinance; print('  OK: yfinance', yfinance.__version__)"
if errorlevel 1 echo   FAIL: yfinance not installed
echo.

echo [11] This script location:
echo   %~dp0
echo.

echo ============================================================
echo  Copy and paste the output above and share it.
echo ============================================================
pause
