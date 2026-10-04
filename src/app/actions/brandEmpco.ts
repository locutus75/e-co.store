'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { findMatchesInProduct, BrandProductMatch } from '@/lib/brandEmpco';
import { replaceEmpcoFragment } from '@/lib/empco';

const LOCKED_READY = new Set(['JA', 'REVIEW', 'R', 'Y']);

async function getSessionInfo() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const roles: string[] = user?.roles ?? [];
  return {
    session,
    userId: user?.id as string | undefined,
    email: user?.email as string | undefined,
    isAdmin: roles.some(r => r.toUpperCase() === 'ADMIN'),
  };
}

/** Haalt alle geleerde EmpCo regels op voor een merk. */
export async function getBrandRulesAction(brandId: string) {
  if (!brandId) return [];
  return prisma.brandEmpcoRule.findMany({
    where: { brandId },
    orderBy: [{ appliedCount: 'desc' }, { updatedAt: 'desc' }],
  });
}

/** Slaat een geleerde merkregel op of werkt een bestaande regel bij. */
export async function saveBrandRuleAction(data: {
  brandId: string;
  original: string;
  replacement?: string;
  rule?: string;
  severity?: string;
  fieldKey?: string;
  ruleType?: 'REPLACEMENT' | 'COMPLIANT';
  explanation?: string;
  sourceArticle?: string;
}) {
  const { userId } = await getSessionInfo();
  if (!userId) throw new Error('Niet ingelogd');
  if (!data.brandId || !data.original?.trim()) throw new Error('Merk en tekstfragment zijn verplicht');

  const original = data.original.trim();
  const fieldKey = data.fieldKey || '*';
  const ruleType = data.ruleType || 'REPLACEMENT';

  return prisma.brandEmpcoRule.upsert({
    where: {
      brandId_original_fieldKey: {
        brandId: data.brandId,
        original,
        fieldKey,
      },
    },
    update: {
      replacement: data.replacement !== undefined ? data.replacement : undefined,
      rule: data.rule || undefined,
      severity: data.severity || 'FAIL',
      explanation: data.explanation || undefined,
      ruleType,
      appliedCount: { increment: 1 },
      updatedAt: new Date(),
    },
    create: {
      brandId: data.brandId,
      original,
      fieldKey,
      replacement: data.replacement ?? '',
      rule: data.rule || 'GENERIC_CLAIM',
      severity: data.severity || 'FAIL',
      explanation: data.explanation || '',
      sourceArticle: data.sourceArticle || null,
      ruleType,
      appliedCount: 1,
    },
  });
}

/**
 * Zoekt andere producten van ditzelfde merk die het gewraakte fragment bevatten.
 * Sluit optioneel het huidige artikelnummer uit (waar de fix zojuist op is gedaan).
 */
export async function findBrandMatchingProductsAction(data: {
  brandId: string;
  original: string;
  replacement?: string;
  excludeArticleNumber?: string;
  fieldKey?: string;
}): Promise<BrandProductMatch[]> {
  const { userId, isAdmin } = await getSessionInfo();
  if (!userId || !data.brandId || !data.original?.trim()) return [];

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const layout = await getFormLayoutAction();

  const products = await prisma.product.findMany({
    where: {
      brandId: data.brandId,
      ...(data.excludeArticleNumber ? { internalArticleNumber: { not: data.excludeArticleNumber } } : {}),
    },
    select: {
      internalArticleNumber: true,
      title: true,
      readyForImport: true,
      shortDescription: true,
      longDescription: true,
      tags: true,
      seoTitle: true,
      seoMetaDescription: true,
      customData: true,
    },
    take: 200,
  });

  const matches: BrandProductMatch[] = [];
  const rep = data.replacement ?? '';

  for (const p of products) {
    const isLocked = !isAdmin && LOCKED_READY.has(String(p.readyForImport ?? '').toUpperCase());
    const match = findMatchesInProduct(p, layout, data.original, rep, data.fieldKey);
    if (match) {
      matches.push({
        articleNumber: p.internalArticleNumber,
        title: p.title,
        fieldKey: match.fieldKey,
        fieldLabel: match.fieldLabel,
        beforeText: match.beforeText,
        afterText: match.afterText,
        locked: isLocked,
      });
    }
  }

  return matches;
}

export interface ApplyBrandFixResult {
  articleNumber: string;
  applied: boolean;
  error?: string;
  newStatus?: string | null;
  openIssues?: number;
}

/**
 * Voert een goedgekeurde aanpassing door op de geselecteerde producten van ditzelfde merk.
 * Registreert historie, auditlog, werkt de EmpCo status / alarmering bij en update de merkregel.
 */
