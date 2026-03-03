@echo off
start "" "%~dp0backend\run.bat"
start "" "%~dp0frontend\run.bat"
timeout /t 6 /nobreak >nul
start http://localhost:5173
