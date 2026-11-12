import { NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    // Next.js standalone server.js calls process.chdir(__dirname) internally,
    // so we use APP_ROOT (set by start_server.ps1 / update_and_run.ps1) to reliably resolve the project root.
    const projectRoot = process.env.APP_ROOT || process.cwd();
    const flagPath = path.join(projectRoot, 'update_requested.flag');

    // Write the flag file so start_server.ps1 knows an update was requested.
    writeFileSync(flagPath, new Date().toISOString(), 'utf-8');
    console.log(`Update flag written to: ${flagPath}`);

    const watchdogActive = process.env.WATCHDOG_ACTIVE === '1';

    if (watchdogActive) {
      console.log(`Watchdog is active — shutting down server process so start_server.ps1 runs apply_update.ps1...`);
    } else {
      // Fallback if the server was started without start_server.ps1 (e.g. an older update_and_run.ps1 session):
      // spawn a new PowerShell window running update_and_run.ps1 so the update still runs automatically!
      const updateScriptPath = path.join(projectRoot, 'update_and_run.ps1');
      console.log(`No active watchdog detected — launching ${updateScriptPath} in a new PowerShell window...`);
      try {
        const child = spawn(
          'cmd.exe',
          ['/c', 'start', '"E-Co Store Updater"', 'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', updateScriptPath],
          { cwd: projectRoot, detached: true, stdio: 'ignore' }
        );
        child.unref();
      } catch (spawnErr) {
        console.error('Fallback spawn failed:', spawnErr);
      }
    }

    setTimeout(() => {
      process.exit(0);
    }, 750);

    return NextResponse.json({
      success: true,
      message: "Update aangevraagd. De server stopt nu automatisch om de update te installeren en herstart daarna.",
    });

  } catch (error: any) {
    console.error('Error writing update flag:', error);
    return NextResponse.json({ success: false, error: 'Kon update flag niet schrijven', details: error.message }, { status: 500 });
  }
}
