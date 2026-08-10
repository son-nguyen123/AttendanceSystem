$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AssetsDir = Join-Path $Root "assets"
$SourceIconPath = Join-Path $AssetsDir "attendance.ico"
$IconCacheDir = Join-Path $env:LOCALAPPDATA "AttendanceSystem"
$IconPath = Join-Path $IconCacheDir "attendance.ico"
$ShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Attendance System.lnk"
$StartAppScript = Join-Path $Root "scripts\start-app.ps1"
$LauncherSourcePath = Join-Path $Root "scripts\start-hidden.vbs"
$LauncherPath = Join-Path $IconCacheDir "start-hidden.vbs"

New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $IconCacheDir | Out-Null

if (-not (Test-Path $SourceIconPath)) {
    Add-Type -AssemblyName System.Drawing
    $bitmap = New-Object System.Drawing.Bitmap 64, 64
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(37, 99, 235))

    $font = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF 0, 0, 64, 64
    $graphics.DrawString("AS", $font, $brush, $rect, $format)

    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [System.IO.File]::Create($SourceIconPath)
    $icon.Save($stream)
    $stream.Close()

    $graphics.Dispose()
    $font.Dispose()
    $brush.Dispose()
    $format.Dispose()
    $bitmap.Dispose()
}

Copy-Item -LiteralPath $SourceIconPath -Destination $IconPath -Force
Copy-Item -LiteralPath $LauncherSourcePath -Destination $LauncherPath -Force

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$launchCommand = "& '" + $StartAppScript.Replace("'", "''") + "'"
$encodedLaunchCommand = [Convert]::ToBase64String(
    [Text.Encoding]::Unicode.GetBytes($launchCommand)
)
$shortcut.Arguments = "`"$LauncherPath`" $encodedLaunchCommand"
$shortcut.WorkingDirectory = $env:SystemRoot
$shortcut.IconLocation = $IconPath
$shortcut.Description = "Open Attendance System"
$shortcut.Save()

Write-Host "Da tao shortcut: $ShortcutPath"
