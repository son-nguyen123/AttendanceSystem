param(
    [Parameter(Mandatory = $true)][string]$WorkbookPath,
    [Parameter(Mandatory = $true)][string]$JobsPath,
    [Parameter(Mandatory = $true)][string]$OutputDir
)

$ErrorActionPreference = "Stop"
$excel = $null
$workbook = $null

function Release-ComObject {
    param([object]$Value)
    if ($null -ne $Value -and [System.Runtime.InteropServices.Marshal]::IsComObject($Value)) {
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value)
    }
}

try {
    $resolvedWorkbook = (Resolve-Path -LiteralPath $WorkbookPath).Path
    $jobs = Get-Content -Raw -LiteralPath $JobsPath -Encoding UTF8 | ConvertFrom-Json
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $true
    $workbook = $excel.Workbooks.Open($resolvedWorkbook, 0, $true)

    foreach ($job in $jobs) {
        $worksheet = $null
        $range = $null
        $chartObject = $null
        try {
            $worksheet = $workbook.Worksheets.Item([string]$job.sheet)
            [void]$worksheet.Activate()
            $range = $worksheet.Range([string]$job.range)
            $outputPath = Join-Path $OutputDir ([string]$job.filename)
            $exported = $false

            for ($attempt = 1; $attempt -le 3 -and -not $exported; $attempt++) {
                [void]$range.CopyPicture(1, 2)
                Start-Sleep -Milliseconds (120 * $attempt)
                $chartObject = $worksheet.ChartObjects().Add(0, 0, [Math]::Max(1, $range.Width), [Math]::Max(1, $range.Height))
                [void]$chartObject.Chart.Paste()
                Start-Sleep -Milliseconds (100 * $attempt)
                [void]$chartObject.Chart.Export($outputPath, "PNG")
                $exported = (Test-Path -LiteralPath $outputPath) -and ((Get-Item -LiteralPath $outputPath).Length -gt 0)
                $chartObject.Delete()
                Release-ComObject $chartObject
                $chartObject = $null
            }

            if (-not $exported -or -not (Test-Path -LiteralPath $outputPath)) {
                throw "Excel khong xuat duoc anh cho vung $($job.range)"
            }
        } finally {
            if ($chartObject) {
                try { $chartObject.Delete() } catch {}
            }
            Release-ComObject $chartObject
            Release-ComObject $range
            Release-ComObject $worksheet
        }
    }
} finally {
    if ($workbook) {
        try { $workbook.Close($false) } catch {}
    }
    if ($excel) {
        try { $excel.Quit() } catch {}
    }
    Release-ComObject $workbook
    Release-ComObject $excel
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
