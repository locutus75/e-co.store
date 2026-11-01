"use client";

import React, { useState, useTransition, useMemo } from 'react';
import { bulkTransferSupplierAction } from '@/app/actions/product';
import { useBackdropClose } from '@/hooks/useBackdropClose';

export interface TransferProductItem {
  internalArticleNumber: string;
  title: string;
  supplier?: { id?: string; name?: string } | null;
}

interface TransferSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: TransferProductItem[];
  allSuppliers: { id: string; name: string }[];
  preselectedSupplierId?: string;
  onSuccess: (targetSupplier: { id: string; name: string }, count: number) => void;
}

export default function TransferSupplierModal({
  isOpen,
  onClose,
  products,
  allSuppliers = [],
  preselectedSupplierId = '',
  onSuccess,
}: TransferSupplierModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(preselectedSupplierId);
  const [newSupplierName, setNewSupplierName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const backdropProps = useBackdropClose(onClose, isPending);

  // Reset or prefill when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      if (preselectedSupplierId && preselectedSupplierId !== '__NEW__') {
        setSelectedSupplierId(preselectedSupplierId);
        setMode('existing');
      } else if (preselectedSupplierId === '__NEW__') {
        setMode('new');
        setSelectedSupplierId('');
      } else {
        setSelectedSupplierId('');
      }
      setNewSupplierName('');
      setSearchTerm('');
    }
  }, [isOpen, preselectedSupplierId]);

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return allSuppliers;
    const term = searchTerm.toLowerCase();
    return allSuppliers.filter(s => s.name.toLowerCase().includes(term));
  }, [allSuppliers, searchTerm]);

  if (!isOpen) return null;

  const count = products.length;

  const handleConfirm = () => {
    setErrorMsg('');

    if (mode === 'existing') {
      if (!selectedSupplierId) {
        setErrorMsg('Selecteer a.u.b. een leverancier.');
        return;
      }
    } else {
      if (!newSupplierName.trim()) {
        setErrorMsg('Vul a.u.b. een geldige leveranciersnaam in.');
        return;
      }
    }

    const internalIds = products.map(p => p.internalArticleNumber);

    startTransition(async () => {
      const res = await bulkTransferSupplierAction(
        internalIds,
        mode === 'existing' ? selectedSupplierId : undefined,
        mode === 'new' ? newSupplierName.trim() : undefined
      );

      if (res.success && res.supplier) {
        onSuccess(res.supplier, res.count || internalIds.length);
        onClose();
      } else {
        setErrorMsg(res.error || 'Er is een fout opgetreden bij het omzetten.');
      }
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(5px)',
        padding: '1rem',
      }}
      onMouseDown={backdropProps.onMouseDown}
      onClick={backdropProps.onClick}
    >
      <div
        className="glass"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          width: '620px',
          maxWidth: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
              }}
            >
              🏢
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Leverancier Omzetten
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Exclusief voor beheerders (ADMIN)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              background: 'none',
              border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer',
              fontSize: '1.2rem',
              color: 'var(--text-muted)',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
            }}
            title="Sluiten"
          >
            ✕
          </button>
        </div>

        {/* Content body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Admin badge / notice */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius)',
              backgroundColor: 'rgba(51, 133, 140, 0.08)',
              border: '1px solid rgba(51, 133, 140, 0.25)',
              fontSize: '0.82rem',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>🛡️</span>
            <div>
              <strong>ADMIN Bevoegdheid:</strong> U staat op het punt om <strong>{count}</strong> {count === 1 ? 'product' : 'producten'} over te zetten naar een andere leverancier. Deze handeling wordt direct in de database doorgevoerd en geregistreerd in het audit log.
            </div>
          </div>

          {/* Product preview list */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>Geselecteerde producten ({count})</span>
            </div>
            <div
              style={{
                maxHeight: '130px',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--surface-hover)',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              {products.map((p) => (
                <div
                  key={p.internalArticleNumber}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.35rem 0.5rem',
                    backgroundColor: 'var(--surface)',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>#{p.internalArticleNumber}</span>
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                      {p.title || 'Geen titel'}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      backgroundColor: 'var(--surface-hover)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    Huidig: {p.supplier?.name || 'Geen'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mode switch */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
              Nieuwe leverancier bestemming
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setMode('existing')}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  border: mode === 'existing' ? '2px solid var(--color-teal)' : '1px solid var(--border)',
                  backgroundColor: mode === 'existing' ? 'rgba(51, 133, 140, 0.1)' : 'var(--surface)',
                  color: mode === 'existing' ? 'var(--color-teal)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                📋 Bestaande leverancier kiezen
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  border: mode === 'new' ? '2px solid var(--color-teal)' : '1px solid var(--border)',
                  backgroundColor: mode === 'new' ? 'rgba(51, 133, 140, 0.1)' : 'var(--surface)',
                  color: mode === 'new' ? 'var(--color-teal)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                ➕ Nieuwe leverancier aanmaken
              </button>
            </div>

            {mode === 'existing' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {allSuppliers.length > 8 && (
                  <input
                    type="text"
                    className="input"
                    placeholder="Zoek in leveranciers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}
                  />
                )}
                <select
                  className="input"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  style={{
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    borderColor: selectedSupplierId ? 'var(--color-teal)' : 'var(--border)',
                  }}
                >
                  <option value="" disabled>-- Selecteer een doel leverancier --</option>
                  {filteredSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {allSuppliers.length === 0 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--error)' }}>
                    Er zijn nog geen leveranciers in het systeem. Kies &quot;Nieuwe leverancier aanmaken&quot;.
                  </span>
                )}
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  className="input"
                  placeholder="Bijv. Duurzaam B.V. of Ecologische Groothandel"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  style={{
                    fontSize: '0.9rem',
                    borderColor: newSupplierName.trim() ? 'var(--color-teal)' : 'var(--border)',
                  }}
                  autoFocus
                />
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  De nieuwe leverancier wordt aangemaakt en gekoppeld aan de geselecteerde producten.
                </span>
              </div>
            )}
          </div>

          {/* Error display */}
          {errorMsg && (
            <div
              style={{
                padding: '0.65rem 0.9rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--error)',
                borderRadius: 'var(--radius)',
                color: 'var(--error)',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface-hover)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            Annuleren
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleConfirm}
            disabled={isPending || (mode === 'existing' && !selectedSupplierId) || (mode === 'new' && !newSupplierName.trim())}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.85rem',
              backgroundColor: 'var(--color-teal)',
              color: 'white',
              cursor: isPending ? 'wait' : 'pointer',
              opacity: (mode === 'existing' && !selectedSupplierId) || (mode === 'new' && !newSupplierName.trim()) ? 0.5 : 1,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {isPending ? 'Bezig met omzetten...' : `🏢 Omzetten naar leverancier (${count})`}
          </button>
        </div>
      </div>
    </div>
  );
}
