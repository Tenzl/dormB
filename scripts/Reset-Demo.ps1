[CmdletBinding()]
param(
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspace 'backend'
$envPath = Join-Path $backendPath '.env'

if ($Offline) {
    Push-Location -LiteralPath $backendPath
    try {
        npm run seed:reset
        if ($LASTEXITCODE -ne 0) { throw 'Offline seed reset failed.' }
    } finally {
        Pop-Location
    }
    Write-Host 'Seeded demo state restored offline.'
    exit 0
}

$port = '8000'
if (Test-Path -LiteralPath $envPath) {
    $portLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*PORT=' } | Select-Object -Last 1
    if ($portLine) { $port = ($portLine -replace '^\s*PORT=', '').Trim().Trim('"').Trim("'") }
}

$apiRoot = "http://localhost:$port/api/v1"
$signInBody = @{ email = 'merchant@demo.local'; password = 'demo123' } | ConvertTo-Json

try {
    $login = Invoke-RestMethod -Uri "$apiRoot/auth/login" -Method Post -ContentType 'application/json' -Body $signInBody -Headers @{ 'X-Auth-Transport' = 'bearer' }
    $token = $login.data.token
    if (-not $token) { throw 'Login response did not contain data.token.' }
    Invoke-RestMethod -Uri "$apiRoot/demo/reset" -Method Post -ContentType 'application/json' -Body '{}' -Headers @{ Authorization = "Bearer $token"; 'Idempotency-Key' = "demo-reset-$([Guid]::NewGuid())" } | Out-Null
} catch {
    throw "Online reset failed. Ensure the API is running in DEMO_MODE, or stop it and run .\scripts\Reset-Demo.ps1 -Offline. $($_.Exception.Message)"
}

Write-Host 'Seeded demo state restored through the API.'