export async function applyBrandEmpcoFixAction(data: {
  brandId: string;
  original: string;
  replacement: string;
  targets: { articleNumber: string; fieldKey: string }[];
  rule?: string;
  explanation?: string;
  sourceArticle?: string;
}): Promise<ApplyBrandFixResult[]> {
  const { userId, email, isAdmin } = await getSessionInfo();
  if (!userId) throw new Error('Niet ingelogd');
  if (!data.targets || data.targets.length === 0) return [];

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const layout = await getFormLayoutAction();
  const allFields = layout.flatMap((s: any) => s.fields ?? []);
  const labelOf = (k: string) => {
    const f = allFields.find((x: any) => {
      let fk = String(x.id ?? '').replace('FIELD:', '');
      if (fk === 'description') fk = 'longDescription';
      return fk === k;
    });
    return f?.label ?? k;
  };

  const { syncEmpcoCheckAfterEdit } = await import('@/lib/empcoSync');
  const results: ApplyBrandFixResult[] = [];
  let successfulCount = 0;

  for (const target of data.targets) {
    try {
      const product = await prisma.product.findUnique({
        where: { internalArticleNumber: target.articleNumber },
      }) as any;

      if (!product) throw new Error('Product niet gevonden');
      if (product.brandId !== data.brandId) throw new Error('Product behoort niet tot dit merk');

      const isLocked = !isAdmin && LOCKED_READY.has(String(product.readyForImport ?? '').toUpperCase());
      if (isLocked) throw new Error('Product is vergrendeld (Webshop Ready)');

      let fieldKey = target.fieldKey;
      if (fieldKey === 'description') fieldKey = 'longDescription';

      const isCustom = fieldKey.startsWith('custom_');
      const curValue = isCustom
        ? product.customData?.[fieldKey.replace('custom_', '')] ?? ''
        : product[fieldKey] ?? '';

      const next = replaceEmpcoFragment(String(curValue), data.original, data.replacement);
      if (next === null || next === curValue) {
        throw new Error('Tekst niet meer gevonden in het veld');
      }

      // Update product
      const updatePayload: any = { lastEditedByUserId: userId };
      if (isCustom) {
        const customData = { ...(product.customData ?? {}) };
        customData[fieldKey.replace('custom_', '')] = next || null;
        updatePayload.customData = customData;
      } else {
        updatePayload[fieldKey] = next || null;
      }

      await prisma.product.update({
        where: { internalArticleNumber: target.articleNumber },
        data: updatePayload,
      });

      // Write ProductFieldHistory
      await prisma.productFieldHistory.create({
        data: {
          articleNumber: target.articleNumber,
          fieldKey,
          fieldLabel: labelOf(fieldKey),
          oldValue: curValue || null,
          newValue: next || null,
          source: 'EMPCO',
          userId,
          userEmail: email ?? null,
        },
      });

      // Audit log
      try {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'UPDATE',
            entity: 'Product',
            entityId: target.articleNumber,
            changes: JSON.stringify({
              source: 'BRAND_PROPAGATION',
              brandId: data.brandId,
              field: fieldKey,
              original: data.original,
              replacement: data.replacement,
            }),
          },
        });
      } catch (e) {
        console.error('Audit logging failed:', e);
      }

      // Update EmpCo check & alerting for this product
      let newStatus = 'OK';
      let openIssues = 0;
      try {
        const sync = await syncEmpcoCheckAfterEdit(
          target.articleNumber,
          product,
          layout,
          new Set([fieldKey])
        );
        newStatus = sync.status ?? 'OK';
        openIssues = sync.issueCount ?? 0;
      } catch (syncErr) {
        console.warn('Sync EmpCo check error:', syncErr);
      }

      successfulCount++;
      results.push({
        articleNumber: target.articleNumber,
        applied: true,
        newStatus,
        openIssues,
      });
    } catch (err: any) {
      results.push({
        articleNumber: target.articleNumber,
        applied: false,
        error: err?.message ?? 'Fout bij bijwerken',
      });
    }
  }

  // Sla regel op / verhoog count in BrandEmpcoRule
  if (successfulCount > 0) {
    try {
      await saveBrandRuleAction({
        brandId: data.brandId,
        original: data.original,
        replacement: data.replacement,
        rule: data.rule,
        explanation: data.explanation,
        sourceArticle: data.sourceArticle,
      });
    } catch (ruleErr) {
      console.error('Failed to save brand rule:', ruleErr);
    }
  }

  revalidatePath('/products');
  revalidatePath('/assignments');
  return results;
}

export interface BrandFixBatchItem {
  original: string;
  replacement: string;
  rule?: string;
  fieldLabel?: string;
  targets: { articleNumber: string; fieldKey: string }[];
}

export interface ApplyBrandBatchResult {
  articleNumber: string;
  original: string;
  replacement: string;
  fieldKey?: string;
  applied: boolean;
  error?: string;
  newStatus?: string | null;
  openIssues?: number;
}

/**
 * Voert meerdere goedgekeurde aanpassingen (verschillende fragmenten) in batch door
 * op de geselecteerde producten van ditzelfde merk.
 */
