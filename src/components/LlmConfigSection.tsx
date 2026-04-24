'use client';

import React, { useState, useEffect } from 'react';

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '🟢',
    color: '#10a37f',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    defaultVisionModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.5-preview', 'gpt-image-1'],
    keyHelp: 'Begint met sk-…',
    keyLink: 'https://platform.openai.com/api-keys',
    visionNote: null as string | null,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    icon: '🟠',
    color: '#c5601a',
    defaultModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    defaultVisionModels: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
    keyHelp: 'Begint met sk-ant-…',
    keyLink: 'https://console.anthropic.com/settings/keys',
    visionNote: 'Foto-analyse — geen beeldgeneratie' as string | null,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    icon: '🔵',
    color: '#1a73e8',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultVisionModels: ['gemini-2.5-pro-preview-03-25', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'],
    keyHelp: 'Google AI Studio API key',
    keyLink: 'https://aistudio.google.com/app/apikey',
    visionNote: 'Foto-analyse — geen beeldgeneratie' as string | null,
  },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];
interface ModelEntry { id: string; label: string; }

interface ProviderState {
  apiKey: string;
  activeModel: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  enabled: boolean;
  hasApiKey: boolean;
  showKey: boolean;
  saving: boolean;
  saved: boolean;
  error: string;
  fetchedModels: ModelEntry[] | null;
  fetchingModels: boolean;
  fetchError: string;
}

interface VisionState {
  visionModel: string;
  hasApiKey: boolean;
  saving: boolean;
  saved: boolean;
  error: string;
  fetchedModels: ModelEntry[] | null;
  fetchingModels: boolean;
  fetchError: string;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.5rem 1.25rem',
  borderRadius: 'var(--radius)',
  fontWeight: 600,
  fontSize: '0.88rem',
  cursor: 'pointer',
  border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
  backgroundColor: active ? 'var(--primary)' : 'transparent',
  color: active ? 'white' : 'var(--text-muted)',
  transition: 'all 0.15s',
});

