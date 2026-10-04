/**
 * EmpCo (Empowering Consumers for the Green Transition — Richtlijn (EU) 2024/825)
 * Shared, client- and server-safe helpers: rules, prompt, field extraction,
 * content hashing and response parsing.
 *
 * NOTE: keep this file free of server-only imports (prisma, fs, …) — it is
 * imported by client components as well.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export const EMPCO_ACCENT = '#0f766e';
export const EMPCO_GRADIENT = 'linear-gradient(135deg, #0f766e 0%, #065f46 100%)';

export type EmpcoStatus = 'PASS' | 'WARNING' | 'FAIL';
export type EmpcoSeverity = 'FAIL' | 'WARNING';
export type EmpcoPolicy = 'none' | 'warn' | 'block';

export interface EmpcoIssue {
  field: string;          // form key, e.g. "longDescription" or "custom_foo"
  fieldLabel?: string;
  original: string;       // exact offending passage
  rule: string;           // EmpcoRuleCode
  severity: EmpcoSeverity;
  explanation: string;
  replacement: string;    // suggested compliant passage ('' = remove)
}

export interface EmpcoResult {
  status: EmpcoStatus;
  summary: string;
  issues: EmpcoIssue[];
  compliant_claims: string[];
  /** Issues that were resolved afterwards (suggestion applied / text changed) */
  resolved?: (EmpcoIssue & { resolvedAt: string; via: 'EMPCO' | 'EDIT' })[];
  /** Snapshot of the checked field values (key → value), used to keep the check current after applying fixes */
  checkedValues?: Record<string, string>;
}

export interface EmpcoField {
  key: string;
  label: string;
  value: string;
  kind: 'text' | 'claim'; // claim = sustainability toggle (e.g. "CO2 gecompenseerd" = Ja)
}

export interface EmpcoGuidelineLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  category?: 'eu_law' | 'national_authority' | 'guideline' | 'other';
}

export interface EmpcoFieldOption {
  key: string;
  label: string;
  category: 'content' | 'properties' | 'sustainability' | 'custom';
  defaultIncluded: boolean;
  description?: string;
}

export const DEFAULT_EMPCO_GUIDELINE_LINKS: EmpcoGuidelineLink[] = [
  {
    id: 'eur-lex-2024-825',
    title: 'Richtlijn (EU) 2024/825 (EUR-Lex)',
    url: 'https://eur-lex.europa.eu/eli/dir/2024/825/oj',
    description: 'Officiële Europese richtlijn betreffende het versterken van de positie van de consument voor de groene transitie (EmpCo), van toepassing sinds 27 september 2026.',
    category: 'eu_law',
  },
  {
    id: 'acm-duurzaamheidsclaims',
    title: 'ACM Leidraad Duurzaamheidsclaims',
    url: 'https://www.acm.nl/nl/duurzaamheid/duurzaamheidsclaims',
    description: 'De 5 vuistregels van de Autoriteit Consument & Markt voor duidelijke, juiste en onderbouwde duurzaamheidsclaims in Nederland.',
    category: 'national_authority',
  },
  {
    id: 'eu-green-claims',
    title: 'Europese Commissie — Green Claims Directive (voorstel)',
    url: 'https://environment.ec.europa.eu/topics/circular-economy/green-claims_en',
    description: 'Aanvullende Europese regels voor wetenschappelijke verificatie en voorafgaande certificering van expliciete milieuclaims.',
    category: 'eu_law',
  },
  {
    id: 'wet-oneerlijke-handelspraktijken',
    title: 'Rijksoverheid — Wet oneerlijke handelspraktijken',
    url: 'https://www.rijksoverheid.nl/onderwerpen/bescherming-van-consumenten/oneerlijke-handelspraktijken',
    description: 'Nederlandse wettelijke bepalingen (art. 6:193a-j Burgerlijk Wetboek) omtrent misleidende omissies en verboden handelspraktijken.',
    category: 'national_authority',
  }
];

export const DEFAULT_EMPCO_GUIDELINE_NOTES = `De EmpCo-richtlijn (EU 2024/825) en de ACM Leidraad Duurzaamheidsclaims verbieden misleidende en ongegronde milieuclaims.
Belangrijkste wetgevingsprincipes:
1. Generieke milieuclaims ('duurzaam', 'eco', 'groen', 'klimaatvriendelijk', 'bewust') zijn verboden zonder erkende uitmuntende milieuprestatie (bijv. EU Ecolabel).
2. Claims gebaseerd op CO₂-compensatie ('CO₂-neutraal', 'klimaatneutraal', 'CO₂-gecompenseerd') mogen niet worden gebruikt voor producten.
3. Duurzaamheidslabels en certificaten moeten gebaseerd zijn op een onafhankelijk verificatiesysteem of overheidsregeling.
4. Een claim over een enkel aspect mag niet suggereren dat het hele product of de onderneming duurzaam is.
5. Wettelijke minimumeisen mogen nooit als een onderscheidend 'duurzaam' voordeel worden gepresenteerd.`;

