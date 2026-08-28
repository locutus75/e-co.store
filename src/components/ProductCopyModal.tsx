"use client";
import React, { useEffect, useState } from 'react';
import { getSupplierProductsAction, getProductDataAction } from '@/app/actions/product';

const ALL_STATUSES = ['NEW', 'EDIT', 'CHECK', 'DONE'] as const;

export default function ProductCopyModal({ 
  supplierId, 
  currentArticleId, 
  layout, 
  isAdmin, 
  fieldPermissions, 
  onClose, 
  onCopy 
}: any) {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [sourceData, setSourceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Status filter state (default: NEW and EDIT, persisted in localStorage)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('eco_copy_status_filter');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
      }
    }
    return ['NEW', 'EDIT'];
  });

  useEffect(() => {
    localStorage.setItem('eco_copy_status_filter', JSON.stringify(selectedStatuses));
  }, [selectedStatuses]);

  const [deselectedFields, setDeselectedFields] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('eco_copy_blacklist');
      if (saved) {
        try { return new Set(JSON.parse(saved)); } catch (e) {}
      }
    }
    return new Set();
  });

  useEffect(() => {
    localStorage.setItem('eco_copy_blacklist', JSON.stringify(Array.from(deselectedFields)));
  }, [deselectedFields]);

  useEffect(() => {
    if (!supplierId) { setLoading(false); return; }
    getSupplierProductsAction(supplierId, currentArticleId).then(list => {
      setProducts(list);
      setLoading(false);
    });
  }, [supplierId, currentArticleId]);

  const filteredProducts = React.useMemo(() => {
    return products.filter(p => {
      const st = (p.status || 'NEW').toUpperCase();
      return selectedStatuses.includes(st);
    });
  }, [products, selectedStatuses]);

  useEffect(() => {
    if (selectedProductId && !filteredProducts.some(p => p.internalArticleNumber === selectedProductId)) {
      setSelectedProductId('');
      setSourceData(null);
    }
  }, [filteredProducts, selectedProductId]);

  useEffect(() => {
    if (selectedProductId) {
      getProductDataAction(selectedProductId).then(data => setSourceData(data));
    } else {
      setSourceData(null);
    }
  }, [selectedProductId]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  const getStatusChipStyle = (status: string, isSelected: boolean) => {
    const norm = status.toUpperCase();
    if (isSelected) {
      switch (norm) {
        case 'NEW':
          return {
            backgroundColor: 'rgba(147, 51, 234, 0.15)',
            borderColor: '#9333ea',
            color: '#7e22ce',
            fontWeight: 600,
            dotColor: '#9333ea'
          };
        case 'EDIT':
          return {
            backgroundColor: 'rgba(209, 182, 74, 0.25)',
            borderColor: 'var(--color-mustard)',
            color: '#854d0e',
            fontWeight: 600,
            dotColor: '#b45309'
          };
        case 'CHECK':
          return {
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            borderColor: '#3b82f6',
            color: '#1d4ed8',
            fontWeight: 600,
            dotColor: '#3b82f6'
          };
        case 'DONE':
          return {
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderColor: '#10b981',
            color: '#047857',
            fontWeight: 600,
            dotColor: '#10b981'
          };
      }
    }
    return {
      backgroundColor: 'transparent',
      borderColor: 'var(--border)',
      color: 'var(--text-muted)',
      fontWeight: 500,
      dotColor: '#94a3b8'
    };
  };

  const toggleField = (fieldId: string) => {
    setDeselectedFields(prev => {
      const copy = new Set(prev);
      if (copy.has(fieldId)) copy.delete(fieldId);
      else copy.add(fieldId);
      return copy;
    });
  };

  const handleCopy = () => {
    if (!sourceData) return;
    const finalDataToInject: any = {};
    layout.forEach((sec: any) => {
      sec.fields.forEach((f: any) => {
        if (f.id === 'FIELD:internalArticleNumber' || f.id === 'FIELD:media') return;
        const action = isAdmin ? 'WRITE' : (fieldPermissions?.[f.id] ?? 'READ');
        
        if (action === 'WRITE' && !deselectedFields.has(f.id)) {
          let key = f.id.replace('FIELD:', '');
          if (key === 'description') key = 'longDescription'; // Backward compatibility
          finalDataToInject[key] = sourceData[key];
        }
      });
    });
    onCopy(finalDataToInject);
  };

  const getValidFields = () => {
    const valid: any[] = [];
    layout.forEach((sec: any) => {
      sec.fields.forEach((f: any) => {
        if (f.id === 'FIELD:internalArticleNumber' || f.id === 'FIELD:media') return;
        const action = isAdmin ? 'WRITE' : (fieldPermissions?.[f.id] ?? 'READ');
        if (action === 'WRITE') valid.push({ ...f, section: sec.title });
      });
    });
    return valid;
  };

  const validFields = getValidFields();

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
      <div className="glass" style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius)', width: '1300px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
        
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text)' }}>
          Kopieer data van ander product
        </h2>
        
        {!supplierId ? (
          <p style={{ color: 'var(--error)' }}>
            Huidig product heeft nog geen leverancier. Kopieren vereist een actieve leverancier.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Leverancier Product ({filteredProducts.length} van {products.length} beschikbaar)
                </label>
                
                {/* Status Filter Chips */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.2rem' }}>
                    Status filter:
                  </span>
                  {ALL_STATUSES.map(st => {
                    const isSelected = selectedStatuses.includes(st);
                    const count = products.filter(p => (p.status || 'NEW').toUpperCase() === st).length;
                    const style = getStatusChipStyle(st, isSelected);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleStatus(st)}
                        title={`Klik om ${st} ${isSelected ? 'uit te sluiten' : 'weer te geven'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '1rem',
                          fontSize: '0.75rem',
                          border: '1px solid',
                          borderColor: style.borderColor,
                          backgroundColor: style.backgroundColor,
                          color: style.color,
                          fontWeight: style.fontWeight,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          userSelect: 'none'
                        }}
                      >
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: style.dotColor,
                          display: 'inline-block'
                        }} />
                        <span>{st}</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>({count})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <select 
                className="input" 
                value={selectedProductId} 
                onChange={e => setSelectedProductId(e.target.value)}
                disabled={loading || filteredProducts.length === 0}
              >
                <option value="">
                  {loading 
                    ? '-- Producten laden... --' 
                    : filteredProducts.length === 0 
                      ? '-- Geen producten met de geselecteerde statussen --' 
                      : '-- Selecteer bron product --'}
                </option>
                {filteredProducts.map(p => {
                  const st = (p.status || 'NEW').toUpperCase();
                  return (
                    <option key={p.internalArticleNumber} value={p.internalArticleNumber}>
                      [{st}] [{p.internalArticleNumber}] {p.title}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedProductId && sourceData && (
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem', marginBottom: '1.5rem', backgroundColor: 'var(--background)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  Selecteer welke velden u wilt overschrijven. Uw selectie wordt onthouden voor de volgende keer.
                </p>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem' }}>
                  {validFields.map(f => (
                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text)', opacity: deselectedFields.has(f.id) ? 0.5 : 1 }}>
                      <input 
                        type="checkbox" 
                        checked={!deselectedFields.has(f.id)} 
                        onChange={() => toggleField(f.id)} 
                      />
                      <span>
                        {f.label}
                        <br/>
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>({f.section})</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: 'auto' }}>
              <button className="btn" onClick={onClose} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border)' }}>
                Annuleren
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleCopy} 
                disabled={!selectedProductId || !sourceData}
                style={{ padding: '0.5rem 1rem' }}
              >
                Kopieer geselecteerde velden
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
