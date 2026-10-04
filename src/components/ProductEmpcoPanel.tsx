'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useExchangeRate, formatCostEur } from '@/hooks/useExchangeRate';
import { estimateCost } from '@/lib/llmUtils';
import { EmpcoIssue } from '@/lib/empco';
import { EmpcoBadge, EmpcoModalShell, EmpcoResultView, EmpcoSpinner, empcoBadgeState, EMPCO_ACCENT, EmpcoGuidelinesModal } from './EmpcoCheck';
import BrandPropagationModal, { PropagationItem } from './BrandPropagationModal';

export interface ApplyFixResult { ok: boolean; message?: string }

interface Props {
  articleNumber: string;
  productTitle?: string;
  /** Current (possibly unsaved) form values keyed by form key */
  getLiveValues: () => Record<string, string>;
  /** Replace `original` by `replacement` in the given form field. */
  applyFix: (fieldKey: string, original: string, replacement: string) => ApplyFixResult;
  canEdit: boolean;
  onOpenHistory: () => void;
  /** Called after a check finished (to refresh badges elsewhere) */
  onChecked?: (status: string, stale: boolean, issueCount: number) => void;
  /** Change this value to reload the saved check (e.g. after the product was saved) */
  refreshKey?: number;
  brandId?: string;
  brandName?: string;
  onSave?: () => Promise<void> | void;
  isSaving?: boolean;
  isDirty?: boolean;
}

