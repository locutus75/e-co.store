'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_ECOPOS_FIELD_MODES,
  DEFAULT_ECOPOS_SETTINGS,
  ECOPOS_FIELDS,
  EcoPosCategoryKey,
  EcoPosFieldMode,
  EcoPosProductDiff,
  EcoPosSettings,
  EcoPosUitlopendFilterOption,
  EcoPosWebshopFilterOption,
  NormalizedEcoPosProduct,
  cleanSupplierName,
  computeEcoPosProductDiff,
  formatEcoPosValue,
  getCurrentPcmFieldValue,
  matchesEcoPosProductFilters,
  normalizeEcoPosProduct,
  valuesAreEqual,
} from '@/lib/ecopos';

const ECOPOS_SETTINGS_KEY = 'ecopos_settings';

function normalizeSettings(raw: any): EcoPosSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ECOPOS_SETTINGS };

  const validWebshopOptions: EcoPosWebshopFilterOption[] = ['JA', 'NEE', 'LEEG'];
  const rawWebshopFilter = Array.isArray(raw.webshopFilter)
    ? raw.webshopFilter.filter((v: any) => validWebshopOptions.includes(v))
    : [];
  const webshopFilter: EcoPosWebshopFilterOption[] =
    rawWebshopFilter.length > 0 ? rawWebshopFilter : [...DEFAULT_ECOPOS_SETTINGS.webshopFilter];

  const validUitlopendOptions: EcoPosUitlopendFilterOption[] = ['ALL', 'JA', 'NEE'];
  const uitlopendFilter: EcoPosUitlopendFilterOption = validUitlopendOptions.includes(raw.uitlopendFilter)
    ? raw.uitlopendFilter
    : DEFAULT_ECOPOS_SETTINGS.uitlopendFilter;

  const uitlopendReasonsFilter: string[] = Array.isArray(raw.uitlopendReasonsFilter)
    ? raw.uitlopendReasonsFilter.map((r: any) => String(r).trim()).filter(Boolean)
    : [];

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_ECOPOS_SETTINGS.enabled,
    baseUrl:
      typeof raw.baseUrl === 'string' && raw.baseUrl.trim()
        ? raw.baseUrl.trim().replace(/\/+$/, '')
        : DEFAULT_ECOPOS_SETTINGS.baseUrl,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    fieldModes: {
      ...DEFAULT_ECOPOS_FIELD_MODES,
      ...(raw.fieldModes && typeof raw.fieldModes === 'object' ? raw.fieldModes : {}),
    },
    createNewProducts:
      typeof raw.createNewProducts === 'boolean'
        ? raw.createNewProducts
        : DEFAULT_ECOPOS_SETTINGS.createNewProducts,
    onlyActiveInSystem:
      typeof raw.onlyActiveInSystem === 'boolean'
        ? raw.onlyActiveInSystem
        : DEFAULT_ECOPOS_SETTINGS.onlyActiveInSystem,
    webshopFilter,
    uitlopendFilter,
    uitlopendReasonsFilter,
    autoSyncEnabled:
      typeof raw.autoSyncEnabled === 'boolean'
        ? raw.autoSyncEnabled
        : DEFAULT_ECOPOS_SETTINGS.autoSyncEnabled,
    autoSyncIntervalMinutes:
      typeof raw.autoSyncIntervalMinutes === 'number' && raw.autoSyncIntervalMinutes >= 5
        ? raw.autoSyncIntervalMinutes
        : DEFAULT_ECOPOS_SETTINGS.autoSyncIntervalMinutes,
    lastSyncAt: raw.lastSyncAt ?? null,
    lastSyncSummary: raw.lastSyncSummary ?? null,
    lastSyncStatus: raw.lastSyncStatus ?? null,
  };
}

export async function getEcoPosSettingsAction(): Promise<EcoPosSettings> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: ECOPOS_SETTINGS_KEY } });
    if (!row?.value) return { ...DEFAULT_ECOPOS_SETTINGS };
    return normalizeSettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_ECOPOS_SETTINGS };
  }
}

