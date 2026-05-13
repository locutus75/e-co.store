'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { estimateCost } from '@/lib/llmUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic' | 'gemini';

export interface LlmModuleConfig {
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  systemPrompt?: string;
}

export type LlmModule = 'assistant' | 'analysis' | 'vision';

export interface LlmProviderConfig {
  provider: LlmProvider;
  label: string;
  apiKey: string;
  enabled: boolean;
  modules: Record<LlmModule, LlmModuleConfig>;
  fetchedModels?: { id: string; label: string }[] | null;
}

export interface LlmProviderPublic extends Omit<LlmProviderConfig, 'apiKey'> {
  hasApiKey: boolean;
}

// ── System Setting Keys ───────────────────────────────────────────────────────

function settingKey(provider: LlmProvider) {
  return `llm_config_${provider}`;
}

const MODULE_DEFAULTS: Record<LlmProvider, Record<LlmModule, LlmModuleConfig>> = {
  openai: {
    assistant: { model: 'gpt-4o', maxInputTokens: 4000, maxOutputTokens: 2000 },
    analysis:  { model: 'gpt-4o', maxInputTokens: 8000, maxOutputTokens: 4000, systemPrompt: 'Je bent een product expert. Analyseer het product op basis van de verstrekte gegevens.' },
    vision:    { model: 'gpt-4o', maxInputTokens: 4000, maxOutputTokens: 2000 },
  },
  anthropic: {
    assistant: { model: 'claude-sonnet-4-6-20260401', maxInputTokens: 4000, maxOutputTokens: 2000 },
    analysis:  { model: 'claude-sonnet-4-6-20260401', maxInputTokens: 8000, maxOutputTokens: 4000, systemPrompt: 'Je bent een product expert. Analyseer het product op basis van de verstrekte gegevens.' },
    vision:    { model: 'claude-sonnet-4-6-20260401', maxInputTokens: 4000, maxOutputTokens: 2000 },
  },
  gemini: {
    assistant: { model: 'gemini-1.5-pro', maxInputTokens: 4000, maxOutputTokens: 2000 },
    analysis:  { model: 'gemini-1.5-pro', maxInputTokens: 8000, maxOutputTokens: 4000, systemPrompt: 'Je bent een product expert. Analyseer het product op basis van de verstrekte gegevens.' },
    vision:    { model: 'gemini-1.5-pro', maxInputTokens: 4000, maxOutputTokens: 2000 },
  },
};

