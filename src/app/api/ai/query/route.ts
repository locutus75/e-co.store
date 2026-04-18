import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLlmProviderConfigInternal, LlmProvider } from '@/app/actions/llm';
import { estimateCost } from '@/lib/llmUtils';

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
  const { provider, prompt, systemPrompt, context } = await request.json() as {
    provider: LlmProvider;
    prompt: string;
    systemPrompt?: string;
    context?: string;
  };

  if (!provider || !prompt?.trim()) {
    return NextResponse.json({ error: 'Provider en prompt zijn verplicht.' }, { status: 400 });
  }

  // ── Load config ─────────────────────────────────────────────────────────────
  const config = await getLlmProviderConfigInternal(provider);
  if (!config?.apiKey) {
    return NextResponse.json({ error: `Geen API key geconfigureerd voor ${provider}.` }, { status: 400 });
  }

  const startMs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let responseText = '';
  let success = true;
  let errorMsg: string | undefined;

  try {
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.activeModel,
          max_tokens: config.maxOutputTokens,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
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
          model: config.activeModel,
          max_tokens: config.maxOutputTokens,
          system: systemPrompt || undefined,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic fout');
      responseText  = data.content?.[0]?.text ?? '';
      inputTokens   = data.usage?.input_tokens ?? 0;
      outputTokens  = data.usage?.output_tokens ?? 0;

    } else if (provider === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.activeModel}:generateContent?key=${config.apiKey}`;
      const parts = [];
      if (systemPrompt) parts.push({ text: systemPrompt + '\n\n' });
      parts.push({ text: prompt });
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: config.maxOutputTokens },
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
  const costUsd    = estimateCost(config.activeModel, inputTokens, outputTokens);

  // ── Log usage ───────────────────────────────────────────────────────────────
  await prisma.llmUsageLog.create({
    data: {
      userId,
      provider,
      model:         config.activeModel,
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

  if (!success) {
    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }

  return NextResponse.json({
    response: responseText,
    model:    config.activeModel,
    usage: { inputTokens, outputTokens, durationMs, costUsd },
  });
}
