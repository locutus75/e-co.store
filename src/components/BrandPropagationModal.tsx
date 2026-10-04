'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  findBrandMatchingProductsAction,
  applyBrandEmpcoBatchFixAction,
  ApplyBrandBatchResult,
  BrandFixBatchItem,
} from '@/app/actions/brandEmpco';
import { BrandProductMatch } from '@/lib/brandEmpco';
import { EmpcoModalShell, EmpcoSpinner, EMPCO_ACCENT } from './EmpcoCheck';

export interface PropagationItem {
  original: string;
  replacement: string;
  rule?: string;
  fieldLabel?: string;
  fieldKey?: string;
}

interface Props {
  brandId: string;
  brandName?: string;
  sourceArticleNumber: string;
  items?: PropagationItem[];
  // Backwards compatibility for single item:
  original?: string;
  replacement?: string;
  rule?: string;
  onClose: () => void;
  onApplied?: (count: number) => void;
  onSaveCurrentProduct?: () => Promise<void> | void;
}

interface ItemWithMatches {
  item: PropagationItem;
  itemIndex: number;
  matches: BrandProductMatch[];
}

export default function BrandPropagationModal({
  brandId,
  brandName,
  sourceArticleNumber,
  items,
  original,
  replacement,
  rule,
  onClose,
  onApplied,
  onSaveCurrentProduct,
}: Props) {
  const normalizedItems: PropagationItem[] = useMemo(() => {
    if (items && items.length > 0) return items;
    if (original !== undefined && replacement !== undefined) {
      return [{ original, replacement, rule }];
    }
    return [];
  }, [items, original, replacement, rule]);

  const isMultiFragment = normalizedItems.length > 1;

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [itemsWithMatches, setItemsWithMatches] = useState<ItemWithMatches[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<ApplyBrandBatchResult[] | null>(null);
  const [savedCurrent, setSavedCurrent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');

    if (normalizedItems.length === 0) {
      setLoading(false);
      return;
    }

    Promise.all(
      normalizedItems.map((item, idx) =>
        findBrandMatchingProductsAction({
          brandId,
          original: item.original,
          replacement: item.replacement,
          excludeArticleNumber: sourceArticleNumber,
          fieldKey: item.fieldKey,
        }).then(matches => ({
          item,
          itemIndex: idx,
          matches,
        }))
      )
    )
      .then(res => {
        if (!alive) return;
        setItemsWithMatches(res);

        // Preselect all unlocked matches
        const initialSel = new Set<string>();
        res.forEach(({ itemIndex, matches }) => {
          matches.forEach(m => {
            if (!m.locked) {
              initialSel.add(`${itemIndex}:::${m.articleNumber}`);
            }
          });
        });
        setSelectedKeys(initialSel);
      })
      .catch(e => {
        if (alive) setError(e?.message ?? 'Fout bij zoeken naar merkproducten');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [brandId, normalizedItems, sourceArticleNumber]);

  const toggleSelect = (itemIdx: number, art: string) => {
    const key = `${itemIdx}:::${art}`;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    const next = new Set<string>();
    itemsWithMatches.forEach(({ itemIndex, matches }) => {
      matches.forEach(m => {
        if (!m.locked) next.add(`${itemIndex}:::${m.articleNumber}`);
      });
    });
    setSelectedKeys(next);
  };

  const selectNone = () => {
    setSelectedKeys(new Set());
  };

  const selectItemAll = (itemIdx: number) => {
    const group = itemsWithMatches.find(g => g.itemIndex === itemIdx);
    if (!group) return;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      group.matches.forEach(m => {
        if (!m.locked) next.add(`${itemIdx}:::${m.articleNumber}`);
      });
      return next;
    });
  };

  const selectItemNone = (itemIdx: number) => {
    const group = itemsWithMatches.find(g => g.itemIndex === itemIdx);
    if (!group) return;
    setSelectedKeys(prev => {
      const next = new Set(prev);
      group.matches.forEach(m => {
        next.delete(`${itemIdx}:::${m.articleNumber}`);
      });
      return next;
    });
  };

  const handleApply = async () => {
    const batchItems: BrandFixBatchItem[] = [];

    for (const { item, itemIndex, matches } of itemsWithMatches) {
      const targets = matches
        .filter(m => selectedKeys.has(`${itemIndex}:::${m.articleNumber}`))
        .map(m => ({ articleNumber: m.articleNumber, fieldKey: m.fieldKey }));

      if (targets.length > 0) {
        batchItems.push({
          original: item.original,
          replacement: item.replacement,
          rule: item.rule,
          fieldLabel: item.fieldLabel,
          targets,
        });
      }
    }

    if (batchItems.length === 0) return;

    setApplying(true);
    setError('');
    try {
      if (onSaveCurrentProduct) {
        try {
          await onSaveCurrentProduct();
          setSavedCurrent(true);
        } catch (saveErr) {
          console.warn('Could not auto-save current product:', saveErr);
        }
      }

      const res = await applyBrandEmpcoBatchFixAction({
        brandId,
        items: batchItems,
        sourceArticle: sourceArticleNumber,
      });
      setResults(res);
    } catch (e: any) {
      setError(e?.message ?? 'Fout bij toepassen van merkaanpassingen');
    } finally {
      setApplying(false);
    }
  };

  const handleCloseResults = () => {
    const successCount = results?.filter(r => r.applied).length ?? 0;
    onApplied?.(successCount);
    onClose();
  };

  const totalMatches = itemsWithMatches.reduce((acc, it) => acc + it.matches.length, 0);
  const totalUniqueMatchingProducts = new Set(itemsWithMatches.flatMap(it => it.matches.map(m => m.articleNumber))).size;
  const selectedCount = selectedKeys.size;

  const modalTitle = isMultiFragment
    ? `🏷️ Merkaanpassingen (${normalizedItems.length} fragmenten): ${brandName || 'Hetzelfde merk'}`
    : `🏷️ Merkaanpassing: ${brandName || 'Hetzelfde merk'}`;

  const modalSubtitle = isMultiFragment
    ? `${normalizedItems.length} aangepaste fragmenten tegelijk controleren bij andere ${brandName || 'merk'}-producten`
    : `Fragment: "${normalizedItems[0]?.original ?? ''}" → "${normalizedItems[0]?.replacement || '(verwijderen)'}"`;

  return (
    <EmpcoModalShell
      title={modalTitle}
      subtitle={modalSubtitle}
      onClose={applying ? () => {} : (results ? handleCloseResults : onClose)}
      width={isMultiFragment ? 900 : 840}
      zIndex={9150}
    >
      <div style={{ padding: '1.25rem 1.6rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '82vh', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '2.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.6rem', color: EMPCO_ACCENT }}>
            <EmpcoSpinner size={18} /> Zoeken naar andere producten van {brandName || 'dit merk'} met {isMultiFragment ? `deze ${normalizedItems.length} aangepaste fragmenten` : 'ditzelfde fragment'}…
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#dc2626', fontSize: '0.85rem' }}>
            ❌ {error}
          </div>
        ) : results ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', color: '#166534', fontSize: '0.9rem', fontWeight: 600 }}>
              <div>
                ✓ Merkaanpassingen succesvol doorgevoerd! ({results.filter(r => r.applied).length} van de {results.length} aanpassing(en) toegepast bij {brandName || 'dit merk'})
              </div>
              {savedCurrent && sourceArticleNumber && (
                <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#15803d', marginTop: '0.35rem' }}>
                  ✓ Ook het huidige geopende product (#{sourceArticleNumber}) is direct opgeslagen in de database en historie!
                </div>
              )}
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {results.map((r, i) => (
                <div key={`${r.articleNumber}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.8rem', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f766e' }}>#{r.articleNumber}</span>
                    <span style={{ fontSize: '0.78rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      &quot;{r.original.length > 50 ? `${r.original.slice(0, 50)}…` : r.original}&quot;
                    </span>
                  </div>
                  <div>
                    {r.applied ? (
                      <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.78rem' }}>✓ Aangepast &amp; Historie vastgelegd</span>
                    ) : (
                      <span style={{ color: '#dc2626', fontSize: '0.78rem' }}>✕ {r.error || 'Niet gelukt'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleCloseResults}
                style={{ padding: '0.55rem 1.6rem', borderRadius: '8px', border: 'none', backgroundColor: EMPCO_ACCENT, color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                ✓ Sluiten &amp; Terug naar product
              </button>
            </div>
          </div>
        ) : totalMatches === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: '0.35rem', fontSize: '1rem' }}>
              Geen andere merkproducten met {isMultiFragment ? 'deze fragmenten' : 'dit fragment'}
            </div>
            <div style={{ fontSize: '0.82rem', maxWidth: '600px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
              Er zijn geen andere producten van <strong>{brandName || 'dit merk'}</strong> gevonden waarin{' '}
              {isMultiFragment ? (
                <>een van de <strong>{normalizedItems.length}</strong> aangepaste tekstfragmenten letterlijk voorkomt.</>
              ) : (
                <>de tekst <em>&quot;{normalizedItems[0]?.original}&quot;</em> letterlijk voorkomt.</>
              )}
            </div>

            {isMultiFragment && (
              <div style={{ textAlign: 'left', maxWidth: '680px', margin: '0 auto 1.5rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0.8rem 1rem', fontSize: '0.8rem' }}>
                <div style={{ fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>Gecontroleerde fragmenten:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {normalizedItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 700, color: '#64748b' }}>{idx + 1}.</span>
                      <span style={{ color: '#334155', wordBreak: 'break-word' }}>&quot;{item.original}&quot;</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>(0 matches)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: '0.45rem 1.4rem', borderRadius: '7px', border: '1px solid #cbd5e1', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
              >
                Sluiten
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top summary banner */}
            <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '8px', padding: '0.85rem 1.1rem', fontSize: '0.85rem', color: '#115e59' }}>
              💡 <strong>Geleerde merkaanpassing{isMultiFragment ? 'en' : ''}:</strong> er zijn in totaal <strong>{totalMatches}</strong> overeenkomst(en) gevonden verdeeld over <strong>{totalUniqueMatchingProducts}</strong> andere product(en) van <strong>{brandName || 'dit merk'}</strong>.
              Controleer hieronder welke producten je direct mee wilt nemen:
            </div>

            {/* Selection control bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#64748b' }}>
              <span>
                <strong>{selectedCount}</strong> aanpassing(en) geselecteerd over <strong>{totalUniqueMatchingProducts}</strong> product(en)
              </span>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={selectAll}
                  style={{ background: 'none', border: 'none', color: EMPCO_ACCENT, cursor: 'pointer', fontWeight: 600 }}
                >
                  Alles selecteren
                </button>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <button
                  type="button"
                  onClick={selectNone}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  Geen
                </button>
              </div>
            </div>

            {/* Groups / Fragments listing */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {itemsWithMatches.map(({ item, itemIndex, matches }) => {
                const groupSelectedCount = matches.filter(m => selectedKeys.has(`${itemIndex}:::${m.articleNumber}`)).length;

                return (
                  <div
                    key={itemIndex}
                    style={{
                      border: matches.length > 0 ? '1px solid #cbd5e1' : '1px dashed #e2e8f0',
                      borderRadius: '9px',
                      overflow: 'hidden',
                      backgroundColor: matches.length > 0 ? 'white' : '#f8fafc',
                    }}
                  >
                    {/* Fragment Card Header */}
                    <div
                      style={{
                        padding: '0.65rem 0.9rem',
                        backgroundColor: matches.length > 0 ? '#f1f5f9' : '#f8fafc',
                        borderBottom: matches.length > 0 ? '1px solid #e2e8f0' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {isMultiFragment && (
                          <span style={{ backgroundColor: '#0f766e', color: 'white', fontWeight: 700, fontSize: '0.7rem', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                            Fragment {itemIndex + 1}
                          </span>
                        )}
                        {item.fieldLabel && (
                          <span style={{ fontSize: '0.72rem', backgroundColor: '#e2e8f0', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                            {item.fieldLabel}
                          </span>
                        )}
                        {item.rule && (
                          <span style={{ fontSize: '0.72rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            {item.rule}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: matches.length > 0 ? '#0f766e' : '#64748b' }}>
                          {matches.length === 0
                            ? '0 andere merkproducten met dit fragment'
                            : `${matches.length} product(en) gevonden`}
                        </span>
                      </div>

                      {matches.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.72rem' }}>
                          <button
                            type="button"
                            onClick={() => selectItemAll(itemIndex)}
                            style={{ background: 'none', border: 'none', color: EMPCO_ACCENT, cursor: 'pointer', fontWeight: 600 }}
                          >
                            Alles ({matches.length})
                          </button>
                          <span style={{ color: '#cbd5e1' }}>|</span>
                          <button
                            type="button"
                            onClick={() => selectItemNone(itemIndex)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                          >
                            Geen
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Fragment Diff preview */}
                    <div style={{ padding: '0.55rem 0.9rem', fontSize: '0.78rem', lineHeight: 1.45, backgroundColor: 'white', borderBottom: matches.length > 0 ? '1px solid #f1f5f9' : 'none' }}>
                      <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', textDecoration: 'line-through', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>
                        {item.original}
                      </span>
                      <span style={{ margin: '0 0.4rem', color: '#94a3b8' }}>→</span>
                      {item.replacement ? (
                        <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 600 }}>
                          {item.replacement}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                          (fragment verwijderen)
                        </span>
                      )}
                    </div>

                    {/* Match items list */}
                    {matches.length === 0 ? (
                      <div style={{ padding: '0.6rem 0.9rem', fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        ℹ️ Dit specifieke fragment komt niet letterlijk voor in andere producten van {brandName || 'dit merk'}.
                      </div>
                    ) : (
                      <div style={{ padding: '0.6rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', backgroundColor: '#fcfcfc' }}>
                        {matches.map(m => {
                          const key = `${itemIndex}:::${m.articleNumber}`;
                          const isSelected = selectedKeys.has(key);

                          return (
                            <label
                              key={key}
                              style={{
                                display: 'flex',
                                gap: '0.65rem',
                                alignItems: 'flex-start',
                                padding: '0.55rem 0.8rem',
                                borderRadius: '7px',
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
                                onChange={() => toggleSelect(itemIndex, m.articleNumber)}
                                style={{ accentColor: EMPCO_ACCENT, marginTop: '0.2rem', width: '16px', height: '16px', cursor: m.locked ? 'not-allowed' : 'pointer' }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: '#0f766e' }}>
                                    #{m.articleNumber}
                                  </span>
                                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {m.title}
                                  </span>
                                  <span style={{ fontSize: '0.7rem', backgroundColor: '#e2e8f0', color: '#475569', padding: '0.08rem 0.35rem', borderRadius: '4px' }}>
                                    {m.fieldLabel}
                                  </span>
                                  {m.locked && (
                                    <span style={{ fontSize: '0.7rem', backgroundColor: '#fee2e2', color: '#b91c1c', padding: '0.08rem 0.35rem', borderRadius: '4px' }}>
                                      🔒 Vergrendeld (Webshop Ready)
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: '0.75rem', lineHeight: 1.35, color: '#475569' }}>
                                  <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', textDecoration: 'line-through', padding: '0 0.2rem', borderRadius: '2px' }}>
                                    {item.original}
                                  </span>
                                  <span style={{ margin: '0 0.3rem', color: '#94a3b8' }}>→</span>
                                  {item.replacement ? (
                                    <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0 0.2rem', borderRadius: '2px', fontWeight: 600 }}>
                                      {item.replacement}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                                      (verwijderen)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom action bar */}
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
                  disabled={selectedCount === 0 || applying}
                  style={{
                    padding: '0.45rem 1.3rem',
                    borderRadius: '7px',
                    border: 'none',
                    backgroundColor: EMPCO_ACCENT,
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: selectedCount === 0 || applying ? 'not-allowed' : 'pointer',
                    opacity: selectedCount === 0 || applying ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  {applying ? (
                    <><EmpcoSpinner size={14} color="white" /> Bezig met doorvoeren…</>
                  ) : (
                    `✍️ Pas toe op ${selectedCount} geselecteerde aanpassing${selectedCount === 1 ? '' : 'en'}`
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
