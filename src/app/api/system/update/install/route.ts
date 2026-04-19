import { NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import path from 'path';

export async function POST() {
  try {
    // Next.js standalone server.js calls process.chdir(__dirname) internally,
    // so we use APP_ROOT (set by start_server.ps1) to reliably resolve the project root.
    const projectRoot = process.env.APP_ROOT || process.cwd();
    const flagPath = path.join(projectRoot, 'update_requested.flag');

    // Write a flag file. start_server.ps1 polls for this flag and handles the
    // full update flow (stop server → run apply_update.ps1 → restart) itself.
    // This avoids trying to spawn a new PowerShell window from inside a background job,
    // which doesn't work reliably in non-interactive sessions.
    writeFileSync(flagPath, new Date().toISOString(), 'utf-8');

    console.log(`Update flag written to: ${flagPath}`);
    console.log(`start_server.ps1 watchdog will pick this up and run apply_update.ps1.`);

    return NextResponse.json({
      success: true,
      message: "Update aangevraagd. De server stopt zodra de watchdog het signaal oppikt en herstart daarna automatisch.",
    });

  } catch (error: any) {
    console.error('Error writing update flag:', error);
    return NextResponse.json({ success: false, error: 'Kon update flag niet schrijven', details: error.message }, { status: 500 });
  }
}
