[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $workspace '.demo-processes.json'
$isWindowsPlatform = if (Get-Variable IsWindows -ErrorAction SilentlyContinue) { [bool]$IsWindows } else { $env:OS -eq 'Windows_NT' }

if (-not (Test-Path -LiteralPath $statePath)) {
    Write-Host 'No recorded demo processes were found.'
    exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$processIds = @($state.apiPid, $state.webPid, $state.solverPid) | Where-Object { $_ }

function Stop-DemoProcessTree([int]$ParentId) {
    if ($isWindowsPlatform) {
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue
        foreach ($child in $children) { Stop-DemoProcessTree ([int]$child.ProcessId) }
    }
    $process = Get-Process -Id $ParentId -ErrorAction SilentlyContinue
    if ($process) { Stop-Process -Id $ParentId -Force -ErrorAction SilentlyContinue }
}

foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-DemoProcessTree ([int]$processId)
        Write-Host "Stopped process $processId."
    }
}

Remove-Item -LiteralPath $statePath -Force
Write-Host 'Demo services stopped. Local PostgreSQL was left running as a system service.'
