import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVisionModelForProvider, getVisionProviderConfigInternal, LlmProvider } from '@/app/actions/llm';
import { prisma } from '@/lib/prisma';

const PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'gemini'];

function visionSettingKey(provider: LlmProvider) {
  return `llm_vision_model_${provider}`;
}

/**
 * GET /api/ai/vision-config
 * Returns the configured vision model per provider (admin only).
 * Also returns hasApiKey so the UI knows which providers are usable.
 */
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const roles: string[] = (session.user as any).roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  if (!isAdmin) return NextResponse.json({ error: 'Alleen admins.' }, { status: 403 });

  const configs = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const visionModel = await getVisionModelForProvider(provider);
      const main = await getVisionProviderConfigInternal(provider);
      return { provider, visionModel, hasApiKey: !!main?.apiKey };
    })
  );

  return NextResponse.json(configs);
}

/**
 * POST /api/ai/vision-config
 * Body: { provider: string; visionModel: string }
 * Saves the vision model selection for a provider (admin only).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const roles: string[] = (session.user as any).roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  if (!isAdmin) return NextResponse.json({ error: 'Alleen admins.' }, { status: 403 });

  const body = await request.json() as { provider: LlmProvider; visionModel: string };
  const { provider, visionModel } = body;

  if (!provider || !visionModel?.trim()) {
    return NextResponse.json({ error: 'provider en visionModel zijn verplicht.' }, { status: 400 });
  }
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Ongeldige provider.' }, { status: 400 });
  }

  await prisma.systemSetting.upsert({
    where:  { key: visionSettingKey(provider) },
    update: { value: visionModel },
    create: { key: visionSettingKey(provider), value: visionModel },
  });

  return NextResponse.json({ success: true, provider, visionModel });
}
