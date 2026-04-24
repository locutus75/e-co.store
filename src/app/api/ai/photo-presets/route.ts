import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const PRESET_KEY_PREFIX = 'ai_photo_presets_';

function settingKey(fieldId: string) {
  return `${PRESET_KEY_PREFIX}${fieldId}`;
}

async function assertAdmin(session: any) {
  const roles: string[] = (session?.user as any)?.roles ?? [];
  return roles.some((r: string) => r.toUpperCase() === 'ADMIN');
}

/**
 * GET /api/ai/photo-presets?fieldId=FIELD:media
 * Returns the list of preset instruction strings for a media field.
 * Public to any authenticated user (they only need to read).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const fieldId = request.nextUrl.searchParams.get('fieldId');
  if (!fieldId) return NextResponse.json({ presets: [] });

  const row = await prisma.systemSetting.findUnique({ where: { key: settingKey(fieldId) } });
  const presets: string[] = row ? JSON.parse(row.value) : [];

  return NextResponse.json({ fieldId, presets });
}

/**
 * POST /api/ai/photo-presets
 * Body: { fieldId: string, presets: string[] }
 * Admin-only: overwrites the full preset list for the field.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  if (!(await assertAdmin(session))) return NextResponse.json({ error: 'Alleen admins.' }, { status: 403 });

  const body = await request.json() as { fieldId: string; presets: string[] };
  const { fieldId, presets } = body;

  if (!fieldId || !Array.isArray(presets)) {
    return NextResponse.json({ error: 'fieldId en presets[] zijn verplicht.' }, { status: 400 });
  }

  const clean = presets.map((p: string) => p.trim()).filter(Boolean);

  await prisma.systemSetting.upsert({
    where:  { key: settingKey(fieldId) },
    update: { value: JSON.stringify(clean) },
    create: { key: settingKey(fieldId), value: JSON.stringify(clean) },
  });

  console.log(`[photo-presets] Saved ${clean.length} presets for field ${fieldId}`);

  return NextResponse.json({ success: true, fieldId, count: clean.length });
}
