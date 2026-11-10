param (
    [int]$WaitSeconds = 3
)

$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " E-Co Store : Background Auto-Updater" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`nWaiting $WaitSeconds seconds for the API to close cleanly..." -ForegroundColor Yellow
Start-Sleep -Seconds $WaitSeconds

# Kill any existing node process on port 4000
Write-Host "Ensuring port 4000 is free..." -ForegroundColor Yellow
$port = 4000
$tcpConnections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($tcpConnections) {
    foreach ($conn in $tcpConnections) {
        $pidToKill = $conn.OwningProcess
        if ($pidToKill -gt 0 -and $pidToKill -ne $PID) {
            Write-Host "Killing process ID $pidToKill (using port $port)..." -ForegroundColor Yellow
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}
else {
    Write-Host "Port $port is already free." -ForegroundColor Green
}

# Clean up any leftover temporary backup folders or nested duplicate upload folders from older updates
$standaloneUploads = ".next/standalone/public/uploads"
$rootUploads = "public/uploads"
$legacyBackup1 = "_uploads_backup_temp"
$legacyBackup2 = ".next/_uploads_backup"

foreach ($dupPath in @(
        "$standaloneUploads/products/products",
        "$standaloneUploads/uploads",
        "$rootUploads/products/products",
        "$rootUploads/uploads",
        $legacyBackup1,
        $legacyBackup2
    )) {
    if (Test-Path $dupPath) {
        Write-Host "Oude/dubbele backup-map opruimen: $dupPath..." -ForegroundColor DarkYellow
        $resolvedDup = (Resolve-Path $dupPath).Path
        cmd /c "rmdir /s /q `"$resolvedDup`"" 2>$null
    }
}

# Ensure any unique runtime-uploaded files in .next/standalone/public/uploads are synced to root public/uploads,
# then delete the duplicate standalone uploads folder so it is never backed up again.
if (Test-Path $standaloneUploads) {
    Write-Host "Synchroniseren van eventuele nieuwe uploads naar $rootUploads..." -ForegroundColor DarkYellow
    if (-Not (Test-Path $rootUploads)) { New-Item -ItemType Directory -Force -Path $rootUploads | Out-Null }
    robocopy $standaloneUploads $rootUploads /E /XO /XD "products\products" "uploads" /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
    $resolvedStandaloneUploads = (Resolve-Path $standaloneUploads).Path
    cmd /c "rmdir /s /q `"$resolvedStandaloneUploads`"" 2>$null
}

# 1. Pull Latest Source Code
Write-Host "`n[1/5] Syncing latest code from GitHub..." -ForegroundColor Yellow
git pull origin master
if ($LASTEXITCODE -ne 0) {
    Write-Host "CRITICAL ERROR: Git pull failed! Exiting..." -ForegroundColor Red
    exit 1
}

# 2. Install Dependencies
Write-Host "`n[2/5] Checking Node Dependencies..." -ForegroundColor Yellow
$env:NODE_ENV = "development"
npm install

# 3. Synchronize Database & Generate Client
Write-Host "`n[3/5] Synchronizing PostgreSQL Database Schema & Prisma Client..." -ForegroundColor Yellow
npx prisma db push
npx prisma generate

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
if (Test-Path "public") {
    if (Test-Path ".next/standalone/public") { cmd /c "rmdir /s /q .next\standalone\public" 2>$null }
    robocopy "public" ".next/standalone/public" /E /XD "uploads" /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
}

if (Test-Path ".next/static") {
    $destStatic = ".next/standalone/.next/static"
    robocopy ".next/static" $destStatic /MIR /NFL /NDL /NJH /NJS /R:1 /W:1 | Out-Null
}

# 6. Signal the server watchdog to restart
Write-Host "`n[6/6] Update complete — signalling server watchdog to restart..." -ForegroundColor Green

$FlagFile = Join-Path $PSScriptRoot "update_done.flag"
Set-Content -Path $FlagFile -Value (Get-Date -Format "o")

Write-Host ""
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  update_done.flag written successfully.  " -ForegroundColor Magenta
Write-Host "  start_server.ps1 will reboot the app.  " -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "This updater window can now be closed." -ForegroundColor DarkGray
