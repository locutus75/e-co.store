'use client';

import React, { useState, useTransition, useEffect } from 'react';

const PROVIDER_ICONS: Record<string, string> = { openai: '🟢', anthropic: '🟠', gemini: '🔵' };
const PROVIDER_LABELS: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' };

// ── Known product fields ──────────────────────────────────────────────────────
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
  { id: '_internalNotes',     label: 'Interne notities',   path: 'internalNotes' },
  { id: '_brand',             label: 'Merk',               path: 'brand.name' },
  { id: '_supplier',          label: 'Leverancier',        path: 'supplier.name' },
  { id: '_category',          label: 'Categorie',          path: 'category.name' },
  { id: '_subcategory',       label: 'Subcategorie',       path: 'subcategory.name' },
  { id: '_status',            label: 'Status',             path: 'status' },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface FieldEntry { id: string; label: string; value: string; }

interface StructuredAnalysis {
  score: number;                // 0–100 completeness / quality score
  missing_fields: string[];     // fields that are empty or lacking
  strengths: string[];          // what is already good
  recommendations: string[];    // specific actionable improvements
  summary: string;              // one-sentence summary
}

interface AnalysisResult {
  response: string;             // full raw response (narrative + json block)
  narrative: string;            // prose part only
  structured: StructuredAnalysis | null;
  structuredData?: string;      // serialised JSON for persistence
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs?: number;
  savedAt?: string;
  isFromDb?: boolean;
}

interface Props { product: any; layout: any[]; isAdmin: boolean; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolvePath(obj: any, p: string): string | null {
  const v = p.split('.').reduce((o: any, k: string) => o?.[k], obj);
  return v != null && v !== '' ? String(v) : null;
}

/** Split raw AI response into prose narrative + optional structured JSON block */
function parseResponse(raw: string): { narrative: string; structured: StructuredAnalysis | null } {
  const match = raw.match(/```json\s*([\s\S]*?)\s*```\s*$/);
  if (!match) return { narrative: raw.trim(), structured: null };
  try {
    const structured = JSON.parse(match[1]) as StructuredAnalysis;
    const narrative  = raw.slice(0, raw.lastIndexOf('```json')).trim();
    return { narrative, structured };
  } catch {
    return { narrative: raw.trim(), structured: null };
  }
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false; let codeLines: string[] = [];
  let listItems: string[] = []; let listOrdered = false;

  const inline = (t: string) =>
    t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
     .replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>')
     .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
     .replace(/\*(.+?)\*/g,'<em>$1</em>')
     .replace(/`([^`]+)`/g,'<code class="md-c">$1</code>');

  const flushList = () => {
    if (!listItems.length) return;
    const tag = listOrdered ? 'ol' : 'ul';
    out.push(`<${tag} class="md-list">${listItems.join('')}</${tag}>`);
    listItems = [];
  };

  for (const raw of lines) {
    const l = raw.trimEnd();
    if (l.startsWith('```')) {
      if (!inCode) { flushList(); inCode = true; codeLines = []; }
      else { out.push(`<pre class="md-pre"><code>${codeLines.join('\n').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</code></pre>`); inCode = false; }
      continue;
    }
    if (inCode) { codeLines.push(l); continue; }
    if (/^### /.test(l)) { flushList(); out.push(`<h3 class="md-h3">${inline(l.slice(4))}</h3>`); continue; }
    if (/^## /.test(l))  { flushList(); out.push(`<h2 class="md-h2">${inline(l.slice(3))}</h2>`); continue; }
    if (/^# /.test(l))   { flushList(); out.push(`<h1 class="md-h1">${inline(l.slice(2))}</h1>`); continue; }
    if (/^---+$/.test(l)){ flushList(); out.push('<hr class="md-hr">'); continue; }
    if (/^> /.test(l))   { flushList(); out.push(`<blockquote class="md-bq">${inline(l.slice(2))}</blockquote>`); continue; }
    const ulM = l.match(/^[-*+] (.+)/); if (ulM) { if (listOrdered&&listItems.length) flushList(); listOrdered=false; listItems.push(`<li>${inline(ulM[1])}</li>`); continue; }
    const olM = l.match(/^\d+\. (.+)/); if (olM) { if (!listOrdered&&listItems.length) flushList(); listOrdered=true; listItems.push(`<li>${inline(olM[1])}</li>`); continue; }
    if (l.trim()==='') { flushList(); out.push('<div class="md-sp"></div>'); continue; }
    flushList(); out.push(`<p class="md-p">${inline(l)}</p>`);
  }
  flushList();
  return out.join('');
}

// ── Score colour helper ───────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 75) return { bg: '#dcfce7', bar: '#16a34a', text: '#14532d', label: 'Goed' };
  if (s >= 50) return { bg: '#fef9c3', bar: '#ca8a04', text: '#713f12', label: 'Matig' };
  return          { bg: '#fee2e2', bar: '#dc2626', text: '#7f1d1d', label: 'Onvolledig' };
}

