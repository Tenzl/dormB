[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $workspace 'backend'
$frontendPath = Join-Path $workspace 'frontend'
$solverPath = Join-Path $workspace 'solver-worker'
$backendEnvPath = Join-Path $backendPath '.env'
$venvPath = Join-Path $workspace '.venv'
$requirementsPath = Join-Path $solverPath 'requirements.txt'
$statePath = Join-Path $workspace '.demo-processes.json'
$logPath = Join-Path $workspace '.demo-logs'
$defaultDatabaseUrl = 'postgresql://dormitory:dormitory@127.0.0.1:5432/dormitory'

function Import-DemoEnvironment([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Warning 'backend/.env was not found; backend defaults and deterministic AI fallback will be used.'
        return
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            throw "Invalid .env line: $line"
        }
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

function Get-DatabaseEndpoint([string]$DatabaseUrl) {
    $uri = [Uri]$DatabaseUrl
    return [pscustomobject]@{
        Host = if ($uri.Host) { $uri.Host } else { '127.0.0.1' }
        Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    }
}

function Wait-ForPostgres([string]$DatabaseUrl) {
    $endpoint = Get-DatabaseEndpoint $DatabaseUrl
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(20)
    $reachable = $false
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $async = $client.BeginConnect($endpoint.Host, $endpoint.Port, $null, $null)
            $ok = $async.AsyncWaitHandle.WaitOne(1000, $false)
            if ($ok -and $client.Connected) {
                $client.Close()
                $reachable = $true
                break
            }
            $client.Close()
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }
    if (-not $reachable) {
        throw @"
PostgreSQL is not reachable at $($endpoint.Host):$($endpoint.Port).
Install PostgreSQL locally, start the Windows service, then run:
  .\scripts\Setup-Postgres.ps1
"@
    }

    $psql = $null
    $fromPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($fromPath) {
        $psql = $fromPath.Source
    } else {
        foreach ($candidate in @(
            'C:\Program Files\PostgreSQL\18\bin\psql.exe',
            'C:\Program Files\PostgreSQL\17\bin\psql.exe',
            'C:\Program Files\PostgreSQL\16\bin\psql.exe'
        )) {
            if (Test-Path -LiteralPath $candidate) { $psql = $candidate; break }
        }
    }
    if (-not $psql) { return }

    $uri = [Uri]$DatabaseUrl
    $userInfo = $uri.UserInfo.Split(':', 2)
    $dbUser = if ($userInfo.Count -ge 1 -and $userInfo[0]) { [Uri]::UnescapeDataString($userInfo[0]) } else { 'dormitory' }
    $dbPassword = if ($userInfo.Count -ge 2) { [Uri]::UnescapeDataString($userInfo[1]) } else { 'dormitory' }
    $dbName = $uri.AbsolutePath.Trim('/')
    if (-not $dbName) { $dbName = 'dormitory' }

    $previousPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $dbPassword
    try {
        & $psql -U $dbUser -h $endpoint.Host -p $endpoint.Port -d $dbName -v ON_ERROR_STOP=1 -c 'SELECT 1;' 1>$null 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw @"
PostgreSQL accepted TCP connections, but login failed for user '$dbUser' on database '$dbName'.
Create the local role and databases once:
  .\scripts\Setup-Postgres.ps1
"@
        }
    } finally {
        if ($null -eq $previousPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:PGPASSWORD = $previousPassword
        }
    }
}

function Wait-ForHttp([string]$Uri, [string]$Name, [System.Diagnostics.Process]$Process) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(40)
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        if ($Process.HasExited) {
            throw "$Name exited during startup. Inspect $logPath."
        }
        try {
            $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 2 -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "$Name did not become ready at $Uri. Inspect $logPath."
}

Import-DemoEnvironment $backendEnvPath

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found. Install Node.js 22 and reopen PowerShell.'
}

function Invoke-NpmInstall([string]$PackagePath, [string]$Label) {
    if (-not (Test-Path -LiteralPath (Join-Path $PackagePath 'package.json'))) {
        throw "$Label package.json was not found at $PackagePath."
    }
    Push-Location -LiteralPath $PackagePath
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "$Label npm install failed." }
    } finally {
        Pop-Location
    }
}