export default function ProductEmpcoPanel({
  articleNumber,
  productTitle,
  getLiveValues,
  applyFix,
  canEdit,
  onOpenHistory,
  onChecked,
  refreshKey,
  brandId,
  brandName,
  onSave,
  isSaving,
  isDirty,
}: Props) {
  const { rate: usdToEur } = useExchangeRate();
  const [open, setOpen] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [guidelines, setGuidelines] = useState<any>(null);
  const [check, setCheck] = useState<any>(null);
  const [stale, setStale] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<Record<number, 'ok' | string>>({});
  const [liveValues, setLiveValues] = useState<Record<string, string>>({});
  const [propagationItems, setPropagationItems] = useState<PropagationItem[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/empco?article=${encodeURIComponent(articleNumber)}`);
      const d = await res.json();
      setCheck(d.check ?? null); setStale(!!d.stale);
      if (d.guidelines) setGuidelines(d.guidelines);
    } catch { /**/ }
    setLoading(false);
  }, [articleNumber]);

  // Load status whenever the product changes (for the badge on the trigger button)
  useEffect(() => { setCheck(null); setStale(false); setHasUnsavedChanges(false); setApplied({}); setError(''); setJustSaved(false); load(); }, [load]);

  // Reload after save so the badge reflects resolved findings
  useEffect(() => {
    if (!refreshKey) return;
    setApplied({});
    setSaving(false);
    setJustSaved(true);
    setHasUnsavedChanges(false);
    load().then(() => setLiveValues(getLiveValues()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const openPanel = () => { setLiveValues(getLiveValues()); setOpen(true); };

  const runCheck = async () => {
    setRunning(true); setError(''); setApplied({}); setJustSaved(false);
    const overrides = getLiveValues();
    try {
      const res = await fetch('/api/ai/empco', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleNumber, overrides }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error ?? 'EmpCo-check mislukt');
      else {
        setCheck(d.check);
        setStale(false); // freshly run check on live values
        setHasUnsavedChanges(!!d.hasUnsavedChanges);
        setLiveValues(overrides);
        onChecked?.(d.check.status, false, d.check.issueCount);
      }
    } catch (e: any) { setError(e.message ?? 'Netwerkfout'); }
    setRunning(false);
  };

  const isFixable = (issue: EmpcoIssue) => canEdit && !issue.field.startsWith('crit') && !!issue.original;

  const doApply = (issue: EmpcoIssue, idx: number) => {
    setJustSaved(false);
    const r = applyFix(issue.field, issue.original, issue.replacement);
    setApplied(p => ({ ...p, [idx]: r.ok ? 'ok' : (r.message ?? 'Niet gelukt') }));
    setLiveValues(getLiveValues());
  };

  const applyAll = () => {
    setJustSaved(false);
    (check?.result?.issues ?? []).forEach((issue: EmpcoIssue, idx: number) => {
      if (isFixable(issue) && applied[idx] !== 'ok') doApply(issue, idx);
    });
  };

  const handleSaveClick = async () => {
    if (!onSave || saving || isSaving) return;
    setSaving(true);
    setError('');
    try {
      await onSave();
      setJustSaved(true);
      setApplied({});
    } catch (e: any) {
      setError(e.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const result = check?.result;
  const state = empcoBadgeState(check?.status, stale);
  const appliedCount = Object.values(applied).filter(v => v === 'ok').length;
  const fixableCount = (result?.issues ?? []).filter((i: EmpcoIssue) => isFixable(i)).length;

  return (
    <>
      <button type="button" onClick={openPanel} title="Controleer teksten op de EmpCo-richtlijn (EU 2024/825)"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.4rem 0.85rem', borderRadius: 'var(--radius)',
          border: '1px solid #5eead4', backgroundColor: '#f0fdfa', color: EMPCO_ACCENT, fontWeight: 600, fontSize: '0.8rem',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ccfbf1'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0fdfa'; }}>
        ⚖️ EmpCo
        {loading ? <EmpcoSpinner size={11} /> : check && <EmpcoBadge state={state} issueCount={check.issueCount} compact />}
      </button>

      {open && (
        <EmpcoModalShell title="EmpCo-check" subtitle={productTitle ? `${productTitle} — #${articleNumber}` : `#${articleNumber}`} onClose={() => setOpen(false)}
          headerRight={
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              <button type="button" onClick={() => setShowGuidelines(true)}
                style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.12)', color: 'white', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                title="Bekijk de officiële EmpCo-wetgeving, ACM-leidraad en toetscriteria">
                ⚖️ Wetgeving & Richtlijnen
              </button>
              <button type="button" onClick={onOpenHistory}
                style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.45)', backgroundColor: 'rgba(255,255,255,0.12)', color: 'white' }}>
                🕘 Historie
              </button>
              {(appliedCount > 0 || hasUnsavedChanges || isDirty) && canEdit && onSave && (
                <button type="button" onClick={handleSaveClick} disabled={isSaving || saving}
                  style={{
                    padding: '0.3rem 0.9rem',
                    borderRadius: '999px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: (isSaving || saving) ? 'wait' : 'pointer',
                    border: 'none',
                    backgroundColor: '#16a34a',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    boxShadow: '0 2px 6px rgba(22,163,74,0.3)',
                  }}>
                  {(isSaving || saving) ? <><EmpcoSpinner size={12} /> Opslaan…</> : '💾 Opslaan'}
                </button>
              )}
              <button type="button" onClick={runCheck} disabled={running}
                style={{ padding: '0.3rem 0.9rem', borderRadius: '999px', fontSize: '0.76rem', fontWeight: 700, cursor: running ? 'wait' : 'pointer', border: 'none', backgroundColor: 'white', color: EMPCO_ACCENT, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {running ? <><EmpcoSpinner size={12} /> Controleren…</> : check ? '↻ Opnieuw checken' : '▶ Check uitvoeren'}
              </button>
            </div>
          }>
          {error && <div style={{ margin: '1rem 1.3rem 0', padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: '0.82rem' }}>❌ {error}</div>}

          {!result && !running && (
            <div style={{ padding: '2.5rem 2rem', textAlign: 'center', color: '#334155' }}>
              <div style={{ fontSize: '2.6rem', marginBottom: '0.6rem' }}>⚖️</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.4rem' }}>Nog geen EmpCo-check voor dit product</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '560px', margin: '0 auto 1.2rem', lineHeight: 1.6 }}>
                De check toetst alle klantgerichte teksten (titel, omschrijvingen, SEO, tags…) en duurzaamheidskenmerken aan de EmpCo-richtlijn.
                Je huidige (ook niet-opgeslagen) invoer wordt meegenomen. Voorstellen kun je direct in het formulier overnemen.
              </div>
              <button type="button" onClick={runCheck}
                style={{ padding: '0.65rem 1.6rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#0f766e,#065f46)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 6px 18px rgba(15,118,110,0.35)' }}>
                ▶ EmpCo-check uitvoeren
              </button>
            </div>
          )}

          {running && !result && (
            <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.7rem', color: EMPCO_ACCENT, fontWeight: 600 }}>
              <EmpcoSpinner size={20} /> Teksten worden getoetst aan de EmpCo-richtlijn…
            </div>
          )}

          {result && (
            <div style={{ opacity: running ? 0.5 : 1, transition: 'opacity 0.2s' }}>
              {/* Meta + bulk apply bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.5rem 1.4rem', backgroundColor: '#ecfdf5', borderBottom: '1px solid #a7f3d0', fontSize: '0.72rem', color: '#065f46', flexWrap: 'wrap' }}>
                <span>📅 {new Date(check.updatedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {check.model && check.model !== '-' && <span>🤖 {check.model}</span>}
                {(() => {
                  const c = check.costUsd > 0
                    ? check.costUsd
                    : estimateCost(check.model, check.inputTokens, check.outputTokens);
                  return c > 0 ? <span>💰 {formatCostEur(c, usdToEur)}</span> : null;
                })()}
                <div style={{ flex: 1 }} />
                {fixableCount > 0 && (
                  <button type="button" onClick={applyAll} disabled={appliedCount >= fixableCount}
                    style={{ padding: '0.3rem 0.85rem', borderRadius: '7px', border: 'none', backgroundColor: appliedCount >= fixableCount ? '#a7f3d0' : EMPCO_ACCENT, color: 'white', fontWeight: 700, fontSize: '0.74rem', cursor: appliedCount >= fixableCount ? 'default' : 'pointer' }}>
                    {appliedCount >= fixableCount ? '✓ Alle voorstellen overgenomen' : `✓ Alle ${fixableCount} voorstellen overnemen`}
                  </button>
                )}
              </div>

              {/* Success notification banner after saving */}
              {justSaved && appliedCount === 0 && (
                <div style={{ margin: '0.9rem 1.4rem 0', padding: '0.75rem 1rem', borderRadius: '10px', backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#065f46' }}>Wijzigingen succesvol opgeslagen!</div>
                      <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                        De vorige tekst staat veilig bewaard in de historie.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={onOpenHistory}
                      style={{
                        padding: '0.4rem 0.95rem',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: '#059669',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                      }}
                    >
                      <span>🕘</span>
                      <span>Bekijk direct in Historie</span>
                    </button>
                    <button
                      type="button"
                      onClick={runCheck}
                      disabled={running}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '7px',
                        border: '1px solid #a7f3d0',
                        backgroundColor: 'white',
                        color: '#065f46',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        cursor: running ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      {running ? <EmpcoSpinner size={12} /> : <span>↻ Opnieuw checken</span>}
                    </button>
                  </div>
                </div>
              )}

              {/* Unsaved changes notification banner */}
              {(hasUnsavedChanges || isDirty) && !justSaved && appliedCount === 0 && (
                <div style={{
                  margin: '0.9rem 1.4rem 0',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>💾</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#92400e' }}>
                        Getoetste teksten bevatten niet-opgeslagen wijzigingen
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                        Sla het product op om deze EmpCo-beoordeling definitief in het product vast te leggen.
                      </div>
                    </div>
                  </div>
                  {canEdit && onSave && (
                    <button
                      type="button"
                      onClick={handleSaveClick}
                      disabled={isSaving || saving}
                      style={{
                        padding: '0.4rem 0.95rem',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: '#d97706',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: (isSaving || saving) ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: '0 2px 6px rgba(217,119,6,0.25)',
                      }}
                    >
                      {(isSaving || saving) ? <><EmpcoSpinner size={12} color="white" /> Opslaan…</> : '💾 Nu Opslaan'}
                    </button>
                  )}
                </div>
              )}

              {appliedCount > 0 && (
                <div style={{ margin: '0.9rem 1.4rem 0', padding: '0.75rem 1rem', borderRadius: '10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <div style={{ fontWeight: 700, color: '#1e40af' }}>
                        ✏️ {appliedCount} voorstel{appliedCount === 1 ? '' : 'len'} overgenomen in het formulier
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#3b82f6', marginTop: '0.15rem' }}>
                        Controleer de tekst en sla direct op. De vorige tekst blijft altijd terug te zien via <button type="button" onClick={onOpenHistory} style={{ background: 'none', border: 'none', color: '#1d4ed8', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit', fontWeight: 600 }}>🕘 Historie</button>.
                      </div>
                    </div>
                    {canEdit && onSave && (
                      <button
                        type="button"
                        onClick={handleSaveClick}
                        disabled={isSaving || saving}
                        style={{
                          padding: '0.45rem 1.15rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#2563eb',
                          color: 'white',
                          fontWeight: 700,
                          fontSize: '0.82rem',
                          cursor: (isSaving || saving) ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                          flexShrink: 0,
                        }}
                      >
                        {(isSaving || saving) ? (
                          <>
                            <EmpcoSpinner size={13} />
                            <span>Opslaan…</span>
                          </>
                        ) : (
                          <>
                            <span>💾</span>
                            <span>Nu Opslaan</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {brandId && appliedCount > 0 && (() => {
                    const appliedItems: PropagationItem[] = (result.issues ?? [])
                      .map((issue: EmpcoIssue, idx: number) => ({ issue, idx }))
                      .filter((pair: { issue: EmpcoIssue; idx: number }) => applied[pair.idx] === 'ok')
                      .map((pair: { issue: EmpcoIssue; idx: number }) => ({
                        original: pair.issue.original,
                        replacement: pair.issue.replacement,
                        rule: pair.issue.rule,
                        fieldLabel: pair.issue.fieldLabel || pair.issue.field,
                        fieldKey: pair.issue.field,
                      }));

                    if (appliedItems.length === 0) return null;

                    return (
                      <div style={{ marginTop: '0.55rem', paddingTop: '0.5rem', borderTop: '1px dashed #bfdbfe', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: '#0f766e', fontWeight: 600 }}>
                          🏷️ Merk &quot;{brandName || 'dit merk'}&quot;:
                        </span>
                        <button
                          type="button"
                          onClick={() => setPropagationItems(appliedItems)}
                          style={{
                            padding: '0.22rem 0.65rem',
                            borderRadius: '5px',
                            border: '1px solid #0f766e',
                            backgroundColor: '#f0fdfa',
                            color: '#0f766e',
                            fontWeight: 700,
                            fontSize: '0.73rem',
                            cursor: 'pointer',
                          }}
                        >
                          {appliedItems.length > 1
                            ? `Zoek andere ${brandName ? `${brandName}-` : ''}producten met alle ${appliedItems.length} aangepaste fragmenten`
                            : `Zoek andere ${brandName ? `${brandName}-` : ''}producten met dit fragment`}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {!canEdit && (result.issues?.length ?? 0) > 0 && (
                <div style={{ margin: '0.9rem 1.4rem 0', padding: '0.6rem 0.9rem', borderRadius: '9px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.8rem' }}>
                  🔒 Dit product is vergrendeld; voorstellen kunnen niet worden overgenomen.
                </div>
              )}

              <EmpcoResultView
                result={result}
                stale={stale}
                fieldValues={liveValues}
                guidelines={guidelines}
                renderIssueActions={(issue, idx) => {
                  if (!isFixable(issue)) return null;
                  const st = applied[idx];
                  if (st === 'ok') {
                    return (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803d' }}>✓ Overgenomen</span>
                        {brandId && (
                          <button
                            type="button"
                            onClick={() => setPropagationItems([{
                              original: issue.original,
                              replacement: issue.replacement,
                              rule: issue.rule,
                              fieldLabel: issue.fieldLabel || issue.field,
                              fieldKey: issue.field,
                            }])}
                            title={`Controleer of andere producten van ${brandName || 'dit merk'} dit fragment ook bevatten`}
                            style={{
                              padding: '0.18rem 0.55rem',
                              borderRadius: '5px',
                              border: '1px solid #0f766e',
                              backgroundColor: '#f0fdfa',
                              color: '#0f766e',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            🏷️ Pas toe op merkgenoten
                          </button>
                        )}
                      </span>
                    );
                  }
                  return (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {st && <span style={{ fontSize: '0.7rem', color: '#b91c1c' }}>{st}</span>}
                      <button type="button" onClick={() => doApply(issue, idx)}
                        style={{ padding: '0.25rem 0.7rem', borderRadius: '6px', border: `1px solid ${EMPCO_ACCENT}`, backgroundColor: 'white', color: EMPCO_ACCENT, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>
                        ✓ Overnemen
                      </button>
                    </span>
                  );
                }}
              />
            </div>
          )}
        </EmpcoModalShell>
      )}

      {showGuidelines && (
        <EmpcoGuidelinesModal
          isOpen={showGuidelines}
          onClose={() => setShowGuidelines(false)}
          initialGuidelines={guidelines}
        />
      )}

      {propagationItems && propagationItems.length > 0 && brandId && (
        <BrandPropagationModal
          brandId={brandId}
          brandName={brandName}
          sourceArticleNumber={articleNumber}
          items={propagationItems}
          onSaveCurrentProduct={appliedCount > 0 && onSave ? handleSaveClick : undefined}
          onClose={() => setPropagationItems(null)}
          onApplied={(count) => {
            setPropagationItems(null);
            if (count > 0 || appliedCount > 0) {
              setJustSaved(true);
            }
            load().then(() => setLiveValues(getLiveValues()));
          }}
        />
      )}
    </>
  );
}
