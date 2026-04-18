'use client';

import React, { useState, useEffect } from 'react';
import { saveLlmConfigAction } from '@/app/actions/llm';

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '🟢',
    color: '#10a37f',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    keyHelp: 'Begint met sk-…',
    keyLink: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    icon: '🟠',
    color: '#c5601a',
    defaultModels: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    keyHelp: 'Begint met sk-ant-…',
    keyLink: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    icon: '🔵',
    color: '#1a73e8',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    keyHelp: 'Google AI Studio API key',
    keyLink: 'https://aistudio.google.com/app/apikey',
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
  // dynamic model list
  fetchedModels: ModelEntry[] | null;   // null = not fetched yet
  fetchingModels: boolean;
  fetchError: string;
}

export default function LlmConfigSection() {
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

  useEffect(() => {
    fetch('/api/ai/providers')
      .then(r => r.json())
      .then((configs: any[]) => {
        setStates(prev => {
          const next = { ...prev };
          for (const c of configs) {
            if (next[c.provider as ProviderId]) {
              next[c.provider as ProviderId] = {
                ...next[c.provider as ProviderId],
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
      .catch(() => {});
  }, []);

  const update = (id: ProviderId, patch: Partial<ProviderState>) => {
    setStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const fetchModels = async (p: typeof PROVIDERS[number]) => {
    update(p.id, { fetchingModels: true, fetchError: '' });
    try {
      const res = await fetch(`/api/ai/models?provider=${p.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ophalen mislukt');
      update(p.id, {
        fetchingModels: false,
        fetchedModels: data.models,
        // If current activeModel is not in fetched list, reset to first
        activeModel: data.models.some((m: ModelEntry) => m.id === states[p.id].activeModel)
          ? states[p.id].activeModel
          : data.models[0]?.id ?? states[p.id].activeModel,
      });
    } catch (e: any) {
      update(p.id, { fetchingModels: false, fetchError: e.message });
    }
  };

  const save = async (p: typeof PROVIDERS[number]) => {
    update(p.id, { saving: true, saved: false, error: '' });
    const s = states[p.id];
    const result = await saveLlmConfigAction({
      provider: p.id,
      label: p.label,
      apiKey: s.apiKey,
      activeModel: s.activeModel,
      maxInputTokens: s.maxInputTokens,
      maxOutputTokens: s.maxOutputTokens,
      enabled: s.enabled,
    });
    if (result.success) {
      update(p.id, { saving: false, saved: true, hasApiKey: true, apiKey: '' });
      setTimeout(() => update(p.id, { saved: false }), 3000);
    } else {
      update(p.id, { saving: false, error: result.error ?? 'Fout bij opslaan' });
    }
  };

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>🤖 AI / LLM Configuratie</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
          Configureer API keys, actief model en token limieten per provider. Gebruik <strong>Modellen ophalen</strong> om de actuele modellenlijst te laden.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {PROVIDERS.map(p => {
          const s = states[p.id];
          const modelList: ModelEntry[] = s.fetchedModels ?? p.defaultModels.map(m => ({ id: m, label: m }));

          return (
            <div key={p.id} style={{
              border: `1px solid ${s.hasApiKey ? p.color + '40' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '1.25rem',
              backgroundColor: s.hasApiKey ? `${p.color}08` : 'transparent',
            }}>
              {/* Provider header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{p.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{p.label}</span>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.6rem',
                    borderRadius: '999px',
                    backgroundColor: s.hasApiKey ? '#dcfce7' : '#f1f5f9',
                    color: s.hasApiKey ? '#16a34a' : 'var(--text-muted)',
                    border: `1px solid ${s.hasApiKey ? '#bbf7d0' : 'var(--border)'}`,
                  }}>
                    {s.hasApiKey ? '✓ Geconfigureerd' : '○ Niet geconfigureerd'}
                  </span>
                  {s.fetchedModels && (
                    <span style={{
                      fontSize: '0.7rem', padding: '0.15rem 0.6rem', borderRadius: '999px',
                      backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                    }}>
                      {s.fetchedModels.length} modellen geladen
                    </span>
                  )}
                </div>
                <a href={p.keyLink} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', color: p.color, textDecoration: 'none', fontWeight: 600 }}>
                  API key ophalen →
                </a>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px 160px', gap: '1rem', alignItems: 'end' }}>
                {/* API Key */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                    API Key {s.hasApiKey && <span style={{ color: '#16a34a', fontStyle: 'italic', fontWeight: 400 }}>(laat leeg om huidige te bewaren)</span>}
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type={s.showKey ? 'text' : 'password'}
                      value={s.apiKey}
                      onChange={e => update(p.id, { apiKey: e.target.value })}
                      placeholder={s.hasApiKey ? '••••••••••••••••' : p.keyHelp}
                      className="input"
                      style={{ flex: 1, fontFamily: s.showKey ? 'monospace' : undefined }}
                    />
                    <button
                      type="button"
                      onClick={() => update(p.id, { showKey: !s.showKey })}
                      style={{ padding: '0 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}
                    >
                      {s.showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                {/* Active model + fetch button */}
                <div style={{ gridColumn: '1 / 3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Actief Model
                      {s.fetchedModels && <span style={{ fontWeight: 400, color: '#2563eb' }}> — live lijst</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => fetchModels(p)}
                      disabled={s.fetchingModels || !s.hasApiKey}
                      title={!s.hasApiKey ? 'Sla eerst een API key op' : 'Modellen ophalen via de API'}
                      style={{
                        fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem',
                        borderRadius: 'var(--radius)', cursor: s.hasApiKey ? 'pointer' : 'not-allowed',
                        border: `1px solid ${s.hasApiKey ? p.color + '80' : 'var(--border)'}`,
                        backgroundColor: s.hasApiKey ? `${p.color}12` : 'transparent',
                        color: s.hasApiKey ? p.color : 'var(--text-muted)',
                        opacity: s.fetchingModels ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{
                        display: 'inline-block',
                        animation: s.fetchingModels ? 'spin 1s linear infinite' : 'none',
                      }}>🔄</span>
                      {s.fetchingModels ? 'Ophalen...' : 'Modellen ophalen'}
                    </button>
                  </div>
                  <select
                    value={s.activeModel}
                    onChange={e => update(p.id, { activeModel: e.target.value })}
                    className="input"
                    style={{ width: '100%' }}
                  >
                    {modelList.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  {s.fetchError && (
                    <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.3rem' }}>
                      ❌ {s.fetchError}
                    </p>
                  )}
                </div>

                {/* Max input tokens */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Max Input Tokens</label>
                  <input
                    type="number"
                    min={100} max={200000} step={500}
                    value={s.maxInputTokens}
                    onChange={e => update(p.id, { maxInputTokens: parseInt(e.target.value) || 4000 })}
                    className="input"
                  />
                </div>

                {/* Max output tokens */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Max Output Tokens</label>
                  <input
                    type="number"
                    min={100} max={32000} step={500}
                    value={s.maxOutputTokens}
                    onChange={e => update(p.id, { maxOutputTokens: parseInt(e.target.value) || 2000 })}
                    className="input"
                  />
                </div>
              </div>

              {s.error && (
                <div style={{ marginTop: '0.75rem', padding: '0.6rem', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius)', color: '#dc2626', fontSize: '0.85rem' }}>
                  ❌ {s.error}
                </div>
              )}

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => save(p)}
                  disabled={s.saving}
                  className="btn btn-primary"
                  style={{ minWidth: '140px' }}
                >
                  {s.saving ? 'Opslaan...' : s.saved ? '✓ Opgeslagen!' : 'Opslaan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
