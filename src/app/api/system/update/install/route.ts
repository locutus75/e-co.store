import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    // Next.js standalone server.js calls process.chdir(__dirname) internally,
    // which changes process.cwd() to .next/standalone/. We use APP_ROOT (set by
    // start_server.ps1) to reliably resolve the project root in production.
    const projectRoot = process.env.APP_ROOT || process.cwd();
    const scriptPath = path.join(projectRoot, 'apply_update.ps1');

    console.log(`Starting background updater script: ${scriptPath}`);

    // Break completely out of the Node.js Job Object by asking the Windows Shell 
    // to spawn a brand new top-level visible window to host the update!
    exec(`powershell.exe -Command "Start-Process powershell.exe -ArgumentList '-ExecutionPolicy Bypass -File \\"${scriptPath}\\"' -WindowStyle Normal"`);

    console.log(`Updater OS process requested. Server will be closed by the script shortly.`);

    return NextResponse.json({
      success: true,
      message: "Update process started. The server will restart shortly."
    });

  } catch (error: any) {
    console.error("Error in update install:", error);
    return NextResponse.json({ success: false, error: "Failed to trigger update process", details: error.message }, { status: 500 });
  }
}
