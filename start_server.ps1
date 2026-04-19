# =========================================================
#  E-Co Store : Production Server Launcher & Update Watchdog
#  Run this script to start the server. It will automatically
#  restart after an update has been applied by apply_update.ps1.
#
#  Update flow (triggered from web UI):
#    1. Web UI POSTs to /api/system/update/install
#    2. Node writes update_requested.flag
#    3. THIS script detects the flag, stops the server,
#       runs apply_update.ps1 directly, and restarts.
# =========================================================

$ErrorActionPreference = "Continue"
$ProjectRoot        = $PSScriptRoot
$FlagFile           = Join-Path $ProjectRoot "update_done.flag"
$UpdateRequestFlag  = Join-Path $ProjectRoot "update_requested.flag"
$UpdateScript       = Join-Path $ProjectRoot "apply_update.ps1"

# Remove any stale flags from a previous cycle
if (Test-Path $FlagFile)          { Remove-Item $FlagFile          -Force }
if (Test-Path $UpdateRequestFlag) { Remove-Item $UpdateRequestFlag -Force }

function Stop-Port4000 {
    $conns = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

while ($true) {

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  E-Co Store : Booting Production Server" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan

    $env:NODE_ENV  = "production"
    $env:PORT      = "4000"
    # APP_ROOT tells the Next.js route handlers where the project root is.
    # Next.js standalone server.js calls process.chdir(__dirname) internally,
    # which changes process.cwd() to .next/standalone — so we must pass the
    # real root explicitly via env var.
    $env:APP_ROOT  = $ProjectRoot
    Set-Location $ProjectRoot

    # -------------------------------------------------------
    # Start the Next.js standalone server as a background job
    # so this script can keep polling for update flags.
    # -------------------------------------------------------
    $serverJob = Start-Job -ScriptBlock {
        param($root)
        Set-Location $root
        $env:NODE_ENV  = "production"
        $env:PORT      = "4000"
        $env:APP_ROOT  = $root
        node .next/standalone/server.js
    } -ArgumentList $ProjectRoot

    Write-Host "Server started (Job ID: $($serverJob.Id)). Listening on port 4000." -ForegroundColor Green
    Write-Host "Watching for update signals..." -ForegroundColor DarkGray

    # -------------------------------------------------------
    # Poll loop: forward server output and watch for flags
    # -------------------------------------------------------
    $updateMode = $false

    while ($true) {
        # Forward any new output from the server job to this console
        $output = Receive-Job -Job $serverJob
        if ($output) { Write-Host $output }

        # ── Update REQUESTED from web UI ──────────────────────────────────────
        if (Test-Path $UpdateRequestFlag) {
            Write-Host ""
            Write-Host "==========================================" -ForegroundColor Yellow
            Write-Host "  Update aangevraagd — server stoppen...  " -ForegroundColor Yellow
            Write-Host "==========================================" -ForegroundColor Yellow

            Remove-Item $UpdateRequestFlag -Force

            # Stop the server job
            Stop-Job  -Job $serverJob
            Remove-Job -Job $serverJob -Force

            # Make sure port 4000 is released
            Start-Sleep -Seconds 2
            Stop-Port4000

            # Run the update script directly in THIS PowerShell session
            Write-Host ""
            Write-Host "apply_update.ps1 starten..." -ForegroundColor Cyan
            & $UpdateScript -WaitSeconds 0

            Write-Host ""
            Write-Host "==========================================" -ForegroundColor Green
            Write-Host "  Update klaar — server herstarten...     " -ForegroundColor Green
            Write-Host "==========================================" -ForegroundColor Green
            Start-Sleep -Seconds 2

            $updateMode = $true
            break  # Break inner poll loop → outer while restarts server
        }

        # ── Update DONE flag (from a manually-run apply_update.ps1) ──────────
        if (Test-Path $FlagFile) {
            Write-Host ""
            Write-Host "==========================================" -ForegroundColor Magenta
            Write-Host "  Update klaar — server herstarten...     " -ForegroundColor Magenta
            Write-Host "==========================================" -ForegroundColor Magenta

            Remove-Item $FlagFile -Force

            Stop-Job  -Job $serverJob
            Remove-Job -Job $serverJob -Force

            Start-Sleep -Seconds 2
            Stop-Port4000

            break  # Break inner poll loop → outer while restarts server
        }

        # ── Unexpected server crash ───────────────────────────────────────────
        if ($serverJob.State -eq 'Failed' -or $serverJob.State -eq 'Completed') {
            # Only treat as unexpected if we didn't just request an update
            if (-not $updateMode) {
                Write-Host ""
                Write-Host "WAARSCHUWING: Server proces onverwacht gestopt (state: $($serverJob.State))." -ForegroundColor Red
                $crashOutput = Receive-Job -Job $serverJob
                if ($crashOutput) { Write-Host $crashOutput -ForegroundColor Red }
                Remove-Job -Job $serverJob -Force

                Write-Host "Herstart poging over 5 seconden..." -ForegroundColor Yellow
                Start-Sleep -Seconds 5
                break  # restart outer loop
            }
        }

        Start-Sleep -Milliseconds 1000
    }
}
