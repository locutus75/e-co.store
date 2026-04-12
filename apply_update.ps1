param (
    [int]$WaitSeconds = 3
)

$ErrorActionPreference = "Stop"

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
        if ($pidToKill -gt 0) {
            Write-Host "Killing process ID $pidToKill (using port $port)..." -ForegroundColor Yellow
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "Port $port is already free." -ForegroundColor Green
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
    if (Test-Path ".next/standalone/public") { Remove-Item -Path ".next/standalone/public" -Recurse -Force }
    Copy-Item -Path "public" -Destination ".next/standalone/" -Recurse -Force
}
if (Test-Path ".next/static") {
    $destStatic = ".next/standalone/.next/static"
    if (Test-Path $destStatic) { Remove-Item -Path $destStatic -Recurse -Force }
    $destBase = ".next/standalone/.next"
    if (-Not (Test-Path $destBase)) { New-Item -ItemType Directory -Force -Path $destBase | Out-Null }
    Copy-Item -Path ".next/static" -Destination $destBase -Recurse -Force
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
