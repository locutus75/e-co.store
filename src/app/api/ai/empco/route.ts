import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callLlm, resolveAnalysisProvider } from '@/lib/llmCall';
import {
  extractEmpcoFields, hashEmpcoFields, buildEmpcoSystemPrompt, buildEmpcoUserPrompt,
  parseEmpcoResponse, EmpcoResult,
} from '@/lib/empco';
import { getEmpcoSettingsAction } from '@/app/actions/empco';

export const maxDuration = 3600; // local models can be slow

function withParsed(check: any) {
  if (!check) return null;
  let result: EmpcoResult | null = null;
  try { result = check.structuredData ? JSON.parse(check.structuredData) : null; } catch { /**/ }
  return { ...check, result };
}

/** GET /api/ai/empco?article=123 — load the saved EmpCo check (+ whether it is stale) and active guidelines */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const article = request.nextUrl.searchParams.get('article');
  const settings = await getEmpcoSettingsAction();
  const guidelines = {
    notes: settings.guidelineNotes,
    links: settings.guidelineLinks,
  };

  if (!article) return NextResponse.json({ check: null, guidelines });

  const [check, product] = await Promise.all([
    prisma.productEmpcoCheck.findUnique({ where: { articleNumber: article } }),
    prisma.product.findUnique({ where: { internalArticleNumber: article }, include: { brand: true, category: true, subcategory: true } }),
  ]);

  let stale = false;
  if (check?.contentHash && product) {
    const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
    const layout = await getFormLayoutAction();
    stale = hashEmpcoFields(extractEmpcoFields(product, layout, undefined, settings.includedFieldKeys)) !== check.contentHash;
  }

  return NextResponse.json({ check: withParsed(check), stale, guidelines });
}

/**
 * POST /api/ai/empco — run an EmpCo check for one product and save it.
 * Body: { articleNumber, overrides?: Record<formKey, value>, skipIfCurrent?: boolean }
 *  - overrides: live (unsaved) form values from the product drawer
 *  - skipIfCurrent: don't call the LLM when an up-to-date check already exists (batch mode)
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await request.json() as { articleNumber: string; overrides?: Record<string, string>; skipIfCurrent?: boolean };
  if (!body.articleNumber) return NextResponse.json({ error: 'articleNumber is verplicht' }, { status: 400 });

  const product = await prisma.product.findUnique({
    where: { internalArticleNumber: body.articleNumber },
    include: { brand: true, category: true, subcategory: true },
  });
  if (!product) return NextResponse.json({ error: 'Product niet gevonden' }, { status: 404 });

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const [layout, settings] = await Promise.all([getFormLayoutAction(), getEmpcoSettingsAction()]);
  const fields = extractEmpcoFields(product, layout, body.overrides, settings.includedFieldKeys);
  const contentHash = hashEmpcoFields(fields);

  if (body.skipIfCurrent) {
    const existing = await prisma.productEmpcoCheck.findUnique({ where: { articleNumber: body.articleNumber } });
    if (existing && existing.contentHash === contentHash) {
      return NextResponse.json({ check: withParsed(existing), skipped: true, stale: false });
    }
  }

  let result: EmpcoResult;
  let provider = 'none';
  let model = '-';
  let usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  if (fields.length === 0) {
    // Nothing customer-facing to check → trivially compliant, no LLM call needed
    result = { status: 'PASS', summary: 'Geen klantgerichte teksten of duurzaamheidskenmerken gevonden om te toetsen.', issues: [], compliant_claims: [] };
  } else {
    const resolved = await resolveAnalysisProvider();
    if (!resolved) return NextResponse.json({ error: 'Geen AI provider met API key geconfigureerd. Stel dit in via Systeeminstellingen.' }, { status: 400 });
    provider = resolved;

    // Check if we have learned rules or approved claims for this brand
    let brandKnowledge = '';
    if (product.brandId && product.brand?.name) {
      try {
        const brandRules = await prisma.brandEmpcoRule.findMany({ where: { brandId: product.brandId } });
        const { formatBrandKnowledgePrompt } = await import('@/lib/brandEmpco');
        brandKnowledge = formatBrandKnowledgePrompt(product.brand.name, brandRules);
      } catch (e) {
        console.error('Failed to load brand rules:', e);
      }
    }

    const llm = await callLlm({
      provider: resolved,
      prompt: buildEmpcoUserPrompt(product, fields),
      systemPrompt: buildEmpcoSystemPrompt(settings.extraInstructions, brandKnowledge, settings.guidelineNotes, settings.guidelineLinks),
      moduleId: 'analysis',
      userId,
      context: 'empco-check',
    });
    if (!llm.success) return NextResponse.json({ error: llm.error }, { status: llm.status });

    const parsed = parseEmpcoResponse(llm.response, fields);
    if (!parsed) return NextResponse.json({ error: 'Het AI-antwoord kon niet worden gelezen. Probeer het opnieuw.' }, { status: 502 });
    result = parsed;
    model = llm.model;
    usage = { inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: llm.usage.costUsd };

    // Automatically remember approved / compliant claims for this brand
    if (product.brandId && parsed.compliant_claims?.length > 0) {
      import('@/app/actions/brandEmpco').then(({ saveBrandRuleAction }) => {
        parsed.compliant_claims.forEach(claim => {
          saveBrandRuleAction({
            brandId: product.brandId!,
            original: claim,
            ruleType: 'COMPLIANT',
            sourceArticle: body.articleNumber,
          }).catch(() => {});
        });
      }).catch(() => {});
    }
  }

  result.checkedValues = Object.fromEntries(fields.map(f => [f.key, f.value]));

  const data = {
    status: result.status,
    issueCount: result.issues.length,
    summary: result.summary,
    structuredData: JSON.stringify(result),
    contentHash,
    provider,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd,
    checkedById: userId,
  };

  const check = await prisma.productEmpcoCheck.upsert({
    where: { articleNumber: body.articleNumber },
    update: data,
    create: { articleNumber: body.articleNumber, ...data },
  });

  // If live overrides differ from DB, the saved check is "stale" until the product is saved
  const dbHash = body.overrides ? hashEmpcoFields(extractEmpcoFields(product, layout, undefined, settings.includedFieldKeys)) : contentHash;

  return NextResponse.json({ check: withParsed(check), skipped: false, stale: dbHash !== contentHash });
}
