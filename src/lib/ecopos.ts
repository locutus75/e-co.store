/**
 * EcoPos ↔ PCM (e-co.store) Integration Library
 * Defines field groups, sync modes, settings, payload normalization, and diff calculation.
 */

export type EcoPosFieldMode = 'ignore' | 'fill_empty' | 'overwrite';

export type EcoPosCategoryKey = 'status' | 'pricing' | 'basic' | 'dimensions' | 'stock';

export interface EcoPosFieldDef {
  key: string;
  label: string;
  category: EcoPosCategoryKey;
  type: 'boolean' | 'float' | 'number' | 'string' | 'relation' | 'custom_json';
  defaultMode: EcoPosFieldMode;
  description: string;
  /** Target column on Prisma Product, or 'customData.<key>' for POS/stock fields */
  prismaTarget: string;
}

export const ECOPOS_CATEGORIES: Record<
  EcoPosCategoryKey,
  { label: string; icon: string; description: string }
> = {
  status: {
    label: 'Statusvelden',
    icon: '🚦',
    description: 'Actief in systeem, actief op webshop en uitlopend-status vanuit MplusKassa/EcoPos',
  },
  pricing: {
    label: 'Prijs & Identificatie',
    icon: '💶',
    description: 'Verkoopprijs (incl. BTW) en EAN/barcode',
  },
  basic: {
    label: 'Basisgegevens',
    icon: '📦',
    description: 'Omschrijving/titel, merk, leverancier, categorie en subcategorie',
  },
  dimensions: {
    label: 'Afmetingen & Inhoud',
    icon: '📏',
    description: 'Gewicht, lengte, breedte, hoogte en inhoud (ml/gr)',
  },
  stock: {
    label: 'Voorraad & Kassa-data',
    icon: '🏪',
    description: 'Actuele voorraadstand, inkoopprijs, BTW-tarief en extra MplusKassa-velden',
  },
};

