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

const SETTING_KEY = 'formatting_rules';

export const DEFAULT_FORMATTING_RULES: FormattingRule[] = [
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
    id: 'rule-seo-meta',
    name: 'SEO Titels & Meta Omschrijvingen',
    description: 'Optimaliseert zoekmachine-titels (max 60 tekens) en meta-descriptions (max 155 tekens).',
    sectionId: 'sect-basis',
    sectionTitle: 'Webshop Content (Basis)',
    targetFields: ['seoTitle', 'seoMetaDescription'],
    instruction: `Genereer optimale zoekmachineteksten (SEO):
1. SEO Titel:
   - Maximaal 60 tekens (inclusief spaties).
   - Begin met het belangrijkste zoekwoord / productnaam, gevolgd door merk of belangrijkste USP.
   - Eindig met '| E&co'.
2. SEO Meta Description:
   - Tussen 130 en 155 tekens (inclusief spaties).
   - Bevat een subtiele actieve call-to-action (bijv. "Ontdek het hier", "Bekijk direct").
   - Geeft een heldere, nieuwsgierigmakende samenvatting van het product.`,
    toneOfVoice: 'Aansprekend, doelgericht en zoekmachine-vriendelijk',
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

export async function getFormattingRulesAction(): Promise<FormattingRule[]> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY },
    });

    if (!record?.value) {
      return DEFAULT_FORMATTING_RULES;
    }

    const rules = JSON.parse(record.value) as FormattingRule[];
    return Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_FORMATTING_RULES;
  } catch (e: any) {
    console.error('Failed to load formatting rules:', e);
    return DEFAULT_FORMATTING_RULES;
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

    // Process each product through the formatting rule
    for (const product of products) {
      const fieldPreviews: ProductFieldPreview[] = [];

      // Collect product context
      const specs: string[] = [];
      if (product.title) specs.push(`Huidige titel: "${product.title}"`);
      if (product.brand?.name) specs.push(`Merk: ${product.brand.name}`);
      if (product.supplier?.name) specs.push(`Leverancier: ${product.supplier.name}`);
      if (product.category?.name) specs.push(`Categorie: ${product.category.name}`);
      if (product.subcategory?.name) specs.push(`Subcategorie: ${product.subcategory.name}`);
      if (product.color) specs.push(`Kleur: ${product.color}`);
      if (product.size) specs.push(`Maat: ${product.size}`);
      if (product.material) specs.push(`Materiaal: ${product.material}`);
      if (product.mainMaterial) specs.push(`Hoofdmateriaal: ${product.mainMaterial}`);
      if (product.ingredients) specs.push(`Ingrediënten: ${product.ingredients}`);
      if (product.allergens) specs.push(`Allergenen: ${product.allergens}`);
      if (product.weightGr) specs.push(`Gewicht: ${product.weightGr}g`);

      // Current field values to format
      const fieldsToFormat = rule.targetFields.map(fieldKey => {
        let actualKey = fieldKey;
        if (fieldKey === 'description') actualKey = 'longDescription';
        if (fieldKey === 'price') actualKey = 'basePrice';

        const originalVal = (product as any)[actualKey] ?? (product.customData ? (product.customData as any)[actualKey] : null) ?? '';
        return {
          key: actualKey,
          label: FIELD_LABELS[actualKey] || actualKey,
          currentValue: String(originalVal || ''),
        };
      });

      const systemPrompt = `Je bent een ervaren e-commerce tekstredacteur en contentspecialist voor e-co.store.
Jouw taak is om productteksten te harmoniseren, uniform te formateren en af te stemmen conform strikte standaarden.
Geef UITSLUITEND een valide JSON object terug waarin de keys exact overeenkomen met de gevraagde velden, en de values de nieuwe, geformatteerde teksten zijn.
Voorbeeld: {"title": "Nieuwe geformatteerde titel", "shortDescription": "Twee uniforme zinnen..."}.
Geen markdown code-blocks (\`\`\`json), geen toelichting, alleen de pure JSON string.`;

      const promptLines = [
        `REGELNAAM: "${rule.name}"`,
        `DOELSECTIE: ${rule.sectionTitle || 'Algemeen'}`,
        rule.toneOfVoice ? `TOON VAN DE TEKST: ${rule.toneOfVoice}` : null,
        `\nSTANDAARD REGELS & FORMATTERINGSRICHTLIJNEN:\n${rule.instruction}`,
        customInstruction ? `\nAANVULLENDE AANWIJZING VOOR DEZE RUN:\n${customInstruction}` : null,
        `\nPRODUCTSPECIFICATIES:\n${specs.join('\n')}`,
        `\nTE FORMATTEREN VELDEN:\n${fieldsToFormat.map(f => `- Veld "${f.key}" (${f.label}): huidige tekst:\n"""\n${f.currentValue}\n"""`).join('\n\n')}`,
        `\nHerschrijf en formatteer deze velden conform de regels. Behoud correcte feitelijke informatie en pas de gevraagde uniformiteit en opbouw toe. Geef ALLEEN JSON terug.`
      ].filter(Boolean).join('\n');

      try {
        const result = await callLlm({
          provider,
          prompt: promptLines,
          systemPrompt,
          moduleId: 'assistant',
          userId,
          context: 'formatting-rule-preview',
        });

        if (result.success) {
          const raw = result.response.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
          let parsed: Record<string, string> = {};
          try {
            parsed = JSON.parse(raw);
          } catch (jsonErr) {
            console.error('Failed to parse formatting rule JSON response:', raw);
          }

          for (const f of fieldsToFormat) {
            const suggested = (parsed[f.key] !== undefined && parsed[f.key] !== null)
              ? String(parsed[f.key]).trim()
              : f.currentValue;

            fieldPreviews.push({
              fieldKey: f.key,
              fieldLabel: f.label,
              originalValue: f.currentValue,
              suggestedValue: suggested,
              hasChanged: f.currentValue.trim() !== suggested.trim(),
            });
          }
        } else {
          // If LLM failed, fallback to original values with note
          for (const f of fieldsToFormat) {
            fieldPreviews.push({
              fieldKey: f.key,
              fieldLabel: f.label,
              originalValue: f.currentValue,
              suggestedValue: f.currentValue,
              hasChanged: false,
            });
          }
        }
      } catch (err: any) {
        console.error(`Error formatting product ${product.internalArticleNumber}:`, err);
        for (const f of fieldsToFormat) {
          fieldPreviews.push({
            fieldKey: f.key,
            fieldLabel: f.label,
            originalValue: f.currentValue,
            suggestedValue: f.currentValue,
            hasChanged: false,
          });
        }
      }

      previews.push({
        articleNumber: product.internalArticleNumber,
        title: product.title,
        brand: product.brand?.name,
        supplier: product.supplier?.name,
        fields: fieldPreviews,
      });
    }

    return { success: true, previews };
  } catch (e: any) {
    console.error('Failed to preview formatting rule:', e);
    return { success: false, error: e.message || 'Onbekende fout bij preview genereren.' };
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

      if (Object.keys(customDataUpdates).length > 0) {
        const existing = await prisma.product.findUnique({
          where: { internalArticleNumber: item.articleNumber },
          select: { customData: true },
        });
        const currentCustom = (existing?.customData && typeof existing.customData === 'object') ? (existing.customData as Record<string, any>) : {};
        updateData.customData = { ...currentCustom, ...customDataUpdates };
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
        }).catch(() => {});
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
