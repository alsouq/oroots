@echo off
rem Lets the ESP32 sensors on the farm Wi-Fi reach this PC (port 8787, private networks only).
rem If you changed "port" in the sensors section of config.json, change 8787 below too.
net session >/dev/null 2>&1
if errorlevel 1 (
  echo Right-click %~nx0 and choose: Run as administrator
  pause
  exit /b 1
)
netsh advfirewall firewall delete rule name="ORoots sensors" >/dev/null 2>nul
netsh advfirewall firewall add rule name="ORoots sensors" dir=in action=allow protocol=TCP localport=8787 profile=private
if errorlevel 1 (
  echo Could not add the firewall rule.
  pause
  exit /b 1
)
echo Done: sensors on the farm network can now reach this PC on port 8787.
echo Make sure Windows treats the farm Wi-Fi as a Private network:
echo Settings - Network ^& Internet - Wi-Fi (or Ethernet) - your network - Private network
pause
