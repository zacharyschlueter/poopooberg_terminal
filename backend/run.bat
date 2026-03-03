@echo off
title EDGAR Backend — FastAPI :8000
cd /d "%~dp0"

echo ============================================================
echo   EDGAR Backend — FastAPI on http://localhost:8000
echo   Press CTRL+C to stop.
echo ============================================================
echo.

python -m uvicorn main:app --reload --port 8000

echo.
echo [Backend stopped]
pause