export const EMPCO_AVAILABLE_FIELDS: EmpcoFieldOption[] = [
  // Webshop & SEO Content
  { key: 'title', label: 'Titel / Omschrijving', category: 'content', defaultIncluded: true, description: 'De hoofdnaam/titel van het product' },
  { key: 'shortDescription', label: 'Korte omschrijving', category: 'content', defaultIncluded: true, description: 'Korte samenvatting op productoverzichten' },
  { key: 'longDescription', label: 'Lange omschrijving', category: 'content', defaultIncluded: true, description: 'Uitgebreide productbeschrijving' },
  { key: 'seoTitle', label: 'SEO Titel', category: 'content', defaultIncluded: true, description: 'Paginatitel voor zoekmachines' },
  { key: 'seoMetaDescription', label: 'SEO Beschrijving', category: 'content', defaultIncluded: true, description: 'Meta description in zoekresultaten' },
  { key: 'tags', label: 'Tags / Zoekwoorden', category: 'content', defaultIncluded: true, description: 'Klantgerichte trefwoorden' },

  // Eigenschappen & Ingrediënten
  { key: 'mainMaterial', label: 'Hoofdmateriaal', category: 'properties', defaultIncluded: true, description: 'Materiaalspecificatie (bijv. biologisch katoen, gerecycled glas)' },
  { key: 'ingredients', label: 'Ingrediënten', category: 'properties', defaultIncluded: true, description: 'Ingrediëntenlijst van het product' },
  { key: 'allergens', label: 'Allergenen', category: 'properties', defaultIncluded: false, description: 'Allergeneninformatie' },
  { key: 'color', label: 'Kleur', category: 'properties', defaultIncluded: false, description: 'Kleurvermelding' },

  // Duurzaamheidscriteria (Milieu)
  { key: 'critMilieuPackagingFree', label: 'Verpakkingsvrij (Milieu)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMilieuPlasticFree', label: 'Plastic vrij (Milieu)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMilieuRecyclable', label: 'Recyclebaar (Milieu)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMilieuBiodegradable', label: 'Afbreekbaar (Milieu)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMilieuCompostable', label: 'Composteerbaar (Milieu)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMilieuCarbonCompensated', label: 'Uitstootcompensatie (Milieu)', category: 'sustainability', defaultIncluded: true },

  // Duurzaamheidscriteria (Mens & Dier)
  { key: 'critMensSafeWork', label: 'Veilige werkomgeving (Mens)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMensFairWage', label: 'Eerlijk loon (Mens)', category: 'sustainability', defaultIncluded: true },
  { key: 'critMensSocial', label: 'Maatschappelijke betrokkenheid (Mens)', category: 'sustainability', defaultIncluded: true },
  { key: 'critDierCrueltyFree', label: 'Diervrij / Vegan (Dier)', category: 'sustainability', defaultIncluded: true },
  { key: 'critDierFriendly', label: 'Diervriendelijk (Dier)', category: 'sustainability', defaultIncluded: true },

  // Duurzaamheidscriteria (Bewerking & Transport)
  { key: 'critHandmade', label: 'Handgemaakt (Bewerking)', category: 'sustainability', defaultIncluded: true },
  { key: 'critNatural', label: 'Natuurlijk (Bewerking)', category: 'sustainability', defaultIncluded: true },
  { key: 'critCircular', label: 'Hergebruik / Gerecycled (Bewerking)', category: 'sustainability', defaultIncluded: true },
  { key: 'critTransportDistance', label: 'Afstand (Transport)', category: 'sustainability', defaultIncluded: false },
  { key: 'critTransportVehicle', label: 'Vervoersmiddel (Transport)', category: 'sustainability', defaultIncluded: false },
  { key: 'critOther', label: 'Overige duurzaamheidsvermelding', category: 'sustainability', defaultIncluded: true },
];

export const DEFAULT_INCLUDED_EMPCO_FIELDS: string[] = EMPCO_AVAILABLE_FIELDS
  .filter(f => f.defaultIncluded)
  .map(f => f.key);

export interface EmpcoSettings {
  /** What happens when setting "Webshop Ready = Ja" for a product with an EmpCo violation (FAIL) */
  readyPolicyFail: EmpcoPolicy;
  /** … for a product with only warnings */
  readyPolicyWarning: EmpcoPolicy;
  /** … for a product without (an up-to-date) EmpCo check */
  readyPolicyUnchecked: EmpcoPolicy;
  /** Default for "include EmpCo check" in (batch) product analysis */
  includeInAnalysisByDefault: boolean;
  /** Extra house rules appended to the EmpCo prompt */
  extraInstructions: string;
  /** Explanation and guidance text regarding the legislation */
  guidelineNotes?: string;
  /** External references to official legislation portals (EUR-Lex, ACM, etc.) */
  guidelineLinks?: EmpcoGuidelineLink[];
  /** Keys of fields/components included in the EmpCo check */
  includedFieldKeys?: string[];
}