export const ECOPOS_FIELDS: EcoPosFieldDef[] = [
  // ── 1. Statusvelden ───────────────────────────────────────────────────────
  {
    key: 'systemActive',
    label: 'Actief in Systeem',
    category: 'status',
    type: 'boolean',
    defaultMode: 'overwrite',
    description: 'Of het product actief is in MplusKassa / EcoPos',
    prismaTarget: 'systemActive',
  },
  {
    key: 'webshopActive',
    label: 'Actief op Webshop',
    category: 'status',
    type: 'boolean',
    defaultMode: 'overwrite',
    description: 'Of het product zichtbaar/actief is voor de webshop',
    prismaTarget: 'webshopActive',
  },
  {
    key: 'uitlopend',
    label: 'Uitlopend (Uitl.)',
    category: 'status',
    type: 'boolean',
    defaultMode: 'overwrite',
    description: 'Of het artikel als uitlopend is gemarkeerd',
    prismaTarget: 'uitlopend',
  },
  {
    key: 'uitlopendReason',
    label: 'Reden / uitlopend',
    category: 'status',
    type: 'string',
    defaultMode: 'overwrite',
    description: 'Reden waarom het artikel uitlopend is in MplusKassa (indien ingevuld)',
    prismaTarget: 'customData.ecoposUitlopendReason',
  },

  // ── 2. Prijs & Identificatie ──────────────────────────────────────────────
  {
    key: 'basePrice',
    label: 'Verkoopprijs (€)',
    category: 'pricing',
    type: 'float',
    defaultMode: 'overwrite',
    description: 'Actuele consumentenprijs uit MplusKassa',
    prismaTarget: 'basePrice',
  },
  {
    key: 'ean',
    label: 'EAN / Barcode',
    category: 'pricing',
    type: 'string',
    defaultMode: 'fill_empty',
    description: 'EAN-code van het product',
    prismaTarget: 'ean',
  },

  // ── 3. Basisgegevens ──────────────────────────────────────────────────────
  {
    key: 'title',
    label: 'Omschrijving / Bontekst (Titel)',
    category: 'basic',
    type: 'string',
    defaultMode: 'fill_empty',
    description: 'Bontekst uit MplusKassa (leidend indien ingevuld), anders de artikelomschrijving',
    prismaTarget: 'title',
  },
  {
    key: 'brand',
    label: 'Merk (Naam)',
    category: 'basic',
    type: 'relation',
    defaultMode: 'fill_empty',
    description: 'Merknaam gekoppeld aan het product',
    prismaTarget: 'brand',
  },
  {
    key: 'supplier',
    label: 'Leverancier (Naam)',
    category: 'basic',
    type: 'relation',
    defaultMode: 'fill_empty',
    description: 'Leveranciersnaam (achtervoegsel zoals " (67)" uit MplusKassa wordt automatisch gestript)',
    prismaTarget: 'supplier',
  },
  {
    key: 'subcategory',
    label: 'Categorie',
    category: 'basic',
    type: 'relation',
    defaultMode: 'overwrite',
    description: 'Productcategorie (subcategorie uit EcoPos/MplusKassa; hoofdcategorie MplusWebshops wordt genegeerd)',
    prismaTarget: 'subcategory',
  },

  // ── 4. Afmetingen & Inhoud ────────────────────────────────────────────────
  {
    key: 'weightGr',
    label: 'Gewicht (gr)',
    category: 'dimensions',
    type: 'number',
    defaultMode: 'fill_empty',
    description: 'Gewicht in grammen',
    prismaTarget: 'weightGr',
  },
  {
    key: 'lengthCm',
    label: 'Lengte (cm)',
    category: 'dimensions',
    type: 'number',
    defaultMode: 'fill_empty',
    description: 'Lengte in centimeters',
    prismaTarget: 'lengthCm',
  },
  {
    key: 'widthCm',
    label: 'Breedte (cm)',
    category: 'dimensions',
    type: 'number',
    defaultMode: 'fill_empty',
    description: 'Breedte in centimeters',
    prismaTarget: 'widthCm',
  },
  {
    key: 'heightCm',
    label: 'Hoogte (cm)',
    category: 'dimensions',
    type: 'number',
    defaultMode: 'fill_empty',
    description: 'Hoogte in centimeters',
    prismaTarget: 'heightCm',
  },
  {
    key: 'volumeMl',
    label: 'Inhoud (ml)',
    category: 'dimensions',
    type: 'number',
    defaultMode: 'fill_empty',
    description: 'Inhoud in milliliters',
    prismaTarget: 'volumeMl',
  },
  {
    key: 'volumeGr',
    label: 'Inhoud (gr)',
    category: 'dimensions',
    type: 'number',
    defaultMode: 'fill_empty',
    description: 'Netto inhoud in grammen',
    prismaTarget: 'volumeGr',
  },

  // ── 5. Voorraad & Kassa-data ──────────────────────────────────────────────
  {
    key: 'stockTotalAvailable',
    label: 'Voorraadstand (Totaal)',
    category: 'stock',
    type: 'number',
    defaultMode: 'overwrite',
    description: 'Actuele beschikbare voorraad in EcoPos/MplusKassa',
    prismaTarget: 'customData.ecoposStock',
  },
  {
    key: 'costPrice',
    label: 'Inkoopprijs (€)',
    category: 'stock',
    type: 'float',
    defaultMode: 'overwrite',
    description: 'Inkoopprijs vanuit MplusKassa',
    prismaTarget: 'customData.ecoposCostPrice',
  },
  {
    key: 'vatRate',
    label: 'BTW-tarief (%)',
    category: 'stock',
    type: 'number',
    defaultMode: 'overwrite',
    description: 'BTW-percentage in MplusKassa als geheel getal (bijv. 21 of 9)',
    prismaTarget: 'customData.ecoposVatRate',
  },
  {
    key: 'customFields',
    label: 'Extra Kassa-velden & Locaties',
    category: 'stock',
    type: 'custom_json',
    defaultMode: 'overwrite',
    description: 'Voorraad per locatie en vrije velden uit EcoPos/MplusKassa',
    prismaTarget: 'customData.ecoposExtra',
  },
];

