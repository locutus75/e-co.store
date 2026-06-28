import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";

const ROOT_DIR = process.env.APP_ROOT || process.cwd();
const EXPORTS_DIR = path.join(ROOT_DIR, "public/uploads/exports");

export async function POST(request: NextRequest) {
  // Check authorization
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  
  if (!isAdmin) {
    return NextResponse.json({ error: "Access Denied: Admin role required." }, { status: 403 });
  }

  // Get filename from query params
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");
  if (!filename) {
    return NextResponse.json({ error: "Missing filename parameter." }, { status: 400 });
  }

  // Defend against arbitrary path traversal by resolving only the basename
  const safeFilename = path.basename(filename);
  if (!safeFilename.toLowerCase().endsWith(".png")) {
    return NextResponse.json({ error: "Invalid format. Only PNG is supported." }, { status: 400 });
  }

  try {
    // Read raw body stream as buffer
    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create exports directory if it doesn't exist
    if (!fs.existsSync(EXPORTS_DIR)) {
      fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }

    // Write file
    const filePath = path.join(EXPORTS_DIR, safeFilename);
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ 
      success: true, 
      filename: safeFilename,
      path: `/uploads/exports/${safeFilename}` 
    });
  } catch (err: any) {
    console.error("[save-image API] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to save image." }, { status: 500 });
  }
}
