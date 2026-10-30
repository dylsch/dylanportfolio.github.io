@echo off
rem Double-click to start Boozy Bingo on Windows. Close this window to stop it.
cd /d "%~dp0"
set PY=
where py >nul 2>nul && set PY=py
if not defined PY ( python --version >nul 2>nul && set PY=python )
if not defined PY (
  echo Python not found, opening the file directly. Spotify login will not work this way.
  start "" index.html
  exit /b
)
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8000/"
echo Boozy Bingo is running at http://127.0.0.1:8000/
echo Keep this window open while you play. Close it to stop.
%PY% -m http.server 8000 --bind 127.0.0.1
