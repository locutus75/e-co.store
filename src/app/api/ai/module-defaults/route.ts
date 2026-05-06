import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LlmProvider, LlmModule } from '@/app/actions/llm';

const KEY = 'llm_module_defaults';

export interface ModuleDefaults {
  assistant: LlmProvider;
  analysis: LlmProvider;
  vision: LlmProvider;
}

const DEFAULTS: ModuleDefaults = {
  assistant: 'openai',
  analysis: 'openai',
  vision: 'openai',
};

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;
  const roles: string[] = (session.user as any).roles ?? [];
  return roles.some((r: string) => r.toUpperCase() === 'ADMIN');
}

export async function GET() {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  if (!row) return NextResponse.json(DEFAULTS);
  try {
    return NextResponse.json(JSON.parse(row.value));
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Alleen admins' }, { status: 403 });
  const body = await request.json();
  
  await prisma.systemSetting.upsert({
    where:  { key: KEY },
    update: { value: JSON.stringify(body) },
    create: { key: KEY, value: JSON.stringify(body) },
  });

  return NextResponse.json({ success: true });
}
