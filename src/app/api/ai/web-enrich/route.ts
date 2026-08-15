import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getLlmProviderConfigInternal, LlmProvider } from '@/app/actions/llm';
import { estimateCost } from '@/lib/llmUtils';
import { aggregateProductWebData } from '@/lib/webEnrichService';

export const maxDuration = 60; // Allow up to 60s for web search + LLM parsing

const SYSTEM_PROMPT = `Je bent een data-extractie en e-commerce contentspecialist. 
Je taak is om online opgehaalde productinformatie, zoekresultaten en databasespecificaties te analyseren en om te zetten in gestructureerde veldgegevens voor een webshop.

Geef UITSLUITEND een geldig JSON object terug (geen extra tekst eromheen, geen markdown behalve het json blok) met exact de volgende velden (laat een veld null of leeg als er geen betrouwbare informatie voor is):

\`\`\`json
{
  "shortDescription": "<pakkende, commerciële korte omschrijving van 1-2 zinnen>",
  "longDescription": "<uitgebreide, goed leesbare productomschrijving met alinea's en eventueel bulletpoints>",
  "weightGr": <totaalgewicht inclusief verpakking in hele grammen als nummer of null>,
  "lengthCm": <lengte in cm als nummer of null>,
  "widthCm": <breedte in cm als nummer of null>,
  "heightCm": <hoogte in cm als nummer of null>,
  "volumeMl": <inhoud/volume in ml als nummer of null>,
  "volumeGr": <inhoud in gram als nummer of null>,
  "color": "<kleur van het product of verpakking>",
  "mainMaterial": "<hoofdmateriaal van de verpakking/fles/pot, bijv. Glas, Aluminium, Karton, Plastic, Bamboe, etc.>",
  "material": "<aanvullende materialen>",
  "ingredients": "<volledige ingrediëntenlijst gescheiden door komma's of bullets>",
  "allergens": "<allergenen, of '-' indien diervrij/allergeenvrij>",
  "tags": "<komma-gescheiden zoekwoorden/tags>",
  "seoTitle": "<geoptimaliseerde SEO titel, max 60 tekens>",
  "seoMetaDescription": "<wervende meta omschrijving, max 155 tekens>",
  "summary": "<1-2 zinnen toelichting over welke bronnen en specificaties online zijn gevonden>"
}
\`\`\``;

export async function POST(request: NextRequest) {
  // ── 1. Auth & Permission Check ──────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const roles: string[] = (session.user as any).roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');

  if (!isAdmin) {
    const aiPerm = await prisma.rolePermission.findFirst({
      where: { role: { name: { in: roles } }, module: 'MENU:ai', action: 'ALLOW' },
    });
    if (!aiPerm) {
      return NextResponse.json({ error: 'Geen toegang tot AI functionaliteit.' }, { status: 403 });
    }
  }

  // ── 2. Parse request body ───────────────────────────────────────────────────
  const body = await request.json() as {
    articleNumber?: string;
    title?: string;
    brand?: string;
    ean?: string;
    price?: string | number;
    customUrl?: string;
    provider?: LlmProvider;
    model?: string;
  };

  const { title, brand, ean, price, customUrl, articleNumber } = body;
  const provider: LlmProvider = body.provider || 'openai';

  if (!title && !ean && !customUrl) {
    return NextResponse.json({ error: 'Geef minimaal een Titel, EAN of URL op om te zoeken.' }, { status: 400 });
  }

  // ── 3. Aggregate Web Data ───────────────────────────────────────────────────
  const webData = await aggregateProductWebData({
    title,
    brand,
    ean,
    price,
    customUrl,
  });

  if (!webData.textContent && webData.sources.length === 0) {
    return NextResponse.json({
      error: 'Geen online informatie gevonden voor deze zoekopdracht. Probeer een direct product-URL in te vullen of zoektermen aan te passen.',
      sources: [],
      data: null,
    }, { status: 404 });
  }

  // ── 4. Build Prompt for LLM ─────────────────────────────────────────────────
  const promptText = `Analyseer de volgende online opgehaalde gegevens voor dit product en vul de gevraagde velden zo compleet en accuraat mogelijk in:

--- Zoekgegevens Product ---
Titel: ${title || 'Onbekend'}
Merk: ${brand || 'Onbekend'}
EAN: ${ean || 'Onbekend'}
Prijs: ${price ? `€${price}` : 'Onbekend'}
${customUrl ? `Opgegeven URL: ${customUrl}` : ''}

--- Gevonden Online Data & Bronnen ---
${webData.textContent}

Vul alle velden in volgens het vereiste JSON formaat. Geef alleen het JSON object terug.`;

  // ── 5. LLM Call ─────────────────────────────────────────────────────────────
  const config = await getLlmProviderConfigInternal(provider);
  if (!config?.apiKey) {
    return NextResponse.json({ error: `Geen API key geconfigureerd voor ${provider}.` }, { status: 400 });
  }

  const moduleCfg = config.modules.analysis || config.modules.assistant;
  const modelToUse = body.model || moduleCfg.model;
  const maxOut = moduleCfg.maxOutputTokens || 3000;

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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: promptText },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'OpenAI fout');
      responseText = data.choices[0]?.message?.content ?? '';
      inputTokens = data.usage?.prompt_tokens ?? 0;
      outputTokens = data.usage?.completion_tokens ?? 0;

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
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: promptText }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic fout');
      responseText = data.content?.[0]?.text ?? '';
      inputTokens = data.usage?.input_tokens ?? 0;
      outputTokens = data.usage?.output_tokens ?? 0;

    } else if (provider === 'gemini') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${config.apiKey}`;
      const parts = [
        { text: SYSTEM_PROMPT + '\n\n' },
        { text: promptText },
      ];
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
      responseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    }
  } catch (e: any) {
    success = false;
    errorMsg = e.message;
  }

  const durationMs = Date.now() - startMs;
  const costUsd = estimateCost(modelToUse, inputTokens, outputTokens);

  // ── 6. Log LLM Usage ────────────────────────────────────────────────────────
  await prisma.llmUsageLog.create({
    data: {
      userId,
      provider,
      model: modelToUse,
      inputTokens,
      outputTokens,
      durationMs,
      costUsd,
      success,
      errorMsg,
      promptSnippet: `Web-enrich: ${title || ean || ''}`.slice(0, 500),
      context: 'web-enrich',
    },
  });

  if (!success) {
    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }

  // ── 7. Parse Clean JSON Response ────────────────────────────────────────────
  let parsedFields: Record<string, any> = {};
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    parsedFields = JSON.parse(cleaned);
  } catch (e) {
    // Attempt greedy JSON match
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsedFields = JSON.parse(jsonMatch[0]); }
      catch { /**/ }
    }
  }

  return NextResponse.json({
    success: true,
    data: parsedFields,
    sources: webData.sources,
    model: modelToUse,
    usage: { inputTokens, outputTokens, durationMs, costUsd },
  });
}
