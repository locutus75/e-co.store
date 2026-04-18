"use client";
import { useRouter } from 'next/navigation';
import React, { useState, useMemo, useTransition, useEffect, useCallback } from 'react';
import ProductDrawer from '@/components/ProductDrawer';
import ExcelImportWizard from '@/components/ExcelImportWizard';
import { deleteProductsAction, updateReadyForImportAction, updateProductStatusAction, bulkAssignAction } from '@/app/actions/product';

export const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'NEW': return 'var(--primary)';
    case 'EDIT': return 'var(--color-mustard)';
    case 'CHECK': return '#3b82f6';
    case 'DONE': return '#10b981';
    default: return 'var(--text-muted)';
  }
};

/**
 * Builds a Google search URL for a product using the fields marked `useForSearch`
 * in the form layout. Resolves both plain fields (product.title) and relation
 * fields via a dotted relationPath (product.brand.name).
 */
function buildGoogleSearchUrl(product: any, layout: any[]): string | null {
  const parts: string[] = [];
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (!field.useForSearch) continue;
      let value: any;
      if (field.relationPath) {
        // e.g. 'brand.name' → product.brand?.name
        value = field.relationPath.split('.').reduce((obj: any, key: string) => obj?.[key], product);
      } else {
        const key = field.id.replace('FIELD:', '');
        if (key.startsWith('custom_')) {
          value = product.customData?.[key.replace('custom_', '')];
        } else {
          value = product[key];
        }
      }
      const str = value?.toString().trim();
      if (str) parts.push(str);
    }
  }
  if (parts.length === 0) return null;
  return 'https://www.google.com/search?q=' + parts.map(p => encodeURIComponent(p)).join('+');
}

function InlineStatusToggle({ product, isAdmin }: { product: any, isAdmin: boolean }) {
  const [isPending, startTransition] = useTransition();
  const currentStatus = (product.status || 'NEW').toUpperCase();

  const lockStatus = (product.readyForImport || '').toUpperCase();
  const isGloballyLocked = !isAdmin && (lockStatus === 'JA' || lockStatus === 'REVIEW' || lockStatus === 'R' || lockStatus === 'Y');

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isGloballyLocked) return;
    const nextStatus = e.target.value;
    startTransition(async () => {
      await updateProductStatusAction(product.internalArticleNumber, nextStatus);
    });
  }

  return (
    <select 
      value={currentStatus}
      onChange={handleSelect}
      onClick={(e) => e.stopPropagation()}
      disabled={isPending || isGloballyLocked}
      style={{ 
        padding: '0.35rem 1.75rem 0.35rem 0.85rem', 
        borderRadius: '1rem', 
        fontSize: '0.75rem', 
        fontWeight: 600, 
        backgroundColor: getStatusColor(currentStatus), 
        color: 'white',
        cursor: (isPending || isGloballyLocked) ? 'not-allowed' : 'pointer',
        opacity: (isPending || isGloballyLocked) ? 0.6 : 1,
        transition: 'all 0.2s',
        display: 'inline-block',
        border: 'none',
        outline: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="white" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 2px center',
        backgroundSize: '16px'
      }}>
      {['NEW', 'EDIT', 'CHECK', 'DONE'].map(s => (
        <option key={s} value={s} style={{ color: 'var(--text)', backgroundColor: 'white' }}>{s}</option>
      ))}
    </select>
  );
}



function InlineReadyToggle({ product, isAdmin }: { product: any, isAdmin: boolean }) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (val: string) => {
    if (!isAdmin) return; // Enforce authorization
    if (product.readyForImport === val) return;
    startTransition(async () => {
      await updateReadyForImportAction(product.internalArticleNumber, val);
    });
  }

  const readyMode = product.readyForImport?.toUpperCase() || 'NEE';

  const btnStyle = (val: string, color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '4px',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    cursor: !isAdmin ? 'not-allowed' : (isPending ? 'wait' : 'pointer'),
    backgroundColor: readyMode === val ? color : 'var(--surface)',
    color: readyMode === val ? 'white' : (!isAdmin ? 'var(--border)' : 'var(--text-muted)'),
    border: readyMode === val ? 'none' : '1px solid var(--border)',
    transition: 'all 0.2s',
    opacity: (!isAdmin && readyMode !== val) ? 0.3 : (isPending ? 0.5 : 1)
  });

  return (
    <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
      <div style={btnStyle('NEE', 'var(--error)')} onClick={() => handleUpdate('NEE')} title="No">N</div>
      <div style={btnStyle('REVIEW', '#3b82f6')} onClick={() => handleUpdate('REVIEW')} title="Review">R</div>
      <div style={btnStyle('JA', 'var(--success)')} onClick={() => handleUpdate('JA')} title="Yes">Y</div>
    </div>
  );
}