export const EMPCO_SETTINGS_KEY = 'empco_settings';

export const DEFAULT_EMPCO_SETTINGS: EmpcoSettings = {
  readyPolicyFail: 'warn',
  readyPolicyWarning: 'none',
  readyPolicyUnchecked: 'none',
  includeInAnalysisByDefault: true,
  extraInstructions: '',
  guidelineNotes: DEFAULT_EMPCO_GUIDELINE_NOTES,
  guidelineLinks: DEFAULT_EMPCO_GUIDELINE_LINKS,
  includedFieldKeys: DEFAULT_INCLUDED_EMPCO_FIELDS,
};

export function normalizeEmpcoSettings(raw: any): EmpcoSettings {
  const pol = (v: any, d: EmpcoPolicy): EmpcoPolicy => (v === 'none' || v === 'warn' || v === 'block' ? v : d);
  const links: EmpcoGuidelineLink[] = Array.isArray(raw?.guidelineLinks)
    ? raw.guidelineLinks.filter((l: any) => l && typeof l === 'object' && l.url).map((l: any) => ({
        id: String(l.id || Math.random().toString(36).slice(2, 9)),
        title: String(l.title || 'Wetgevingsbron'),
        url: String(l.url || ''),
        description: l.description ? String(l.description) : undefined,
        category: l.category || 'other',
      }))
    : DEFAULT_EMPCO_GUIDELINE_LINKS;

  const includedKeys: string[] = Array.isArray(raw?.includedFieldKeys) && raw.includedFieldKeys.length > 0
    ? raw.includedFieldKeys.map(String)
    : DEFAULT_INCLUDED_EMPCO_FIELDS;

  return {
    readyPolicyFail: pol(raw?.readyPolicyFail, DEFAULT_EMPCO_SETTINGS.readyPolicyFail),
    readyPolicyWarning: pol(raw?.readyPolicyWarning, DEFAULT_EMPCO_SETTINGS.readyPolicyWarning),
    readyPolicyUnchecked: pol(raw?.readyPolicyUnchecked, DEFAULT_EMPCO_SETTINGS.readyPolicyUnchecked),
    includeInAnalysisByDefault: typeof raw?.includeInAnalysisByDefault === 'boolean' ? raw.includeInAnalysisByDefault : DEFAULT_EMPCO_SETTINGS.includeInAnalysisByDefault,
    extraInstructions: typeof raw?.extraInstructions === 'string' ? raw.extraInstructions : '',
    guidelineNotes: typeof raw?.guidelineNotes === 'string' ? raw.guidelineNotes : DEFAULT_EMPCO_GUIDELINE_NOTES,
    guidelineLinks: links,
    includedFieldKeys: includedKeys,
  };
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export const EMPCO_RULES: Record<string, { label: string; description: string }> = {
  GENERIC_CLAIM:        { label: 'Generieke milieuclaim',             description: 'Algemene claims zoals "eco", "groen", "duurzaam", "milieuvriendelijk", "natuurvriendelijk", "klimaatvriendelijk", "bewust" zonder aantoonbare, erkende uitmuntende milieuprestatie.' },
  OFFSET_CLAIM:         { label: 'Klimaatclaim o.b.v. compensatie',   description: 'Claims als "CO₂-neutraal", "klimaatneutraal", "klimaatpositief" of "CO₂-gecompenseerd" die gebaseerd zijn op compensatie (offsetting).' },
  SUSTAINABILITY_LABEL: { label: 'Niet-erkend duurzaamheidslabel',    description: 'Duurzaamheidskeurmerken/-logo\'s die niet gebaseerd zijn op een certificeringsregeling of door de overheid zijn vastgesteld.' },
  WHOLE_PRODUCT:        { label: 'Claim over geheel product',         description: 'Milieuclaim over het hele product of de hele onderneming terwijl die slechts op één aspect betrekking heeft.' },
  FUTURE_CLAIM:         { label: 'Toekomstige milieuprestatie',       description: 'Claims over toekomstige prestaties ("in 2030 klimaatneutraal") zonder concreet, openbaar en onafhankelijk gecontroleerd uitvoeringsplan.' },
  LEGAL_REQUIREMENT:    { label: 'Wettelijke eis als USP',            description: 'Wettelijk verplichte eigenschappen presenteren als onderscheidend kenmerk (bijv. "vrij van [verboden stof]").' },
  IRRELEVANT_BENEFIT:   { label: 'Irrelevant voordeel',               description: 'Benadrukken van een milieuvoordeel dat niet relevant is voor het product.' },
  DURABILITY:           { label: 'Levensduur / repareerbaarheid',     description: 'Onjuiste of niet-onderbouwde claims over levensduur, duurzaamheid in gebruik of repareerbaarheid.' },
  UNSUBSTANTIATED:      { label: 'Onvoldoende onderbouwd',            description: 'Specifieke milieuclaim die mogelijk klopt, maar niet concreet of verifieerbaar genoeg geformuleerd is.' },
};

export function ruleLabel(code: string): string {
  return EMPCO_RULES[code]?.label ?? code;
}

// ── Field extraction ──────────────────────────────────────────────────────────

/** Fields that are never customer-facing / never contain claims */
const EXCLUDED_KEYS = new Set([
  'internalArticleNumber', 'ean', 'webshopSlug', 'status', 'readyForImport', 'internalNotes',
  'internalRemarks', 'supplierContacted', 'qualityControlStatus', 'exportStatus', 'assignedUserId',
  'brandId', 'supplierId', 'categoryId', 'subcategoryId', 'color', 'size', 'media', 'basePrice', 'price',
]);

/** Customer-facing text fields that are always checked, even if missing from the layout */
const ALWAYS_CHECK: { key: string; label: string }[] = [
  { key: 'title',              label: 'Omschrijving' },
  { key: 'shortDescription',   label: 'Korte omschrijving' },
  { key: 'longDescription',    label: 'Lange omschrijving' },
  { key: 'seoTitle',           label: 'SEO Titel' },
  { key: 'seoMetaDescription', label: 'SEO Beschrijving' },
  { key: 'tags',               label: 'Tags' },
];

function normalizeKey(fieldId: string): string {
  let key = fieldId.replace('FIELD:', '');
  if (key === 'description') key = 'longDescription';
  if (key === 'critMensSocialCheck') key = 'critMensSocial';
  return key;
}

function readValue(product: any, key: string, overrides?: Record<string, string>): any {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
  if (key.startsWith('custom_')) return product?.customData?.[key.replace('custom_', '')];
  return product?.[key];
}

export function getAvailableEmpcoFields(layout: any[] = []): EmpcoFieldOption[] {
  const list: EmpcoFieldOption[] = [...EMPCO_AVAILABLE_FIELDS];
  const knownKeys = new Set(list.map(f => f.key));

  for (const section of layout ?? []) {
    for (const field of section?.fields ?? []) {
      const type = field.type;
      if (type === 'chat' || type === 'media' || type === 'relation' || type === 'number') continue;
      const key = normalizeKey(field.id ?? '');
      if (!key || EXCLUDED_KEYS.has(key) || knownKeys.has(key)) continue;

      knownKeys.add(key);
      list.push({
        key,
        label: field.label || key,
        category: key.startsWith('crit') ? 'sustainability' : 'custom',
        defaultIncluded: true,
        description: `Veld uit sectie "${section.title || 'Formulier'}"`,
      });
    }
  }

  return list;
}

/**
 * Collects all customer-facing texts and sustainability toggles of a product.
 * `overrides` allows passing live (unsaved) form values keyed by form key.
 * `includedFieldKeys` optionally filters which fields to extract (defaulting to all if empty).
 */
export function extractEmpcoFields(
  product: any,
  layout: any[] = [],
  overrides?: Record<string, string>,
  includedFieldKeys?: string[]
): EmpcoField[] {
  const out = new Map<string, EmpcoField>();
  const isIncluded = (key: string) => {
    if (!includedFieldKeys || includedFieldKeys.length === 0) return true;
    return includedFieldKeys.includes(key);
  };

  const pushText = (key: string, label: string) => {
    if (!isIncluded(key) || out.has(key) || EXCLUDED_KEYS.has(key)) return;
    const raw = readValue(product, key, overrides);
    if (raw == null || typeof raw === 'object') return;
    // Normalize CRLF to LF and trim so browser textareas match database values
    const value = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!value) return;
    out.set(key, { key, label, value, kind: 'text' });
  };

  for (const f of ALWAYS_CHECK) {
    if (isIncluded(f.key)) pushText(f.key, f.label);
  }

  for (const section of layout ?? []) {
    for (const field of section?.fields ?? []) {
      const type = field.type;
      if (type === 'chat' || type === 'media' || type === 'relation' || type === 'number') continue;
      const key = normalizeKey(field.id ?? '');
      if (!key || !isIncluded(key) || out.has(key) || EXCLUDED_KEYS.has(key)) continue;

      if (type === 'checkbox' || type === 'threeway') {
        // Only sustainability criteria toggles can act as (badge) claims
        if (!key.startsWith('crit')) continue;
        const raw = readValue(product, key, overrides);
        if (String(raw ?? '') === 'Ja') {
          out.set(key, { key, label: field.label ?? key, value: 'Ja', kind: 'claim' });
        }
        continue;
      }
      pushText(key, field.label ?? key);
    }
  }

  // Stable ordering for hashing / prompting
  return Array.from(out.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/** Deterministic FNV-1a hash (32-bit, hex) of the checked content. Works in browser and Node. */
export function hashEmpcoFields(fields: EmpcoField[]): string {
  const str = fields.map(f => `${f.key}=${f.value}`).join('\u0001');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ── Prompting ─────────────────────────────────────────────────────────────────

export function buildEmpcoSystemPrompt(
  extraInstructions?: string,
  brandKnowledge?: string,
  guidelineNotes?: string,
  guidelineLinks?: EmpcoGuidelineLink[]
): string {
  const rules = Object.entries(EMPCO_RULES).map(([code, r]) => `- ${code} — ${r.label}: ${r.description}`).join('\n');
  const linksContext = guidelineLinks && guidelineLinks.length > 0
    ? `\nOfficiële wetgeving en richtlijnen ter referentie:\n${guidelineLinks.map(l => `- ${l.title}: ${l.url}${l.description ? ` (${l.description})` : ''}`).join('\n')}\n`
    : '';

  return `Je bent een compliance-specialist voor Nederlandse en Europese consumentenwetgeving. Je toetst productteksten van een webshop aan de EmpCo-richtlijn (Richtlijn (EU) 2024/825, "Empowering Consumers for the Green Transition"), zoals geïmplementeerd in de Nederlandse Wet oneerlijke handelspraktijken (van toepassing sinds 27 september 2026), en de ACM Leidraad Duurzaamheidsclaims.
${linksContext}
Toetsingsregels (gebruik de code in het veld "rule"):
${rules}

Richtlijnen:
- Specifieke, verifieerbare claims zijn TOEGESTAAN, bijv. "gemaakt van 80% gerecycled PET", "GOTS-gecertificeerd biologisch katoen", "verpakking van 100% gerecycled karton", "EU Ecolabel". Markeer die NIET als overtreding; zet ze in "compliant_claims".
- Een erkend keurmerk (EU Ecolabel, FSC, GOTS, Fairtrade, EKO, Cradle to Cradle, Blauer Engel, Nordic Swan, etc.) maakt een specifieke claim over dat aspect toegestaan.
- Woorden als "eco", "groen", "duurzaam", "bewust", "natuurvriendelijk", "milieuvriendelijk", "planet friendly", "biologisch afbreekbaar" (zonder omstandigheden/termijn) zijn verdacht. Ook in tags en SEO-teksten.
- Een productnaam of merknaam is geen claim, tenzij er een milieuclaim in verwerkt is die als zodanig gepresenteerd wordt.
- Velden met type "KENMERK" zijn aan/uit-kenmerken die op de webshop als badge/icoon getoond kunnen worden. Beoordeel of zo'n kenmerk als claim problematisch is (bijv. "CO₂ gecompenseerd" = OFFSET_CLAIM). Voor KENMERK-velden laat je "replacement" leeg en leg je in "explanation" uit wat er moet gebeuren.
- severity "FAIL" = duidelijke overtreding (zwarte lijst). severity "WARNING" = twijfelgeval of onvoldoende onderbouwd.
- "original" MOET een LETTERLIJK, exact gekopieerd fragment uit het betreffende veld zijn, zodat het automatisch vervangen kan worden.
- "replacement" is de herschreven, EmpCo-conforme versie van precies dat fragment, in dezelfde taal en toon. Verzin geen feiten of certificeringen die niet in de productgegevens staan.
- VERPLICHTE ZINSOPBOUW- EN GRAMMATICACHECK:
  De voorgestelde aanpassing MOET altijd leiden tot een natuurlijke, lopende en grammaticaal vlekkeloze Nederlandse zin.
  * Knip NOOIT zomaar losse bijvoeglijke naamwoorden weg als er daardoor een kreupele, onvolledige of grammaticale fout ontstaat in de zin!
    Voorbeeld van wat FOUT is:
      Tekst: "Het papier is gecertificeerd met het FSC-keurmerk en de Blauer Engel, voor een bewuste en duurzame papierkeuze."
      FOUT: original = "bewuste en duurzame", replacement = ""
      Waarom fout? De overgebleven zin wordt: "...Blauer Engel, voor een papierkeuze." Dat is grammaticaal kreupel en lelijk Nederlands!
    Hoe het WEL moet:
      GOED (Optie A - hele overtollige bepaling weghalen):
        original = ", voor een bewuste en duurzame papierkeuze."
        replacement = "."
        Resultaat: "Het papier is gecertificeerd met het FSC-keurmerk en de Blauer Engel." (vloeiend en grammaticaal perfect!)
      GOED (Optie B - zinsdeel natuurlijk herschrijven):
        original = "voor een bewuste en duurzame papierkeuze"
        replacement = "als betrouwbare papierkeuze" (of "voor dagelijks gebruik")
  * Neem de VOLLEDIGE zinsnede mee in "original" als het weglaten van alleen de overtreding een wees-voorzetsel ("voor een", "met", "van", "om") of onzinnige zinsconstructie achterlaat, inclusief eventuele komma's en leestekens.
  * Zinsbouw-verificatiestap vóór output: Lees de volledige zin zoals die luidt NA vervanging van "original" door "replacement". Klinkt de zin natuurlijk, vloeiend en grammaticaal 100% correct? Zo niet, verbreed "original" of pas "replacement" aan tot de zin perfect loopt.
- CONSTRUCTIEVE EN INHOUDELIJK RIJKE VOORSTELLEN (VERRIJKEN I.P.V. KAALSLAG):
  * Het doel van de EmpCo-richtlijn is niet om productteksten saai, kaal of commercieel krachteloos te maken door alles weg te knippen. Het doel is om vage containerbegrippen om te vormen naar FEITELIJKE, SPECIFIEKE en VERIFIEERBARE context.
  * Wanneer een tekst een vage claim bevat die gekoppeld is aan een legitieme certificering of maatschappelijk initiatief (zoals B Corp, Fairtrade, sociale onderneming, gerecyclede grondstoffen of keurmerken):
    - Vermijd een té kaal voorstel dat de hele maatschappelijke en ecologische waarde wegpoetst (bijv. niet alleen "Merk X is B Corp-gecertificeerd.").
    - Vorm de vage claim liever om naar de concrete, feitelijke pijlers van die certificering of het initiatief:
      Voorbeeld:
        Origineel: "Door hun duurzaamheid en sociaal maatschappelijke impact is A Beautiful Story een B-corp gecertificeerd bedrijf."
        GOED (Rijk & Feitelijk): original = "Door hun duurzaamheid en sociaal maatschappelijke impact is A Beautiful Story een B-corp gecertificeerd bedrijf."
        replacement = "A Beautiful Story is B Corp-gecertificeerd en voldoet daarmee aan hoge, geverifieerde standaarden voor sociale impact en verantwoorde bedrijfsvoering."
        (Het verboden containerbegrip 'duurzaamheid' is hier vervangen door de feitelijk getoetste B Corp-pijlers, waardoor de inspirerende merkwaarde behouden blijft én de tekst 100% compliant is!)
- "field" is de exacte veldsleutel tussen [vierkante haken] uit de input.
- status: "FAIL" als er minstens één FAIL-issue is, anders "WARNING" als er minstens één WARNING is, anders "PASS".
${guidelineNotes?.trim() ? `\n--- Algemene toelichting & richtlijnen van de webshop ---\n${guidelineNotes.trim()}\n` : ''}
${extraInstructions?.trim() ? `\nAanvullende huisregels van de webshop (verplicht toepassen):\n${extraInstructions.trim()}\n` : ''}
${brandKnowledge?.trim() ? `\n--- Geleerde merkkennis voor dit merk (prioriteit toepassen) ---\n${brandKnowledge.trim()}\n` : ''}
Antwoord UITSLUITEND met één JSON-object (geen uitleg, geen markdown eromheen) in exact dit formaat:
{
  "status": "PASS" | "WARNING" | "FAIL",
  "summary": "<één zin samenvatting in het Nederlands>",
  "issues": [
    {
      "field": "<veldsleutel>",
      "original": "<letterlijk fragment>",
      "rule": "<regelcode>",
      "severity": "FAIL" | "WARNING",
      "explanation": "<korte uitleg waarom dit niet mag>",
      "replacement": "<voorgestelde conforme tekst of leesteken of lege string>"
    }
  ],
  "compliant_claims": ["<toegestane claim 1>"]
}`;
}

export function buildEmpcoUserPrompt(product: any, fields: EmpcoField[]): string {
  const ctx: string[] = [];
  if (product?.brand?.name) ctx.push(`Merk: ${product.brand.name}`);
  if (product?.category?.name) ctx.push(`Categorie: ${product.category.name}`);
  if (product?.subcategory?.name) ctx.push(`Subcategorie: ${product.subcategory.name}`);
  if (product?.material) ctx.push(`Materiaal: ${product.material}`);
  if (product?.mainMaterial) ctx.push(`Hoofdmateriaal: ${product.mainMaterial}`);

  const lines = fields.map(f =>
    f.kind === 'claim'
      ? `[${f.key}] (KENMERK) ${f.label}: Ja`
      : `[${f.key}] (TEKST) ${f.label}:\n${f.value}`
  );

  return `Toets de volgende productteksten aan de EmpCo-richtlijn. Let scherp op zinsopbouw en grammatica bij eventuele voorstellen.

--- Context (alleen ter info, niet toetsen) ---
${ctx.join('\n') || '-'}

--- Te toetsen velden ---
${lines.join('\n\n')}`;
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Inspects parsed EmpCo issues and ensures the proposed replacement doesn't break
 * the Dutch sentence structure. If an issue only removes an adjective and leaves
 * an awkward dangling preposition/article + noun (e.g. ", voor een papierkeuze."),
 * it expands the issue's original fragment to capture the whole phrase cleanly.
 */
export function sanitizeEmpcoIssues(issues: EmpcoIssue[], fields: EmpcoField[]): EmpcoIssue[] {
  const fieldMap = new Map(fields.map(f => [f.key, f.value]));

  return issues.map(issue => {
    if (!issue.original || issue.field.startsWith('crit')) return issue;
    const fullText = fieldMap.get(issue.field) ?? '';
    if (!fullText) return issue;

    const loc = locateFragment(fullText, issue.original);
    if (!loc) return issue;

    const before = fullText.slice(0, loc.idx);
    const after = fullText.slice(loc.idx + loc.len);

    // Check if the deletion or replacement would leave a dangling phrase like ", voor een papierkeuze."
    const danglingPrepositionMatch = before.match(/,\s*(voor|met|als|van|door|in|om)\s+(een|de|het)\s+$/i);
    const trailingNounMatch = after.match(/^\s+([a-zA-Z]+)(\s*[.!?])/);

    if (danglingPrepositionMatch && trailingNounMatch) {
      const remainingNoun = trailingNounMatch[1].toLowerCase();
      // Generic nouns that frequently get left behind awkwardly
      const isAwkwardRemainingNoun = ['papierkeuze', 'keuze', 'optie', 'product', 'geheel', 'toepassing', 'aankoop'].includes(remainingNoun);

      if (!issue.replacement || issue.replacement.trim() === '' || isAwkwardRemainingNoun) {
        // Expand original to include the entire preposition clause: ", voor een <original> <noun>."
        const prepStartIdx = before.lastIndexOf(danglingPrepositionMatch[0]);
        const endPunct = trailingNounMatch[2].trim() || '.';
        const expandedOriginal = fullText.slice(prepStartIdx, loc.idx + loc.len + trailingNounMatch[0].length);

        return {
          ...issue,
          original: expandedOriginal,
          replacement: endPunct,
          explanation: issue.explanation + ' (Zinsnede verbreed voor een grammaticaal vloeiende zin)',
        };
      }
    }

    return issue;
  });
}

export function parseEmpcoResponse(raw: string, fields: EmpcoField[]): EmpcoResult | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) text = fence[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let parsed: any;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { return null; }

  const labelMap = new Map(fields.map(f => [f.key, f.label]));
  const rawIssues: EmpcoIssue[] = Array.isArray(parsed.issues) ? parsed.issues
    .filter((i: any) => i && typeof i === 'object')
    .map((i: any) => ({
      field: String(i.field ?? '').replace(/^\[|\]$/g, ''),
      fieldLabel: labelMap.get(String(i.field ?? '').replace(/^\[|\]$/g, '')) ?? String(i.field ?? ''),
      original: String(i.original ?? ''),
      rule: String(i.rule ?? 'UNSUBSTANTIATED'),
      severity: i.severity === 'FAIL' ? 'FAIL' : 'WARNING',
      explanation: String(i.explanation ?? ''),
      replacement: String(i.replacement ?? ''),
    })) : [];

  const issues = sanitizeEmpcoIssues(rawIssues, fields);

  // Derive status from issues to guarantee consistency
  const status: EmpcoStatus = issues.some(i => i.severity === 'FAIL') ? 'FAIL' : issues.length > 0 ? 'WARNING' : 'PASS';

  return {
    status,
    summary: String(parsed.summary ?? ''),
    issues,
    compliant_claims: Array.isArray(parsed.compliant_claims) ? parsed.compliant_claims.map(String) : [],
  };
}

// ── Applying suggestions / reconciling ──────────────────────────────────────────

/** Can this issue be fixed automatically (text replacement)? Claim toggles (crit*) can't. */
export function isEmpcoIssueFixable(issue: Pick<EmpcoIssue, 'field' | 'original'>): boolean {
  return !!issue.original && !issue.field.startsWith('crit');
}

export function locateFragment(current: string, original: string): { idx: number; len: number } | null {
  if (!original) return null;
  const idx = current.indexOf(original);
  if (idx >= 0) return { idx, len: original.length };
  // Fallback: case-insensitive, whitespace-tolerant match
  const esc = original.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const m = esc ? new RegExp(esc, 'i').exec(current) : null;
  return m ? { idx: m.index, len: m[0].length } : null;
}

/**
 * Cleans up sentence structure artifacts that can occur after deletions,
 * like duplicate punctuation, spaces, or dangling preposition fragments.
 */
export function cleanDutchSentenceStructure(text: string): string {
  if (!text) return '';
  return text
    // Normalize spaces
    .replace(/[ \t]+/g, ' ')
    // Remove space before punctuation: "woord ." -> "woord."
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    // Remove comma directly before period/exclamation/question mark: ",." -> "."
    .replace(/,\s*([.!?])/g, '$1')
    // Remove duplicate periods or commas: ".." -> ".", ",," -> ","
    .replace(/\.{2,}/g, '.')
    .replace(/,{2,}/g, ',')
    // Clean up dangling preposition phrases at the end of a clause or sentence:
    // e.g. ", voor een ." -> "." or ", voor ." -> "."
    .replace(/,?\s*\b(voor|met|op|van|door|in|uit|tot|om|als|zonder)\s+(een|de|het)?\s*([.!?])/gi, '$3')
    // Clean up dangling phrase ", voor een <noun>." if <noun> is a generic leftover like "papierkeuze" without adjective
    .replace(/,\s*(voor|met|als)\s+(een|de|het)\s+(papierkeuze|keuze|optie|product|geheel)\s*([.!?])/gi, '$4')
    .trim();
}

/**
 * Replaces `original` in `current` by `replacement`.
 * Returns null when the fragment can't be found (anymore).
 */
export function replaceEmpcoFragment(current: string, original: string, replacement: string): string | null {
  const loc = locateFragment(current ?? '', original);
  if (!loc) return null;
  let next = current.slice(0, loc.idx) + replacement + current.slice(loc.idx + loc.len);
  return cleanDutchSentenceStructure(next);
}

/** Status derived from a list of issues */
export function empcoStatusFromIssues(issues: Pick<EmpcoIssue, 'severity'>[]): EmpcoStatus {
  return issues.some(i => i.severity === 'FAIL') ? 'FAIL' : issues.length > 0 ? 'WARNING' : 'PASS';
}

/**
 * Moves issues that no longer apply to the current content to `resolved`:
 *  - text issue: the offending fragment is no longer present in the field
 *  - claim issue: the sustainability toggle is no longer "Ja"
 * Status / summary are recalculated. Returns how many issues were resolved.
 */
export function reconcileEmpcoResult(
  result: EmpcoResult,
  fields: EmpcoField[],
  via: (issue: EmpcoIssue) => 'EMPCO' | 'EDIT' = () => 'EDIT',
): { result: EmpcoResult; resolvedCount: number } {
  const byKey = new Map(fields.map(f => [f.key, f]));
  const now = new Date().toISOString();
  const remaining: EmpcoIssue[] = [];
  const newlyResolved: NonNullable<EmpcoResult['resolved']> = [];

  for (const issue of result.issues ?? []) {
    const f = byKey.get(issue.field);
    let stillThere: boolean;
    if (!f) stillThere = false;                                   // field emptied / toggle off
    else if (f.kind === 'claim') stillThere = true;               // toggle still "Ja"
    else stillThere = !issue.original || !!locateFragment(f.value, issue.original);
    if (stillThere) remaining.push(issue);
    else newlyResolved.push({ ...issue, resolvedAt: now, via: via(issue) });
  }

  if (newlyResolved.length === 0) return { result, resolvedCount: 0 };

  const status = empcoStatusFromIssues(remaining);
  const baseSummary = String(result.summary ?? '').replace(/^\d+ bevinding\(en\) open, \d+ verwerkt\.\s*/, '');
  const summary = remaining.length === 0
    ? `Alle ${newlyResolved.length + (result.resolved?.length ?? 0)} EmpCo-bevinding(en) zijn verwerkt.`
    : `${remaining.length} bevinding(en) open, ${newlyResolved.length + (result.resolved?.length ?? 0)} verwerkt. ${baseSummary}`.trim();

  return {
    result: { ...result, status, summary, issues: remaining, resolved: [...(result.resolved ?? []), ...newlyResolved] },
    resolvedCount: newlyResolved.length,
  };
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const EMPCO_STATUS_META: Record<EmpcoStatus | 'STALE' | 'NONE', { icon: string; label: string; color: string; bg: string; border: string }> = {
  PASS:    { icon: '✅', label: 'EmpCo OK',        color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  WARNING: { icon: '⚠️', label: 'Aandachtspunten', color: '#a16207', bg: '#fefce8', border: '#fde047' },
  FAIL:    { icon: '⛔', label: 'Overtreding',     color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  STALE:   { icon: '🕓', label: 'Verouderd',       color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
  NONE:    { icon: '⚖️', label: 'Niet gecheckt',   color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};
