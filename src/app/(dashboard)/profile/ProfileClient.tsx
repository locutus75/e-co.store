"use client";
import React, { useState, useTransition } from 'react';
import { updateUserAction } from '@/app/actions/user';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
  '#14b8a6', '#84cc16', '#fb923c', '#e11d48', '#7c3aed',
];

export default function ProfileClient({ user }: { user: any }) {
  const [isPending, startTransition] = useTransition();
  const [previewColor, setPreviewColor] = useState(user.chatColor || '#6366f1');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    
    startTransition(async () => {
      const res = await updateUserAction(user.id, formData);
      if (res.success) {
        setMessage({ type: 'success', text: 'Profiel succesvol bijgewerkt!' });
      } else {
        setMessage({ type: 'error', text: res.error || 'Er ging iets fout.' });
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Mijn Profiel</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Beheer je persoonlijke instellingen.</p>
      </div>

      <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%',
              backgroundColor: previewColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '2.5rem', fontWeight: 800,
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
            }}>
              {user.email.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{user.email}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                Rol: <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{user.userRoles.map((ur: any) => ur.role.name).join(', ')}</span>
              </p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

          {message && (
            <div style={{ 
              padding: '1rem', 
              borderRadius: 'var(--radius)', 
              backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              color: message.type === 'success' ? 'var(--success)' : 'var(--error)',
              fontWeight: 500
            }}>
              {message.type === 'success' ? '✅' : '❌'} {message.text}
            </div>
          )}

          <input type="hidden" name="email" value={user.email} />
          <input type="hidden" name="role" value={user.userRoles[0]?.role?.name || ''} />

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>Persoonlijke Kleur</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPreviewColor(c)}
                  style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    backgroundColor: c, border: previewColor === c ? '3px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', padding: 0, transition: 'transform 0.1s',
                    transform: previewColor === c ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
              <label style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                +
                <input
                  type="color"
                  value={previewColor}
                  onChange={e => setPreviewColor(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
              </label>
            </div>
            <input type="hidden" name="chatColor" value={previewColor} />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Deze kleur wordt gebruikt voor je avatar en in interne berichten.</p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>Wachtwoord Wijzigen</label>
            <input 
              type="password" 
              name="password" 
              className="input" 
              placeholder="Nieuw wachtwoord (leeglaten om te behouden)" 
              minLength={8}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '0.75rem 2rem' }} disabled={isPending}>
            {isPending ? 'Opslaan...' : 'Wijzigingen Opslaan'}
          </button>

        </form>
      </div>
    </div>
  );
}
