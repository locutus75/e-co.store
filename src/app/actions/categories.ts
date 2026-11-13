'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { executeEcoPosSyncAction } from '@/app/actions/ecopos';
import { callLlm, resolveAnalysisProvider } from '@/lib/llmCall';

export interface ProductCategoryCheck {
  status: 'OK' | 'WARNING' | 'MISMATCH';
  currentCategory: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  suggestedParentName: string | null;
  explanation: string;
  checkedAt: string;
  checkedCategoryId: string | null;
  checkedSubcategoryId: string | null;
  dismissed?: boolean;
}

export interface AvailableCategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string;
  fullLabel: string;
}

export interface CategoryFeedbackRule {
  id: string;
  articleNumber: string;
  productTitle: string;
  fromCategory: string;
  targetCategoryId: string;
  targetCategoryLabel: string;
  reason: string;
  createdAt: string;
  createdBy?: string | null;
}

const FEEDBACK_SETTINGS_KEY = 'CATEGORY_CHECK_FEEDBACK_RULES';

function isMplusRoot(name?: string | null): boolean {
  return !name || name.trim().toLowerCase() === 'mpluswebshops';
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => r.toUpperCase() === 'ADMIN');
  if (!session?.user || !isAdmin) {
    throw new Error('Alleen beheerders mogen deze actie uitvoeren.');
  }
  return session.user;
}

async function getSessionPermissions() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const userId = user?.id as string | undefined;
  const email = user?.email as string | undefined;
  const roles: string[] = user?.roles ?? [];
  const isAdmin = roles.some((r) => r.toUpperCase() === 'ADMIN');

  let canRunCheck = isAdmin;
  let canApplyCategory = isAdmin;

  if (!isAdmin && roles.length > 0) {
    const perms = await prisma.rolePermission.findMany({
      where: {
        role: { name: { in: roles } },
        module: { in: ['MENU:ai', 'MENU:empco_approve', 'MENU:categories', 'FIELD:categoryId', 'FIELD:subcategoryId'] },
      },
    });
    const hasAi = perms.some((p) => p.module === 'MENU:ai' && p.action === 'ALLOW');
    const hasApprove = perms.some((p) => p.module === 'MENU:empco_approve' && p.action === 'ALLOW');
    const hasCategories = perms.some((p) => p.module === 'MENU:categories' && p.action === 'ALLOW');
    const isEditor = roles.some((r) => r.toUpperCase() === 'EDITOR');
    canRunCheck = hasAi || hasApprove || hasCategories || isEditor;
    canApplyCategory = hasAi || hasApprove || hasCategories || isEditor;
  }

  return { userId, email, isAdmin, canRunCheck, canApplyCategory };
}

/**
 * Loads learned category feedback rules from SystemSetting.
 */
export async function getCategoryFeedbackRulesAction(): Promise<CategoryFeedbackRule[]> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: FEEDBACK_SETTINGS_KEY },
    });
    if (!row?.value) return [];
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendCategoryFeedbackRules(newRules: CategoryFeedbackRule[]): Promise<void> {
  if (newRules.length === 0) return;
  const existing = await getCategoryFeedbackRulesAction();
  // Deduplicate if the same article + targetCategory + reason already exists, keeping newest first
  const combined = [...newRules, ...existing].slice(0, 150);
  await prisma.systemSetting.upsert({
    where: { key: FEEDBACK_SETTINGS_KEY },
    update: { value: JSON.stringify(combined) },
    create: { key: FEEDBACK_SETTINGS_KEY, value: JSON.stringify(combined) },
  });
}

export async function deleteCategoryFeedbackRuleAction(
  ruleId: string
): Promise<{ ok: boolean; rules: CategoryFeedbackRule[] }> {
  try {
    const { userId, canApplyCategory } = await getSessionPermissions();
    if (!userId || !canApplyCategory) {
      return { ok: false, rules: [] };
    }
    const existing = await getCategoryFeedbackRulesAction();
    const filtered = existing.filter((r) => r.id !== ruleId);
    await prisma.systemSetting.upsert({
      where: { key: FEEDBACK_SETTINGS_KEY },
      update: { value: JSON.stringify(filtered) },
      create: { key: FEEDBACK_SETTINGS_KEY, value: JSON.stringify(filtered) },
    });
    return { ok: true, rules: filtered };
  } catch {
    return { ok: false, rules: [] };
  }
}

