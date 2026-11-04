import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  executeEcoPosSyncAction,
  getEcoPosSettingsAction,
  triggerAutoEcoPosSyncIfDueAction,
} from '@/app/actions/ecopos';

/**
 * GET /api/system/ecopos/sync
 * Used by background heartbeat or cron to trigger auto-sync when due.
 */
export async function GET() {
  const res = await triggerAutoEcoPosSyncIfDueAction();
  return NextResponse.json(res);
}

/**
 * POST /api/system/ecopos/sync
 * Can be called by EcoPos webhook (with matching X-API-Key / Bearer token) or an authenticated admin
 * to immediately sync specific articleNumbers or all products.
 */
export async function POST(req: NextRequest) {
  const settings = await getEcoPosSettingsAction();
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const apiKeyHeader = req.headers.get('x-api-key')?.trim();

  const hasValidApiKey =
    Boolean(settings.apiKey) &&
    (authHeader === settings.apiKey || apiKeyHeader === settings.apiKey);

  if (!hasValidApiKey) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const articleNumbers = Array.isArray(body?.articleNumbers) ? body.articleNumbers : undefined;

  const result = await executeEcoPosSyncAction({
    articleNumbers,
    fieldModes: settings.fieldModes,
    createNewProducts: settings.createNewProducts,
    onlyActiveInSystem: settings.onlyActiveInSystem,
    isAutoSync: true,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

