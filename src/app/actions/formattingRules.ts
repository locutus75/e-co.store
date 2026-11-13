'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callLlm } from '@/lib/llmCall';
import { revalidatePath } from 'next/cache';
import { LlmProvider } from './llm';

export interface FormattingRule {
  id: string;
  name: string;               // e.g. "Standaard Titel & Korte Omschrijving"
  description: string;        // e.g. "Zorgt voor uniforme producttitels en opsommingen"
  sectionId?: string;          // e.g. "sect-basis" or "all" (matches FormSection.id)
  sectionTitle?: string;       // e.g. "Webshop Content (Basis)"
  targetFields: string[];      // e.g. ["title", "shortDescription", "longDescription"]
  instruction: string;         // formatting guidelines / prompt instructions
  toneOfVoice?: string;        // e.g. "Warm, deskundig en uitnodigend"
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PendingFormattingFieldProposal {
  fieldKey: string;
  fieldLabel: string;
  originalValue: string;
  suggestedValue: string;
  ruleId?: string;
  ruleName: string;
  sectionId?: string;
  stagedAt: string;
  stagedByEmail?: string;
}

const SETTING_KEY = 'formatting_rules';

const DEFAULT_FORMATTING_RULES: FormattingRule[] = [
  {
    id: 'rule-webshop-basis',
    name: 'Uniforme Titel & Korte Samenvatting',
    description: 'Structureert producttitels volgens [Producttype] [Model] - [Kleur/Variant] | [Merk] en schrijft een overtuigende samenvatting van 2 zinnen.',
    sectionId: 'sect-basis',
    sectionTitle: 'Webshop Content (Basis)',
    targetFields: ['title', 'shortDescription'],
    instruction: `Formateer de titel en korte omschrijving volgens de volgende vaste richtlijnen:
1. Titel:
   - Opbouw: [Soort product / Categorie] [Modelnaam] - [Kleur / Specificatie] | [Merknaam].
   - Alleen hoofdletters aan het begin van woorden en eigennamen (geen ALL CAPS).
   - Verwijder overbodige leestekens, vage artikelcodes of interne magazijnaanduidingen.
2. Korte omschrijving:
   - Schrijf exact 2 beknopte, actieve zinnen (maximaal 45 woorden).
   - Zin 1 benadrukt het belangrijkste gebruiksdoel en kwaliteitskenmerk.
   - Zin 2 noemt het directe voordeel of de duurzame eigenschap voor de koper.`,
    toneOfVoice: 'Warm, deskundig en uitnodigend',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rule-long-description',
    name: 'Gestructureerde Lange Productomschrijving',
    description: 'Creëert een complete productbeschrijving met inleiding, bulletpoints en gebruiksadvies.',
    sectionId: 'sect-basis',
    sectionTitle: 'Webshop Content (Basis)',
    targetFields: ['longDescription'],
    instruction: `Herschrijf de lange omschrijving naar een professioneel gestructureerde producttekst in verzorgd Nederlands:
1. Inleidende alinea (3-4 regels): introduceer het product, de context en het onderscheidende karakter.
2. Opsomming met 3 tot 5 duidelijke pluspunten / specificaties (gebruik '-' als opsommingsteken):
   - Belangrijkste eigenschap & voordeel
   - Materiaal / textuur / duurzaamheid
   - Functionaliteit & gebruiksgemak
3. Afsluitende alinea (1-2 regels): praktisch gebruiks-, verzorgings- of serveeradvies.
Voorkom overdreven marketingkreten en vermijd onbewezen duurzaamheidsclaims.`,
    toneOfVoice: 'Informatief, eerlijk en professioneel',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'rule-physical-materials',
    name: 'Fysieke Eigenschappen & Materiaalstandaard',
    description: 'Uniformeert materiaalaanduidingen, ingrediënten en kleurtermen volgens Nederlandse normen.',
    sectionId: 'sect-fysiek',
    sectionTitle: 'Fysieke Eigenschappen',
    targetFields: ['mainMaterial', 'material', 'color', 'ingredients'],
    instruction: `Standaardiseer de fysieke specificaties:
1. Hoofdmateriaal & Materiaal:
   - Gebruik correcte Nederlandse termen (bijv. 'Biologisch Katoen', 'Roestvrijstaal', 'Bamboevezel', ipv Engelse termen).
   - Geen percentage-tekens tenzij exact bekend.
2. Kleur:
   - Gebruik een gangbare Nederlandse kleurnaam (bijv. 'Olijfgroen', 'Terracotta', 'Zandbeige', ipv fabrieksnummers).
3. Ingrediënten:
   - Gescheiden door komma's, correct gespeld in het Nederlands.`,
    toneOfVoice: 'Feitelijk en consistent',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  if (!roles.some((r: string) => r.toUpperCase() === 'ADMIN')) {
    throw new Error('Alleen beheerders (ADMIN) mogen formateringsregels beheren.');
  }
  return session;
}

function getDefaultFormattingRules(): FormattingRule[] {
  return JSON.parse(JSON.stringify(DEFAULT_FORMATTING_RULES));
}

export async function getDefaultFormattingRulesAction(): Promise<FormattingRule[]> {
  return getDefaultFormattingRules();
}

export async function getFormattingRulesAction(): Promise<FormattingRule[]> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!record?.value) {
      return getDefaultFormattingRules();
    }

