'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getEmpcoSettingsAction } from '@/app/actions/empco';
import { EmpcoBadge, empcoBadgeState } from './EmpcoCheck';

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
  { id: '_title',              label: 'Omschrijving',       path: 'title' },
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
/** full_empco = complete analysis + EmpCo check, full = analysis only, empco = EmpCo check only */
export type BatchMode = 'full_empco' | 'full' | 'empco';
type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';
interface Job {
  articleNumber: string; title: string; status: JobStatus; score: number | null; error?: string;
  empcoStatus?: string | null; empcoIssues?: number; empcoSkipped?: boolean;
}

interface Props { products: any[]; layout: any[]; onClose: () => void; onComplete: () => void; canUseAi?: boolean; initialMode?: BatchMode; }

const MODE_INFO: Record<BatchMode, { icon: string; title: string; desc: string }> = {
  full_empco: { icon: '🤖⚖️', title: 'Volledige analyse + EmpCo-check', desc: 'Inhoudelijke analyse én toetsing aan de EmpCo-richtlijn.' },
  full:       { icon: '🤖',  title: 'Alleen volledige analyse',        desc: 'Zoals voorheen, zonder EmpCo-toetsing.' },
  empco:      { icon: '⚖️',  title: 'Alleen EmpCo-check',               desc: 'Snel en goedkoop: alleen claims toetsen. Ideaal voor al geanalyseerde producten.' },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function BatchAnalyzeModal({ products, layout, onClose, onComplete, canUseAi = true, initialMode }: Props) {
  const [jobs, setJobs]       = useState<Job[]>(() =>
    products.map(p => ({ articleNumber: p.internalArticleNumber, title: p.title || p.internalArticleNumber, status: 'pending' as JobStatus, score: null }))
  );
  const [running, setRunning]   = useState(false);
  const [finished, setFinished] = useState(false);
  const [started, setStarted]   = useState(false);
  const [mode, setMode]         = useState<BatchMode>(initialMode ?? (canUseAi ? 'full_empco' : 'empco'));
  const [skipCurrentEmpco, setSkipCurrentEmpco] = useState(true);

  // Default mode from EmpCo settings (only when no explicit mode was requested)
  useEffect(() => {
    if (initialMode || !canUseAi) return;
    getEmpcoSettingsAction().then(s => setMode(s.includeInAnalysisByDefault ? 'full_empco' : 'full')).catch(() => {});
  }, [initialMode, canUseAi]);

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

  // ── Single-fire batch runner (started via the "Start" button) ──────────────────
  const startRun = () => {
    // Guard: only run once, even on double clicks
    if (hasStarted.current) return;
    hasStarted.current = true;
    setStarted(true);

    const doFull  = mode === 'full' || mode === 'full_empco';
    const doEmpco = mode === 'empco' || mode === 'full_empco';
    const skipEmpco = skipCurrentEmpco;

    const run = async () => {
      setRunning(true);
      
      // Load system default provider for analysis, fall back to localStorage/openai
      let provider = 'openai';
      try {
        const prefRaw = localStorage.getItem('ai_panel_prefs_v1');
        if (prefRaw) provider = JSON.parse(prefRaw).provider || 'openai';
      } catch {}

      if (doFull) {
        try {
          const modRes = await fetch('/api/ai/module-defaults');
          if (modRes.ok) {
            const defaults = await modRes.json();
            if (defaults.analysis) provider = defaults.analysis;
          }
        } catch (err) {
          console.error('[BatchAnalyze] Failed to fetch module defaults', err);
        }
      }

      for (const product of productsRef.current) {
        if (cancelRef.current) {
          updateJob(product.internalArticleNumber, { status: 'skipped' });
          continue;
        }

        updateJob(product.internalArticleNumber, { status: 'running' });

        try {
          let score: number | null = null;

          if (doFull) {
            const prompt = buildProductPrompt(product, layoutRef.current);

            const qRes = await fetch('/api/ai/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider, prompt, systemPrompt: SYSTEM_PROMPT, context: 'product-analysis' }),
            });
            const qData = await qRes.json();
            if (!qRes.ok) throw new Error(qData.error ?? 'LLM-fout');

            const raw: string = qData.response;
            score = parseScore(raw);
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
            updateJob(product.internalArticleNumber, { score });
          }

          if (doEmpco) {
            // Runs + saves server-side; skipIfCurrent avoids re-checking unchanged products
            const eRes = await fetch('/api/ai/empco', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ articleNumber: product.internalArticleNumber, skipIfCurrent: skipEmpco }),
            });
            const eData = await eRes.json();
            if (!eRes.ok) throw new Error(`EmpCo: ${eData.error ?? 'check mislukt'}`);
            updateJob(product.internalArticleNumber, {
              empcoStatus: eData.check?.status ?? null,
              empcoIssues: eData.check?.issueCount ?? 0,
              empcoSkipped: !!eData.skipped,
            });
          }

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
  };

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

  const isEmpcoOnly = mode === 'empco';
  const accent = isEmpcoOnly ? '#0f766e' : '#7c3aed';
  const empcoDone = jobs.filter(j => j.empcoStatus);
  const empcoFail = empcoDone.filter(j => j.empcoStatus === 'FAIL').length;
  const empcoWarn = empcoDone.filter(j => j.empcoStatus === 'WARNING').length;
  const empcoIssueTotal = empcoDone.reduce((s, j) => s + (j.empcoIssues ?? 0), 0);
  const empcoSkippedCount = empcoDone.filter(j => j.empcoSkipped).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
        <div style={{ padding: '1.25rem 1.6rem', background: isEmpcoOnly ? 'linear-gradient(135deg,#0f766e,#065f46)' : '#7c3aed', display: 'flex', alignItems: 'center', gap: '0.85rem', flexShrink: 0 }}>
          <span style={{ fontSize: '1.4rem' }}>{isEmpcoOnly ? '⚖️' : '🤖'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>{isEmpcoOnly ? 'Batch EmpCo-check' : 'Batch Product Analyse'}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
              {total} product{total !== 1 ? 'en' : ''} in de wachtrij{started ? ` · ${MODE_INFO[mode].title}` : ''}
            </div>
          </div>
          {(finished || !started) && (
            <button onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white', borderRadius: '8px', padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
              {finished ? 'Sluiten ✕' : 'Annuleren ✕'}
            </button>
          )}
        </div>

        {/* Setup step — choose mode before starting */}
        {!started && (
          <div style={{ padding: '1.25rem 1.6rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Wat wil je uitvoeren?</div>
            {(Object.keys(MODE_INFO) as BatchMode[]).map(m => {
              const info = MODE_INFO[m];
              const disabled = m !== 'empco' && !canUseAi;
              const selected = mode === m;
              const c = m === 'empco' ? '#0f766e' : '#7c3aed';
              return (
                <label key={m} htmlFor={`batch-mode-${m}`} style={{
                  display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.8rem 1rem',
                  borderRadius: '10px', border: `2px solid ${selected ? c : '#e2e8f0'}`,
                  backgroundColor: selected ? (m === 'empco' ? '#f0fdfa' : '#faf5ff') : 'white',
                  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}>
                  <input id={`batch-mode-${m}`} type="radio" name="batch-mode" checked={selected} disabled={disabled}
                    onChange={() => setMode(m)} style={{ marginTop: '0.2rem', accentColor: c }} />
                  <span style={{ fontSize: '1.1rem' }}>{info.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{info.title}</span>
                    <span style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {info.desc}{disabled ? ' (vereist AI-rechten)' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
            {mode !== 'full' && (
              <label htmlFor="batch-skip-current" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.82rem', color: '#334155', marginTop: '0.35rem', cursor: 'pointer' }}>
                <input id="batch-skip-current" type="checkbox" checked={skipCurrentEmpco}
                  onChange={e => setSkipCurrentEmpco(e.target.checked)} style={{ accentColor: '#0f766e' }} />
                Producten met een actuele EmpCo-check (tekst ongewijzigd) overslaan
              </label>
            )}
          </div>
        )}

        {started && (<>
        {/* Progress bar */}
        <div style={{ height: '7px', backgroundColor: isEmpcoOnly ? '#ccfbf1' : '#ede9fe', flexShrink: 0 }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            backgroundColor: finished && errors > 0 ? '#f59e0b' : accent,
            transition: 'width 0.5s ease',
          }} />
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '1.25rem', padding: '0.75rem 1.6rem', backgroundColor: isEmpcoOnly ? '#f0fdfa' : '#faf5ff', borderBottom: '1px solid #ede9fe', fontSize: '0.82rem', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: accent, fontWeight: 800, fontSize: '0.95rem' }}>{pct}%</span>
          <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {done} geslaagd</span>
          {errors  > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>✕ {errors} mislukt</span>}
          {skipped > 0 && <span style={{ color: '#9ca3af' }}>– {skipped} overgeslagen</span>}
          {empcoFail > 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}>⛔ {plural(empcoFail, 'product', 'producten')} met overtreding</span>}
          {empcoWarn > 0 && <span style={{ color: '#a16207', fontWeight: 600 }}>⚠️ {plural(empcoWarn, 'product', 'producten')} met aandachtspunten</span>}
          {empcoIssueTotal > 0 && <span style={{ color: '#475569' }}>· {plural(empcoIssueTotal, 'bevinding', 'bevindingen')} in totaal</span>}
          <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>{done + errors + skipped} / {total}</span>
        </div>
        </>)}

        {/* Job log — scrollable, takes remaining height */}
        {started && (
        <div ref={logRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {jobs.map((job, idx) => (
            <div key={job.articleNumber} style={{
              display: 'grid',
              gridTemplateColumns: '22px 80px 1fr auto auto',
              alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 1.6rem',
              backgroundColor: job.status === 'running' ? (isEmpcoOnly ? '#f0fdfa' : '#faf5ff') : idx % 2 === 0 ? 'white' : '#fdfcff',
              borderBottom: '1px solid #f5f3ff',
              transition: 'background-color 0.2s',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>
                {statusIcon(job.status)}
              </span>
              <span style={{ fontSize: '0.73rem', color: isEmpcoOnly ? '#14b8a6' : '#a78bfa', fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                #{job.articleNumber}
              </span>
              <span style={{ fontSize: '0.88rem', color: '#1e1b4b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.title}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: job.status === 'error' ? '#dc2626' : scoreColor(job.score), textAlign: 'right', whiteSpace: 'nowrap', minWidth: isEmpcoOnly ? 0 : '48px' }}>
                {job.status === 'done' && job.score !== null ? job.score : ''}
                {job.status === 'error' ? <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Fout: {job.error}</span> : ''}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'flex-end' }}>
                {job.empcoStatus && (
                  <>
                    {job.empcoSkipped && <span title="Actuele check hergebruikt" style={{ fontSize: '0.65rem', color: '#94a3b8' }}>↺</span>}
                    <EmpcoBadge state={empcoBadgeState(job.empcoStatus)} issueCount={job.empcoIssues} />
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        )}

        {/* Footer */}
        <div style={{ padding: '1rem 1.6rem', borderTop: '1px solid #ede9fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', flexShrink: 0, gap: '1rem' }}>
          {!started ? (
            <>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {mode === 'empco' ? 'Resultaten worden direct per product opgeslagen.' : 'Analyses worden direct per product opgeslagen.'}
              </span>
              <button id="batch-start-btn" onClick={startRun}
                style={{ padding: '0.55rem 1.4rem', borderRadius: '8px', background: isEmpcoOnly ? 'linear-gradient(135deg,#0f766e,#065f46)' : '#7c3aed', color: 'white', border: 'none', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', boxShadow: `0 6px 16px ${accent}55` }}>
                ▶ Start ({total})
              </button>
            </>
          ) : !finished ? (
            <>
              <span style={{ fontSize: '0.85rem', color: accent, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #ddd6fe', borderTopColor: accent, borderRadius: '50%', animation: 'batch-spin 0.8s linear infinite' }} />
                {isEmpcoOnly ? 'Bezig met EmpCo-checks…' : 'Bezig met analyseren…'}
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
                {errors === 0 ? `✓ Alle ${done} ${isEmpcoOnly ? 'EmpCo-checks' : 'analyses'} opgeslagen!` : `Klaar — ${done} geslaagd${errors > 0 ? `, ${errors} mislukt` : ''}${skipped > 0 ? `, ${skipped} overgeslagen` : ''}`}
                {empcoSkippedCount > 0 && <span style={{ fontWeight: 400, color: '#64748b' }}> · {empcoSkippedCount} actuele EmpCo-check{empcoSkippedCount === 1 ? '' : 's'} hergebruikt</span>}
              </span>
              <button onClick={onClose}
                style={{ padding: '0.45rem 1.2rem', borderRadius: '7px', backgroundColor: accent, color: 'white', border: 'none', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
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
