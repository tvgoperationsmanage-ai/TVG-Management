@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3 and try again.
  pause
  exit /b 1
)
echo Starting TVG Management at http://localhost:5500
start "TVG Management" http://localhost:5500/
python -m http.server 5500
