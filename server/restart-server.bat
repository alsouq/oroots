@echo off
rem Restarts the O'Roots server (after an update).
net session >nul 2>&1
if errorlevel 1 (
  echo Right-click %~nx0 and choose: Run as administrator
  pause
  exit /b 1
)
cd /d "%~dp0"
schtasks /End /TN "ORoots Server" >nul 2>nul
if exist "data\server.pid" (
  for /f %%P in (data\server.pid) do taskkill /F /FI "PID eq %%P" /FI "IMAGENAME eq node.exe" >nul 2>nul
  del "data\server.pid" >nul 2>nul
)
schtasks /Run /TN "ORoots Server"
if errorlevel 1 echo The auto-start task is not installed yet - run install-autostart.bat first.
pause
