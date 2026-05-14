import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LlmProvider, LlmProviderConfig } from '@/app/actions/llm';

const PROVIDERS: LlmProvider[] = ['openai', 'anthropic', 'gemini', 'custom'];

const DEFAULTS: Record<LlmProvider, Omit<LlmProviderConfig, 'apiKey'>> = {
  openai: {
    provider: 'openai', label: 'OpenAI', enabled: true,
    modules: {
      assistant: { model: 'gpt-4o', maxInputTokens: 4000, maxOutputTokens: 2000 },
      analysis:  { model: 'gpt-4o', maxInputTokens: 8000, maxOutputTokens: 4000 },
      vision:    { model: 'gpt-4o', maxInputTokens: 4000, maxOutputTokens: 2000 },
    }
  },
  anthropic: {
    provider: 'anthropic', label: 'Anthropic', enabled: true,
    modules: {
      assistant: { model: 'claude-sonnet-4-6', maxInputTokens: 4000, maxOutputTokens: 2000 },
      analysis:  { model: 'claude-sonnet-4-6', maxInputTokens: 8000, maxOutputTokens: 4000 },
      vision:    { model: 'claude-sonnet-4-6', maxInputTokens: 4000, maxOutputTokens: 2000 },
    }
  },
  gemini: {
    provider: 'gemini', label: 'Google Gemini', enabled: true,
    modules: {
      assistant: { model: 'gemini-1.5-pro', maxInputTokens: 4000, maxOutputTokens: 2000 },
      analysis:  { model: 'gemini-1.5-pro', maxInputTokens: 8000, maxOutputTokens: 4000 },
      vision:    { model: 'gemini-1.5-pro', maxInputTokens: 4000, maxOutputTokens: 2000 },
    }
  },
  custom: {
    provider: 'custom', label: 'Custom (LM Studio)', enabled: true, baseURL: 'http://localhost:1234/v1',
    modules: {
      assistant: { model: 'local-model', maxInputTokens: 4000, maxOutputTokens: 2000 },
      analysis:  { model: 'local-model', maxInputTokens: 8000, maxOutputTokens: 4000 },
      vision:    { model: 'local-model', maxInputTokens: 4000, maxOutputTokens: 2000 },
    }
  },
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
        const parsed = JSON.parse(row.value);
        // Use migration logic if needed
        if (parsed.activeModel && !parsed.modules) {
          const { apiKey: _key, ...rest } = parsed;
          return {
            ...rest,
            hasApiKey: !!_key,
            modules: {
              assistant: { model: parsed.activeModel, maxInputTokens: parsed.maxInputTokens, maxOutputTokens: parsed.maxOutputTokens },
              analysis: DEFAULTS[provider].modules.analysis,
              vision: DEFAULTS[provider].modules.vision,
            }
          };
        }
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
  const { provider, apiKey: rawKey, baseURL, ...rest } = body;

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

  const safeBaseURL = (provider === 'custom' && baseURL) ? baseURL : undefined;
  await prisma.systemSetting.upsert({
    where:  { key: settingKey(provider) },
    update: { value: JSON.stringify({ provider, ...rest, apiKey, baseURL: safeBaseURL }) },
    create: { key: settingKey(provider), value: JSON.stringify({ provider, ...rest, apiKey, baseURL: safeBaseURL }) },
  });

  return NextResponse.json({ success: true, provider });
}
