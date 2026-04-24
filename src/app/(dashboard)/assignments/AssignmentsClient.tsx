"use client";
import React, { useState } from 'react';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW:   { bg: 'var(--primary)', text: 'white' },
  EDIT:  { bg: 'var(--color-mustard)', text: 'white' },
  CHECK: { bg: '#3b82f6', text: 'white' },
  DONE:  { bg: '#10b981', text: 'white' },
};

interface RecentEdit {
  internalArticleNumber: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface UserPanel {
  userId: string;
  email: string;
}

export default function AssignmentsClient({ usersWithAssignments }: { usersWithAssignments: any[] }) {

  const [activePanel, setActivePanel] = useState<UserPanel | null>(null);
  const [recentEdits, setRecentEdits] = useState<RecentEdit[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState('');

  const unassignedCount = usersWithAssignments.find(u => u.isUnassignedPool)?.assignedProducts.length || 0;
  const teamMembers = usersWithAssignments.filter(u => !u.isUnassignedPool);

  const openUserPanel = async (userId: string, email: string) => {
    setActivePanel({ userId, email });
    setPanelLoading(true);
    setPanelError('');
    setRecentEdits([]);
    try {
      const res = await fetch(`/api/user/recent-edits?userId=${encodeURIComponent(userId)}&take=20`);
      let data: any;
      try {
        data = await res.json();
      } catch {
        setPanelError(`Server antwoord is geen geldige JSON (status ${res.status}). Herstart de server via update_and_run.ps1.`);
        setPanelLoading(false);
        return;
      }
      if (res.ok) {
        setRecentEdits(data.products ?? []);
        if (data.warning) setPanelError(`⚠️ ${data.warning}`);
      } else {
        setPanelError(data.error || `Fout bij laden (${res.status})`);
      }
    } catch (err: any) {
      setPanelError(`Verbindingsfout: ${err?.message ?? 'Onbekend'}. Controleer of de server actief is.`);
    }
    setPanelLoading(false);
  };


  const closePanel = () => { setActivePanel(null); setRecentEdits([]); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1600px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Toewijzingenbord</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Verdeling van de werklast binnen het team.</p>
        </div>
        <div className="glass" style={{ padding: '1rem 2rem', borderRadius: 'var(--radius)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Niet Toegewezen</p>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: unassignedCount > 0 ? 'var(--error)' : 'var(--success)' }}>{unassignedCount}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {teamMembers.map(user => {
          const totalAssigned = user.assignedProducts.length;
          const countNew   = user.assignedProducts.filter((p: any) => (p.status || '').toUpperCase() === 'NEW').length;
          const countEdit  = user.assignedProducts.filter((p: any) => (p.status || '').toUpperCase() === 'EDIT').length;
          const countCheck = user.assignedProducts.filter((p: any) => (p.status || '').toUpperCase() === 'CHECK').length;
          const countDone  = user.assignedProducts.filter((p: any) => (p.status || '').toUpperCase() === 'DONE').length;
          const progress = totalAssigned === 0 ? 100 : Math.round((countDone / totalAssigned) * 100);

          return (
            <div key={user.id} className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* Clickable user name */}
                <button
                  type="button"
                  onClick={() => openUserPanel(user.id, user.email)}
                  title={`Bekijk recente bewerkingen van ${user.email}`}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)',
                    textAlign: 'left', textDecoration: 'underline dotted', textUnderlineOffset: '3px',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  {user.email.split('@')[0]}
                </button>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '1rem', backgroundColor: 'var(--surface-hover)', fontSize: '0.75rem', fontWeight: 600 }}>{totalAssigned} items</span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Voortgang</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>{progress}% Gereed</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--success)', transition: 'width 0.5s' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', flexWrap: 'wrap' }}>
                {[
                  { count: countNew,   label: 'NEW',   color: STATUS_COLORS.NEW },
                  { count: countEdit,  label: 'EDIT',  color: STATUS_COLORS.EDIT },
                  { count: countCheck, label: 'CHECK', color: STATUS_COLORS.CHECK },
                  { count: countDone,  label: 'DONE',  color: STATUS_COLORS.DONE },
                ].map(({ count, label, color }) => (
                  <div key={label} style={{ textAlign: 'center', flex: 1 }}>
                    <p style={{ fontSize: '1.4rem', fontWeight: 800, color: color.bg }}>{count}</p>
                    <span style={{ display: 'inline-block', marginTop: '0.35rem', padding: '0.1rem 0.55rem', borderRadius: '1rem', fontSize: '0.7rem', fontWeight: 700, backgroundColor: color.bg, color: color.text }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Side panel: recent edits per user ── */}
      {activePanel && (
        <>
          {/* Backdrop */}
          <div
            onClick={closePanel}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40, backdropFilter: 'blur(2px)' }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 95vw)',
            backgroundColor: 'var(--surface)', zIndex: 50,
            boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
            display: 'flex', flexDirection: 'column',
            animation: 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1)',
          }}>
            {/* Header */}
            <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  🕐 Recente bewerkingen
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {activePanel.email.split('@')[0]} — laatste 20 bewerkte producten
                </p>
              </div>
              <button
                type="button"
                onClick={closePanel}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--text-muted)', lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {panelLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-block', width: '18px', height: '18px', border: '2.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'asn-spin 1s linear infinite' }} />
                  Laden…
                </div>
              )}
              {panelError && (
                <div style={{ padding: '1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', color: '#dc2626', fontSize: '0.85rem' }}>
                  ❌ {panelError}
                </div>
              )}
              {!panelLoading && !panelError && recentEdits.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Geen bewerkingen gevonden voor deze gebruiker.
                </div>
              )}
              {recentEdits.map((product, idx) => {
                const statusColor = STATUS_COLORS[(product.status || 'NEW').toUpperCase()] ?? STATUS_COLORS.NEW;
                return (
                  <div key={product.internalArticleNumber} style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: idx % 2 === 0 ? 'var(--background)' : 'transparent',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', gap: '0.3rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        #{product.internalArticleNumber} — {product.title}
                      </span>
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, backgroundColor: statusColor.bg, color: statusColor.text, flexShrink: 0 }}>
                        {(product.status || 'NEW').toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      🕐 {new Date(product.updatedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes asn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
