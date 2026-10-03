'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { getFieldHistoryAction } from '@/app/actions/empco';
import { EmpcoModalShell, EmpcoSpinner } from './EmpcoCheck';

const SOURCE_META: Record<string, { label: string; color: string; bg: string }> = {
  EMPCO:   { label: '⚖️ EmpCo',     color: '#0f766e', bg: '#ccfbf1' },
  RESTORE: { label: '↺ Hersteld',   color: '#1d4ed8', bg: '#dbeafe' },
  MANUAL:  { label: '✎ Handmatig',  color: '#475569', bg: '#e2e8f0' },
};

interface Props {
  articleNumber: string;
  productTitle?: string;
  onClose: () => void;
  /** When provided (product drawer, writable), shows "Terugzetten" buttons */
  onRestore?: (fieldKey: string, value: string) => boolean;
  initialField?: string;
}

interface DiffResult {
  prefix: string;
  suffix: string;
  removed: string;
  added: string;
  hasDiff: boolean;
}

function computeDiff(oldStr: string | null | undefined, newStr: string | null | undefined): DiffResult {
  const o = (oldStr ?? '').trim();
  const n = (newStr ?? '').trim();
  if (!o && !n) return { prefix: '', suffix: '', removed: '', added: '', hasDiff: false };
  if (!o) return { prefix: '', suffix: '', removed: '', added: n, hasDiff: true };
  if (!n) return { prefix: '', suffix: '', removed: o, added: '', hasDiff: true };

  const oldTokens = o.match(/\s+|[^\s]+/g) || [];
  const newTokens = n.match(/\s+|[^\s]+/g) || [];

  let start = 0;
  while (start < oldTokens.length && start < newTokens.length && oldTokens[start] === newTokens[start]) {
    start++;
  }

  let oldEnd = oldTokens.length - 1;
  let newEnd = newTokens.length - 1;
  while (oldEnd >= start && newEnd >= start && oldTokens[oldEnd] === newTokens[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const prefix = oldTokens.slice(0, start).join('');
  const suffix = oldTokens.slice(oldEnd + 1).join('');
  const removed = oldTokens.slice(start, oldEnd + 1).join('');
  const added = newTokens.slice(start, newEnd + 1).join('');

  return {
    prefix,
    suffix,
    removed,
    added,
    hasDiff: removed.length > 0 || added.length > 0,
  };
}

export default function ProductFieldHistoryModal({ articleNumber, productTitle, onClose, onRestore, initialField }: Props) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [field, setField] = useState(initialField ?? '');
  const [restored, setRestored] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getFieldHistoryAction(articleNumber).then(r => setRows(r as any[])).catch(() => setRows([]));
  }, [articleNumber]);

  const fields = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach(r => m.set(r.fieldKey, r.fieldLabel || r.fieldKey));
    return Array.from(m.entries());
  }, [rows]);

  const visible = (rows ?? []).filter(r => !field || r.fieldKey === field);

  const restore = (r: any, value: string | null) => {
    if (!onRestore) return;
    const ok = onRestore(r.fieldKey, value ?? '');
    if (ok) { setRestored(p => ({ ...p, [r.id]: true })); setMsg('Waarde teruggezet in het formulier — klik op Opslaan om te bewaren.'); }
    else setMsg('Dit veld kan niet worden aangepast (geen schrijfrechten of veld niet in formulier).');
  };

  return (
    <EmpcoModalShell title="Wijzigingshistorie" subtitle={productTitle ? `${productTitle} — #${articleNumber}` : `#${articleNumber}`} onClose={onClose} width={1020}
      headerRight={fields.length > 0 && (
        <select value={field} onChange={e => setField(e.target.value)}
          style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: 'white' }}>
          <option value="" style={{ color: '#0f172a' }}>Alle velden ({rows?.length ?? 0})</option>
          {fields.map(([k, l]) => <option key={k} value={k} style={{ color: '#0f172a' }}>{l}</option>)}
        </select>
      )}>
      <div style={{ padding: '1rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {msg && <div style={{ fontSize: '0.8rem', padding: '0.55rem 0.8rem', borderRadius: '8px', backgroundColor: '#ecfeff', border: '1px solid #a5f3fc', color: '#155e75' }}>{msg}</div>}
        {rows === null && <div style={{ padding: '2.5rem', display: 'flex', justifyContent: 'center', gap: '0.6rem', color: '#0f766e' }}><EmpcoSpinner size={18} /> Laden…</div>}
        {rows !== null && visible.length === 0 && (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
            Nog geen wijzigingen vastgelegd.<br /><span style={{ fontSize: '0.78rem' }}>Vanaf nu wordt bij elke opslag de vorige tekst van gewijzigde velden bewaard.</span>
          </div>
        )}
        {visible.map((r, idx) => {
          const s = SOURCE_META[r.source] ?? SOURCE_META.MANUAL;
          const diff = computeDiff(r.oldValue, r.newValue);
          const isLatest = idx === 0 && !field;

          return (
            <div key={r.id} style={{
              backgroundColor: 'white',
              borderTop: '1px solid #e2e8f0',
              borderRight: '1px solid #e2e8f0',
              borderBottom: '1px solid #e2e8f0',
              borderLeft: isLatest ? '4px solid #0f766e' : '4px solid #cbd5e1',
              borderRadius: '10px',
              padding: '0.85rem 1.1rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.86rem', color: '#0f172a' }}>{r.fieldLabel || r.fieldKey}</strong>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '999px', color: s.color, backgroundColor: s.bg }}>{s.label}</span>
                {isLatest && (
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '0.08rem 0.45rem', borderRadius: '999px', color: '#0f766e', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4' }}>
                    MEEST RECENT
                  </span>
                )}
                <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                  🕒 {new Date(r.createdAt).toLocaleString('nl-NL', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                  {r.userEmail && <> · {r.userEmail.split('@')[0]}</>}
                </span>
                <div style={{ flex: 1 }} />
                {onRestore && (
                  <button type="button" onClick={() => restore(r, r.oldValue)} disabled={restored[r.id]}
                    title="Zet de situatie van vóór deze wijziging terug in het formulier"
                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '6px', cursor: restored[r.id] ? 'default' : 'pointer', border: '1px solid #93c5fd', backgroundColor: restored[r.id] ? '#dcfce7' : '#eff6ff', color: restored[r.id] ? '#15803d' : '#1d4ed8' }}>
                    {restored[r.id] ? '✓ Teruggezet' : '↺ Vorige waarde herstellen'}
                  </button>
                )}
              </div>

              {/* Exact diff snippet summary */}
              {diff.hasDiff && (
                <div style={{
                  marginBottom: '0.65rem',
                  padding: '0.45rem 0.8rem',
                  borderRadius: '7px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.76rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#475569', letterSpacing: '0.04em' }}>
                    AANGEPAST FRAGMENT:
                  </span>
                  {diff.removed ? (
                    <span style={{
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      textDecoration: 'line-through',
                      padding: '0.12rem 0.45rem',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}>
                      {diff.removed}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(nieuw toegevoegd)</span>
                  )}
                  <span style={{ color: '#94a3b8' }}>→</span>
                  {diff.added ? (
                    <span style={{
                      backgroundColor: '#dcfce7',
                      color: '#14532d',
                      padding: '0.12rem 0.45rem',
                      borderRadius: '4px',
                      fontWeight: 700,
                    }}>
                      {diff.added}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(fragment verwijderd)</span>
                  )}
                </div>
              )}

              {/* Side-by-side with word-level highlight */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '7px', padding: '0.55rem 0.7rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#c2410c', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>VOORHEEN</div>
                  <div style={{ fontSize: '0.79rem', color: '#431407', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflowY: 'auto', lineHeight: 1.55 }}>
                    {diff.hasDiff && diff.removed ? (
                      <>
                        <span>{diff.prefix}</span>
                        <mark style={{
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          textDecoration: 'line-through',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}>
                          {diff.removed}
                        </mark>
                        <span>{diff.suffix}</span>
                      </>
                    ) : (
                      r.oldValue ?? '(leeg)'
                    )}
                  </div>
                </div>

                <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '7px', padding: '0.55rem 0.7rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#0f766e', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>WERD</div>
                  <div style={{ fontSize: '0.79rem', color: '#134e4a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '180px', overflowY: 'auto', lineHeight: 1.55 }}>
                    {diff.hasDiff && diff.added ? (
                      <>
                        <span>{diff.prefix}</span>
                        <mark style={{
                          backgroundColor: '#bbf7d0',
                          color: '#14532d',
                          padding: '0.1rem 0.3rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}>
                          {diff.added}
                        </mark>
                        <span>{diff.suffix}</span>
                      </>
                    ) : (
                      r.newValue ?? '(leeg)'
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </EmpcoModalShell>
  );
}