export const DEFAULT_ECOPOS_FIELD_MODES: Record<string, EcoPosFieldMode> = Object.fromEntries(
  ECOPOS_FIELDS.map((f) => [f.key, f.defaultMode])
);

export type EcoPosWebshopFilterOption = 'JA' | 'NEE' | 'LEEG';
export type EcoPosUitlopendFilterOption = 'ALL' | 'JA' | 'NEE';

export interface EcoPosSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  fieldModes: Record<string, EcoPosFieldMode>;
  createNewProducts: boolean;
  onlyActiveInSystem: boolean;
  webshopFilter: EcoPosWebshopFilterOption[];
  uitlopendFilter: EcoPosUitlopendFilterOption;
  uitlopendReasonsFilter: string[];
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  lastSyncAt?: string | null;
  lastSyncSummary?: string | null;
  lastSyncStatus?: 'success' | 'error' | null;
}

export const DEFAULT_ECOPOS_SETTINGS: EcoPosSettings = {
  enabled: false,
  baseUrl: 'http://localhost:3001',
  apiKey: '',
  fieldModes: { ...DEFAULT_ECOPOS_FIELD_MODES },
  createNewProducts: false,
  onlyActiveInSystem: false,
  webshopFilter: ['JA', 'NEE', 'LEEG'],
  uitlopendFilter: 'ALL',
  uitlopendReasonsFilter: [],
  autoSyncEnabled: false,
  autoSyncIntervalMinutes: 60,
  lastSyncAt: null,
  lastSyncSummary: null,
  lastSyncStatus: null,
};

/**
 * Normalized product structure extracted from an EcoPos API response item.
 * Supports both the nested contract (`status.systemActive`, `pricing.basePrice`, etc.)
 * and flat properties (`systemActive`, `basePrice`, etc.) for resilience.
 */
export interface NormalizedEcoPosProduct {
  internalArticleNumber: string;
  values: Record<string, any>;
  rawStockLocations?: Array<{ name: string; quantity: number }>;
  rawCustomFields?: Record<string, any>;
  sourceUpdatedAt?: string | null;
  rawMeta?: {
    rawSupplier?: string | null;
    bontekst?: string | null;
    omschrijving?: string | null;
    webshopState?: EcoPosWebshopFilterOption;
    uitlopendReason?: string | null;
  };
}

/**
 * Strips trailing MplusKassa supplier number in parentheses, e.g. "Dopper (67)" -> "Dopper".
 */
export function cleanSupplierName(rawSupplier?: string | null): string | undefined {
  if (rawSupplier === undefined || rawSupplier === null) return undefined;
  const cleaned = String(rawSupplier).replace(/\s+\(\d+\)\s*$/, '').trim();
  return cleaned === '' ? undefined : cleaned;
}

/**
 * Resolves the leading product title from an EcoPos payload:
 * If `bontekst` / `receiptText` is present and non-empty, it takes precedence over `omschrijving` / `title`.
 */
export function resolveEcoPosTitle(raw: any): {
  effectiveTitle?: string;
  bontekst?: string;
  omschrijving?: string;
} {
  if (!raw || typeof raw !== 'object') return {};
  const basic = raw.basic && typeof raw.basic === 'object' ? raw.basic : {};
  const customFields = raw.customFields && typeof raw.customFields === 'object' ? raw.customFields : {};

  const bontekst = parseStr(
    basic.bontekst ??
    basic.bonTekst ??
    basic.receiptText ??
    basic.ticketText ??
    raw.bontekst ??
    raw.bonTekst ??
    raw.receiptText ??
    raw.ticketText ??
    customFields.bontekst ??
    customFields.bonTekst ??
    customFields.receiptText ??
    customFields.ticketText
  );

  const omschrijving = parseStr(
    basic.omschrijving ??
    basic.description ??
    basic.title ??
    raw.omschrijving ??
    raw.description ??
    raw.title ??
    raw.name
  );

  return {
    effectiveTitle: bontekst ?? omschrijving,
    bontekst,
    omschrijving,
  };
}

