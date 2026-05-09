'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface SectionField {
  id: string;
  key: string;
  label: string;
  currentValue: string;
  instruction?: string;
}

interface Props {
  sectionTitle: string;
  fields: SectionField[];
  analysisNarrative: string;
  productTitle: string;
  sectionInstruction?: string;
  onApply: (suggestions: Record<string, string>) => void;
}

const SYSTEM_PROMPT = `Je bent een product content specialist. Geef uitsluitend een geldig JSON object terug met de field keys als properties en de gesuggereerde tekst als values. Geen uitleg, geen markdown opmaak (geen \`\`\`json).`;

function getProvider(): string {
  try { return JSON.parse(localStorage.getItem('ai_panel_prefs_v1') || '{}').provider || 'openai'; }
  catch { return 'openai'; }
}

export default function AiSectionSuggestion({ sectionTitle, fields, analysisNarrative, productTitle, sectionInstruction, onApply }: Props) {
  const [open, setOpen]             = useState(false);
  const [mounted, setMounted]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string> | null>(null);
  const [error, setError]           = useState('');
  const [pos, setPos]               = useState({ top: 0, left: 0, above: false });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true); setError(''); setSuggestions(null);
    try {
      const promptText = `Product: "${productTitle}"\n\n` +
        `Productanalyse:\n${analysisNarrative}\n\n` +
        `Vul de volgende velden in voor de sectie "${sectionTitle}":\n` +
        fields.map(f => `- Key: "${f.key}", Naam: "${f.label}" (huidige waarde: "${f.currentValue || ''}"${f.instruction ? `, specifieke instructie: ${f.instruction}` : ''})`).join('\n') +
        (sectionInstruction ? `\n\nAlgemene instructie voor deze sectie: ${sectionInstruction}` : '') +
        `\n\nGeef UITSLUITEND een geldig JSON object terug met de field keys als properties en de gesuggereerde tekst als values. Voorbeeld: {"title": "Nieuwe titel", "color": "Rood"}. Geen markdown, geen tekst buiten de JSON.`;

      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: getProvider(),
          systemPrompt: SYSTEM_PROMPT,
          prompt: promptText,
          // We can optionally force JSON mode if the provider supports it, but standard prompt usually works.
        }),
      });
      const data = await res.json();
      if (!res.ok) { 
        setError(data.error || 'Fout bij ophalen suggesties'); 
      } else { 
        const responseText = data.response?.trim() || '{}';
        // Clean up markdown json blocks if AI included them anyway
        const cleaned = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        try {
          const parsed = JSON.parse(cleaned);
          setSuggestions(parsed);
        } catch (e) {
          console.error("Failed to parse JSON response:", responseText);
          setError('De AI gaf een ongeldig JSON formaat terug.');
        }
      }
    } catch { setError('Verbindingsfout'); }
    setLoading(false);
  }, [fields, sectionTitle, analysisNarrative, productTitle, sectionInstruction]);

  const openPopover = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 350; // Needs a bit more space
      setPos({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 420),
        above,
      });
    }
    setOpen(true);
    if (!suggestions && !loading) fetchSuggestions();
  };

  const handleApply = () => {
    if (suggestions !== null) { 
      onApply(suggestions); 
      setOpen(false); 
    }
  };

  if (!mounted) return null;
  if (fields.length === 0) return null; // Don't show if no fields are selected

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title={`AI suggesties voor sectie "${sectionTitle}" (${fields.length} veld${fields.length === 1 ? '' : 'en'})`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem',
          border: '1px solid #c4b5fd', backgroundColor: '#f5f3ff', color: '#7c3aed',
          boxShadow: '0 1px 2px rgba(124,58,237,0.1)', transition: 'all 0.15s',
          marginLeft: '0.5rem', verticalAlign: 'middle',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#ede9fe'; e.currentTarget.style.borderColor = '#a78bfa'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f3ff'; e.currentTarget.style.borderColor = '#c4b5fd'; }}
      >
        ✨ Sectie AI
      </button>

      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9950 }} />

          <div style={{
            position: 'fixed',
            top:  pos.above ? undefined : pos.top,
            bottom: pos.above ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: '400px', zIndex: 9951,
            backgroundColor: 'white', border: '1.5px solid #c4b5fd',
            borderRadius: '10px', boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.85rem', backgroundColor: '#7c3aed' }}>
              <span style={{ color: 'white', fontSize: '0.78rem', fontWeight: 700, flex: 1 }}>✨ Sectie AI — {sectionTitle}</span>
              <button type="button" onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>✕</button>
            </div>

            <div style={{ padding: '0.8rem' }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7c3aed', fontSize: '0.82rem', padding: '0.25rem 0' }}>
                  <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'ai-field-spin 1s linear infinite', flexShrink: 0 }} />
                  Suggesties genereren voor {fields.length} velden…
                </div>
              )}

              {error && (
                <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>❌ {error}</div>
              )}

              {!loading && suggestions !== null && !error && (
                <>
                  <div style={{
                    backgroundColor: '#f5f3ff', padding: '0.6rem 0.75rem', borderRadius: '7px',
                    border: '1px solid #ddd6fe', marginBottom: '0.6rem',
                    maxHeight: '220px', overflowY: 'auto'
                  }}>
                    {fields.map(f => (
                      <div key={f.key} style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #ede9fe' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6d28d9', marginBottom: '0.2rem' }}>{f.label}</div>
                        <div style={{ fontSize: '0.8rem', color: '#1e1b4b', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {suggestions[f.key] !== undefined ? suggestions[f.key] : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Geen suggestie</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={handleApply}
                      style={{ flex: 1, padding: '0.38rem 0.5rem', borderRadius: '6px', backgroundColor: '#7c3aed', color: 'white', border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                      ✓ Alles Toepassen
                    </button>
                    <button type="button" onClick={fetchSuggestions} title="Nieuwe suggesties genereren"
                      style={{ padding: '0.38rem 0.6rem', borderRadius: '6px', backgroundColor: 'white', color: '#7c3aed', border: '1px solid #ddd6fe', fontSize: '0.78rem', cursor: 'pointer' }}>
                      ↻
                    </button>
                    <button type="button" onClick={() => setOpen(false)}
                      style={{ padding: '0.38rem 0.6rem', borderRadius: '6px', backgroundColor: 'white', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.78rem', cursor: 'pointer' }}>
                      Sluiten
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <style>{`@keyframes ai-field-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </>,
        document.body
      )}
    </>
  );
}
