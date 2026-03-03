@echo off
title EDGAR Backend — FastAPI :8000
cd /d "%~dp0"

echo ============================================================
echo   EDGAR Backend — FastAPI on http://localhost:8000
echo   Press CTRL+C to stop.
echo ============================================================
echo.

echo [*] Installing/verifying Python dependencies...
call pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] pip install failed. Make sure Python is installed and in your PATH.
    pause
    exit /b 1
)
echo.

python -m uvicorn main:app --reload --port 8000

echo.
echo [Backend stopped]
pause
