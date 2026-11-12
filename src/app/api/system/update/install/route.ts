import { NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
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
    console.log(`Shutting down server process so start_server.ps1 can run apply_update.ps1...`);

    // Exit the Node process shortly after returning the HTTP response so:
    // 1. Port 4000 and any file locks (.next/standalone, prisma dlls) are immediately released.
    // 2. PowerShell's Stop-Job in start_server.ps1 never hangs on open HTTP keep-alive sockets.
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
