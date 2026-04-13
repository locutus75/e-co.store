"use client";
import React, { useState, useTransition } from 'react';
import { createUserAction, deleteUserAction, updateUserAction } from '@/app/actions/user';

// ── helpers ────────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
  '#14b8a6', '#84cc16', '#fb923c', '#e11d48', '#7c3aed',
];

function getInitials(email: string) {
  const name = email.split('@')[0];
  const parts = name.split(/[._\-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Mini chat preview ──────────────────────────────────────────────────────

function ChatColorPreview({ email, color }: { email: string; color: string }) {
  const initials = getInitials(email || 'eg@mail');
  const name = email ? email.split('@')[0] : 'gebruiker';

  return (
    <div style={{
      borderRadius: '10px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      backgroundColor: 'var(--background)',
      fontSize: '0.78rem',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.7rem',
        fontWeight: 700,
        color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: '0.4rem',
      }}>
        💬 <span>Chat voorbeeld</span>
      </div>

      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {/* Someone else's message */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            backgroundColor: '#94a3b8', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', fontWeight: 800, flexShrink: 0,
          }}>AN</div>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.1rem', paddingLeft: '0.3rem' }}>anderen</div>
            <div style={{
              backgroundColor: 'var(--surface)', color: 'var(--text)',
              padding: '0.35rem 0.6rem', borderRadius: '12px 12px 12px 3px',
              border: '1px solid var(--border)',
              fontSize: '0.75rem',
            }}>Hoi, kun je dit nakijken?</div>
          </div>
        </div>

        {/* This user's message */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', flexDirection: 'row-reverse' }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%',
            backgroundColor: color || '#6366f1', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', fontWeight: 800, flexShrink: 0,
          }}>{initials}</div>
          <div style={{ alignItems: 'flex-end', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: color || '#6366f1', marginBottom: '0.1rem', paddingRight: '0.3rem' }}>{name}</div>
            <div style={{
              backgroundColor: color || '#6366f1', color: 'white',
              padding: '0.35rem 0.6rem', borderRadius: '12px 12px 3px 12px',
              fontSize: '0.75rem',
            }}>Ja, ik kijk ernaar!</div>
            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', paddingRight: '0.3rem' }}>13 apr 14:35</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AdminClient({ users, availableRoles }: { users: any[], availableRoles: any[] }) {
  const [showModal, setShowModal]     = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isPending, startTransition]  = useTransition();
  const [errorMsg, setErrorMsg]       = useState('');
  // live preview state for color picker
  const [previewColor, setPreviewColor] = useState('#6366f1');
  const [previewEmail, setPreviewEmail] = useState('');

  const openCreateModal = () => {
    setEditingUser(null);
    setErrorMsg('');
    setPreviewColor('#6366f1');
    setPreviewEmail('');
    setShowModal(true);
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setErrorMsg('');
    setPreviewColor(u.chatColor || '#6366f1');
    setPreviewEmail(u.email || '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    startTransition(async () => {
      const res = editingUser
        ? await updateUserAction(editingUser.id, formData)
        : await createUserAction(formData);
          
      if (res.success) {
        setShowModal(false);
        form.reset();
      } else {
        setErrorMsg(res.error || 'Er ging iets fout.');
      }
    });
  };

  const submitDelete = (id: string, email: string) => {
    if (!confirm(`Weet je zeker dat je gebruiker ${email} permanent wilt verwijderen?`)) return;
    startTransition(async () => {
      await deleteUserAction(id);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1200px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Team Administatie</h1>
           <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Beheer gebruikers en rollen.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Gebruiker Toevoegen</button>
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Kleur</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Email</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Rol(len)</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Aangemaakt Op</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'right' }}>Acties</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* Color dot */}
                <td style={{ padding: '1.25rem' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    backgroundColor: u.chatColor || '#6366f1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '0.6rem', fontWeight: 800,
                  }}>
                    {getInitials(u.email)}
                  </div>
                </td>
                <td style={{ padding: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>{u.email}</td>
                <td style={{ padding: '1.25rem', color: 'var(--primary)', fontWeight: 500 }}>
                  {u.userRoles?.map((ur: any) => ur.role?.name).join(', ') || 'USER'}
                </td>
                <td style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleDateString('nl-NL')}</td>
                <td style={{ padding: '1.25rem', textAlign: 'right', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => openEditModal(u)}
                    style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontWeight: 600, opacity: 0.8 }}
                    disabled={isPending}
                  >Bewerk</button>
                  <button
                    onClick={() => submitDelete(u.id, u.email)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontWeight: 600, opacity: 0.8 }}
                    disabled={isPending}
                  >Verwijder</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen gebruikers gevonden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, backdropFilter: 'blur(2px)' }} />
          <div className="glass" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '520px', backgroundColor: 'var(--surface)', padding: '2.5rem',
            borderRadius: 'var(--radius-lg)', zIndex: 101, boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text)' }}>
              {editingUser ? 'Gebruiker Bewerken' : 'Nieuwe Gebruiker Maken'}
            </h2>
            
            {errorMsg && <div style={{ padding: '1rem', backgroundColor: 'rgba(255,50,50,0.1)', color: 'var(--error)', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontWeight: 500, fontSize: '0.9rem' }}>{errorMsg}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Emailadres</label>
                <input
                  required type="email" name="email" className="input"
                  placeholder="naam@bedrijf.nl"
                  defaultValue={editingUser?.email || ''}
                  autoFocus
                  onChange={e => setPreviewEmail(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Wachtwoord {editingUser && <span style={{ color: 'var(--color-mustard)' }}>(Leeglaten om te behouden)</span>}
                </label>
                <input
                  type="password" name="password" className="input"
                  placeholder={editingUser ? 'Alleen invullen om te wijzigen...' : 'Minimaal 8 tekens'}
                  minLength={editingUser ? 0 : 8}
                  required={!editingUser}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Rol / Rechten</label>
                <select name="role" className="input" defaultValue={editingUser?.userRoles?.[0]?.role?.name || ''}>
                  {availableRoles.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* ── Chat Kleur ────────────────────────────────────────── */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                  Chat Kleur
                </label>

                {/* Preset swatches */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPreviewColor(c)}
                      style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        backgroundColor: c, border: previewColor === c ? '3px solid var(--text)' : '2px solid transparent',
                        cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
                        transform: previewColor === c ? 'scale(1.2)' : 'scale(1)',
                      }}
                      title={c}
                    />
                  ))}
                  {/* Custom color picker */}
                  <label style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)' }} title="Aangepaste kleur">
                    +
                    <input
                      type="color"
                      value={previewColor}
                      onChange={e => setPreviewColor(e.target.value)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    />
                  </label>
                </div>

                {/* Hidden input to submit the color value */}
                <input type="hidden" name="chatColor" value={previewColor} />

                {/* Live preview */}
                <ChatColorPreview email={previewEmail || editingUser?.email || 'gebruiker@bedrijf.nl'} color={previewColor} />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn" style={{ flex: 1, backgroundColor: 'var(--background)' }} onClick={() => setShowModal(false)}>Annuleren</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isPending}>
                  {isPending ? 'Opslaan...' : (editingUser ? 'Opslaan' : 'Aanmaken')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

    </div>
  );
}
