import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getVisionProviderConfigInternal, LlmProvider } from '@/app/actions/llm';
import { estimateCost } from '@/lib/llmUtils';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.env.APP_ROOT || process.cwd();
const UPLOADS_DIR = path.join(ROOT_DIR, 'public', 'uploads', 'products');

// Models that route to the Images Edit API (actual image manipulation)
const IMAGE_EDIT_MODELS = ['gpt-image-1', 'gpt-image-2', 'dall-e-2'];

function isImageEditModel(model: string): boolean {
  return IMAGE_EDIT_MODELS.includes(model.toLowerCase());
}

// ── File helpers ───────────────────────────────────────────────────────────────

function loadImageBuffer(articleNumber: string, filename: string): { buffer: Buffer; mimeType: string; sizeKb: number } | null {
  const safe = path.basename(filename);
  const safeArticle = articleNumber.replace(/[^a-zA-Z0-9_\-]/g, '');
  const filePath = path.join(UPLOADS_DIR, safeArticle, safe);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(safe).toLowerCase().replace('.', '');
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  };
  return { buffer, mimeType: mimeMap[ext] || 'image/jpeg', sizeKb: Math.round(buffer.length / 1024) };
}

function saveEditedImage(articleNumber: string, originalFilename: string, base64Data: string, mimeType: string): string {
  const safeArticle = articleNumber.replace(/[^a-zA-Z0-9_\-]/g, '');
  const dir = path.join(UPLOADS_DIR, safeArticle);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const extMap: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const ext = extMap[mimeType] || '.png';
  const base = path.basename(originalFilename, path.extname(originalFilename));
  const newFilename = `${safeArticle}-ai-${Date.now()}-${base}${ext}`;
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  fs.writeFileSync(path.join(dir, newFilename), Buffer.from(cleanBase64, 'base64'));
  return newFilename;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

async function hasAiAccess(session: any): Promise<boolean> {
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r: string) => r.toUpperCase() === 'ADMIN');
  if (isAdmin) return true;
  const aiPerm = await prisma.rolePermission.findFirst({
    where: { role: { name: { in: roles } }, module: 'MENU:ai', action: 'ALLOW' },
  });
  return !!aiPerm;
}

