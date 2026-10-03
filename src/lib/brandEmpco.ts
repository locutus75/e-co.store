/**
 * Brand-specific EmpCo learning & smart propagation.
 * Allows the system to remember approved claims, forbidden marketing phrases and
 * approved replacements per brand so other products of that brand can benefit
 * without repeating expensive or redundant LLM analyses.
 */

import { EmpcoField, replaceEmpcoFragment } from './empco';

export interface BrandEmpcoRuleItem {
  id: string;
  brandId: string;
  ruleType: 'REPLACEMENT' | 'COMPLIANT';
  fieldKey: string;
  original: string;
  replacement?: string | null;
  rule?: string | null;
  severity: string;
  explanation?: string | null;
  sourceArticle?: string | null;
  appliedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandProductMatch {
  articleNumber: string;
  title: string;
  fieldKey: string;
  fieldLabel: string;
  beforeText: string;
  afterText: string;
  locked: boolean;
}

/**
 * Builds instructions about learned brand traits for the LLM prompt.
 */
export function formatBrandKnowledgePrompt(brandName: string, rules: { ruleType: string; original: string; replacement?: string | null; rule?: string | null }[]): string {
  if (!rules || rules.length === 0) return '';
  const compliant = rules.filter(r => r.ruleType === 'COMPLIANT');
  const replacements = rules.filter(r => r.ruleType === 'REPLACEMENT');

  const lines: string[] = [`Geleerde merkkennis voor het merk "${brandName}":`];

  if (compliant.length > 0) {
    lines.push('- Eerder geverifieerde / toegestane claims voor dit merk (markeer deze NIET als overtreding):');
    compliant.forEach(c => lines.push(`  * "${c.original}"`));
  }

  if (replacements.length > 0) {
    lines.push('- Eerder goedgekeurde correcties voor teksten van dit merk:');
    replacements.forEach(r => {
      lines.push(`  * Vervang "${r.original}" door: "${r.replacement || '(verwijderen)'}" (${r.rule || 'EmpCo'})`);
    });
  }

  return lines.join('\n');
}

/**
 * Checks if any text fields of a product contain `original` and computes the replacement.
 */
export function findMatchesInProduct(
  product: any,
  layout: any[],
  original: string,
  replacement: string,
  preferredFieldKey?: string,
): { fieldKey: string; fieldLabel: string; beforeText: string; afterText: string } | null {
  if (!original) return null;

  const allFields = (layout ?? []).flatMap((s: any) => s.fields ?? []);
  const getFieldVal = (k: string) => {
    if (k.startsWith('custom_')) return product?.customData?.[k.replace('custom_', '')] ?? '';
    return product?.[k] ?? '';
  };

  const getLabel = (k: string) => {
    const f = allFields.find((x: any) => {
      let fk = String(x.id ?? '').replace('FIELD:', '');
      if (fk === 'description') fk = 'longDescription';
      return fk === k;
    });
    return f?.label ?? k;
  };

  // If a preferred field is provided and contains the text, check it first
  const candidateKeys = new Set<string>();
  if (preferredFieldKey && preferredFieldKey !== '*') {
    candidateKeys.add(preferredFieldKey);
  }
  // Standard text fields to inspect
  ['longDescription', 'shortDescription', 'title', 'tags', 'seoTitle', 'seoMetaDescription'].forEach(k => candidateKeys.add(k));

  // Also include any other text fields from layout
  allFields.forEach((f: any) => {
    if (f.type === 'text' || f.type === 'textarea') {
      let k = String(f.id ?? '').replace('FIELD:', '');
      if (k === 'description') k = 'longDescription';
      candidateKeys.add(k);
    }
  });

  for (const k of candidateKeys) {
    const raw = getFieldVal(k);
    if (!raw || typeof raw !== 'string') continue;
    const next = replaceEmpcoFragment(raw, original, replacement);
    if (next !== null && next !== raw) {
      return {
        fieldKey: k,
        fieldLabel: getLabel(k),
        beforeText: raw,
        afterText: next,
      };
    }
  }

  return null;
}
