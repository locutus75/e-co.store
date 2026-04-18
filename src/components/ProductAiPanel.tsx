'use client';

import React, { useState, useTransition, useEffect } from 'react';
import fs from 'fs';

const PROVIDER_ICONS: Record<string, string> = { openai: '🟢', anthropic: '🟠', gemini: '🔵' };
const PROVIDER_LABELS: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' };

// ── Known product fields with labels ─────────────────────────────────────────
// These are always available regardless of what the layout contains
const KNOWN_FIELDS: { id: string; label: string; path: string }[] = [
  { id: '_title',              label: 'Titel',                  path: 'title' },
  { id: '_shortDescription',  label: 'Korte omschrijving',      path: 'shortDescription' },
  { id: '_longDescription',   label: 'Lange omschrijving',      path: 'longDescription' },
  { id: '_ean',               label: 'EAN Code',               path: 'ean' },
  { id: '_color',             label: 'Kleur',                  path: 'color' },
  { id: '_size',              label: 'Maat',                   path: 'size' },
  { id: '_material',          label: 'Materiaal',              path: 'material' },
  { id: '_mainMaterial',      label: 'Hoofdmateriaal',         path: 'mainMaterial' },
  { id: '_tags',              label: 'Tags',                   path: 'tags' },
  { id: '_ingredients',       label: 'Ingrediënten',           path: 'ingredients' },
  { id: '_allergens',         label: 'Allergenen',             path: 'allergens' },
  { id: '_seoTitle',          label: 'SEO Titel',              path: 'seoTitle' },
  { id: '_seoMetaDescription',label: 'SEO Beschrijving',       path: 'seoMetaDescription' },
  { id: '_basePrice',         label: 'Basisprijs',             path: 'basePrice' },
  { id: '_internalNotes',     label: 'Interne notities',       path: 'internalNotes' },
  { id: '_brand',             label: 'Merk',                   path: 'brand.name' },
  { id: '_supplier',          label: 'Leverancier',            path: 'supplier.name' },
  { id: '_category',          label: 'Categorie',              path: 'category.name' },
  { id: '_subcategory',       label: 'Subcategorie',           path: 'subcategory.name' },
  { id: '_status',            label: 'Status',                 path: 'status' },
  { id: '_readyForImport',    label: 'Gereed voor import',     path: 'readyForImport' },
];

// Special constant IDs
const IMAGES_FIELD_ID = '__images__';

interface FieldEntry { id: string; label: string; value: string; }

interface Props {
  product: any;
  layout: any[];
  isAdmin: boolean;
}

function resolvePath(obj: any, path: string): string | null {
  const val = path.split('.').reduce((o: any, k: string) => o?.[k], obj);
  return val != null && val !== '' ? String(val) : null;
}

// localStorage key for preferences (shared across products — prompt/fields choice)
const PREFS_KEY = 'ai_panel_prefs_v1';

interface Prefs {
  selectedFields: string[];
  customPrompt: string;
  includeImages: boolean;
  provider: string;
}

function loadPrefs(): Prefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePrefs(prefs: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}

const DEFAULT_PROMPT = 'Analyseer dit product en geef een conclusie over de volledigheid van de data, eventuele verbeterpunten en aanbevelingen.';

