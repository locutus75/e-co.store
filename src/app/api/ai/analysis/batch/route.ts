import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callLlm, resolveAnalysisProvider } from '@/lib/llmCall';
import type { LlmProvider } from '@/app/actions/llm';

export const maxDuration = 3600;

const BATCH_SYSTEM_PROMPT = `Je bent een product content specialist voor een Nederlandse webshop (e-co.store).
Analyseer de aangeboden producten op volledigheid van de data, kwaliteit van de teksten, eventuele verbeterpunten en aanbevelingen in verzorgd Nederlands.

BELANGRIJK:
- Beoordeel alle producten in de batch op exact dezelfde consistente wijze en met dezelfde maatstaf.
- Antwoord UITSLUITEND met een geldig JSON-object (zonder markdown-codeblokken) in dit exacte formaat:
{
  "items": [
    {
      "articleNumber": "<exact artikelnummer>",
      "score": <0-100>,
      "summary": "<één tot twee zinnen samenvatting>",
      "strengths": ["<sterk punt 1>", "<sterk punt 2>"],
      "missing_fields": ["<ontbrekend of onvolledig veld 1>", "<ontbrekend of onvolledig veld 2>"],
      "recommendations": ["<concrete aanbeveling 1>", "<concrete aanbeveling 2>"]
    }
  ]
}`;

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const body = (await request.json()) as {
    items: { articleNumber: string; productText: string }[];
    provider?: LlmProvider;
  };

  const items = Array.isArray(body.items) ? body.items.filter((i) => i?.articleNumber) : [];
  if (items.length === 0) {
    return NextResponse.json({ results: [] });
  }

  let provider: LlmProvider | null = body.provider ?? null;
  if (!provider) {
    provider = await resolveAnalysisProvider();
  }
  if (!provider) {
    return NextResponse.json(
      { error: 'Geen AI provider met API key geconfigureerd. Stel dit in via Systeeminstellingen.' },
      { status: 400 }
    );
  }

  const userPrompt = items
    .map(
      (item, idx) =>
        `=== PRODUCT ${idx + 1} (articleNumber: "${item.articleNumber}") ===\n${item.productText}`
    )
    .join('\n\n');

  const llm = await callLlm({
    provider,
    prompt: userPrompt,
    systemPrompt: BATCH_SYSTEM_PROMPT,
    moduleId: 'analysis',
    userId,
    context: 'product-analysis-batch',
  });

  if (!llm.success) {
    return NextResponse.json({ error: llm.error }, { status: llm.status });
  }

  let parsedItems: any[] = [];
  try {
    const cleaned = llm.response
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    const jsonSlice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
    const obj = JSON.parse(jsonSlice);
    if (Array.isArray(obj?.items)) parsedItems = obj.items;
    else if (Array.isArray(obj)) parsedItems = obj;
  } catch {
    return NextResponse.json(
      { error: 'Het AI-antwoord voor de analyse-batch kon niet als JSON worden gelezen.' },
      { status: 502 }
    );
  }

  const byArt = new Map<string, any>();
  for (const item of parsedItems) {
    if (item?.articleNumber) {
      byArt.set(String(item.articleNumber), item);
    }
  }

  const perItemIn = Math.round(llm.usage.inputTokens / items.length);
  const perItemOut = Math.round(llm.usage.outputTokens / items.length);
  const perItemCost = llm.usage.costUsd / items.length;

  const results: { articleNumber: string; ok: boolean; score: number | null; error?: string }[] = [];

  for (const reqItem of items) {
    const ai = byArt.get(reqItem.articleNumber);
    if (!ai) {
      results.push({
        articleNumber: reqItem.articleNumber,
        ok: false,
        score: null,
        error: 'Geen analyse ontvangen in batch-antwoord',
      });
      continue;
    }

    const score = ai.score != null && !Number.isNaN(Number(ai.score)) ? Number(ai.score) : null;
    const summary = String(ai.summary ?? '');
    const strengths: string[] = Array.isArray(ai.strengths) ? ai.strengths.map(String) : [];
    const missingFields: string[] = Array.isArray(ai.missing_fields) ? ai.missing_fields.map(String) : [];
    const recommendations: string[] = Array.isArray(ai.recommendations) ? ai.recommendations.map(String) : [];

    const structuredObj = {
      score,
      summary,
      strengths,
      missing_fields: missingFields,
      recommendations,
    };

    const markdownResponse = [
      `## Samenvatting\n${summary || 'Geen samenvatting beschikbaar.'}`,
      `## Sterktes\n${strengths.length > 0 ? strengths.map((s) => `- ${s}`).join('\n') : '- Geen specifieke sterktes vermeld.'}`,
      `## Verbeterpunten\n${missingFields.length > 0 ? missingFields.map((s) => `- ${s}`).join('\n') : '- Geen ontbrekende velden gemeld.'}`,
      `## Aanbevelingen\n${recommendations.length > 0 ? recommendations.map((s) => `- ${s}`).join('\n') : '- Geen aanvullende aanbevelingen.'}`,
      `\`\`\`json\n${JSON.stringify(structuredObj, null, 2)}\n\`\`\``,
    ].join('\n\n');

    await prisma.productAiAnalysis.upsert({
      where: { articleNumber: reqItem.articleNumber },
      update: {
        provider,
        model: llm.model,
        response: markdownResponse,
        structuredData: JSON.stringify(structuredObj),
        score,
        inputTokens: perItemIn,
        outputTokens: perItemOut,
        costUsd: perItemCost,
      },
      create: {
        articleNumber: reqItem.articleNumber,
        provider,
        model: llm.model,
        response: markdownResponse,
        structuredData: JSON.stringify(structuredObj),
        score,
        inputTokens: perItemIn,
        outputTokens: perItemOut,
        costUsd: perItemCost,
      },
    });

    results.push({
      articleNumber: reqItem.articleNumber,
      ok: true,
      score,
    });
  }

  return NextResponse.json({ results });
}

