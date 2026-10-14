@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>&1
if not errorlevel 1 (
  start "Tutor local server" cmd /k py -3 server.py
) else (
  where python >nul 2>&1
  if errorlevel 1 (
    echo Python 3 is required to start Tutor.
    echo Install Python from https://www.python.org/downloads/ and try again.
    pause
    exit /b 1
  )
  start "Tutor local server" cmd /k python server.py
)

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8321/index.html"
endlocal
