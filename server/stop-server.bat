@echo off
rem Stops the O'Roots server started by the auto-start task.
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
echo Server stopped. It starts again with Windows, or run restart-server.bat
pause
