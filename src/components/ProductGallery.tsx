"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { getProductImagesAction, uploadProductImageAction, deleteProductImageAction } from '@/app/actions/images';

export default function ProductGallery({ articleNumber }: { articleNumber: string }) {
  const [images, setImages] = useState<{url: string, name: string}[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Load existing images on mount
  useEffect(() => {
    if (!articleNumber) return;
    getProductImagesAction(articleNumber).then(data => setImages(data));
  }, [articleNumber]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     { setLightboxIndex(null); return; }
      if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? (i + 1) % images.length : null);
      if (e.key === 'ArrowLeft')  setLightboxIndex(i => i !== null ? (i - 1 + images.length) % images.length : null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, images.length]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fd = new FormData();
      Array.from(e.target.files).forEach(f => fd.append('images', f));
      startTransition(async () => {
        try {
          const result = await uploadProductImageAction(articleNumber, fd);
          if (result?.error) alert(`Fout bij uploaden: ${result.error}`);
          setImages(await getProductImagesAction(articleNumber));
        } catch (err: any) {
          alert(`Systeemfout bij uploaden: ${err.message || 'Onbekende fout'}`);
        }
      });
      e.target.value = '';
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    setImageToDelete(filename);
  };

  const confirmDelete = async () => {
    if (!imageToDelete) return;
    const filename = imageToDelete;
    setImageToDelete(null);
    startTransition(async () => {
      await deleteProductImageAction(articleNumber, filename);
      setImages(await getProductImagesAction(articleNumber));
    });
  };

  const NavBtn = ({ onClick, side }: { onClick: () => void; side: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: '1.25rem', width: '48px', height: '48px', borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.14)', backdropFilter: 'blur(4px)',
        border: '1px solid rgba(255,255,255,0.28)', color: 'white',
        fontSize: '1.6rem', lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 0.15s', zIndex: 1,
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.26)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.14)')}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );

  // ── Lightbox via portal — escapes drawer overflow clipping ────────────────
  const lightbox = lightboxIndex !== null && images[lightboxIndex] && mounted
    ? createPortal(
        <div
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {images.length > 1 && (
            <>
              <NavBtn onClick={() => setLightboxIndex(i => i !== null ? (i - 1 + images.length) % images.length : null)} side="left" />
              <NavBtn onClick={() => setLightboxIndex(i => i !== null ? (i + 1) % images.length : null)} side="right" />
            </>
          )}

          <img
            src={images[lightboxIndex].url}
            alt={`Product ${lightboxIndex + 1}`}
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '88vw', maxHeight: '76vh',
              objectFit: 'contain', borderRadius: '10px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              userSelect: 'none',
            }}
          />

          {/* Counter + dots + actions */}
          <div onClick={e => e.stopPropagation()} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            {images.length > 1 && (
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.82rem', letterSpacing: '0.05em' }}>
                {lightboxIndex + 1} / {images.length}
              </span>
            )}
            {images.length > 1 && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {images.map((_, i) => (
                  <button
                    key={i} type="button"
                    onClick={() => setLightboxIndex(i)}
                    style={{
                      width: i === lightboxIndex ? '20px' : '8px', height: '8px',
                      borderRadius: '99px', border: 'none', cursor: 'pointer', padding: 0,
                      backgroundColor: i === lightboxIndex ? 'white' : 'rgba(255,255,255,0.32)',
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
              <a
                href={images[lightboxIndex].url}
                download={images[lightboxIndex].name}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                onClick={e => e.stopPropagation()}
              >
                ⬇ Download
              </a>
              <button
                type="button" className="btn"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.25)', fontSize: '0.85rem', padding: '0.45rem 1rem' }}
                onClick={() => setLightboxIndex(null)}
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  // ── Delete confirmation via portal ────────────────────────────────────────
  const deleteDialog = imageToDelete && mounted
    ? createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗑️</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Foto Verwijderen</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>Weet je zeker dat je deze afbeelding permanent wilt verwijderen?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn" style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)', flex: 1 }} onClick={() => setImageToDelete(null)}>Annuleren</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--error)', flex: 1 }} onClick={confirmDelete}>Verwijderen</button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>Product Afbeeldingen</h4>
        <label className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: 'var(--surface-hover)', cursor: isPending ? 'wait' : 'pointer', border: '1px solid var(--border)', borderRadius: 'var(--radius)', opacity: isPending ? 0.7 : 1 }}>
          {isPending ? 'Bezig...' : '+ Upload Foto'}
          <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isPending} />
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        {images.map((img, idx) => (
          <div
            key={img.name}
            onClick={() => setLightboxIndex(idx)}
            style={{ width: '80px', height: '80px', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', position: 'relative', transition: 'transform 0.2s', backgroundColor: 'var(--surface-hover)' }}
            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <img src={img.url} alt={`Product thumb ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              type="button"
              onClick={e => handleDeleteClick(e, img.name)}
              style={{ position: 'absolute', top: '4px', right: '4px', width: '22px', height: '22px', backgroundColor: 'rgba(255,255,255,0.95)', color: 'var(--error)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', paddingBottom: '2px' }}
              title="Verwijderen"
              disabled={isPending}
            >✕</button>
          </div>
        ))}
        {images.length === 0 && !isPending && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nog geen foto's geüpload.</span>
        )}
      </div>

      {lightbox}
      {deleteDialog}
    </div>
  );
}