export async function applyBrandEmpcoBatchFixAction(data: {
  brandId: string;
  items: BrandFixBatchItem[];
  sourceArticle?: string;
}): Promise<ApplyBrandBatchResult[]> {
  const { userId, email, isAdmin } = await getSessionInfo();
  if (!userId) throw new Error('Niet ingelogd');
  if (!data.items || data.items.length === 0) return [];

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const layout = await getFormLayoutAction();
  const allFields = layout.flatMap((s: any) => s.fields ?? []);
  const labelOf = (k: string) => {
    const f = allFields.find((x: any) => {
      let fk = String(x.id ?? '').replace('FIELD:', '');
      if (fk === 'description') fk = 'longDescription';
      return fk === k;
    });
    return f?.label ?? k;
  };

  const { syncEmpcoCheckAfterEdit } = await import('@/lib/empcoSync');
  const results: ApplyBrandBatchResult[] = [];
  const affectedProducts = new Map<string, { beforeProduct: any; changedFields: Set<string> }>();

  for (const item of data.items) {
    if (!item.targets || item.targets.length === 0) continue;
    let itemSuccessCount = 0;

    for (const target of item.targets) {
      try {
        const product = await prisma.product.findUnique({
          where: { internalArticleNumber: target.articleNumber },
        }) as any;

        if (!product) throw new Error('Product niet gevonden');
        if (product.brandId !== data.brandId) throw new Error('Product behoort niet tot dit merk');

        const isLocked = !isAdmin && LOCKED_READY.has(String(product.readyForImport ?? '').toUpperCase());
        if (isLocked) throw new Error('Product is vergrendeld (Webshop Ready)');

        let fieldKey = target.fieldKey;
        if (fieldKey === 'description') fieldKey = 'longDescription';

        const isCustom = fieldKey.startsWith('custom_');
        const curValue = isCustom
          ? product.customData?.[fieldKey.replace('custom_', '')] ?? ''
          : product[fieldKey] ?? '';

        const next = replaceEmpcoFragment(String(curValue), item.original, item.replacement);
        if (next === null || next === curValue) {
          throw new Error('Tekst niet meer gevonden in het veld');
        }

        // Store snapshot of before product if not already captured
        if (!affectedProducts.has(target.articleNumber)) {
          affectedProducts.set(target.articleNumber, {
            beforeProduct: JSON.parse(JSON.stringify(product)),
            changedFields: new Set([fieldKey]),
          });
        } else {
          affectedProducts.get(target.articleNumber)!.changedFields.add(fieldKey);
        }

        // Update product in DB
        const updatePayload: any = { lastEditedByUserId: userId };
        if (isCustom) {
          const customData = { ...(product.customData ?? {}) };
          customData[fieldKey.replace('custom_', '')] = next || null;
          updatePayload.customData = customData;
        } else {
          updatePayload[fieldKey] = next || null;
        }

        await prisma.product.update({
          where: { internalArticleNumber: target.articleNumber },
          data: updatePayload,
        });

        // Write ProductFieldHistory
        await prisma.productFieldHistory.create({
          data: {
            articleNumber: target.articleNumber,
            fieldKey,
            fieldLabel: labelOf(fieldKey),
            oldValue: curValue || null,
            newValue: next || null,
            source: 'EMPCO',
            userId,
            userEmail: email ?? null,
          },
        });

        // Audit log
        try {
          await prisma.auditLog.create({
            data: {
              userId,
              action: 'UPDATE',
              entity: 'Product',
              entityId: target.articleNumber,
              changes: JSON.stringify({
                source: 'BRAND_PROPAGATION_BATCH',
                brandId: data.brandId,
                field: fieldKey,
                original: item.original,
                replacement: item.replacement,
              }),
            },
          });
        } catch (e) {
          console.error('Audit logging failed:', e);
        }

        itemSuccessCount++;
        results.push({
          articleNumber: target.articleNumber,
          original: item.original,
          replacement: item.replacement,
          fieldKey,
          applied: true,
        });
      } catch (err: any) {
        results.push({
          articleNumber: target.articleNumber,
          original: item.original,
          replacement: item.replacement,
          fieldKey: target.fieldKey,
          applied: false,
          error: err?.message ?? 'Fout bij bijwerken',
        });
      }
    }

    // Save/increment brand rule if any product was updated for this fragment
    if (itemSuccessCount > 0) {
      try {
        await saveBrandRuleAction({
          brandId: data.brandId,
          original: item.original,
          replacement: item.replacement,
          rule: item.rule,
          sourceArticle: data.sourceArticle,
        });
      } catch (ruleErr) {
        console.error('Failed to save brand rule:', ruleErr);
      }
    }
  }

  // Sync EmpCo check for all affected products
  for (const [artNum, info] of affectedProducts.entries()) {
    try {
      await syncEmpcoCheckAfterEdit(
        artNum,
        info.beforeProduct,
        layout,
        info.changedFields
      );
    } catch (syncErr) {
      console.warn(`Sync EmpCo check error for #${artNum}:`, syncErr);
    }
  }

  revalidatePath('/products');
  revalidatePath('/assignments');
  return results;
}

/** Verwijdert een geleerde regel van een merk. */
export async function deleteBrandRuleAction(ruleId: string) {
  const { isAdmin } = await getSessionInfo();
  if (!isAdmin) throw new Error('Alleen administrators mogen merkregels beheren');
  return prisma.brandEmpcoRule.delete({ where: { id: ruleId } });
}