    const rules = (JSON.parse(record.value) as FormattingRule[]).filter(
      r => r.id !== 'rule-seo-meta'
    );
    return Array.isArray(rules) && rules.length > 0 ? rules : getDefaultFormattingRules();
  } catch (e: any) {
    console.error('Failed to load formatting rules:', e);
    return getDefaultFormattingRules();
  }
}

export async function saveFormattingRuleAction(ruleData: Partial<FormattingRule>): Promise<{ success: boolean; rule?: FormattingRule; error?: string }> {
  try {
    await assertAdmin();

    if (!ruleData.name?.trim()) {
      return { success: false, error: 'Regelnaam is verplicht.' };
    }
    if (!ruleData.instruction?.trim()) {
      return { success: false, error: 'Instructies / richtlijnen zijn verplicht.' };
    }
    if (!ruleData.targetFields || ruleData.targetFields.length === 0) {
      return { success: false, error: 'Selecteer minimaal één doelveld.' };
    }

    const existingRules = await getFormattingRulesAction();
    const now = new Date().toISOString();

    let updatedRule: FormattingRule;

    if (ruleData.id) {
      const idx = existingRules.findIndex(r => r.id === ruleData.id);
      if (idx >= 0) {
        updatedRule = {
          ...existingRules[idx],
          ...ruleData,
          name: ruleData.name.trim(),
          description: ruleData.description?.trim() || '',
          instruction: ruleData.instruction.trim(),
          toneOfVoice: ruleData.toneOfVoice?.trim() || '',
          targetFields: ruleData.targetFields,
          sectionId: ruleData.sectionId || 'all',
          sectionTitle: ruleData.sectionTitle || 'Alle secties',
          enabled: ruleData.enabled ?? existingRules[idx].enabled ?? true,
          updatedAt: now,
        } as FormattingRule;
        existingRules[idx] = updatedRule;
      } else {
        updatedRule = {
          id: ruleData.id,
          name: ruleData.name.trim(),
          description: ruleData.description?.trim() || '',
          instruction: ruleData.instruction.trim(),
          toneOfVoice: ruleData.toneOfVoice?.trim() || '',
          targetFields: ruleData.targetFields,
          sectionId: ruleData.sectionId || 'all',
          sectionTitle: ruleData.sectionTitle || 'Alle secties',
          enabled: ruleData.enabled ?? true,
          createdAt: now,
          updatedAt: now,
        };
        existingRules.push(updatedRule);
      }
    } else {
      updatedRule = {
        id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: ruleData.name.trim(),
        description: ruleData.description?.trim() || '',
        instruction: ruleData.instruction.trim(),
        toneOfVoice: ruleData.toneOfVoice?.trim() || '',
        targetFields: ruleData.targetFields,
        sectionId: ruleData.sectionId || 'all',
        sectionTitle: ruleData.sectionTitle || 'Alle secties',
        enabled: ruleData.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      };
      existingRules.push(updatedRule);
    }

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: JSON.stringify(existingRules) },
      update: { value: JSON.stringify(existingRules) },
    });

    revalidatePath('/admin/system');
    revalidatePath('/products');

    return { success: true, rule: updatedRule };
  } catch (e: any) {
    console.error('Failed to save formatting rule:', e);
    return { success: false, error: e.message };
  }
}

