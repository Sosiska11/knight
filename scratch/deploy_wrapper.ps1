$logFile = "C:\Users\alexs\AppData\Local\Happ\logs\wrapper_deploy.log"
"Starting wrapper deployment..." | Out-File $logFile

try {
    # 1. Stop HappService
    "Stopping HappService..." | Out-File $logFile -Append
    Stop-Service -Name HappService -Force -ErrorAction Stop
    "HappService stopped successfully." | Out-File $logFile -Append

    # 2. Backup original xray.exe
    $xrayPath = "C:\Program Files\FlyFrogLLC\Happ\core\xray.exe"
    $xrayBackup = "C:\Program Files\FlyFrogLLC\Happ\core\xray_original.exe"
    if (Test-Path $xrayPath) {
        "Backing up xray.exe to xray_original.exe..." | Out-File $logFile -Append
        Rename-Item -Path $xrayPath -NewName "xray_original.exe" -ErrorAction Stop
        "Backup completed." | Out-File $logFile -Append
    } else {
        throw "Could not find xray.exe at $xrayPath"
    }

    # 3. Copy wrapper
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $wrapperSource = Join-Path $scriptDir "xray_wrapper.exe"
    "Copying wrapper from $wrapperSource to $xrayPath..." | Out-File $logFile -Append
    Copy-Item -Path $wrapperSource -Destination $xrayPath -ErrorAction Stop
    "Wrapper copied successfully." | Out-File $logFile -Append

    # 4. Start HappService
    "Starting HappService..." | Out-File $logFile -Append
    Start-Service -Name HappService -ErrorAction Stop
    "HappService started successfully." | Out-File $logFile -Append
    
    "DEPLOYMENT SUCCESSFUL!" | Out-File $logFile -Append
} catch {
    "ERROR: $_" | Out-File $logFile -Append
    # Try starting the service back if it was stopped
    try { Start-Service -Name HappService -ErrorAction SilentlyContinue } catch {}
}
https://knight1.space:3000/sub/0803d6f0-d419-4368-a8b2-b9bdb287784f?test=clea