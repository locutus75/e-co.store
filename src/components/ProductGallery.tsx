"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { getProductImagesAction, uploadProductImageAction, deleteProductImageAction } from '@/app/actions/images';

export default function ProductGallery({ articleNumber }: { articleNumber: string }) {
  const [images, setImages] = useState<{url: string, name: string}[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load existing images on mount
  useEffect(() => {
    if(!articleNumber) return;
    getProductImagesAction(articleNumber).then(data => {
      setImages(data);
    });
  }, [articleNumber]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("[ProductGallery] Files selected:", e.target.files);
    
    if (e.target.files && e.target.files.length > 0) {
      const fd = new FormData();
      Array.from(e.target.files).forEach((f, i) => {
        console.log(`[ProductGallery] Appending file ${i}:`, f.name, f.size, f.type);
        fd.append('images', f);
      });
      
      startTransition(async () => {
        try {
          console.log("[ProductGallery] Calling uploadProductImageAction...");
          const result = await uploadProductImageAction(articleNumber, fd);
          console.log("[ProductGallery] Server responded:", result);
          if (result && result.error) {
            alert(`Fout bij uploaden (Server): ${result.error}`);
          }
          // Refresh local list
          const updated = await getProductImagesAction(articleNumber);
          setImages(updated);
        } catch (err: any) {
          alert(`Systeemfout bij uploaden (Mogelijk CSRF/Rechten): ${err.message || 'Onbekende fout'}`);
        }
      });
      // Clear input manually to allow selecting the same file again
      e.target.value = '';
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation(); // Prevent opening the lightbox
    setImageToDelete(filename);
  };

  const confirmDelete = async () => {
    if (!imageToDelete) return;
    const filename = imageToDelete;
    setImageToDelete(null);
    
    startTransition(async () => {
      await deleteProductImageAction(articleNumber, filename);
      // Refresh local list instantly
      const updated = await getProductImagesAction(articleNumber);
      setImages(updated);
    });
  };

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
          <div key={img.name} onClick={() => setLightboxIndex(idx)} style={{ width: '80px', height: '80px', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', position: 'relative', transition: 'transform 0.2s', backgroundColor: 'var(--surface-hover)' }} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
            <img src={img.url} alt={`Product thumb ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            
            <button 
              type="button"
              onClick={(e) => handleDeleteClick(e, img.name)}
              style={{ position: 'absolute', top: '4px', right: '4px', width: '22px', height: '22px', backgroundColor: 'rgba(255,255,255,0.95)', color: 'var(--error)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', paddingBottom: '2px' }}
              title="Verwijderen"
              disabled={isPending}
            >
              ✕
            </button>
          </div>
        ))}
        {images.length === 0 && !isPending && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nog geen foto's geüpload.</span>
        )}
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <div 
          onClick={() => setLightboxIndex(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
        >
          <img src={images[lightboxIndex].url} alt={`Product full ${lightboxIndex + 1}`} style={{ maxWidth: '90%', maxHeight: '80%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <a 
              href={images[lightboxIndex].url} 
              download={images[lightboxIndex].name} 
              className="btn btn-primary" 
              onClick={e => e.stopPropagation()}
            >
              Download Foto
            </a>
            <button type="button" className="btn" style={{ backgroundColor: 'white', border: 'none' }} onClick={() => setLightboxIndex(null)}>Sluiten</button>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Dialog */}
      {imageToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗑️</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Foto Verwijderen</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>Weet je zeker dat je deze afbeelding permanent wilt verwijderen?</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn" style={{ backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', color: 'var(--text)', flex: 1 }} onClick={() => setImageToDelete(null)}>Annuleren</button>
              <button className="btn btn-primary" style={{ backgroundColor: 'var(--error)', flex: 1 }} onClick={confirmDelete}>Verwijderen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
