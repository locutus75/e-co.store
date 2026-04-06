"use client";
import React from 'react';
import Link from 'next/link';

export default function AssignmentsClient({ usersWithAssignments }: { usersWithAssignments: any[] }) {
  
  const unassignedCount = usersWithAssignments.find(u => u.isUnassignedPool)?.assignedProducts.length || 0;
  const teamMembers = usersWithAssignments.filter(u => !u.isUnassignedPool);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1600px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
           <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Assignments Board</h1>
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
          const pendingCheck = user.assignedProducts.filter((p: any) => p.status === 'CHECK').length;
          const pendingNew = user.assignedProducts.filter((p: any) => p.status === 'NEW').length;
          const webshopReady = user.assignedProducts.filter((p: any) => p.readyForImport === 'JA').length;
          
          let progress = totalAssigned === 0 ? 100 : Math.round((webshopReady / totalAssigned) * 100);

          return (
            <div key={user.id} className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>{user.email.split('@')[0]}</h3>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '1rem', backgroundColor: 'var(--surface-hover)', fontSize: '0.75rem', fontWeight: 600 }}>{totalAssigned} items</span>
              </div>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Workload Progress</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--success)' }}>{progress}% Ready</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--success)', transition: 'width 0.5s' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                 <div>
                   <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{pendingNew}</p>
                   <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>NEW</p>
                 </div>
                 <div>
                   <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6' }}>{pendingCheck}</p>
                   <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>CHECK</p>
                 </div>
                 <div>
                   <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{webshopReady}</p>
                   <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>READY</p>
                 </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  );
}
