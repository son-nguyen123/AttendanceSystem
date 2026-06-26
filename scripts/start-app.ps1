$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$RuntimeDir = Join-Path $Root "runtime"
$LogDir = Join-Path $Root "logs"
$PortablePythonExe = Join-Path $RuntimeDir "python\python.exe"
$VenvPythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"
$PythonExe = if (Test-Path $PortablePythonExe) { $PortablePythonExe } else { $VenvPythonExe }
$FrontendOut = Join-Path $LogDir "frontend.out.log"
$FrontendErr = Join-Path $LogDir "frontend.err.log"
$BackendOut = Join-Path $LogDir "backend.out.log"
$BackendErr = Join-Path $LogDir "backend.err.log"
$AppUrl = "http://127.0.0.1:5173/"
$ApiUrl = "http://127.0.0.1:8000/docs"

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-HttpOk {
    param(
        [string]$Url,
        [int]$Seconds = 30
    )

    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not (Test-Path $PythonExe)) {
    throw "Khong tim thay Python. Hay chay setup.bat truoc, hoac kiem tra backend\.venv."
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    throw "Khong tim thay frontend\node_modules. Hay chay setup.bat truoc."
}

if (-not (Test-PortListening 8000)) {
    Start-Process `
        -FilePath $PythonExe `
        -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000") `
        -WorkingDirectory $BackendDir `
        -RedirectStandardOutput $BackendOut `
        -RedirectStandardError $BackendErr `
        -WindowStyle Hidden
}

if (-not (Test-PortListening 5173)) {
    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "run-frontend.ps1")) `
        -WorkingDirectory $Root `
        -RedirectStandardOutput $FrontendOut `
        -RedirectStandardError $FrontendErr `
        -WindowStyle Hidden
}

$backendReady = Wait-HttpOk -Url $ApiUrl -Seconds 30
$frontendReady = Wait-HttpOk -Url $AppUrl -Seconds 30

if ($backendReady -and $frontendReady) {
    Start-Process $AppUrl
    Write-Host "Attendance System da san sang: $AppUrl"
} else {
    Write-Host "Server chua san sang hoan toan."
    Write-Host "Backend ready: $backendReady"
    Write-Host "Frontend ready: $frontendReady"
    Write-Host "Xem log trong: $LogDir"
    Start-Process $AppUrl
}
