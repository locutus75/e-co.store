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

# 4. Compile Standalone Server
Write-Host "`n[4/5] Compiling Next.js Standalone Production Build..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "CRITICAL ERROR: Next.js build failed! Exiting..." -ForegroundColor Red
    exit 1
}

# 5. Prepare Standalone Assets
Write-Host "`n[5/6] Linking Static Assets..." -ForegroundColor Yellow

# Preserve any runtime-uploaded images so they survive the update.
# (public/uploads is gitignored; without this step they'd be deleted by the copy below)
$standalonePublic  = ".next/standalone/public"
$standaloneUploads = ".next/standalone/public/uploads"
$backupUploads     = ".next/_uploads_backup"

if (Test-Path $standaloneUploads) {
    Write-Host "  Backing up runtime uploads..." -ForegroundColor DarkYellow
    if (Test-Path $backupUploads) { Remove-Item -Path $backupUploads -Recurse -Force }
    Copy-Item -Path $standaloneUploads -Destination $backupUploads -Recurse -Force
}

if (Test-Path "public") {
    if (Test-Path $standalonePublic) { Remove-Item -Path $standalonePublic -Recurse -Force }
    Copy-Item -Path "public" -Destination ".next/standalone/" -Recurse -Force
}

# Restore uploads on top of the fresh public copy
if (Test-Path $backupUploads) {
    Write-Host "  Restoring runtime uploads..." -ForegroundColor DarkYellow
    $restoreDest = ".next/standalone/public/uploads"
    if (-Not (Test-Path $restoreDest)) { New-Item -ItemType Directory -Force -Path $restoreDest | Out-Null }
    # Merge: copy each backed-up article directory (don't overwrite with empty dirs)
    Get-ChildItem -Path $backupUploads | ForEach-Object {
        $dest = Join-Path $restoreDest $_.Name
        Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
    }
    Remove-Item -Path $backupUploads -Recurse -Force
}

if (Test-Path ".next/static") {
    $destStatic = ".next/standalone/.next/static"
    if (Test-Path $destStatic) { Remove-Item -Path $destStatic -Recurse -Force }
    $destBase = ".next/standalone/.next"
    if (-Not (Test-Path $destBase)) { New-Item -ItemType Directory -Force -Path $destBase | Out-Null }
    Copy-Item -Path ".next/static" -Destination $destBase -Recurse -Force
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
