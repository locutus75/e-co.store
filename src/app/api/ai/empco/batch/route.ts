import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callLlm, resolveAnalysisProvider } from '@/lib/llmCall';
import {
  extractEmpcoFields,
  hashEmpcoFields,
  buildEmpcoSystemPrompt,
  buildEmpcoUserPrompt,
  sanitizeEmpcoIssues,
  EmpcoField,
  EmpcoIssue,
  EmpcoResult,
  EmpcoStatus,
} from '@/lib/empco';
import { getEmpcoSettingsAction } from '@/app/actions/empco';

export const maxDuration = 3600;

export interface EmpcoBatchItemResult {
  articleNumber: string;
  ok: boolean;
  skipped?: boolean;
  status?: string;
  issueCount?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { error: 'Alleen beheerders of gebruikers met AI-rechten mogen een nieuwe EmpCo-analyse starten.' },
        { status: 403 }
      );
    }
  }

  const body = (await request.json()) as {
    articleNumbers: string[];
    skipIfCurrent?: boolean;
  };
  const articleNumbers = Array.isArray(body.articleNumbers)
    ? body.articleNumbers.filter(Boolean)
    : [];

  if (articleNumbers.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const [layout, settings, products, existingChecks] = await Promise.all([
    getFormLayoutAction(),
    getEmpcoSettingsAction(),
    prisma.product.findMany({
      where: { internalArticleNumber: { in: articleNumbers } },
      include: { brand: true, category: true, subcategory: true },
    }),
    prisma.productEmpcoCheck.findMany({
      where: { articleNumber: { in: articleNumbers } },
    }),
  ]);

  const productByArt = new Map(products.map((p) => [p.internalArticleNumber, p]));
  const existingByArt = new Map(existingChecks.map((c) => [c.articleNumber, c]));

  const resultsByArt = new Map<string, EmpcoBatchItemResult>();
  const toCheckWithLlm: {
    product: (typeof products)[number];
    fields: EmpcoField[];
    contentHash: string;
  }[] = [];

  for (const art of articleNumbers) {
    const product = productByArt.get(art);
    if (!product) {
      resultsByArt.set(art, { articleNumber: art, ok: false, error: 'Product niet gevonden' });
      continue;
    }

    const fields = extractEmpcoFields(product, layout, undefined, settings.includedFieldKeys);
    const contentHash = hashEmpcoFields(fields);

    if (body.skipIfCurrent) {
      const existing = existingByArt.get(art);
      if (existing && existing.contentHash === contentHash) {
        resultsByArt.set(art, {
          articleNumber: art,
          ok: true,
          skipped: true,
          status: existing.status,
          issueCount: existing.issueCount,
        });
        continue;
      }
    }

    if (fields.length === 0) {
      const passResult: EmpcoResult = {
        status: 'PASS',
        summary: 'Geen klantgerichte teksten of duurzaamheidskenmerken gevonden om te toetsen.',
        issues: [],
        compliant_claims: [],
        checkedValues: {},
      };
      await prisma.productEmpcoCheck.upsert({
        where: { articleNumber: art },
        update: {
          status: 'PASS',
          issueCount: 0,
          summary: passResult.summary,
          structuredData: JSON.stringify(passResult),
          contentHash,
          provider: 'none',
          model: '-',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          checkedById: userId,
        },
        create: {
          articleNumber: art,
          status: 'PASS',
          issueCount: 0,
          summary: passResult.summary,
          structuredData: JSON.stringify(passResult),
          contentHash,
          provider: 'none',
          model: '-',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          checkedById: userId,
        },
      });
      resultsByArt.set(art, {
        articleNumber: art,
        ok: true,
        skipped: false,
        status: 'PASS',
        issueCount: 0,
      });
      continue;
    }

    toCheckWithLlm.push({ product, fields, contentHash });
  }

  if (toCheckWithLlm.length > 0) {
    const resolved = await resolveAnalysisProvider();
    if (!resolved) {
      return NextResponse.json(
        { error: 'Geen AI provider met API key geconfigureerd. Stel dit in via Systeeminstellingen.' },
        { status: 400 }
      );
    }

    // Load brand rules for all brands in this batch in a single query
    const brandIds = Array.from(
      new Set(toCheckWithLlm.map((x) => x.product.brandId).filter((id): id is string => Boolean(id)))
    );
    let brandKnowledge = '';
    if (brandIds.length > 0) {
      try {
        const brandRules = await prisma.brandEmpcoRule.findMany({
          where: { brandId: { in: brandIds } },
          include: { brand: { select: { name: true } } },
        });
        if (brandRules.length > 0) {
          const { formatBrandKnowledgePrompt } = await import('@/lib/brandEmpco');
          const byBrand = new Map<string, { name: string; rules: typeof brandRules }>();
          for (const r of brandRules) {
            const entry = byBrand.get(r.brandId) || { name: r.brand?.name || 'Merk', rules: [] };
            entry.rules.push(r);
            byBrand.set(r.brandId, entry);
          }
          brandKnowledge = Array.from(byBrand.values())
            .map((b) => formatBrandKnowledgePrompt(b.name, b.rules))
            .filter(Boolean)
            .join('\n\n');
        }
      } catch (e) {
        console.error('Failed to load batch brand rules:', e);
      }
    }

    const baseSystemPrompt = buildEmpcoSystemPrompt(
      settings.extraInstructions,
      brandKnowledge,
      settings.guidelineNotes,
      settings.guidelineLinks
    );

    const batchSystemPrompt = `${baseSystemPrompt}

BATCH-MODUS INSTRUCTIE:
Je ontvangt meerdere producten tegelijk in één verzoek. Beoordeel ieder product nauwkeurig en consistent op exact dezelfde manier.
Antwoord UITSLUITEND met een geldig JSON-object (zonder markdown-codeblokken) in dit exacte formaat:
{
  "items": [
    {
      "articleNumber": "<exact artikelnummer>",
      "status": "PASS" | "WARNING" | "FAIL",
      "summary": "<korte samenvatting in het Nederlands>",
      "issues": [
        {
          "field": "<veldkey, bijv. title of shortDescription>",
          "original": "<exacte originele tekstfragment uit dat veld>",
          "rule": "<regelcode>",
          "severity": "FAIL" | "WARNING",
          "explanation": "<uitleg>",
          "replacement": "<concrete veilige vervangingstekst of lege string om te verwijderen>"
        }
      ],
      "compliant_claims": ["<eventuele toegestane claims>"]
    }
  ]
}`;

    const batchUserPrompt = toCheckWithLlm
      .map((item, idx) => {
        return `=== PRODUCT ${idx + 1} (articleNumber: "${item.product.internalArticleNumber}") ===\n${buildEmpcoUserPrompt(
          item.product,
          item.fields
        )}`;
      })
      .join('\n\n');

    const llm = await callLlm({
      provider: resolved,
      prompt: batchUserPrompt,
      systemPrompt: batchSystemPrompt,
      moduleId: 'analysis',
      userId,
      context: 'empco-check-batch',
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
        { error: 'Het AI-antwoord voor de EmpCo-batch kon niet als JSON worden gelezen.' },
        { status: 502 }
      );
    }

    const parsedByArt = new Map<string, any>();
    for (const item of parsedItems) {
      if (item?.articleNumber) {
        parsedByArt.set(String(item.articleNumber), item);
      }
    }

    const perItemInTokens = Math.round(llm.usage.inputTokens / toCheckWithLlm.length);
    const perItemOutTokens = Math.round(llm.usage.outputTokens / toCheckWithLlm.length);
    const perItemCost = llm.usage.costUsd / toCheckWithLlm.length;

    for (const item of toCheckWithLlm) {
      const art = item.product.internalArticleNumber;
      const rawAi = parsedByArt.get(art);
      if (!rawAi) {
        resultsByArt.set(art, {
          articleNumber: art,
          ok: false,
          error: 'Geen resultaat ontvangen in batch-antwoord',
        });
        continue;
      }

      const labelMap = new Map(item.fields.map((f) => [f.key, f.label]));
      const rawIssues: EmpcoIssue[] = Array.isArray(rawAi.issues)
        ? rawAi.issues
          .filter((i: any) => i && typeof i === 'object')
          .map((i: any) => {
            const fieldKey = String(i.field ?? '').replace(/^\[|\]$/g, '');
            return {
              field: fieldKey,
              fieldLabel: labelMap.get(fieldKey) ?? fieldKey,
              original: String(i.original ?? ''),
              rule: String(i.rule ?? 'UNSUBSTANTIATED'),
              severity: i.severity === 'FAIL' ? 'FAIL' : 'WARNING',
              explanation: String(i.explanation ?? ''),
              replacement: String(i.replacement ?? ''),
            };
          })
        : [];

      const issues = sanitizeEmpcoIssues(rawIssues, item.fields);
      const status: EmpcoStatus = issues.some((i) => i.severity === 'FAIL')
        ? 'FAIL'
        : issues.length > 0
          ? 'WARNING'
          : 'PASS';

      const compliantClaims: string[] = Array.isArray(rawAi.compliant_claims)
        ? rawAi.compliant_claims.map(String)
        : [];

      const result: EmpcoResult = {
        status,
        summary: String(rawAi.summary ?? ''),
        issues,
        compliant_claims: compliantClaims,
        checkedValues: Object.fromEntries(item.fields.map((f) => [f.key, f.value])),
      };

      // Learn compliant claims for brand
      if (item.product.brandId && compliantClaims.length > 0) {
        import('@/app/actions/brandEmpco')
          .then(({ saveBrandRuleAction }) => {
            compliantClaims.forEach((claim) => {
              saveBrandRuleAction({
                brandId: item.product.brandId!,
                original: claim,
                ruleType: 'COMPLIANT',
                sourceArticle: art,
              }).catch(() => { });
            });
          })
          .catch(() => { });
      }

      const dbData = {
        status: result.status,
        issueCount: result.issues.length,
        summary: result.summary,
        structuredData: JSON.stringify(result),
        contentHash: item.contentHash,
        provider: resolved,
        model: llm.model,
        inputTokens: perItemInTokens,
        outputTokens: perItemOutTokens,
        costUsd: perItemCost,
        checkedById: userId,
      };

      await prisma.productEmpcoCheck.upsert({
        where: { articleNumber: art },
        update: dbData,
        create: { articleNumber: art, ...dbData },
      });

      resultsByArt.set(art, {
        articleNumber: art,
        ok: true,
        skipped: false,
        status: result.status,
        issueCount: result.issues.length,
      });
    }
  }

  return NextResponse.json({
    results: articleNumbers.map(
      (art) =>
        resultsByArt.get(art) ?? {
          articleNumber: art,
          ok: false,
          error: 'Onbekende fout',
        }
    ),
  });
}
