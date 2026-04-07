import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), 'apply_update.ps1');

    console.log(`Starting background updater script: ${scriptPath}`);

    // Spawn the PowerShell script in a completely detached process
    const child = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', scriptPath
    ], {
      detached: true,
      stdio: 'ignore' // We don't care about the script's output in this process
    });

    // Unref the child process so Next.js doesn't wait for it to exit
    child.unref();

    console.log(`Updater process spawned with PID ${child.pid}. Server will be closed by the script shortly.`);

    return NextResponse.json({
      success: true,
      message: "Update process started. The server will restart shortly."
    });

  } catch (error: any) {
    console.error("Error in update install:", error);
    return NextResponse.json({ success: false, error: "Failed to trigger update process", details: error.message }, { status: 500 });
  }
}
