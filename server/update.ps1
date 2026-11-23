# O'Roots: safe update from a full package zip. Called by update.bat.
param([string]$Zip, [string]$Root)
$ErrorActionPreference = 'Stop'
function Say($m){ Write-Host $m }
try {
  if(-not (Test-Path -LiteralPath $Zip)){ throw "Zip not found: $Zip" }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
  $tmp = Join-Path $env:TEMP ("oroots-update-" + $stamp)
  if(Test-Path $tmp){ Remove-Item $tmp -Recurse -Force }
  Say "1/6 Unpacking..."
  Expand-Archive -LiteralPath $Zip -DestinationPath $tmp -Force
  foreach($need in @('index.html', 'server\server.js', 'server\doctor.js')){
    if(-not (Test-Path (Join-Path $tmp $need))){ throw "This zip is not a full O'Roots package (missing $need). Nothing was changed." }
  }
  Say "2/6 Stopping the server..."
  schtasks /End /TN "ORoots Server" 2>$null | Out-Null
  $pidf = Join-Path $Root 'server\data\server.pid'
  if(Test-Path $pidf){ try { $p = [int](Get-Content $pidf -ErrorAction SilentlyContinue | Select-Object -First 1); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}; Remove-Item $pidf -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  $bk = Join-Path (Split-Path $Root -Parent) ("oroots-code-backup-" + $stamp)
  Say "3/6 Saving a copy of the current program to $bk ..."
  robocopy $Root $bk /E /XD data backups node_modules public .git /XF *.log /NFL /NDL /NJH /NJS /NP | Out-Null
  if($LASTEXITCODE -ge 8){ throw "Backup copy failed (robocopy code $LASTEXITCODE). Nothing was changed." }
  Say "4/6 Copying the new files (data, backups, node_modules and config.json are kept)..."
  robocopy $tmp $Root /E /XD data backups node_modules .git /XF config.json /NFL /NDL /NJH /NJS /NP | Out-Null
  if($LASTEXITCODE -ge 8){ throw "Copy failed (robocopy code $LASTEXITCODE). Run diagnose.bat, and restore from $bk if needed." }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Say "5/6 Checking the installation..."
  Push-Location $Root
  node server\doctor.js
  $bad = $LASTEXITCODE
  Pop-Location
  if($bad -ne 0){ Say ""; Say "The check found a problem (see above / server\data\diagnose.txt). The server was NOT started. Fix it, then run restart-server.bat."; Start-Process notepad (Join-Path $Root 'server\data\diagnose.txt'); exit 2 }
  Say "6/6 Starting the server..."
  schtasks /Run /TN "ORoots Server" | Out-Null
  $port = 8080
  try { $c = Get-Content (Join-Path $Root 'server\config.json') -Raw | ConvertFrom-Json; if($c.port){ $port = [int]$c.port } } catch {}
  $ok = $false
  for($i = 0; $i -lt 30; $i++){
    Start-Sleep -Seconds 2
    try { $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 3; if($r.StatusCode -eq 200){ $ok = $true; break } } catch {}
  }
  if($ok){ Say ""; Say "DONE. The server is running on port $port. Press Ctrl+F5 in the browser." }
  else { Say ""; Say "The server did not answer within 60 seconds. Run diagnose.bat and send me server\data\diagnose.txt. (Old program copy: $bk)"; exit 3 }
} catch {
  Write-Host ""
  Write-Host ("UPDATE FAILED: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