export async function deleteFormattingRuleAction(ruleId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();

    const existingRules = await getFormattingRulesAction();
    const filtered = existingRules.filter(r => r.id !== ruleId);

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: JSON.stringify(filtered) },
      update: { value: JSON.stringify(filtered) },
    });

    revalidatePath('/admin/system');
    revalidatePath('/products');

    return { success: true };
  } catch (e: any) {
    console.error('Failed to delete formatting rule:', e);
    return { success: false, error: e.message };
  }
}

export async function toggleFormattingRuleAction(ruleId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    await assertAdmin();

    const existingRules = await getFormattingRulesAction();
    const rule = existingRules.find(r => r.id === ruleId);
    if (!rule) return { success: false, error: 'Regel niet gevonden.' };

    rule.enabled = enabled;
    rule.updatedAt = new Date().toISOString();

    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: JSON.stringify(existingRules) },
      update: { value: JSON.stringify(existingRules) },
    });

    revalidatePath('/admin/system');
    revalidatePath('/products');

    return { success: true };
  } catch (e: any) {
    console.error('Failed to toggle formatting rule:', e);
    return { success: false, error: e.message };
  }
}

// ── Preview Generation ───────────────────────────────────────────────────────

export interface ProductFieldPreview {
  fieldKey: string;
  fieldLabel: string;
  originalValue: string;
  suggestedValue: string;
  hasChanged: boolean;
  ruleId?: string;
  ruleName?: string;
  stagedAt?: string;
  stagedByEmail?: string;
}

export interface ProductRulePreview {
  articleNumber: string;
  title: string;
  brand?: string;
  supplier?: string;
  fields: ProductFieldPreview[];
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Omschrijving (Titel)',
  shortDescription: 'Korte Omschrijving',
  longDescription: 'Lange Omschrijving',
  seoTitle: 'SEO Titel',
  seoMetaDescription: 'SEO Meta Omschrijving',
  color: 'Kleur',
  size: 'Maat',
  material: 'Materiaal',
  mainMaterial: 'Hoofdmateriaal',
  tags: 'Tags',
  ingredients: 'Ingrediënten',
  allergens: 'Allergenen',
  internalRemarks: 'Interne Communicatie',
  critCircular: 'Hergebruik / Gerecycled',
};

