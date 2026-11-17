# O'Roots: start the local server automatically with Windows and restart it if it stops.
# Run through install-autostart.bat (as administrator). To remove:  schtasks /Delete /TN "ORoots Server" /F
$ErrorActionPreference = 'Stop'
$bat = Join-Path $PSScriptRoot 'start-server.bat'
$action = New-ScheduledTaskAction -Execute $bat -Argument 'service' -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'ORoots Server' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'ORoots Server'
Write-Host ''
Write-Host 'Done. The O''Roots server now starts automatically with Windows.'
Write-Host 'Test it on this PC: http://localhost:8080      Log file: server\data\server.log'
