"use client";
import React, { useState, useEffect } from 'react';

const SEGMENTS = [
  { key: 'UPDATE', label: 'Bewerkingen', color: '#c084fc' },
  { key: 'NEW', label: 'Nieuw', color: 'var(--primary)' },
  { key: 'EDIT', label: 'Bewerken', color: 'var(--color-mustard)' },
  { key: 'CHECK', label: 'Controleren', color: '#3b82f6' },
  { key: 'DONE', label: 'Gereed', color: '#10b981' },
];

export default function StatsClient({ users }: { users: any[] }) {
  const [globalStats, setGlobalStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    fetchGlobalStats();
  }, [selectedUserId]);

  const fetchGlobalStats = async () => {
    setLoading(true);
    try {
      const url = selectedUserId 
        ? `/api/user/stats?userId=${encodeURIComponent(selectedUserId)}`
        : `/api/user/stats`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setGlobalStats(data.daily);
      }
    } catch (err) {
      console.error("Fetch stats error", err);
    }
    setLoading(false);
  };

  const totalEdits = globalStats.reduce((a, b) => a + b.count, 0);
  const avgPerDay = (totalEdits / 30).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Productiviteit & Statistieken</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Overzicht van team-activiteit over de afgelopen 30 dagen.</p>
        </div>
        
        <select 
          className="input" 
          style={{ width: '250px' }}
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Hele Team</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Totaal Bewerkingen (30d)</p>
          <p style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--primary)' }}>{totalEdits}</p>
        </div>
        <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Gemiddelde per Dag</p>
          <p style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--success)' }}>{avgPerDay}</p>
        </div>
      </div>

      <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '2rem' }}>
          Activiteitstrend
        </h2>
        
        {loading ? (
          <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Laden...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '300px', gap: '8px', paddingBottom: '40px', borderBottom: '2px solid var(--border)' }}>
              {globalStats.map((s, i) => {
                const max = Math.max(...globalStats.map(x => x.count), 1);
                const height = (s.count / max) * 100;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                    {s.count > 0 && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>
                        {s.count}
                      </span>
                    )}
                    <div 
                      style={{ 
                        width: '100%', 
                        height: `${height}%`, 
                        borderRadius: '4px 4px 0 0', 
                        position: 'relative',
                        minHeight: s.count > 0 ? '4px' : '0',
                        transition: 'height 0.3s ease',
                        display: 'flex',
                        flexDirection: 'column-reverse',
                        overflow: 'hidden',
                        backgroundColor: s.count > 0 ? 'transparent' : 'var(--border)'
                      }} 
                      title={`${s.date}: ${s.count} acties\n` + 
                        `- Bewerkingen: ${s.breakdown?.UPDATE || 0}\n` +
                        `- Status NEW: ${s.breakdown?.NEW || 0}\n` +
                        `- Status EDIT: ${s.breakdown?.EDIT || 0}\n` +
                        `- Status CHECK: ${s.breakdown?.CHECK || 0}\n` +
                        `- Status DONE: ${s.breakdown?.DONE || 0}`
                      }
                    >
                      {s.count > 0 && SEGMENTS.map(seg => {
                        const val = s.breakdown?.[seg.key] || 0;
                        if (val === 0) return null;
                        const share = (val / s.count) * 100;
                        return (
                          <div 
                            key={seg.key} 
                            style={{ 
                              width: '100%', 
                              height: `${share}%`, 
                              backgroundColor: seg.color 
                            }} 
                          />
                        );
                      })}
                    </div>
                    {/* Show date label for every 5th item to keep it clean */}
                    {(i % 5 === 0 || i === globalStats.length - 1) && (
                      <span style={{ position: 'absolute', bottom: '-25px', fontSize: '0.65rem', color: 'var(--text-muted)', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
                        {new Date(s.date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Legend */}
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              {SEGMENTS.map(seg => (
                <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                  <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: seg.color }} />
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{seg.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="glass" style={{ padding: '2.5rem', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Hoe werkt de statistiek?</h2>
        <div style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
          <p>De bovenstaande gegevens worden live gegenereerd op basis van de <strong>Audit Logs</strong>. Elke keer dat een teamlid een product opslaat of een status wijzigt, wordt dit geregistreerd.</p>
          <ul style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <li>✅ <strong>Bewerkingen:</strong> Telt het aantal succesvolle "Opslaan" acties in de Product Drawer.</li>
            <li>✅ <strong>Gemiddelde:</strong> Berekend over de afgelopen 30 kalenderdagen.</li>
            <li>✅ <strong>Filteren:</strong> Je kunt de statistieken inzien voor het hele team of specifiek inzoomen op één gebruiker.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
