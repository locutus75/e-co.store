'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  EmpcoSettings, EmpcoPolicy, EMPCO_SETTINGS_KEY, normalizeEmpcoSettings,
  extractEmpcoFields, hashEmpcoFields, EmpcoResult, isEmpcoIssueFixable, replaceEmpcoFragment,
} from '@/lib/empco';

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getEmpcoSettingsAction(): Promise<EmpcoSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: EMPCO_SETTINGS_KEY } });
  if (!row) return normalizeEmpcoSettings(null);
  try { return normalizeEmpcoSettings(JSON.parse(row.value)); } catch { return normalizeEmpcoSettings(null); }
}

export async function saveEmpcoSettingsAction(settings: EmpcoSettings): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  if (!roles.some(r => r.toUpperCase() === 'ADMIN')) return { success: false, error: 'Alleen admins mogen EmpCo instellingen beheren.' };
  const value = JSON.stringify(normalizeEmpcoSettings(settings));
  await prisma.systemSetting.upsert({
    where: { key: EMPCO_SETTINGS_KEY },
    update: { value },
    create: { key: EMPCO_SETTINGS_KEY, value },
  });
  return { success: true };
}

// ── Webshop-ready gate ────────────────────────────────────────────────────────

export interface EmpcoGateProblem {
  articleNumber: string;
  title: string;
  reason: string;
  policy: EmpcoPolicy;
}

export interface EmpcoGateResult {
  blocked: EmpcoGateProblem[];
  warnings: EmpcoGateProblem[];
}

/**
 * Evaluates the configured EmpCo policies for products that are about to be
 * marked "Webshop Ready = JA". Returns which products are blocked / need a warning.
 */
export async function evaluateEmpcoReadyGateAction(articleNumbers: string[]): Promise<EmpcoGateResult> {
  const result: EmpcoGateResult = { blocked: [], warnings: [] };
  if (!articleNumbers?.length) return result;

  const settings = await getEmpcoSettingsAction();
  if (settings.readyPolicyFail === 'none' && settings.readyPolicyWarning === 'none' && settings.readyPolicyUnchecked === 'none') {
    return result;
  }

  const [products, checks] = await Promise.all([
    prisma.product.findMany({
      where: { internalArticleNumber: { in: articleNumbers } },
      include: { brand: true, category: true, subcategory: true },
    }),
    prisma.productEmpcoCheck.findMany({
      where: { articleNumber: { in: articleNumbers } },
      select: { articleNumber: true, status: true, issueCount: true, contentHash: true },
    }),
  ]);

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const layout = await getFormLayoutAction();
  const checkMap = new Map(checks.map(c => [c.articleNumber, c]));

  for (const p of products) {
    const check = checkMap.get(p.internalArticleNumber);
    const currentHash = hashEmpcoFields(extractEmpcoFields(p, layout, undefined, settings.includedFieldKeys));
    const isStale = !!check && !!check.contentHash && check.contentHash !== currentHash;

    let policy: EmpcoPolicy = 'none';
    let reason = '';
    if (!check || isStale) {
      policy = settings.readyPolicyUnchecked;
      reason = !check ? 'Nog geen EmpCo-check uitgevoerd' : 'EmpCo-check is verouderd (teksten gewijzigd na de check)';
    } else if (check.status === 'FAIL') {
      policy = settings.readyPolicyFail;
      reason = `EmpCo-overtreding (${check.issueCount} bevinding${check.issueCount === 1 ? '' : 'en'})`;
    } else if (check.status === 'WARNING') {
      policy = settings.readyPolicyWarning;
      reason = `EmpCo-aandachtspunten (${check.issueCount})`;
    }

    const problem: EmpcoGateProblem = { articleNumber: p.internalArticleNumber, title: p.title, reason, policy };
    if (policy === 'block') result.blocked.push(problem);
    else if (policy === 'warn') result.warnings.push(problem);
  }
  return result;
}

// ── Field history ─────────────────────────────────────────────────────────────

