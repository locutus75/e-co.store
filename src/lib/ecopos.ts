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
    label: 'Omschrijving (Titel / Naam)',
    category: 'basic',
    type: 'string',
    defaultMode: 'fill_empty',
    description: 'Productnaam uit MplusKassa (advies: alleen invullen indien leeg in PCM)',
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
    description: 'Leverancier van het product',
    prismaTarget: 'supplier',
  },
  {
    key: 'category',
    label: 'Categorie',
    category: 'basic',
    type: 'relation',
    defaultMode: 'fill_empty',
    description: 'Hoofdcategorie uit EcoPos/MplusKassa',
    prismaTarget: 'category',
  },
  {
    key: 'subcategory',
    label: 'Subcategorie',
    category: 'basic',
    type: 'relation',
    defaultMode: 'fill_empty',
    description: 'Subcategorie uit EcoPos/MplusKassa',
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
    type: 'float',
    defaultMode: 'overwrite',
    description: 'BTW-percentage in MplusKassa (bijv. 21 of 9)',
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

export interface EcoPosSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  fieldModes: Record<string, EcoPosFieldMode>;
  createNewProducts: boolean;
  onlyActiveInSystem: boolean;
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

  const webActive = parseBool(status.webshopActive ?? raw.webshopActive ?? raw.webshop);
  if (webActive !== undefined) values.webshopActive = webActive;

  const uitl = parseBool(status.uitlopend ?? raw.uitlopend ?? raw.discontinued);
  if (uitl !== undefined) values.uitlopend = uitl;

  // Pricing & ID
  const basePrice = parseNum(pricing.basePrice ?? raw.basePrice ?? raw.price ?? raw.verkoopprijs, true);
  if (basePrice !== undefined) values.basePrice = basePrice;

  const ean = parseStr(raw.ean ?? pricing.ean ?? basic.ean ?? raw.barcode);
  if (ean !== undefined) values.ean = ean;

  // Basic
  const title = parseStr(basic.title ?? raw.title ?? raw.name ?? raw.description ?? raw.omschrijving);
  if (title !== undefined) values.title = title;

  const brand = parseStr(
    typeof basic.brand === 'string' ? basic.brand : basic.brand?.name ?? raw.brand?.name ?? raw.brand
  );
  if (brand !== undefined) values.brand = brand;

  const supplier = parseStr(
    typeof basic.supplier === 'string'
      ? basic.supplier
      : basic.supplier?.name ?? raw.supplier?.name ?? raw.supplier
  );
  if (supplier !== undefined) values.supplier = supplier;

  const category = parseStr(
    typeof basic.category === 'string'
      ? basic.category
      : basic.category?.name ?? raw.category?.name ?? raw.category
  );
  if (category !== undefined) values.category = category;

  const subcategory = parseStr(
    typeof basic.subcategory === 'string'
      ? basic.subcategory
      : basic.subcategory?.name ?? raw.subcategory?.name ?? raw.subcategory
  );
  if (subcategory !== undefined) values.subcategory = subcategory;

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

  const vatRate = parseNum(pricing.vatRate ?? raw.vatRate ?? raw.btw, true);
  if (vatRate !== undefined) values.vatRate = vatRate;

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
  };
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
      return product.category?.name ?? null;
    case 'subcategory':
      return product.subcategory?.name ?? null;
    case 'stockTotalAvailable':
      return product.customData?.ecoposStock ?? null;
    case 'costPrice':
      return product.customData?.ecoposCostPrice ?? null;
    case 'vatRate':
      return product.customData?.ecoposVatRate ?? null;
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
    if (isValueEmpty(incomingVal)) continue;

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

export function formatEcoPosValue(val: any, type?: EcoPosFieldDef['type']): string {
  if (isValueEmpty(val)) return '—';
  if (typeof val === 'boolean' || type === 'boolean') return val ? 'Ja' : 'Nee';
  if (type === 'float' && typeof val === 'number') return `€ ${val.toFixed(2).replace('.', ',')}`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