function parseBool(val: any): boolean | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  const s = String(val).trim().toUpperCase();
  if (['JA', 'TRUE', '1', 'Y', 'J', 'ACTIEF', 'UITLOPEND'].includes(s)) return true;
  if (['NEE', 'FALSE', '0', 'N', 'INACTIEF'].includes(s)) return false;
  return undefined;
}

function parseNum(val: any, isFloat: boolean): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return Number.isNaN(val) ? undefined : val;
  const clean = String(val).trim().replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = isFloat ? parseFloat(clean) : parseInt(clean, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseStr(val: any): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  return s === '' ? undefined : s;
}

export function normalizeEcoPosProduct(raw: any): NormalizedEcoPosProduct | null {
  if (!raw || typeof raw !== 'object') return null;

  const articleNumber = parseStr(
    raw.internalArticleNumber ?? raw.articleNumber ?? raw.id ?? raw.code ?? raw.artikelnummer
  );
  if (!articleNumber) return null;

  const status = raw.status && typeof raw.status === 'object' ? raw.status : {};
  const pricing = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : {};
  const basic = raw.basic && typeof raw.basic === 'object' ? raw.basic : {};
  const dimensions = raw.dimensions && typeof raw.dimensions === 'object' ? raw.dimensions : {};
  const stock = raw.stock && typeof raw.stock === 'object' ? raw.stock : {};

  const values: Record<string, any> = {};

  // Status
  const sysActive = parseBool(status.systemActive ?? raw.systemActive ?? raw.active);
  if (sysActive !== undefined) values.systemActive = sysActive;

  const rawWebshopVal =
    status.webshopState ??
    status.webshop ??
    raw.webshopState ??
    raw.webshop ??
    status.webshopActive ??
    raw.webshopActive;

  let webshopState: EcoPosWebshopFilterOption = 'LEEG';
  if (rawWebshopVal === null || rawWebshopVal === undefined || String(rawWebshopVal).trim() === '' || String(rawWebshopVal).trim().toUpperCase() === 'LEEG') {
    webshopState = 'LEEG';
  } else {
    const parsedWeb = parseBool(rawWebshopVal);
    if (parsedWeb === true) {
      webshopState = 'JA';
      values.webshopActive = true;
    } else if (parsedWeb === false) {
      webshopState = 'NEE';
      values.webshopActive = false;
    }
  }

  const uitl = parseBool(status.uitlopend ?? raw.uitlopend ?? raw.discontinued);
  if (uitl !== undefined) values.uitlopend = uitl;

  const customFieldsForStatus = raw.customFields && typeof raw.customFields === 'object' ? raw.customFields : {};
  const rawUitlopendReason = parseStr(
    status.uitlopendReason ??
    status.redenUitlopend ??
    status.discontinuedReason ??
    raw.uitlopendReason ??
    raw.redenUitlopend ??
    customFieldsForStatus.uitlopendReason ??
    customFieldsForStatus.redenUitlopend
  );
  if (rawUitlopendReason !== undefined) {
    values.uitlopendReason = rawUitlopendReason;
  } else if (
    'uitlopendReason' in status ||
    'redenUitlopend' in status ||
    'uitlopendReason' in raw ||
    'redenUitlopend' in raw
  ) {
    values.uitlopendReason = null;
  }

  // Pricing & ID
  const basePrice = parseNum(pricing.basePrice ?? raw.basePrice ?? raw.price ?? raw.verkoopprijs, true);
  if (basePrice !== undefined) values.basePrice = basePrice;

  const ean = parseStr(raw.ean ?? pricing.ean ?? basic.ean ?? raw.barcode);
  if (ean !== undefined) values.ean = ean;

  // Basic: Bontekst is leading when non-empty; otherwise fallback to Omschrijving / Title
  const { effectiveTitle, bontekst, omschrijving } = resolveEcoPosTitle(raw);
  if (effectiveTitle !== undefined) values.title = effectiveTitle;

  const brand = parseStr(
    typeof basic.brand === 'string' ? basic.brand : basic.brand?.name ?? raw.brand?.name ?? raw.brand
  );
  if (brand !== undefined) values.brand = brand;

  const rawSupplier = parseStr(
    typeof basic.supplier === 'string'
      ? basic.supplier
      : basic.supplier?.name ?? raw.supplier?.name ?? raw.supplier
  );
  const supplier = cleanSupplierName(rawSupplier);
  if (supplier !== undefined) values.supplier = supplier;

  const isIgnoredRootCat = (name?: string) => !name || name.trim().toLowerCase() === 'mpluswebshops';

  const rawCategory = parseStr(
    typeof basic.category === 'string'
      ? basic.category
      : basic.category?.name ?? raw.category?.name ?? raw.category
  );
  if (rawCategory && !isIgnoredRootCat(rawCategory)) {
    values.category = rawCategory;
  } else if ('category' in basic || 'category' in raw) {
    values.category = null;
  }

  // Support optional array of groups/subcategories if EcoPos sends multiple groups for a product
  const rawGroupsArray =
    basic.subcategories ?? basic.groups ?? basic.categories ?? raw.subcategories ?? raw.groups ?? raw.categories;

  if (Array.isArray(rawGroupsArray)) {
    const groupNames = Array.from(
      new Set(
        rawGroupsArray
          .map((item: any) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') {
              return String(item.subcategory ?? item.name ?? item.group ?? item.category ?? '').trim();
            }
            return '';
          })
          .filter((n: string) => n && !isIgnoredRootCat(n))
      )
    );
    values.subcategory = groupNames.length > 0 ? groupNames.join(', ') : null;
  } else {
    const rawSubcategory = parseStr(
      typeof basic.subcategory === 'string'
        ? basic.subcategory
        : basic.subcategory?.name ?? raw.subcategory?.name ?? raw.subcategory
    );

    if (rawSubcategory && !isIgnoredRootCat(rawSubcategory)) {
      values.subcategory = rawSubcategory;
    } else if (rawCategory && !isIgnoredRootCat(rawCategory)) {
      values.subcategory = rawCategory;
    } else if (
      'subcategory' in basic ||
      'category' in basic ||
      'subcategory' in raw ||
      'category' in raw
    ) {
      values.subcategory = null;
    }
  }

  // Dimensions
  const weightGr = parseNum(dimensions.weightGr ?? raw.weightGr ?? raw.weight, false);
  if (weightGr !== undefined) values.weightGr = weightGr;

  const lengthCm = parseNum(dimensions.lengthCm ?? raw.lengthCm ?? raw.length, false);
  if (lengthCm !== undefined) values.lengthCm = lengthCm;

  const widthCm = parseNum(dimensions.widthCm ?? raw.widthCm ?? raw.width, false);
  if (widthCm !== undefined) values.widthCm = widthCm;

  const heightCm = parseNum(dimensions.heightCm ?? raw.heightCm ?? raw.height, false);
  if (heightCm !== undefined) values.heightCm = heightCm;

  const volumeMl = parseNum(dimensions.volumeMl ?? raw.volumeMl, false);
  if (volumeMl !== undefined) values.volumeMl = volumeMl;

  const volumeGr = parseNum(dimensions.volumeGr ?? raw.volumeGr, false);
  if (volumeGr !== undefined) values.volumeGr = volumeGr;

  // Stock & POS
  const stockTotal = parseNum(
    stock.totalAvailable ?? stock.quantity ?? raw.stockTotalAvailable ?? raw.stockQuantity ?? (typeof raw.stock === 'number' ? raw.stock : undefined),
    false
  );
  if (stockTotal !== undefined) values.stockTotalAvailable = stockTotal;

  const costPrice = parseNum(pricing.costPrice ?? raw.costPrice ?? raw.inkoopprijs, true);
  if (costPrice !== undefined) values.costPrice = costPrice;

  const rawVat = parseNum(pricing.vatRate ?? raw.vatRate ?? raw.btw, true);
  if (rawVat !== undefined) values.vatRate = Math.round(rawVat);

  const extraObj: Record<string, any> = {};
  if (Array.isArray(stock.locations) && stock.locations.length > 0) {
    extraObj.locations = stock.locations;
  }
  if (typeof stock.inStock === 'boolean') {
    extraObj.inStock = stock.inStock;
  }
  if (raw.customFields && typeof raw.customFields === 'object') {
    Object.assign(extraObj, raw.customFields);
  }
  if (Object.keys(extraObj).length > 0) {
    values.customFields = extraObj;
  }

  return {
    internalArticleNumber: articleNumber,
    values,
    rawStockLocations: Array.isArray(stock.locations) ? stock.locations : undefined,
    rawCustomFields: raw.customFields,
    sourceUpdatedAt: raw.sourceUpdatedAt ?? raw.updatedAt ?? null,
    rawMeta: {
      rawSupplier: rawSupplier ?? null,
      bontekst: bontekst ?? null,
      omschrijving: omschrijving ?? null,
      webshopState,
      uitlopendReason: rawUitlopendReason ?? null,
    },
  };
}

