'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// ── Constants (mirrored from ProductAiPanel) ─────────────────────────────────
const DEFAULT_PROMPT =
  'Analyseer dit product en geef een conclusie over de volledigheid van de data, eventuele verbeterpunten en aanbevelingen.';

const SYSTEM_PROMPT = `Je bent een product content specialist. Analyseer het aangeboden product in het Nederlands met Markdown opmaak.

Gebruik deze structuur:
## Samenvatting
## Sterktes
## Verbeterpunten
## Aanbevelingen

Sluit je analyse **altijd** af met een JSON blok in exact dit formaat (geen andere tekst erna):

\`\`\`json
{
  "score": <0-100>,
  "summary": "<één zin samenvatting>",
  "strengths": ["<punt 1>", "<punt 2>"],
  "missing_fields": ["<mankerend veld 1>", "<mankerend veld 2>"],
  "recommendations": ["<aanbeveling 1>", "<aanbeveling 2>"]
}
\`\`\``;

const KNOWN_FIELDS = [
  { id: '_title',              label: 'Titel',              path: 'title' },
  { id: '_shortDescription',  label: 'Korte omschrijving', path: 'shortDescription' },
  { id: '_longDescription',   label: 'Lange omschrijving', path: 'longDescription' },
  { id: '_ean',               label: 'EAN Code',           path: 'ean' },
  { id: '_color',             label: 'Kleur',              path: 'color' },
  { id: '_size',              label: 'Maat',               path: 'size' },
  { id: '_material',          label: 'Materiaal',          path: 'material' },
  { id: '_mainMaterial',      label: 'Hoofdmateriaal',     path: 'mainMaterial' },
  { id: '_tags',              label: 'Tags',               path: 'tags' },
  { id: '_ingredients',       label: 'Ingrediënten',       path: 'ingredients' },
  { id: '_allergens',         label: 'Allergenen',         path: 'allergens' },
  { id: '_seoTitle',          label: 'SEO Titel',          path: 'seoTitle' },
  { id: '_seoMetaDescription',label: 'SEO Beschrijving',   path: 'seoMetaDescription' },
  { id: '_basePrice',         label: 'Basisprijs',         path: 'basePrice' },
  { id: '_brand',             label: 'Merk',               path: 'brand.name' },
  { id: '_supplier',          label: 'Leverancier',        path: 'supplier.name' },
  { id: '_category',          label: 'Categorie',          path: 'category.name' },
  { id: '_subcategory',       label: 'Subcategorie',       path: 'subcategory.name' },
];

function resolvePath(obj: any, p: string): string | null {
  const v = p.split('.').reduce((o: any, k: string) => o?.[k], obj);
  return v != null && v !== '' ? String(v) : null;
}

function parseScore(raw: string): number | null {
  const m = raw.match(/```json\s*([\s\S]*?)\s*```\s*$/);
  if (!m) return null;
  try { return (JSON.parse(m[1]) as any).score ?? null; } catch { return null; }
}

function getProvider(): string {
  try { return JSON.parse(localStorage.getItem('ai_panel_prefs_v1') || '{}').provider || 'openai'; }
  catch { return 'openai'; }
}

function buildProductPrompt(product: any, layout: any[]): string {
  const fieldMap = new Map<string, { label: string; value: string }>();
  const covered  = new Set<string>();

  for (const kf of KNOWN_FIELDS) {
    const v = resolvePath(product, kf.path);
    if (v) { fieldMap.set(kf.id, { label: kf.label, value: v }); covered.add(kf.path); }
  }
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (field.type === 'chat' || field.type === 'media' || fieldMap.has(field.id)) continue;
      let value: string | null = null;
      let propPath: string;
      if (field.relationPath) {
        propPath = field.relationPath;
        value = resolvePath(product, field.relationPath);
      } else {
        const key = field.id.replace('FIELD:', '');
        propPath = key.startsWith('custom_') ? `customData.${key.replace('custom_', '')}` : key;
        value = key.startsWith('custom_')
          ? (product.customData?.[key.replace('custom_', '')] ?? null)
          : (product[key] != null ? String(product[key]) : null);
      }
      if (covered.has(propPath) || !value) continue;
      fieldMap.set(field.id, { label: field.label, value });
      covered.add(propPath);
    }
  }
  const lines = Array.from(fieldMap.values()).map(f => `${f.label}: ${f.value}`);
  return DEFAULT_PROMPT + (lines.length > 0 ? `\n\n--- Productgegevens ---\n${lines.join('\n')}` : '');
}

