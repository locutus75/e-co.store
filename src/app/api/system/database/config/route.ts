import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

// Helper to parse DB URL
function parseDbUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.substring(1), // Remove leading slash
      search: parsed.search // e.g. ?schema=public
    };
  } catch (e) {
    return null;
  }
}

// Rebuild DB URL
function buildDbUrl(protocol: string, user: string, pass: string, host: string, port: string, db: string, search: string) {
  // Use encodeURIComponent for password to handle special characters correctly
  const encodedPass = encodeURIComponent(pass);
  const encodedUser = encodeURIComponent(user);
  return `${protocol}//${encodedUser}:${encodedPass}@${host}:${port}/${db}${search}`;
}

const envPath = path.join(process.cwd(), '.env');

export async function GET() {
  try {
    if (!fs.existsSync(envPath)) {
      return NextResponse.json({ error: "No .env file found" }, { status: 404 });
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL *= *["']?([^"'\n]+)["']?/m);
    
    if (!match) {
      return NextResponse.json({ error: "No DATABASE_URL found in .env" }, { status: 404 });
    }

    const dbUrl = match[1];
    const parsed = parseDbUrl(dbUrl);

    if (!parsed) {
      return NextResponse.json({ error: "Could not parse DATABASE_URL" }, { status: 500 });
    }

    return NextResponse.json({
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      database: parsed.database,
      search: parsed.search,
      // We do NOT return the actual password to the frontend for security reasons.
      // The frontend will treat an empty string password input as "keep existing".
    });

  } catch (error) {
    console.error("Error reading db config:", error);
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { host, port, user, password, database, search, testOnly } = await request.json();

    if (!host || !port || !user || !database) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!fs.existsSync(envPath)) {
      return NextResponse.json({ error: "No .env file found" }, { status: 404 });
    }
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL *= *["']?([^"'\n]+)["']?/m);
    if (!match) {
      return NextResponse.json({ error: "No DATABASE_URL found in .env" }, { status: 404 });
    }

    const currentUrl = match[1];
    const currentParsed = parseDbUrl(currentUrl);
    
    // Use new password if provided, otherwise keep existing
    const finalPassword = password ? password : currentParsed?.password || '';
    
    // Construct new DB URL
    const newDbUrl = buildDbUrl(
      currentParsed?.protocol || 'postgresql:',
      user,
      finalPassword,
      host,
      port,
      database,
      search || currentParsed?.search || ''
    );

    // TEST CONNECTION BEFORE SAVING
    const client = new Client({ connectionString: newDbUrl });
    try {
      await client.connect();
      await client.end();
    } catch (e: any) {
      console.error("DB Test fail:", e);
      return NextResponse.json({ 
        error: "Connection test failed. The new credentials are not working.", 
        details: e.message 
      }, { status: 400 });
    }

    if (testOnly) {
      return NextResponse.json({ 
        success: true, 
        message: "Connection test successful!"
      });
    }

    // Replace in .env
    const newEnvContent = envContent.replace(
      /^DATABASE_URL *= *.+$/m, 
      `DATABASE_URL="${newDbUrl}"`
    );
    fs.writeFileSync(envPath, newEnvContent, 'utf8');

    return NextResponse.json({ 
      success: true, 
      message: "Database configuration updated. The server must be restarted."
    });

  } catch (error: any) {
    console.error("Config update error:", error);
    return NextResponse.json({ error: "Failed to update configuration", details: error.message }, { status: 500 });
  }
}
