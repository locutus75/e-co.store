"use client";
import React, { useState, useTransition } from 'react';
import { createUserAction, deleteUserAction, updateUserAction } from '@/app/actions/user';

export default function AdminClient({ users, availableRoles }: { users: any[], availableRoles: any[] }) {
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');

  const openCreateModal = () => {
    setEditingUser(null);
    setErrorMsg('');
    setShowModal(true);
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    startTransition(async () => {
      const res = editingUser ? 
          await updateUserAction(editingUser.id, formData) : 
          await createUserAction(formData);
          
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
           <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Team Administation</h1>
           <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Beheer gebruikers en rollen.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>+ Add User</button>
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Email</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Role(s)</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Aangemaakt Op</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', textAlign: 'right' }}>Acties</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
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
                  >
                    Bewerk
                  </button>
                  <button 
                     onClick={() => submitDelete(u.id, u.email)}
                     style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontWeight: 600, opacity: 0.8 }}
                     disabled={isPending}
                  >
                    Verwijder
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen gebruikers gevonden.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, backdropFilter: 'blur(2px)' }} />
          <div className="glass" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '450px', backgroundColor: 'var(--surface)', padding: '2.5rem',
            borderRadius: 'var(--radius-lg)', zIndex: 101, boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--text)' }}>
              {editingUser ? 'Gebruiker Bewerken' : 'Nieuwe Gebruiker Maken'}
            </h2>
            
            {errorMsg && <div style={{ padding: '1rem', backgroundColor: 'rgba(255,50,50,0.1)', color: 'var(--error)', borderRadius: 'var(--radius)', marginBottom: '1.5rem', fontWeight: 500, fontSize: '0.9rem' }}>{errorMsg}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Emailadres</label>
                <input required type="email" name="email" className="input" placeholder="naam@bedrijf.nl" defaultValue={editingUser?.email || ''} autoFocus />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Wachtwoord {editingUser && <span style={{ color: 'var(--color-mustard)' }}>(Leeglaten om te behouden)</span>}
                </label>
                <input type="password" name="password" className="input" placeholder={editingUser ? "Alleen invullen om te wijzigen..." : "Minimaal 8 tekens"} minLength={editingUser ? 0 : 8} required={!editingUser} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Rol / Rechten</label>
                <select name="role" className="input" defaultValue={editingUser?.userRoles?.[0]?.role?.name || ''}>
                  {availableRoles.map(r => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" className="btn" style={{ flex: 1, backgroundColor: 'var(--background)' }} onClick={() => setShowModal(false)}>Annuleren</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isPending}>{isPending ? 'Opslaan...' : 'Maken'}</button>
              </div>
            </form>
          </div>
        </>
      )}

    </div>
  );
}