export default function ProductsClient({ initialProducts, systemUsers = [], isAdmin = false, canAssignProducts = false, canUseAi = false, fieldPermissions = {}, layout = [], currentUserId = '', currentUserChatColor = null }: { initialProducts: any[], systemUsers?: any[], isAdmin?: boolean, canAssignProducts?: boolean, canUseAi?: boolean, fieldPermissions?: Record<string, string>, layout?: any[], currentUserId?: string, currentUserChatColor?: string | null }) {
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [isDeleting, startTransition] = useTransition();

  // ── Unread messages indicator ──────────────────────────────────────────
  const [unreadProducts, setUnreadProducts] = useState<Set<string>>(new Set());

  // Memoised so it re-creates (and re-fires effects) when initialProducts
  // changes — i.e. after every router.refresh() cycle below.
  const checkUnreadProducts = useCallback(() => {
    if (typeof window === 'undefined') return;
    const unread = new Set<string>();
    for (const product of initialProducts) {
      const latestRemark = product.remarks?.[0];
      if (!latestRemark) continue;
      if (latestRemark.userId === currentUserId) continue; // own message
      const key = `chat_last_seen_${currentUserId}_${product.internalArticleNumber}`;
      const lastSeen = localStorage.getItem(key);
      const seenDate = lastSeen ? new Date(lastSeen) : null;
      if (!seenDate || new Date(latestRemark.createdAt) > seenDate) {
        unread.add(product.internalArticleNumber);
      }
    }
    setUnreadProducts(unread);
  }, [initialProducts, currentUserId]);

  // Runs on mount AND whenever initialProducts is refreshed by the auto-sync below
  useEffect(() => { checkUnreadProducts(); }, [checkUnreadProducts]);

  // Re-check when drawer closes (chat has updated localStorage)
  useEffect(() => {
    if (!selectedProduct) checkUnreadProducts();
  }, [selectedProduct, checkUnreadProducts]);

  const getLayoutLabel = (fieldId: string, defaultLabel: string) => {
    if (!layout) return defaultLabel;
    for (const section of layout) {
      if (!section.fields) continue;
      const field = section.fields.find((f: any) => f.id === fieldId);
      if (field && field.label) return field.label;
    }
    return defaultLabel;
  };

  // Auto-Sync Background Engine — also triggers checkUnreadProducts via the
  // useCallback dependency chain when fresh initialProducts arrive.
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 10000); // 10 seconds — balanced for near-real-time badge updates
    return () => clearInterval(interval);
  }, [router]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [webshopReadyFilter, setWebshopReadyFilter] = useState('');
  const [assignedUserFilter, setAssignedUserFilter] = useState('');

  // Multi-select State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Unique Lists for Dropdowns
  const uniqueSuppliers = useMemo(() => {
    const names = initialProducts.map(p => p.supplier?.name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [initialProducts]);

  const uniqueBrands = useMemo(() => {
    const names = initialProducts.map(p => p.brand?.name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [initialProducts]);

  // Filtered resulting list
  const filteredProducts = useMemo(() => {
    return initialProducts.filter(p => {
      const matchSearch = searchQuery === '' || 
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.internalArticleNumber.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchSupplier = supplierFilter === '' || p.supplier?.name === supplierFilter;
      const matchBrand = brandFilter === '' || p.brand?.name === brandFilter;
      const matchStatus = statusFilter === '' || (p.status || 'NEW').toUpperCase() === statusFilter;
      const matchReady = webshopReadyFilter === '' || (p.readyForImport || 'NEE').toUpperCase() === webshopReadyFilter;
      
      const matchAssigned = assignedUserFilter === '' ||
                            (assignedUserFilter === 'UNASSIGNED' ? !p.assignedUserId : p.assignedUserId === assignedUserFilter);

      return matchSearch && matchSupplier && matchBrand && matchStatus && matchReady && matchAssigned;
    });
  }, [initialProducts, searchQuery, supplierFilter, brandFilter, statusFilter, webshopReadyFilter, assignedUserFilter]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.internalArticleNumber)));
    }
  };

  const toggleSelect = (id: string, e?: React.ChangeEvent) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const executeBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Weet je zeker dat je ${selectedIds.size} producten permanent wilt verwijderen?`)) return;

    startTransition(async () => {
      const idsArray = Array.from(selectedIds);
      const res = await deleteProductsAction(idsArray);
      if (res.success) {
        setSelectedIds(new Set());
      } else {
        alert("Fout bij verwijderen: " + res.error);
      }
    });
  };

  const handleBulkAssign = (userId: string) => {
    if (selectedIds.size === 0) return;
    startTransition(async () => {
      const idsArray = Array.from(selectedIds);
      const res = await bulkAssignAction(idsArray, userId);
      if (res.success) {
        setSelectedIds(new Set());
      } else {
        alert("Fout bij toewijzen: " + res.error);
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1600px' }}>
      {showImportWizard && (
        <ExcelImportWizard onClose={() => setShowImportWizard(false)} />
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>Products Database</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {selectedIds.size > 0 && (isAdmin || canAssignProducts) && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--surface-hover)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius)' }}>
              <select 
                className="input"
                style={{ cursor: isDeleting ? 'wait' : 'pointer', border: 'none', backgroundColor: 'transparent', fontWeight: 600, fontSize: '0.85rem' }}
                disabled={isDeleting}
                value=""
                onChange={(e) => handleBulkAssign(e.target.value)}
              >
                <option value="" disabled>Aantal ({selectedIds.size}) toewijzen aan...</option>
                <option value="NONE">-- Ontkoppelen (Unassign) --</option>
                {systemUsers.map(su => (
                  <option key={su.id} value={su.id}>{su.email.split('@')[0]}</option>
                ))}
              </select>
              
              {isAdmin && (
                <button 
                  className="btn" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', backgroundColor: 'var(--error)', border: 'none', cursor: isDeleting ? 'wait' : 'pointer', color: 'white' }}
                  onClick={executeBulkDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? '...' : `🗑 Verwijder`}
                </button>
              )}
            </div>
          )}
          {isAdmin && (
            <button 
               className="btn" 
               style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)' }}
               onClick={() => setShowImportWizard(true)}
            >
              📥 Import Excel
            </button>
          )}
          <button className="btn btn-primary" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}>+ New Product</button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <input 
          type="text" 
          placeholder="🔍 Zoek Artikel of ID..." 
          className="input" 
          style={{ flex: '1 1 300px', padding: '0.5rem 1rem', borderRadius: 'var(--radius)' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select 
          className="input" 
          style={{ flex: '1 1 150px', padding: '0.5rem', borderRadius: 'var(--radius)' }}
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
        >
          <option value="">-- Leveranciers --</option>
          {uniqueSuppliers.map(sup => (
            <option key={sup} value={sup as string}>{sup}</option>
          ))}
        </select>
        <select 
          className="input" 
          style={{ flex: '1 1 150px', padding: '0.5rem', borderRadius: 'var(--radius)' }}
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
        >
          <option value="">-- Merken --</option>
          {uniqueBrands.map(b => (
            <option key={b} value={b as string}>{b}</option>
          ))}
        </select>
        <select 
          className="input" 
          style={{ flex: '1 1 120px', padding: '0.5rem', borderRadius: 'var(--radius)' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">-- Status --</option>
          <option value="NEW">NEW</option>
          <option value="EDIT">EDIT</option>
          <option value="CHECK">CHECK</option>
          <option value="DONE">DONE</option>
        </select>
        <select 
          className="input" 
          style={{ flex: '1 1 140px', padding: '0.5rem', borderRadius: 'var(--radius)' }}
          value={webshopReadyFilter}
          onChange={(e) => setWebshopReadyFilter(e.target.value)}
        >
          <option value="">-- Webshop Ready --</option>
          <option value="NEE">No (N)</option>
          <option value="REVIEW">Review (R)</option>
          <option value="JA">Yes (Y)</option>
        </select>
        {(isAdmin || canAssignProducts) && (
          <select 
            className="input" 
            style={{ flex: '1 1 140px', padding: '0.5rem', borderRadius: 'var(--radius)' }}
            value={assignedUserFilter}
            onChange={(e) => setAssignedUserFilter(e.target.value)}
          >
            <option value="">-- Toegewezen --</option>
            <option value="UNASSIGNED">[ Niet Toegewezen ]</option>
            {systemUsers.map(su => (
               <option key={su.id} value={su.id}>{su.email.split('@')[0]}</option>
            ))}
          </select>
        )}
      </div>
      
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1.25rem', width: '40px' }}>
                <input 
                  type="checkbox" 
                  checked={selectedIds.size > 0 && selectedIds.size === filteredProducts.length}
                  ref={input => {
                    if (input) {
                      input.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredProducts.length;
                    }
                  }}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:internalArticleNumber', 'Article ID')}</th>
              {(isAdmin || canAssignProducts) && <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toewijzing</th>}
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:supplierId', 'Leverancier')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:brandId', 'Merk')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:title', 'Title')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:status', 'Status')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Webshop Ready</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => (
              <tr 
                key={product.id} 
                onClick={() => setSelectedProduct(product)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.2s', backgroundColor: selectedIds.has(product.internalArticleNumber) ? 'var(--primary-glow)' : 'transparent' }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = selectedIds.has(product.internalArticleNumber) ? 'var(--primary-glow)' : 'var(--surface-hover)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedIds.has(product.internalArticleNumber) ? 'var(--primary-glow)' : 'transparent'}
              >
                <td style={{ padding: '1.25rem', width: '40px' }} onClick={e => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(product.internalArticleNumber)}
                    onChange={() => toggleSelect(product.internalArticleNumber)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{ padding: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>
                  {(() => {
                    const googleUrl = buildGoogleSearchUrl(product, layout);
                    if (!googleUrl) return product.internalArticleNumber;
                    return (
                      <a
                        href={googleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="Google zoeken op basis van gemarkeerde velden"
                        style={{
                          color: 'var(--primary)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          borderBottom: '1px dashed var(--primary)',
                          paddingBottom: '1px',
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        {product.internalArticleNumber}
                        <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>🌐</span>
                      </a>
                    );
                  })()}
                </td>
                {(isAdmin || canAssignProducts) && (
                  <td style={{ padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
                    <select 
                      value={product.assignedUserId || 'NONE'}
                      onChange={(e) => {
                        startTransition(async () => { await bulkAssignAction([product.internalArticleNumber], e.target.value); });
                      }}
                      style={{ border: 'none', backgroundColor: 'transparent', color: product.assignedUserId ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      <option value="NONE">-</option>
                      {systemUsers.map(su => (
                        <option key={su.id} value={su.id}>{su.email.split('@')[0]}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>{product.supplier?.name || '-'}</td>
                <td style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>{product.brand?.name || '-'}</td>
                <td style={{ padding: '1.25rem', color: 'var(--text)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{product.title}</span>
                    {unreadProducts.has(product.internalArticleNumber) && (
                      <span
                        title="Ongelezen berichten in interne communicatie"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                          backgroundColor: '#ef4444', color: 'white',
                          fontSize: '0.6rem', fontWeight: 800,
                          padding: '0.1rem 0.45rem', borderRadius: '1rem',
                          flexShrink: 0, animation: 'chat-unread-pulse 2s ease-in-out infinite',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        💬 nieuw
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '1.25rem' }}>
                  <InlineStatusToggle product={product} isAdmin={isAdmin} />
                </td>
                <td style={{ padding: '1.25rem' }}>
                  <InlineReadyToggle product={product} isAdmin={isAdmin} />
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen producten gevonden die voldoen aan je filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ProductDrawer 
        product={selectedProduct} 
        isOpen={!!selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
        fieldPermissions={isAdmin ? undefined : fieldPermissions}
        isAdmin={isAdmin}
        canUseAi={canUseAi}
        layout={layout}
        currentUserId={currentUserId}
        currentUserChatColor={currentUserChatColor}
        userChatColors={Object.fromEntries(
          systemUsers.filter((u: any) => u.chatColor).map((u: any) => [u.id, u.chatColor])
        )}
      />
    </div>
  );
}
