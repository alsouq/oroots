@echo off
rem O'Roots: finds out why the server does not start (missing files, config.json mistakes, busy port...).
rem Double-click it. It prints a short English summary and opens the full Arabic report in Notepad.
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
node server\doctor.js
if exist "server\data\diagnose.txt" start "" notepad "server\data\diagnose.txt"
echo.
pause
