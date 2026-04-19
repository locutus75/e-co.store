'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { estimateCost } from '@/lib/llmUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic' | 'gemini';

export interface LlmProviderConfig {
  provider: LlmProvider;
  label: string;
  apiKey: string;
  activeModel: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  enabled: boolean;
}

export interface LlmProviderPublic extends Omit<LlmProviderConfig, 'apiKey'> {
  hasApiKey: boolean;
}

// ── System Setting Keys ───────────────────────────────────────────────────────

function settingKey(provider: LlmProvider) {
  return `llm_config_${provider}`;
}

const DEFAULTS: Record<LlmProvider, Omit<LlmProviderConfig, 'apiKey'>> = {
  openai:    { provider: 'openai',    label: 'OpenAI',          activeModel: 'gpt-4o',                    maxInputTokens: 4000, maxOutputTokens: 2000, enabled: true },
  anthropic: { provider: 'anthropic', label: 'Anthropic',       activeModel: 'claude-3-5-sonnet-20241022', maxInputTokens: 4000, maxOutputTokens: 2000, enabled: true },
  gemini:    { provider: 'gemini',    label: 'Google Gemini',   activeModel: 'gemini-1.5-pro',             maxInputTokens: 4000, maxOutputTokens: 2000, enabled: true },
};

// ── Admin: read/write config ──────────────────────────────────────────────────

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  if (!roles.some((r: string) => r.toUpperCase() === 'ADMIN')) {
    throw new Error('Alleen admins mogen LLM instellingen beheren.');
  }
  return session!;
}

/** Allows both admins and users with the MENU:ai role permission */
async function assertAiAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Niet ingelogd.');
  const roles: string[] = (session.user as any)?.roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  if (isAdmin) return session;
  const perm = await prisma.rolePermission.findFirst({
    where: { role: { name: { in: roles } }, module: 'MENU:ai', action: 'ALLOW' },
  });
  if (!perm) throw new Error('Geen toegang tot AI functies.');
  return session;
}

/** Read provider list — usable by anyone with AI access (no API keys exposed) */
export async function getAvailableProvidersAction(): Promise<LlmProviderPublic[]> {
  await assertAiAccess();
  const results: LlmProviderPublic[] = [];
  for (const provider of ['openai', 'anthropic', 'gemini'] as LlmProvider[]) {
    const row = await prisma.systemSetting.findUnique({ where: { key: settingKey(provider) } });
    if (row) {
      const parsed: LlmProviderConfig = JSON.parse(row.value);
      const { apiKey: _key, ...rest } = parsed;
      results.push({ ...rest, hasApiKey: !!_key });
    } else {
      results.push({ ...DEFAULTS[provider], hasApiKey: false });
    }
  }
  return results;
}

/** Admin-only: read full config list */
export async function getLlmConfigsAction(): Promise<LlmProviderPublic[]> {
  await assertAdmin();
  const results: LlmProviderPublic[] = [];
  for (const provider of ['openai', 'anthropic', 'gemini'] as LlmProvider[]) {
    const row = await prisma.systemSetting.findUnique({ where: { key: settingKey(provider) } });
    if (row) {
      const parsed: LlmProviderConfig = JSON.parse(row.value);
      const { apiKey: _key, ...rest } = parsed;
      results.push({ ...rest, hasApiKey: !!_key });
    } else {
      results.push({ ...DEFAULTS[provider], hasApiKey: false });
    }
  }
  return results;
}

export async function saveLlmConfigAction(config: LlmProviderConfig): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    // If apiKey is blank, preserve existing key
    const existing = await prisma.systemSetting.findUnique({ where: { key: settingKey(config.provider) } });
    let apiKey = config.apiKey;
    if (!apiKey && existing) {
      const parsed: LlmProviderConfig = JSON.parse(existing.value);
      apiKey = parsed.apiKey;
    }
    await prisma.systemSetting.upsert({
      where:  { key: settingKey(config.provider) },
      update: { value: JSON.stringify({ ...config, apiKey }) },
      create: { key: settingKey(config.provider), value: JSON.stringify({ ...config, apiKey }) },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Internal: get full config (with key) ─────────────────────────────────────

export async function getLlmProviderConfigInternal(provider: LlmProvider): Promise<LlmProviderConfig | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: settingKey(provider) } });
  if (!row) return null;
  return JSON.parse(row.value) as LlmProviderConfig;
}

// ── Usage stats ───────────────────────────────────────────────────────────────

export interface LlmStatsResult {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byProvider: { provider: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  byModel: { model: string; provider: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  byUser: { userId: string; email: string; requests: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  byDay: { date: string; requests: number; inputTokens: number; outputTokens: number }[];
}

export async function getLlmUsageStatsAction(period: '7d' | '30d' | 'all' = '30d'): Promise<LlmStatsResult> {
  await assertAdmin();

  const since = period === 'all' ? undefined : new Date(Date.now() - (period === '7d' ? 7 : 30) * 86_400_000);
  const where = since ? { createdAt: { gte: since } } : {};

  const logs = await prisma.llmUsageLog.findMany({
    where,
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Aggregate
  const provMap = new Map<string, any>();
  const modelMap = new Map<string, any>();
  const userMap = new Map<string, any>();
  const dayMap = new Map<string, any>();

  for (const log of logs) {
    // By provider
    const pk = log.provider;
    if (!provMap.has(pk)) provMap.set(pk, { provider: pk, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    const pv = provMap.get(pk);
    pv.requests++; pv.inputTokens += log.inputTokens; pv.outputTokens += log.outputTokens; pv.costUsd += log.costUsd;

    // By model
    const mk = `${log.provider}::${log.model}`;
    if (!modelMap.has(mk)) modelMap.set(mk, { model: log.model, provider: log.provider, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    const mv = modelMap.get(mk);
    mv.requests++; mv.inputTokens += log.inputTokens; mv.outputTokens += log.outputTokens; mv.costUsd += log.costUsd;

    // By user
    const uk = log.userId;
    if (!userMap.has(uk)) userMap.set(uk, { userId: uk, email: log.user.email, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    const uv = userMap.get(uk);
    uv.requests++; uv.inputTokens += log.inputTokens; uv.outputTokens += log.outputTokens; uv.costUsd += log.costUsd;

    // By day
    const dk = log.createdAt.toISOString().split('T')[0];
    if (!dayMap.has(dk)) dayMap.set(dk, { date: dk, requests: 0, inputTokens: 0, outputTokens: 0 });
    const dv = dayMap.get(dk);
    dv.requests++; dv.inputTokens += log.inputTokens; dv.outputTokens += log.outputTokens;
  }

  return {
    totalRequests: logs.length,
    totalInputTokens: logs.reduce((s: number, l: any) => s + l.inputTokens, 0),
    totalOutputTokens: logs.reduce((s: number, l: any) => s + l.outputTokens, 0),
    totalCostUsd: logs.reduce((s: number, l: any) => s + l.costUsd, 0),
    byProvider: Array.from(provMap.values()),
    byModel: Array.from(modelMap.values()).sort((a, b) => b.requests - a.requests),
    byUser: Array.from(userMap.values()).sort((a, b) => b.requests - a.requests),
    byDay: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
