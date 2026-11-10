param (
    [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " E-Co Store : Production Update Engine" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Pull Latest Source Code
if (-Not $SkipPull) {
    Write-Host "`n[1/5] Syncing latest code from GitHub..." -ForegroundColor Yellow
    git pull origin master
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CRITICAL ERROR: Git pull failed or this is not a valid git repository! Exiting..." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[1/5] Skipping Git Pull..." -ForegroundColor Yellow
}

if (-Not (Test-Path "package.json")) {
    Write-Host "CRITICAL ERROR: 'package.json' not found. Ensure you have cloned the repository correctly into this folder. Exiting..." -ForegroundColor Red
    exit 1
}

# 2. Install Dependencies
Write-Host "`n[2/5] Checking Node Dependencies..." -ForegroundColor Yellow
$env:NODE_ENV = "development"
npm install

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

# 6. Boot Application
Write-Host "`n[6/6] Booting Production Server..." -ForegroundColor Green
Write-Host "The application is now running. Close this window to shut it down." -ForegroundColor Magenta

# In Next.js Standalone mode, we boot the raw server.js file inside the .next/standalone/ directory
$env:NODE_ENV = "production"
$env:PORT = "4000"

# APP_ROOT tells images.ts and the serve route where the stable project root is.
# standalone/server.js does process.chdir(__dirname) which would otherwise make
# process.cwd() point inside .next/standalone/ (wiped on every update).
$env:APP_ROOT = (Get-Location).Path

# Execute Standalone
node .next/standalone/server.js
