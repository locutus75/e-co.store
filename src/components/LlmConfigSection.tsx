'use client';

import React, { useState, useEffect } from 'react';

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
    defaultModels: ['claude-sonnet-4-6', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
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
  {
    id: 'custom',
    label: 'Custom (LM Studio)',
    icon: '💻',
    color: '#6b7280',
    defaultModels: ['local-model'],
    keyHelp: 'Optionele API key',
    keyLink: '',
  },
] as const;

const MODULES = [
  { id: 'assistant', label: 'AI Assistent', icon: '💬', description: 'Gebruikt voor de chat assistent rechtsonder.' },
  { id: 'analysis',  label: 'Productanalyse', icon: '🔍', description: 'Gebruikt voor de automatische product data analyse.' },
  { id: 'vision',    label: 'Foto AI', icon: '🖼', description: 'Gebruikt voor het analyseren en bewerken van afbeeldingen.' },
] as const;

type ProviderId = typeof PROVIDERS[number]['id'];
type ModuleId = typeof MODULES[number]['id'];

interface ModuleConfig {
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  systemPrompt?: string;
}

interface ProviderState {
  apiKey: string;
  baseURL?: string;
  enabled: boolean;
  hasApiKey: boolean;
  showKey: boolean;
  modules: Record<ModuleId, ModuleConfig>;
  saving: boolean;
  saved: boolean;
  error: string;
  fetchedModels: { id: string; label: string }[] | null;
  fetchingModels: boolean;
}

interface ModuleDefaults {
  assistant: ProviderId;
  analysis: ProviderId;
  vision: ProviderId;
}

