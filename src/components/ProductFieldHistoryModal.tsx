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
    <EmpcoModalShell title="Wijzigingshistorie" subtitle={productTitle ? `${productTitle} — #${articleNumber}` : `#${articleNumber}`} onClose={onClose} width={1000}
      headerRight={fields.length > 0 && (
        <select value={field} onChange={e => setField(e.target.value)}
          style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: 'white' }}>
          <option value="" style={{ color: '#0f172a' }}>Alle velden ({rows?.length ?? 0})</option>
          {fields.map(([k, l]) => <option key={k} value={k} style={{ color: '#0f172a' }}>{l}</option>)}
        </select>
      )}>
      <div style={{ padding: '1rem 1.3rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {msg && <div style={{ fontSize: '0.8rem', padding: '0.55rem 0.8rem', borderRadius: '8px', backgroundColor: '#ecfeff', border: '1px solid #a5f3fc', color: '#155e75' }}>{msg}</div>}
        {rows === null && <div style={{ padding: '2.5rem', display: 'flex', justifyContent: 'center', gap: '0.6rem', color: '#0f766e' }}><EmpcoSpinner size={18} /> Laden…</div>}
        {rows !== null && visible.length === 0 && (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
            Nog geen wijzigingen vastgelegd.<br /><span style={{ fontSize: '0.78rem' }}>Vanaf nu wordt bij elke opslag de vorige tekst van gewijzigde velden bewaard.</span>
          </div>
        )}
        {visible.map(r => {
          const s = SOURCE_META[r.source] ?? SOURCE_META.MANUAL;
          return (
            <div key={r.id} style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem 0.95rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.84rem', color: '#0f172a' }}>{r.fieldLabel || r.fieldKey}</strong>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: '999px', color: s.color, backgroundColor: s.bg }}>{s.label}</span>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {new Date(r.createdAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {r.userEmail && <> · {r.userEmail.split('@')[0]}</>}
                </span>
                <div style={{ flex: 1 }} />
                {onRestore && (
                  <button type="button" onClick={() => restore(r, r.oldValue)} disabled={restored[r.id]}
                    title="Zet de vorige waarde terug in het formulier"
                    style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.65rem', borderRadius: '6px', cursor: restored[r.id] ? 'default' : 'pointer', border: '1px solid #93c5fd', backgroundColor: restored[r.id] ? '#dcfce7' : '#eff6ff', color: restored[r.id] ? '#15803d' : '#1d4ed8' }}>
                    {restored[r.id] ? '✓ Teruggezet' : '↺ Vorige waarde terugzetten'}
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '7px', padding: '0.45rem 0.6rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#c2410c', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>VOORHEEN</div>
                  <div style={{ fontSize: '0.79rem', color: '#431407', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '160px', overflowY: 'auto', fontStyle: r.oldValue ? 'normal' : 'italic' }}>{r.oldValue ?? '(leeg)'}</div>
                </div>
                <div style={{ backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '7px', padding: '0.45rem 0.6rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#0f766e', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>WERD</div>
                  <div style={{ fontSize: '0.79rem', color: '#134e4a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '160px', overflowY: 'auto', fontStyle: r.newValue ? 'normal' : 'italic' }}>{r.newValue ?? '(leeg)'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </EmpcoModalShell>
  );
}