export interface EcoPosProductFilterCriteria {
  onlyActiveInSystem?: boolean;
  webshopFilter?: EcoPosWebshopFilterOption[];
  uitlopendFilter?: EcoPosUitlopendFilterOption;
  uitlopendReasonsFilter?: string[];
}

/**
 * Evaluates whether a normalized EcoPos product matches the configured selection conditions
 * (Actief in systeem, Webshop: Leeg/Nee/Ja, Uitlopend: Alle/Ja/Nee, Reden/uitlopend).
 */
export function matchesEcoPosProductFilters(
  product: NormalizedEcoPosProduct,
  filters: EcoPosProductFilterCriteria
): boolean {
  // 1. Actief in Systeem
  if (filters.onlyActiveInSystem) {
    if (product.values.systemActive === false) return false;
  }

  // 2. Webshop filter (JA / NEE / LEEG)
  if (Array.isArray(filters.webshopFilter) && filters.webshopFilter.length > 0 && filters.webshopFilter.length < 3) {
    const prodWebshopState: EcoPosWebshopFilterOption =
      product.rawMeta?.webshopState ??
      (product.values.webshopActive === true
        ? 'JA'
        : product.values.webshopActive === false
          ? 'NEE'
          : 'LEEG');
    if (!filters.webshopFilter.includes(prodWebshopState)) {
      return false;
    }
  }

  // 3. Uitlopend filter (ALL / JA / NEE)
  if (filters.uitlopendFilter === 'JA') {
    if (product.values.uitlopend !== true) return false;
  } else if (filters.uitlopendFilter === 'NEE') {
    if (product.values.uitlopend === true) return false;
  }

  // 4. Reden / uitlopend filter
  if (Array.isArray(filters.uitlopendReasonsFilter) && filters.uitlopendReasonsFilter.length > 0) {
    const rawReason = (product.values.uitlopendReason ?? product.rawMeta?.uitlopendReason ?? '')
      .toString()
      .trim();
    const hasReason = rawReason.length > 0;

    let matchedReason = false;
    for (const filterVal of filters.uitlopendReasonsFilter) {
      if (filterVal === '__EMPTY__') {
        if (!hasReason) {
          matchedReason = true;
          break;
        }
      } else if (filterVal === '__NON_EMPTY__') {
        if (hasReason) {
          matchedReason = true;
          break;
        }
      } else if (rawReason.toLowerCase() === filterVal.trim().toLowerCase()) {
        matchedReason = true;
        break;
      }
    }
    if (!matchedReason) return false;
  }

  return true;
}

