[CmdletBinding()]
param(
    [string]$NewPassword = 'postgres',
    [string]$AdminUser = 'postgres',
    [int]$Port = 5432,
    [string]$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe',
    [string]$PgHbaPath = 'C:\Program Files\PostgreSQL\18\data\pg_hba.conf',
    [string]$ServiceName = 'postgresql-x64-18',
    [switch]$AlsoBootstrapAppDb
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$isAdmin = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host 'Requesting Administrator elevation...'
    $argList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`"",
        '-NewPassword', "`"$NewPassword`"",
        '-AdminUser', "`"$AdminUser`"",
        '-Port', "$Port",
        '-PsqlPath', "`"$PsqlPath`"",
        '-PgHbaPath', "`"$PgHbaPath`"",
        '-ServiceName', "`"$ServiceName`""
    )
    if ($AlsoBootstrapAppDb) { $argList += '-AlsoBootstrapAppDb' }
    $proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -Wait -PassThru
    exit $proc.ExitCode
}

if (-not (Test-Path -LiteralPath $PgHbaPath)) { throw "pg_hba.conf not found: $PgHbaPath" }
if (-not (Test-Path -LiteralPath $PsqlPath)) { throw "psql not found: $PsqlPath" }

$backupPath = "$PgHbaPath.reset-backup"
Copy-Item -LiteralPath $PgHbaPath -Destination $backupPath -Force

$original = Get-Content -LiteralPath $PgHbaPath -Raw
$trusted = [regex]::Replace(
    $original,
    '(?m)^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)scram-sha-256\s*$',
    '${1}trust'
)
$trusted = [regex]::Replace(
    $trusted,
    '(?m)^(host\s+all\s+all\s+::1/128\s+)scram-sha-256\s*$',
    '${1}trust'
)
$trusted = [regex]::Replace(
    $trusted,
    '(?m)^(local\s+all\s+all\s+)scram-sha-256\s*$',
    '${1}trust'
)

if ($trusted -eq $original) {
    throw 'Could not locate scram-sha-256 auth lines to switch to trust.'
}

Set-Content -LiteralPath $PgHbaPath -Value $trusted -Encoding ascii
Restart-Service -Name $ServiceName -Force
Start-Sleep -Seconds 2

try {
    Write-Host "Setting password for '$AdminUser'..."
    & $PsqlPath -U $AdminUser -h 127.0.0.1 -p $Port -d postgres -v ON_ERROR_STOP=1 -c "ALTER USER $AdminUser WITH PASSWORD '$NewPassword';"
    if ($LASTEXITCODE -ne 0) { throw 'ALTER USER failed while pg_hba was in trust mode.' }

    if ($AlsoBootstrapAppDb) {
        $workspace = Split-Path -Parent $PSScriptRoot
        $sqlPath = Join-Path $workspace 'infra\postgres\setup-local.sql'
        if (-not (Test-Path -LiteralPath $sqlPath)) { throw "Missing $sqlPath" }
        Write-Host 'Bootstrapping dormitory role and databases...'
        & $PsqlPath -U $AdminUser -h 127.0.0.1 -p $Port -d postgres -v ON_ERROR_STOP=1 -f $sqlPath
        if ($LASTEXITCODE -ne 0) { throw 'App database bootstrap failed.' }
    }
} finally {
    Copy-Item -LiteralPath $backupPath -Destination $PgHbaPath -Force
    Restart-Service -Name $ServiceName -Force
    Start-Sleep -Seconds 2
}

$env:PGPASSWORD = $NewPassword
& $PsqlPath -U $AdminUser -h 127.0.0.1 -p $Port -d postgres -v ON_ERROR_STOP=1 -c 'SELECT current_user;' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Password reset completed, but login verification failed.' }

Write-Host "PostgreSQL user '$AdminUser' password is now: $NewPassword"
if ($AlsoBootstrapAppDb) {
    Write-Host 'App databases ready: dormitory / dormitory_test (user dormitory / dormitory)'
}
Write-Host 'Next: .\scripts\Start-Demo.ps1'
