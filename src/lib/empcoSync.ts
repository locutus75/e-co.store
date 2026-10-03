/**
 * Server-side helper: keeps the saved EmpCo check (status / "alarmering") in
 * sync after product texts were changed — via applied EmpCo suggestions
 * (drawer or bulk) or via manual edits.
 *
 * Only import from server code (server actions / route handlers).
 */
import { prisma } from '@/lib/prisma';
import { extractEmpcoFields, hashEmpcoFields, reconcileEmpcoResult, EmpcoResult } from '@/lib/empco';

export interface EmpcoSyncOutcome {
  updated: boolean;
  resolvedCount: number;
  status?: string;
  issueCount?: number;
  /** true when the check is still current after the sync (no re-check needed) */
  current?: boolean;
}

/**
 * @param articleNumber     product
 * @param beforeProduct     product row as it was BEFORE the update
 * @param layout            form layout (for field extraction)
 * @param suggestionFields  form keys that were changed by applying EmpCo suggestions
 */
export async function syncEmpcoCheckAfterEdit(
  articleNumber: string,
  beforeProduct: any,
  layout: any[],
  suggestionFields: Set<string>,
): Promise<EmpcoSyncOutcome> {
  const check = await prisma.productEmpcoCheck.findUnique({ where: { articleNumber } });
  if (!check?.structuredData) return { updated: false, resolvedCount: 0 };

  let result: EmpcoResult;
  try { result = JSON.parse(check.structuredData); } catch { return { updated: false, resolvedCount: 0 }; }

  const after = await prisma.product.findUnique({ where: { internalArticleNumber: articleNumber } });
  if (!after) return { updated: false, resolvedCount: 0 };

  const { getEmpcoSettingsAction } = await import('@/app/actions/empco');
  const settings = await getEmpcoSettingsAction();

  const beforeFields = extractEmpcoFields(beforeProduct, layout, undefined, settings.includedFieldKeys);
  const afterFields = extractEmpcoFields(after, layout, undefined, settings.includedFieldKeys);
  const beforeHash = hashEmpcoFields(beforeFields);
  const afterHash = hashEmpcoFields(afterFields);
  if (beforeHash === afterHash) return { updated: false, resolvedCount: 0 };

  // Which checked fields actually changed?
  const beforeMap = new Map(beforeFields.map(f => [f.key, f.value]));
  const afterMap = new Map(afterFields.map(f => [f.key, f.value]));
  const changed = new Set<string>();
  for (const k of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    if (beforeMap.get(k) !== afterMap.get(k)) changed.add(k);
  }

  const wasCurrent = check.contentHash === beforeHash;
  const onlySuggestions = [...changed].every(k => suggestionFields.has(k));

  // Preferred: compare against the snapshot the check actually saw (also works when
  // the check ran on unsaved drawer values). Every field that was NOT changed via a
  // suggestion must still equal the checked value.
  let snapshotMatches: boolean | null = null;
  if (result.checkedValues) {
    const snap = result.checkedValues;
    snapshotMatches = true;
    for (const k of new Set([...Object.keys(snap), ...afterMap.keys()])) {
      if (suggestionFields.has(k)) continue;
      if ((snap[k] ?? undefined) !== afterMap.get(k)) { snapshotMatches = false; break; }
    }
  }

  const { result: next, resolvedCount } = reconcileEmpcoResult(
    result, afterFields, issue => (suggestionFields.has(issue.field) ? 'EMPCO' : 'EDIT'),
  );

  // The check stays "current" only when the content changed exclusively through
  // its own suggestions. Any other text change → check becomes stale (re-check advised).
  const keepCurrent = suggestionFields.size > 0 && (snapshotMatches ?? (wasCurrent && onlySuggestions));
  if (resolvedCount === 0 && !keepCurrent) return { updated: false, resolvedCount: 0, current: false };
  if (keepCurrent) next.checkedValues = Object.fromEntries(afterFields.map(f => [f.key, f.value]));

  const updatedCheck = await prisma.productEmpcoCheck.update({
    where: { articleNumber },
    data: {
      status: next.status,
      issueCount: next.issues.length,
      summary: next.summary,
      structuredData: JSON.stringify(next),
      ...(keepCurrent ? { contentHash: afterHash } : {}),
    },
  });

  return {
    updated: true,
    resolvedCount,
    status: updatedCheck.status,
    issueCount: updatedCheck.issueCount,
    current: keepCurrent,
  };
}
