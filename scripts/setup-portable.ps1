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
        [string]$Destination,
        [switch]$Force
    )
    if ((Test-Path $Destination) -and -not $Force) {
        return
    }
    if ((Test-Path $Destination) -and $Force) {
        $resolvedDestination = (Resolve-Path -LiteralPath $Destination).Path
        $resolvedRuntime = (Resolve-Path -LiteralPath $RuntimeDir).Path
        if (-not $resolvedDestination.StartsWith($resolvedRuntime, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Tu choi xoa runtime ngoai thu muc ung dung: $resolvedDestination"
        }
        Remove-Item -LiteralPath $Destination -Recurse -Force
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

function Test-PythonRuntime {
    param([string]$PortablePythonDir)

    $pythonExe = Join-Path $PortablePythonDir "python.exe"
    if (-not (Test-Path $pythonExe)) {
        return $false
    }

    & $pythonExe --version *> $null
    return $LASTEXITCODE -eq 0
}

function Test-NodeRuntime {
    param([string]$PortableNodeDir)

    $nodeExe = Join-Path $PortableNodeDir "node.exe"
    $npmCmd = Join-Path $PortableNodeDir "npm.cmd"
    if (-not (Test-Path $nodeExe) -or -not (Test-Path $npmCmd)) {
        return $false
    }

    & $nodeExe --version *> $null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    & $npmCmd --version *> $null
    return $LASTEXITCODE -eq 0
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

function Test-BackendRequirementsInstalled {
    param([string]$PythonExe)

    & $PythonExe -c "import fastapi, uvicorn, openpyxl, pandas, PIL, pydantic, xlrd, multipart, numpy" *> $null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    & $PythonExe -m pip check *> $null
    return $LASTEXITCODE -eq 0
}

function Test-FrontendDependenciesInstalled {
    param(
        [string]$NpmCmd,
        [string]$FrontendDir
    )

    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        return $false
    }

    Push-Location $FrontendDir
    try {
        & $NpmCmd ls --depth=0 --silent *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        Pop-Location
    }
}

New-Item -ItemType Directory -Force -Path $RuntimeDir, $DownloadDir | Out-Null

Download-IfMissing -Url $PythonUrl -Path $PythonZip
if (Test-PythonRuntime -PortablePythonDir $PythonDir) {
    Write-Host "Python runtime already available."
} else {
    Write-Host "Installing Python runtime..."
    Expand-ZipFresh -ZipPath $PythonZip -Destination $PythonDir -Force
}
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

if (Test-BackendRequirementsInstalled -PythonExe $PythonExe) {
    Write-Host "Backend libraries already installed."
} else {
    & $PythonExe -m pip install --upgrade pip --no-warn-script-location
    if ($LASTEXITCODE -ne 0) {
        throw "Khong nang cap duoc pip."
    }
    & $PythonExe -m pip install --no-warn-script-location -r (Join-Path $Root "backend\requirements.txt")
    if ($LASTEXITCODE -ne 0) {
        throw "Khong cai duoc thu vien backend."
    }
}

Download-IfMissing -Url $NodeUrl -Path $NodeZip
if (Test-NodeRuntime -PortableNodeDir $NodeDir) {
    Write-Host "Node runtime already available."
} else {
    Write-Host "Installing Node runtime..."
    Expand-ZipFresh -ZipPath $NodeZip -Destination $NodeDir -Force
}

$NpmCmd = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path $NpmCmd)) {
    throw "Khong tim thay npm.cmd trong $NodeDir"
}

$env:PATH = "$NodeDir;$env:PATH"
$FrontendDir = Join-Path $Root "frontend"
if (Test-FrontendDependenciesInstalled -NpmCmd $NpmCmd -FrontendDir $FrontendDir) {
    Write-Host "Frontend packages already installed."
} else {
    Push-Location $FrontendDir
    try {
        if (Test-Path (Join-Path $FrontendDir "package-lock.json")) {
            & $NpmCmd ci
        } else {
            & $NpmCmd install
        }
        if ($LASTEXITCODE -ne 0) {
            throw "Khong cai duoc frontend packages."
        }
    } finally {
        Pop-Location
    }
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "create-desktop-shortcut.ps1")

Write-Host ""
Write-Host "Setup portable xong."
Write-Host "Tiep theo hay chay setup-storage.bat de dang nhap Google Drive va chon co dung Supabase hay khong."
Write-Host "Sau do bam start.bat hoac icon Attendance System ngoai Desktop."
