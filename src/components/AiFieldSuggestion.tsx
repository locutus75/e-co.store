'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  fieldKey: string;
  fieldLabel: string;
  currentValue: string;
  analysisNarrative: string;
  productTitle: string;
  fieldInstruction?: string; // Admin-defined constraint, e.g. "Alleen hele getallen, geen eenheid"
  onApply: (value: string) => void;
}

const SYSTEM_PROMPT = `Je bent een product content specialist. Geef uitsluitend de gevraagde veldinhoud terug. Geen uitleg, geen markdown opmaak, geen aanhalingstekens om de tekst heen — alleen de concrete tekst die direct als veldinhoud bruikbaar is.`;

function getProvider(): string {
  try { return JSON.parse(localStorage.getItem('ai_panel_prefs_v1') || '{}').provider || 'openai'; }
  catch { return 'openai'; }
}

export default function AiFieldSuggestion({ fieldKey, fieldLabel, currentValue, analysisNarrative, productTitle, fieldInstruction, onApply }: Props) {
  const [open, setOpen]             = useState(false);
  const [mounted, setMounted]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
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

  const fetchSuggestion = useCallback(async () => {
    setLoading(true); setError(''); setSuggestion(null);
    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: getProvider(),
          systemPrompt: SYSTEM_PROMPT,
          prompt:
            `Product: "${productTitle}"\n\n` +
            `Productanalyse:\n${analysisNarrative}\n\n` +
            `Schrijf een passende waarde voor het veld "${fieldLabel}"` +
            (currentValue ? ` (huidige waarde: "${currentValue}")` : ' (veld is leeg)') +
            (fieldInstruction ? `\n\nSpecifieke instructie voor dit veld (verplicht op te volgen): ${fieldInstruction}` : '') +
            `\n\nGeef alleen de veldinhoud terug, maximaal 500 tekens.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Fout bij ophalen suggestie'); }
      else { setSuggestion(data.response?.trim() ?? ''); }
    } catch { setError('Verbindingsfout'); }
    setLoading(false);
  }, [fieldLabel, currentValue, analysisNarrative, productTitle]);

  const openPopover = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 280;
      setPos({
        top: above ? rect.top - 8 : rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 380),
        above,
      });
    }
    setOpen(true);
    if (!suggestion && !loading) fetchSuggestion();
  };

  const handleApply = () => {
    if (suggestion !== null) { onApply(suggestion); setOpen(false); }
  };

  if (!mounted) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title={`AI suggestie voor "${fieldLabel}"`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '15px', height: '15px', border: 'none',
          background: 'none', color: '#a78bfa', cursor: 'pointer',
          fontSize: '12px', padding: 0, lineHeight: 1,
          transition: 'color 0.15s, transform 0.15s',
          flexShrink: 0, verticalAlign: 'middle',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.transform = 'scale(1.3)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        ✨
      </button>

      {open && createPortal(
        <>
          {/* Transparent backdrop — click outside closes */}
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 9950 }} />

          {/* Popover */}
          <div style={{
            position: 'fixed',
            top:  pos.above ? undefined : pos.top,
            bottom: pos.above ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: '360px', zIndex: 9951,
            backgroundColor: 'white', border: '1.5px solid #c4b5fd',
            borderRadius: '10px', boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.85rem', backgroundColor: '#7c3aed' }}>
              <span style={{ color: 'white', fontSize: '0.78rem', fontWeight: 700, flex: 1 }}>✨ Suggestie — {fieldLabel}</span>
              <button type="button" onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '0.8rem' }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#7c3aed', fontSize: '0.82rem', padding: '0.25rem 0' }}>
                  <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'ai-field-spin 1s linear infinite', flexShrink: 0 }} />
                  Suggestie genereren…
                </div>
              )}

              {error && (
                <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>❌ {error}</div>
              )}

              {!loading && suggestion !== null && !error && (
                <>
                  <div style={{
                    fontSize: '0.83rem', color: '#1e1b4b', lineHeight: 1.55,
                    backgroundColor: '#f5f3ff', padding: '0.6rem 0.75rem', borderRadius: '7px',
                    border: '1px solid #ddd6fe', marginBottom: '0.6rem',
                    maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {suggestion}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={handleApply}
                      style={{ flex: 1, padding: '0.38rem 0.5rem', borderRadius: '6px', backgroundColor: '#7c3aed', color: 'white', border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                      ✓ Toepassen
                    </button>
                    <button type="button" onClick={fetchSuggestion} title="Nieuwe suggestie genereren"
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