if ($Install) {
    Invoke-NpmInstall $backendPath 'Backend'
    Invoke-NpmInstall $frontendPath 'Frontend'

    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw 'python was not found. Install Python 3.10+ and reopen PowerShell.'
    }
    if (-not (Test-Path -LiteralPath $venvPath)) {
        python -m venv $venvPath
        if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }
    }
    if (Test-Path -LiteralPath $requirementsPath) {
        & (Join-Path $venvPath 'Scripts\python.exe') -m pip install -r $requirementsPath
        if ($LASTEXITCODE -ne 0) { throw 'OR-Tools worker dependency installation failed.' }
    } else {
        Write-Warning 'Solver requirements file is not present yet; skipping Python package installation.'
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $backendPath 'node_modules'))) {
    throw 'Backend dependencies are missing. Run .\scripts\Start-Demo.ps1 -Install.'
}
if (-not (Test-Path -LiteralPath (Join-Path $frontendPath 'node_modules'))) {
    throw 'Frontend dependencies are missing. Run .\scripts\Start-Demo.ps1 -Install.'
}

$venvScripts = Join-Path $venvPath 'Scripts'
if (Test-Path -LiteralPath $venvScripts) {
    $env:PATH = "$venvScripts;$env:PATH"
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'python was not found. Create .venv with -Install or install Python 3.10+.'
}

if (Test-Path -LiteralPath $statePath) {
    throw 'A demo process file already exists. Run .\scripts\Stop-Demo.ps1 before starting another instance.'
}

$databaseUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } else { $defaultDatabaseUrl }
Wait-ForPostgres $databaseUrl

New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$nodeCommand = (Get-Command node).Source
$tsxCli = Join-Path $backendPath 'node_modules\tsx\dist\cli.mjs'
$viteCli = Join-Path $frontendPath 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $tsxCli)) { throw 'Backend tsx executable is missing. Run with -Install.' }
if (-not (Test-Path -LiteralPath $viteCli)) { throw 'Frontend Vite executable is missing. Run with -Install.' }

$pythonCommand = (& python -c 'import sys; print(sys.executable)').Trim()
if (-not $pythonCommand -or -not (Test-Path -LiteralPath $pythonCommand)) { throw 'Could not resolve the Python executable.' }
$solverBase = if ($env:SOLVER_WORKER_URL) { $env:SOLVER_WORKER_URL.TrimEnd('/') } else { 'http://127.0.0.1:8010' }
$solverUri = [Uri]$solverBase
$solverProcess = Start-Process -FilePath $pythonCommand -ArgumentList @('-m', 'uvicorn', 'app:app', '--host', $solverUri.Host, '--port', $solverUri.Port.ToString()) -WorkingDirectory $solverPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath "solver-$timestamp.out.log") -RedirectStandardError (Join-Path $logPath "solver-$timestamp.err.log") -PassThru
$apiProcess = Start-Process -FilePath $nodeCommand -ArgumentList @($tsxCli, 'src/server.ts') -WorkingDirectory $backendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath "api-$timestamp.out.log") -RedirectStandardError (Join-Path $logPath "api-$timestamp.err.log") -PassThru
$webProcess = Start-Process -FilePath $nodeCommand -ArgumentList @($viteCli, '--host', '0.0.0.0') -WorkingDirectory $frontendPath -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath "web-$timestamp.out.log") -RedirectStandardError (Join-Path $logPath "web-$timestamp.err.log") -PassThru

@{
    startedAt = [DateTimeOffset]::UtcNow.ToString('O')
    apiPid = $apiProcess.Id
    webPid = $webProcess.Id
    solverPid = $solverProcess.Id
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

try {
    $apiPort = if ($env:PORT) { $env:PORT } else { '8000' }
    Wait-ForHttp "$solverBase/health" 'Solver worker' $solverProcess
    Wait-ForHttp "http://127.0.0.1:$apiPort/health" 'API' $apiProcess
    Wait-ForHttp 'http://127.0.0.1:5173' 'Frontend' $webProcess
} catch {
    Write-Error $_
    Write-Host 'Stopping partially started services...'
    & (Join-Path $PSScriptRoot 'Stop-Demo.ps1')
    exit 1
}

Write-Host 'Courtyard is ready at http://localhost:5173'
Write-Host "API health: http://localhost:$apiPort/health"
Write-Host "Solver health: $solverBase/health"
Write-Host "Logs: $logPath"

if ($OpenBrowser) {
    Start-Process 'http://localhost:5173'
}
