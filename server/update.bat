@echo off
rem O'Roots: safe update from a full package zip (oroots-full-update-*.zip).
rem   Right-click -> Run as administrator.   Usage:  update.bat  [path\to\zip]
rem   No argument: it uses the newest oroots-full-update-*.zip in your Downloads folder.
rem   Your data, backups, node_modules and config.json are never touched. A copy of the old program is saved first.
net session >nul 2>&1
if errorlevel 1 (
  echo Right-click %~nx0 and choose: Run as administrator
  pause
  exit /b 1
)
cd /d "%~dp0.."
set "ZIP=%~1"
if "%ZIP%"=="" for /f "delims=" %%F in ('dir /b /o-d "%USERPROFILE%\Downloads\oroots-full-update-*.zip" 2^>nul') do if not defined ZIP set "ZIP=%USERPROFILE%\Downloads\%%F"
if "%ZIP%"=="" (
  echo No oroots-full-update-*.zip found in %USERPROFILE%\Downloads
  echo Put the zip there, or run:  update.bat "C:\path\to\oroots-full-update-XX.zip"
  pause
  exit /b 1
)
echo Using: %ZIP%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" -Zip "%ZIP%" -Root "%CD%"
echo.
pause
