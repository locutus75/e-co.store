"use client";
import React, { useState, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { getProductImagesAction, uploadProductImageAction, deleteProductImageAction } from '@/app/actions/images';

// Vision providers that can be used for image editing
const VISION_PROVIDERS = [
  { id: 'openai',    label: 'OpenAI',          icon: '🟢' },
  { id: 'anthropic', label: 'Anthropic Claude', icon: '🟠' },
  { id: 'gemini',    label: 'Google Gemini',    icon: '🔵' },
] as const;

// Models that can actually edit/generate images (OpenAI Images Edit API)
const IMAGE_EDIT_MODELS = ['gpt-image-1', 'gpt-image-2', 'dall-e-2'];

function canEditImages(provider: VisionProvider, model: string): boolean {
  return provider === 'openai' && IMAGE_EDIT_MODELS.includes(model?.toLowerCase?.() ?? '');
}

type VisionProvider = typeof VISION_PROVIDERS[number]['id'];

interface ProviderVisionInfo {
  provider: VisionProvider;
  visionModel: string;
  hasApiKey: boolean;
}

interface AiEditState {
  instruction: string;
  provider: VisionProvider;
  loading: boolean;
  result: string | null;
  newImageUrl: string | null;
  error: string | null;
  editMode: boolean | null; // null = not yet run
}

export default function ProductGallery({ articleNumber, canUseAi = false }: { articleNumber: string; canUseAi?: boolean }) {
  const [images, setImages] = useState<{url: string, name: string}[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // AI editing state: keyed by image name
  const [aiPanelOpen, setAiPanelOpen] = useState<string | null>(null); // image name
  const [aiState, setAiState] = useState<AiEditState>({
    instruction: '',
    provider: 'openai',
    loading: false,
    result: null,
    newImageUrl: null,
    error: null,
    editMode: null,
  });

  // Available vision providers with their configured model
  const [availableProviders, setAvailableProviders] = useState<VisionProvider[]>([]);
  const [providerVisionInfo, setProviderVisionInfo] = useState<Record<VisionProvider, ProviderVisionInfo>>({
    openai:    { provider: 'openai',    visionModel: '', hasApiKey: false },
    anthropic: { provider: 'anthropic', visionModel: '', hasApiKey: false },
    gemini:    { provider: 'gemini',    visionModel: '', hasApiKey: false },
  });
  // Photo presets for the media field
  const [photoPresets, setPhotoPresets] = useState<string[]>([]);


  useEffect(() => { setMounted(true); }, []);

  // Load existing images on mount
  useEffect(() => {
    if (!articleNumber) return;
    getProductImagesAction(articleNumber).then(data => setImages(data));
  }, [articleNumber]);

  // Load available AI providers + their vision model config + photo presets
  useEffect(() => {
    if (!canUseAi) return;
    Promise.all([
      fetch('/api/ai/providers').then(r => r.json()).catch(() => []),
      fetch('/api/ai/vision-config').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/ai/photo-presets?fieldId=FIELD%3Amedia').then(r => r.ok ? r.json() : { presets: [] }).catch(() => ({ presets: [] })),
    ]).then(([providers, visionConfigs, presetsData]: [any[], any[], any]) => {
      const active = providers
        .filter((c: any) => c.hasApiKey)
        .map((c: any) => c.provider as VisionProvider);
      setAvailableProviders(active);

      const infoMap: Record<string, ProviderVisionInfo> = {};
      for (const vc of visionConfigs) {
        infoMap[vc.provider] = { provider: vc.provider, visionModel: vc.visionModel, hasApiKey: vc.hasApiKey };
      }
      setProviderVisionInfo(prev => ({ ...prev, ...infoMap }));

      setPhotoPresets(presetsData.presets ?? []);

      if (active.length > 0 && !active.includes(aiState.provider)) {
        setAiState(prev => ({ ...prev, provider: active[0] }));
      }
    });
  }, [canUseAi]);


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

  // ── AI image edit ──────────────────────────────────────────────────────────
  const openAiPanel = (e: React.MouseEvent, imageName: string) => {
    e.stopPropagation();
    setAiPanelOpen(imageName);
    setAiState(prev => ({ ...prev, result: null, newImageUrl: null, error: null, instruction: '', editMode: null }));
  };

  const runAiEdit = async (imageName: string) => {
    if (!aiState.instruction.trim()) return;
    setAiState(prev => ({ ...prev, loading: true, result: null, newImageUrl: null, error: null }));
    try {
      const res = await fetch('/api/ai/image-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleNumber,
          filename: imageName,
          instruction: aiState.instruction,
          provider: aiState.provider,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data.error || 'AI bewerking mislukt';
        console.error('[image-edit] Server error:', res.status, errMsg);
        throw new Error(errMsg);
      }
      setAiState(prev => ({
        ...prev,
        loading: false,
        result: data.description || 'Geen beschrijving ontvangen.',
        newImageUrl: data.newImageUrl || null,
        editMode: data.editMode ?? false,
      }));
      // Refresh gallery if a new image was saved
      if (data.newImageUrl) {
        setImages(await getProductImagesAction(articleNumber));
      }
    } catch (err: any) {
      console.error('[image-edit] Error:', err.message);
      setAiState(prev => ({ ...prev, loading: false, error: err.message }));
    }

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

  // ── Lightbox via portal ─────────────────────────────────────────────────────
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

  // ── Delete confirmation via portal ─────────────────────────────────────────
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

  // ── AI Edit panel via portal ────────────────────────────────────────────────
  const aiPanel = aiPanelOpen && mounted
    ? createPortal(
        <div
          onClick={() => setAiPanelOpen(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            className="glass"
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '560px', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>🖼 AI Foto Bewerking</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Bestand: <code style={{ backgroundColor: 'var(--surface-hover)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem' }}>{aiPanelOpen}</code>
                </p>
              </div>
              <button type="button" onClick={() => setAiPanelOpen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
            </div>

            {/* Provider selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>AI Provider</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {VISION_PROVIDERS.filter(p => availableProviders.includes(p.id)).map(p => {
                  const info = providerVisionInfo[p.id];
                  const willEdit = canEditImages(p.id, info?.visionModel ?? '');
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAiState(prev => ({ ...prev, provider: p.id }))}
                      style={{
                        padding: '0.4rem 0.9rem', borderRadius: 'var(--radius)', fontSize: '0.82rem',
                        fontWeight: aiState.provider === p.id ? 700 : 400,
                        border: aiState.provider === p.id ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                        backgroundColor: aiState.provider === p.id ? 'rgba(var(--primary-rgb),0.07)' : 'transparent',
                        color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                        transition: 'all 0.15s',
                      }}
                    >
                      {p.icon} {p.label}
                      <span style={{ fontSize: '0.65rem', color: willEdit ? '#059669' : 'var(--text-muted)', fontWeight: 600 }}>
                        {willEdit ? '✏️ bewerken' : '🔍 analyse'}
                      </span>
                    </button>
                  );
                })}
                {availableProviders.length === 0 && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    ⚙️ Geen AI-providers geconfigureerd. Ga naar Systeeminstellingen → AI Configuratie.
                  </p>
                )}
              </div>
            </div>

            {/* Mode notice */}
            {availableProviders.length > 0 && (() => {
              const info = providerVisionInfo[aiState.provider];
              const willEdit = canEditImages(aiState.provider, info?.visionModel ?? '');
              const modelName = info?.visionModel || '(nog niet geconfigureerd)';
              return willEdit ? (
                <div style={{ padding: '0.6rem 0.9rem', backgroundColor: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.3)', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: '#065f46', lineHeight: 1.5 }}>
                  <strong>✏️ Bewerkmodus</strong> — model <code style={{ fontSize: '0.78rem', backgroundColor: 'rgba(5,150,105,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{modelName}</code> past de afbeelding echt aan en slaat het resultaat op in de galerij.
                </div>
              ) : (
                <div style={{ padding: '0.6rem 0.9rem', backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: '#92400e', lineHeight: 1.5 }}>
                  <strong>🔍 Analysemodus</strong> — model <code style={{ fontSize: '0.78rem', backgroundColor: 'rgba(245,158,11,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{modelName}</code> <em>analyseert</em> de foto en geeft advies maar kan geen afbeeldingen aanpassen.
                  {aiState.provider === 'openai' && (
                    <span> Kies <strong>gpt-image-1</strong> als Foto AI-model in Systeeminstellingen voor echte bewerking.</span>
                  )}
                </div>
              );
            })()}

            {/* Instruction */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {canEditImages(aiState.provider, providerVisionInfo[aiState.provider]?.visionModel ?? '') ? 'Bewerkingsinstructie' : 'Analysevraag'}
                </label>
              </div>

              {/* Preset chips */}
              {photoPresets.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.6rem' }}>
                  {photoPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={aiState.loading}
                      onClick={() => setAiState(prev => ({ ...prev, instruction: preset }))}
                      title={`Gebruik: "${preset}"`}
                      style={{
                        padding: '0.25rem 0.65rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: aiState.loading ? 'not-allowed' : 'pointer',
                        border: aiState.instruction === preset ? '1.5px solid #0ea5e9' : '1px solid #bae6fd',
                        backgroundColor: aiState.instruction === preset ? '#e0f2fe' : '#f0f9ff',
                        color: aiState.instruction === preset ? '#0369a1' : '#0c4a6e',
                        transition: 'all 0.12s',
                        whiteSpace: 'nowrap',
                        maxWidth: '240px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      🤖 {preset}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                value={aiState.instruction}
                onChange={e => setAiState(prev => ({ ...prev, instruction: e.target.value }))}
                placeholder={canEditImages(aiState.provider, providerVisionInfo[aiState.provider]?.visionModel ?? '')
                  ? 'Bijv: "Vervang de achtergrond door een witte achtergrond" of "Verwijder de achtergrond"'
                  : 'Bijv: "Beschrijf wat er op deze foto staat" of "Wat zijn verbeterpunten voor deze productfoto?"'}
                rows={3}
                disabled={aiState.loading || availableProviders.length === 0}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)',
                  border: '1.5px solid var(--border)', backgroundColor: 'var(--surface-hover)',
                  fontSize: '0.9rem', color: 'var(--text)', resize: 'vertical', lineHeight: 1.5,
                  outline: 'none', transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>




            {/* Result */}
            {aiState.result && (
              <div style={{ padding: '1rem', backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius)', fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, maxHeight: '200px', overflowY: 'auto' }}>
                <strong style={{ color: '#059669', display: 'block', marginBottom: '0.4rem' }}>✓ AI Resultaat</strong>
                <p style={{ whiteSpace: 'pre-wrap' }}>{aiState.result}</p>
                {aiState.newImageUrl && (
                  <div style={{ marginTop: '0.75rem', padding: '0.5rem', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius)', fontSize: '0.8rem', color: '#065f46', fontWeight: 600 }}>
                    ✅ Nieuwe bewerkte afbeelding is opgeslagen in de galerij!
                  </div>
                )}
              </div>
            )}

            {aiState.error && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', fontSize: '0.85rem', color: '#dc2626', lineHeight: 1.6 }}>
                <strong>❌ Fout bij uitvoeren</strong>
                <p style={{ marginTop: '0.25rem', marginBottom: 0, wordBreak: 'break-word' }}>{aiState.error}</p>
                <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.78rem', color: '#9f1239' }}>
                  💡 Controleer: (1) is het juiste vision-model geselecteerd in Systeeminstellingen → Foto AI? (2) ondersteunt het model van uw API key vision-invoer?
                </p>
              </div>
            )}


            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" style={{ backgroundColor: 'var(--surface-hover)' }} onClick={() => setAiPanelOpen(null)}>
                Sluiten
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={aiState.loading || !aiState.instruction.trim() || availableProviders.length === 0}
                onClick={() => runAiEdit(aiPanelOpen!)}
                style={{ minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {aiState.loading ? (
                  <>
                    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Bezig...
                  </>
                ) : '🤖 Uitvoeren'}
              </button>
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
            style={{ position: 'relative', display: 'inline-block' }}
          >
            <div
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
            {/* AI edit button below thumbnail */}
            {canUseAi && (
              <button
                type="button"
                onClick={e => openAiPanel(e, img.name)}
                title="AI Bewerking"
                style={{
                  marginTop: '4px',
                  width: '80px',
                  padding: '0.2rem 0',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(99,102,241,0.1)',
                  color: 'var(--primary)',
                  border: '1px solid rgba(99,102,241,0.25)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.18)'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(99,102,241,0.1)'; }}
              >
                🤖 AI Edit
              </button>
            )}
          </div>
        ))}
        {images.length === 0 && !isPending && (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nog geen foto&apos;s geüpload.</span>
        )}
      </div>

      {lightbox}
      {deleteDialog}
      {aiPanel}
      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