export async function getFieldHistoryAction(articleNumber: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return [];
  return prisma.productFieldHistory.findMany({
    where: { articleNumber },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
}

// ── Bulk: apply EmpCo suggestions for multiple products ───────────────────────

export interface EmpcoBulkIssue {
  idx: number;
  field: string;
  fieldLabel: string;
  original: string;
  replacement: string;
  severity: 'FAIL' | 'WARNING';
  rule: string;
  explanation: string;
  fixable: boolean;
  reason?: string;
}

export interface EmpcoBulkProduct {
  articleNumber: string;
  title: string;
  status: string | null;
  stale: boolean;
  locked: boolean;
  note?: string;
  issues: EmpcoBulkIssue[];
}

const LOCKED_READY = new Set(['JA', 'REVIEW', 'R', 'Y']);

async function getSessionInfo() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const roles: string[] = user?.roles ?? [];
  const isAdmin = roles.some(r => r.toUpperCase() === 'ADMIN');
  let canApproveEmpco = isAdmin;
  let canAssignProducts = isAdmin;
  if (!isAdmin && roles.length > 0) {
    const perms = await prisma.rolePermission.findMany({
      where: { role: { name: { in: roles } }, module: { in: ['MENU:ai', 'MENU:empco_approve', 'MENU:assignments'] } },
    });
    const hasAi = perms.some(p => p.module === 'MENU:ai' && p.action === 'ALLOW');
    const hasApproveAllow = perms.some(p => p.module === 'MENU:empco_approve' && p.action === 'ALLOW');
    const hasApproveDeny = perms.some(p => p.module === 'MENU:empco_approve' && p.action === 'DENY');
    const isEditor = roles.some(r => r.toUpperCase() === 'EDITOR');
    canApproveEmpco = hasAi || hasApproveAllow || (isEditor && !hasApproveDeny);
    canAssignProducts = perms.some(p => p.module === 'MENU:assignments' && p.action === 'ALLOW');
  }
  return { session, userId: user?.id as string | undefined, email: user?.email as string | undefined, isAdmin, canApproveEmpco, canAssignProducts };
}

function readFieldValue(product: any, key: string): string {
  const raw = key.startsWith('custom_')
    ? product?.customData?.[key.replace('custom_', '')]
    : key === 'shortDescription'
      ? (product?.shortDescription || product?.seoTitle)
      : product?.[key];
  return raw == null ? '' : String(raw);
}

/** Preview of all applicable EmpCo suggestions for the selected products. */
export async function getEmpcoBulkFixPreviewAction(articleNumbers: string[]): Promise<EmpcoBulkProduct[]> {
  const { userId, isAdmin, canApproveEmpco, canAssignProducts } = await getSessionInfo();
  if (!userId || !canApproveEmpco || !articleNumbers?.length) return [];

  const [products, checks] = await Promise.all([
    prisma.product.findMany({ where: { internalArticleNumber: { in: articleNumbers } } }),
    prisma.productEmpcoCheck.findMany({ where: { articleNumber: { in: articleNumbers } } }),
  ]);
  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const [layout, settings] = await Promise.all([getFormLayoutAction(), getEmpcoSettingsAction()]);
  const checkMap = new Map(checks.map(c => [c.articleNumber, c]));
  const order = new Map(articleNumbers.map((a, i) => [a, i]));

  const out: EmpcoBulkProduct[] = products.map((p: any) => {
    const check = checkMap.get(p.internalArticleNumber);
    const readyLocked = !isAdmin && LOCKED_READY.has(String(p.readyForImport ?? '').toUpperCase());
    const peerLocked = !isAdmin && !canAssignProducts && !!p.assignedUserId && p.assignedUserId !== userId;
    const locked = readyLocked || peerLocked;
    const base = { articleNumber: p.internalArticleNumber, title: p.title, status: check?.status ?? null, locked };
    if (!check) return { ...base, stale: false, note: peerLocked ? 'Alleen lezen (collega)' : 'Nog geen EmpCo-check', issues: [] };

    const stale = !!check.contentHash && check.contentHash !== hashEmpcoFields(extractEmpcoFields(p, layout, undefined, settings.includedFieldKeys));
    let result: EmpcoResult | null = null;
    try { result = check.structuredData ? JSON.parse(check.structuredData) : null; } catch { /**/ }

    // Simulate sequential application per field so overlapping fixes are detected
    const working = new Map<string, string>();
    const issues: EmpcoBulkIssue[] = (result?.issues ?? []).map((i, idx) => {
      const issue: EmpcoBulkIssue = {
        idx, field: i.field, fieldLabel: i.fieldLabel ?? i.field, original: i.original, replacement: i.replacement,
        severity: i.severity, rule: i.rule, explanation: i.explanation, fixable: false,
      };
      if (peerLocked) return { ...issue, reason: 'Alleen lezen — product is toegewezen aan een collega' };
      if (readyLocked) return { ...issue, reason: 'Product is vergrendeld (Webshop Ready)' };
      if (stale) return { ...issue, reason: 'Check is verouderd — eerst opnieuw checken' };
      if (!isEmpcoIssueFixable(i)) return { ...issue, reason: 'Kenmerk — handmatig aanpassen' };
      const cur = working.has(i.field) ? working.get(i.field)! : readFieldValue(p, i.field);
      const next = replaceEmpcoFragment(cur, i.original, i.replacement);
      if (next === null) return { ...issue, reason: 'Tekst niet (meer) gevonden' };
      working.set(i.field, next);
      return { ...issue, fixable: true };
    });

    return {
      ...base, stale, issues,
      note: peerLocked ? 'Alleen lezen (collega)' : readyLocked ? 'Vergrendeld' : stale ? 'Verouderde check' : issues.length === 0 ? 'Geen open bevindingen' : undefined,
    };
  });

  return out.sort((a, b) => (order.get(a.articleNumber) ?? 0) - (order.get(b.articleNumber) ?? 0));
}

export interface EmpcoBulkApplyResult {
  articleNumber: string;
  applied: number;
  skipped: number;
  error?: string;
  newStatus?: string | null;
  openIssues?: number;
}

/**
 * Applies the selected EmpCo suggestions directly to the products.
 * Writes field history (source EMPCO), an audit log entry and updates the EmpCo status.
 */
export async function applyEmpcoBulkFixesAction(
  selection: { articleNumber: string; issueIdx: number[]; customReplacements?: Record<number, string> }[],
): Promise<EmpcoBulkApplyResult[]> {
  const { userId, email, isAdmin, canApproveEmpco, canAssignProducts } = await getSessionInfo();
  if (!userId) throw new Error('Niet ingelogd');
  if (!canApproveEmpco) throw new Error('Geen rechten om EmpCo-voorstellen te accorderen');

  const { getFormLayoutAction } = await import('@/app/actions/formLayouts');
  const [layout, settings] = await Promise.all([getFormLayoutAction(), getEmpcoSettingsAction()]);
  const allFields = layout.flatMap((s: any) => s.fields ?? []);
  const labelOf = (k: string) => {
    if (k === 'shortDescription') return 'Korte omschrijving';
    if (k === 'longDescription') return 'Lange omschrijving';
    if (k === 'title') return 'Omschrijving';
    const f = allFields.find((x: any) => {
      let fk = String(x.id ?? '').replace('FIELD:', '');
      if (fk === 'description') fk = 'longDescription';
      return fk === k;
    });
    return f?.label ?? k;
  };
  const { syncEmpcoCheckAfterEdit } = await import('@/lib/empcoSync');

  const results: EmpcoBulkApplyResult[] = [];

  for (const sel of selection ?? []) {
    const res: EmpcoBulkApplyResult = { articleNumber: sel.articleNumber, applied: 0, skipped: 0 };
    try {
      const [product, check] = await Promise.all([
        prisma.product.findUnique({ where: { internalArticleNumber: sel.articleNumber } }) as Promise<any>,
        prisma.productEmpcoCheck.findUnique({ where: { articleNumber: sel.articleNumber } }),
      ]);
      if (!product || !check?.structuredData) throw new Error('Product of EmpCo-check niet gevonden');
      if (!isAdmin && LOCKED_READY.has(String(product.readyForImport ?? '').toUpperCase())) throw new Error('Product is vergrendeld');
      if (!isAdmin && !canAssignProducts && product.assignedUserId && product.assignedUserId !== userId) {
        throw new Error('Alleen lezen — product is toegewezen aan een collega');
      }
      if (check.contentHash && check.contentHash !== hashEmpcoFields(extractEmpcoFields(product, layout, undefined, settings.includedFieldKeys))) {
        throw new Error('EmpCo-check is verouderd — voer eerst een nieuwe check uit');
      }

      const result: EmpcoResult = JSON.parse(check.structuredData);
      const wanted = new Set(sel.issueIdx);
      const working = new Map<string, string>();
      const effectiveReplacements = new Map<number, string>();

      (result.issues ?? []).forEach((issue, idx) => {
        if (!wanted.has(idx)) return;
        const customRep = sel.customReplacements && Object.prototype.hasOwnProperty.call(sel.customReplacements, idx)
          ? sel.customReplacements[idx]
          : issue.replacement;
        const effectiveIssue = { ...issue, replacement: customRep };
        if (!isEmpcoIssueFixable(effectiveIssue)) { res.skipped++; return; }
        const cur = working.has(issue.field) ? working.get(issue.field)! : readFieldValue(product, issue.field);
        const next = replaceEmpcoFragment(cur, issue.original, customRep);
        if (next === null) { res.skipped++; return; }
        working.set(issue.field, next);
        effectiveReplacements.set(idx, customRep);
        res.applied++;
      });

      if (working.size > 0) {
        const data: any = { lastEditedByUserId: userId };
        const customData: Record<string, any> = { ...(product.customData ?? {}) };
        let customTouched = false;
        const historyRows: any[] = [];

        for (const [key, value] of working) {
          const oldValue = readFieldValue(product, key);
          if (oldValue === value) continue;
          if (key.startsWith('custom_')) {
            customData[key.replace('custom_', '')] = value || null;
            customTouched = true;
          } else {
            data[key] = value || null;
            if (key === 'shortDescription' && !product.shortDescription && product.seoTitle) {
              data.seoTitle = value || null;
            }
          }
          historyRows.push({
            articleNumber: sel.articleNumber, fieldKey: key, fieldLabel: labelOf(key),
            oldValue: oldValue || null, newValue: value || null, source: 'EMPCO', userId, userEmail: email ?? null,
          });
        }
        if (customTouched) data.customData = customData;

        if (historyRows.length > 0) {
          await prisma.product.update({ where: { internalArticleNumber: sel.articleNumber }, data });
          await prisma.productFieldHistory.createMany({ data: historyRows });
          try {
            await prisma.auditLog.create({
              data: { userId, action: 'UPDATE', entity: 'Product', entityId: sel.articleNumber, changes: JSON.stringify({ source: 'EMPCO_BULK', ...data }) },
            });
          } catch (e) { console.error('Audit logging failed:', e); }

          const updatedProduct = { ...product, ...data, customData: customTouched ? customData : product.customData };
          const sync = await syncEmpcoCheckAfterEdit(sel.articleNumber, updatedProduct, layout, new Set(working.keys()));
          res.newStatus = sync.status ?? check.status;
          res.openIssues = sync.issueCount ?? check.issueCount;

          // Automatically learn approved replacements for this brand
          if (product.brandId) {
            try {
              const { saveBrandRuleAction } = await import('@/app/actions/brandEmpco');
              for (const [key] of working) {
                  const matchedIdx = (result.issues ?? []).findIndex((i, idx) => i.field === key && wanted.has(idx));
                  if (matchedIdx >= 0) {
                    const matchedIssue = result.issues[matchedIdx];
                    await saveBrandRuleAction({
                      brandId: product.brandId,
                      original: matchedIssue.original,
                      replacement: effectiveReplacements.get(matchedIdx) ?? matchedIssue.replacement,
                      rule: matchedIssue.rule,
                      fieldKey: key,
                      explanation: matchedIssue.explanation,
                      sourceArticle: sel.articleNumber,
                    });
                  }
                }
              } catch (ruleErr) {
                console.error('Failed to learn brand rule in bulk:', ruleErr);
              }
            }
        }
        }
        if (res.newStatus === undefined) { res.newStatus = check.status; res.openIssues = check.issueCount; }
      } catch (e: any) {
        res.error = e?.message ?? 'Onbekende fout';
      }
      results.push(res);
    }

  revalidatePath('/products');
    revalidatePath('/assignments');
    return results;
  }
