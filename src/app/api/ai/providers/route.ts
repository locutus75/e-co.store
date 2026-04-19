import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAvailableProvidersAction } from '@/app/actions/llm';

/** Returns which providers have an API key configured (no keys exposed). */
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }
  const configs = await getAvailableProvidersAction();
  return NextResponse.json(configs);
}