// ── Types ─────────────────────────────────────────────────────────────────────
type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
interface Job { articleNumber: string; title: string; status: JobStatus; score: number | null; error?: string; }

interface Props { products: any[]; layout: any[]; onClose: () => void; onComplete: () => void; }

// ── Component ─────────────────────────────────────────────────────────────────
export default function BatchAnalyzeModal({ products, layout, onClose, onComplete }: Props) {
  const [jobs, setJobs]       = useState<Job[]>(() =>
    products.map(p => ({ articleNumber: p.internalArticleNumber, title: p.title || p.internalArticleNumber, status: 'pending' as JobStatus, score: null }))
  );
  const [running, setRunning]   = useState(false);
  const [finished, setFinished] = useState(false);

  // Stable refs — prevents re-running when parent re-renders after router.refresh()
  const cancelRef     = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const productsRef   = useRef(products);
  const layoutRef     = useRef(layout);
  const hasStarted    = useRef(false);
  const logRef        = useRef<HTMLDivElement>(null);

  // Keep refs current without triggering re-runs
  onCompleteRef.current = onComplete;

  const updateJob = (articleNumber: string, patch: Partial<Job>) =>
    setJobs(prev => prev.map(j => j.articleNumber === articleNumber ? { ...j, ...patch } : j));

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [jobs]);

  // ── Single-fire batch runner ────────────────────────────────────────────────
  useEffect(() => {
    // Guard: only run once, even in React Strict Mode (double-invoke protection)
    if (hasStarted.current) return;
    hasStarted.current = true;

    const run = async () => {
      setRunning(true);
      const provider = getProvider();

      for (const product of productsRef.current) {
        if (cancelRef.current) {
          updateJob(product.internalArticleNumber, { status: 'skipped' });
          continue;
        }

        updateJob(product.internalArticleNumber, { status: 'running' });

        try {
          const prompt = buildProductPrompt(product, layoutRef.current);

          const qRes = await fetch('/api/ai/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, prompt, systemPrompt: SYSTEM_PROMPT, context: 'product-analysis' }),
          });
          const qData = await qRes.json();
          if (!qRes.ok) throw new Error(qData.error ?? 'LLM-fout');

          const raw: string = qData.response;
          const score = parseScore(raw);
          const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```\s*$/);
          let structured = null;
          if (jsonMatch) { try { structured = JSON.parse(jsonMatch[1]); } catch { /**/ } }

          const sRes = await fetch('/api/ai/analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              articleNumber: product.internalArticleNumber,
              response: raw, provider, model: qData.model,
              inputTokens: qData.usage?.inputTokens ?? 0,
              outputTokens: qData.usage?.outputTokens ?? 0,
              costUsd: qData.usage?.costUsd ?? 0,
              structuredData: structured ? JSON.stringify(structured) : undefined,
              score,
            }),
          });
          if (!sRes.ok) { const sd = await sRes.json(); throw new Error(sd.error ?? 'Opslaan mislukt'); }

          updateJob(product.internalArticleNumber, { status: 'done', score });
        } catch (err: any) {
          updateJob(product.internalArticleNumber, { status: 'error', error: err.message ?? 'Onbekende fout' });
        }
      }

      setRunning(false);
      setFinished(true);
      // Call onComplete via ref — stable, won't trigger re-run
      onCompleteRef.current();
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs exactly once on mount

  const done    = jobs.filter(j => j.status === 'done').length;
  const errors  = jobs.filter(j => j.status === 'error').length;
  const skipped = jobs.filter(j => j.status === 'skipped').length;
  const total   = jobs.length;
  const pct     = total > 0 ? Math.round(((done + errors + skipped) / total) * 100) : 0;

  const statusIcon = (s: JobStatus) => {
    if (s === 'pending') return <span style={{ color: '#d1d5db', fontSize: '1rem' }}>◯</span>;
    if (s === 'running') return (
      <span style={{
        display: 'inline-block', width: '13px', height: '13px',
        border: '2px solid #ddd6fe', borderTopColor: '#7c3aed',
        borderRadius: '50%', animation: 'batch-spin 0.8s linear infinite', flexShrink: 0,
      }} />
    );
    if (s === 'done')    return <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>;
    if (s === 'error')   return <span style={{ color: '#dc2626', fontWeight: 700 }}>✕</span>;
    if (s === 'skipped') return <span style={{ color: '#9ca3af' }}>–</span>;
  };

  const scoreColor = (score: number | null) => {
    if (score === null) return '#9ca3af';
    if (score >= 75) return '#16a34a';
    if (score >= 50) return '#ca8a04';
    return '#dc2626';
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9960, backdropFilter: 'blur(3px)' }} />

      {/* Modal — wider and taller */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(720px, 96vw)', maxHeight: '90vh',
        zIndex: 9961, backgroundColor: 'white', borderRadius: '16px',
        boxShadow: '0 32px 64px rgba(0,0,0,0.25)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '1.25rem 1.6rem', backgroundColor: '#7c3aed', display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
          <span style={{ fontSize: '1.4rem' }}>🤖</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>Batch Product Analyse</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>{total} product{total !== 1 ? 'en' : ''} in de wachtrij</div>
          </div>
          {finished && (
            <button onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white', borderRadius: '8px', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              Sluiten ✕
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ height: '7px', backgroundColor: '#ede9fe', flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            backgroundColor: finished && errors > 0 ? '#f59e0b' : '#7c3aed',
            transition: 'width 0.5s ease',
          }} />
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '1.25rem', padding: '0.75rem 1.6rem', backgroundColor: '#faf5ff', borderBottom: '1px solid #ede9fe', fontSize: '0.82rem', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#7c3aed', fontWeight: 800, fontSize: '0.95rem' }}>{pct}%</span>
          <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {done} geslaagd</span>
          {errors  > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>✕ {errors} mislukt</span>}
          {skipped > 0 && <span style={{ color: '#9ca3af' }}>– {skipped} overgeslagen</span>}
          <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>{done + errors + skipped} / {total}</span>
        </div>

        {/* Job log — scrollable, takes remaining height */}
        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {jobs.map((job, idx) => (
            <div key={job.articleNumber} style={{
              display: 'grid',
              gridTemplateColumns: '22px 80px 1fr auto',
              alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 1.6rem',
              backgroundColor: job.status === 'running' ? '#faf5ff' : idx % 2 === 0 ? 'white' : '#fdfcff',
              borderBottom: '1px solid #f5f3ff',
              transition: 'background-color 0.2s',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>
                {statusIcon(job.status)}
              </span>
              <span style={{ fontSize: '0.73rem', color: '#a78bfa', fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                #{job.articleNumber}
              </span>
              <span style={{ fontSize: '0.88rem', color: '#1e1b4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.title}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: job.status === 'error' ? '#dc2626' : scoreColor(job.score), textAlign: 'right', whiteSpace: 'nowrap', minWidth: '48px' }}>
                {job.status === 'done' && job.score !== null ? job.score : ''}
                {job.status === 'error' ? <span title={job.error} style={{ fontSize: '0.7rem', fontWeight: 400, cursor: 'help' }}>fout ⓘ</span> : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.6rem', borderTop: '1px solid #ede9fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', flexShrink: 0 }}>
          {!finished ? (
            <>
              <span style={{ fontSize: '0.85rem', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'batch-spin 0.8s linear infinite' }} />
                Bezig met analyseren…
              </span>
              <button
                onClick={() => { cancelRef.current = true; }}
                disabled={!running}
                style={{ padding: '0.45rem 1rem', borderRadius: '7px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '0.82rem', cursor: running ? 'pointer' : 'not-allowed', opacity: running ? 1 : 0.4 }}>
                ✕ Annuleren
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: errors === 0 ? '#16a34a' : '#ca8a04' }}>
                {errors === 0 ? `✓ Alle ${done} analyses opgeslagen!` : `Klaar — ${done} geslaagd${errors > 0 ? `, ${errors} mislukt` : ''}${skipped > 0 ? `, ${skipped} overgeslagen` : ''}`}
              </span>
              <button onClick={onClose}
                style={{ padding: '0.45rem 1.2rem', borderRadius: '7px', backgroundColor: '#7c3aed', color: 'white', border: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                Sluiten
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes batch-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body
  );
}
