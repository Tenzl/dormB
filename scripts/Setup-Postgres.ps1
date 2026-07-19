[CmdletBinding()]
param(
    [string]$AdminUser = 'postgres',
    [string]$AdminPassword,
    [string]$HostAddress = '127.0.0.1',
    [int]$Port = 5432,
    [string]$PsqlPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspace = Split-Path -Parent $PSScriptRoot
$sqlPath = Join-Path $workspace 'infra\postgres\setup-local.sql'

if (-not (Test-Path -LiteralPath $sqlPath)) {
    throw "Missing SQL bootstrap file: $sqlPath"
}

function Resolve-PsqlPath([string]$ExplicitPath) {
    if ($ExplicitPath) {
        if (-not (Test-Path -LiteralPath $ExplicitPath)) {
            throw "psql was not found at $ExplicitPath"
        }
        return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    $fromPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($fromPath) { return $fromPath.Source }

    $candidates = @(
        'C:\Program Files\PostgreSQL\18\bin\psql.exe',
        'C:\Program Files\PostgreSQL\17\bin\psql.exe',
        'C:\Program Files\PostgreSQL\16\bin\psql.exe'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }

    throw 'psql was not found. Install PostgreSQL locally or pass -PsqlPath.'
}

$psql = Resolve-PsqlPath $PsqlPath

if (-not $AdminPassword) {
    $secure = Read-Host -Prompt "Password for PostgreSQL user '$AdminUser'" -AsSecureString
    $AdminPassword = [System.Net.NetworkCredential]::new('', $secure).Password
}

$previousPassword = $env:PGPASSWORD
$env:PGPASSWORD = $AdminPassword

try {
    Write-Host "Checking PostgreSQL at ${HostAddress}:${Port}..."
    & $psql -U $AdminUser -h $HostAddress -p $Port -d postgres -v ON_ERROR_STOP=1 -c 'SELECT 1;' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not connect as $AdminUser. Confirm the service is running and the password is correct."
    }

    Write-Host 'Creating dormitory role and databases...'
    & $psql -U $AdminUser -h $HostAddress -p $Port -d postgres -v ON_ERROR_STOP=1 -f $sqlPath
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL bootstrap SQL failed.'
    }

    $env:PGPASSWORD = 'dormitory'
    & $psql -U dormitory -h $HostAddress -p $Port -d dormitory -v ON_ERROR_STOP=1 -c 'SELECT current_database(), current_user;' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Created databases, but login as dormitory/dormitory failed.'
    }

    Write-Host "PostgreSQL is ready at postgresql://dormitory:dormitory@${HostAddress}:${Port}/dormitory"
    Write-Host "Test database: postgresql://dormitory:dormitory@${HostAddress}:${Port}/dormitory_test"
} finally {
    if ($null -eq $previousPassword) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSWORD = $previousPassword
    }
}
