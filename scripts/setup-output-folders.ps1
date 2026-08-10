$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$StorageDir = Join-Path $Root "backend\storage"
$ConfigPath = Join-Path $StorageDir "cloud_config.json"
$DefaultDir = "C:\data xuất lương"
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

Write-Host ""
Write-Host "=== SETUP THU MUC XUAT FILE ATTENDANCE SYSTEM ===" -ForegroundColor Cyan
Write-Host "1. Luu trong C:\data xuat luong (mac dinh)"
Write-Host "2. Chon o dia hoac thu muc khac"
$choice = (Read-Host "Chon 1 hoac 2 [1]").Trim()

if ($choice -eq "2") {
    $selected = (Read-Host "Nhap o dia (vi du D) hoac duong dan day du").Trim()
    if (-not $selected) {
        throw "Chua nhap o dia hoac duong dan."
    }
    if ($selected -match '^[A-Za-z]:?$') {
        $driveLetter = $selected.Substring(0, 1).ToUpperInvariant()
        $ExportRoot = "${driveLetter}:\data xuất lương"
    } else {
        $ExportRoot = [Environment]::ExpandEnvironmentVariables($selected)
    }
} else {
    $ExportRoot = $DefaultDir
}

New-Item -ItemType Directory -Force -Path $ExportRoot | Out-Null
foreach ($factoryFolder in @("Xuong1", "Xuong2")) {
    foreach ($categoryFolder in $CategoryFolders) {
        New-Item -ItemType Directory -Force -Path (Join-Path $ExportRoot "$factoryFolder\$categoryFolder") | Out-Null
    }
}
$ResolvedExportRoot = (Resolve-Path -LiteralPath $ExportRoot).Path

New-Item -ItemType Directory -Force -Path $StorageDir | Out-Null
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
$config["local_export_dir"] = $ResolvedExportRoot
$json = $config | ConvertTo-Json -Depth 8
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($ConfigPath, $json, $utf8NoBom)

Write-Host ""
Write-Host "Da setup xong. Tat ca file xuat se co ban sao tai:" -ForegroundColor Green
Write-Host $ResolvedExportRoot -ForegroundColor Yellow
Start-Process explorer.exe -ArgumentList ('"' + $ResolvedExportRoot + '"')
Read-Host "Bam Enter de dong"
