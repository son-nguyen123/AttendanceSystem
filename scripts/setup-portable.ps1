$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $Root "runtime"
$DownloadDir = Join-Path $RuntimeDir "downloads"
$PythonDir = Join-Path $RuntimeDir "python"
$NodeDir = Join-Path $RuntimeDir "node"
$PythonVersion = "3.13.14"
$NodeVersion = "24.18.0"
$PythonZip = Join-Path $DownloadDir "python-$PythonVersion-embed-amd64.zip"
$NodeZip = Join-Path $DownloadDir "node-v$NodeVersion-win-x64.zip"
$GetPip = Join-Path $DownloadDir "get-pip.py"
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"

function Download-IfMissing {
    param(
        [string]$Url,
        [string]$Path
    )
    if (Test-Path $Path) {
        return
    }
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Path
}

function Expand-ZipFresh {
    param(
        [string]$ZipPath,
        [string]$Destination
    )
    if (Test-Path $Destination) {
        return
    }
    $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("attendance-runtime-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $temp -Force
    $children = @(Get-ChildItem -Path $temp)
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
        Get-ChildItem -Path $children[0].FullName -Force | Move-Item -Destination $Destination
    } else {
        Get-ChildItem -Path $temp -Force | Move-Item -Destination $Destination
    }
    Remove-Item -LiteralPath $temp -Recurse -Force
}

function Enable-PythonSitePackages {
    param([string]$PortablePythonDir)

    $pth = Get-ChildItem -Path $PortablePythonDir -Filter "python*._pth" | Select-Object -First 1
    if (-not $pth) {
        return
    }

    $content = Get-Content $pth.FullName
    $hasImportSite = $false
    $next = foreach ($line in $content) {
        if ($line.Trim() -eq "import site" -or $line.Trim() -eq "#import site") {
            $hasImportSite = $true
            "import site"
        } else {
            $line
        }
    }
    if (-not $hasImportSite) {
        $next += "import site"
    }
    Set-Content -Path $pth.FullName -Value $next -Encoding ASCII
}

New-Item -ItemType Directory -Force -Path $RuntimeDir, $DownloadDir | Out-Null

Download-IfMissing -Url $PythonUrl -Path $PythonZip
Expand-ZipFresh -ZipPath $PythonZip -Destination $PythonDir
Enable-PythonSitePackages -PortablePythonDir $PythonDir

$PythonExe = Join-Path $PythonDir "python.exe"
if (-not (Test-Path $PythonExe)) {
    throw "Khong tim thay python.exe trong $PythonDir"
}

& $PythonExe -m pip --version *> $null
if ($LASTEXITCODE -ne 0) {
    Download-IfMissing -Url $GetPipUrl -Path $GetPip
    & $PythonExe $GetPip --no-warn-script-location
    if ($LASTEXITCODE -ne 0) {
        throw "Khong cai duoc pip cho Python portable."
    }
}

& $PythonExe -m pip install --upgrade pip --no-warn-script-location
if ($LASTEXITCODE -ne 0) {
    throw "Khong nang cap duoc pip."
}
& $PythonExe -m pip install --no-warn-script-location -r (Join-Path $Root "backend\requirements.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Khong cai duoc thu vien backend."
}

Download-IfMissing -Url $NodeUrl -Path $NodeZip
Expand-ZipFresh -ZipPath $NodeZip -Destination $NodeDir

$NpmCmd = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path $NpmCmd)) {
    throw "Khong tim thay npm.cmd trong $NodeDir"
}

$env:PATH = "$NodeDir;$env:PATH"
Push-Location (Join-Path $Root "frontend")
try {
    & $NpmCmd install
} finally {
    Pop-Location
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "create-desktop-shortcut.ps1")

Write-Host ""
Write-Host "Setup portable xong."
Write-Host "Ban co the bam start.bat hoac icon Attendance System ngoai Desktop."
