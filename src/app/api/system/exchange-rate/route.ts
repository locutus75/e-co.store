import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SETTING_KEY = 'exchange_rate_usd_eur';
const DEFAULT_RATE = 0.92;

/** Shape stored as JSON in SystemSetting.value */
interface RateRecord {
  rate: number;
  updatedAt: string; // ISO
  source: 'manual' | 'api';
}

async function isAdmin(session: any): Promise<boolean> {
  const roles: string[] = (session?.user as any)?.roles ?? [];
  return roles.some((r: string) => r.toUpperCase() === 'ADMIN');
}

/**
 * GET /api/system/exchange-rate
 * Returns current USD→EUR rate from DB, or default if not set yet.
 * Open to any authenticated user.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) {
    return NextResponse.json({ rate: DEFAULT_RATE, updatedAt: null, source: 'default' });
  }

  try {
    const data = JSON.parse(row.value) as RateRecord;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ rate: DEFAULT_RATE, updatedAt: null, source: 'default' });
  }
}

/**
 * POST /api/system/exchange-rate
 * Body: { action: 'refresh' }         → fetch live rate from Frankfurter API
 *       { action: 'manual', rate: X } → store a manually entered rate
 * Admin-only.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  if (!(await isAdmin(session))) return NextResponse.json({ error: 'Alleen admins.' }, { status: 403 });

  const body = await request.json() as { action: 'refresh' | 'manual'; rate?: number };

  let rate: number;
  let source: 'manual' | 'api';

  if (body.action === 'refresh') {
    try {
      // Frankfurter.app is free, no API key, backed by ECB data
      const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Frankfurter API: ${res.status}`);
      const data = await res.json() as { rates: { EUR: number }; date: string };
      rate = data.rates.EUR;
      source = 'api';
      console.log(`[exchange-rate] Fetched live rate: 1 USD = ${rate} EUR (date: ${data.date})`);
    } catch (err: any) {
      console.error('[exchange-rate] Failed to fetch live rate:', err.message);
      return NextResponse.json({ error: `Kan live koers niet ophalen: ${err.message}` }, { status: 502 });
    }
  } else if (body.action === 'manual' && typeof body.rate === 'number' && body.rate > 0) {
    rate = body.rate;
    source = 'manual';
  } else {
    return NextResponse.json({ error: 'Ongeldig verzoek.' }, { status: 400 });
  }

  const record: RateRecord = { rate, updatedAt: new Date().toISOString(), source };

  await prisma.systemSetting.upsert({
    where:  { key: SETTING_KEY },
    update: { value: JSON.stringify(record) },
    create: { key: SETTING_KEY, value: JSON.stringify(record) },
  });

  return NextResponse.json(record);
}
