import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LlmProvider, LlmModule } from '@/app/actions/llm';
import { callLlm } from '@/lib/llmCall';

export const maxDuration = 3600; // Allow up to 1 hour for local AI models

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const roles: string[] = (session.user as any).roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  // Check AI permission
  if (!isAdmin) {
    const aiPerm = await prisma.rolePermission.findFirst({
      where: { role: { name: { in: roles } }, module: 'MENU:ai', action: 'ALLOW' },
    });
    if (!aiPerm) {
      return NextResponse.json({ error: 'Geen toegang tot AI functionaliteit.' }, { status: 403 });
    }
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  const { provider, model: explicitModel, prompt, systemPrompt, context } = await request.json() as {
    provider: LlmProvider;
    model?: string;
    prompt: string;
    systemPrompt?: string;
    context?: string;
  };

  if (!provider || !prompt?.trim()) {
    return NextResponse.json({ error: 'Provider en prompt zijn verplicht.' }, { status: 400 });
  }

  // ── Context to Module ──────────────────────────────────────────────────────
  let moduleId: LlmModule = 'assistant';
  if (context === 'product-analysis') moduleId = 'analysis';
  if (context === 'image-edit' || context === 'vision') moduleId = 'vision';

  // ── Call provider (shared helper also logs usage) ───────────────────────────
  const result = await callLlm({ provider, model: explicitModel, prompt, systemPrompt, moduleId, userId, context });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    response: result.response,
    model:    result.model,
    usage:    result.usage,
  });
}
