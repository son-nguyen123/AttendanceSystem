$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StorageDir = Join-Path $Root "backend\storage"
$ConfigPath = Join-Path $StorageDir "cloud_config.json"

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

$useSupabase = $false
$supabaseUrl = ""
$serviceRoleKey = ""

$config = [ordered]@{
    enabled = $useSupabase
    supabase_url = $supabaseUrl
    service_role_key = $serviceRoleKey
    sync_on_save = $useSupabase
    drive_backup_enabled = $true
    drive_backup_dir = $resolvedDriveBackupDir
    backup_on_history_change = $true
}

New-Item -ItemType Directory -Force -Path $StorageDir | Out-Null
$json = $config | ConvertTo-Json -Depth 4
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ConfigPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "Da luu cau hinh: $ConfigPath" -ForegroundColor Green
Write-Host "Google Drive backup: BAT"
Write-Host "Thu muc: $resolvedDriveBackupDir"
Write-Host "Supabase: TAT - app chi luu local + Google Drive"
Write-Host "Neu can dung Supabase sau nay, co the bat lai trong phan cai dat nang cao cua app."
Write-Host ""
Write-Host "Tiep theo chay start.bat, vao tab Sao luu du lieu va bam Kiem tra ket noi."
