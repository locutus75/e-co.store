import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

const ROOT_DIR = process.env.APP_ROOT || process.cwd();
const EXPORTS_DIR = path.join(ROOT_DIR, "public/uploads/exports");

export async function GET(request: NextRequest) {
  // Check authorization
  const session = await getServerSession(authOptions);
  const roles = (session?.user as any)?.roles || [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  if (!isAdmin) {
    return NextResponse.json({ error: "Access Denied: Admin role required." }, { status: 403 });
  }

  // Ensure export directory exists and has files
  if (!fs.existsSync(EXPORTS_DIR)) {
    return NextResponse.json({ error: "No export folder found. Execute an export first." }, { status: 404 });
  }

  try {
    const files = fs.readdirSync(EXPORTS_DIR).filter(f => f.toLowerCase().endsWith(".png"));
    if (files.length === 0) {
      return NextResponse.json({ error: "No exported photos found. Execute an export first." }, { status: 404 });
    }

    // Build the ZIP archive
    const zip = new JSZip();
    
    for (const file of files) {
      const filePath = path.join(EXPORTS_DIR, file);
      const fileData = fs.readFileSync(filePath);
      zip.file(file, fileData);
    }

    const zipBuffer = await zip.generateAsync({ type: "blob" });

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=mpluskassa_fotos_export.zip',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });

  } catch (err: any) {
    console.error("[download-zip API] Error zipping files:", err);
    return NextResponse.json({ error: err.message || "Failed to generate ZIP archive." }, { status: 500 });
  }
}
