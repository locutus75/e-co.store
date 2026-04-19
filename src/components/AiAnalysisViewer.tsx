'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const PROVIDER_ICONS: Record<string, string> = { openai: '🟢', anthropic: '🟠', gemini: '🔵' };

interface StructuredAnalysis {
  score: number;
  missing_fields: string[];
  strengths: string[];
  recommendations: string[];
  summary: string;
}

interface AnalysisData {
  response: string;
  structuredData?: string | null;
  score?: number | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  updatedAt: string;
}

interface Props {
  articleNumber: string;
  productTitle?: string;
  score: number | null;
  canUseAi?: boolean;
}

function scoreColor(s: number) {
  if (s >= 75) return { bg: '#f0fdf4', bar: '#16a34a', text: '#14532d', badge: '#dcfce7', badgeText: '#16a34a', label: 'Goed' };
  if (s >= 50) return { bg: '#fefce8', bar: '#ca8a04', text: '#713f12', badge: '#fef9c3', badgeText: '#92400e', label: 'Matig' };
  return          { bg: '#fff1f2', bar: '#dc2626', text: '#7f1d1d', badge: '#fee2e2', badgeText: '#dc2626', label: 'Onvolledig' };
}

function scoreBadgeStyle(s: number) {
  const c = scoreColor(s);
  return { backgroundColor: c.badge, color: c.badgeText, borderColor: c.bar + '60' };
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n'); const out: string[] = [];
  let inCode = false; let codeLines: string[] = [];
  let listItems: string[] = []; let listOrdered = false;
  const inline = (t: string) =>
    t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
     .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
     .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
     .replace(/\*(.+?)\*/g,'<em>$1</em>')
     .replace(/`([^`]+)`/g,'<code class="mdc">$1</code>');
  const flushList = () => {
    if (!listItems.length) return;
    out.push(`<${listOrdered?'ol':'ul'} class="mdl">${listItems.join('')}</${listOrdered?'ol':'ul'}>`);
    listItems = [];
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (l.startsWith('```')) { if (!inCode) { flushList(); inCode=true; codeLines=[]; } else { out.push(`<pre class="mdpre"><code>${codeLines.join('\n').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</code></pre>`); inCode=false; } continue; }
    if (inCode) { codeLines.push(l); continue; }
    if (/^### /.test(l)) { flushList(); out.push(`<h3 class="mdh3">${inline(l.slice(4))}</h3>`); continue; }
    if (/^## /.test(l))  { flushList(); out.push(`<h2 class="mdh2">${inline(l.slice(3))}</h2>`); continue; }
    if (/^# /.test(l))   { flushList(); out.push(`<h1 class="mdh1">${inline(l.slice(2))}</h1>`); continue; }
    if (/^---+$/.test(l)){ flushList(); out.push('<hr class="mdhr">'); continue; }
    if (/^> /.test(l))   { flushList(); out.push(`<blockquote class="mdbq">${inline(l.slice(2))}</blockquote>`); continue; }
    const ulM = l.match(/^[-*+] (.+)/); if (ulM) { if (listOrdered&&listItems.length) flushList(); listOrdered=false; listItems.push(`<li>${inline(ulM[1])}</li>`); continue; }
    const olM = l.match(/^\d+\. (.+)/); if (olM) { if (!listOrdered&&listItems.length) flushList(); listOrdered=true; listItems.push(`<li>${inline(olM[1])}</li>`); continue; }
    if (l.trim()==='') { flushList(); out.push('<div class="mdsp"></div>'); continue; }
    flushList(); out.push(`<p class="mdp">${inline(l)}</p>`);
  }
  flushList();
  return out.join('');
}

function parseNarrative(raw: string): { narrative: string; structured: StructuredAnalysis | null } {
  const match = raw.match(/```json\s*([\s\S]*?)\s*```\s*$/);
  if (!match) return { narrative: raw.trim(), structured: null };
  try { return { narrative: raw.slice(0, raw.lastIndexOf('```json')).trim(), structured: JSON.parse(match[1]) }; }
  catch { return { narrative: raw.trim(), structured: null }; }
}

/** Inline score badge shown in the product list */
export function AiScoreBadge({ score, onClick }: { score: number; onClick: (e: React.MouseEvent) => void }) {
  const c = scoreColor(score);
  const style = scoreBadgeStyle(score);
  return (
    <button
      type="button"
      onClick={onClick}
      title="Bekijk AI analyse"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem',
        fontWeight: 700, cursor: 'pointer',
        backgroundColor: style.backgroundColor, color: style.color,
        border: `1px solid ${style.borderColor}`,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      🤖 {score}
    </button>
  );
}

/** Full read-only analysis viewer modal */
export default function AiAnalysisViewer({ articleNumber, productTitle, score, canUseAi = false }: Props) {
  const [open, setOpen]         = useState(false);
  const [mounted, setMounted]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [error, setError]       = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const openViewer = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent row click from opening product drawer
    setOpen(true);
    if (analysis) return; // already loaded
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/ai/analysis?article=${encodeURIComponent(articleNumber)}`);
      const data = await res.json();
      if (data.analysis) setAnalysis(data.analysis);
      else setError('Geen analyse gevonden.');
    } catch { setError('Fout bij laden van analyse.'); }
    setLoading(false);
  };

  const badge = score != null ? <AiScoreBadge score={score} onClick={openViewer} /> : null;

  if (!mounted) return badge ?? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>;

  const { narrative, structured } = analysis ? parseNarrative(analysis.response) : { narrative: '', structured: null };
  const displayStructured = structured ?? (analysis?.structuredData ? (() => { try { return JSON.parse(analysis.structuredData!); } catch { return null; } })() : null);

  const modal = open ? createPortal(
    <>
      {/* Backdrop */}
      <div onClick={() => setOpen(false)}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,10,40,0.55)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(92vw, 1080px)', maxHeight: '92vh', backgroundColor: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.35)', zIndex: 9001, display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.25rem', backgroundColor: '#7c3aed', color: 'white', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>📋 Product Analyse</span>
          {productTitle && <span style={{ fontSize: '0.78rem', opacity: 0.75 }}>— {productTitle}</span>}
          <div style={{ flex: 1 }} />
          {canUseAi && analysis && (
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.71rem', color: 'rgba(255,255,255,0.75)', alignItems: 'center' }}>
              <span>{PROVIDER_ICONS[analysis.provider]} {analysis.model}</span>
              <span>📥 {analysis.inputTokens.toLocaleString()} / 📤 {analysis.outputTokens.toLocaleString()}</span>
              <span>💰 ${analysis.costUsd.toFixed(5)}</span>
            </div>
          )}
          {analysis && (
            <span style={{ fontSize: '0.71rem', color: 'rgba(255,255,255,0.65)' }}>
              📅 {new Date(analysis.updatedAt).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: '0 0.25rem', marginLeft: '0.5rem' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: '#7c3aed' }}>
              <span style={{ display: 'inline-block', width: '20px', height: '20px', border: '2.5px solid #c4b5fd', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'ai-spin 1s linear infinite' }} />
              Analyse laden…
            </div>
          )}

          {error && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>❌ {error}</div>
          )}

          {!loading && displayStructured && (
            <div style={{ padding: '1.25rem 1.5rem', backgroundColor: scoreColor(displayStructured.score).bg, borderBottom: '1px solid #e4d9f8', flexShrink: 0 }}>
              {/* Score + summary */}
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                  <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e4d9f8" strokeWidth="2.8" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={scoreColor(displayStructured.score).bar} strokeWidth="2.8"
                      strokeDasharray={`${displayStructured.score} ${100 - displayStructured.score}`} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: scoreColor(displayStructured.score).text, lineHeight: 1 }}>{displayStructured.score}</span>
                    <span style={{ fontSize: '0.48rem', opacity: 0.7, color: scoreColor(displayStructured.score).text }}>/ 100</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                    <span style={{ padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: scoreColor(displayStructured.score).badge, color: scoreColor(displayStructured.score).badgeText, fontSize: '0.75rem', fontWeight: 700 }}>{scoreColor(displayStructured.score).label}</span>
                    <span style={{ fontSize: '0.85rem', color: scoreColor(displayStructured.score).text, fontStyle: 'italic' }}>{displayStructured.summary}</span>
                  </div>
                  <div style={{ height: '5px', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '99px', overflow: 'hidden', maxWidth: '300px' }}>
                    <div style={{ height: '100%', width: `${displayStructured.score}%`, backgroundColor: scoreColor(displayStructured.score).bar, borderRadius: '99px', transition: 'width 0.7s ease' }} />
                  </div>
                </div>
              </div>
              {/* Three columns */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.85rem' }}>
                {[
                  { title: '✓ Sterktes', color: '#16a34a', items: displayStructured.strengths },
                  { title: '⚠ Ontbrekend', color: '#dc2626', items: displayStructured.missing_fields },
                  { title: '💡 Aanbevelingen', color: '#7c3aed', items: displayStructured.recommendations },
                ].map(col => (
                  <div key={col.title} style={{ backgroundColor: 'rgba(255,255,255,0.65)', borderRadius: '8px', padding: '0.7rem 0.85rem' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>{col.title}</div>
                    {col.items.length === 0
                      ? <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>—</span>
                      : col.items.map((item: string, i: number) => (
                        <div key={i} style={{ fontSize: '0.78rem', color: '#1e1b4b', display: 'flex', gap: '0.3rem', marginBottom: '0.2rem', lineHeight: 1.4 }}>
                          <span style={{ flexShrink: 0, color: col.color }}>•</span><span>{item}</span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && narrative && (
            <div className="ai-md-ro" style={{ padding: '1.5rem 1.75rem', lineHeight: 1.7, fontSize: '0.9rem', color: '#1e1b4b' }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(narrative) }} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes ai-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .ai-md-ro .mdh1{font-size:1.2rem;font-weight:800;margin:1.25rem 0 .5rem;color:#3b0764}
        .ai-md-ro .mdh2{font-size:1.05rem;font-weight:700;margin:1rem 0 .4rem;color:#3b0764;border-bottom:1px solid #e4d9f8;padding-bottom:.25rem}
        .ai-md-ro .mdh3{font-size:.95rem;font-weight:700;margin:.75rem 0 .3rem;color:#4c1d95}
        .ai-md-ro .mdp{margin:.4rem 0}
        .ai-md-ro .mdsp{height:.5rem}
        .ai-md-ro .mdl{margin:.4rem 0 .4rem 1.4rem}
        .ai-md-ro .mdl li{margin:.15rem 0}
        .ai-md-ro .mdbq{border-left:3px solid #c4b5fd;padding:.4rem .75rem;margin:.6rem 0;background:#f5f3ff;border-radius:0 4px 4px 0;color:#4c1d95}
        .ai-md-ro .mdhr{border:none;border-top:1px solid #e4d9f8;margin:.75rem 0}
        .ai-md-ro .mdpre{background:#1e1b4b;color:#e2d9f3;padding:.85rem;border-radius:6px;overflow-x:auto;margin:.75rem 0;font-family:monospace;font-size:.82rem}
        .ai-md-ro .mdc{background:#f0ebff;padding:.1rem .3rem;border-radius:3px;font-family:monospace;font-size:.85em;color:#5b21b6}
      `}</style>
    </>,
    document.body
  ) : null;

  return (
    <>
      {badge ?? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
      {modal}
    </>
  );
}
