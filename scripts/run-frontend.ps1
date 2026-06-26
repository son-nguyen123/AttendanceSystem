$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $Root "frontend"
$PortableNodeDir = Join-Path $Root "runtime\node"
$PortableNpm = Join-Path $PortableNodeDir "npm.cmd"

if (Test-Path $PortableNpm) {
    $env:PATH = "$PortableNodeDir;$env:PATH"
    $NpmCmd = $PortableNpm
} else {
    $NpmCmd = "npm.cmd"
}

Set-Location $FrontendDir
& $NpmCmd run dev -- --host 127.0.0.1 --port 5173
