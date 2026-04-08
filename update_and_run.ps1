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
if (Test-Path "public") {
    Copy-Item -Path "public" -Destination ".next/standalone/public" -Recurse -Force
}
if (Test-Path ".next/static") {
    $dest = ".next/standalone/.next"
    if (-Not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
    Copy-Item -Path ".next/static" -Destination "$dest/static" -Recurse -Force
}

# 6. Boot Application
Write-Host "`n[6/6] Booting Production Server..." -ForegroundColor Green
Write-Host "The application is now running. Close this window to shut it down." -ForegroundColor Magenta

# In Next.js Standalone mode, we boot the raw server.js file inside the .next/standalone/ directory
$env:NODE_ENV = "production"
$env:PORT = "4000"

# Execute Standalone
node .next/standalone/server.js
