"use client";
import React, { useTransition, useState } from 'react';
import { setRolePermissionAction, createRoleAction, renameRoleAction, deleteRoleAction } from '@/app/actions/role';

const MENU_MODULES = [
  { module: 'MENU:dashboard', label: 'Dashboard Toegang' },
  { module: 'MENU:products', label: 'Producten Toegang' },
  { module: 'MENU:categories', label: 'Categorieën Toegang' },
  { module: 'MENU:assignments', label: 'Toewijzingen Toegang' },
  { module: 'MENU:users', label: 'Team & Gebruikers Toegang' },
  { module: 'MENU:roles', label: 'Rollen & Rechten Toegang' },
];

const FIELD_MODULES = [
  { module: 'FIELD:title', label: 'Titel (Title)' },
  { module: 'FIELD:seoTitle', label: 'SEO Titel' },
  { module: 'FIELD:price', label: 'Prijs (Price)' },
  { module: 'FIELD:ean', label: 'EAN Code' },
  { module: 'FIELD:internalArticleNumber', label: 'Interne Artikelcode' },
  { module: 'FIELD:description', label: 'Omschrijving' },
];

export default function RolesClient({ roles }: { roles: any[] }) {
  const [isPending, startTransition] = useTransition();

  const [newRoleName, setNewRoleName] = useState('');
  const [editingRole, setEditingRole] = useState<{ id: string, name: string } | null>(null);

  const handleActionChange = (roleId: string, module: string, newAction: string) => {
    startTransition(async () => {
      await setRolePermissionAction(roleId, module, newAction);
    });
  };

  const handleMenuChange = (roleId: string, module: string, current: string) => {
    startTransition(async () => {
      const newAction = current === 'ALLOW' ? 'DENY' : 'ALLOW';
      await setRolePermissionAction(roleId, module, newAction);
    });
  };

  const handleCreateRole = () => {
    if (!newRoleName.trim()) return;
    startTransition(async () => {
      const res = await createRoleAction(newRoleName);
      if (res?.success) setNewRoleName('');
      else alert(res.error);
    });
  };

  const handleRenameRole = (id: string, name: string) => {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await renameRoleAction(id, name);
      if (res?.success) setEditingRole(null);
      else alert(res.error);
    });
  };

  const handleDeleteRole = (id: string) => {
    if (!confirm('Weet je zeker dat je deze rol wilt verwijderen?')) return;
    startTransition(async () => {
      const res = await deleteRoleAction(id);
      if (!res?.success) alert(res.error);
    });
  };

  const getActionForModule = (role: any, moduleName: string, defaultAction: string) => {
    const perm = role.rolePermissions.find((p: any) => p.module === moduleName);
    return perm ? perm.action : defaultAction;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', maxWidth: '1400px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
         <div>
           <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Roles & Security</h1>
           <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: '0.2rem' }}>Configureer menu- en veldrechten per gebruikersrol.</p>
         </div>

         <div style={{ display: 'flex', gap: '0.5rem' }}>
           <input 
             type="text" 
             className="input" 
             placeholder="Nieuwe rolnaam..."
             value={newRoleName}
             onChange={(e) => setNewRoleName(e.target.value)}
             disabled={isPending}
           />
           <button onClick={handleCreateRole} className="btn btn-primary" disabled={isPending || !newRoleName.trim()}>
             + Toevoegen
           </button>
         </div>
      </div>

      <div style={{ padding: '1rem 1.5rem', backgroundColor: 'rgba(225, 191, 220, 0.1)', border: '1px solid var(--primary)', borderRadius: 'var(--radius)', color: 'var(--text-muted)' }}>
        <strong>Note:</strong> De <strong>ADMIN</strong> rol beschikt standaard over alle rechten. De weergave voor admin configuratie is verborgen omdat deze niet kan worden gedeactiveerd.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem', alignItems: 'start' }}>
        {roles.map(role => {
          if (role.name.toUpperCase() === 'ADMIN') return null;

          return (
            <div key={role.id} className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                {editingRole?.id === role.id ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      className="input" 
                      value={editingRole!.name} 
                      onChange={(e) => setEditingRole({ id: editingRole!.id, name: e.target.value })}
                      disabled={isPending}
                    />
                    <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} disabled={isPending} onClick={() => handleRenameRole(role.id, editingRole!.name)}>Opslaan</button>
                    <button className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} disabled={isPending} onClick={() => setEditingRole(null)}>X</button>
                  </div>
                ) : (
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-mustard)' }}>
                    {role.name}
                  </h2>
                )}
                
                {!editingRole && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setEditingRole(role)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>✏️</button>
                    <button onClick={() => handleDeleteRole(role.id)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-rust)' }}>🗑️</button>
                  </div>
                )}
              </div>

              {/* Menu Permissions */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Menu Navigatie Rechten</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {MENU_MODULES.map(m => {
                    const currentAction = getActionForModule(role, m.module, 'DENY');
                    const isActive = currentAction === 'ALLOW';
                    
                    return (
                      <label key={m.module} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text)', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={isActive}
                          disabled={isPending}
                          onChange={() => handleMenuChange(role.id, m.module, currentAction)} 
                        /> 
                        {m.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Field Permissions */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Productveld Rechten</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <tbody>
                    {FIELD_MODULES.map(f => {
                      const currentAction = getActionForModule(role, f.module, 'READ');
                      
                      return (
                        <tr key={f.module} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.75rem 0', fontWeight: 500, fontSize: '0.9rem', color: 'var(--text)' }}>{f.label}</td>
                          <td style={{ padding: '0.75rem 0', textAlign: 'right' }}>
                            <select 
                              className="input" 
                              style={{ padding: '0.2rem 0.4rem', fontSize: '0.85rem' }}
                              disabled={isPending}
                              value={currentAction}
                              onChange={(e) => handleActionChange(role.id, f.module, e.target.value)}
                            >
                              <option value="WRITE">📝 Bewerken (Write)</option>
                              <option value="READ">👀 Alleen Lezen (Read)</option>
                              <option value="HIDDEN">🚫 Verborgen (Hidden)</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
