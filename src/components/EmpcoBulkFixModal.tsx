'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getEmpcoBulkFixPreviewAction, applyEmpcoBulkFixesAction,
  type EmpcoBulkProduct, type EmpcoBulkApplyResult,
} from '@/app/actions/empco';
import { ruleLabel } from '@/lib/empco';
import { EmpcoBadge, EmpcoModalShell, EmpcoSpinner, empcoBadgeState, EMPCO_ACCENT } from './EmpcoCheck';
import ConfirmationModal from './ConfirmationModal';

interface Props {
  articleNumbers: string[];
  canUseAi?: boolean;
  onClose: () => void;
  /** Called after changes were saved (e.g. router.refresh) */
  onComplete: () => void;
}

const CHUNK = 10;
const keyOf = (a: string, idx: number) => `${a}::${idx}`;

/**
 * Bulk: review, optionally generate/refresh, edit, and apply EmpCo suggestions for multiple products at once.
 * Every change is written to the field history (source EMPCO) and the EmpCo
 * status of each product is updated afterwards.
 */
export default function EmpcoBulkFixModal({ articleNumbers, canUseAi = false, onClose, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<EmpcoBulkProduct[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeWarnings, setIncludeWarnings] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'review' | 'applying' | 'done'>('review');
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<EmpcoBulkApplyResult[]>([]);

  // Inline custom replacement overrides keyed by `${articleNumber}::${idx}`
  const [customReplacements, setCustomReplacements] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  // Live EmpCo check generation state inside the modal
  const [checking, setChecking] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number; currentArticle: string }>({
    done: 0,
    total: 0,
    currentArticle: '',
  });
  const abortCheckRef = useRef(false);

  const loadPreview = useCallback(async (keepExistingSelection = false) => {
    setLoading(true);
    setError('');
    try {
      const list = await getEmpcoBulkFixPreviewAction(articleNumbers);
      setProducts(list);
      setSelected(prev => {
        const sel = keepExistingSelection ? new Set(prev) : new Set<string>();
        list.forEach(p => p.issues.forEach(i => {
          if (i.fixable && (includeWarnings || i.severity === 'FAIL')) {
            sel.add(keyOf(p.articleNumber, i.idx));
          }
        }));
        return sel;
      });
      // Automatically expand products that have issues, or all if <= 5
      const withIssues = list.filter(p => p.issues.length > 0).map(p => p.articleNumber);
      if (withIssues.length > 0) {
        setExpanded(new Set(withIssues));
      } else if (list.length <= 5) {
        setExpanded(new Set(list.map(p => p.articleNumber)));
      }
    } catch (e: any) {
      setError(e?.message ?? 'Laden mislukt');
    } finally {
      setLoading(false);
    }
  }, [articleNumbers, includeWarnings]);

  useEffect(() => {
    loadPreview(false);
  }, [loadPreview]);

  const uncheckedOrStaleProducts = useMemo(
    () => products.filter(p => !p.locked && (!p.status || p.stale)),
    [products]
  );
  const editableProducts = useMemo(
    () => products.filter(p => !p.locked),
    [products]
  );

  const runEmpcoChecks = async (targetArticles: string[]) => {
    if (!targetArticles.length || checking) return;
    abortCheckRef.current = false;
    setChecking(true);
    setError('');
    setCheckProgress({ done: 0, total: targetArticles.length, currentArticle: targetArticles[0] });

    let failedCount = 0;
    let lastErr = '';
    const batchSize = 5;

      for (let i = 0; i < targetArticles.length; i += batchSize) {
        if (abortCheckRef.current) break;
        const chunk = targetArticles.slice(i, i + batchSize);
        setCheckProgress({
          done: i,
          total: targetArticles.length,
          currentArticle: chunk.join(', '),
        });
        try {
            const res = await fetch('/api/ai/empco/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ articleNumbers: chunk, skipIfCurrent: false }),
            });
            const data = await res.json();
            if(!res.ok || data.error) {
          failedCount += chunk.length;
          lastErr = data.error || `HTTP ${res.status}`;
        } else if (Array.isArray(data.results)) {
          for (const r of data.results) {
            if (!r.ok) {
              failedCount++;
              lastErr = r.error || 'Check mislukt';
            }
          }
        }
      } catch (e: any) {
        failedCount += chunk.length;
        lastErr = e?.message || 'Netwerkfout';
      }
      setCheckProgress({
        done: Math.min(i + chunk.length, targetArticles.length),
        total: targetArticles.length,
        currentArticle: chunk[chunk.length - 1],
      });
    }

    setChecking(false);
    if (failedCount > 0 && lastErr) {
      setError(`${failedCount} product(en) konden niet worden gecontroleerd (${lastErr}).`);
    }
    await loadPreview(false);
    onComplete();
  };

  // Toggle "include warnings" → (de)select all fixable WARNING issues
  const toggleWarnings = (on: boolean) => {
    setIncludeWarnings(on);
    setSelected(prev => {
      const n = new Set(prev);
      products.forEach(p => p.issues.forEach(i => {
        if (!i.fixable || i.severity !== 'WARNING') return;
        const k = keyOf(p.articleNumber, i.idx);
        if (on) n.add(k); else n.delete(k);
      }));
      return n;
    });
  };

  const toggle = (k: string) => setSelected(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleProduct = (p: EmpcoBulkProduct, on: boolean) => setSelected(prev => {
    const n = new Set(prev);
    p.issues.forEach(i => {
      if (!i.fixable || (!includeWarnings && i.severity === 'WARNING')) return;
      const k = keyOf(p.articleNumber, i.idx);
      if (on) n.add(k); else n.delete(k);
    });
    return n;
  });
  const toggleExpanded = (a: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(a)) n.delete(a); else n.add(a); return n; });

  const selectAllFixable = () => {
    const n = new Set<string>();
    products.forEach(p => p.issues.forEach(i => {
      if (!i.fixable || (!includeWarnings && i.severity === 'WARNING')) return;
      n.add(keyOf(p.articleNumber, i.idx));
    }));
    setSelected(n);
  };

  const deselectAll = () => setSelected(new Set());

  const stats = useMemo(() => {
    let fixable = 0, manual = 0;
    const withSel = new Set<string>();
    products.forEach(p => p.issues.forEach(i => {
      if (i.fixable) fixable++; else manual++;
      if (selected.has(keyOf(p.articleNumber, i.idx))) withSel.add(p.articleNumber);
    }));
    return { fixable, manual, selectedCount: selected.size, productCount: withSel.size };
  }, [products, selected]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const buildSelectionPayload = () => {
    return products
      .map(p => {
        const issueIdx = p.issues.filter(i => selected.has(keyOf(p.articleNumber, i.idx))).map(i => i.idx);
        const customMap: Record<number, string> = {};
        issueIdx.forEach(idx => {
          const k = keyOf(p.articleNumber, idx);
          if (Object.prototype.hasOwnProperty.call(customReplacements, k)) {
            customMap[idx] = customReplacements[k];
          }
        });
        return {
          articleNumber: p.articleNumber,
          issueIdx,
          customReplacements: Object.keys(customMap).length > 0 ? customMap : undefined,
        };
      })
      .filter(s => s.issueIdx.length > 0);
  };

  const requestApply = () => {
    const selection = buildSelectionPayload();
    if (selection.length === 0) return;
    setConfirmOpen(true);
  };

  const executeApply = async () => {
    setConfirmOpen(false);
    const selection = buildSelectionPayload();
    if (selection.length === 0) return;

    setPhase('applying'); setProgress(0); setError('');
    const all: EmpcoBulkApplyResult[] = [];
    try {
      for (let i = 0; i < selection.length; i += CHUNK) {
        const part = await applyEmpcoBulkFixesAction(selection.slice(i, i + CHUNK));
        all.push(...part);
        setResults([...all]);
        setProgress(Math.min(selection.length, i + CHUNK) / selection.length);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Doorvoeren mislukt');
    }
    setPhase('done');
    onComplete();
  };

  const titleOf = (a: string) => products.find(p => p.articleNumber === a)?.title ?? a;
  const totals = useMemo(() => ({
    applied: results.reduce((s, r) => s + r.applied, 0),
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    errors: results.filter(r => r.error).length,
    resolvedProducts: results.filter(r => !r.error && r.newStatus === 'PASS').length,
  }), [results]);

  return (
    <EmpcoModalShell
      title="EmpCo-voorstellen doorvoeren"
      subtitle={`${articleNumbers.length} geselecteerde product${articleNumbers.length === 1 ? '' : 'en'}`}
      onClose={phase === 'applying' || checking ? () => { } : onClose}
      width={1040}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', color: EMPCO_ACCENT }}>
            <EmpcoSpinner size={18} /> Voorstellen laden…
          </div>
        ) : phase === 'review' ? (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.8rem 1.3rem', backgroundColor: 'white', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '0.82rem', color: '#334155' }}>
                <strong>{stats.fixable}</strong> automatisch door te voeren · <strong>{stats.manual}</strong> handmatig / niet mogelijk
              </span>
              <label htmlFor="empco-bulk-warnings" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                <input id="empco-bulk-warnings" type="checkbox" checked={includeWarnings} onChange={e => toggleWarnings(e.target.checked)} style={{ accentColor: EMPCO_ACCENT }} />
                Ook aandachtspunten (WARNING) doorvoeren
              </label>
              <div style={{ flex: 1 }} />
              {stats.fixable > 0 && (
                <>
                  <button type="button" onClick={selectAllFixable} style={linkBtn}>Alles selecteren</button>
                  <button type="button" onClick={deselectAll} style={linkBtn}>Alles deselecteren</button>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                </>
              )}
              {canUseAi && editableProducts.length > 0 && !checking && (
                <button
                  type="button"
                  onClick={() => runEmpcoChecks(editableProducts.map(p => p.articleNumber))}
                  style={{ ...linkBtn, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  title="Voer voor alle geselecteerde producten een nieuwe EmpCo-check uit"
                >
                  🔄 Alle ({editableProducts.length}) opnieuw checken
                </button>
              )}
              <button type="button" onClick={() => setExpanded(new Set(products.map(p => p.articleNumber)))} style={linkBtn}>Alles uitklappen</button>
              <button type="button" onClick={() => setExpanded(new Set())} style={linkBtn}>Alles inklappen</button>
            </div>

            {/* Live EmpCo-check progress banner */}
            {checking && (
              <div style={{ margin: '0.9rem 1.3rem 0', padding: '0.9rem 1.1rem', borderRadius: '10px', backgroundColor: '#f0fdfa', border: '1.5px solid #5eead4', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#0f766e', fontWeight: 700, fontSize: '0.86rem' }}>
                    <EmpcoSpinner size={16} />
                    <span>
                      Bezig met EmpCo-check & voorstellen genereren: {checkProgress.done} / {checkProgress.total}
                      {checkProgress.currentArticle ? ` (#${checkProgress.currentArticle} — ${titleOf(checkProgress.currentArticle)})` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { abortCheckRef.current = true; }}
                    style={{ padding: '0.28rem 0.7rem', borderRadius: '6px', border: '1px solid #fca5a5', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ⏹ Stoppen
                  </button>
                </div>
                <div style={{ height: '6px', backgroundColor: '#ccfbf1', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${checkProgress.total > 0 ? Math.round((checkProgress.done / checkProgress.total) * 100) : 0}%`,
                      backgroundColor: EMPCO_ACCENT,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Banner when some or all products have no EmpCo-check yet (or stale check) */}
            {!checking && uncheckedOrStaleProducts.length > 0 && (
              <div
                style={{
                  margin: '0.9rem 1.3rem 0',
                  padding: '0.9rem 1.15rem',
                  borderRadius: '10px',
                  backgroundColor: '#f0fdfa',
                  border: '1.5px solid #99f6e4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', flex: 1, minWidth: '260px' }}>
                  <span style={{ fontSize: '1.25rem', lineHeight: 1.2 }}>⚖️</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f766e' }}>
                      Voor {uncheckedOrStaleProducts.length} van de {products.length} geselecteerde producten is nog geen (actuele) EmpCo-check uitgevoerd
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#115e59', lineHeight: 1.45 }}>
                      {canUseAi
                        ? 'Daardoor staan er voor deze producten nog geen voorstellen klaar om aan te vinken. Klik op de knop hiernaast om direct de EmpCo-check uit te voeren en de voorstellen te genereren (deze blijven daarna ook klaarstaan voor een Editor).'
                        : 'Er kunnen pas voorstellen worden geselecteerd nadat een beheerder of gebruiker met AI-rechten een EmpCo-check op deze producten heeft uitgevoerd.'}
                    </span>
                  </div>
                </div>
                {canUseAi && (
                  <button
                    type="button"
                    onClick={() => runEmpcoChecks(uncheckedOrStaleProducts.map(p => p.articleNumber))}
                    style={{
                      ...primaryBtn,
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    ⚖️ Nu EmpCo-check & voorstellen genereren ({uncheckedOrStaleProducts.length})
                  </button>
                )}
              </div>
            )}

            {error && <div style={{ margin: '0.8rem 1.3rem 0', padding: '0.6rem 0.85rem', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '0.82rem' }}>❌ {error}</div>}

            {/* Product list */}
            <div style={{ padding: '0.9rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
              {products.map(p => {
                const fixable = p.issues.filter(i => i.fixable && (includeWarnings || i.severity === 'FAIL'));
                const selCount = p.issues.filter(i => selected.has(keyOf(p.articleNumber, i.idx))).length;
                const allSel = fixable.length > 0 && selCount === fixable.length;
                const isOpen = expanded.has(p.articleNumber);
                const needsCheck = !p.locked && (!p.status || p.stale);
                return (
                  <div key={p.articleNumber} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: 'white', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem 0.9rem', cursor: 'pointer' }} onClick={() => toggleExpanded(p.articleNumber)}>
                      <input
                        type="checkbox" aria-label={`Alle voorstellen voor ${p.articleNumber}`}
                        checked={allSel} disabled={fixable.length === 0 || checking}
                        ref={el => { if (el) el.indeterminate = selCount > 0 && !allSel; }}
                        onClick={e => e.stopPropagation()}
                        onChange={e => toggleProduct(p, e.target.checked)}
                        style={{ accentColor: EMPCO_ACCENT }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#14b8a6', fontFamily: 'monospace', fontWeight: 600 }}>#{p.articleNumber}</span>
                      <span style={{ fontSize: '0.86rem', color: '#0f172a', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                      {p.note && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{p.note}</span>}
                      {needsCheck && canUseAi && !checking && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            runEmpcoChecks([p.articleNumber]);
                          }}
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px',
                            border: '1px solid #0d9488',
                            backgroundColor: '#f0fdfa',
                            color: '#0f766e',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          title="Voer nu de EmpCo-check uit voor dit product"
                        >
                          ⚖️ Nu checken
                        </button>
                      )}
                      <span style={{ fontSize: '0.72rem', color: '#475569' }}>{selCount}/{p.issues.length} geselecteerd</span>
                      <EmpcoBadge state={empcoBadgeState(p.status, p.stale)} issueCount={p.issues.length} compact />
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOpen && p.issues.length > 0 && (
                      <div style={{ borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column' }}>
                        {p.issues.map(i => {
                          const k = keyOf(p.articleNumber, i.idx);
                          const hasCustom = Object.prototype.hasOwnProperty.call(customReplacements, k);
                          const effectiveReplacement = hasCustom ? customReplacements[k] : i.replacement;
                          const isEditing = editingKey === k;
                          return (
                            <div key={k} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '0.6rem', padding: '0.6rem 0.9rem 0.6rem 2.2rem', borderBottom: '1px solid #f8fafc', opacity: i.fixable ? 1 : 0.65 }}>
                              <input
                                id={`empco-bulk-${k}`}
                                type="checkbox"
                                checked={selected.has(k)}
                                disabled={!i.fixable || checking}
                                onChange={() => toggle(k)}
                                style={{ accentColor: EMPCO_ACCENT, marginTop: '0.15rem', cursor: i.fixable ? 'pointer' : 'default' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: '0.72rem' }}>
                                  <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label htmlFor={`empco-bulk-${k}`} style={{ fontWeight: 700, color: i.severity === 'FAIL' ? '#b91c1c' : '#a16207', cursor: i.fixable ? 'pointer' : 'default' }}>
                                      {i.severity === 'FAIL' ? '⛔ Overtreding' : '⚠️ Aandachtspunt'}
                                    </label>
                                    <span style={{ color: '#475569' }}>· {i.fieldLabel}</span>
                                    <span style={{ color: '#94a3b8' }}>· {ruleLabel(i.rule)}</span>
                                    {hasCustom && (
                                      <span style={{ backgroundColor: '#fef3c7', color: '#b45309', padding: '0.05rem 0.4rem', borderRadius: '999px', fontWeight: 700, fontSize: '0.66rem' }}>
                                        HANDMATIG AANGEPAST
                                      </span>
                                    )}
                                    {!i.fixable && i.reason && <span style={{ color: '#64748b', fontStyle: 'italic' }}>— {i.reason}</span>}
                                  </div>
                                  {i.fixable && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                      {hasCustom && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCustomReplacements(prev => {
                                              const next = { ...prev };
                                              delete next[k];
                                              return next;
                                            });
                                          }}
                                          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                                        >
                                          ↺ Reset naar voorstel
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setEditingKey(isEditing ? null : k)}
                                        style={{ background: 'none', border: 'none', color: EMPCO_ACCENT, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                      >
                                        {isEditing ? '✓ Klaar met aanpassen' : '✏️ Zelf aanpassen'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                                  <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', textDecoration: 'line-through', padding: '0 0.2rem', borderRadius: '3px' }}>{i.original || '—'}</span>
                                  <span style={{ margin: '0 0.4rem', color: '#94a3b8' }}>→</span>
                                  {effectiveReplacement
                                    ? <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0 0.2rem', borderRadius: '3px' }}>{effectiveReplacement}</span>
                                    : <span style={{ color: '#64748b', fontStyle: 'italic' }}>{i.field.startsWith('crit') ? 'kenmerk handmatig aanpassen' : 'fragment verwijderen'}</span>}
                                </div>
                                {isEditing && (
                                  <div style={{ marginTop: '0.25rem' }}>
                                    <textarea
                                      value={effectiveReplacement}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setCustomReplacements(prev => ({ ...prev, [k]: val }));
                                        if (!selected.has(k)) toggle(k);
                                      }}
                                      rows={2}
                                      placeholder="Laat leeg om het fragment te verwijderen, of typ je eigen vervangende tekst..."
                                      style={{
                                        width: '100%',
                                        padding: '0.45rem 0.6rem',
                                        borderRadius: '6px',
                                        border: `1.5px solid ${EMPCO_ACCENT}`,
                                        fontSize: '0.8rem',
                                        fontFamily: 'inherit',
                                        color: '#0f172a',
                                        backgroundColor: '#f0fdfa',
                                        resize: 'vertical',
                                      }}
                                    />
                                  </div>
                                )}
                                {i.explanation && <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{i.explanation}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isOpen && p.issues.length === 0 && (
                      <div style={{ borderTop: '1px solid #f1f5f9', padding: '0.7rem 1rem 0.7rem 2.2rem', fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <span>
                          {!p.status
                            ? 'Voor dit product is nog geen EmpCo-check uitgevoerd.'
                            : p.stale
                              ? 'De EmpCo-check van dit product is verouderd en heeft geen openstaande voorstellen.'
                              : 'Dit product is EmpCo-proof (geen openstaande bevindingen).'}
                        </span>
                        {needsCheck && canUseAi && !checking && (
                          <button
                            type="button"
                            onClick={() => runEmpcoChecks([p.articleNumber])}
                            style={{ ...linkBtn, fontWeight: 700 }}
                          >
                            ⚖️ Nu EmpCo-check uitvoeren
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {products.length === 0 && <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem', fontSize: '0.85rem' }}>Geen producten gevonden.</div>}
            </div>

            {/* Footer */}
            <div style={footerStyle}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Wijzigingen worden direct opgeslagen en vastgelegd in de 🕘 Historie. Gegenereerde checks blijven klaarstaan voor review door een Editor.
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={onClose} disabled={checking} style={secondaryBtn}>Sluiten</button>
                <button id="empco-bulk-apply-btn" type="button" onClick={requestApply} disabled={stats.selectedCount === 0 || checking}
                  style={{ ...primaryBtn, opacity: stats.selectedCount === 0 || checking ? 0.5 : 1, cursor: stats.selectedCount === 0 || checking ? 'not-allowed' : 'pointer' }}>
                  ✍️ {stats.selectedCount} voorstel{stats.selectedCount === 1 ? '' : 'len'} doorvoeren ({stats.productCount} product{stats.productCount === 1 ? '' : 'en'})
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Progress / results */}
            <div style={{ height: '6px', backgroundColor: '#ccfbf1' }}>
              <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, backgroundColor: EMPCO_ACCENT, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', padding: '0.75rem 1.3rem', backgroundColor: '#f0fdfa', borderBottom: '1px solid #ccfbf1', fontSize: '0.82rem' }}>
              {phase === 'applying' && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: EMPCO_ACCENT, fontWeight: 600 }}><EmpcoSpinner /> Bezig met doorvoeren…</span>}
              <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {totals.applied} doorgevoerd</span>
              {totals.skipped > 0 && <span style={{ color: '#64748b' }}>– {totals.skipped} overgeslagen</span>}
              {totals.errors > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>✕ {totals.errors} product(en) mislukt</span>}
              {phase === 'done' && <span style={{ color: '#0f766e' }}>✅ {totals.resolvedProducts} product(en) nu volledig EmpCo-proof</span>}
            </div>
            {error && <div style={{ margin: '0.8rem 1.3rem 0', padding: '0.6rem 0.85rem', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '0.82rem' }}>❌ {error}</div>}
            <div style={{ flex: 1 }}>
              {results.map((r, idx) => (
                <div key={r.articleNumber} style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto', gap: '0.75rem', alignItems: 'center', padding: '0.55rem 1.3rem', backgroundColor: idx % 2 ? '#fcfdfd' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.72rem', color: '#14b8a6', fontFamily: 'monospace', fontWeight: 600 }}>#{r.articleNumber}</span>
                  <span style={{ fontSize: '0.85rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(r.articleNumber)}</span>
                  <span style={{ fontSize: '0.76rem', color: r.error ? '#dc2626' : '#334155' }}>
                    {r.error ? `Fout: ${r.error}` : `${r.applied} doorgevoerd${r.skipped ? `, ${r.skipped} overgeslagen` : ''}`}
                  </span>
                  {!r.error && r.newStatus ? <EmpcoBadge state={empcoBadgeState(r.newStatus)} issueCount={r.openIssues} compact /> : <span />}
                </div>
              ))}
            </div>
            <div style={footerStyle}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Vorige teksten zijn per product terug te vinden via 🕘 Historie.
              </span>
              <button type="button" onClick={onClose} disabled={phase === 'applying'} style={{ ...primaryBtn, opacity: phase === 'applying' ? 0.5 : 1 }}>Sluiten</button>
            </div>
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmOpen}
        title="EmpCo-voorstellen doorvoeren?"
        type="success"
        confirmLabel={`✍️ ${stats.selectedCount} voorstel${stats.selectedCount === 1 ? '' : 'len'} doorvoeren`}
        cancelLabel="Annuleren"
        onConfirm={executeApply}
        onCancel={() => setConfirmOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
            backgroundColor: '#f0fdfa',
            border: '1px solid #ccfbf1',
            borderRadius: '10px',
            padding: '0.75rem 1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#0d9488', fontWeight: 600, textTransform: 'uppercase' }}>Voorstellen</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f766e' }}>{stats.selectedCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#0d9488', fontWeight: 600, textTransform: 'uppercase' }}>Producten</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f766e' }}>{stats.productCount}</div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.92rem', color: '#334155', lineHeight: 1.55 }}>
            Weet je zeker dat je deze voorstellen direct wilt doorvoeren in de gekoppelde productomschrijvingen?
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            padding: '0.7rem 0.85rem',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: '0.83rem',
            color: '#475569',
            lineHeight: 1.45
          }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>🕘</span>
            <span>
              De huidige teksten worden automatisch vastgelegd in de <strong>Historie</strong> en kunnen altijd worden ingezien of hersteld.
            </span>
          </div>
        </div>
      </ConfirmationModal>
    </EmpcoModalShell>
  );
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: EMPCO_ACCENT, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { padding: '0.5rem 1.2rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#0f766e,#065f46)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 6px 16px rgba(15,118,110,0.3)' };
const secondaryBtn: React.CSSProperties = { padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: 'white', color: '#334155', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' };
const footerStyle: React.CSSProperties = { position: 'sticky', bottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', padding: '0.85rem 1.3rem', backgroundColor: 'white', borderTop: '1px solid #e2e8f0' };
