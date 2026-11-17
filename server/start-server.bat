@echo off
rem O'Roots local server. Double-click to run it in this window (keep the window open).
rem The auto-start task runs:  start-server.bat service   (output goes to server\data\server.log)
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist "server\data" mkdir "server\data"
rem (server.js prepares server\public from index.html by itself on every start)
:loop
if /i "%~1"=="service" goto svc
node server\server.js
goto again
:svc
if exist "server\data\server.log" for %%F in ("server\data\server.log") do if %%~zF GTR 5000000 move /y "server\data\server.log" "server\data\server-old.log" >nul
node server\server.js >> "server\data\server.log" 2>&1
:again
echo Server stopped. Restarting in 10 seconds - close this window to stop it.
ping -n 11 127.0.0.1 >nul
goto loop
