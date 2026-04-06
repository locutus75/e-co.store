"use client";
import React, { useTransition, useState } from 'react';
import { setRolePermissionAction, createRoleAction, renameRoleAction, deleteRoleAction } from '@/app/actions/role';
import FormLayoutBuilder from '@/components/FormLayoutBuilder';

const MENU_MODULES = [
  { module: 'MENU:dashboard', label: 'Dashboard Toegang' },
  { module: 'MENU:products', label: 'Producten Toegang' },
  { module: 'MENU:categories', label: 'Categorieën Toegang' },
  { module: 'MENU:assignments', label: 'Toewijzingen Toegang' },
  { module: 'MENU:users', label: 'Team & Gebruikers Toegang' },
  { module: 'MENU:roles', label: 'Rollen & Rechten Toegang' },
];

const FIELD_MODULES = [
  { module: 'FIELD:title', label: 'Titel' },
  { module: 'FIELD:internalArticleNumber', label: 'Interne Artikelcode' },
  { module: 'FIELD:ean', label: 'EAN Code' },
  { module: 'FIELD:status', label: 'Status' },
  { module: 'FIELD:brandId', label: 'Merk (Brand)' },
  { module: 'FIELD:supplierId', label: 'Leverancier' },
  { module: 'FIELD:categoryId', label: 'Categorie' },
  { module: 'FIELD:subcategoryId', label: 'Subcategorie' },
  { module: 'FIELD:shortDescription', label: 'Korte Omschrijving' },
  { module: 'FIELD:longDescription', label: 'Lange Omschrijving' },
  { module: 'FIELD:color', label: 'Kleur' },
  { module: 'FIELD:size', label: 'Maat' },
  { module: 'FIELD:material', label: 'Materiaal' },
  { module: 'FIELD:tags', label: 'Tags' },
  { module: 'FIELD:webshopSlug', label: 'Webshop URL Slug' },
  { module: 'FIELD:weightGr', label: 'Gewicht (gr)' },
  { module: 'FIELD:lengthCm', label: 'Lengte (cm)' },
  { module: 'FIELD:widthCm', label: 'Breedte (cm)' },
  { module: 'FIELD:heightCm', label: 'Hoogte (cm)' },
  { module: 'FIELD:volumeMl', label: 'Volume (ml)' },
  { module: 'FIELD:volumeGr', label: 'Volume (gr)' },
  { module: 'FIELD:ingredients', label: 'Ingrediënten' },
  { module: 'FIELD:allergens', label: 'Allergenen' },
  { module: 'FIELD:mainMaterial', label: 'Hoofdmateriaal' },
  { module: 'FIELD:readyForImport', label: 'Klaar voor Import' },
  { module: 'FIELD:internalRemarks', label: 'Interne Communicatie' },
  { module: 'FIELD:webshopActive', label: 'Webshop Actief' },
  { module: 'FIELD:systemActive', label: 'Systeem Actief' },
  { module: 'FIELD:supplierContacted', label: 'Leverancier Gecontacteerd' },
  { module: 'FIELD:critMensSafeWork', label: 'Crit: Mens Safe Work' },
  { module: 'FIELD:critMensFairWage', label: 'Crit: Mens Fair Wage' },
  { module: 'FIELD:critMensSocial', label: 'Crit: Mens Social' },
  { module: 'FIELD:critDierCrueltyFree', label: 'Crit: Dier Cruelty Free' },
  { module: 'FIELD:critDierFriendly', label: 'Crit: Dier Friendly' },
  { module: 'FIELD:critMilieuPackagingFree', label: 'Crit: Milieu Packaging Free' },
  { module: 'FIELD:critMilieuPlasticFree', label: 'Crit: Milieu Plastic Free' },
  { module: 'FIELD:critMilieuRecyclable', label: 'Crit: Milieu Recyclable' },
  { module: 'FIELD:critMilieuBiodegradable', label: 'Crit: Milieu Biodegradable' },
  { module: 'FIELD:critMilieuCompostable', label: 'Crit: Milieu Compostable' },
  { module: 'FIELD:critMilieuCarbonCompensated', label: 'Crit: Milieu Carbon Compensated' },
  { module: 'FIELD:critTransportDistance', label: 'Crit: Transport Distance' },
  { module: 'FIELD:critTransportVehicle', label: 'Crit: Transport Vehicle' },
  { module: 'FIELD:critHandmade', label: 'Crit: Handmade' },
  { module: 'FIELD:critNatural', label: 'Crit: Natural' },
  { module: 'FIELD:critCircular', label: 'Crit: Circular' },
  { module: 'FIELD:critOther', label: 'Crit: Other' },
  { module: 'FIELD:seoTitle', label: 'SEO Titel' },
  { module: 'FIELD:seoMetaDescription', label: 'SEO Meta Definitie' },
  { module: 'FIELD:basePrice', label: 'Prijs (Price)' },
  { module: 'FIELD:qualityControlStatus', label: 'Kwaliteitscontrole' },
  { module: 'FIELD:exportStatus', label: 'Export Status' },
  { module: 'FIELD:publicationReady', label: 'Publicatie Gereed' },
  { module: 'FIELD:internalNotes', label: 'Interne Notities' }
];