/**
 * Returns the canonical list of existing categories in the database (never inventing new ones).
 */
export async function getAvailableCategoriesForCheckAction(): Promise<AvailableCategoryOption[]> {
  const allCats = await prisma.category.findMany({
    include: { parent: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });

  const validCats = allCats.filter((c) => !isMplusRoot(c.name));
  const parentIdsWithChildren = new Set(
    validCats.map((c) => c.parentId).filter((id): id is string => Boolean(id))
  );

  // Leaf categories (or categories without children), preferring single atomic categories over comma-joined ones
  const options: AvailableCategoryOption[] = [];
  for (const c of validCats) {
    // Skip pure parent containers unless they have no valid children
    if (parentIdsWithChildren.has(c.id)) continue;
    // Skip composite comma-separated pseudo-records from being suggested as a single target
    if (c.name.includes(',')) continue;

    const parentName =
      c.parent && !isMplusRoot(c.parent.name) ? c.parent.name.trim() : 'Overige / Algemeen';
    const cleanName = c.name.trim();
    options.push({
      id: c.id,
      name: cleanName,
      parentId: c.parentId,
      parentName,
      fullLabel: parentName !== 'Overige / Algemeen' ? `${parentName} › ${cleanName}` : cleanName,
    });
  }

  return options.sort((a, b) => a.fullLabel.localeCompare(b.fullLabel, 'nl'));
}

/**
 * Runs an AI-assisted category check for a batch of products, strictly constrained
 * to the existing categories in the database and enriched with learned user feedback.
 */
export async function runCategoryCheckBatchAction(
  articleNumbers: string[],
  sessionExamples?: { articleNumber: string; title: string; chosenCategory: string }[]
): Promise<{
  ok: boolean;
  error?: string;
  results: Record<string, ProductCategoryCheck>;
}> {
  try {
    const { userId, canRunCheck } = await getSessionPermissions();
    if (!userId || !canRunCheck) {
      return { ok: false, error: 'Geen rechten om de categorie-check uit te voeren.', results: {} };
    }
    if (!articleNumbers || articleNumbers.length === 0) {
      return { ok: true, results: {} };
    }

    const [availableCategories, products, feedbackRules] = await Promise.all([
      getAvailableCategoriesForCheckAction(),
      prisma.product.findMany({
        where: { internalArticleNumber: { in: articleNumbers } },
        include: {
          brand: { select: { name: true } },
          category: { select: { id: true, name: true, parentId: true } },
          subcategory: { select: { id: true, name: true, parentId: true } },
        },
      }),
      getCategoryFeedbackRulesAction(),
    ]);

    if (availableCategories.length === 0) {
      return {
        ok: false,
        error: 'Er zijn nog geen bestaande categorieën in het systeem gevonden. Synchroniseer eerst de categorieën vanuit EcoPos.',
        results: {},
      };
    }

    const provider = await resolveAnalysisProvider();
    if (!provider) {
      return {
        ok: false,
        error: 'Geen AI-provider met API-key geconfigureerd. Stel deze in bij Systeeminstellingen.',
        results: {},
      };
    }

    // Lookup maps for strict server-side validation
    const catById = new Map(availableCategories.map((c) => [c.id, c]));
    const catByLowerName = new Map(availableCategories.map((c) => [c.name.toLowerCase(), c]));
    const catByLowerFull = new Map(availableCategories.map((c) => [c.fullLabel.toLowerCase(), c]));

    const categoryCatalogText = availableCategories
      .map((c) => `${c.id}|${c.fullLabel}`)
      .join('\n');

    const sessionRefSection =
      sessionExamples && sessionExamples.length > 0
        ? `\nEERDERE INDELINGEN IN DEZE SESSIE (HOUD DEZELFDE LIJN AAN):\n${sessionExamples
          .slice(0, 4)
          .map((e) => `- #${e.articleNumber} "${e.title}" -> ${e.chosenCategory}`)
          .join('\n')}\n`
        : '';

    const learnedFeedbackSection =
      feedbackRules.length > 0
        ? `\nGELEERDE FEEDBACK & INDELINGSREGELS VAN DE GEBRUIKER (ZEER BELANGRIJK — PAS DEZE LOGICA ACTIEF TOE!):
De gebruiker heeft bij eerdere controles onderstaande categorie-correcties en redeneringen vastgelegd. Pas deze regels en trefwoord-associaties consequent toe op dit product en soortgelijke producten:
${feedbackRules
          .slice(0, 60)
          .map(
            (r) =>
              `- Product "${r.productTitle}" (#${r.articleNumber}): Gewijzigd van "${r.fromCategory}" naar "${r.targetCategoryLabel}" (ID="${r.targetCategoryId}") -> Reden/Regel van gebruiker: "${r.reason}"`
          )
          .join('\n')}\n`
        : '';

    const productItemsForPrompt = products.map((p) => {
      const subName =
        p.subcategory?.name && !isMplusRoot(p.subcategory.name)
          ? p.subcategory.name.trim()
          : p.category?.name && !isMplusRoot(p.category.name)
            ? p.category.name.trim()
            : '';
      const mainName =
        p.category?.name &&
          !isMplusRoot(p.category.name) &&
          p.category.name.trim().toLowerCase() !== subName.toLowerCase()
          ? p.category.name.trim()
          : '';
      const currentCategoryLabel = subName
        ? mainName
          ? `${mainName} › ${subName}`
          : subName
        : 'GEEN CATEGORIE';

      const shortDesc = (p.shortDescription || p.seoTitle || '').slice(0, 220);
      const longDesc = (p.longDescription || '').slice(0, 250);

      return {
        articleNumber: p.internalArticleNumber,
        title: p.title,
        brand: p.brand?.name || '',
        material: p.mainMaterial || p.material || '',
        ingredients: (p.ingredients || '').slice(0, 140),
        shortDescription: shortDesc,
        longDescription: longDesc,
        currentCategory: currentCategoryLabel,
        currentSubcategoryRaw: subName,
      };
    });

    const systemPrompt = `Je bent een ervaren assortiments- en categoriespecialist voor een Nederlandse webshop en winkel (E-Co Store).
Je controleert of producten in de JUISTE bestaande categorie zijn ingedeeld.

STRIKTE REGELS (ZEER BELANGRIJK):
1. VERZIN NOOIT ZELF EEN NIEUWE CATEGORIE! Je mag UITSLUITEND een categorie voorstellen die letterlijk in de onderstaande lijst "BESTAANDE CATEGORIEËN IN HET SYSTEEM" staat.
2. Kopieer bij een voorstel altijd exact het "ID" en de "Categorie" uit de bestaande lijst.
3. Let extra scherp op verzamelcategorieën zoals "Accessoires":
   - Als een product in een algemene categorie zoals "Wonen & Slapen › Accessoires" staat, maar de productnaam of het gebruiksdoel verwijst naar een specifiekere bestaande categorie (bijv. een zeephouder of douche-artikel bevat "Zeep" / "Douche" en hoort in "Make-Up & Verzorging › Douche & bad", een baby-artikel hoort in "Cadeaus voor baby's", een afwasborstel in "Afwas & schoonmaak", etc.), markeer dit dan als "WARNING" (of "MISMATCH") en stel die specifiekere bestaande categorie voor!
4. Wanneer geef je "status": "OK"?
   - Als de huidige categorie specifiek en passend is én niet in strijd is met de geleerde feedbackregels van de gebruiker.
   - Als er in de lijst van bestaande categorieën géén betere passende categorie bestaat dan de huidige categorie, geef je ALTIJD "OK".
5. Wanneer geef je "status": "MISMATCH"?
   - Als het product in een categorie staat die echt niet klopt met het soort product, of rechtstreeks in strijd is met de geleerde feedbackregels van de gebruiker.
   - Of als het product nu "GEEN CATEGORIE" heeft en er wél een passende categorie in de bestaande lijst staat.
6. Wanneer geef je "status": "WARNING"?
   - Als de huidige categorie te algemeen is (zoals "Accessoires") of twijfelachtig is, terwijl er in de bestaande lijst een duidelijk betere, specifiekere categorie bestaat.
${learnedFeedbackSection}${sessionRefSection}
BESTAANDE CATEGORIEËN IN HET SYSTEEM (formaat: ID|Categorie):
${categoryCatalogText}

Antwoord UITSLUITEND met een geldig JSON-object (zonder markdown-codeblokken of extra tekst) in exact dit formaat:
{
  "items": [
    {
      "articleNumber": "<artikelnummer>",
      "status": "OK" | "WARNING" | "MISMATCH",
      "suggestedCategoryId": "<exact ID uit de lijst hierboven, of null als status OK is>",
      "suggestedCategoryName": "<exacte Categorie-naam uit de lijst hierboven, of null als status OK is>",
      "explanation": "<korte, heldere Nederlandstalige toelichting van 1 zin waarom de categorie klopt of waarom de voorgestelde bestaande categorie beter past>"
    }
  ]
}`;

    const userPrompt = `Controleer de categorie-indeling van de volgende ${productItemsForPrompt.length} producten:\n\n${JSON.stringify(
      productItemsForPrompt,
      null,
      2
    )}`;

    const llmRes = await callLlm({
      provider,
      prompt: userPrompt,
      systemPrompt,
      moduleId: 'analysis',
      userId,
      context: 'category-check',
    });

    if (!llmRes.success) {
      return { ok: false, error: llmRes.error, results: {} };
    }

    // Extract JSON from response
    let parsedItems: any[] = [];
    try {
      const cleaned = llmRes.response
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      const jsonSlice = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
      const obj = JSON.parse(jsonSlice);
      if (Array.isArray(obj?.items)) {
        parsedItems = obj.items;
      } else if (Array.isArray(obj)) {
        parsedItems = obj;
      }
    } catch {
      return {
        ok: false,
        error: 'Het AI-antwoord kon niet als JSON worden gelezen. Probeer het opnieuw.',
        results: {},
      };
    }

    const byArt = new Map<string, any>();
    for (const item of parsedItems) {
      if (item?.articleNumber) {
        byArt.set(String(item.articleNumber), item);
      }
    }

    const nowIso = new Date().toISOString();
    const results: Record<string, ProductCategoryCheck> = {};

    for (const p of products) {
      const promptMeta = productItemsForPrompt.find((x) => x.articleNumber === p.internalArticleNumber)!;
      const rawAi = byArt.get(p.internalArticleNumber);

      let status: 'OK' | 'WARNING' | 'MISMATCH' =
        rawAi?.status === 'MISMATCH' ? 'MISMATCH' : rawAi?.status === 'WARNING' ? 'WARNING' : 'OK';

      // Match suggested category strictly against existing DB categories
      let matchedTarget: AvailableCategoryOption | undefined;
      if (rawAi?.suggestedCategoryId && catById.has(String(rawAi.suggestedCategoryId))) {
        matchedTarget = catById.get(String(rawAi.suggestedCategoryId));
      } else if (rawAi?.suggestedCategoryName) {
        const cleanSuggested = String(rawAi.suggestedCategoryName).trim().toLowerCase();
        matchedTarget = catByLowerName.get(cleanSuggested) || catByLowerFull.get(cleanSuggested);
      }

      // Check if suggested category is already the product's current category (or one of its comma-separated groups)
      const currentParts = promptMeta.currentSubcategoryRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (matchedTarget && currentParts.includes(matchedTarget.name.toLowerCase())) {
        status = 'OK';
        matchedTarget = undefined;
      }

      // Hard guardrail: never allow WARNING/MISMATCH without a valid existing category from the database
      if ((status === 'MISMATCH' || status === 'WARNING') && !matchedTarget) {
        status = 'OK';
      }

      const checkRecord: ProductCategoryCheck = {
        status,
        currentCategory: promptMeta.currentCategory,
        suggestedCategoryId: status === 'OK' ? null : matchedTarget?.id ?? null,
        suggestedCategoryName: status === 'OK' ? null : matchedTarget?.name ?? null,
        suggestedParentName: status === 'OK' ? null : matchedTarget?.parentName ?? null,
        explanation:
          rawAi?.explanation ||
          (status === 'OK'
            ? 'Product is ingedeeld in een passende categorie.'
            : `Bestaande categorie "${matchedTarget?.name}" past beter bij dit product.`),
        checkedAt: nowIso,
        checkedCategoryId: p.categoryId ?? null,
        checkedSubcategoryId: p.subcategoryId ?? null,
        dismissed: false,
      };

      results[p.internalArticleNumber] = checkRecord;

      const currentCustom: Record<string, any> =
        p.customData && typeof p.customData === 'object' && !Array.isArray(p.customData)
          ? { ...(p.customData as Record<string, any>) }
          : {};
      currentCustom._categoryCheck = checkRecord;

      await prisma.product.update({
        where: { internalArticleNumber: p.internalArticleNumber },
        data: { customData: currentCustom },
      });
    }

    revalidatePath('/categories');
    revalidatePath('/products');

    return { ok: true, results };
  } catch (err: any) {
    console.error('runCategoryCheckBatchAction error:', err);
    return {
      ok: false,
      error: err?.message || 'Fout tijdens het uitvoeren van de categorie-check.',
      results: {},
    };
  }
}

/**
 * Applies approved category suggestions (strictly using existing database categories) to products,
 * and stores any provided user feedback reason as a learned rule for future checks.
 */
export async function applyCategorySuggestionsAction(
  items: { articleNumber: string; targetCategoryId: string; feedbackReason?: string }[]
): Promise<{ ok: boolean; updatedCount: number; learnedRulesCount: number; error?: string }> {
  try {
    const { userId, email, canApplyCategory } = await getSessionPermissions();
    if (!userId || !canApplyCategory) {
      return { ok: false, updatedCount: 0, learnedRulesCount: 0, error: 'Geen rechten om categoriewijzigingen door te voeren.' };
    }
    if (!items || items.length === 0) {
      return { ok: true, updatedCount: 0, learnedRulesCount: 0 };
    }

    const availableCategories = await getAvailableCategoriesForCheckAction();
    const catById = new Map(availableCategories.map((c) => [c.id, c]));

    let updatedCount = 0;
    const historyRows: any[] = [];
    const newFeedbackRules: CategoryFeedbackRule[] = [];

    for (const item of items) {
      const targetCat = catById.get(item.targetCategoryId);
      if (!targetCat) continue; // Guardrail: only existing categories allowed

      const product = await prisma.product.findUnique({
        where: { internalArticleNumber: item.articleNumber },
        include: {
          category: { select: { id: true, name: true } },
          subcategory: { select: { id: true, name: true } },
        },
      });
      if (!product) continue;

      const oldCatName =
        product.subcategory?.name
          ? product.category?.name && product.category.name !== product.subcategory.name
            ? `${product.category.name} › ${product.subcategory.name}`
            : product.subcategory.name
          : product.category?.name || 'Geen categorie';

      const newCategoryId = targetCat.parentId ?? targetCat.id;
      const newSubcategoryId = targetCat.id;
      const reasonTrimmed = (item.feedbackReason || '').trim();

      const currentCustom: Record<string, any> =
        product.customData && typeof product.customData === 'object' && !Array.isArray(product.customData)
          ? { ...(product.customData as Record<string, any>) }
          : {};

      currentCustom._categoryCheck = {
        status: 'OK',
        currentCategory: targetCat.fullLabel,
        suggestedCategoryId: null,
        suggestedCategoryName: null,
        suggestedParentName: null,
        explanation: reasonTrimmed
          ? `Ingedeeld in "${targetCat.fullLabel}" (Reden: ${reasonTrimmed}).`
          : `Ingedeeld in "${targetCat.fullLabel}".`,
        checkedAt: new Date().toISOString(),
        checkedCategoryId: newCategoryId,
        checkedSubcategoryId: newSubcategoryId,
        dismissed: false,
      } satisfies ProductCategoryCheck;

      await prisma.product.update({
        where: { internalArticleNumber: item.articleNumber },
        data: {
          categoryId: newCategoryId,
          subcategoryId: newSubcategoryId,
          customData: currentCustom,
          lastEditedByUserId: userId,
        },
      });

      historyRows.push({
        articleNumber: item.articleNumber,
        fieldKey: 'subcategoryId',
        fieldLabel: 'Categorie / Productgroep',
        oldValue: oldCatName,
        newValue: reasonTrimmed ? `${targetCat.fullLabel} (${reasonTrimmed})` : targetCat.fullLabel,
        source: 'CATEGORY_CHECK',
        userId,
        userEmail: email ?? null,
      });

      if (reasonTrimmed) {
        newFeedbackRules.push({
          id: `${Date.now()}_${item.articleNumber}_${Math.random().toString(36).slice(2, 6)}`,
          articleNumber: item.articleNumber,
          productTitle: product.title,
          fromCategory: oldCatName,
          targetCategoryId: targetCat.id,
          targetCategoryLabel: targetCat.fullLabel,
          reason: reasonTrimmed,
          createdAt: new Date().toISOString(),
          createdBy: email ?? null,
        });
      }

      await prisma.auditLog
        .create({
          data: {
            userId,
            action: 'CATEGORY_CHECK_APPLY',
            entity: 'Product',
            entityId: item.articleNumber,
            changes: `Categorie gewijzigd van "${oldCatName}" naar "${targetCat.fullLabel}"${reasonTrimmed ? ` | Reden: ${reasonTrimmed}` : ''
              }`,
          },
        })
        .catch(() => { });

      updatedCount++;
    }

    if (historyRows.length > 0) {
      await prisma.productFieldHistory.createMany({ data: historyRows }).catch(() => { });
    }

    if (newFeedbackRules.length > 0) {
      await appendCategoryFeedbackRules(newFeedbackRules);
    }

    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true, updatedCount, learnedRulesCount: newFeedbackRules.length };
  } catch (err: any) {
    console.error('applyCategorySuggestionsAction error:', err);
    return {
      ok: false,
      updatedCount: 0,
      learnedRulesCount: 0,
      error: err?.message || 'Kon categorievoorstellen niet toepassen.',
    };
  }
}

/**
 * Marks a category check warning/mismatch as approved as-is ("Huidige categorie klopt wel"),
 * optionally saving user feedback for future checks.
 */
export async function dismissCategoryCheckAction(
  articleNumbers: string[],
  feedbackReason?: string
): Promise<{ ok: boolean; dismissedCount: number; error?: string }> {
  try {
    const { userId, email, canApplyCategory } = await getSessionPermissions();
    if (!userId || !canApplyCategory) {
      return { ok: false, dismissedCount: 0, error: 'Geen rechten.' };
    }

    const reasonTrimmed = (feedbackReason || '').trim();
    const newFeedbackRules: CategoryFeedbackRule[] = [];
    let dismissedCount = 0;

    for (const art of articleNumbers) {
      const product = await prisma.product.findUnique({
        where: { internalArticleNumber: art },
        include: {
          category: { select: { id: true, name: true } },
          subcategory: { select: { id: true, name: true } },
        },
      });
      if (!product) continue;

      const currentCustom: Record<string, any> =
        product.customData && typeof product.customData === 'object' && !Array.isArray(product.customData)
          ? { ...(product.customData as Record<string, any>) }
          : {};

      if (currentCustom._categoryCheck) {
        const curCatLabel =
          currentCustom._categoryCheck.currentCategory ||
          product.subcategory?.name ||
          product.category?.name ||
          'Huidige categorie';
        const prevSuggested = currentCustom._categoryCheck.suggestedCategoryName;

        currentCustom._categoryCheck = {
          ...currentCustom._categoryCheck,
          status: 'OK',
          suggestedCategoryId: null,
          suggestedCategoryName: null,
          suggestedParentName: null,
          explanation: reasonTrimmed
            ? `Huidige categorie bevestigd (${reasonTrimmed}).`
            : 'Huidige categorie handmatig bevestigd als correct.',
          dismissed: true,
        };
        await prisma.product.update({
          where: { internalArticleNumber: art },
          data: { customData: currentCustom },
        });

        if (reasonTrimmed && (product.subcategoryId || product.categoryId)) {
          newFeedbackRules.push({
            id: `${Date.now()}_${art}_${Math.random().toString(36).slice(2, 6)}`,
            articleNumber: art,
            productTitle: product.title,
            fromCategory: prevSuggested ? `Voorstel was: ${prevSuggested}` : curCatLabel,
            targetCategoryId: (product.subcategoryId || product.categoryId)!,
            targetCategoryLabel: curCatLabel,
            reason: `Huidige categorie (${curCatLabel}) klopt wél: ${reasonTrimmed}`,
            createdAt: new Date().toISOString(),
            createdBy: email ?? null,
          });
        }

        dismissedCount++;
      }
    }

    if (newFeedbackRules.length > 0) {
      await appendCategoryFeedbackRules(newFeedbackRules);
    }

    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true, dismissedCount };
  } catch (err: any) {
    return { ok: false, dismissedCount: 0, error: err?.message || 'Fout bij negeren.' };
  }
}

/**
 * Synchronises categories and subcategories for all products from EcoPos.
 */
export async function syncCategoriesFromEcoPosAction(): Promise<{
  ok: boolean;
  error?: string;
  updatedCount: number;
  totalFieldsChanged: number;
}> {
  try {
    await requireAdmin();
    const res = await executeEcoPosSyncAction({
      allowedFieldKeys: ['subcategory'],
      createNewProducts: false,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.error || 'Kon categorieën niet ophalen uit EcoPos.',
        updatedCount: 0,
        totalFieldsChanged: 0,
      };
    }

    // Also clean up any legacy MplusWebshops category links automatically
    await cleanupUnusedCategoriesAction();

    revalidatePath('/categories');
    revalidatePath('/products');
    return {
      ok: true,
      updatedCount: res.updatedCount,
      totalFieldsChanged: res.totalFieldsChanged,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Onbekende fout bij synchroniseren van categorieën.',
      updatedCount: 0,
      totalFieldsChanged: 0,
    };
  }
}

/**
 * Removes legacy "MplusWebshops" root category links and deletes empty categories
 * that have no linked products and no child categories.
 */
export async function cleanupUnusedCategoriesAction(): Promise<{
  ok: boolean;
  removedCount: number;
  error?: string;
}> {
  try {
    await requireAdmin();

    // 1. Find any "MplusWebshops" categories and detach them
    const mplusRoots = await prisma.category.findMany({
      where: { name: { equals: 'MplusWebshops', mode: 'insensitive' } },
      select: { id: true },
    });

    if (mplusRoots.length > 0) {
      const rootIds = mplusRoots.map((c) => c.id);
      await prisma.category.updateMany({
        where: { parentId: { in: rootIds } },
        data: { parentId: null },
      });
      await prisma.product.updateMany({
        where: { categoryId: { in: rootIds } },
        data: { categoryId: null },
      });
      await prisma.product.updateMany({
        where: { subcategoryId: { in: rootIds } },
        data: { subcategoryId: null },
      });
    }

    // 2. Delete leaf categories with 0 products, then parent categories with 0 products & 0 children
    let removedCount = 0;
    for (let pass = 0; pass < 2; pass++) {
      const allCats = await prisma.category.findMany({
        include: {
          _count: {
            select: {
              productsAsCategory: true,
              productsAsSubcategory: true,
              children: true,
            },
          },
        },
      });

      const emptyIds = allCats
        .filter(
          (c) =>
            c._count.productsAsCategory === 0 &&
            c._count.productsAsSubcategory === 0 &&
            c._count.children === 0
        )
        .map((c) => c.id);

      if (emptyIds.length > 0) {
        const del = await prisma.category.deleteMany({
          where: { id: { in: emptyIds } },
        });
        removedCount += del.count;
      }
    }

    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true, removedCount };
  } catch (err: any) {
    return { ok: false, removedCount: 0, error: err?.message || 'Kon categorieën niet opschonen.' };
  }
}

export async function renameCategoryAction(
  categoryId: string,
  newName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    const trimmed = newName.trim();
    if (!trimmed) {
      return { ok: false, error: 'Categorienaam mag niet leeg zijn.' };
    }
    await prisma.category.update({
      where: { id: categoryId },
      data: { name: trimmed },
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Hernoemen mislukt.' };
  }
}

export async function deleteCategoryAction(
  categoryId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
    await prisma.product.updateMany({
      where: { categoryId },
      data: { categoryId: null },
    });
    await prisma.product.updateMany({
      where: { subcategoryId: categoryId },
      data: { subcategoryId: null },
    });
    await prisma.category.updateMany({
      where: { parentId: categoryId },
      data: { parentId: null },
    });
    await prisma.category.delete({
      where: { id: categoryId },
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Verwijderen mislukt.' };
  }
}
