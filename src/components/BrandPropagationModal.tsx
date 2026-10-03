'use client';

import React, { useEffect, useState } from 'react';
import {
  findBrandMatchingProductsAction,
  applyBrandEmpcoFixAction,
  ApplyBrandFixResult,
} from '@/app/actions/brandEmpco';
import { BrandProductMatch } from '@/lib/brandEmpco';
import { EmpcoModalShell, EmpcoSpinner, EMPCO_ACCENT } from './EmpcoCheck';

interface Props {
  brandId: string;
  brandName?: string;
  sourceArticleNumber: string;
  original: string;
  replacement: string;
  rule?: string;
  onClose: () => void;
  onApplied?: (count: number) => void;
}

export default function BrandPropagationModal({
  brandId,
  brandName,
  sourceArticleNumber,
  original,
  replacement,
  rule,
  onClose,
  onApplied,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [matches, setMatches] = useState<BrandProductMatch[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ApplyBrandFixResult[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    findBrandMatchingProductsAction({
      brandId,
      original,
      replacement,
      excludeArticleNumber: sourceArticleNumber,
    })
      .then(res => {
        if (!alive) return;
        setMatches(res);
        // Default select all unlocked matches
        const initialSel = new Set<string>();
        res.forEach(m => {
          if (!m.locked) initialSel.add(m.articleNumber);
        });
        setSelectedIds(initialSel);
      })
      .catch(e => {
        if (alive) setError(e?.message ?? 'Fout bij zoeken naar merkproducten');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [brandId, original, replacement, sourceArticleNumber]);

  const toggleSelect = (art: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(art)) next.delete(art);
      else next.add(art);
      return next;
    });
  };

  const handleApply = async () => {
    const targets = matches
      .filter(m => selectedIds.has(m.articleNumber))
      .map(m => ({ articleNumber: m.articleNumber, fieldKey: m.fieldKey }));

    if (targets.length === 0) return;

    setApplying(true);
    setError('');
    try {
      const res = await applyBrandEmpcoFixAction({
        brandId,
        original,
        replacement,
        targets,
        rule,
        sourceArticle: sourceArticleNumber,
      });
      setResults(res);
      const successCount = res.filter(r => r.applied).length;
      onApplied?.(successCount);
    } catch (e: any) {
      setError(e?.message ?? 'Fout bij toepassen van merkaanpassingen');
    } finally {
      setApplying(false);
    }
  };

  return (
    <EmpcoModalShell
      title={`🏷️ Merkaanpassing: ${brandName || 'Hetzelfde merk'}`}
      subtitle={`Fragment: "${original}" → "${replacement || '(verwijderen)'}"`}
      onClose={applying ? () => {} : onClose}
      width={840}
      zIndex={9150}
    >
      <div style={{ padding: '1.25rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {loading ? (
          <div style={{ padding: '2.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', color: EMPCO_ACCENT }}>
            <EmpcoSpinner size={18} /> Zoeken naar andere producten van {brandName || 'dit merk'} met ditzelfde fragment…
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem' }}>
            ❌ {error}
          </div>
        ) : results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', fontSize: '0.9rem', fontWeight: 600 }}>
              ✓ Merkaanpassing succesvol doorgevoerd op {results.filter(r => r.applied).length} product(en) van {brandName || 'dit merk'}!
            </div>
            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {results.map(r => (
                <div key={r.articleNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.8rem', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>#{r.articleNumber}</span>
                  {r.applied ? (
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Aangepast & EmpCo-status bijgewerkt</span>
                  ) : (
                    <span style={{ color: '#dc2626' }}>✕ {r.error || 'Niet gelukt'}</span>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '0.5rem 1.4rem', borderRadius: '8px', border: 'none', backgroundColor: EMPCO_ACCENT, color: 'white', fontWeight: 700, cursor: 'pointer' }}
              >
                Sluiten
              </button>
            </div>
          </div>
        ) : matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Geen andere merkproducten met dit fragment</div>
            <div style={{ fontSize: '0.82rem' }}>Er zijn geen andere producten van {brandName || 'dit merk'} gevonden waarin de tekst <em>&quot;{original}&quot;</em> letterlijk voorkomt.</div>
            <div style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '0.45rem 1.2rem', borderRadius: '7px', border: '1px solid #cbd5e1', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Sluiten
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '0.85rem 1.1rem', fontSize: '0.85rem', color: '#115e59' }}>
              💡 <strong>Geleerde merkaanpassing:</strong> er zijn <strong>{matches.length}</strong> andere producten van <strong>{brandName || 'dit merk'}</strong> gevonden met ditzelfde tekstfragment.
              Controleer hieronder welke producten je direct mee wilt nemen:
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#64748b' }}>
              <span>{selectedIds.size} van de {matches.length} producten geselecteerd</span>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(matches.filter(m => !m.locked).map(m => m.articleNumber)))}
                  style={{ background: 'none', border: 'none', color: EMPCO_ACCENT, cursor: 'pointer', fontWeight: 600 }}
                >
                  Alles selecteren
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  Geen
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {matches.map(m => {
                const isSelected = selectedIds.has(m.articleNumber);
                return (
                  <label
                    key={m.articleNumber}
                    style={{
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      border: `1.5px solid ${isSelected ? EMPCO_ACCENT : '#e2e8f0'}`,
                      backgroundColor: isSelected ? '#f0fdfa' : 'white',
                      cursor: m.locked ? 'not-allowed' : 'pointer',
                      opacity: m.locked ? 0.6 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={m.locked}
                      onChange={() => toggleSelect(m.articleNumber)}
                      style={{ accentColor: EMPCO_ACCENT, marginTop: '0.2rem' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: '#0f766e' }}>
                          #{m.articleNumber}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.title}
                        </span>
                        <span style={{ fontSize: '0.72rem', backgroundColor: '#e2e8f0', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                          {m.fieldLabel}
                        </span>
                        {m.locked && (
                          <span style={{ fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            🔒 Vergrendeld (Webshop Ready)
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.8rem', lineHeight: 1.4, color: '#334155' }}>
                        <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', textDecoration: 'line-through', padding: '0 0.25rem', borderRadius: '3px' }}>
                          {original}
                        </span>
                        <span style={{ margin: '0 0.4rem', color: '#94a3b8' }}>→</span>
                        {replacement ? (
                          <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0 0.25rem', borderRadius: '3px', fontWeight: 600 }}>
                            {replacement}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                            (fragment verwijderen)
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '0.9rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Vorige waarden blijven bewaard in de Historie. EmpCo alarmering wordt direct gesynchroniseerd.
              </span>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ padding: '0.45rem 1rem', borderRadius: '7px', border: '1px solid #cbd5e1', backgroundColor: 'white', color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Niet nu
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={selectedIds.size === 0 || applying}
                  style={{
                    padding: '0.45rem 1.3rem',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: EMPCO_ACCENT,
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: selectedIds.size === 0 || applying ? 'not-allowed' : 'pointer',
                    opacity: selectedIds.size === 0 || applying ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {applying ? (
                    <><EmpcoSpinner size={14} color="white" /> Bezig met doorvoeren…</>
                  ) : (
                    `✍️ Pas toe op ${selectedIds.size} product${selectedIds.size === 1 ? '' : 'en'}`
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </EmpcoModalShell>
  );
}