export default function ProductAiPanel({ product, layout }: Props) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [includeImages, setIncludeImages] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_PROMPT);
  const [response, setResponse] = useState('');
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [imageList, setImageList] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // ── Build field list (deduplicated by property path) ─────────────────────
  // 1. Start with KNOWN_FIELDS — track which paths are already covered
  const fieldMap = new Map<string, FieldEntry>();
  const coveredPaths = new Set<string>(); // e.g. 'title', 'ean', 'brand.name'

  for (const kf of KNOWN_FIELDS) {
    const value = resolvePath(product, kf.path);
    if (value) {
      fieldMap.set(kf.id, { id: kf.id, label: kf.label, value });
      coveredPaths.add(kf.path);
    }
  }

  // 2. Add layout fields — skip if the property is already covered by a KNOWN_FIELD
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (field.type === 'chat' || field.type === 'media') continue;
      if (fieldMap.has(field.id)) continue; // exact ID already present

      let value: string | null = null;
      let propPath: string;

      if (field.relationPath) {
        propPath = field.relationPath;
        value = resolvePath(product, field.relationPath);
      } else {
        const key = field.id.replace('FIELD:', '');
        propPath = key.startsWith('custom_') ? `customData.${key.replace('custom_', '')}` : key;
        if (key.startsWith('custom_')) {
          value = product.customData?.[key.replace('custom_', '')] ?? null;
        } else {
          value = product[key] != null ? String(product[key]) : null;
        }
      }

      // Skip if this property path is already shown via a KNOWN_FIELD
      if (coveredPaths.has(propPath)) continue;

      if (value) {
        fieldMap.set(field.id, { id: field.id, label: field.label, value });
        coveredPaths.add(propPath);
      }
    }
  }

  const allFields = Array.from(fieldMap.values());

  // ── Load prefs from localStorage on first open ────────────────────────────
  const openPanel = async () => {
    setOpen(true);

    // Load prefs once
    if (!prefsLoaded) {
      const prefs = loadPrefs();
      if (prefs) {
        setCustomPrompt(prefs.customPrompt ?? DEFAULT_PROMPT);
        setIncludeImages(prefs.includeImages ?? false);
        // Restore field selection — only keep IDs that exist in this product's field list
        const availableIds = new Set(allFields.map(f => f.id));
        availableIds.add(IMAGES_FIELD_ID);
        const restored = (prefs.selectedFields ?? []).filter((id: string) => availableIds.has(id));
        setSelectedFields(new Set(restored));
        if (prefs.provider) setSelectedProvider(prefs.provider);
      }
      setPrefsLoaded(true);
    }

    // Load providers
    if (!providersLoaded) {
      try {
        const res = await fetch('/api/ai/providers');
        if (res.ok) {
          const data = await res.json();
          const active = data.filter((p: any) => p.hasApiKey);
          setProviders(active);
          if (active.length > 0) {
            setSelectedProvider(prev => prev || active[0].provider);
          }
        }
      } catch { /* ignore */ }
      setProvidersLoaded(true);
    }

    // Try to list product images
    try {
      const res = await fetch(`/api/ai/images?article=${encodeURIComponent(product.internalArticleNumber)}`);
      if (res.ok) {
        const data = await res.json();
        setImageList(data.images ?? []);
      }
    } catch { /* ignore, images optional */ }
  };

  // ── Persist prefs whenever they change ───────────────────────────────────
  useEffect(() => {
    if (!open) return;
    savePrefs({
      selectedFields: Array.from(selectedFields),
      customPrompt,
      includeImages,
      provider: selectedProvider,
    });
  }, [selectedFields, customPrompt, includeImages, selectedProvider, open]);

  const toggleField = (id: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = allFields.map(f => f.id);
    setSelectedFields(new Set(ids));
  };
  const selectNone = () => setSelectedFields(new Set());

  const buildPrompt = () => {
    const lines: string[] = [];
    for (const field of allFields) {
      if (selectedFields.has(field.id)) {
        lines.push(`${field.label}: ${field.value}`);
      }
    }
    if (includeImages && imageList.length > 0) {
      lines.push(`Foto's: ${imageList.length} afbeelding(en) beschikbaar`);
      imageList.forEach((img, i) => lines.push(`  Foto ${i + 1}: ${window.location.origin}${img}`));
    }
    const context = lines.length > 0 ? `\n\n--- Productgegevens ---\n${lines.join('\n')}` : '';
    return customPrompt + context;
  };

  const totalSelected = selectedFields.size + (includeImages && imageList.length > 0 ? 1 : 0);

  const runAnalysis = () => {
    if (!selectedProvider || isPending) return;
    setError('');
    setResponse('');
    setUsage(null);

    const prompt = buildPrompt();
    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: selectedProvider,
            prompt,
            systemPrompt: 'Je bent een product content specialist. Geef een heldere, gestructureerde analyse in het Nederlands.',
            context: 'product-analysis',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Onbekende fout');
        } else {
          setResponse(data.response);
          setUsage(data.usage);
        }
      } catch (e: any) {
        setError('Netwerkfout: ' + e.message);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.4rem 0.85rem', borderRadius: 'var(--radius)',
          border: '1px solid #c4b5fd', backgroundColor: '#f5f3ff',
          color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem',
          cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ede9fe'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f3ff'; }}
      >
        🤖 Analyseer
      </button>
    );
  }

  return (
    <div style={{
      borderRadius: 'var(--radius-lg)', border: '1.5px solid #c4b5fd',
      backgroundColor: '#faf5ff', overflow: 'hidden', marginTop: '1rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.85rem 1.25rem', backgroundColor: '#7c3aed', color: 'white',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🤖 AI Productanalyse</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {providers.length === 0 && !isPending && (
          <p style={{ color: '#7c3aed', fontSize: '0.85rem', opacity: 0.8 }}>
            ⚙️ Geen AI providers beschikbaar. Configureer een API key in Systeeminstellingen.
          </p>
        )}

        {providers.length > 0 && (
          <>
            {/* Provider select */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {providers.map(p => (
                <button
                  key={p.provider}
                  type="button"
                  onClick={() => setSelectedProvider(p.provider)}
                  style={{
                    padding: '0.35rem 0.75rem', borderRadius: 'var(--radius)',
                    border: selectedProvider === p.provider ? '1.5px solid #7c3aed' : '1px solid #ddd6fe',
                    backgroundColor: selectedProvider === p.provider ? '#ede9fe' : 'white',
                    fontWeight: selectedProvider === p.provider ? 700 : 400,
                    fontSize: '0.8rem', cursor: 'pointer', color: '#4c1d95',
                  }}
                >
                  {PROVIDER_ICONS[p.provider]} {PROVIDER_LABELS[p.provider]}
                </button>
              ))}
            </div>

            {/* Field picker */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5b21b6' }}>
                  Velden meesturen als context
                  {totalSelected > 0 && <span style={{ fontWeight: 400, color: '#7c3aed', marginLeft: '0.4rem' }}>({totalSelected} geselecteerd)</span>}
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={selectAll} style={{ fontSize: '0.7rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Alles</button>
                  <button type="button" onClick={selectNone} style={{ fontSize: '0.7rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Geen</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {allFields.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleField(f.id)}
                    title={f.value.length > 80 ? f.value.slice(0, 120) + '…' : f.value}
                    style={{
                      padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem',
                      border: selectedFields.has(f.id) ? '1px solid #7c3aed' : '1px solid #ddd6fe',
                      backgroundColor: selectedFields.has(f.id) ? '#7c3aed' : 'white',
                      color: selectedFields.has(f.id) ? 'white' : '#5b21b6',
                      cursor: 'pointer', fontWeight: selectedFields.has(f.id) ? 600 : 400,
                    }}
                  >
                    {f.label}
                  </button>
                ))}

                {/* Images option — always shown */}
                <button
                  type="button"
                  onClick={() => setIncludeImages(v => !v)}
                  title={imageList.length > 0 ? `${imageList.length} afbeelding(en) beschikbaar` : 'Nog geen afbeeldingen geladen'}
                  style={{
                    padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem',
                    border: includeImages ? '1px solid #7c3aed' : '1px solid #ddd6fe',
                    backgroundColor: includeImages ? '#7c3aed' : 'white',
                    color: includeImages ? 'white' : '#5b21b6',
                    cursor: 'pointer', fontWeight: includeImages ? 600 : 400,
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                  }}
                >
                  🖼 Foto's {imageList.length > 0 && <span style={{ opacity: 0.7 }}>({imageList.length})</span>}
                </button>
              </div>
            </div>

            {/* Custom prompt — persisted */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5b21b6' }}>Vraag / instructie</label>
                <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>💾 automatisch bewaard</span>
              </div>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 'var(--radius)',
                  border: '1px solid #ddd6fe', backgroundColor: 'white',
                  fontSize: '0.82rem', resize: 'vertical', color: '#1e1b4b',
                }}
              />
            </div>

            <button
              type="button"
              onClick={runAnalysis}
              disabled={isPending || totalSelected === 0}
              style={{
                padding: '0.65rem 1.5rem', borderRadius: 'var(--radius)',
                backgroundColor: isPending || totalSelected === 0 ? '#a78bfa' : '#7c3aed',
                color: 'white', border: 'none', fontWeight: 700, fontSize: '0.9rem',
                cursor: isPending || totalSelected === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', alignSelf: 'flex-start',
              }}
            >
              {isPending ? '⏳ Analyseren...' : '🤖 Analyseren'}
            </button>
          </>
        )}

        {error && (
          <div style={{ padding: '0.85rem', borderRadius: 'var(--radius)', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: '0.85rem' }}>
            ❌ {error}
          </div>
        )}

        {response && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{
              padding: '1rem', borderRadius: 'var(--radius)',
              backgroundColor: 'white', border: '1px solid #ddd6fe',
              fontSize: '0.88rem', lineHeight: 1.7, color: '#1e1b4b',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {response}
            </div>
            {usage && (
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: '#7c3aed', flexWrap: 'wrap' }}>
                <span>📥 {usage.inputTokens.toLocaleString()} input tokens</span>
                <span>📤 {usage.outputTokens.toLocaleString()} output tokens</span>
                <span>⏱ {usage.durationMs < 1000 ? `${usage.durationMs}ms` : `${(usage.durationMs / 1000).toFixed(1)}s`}</span>
                <span>💰 ${usage.costUsd.toFixed(5)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
