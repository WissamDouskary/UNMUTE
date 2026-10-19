param(
    [string]$ComposeFile = "docker-compose.yml",
    [string]$ProjectName = "unmute",
    [string]$Service = "db",
    [string]$Database = "",
    [string]$DbUser = "",
    [string]$OutFile = ""
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (-not $Database) {
    $Database = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "unmute" }
}
if (-not $DbUser) {
    $DbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "unmute" }
}
foreach ($name in @($Database, $DbUser, $Service, $ProjectName)) {
    if ($name -notmatch '^[A-Za-z0-9_-]+$') {
        Write-Host "Refusing a name that is not letters, numbers, '_' or '-': $name"
        exit 1
    }
}
if (-not (Test-Path $ComposeFile)) {
    Write-Host "Compose file not found: $ComposeFile"
    exit 1
}
if (-not $OutFile) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutFile = Join-Path $root "backups\unmute-$stamp.dump"
}
$outDir = Split-Path -Parent $OutFile
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

$remote = "/tmp/unmute-backup.dump"
$compose = @("compose", "-f", $ComposeFile, "-p", $ProjectName)
Write-Host "Backing up $Database from service $Service to $OutFile"
docker @compose exec -T $Service pg_dump -U $DbUser -d $Database -Fc -f $remote
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker @compose cp "${Service}:${remote}" $OutFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker @compose exec -T $Service rm -f $remote
Write-Host "Backup written."