// ── POST /api/ai/image-edit ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  if (!(await hasAiAccess(session))) return NextResponse.json({ error: 'Geen toegang tot AI functionaliteit.' }, { status: 403 });

  const userId = (session.user as any).id as string;

  const body = await request.json() as {
    articleNumber: string;
    filename: string;
    instruction: string;
    provider: LlmProvider;
  };

  const { articleNumber, filename, instruction, provider } = body;

  if (!articleNumber || !filename || !instruction?.trim() || !provider) {
    return NextResponse.json({ error: 'articleNumber, filename, instruction en provider zijn verplicht.' }, { status: 400 });
  }

  const img = loadImageBuffer(articleNumber, filename);
  if (!img) return NextResponse.json({ error: `Afbeelding niet gevonden: ${filename}` }, { status: 404 });

  if (img.sizeKb > 20_000) {
    return NextResponse.json({ error: `Afbeelding is te groot (${img.sizeKb} KB). Maximum is 20 MB.` }, { status: 400 });
  }

  const config = await getVisionProviderConfigInternal(provider);
  if (!config?.apiKey) {
    return NextResponse.json({ error: `Geen API key geconfigureerd voor ${provider}.` }, { status: 400 });
  }

  const model = config.visionModel;
  const editMode = provider === 'openai' && isImageEditModel(model);

  console.log(`[image-edit] provider=${provider} model=${model} editMode=${editMode} file=${filename} size=${img.sizeKb}kb`);

  const startMs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let success = true;
  let errorMsg: string | undefined;
  let resultText = '';
  let savedFilename: string | null = null;

  try {
    // ════════════════════════════════════════════════════════════════════════════
    // A) IMAGE EDIT MODE — OpenAI Images Edit API (gpt-image-1 / dall-e-2)
    //    The model actually modifies the image and returns a new image.
    // ════════════════════════════════════════════════════════════════════════════
    if (editMode) {
      const formData = new FormData();
      formData.append('model', model);
      formData.append('prompt', instruction);
      formData.append('n', '1');

      if (model === 'dall-e-2') {
        // dall-e-2 requires PNG; add response_format
        formData.append('image', new Blob([new Uint8Array(img.buffer)], { type: 'image/png' }), path.basename(filename));
        formData.append('size', '1024x1024');
        formData.append('response_format', 'b64_json');
      } else {
        // gpt-image-1 — supports JPEG/WEBP/PNG, no mask required
        formData.append('image[]', new Blob([new Uint8Array(img.buffer)], { type: img.mimeType }), path.basename(filename));
        formData.append('quality', 'high');
      }

      console.log(`[image-edit] Calling OpenAI Images Edit API: model=${model}`);

      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error?.message ?? JSON.stringify(data);
        console.error(`[image-edit] OpenAI Images Edit API error HTTP ${res.status}:`, errMsg);
        throw new Error(errMsg);
      }

      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error('Geen afbeelding ontvangen van OpenAI Images API.');

      // Save the edited image
      savedFilename = saveEditedImage(articleNumber, filename, b64, 'image/png');
      resultText = `✅ Afbeelding is succesvol bewerkt! De instructie "${instruction}" is uitgevoerd. De nieuwe afbeelding is opgeslagen in de galerij.`;

      // Images API doesn't return token counts
      inputTokens = 0;
      outputTokens = 0;

      console.log(`[image-edit] Saved edited image: ${savedFilename}`);

    // ════════════════════════════════════════════════════════════════════════════
    // B) ANALYSIS MODE — Chat Completions with vision (gpt-4o, Claude, Gemini)
    //    The model analyses the image but cannot produce a new image.
    // ════════════════════════════════════════════════════════════════════════════
    } else {
      const base64 = img.buffer.toString('base64');

      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({
            model,
            max_tokens: Math.min(config.maxOutputTokens ?? 1000, 4096),
            messages: [
              {
                role: 'system',
                content: `Je bent een expert in professionele productfotografie. 
Analyseer de productafbeelding die de gebruiker stuurt en beantwoord de vraag zo concreet en nuttig mogelijk.
Let op: je kunt de afbeelding BESCHRIJVEN en ADVIES geven, maar je kunt geen afbeeldingen aanpassen of genereren.
Als de gebruiker vraagt om een bewerking (bijv. "verwijder achtergrond"), leg dan uit wat je in de afbeelding ziet 
en geef specifiek advies hoe de bewerking kan worden bereikt. Antwoord in het Nederlands.`,
              },
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${base64}`, detail: 'high' } },
                  { type: 'text', text: instruction },
                ],
              },
            ],
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          const errMsg = data?.error?.message ?? JSON.stringify(data);
          console.error(`[image-edit] OpenAI Chat error HTTP ${res.status}:`, errMsg);
          throw new Error(errMsg);
        }

        resultText   = data.choices?.[0]?.message?.content ?? 'Geen antwoord.';
        inputTokens  = data.usage?.prompt_tokens ?? 0;
        outputTokens = data.usage?.completion_tokens ?? 0;

      } else if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model,
            max_tokens: Math.min(config.maxOutputTokens ?? 1000, 4096),
            system: 'Je bent een expert in professionele productfotografie. Analyseer de afbeelding en antwoord in het Nederlands.',
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: img.mimeType, data: base64 } },
                { type: 'text', text: instruction },
              ],
            }],
          }),
        });

        const data = await res.json();
        if (!res.ok) { console.error(`[image-edit] Anthropic error HTTP ${res.status}:`, data); throw new Error(data?.error?.message ?? JSON.stringify(data)); }

        resultText   = data.content?.[0]?.text ?? 'Geen antwoord.';
        inputTokens  = data.usage?.input_tokens ?? 0;
        outputTokens = data.usage?.output_tokens ?? 0;

      } else if (provider === 'gemini') {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: 'Je bent een expert in professionele productfotografie. Antwoord in het Nederlands.\n\nInstructie: ' + instruction },
              { inline_data: { mime_type: img.mimeType, data: base64 } },
            ]}],
            generationConfig: { maxOutputTokens: Math.min(config.maxOutputTokens ?? 1000, 8192) },
          }),
        });

        const data = await res.json();
        if (!res.ok) { console.error(`[image-edit] Gemini error HTTP ${res.status}:`, data); throw new Error(data?.error?.message ?? JSON.stringify(data)); }

        resultText   = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'Geen antwoord.';
        inputTokens  = data.usageMetadata?.promptTokenCount ?? 0;
        outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
      } else {
        throw new Error(`Onbekende provider: ${provider}`);
      }
    }

  } catch (e: any) {
    success  = false;
    errorMsg = e.message;
    console.error('[image-edit] Failed:', errorMsg);
  }

  const durationMs = Date.now() - startMs;
  const costUsd    = estimateCost(model, inputTokens, outputTokens);

  try {
    await prisma.llmUsageLog.create({
      data: {
        userId, provider, model,
        inputTokens, outputTokens, durationMs, costUsd,
        success, errorMsg,
        promptSnippet: instruction.slice(0, 500),
        context: 'image-edit',
      },
    });
  } catch (logErr: any) {
    console.error('[image-edit] Usage log failed:', logErr.message);
  }

  if (!success) {
    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }

  return NextResponse.json({
    editMode,
    description: resultText,
    savedFilename,
    newImageUrl: savedFilename
      ? `/api/uploads/products/${articleNumber.replace(/[^a-zA-Z0-9_\-]/g, '')}/${savedFilename}`
      : null,
    model,
    provider,
    usage: { inputTokens, outputTokens, durationMs, costUsd },
  });
}
