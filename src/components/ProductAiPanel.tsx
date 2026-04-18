'use client';

import React, { useState, useTransition } from 'react';

const PROVIDER_ICONS: Record<string, string> = { openai: '🟢', anthropic: '🟠', gemini: '🔵' };
const PROVIDER_LABELS: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' };

interface Props {
  product: any;
  layout: any[];
  isAdmin: boolean;
}

function resolveFieldValue(field: any, product: any): string | null {
  if (field.relationPath) {
    const val = field.relationPath.split('.').reduce((o: any, k: string) => o?.[k], product);
    return val?.toString() ?? null;
  }
  const key = field.id.replace('FIELD:', '');
  if (key.startsWith('custom_')) return product.customData?.[key.replace('custom_', '')] ?? null;
  return product[key]?.toString() ?? null;
}

export default function ProductAiPanel({ product, layout, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [customPrompt, setCustomPrompt] = useState('Analyseer dit product en geef een conclusie over de volledigheid van de data, eventuele verbeterpunten en aanbevelingen.');
  const [response, setResponse] = useState('');
  const [usage, setUsage] = useState<any>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [providersLoaded, setProvidersLoaded] = useState(false);

  const openPanel = async () => {
    setOpen(true);
    if (!providersLoaded) {
      try {
        const res = await fetch('/api/ai/providers');
        if (res.ok) {
          const data = await res.json();
          const active = data.filter((p: any) => p.hasApiKey);
          setProviders(active);
          if (active.length > 0) setSelectedProvider(active[0].provider);
        }
      } catch { /* ignore */ }
      setProvidersLoaded(true);
    }
  };

  // Collect all fields with a label from layout for selection
  const allFields: { id: string; label: string; value: string | null }[] = [];
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (field.type === 'chat' || field.type === 'media') continue;
      const value = resolveFieldValue(field, product);
      if (value) allFields.push({ id: field.id, label: field.label, value });
    }
  }

  const toggleField = (id: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedFields(new Set(allFields.map(f => f.id)));
  const selectNone = () => setSelectedFields(new Set());

  const buildPrompt = () => {
    const lines: string[] = [];
    for (const field of allFields) {
      if (selectedFields.has(field.id) && field.value) {
        lines.push(`${field.label}: ${field.value}`);
      }
    }
    const context = lines.length > 0 ? `\n\n--- Productgegevens ---\n${lines.join('\n')}` : '';
    return customPrompt + context;
  };

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
          cursor: 'pointer', transition: 'all 0.15s',
          flexShrink: 0,
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
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#5b21b6' }}>Velden meesturen als context</label>
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
              </div>
            </div>

            {/* Custom prompt */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#5b21b6', marginBottom: '0.3rem' }}>Vraag / instructie</label>
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
              disabled={isPending || selectedFields.size === 0}
              style={{
                padding: '0.65rem 1.5rem', borderRadius: 'var(--radius)',
                backgroundColor: isPending || selectedFields.size === 0 ? '#a78bfa' : '#7c3aed',
                color: 'white', border: 'none', fontWeight: 700, fontSize: '0.9rem',
                cursor: isPending || selectedFields.size === 0 ? 'not-allowed' : 'pointer',
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