export interface EcoPosFieldChange {
  fieldKey: string;
  fieldLabel: string;
  category: EcoPosCategoryKey;
  oldValue: any;
  newValue: any;
  modeUsed: EcoPosFieldMode;
}

export interface EcoPosProductDiff {
  internalArticleNumber: string;
  title: string;
  isNew: boolean;
  changes: EcoPosFieldChange[];
  allEcoPosValues: Record<string, any>;
}

/**
 * Extracts the current value of an EcoPos-mapped field from a Prisma Product record
 * (with included brand, supplier, category, subcategory relations).
 */
export function getCurrentPcmFieldValue(product: any, fieldKey: string): any {
  if (!product) return null;
  switch (fieldKey) {
    case 'brand':
      return product.brand?.name ?? null;
    case 'supplier':
      return product.supplier?.name ?? null;
    case 'category':
    case 'subcategory': {
      const subName = product.subcategory?.name ?? null;
      if (subName && subName.trim().toLowerCase() !== 'mpluswebshops') return subName;
      const catName = product.category?.name ?? null;
      if (catName && catName.trim().toLowerCase() !== 'mpluswebshops') return catName;
      return null;
    }
    case 'uitlopendReason':
      return product.customData?.ecoposUitlopendReason ?? null;
    case 'stockTotalAvailable':
      return product.customData?.ecoposStock ?? null;
    case 'costPrice':
      return product.customData?.ecoposCostPrice ?? null;
    case 'vatRate': {
      const rawVat = product.customData?.ecoposVatRate;
      return rawVat !== undefined && rawVat !== null && rawVat !== '' ? Math.round(Number(rawVat)) : null;
    }
    case 'customFields':
      return product.customData?.ecoposExtra ?? null;
    default:
      return product[fieldKey] ?? null;
  }
}

