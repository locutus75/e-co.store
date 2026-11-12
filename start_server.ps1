# =========================================================
#  E-Co Store : Production Server Launcher & Update Watchdog
#  Run this script to start the server. It will automatically
#  restart after an update has been applied by apply_update.ps1.
#
#  Update flow (triggered from web UI):
#    1. Web UI POSTs to /api/system/update/install
#    2. Node writes update_requested.flag and exits cleanly
#    3. THIS script detects the flag, ensures port 4000 is free,
#       runs apply_update.ps1 directly, and restarts.
# =========================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
$FlagFile = Join-Path $ProjectRoot "update_done.flag"
$UpdateRequestFlag = Join-Path $ProjectRoot "update_requested.flag"
$UpdateScript = Join-Path $ProjectRoot "apply_update.ps1"
$StandaloneServer = Join-Path $ProjectRoot ".next\standalone\server.js"

# Disable Windows Console QuickEdit Mode so clicking in the terminal window
# never freezes the PowerShell watchdog loop.
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
}
catch {
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

function Invoke-UpdateFlow {
    param($Job)

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Yellow
    Write-Host "  Update aangevraagd — server stoppen...  " -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Yellow

    if (Test-Path $UpdateRequestFlag) {
        Remove-Item $UpdateRequestFlag -Force -ErrorAction SilentlyContinue
    }

    # IMPORTANT: Kill node.exe on port 4000 FIRST before Stop-Job,
    # because Stop-Job on Windows PowerShell can hang if child node.exe
    # still holds open HTTP keep-alive connections or stdio pipes.
    Stop-Port4000

    if ($null -ne $Job) {
        Stop-Job -Job $Job -ErrorAction SilentlyContinue
        Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 1
    Stop-Port4000

    Write-Host ""
    Write-Host "apply_update.ps1 starten..." -ForegroundColor Cyan
    & $UpdateScript -WaitSeconds 0
    if (Test-Path $FlagFile) { Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue }

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "  Update klaar — server herstarten...     " -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    Start-Sleep -Seconds 2
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

    # -------------------------------------------------------
    # Start the Next.js standalone server as a background job
    # so this script can keep polling for update flags.
    # -------------------------------------------------------
    $serverJob = Start-Job -ScriptBlock {
        param($root)
        Set-Location $root
        $env:NODE_ENV = "production"
        $env:PORT = "4000"
        $env:APP_ROOT = $root
        node .next/standalone/server.js
    } -ArgumentList $ProjectRoot

    Write-Host "Server started (Job ID: $($serverJob.Id)). Listening on port 4000." -ForegroundColor Green
    Write-Host "Watching for update signals..." -ForegroundColor DarkGray

    # -------------------------------------------------------
    # Poll loop: forward server output and watch for flags
    # -------------------------------------------------------
    while ($true) {
        # Forward any new output from the server job to this console
        $output = Receive-Job -Job $serverJob -ErrorAction SilentlyContinue
        if ($output) { Write-Host $output }

        # ── Update REQUESTED from web UI ──────────────────────────────────────
        if (Test-Path $UpdateRequestFlag) {
            Invoke-UpdateFlow -Job $serverJob
            break  # Break inner poll loop → outer while restarts server
        }

        # ── Update DONE flag (from a manually-run apply_update.ps1) ──────────
        if (Test-Path $FlagFile) {
            Write-Host ""
            Write-Host "==========================================" -ForegroundColor Magenta
            Write-Host "  Update klaar — server herstarten...     " -ForegroundColor Magenta
            Write-Host "==========================================" -ForegroundColor Magenta

            Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue

            Stop-Port4000
            Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
            Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue

            Start-Sleep -Seconds 1
            Stop-Port4000

            break  # Break inner poll loop → outer while restarts server
        }

                # ── Server job exited (either because update_requested exited Node, or crash) ──
                if ($serverJob.State -eq 'Failed' -or $serverJob.State -eq 'Completed' -or $serverJob.State -eq 'Stopped') {
                    $remainingOutput = Receive-Job -Job $serverJob -ErrorAction SilentlyContinue
                    if ($remainingOutput) { Write-Host $remainingOutput }

                    # Check if the server exited because an update was just requested
                    if (Test-Path $UpdateRequestFlag) {
                        Invoke-UpdateFlow -Job $serverJob
                        break
                    }

                    Write-Host ""
                    Write-Host "WAARSCHUWING: Server proces gestopt (state: $($serverJob.State))." -ForegroundColor Red
                    Remove-Job -Job $serverJob -Force -ErrorAction SilentlyContinue
                    Stop-Port4000

                    Write-Host "Herstart poging over 3 seconden..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 3
                    break  # restart outer loop
                }

                Start-Sleep -Milliseconds 500
            }
        }
