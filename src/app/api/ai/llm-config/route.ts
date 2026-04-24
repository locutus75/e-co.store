import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LlmProvider, LlmProviderConfig } from '@/app/actions/llm';

const PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'gemini'];

const DEFAULTS: Record<LlmProvider, Omit<LlmProviderConfig, 'apiKey'>> = {
  openai:    { provider: 'openai',    label: 'OpenAI',        activeModel: 'gpt-4o',                    maxInputTokens: 4000, maxOutputTokens: 2000, enabled: true },
  anthropic: { provider: 'anthropic', label: 'Anthropic',     activeModel: 'claude-3-5-sonnet-20241022', maxInputTokens: 4000, maxOutputTokens: 2000, enabled: true },
  gemini:    { provider: 'gemini',    label: 'Google Gemini', activeModel: 'gemini-1.5-pro',             maxInputTokens: 4000, maxOutputTokens: 2000, enabled: true },
};

function settingKey(provider: LlmProvider) {
  return `llm_config_${provider}`;
}

async function assertAdmin(session: any) {
  const roles: string[] = (session?.user as any)?.roles ?? [];
  return roles.some((r: string) => r.toUpperCase() === 'ADMIN');
}

/**
 * GET /api/ai/llm-config
 * Returns the full LLM config per provider for the admin UI (no API keys).
 */
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  if (!(await assertAdmin(session))) return NextResponse.json({ error: 'Alleen admins.' }, { status: 403 });

  const results = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const row = await prisma.systemSetting.findUnique({ where: { key: settingKey(provider) } });
      if (row) {
        const parsed: LlmProviderConfig = JSON.parse(row.value);
        const { apiKey: _key, ...rest } = parsed;
        return { ...rest, hasApiKey: !!_key };
      }
      return { ...DEFAULTS[provider], hasApiKey: false };
    })
  );

  return NextResponse.json(results);
}

/**
 * POST /api/ai/llm-config
 * Body: { provider, label, apiKey, activeModel, maxInputTokens, maxOutputTokens, enabled }
 * apiKey may be empty string — if so, the existing key is preserved.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  if (!(await assertAdmin(session))) return NextResponse.json({ error: 'Alleen admins.' }, { status: 403 });

  const body = await request.json() as LlmProviderConfig;
  const { provider, apiKey: rawKey, ...rest } = body;

  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Ongeldige provider.' }, { status: 400 });
  }

  // Preserve the existing API key if no new key was provided
  let apiKey = rawKey?.trim() ?? '';
  if (!apiKey) {
    const existing = await prisma.systemSetting.findUnique({ where: { key: settingKey(provider) } });
    if (existing) {
      const parsed: LlmProviderConfig = JSON.parse(existing.value);
      apiKey = parsed.apiKey ?? '';
    }
  }

  await prisma.systemSetting.upsert({
    where:  { key: settingKey(provider) },
    update: { value: JSON.stringify({ provider, ...rest, apiKey }) },
    create: { key: settingKey(provider), value: JSON.stringify({ provider, ...rest, apiKey }) },
  });

  console.log(`[llm-config] Saved ${provider}: model=${rest.activeModel}`);

  return NextResponse.json({ success: true, provider, activeModel: rest.activeModel });
}
