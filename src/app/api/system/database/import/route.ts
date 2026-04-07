import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';

const execAsync = util.promisify(exec);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Read the file data into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save it temporarily
    const tempFilePath = path.join(os.tmpdir(), `eco_store_import_${Date.now()}.sql`);
    fs.writeFileSync(tempFilePath, buffer);

    // Get DB config
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
    const parsed = new URL(currentUrl);
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    const host = parsed.hostname;
    const port = parsed.port || '5432';
    const database = parsed.pathname.substring(1);

    // Execute psql to restore
    const command = `psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${tempFilePath}"`;

    try {
      await execAsync(command, {
        env: { ...process.env, PGPASSWORD: password }
      });
      
      // Cleanup
      fs.unlinkSync(tempFilePath);
      
      return NextResponse.json({ 
        success: true, 
        message: "Database successfully imported." 
      });
    } catch (execError: any) {
      // Cleanup
      fs.unlinkSync(tempFilePath);
      console.error("PSQL exec error:", execError);
      return NextResponse.json({ 
        error: "Failed to import database file. PostgreSQL may have rejected some statements.", 
        details: execError.message 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("Error importing database:", error);
    return NextResponse.json({ error: "Failed to process import", details: error.message }, { status: 500 });
  }
}
