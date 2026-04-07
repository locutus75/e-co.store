import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

export async function POST(request: Request) {
  try {
    const { newDatabaseName } = await request.json();

    if (!newDatabaseName) {
      return NextResponse.json({ error: "No database name provided" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(newDatabaseName)) {
      return NextResponse.json({ error: "Invalid database name. Use only letters, numbers, and underscores." }, { status: 400 });
    }

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
    
    // To create a database, we must connect to the default 'postgres' database
    const urlObj = new URL(currentUrl);
    urlObj.pathname = '/postgres'; 
    
    const client = new Client({ connectionString: urlObj.toString() });
    
    await client.connect();

    // Check if database already exists
    const checkRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [newDatabaseName]);
    if (checkRes.rowCount && checkRes.rowCount > 0) {
      await client.end();
      return NextResponse.json({ error: "Database already exists" }, { status: 400 });
    }

    // Creating database natively
    await client.query(`CREATE DATABASE "${newDatabaseName}"`);
    await client.end();

    return NextResponse.json({ 
      success: true, 
      message: `Database '${newDatabaseName}' has been successfully created. You can now use it in the connection settings.`
    });

  } catch (error: any) {
    console.error("Error creating database:", error);
    return NextResponse.json({ error: "Failed to create database", details: error.message }, { status: 500 });
  }
}
