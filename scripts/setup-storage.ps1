$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StorageDir = Join-Path $Root "backend\storage"
$ConfigPath = Join-Path $StorageDir "cloud_config.json"
$CategoryFolders = @(
    "01_Output1",
    "02_Output2_BangLuong",
    "03_AnhChamCong",
    "04_NganHang",
    "05_ChuyenKhung",
    "06_GanDuLieu",
    "07_TinhLai",
    "08_BanChot_LichSu"
)

function Ask-YesNo {
    param(
        [string]$Question,
        [bool]$Default = $true
    )

    $suffix = if ($Default) { "[Y/n]" } else { "[y/N]" }
    $answer = (Read-Host "$Question $suffix").Trim().ToLowerInvariant()
    if (-not $answer) {
        return $Default
    }
    return $answer -in @("y", "yes", "c", "co")
}

function Find-GoogleDriveExecutable {
    $roots = @(
        (Join-Path $env:ProgramFiles "Google\Drive File Stream"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Drive File Stream"),
        (Join-Path $env:LOCALAPPDATA "Google\DriveFS")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($searchRoot in $roots) {
        $exe = Get-ChildItem -LiteralPath $searchRoot -Filter "GoogleDriveFS.exe" -File -Recurse -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($exe) {
            return $exe.FullName
        }
    }
    return $null
}

function Find-GoogleDriveRoot {
    $names = @("My Drive", "Google Drive", "Drive cua toi", "Drive của tôi")
    $candidates = @()
    foreach ($drive in Get-PSDrive -PSProvider FileSystem) {
        foreach ($name in $names) {
            $candidate = Join-Path $drive.Root $name
            if (Test-Path -LiteralPath $candidate) {
                $candidates += $candidate
            }
        }
    }
    foreach ($name in $names) {
        $candidate = Join-Path $env:USERPROFILE $name
        if (Test-Path -LiteralPath $candidate) {
            $candidates += $candidate
        }
    }
    return $candidates | Select-Object -First 1
}

function Read-RequiredValue {
    param([string]$Prompt)
    while ($true) {
        $value = (Read-Host $Prompt).Trim()
        if ($value) {
            return $value
        }
        Write-Host "Gia tri nay khong duoc de trong." -ForegroundColor Yellow
    }
}

function SecureString-ToPlainText {
    param([Security.SecureString]$Value)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

Write-Host ""
Write-Host "=== Cau hinh luu tru Attendance System ===" -ForegroundColor Cyan
Write-Host "Google Drive la huong luu file chinh. Supabase se duoc de o trang thai TAT."
Write-Host ""

$driveExe = Find-GoogleDriveExecutable
if (-not $driveExe) {
    if (Ask-YesNo -Question "Chua tim thay Google Drive for desktop. Cai bang winget ngay bay gio?" -Default $true) {
        if (Get-Command winget.exe -ErrorAction SilentlyContinue) {
            & winget.exe install --id Google.GoogleDrive --exact --accept-package-agreements --accept-source-agreements
            if ($LASTEXITCODE -ne 0) {
                throw "Khong cai duoc Google Drive bang winget. Ma loi: $LASTEXITCODE"
            }
            $driveExe = Find-GoogleDriveExecutable
        } else {
            Write-Host "May nay khong co winget. Dang mo trang tai Google Drive chinh thuc..." -ForegroundColor Yellow
            Start-Process "https://www.google.com/drive/download/"
        }
    }
}

if ($driveExe) {
    Write-Host "Da tim thay Google Drive: $driveExe" -ForegroundColor Green
    Start-Process -FilePath $driveExe
}

Write-Host ""
Write-Host "Hay dang nhap Google Drive for desktop tren may nay." -ForegroundColor Yellow
Read-Host "Sau khi nhin thay o dia/thuc muc My Drive trong File Explorer, bam Enter de tiep tuc"

$detectedDriveRoot = Find-GoogleDriveRoot
$defaultBackupDir = if ($detectedDriveRoot) {
    Join-Path $detectedDriveRoot "AttendanceSystem_Backup"
} else {
    ""
}

if ($defaultBackupDir) {
    $driveBackupDir = (Read-Host "Thu muc backup Google Drive [$defaultBackupDir]").Trim()
    if (-not $driveBackupDir) {
        $driveBackupDir = $defaultBackupDir
    }
} else {
    $driveBackupDir = Read-RequiredValue -Prompt "Dan duong dan thu muc backup nam ben trong My Drive"
}

$driveBackupDir = [Environment]::ExpandEnvironmentVariables($driveBackupDir)
New-Item -ItemType Directory -Force -Path $driveBackupDir | Out-Null
$resolvedDriveBackupDir = (Resolve-Path -LiteralPath $driveBackupDir).Path

$config = @{}
if (Test-Path -LiteralPath $ConfigPath) {
    try {
        $existing = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
        foreach ($property in $existing.PSObject.Properties) {
            $config[$property.Name] = $property.Value
        }
    } catch {
        throw "File cau hinh hien tai khong doc duoc. Khong ghi de: $ConfigPath"
    }
}
if (-not $config.ContainsKey("enabled")) { $config["enabled"] = $false }
if (-not $config.ContainsKey("supabase_url")) { $config["supabase_url"] = "" }
if (-not $config.ContainsKey("service_role_key")) { $config["service_role_key"] = "" }
if (-not $config.ContainsKey("sync_on_save")) { $config["sync_on_save"] = $false }
$config["drive_backup_enabled"] = $true
$config["drive_backup_dir"] = $resolvedDriveBackupDir
$config["backup_on_history_change"] = $true

foreach ($factoryFolder in @("Xuong1", "Xuong2")) {
    foreach ($categoryFolder in $CategoryFolders) {
        New-Item -ItemType Directory -Force -Path (Join-Path $resolvedDriveBackupDir "$factoryFolder\$categoryFolder") | Out-Null
    }
}

New-Item -ItemType Directory -Force -Path $StorageDir | Out-Null
$json = $config | ConvertTo-Json -Depth 4
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ConfigPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "Da luu cau hinh: $ConfigPath" -ForegroundColor Green
Write-Host "Google Drive backup: BAT"
Write-Host "Thu muc: $resolvedDriveBackupDir"
Write-Host "Da tao cay: Xuong1/Xuong2 -> 01_Output1 ... 08_BanChot_LichSu" -ForegroundColor Green
Write-Host "Supabase: TAT - app chi luu local + Google Drive"
Write-Host "Neu can dung Supabase sau nay, co the bat lai trong phan cai dat nang cao cua app."
Write-Host ""
Write-Host "Tiep theo chay start.bat, vao tab Sao luu du lieu va bam Kiem tra ket noi."