// ── Shared "Modellen ophalen" button ──────────────────────────────────────────
function FetchBtn({ p, loading, hasKey, onClick }: {
  p: typeof PROVIDERS[number];
  loading: boolean;
  hasKey: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || !hasKey}
      title={!hasKey ? 'Sla eerst een API key op' : 'Modellen ophalen via de API'}
      style={{
        fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem',
        borderRadius: 'var(--radius)', cursor: hasKey ? 'pointer' : 'not-allowed',
        border: `1px solid ${hasKey ? p.color + '80' : 'var(--border)'}`,
        backgroundColor: hasKey ? `${p.color}12` : 'transparent',
        color: hasKey ? p.color : 'var(--text-muted)',
        opacity: loading ? 0.6 : 1,
        display: 'flex', alignItems: 'center', gap: '0.3rem', transition: 'all 0.15s',
      }}
    >
      <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
      {loading ? 'Ophalen...' : 'Modellen ophalen'}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LlmConfigSection() {
  const [activeTab, setActiveTab] = useState<'general' | 'vision'>('general');

  // ── General state ─────────────────────────────────────────────────────────────
  const [states, setStates] = useState<Record<ProviderId, ProviderState>>(() => {
    const init: any = {};
    for (const p of PROVIDERS) {
      init[p.id] = {
        apiKey: '', activeModel: p.defaultModels[0],
        maxInputTokens: 4000, maxOutputTokens: 2000,
        enabled: true, hasApiKey: false, showKey: false,
        saving: false, saved: false, error: '',
        fetchedModels: null, fetchingModels: false, fetchError: '',
      };
    }
    return init;
  });

  // Load via /api/ai/llm-config (admin-only GET)
  useEffect(() => {
    fetch('/api/ai/llm-config')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((configs: any[]) => {
        setStates(prev => {
          const next = { ...prev };
          for (const c of configs) {
            const id = c.provider as ProviderId;
            if (next[id]) {
              next[id] = {
                ...next[id],
                activeModel: c.activeModel,
                maxInputTokens: c.maxInputTokens,
                maxOutputTokens: c.maxOutputTokens,
                enabled: c.enabled,
                hasApiKey: c.hasApiKey,
              };
            }
          }
          return next;
        });
      })
      .catch(err => console.error('[llm-config load]', err));
  }, []);

  const update = (id: ProviderId, patch: Partial<ProviderState>) =>
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const fetchGeneralModels = async (p: typeof PROVIDERS[number]) => {
    update(p.id, { fetchingModels: true, fetchError: '' });
    try {
      const res = await fetch(`/api/ai/models?provider=${p.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ophalen mislukt');
      update(p.id, {
        fetchingModels: false,
        fetchedModels: data.models,
        activeModel: data.models.some((m: ModelEntry) => m.id === states[p.id].activeModel)
          ? states[p.id].activeModel
          : (data.models[0]?.id ?? states[p.id].activeModel),
      });
    } catch (e: any) {
      update(p.id, { fetchingModels: false, fetchError: e.message });
    }
  };

  // Save via POST /api/ai/llm-config
  const saveGeneral = async (p: typeof PROVIDERS[number]) => {
    update(p.id, { saving: true, saved: false, error: '' });
    const s = states[p.id];
    try {
      const res = await fetch('/api/ai/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: p.id, label: p.label,
          apiKey: s.apiKey,
          activeModel: s.activeModel,
          maxInputTokens: s.maxInputTokens,
          maxOutputTokens: s.maxOutputTokens,
          enabled: s.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      update(p.id, { saving: false, saved: true, hasApiKey: true, apiKey: '' });
      setTimeout(() => update(p.id, { saved: false }), 3000);
    } catch (e: any) {
      console.error('[llm-config save]', p.id, e.message);
      update(p.id, { saving: false, error: e.message });
    }
  };

  // ── Vision state ──────────────────────────────────────────────────────────────
  const [visionStates, setVisionStates] = useState<Record<ProviderId, VisionState>>(() => {
    const init: any = {};
    for (const p of PROVIDERS) {
      init[p.id] = {
        visionModel: p.defaultVisionModels[0],
        hasApiKey: false,
        saving: false, saved: false, error: '',
        fetchedModels: null, fetchingModels: false, fetchError: '',
      };
    }
    return init;
  });

  // Load via /api/ai/vision-config
  useEffect(() => {
    fetch('/api/ai/vision-config')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((configs: { provider: string; visionModel: string; hasApiKey: boolean }[]) => {
        setVisionStates(prev => {
          const next = { ...prev };
          for (const c of configs) {
            const id = c.provider as ProviderId;
            if (next[id]) {
              next[id] = { ...next[id], visionModel: c.visionModel, hasApiKey: c.hasApiKey };
            }
          }
          return next;
        });
      })
      .catch(err => console.error('[vision-config load]', err));
  }, []);

  const updateVision = (id: ProviderId, patch: Partial<VisionState>) =>
    setVisionStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const fetchVisionModels = async (p: typeof PROVIDERS[number]) => {
    updateVision(p.id, { fetchingModels: true, fetchError: '' });
    try {
      const res = await fetch(`/api/ai/models?provider=${p.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ophalen mislukt');
      const models: ModelEntry[] = data.models;
      updateVision(p.id, {
        fetchingModels: false,
        fetchedModels: models,
        visionModel: models.some(m => m.id === visionStates[p.id].visionModel)
          ? visionStates[p.id].visionModel
          : (models[0]?.id ?? visionStates[p.id].visionModel),
      });
    } catch (e: any) {
      updateVision(p.id, { fetchingModels: false, fetchError: e.message });
    }
  };

  // Save via POST /api/ai/vision-config
  const saveVision = async (p: typeof PROVIDERS[number]) => {
    updateVision(p.id, { saving: true, saved: false, error: '' });
    try {
      const res = await fetch('/api/ai/vision-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p.id, visionModel: visionStates[p.id].visionModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      updateVision(p.id, { saving: false, saved: true });
      setTimeout(() => updateVision(p.id, { saved: false }), 3000);
    } catch (e: any) {
      console.error('[vision-config save]', p.id, e.message);
      updateVision(p.id, { saving: false, error: e.message });
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem' }}>

      {/* Header + tabs */}
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>🤖 AI / LLM Configuratie</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            Configureer API keys, actieve modellen en token limieten per provider.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button style={tabStyle(activeTab === 'general')} onClick={() => setActiveTab('general')}>💬 Algemeen</button>
          <button style={tabStyle(activeTab === 'vision')} onClick={() => setActiveTab('vision')}>🖼 Foto AI</button>
        </div>
      </div>

      {/* ══ ALGEMEEN ══ */}
      {activeTab === 'general' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Gebruik <strong>Modellen ophalen</strong> om de actuele modellenlijst te laden. Deze instellingen worden gebruikt voor de AI Assistent chat.
          </p>
          {PROVIDERS.map(p => {
            const s = states[p.id];
            const baseList: ModelEntry[] = s.fetchedModels ?? p.defaultModels.map(m => ({ id: m, label: m }));
            // Always include the currently saved model even if it's not in the hardcoded list
            const modelList: ModelEntry[] = baseList.some(m => m.id === s.activeModel)
              ? baseList
              : [{ id: s.activeModel, label: `${s.activeModel} (huidig opgeslagen)` }, ...baseList];
            return (
              <div key={p.id} style={{ border: `1px solid ${s.hasApiKey ? p.color + '40' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '1.25rem', backgroundColor: s.hasApiKey ? `${p.color}08` : 'transparent' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{p.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{p.label}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: s.hasApiKey ? '#dcfce7' : '#f1f5f9', color: s.hasApiKey ? '#16a34a' : 'var(--text-muted)', border: `1px solid ${s.hasApiKey ? '#bbf7d0' : 'var(--border)'}` }}>
                      {s.hasApiKey ? '✓ Geconfigureerd' : '○ Niet geconfigureerd'}
                    </span>
                    {s.fetchedModels && <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>{s.fetchedModels.length} modellen geladen</span>}
                  </div>
                  <a href={p.keyLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: p.color, textDecoration: 'none', fontWeight: 600 }}>API key ophalen →</a>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px 160px', gap: '1rem', alignItems: 'end' }}>
                  {/* API Key */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      API Key {s.hasApiKey && <span style={{ color: '#16a34a', fontStyle: 'italic', fontWeight: 400 }}>(laat leeg om huidige te bewaren)</span>}
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input type={s.showKey ? 'text' : 'password'} value={s.apiKey} onChange={e => update(p.id, { apiKey: e.target.value })} placeholder={s.hasApiKey ? '••••••••••••••••' : p.keyHelp} className="input" style={{ flex: 1, fontFamily: s.showKey ? 'monospace' : undefined }} />
                      <button type="button" onClick={() => update(p.id, { showKey: !s.showKey })} style={{ padding: '0 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{s.showKey ? '🙈' : '👁'}</button>
                    </div>
                  </div>

                  {/* Model + fetch */}
                  <div style={{ gridColumn: '1 / 3' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Actief Model {s.fetchedModels && <span style={{ fontWeight: 400, color: '#2563eb' }}> — live lijst</span>}
                      </label>
                      <FetchBtn p={p} loading={s.fetchingModels} hasKey={s.hasApiKey} onClick={() => fetchGeneralModels(p)} />
                    </div>
                    <select value={s.activeModel} onChange={e => update(p.id, { activeModel: e.target.value })} className="input" style={{ width: '100%' }}>
                      {modelList.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                    {s.fetchError && <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.3rem' }}>❌ {s.fetchError}</p>}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Max Input Tokens</label>
                    <input type="number" min={100} max={200000} step={500} value={s.maxInputTokens} onChange={e => update(p.id, { maxInputTokens: parseInt(e.target.value) || 4000 })} className="input" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Max Output Tokens</label>
                    <input type="number" min={100} max={32000} step={500} value={s.maxOutputTokens} onChange={e => update(p.id, { maxOutputTokens: parseInt(e.target.value) || 2000 })} className="input" />
                  </div>
                </div>

                {s.error && <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>❌ Fout bij opslaan: {s.error}</div>}

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => saveGeneral(p)} disabled={s.saving} className="btn btn-primary" style={{ minWidth: '140px' }}>
                    {s.saving ? 'Opslaan...' : s.saved ? '✓ Opgeslagen!' : 'Opslaan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ FOTO AI ══ */}
      {activeTab === 'vision' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius)', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>🖼 Foto AI</strong> — Selecteer per provider welk model gebruikt wordt voor foto-analyse en bewerking. De API keys worden gedeeld met de Algemeen tab. Klik op <strong>Modellen ophalen</strong> voor de volledige actuele lijst.
          </div>

          {PROVIDERS.map(p => {
            const vs = visionStates[p.id];
            const baseVisionList: ModelEntry[] = vs.fetchedModels ?? p.defaultVisionModels.map(m => ({ id: m, label: m }));
            // Always include the currently saved vision model even if it's not in the hardcoded list
            const visionModelList: ModelEntry[] = baseVisionList.some(m => m.id === vs.visionModel)
              ? baseVisionList
              : [{ id: vs.visionModel, label: `${vs.visionModel} (huidig opgeslagen)` }, ...baseVisionList];
            return (
              <div key={p.id} style={{ border: `1px solid ${vs.hasApiKey ? p.color + '40' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '1.25rem', backgroundColor: vs.hasApiKey ? `${p.color}08` : 'rgba(0,0,0,0.01)', opacity: vs.hasApiKey ? 1 : 0.65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{p.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{p.label}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: vs.hasApiKey ? '#dcfce7' : '#f1f5f9', color: vs.hasApiKey ? '#16a34a' : 'var(--text-muted)', border: `1px solid ${vs.hasApiKey ? '#bbf7d0' : 'var(--border)'}` }}>
                      {vs.hasApiKey ? '✓ API key beschikbaar' : '○ Geen API key — configureer eerst "Algemeen"'}
                    </span>
                    {vs.fetchedModels && <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>{vs.fetchedModels.length} modellen geladen</span>}
                  </div>
                  {p.visionNote && (
                    <span style={{ fontSize: '0.72rem', color: '#92400e', backgroundColor: '#fef3c7', border: '1px solid #fde68a', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>⚠ {p.visionNote}</span>
                  )}
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Vision Model {vs.fetchedModels && <span style={{ fontWeight: 400, color: '#2563eb' }}> — live lijst</span>}
                    </label>
                    <FetchBtn p={p} loading={vs.fetchingModels} hasKey={vs.hasApiKey} onClick={() => fetchVisionModels(p)} />
                  </div>
                  <select value={vs.visionModel} onChange={e => updateVision(p.id, { visionModel: e.target.value })} className="input" disabled={!vs.hasApiKey} style={{ maxWidth: '420px' }}>
                    {visionModelList.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  {vs.fetchError && <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.3rem' }}>❌ {vs.fetchError}</p>}
                </div>

                {vs.error && <div style={{ marginTop: '0.75rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>❌ Fout bij opslaan: {vs.error}</div>}

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => saveVision(p)} disabled={vs.saving || !vs.hasApiKey} className="btn btn-primary" style={{ minWidth: '140px' }}>
                    {vs.saving ? 'Opslaan...' : vs.saved ? '✓ Opgeslagen!' : 'Opslaan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
