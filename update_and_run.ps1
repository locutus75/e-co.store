param (
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " E-Co Store : Production Update Engine" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Ensure port 4000 is free before updating/building so no files are locked
$conns = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess -and $c.OwningProcess -gt 0 -and $c.OwningProcess -ne $PID) {
        Write-Host "Stopping existing server on port 4000 (PID $($c.OwningProcess))..." -ForegroundColor Yellow
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# 1. Pull Latest Source Code
if (-Not $SkipPull) {
    Write-Host "`n[1/5] Syncing latest code from GitHub..." -ForegroundColor Yellow
    $env:GIT_TERMINAL_PROMPT = "0"
    git fetch origin master
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CRITICAL ERROR: Git fetch failed or this is not a valid git repository! Exiting..." -ForegroundColor Red
        exit 1
    }
    git reset --hard origin/master
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CRITICAL ERROR: Git reset failed! Exiting..." -ForegroundColor Red
        exit 1
    }

    # Re-invoke the freshly pulled update_and_run.ps1 from disk with -SkipPull
    # so PowerShell ALWAYS executes the latest script version rather than the old in-memory copy!
    & "$PSScriptRoot\update_and_run.ps1" -SkipPull
    exit $LASTEXITCODE
}
else {
    Write-Host "`n[1/5] Code synced — executing latest update_and_run.ps1..." -ForegroundColor Yellow
}

if (-Not (Test-Path "package.json")) {
    Write-Host "CRITICAL ERROR: 'package.json' not found. Ensure you have cloned the repository correctly into this folder. Exiting..." -ForegroundColor Red
    exit 1
}

# 2. Install Dependencies
Write-Host "`n[2/5] Checking Node Dependencies..." -ForegroundColor Yellow
$env:NODE_ENV = "development"
npm install --no-audit --no-fund

# 3. Synchronize Database & Generate Prisma Client
Write-Host "`n[3/5] Synchronizing PostgreSQL Database Schema & Client..." -ForegroundColor Yellow
npx prisma db push
npx prisma generate

# 3.5 Clean up any leftover temporary backup folders or nested duplicate upload folders before building
$standaloneUploads = ".next/standalone/public/uploads"
$rootUploads = "public/uploads"
foreach ($dupPath in @(
    "$standaloneUploads/products/products",
    "$standaloneUploads/uploads",
    "$rootUploads/products/products",
    "$rootUploads/uploads",
    "_uploads_backup_temp",
    ".next/_uploads_backup"
)) {
    if (Test-Path $dupPath) {
        Write-Host "  Oude/dubbele backup-map opruimen: $dupPath..." -ForegroundColor DarkYellow
        $resolvedDup = (Resolve-Path $dupPath).Path
        cmd /c "rmdir /s /q `"$resolvedDup`"" 2>$null
    }
}

if (Test-Path $standaloneUploads) {
    Write-Host "  Synchroniseren van eventuele nieuwe uploads naar $rootUploads..." -ForegroundColor DarkYellow
    if (-Not (Test-Path $rootUploads)) { New-Item -ItemType Directory -Force -Path $rootUploads | Out-Null }
    robocopy $standaloneUploads $rootUploads /E /XO /XD "products\products" "uploads" /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
    $resolvedStandaloneUploads = (Resolve-Path $standaloneUploads).Path
    cmd /c "rmdir /s /q `"$resolvedStandaloneUploads`"" 2>$null
}

# Clean .next/node_modules junction points before building on Windows
if (Test-Path ".next/node_modules") {
    cmd /c "rmdir /s /q .next\node_modules" 2>$null
}

# 4. Compile Standalone Server
Write-Host "`n[4/5] Compiling Next.js Standalone Production Build..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "CRITICAL ERROR: Next.js build failed! Exiting..." -ForegroundColor Red
    exit 1
}

# 5. Prepare Standalone Assets (excluding public/uploads which lives permanently in $APP_ROOT/public/uploads)
Write-Host "`n[5/6] Linking Static Assets..." -ForegroundColor Yellow

$standalonePublic = ".next/standalone/public"
if (Test-Path "public") {
    if (Test-Path $standalonePublic) { cmd /c "rmdir /s /q .next\standalone\public" 2>$null }
    robocopy "public" $standalonePublic /E /XD "uploads" /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
}

if (Test-Path ".next/static") {
    $destStatic = ".next/standalone/.next/static"
    robocopy ".next/static" $destStatic /MIR /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
}

# 6. Boot Application via start_server.ps1 so the Update Watchdog is ALWAYS active!
Write-Host "`n[6/6] Starting Production Server with Update Watchdog (start_server.ps1)..." -ForegroundColor Green
& "$PSScriptRoot\start_server.ps1"
