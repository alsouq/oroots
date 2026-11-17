@echo off
rem Makes the O'Roots server start automatically with Windows (even before anyone logs in).
net session >nul 2>&1
if errorlevel 1 (
  echo Right-click %~nx0 and choose: Run as administrator
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
pause
