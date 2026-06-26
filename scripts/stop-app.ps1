$ErrorActionPreference = "Continue"

$Ports = @(8000, 5173)
foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Stopping port $port process $($process.ProcessName) ($($process.Id))"
            Stop-Process -Id $process.Id -Force
        }
    }
}

Write-Host "Attendance System da dung."
