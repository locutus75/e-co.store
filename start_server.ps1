# =========================================================
#  E-Co Store : Production Server Launcher & Update Watchdog
#  Run this script to start the server. It will automatically
#  run apply_update.ps1 and restart whenever an update is
#  triggered from the web UI.
# =========================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
$FlagFile = Join-Path $ProjectRoot "update_done.flag"
$UpdateRequestFlag = Join-Path $ProjectRoot "update_requested.flag"
$UpdateScript = Join-Path $ProjectRoot "apply_update.ps1"
$StandaloneServer = Join-Path $ProjectRoot ".next\standalone\server.js"

# Disable Windows Console QuickEdit Mode so clicking in the terminal window
# never freezes the PowerShell process.
try {
    $quickEditCode = @"
using System;
using System.Runtime.InteropServices;
public static class ConsoleQuickEdit {
    const uint ENABLE_QUICK_EDIT = 0x0040;
    const uint ENABLE_EXTENDED_FLAGS = 0x0080;
    const int STD_INPUT_HANDLE = -10;
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr GetStdHandle(int nStdHandle);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
    public static void Disable() {
        IntPtr handle = GetStdHandle(STD_INPUT_HANDLE);
        uint mode;
        if (GetConsoleMode(handle, out mode)) {
            mode &= ~ENABLE_QUICK_EDIT;
            mode |= ENABLE_EXTENDED_FLAGS;
            SetConsoleMode(handle, mode);
        }
    }
}
"@
    if (-not ("ConsoleQuickEdit" -as [type])) {
        Add-Type -TypeDefinition $quickEditCode -Language CSharp -ErrorAction SilentlyContinue
    }
    [ConsoleQuickEdit]::Disable()
} catch {
    # Ignore if running in a host without standard console handles
}

# Remove any stale flags from a previous cycle
if (Test-Path $FlagFile) { Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue }
if (Test-Path $UpdateRequestFlag) { Remove-Item $UpdateRequestFlag -Force -ErrorAction SilentlyContinue }

function Stop-Port4000 {
    $conns = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        if ($c.OwningProcess -and $c.OwningProcess -gt 0 -and $c.OwningProcess -ne $PID) {
            Write-Host "Vrijmaken poort 4000: proces $($c.OwningProcess) beëindigen..." -ForegroundColor Yellow
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 1
}

while ($true) {

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  E-Co Store : Booting Production Server" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan

    # Ensure port 4000 is clean before starting
    Stop-Port4000

    Set-Location $ProjectRoot

    # Self-heal if .next\standalone\server.js is missing (e.g. after a failed build)
    if (-not (Test-Path $StandaloneServer)) {
        Write-Host "WAARSCHUWING: '$StandaloneServer' ontbreekt!" -ForegroundColor Yellow
        Write-Host "Automatisch apply_update.ps1 uitvoeren om laatste versie op te halen en te bouwen..." -ForegroundColor Cyan
        & $UpdateScript -WaitSeconds 0
        if (Test-Path $FlagFile) { Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue }

        if (-not (Test-Path $StandaloneServer)) {
            Write-Host "FOUT: Build nog steeds niet geslaagd (.next\standalone\server.js ontbreekt). Opnieuw proberen over 15 seconden..." -ForegroundColor Red
            Start-Sleep -Seconds 15
            continue
        }
    }

    $env:NODE_ENV = "production"
    $env:PORT = "4000"
    $env:APP_ROOT = $ProjectRoot
    $env:WATCHDOG_ACTIVE = "1"

    Write-Host "Server actief op poort 4000 (Watchdog ingeschakeld)." -ForegroundColor Green

    # Run node directly in the foreground. When /api/system/update/install is called,
    # Node writes update_requested.flag and exits cleanly via process.exit(0),
    # returning control immediately to the lines below!
    node .next/standalone/server.js

    # ── Check if Node exited because an update was requested ──────────────
    if (Test-Path $UpdateRequestFlag) {
        Write-Host ""
        Write-Host "==========================================" -ForegroundColor Yellow
        Write-Host "  Update aangevraagd — update starten...  " -ForegroundColor Yellow
        Write-Host "==========================================" -ForegroundColor Yellow

        Remove-Item $UpdateRequestFlag -Force -ErrorAction SilentlyContinue
        Stop-Port4000

        & $UpdateScript -WaitSeconds 0
        if (Test-Path $FlagFile) { Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue }

        Write-Host ""
        Write-Host "==========================================" -ForegroundColor Green
        Write-Host "  Update voltooid — server herstarten...  " -ForegroundColor Green
        Write-Host "==========================================" -ForegroundColor Green
        Start-Sleep -Seconds 1
        continue
    }

    if (Test-Path $FlagFile) {
        Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue
        Stop-Port4000
        Start-Sleep -Seconds 1
        continue
    }

    Write-Host ""
    Write-Host "WAARSCHUWING: Server proces is gestopt. Herstarten over 3 seconden..." -ForegroundColor Yellow
    Stop-Port4000
    Start-Sleep -Seconds 3
}