export async function saveEcoPosSettingsAction(
  settings: Partial<EcoPosSettings>
): Promise<{ success: boolean; error?: string; settings?: EcoPosSettings }> {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  if (!roles.some((r) => r.toUpperCase() === 'ADMIN')) {
    return { success: false, error: 'Alleen beheerders mogen EcoPos-instellingen wijzigen.' };
  }

  const current = await getEcoPosSettingsAction();
  const merged = normalizeSettings({ ...current, ...settings });

  await prisma.systemSetting.upsert({
    where: { key: ECOPOS_SETTINGS_KEY },
    create: { key: ECOPOS_SETTINGS_KEY, value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });

  return { success: true, settings: merged };
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

export async function testEcoPosConnectionAction(
  overrideBaseUrl?: string,
  overrideApiKey?: string
): Promise<{
  ok: boolean;
  error?: string;
  application?: string;
  lastMplusSyncAt?: string | null;
  totalProducts?: number | null;
  latencyMs?: number;
}> {
  const saved = await getEcoPosSettingsAction();
  const baseUrl = (overrideBaseUrl ?? saved.baseUrl).trim().replace(/\/+$/, '');
  const apiKey = (overrideApiKey ?? saved.apiKey).trim();

  if (!baseUrl) {
    return { ok: false, error: 'Geen EcoPos Base URL opgegeven.' };
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${baseUrl}/api/v1/pcm/health`, {
      method: 'GET',
      headers: buildHeaders(apiKey),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `EcoPos antwoordde met HTTP ${res.status} (${res.statusText})${text ? `: ${text.slice(0, 140)}` : ''}`,
        latencyMs,
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      application: data.application || 'EcoPos',
      lastMplusSyncAt: data.lastMplusSyncAt || data.syncedAt || null,
      totalProducts: typeof data.totalProducts === 'number' ? data.totalProducts : null,
      latencyMs,
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.name === 'AbortError'
          ? `Time-out (8s) bij verbinden met ${baseUrl}/api/v1/pcm/health`
          : `Kan geen verbinding maken met ${baseUrl}: ${err?.message || 'Onbekende netwerkfout'}`,
    };
  }
}

/**
 * Fetches normalized products from EcoPos using `GET /api/v1/pcm/products`.
 * Automatically splits large `articleNumbers` lists into small URL-safe batches
 * (max 50 article numbers per request) so HTTP 431 / 414 never occurs.
 * Also applies product condition filters (Actief in systeem, Webshop: Ja/Nee/Leeg,
 * Uitlopend: Alle/Ja/Nee, Reden/uitlopend) both via query parameters and client-side filtering.
 */
async function fetchProductsFromEcoPos(options: {
  articleNumbers?: string[];
  onlyActiveInSystem?: boolean;
  webshopFilter?: EcoPosWebshopFilterOption[];
  uitlopendFilter?: EcoPosUitlopendFilterOption;
  uitlopendReasonsFilter?: string[];
  updatedSince?: string;
}): Promise < {
  ok: boolean;
  error?: string;
  products: NormalizedEcoPosProduct[];
  rawTotalFetched: number;
  filteredOutCount: number;
} > {
  const settings = await getEcoPosSettingsAction();
  const baseUrl = settings.baseUrl.replace(/\/+$/, '');
  if(!baseUrl) {
    return {
      ok: false,
      error: 'EcoPos URL is nog niet geconfigureerd in Systeeminstellingen.',
      products: [],
      rawTotalFetched: 0,
      filteredOutCount: 0,
    };
  }

  const headers = buildHeaders(settings.apiKey);
  const allNormalizedMap = new Map<string, NormalizedEcoPosProduct>();
  const limit = 500;
  const maxPages = 25; // up to 12,500 products per run

  const fetchBatch = async (batchArticles?: string[]): Promise<{ ok: boolean; status?: number; error?: string }> => {
    let page = 1;
    const batchSet = batchArticles?.length ? new Set(batchArticles) : null;

    while (page <= maxPages) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (batchArticles?.length) {
        params.set('articleNumbers', batchArticles.join(','));
      }
      if (options.onlyActiveInSystem) {
        params.set('onlyActiveInSystem', 'true');
      }
      if (options.webshopFilter && options.webshopFilter.length > 0 && options.webshopFilter.length < 3) {
        params.set('webshop', options.webshopFilter.join(','));
      }
      if (options.uitlopendFilter && options.uitlopendFilter !== 'ALL') {
        params.set('uitlopend', options.uitlopendFilter);
      }
      if (options.uitlopendReasonsFilter && options.uitlopendReasonsFilter.length > 0) {
        params.set('uitlopendReason', options.uitlopendReasonsFilter.join(','));
      }
      if (options.updatedSince) {
        params.set('updatedSince', options.updatedSince);
      }

      const res = await fetch(`${baseUrl}/api/v1/pcm/products?${params.toString()}`, {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        return {
          ok: false,
          status: res.status,
          error: `EcoPos API fout (HTTP ${res.status}): ${errBody.slice(0, 200) || res.statusText}`,
        };
      }

      const payload = await res.json();
      const rawList: any[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.products)
          ? payload.products
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

      for (const item of rawList) {
        const norm = normalizeEcoPosProduct(item);
        if (norm) {
          if (!batchSet || batchSet.has(norm.internalArticleNumber)) {
            allNormalizedMap.set(norm.internalArticleNumber, norm);
          }
        }
      }

      const totalPages = payload?.meta?.totalPages ?? 1;
      if (page >= totalPages || rawList.length < limit) {
        break;
      }
      page++;
    }

    return { ok: true };
  };

  try {
    const requestedArticles = options.articleNumbers?.length
      ? Array.from(new Set(options.articleNumbers.map((a) => String(a).trim()).filter(Boolean)))
      : [];

    if(requestedArticles.length === 0) {
  const res = await fetchBatch(undefined);
  if (!res.ok) {
    return { ok: false, error: res.error, products: [], rawTotalFetched: 0, filteredOutCount: 0 };
  }
} else {
  // Split into small URL-safe chunks (max 50 article numbers ≈ 300 chars in query string)
  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < requestedArticles.length; i += CHUNK_SIZE) {
    chunks.push(requestedArticles.slice(i, i + CHUNK_SIZE));
  }

  const CONCURRENCY = 4;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const wave = chunks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(wave.map((chunk) => fetchBatch(chunk)));

    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      if (!r.ok) {
        // Fallback: if a chunk still hit 431/414, fetch per individual product
        if ((r.status === 431 || r.status === 414) && wave[idx].length > 1) {
          for (const singleArt of wave[idx]) {
            const singleRes = await fetchBatch([singleArt]);
            if (!singleRes.ok) {
              return { ok: false, error: singleRes.error, products: [], rawTotalFetched: 0, filteredOutCount: 0 };
            }
          }
        } else {
          return { ok: false, error: r.error, products: [], rawTotalFetched: 0, filteredOutCount: 0 };
        }
      }
    }
  }
}

const allFetched = Array.from(allNormalizedMap.values());
const filteredProducts = allFetched.filter((p) =>
  matchesEcoPosProductFilters(p, {
    onlyActiveInSystem: options.onlyActiveInSystem,
    webshopFilter: options.webshopFilter,
    uitlopendFilter: options.uitlopendFilter,
    uitlopendReasonsFilter: options.uitlopendReasonsFilter,
  })
);

return {
  ok: true,
  products: filteredProducts,
  rawTotalFetched: allFetched.length,
  filteredOutCount: allFetched.length - filteredProducts.length,
};
  } catch (err: any) {
  return {
    ok: false,
    error:
      err?.name === 'AbortError'
        ? 'Time-out bij ophalen van producten uit EcoPos.'
        : `Verbindingsfout met EcoPos (${baseUrl}): ${err?.message || 'Onbekende fout'}`,
    products: [],
    rawTotalFetched: 0,
    filteredOutCount: 0,
  };
}
}

export interface EcoPosPreviewResult {
  ok: boolean;
  error?: string;
  totalFetched: number;
  rawTotalFetched?: number;
  filteredOutCount?: number;
  changedProducts: EcoPosProductDiff[];
  newProducts: EcoPosProductDiff[];
  unchangedCount: number;
  skippedNewCount: number;
  fieldChangeSummary: Record<string, number>;
}

export async function previewEcoPosSyncAction(options: {
  articleNumbers?: string[];
  fieldModes?: Record<string, EcoPosFieldMode>;
  createNewProducts?: boolean;
  onlyActiveInSystem?: boolean;
  webshopFilter?: EcoPosWebshopFilterOption[];
  uitlopendFilter?: EcoPosUitlopendFilterOption;
  uitlopendReasonsFilter?: string[];
}): Promise<EcoPosPreviewResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      ok: false,
      error: 'Niet ingelogd.',
      totalFetched: 0,
      changedProducts: [],
      newProducts: [],
      unchangedCount: 0,
      skippedNewCount: 0,
      fieldChangeSummary: {},
    };
  }

  const savedSettings = await getEcoPosSettingsAction();
  const fieldModes = options.fieldModes ?? savedSettings.fieldModes;
  const createNewProducts = options.createNewProducts ?? savedSettings.createNewProducts;

  const fetched = await fetchProductsFromEcoPos({
    articleNumbers: options.articleNumbers,
    onlyActiveInSystem: options.onlyActiveInSystem ?? savedSettings.onlyActiveInSystem,
    webshopFilter: options.webshopFilter ?? savedSettings.webshopFilter,
    uitlopendFilter: options.uitlopendFilter ?? savedSettings.uitlopendFilter,
    uitlopendReasonsFilter: options.uitlopendReasonsFilter ?? savedSettings.uitlopendReasonsFilter,
  });

  if (!fetched.ok) {
    return {
      ok: false,
      error: fetched.error,
      totalFetched: 0,
      changedProducts: [],
      newProducts: [],
      unchangedCount: 0,
      skippedNewCount: 0,
      fieldChangeSummary: {},
    };
  }

  const articleIds = fetched.products.map((p) => p.internalArticleNumber);
  const existingRows =
    articleIds.length > 0
      ? await prisma.product.findMany({
        where: { internalArticleNumber: { in: articleIds } },
        include: {
          brand: true,
          supplier: true,
          category: true,
          subcategory: true,
        },
      })
      : [];

  const existingMap = new Map(existingRows.map((r) => [r.internalArticleNumber, r]));

  const changedProducts: EcoPosProductDiff[] = [];
  const newProducts: EcoPosProductDiff[] = [];
  let unchangedCount = 0;
  let skippedNewCount = 0;
  const fieldChangeSummary: Record<string, number> = {};

  for (const ecoProd of fetched.products) {
    const existing = existingMap.get(ecoProd.internalArticleNumber) ?? null;
    if (!existing && !createNewProducts) {
      skippedNewCount++;
      continue;
    }

    const diff = computeEcoPosProductDiff(ecoProd, existing, fieldModes);
    if (diff.isNew) {
      newProducts.push(diff);
      for (const ch of diff.changes) {
        fieldChangeSummary[ch.fieldKey] = (fieldChangeSummary[ch.fieldKey] ?? 0) + 1;
      }
    } else if (diff.changes.length > 0) {
      changedProducts.push(diff);
      for (const ch of diff.changes) {
        fieldChangeSummary[ch.fieldKey] = (fieldChangeSummary[ch.fieldKey] ?? 0) + 1;
      }
    } else {
      unchangedCount++;
    }
  }

  return {
    ok: true,
    totalFetched: fetched.products.length,
    rawTotalFetched: fetched.rawTotalFetched,
    filteredOutCount: fetched.filteredOutCount,
    changedProducts,
    newProducts,
    unchangedCount,
    skippedNewCount,
    fieldChangeSummary,
  };
}

export interface EcoPosExecuteResult {
  ok: boolean;
  error?: string;
  updatedCount: number;
  createdCount: number;
  unchangedCount: number;
  skippedNewCount: number;
  totalFieldsChanged: number;
  syncedAt: string;
  updatedProducts?: any[];
}

export async function executeEcoPosSyncAction(options: {
  articleNumbers?: string[];
  fieldModes?: Record<string, EcoPosFieldMode>;
  createNewProducts?: boolean;
  onlyActiveInSystem?: boolean;
  webshopFilter?: EcoPosWebshopFilterOption[];
  uitlopendFilter?: EcoPosUitlopendFilterOption;
  uitlopendReasonsFilter?: string[];
  /** Optional whitelist of article numbers from the preview to apply */
  selectedArticlesToApply?: string[];
  /** Optional per-field whitelist for single-product drawer sync */
  allowedFieldKeys?: string[];
  isAutoSync?: boolean;
}): Promise<EcoPosExecuteResult> {
  const session = await getServerSession(authOptions);
  if (!options.isAutoSync && !session?.user) {
    return {
      ok: false,
      error: 'Niet geautoriseerd.',
      updatedCount: 0,
      createdCount: 0,
      unchangedCount: 0,
      skippedNewCount: 0,
      totalFieldsChanged: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  const userId = (session?.user as any)?.id ?? null;
  const userEmail = session?.user?.email ?? (options.isAutoSync ? 'EcoPos Auto-Sync' : 'EcoPos Sync');
  const verifiedUser = userId
    ? await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true } }).catch(() => null)
    : null;
  const verifiedUserId = verifiedUser?.id ?? null;

  const savedSettings = await getEcoPosSettingsAction();
  const baseModes = options.fieldModes ?? savedSettings.fieldModes;

  // If allowedFieldKeys is specified (e.g. from single-product drawer picker), only enable those fields
  const effectiveFieldModes: Record<string, EcoPosFieldMode> = { ...baseModes };
  if (options.allowedFieldKeys) {
    const allowedSet = new Set(options.allowedFieldKeys);
    for (const f of ECOPOS_FIELDS) {
      effectiveFieldModes[f.key] = allowedSet.has(f.key) ? 'overwrite' : 'ignore';
    }
  }

  const createNewProducts = options.createNewProducts ?? savedSettings.createNewProducts;

  const effectiveArticlesToFetch =
    options.selectedArticlesToApply && options.selectedArticlesToApply.length > 0
      ? options.selectedArticlesToApply
      : options.articleNumbers;

  const fetched = await fetchProductsFromEcoPos({
    articleNumbers: effectiveArticlesToFetch,
    onlyActiveInSystem: options.onlyActiveInSystem ?? savedSettings.onlyActiveInSystem,
    webshopFilter: options.webshopFilter ?? savedSettings.webshopFilter,
    uitlopendFilter: options.uitlopendFilter ?? savedSettings.uitlopendFilter,
    uitlopendReasonsFilter: options.uitlopendReasonsFilter ?? savedSettings.uitlopendReasonsFilter,
  });

  if (!fetched.ok) {
    if (options.isAutoSync) {
      await prisma.systemSetting.upsert({
        where: { key: ECOPOS_SETTINGS_KEY },
        create: {
          key: ECOPOS_SETTINGS_KEY,
          value: JSON.stringify({
            ...savedSettings,
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'error',
            lastSyncSummary: `Fout: ${fetched.error}`,
          }),
        },
        update: {
          value: JSON.stringify({
            ...savedSettings,
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'error',
            lastSyncSummary: `Fout: ${fetched.error}`,
          }),
        },
      });
    }
    return {
      ok: false,
      error: fetched.error,
      updatedCount: 0,
      createdCount: 0,
      unchangedCount: 0,
      skippedNewCount: 0,
      totalFieldsChanged: 0,
      syncedAt: new Date().toISOString(),
    };
  }

  const selectedSet = options.selectedArticlesToApply
    ? new Set(options.selectedArticlesToApply)
    : null;

  const articleIds = fetched.products.map((p) => p.internalArticleNumber);
  const existingRows =
    articleIds.length > 0
      ? await prisma.product.findMany({
        where: { internalArticleNumber: { in: articleIds } },
        include: {
          brand: true,
          supplier: true,
          category: true,
          subcategory: true,
        },
      })
      : [];
  const existingMap = new Map(existingRows.map((r) => [r.internalArticleNumber, r]));

  let updatedCount = 0;
  let createdCount = 0;
  let unchangedCount = 0;
  let skippedNewCount = 0;
  let totalFieldsChanged = 0;
  const nowIso = new Date().toISOString();

  // Helper to resolve or create Category by name
  const resolveCategoryId = async (name: string, parentId?: string | null): Promise<string> => {
    const existingCat = await prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (existingCat) {
      if (parentId && existingCat.parentId !== parentId && existingCat.id !== parentId) {
        await prisma.category.update({
          where: { id: existingCat.id },
          data: { parentId },
        });
      }
      return existingCat.id;
    }
    const createdCat = await prisma.category.create({
      data: { name, parentId: parentId ?? null },
    });
    return createdCat.id;
  };

  for (const ecoProd of fetched.products) {
    if (selectedSet && !selectedSet.has(ecoProd.internalArticleNumber)) {
      continue;
    }

    const existing = existingMap.get(ecoProd.internalArticleNumber) ?? null;
    if (!existing && !createNewProducts) {
      skippedNewCount++;
      continue;
    }

    const diff = computeEcoPosProductDiff(ecoProd, existing, effectiveFieldModes);
    if (!diff.isNew && diff.changes.length === 0) {
      unchangedCount++;
      continue;
    }

    // Build Prisma update / create data
    const dataPayload: Record<string, any> = {};
    const existingCustomData: Record<string, any> =
      existing?.customData && typeof existing.customData === 'object'
        ? { ...(existing.customData as Record<string, any>) }
        : {};
    let customDataModified = false;

    let resolvedCategoryId: string | undefined = existing?.categoryId ?? undefined;

    for (const ch of diff.changes) {
      const fieldDef = ECOPOS_FIELDS.find((f) => f.key === ch.fieldKey);
      if (!fieldDef) continue;

      if (ch.fieldKey === 'brand') {
        const trimmedBrand = String(ch.newValue).trim();
        const existingBrand = await prisma.brand.findFirst({
          where: { name: { equals: trimmedBrand, mode: 'insensitive' } },
        });
        if (existingBrand) {
          dataPayload.brand = { connect: { id: existingBrand.id } };
        } else {
          dataPayload.brand = {
            connectOrCreate: {
              where: { name: trimmedBrand },
              create: { name: trimmedBrand },
            },
          };
        }
      } else if (ch.fieldKey === 'supplier') {
        const cleanedSupp = cleanSupplierName(String(ch.newValue)) || String(ch.newValue).trim();
        const existingSupp = await prisma.supplier.findFirst({
          where: { name: { equals: cleanedSupp, mode: 'insensitive' } },
        });
        if (existingSupp) {
          dataPayload.supplier = { connect: { id: existingSupp.id } };
        } else {
          dataPayload.supplier = {
            connectOrCreate: {
              where: { name: cleanedSupp },
              create: { name: cleanedSupp },
            },
          };
        }
      } else if (ch.fieldKey === 'category' || ch.fieldKey === 'subcategory') {
        const trimmedSub = ch.newValue !== null && ch.newValue !== undefined ? String(ch.newValue).trim() : '';
        const parentCatName =
          typeof ecoProd.values.category === 'string' && ecoProd.values.category.trim()
            ? ecoProd.values.category.trim()
            : null;
        if (!trimmedSub) {
          dataPayload.subcategory = { disconnect: true };
          dataPayload.category = { disconnect: true };
        } else {
          let parentCatId: string | null = null;
          if (parentCatName && parentCatName.toLowerCase() !== trimmedSub.toLowerCase()) {
            parentCatId = await resolveCategoryId(parentCatName, null);
          }
          const subCatId = await resolveCategoryId(trimmedSub, parentCatId ?? undefined);
          dataPayload.subcategory = { connect: { id: subCatId } };
          dataPayload.category = { connect: { id: parentCatId ?? subCatId } };
        }
      } else if (ch.fieldKey === 'uitlopendReason') {
        existingCustomData.ecoposUitlopendReason = ch.newValue;
        customDataModified = true;
      } else if (ch.fieldKey === 'stockTotalAvailable') {
        existingCustomData.ecoposStock = ch.newValue;
        customDataModified = true;
      } else if (ch.fieldKey === 'costPrice') {
        existingCustomData.ecoposCostPrice = ch.newValue;
        customDataModified = true;
      } else if (ch.fieldKey === 'vatRate') {
        existingCustomData.ecoposVatRate = Math.round(Number(ch.newValue));
        customDataModified = true;
      } else if (ch.fieldKey === 'customFields') {
        existingCustomData.ecoposExtra = ch.newValue;
        customDataModified = true;
      } else {
        dataPayload[ch.fieldKey] = ch.newValue;
      }
    }

    // Always stamp last EcoPos sync timestamp in customData when a product is touched
    existingCustomData.ecoposLastSyncedAt = nowIso;
    dataPayload.customData = existingCustomData;
    if (verifiedUserId) {
      dataPayload.lastEditedByUser = { connect: { id: verifiedUserId } };
    }

    try {
      if (diff.isNew) {
        await prisma.product.create({
          data: {
            internalArticleNumber: ecoProd.internalArticleNumber,
            title: dataPayload.title || ecoProd.values.title || `Artikel ${ecoProd.internalArticleNumber}`,
            status: 'new',
            ...dataPayload,
          },
        });
        createdCount++;
        totalFieldsChanged += diff.changes.length;
      } else {
        await prisma.product.update({
          where: { internalArticleNumber: ecoProd.internalArticleNumber },
          data: dataPayload,
        });
        updatedCount++;
        totalFieldsChanged += diff.changes.length;

        // Record field history entries for auditability
        if (diff.changes.length > 0) {
          await prisma.productFieldHistory.createMany({
            data: diff.changes.map((ch) => {
              const def = ECOPOS_FIELDS.find((f) => f.key === ch.fieldKey);
              return {
                articleNumber: ecoProd.internalArticleNumber,
                fieldKey: ch.fieldKey,
                fieldLabel: ch.fieldLabel,
                oldValue: formatEcoPosValue(ch.oldValue, def?.type, ch.fieldKey),
                newValue: formatEcoPosValue(ch.newValue, def?.type, ch.fieldKey),
                source: 'ECOPOS',
                userId: verifiedUserId,
                userEmail,
              };
            }),
          });
        }
      }
    } catch (prodErr: any) {
      console.error(`Fout bij synchroniseren van artikel #${ecoProd.internalArticleNumber}:`, prodErr);
      if (fetched.products.length === 1) {
        return {
          ok: false,
          error: `Fout bij opslaan van artikel #${ecoProd.internalArticleNumber}: ${prodErr?.message || 'Database fout'}`,
          updatedCount,
          createdCount,
          unchangedCount,
          skippedNewCount,
          totalFieldsChanged,
          syncedAt: nowIso,
        };
      }
    }
  }

  const summaryText = `${updatedCount} bijgewerkt, ${createdCount} nieuw aangemaakt (${totalFieldsChanged} veld${totalFieldsChanged === 1 ? '' : 'en'} gewijzigd)`;
  const updatedSettings: EcoPosSettings = {
    ...savedSettings,
    lastSyncAt: nowIso,
    lastSyncStatus: 'success',
    lastSyncSummary: summaryText,
  };

  await prisma.systemSetting.upsert({
    where: { key: ECOPOS_SETTINGS_KEY },
    create: { key: ECOPOS_SETTINGS_KEY, value: JSON.stringify(updatedSettings) },
    update: { value: JSON.stringify(updatedSettings) },
  });

  revalidatePath('/products');

  let updatedProducts: any[] | undefined;
  if (options.articleNumbers && options.articleNumbers.length > 0 && options.articleNumbers.length <= 10) {
    updatedProducts = await prisma.product.findMany({
      where: { internalArticleNumber: { in: options.articleNumbers } },
      include: {
        brand: true,
        supplier: true,
        category: true,
        subcategory: true,
        assignedUser: true,
        lastEditedByUser: true,
      },
    });
  }

  return {
    ok: true,
    updatedCount,
    createdCount,
    unchangedCount,
    skippedNewCount,
    totalFieldsChanged,
    syncedAt: nowIso,
    updatedProducts,
  };
}

/**
 * Checks if periodic background sync is enabled and due; if so, runs it automatically.
 */
export async function triggerAutoEcoPosSyncIfDueAction(): Promise<{
  triggered: boolean;
  result?: EcoPosExecuteResult;
}> {
  try {
    const settings = await getEcoPosSettingsAction();
    if (!settings.enabled || !settings.autoSyncEnabled || !settings.baseUrl) {
      return { triggered: false };
    }

    const intervalMs = Math.max(5, settings.autoSyncIntervalMinutes) * 60 * 1000;
    const lastSyncMs = settings.lastSyncAt ? new Date(settings.lastSyncAt).getTime() : 0;

    if (Date.now() - lastSyncMs < intervalMs) {
      return { triggered: false };
    }

    const result = await executeEcoPosSyncAction({
      fieldModes: settings.fieldModes,
      createNewProducts: settings.createNewProducts,
      onlyActiveInSystem: settings.onlyActiveInSystem,
      webshopFilter: settings.webshopFilter,
      uitlopendFilter: settings.uitlopendFilter,
      uitlopendReasonsFilter: settings.uitlopendReasonsFilter,
      isAutoSync: true,
    });

    return { triggered: true, result };
  } catch {
    return { triggered: false };
  }
}

/**
 * Returns distinct known `Reden / uitlopend` values from products in PCM
 * so the filter selector can offer them directly.
 */
export async function getAvailableUitlopendReasonsAction(): Promise<string[]> {
  try {
    const rows = await prisma.product.findMany({
      select: { customData: true },
    });
    const reasonsSet = new Set<string>();
    for (const r of rows) {
      const cd = r.customData as Record<string, any> | null;
      if (!cd || typeof cd !== 'object') continue;
      const val =
        cd.ecoposUitlopendReason ??
        cd.uitlopendReason ??
        cd.redenUitlopend ??
        cd['Reden/uitlopend'] ??
        null;
      if (typeof val === 'string' && val.trim()) {
        reasonsSet.add(val.trim());
      }
    }
    return Array.from(reasonsSet).sort((a, b) => a.localeCompare(b, 'nl'));
  } catch {
    return [];
  }
}

export interface EcoPosArticleInspectionRow {
  fieldKey: string;
  fieldLabel: string;
  category: EcoPosCategoryKey;
  rawDetail?: string | null;
  ecoPosFormatted: string;
  pcmFormatted: string;
  isDifferent: boolean;
  configuredMode: EcoPosFieldMode;
  wouldApply: boolean;
}

export interface EcoPosArticleInspectionResult {
  ok: boolean;
  error?: string;
  articleNumber: string;
  existsInPcm: boolean;
  pcmTitle?: string | null;
  rawSupplier?: string | null;
  cleanedSupplier?: string | null;
  rawBontekst?: string | null;
  rawOmschrijving?: string | null;
  effectiveTitle?: string | null;
  rawCategory?: string | null;
  rawSubcategory?: string | null;
  rawWebshopState?: EcoPosWebshopFilterOption;
  rawUitlopendReason?: string | null;
  rows: EcoPosArticleInspectionRow[];
  rawJson?: any;
}

/**
 * Fetches a single article from EcoPos by articleNumber and returns a detailed
 * field-by-field preview (including raw MplusKassa supplier/bontekst/omschrijving values,
 * normalized PCM values, and comparison with the current PCM database record).
 */
export async function inspectEcoPosArticleAction(
  articleNumberInput: string,
  overrideFieldModes?: Record<string, EcoPosFieldMode>
): Promise<EcoPosArticleInspectionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      ok: false,
      error: 'Niet ingelogd.',
      articleNumber: articleNumberInput,
      existsInPcm: false,
      rows: [],
    };
  }

  const artNum = String(articleNumberInput || '').trim();
  if (!artNum) {
    return {
      ok: false,
      error: 'Geef een geldig artikelnummer op.',
      articleNumber: '',
      existsInPcm: false,
      rows: [],
    };
  }

  const settings = await getEcoPosSettingsAction();
  const baseUrl = settings.baseUrl.replace(/\/+$/, '');
  if (!baseUrl) {
    return {
      ok: false,
      error: 'EcoPos Base URL is nog niet ingesteld.',
      articleNumber: artNum,
      existsInPcm: false,
      rows: [],
    };
  }

  const fieldModes = overrideFieldModes ?? settings.fieldModes;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const params = new URLSearchParams({
      page: '1',
      limit: '50',
      articleNumbers: artNum,
    });

    const res = await fetch(`${baseUrl}/api/v1/pcm/products?${params.toString()}`, {
      method: 'GET',
      headers: buildHeaders(settings.apiKey),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        error: `EcoPos API fout (HTTP ${res.status}): ${errBody.slice(0, 200) || res.statusText}`,
        articleNumber: artNum,
        existsInPcm: false,
        rows: [],
      };
    }

    const payload = await res.json();
    const rawList: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.products)
        ? payload.products
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

    // Find matching item by articleNumber
    let matchedRaw: any = null;
    let matchedNorm: NormalizedEcoPosProduct | null = null;
    for (const item of rawList) {
      const n = normalizeEcoPosProduct(item);
      if (n && n.internalArticleNumber === artNum) {
        matchedRaw = item;
        matchedNorm = n;
        break;
      }
    }
    if (!matchedNorm && rawList.length === 1) {
      const n = normalizeEcoPosProduct(rawList[0]);
      if (n) {
        matchedRaw = rawList[0];
        matchedNorm = n;
      }
    }

    if (!matchedNorm) {
      return {
        ok: false,
        error: `Artikel #${artNum} niet gevonden in EcoPos.`,
        articleNumber: artNum,
        existsInPcm: false,
        rows: [],
      };
    }

    const pcmProduct = await prisma.product.findUnique({
      where: { internalArticleNumber: matchedNorm.internalArticleNumber },
      include: {
        brand: true,
        supplier: true,
        category: true,
        subcategory: true,
      },
    });

    const diff = computeEcoPosProductDiff(matchedNorm, pcmProduct, fieldModes);
    const applyFieldKeys = new Set(diff.changes.map((c) => c.fieldKey));

    const rows: EcoPosArticleInspectionRow[] = ECOPOS_FIELDS.map((fieldDef) => {
      const ecoVal = matchedNorm!.values[fieldDef.key];
      const pcmVal = pcmProduct ? getCurrentPcmFieldValue(pcmProduct, fieldDef.key) : null;
      const isDifferent = !valuesAreEqual(pcmVal, ecoVal, fieldDef.type);
      const mode = fieldModes[fieldDef.key] ?? fieldDef.defaultMode;

      let rawDetail: string | null = null;
        if (fieldDef.key === 'webshopActive') {
          const wsState = matchedNorm!.rawMeta?.webshopState;
          if (wsState === 'LEEG') {
            rawDetail = `In MplusKassa: Leeg (niet ingevuld) → in PCM behandeld als Nee`;
          } else if (wsState) {
            rawDetail = `In MplusKassa: ${wsState === 'JA' ? 'Ja' : 'Nee'}`;
          }
        } else if (fieldDef.key === 'supplier') {
          const rawSupp = matchedNorm!.rawMeta?.rawSupplier;
          if (rawSupp && rawSupp !== ecoVal) {
            rawDetail = `Ruw uit MplusKassa: "${rawSupp}" → gestript naar "${ecoVal}"`;
          }
        } else if (fieldDef.key === 'title') {
          const bon = matchedNorm!.rawMeta?.bontekst;
          const oms = matchedNorm!.rawMeta?.omschrijving;
          if (bon && oms && bon !== oms) {
            rawDetail = `Bontekst gebruikt ("${bon}") i.p.v. Omschrijving ("${oms}")`;
          } else if (bon) {
            rawDetail = `Uit Bontekst`;
          } else if (oms) {
            rawDetail = `Uit Omschrijving (geen aparte bontekst in EcoPos response)`;
          }
        } else if (fieldDef.key === 'subcategory') {
          const parentCat = matchedNorm!.values.category;
          if (parentCat) {
            rawDetail = `Hoofdcategorie: ${parentCat}`;
          }
        }

        return {
          fieldKey: fieldDef.key,
          fieldLabel: fieldDef.label,
          category: fieldDef.category,
          rawDetail,
          ecoPosFormatted: formatEcoPosValue(ecoVal, fieldDef.type, fieldDef.key),
          pcmFormatted: pcmProduct ? formatEcoPosValue(pcmVal, fieldDef.type, fieldDef.key) : '— (Nieuw in PCM)',
          isDifferent,
          configuredMode: mode,
          wouldApply: applyFieldKeys.has(fieldDef.key),
        };
      });

    return {
      ok: true,
      articleNumber: matchedNorm.internalArticleNumber,
      existsInPcm: Boolean(pcmProduct),
      pcmTitle: pcmProduct?.title ?? null,
      rawSupplier: matchedNorm.rawMeta?.rawSupplier ?? null,
      cleanedSupplier: matchedNorm.values.supplier ?? null,
      rawBontekst: matchedNorm.rawMeta?.bontekst ?? null,
      rawOmschrijving: matchedNorm.rawMeta?.omschrijving ?? null,
      effectiveTitle: matchedNorm.values.title ?? null,
      rawCategory: matchedNorm.values.category ?? null,
      rawSubcategory: matchedNorm.values.subcategory ?? null,
      rawWebshopState: matchedNorm.rawMeta?.webshopState,
      rawUitlopendReason: matchedNorm.rawMeta?.uitlopendReason ?? null,
      rows,
      rawJson: matchedRaw,
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.name === 'AbortError'
          ? `Time-out bij ophalen van artikel #${artNum} uit EcoPos.`
          : `Fout bij ophalen van artikel #${artNum}: ${err?.message || 'Onbekende fout'}`,
      articleNumber: artNum,
      existsInPcm: false,
      rows: [],
    };
  }
}
