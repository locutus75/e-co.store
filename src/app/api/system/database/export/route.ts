import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';

const execAsync = util.promisify(exec);

export async function GET() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
      return NextResponse.json({ error: "No .env file found" }, { status: 404 });
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL *= *["']?([^"'\n]+)["']?/m);
    if (!match) {
      return NextResponse.json({ error: "No DATABASE_URL found in .env" }, { status: 404 });
    }

    const currentUrl = match[1];
    
    // Parse URL
    const parsed = new URL(currentUrl);
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    const host = parsed.hostname;
    const port = parsed.port || '5432';
    const database = parsed.pathname.substring(1);

    // Create a temporary file path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tempFilePath = path.join(os.tmpdir(), `eco_store_backup_${database}_${timestamp}.sql`);

    // Build pg_dump command
    // Using PGPASSWORD env variable to avoid password prompt
    const command = `pg_dump -h ${host} -p ${port} -U ${user} -c -O -f "${tempFilePath}" ${database}`;

    // Execute pg_dump
    await execAsync(command, {
      env: { ...process.env, PGPASSWORD: password }
    });

    // Read the generated file
    const fileBuffer = fs.readFileSync(tempFilePath);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    // Return the file as a downloadable response
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/sql',
        'Content-Disposition': `attachment; filename="backup_${database}_${timestamp}.sql"`
      }
    });

  } catch (error: any) {
    console.error("Error exporting database:", error);
    return NextResponse.json({ error: "Failed to export database", details: error.message }, { status: 500 });
  }
}