export function isValueEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

export function valuesAreEqual(a: any, b: any, type: EcoPosFieldDef['type']): boolean {
  if (isValueEmpty(a) && isValueEmpty(b)) return true;
  if (isValueEmpty(a) || isValueEmpty(b)) return false;
  if (type === 'float') {
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  }
  if (type === 'number') {
    return Number(a) === Number(b);
  }
  if (type === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  if (type === 'custom_json') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a).trim() === String(b).trim();
}

export function computeEcoPosProductDiff(
  ecoProduct: NormalizedEcoPosProduct,
  existingPcmProduct: any | null,
  fieldModes: Record<string, EcoPosFieldMode>
): EcoPosProductDiff {
  const isNew = !existingPcmProduct;
  const changes: EcoPosFieldChange[] = [];

  for (const fieldDef of ECOPOS_FIELDS) {
    const mode = fieldModes[fieldDef.key] ?? 'ignore';
    if (mode === 'ignore') continue;

    const incomingVal = ecoProduct.values[fieldDef.key];
    const allowNullClear =
    (fieldDef.key === 'subcategory' || fieldDef.key === 'uitlopendReason') &&
      incomingVal === null &&
      mode === 'overwrite' &&
      !isNew;
    if (isValueEmpty(incomingVal) && !allowNullClear) continue;

    if (isNew) {
      changes.push({
        fieldKey: fieldDef.key,
        fieldLabel: fieldDef.label,
        category: fieldDef.category,
        oldValue: null,
        newValue: incomingVal,
        modeUsed: mode,
      });
      continue;
    }

    const currentVal = getCurrentPcmFieldValue(existingPcmProduct, fieldDef.key);
    if (mode === 'fill_empty' && !isValueEmpty(currentVal)) {
      continue; // Already has a value in PCM, do not overwrite
    }

    if (!valuesAreEqual(currentVal, incomingVal, fieldDef.type)) {
      changes.push({
        fieldKey: fieldDef.key,
        fieldLabel: fieldDef.label,
        category: fieldDef.category,
        oldValue: currentVal,
        newValue: incomingVal,
        modeUsed: mode,
      });
    }
  }

  return {
    internalArticleNumber: ecoProduct.internalArticleNumber,
    title:
      existingPcmProduct?.title ||
      ecoProduct.values.title ||
      `Artikel #${ecoProduct.internalArticleNumber}`,
    isNew,
    changes,
    allEcoPosValues: ecoProduct.values,
  };
}

export function formatEcoPosValue(val: any, type?: EcoPosFieldDef['type'], fieldKey?: string): string {
  if (isValueEmpty(val)) return '—';
  if (fieldKey === 'vatRate') return `${Math.round(Number(val))}%`;
  if (typeof val === 'boolean' || type === 'boolean') return val ? 'Ja' : 'Nee';
  if (type === 'float' && typeof val === 'number') return `€ ${val.toFixed(2).replace('.', ',')}`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

