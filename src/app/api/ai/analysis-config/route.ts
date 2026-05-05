import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAnalysisConfigAction, saveAnalysisConfigAction } from '@/app/actions/llm';

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const roles: string[] = (session.user as any).roles ?? [];
  return roles.some((r: string) => r.toUpperCase() === 'ADMIN');
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Niet toegestaan' }, { status: 403 });
  const config = await getAnalysisConfigAction();
  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Niet toegestaan' }, { status: 403 });
  const body = await request.json();
  const res = await saveAnalysisConfigAction(body);
  if (res.success) return NextResponse.json({ success: true });
  return NextResponse.json({ error: res.error }, { status: 500 });
}