// ── localStorage prefs ────────────────────────────────────────────────────────
const PREFS_KEY = 'ai_panel_prefs_v1';
interface Prefs { selectedFields: string[]; customPrompt: string; includeImages: boolean; provider: string; }
function loadPrefs(): Prefs | null { try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'); } catch { return null; } }
function savePrefs(p: Prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* */ } }

const DEFAULT_PROMPT = 'Analyseer dit product en geef een conclusie over de volledigheid van de data, eventuele verbeterpunten en aanbevelingen.';

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function ProductAiPanel({ product, layout }: Props) {
  const [open, setOpen]                         = useState(false);
  const [providers, setProviders]               = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedFields, setSelectedFields]     = useState<Set<string>>(new Set());
  const [includeImages, setIncludeImages]       = useState(false);
  const [customPrompt, setCustomPrompt]         = useState(DEFAULT_PROMPT);
  const [imageList, setImageList]               = useState<string[]>([]);
  const [isPending, startTransition]            = useTransition();
  const [result, setResult]                     = useState<AnalysisResult | null>(null);
  const [savedResult, setSavedResult]           = useState<AnalysisResult | null>(null);
  const [showInputs, setShowInputs]             = useState(true);
  const [saving, setSaving]                     = useState(false);
  const [saved, setSaved]                       = useState(false);
  const [error, setError]                       = useState('');
  const [initialized, setInitialized]           = useState(false);

  // ── Field list (deduplicated by property path) ────────────────────────────
  const fieldMap = new Map<string, FieldEntry>();
  const coveredPaths = new Set<string>();
  for (const kf of KNOWN_FIELDS) {
    const v = resolvePath(product, kf.path);
    if (v) { fieldMap.set(kf.id, { id: kf.id, label: kf.label, value: v }); coveredPaths.add(kf.path); }
  }
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (field.type === 'chat' || field.type === 'media' || fieldMap.has(field.id)) continue;
      let value: string | null = null; let propPath: string;
      if (field.relationPath) { propPath = field.relationPath; value = resolvePath(product, field.relationPath); }
      else {
        const key = field.id.replace('FIELD:', '');
        propPath = key.startsWith('custom_') ? `customData.${key.replace('custom_', '')}` : key;
        value = key.startsWith('custom_') ? (product.customData?.[key.replace('custom_', '')] ?? null) : (product[key] != null ? String(product[key]) : null);
      }
      if (coveredPaths.has(propPath) || !value) continue;
      fieldMap.set(field.id, { id: field.id, label: field.label, value }); coveredPaths.add(propPath);
    }
  }
  const allFields = Array.from(fieldMap.values());

  // ── Load saved analysis from DB result ───────────────────────────────────
  function hydrateDbAnalysis(a: any): AnalysisResult {
    const { narrative, structured } = parseResponse(a.response);
    let storedStructured = structured;
    if (!storedStructured && a.structuredData) {
      try { storedStructured = JSON.parse(a.structuredData); } catch { /* */ }
    }
    return { ...a, narrative, structured: storedStructured, isFromDb: true, savedAt: a.updatedAt };
  }

  // ── Open panel ────────────────────────────────────────────────────────────
  const openPanel = async () => {
    setOpen(true);
    if (initialized) return;
    setInitialized(true);
    const prefs = loadPrefs();
    if (prefs) {
      setCustomPrompt(prefs.customPrompt ?? DEFAULT_PROMPT);
      setIncludeImages(prefs.includeImages ?? false);
      const avail = new Set(allFields.map(f => f.id));
      setSelectedFields(new Set((prefs.selectedFields ?? []).filter((id: string) => avail.has(id))));
      if (prefs.provider) setSelectedProvider(prefs.provider);
    }
    const provRes = await fetch('/api/ai/providers').catch(() => null);
    if (provRes?.ok) {
      const active = (await provRes.json()).filter((p: any) => p.hasApiKey);
      setProviders(active);
      if (active.length > 0) setSelectedProvider(prev => prev || active[0].provider);
    }
    const anaRes = await fetch(`/api/ai/analysis?article=${encodeURIComponent(product.internalArticleNumber)}`).catch(() => null);
    if (anaRes?.ok) { const d = await anaRes.json(); if (d.analysis) setSavedResult(hydrateDbAnalysis(d.analysis)); }
    const imgRes = await fetch(`/api/ai/images?article=${encodeURIComponent(product.internalArticleNumber)}`).catch(() => null);
    if (imgRes?.ok) { const d = await imgRes.json(); setImageList(d.images ?? []); }
  };

  useEffect(() => {
    if (!open) return;
    savePrefs({ selectedFields: Array.from(selectedFields), customPrompt, includeImages, provider: selectedProvider });
  }, [selectedFields, customPrompt, includeImages, selectedProvider, open]);

  const toggleField = (id: string) => setSelectedFields(prev => { const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const selectAll   = () => setSelectedFields(new Set(allFields.map(f => f.id)));
  const selectNone  = () => setSelectedFields(new Set());
  const totalSelected = selectedFields.size + (includeImages && imageList.length > 0 ? 1 : 0);

  const buildPrompt = () => {
    const lines = allFields.filter(f => selectedFields.has(f.id)).map(f => `${f.label}: ${f.value}`);
    if (includeImages && imageList.length > 0) {
      lines.push(`Foto's: ${imageList.length} afbeelding(en)`);
      imageList.forEach((img, i) => lines.push(`  Foto ${i + 1}: ${window.location.origin}${img}`));
    }
    return customPrompt + (lines.length > 0 ? `\n\n--- Productgegevens ---\n${lines.join('\n')}` : '');
  };

  const runAnalysis = () => {
    if (!selectedProvider || isPending) return;
    setError(''); setSaving(false); setSaved(false);
    const prompt = buildPrompt();
    const t0 = Date.now();
    startTransition(async () => {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, prompt, systemPrompt: SYSTEM_PROMPT, context: 'product-analysis' }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Onbekende fout'); return; }
      const { narrative, structured } = parseResponse(data.response);
      setResult({
        response: data.response, narrative, structured,
        structuredData: structured ? JSON.stringify(structured) : undefined,
        provider: selectedProvider, model: data.model,
        inputTokens: data.usage.inputTokens, outputTokens: data.usage.outputTokens,
        costUsd: data.usage.costUsd, durationMs: Date.now() - t0,
      });
      setShowInputs(false);
    });
  };

  const saveAnalysis = async () => {
    if (!result) return;
    setSaving(true);
    const res = await fetch('/api/ai/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleNumber: product.internalArticleNumber, ...result }),
    });
    const data = await res.json();
    if (res.ok) { setSavedResult({ ...result, isFromDb: true, savedAt: new Date().toISOString() }); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    else { setError(data.error ?? 'Opslaan mislukt'); }
    setSaving(false);
  };

  const loadSaved = () => { if (savedResult) { setResult(savedResult); setShowInputs(false); setError(''); } };

  const displayResult = result ?? (showInputs ? null : savedResult);

  // ── Scorecard ─────────────────────────────────────────────────────────────
  const Scorecard = ({ s }: { s: StructuredAnalysis }) => {
    const c = scoreColor(s.score);
    return (
      <div style={{ margin: '0', padding: '1.25rem 1.75rem', backgroundColor: c.bg, borderBottom: '1px solid #e4d9f8' }}>
        {/* Score bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}>
            <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e4d9f8" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={c.bar} strokeWidth="3"
                strokeDasharray={`${s.score} ${100 - s.score}`} strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: c.text, lineHeight: 1 }}>{s.score}</span>
              <span style={{ fontSize: '0.5rem', color: c.text, opacity: 0.8 }}>/ 100</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: c.text }}>{c.label}</span>
              <span style={{ fontSize: '0.8rem', color: c.text, opacity: 0.8 }}>{s.summary}</span>
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: '0.4rem', height: '6px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '99px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${s.score}%`, backgroundColor: c.bar, borderRadius: '99px', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        </div>

        {/* Three columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {/* Strengths */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Sterktes</div>
            {s.strengths.length === 0
              ? <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Geen</span>
              : s.strengths.map((st, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: '#14532d', display: 'flex', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <span style={{ flexShrink: 0, color: '#16a34a' }}>•</span><span>{st}</span>
                </div>
              ))}
          </div>

          {/* Missing */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚠ Ontbrekend</div>
            {s.missing_fields.length === 0
              ? <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Niets</span>
              : s.missing_fields.map((f, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: '#7f1d1d', display: 'flex', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <span style={{ flexShrink: 0, color: '#dc2626' }}>•</span><span>{f}</span>
                </div>
              ))}
          </div>

          {/* Recommendations */}
          <div style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: '8px', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 Aanbevelingen</div>
            {s.recommendations.length === 0
              ? <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>Geen</span>
              : s.recommendations.map((r, i) => (
                <div key={i} style={{ fontSize: '0.78rem', color: '#3b0764', display: 'flex', gap: '0.3rem', marginBottom: '0.2rem' }}>
                  <span style={{ flexShrink: 0, color: '#7c3aed' }}>•</span><span>{r}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button type="button" onClick={openPanel}
        style={{ display:'inline-flex', alignItems:'center', gap:'0.4rem', padding:'0.4rem 0.85rem', borderRadius:'var(--radius)', border:'1px solid #c4b5fd', backgroundColor:'#f5f3ff', color:'#7c3aed', fontWeight:600, fontSize:'0.8rem', cursor:'pointer', transition:'all 0.15s', flexShrink:0 }}
        onMouseEnter={e=>{e.currentTarget.style.backgroundColor='#ede9fe';}}
        onMouseLeave={e=>{e.currentTarget.style.backgroundColor='#f5f3ff';}}>
        🤖 Analyseer
      </button>
    );
  }

  return (
    <div style={{ borderRadius:'var(--radius-lg)', border:'1.5px solid #c4b5fd', backgroundColor:'#faf5ff', overflow:'hidden', marginTop:'1rem' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1.25rem', backgroundColor:'#7c3aed', color:'white', gap:'0.75rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', flex:1, flexWrap:'wrap' }}>
          <span style={{ fontWeight:700, fontSize:'0.9rem', whiteSpace:'nowrap' }}>🤖 AI Productanalyse</span>
          {providers.map(p => (
            <button key={p.provider} type="button" onClick={() => setSelectedProvider(p.provider)}
              style={{ padding:'0.2rem 0.6rem', borderRadius:'999px', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1.5px solid', borderColor: selectedProvider===p.provider?'white':'rgba(255,255,255,0.4)', backgroundColor: selectedProvider===p.provider?'white':'transparent', color: selectedProvider===p.provider?'#7c3aed':'rgba(255,255,255,0.85)' }}>
              {PROVIDER_ICONS[p.provider]} {PROVIDER_LABELS[p.provider]}
            </button>
          ))}
          {savedResult && !result && (
            <button type="button" onClick={loadSaved}
              style={{ padding:'0.2rem 0.7rem', borderRadius:'999px', fontSize:'0.72rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(255,255,255,0.5)', backgroundColor:'rgba(255,255,255,0.15)', color:'white' }}>
              📂 Laad opgeslagen analyse
            </button>
          )}
        </div>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          {displayResult && (
            <button type="button" onClick={() => setShowInputs(v => !v)}
              style={{ padding:'0.2rem 0.7rem', borderRadius:'999px', fontSize:'0.72rem', fontWeight:600, cursor:'pointer', border:'1px solid rgba(255,255,255,0.5)', backgroundColor:'rgba(255,255,255,0.15)', color:'white', whiteSpace:'nowrap' }}>
              {showInputs ? '▲ Verberg' : '▼ Aanpassen'}
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.8)', cursor:'pointer', fontSize:'1.2rem', lineHeight:1 }}>✕</button>
        </div>
      </div>

      {/* Input panel (collapsible) */}
      {(showInputs || !displayResult) && (
        <div style={{ padding:'1.1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.85rem', borderBottom: displayResult ? '1.5px solid #c4b5fd' : 'none' }}>
          {providers.length === 0 && <p style={{ color:'#7c3aed', fontSize:'0.85rem', opacity:0.8 }}>⚙️ Geen providers beschikbaar. Stel een API key in via Systeeminstellingen.</p>}

          {providers.length > 0 && (<>
            {/* Field picker */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.4rem' }}>
                <label style={{ fontSize:'0.78rem', fontWeight:700, color:'#5b21b6' }}>
                  Velden meesturen als context
                  {totalSelected > 0 && <span style={{ fontWeight:400, color:'#7c3aed', marginLeft:'0.4rem' }}>({totalSelected} geselecteerd)</span>}
                </label>
                <div style={{ display:'flex', gap:'0.75rem' }}>
                  <button type="button" onClick={selectAll}  style={{ fontSize:'0.7rem', color:'#7c3aed', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Alles</button>
                  <button type="button" onClick={selectNone} style={{ fontSize:'0.7rem', color:'#7c3aed', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Geen</button>
                </div>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem' }}>
                {allFields.map(f => (
                  <button key={f.id} type="button" onClick={() => toggleField(f.id)} title={f.value.length > 60 ? f.value.slice(0,100)+'…' : f.value}
                    style={{ padding:'0.18rem 0.5rem', borderRadius:'999px', fontSize:'0.71rem', border: selectedFields.has(f.id)?'1px solid #7c3aed':'1px solid #ddd6fe', backgroundColor: selectedFields.has(f.id)?'#7c3aed':'white', color: selectedFields.has(f.id)?'white':'#5b21b6', cursor:'pointer', fontWeight: selectedFields.has(f.id)?600:400 }}>
                    {f.label}
                  </button>
                ))}
                <button type="button" onClick={() => setIncludeImages(v => !v)}
                  style={{ padding:'0.18rem 0.5rem', borderRadius:'999px', fontSize:'0.71rem', border: includeImages?'1px solid #7c3aed':'1px solid #ddd6fe', backgroundColor: includeImages?'#7c3aed':'white', color: includeImages?'white':'#5b21b6', cursor:'pointer', fontWeight: includeImages?600:400 }}>
                  🖼 Foto's {imageList.length > 0 && `(${imageList.length})`}
                </button>
              </div>
            </div>

            {/* Prompt */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.3rem' }}>
                <label style={{ fontSize:'0.78rem', fontWeight:700, color:'#5b21b6' }}>Vraag / instructie</label>
                <span style={{ fontSize:'0.65rem', color:'#a78bfa' }}>💾 automatisch bewaard</span>
              </div>
              <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={2}
                style={{ width:'100%', padding:'0.55rem', borderRadius:'var(--radius)', border:'1px solid #ddd6fe', backgroundColor:'white', fontSize:'0.82rem', resize:'vertical', color:'#1e1b4b', boxSizing:'border-box' }} />
            </div>

            {error && <div style={{ padding:'0.7rem', borderRadius:'var(--radius)', backgroundColor:'#fef2f2', border:'1px solid #fca5a5', color:'#dc2626', fontSize:'0.82rem' }}>❌ {error}</div>}

            <button type="button" onClick={runAnalysis} disabled={isPending || totalSelected === 0}
              style={{ padding:'0.6rem 1.4rem', borderRadius:'var(--radius)', backgroundColor: isPending||totalSelected===0?'#a78bfa':'#7c3aed', color:'white', border:'none', fontWeight:700, fontSize:'0.88rem', cursor: isPending||totalSelected===0?'not-allowed':'pointer', alignSelf:'flex-start', display:'flex', alignItems:'center', gap:'0.4rem' }}>
              {isPending ? <><span style={{ display:'inline-block', width:'14px', height:'14px', border:'2px solid white', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /> Analyseren…</> : '🤖 Analyseren'}
            </button>
          </>)}
        </div>
      )}

      {/* Result */}
      {displayResult && (
        <div>
          {/* Scorecard */}
          {displayResult.structured && <Scorecard s={displayResult.structured} />}

          {/* Meta bar */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 1.25rem', backgroundColor:'#ede9fe', borderBottom:'1px solid #ddd6fe' }}>
            <div style={{ display:'flex', gap:'0.9rem', fontSize:'0.71rem', color:'#5b21b6', flexWrap:'wrap', alignItems:'center' }}>
              <span>{PROVIDER_ICONS[displayResult.provider]} {displayResult.model}</span>
              <span>📥 {displayResult.inputTokens.toLocaleString()} in</span>
              <span>📤 {displayResult.outputTokens.toLocaleString()} out</span>
              {displayResult.durationMs && <span>⏱ {displayResult.durationMs < 1000 ? `${displayResult.durationMs}ms` : `${(displayResult.durationMs/1000).toFixed(1)}s`}</span>}
              <span>💰 ${displayResult.costUsd.toFixed(5)}</span>
              {displayResult.isFromDb && displayResult.savedAt && (
                <span style={{ color:'#059669', fontWeight:600 }}>
                  💾 {new Date(displayResult.savedAt).toLocaleDateString('nl-NL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                </span>
              )}
            </div>
            <div style={{ display:'flex', gap:'0.5rem' }}>
              {result && (
                <button type="button" onClick={saveAnalysis} disabled={saving}
                  style={{ padding:'0.25rem 0.75rem', borderRadius:'var(--radius)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1px solid #7c3aed', backgroundColor: saved?'#dcfce7':'white', color: saved?'#16a34a':'#7c3aed', transition:'all 0.2s' }}>
                  {saving?'Opslaan…':saved?'✓ Opgeslagen!':'💾 Opslaan'}
                </button>
              )}
              {savedResult && result && (
                <button type="button" onClick={loadSaved}
                  style={{ padding:'0.25rem 0.75rem', borderRadius:'var(--radius)', fontSize:'0.75rem', fontWeight:600, cursor:'pointer', border:'1px solid #ddd6fe', backgroundColor:'white', color:'#5b21b6' }}>
                  📂 Opgeslagen versie
                </button>
              )}
            </div>
          </div>

          {/* Narrative markdown */}
          <div className="md-response" style={{ padding:'1.5rem 1.75rem', overflowY:'auto', maxHeight:'55vh', backgroundColor:'white', lineHeight:1.7, fontSize:'0.9rem', color:'#1e1b4b' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(displayResult.narrative) }} />
        </div>
      )}

      <style>{`
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .md-response .md-h1{font-size:1.2rem;font-weight:800;margin:1.25rem 0 .5rem;color:#3b0764}
        .md-response .md-h2{font-size:1.05rem;font-weight:700;margin:1rem 0 .4rem;color:#3b0764;border-bottom:1px solid #e4d9f8;padding-bottom:.25rem}
        .md-response .md-h3{font-size:.95rem;font-weight:700;margin:.75rem 0 .3rem;color:#4c1d95}
        .md-response .md-p{margin:.35rem 0}
        .md-response .md-sp{height:.5rem}
        .md-response .md-list{margin:.35rem 0 .35rem 1.4rem}
        .md-response .md-list li{margin:.15rem 0}
        .md-response .md-bq{border-left:3px solid #c4b5fd;padding:.4rem .75rem;margin:.6rem 0;background:#f5f3ff;border-radius:0 4px 4px 0;color:#4c1d95}
        .md-response .md-hr{border:none;border-top:1px solid #e4d9f8;margin:.75rem 0}
        .md-response .md-pre{background:#1e1b4b;color:#e2d9f3;padding:.85rem;border-radius:6px;overflow-x:auto;margin:.75rem 0;font-family:monospace;font-size:.82rem}
        .md-response .md-c{background:#f0ebff;padding:.1rem .3rem;border-radius:3px;font-family:monospace;font-size:.85em;color:#5b21b6}
      `}</style>
    </div>
  );
}
