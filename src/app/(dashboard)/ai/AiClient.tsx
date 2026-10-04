'use client';

import React, { useState, useTransition, useRef, useEffect } from 'react';
import { LlmProviderPublic, LlmStatsResult } from '@/app/actions/llm';
import { useExchangeRate, formatCostEur } from '@/hooks/useExchangeRate';
import AiUsageDashboard from '@/components/AiUsageDashboard';

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
function fmtMs(ms: number) { return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`; }


interface Message { role: 'user' | 'assistant'; content: string; model?: string; usage?: any; }

interface Props {
  providers: LlmProviderPublic[];
  initialStats: LlmStatsResult | null;
  isAdmin: boolean;
  userId: string;
  userEmail: string;
}

export default function AiClient({ providers, initialStats, isAdmin }: Props) {
  const { rate: usdToEur } = useExchangeRate();
  const fmtCost = (usd: number) => formatCostEur(usd, usdToEur);
  const activeProviders = providers.filter(p => p.hasApiKey || p.provider === 'custom');

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

  // Load default provider from module defaults
  useEffect(() => {
    const loadInitial = async () => {
      const res = await fetch('/api/ai/module-defaults').catch(() => null);
      if (res?.ok) {
        const defaults = await res.json();
        if (defaults.assistant && providers.some(p => p.provider === defaults.assistant && (p.hasApiKey || p.provider === 'custom'))) {
          setSelectedProvider(defaults.assistant);
        } else if (activeProviders.length > 0) {
          setSelectedProvider(activeProviders[0].provider);
        }
      } else if (activeProviders.length > 0) {
        setSelectedProvider(activeProviders[0].provider);
      }
    };
    loadInitial();
  }, [providers]);

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
          setMessages(prev => [...prev, { role: 'assistant', content: data.response, model: data.model, usage: data.usage }]);
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* Right: Chat */}
          <div className="glass" style={{ borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', minHeight: '600px' }}>
            {/* Chat Header / Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Actief Model: <span style={{ color: 'var(--primary)' }}>{providerConfig?.modules.assistant.model}</span> ({providerConfig?.label})
                </span>
                <button onClick={() => setShowSystemPrompt(v => !v)} style={{
                  fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}>
                  {showSystemPrompt ? '▾' : '▸'} Systeem prompt
                </button>
              </div>
              <button
                onClick={() => { setMessages([]); }}
                style={{
                  padding: '0.4rem 0.8rem', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', backgroundColor: 'transparent',
                  color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem',
                }}
              >
                🗑 Gesprek wissen
              </button>
            </div>
            
            {showSystemPrompt && (
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-hover)' }}>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', padding: '0.6rem',
                    borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                    backgroundColor: 'white', fontSize: '0.78rem',
                    color: 'var(--text)', resize: 'vertical', lineHeight: 1.5,
                  }}
                />
              </div>
            )}

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
                      {msg.model && <span style={{ color: 'var(--primary)', fontWeight: 600 }}>🤖 {msg.model}</span>}
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
        <AiUsageDashboard initialStats={stats} />
      )}

      <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
