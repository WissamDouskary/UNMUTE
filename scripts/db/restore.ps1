param(
    [Parameter(Mandatory = $true)][string]$DumpFile,
    [Parameter(Mandatory = $true)][string]$Database,
    [string]$ComposeFile = "docker-compose.it.yml",
    [string]$ProjectName = "unmute-it",
    [string]$Service = "db-it",
    [string]$DbUser = "unmute_it",
    [string]$VerifySql = "",
    [switch]$Confirm
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

function Refuse([string]$Reason) {
    Write-Host $Reason
    exit 1
}

if (-not $Confirm) {
    Refuse "Restore was not confirmed. Re-run with -Confirm after you have read which database will be replaced."
}

$blocked = @("unmute", "postgres", "template0", "template1")
if ($env:POSTGRES_DB) { $blocked += $env:POSTGRES_DB }
if ($blocked -contains $Database) {
    Refuse "Refusing to restore into '$Database'. That name is the application database or a PostgreSQL system database."
}
if ($Database -notmatch '^(unmute_it|unmute_restore|[a-z0-9_]+_restore)$') {
    Refuse "Refusing to restore into '$Database'. Use unmute_it, unmute_restore, or a name ending in _restore."
}
foreach ($name in @($Database, $DbUser, $Service, $ProjectName)) {
    if ($name -notmatch '^[A-Za-z0-9_-]+$') {
        Refuse "Refusing a name that is not letters, numbers, '_' or '-': $name"
    }
}

$composePath = (Resolve-Path $ComposeFile).Path
$mainCompose = (Join-Path $root "docker-compose.yml")
if ($composePath -eq $mainCompose) {
    Refuse "Refusing to restore through docker-compose.yml. Point -ComposeFile at docker-compose.it.yml."
}
if (-not (Test-Path $DumpFile)) {
    Refuse "Dump file not found: $DumpFile"
}

Write-Host "This will replace objects in database '$Database' on compose project '$ProjectName'."
Write-Host "The application database is not this target."

$remote = "/tmp/unmute-restore.dump"
$compose = @("compose", "-f", $ComposeFile, "-p", $ProjectName)
docker @compose cp $DumpFile "${Service}:${remote}"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker @compose exec -T $Service pg_restore -U $DbUser -d $Database --clean --if-exists --no-owner $remote
$restoreCode = $LASTEXITCODE
docker @compose exec -T $Service rm -f $remote
if ($restoreCode -ne 0) { exit $restoreCode }

if ($VerifySql) {
    $found = docker @compose exec -T $Service psql -U $DbUser -d $Database -tAc $VerifySql
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    if (-not ($found | Out-String).Trim()) {
        Refuse "Restore finished, but the verification query returned no row."
    }
    Write-Host "Verification query returned a row."
}
Write-Host "Restore finished."