const DEFAULTS: Record<LlmProvider, Omit<LlmProviderConfig, 'apiKey'>> = {
  openai:    { provider: 'openai',    label: 'OpenAI',          enabled: true, modules: MODULE_DEFAULTS.openai },
  anthropic: { provider: 'anthropic', label: 'Anthropic',       enabled: true, modules: MODULE_DEFAULTS.anthropic },
  gemini:    { provider: 'gemini',    label: 'Google Gemini',   enabled: true, modules: MODULE_DEFAULTS.gemini },
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

function parseAndMigrateConfig(provider: LlmProvider, value: string): LlmProviderConfig {
  const parsed = JSON.parse(value);
  
  // Migration: if it's the old flat structure, convert to nested modules
  // We check for activeModel AND the absence of the new modules structure.
  if (!parsed.modules) {
    const activeModel = parsed.activeModel || MODULE_DEFAULTS[provider].assistant.model;
    
    // Safety check: if the activeModel doesn't look like it belongs to this provider, use the default
    const isGpt = activeModel.toLowerCase().includes('gpt');
    const isClaude = activeModel.toLowerCase().includes('claude');
    const isGemini = activeModel.toLowerCase().includes('gemini');
    
    let finalModel = activeModel;
    if (provider === 'openai' && !isGpt) finalModel = MODULE_DEFAULTS.openai.assistant.model;
    if (provider === 'anthropic' && !isClaude) finalModel = MODULE_DEFAULTS.anthropic.assistant.model;
    if (provider === 'gemini' && !isGemini) finalModel = MODULE_DEFAULTS.gemini.assistant.model;

    return {
      provider: parsed.provider || provider,
      label: parsed.label || (provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'Google Gemini'),
      apiKey: parsed.apiKey || '',
      enabled: parsed.enabled ?? true,
      modules: {
        assistant: {
          model: finalModel,
          maxInputTokens: parsed.maxInputTokens ?? MODULE_DEFAULTS[provider].assistant.maxInputTokens,
          maxOutputTokens: parsed.maxOutputTokens ?? MODULE_DEFAULTS[provider].assistant.maxOutputTokens,
        },
        analysis: MODULE_DEFAULTS[provider].analysis,
        vision:   MODULE_DEFAULTS[provider].vision,
      },
      fetchedModels: parsed.fetchedModels ?? null
    };
  }
  
  return parsed as LlmProviderConfig;
}

/** Read provider list — usable by anyone with AI access (no API keys exposed) */
export async function getAvailableProvidersAction(): Promise<LlmProviderPublic[]> {
  await assertAiAccess();
  const results: LlmProviderPublic[] = [];
  for (const provider of ['openai', 'anthropic', 'gemini'] as LlmProvider[]) {
    const row = await prisma.systemSetting.findUnique({ where: { key: settingKey(provider) } });
    if (row) {
      const parsed = parseAndMigrateConfig(provider, row.value);
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
      const parsed = parseAndMigrateConfig(provider, row.value);
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
  try {
    return parseAndMigrateConfig(provider, row.value);
  } catch {
    return null;
  }
}

/** Get specific module config for a provider */
export async function getModuleConfig(provider: LlmProvider, module: LlmModule): Promise<LlmModuleConfig & { apiKey: string } | null> {
  const full = await getLlmProviderConfigInternal(provider);
  if (!full || !full.apiKey) return null;
  return { ...full.modules[module], apiKey: full.apiKey };
}

// ── Vision / Image-edit config ───────────────────────────────────────────────
// Stores only the model override for vision tasks — API key is reused from the
// main provider config and never duplicated.

function visionSettingKey(provider: LlmProvider) {
  return `llm_vision_model_${provider}`;
}

const VISION_MODEL_DEFAULTS: Record<LlmProvider, string> = {
  openai:    'gpt-4o',
  anthropic: 'claude-sonnet-4-6-20260401',
  gemini:    'gemini-1.5-pro',
};

export interface VisionProviderConfig {
  provider: LlmProvider;
  visionModel: string;
}

/** Admin-only: save the vision-model selection for a provider */
export async function saveVisionConfigAction(config: VisionProviderConfig): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    await prisma.systemSetting.upsert({
      where:  { key: visionSettingKey(config.provider) },
      update: { value: config.visionModel },
      create: { key: visionSettingKey(config.provider), value: config.visionModel },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Returns the vision model for a provider, falling back to the default */
export async function getVisionModelForProvider(provider: LlmProvider): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: visionSettingKey(provider) } });
  return row?.value ?? VISION_MODEL_DEFAULTS[provider];
}

/** Returns combined vision config (model + API key from main config) for use in API routes */
export async function getVisionProviderConfigInternal(provider: LlmProvider): Promise<(LlmProviderConfig & { visionModel: string }) | null> {
  const main = await getLlmProviderConfigInternal(provider);
  if (!main?.apiKey) return null;
  const visionModel = await getVisionModelForProvider(provider);
  return { ...main, visionModel };
}

/** Read all vision model selections (for admin UI) */
export async function getVisionConfigsAction(): Promise<VisionProviderConfig[]> {
  await assertAdmin();
  const configs: VisionProviderConfig[] = [];
  for (const provider of ['openai', 'anthropic', 'gemini'] as LlmProvider[]) {
    const model = await getVisionModelForProvider(provider);
    configs.push({ provider, visionModel: model });
  }
  return configs;
}

// ── Product Analysis config ──────────────────────────────────────────────────
// Defines the default provider and model for automated product analysis.

const PRODUCT_ANALYSIS_KEY = 'llm_product_analysis_config';

export interface ProductAnalysisConfig {
  provider: LlmProvider;
  model: string;
}

const ANALYSIS_DEFAULT: ProductAnalysisConfig = {
  provider: 'openai',
  model: 'gpt-4o',
};

export async function saveAnalysisConfigAction(config: ProductAnalysisConfig): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();
    await prisma.systemSetting.upsert({
      where:  { key: PRODUCT_ANALYSIS_KEY },
      update: { value: JSON.stringify(config) },
      create: { key: PRODUCT_ANALYSIS_KEY, value: JSON.stringify(config) },
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getAnalysisConfigAction(): Promise<ProductAnalysisConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: PRODUCT_ANALYSIS_KEY } });
  if (!row) return ANALYSIS_DEFAULT;
  try {
    return JSON.parse(row.value) as ProductAnalysisConfig;
  } catch {
    return ANALYSIS_DEFAULT;
  }
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
