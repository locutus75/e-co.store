"use client";
import React, { useEffect, useState, useTransition } from 'react';
import ProductGallery from './ProductGallery';
import { updateProductAction } from '@/app/actions/product';
import ProductCopyModal from './ProductCopyModal';

const JaNeeToggle = ({ name, defaultChecked, disabled }: { name?: string, defaultChecked: boolean, disabled?: boolean }) => {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label style={{ display: 'flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, position: 'relative', width: 'fit-content' }}>
      <input 
        type="checkbox" 
        name={name} 
        checked={checked} 
        onChange={(e) => !disabled && setChecked(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        disabled={disabled}
      />
      <div style={{
        position: 'relative', width: '56px', height: '28px',
        backgroundColor: checked ? '#10b981' : '#ef4444',
        borderRadius: '30px', transition: 'background-color 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-start' : 'flex-end',
        padding: '0 6px',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <span style={{ fontSize: '0.65rem', color: 'white', fontWeight: 700, pointerEvents: 'none', zIndex: 1, textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
          {checked ? 'JA' : 'NEE'}
        </span>
        <div style={{
          position: 'absolute', top: '2px', left: checked ? 'calc(100% - 26px)' : '2px',
          width: '24px', height: '24px', backgroundColor: 'white',
          borderRadius: '50%', transition: 'left 0.2s',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }} />
      </div>
    </label>
  );
};

export default function ProductDrawer({ product, isOpen, onClose, fieldPermissions, isAdmin = false, layout = [] }: { product: any, isOpen: boolean, onClose: () => void, fieldPermissions?: Record<string, string>, isAdmin?: boolean, layout?: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [statusOverridden, setStatusOverridden] = useState(false);
  const currentStatus = (product?.status || 'NEW').toUpperCase();
  const [activeStatus, setActiveStatus] = useState(currentStatus);

  // Deep clone data to allow programmatic UI refreshes without mutations
  const [localProductData, setLocalProductData] = useState<any>(product);
  const [formKey, setFormKey] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setActiveStatus((product?.status || 'NEW').toUpperCase());
    setStatusOverridden(false);
    setLocalProductData(product ? JSON.parse(JSON.stringify(product)) : null);
    setFormKey(k => k + 1);
  }, [product]);

  const handleCopyCommit = (injectedData: any) => {
    const fresh = { ...localProductData, ...injectedData };
    setLocalProductData(fresh);
    setFormKey(k => k + 1);
    setShowCopyModal(false);
    
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 4000);
  };

  const getStatusColor = (status: string) => {
    switch ((status || 'NEW').toUpperCase()) {
      case 'NEW': return 'var(--primary)';
      case 'EDIT': return 'var(--color-mustard)';
      case 'CHECK': return '#3b82f6';
      case 'DONE': return '#10b981';
      default: return 'var(--text-muted)';
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (formData: FormData) => {
    // Auto-fallback: if the user did NOT touch the status dropdown during this edit session,
    // we forcibly intercept the form save and tag the product as 'EDIT'.
    if (!statusOverridden && formData.get('status') !== 'EDIT') {
      formData.set('status', 'EDIT');
    }
    
    startTransition(async () => {
      if(product?.internalArticleNumber) {
        await updateProductAction(product.internalArticleNumber, formData);
        onClose();
      }
    });
  };

  const renderField = (moduleName: string, label: string, val: string, inputComponent: React.ReactNode, isCheckbox: boolean = false) => {
    let action = isAdmin ? 'WRITE' : (fieldPermissions?.[moduleName] ?? 'READ');

    // internalArticleNumber is explicitly READ-only even for Admins usually
    if (moduleName === 'FIELD:internalArticleNumber') {
      action = 'READ';
    }

    if (action === 'HIDDEN') return null;
    
    if (isCheckbox) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          {action === 'READ' ? (
            <JaNeeToggle defaultChecked={val === 'Ja' || val === 'true' || (val as any) === true} disabled />
          ) : (
            inputComponent
          )}
          <span style={{ fontSize: '0.9rem', color: action === 'READ' ? 'var(--text-muted)' : 'var(--text)', fontWeight: 500 }}>
            {label}
          </span>
        </div>
      );
    }

    return (
      <div>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{label}</label>
        {action === 'READ' ? (
          <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'var(--text-muted)', cursor: 'not-allowed', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center' }}>
            {val || '-'}
          </div>
        ) : (
          inputComponent
        )}
      </div>
    );
  };

  const renderDataField = (f: any) => {
    let key = f.id.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription'; // Backward compatibility fix
    
    const val = localProductData?.[key];
    
    let inputComponent;
    let isCheckbox = false;

    if (f.id === 'FIELD:media') {
      inputComponent = <ProductGallery articleNumber={localProductData?.internalArticleNumber} />;
    } else if (f.type === 'checkbox') {
      isCheckbox = true;
      inputComponent = <JaNeeToggle name={key} defaultChecked={(val as any) === true || val === 'Ja'} />;
    } else if (f.type === 'number') {
      inputComponent = <input type="number" step="any" name={key} className="input" defaultValue={val ?? ''} />;
    } else if (f.type === 'textarea') {
      inputComponent = <textarea name={key} className="input" rows={6} defaultValue={val || ''} />;
    } else {
      const readOnly = f.id === 'FIELD:internalArticleNumber';
      inputComponent = <input name={key} className="input" defaultValue={val || ''} readOnly={readOnly} style={readOnly ? { backgroundColor: 'rgba(0,0,0,0.02)' } : {}} />;
    }

    let span = f.width ? Number(f.width) : (f.type === 'textarea' || f.type === 'media' ? 12 : 4);
    if (isNaN(span) || f.width === 'full') span = 12; // Backwards compatibility for exact strings
    if (f.width === '1') span = 4;
    if (f.width === '2') span = 8;
    
    return (
      <div key={f.id} style={{ gridColumn: `span ${span}` }}>
        {renderField(f.id, f.label, val?.toString() ?? '', inputComponent, isCheckbox)}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div 
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40, backdropFilter: 'blur(2px)' }} 
        />
      )}

      {/* Drawer */}
      <form key={formKey} action={handleSubmit} className="glass" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'calc(100vw - 250px)',
        backgroundColor: 'var(--surface)',
        zIndex: 50,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        overflowY: 'auto',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column'
      }}>
        {localProductData && (
          <>
            <div style={{ padding: '2rem 3rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 10, backdropFilter: 'blur(8px)' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>Edit Product #{localProductData.internalArticleNumber}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', color: 'var(--color-mustard)', fontWeight: 600 }}>{localProductData.title}</span>
                  <select 
                    name="status"
                    value={activeStatus}
                    onChange={(e) => {
                      setStatusOverridden(true);
                      setActiveStatus(e.target.value);
                    }}
                    style={{ 
                      padding: '0.25rem 1.75rem 0.25rem 0.75rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      backgroundColor: getStatusColor(activeStatus), 
                      color: 'white',
                      border: 'none',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                      backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="white" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 2px center',
                      backgroundSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    {['NEW', 'EDIT', 'CHECK', 'DONE'].map(s => (
                      <option key={s} value={s} style={{ color: 'var(--text)', backgroundColor: 'white' }}>{s}</option>
                    ))}
                  </select>
                  
                  <button 
                    type="button"
                    title="Kopieer data van product (zelfde leverancier)"
                    onClick={() => setShowCopyModal(true)}
                    style={{ 
                      padding: '0.25rem 0.6rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      backgroundColor: 'transparent', 
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center', gap: '0.3rem',
                      marginLeft: '0.5rem'
                    }}
                  >
                    🖨 Kopieer Data
                  </button>
                </div>
              </div>
              <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.75rem', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', gap: '4rem' }}>
              {layout?.map((section) => (
                <section key={section.id}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: section.color, marginBottom: '1.5rem', borderBottom: `2px solid ${section.color}`, paddingBottom: '0.5rem', display: 'inline-block' }}>{section.title}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '1.5rem', backgroundColor: 'var(--background)', padding: '2rem', borderRadius: 'var(--radius)', border: `1px solid rgba(0,0,0,0.05)` }}>
                    {section.fields.map((f: any) => renderDataField(f))}
                  </div>
                </section>
              ))}
            </div>

            <div style={{ padding: '2rem 3rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', position: 'sticky', bottom: 0, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
              <button type="button" onClick={onClose} className="btn" style={{ padding: '1rem 2rem', border: '1px solid var(--border)', background: 'transparent' }}>Annuleren</button>
              <button type="submit" disabled={isPending} className="btn btn-primary" style={{ padding: '1rem 3rem', boxShadow: '0 4px 14px rgba(225, 191, 220, 0.4)' }}>
                {isPending ? 'Bezig met opslaan...' : 'Opslaan'}
              </button>
            </div>
          </>
        )}
      </form>

      {showCopyModal && localProductData?.supplierId && (
        <ProductCopyModal 
          supplierId={localProductData.supplierId}
          currentArticleId={localProductData.internalArticleNumber}
          layout={layout}
          isAdmin={isAdmin}
          fieldPermissions={fieldPermissions}
          onClose={() => setShowCopyModal(false)}
          onCopy={handleCopyCommit}
        />
      )}
      
      {/* Toast Notification */}
      {copySuccess && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '3rem', backgroundColor: '#10b981', color: 'white', padding: '1rem 2rem', borderRadius: 'var(--radius)', boxShadow: '0 10px 40px rgba(16, 185, 129, 0.35)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, animation: 'slideIn 0.3s ease-out' }}>
          <span style={{ fontSize: '1.25rem' }}>✓</span> 
          <span>Data succesvol gekopieerd! Controleer en klik op Opslaan.</span>
          <style>{`
            @keyframes slideIn {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
