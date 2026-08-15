'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number';
}

const ENRICH_FIELDS: FieldConfig[] = [
  { key: 'shortDescription',    label: 'Korte omschrijving',        type: 'textarea' },
  { key: 'longDescription',     label: 'Lange omschrijving',         type: 'textarea' },
  { key: 'weightGr',            label: 'Gewicht (gr)',               type: 'number' },
  { key: 'lengthCm',            label: 'Lengte (cm)',                type: 'number' },
  { key: 'widthCm',             label: 'Breedte (cm)',               type: 'number' },
  { key: 'heightCm',            label: 'Hoogte (cm)',                type: 'number' },
  { key: 'volumeMl',            label: 'Inhoud (ml)',                type: 'number' },
  { key: 'volumeGr',            label: 'Inhoud (gr)',                type: 'number' },
  { key: 'mainMaterial',        label: 'Hoofdmateriaal',             type: 'text' },
  { key: 'material',            label: 'Materiaal',                  type: 'text' },
  { key: 'color',               label: 'Kleur',                      type: 'text' },
  { key: 'ingredients',         label: 'Ingrediënten',               type: 'textarea' },
  { key: 'allergens',           label: 'Allergenen',                 type: 'textarea' },
  { key: 'tags',                label: 'Tags',                       type: 'text' },
  { key: 'seoTitle',            label: 'SEO Titel',                  type: 'text' },
  { key: 'seoMetaDescription',  label: 'SEO Meta Omschrijving',      type: 'textarea' },
];

interface Props {
  product: any;
  isOpen: boolean;
  onClose: () => void;
  onApplyFields: (fields: Record<string, string>) => void;
}

