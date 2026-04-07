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
    git pull origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Warning: Git pull encountered an issue. Proceeding anyway..." -ForegroundColor Red
    }
} else {
    Write-Host "`n[1/5] Skipping Git Pull..." -ForegroundColor Yellow
}

# 2. Install Dependencies
Write-Host "`n[2/5] Checking Node Dependencies..." -ForegroundColor Yellow
npm install

# 3. Synchronize Database
Write-Host "`n[3/5] Synchronizing PostgreSQL Database Schema..." -ForegroundColor Yellow
npx prisma db push

# 4. Compile Standalone Server
Write-Host "`n[4/5] Compiling Next.js Standalone Production Build..." -ForegroundColor Yellow
$env:NODE_ENV = "production"
npm run build

# 5. Boot Application
Write-Host "`n[5/5] Booting Production Server..." -ForegroundColor Green
Write-Host "The application is now running. Close this window to shut it down." -ForegroundColor Magenta

# In Next.js Standalone mode, we boot the raw server.js file inside the .next/standalone/ directory
$env:NODE_ENV = "production"
$env:PORT = "4000"

# Execute Standalone
node .next/standalone/server.js