export default function RolesClient({ roles, layout = [] }: { roles: any[], layout?: any[] }) {
  const [isPending, startTransition] = useTransition();

  const [newRoleName, setNewRoleName] = useState('');
  const [editingRole, setEditingRole] = useState<{ id: string, name: string } | null>(null);
  
  // State to hold which role ID we are currently configuring fields for
  const [fieldConfigModalRoleId, setFieldConfigModalRoleId] = useState<string | null>(null);

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
    if (!role?.rolePermissions) return defaultAction;
    const perm = role.rolePermissions.find((p: any) => p.module === moduleName);
    return perm ? perm.action : defaultAction;
  };

  const selectedRoleForFields = roles.find(r => r.id === fieldConfigModalRoleId);

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

              {/* Field Permissions - Trigger */}
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid rgba(0,0,0,0.05)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Productveld Rechten</h3>
                <button 
                  className="btn" 
                  style={{ width: '100%', padding: '0.75rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={() => setFieldConfigModalRoleId(role.id)}
                >
                  ⚙️ Veld Rechten Configureren
                </button>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>Klik om de zichtbaarheid en schrijfrechten van invulvelden te beheren.</p>
              </div>

            </div>
          );
        })}
      </div>

      {/* Backdrop overlay */}
      <div 
        onClick={() => setFieldConfigModalRoleId(null)}
        style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.2)', zIndex: 40, backdropFilter: 'blur(2px)',
          opacity: (fieldConfigModalRoleId && selectedRoleForFields) ? 1 : 0,
          pointerEvents: (fieldConfigModalRoleId && selectedRoleForFields) ? 'auto' : 'none',
          transition: 'opacity 0.3s'
        }} 
      />

      {/* Drawer */}
      <div className="glass" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'calc(100vw - 250px)',
        backgroundColor: 'var(--surface)',
        zIndex: 50,
        transform: (fieldConfigModalRoleId && selectedRoleForFields) ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        overflowY: 'auto',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column'
      }}>
        {fieldConfigModalRoleId && selectedRoleForFields && (
          <>
            <div style={{ padding: '2rem 3rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 10, backdropFilter: 'blur(8px)' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>
                  Veld Rechten: <span style={{ color: 'var(--color-mustard)' }}>{selectedRoleForFields.name}</span>
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Configureer schrijfrechten of verberg specifieke velden.</span>
                </div>
              </div>
              <button 
                onClick={() => setFieldConfigModalRoleId(null)} 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.75rem', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', gap: '3.5rem' }}>
                {(() => {
                  const renderDropdown = (moduleName: string, label: string) => {
                    const currentAction = getActionForModule(selectedRoleForFields, moduleName, 'READ');
                    return (
                      <div style={{ marginBottom: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{label}</label>
                        <select 
                          className="input" 
                          style={{ padding: '0.4rem 0.5rem', fontSize: '0.85rem', width: '100%', border: currentAction === 'HIDDEN' ? '1px solid var(--error)' : '1px solid var(--border)', backgroundColor: currentAction === 'HIDDEN' ? 'rgba(255,0,0,0.02)' : 'white', minHeight: '38px' }}
                          disabled={isPending}
                          value={currentAction}
                          onChange={(e) => handleActionChange(selectedRoleForFields.id, moduleName, e.target.value)}
                        >
                          <option value="WRITE">📝 Bewerken (Write)</option>
                          <option value="READ">👀 Alleen Lezen (Read)</option>
                          <option value="HIDDEN">🚫 Verborgen (Hidden)</option>
                        </select>
                      </div>
                    );
                  };

                  return (
                    <>
                      {layout.map(section => (
                        <section key={section.id}>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: section.color, marginBottom: '1.5rem', borderBottom: `2px solid ${section.color}`, paddingBottom: '0.5rem', display: 'inline-block' }}>{section.title}</h3>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '1.5rem', backgroundColor: 'var(--background)', padding: '2rem', borderRadius: 'var(--radius)', border: `1px solid rgba(0,0,0,0.05)` }}>
                            {section.fields.map((f: any) => {
                              let span = f.width ? Number(f.width) : (f.type === 'textarea' || f.type === 'media' ? 12 : 4);
                              if (isNaN(span) || f.width === 'full') span = 12;
                              if (f.width === '1') span = 4;
                              if (f.width === '2') span = 8;
                              
                              return (
                                <div key={f.id} style={{ gridColumn: `span ${span}` }}>
                                  {renderDropdown(f.id, f.label)}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </>
                  );
                })()}

            </div>

            <div style={{ padding: '1.5rem 3rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--surface-hover)', marginTop: 'auto', position: 'sticky', bottom: 0, zIndex: 10 }}>
              <button onClick={() => setFieldConfigModalRoleId(null)} className="btn btn-primary" style={{ boxShadow: '0 4px 14px rgba(225, 191, 220, 0.4)' }}>
                Opslaan & Sluiten
              </button>
            </div>
            
          </>
        )}
      </div>

      {/* Backend Layout Builder */}
      <div style={{ marginTop: '2rem' }}>
        <FormLayoutBuilder initialLayout={layout} />
      </div>

    </div>
  );
}
