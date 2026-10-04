'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  EmpcoIssue, EmpcoResult, EmpcoStatus, EMPCO_STATUS_META, ruleLabel, EMPCO_RULES,
  EmpcoGuidelineLink, DEFAULT_EMPCO_GUIDELINE_LINKS, DEFAULT_EMPCO_GUIDELINE_NOTES,
  isEmpcoIssueFixable, replaceEmpcoFragment, locateFragment,
} from '@/lib/empco';
import { applyEmpcoBulkFixesAction } from '@/app/actions/empco';

export const EMPCO_ACCENT = '#0f766e';
export const EMPCO_GRADIENT = 'linear-gradient(135deg, #0f766e 0%, #065f46 100%)';

export type EmpcoBadgeState = EmpcoStatus | 'STALE' | 'NONE';

export function empcoBadgeState(status?: string | null, stale?: boolean): EmpcoBadgeState {
  if (!status) return 'NONE';
  if (stale) return 'STALE';
  return (status === 'PASS' || status === 'WARNING' || status === 'FAIL') ? status : 'NONE';
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function EmpcoBadge({ state, issueCount, onClick, compact = false, title }: {
  state: EmpcoBadgeState; issueCount?: number; onClick?: (e: React.MouseEvent) => void; compact?: boolean; title?: string;
}) {
  const m = EMPCO_STATUS_META[state];
  const text = compact
    ? (state === 'FAIL' || state === 'WARNING') && issueCount ? `${issueCount}` : ''
    : m.label + ((state === 'FAIL' || state === 'WARNING') && issueCount ? ` (${issueCount})` : '');

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: compact ? '0.18rem 0.5rem' : '0.22rem 0.65rem', borderRadius: '999px',
    fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
    backgroundColor: m.bg, color: m.color,
    borderWidth: '1px',
    borderStyle: state === 'NONE' ? 'dashed' : 'solid',
    borderColor: m.border,
    cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s',
  };

  const badgeTitle = title ?? `EmpCo: ${m.label}${(state === 'FAIL' || state === 'WARNING') && issueCount ? ` — ${issueCount} bevinding${issueCount === 1 ? '' : 'en'}` : ''}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={badgeTitle}
        className="empco-badge"
        style={badgeStyle}
      >
        <span>{m.icon}</span>{text && <span>{text}</span>}
      </button>
    );
  }

  return (
    <span
      title={badgeTitle}
      className="empco-badge"
      style={badgeStyle}
    >
      <span>{m.icon}</span>{text && <span>{text}</span>}
    </span>
  );
}

// ── Context snippet with highlighted fragment ────────────────────────────────
function ContextSnippet({ text, fragment }: { text: string; fragment: string }) {
  const idx = fragment ? text.indexOf(fragment) : -1;
  if (idx < 0) return null;
  const start = Math.max(0, idx - 70);
  const end = Math.min(text.length, idx + fragment.length + 70);
  return (
    <div style={{ fontSize: '0.76rem', color: '#475569', lineHeight: 1.55, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.45rem 0.6rem', marginTop: '0.45rem' }}>
      {start > 0 && '…'}{text.slice(start, idx)}
      <mark style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '0 2px', borderRadius: '3px', fontWeight: 600 }}>{fragment}</mark>
      {text.slice(idx + fragment.length, end)}{end < text.length && '…'}
    </div>
  );
}

// ── Single issue card ─────────────────────────────────────────────────────────
function IssueCard({ issue, fieldValue, actions }: { issue: EmpcoIssue; fieldValue?: string; actions?: React.ReactNode }) {
  const isFail = issue.severity === 'FAIL';

  // Compute resulting sentence preview if fieldValue contains the fragment
  const sentencePreview = React.useMemo(() => {
    if (!fieldValue || !issue.original || issue.field.startsWith('crit')) return null;
    const replaced = replaceEmpcoFragment(fieldValue, issue.original, issue.replacement);
    if (!replaced) return null;

    const loc = locateFragment(fieldValue, issue.original);
    if (!loc) return null;

    // Find sentence boundaries around loc.idx in replaced text
    const changeStart = Math.min(loc.idx, replaced.length);
    let sStart = replaced.lastIndexOf('.', changeStart - 1);
    const qStart = replaced.lastIndexOf('?', changeStart - 1);
    const eStart = replaced.lastIndexOf('!', changeStart - 1);
    const nStart = replaced.lastIndexOf('\n', changeStart - 1);
    sStart = Math.max(sStart, qStart, eStart, nStart);
    sStart = sStart === -1 ? 0 : sStart + 1;

    let sEnd = replaced.indexOf('.', changeStart);
    if (sEnd === -1) {
      const qEnd = replaced.indexOf('?', changeStart);
      const eEnd = replaced.indexOf('!', changeStart);
      const candidates = [qEnd, eEnd].filter(n => n !== -1);
      sEnd = candidates.length > 0 ? Math.min(...candidates) + 1 : replaced.length;
    } else {
      sEnd = sEnd + 1;
    }

    const snippet = replaced.slice(sStart, sEnd).trim();
    if (!snippet || snippet === fieldValue.trim()) return null;
    return snippet;
  }, [fieldValue, issue.original, issue.replacement, issue.field]);

  return (
    <div className="empco-issue" style={{
      borderTop: `1px solid ${isFail ? '#fecaca' : '#fde68a'}`,
      borderRight: `1px solid ${isFail ? '#fecaca' : '#fde68a'}`,
      borderBottom: `1px solid ${isFail ? '#fecaca' : '#fde68a'}`,
      borderLeft: `4px solid ${isFail ? '#dc2626' : '#d97706'}`,
      borderRadius: '10px', padding: '0.85rem 1rem', backgroundColor: 'white',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.04em', padding: '0.12rem 0.5rem', borderRadius: '999px', backgroundColor: isFail ? '#fee2e2' : '#fef3c7', color: isFail ? '#b91c1c' : '#92400e' }}>
          {isFail ? '⛔ OVERTREDING' : '⚠️ AANDACHTSPUNT'}
        </span>
        <span title={EMPCO_RULES[issue.rule]?.description} style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0f172a', cursor: 'help', borderBottom: '1px dotted #94a3b8' }}>
          {ruleLabel(issue.rule)}
        </span>
        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>in <strong style={{ color: '#334155' }}>{issue.fieldLabel || issue.field}</strong></span>
        <div style={{ flex: 1 }} />
        {actions}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>{issue.explanation}</div>
      {fieldValue && <ContextSnippet text={fieldValue} fragment={issue.original} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px', padding: '0.5rem 0.65rem' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#b91c1c', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>HUIDIGE TEKST</div>
          <div style={{ fontSize: '0.8rem', color: '#7f1d1d', textDecoration: 'line-through', textDecorationColor: '#f87171', wordBreak: 'break-word' }}>{issue.original || '—'}</div>
        </div>
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '0.5rem 0.65rem' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#15803d', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>VOORSTEL</div>
          <div style={{ fontSize: '0.8rem', color: '#14532d', wordBreak: 'break-word', fontStyle: issue.replacement ? 'normal' : 'italic' }}>
            {issue.replacement || (issue.field.startsWith('crit') ? 'Kenmerk uitzetten of onderbouwen met erkende certificering' : '(fragment verwijderen)')}
          </div>
        </div>
      </div>
      {sentencePreview && (
        <div style={{
          marginTop: '0.55rem',
          padding: '0.45rem 0.65rem',
          borderRadius: '7px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}>
          <div style={{ fontSize: '0.63rem', fontWeight: 800, color: '#15803d', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>✓</span> RESULTAAT IN DE ZIN (VLOEIENDE ZINSOPBOUW):
          </div>
          <div style={{ fontSize: '0.78rem', color: '#14532d', fontStyle: 'italic', lineHeight: 1.45 }}>
            &ldquo;{sentencePreview}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}

// ── Guidelines & Legislation Modal ───────────────────────────────────────────
export function EmpcoGuidelinesModal({
  isOpen,
  onClose,
  initialGuidelines,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialGuidelines?: { notes?: string; links?: EmpcoGuidelineLink[] };
}) {
  const [links, setLinks] = useState<EmpcoGuidelineLink[]>(initialGuidelines?.links ?? DEFAULT_EMPCO_GUIDELINE_LINKS);
  const [notes, setNotes] = useState<string>(initialGuidelines?.notes ?? DEFAULT_EMPCO_GUIDELINE_NOTES);
  const [activeTab, setActiveTab] = useState<'links' | 'rules' | 'notes'>('links');

  useEffect(() => {
    if (!isOpen) return;
    if (initialGuidelines?.links?.length) {
      setLinks(initialGuidelines.links);
      if (initialGuidelines.notes) setNotes(initialGuidelines.notes);
      return;
    }
    fetch('/api/ai/empco')
      .then(r => r.json())
      .then(d => {
        if (d?.guidelines?.links) setLinks(d.guidelines.links);
        if (d?.guidelines?.notes) setNotes(d.guidelines.notes);
      })
      .catch(() => {});
  }, [isOpen, initialGuidelines]);

  if (!isOpen) return null;

  return (
    <EmpcoModalShell
      title="EmpCo Wetgeving & Richtlijnen"
      subtitle="Directe controle met officiële wetgeving (EUR-Lex & ACM Leidraad)"
      onClose={onClose}
      width={900}
      zIndex={9200}
      headerRight={
        <a
          href="/admin/system"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '0.74rem',
            padding: '0.3rem 0.7rem',
            borderRadius: '6px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'white',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 700,
          }}
          title="Open Systeeminstellingen om EmpCo-richtlijnen en te controleren velden aan te passen"
        >
          ⚙️ Instellingen beheren ↗
        </a>
      }
    >
      <div style={{ padding: '1.2rem 1.4rem' }}>
        {/* Intro */}
        <div style={{
          backgroundColor: '#f0fdfa',
          border: '1px solid #99f6e4',
          borderRadius: '10px',
          padding: '0.85rem 1.1rem',
          marginBottom: '1.1rem',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🏛️</span>
          <div style={{ fontSize: '0.82rem', color: '#134e4a', lineHeight: 1.55 }}>
            <strong>Toetsingskader tegen greenwashing:</strong> Sinds Richtlijn (EU) 2024/825 en de ACM Leidraad Duurzaamheidsclaims zijn vage, misleidende of ongecertificeerde milieuclaims verboden. Raadpleeg hieronder direct de officiële wetteksten om na te gaan of productinformatie in strijd is met de wet.
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '0.45rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.6rem', marginBottom: '1.1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('links')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'links' ? EMPCO_ACCENT : '#f1f5f9',
              color: activeTab === 'links' ? 'white' : '#475569',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🔗</span> Officiële Wetgevingsbronnen ({links.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'rules' ? EMPCO_ACCENT : '#f1f5f9',
              color: activeTab === 'rules' ? 'white' : '#475569',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>⚖️</span> De 9 EmpCo Toetscriteria ({Object.keys(EMPCO_RULES).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '7px',
              border: 'none',
              backgroundColor: activeTab === 'notes' ? EMPCO_ACCENT : '#f1f5f9',
              color: activeTab === 'notes' ? 'white' : '#475569',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>📝</span> Webshop Richtlijnen
          </button>
        </div>

        {/* Tab 1: Links */}
        {activeTab === 'links' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
            {links.map((link) => {
              const catLabel =
                link.category === 'eu_law' ? '🇪🇺 Europese Wetgeving' :
                link.category === 'national_authority' ? '🇳🇱 Toezichthouder (ACM/Overheid)' :
                link.category === 'guideline' ? '📋 Leidraad' : '🔗 Officiële Bron';
              return (
                <div
                  key={link.id || link.url}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '0.85rem 1.05rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.12rem 0.5rem',
                        borderRadius: '999px',
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                      }}>
                        {catLabel}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{link.title}</span>
                    </div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '0.32rem 0.8rem',
                        borderRadius: '6px',
                        backgroundColor: '#0f766e',
                        color: 'white',
                        textDecoration: 'none',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: '0 2px 6px rgba(15,118,110,0.22)',
                      }}
                    >
                      Openen ↗
                    </a>
                  </div>
                  {link.description && (
                    <div style={{ fontSize: '0.79rem', color: '#475569', lineHeight: 1.5 }}>
                      {link.description}
                    </div>
                  )}
                  <div style={{ fontSize: '0.71rem', color: '#94a3b8', wordBreak: 'break-all' }}>
                    {link.url}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Rules */}
        {activeTab === 'rules' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.65rem' }}>
            {Object.entries(EMPCO_RULES).map(([code, rule]) => (
              <div
                key={code}
                style={{
                  backgroundColor: 'white',
                  borderTop: '1px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  borderBottom: '1px solid #e2e8f0',
                  borderLeft: `4px solid ${EMPCO_ACCENT}`,
                  borderRadius: '8px',
                  padding: '0.8rem 1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>{rule.label}</span>
                  <span style={{ fontSize: '0.66rem', fontFamily: 'monospace', color: '#64748b', backgroundColor: '#f1f5f9', padding: '0.08rem 0.4rem', borderRadius: '4px' }}>{code}</span>
                </div>
                <div style={{ fontSize: '0.79rem', color: '#334155', lineHeight: 1.5 }}>
                  {rule.description}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 3: Notes */}
        {activeTab === 'notes' && (
          <div style={{
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '1.1rem',
            whiteSpace: 'pre-wrap',
            fontSize: '0.82rem',
            lineHeight: 1.7,
            color: '#1e293b',
          }}>
            {notes || DEFAULT_EMPCO_GUIDELINE_NOTES}
          </div>
        )}
      </div>
    </EmpcoModalShell>
  );
}

// ── Full result view ─────────────────────────────────────────────────────────
export function EmpcoResultView({
  result,
  stale,
  fieldValues,
  renderIssueActions,
  footerNote,
  guidelines,
}: {
  result: EmpcoResult;
  stale?: boolean;
  fieldValues?: Record<string, string>;
  renderIssueActions?: (issue: EmpcoIssue, index: number) => React.ReactNode;
  footerNote?: React.ReactNode;
  guidelines?: { notes?: string; links?: EmpcoGuidelineLink[] };
}) {
  const [showGuidelines, setShowGuidelines] = useState(false);
  const state = empcoBadgeState(result.status, stale);
  const m = EMPCO_STATUS_META[result.status];
  const fails = result.issues.filter(i => i.severity === 'FAIL').length;
  const warns = result.issues.length - fails;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Status banner */}
      <div style={{ padding: '1.1rem 1.4rem', backgroundColor: m.bg, borderBottom: `1px solid ${m.border}`, display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ fontSize: '2rem', lineHeight: 1 }}>{m.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, color: m.color, fontSize: '1rem' }}>
              {result.status === 'PASS' ? 'EmpCo-proof' : result.status === 'FAIL' ? 'Niet EmpCo-proof' : 'Aandacht nodig'}
            </span>
            {fails > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c', backgroundColor: '#fee2e2', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>{fails} overtreding{fails === 1 ? '' : 'en'}</span>}
            {warns > 0 && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>{warns} aandachtspunt{warns === 1 ? '' : 'en'}</span>}
            {state === 'STALE' && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', backgroundColor: '#e2e8f0', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>🕓 teksten gewijzigd sinds deze check</span>}
          </div>
          {result.summary && <div style={{ fontSize: '0.84rem', color: '#334155', marginTop: '0.25rem' }}>{result.summary}</div>}
        </div>
      </div>

      {/* Issues */}
      <div style={{ padding: '1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {result.issues.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#15803d', fontSize: '0.88rem' }}>
            {result.resolved?.length
              ? 'Alle bevindingen zijn verwerkt. 🌱'
              : 'Geen problematische milieu- of duurzaamheidsclaims gevonden. 🌱'}
          </div>
        )}
        {result.issues.map((issue, i) => (
          <IssueCard key={i} issue={issue} fieldValue={fieldValues?.[issue.field]} actions={renderIssueActions?.(issue, i)} />
        ))}

        {(result.resolved?.length ?? 0) > 0 && (
          <details style={{ border: '1px solid #99f6e4', backgroundColor: '#f0fdfa', borderRadius: '10px', padding: '0.6rem 1rem' }}>
            <summary style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0f766e', letterSpacing: '0.04em', cursor: 'pointer' }}>
              ✔ VERWERKTE BEVINDINGEN ({result.resolved!.length})
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
              {result.resolved!.map((r, i) => (
                <div key={i} style={{ fontSize: '0.76rem', color: '#334155', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700 }}>{r.fieldLabel ?? r.field}:</span>
                  <span style={{ textDecoration: 'line-through', color: '#b91c1c' }}>{r.original}</span>
                  {r.replacement && <><span>→</span><span style={{ color: '#15803d' }}>{r.replacement}</span></>}
                  <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                    ({r.via === 'EMPCO' ? 'voorstel overgenomen' : 'tekst aangepast'} · {new Date(r.resolvedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })})
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {result.compliant_claims?.length > 0 && (
          <div style={{ border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', borderRadius: '10px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#15803d', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>✓ TOEGESTANE (SPECIFIEKE) CLAIMS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {result.compliant_claims.map((c, i) => (
                <span key={i} style={{ fontSize: '0.75rem', color: '#14532d', backgroundColor: 'white', border: '1px solid #bbf7d0', borderRadius: '999px', padding: '0.15rem 0.6rem' }}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Legislation & Guidelines info box */}
        <div style={{
          marginTop: '0.5rem',
          padding: '0.75rem 1rem',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '0.73rem', color: '#64748b', lineHeight: 1.5, flex: 1, minWidth: '240px' }}>
            ℹ️ Deze check toetst aan de <strong>EmpCo-richtlijn (EU 2024/825)</strong> en de <strong>ACM Leidraad Duurzaamheidsclaims</strong>.
            {footerNote}
          </div>
          <button
            type="button"
            onClick={() => setShowGuidelines(true)}
            style={{
              padding: '0.32rem 0.75rem',
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '7px',
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#065f46',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚖️</span> Wetgeving & richtlijnen raadplegen
          </button>
        </div>

        {showGuidelines && (
          <EmpcoGuidelinesModal
            isOpen={showGuidelines}
            onClose={() => setShowGuidelines(false)}
            initialGuidelines={guidelines}
          />
        )}
      </div>
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
export function EmpcoModalShell({ title, subtitle, onClose, headerRight, children, width = 980, zIndex = 9000 }: {
  title: string; subtitle?: string; onClose: () => void; headerRight?: React.ReactNode; children: React.ReactNode; width?: number; zIndex?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2,20,18,0.55)', zIndex, backdropFilter: 'blur(3px)', animation: 'empco-fade 0.2s ease' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: `min(94vw, ${width}px)`, maxHeight: '92vh', backgroundColor: '#f8fafc', borderRadius: '16px', overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.35)', zIndex: zIndex + 1, display: 'flex', flexDirection: 'column', animation: 'empco-pop 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.95rem 1.3rem', background: EMPCO_GRADIENT, color: 'white', flexShrink: 0 }}>
          <span style={{ fontSize: '1.25rem' }}>⚖️</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{title}</div>
            {subtitle && <div style={{ fontSize: '0.75rem', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
          </div>
          <div style={{ flex: 1 }} />
          {headerRight}
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, padding: '0 0.25rem' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
      </div>
      <style>{`
        @keyframes empco-fade{from{opacity:0}to{opacity:1}}
        @keyframes empco-pop{from{opacity:0;transform:translate(-50%,-48%) scale(.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        @keyframes empco-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .empco-badge:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 2px 6px rgba(0,0,0,.08)}
        .empco-issue{animation:empco-fade .25s ease}
      `}</style>
    </>,
    document.body
  );
}

export function EmpcoSpinner({ size = 14, color = EMPCO_ACCENT }: { size?: number; color?: string }) {
  return <span style={{ display: 'inline-block', width: size, height: size, border: `2px solid ${color}33`, borderTopColor: color, borderRadius: '50%', animation: 'empco-spin 0.8s linear infinite', flexShrink: 0 }} />;
}

// ── Interactive viewer & quick-fix modal (product list) ───────────────────────
export default function EmpcoViewer({
  articleNumber,
  productTitle,
  status,
  stale,
  issueCount,
  onOpenProduct,
}: {
  articleNumber: string;
  productTitle?: string;
  status?: string | null;
  stale?: boolean;
  issueCount?: number;
  onOpenProduct?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ check: any; stale: boolean; guidelines?: any } | null>(null);
  const [error, setError] = useState('');
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [appliedStatus, setAppliedStatus] = useState<Record<number, 'ok' | string>>({});
  const [applyingAll, setApplyingAll] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const state = empcoBadgeState(status, stale);

  const loadCheck = async () => {
    try {
      const res = await fetch(`/api/ai/empco?article=${encodeURIComponent(articleNumber)}`);
      const d = await res.json();
      if (!res.ok) setError(d.error ?? 'Laden mislukt');
      else if (!d.check?.result) setError('Geen EmpCo-check gevonden.');
      else setData(d);
    } catch { setError('Laden mislukt'); }
  };

  const openViewer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'NONE') return;
    setOpen(true);
    setLoading(true); setError(''); setAppliedStatus({}); setActionSuccessMsg('');
    await loadCheck();
    setLoading(false);
  };

  const handleApplySingle = async (idx: number) => {
    setApplyingIdx(idx);
    setActionSuccessMsg('');
    try {
      const res = await applyEmpcoBulkFixesAction([{ articleNumber, issueIdx: [idx] }]);
      const r = res[0];
      if (r?.error) {
        setAppliedStatus(prev => ({ ...prev, [idx]: r.error || 'Mislukt' }));
      } else if (r?.applied) {
        setAppliedStatus(prev => ({ ...prev, [idx]: 'ok' }));
        setActionSuccessMsg('Voorstel succesvol doorgevoerd en opgeslagen in product!');
        await loadCheck();
        router.refresh();
      }
    } catch (err: any) {
      setAppliedStatus(prev => ({ ...prev, [idx]: err?.message || 'Mislukt' }));
    } finally {
      setApplyingIdx(null);
    }
  };

  const handleApplyAll = async () => {
    const issues = data?.check?.result?.issues ?? [];
    const fixableIndices = issues
      .map((issue: EmpcoIssue, idx: number) => (isEmpcoIssueFixable(issue) ? idx : -1))
      .filter((idx: number) => idx !== -1);
    if (fixableIndices.length === 0) return;
    setApplyingAll(true);
    setActionSuccessMsg('');
    try {
      const res = await applyEmpcoBulkFixesAction([{ articleNumber, issueIdx: fixableIndices }]);
      const r = res[0];
      if (r?.applied) {
        setActionSuccessMsg(`Alle ${r.applied} voorstellen succesvol doorgevoerd en opgeslagen!`);
        await loadCheck();
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || 'Doorvoeren mislukt');
    } finally {
      setApplyingAll(false);
    }
  };

  const badge = <EmpcoBadge state={state} issueCount={issueCount} compact onClick={state === 'NONE' ? undefined : openViewer} title={state === 'NONE' ? 'Nog geen EmpCo-check' : `EmpCo: ${EMPCO_STATUS_META[state].label} — klik voor details en aanpassen`} />;
  if (!mounted) return badge;

  const fixableIssues = (data?.check?.result?.issues ?? []).filter((i: EmpcoIssue) => isEmpcoIssueFixable(i));
  const openFixableCount = fixableIssues.length;

  return (
    <>
      {badge}
      {open && (
        <EmpcoModalShell
          title="EmpCo-check"
          subtitle={productTitle ? `${productTitle} — #${articleNumber}` : `#${articleNumber}`}
          onClose={() => setOpen(false)}
          headerRight={
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              {onOpenProduct && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onOpenProduct(); }}
                  style={{
                    padding: '0.3rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.45)',
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                  title="Open dit product in de productdrawer"
                >
                  ✏️ Open product
                </button>
              )}
              {data?.check && (
                <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>
                  📅 {new Date(data.check.updatedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          }
        >
          <div onClick={e => e.stopPropagation()}>
            {loading && (
              <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center', gap: '0.6rem', color: EMPCO_ACCENT }}>
                <EmpcoSpinner size={18} /> Laden…
              </div>
            )}
            {error && <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>❌ {error}</div>}

            {!loading && data?.check?.result && (
              <>
                {/* Quick actions top bar */}
                {openFixableCount > 0 && (
                  <div style={{
                    padding: '0.6rem 1.4rem',
                    backgroundColor: '#ecfdf5',
                    borderBottom: '1px solid #a7f3d0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.8rem',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>
                      ⚡ {openFixableCount} voorgestelde aanpassing{openFixableCount === 1 ? '' : 'en'} direct doorvoerbaar:
                    </span>
                    <button
                      type="button"
                      disabled={applyingAll}
                      onClick={handleApplyAll}
                      style={{
                        padding: '0.35rem 0.95rem',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: EMPCO_ACCENT,
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '0.76rem',
                        cursor: applyingAll ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 2px 6px rgba(15,118,110,0.25)',
                      }}
                    >
                      {applyingAll && <EmpcoSpinner size={12} color="white" />}
                      ✓ Alle {openFixableCount} voorstellen overnemen
                    </button>
                  </div>
                )}

                {actionSuccessMsg && (
                  <div style={{
                    margin: '0.8rem 1.4rem 0',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '8px',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1e3a8a',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                  }}>
                    ✓ {actionSuccessMsg}
                  </div>
                )}

                <EmpcoResultView
                  result={data.check.result}
                  stale={data.stale}
                  guidelines={data.guidelines}
                  renderIssueActions={(issue, idx) => {
                    if (!isEmpcoIssueFixable(issue)) return null;
                    const st = appliedStatus[idx];
                    if (st === 'ok') {
                      return <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803d' }}>✓ Overgenomen</span>;
                    }
                    return (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        {st && <span style={{ fontSize: '0.7rem', color: '#b91c1c' }}>{st}</span>}
                        <button
                          type="button"
                          disabled={applyingIdx === idx || applyingAll}
                          onClick={() => handleApplySingle(idx)}
                          style={{
                            padding: '0.24rem 0.7rem',
                            borderRadius: '6px',
                            border: `1px solid ${EMPCO_ACCENT}`,
                            backgroundColor: 'white',
                            color: EMPCO_ACCENT,
                            fontWeight: 700,
                            fontSize: '0.72rem',
                            cursor: applyingIdx === idx ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          }}
                        >
                          {applyingIdx === idx && <EmpcoSpinner size={11} />}
                          ✓ Overnemen
                        </button>
                      </span>
                    );
                  }}
                  footerNote={
                    onOpenProduct ? (
                      <>
                        {' '}
                        <button
                          type="button"
                          onClick={() => { setOpen(false); onOpenProduct(); }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0f766e',
                            fontWeight: 700,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 'inherit',
                          }}
                        >
                          Open product in de editor
                        </button>
                      </>
                    ) : undefined
                  }
                />
              </>
            )}
          </div>
        </EmpcoModalShell>
      )}
    </>
  );
}
