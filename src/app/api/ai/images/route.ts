import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.env.APP_ROOT || process.cwd();

/**
 * GET /api/ai/images?article=8985
 * Returns a list of image paths for a given article number.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const article = request.nextUrl.searchParams.get('article');
  if (!article?.trim()) return NextResponse.json({ images: [] });

  // Sanitise: strip path traversal characters
  const safe = article.replace(/[^a-zA-Z0-9_\-]/g, '');
  const dir = path.join(ROOT_DIR, 'public', 'uploads', 'products', safe);

  if (!fs.existsSync(dir)) return NextResponse.json({ images: [] });

  try {
    const files = fs.readdirSync(dir)
      .filter(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f))
      .map(f => `/uploads/products/${safe}/${f}`);  // path relative to /api/uploads/…

    return NextResponse.json({ images: files });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
