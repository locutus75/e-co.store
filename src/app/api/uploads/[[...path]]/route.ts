import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

// Mirror the ROOT_DIR from images.ts so serve paths match write paths exactly.
const ROOT_DIR = process.env.APP_ROOT || process.cwd();

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const resolvedParams = await params;
  if (!resolvedParams.path || resolvedParams.path.length === 0) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  // Defend against arbitrary path traversals
  const normalizedPathParts = resolvedParams.path.map(p => p.replace(/\.\./g, ''));
  
  // Symmetrically resolve exactly as uploadProductImageAction writes it
  const filePath = path.join(ROOT_DIR, "public", "uploads", ...normalizedPathParts);

  if (!fs.existsSync(filePath)) {
    // If running in development or standalone but missing, 404
    return new NextResponse('Asset Not Found', { status: 404 });
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    // Guess basic mime types
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.avif') mimeType = 'image/avif';

    // We stream it back directly out of the NextJS App Router
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });

  } catch (err: any) {
    console.error("API Upload serve error:", err);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
