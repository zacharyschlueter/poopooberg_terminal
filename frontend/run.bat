@echo off
title EDGAR Frontend — Vite :5173
cd /d "%~dp0"

echo ============================================================
echo   EDGAR Frontend — Vite dev server on http://localhost:5173
echo   Press CTRL+C to stop.
echo ============================================================
echo.

:: Install node_modules if missing
if not exist "node_modules" (
    echo [!] node_modules not found. Running npm install...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERROR] npm install failed. Make sure Node.js is in your PATH.
        pause
        exit /b 1
    )
)

call npm run dev
echo.
echo [Frontend stopped]
pause