export default function LlmConfigSection() {
  const [providerStates, setProviderStates] = useState<Record<ProviderId, ProviderState>>(() => {
    const init: any = {};
    for (const p of PROVIDERS) {
      init[p.id] = {
        apiKey: '', enabled: true, hasApiKey: false, showKey: false,
        baseURL: p.id === 'custom' ? 'http://localhost:1234/v1' : undefined,
        saving: false, saved: false, error: '',
        fetchedModels: null, fetchingModels: false,
        modules: {
          assistant: { model: p.defaultModels[0], maxInputTokens: 4000, maxOutputTokens: 2000 },
          analysis:  { model: p.defaultModels[0], maxInputTokens: 8000, maxOutputTokens: 4000, systemPrompt: 'Je bent een product expert. Analyseer het product op basis van de verstrekte gegevens.' },
          vision:    { model: p.defaultModels[0], maxInputTokens: 4000, maxOutputTokens: 2000 },
        }
      };
    }
    return init;
  });

  const [moduleDefaults, setModuleDefaults] = useState<ModuleDefaults>({
    assistant: 'openai',
    analysis: 'openai',
    vision: 'openai',
  });

  const [activeProviderTab, setActiveProviderTab] = useState<ProviderId>('openai');
  const [activeModuleTab, setActiveModuleTab] = useState<ModuleId>('assistant');
  const [initialized, setInitialized] = useState(false);

  // Load Data
  useEffect(() => {
    // Load per-provider configs
    fetch('/api/ai/llm-config')
      .then(r => r.json())
      .then((configs: any[]) => {
        setProviderStates(prev => {
          const next = { ...prev };
          for (const c of configs) {
            if (next[c.provider as ProviderId]) {
              next[c.provider as ProviderId] = {
                ...next[c.provider as ProviderId],
                enabled: c.enabled,
                hasApiKey: c.hasApiKey,
                baseURL: c.baseURL ?? next[c.provider as ProviderId]?.baseURL,
                modules: c.modules || next[c.provider as ProviderId].modules,
                fetchedModels: c.fetchedModels || next[c.provider as ProviderId].fetchedModels,
              };
            }
          }
          return next;
        });
      })
      .catch(err => console.error('[llm-config load]', err))
      .finally(() => setInitialized(true));

    // Load global module defaults
    fetch('/api/ai/module-defaults')
      .then(r => r.json())
      .then(d => {
        if (d.assistant) setModuleDefaults(d);
      })
      .catch(err => console.error('[module-defaults load]', err));
  }, []);

  const updateProvider = (id: ProviderId, patch: Partial<ProviderState>) =>
    setProviderStates(prev => ({ 
      ...prev, 
      [id]: { ...prev[id], ...patch } 
    }));

  const updateModule = (providerId: ProviderId, moduleId: ModuleId, patch: Partial<ModuleConfig>) => {
    setProviderStates(prev => {
      const nextState = {
        ...prev,
        [providerId]: {
          ...prev[providerId],
          modules: {
            ...prev[providerId].modules,
            [moduleId]: { ...prev[providerId].modules[moduleId], ...patch }
          }
        }
      };
      
      // Auto-save logic: instant for non-text patches.
      // We pass the exact nextState to avoid stale closures in timeouts.
      const p = PROVIDERS.find(prov => prov.id === providerId);
      if (p && !('systemPrompt' in patch)) {
        setTimeout(() => saveProviderState(p, nextState[providerId]), 100);
      }
      
      return nextState;
    });
  };

  // Debounced auto-save for system prompt and other complex changes
  useEffect(() => {
    if (!initialized) return;
    const timer = setTimeout(() => {
      PROVIDERS.forEach(p => {
        // Find if this provider has any unsaved system prompt changes
        // Since we don't have a deep diff, we'll just save the active tab's provider
        // safely without stale closures if it's not currently saving.
        if (p.id === activeProviderTab && !providerStates[p.id].saving) {
          saveProviderState(p, providerStates[p.id]);
        }
      });
    }, 2000);
    return () => clearTimeout(timer);
  }, [providerStates[activeProviderTab].modules, providerStates[activeProviderTab].enabled, activeProviderTab]);

  const fetchModels = async (p: typeof PROVIDERS[number]) => {
    updateProvider(p.id, { fetchingModels: true });
    try {
      const res = await fetch(`/api/ai/models?provider=${p.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ophalen mislukt');
      
      // Update state and immediately save to persist the list
      setProviderStates(prev => {
        const nextState = {
          ...prev,
          [p.id]: { ...prev[p.id], fetchingModels: false, fetchedModels: data.models }
        };
        // Trigger a background save
        const s = nextState[p.id];
        const payload: any = {
          provider: p.id,
          label: p.label,
          apiKey: s.apiKey,
          enabled: s.enabled,
          modules: s.modules,
          fetchedModels: s.fetchedModels,
          baseURL: s.baseURL,
        };
        fetch('/api/ai/llm-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(err => console.error('[fetchModels auto-save]', err));
        
        return nextState;
      });
    } catch (e: any) {
      updateProvider(p.id, { fetchingModels: false, error: e.message });
    }
  };

  const saveProviderState = async (p: typeof PROVIDERS[number], s: ProviderState) => {
    updateProvider(p.id, { saving: true, saved: false, error: '' });
    try {
      const res = await fetch('/api/ai/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: p.id,
          label: p.label,
          apiKey: s.apiKey,
          enabled: s.enabled,
          modules: s.modules,
          fetchedModels: s.fetchedModels,
          baseURL: s.baseURL,
        }),
      });
      if (!res.ok) throw new Error('Opslaan mislukt');
      updateProvider(p.id, { saving: false, saved: true, hasApiKey: true, apiKey: '' });
      setTimeout(() => updateProvider(p.id, { saved: false }), 3000);
    } catch (e: any) {
      updateProvider(p.id, { saving: false, error: e.message });
    }
  };

  const saveProvider = async (p: typeof PROVIDERS[number]) => {
    // This function captures state from the current render. 
    // It is safe for manual button clicks, but unsafe for setTimeout.
    saveProviderState(p, providerStates[p.id]);
  };

  const saveDefaults = async (defaults: ModuleDefaults) => {
    try {
      await fetch('/api/ai/module-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      });
    } catch (err) {
      console.error('[saveDefaults]', err);
    }
  };

  const handleDefaultChange = (mod: ModuleId, prov: ProviderId) => {
    const next = { ...moduleDefaults, [mod]: prov };
    setModuleDefaults(next);
    saveDefaults(next);
  };

  const handleModelChange = (provId: ProviderId, modId: ModuleId, model: string) => {
    updateModule(provId, modId, { model });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* ── SECTIE: STANDAARD PROVIDERS ── */}
      <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          🌐 Standaard Provider per Onderdeel
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {MODULES.map(m => (
            <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', backgroundColor: 'rgba(255,255,255,0.4)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '1.2rem' }}>{m.icon}</span>
                  <strong style={{ fontSize: '0.9rem' }}>{m.label}</strong>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.description}</p>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Provider</label>
                  <select 
                    value={moduleDefaults[m.id]} 
                    onChange={e => handleDefaultChange(m.id, e.target.value as ProviderId)}
                    className="input"
                    style={{ width: '100%', padding: '0.5rem 0.75rem' }}
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Model</label>
                  <select 
                    value={providerStates[moduleDefaults[m.id]].modules[m.id].model}
                    onChange={e => handleModelChange(moduleDefaults[m.id], m.id, e.target.value)}
                    className="input"
                    style={{ width: '100%', padding: '0.5rem 0.75rem' }}
                  >
                    {(providerStates[moduleDefaults[m.id]].fetchedModels || PROVIDERS.find(p => p.id === moduleDefaults[m.id])!.defaultModels.map(dm => ({ id: dm, label: dm }))).map((mi: any) => (
                      <option key={mi.id} value={mi.id}>{mi.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTIE: PROVIDER CONFIGURATIE ── */}
      <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>🤖 AI Provider Instellingen</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Configureer modellen en limieten per provider.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {PROVIDERS.map(p => (
              <button 
                key={p.id}
                onClick={() => setActiveProviderTab(p.id)}
                style={{
                  padding: '0.6rem 1.25rem', borderRadius: 'var(--radius)', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
                  border: activeProviderTab === p.id ? `2px solid ${p.color}` : '1px solid var(--border)',
                  backgroundColor: activeProviderTab === p.id ? `${p.color}10` : 'transparent',
                  color: activeProviderTab === p.id ? p.color : 'var(--text-muted)'
                }}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        </div>

        {PROVIDERS.map(p => activeProviderTab === p.id && (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Header / API Key section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {p.id === 'custom' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Base URL (Lokaal Model / LM Studio)</label>
                    <input 
                      type="url"
                      value={providerStates[p.id].baseURL || ''}
                      onChange={e => updateProvider(p.id, { baseURL: e.target.value })}
                      placeholder="http://localhost:1234/v1"
                      className="input"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                    />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                      Zorg dat LM Studio "Local Server" aan staat (OpenAI Compatible API).
                    </div>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>API Key {p.id === 'custom' && '(Optioneel)'}</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type={providerStates[p.id].showKey ? 'text' : 'password'}
                      value={providerStates[p.id].apiKey}
                      onChange={e => updateProvider(p.id, { apiKey: e.target.value })}
                      placeholder={providerStates[p.id].hasApiKey ? '••••••••••••••••' : p.keyHelp}
                      className="input"
                      style={{ flex: 1, fontFamily: providerStates[p.id].showKey ? 'monospace' : undefined }}
                    />
                    <button onClick={() => updateProvider(p.id, { showKey: !providerStates[p.id].showKey })} style={{ padding: '0 0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'white', cursor: 'pointer' }}>
                      {providerStates[p.id].showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                  {p.keyLink && (
                    <a href={p.keyLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: p.color, marginTop: '0.4rem', display: 'inline-block' }}>API key ophalen bij {p.label} →</a>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    checked={providerStates[p.id].enabled}
                    onChange={e => updateProvider(p.id, { enabled: e.target.checked })}
                    id={`enabled-${p.id}`}
                  />
                  <label htmlFor={`enabled-${p.id}`} style={{ fontSize: '0.85rem', fontWeight: 600 }}>Provider inschakelen</label>
                </div>
                <button 
                  onClick={() => fetchModels(p)} 
                  disabled={providerStates[p.id].fetchingModels}
                  className="btn"
                  style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                >
                  {providerStates[p.id].fetchingModels ? '...' : '🔄 Modellen ophalen'}
                </button>
              </div>
            </div>

            {/* Modules Section */}
            <div style={{ display: 'flex', gap: '2.5rem' }}>
              {/* Sidebar Tabs */}
              <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {MODULES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setActiveModuleTab(m.id)}
                    style={{
                      textAlign: 'left', padding: '0.8rem 1rem', borderRadius: 'var(--radius)', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
                      border: 'none',
                      backgroundColor: activeModuleTab === m.id ? 'var(--primary)' : 'transparent',
                      color: activeModuleTab === m.id ? 'white' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', gap: '0.75rem'
                    }}
                  >
                    <span>{m.icon}</span>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Module Content */}
              <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 'var(--radius)', padding: '2rem' }}>
                {MODULES.map(m => activeModuleTab === m.id && (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontWeight: 700, color: 'var(--primary)' }}>{m.icon} {m.label} Instellingen</h4>
                      <span style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', borderRadius: '999px', backgroundColor: moduleDefaults[m.id] === p.id ? '#dcfce7' : '#f1f5f9', color: moduleDefaults[m.id] === p.id ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>
                        {moduleDefaults[m.id] === p.id ? 'Huidige Standaard' : 'Niet Standaard'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Model</label>
                        <select 
                          value={providerStates[p.id].modules[m.id].model}
                          onChange={e => updateModule(p.id, m.id, { model: e.target.value })}
                          className="input"
                          style={{ width: '100%' }}
                        >
                          {(providerStates[p.id].fetchedModels || p.defaultModels.map(dm => ({ id: dm, label: dm }))).map((mi: any) => (
                            <option key={mi.id} value={mi.id}>{mi.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Max Input</label>
                          <input 
                            type="number" step={500}
                            value={providerStates[p.id].modules[m.id].maxInputTokens}
                            onChange={e => updateModule(p.id, m.id, { maxInputTokens: parseInt(e.target.value) || 1000 })}
                            className="input"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Max Output</label>
                          <input 
                            type="number" step={500}
                            value={providerStates[p.id].modules[m.id].maxOutputTokens}
                            onChange={e => updateModule(p.id, m.id, { maxOutputTokens: parseInt(e.target.value) || 1000 })}
                            className="input"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Basis Context (System Prompt)</label>
                      <textarea 
                        value={providerStates[p.id].modules[m.id].systemPrompt || ''}
                        onChange={e => updateModule(p.id, m.id, { systemPrompt: e.target.value })}
                        className="input"
                        placeholder="Bijv: Je bent een behulpzame assistent..."
                        style={{ width: '100%', height: '100px', resize: 'vertical', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer / Info */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1.5rem', marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
              {providerStates[p.id].error && <span style={{ color: 'var(--error)', fontSize: '0.85rem' }}>❌ {providerStates[p.id].error}</span>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {providerStates[p.id].saving ? '⏳ Bezig met opslaan...' : providerStates[p.id].saved ? '✅ Automatisch opgeslagen' : '✨ Instellingen worden direct bewaard'}
                </span>
                <button 
                  onClick={() => saveProvider(p)} 
                  disabled={providerStates[p.id].saving}
                  className="btn"
                  style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', backgroundColor: 'var(--background)' }}
                >
                  Nu opslaan
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .input {
          padding: 0.75rem 1rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          font-size: 0.9rem;
          background: white;
          transition: border-color 0.15s;
        }
        .input:focus {
          border-color: var(--primary);
          outline: none;
        }
      `}</style>
    </div>
  );
}
