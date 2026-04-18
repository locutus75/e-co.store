'use client';

import React, { useState, useTransition, useRef, useEffect } from 'react';
import { LlmProviderPublic, LlmStatsResult } from '@/app/actions/llm';

// ── Model lists per provider ──────────────────────────────────────────────────
const MODELS: Record<string, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o',        label: 'GPT-4o' },
    { id: 'gpt-4o-mini',   label: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229',     label: 'Claude 3 Opus' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro',    label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash',  label: 'Gemini 1.5 Flash' },
  ],
};

const PROVIDER_ICONS: Record<string, string> = {
  openai: '🟢', anthropic: '🟠', gemini: '🔵',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('nl-NL'); }
function fmtCost(n: number) { return `$${n.toFixed(4)}`; }
function fmtMs(ms: number) { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }

interface Message { role: 'user' | 'assistant'; content: string; usage?: any; }

interface Props {
  providers: LlmProviderPublic[];
  initialStats: LlmStatsResult | null;
  isAdmin: boolean;
  userId: string;
  userEmail: string;
}

export default function AiClient({ providers, initialStats, isAdmin }: Props) {
  const activeProviders = providers.filter(p => p.hasApiKey);

  const [tab, setTab] = useState<'chat' | 'stats'>('chat');
  const [selectedProvider, setSelectedProvider] = useState<string>(activeProviders[0]?.provider ?? '');
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('Je bent een productdata-assistent. Analyseer de aangeboden productinformatie en geef een heldere conclusie en concrete aanbevelingen.');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPending, startTransition] = useTransition();
  const [stats, setStats] = useState<LlmStatsResult | null>(initialStats);
  const [statsPeriod, setStatsPeriod] = useState<'7d' | '30d' | 'all'>('30d');
  const [statsLoading, setStatsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const providerConfig = providers.find(p => p.provider === selectedProvider);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const loadStats = async (period: '7d' | '30d' | 'all') => {
    setStatsLoading(true);
    setStatsPeriod(period);
    try {
      const { getLlmUsageStatsAction } = await import('@/app/actions/llm');
      setStats(await getLlmUsageStatsAction(period));
    } catch { /* ignore */ } finally { setStatsLoading(false); }
  };

  const sendMessage = () => {
    if (!prompt.trim() || !selectedProvider || isPending) return;
    const userMsg: Message = { role: 'user', content: prompt.trim() };
    setMessages(prev => [...prev, userMsg]);
    const promptText = prompt.trim();
    setPrompt('');

    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: selectedProvider, prompt: promptText, systemPrompt, context: 'standalone' }),
        });
        const data = await res.json();
        if (!res.ok) {
          setMessages(prev => [...prev, { role: 'assistant', content: `❌ Fout: ${data.error}` }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: data.response, usage: data.usage }]);
        }
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `❌ Netwerkfout: ${e.message}` }]);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>🤖 AI Assistent</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Analyseer productdata en stel vragen aan meerdere AI modellen.
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['chat', 'stats'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '0.5rem 1.25rem', borderRadius: 'var(--radius)',
                fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                border: tab === t ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: tab === t ? 'var(--primary)' : 'transparent',
                color: tab === t ? 'white' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
                {t === 'chat' ? '💬 Assistent' : '📊 Statistieken'}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeProviders.length === 0 && tab === 'chat' && (
        <div className="glass" style={{ padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius-lg)' }}>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>
            ⚙️ Geen AI providers geconfigureerd. Ga naar <strong>Systeeminstellingen → AI Configuratie</strong> om een API key in te voeren.
          </p>
        </div>
      )}

      {/* Chat Tab */}
      {tab === 'chat' && activeProviders.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* Left: Settings panel */}
          <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provider</label>
              {activeProviders.map(p => (
                <button
                  key={p.provider}
                  onClick={() => setSelectedProvider(p.provider)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    width: '100%', padding: '0.65rem 0.9rem', marginBottom: '0.4rem',
                    borderRadius: 'var(--radius)', cursor: 'pointer',
                    border: selectedProvider === p.provider ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                    backgroundColor: selectedProvider === p.provider ? 'rgba(var(--primary-rgb),0.07)' : 'transparent',
                    fontWeight: selectedProvider === p.provider ? 600 : 400,
                    fontSize: '0.9rem', color: 'var(--text)', transition: 'all 0.15s',
                  }}
                >
                  <span>{PROVIDER_ICONS[p.provider]}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {providerConfig && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actief Model</label>
                  <div style={{
                    padding: '0.6rem 0.9rem', borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)', backgroundColor: 'var(--surface-hover)',
                    fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)',
                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                  }}>
                    <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>⚙️</span>
                    {MODELS[providerConfig.provider]?.find(m => m.id === providerConfig.activeModel)?.label ?? providerConfig.activeModel}
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    Instelbaar via Systeeminstellingen
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>MAX INPUT</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{fmt(providerConfig.maxInputTokens)}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>tokens</div>
                  </div>
                  <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>MAX OUTPUT</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{fmt(providerConfig.maxOutputTokens)}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>tokens</div>
                  </div>
                </div>
              </>
            )}

            {/* System Prompt toggle */}
            <div>
              <button onClick={() => setShowSystemPrompt(v => !v)} style={{
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', gap: '0.3rem',
              }}>
                {showSystemPrompt ? '▾' : '▸'} Systeem prompt
              </button>
              {showSystemPrompt && (
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={5}
                  style={{
                    marginTop: '0.5rem', width: '100%', padding: '0.6rem',
                    borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface-hover)', fontSize: '0.78rem',
                    color: 'var(--text)', resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              )}
            </div>

            <button
              onClick={() => { setMessages([]); }}
              style={{
                padding: '0.5rem', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', backgroundColor: 'transparent',
                color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
              }}
            >
              🗑 Gesprek wissen
            </button>
          </div>

          {/* Right: Chat */}
          <div className="glass" style={{ borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', minHeight: '600px' }}>
            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: '450px', maxHeight: '600px' }}>
              {messages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem', opacity: 0.5 }}>
                  <span style={{ fontSize: '2.5rem' }}>🤖</span>
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>
                    Stel een vraag of voer productdata in voor analyse.<br />
                    <span style={{ fontSize: '0.8rem' }}>Ctrl+Enter om te verzenden</span>
                  </p>
                </div>
              ) : messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '0.3rem',
                }}>
                  <div style={{
                    maxWidth: '85%', padding: '0.85rem 1.1rem',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--surface-hover)',
                    color: msg.role === 'user' ? 'white' : 'var(--text)',
                    fontSize: '0.9rem', lineHeight: 1.6,
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  {msg.usage && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                      <span>📥 {fmt(msg.usage.inputTokens)} tokens</span>
                      <span>📤 {fmt(msg.usage.outputTokens)} tokens</span>
                      <span>⏱ {fmtMs(msg.usage.durationMs)}</span>
                      <span>💰 {fmtCost(msg.usage.costUsd)}</span>
                    </div>
                  )}
                </div>
              ))}
              {isPending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '0.85rem' }}>{PROVIDER_ICONS[selectedProvider]} Bezig met analyseren...</span>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Stel een vraag of plak hier productinformatie om te analyseren... (Ctrl+Enter om te verzenden)"
                  rows={3}
                  disabled={isPending || !selectedProvider}
                  style={{
                    width: '100%', padding: '0.85rem 1rem', borderRadius: 'var(--radius)',
                    border: '1.5px solid var(--border)', backgroundColor: 'var(--surface-hover)',
                    fontSize: '0.9rem', color: 'var(--text)', resize: 'vertical',
                    outline: 'none', lineHeight: 1.6, transition: 'border-color 0.15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={isPending || !prompt.trim() || !selectedProvider}
                style={{
                  padding: '0.85rem 1.5rem', borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--primary)', color: 'white',
                  border: 'none', fontWeight: 700, fontSize: '0.9rem',
                  cursor: isPending || !prompt.trim() ? 'not-allowed' : 'pointer',
                  opacity: isPending || !prompt.trim() ? 0.6 : 1,
                  transition: 'all 0.15s', flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(var(--primary-rgb),0.3)',
                }}
              >
                Verzenden →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Period selector */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Periode:</span>
            {(['7d', '30d', 'all'] as const).map(p => (
              <button key={p} onClick={() => loadStats(p)} disabled={statsLoading} style={{
                padding: '0.4rem 1rem', borderRadius: 'var(--radius)', fontSize: '0.85rem',
                border: statsPeriod === p ? '1px solid var(--primary)' : '1px solid var(--border)',
                backgroundColor: statsPeriod === p ? 'var(--primary)' : 'transparent',
                color: statsPeriod === p ? 'white' : 'var(--text-muted)',
                cursor: 'pointer', fontWeight: statsPeriod === p ? 600 : 400,
              }}>
                {p === '7d' ? '7 dagen' : p === '30d' ? '30 dagen' : 'Alles'}
              </button>
            ))}
            {statsLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Laden...</span>}
          </div>

          {stats && (
            <>
              {/* KPI row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                {[
                  { label: 'Verzoeken', value: fmt(stats.totalRequests), icon: '🔄' },
                  { label: 'Input tokens', value: fmt(stats.totalInputTokens), icon: '📥' },
                  { label: 'Output tokens', value: fmt(stats.totalOutputTokens), icon: '📤' },
                  { label: 'Geschatte kosten', value: fmtCost(stats.totalCostUsd), icon: '💰' },
                ].map(kpi => (
                  <div key={kpi.label} className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{kpi.icon}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)' }}>{kpi.value}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '0.2rem' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Per provider */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', color: 'var(--text)' }}>Per Provider</h3>
                  {stats.byProvider.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geen data</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Provider', 'Verzoeken', 'Tokens', 'Kosten'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byProvider.map(row => (
                          <tr key={row.provider} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600 }}>{PROVIDER_ICONS[row.provider]} {row.provider}</td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{fmt(row.requests)}</td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{fmt(row.inputTokens + row.outputTokens)}</td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{fmtCost(row.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Per model */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', color: 'var(--text)' }}>Per Model</h3>
                  {stats.byModel.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geen data</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Model', 'Verzoeken', 'Tokens', 'Kosten'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byModel.map(row => (
                          <tr key={`${row.provider}-${row.model}`} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <td style={{ padding: '0.5rem 0.6rem' }}><span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{row.model}</span></td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{fmt(row.requests)}</td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{fmt(row.inputTokens + row.outputTokens)}</td>
                            <td style={{ padding: '0.5rem 0.6rem' }}>{fmtCost(row.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Per user */}
                <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)', gridColumn: '1 / -1' }}>
                  <h3 style={{ fontWeight: 700, marginBottom: '1rem', color: 'var(--text)' }}>Per Gebruiker</h3>
                  {stats.byUser.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geen data</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Gebruiker', 'Verzoeken', 'Input tokens', 'Output tokens', 'Geschatte kosten'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.8rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byUser.map(row => (
                          <tr key={row.userId} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{row.email}</td>
                            <td style={{ padding: '0.6rem 0.8rem' }}>{fmt(row.requests)}</td>
                            <td style={{ padding: '0.6rem 0.8rem' }}>{fmt(row.inputTokens)}</td>
                            <td style={{ padding: '0.6rem 0.8rem' }}>{fmt(row.outputTokens)}</td>
                            <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600, color: '#059669' }}>{fmtCost(row.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
