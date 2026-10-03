// Server-side only (uses prisma + API keys) — never import from client components.
import { prisma } from '@/lib/prisma';
import { getLlmProviderConfigInternal, LlmProvider, LlmModule } from '@/app/actions/llm';
import { estimateCost } from '@/lib/llmUtils';

export interface CallLlmOptions {
  provider: LlmProvider;
  model?: string;
  prompt: string;
  systemPrompt?: string;
  moduleId: LlmModule;
  userId: string;
  context?: string;
}

export type CallLlmResult =
  | { success: true; response: string; model: string; usage: { inputTokens: number; outputTokens: number; durationMs: number; costUsd: number } }
  | { success: false; error: string; status: number };

/**
 * Single place that talks to the LLM providers and logs usage.
 * Used by /api/ai/query and server-side features like the EmpCo check.
 */
export async function callLlm(opts: CallLlmOptions): Promise<CallLlmResult> {
  const { provider, model: explicitModel, prompt, systemPrompt, moduleId, userId, context } = opts;

  const config = await getLlmProviderConfigInternal(provider);
  if (!config?.apiKey) {
    return { success: false, error: `Geen API key geconfigureerd voor ${provider}.`, status: 400 };
  }

  const moduleCfg = config.modules[moduleId] || config.modules.assistant;
  const modelToUse = explicitModel || moduleCfg.model;

  // Combine basis context with specific system prompt
  const basisContext = moduleCfg.systemPrompt || '';
  const finalSystemPrompt = [basisContext, systemPrompt].filter(Boolean).join('\n\n');

  const maxOut = moduleCfg.maxOutputTokens || 2000;

  const startMs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let responseText = '';
  let success = true;
  let errorMsg: string | undefined;

  try {
    if (provider === 'openai' || provider === 'custom') {
      const baseUrl = (provider === 'custom' && config.baseURL) ? config.baseURL.replace(/\/$/, '') : 'https://api.openai.com/v1';
      const headers: any = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelToUse,
          max_completion_tokens: maxOut,
          messages: [
            ...(finalSystemPrompt ? [{ role: 'system', content: finalSystemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'OpenAI fout');
      responseText  = data.choices[0]?.message?.content ?? '';
      inputTokens   = data.usage?.prompt_tokens ?? 0;
      outputTokens  = data.usage?.completion_tokens ?? 0;

    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelToUse,
          max_tokens: maxOut,
          system: finalSystemPrompt || undefined,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic fout');
      responseText  = data.content?.[0]?.text ?? '';
      inputTokens   = data.usage?.input_tokens ?? 0;
      outputTokens  = data.usage?.output_tokens ?? 0;

    } else if (provider === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${config.apiKey}`;
      const parts = [];
      if (finalSystemPrompt) parts.push({ text: finalSystemPrompt + '\n\n' });
      parts.push({ text: prompt });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: maxOut },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Gemini fout');
      responseText  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      inputTokens   = data.usageMetadata?.promptTokenCount ?? 0;
      outputTokens  = data.usageMetadata?.candidatesTokenCount ?? 0;
    } else {
      throw new Error(`Onbekende provider: ${provider}`);
    }
  } catch (e: any) {
    success  = false;
    errorMsg = e.message;
  }

  const durationMs = Date.now() - startMs;
  const costUsd    = estimateCost(modelToUse, inputTokens, outputTokens);

  // ── Log usage ───────────────────────────────────────────────────────────────
  await prisma.llmUsageLog.create({
    data: {
      userId,
      provider,
      model:         modelToUse,
      inputTokens,
      outputTokens,
      durationMs,
      costUsd,
      success,
      errorMsg,
      promptSnippet: prompt.slice(0, 500),
      context:       context ?? 'standalone',
    },
  });

  if (!success) return { success: false, error: errorMsg ?? 'Onbekende fout', status: 502 };

  return { success: true, response: responseText, model: modelToUse, usage: { inputTokens, outputTokens, durationMs, costUsd } };
}

/** Resolves the provider configured as default for product analysis (falls back to first provider with an API key). */
export async function resolveAnalysisProvider(): Promise<LlmProvider | null> {
  let preferred: LlmProvider | null = null;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: 'llm_module_defaults' } });
    preferred = row ? (JSON.parse(row.value).analysis ?? null) : 'openai';
  } catch { preferred = 'openai'; }

  if (preferred) {
    const cfg = await getLlmProviderConfigInternal(preferred);
    if (cfg?.apiKey) return preferred;
  }
  for (const p of ['openai', 'anthropic', 'gemini', 'custom'] as LlmProvider[]) {
    const cfg = await getLlmProviderConfigInternal(p);
    if (cfg?.apiKey) return p;
  }
  return null;
}