export default function ProductWebEnrichModal({ product, isOpen, onClose, onApplyFields }: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'input' | 'results'>('input');

  // Search parameters
  const [searchTitle, setSearchTitle] = useState('');
  const [searchBrand, setSearchBrand] = useState('');
  const [searchEan, setSearchEan] = useState('');
  const [searchPrice, setSearchPrice] = useState('');
  const [customUrl, setCustomUrl] = useState('');

  // LLM Provider
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('openai');

  // Enriched results
  const [enrichedData, setEnrichedData] = useState<Record<string, any> | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});

  useEffect(() => { setMounted(true); }, []);

  // Initialize data when modal opens
  useEffect(() => {
    if (isOpen && product) {
      setSearchTitle(product.title || '');
      setSearchBrand(product.brand?.name || (typeof product.brand === 'string' ? product.brand : ''));
      setSearchEan(product.ean || '');
      setSearchPrice(product.basePrice != null ? String(product.basePrice) : '');
      setCustomUrl('');
      setError('');
      setStep('input');
      setEnrichedData(null);
      setSources([]);
      setSummary('');

      // Load active providers
      fetch('/api/ai/providers')
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          const active = (data || []).filter((p: any) => p.hasApiKey);
          setProviders(active);
          if (active.length > 0) {
            try {
              const saved = JSON.parse(localStorage.getItem('ai_panel_prefs_v1') || '{}');
              if (saved.provider && active.some((p: any) => p.provider === saved.provider)) {
                setSelectedProvider(saved.provider);
              } else {
                setSelectedProvider(active[0].provider);
              }
            } catch {
              setSelectedProvider(active[0].provider);
            }
          }
        })
        .catch(() => { /**/ });
    }
  }, [isOpen, product]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/web-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleNumber: product?.internalArticleNumber,
          title: searchTitle,
          brand: searchBrand,
          ean: searchEan,
          price: searchPrice,
          customUrl: customUrl.trim() || undefined,
          provider: selectedProvider,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Fout bij het ophalen van webgegevens.');
      } else if (json.data) {
        const data = json.data;
        setEnrichedData(data);
        setSources(json.sources || []);
        setSummary(data.summary || '');

        // Pre-select fields that have non-empty suggested values
        const initialSelected: Record<string, boolean> = {};
        ENRICH_FIELDS.forEach(f => {
          const val = data[f.key];
          if (val != null && val !== '') {
            initialSelected[f.key] = true;
          }
        });
        setSelectedFields(initialSelected);
        setStep('results');
      } else {
        setError('Geen bruikbare gegevens geretourneerd.');
      }
    } catch {
      setError('Verbindingsfout bij communicatie met de server.');
    }
    setLoading(false);
  };

  const toggleField = (key: string) => {
    setSelectedFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAll = () => {
    const all: Record<string, boolean> = {};
    ENRICH_FIELDS.forEach(f => {
      if (enrichedData?.[f.key] != null && enrichedData[f.key] !== '') {
        all[f.key] = true;
      }
    });
    setSelectedFields(all);
  };

  const selectNone = () => {
    setSelectedFields({});
  };

  const handleApply = () => {
    if (!enrichedData) return;
    const fieldsToApply: Record<string, string> = {};

    Object.entries(selectedFields).forEach(([key, isSelected]) => {
      if (isSelected && enrichedData[key] != null && enrichedData[key] !== '') {
        fieldsToApply[key] = String(enrichedData[key]);
      }
    });

    onApplyFields(fieldsToApply);
    onClose();
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,10,35,0.6)', backdropFilter: 'blur(3px)' }}
      />

      {/* Modal Dialog */}
      <div
        className="glass"
        style={{
          position: 'relative',
          width: '90vw',
          maxWidth: '850px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          border: '1.5px solid #c4b5fd',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 10000,
          animation: 'enrich-modal-pop 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.4rem',
          background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🌐</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                Online Product Verrijking (Auto-Fill)
              </h2>
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.85 }}>
                Zoek online productinformatie en vul automatisch omschrijvingen & fysieke kenmerken in
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)',
              fontSize: '1.2rem', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.4rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              padding: '0.75rem 1rem', borderRadius: '8px',
              backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              color: '#dc2626', fontSize: '0.85rem', marginBottom: '1.2rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {step === 'input' && (
            <div>
              <p style={{ fontSize: '0.88rem', color: '#4b5563', marginTop: 0, marginBottom: '1.2rem', lineHeight: 1.5 }}>
                Het systeem doorzoekt openbare productdatabases (zoals Open Food Facts), zoekresultaten en webpagina's om relevante specificaties voor dit product te vinden.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.2rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    Product Titel / Omschrijving *
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={searchTitle}
                    onChange={e => setSearchTitle(e.target.value)}
                    placeholder="bijv. Mun - Kombucha Groene Thee 500 ml"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    Merk
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={searchBrand}
                    onChange={e => setSearchBrand(e.target.value)}
                    placeholder="bijv. Mun Drinks"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    EAN / Streepjescode
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={searchEan}
                    onChange={e => setSearchEan(e.target.value)}
                    placeholder="bijv. 8437017259756"
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    AI Provider
                  </label>
                  <select
                    className="input"
                    value={selectedProvider}
                    onChange={e => setSelectedProvider(e.target.value)}
                    style={{ width: '100%', fontSize: '0.88rem' }}
                  >
                    {providers.map(p => (
                      <option key={p.provider} value={p.provider}>
                        {p.label || p.provider}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Directe Product URL (Optioneel)
                </label>
                <input
                  type="url"
                  className="input"
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="https://voorbeeld.nl/product/kombucha-500ml (optioneel)"
                  style={{ width: '100%', fontSize: '0.88rem' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', display: 'block' }}>
                  Plak een directe link naar de fabrikant- of leverancierspagina voor de meest accurate informatie.
                </span>
              </div>

              {loading ? (
                <div style={{
                  padding: '2rem', textAlign: 'center', backgroundColor: '#f5f3ff',
                  borderRadius: '12px', border: '1.5px dashed #c4b5fd',
                }}>
                  <div style={{
                    display: 'inline-block', width: '32px', height: '32px',
                    border: '3px solid #ddd6fe', borderTopColor: '#7c3aed',
                    borderRadius: '50%', animation: 'ai-enrich-spin 1s linear infinite',
                    marginBottom: '0.8rem',
                  }} />
                  <div style={{ fontWeight: 600, color: '#7c3aed', fontSize: '0.95rem' }}>
                    Online gegevens ophalen & analyseren...
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.3rem' }}>
                    Webzoekopdracht uitvoeren, EAN verifiëren en productvelden extraheren
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '0.55rem 1.1rem', borderRadius: '8px',
                      backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                      fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                    }}
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={handleFetch}
                    disabled={!searchTitle && !searchEan && !customUrl}
                    style={{
                      padding: '0.55rem 1.3rem', borderRadius: '8px',
                      background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                      color: 'white', border: 'none',
                      fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
                    }}
                  >
                    🚀 Zoeken & Gegevens Ophalen
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'results' && enrichedData && (
            <div>
              {/* Summary / Sources Box */}
              <div style={{
                padding: '0.85rem 1rem', borderRadius: '10px',
                backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe',
                marginBottom: '1.2rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '1rem' }}>✨</span>
                  <span style={{ fontWeight: 700, color: '#6d28d9', fontSize: '0.85rem' }}>
                    Online Resultaten & Bronnen
                  </span>
                </div>
                {summary && (
                  <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', color: '#374151', lineHeight: 1.45 }}>
                    {summary}
                  </p>
                )}
                {sources.length > 0 && (
                  <div style={{ fontSize: '0.74rem', color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600 }}>Geraadpleegde bronnen:</span>
                    {sources.slice(0, 3).map((s, idx) => (
                      <span key={idx} style={{ backgroundColor: 'white', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                        {s.startsWith('http') ? new URL(s).hostname : s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action bar for selections */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                  Selecteer de velden die je wilt overnemen in het product:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={selectAll}
                    style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Selecteer alles
                  </button>
                  <span style={{ color: '#d1d5db' }}>|</span>
                  <button
                    type="button"
                    onClick={selectNone}
                    style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Deselecteer alles
                  </button>
                </div>
              </div>

              {/* Diff / Table View */}
              <div style={{
                borderRadius: '10px', border: '1px solid #e5e7eb',
                overflow: 'hidden', marginBottom: '1.2rem',
                backgroundColor: 'white',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                      <th style={{ padding: '0.55rem 0.75rem', width: '40px' }}>✓</th>
                      <th style={{ padding: '0.55rem 0.75rem', width: '160px' }}>Veld</th>
                      <th style={{ padding: '0.55rem 0.75rem', width: '35%' }}>Huidige Waarde</th>
                      <th style={{ padding: '0.55rem 0.75rem' }}>Gevonden Waarde (Online)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENRICH_FIELDS.map(f => {
                      const currentVal = product?.[f.key] != null && product[f.key] !== '' ? String(product[f.key]) : null;
                      const newVal = enrichedData[f.key] != null && enrichedData[f.key] !== '' ? String(enrichedData[f.key]) : null;
                      const hasNewVal = newVal !== null;
                      const isSelected = !!selectedFields[f.key];

                      return (
                        <tr
                          key={f.key}
                          onClick={() => hasNewVal && toggleField(f.key)}
                          style={{
                            borderBottom: '1px solid #f3f4f6',
                            backgroundColor: isSelected ? '#f5f3ff' : hasNewVal ? 'white' : '#fcfcfc',
                            cursor: hasNewVal ? 'pointer' : 'default',
                            transition: 'background-color 0.15s',
                          }}
                        >
                          <td style={{ padding: '0.55rem 0.75rem', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!hasNewVal}
                              onChange={() => toggleField(f.key)}
                              onClick={e => e.stopPropagation()}
                              style={{ cursor: hasNewVal ? 'pointer' : 'default', accentColor: '#7c3aed' }}
                            />
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', fontWeight: 600, color: '#374151' }}>
                            {f.label}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', color: currentVal ? '#4b5563' : '#9ca3af', fontStyle: currentVal ? 'normal' : 'italic', wordBreak: 'break-word' }}>
                            {currentVal ? (currentVal.length > 80 ? currentVal.slice(0, 80) + '…' : currentVal) : 'Leeg'}
                          </td>
                          <td style={{ padding: '0.55rem 0.75rem', color: hasNewVal ? '#15803d' : '#9ca3af', fontWeight: hasNewVal ? 500 : 400, wordBreak: 'break-word' }}>
                            {hasNewVal ? (
                              <span style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.15rem 0.45rem', borderRadius: '4px', display: 'inline-block' }}>
                                {newVal.length > 100 ? newVal.slice(0, 100) + '…' : newVal}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Niet gevonden</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  style={{
                    padding: '0.55rem 1rem', borderRadius: '8px',
                    backgroundColor: 'white', color: '#7c3aed', border: '1px solid #ddd6fe',
                    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                  }}
                >
                  ← Terug naar Zoekopdracht
                </button>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      padding: '0.55rem 1rem', borderRadius: '8px',
                      backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb',
                      fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                    }}
                  >
                    Annuleren
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={Object.values(selectedFields).filter(Boolean).length === 0}
                    style={{
                      padding: '0.55rem 1.3rem', borderRadius: '8px',
                      backgroundColor: '#16a34a', color: 'white', border: 'none',
                      fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                    }}
                  >
                    ✓ Geselecteerde Velden Toepassen ({Object.values(selectedFields).filter(Boolean).length})
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes enrich-modal-pop {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes ai-enrich-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
