# =========================================================
#  E-Co Store : Production Server Launcher & Update Watchdog
#  Run this script to start the server. It will automatically
#  restart after an update has been applied by apply_update.ps1.
# =========================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
$FlagFile    = Join-Path $ProjectRoot "update_done.flag"

# Remove any stale flag from a previous update cycle
if (Test-Path $FlagFile) { Remove-Item $FlagFile -Force }

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
    # so this script can keep polling for the update flag.
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
    Write-Host "Waiting for update signal (update_done.flag)..." -ForegroundColor DarkGray

    # -------------------------------------------------------
    # Poll loop: forward server output and watch for the flag
    # -------------------------------------------------------
    while ($true) {
        # Forward any new output from the server job to this console
        $output = Receive-Job -Job $serverJob
        if ($output) { Write-Host $output }

        # Has the update script finished and signalled us?
        if (Test-Path $FlagFile) {
            Write-Host ""
            Write-Host "==========================================" -ForegroundColor Magenta
            Write-Host "  Update complete — restarting server...  " -ForegroundColor Magenta
            Write-Host "==========================================" -ForegroundColor Magenta

            # Remove the flag so we don't restart again immediately
            Remove-Item $FlagFile -Force

            # Stop the current server job gracefully
            Stop-Job  -Job $serverJob
            Remove-Job -Job $serverJob -Force

            # Make sure port 4000 is fully released before booting again
            Start-Sleep -Seconds 2
            $conns = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
            foreach ($c in $conns) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 1

            break   # Break the inner poll loop → outer while restarts server
        }

        # Check if the server job has unexpectedly died
        if ($serverJob.State -eq 'Failed' -or $serverJob.State -eq 'Completed') {
            Write-Host ""
            Write-Host "WARNING: Server process exited unexpectedly (state: $($serverJob.State))." -ForegroundColor Red
            $output = Receive-Job -Job $serverJob
            if ($output) { Write-Host $output -ForegroundColor Red }
            Remove-Job -Job $serverJob -Force

            Write-Host "Attempting to restart in 5 seconds..." -ForegroundColor Yellow
            Start-Sleep -Seconds 5
            break   # restart outer loop
        }

        Start-Sleep -Milliseconds 1000
    }
}