export async function previewFormattingRuleAction(params: {
  ruleId: string;
  articleNumbers: string[];
  provider?: LlmProvider;
  customInstruction?: string;
}): Promise<{ success: boolean; previews?: ProductRulePreview[]; error?: string }> {
  const { ruleId, articleNumbers, provider = 'openai', customInstruction } = params;

  if (!articleNumbers || articleNumbers.length === 0) {
    return { success: false, error: 'Geen producten opgegeven.' };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: 'U moet ingelogd zijn.' };
  }
  const userId = (session.user as any).id as string;

  try {
    const rules = await getFormattingRulesAction();
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) {
      return { success: false, error: 'Geselecteerde regel niet gevonden.' };
    }

    // Load products with relation details
    const products = await prisma.product.findMany({
      where: { internalArticleNumber: { in: articleNumbers } },
      include: { brand: true, supplier: true, category: true, subcategory: true },
    });

    if (products.length === 0) {
      return { success: false, error: 'Geen geldige producten gevonden in de database.' };
    }

    const previews: ProductRulePreview[] = [];
    const hasLongDesc = rule.targetFields.some(f => f === 'longDescription' || f === 'description');
    const batchSize = hasLongDesc ? 5 : 10;

      // Preserve the caller's articleNumbers order
      const productByArt = new Map(products.map(p => [p.internalArticleNumber, p]));
      const orderedProducts = articleNumbers
        .map(art => productByArt.get(art))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));

      const systemPrompt = `Je bent een ervaren e-commerce tekstredacteur en contentspecialist voor e-co.store.
Jouw taak is om productteksten te harmoniseren, uniform te formateren en af te stemmen conform strikte standaarden.
BELANGRIJK VOOR CONSISTENTIE:
- Behandel alle producten in de batch op EXACT dezelfde consistente manier (zelfde eenheidsnotatie, hoofdlettergebruik, volgorde, leestekens en opbouw).
- Geef UITSLUITEND een valide JSON object terug in het formaat:
  {"items": [{"articleNumber": "<artikelnummer>", "<veldKey>": "<geformatteerde tekst>", ...}]}
- Geen markdown code-blocks (\`\`\`json), geen toelichting, alleen de pure JSON string.`;

        // Carry over 1-2 formatted examples from batch 1 to subsequent batches for cross-batch consistency
        let referenceExamples: { articleNumber: string; output: Record<string, string> }[] = [];

        for (let i = 0; i < orderedProducts.length; i += batchSize) {
          const batch = orderedProducts.slice(i, i + batchSize);

          const batchPayload = batch.map(product => {
            const specs: Record<string, any> = {};
            if (product.brand?.name) specs.merk = product.brand.name;
            if (product.supplier?.name) specs.leverancier = product.supplier.name;
            if (product.category?.name) specs.categorie = product.category.name;
            if (product.subcategory?.name) specs.subcategorie = product.subcategory.name;
            if (product.color) specs.kleur = product.color;
            if (product.size) specs.maat = product.size;
            if (product.material) specs.materiaal = product.material;
            if (product.mainMaterial) specs.hoofdmateriaal = product.mainMaterial;
            if (product.ingredients) specs.ingredienten = product.ingredients;
            if (product.allergens) specs.allergenen = product.allergens;
            if (product.weightGr) specs.gewichtGr = product.weightGr;

            const fields: Record<string, string> = {};
            for (const fieldKey of rule.targetFields) {
              let actualKey = fieldKey;
              if (fieldKey === 'description') actualKey = 'longDescription';
              if (fieldKey === 'price') actualKey = 'basePrice';
              const originalVal = (product as any)[actualKey] ?? (product.customData ? (product.customData as any)[actualKey] : null) ?? '';
              fields[actualKey] = String(originalVal || '');
            }

            return {
              articleNumber: product.internalArticleNumber,
              currentTitle: product.title,
              specs,
              fieldsToFormat: fields,
            };
          });

          const referenceBlock = referenceExamples.length > 0
            ? `\nREFERENTIE-VOORBEELDEN UIT EERDERE PRODUCTEN IN DEZE BATCH (HOUD EXACT DEZELFDE STIJL EN NOTATIE AAN):\n${JSON.stringify(referenceExamples)}`
            : '';

          const promptLines = [
            `REGELNAAM: "${rule.name}" | DOELSECTIE: ${rule.sectionTitle || 'Algemeen'}`,
            rule.toneOfVoice ? `TOON: ${rule.toneOfVoice}` : null,
            `\nSTANDAARD REGELS & FORMATTERINGSRICHTLIJNEN:\n${rule.instruction}`,
        customInstruction ? `\nAANVULLENDE AANWIJZING:\n${customInstruction}` : null,
            referenceBlock || null,
            `\nTE FORMATTEREN PRODUCTEN (${batch.length} stuks):\n${JSON.stringify(batchPayload)}`,
            `\nFormatteer alle ${batch.length} producten conform de regels met 100% onderlinge consistentie. Geef ALLEEN het JSON-object terug: {"items": [{"articleNumber": "...", ...}]}.`
          ].filter(Boolean).join('\n');

          const parsedByArticle = new Map<string, Record<string, string>>();

          try {
            const result = await callLlm({
              provider,
              prompt: promptLines,
              systemPrompt,
              moduleId: 'assistant',
              userId,
              context: 'formatting-rule-preview-batch',
            });

            if (result.success) {
              const cleaned = result.response
                .trim()
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();
              const firstBrace = cleaned.indexOf('{');
              const lastBrace = cleaned.lastIndexOf('}');
              const jsonSlice = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;

              try {
                const parsed = JSON.parse(jsonSlice);
                const items: any[] = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
                for (const item of items) {
                  if (item && item.articleNumber) {
                    parsedByArticle.set(String(item.articleNumber), item);
                  }
                }
              } catch {
                console.error('Failed to parse batch formatting rule JSON response:', cleaned.slice(0, 400));
              }
            }
          } catch (err: any) {
            console.error(`Error batch-formatting products:`, err);
          }

            for (const product of batch) {
              const aiItem = parsedByArticle.get(product.internalArticleNumber);
              const fieldPreviews: ProductFieldPreview[] = [];
              const exampleOutput: Record<string, string> = {};

            for (const fieldKey of rule.targetFields) {
              let actualKey = fieldKey;
              if (fieldKey === 'description') actualKey = 'longDescription';
              if (fieldKey === 'price') actualKey = 'basePrice';

              const originalVal = String(
                (product as any)[actualKey] ?? (product.customData ? (product.customData as any)[actualKey] : null) ?? ''
              );
              const suggested =
                aiItem && aiItem[actualKey] !== undefined && aiItem[actualKey] !== null
                  ? String(aiItem[actualKey]).trim()
                  : originalVal;

              exampleOutput[actualKey] = suggested;

              fieldPreviews.push({
                fieldKey: actualKey,
                fieldLabel: FIELD_LABELS[actualKey] || actualKey,
                originalValue: originalVal,
                suggestedValue: suggested,
                hasChanged: originalVal.trim() !== suggested.trim(),
                ruleId: rule.id,
                ruleName: rule.name,
              });
            }

            if (referenceExamples.length < 2 && aiItem) {
              referenceExamples.push({
                articleNumber: product.internalArticleNumber,
                output: exampleOutput,
              });
            }

            previews.push({
              articleNumber: product.internalArticleNumber,
              title: product.title,
              brand: product.brand?.name,
              supplier: product.supplier?.name,
              fields: fieldPreviews,
            });
          }
        }

        return { success: true, previews };
      } catch (e: any) {
        console.error('Failed to preview formatting rule:', e);
        return { success: false, error: e.message || 'Onbekende fout bij preview genereren.' };
      }
    }

    // ── Stage Proposals for Editor Review ("Klaarzetten voor review") ────────────

    export interface StageRuleItem {
      articleNumber: string;
      changes: {
        fieldKey: string;
        fieldLabel?: string;
        oldValue?: string;
        newValue: string;
        ruleId?: string;
        ruleName?: string;
      }[];
    }

    export async function stageFormattingRuleProposalsAction(params: {
      items: StageRuleItem[];
      ruleId?: string;
      ruleName?: string;
      sectionId?: string;
    }): Promise<{ success: boolean; stagedProductCount: number; stagedFieldCount: number; error?: string }> {
      const { items, ruleId, ruleName = 'Formateringsregel', sectionId } = params;

      if (!items || items.length === 0) {
        return { success: false, stagedProductCount: 0, stagedFieldCount: 0, error: 'Geen voorstellen geselecteerd om klaar te zetten.' };
      }

      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return { success: false, stagedProductCount: 0, stagedFieldCount: 0, error: 'Niet ingelogd.' };
      }
      const userId = (session.user as any).id as string;
      const userEmail = (session.user as any).email as string;
      const now = new Date().toISOString();

      try {
        let stagedProductCount = 0;
        let stagedFieldCount = 0;

        for (const item of items) {
          if (!item.changes || item.changes.length === 0) continue;

          const existing = await prisma.product.findUnique({
            where: { internalArticleNumber: item.articleNumber },
            select: { customData: true },
          });
          if (!existing) continue;

          const currentCustom: Record<string, any> =
            existing.customData && typeof existing.customData === 'object'
              ? { ...(existing.customData as Record<string, any>) }
              : {};

          const pendingMap: Record<string, PendingFormattingFieldProposal> =
            currentCustom._pendingFormatting && typeof currentCustom._pendingFormatting === 'object'
              ? { ...(currentCustom._pendingFormatting as Record<string, PendingFormattingFieldProposal>) }
              : {};

          for (const ch of item.changes) {
            pendingMap[ch.fieldKey] = {
              fieldKey: ch.fieldKey,
              fieldLabel: ch.fieldLabel || FIELD_LABELS[ch.fieldKey] || ch.fieldKey,
              originalValue: ch.oldValue ?? '',
              suggestedValue: ch.newValue,
              ruleId: ch.ruleId || ruleId,
              ruleName: ch.ruleName || ruleName,
              sectionId,
              stagedAt: now,
              stagedByEmail: userEmail || undefined,
            };
            stagedFieldCount++;
          }

          currentCustom._pendingFormatting = pendingMap;

          await prisma.product.update({
            where: { internalArticleNumber: item.articleNumber },
            data: { customData: currentCustom },
          });
          stagedProductCount++;

          await prisma.auditLog.create({
            data: {
              userId,
              action: 'FORMATTING_RULE_STAGE',
              entity: 'Product',
              entityId: item.articleNumber,
              changes: `Voorstellen klaargezet voor review (${ruleName}): ${item.changes.map(c => c.fieldKey).join(', ')}`,
            },
          }).catch(() => { });
        }

        revalidatePath('/products');
        revalidatePath('/assignments');
        revalidatePath('/', 'layout');

        return { success: true, stagedProductCount, stagedFieldCount };
      } catch (e: any) {
        console.error('Failed to stage formatting proposals:', e);
        return { success: false, stagedProductCount: 0, stagedFieldCount: 0, error: e.message || 'Fout bij klaarzetten voor review.' };
      }
    }

    export async function getStagedFormattingProposalsAction(params: {
      articleNumbers: string[];
    }): Promise<{ success: boolean; previews: ProductRulePreview[]; totalProposalCount: number; error?: string }> {
      const { articleNumbers } = params;
      if (!articleNumbers || articleNumbers.length === 0) {
        return { success: true, previews: [], totalProposalCount: 0 };
      }

      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return { success: false, previews: [], totalProposalCount: 0, error: 'Niet ingelogd.' };
      }

      try {
        const products = await prisma.product.findMany({
          where: { internalArticleNumber: { in: articleNumbers } },
          include: { brand: true, supplier: true },
        });

        // Preserve requested order where possible
        const orderMap = new Map(articleNumbers.map((a, idx) => [a, idx]));
        products.sort((a, b) => (orderMap.get(a.internalArticleNumber) ?? 0) - (orderMap.get(b.internalArticleNumber) ?? 0));

        const previews: ProductRulePreview[] = [];
        let totalProposalCount = 0;

        for (const product of products) {
          const customObj =
            product.customData && typeof product.customData === 'object'
              ? (product.customData as Record<string, any>)
              : {};
          const pendingMap =
            customObj._pendingFormatting && typeof customObj._pendingFormatting === 'object'
              ? (customObj._pendingFormatting as Record<string, PendingFormattingFieldProposal>)
              : {};

          const entries = Object.values(pendingMap).filter(p => p && typeof p.fieldKey === 'string');
          if (entries.length === 0) continue;

          const fields: ProductFieldPreview[] = entries.map(entry => {
            const actualKey = entry.fieldKey;
            const liveVal =
              (product as any)[actualKey] ??
              (customObj[actualKey] !== undefined ? customObj[actualKey] : null) ??
              '';
            const currentStr = String(liveVal || '');
            const suggestedStr = String(entry.suggestedValue ?? '');

            totalProposalCount++;
            return {
              fieldKey: actualKey,
              fieldLabel: entry.fieldLabel || FIELD_LABELS[actualKey] || actualKey,
              originalValue: currentStr,
              suggestedValue: suggestedStr,
              hasChanged: currentStr.trim() !== suggestedStr.trim(),
              ruleId: entry.ruleId,
              ruleName: entry.ruleName,
              stagedAt: entry.stagedAt,
              stagedByEmail: entry.stagedByEmail,
            };
          });

          previews.push({
            articleNumber: product.internalArticleNumber,
            title: product.title,
            brand: product.brand?.name,
            supplier: product.supplier?.name,
            fields,
          });
        }

        return { success: true, previews, totalProposalCount };
      } catch (e: any) {
        console.error('Failed to get staged formatting proposals:', e);
        return { success: false, previews: [], totalProposalCount: 0, error: e.message || 'Fout bij ophalen van klaargezette voorstellen.' };
      }
    }

    export async function dismissStagedFormattingProposalsAction(params: {
      items: { articleNumber: string; fieldKeys: string[] }[];
    }): Promise<{ success: boolean; dismissedCount: number; error?: string }> {
      const { items } = params;
      if (!items || items.length === 0) {
        return { success: false, dismissedCount: 0, error: 'Geen voorstellen geselecteerd.' };
      }

      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return { success: false, dismissedCount: 0, error: 'Niet ingelogd.' };
      }
      const userId = (session.user as any).id as string;

      try {
        let dismissedCount = 0;

        for (const item of items) {
          if (!item.fieldKeys || item.fieldKeys.length === 0) continue;
          const existing = await prisma.product.findUnique({
            where: { internalArticleNumber: item.articleNumber },
            select: { customData: true },
          });
          if (!existing?.customData || typeof existing.customData !== 'object') continue;

          const currentCustom: Record<string, any> = { ...(existing.customData as Record<string, any>) };
          const pendingMap: Record<string, any> =
            currentCustom._pendingFormatting && typeof currentCustom._pendingFormatting === 'object'
              ? { ...(currentCustom._pendingFormatting as Record<string, any>) }
              : {};

          let changed = false;
          for (const fk of item.fieldKeys) {
            if (pendingMap[fk] !== undefined) {
              delete pendingMap[fk];
              dismissedCount++;
              changed = true;
            }
          }

          if (!changed) continue;

          if (Object.keys(pendingMap).length === 0) {
            delete currentCustom._pendingFormatting;
          } else {
            currentCustom._pendingFormatting = pendingMap;
          }

          await prisma.product.update({
            where: { internalArticleNumber: item.articleNumber },
            data: { customData: currentCustom },
          });

          await prisma.auditLog.create({
            data: {
              userId,
              action: 'FORMATTING_RULE_DISMISS',
              entity: 'Product',
              entityId: item.articleNumber,
              changes: `Klaargezette formateringsvoorstellen afgewezen/gewist: ${item.fieldKeys.join(', ')}`,
            },
          }).catch(() => { });
        }

        revalidatePath('/products');
        revalidatePath('/assignments');
        revalidatePath('/', 'layout');

        return { success: true, dismissedCount };
      } catch (e: any) {
        console.error('Failed to dismiss staged formatting proposals:', e);
        return { success: false, dismissedCount: 0, error: e.message || 'Fout bij wissen van voorstellen.' };
      }
    }

    // ── Apply Approved Changes ───────────────────────────────────────────────────

    export interface ApplyItemChange {
      fieldKey: string;
      fieldLabel?: string;
      oldValue?: string;
      newValue: string;
    }

    export interface ApplyRuleItem {
      articleNumber: string;
      changes: ApplyItemChange[];
    }

    export async function applyFormattingRuleAction(params: {
      items: ApplyRuleItem[];
      ruleName?: string;
    }): Promise<{ success: boolean; updatedCount: number; error?: string }> {
      const { items, ruleName = 'Formateringsregel' } = params;

      if (!items || items.length === 0) {
        return { success: false, updatedCount: 0, error: 'Geen wijzigingen om door te voeren.' };
      }

      const session = await getServerSession(authOptions);
      if (!session?.user) {
        return { success: false, updatedCount: 0, error: 'Niet ingelogd.' };
      }
      const userId = (session.user as any).id as string;
      const userEmail = (session.user as any).email as string;

      try {
        let updatedCount = 0;
        const historyRows: any[] = [];

        for (const item of items) {
          if (!item.changes || item.changes.length === 0) continue;

          const updateData: Record<string, any> = {};
          const customDataUpdates: Record<string, any> = {};

          const knownColumns = new Set([
            'title', 'shortDescription', 'longDescription', 'seoTitle', 'seoMetaDescription',
            'color', 'size', 'material', 'mainMaterial', 'tags', 'ingredients', 'allergens',
            'critCircular', 'critOther'
          ]);

          for (const ch of item.changes) {
            if (knownColumns.has(ch.fieldKey)) {
              updateData[ch.fieldKey] = ch.newValue;
            } else {
              customDataUpdates[ch.fieldKey] = ch.newValue;
            }

            // Record history entry
            historyRows.push({
              articleNumber: item.articleNumber,
              fieldKey: ch.fieldKey,
              fieldLabel: ch.fieldLabel || FIELD_LABELS[ch.fieldKey] || ch.fieldKey,
              oldValue: ch.oldValue ?? null,
              newValue: ch.newValue,
              source: 'FORMAT_RULE',
              userId: userId || null,
              userEmail: userEmail || null,
            });
          }

          const existing = await prisma.product.findUnique({
            where: { internalArticleNumber: item.articleNumber },
            select: { customData: true },
          });

          const currentCustom: Record<string, any> =
            existing?.customData && typeof existing.customData === 'object'
              ? { ...(existing.customData as Record<string, any>) }
              : {};

          let customChanged = false;
          if (Object.keys(customDataUpdates).length > 0) {
            Object.assign(currentCustom, customDataUpdates);
            customChanged = true;
          }

          // Clean up any staged formatting proposals for the applied fields
          if (currentCustom._pendingFormatting && typeof currentCustom._pendingFormatting === 'object') {
            const pendingMap: Record<string, any> = { ...(currentCustom._pendingFormatting as Record<string, any>) };
            let pendingRemoved = false;
            for (const ch of item.changes) {
              if (pendingMap[ch.fieldKey] !== undefined) {
                delete pendingMap[ch.fieldKey];
                pendingRemoved = true;
              }
            }
            if (pendingRemoved) {
              if (Object.keys(pendingMap).length === 0) {
                delete currentCustom._pendingFormatting;
              } else {
                currentCustom._pendingFormatting = pendingMap;
              }
              customChanged = true;
            }
          }

          if (customChanged) {
            updateData.customData = currentCustom;
          }

          if (Object.keys(updateData).length > 0) {
            updateData.lastEditedByUserId = userId;
            await prisma.product.update({
              where: { internalArticleNumber: item.articleNumber },
              data: updateData,
            });
            updatedCount++;

            // Audit log
            await prisma.auditLog.create({
              data: {
                userId,
                action: 'FORMATTING_RULE_APPLY',
                entity: 'Product',
                entityId: item.articleNumber,
                changes: `Toegepaste regel: "${ruleName}" op velden: ${item.changes.map(c => c.fieldKey).join(', ')}`,
              },
            }).catch(() => { });
          }
        }

        if (historyRows.length > 0) {
          await prisma.productFieldHistory.createMany({
            data: historyRows,
          }).catch(err => console.error('Field history write error:', err));
        }

        revalidatePath('/products');
        revalidatePath('/assignments');
        revalidatePath('/', 'layout');

        return { success: true, updatedCount };
      } catch (e: any) {
        console.error('Failed to apply formatting rules:', e);
        return { success: false, updatedCount: 0, error: e.message || 'Fout bij opslaan.' };
      }
    }
