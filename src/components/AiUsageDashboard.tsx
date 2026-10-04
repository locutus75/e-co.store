'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { LlmStatsResult, LlmStatsPeriod, LlmLogEntry, getLlmUsageStatsAction } from '@/app/actions/llm';
import { useExchangeRate, formatCostEur } from '@/hooks/useExchangeRate';

interface Props {
  initialStats: LlmStatsResult | null;
}

const PROVIDER_ICONS: Record<string, string> = {
  openai: '🟢',
  anthropic: '🟠',
  gemini: '🔵',
  custom: '💻',
};

function fmtNum(n: number = 0): string {
  return n.toLocaleString('nl-NL');
}

function fmtMs(ms: number = 0): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function AiUsageDashboard({ initialStats }: Props) {
  const { rate: usdToEur, source: exSource } = useExchangeRate();
  const [stats, setStats] = useState<LlmStatsResult | null>(initialStats);
  const [period, setPeriod] = useState<LlmStatsPeriod>(initialStats?.period ?? '30d');
  const [isPending, startTransition] = useTransition();

  // Chart view toggle: 'cost' or 'tokens'
  const [chartMetric, setChartMetric] = useState<'cost' | 'tokens'>('cost');

  // Request log filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContext, setSelectedContext] = useState<string>('all');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logPage, setLogPage] = useState(1);
  const pageSize = 20;

  // Pricing reference modal toggle
  const [showPricingTable, setShowPricingTable] = useState(false);

  const loadPeriod = (newPeriod: LlmStatsPeriod) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      try {
        const res = await getLlmUsageStatsAction(newPeriod);
        setStats(res);
        setLogPage(1);
      } catch (err) {
        console.error('Failed to load AI stats:', err);
      }
    });
  };

  const fmtCost = (usd: number = 0) => formatCostEur(usd, usdToEur);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (!stats?.recentLogs) return [];
    return stats.recentLogs.filter(l => {
      if (selectedContext !== 'all' && l.context !== selectedContext) return false;
      if (selectedModel !== 'all' && l.model !== selectedModel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPrompt = l.promptSnippet?.toLowerCase().includes(q);
        const matchesUser = l.userEmail.toLowerCase().includes(q);
        const matchesModel = l.model.toLowerCase().includes(q);
        if (!matchesPrompt && !matchesUser && !matchesModel) return false;
      }
      return true;
    });
  }, [stats?.recentLogs, selectedContext, selectedModel, searchQuery]);

  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (logPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, logPage]);

  // Max value for daily chart
  const maxDayValue = useMemo(() => {
    if (!stats?.byDay || stats.byDay.length === 0) return 1;
    if (chartMetric === 'cost') {
      return Math.max(...stats.byDay.map(d => (d.costUsd || 0) * usdToEur), 0.001);
    }
    return Math.max(...stats.byDay.map(d => (d.inputTokens || 0) + (d.outputTokens || 0)), 100);
  }, [stats?.byDay, chartMetric, usdToEur]);

  if (!stats) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        Geen statistieken beschikbaar.
      </div>
    );
  }

  const successRate = stats.totalRequests > 0
    ? Math.round((stats.successfulRequests / stats.totalRequests) * 100)
    : 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* ── Top Bar: Period Switcher & Rate Badge ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', backgroundColor: 'var(--surface)', padding: '0.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          {[
            { id: 'today', label: 'Vandaag' },
            { id: '7d',    label: '7 Dagen' },
            { id: '30d',   label: '30 Dagen' },
            { id: '90d',   label: '90 Dagen' },
            { id: '1y',    label: 'Dit Jaar' },
            { id: 'all',   label: 'Alles' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => loadPeriod(p.id as LlmStatsPeriod)}
              disabled={isPending}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                fontSize: '0.8rem',
                border: 'none',
                backgroundColor: period === p.id ? 'var(--primary)' : 'transparent',
                color: period === p.id ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: period === p.id ? 700 : 500,
                transition: 'all 0.15s ease',
              }}
            >
              {p.label}
            </button>
          ))}
          {isPending && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>Laden…</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            💱 Koers: <strong>1 USD = €{usdToEur.toFixed(4)}</strong>
            <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>({exSource === 'api' ? 'ECB' : exSource})</span>
          </span>
          <button
            type="button"
            onClick={() => setShowPricingTable(v => !v)}
            style={{
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              backgroundColor: showPricingTable ? '#ede9fe' : 'var(--surface)',
              color: showPricingTable ? '#6d28d9' : 'var(--text)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📋 Tarieven per Model
          </button>
        </div>
      </div>

      {/* ── Pricing Reference Drawer/Card ────────────────────────────────────── */}
      {showPricingTable && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', border: '1px solid #c4b5fd', backgroundColor: '#fcfaff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#5b21b6', margin: 0 }}>
                💡 Hoe worden de token-kosten berekend?
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#6d28d9', margin: '0.2rem 0 0' }}>
                Kosten worden per 1 miljoen tokens berekend conform de officiële API-tarieven en automatisch via de live ECB-wisselkoers omgezet naar euro&apos;s.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPricingTable(false)}
              style={{ background: 'none', border: 'none', color: '#8b5cf6', cursor: 'pointer', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </div>

          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd6fe', textAlign: 'left', color: '#6d28d9' }}>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Model</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Beschrijving</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Input / 1M tokens</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Output / 1M tokens</th>
                  <th style={{ padding: '0.4rem 0.6rem' }}>Indicatie per 1.000 tokens</th>
                </tr>
              </thead>
              <tbody>
                {stats.knownPricing.map(p => (
                  <tr key={p.model} style={{ borderBottom: '1px solid #f3e8ff' }}>
                    <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace', fontWeight: 600 }}>{p.model}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: '#64748b' }}>{p.description || '-'}</td>
                    <td style={{ padding: '0.35rem 0.6rem' }}>${p.input.toFixed(2)}</td>
                    <td style={{ padding: '0.35rem 0.6rem' }}>${p.output.toFixed(2)}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: '#059669', fontWeight: 600 }}>
                      €{((p.input * usdToEur) / 1000).toFixed(4)} in / €{((p.output * usdToEur) / 1000).toFixed(4)} out
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── KPI Row ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
        {/* Total Cost */}
        <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Totale AI Kosten
            </span>
            <span style={{ fontSize: '1.4rem' }}>💰</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.4rem', lineHeight: 1.1 }}>
            {fmtCost(stats.totalCostUsd)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            ${stats.totalCostUsd.toFixed(4)} USD over {fmtNum(stats.totalRequests)} verzoeken
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#10b981' }} />
        </div>

        {/* Input Tokens */}
        <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Input Tokens (Prompt)
            </span>
            <span style={{ fontSize: '1.4rem' }}>📥</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.4rem', lineHeight: 1.1 }}>
            {fmtNum(stats.totalInputTokens)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            gem. {fmtNum(stats.totalRequests > 0 ? Math.round(stats.totalInputTokens / stats.totalRequests) : 0)} tokens/call
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#3b82f6' }} />
        </div>

        {/* Output Tokens */}
        <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Output Tokens (Gegenereerd)
            </span>
            <span style={{ fontSize: '1.4rem' }}>📤</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.4rem', lineHeight: 1.1 }}>
            {fmtNum(stats.totalOutputTokens)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            gem. {fmtNum(stats.totalRequests > 0 ? Math.round(stats.totalOutputTokens / stats.totalRequests) : 0)} tokens/call
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#8b5cf6' }} />
        </div>

        {/* Requests & Success */}
        <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              AI Verzoeken
            </span>
            <span style={{ fontSize: '1.4rem' }}>🔄</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.4rem', lineHeight: 1.1 }}>
            {fmtNum(stats.totalRequests)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '0.4rem', fontWeight: 600 }}>
            ✓ {successRate}% succesvol {stats.failedRequests > 0 && <span style={{ color: '#dc2626' }}>({stats.failedRequests} fouten)</span>}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#f59e0b' }} />
        </div>

        {/* Avg Duration */}
        <div className="glass" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Gem. Reactietijd
            </span>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.4rem', lineHeight: 1.1 }}>
            {fmtMs(stats.avgDurationMs)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Totaal tokens: {fmtNum(stats.totalInputTokens + stats.totalOutputTokens)}
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', backgroundColor: '#06b6d4' }} />
        </div>
      </div>

      {/* ── Schematische Tijdlijn Grafiek (Daily Trend) ───────────────────────── */}
      <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              📈 Verloop in de Tijd
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Dagelijks AI verbruik en kosten over de gekozen periode
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.3rem', backgroundColor: 'var(--surface)', padding: '0.2rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setChartMetric('cost')}
              style={{
                padding: '0.25rem 0.7rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                fontSize: '0.75rem',
                border: 'none',
                backgroundColor: chartMetric === 'cost' ? 'var(--primary)' : 'transparent',
                color: chartMetric === 'cost' ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: chartMetric === 'cost' ? 600 : 400,
              }}
            >
              💰 Kosten (€)
            </button>
            <button
              type="button"
              onClick={() => setChartMetric('tokens')}
              style={{
                padding: '0.25rem 0.7rem',
                borderRadius: 'calc(var(--radius) - 2px)',
                fontSize: '0.75rem',
                border: 'none',
                backgroundColor: chartMetric === 'tokens' ? 'var(--primary)' : 'transparent',
                color: chartMetric === 'tokens' ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: chartMetric === 'tokens' ? 600 : 400,
              }}
            >
              📊 Tokens (k)
            </button>
          </div>
        </div>

        {stats.byDay.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Geen activiteit geregistreerd in deze periode.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', paddingTop: '1rem', paddingBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.45rem', minWidth: `${Math.max(stats.byDay.length * 28, 400)}px`, height: '170px', paddingBottom: '2rem', borderBottom: '1px solid var(--border)', position: 'relative' }}>
              {stats.byDay.map(day => {
                const dayCostEur = (day.costUsd || 0) * usdToEur;
                const totalDayTokens = (day.inputTokens || 0) + (day.outputTokens || 0);
                const val = chartMetric === 'cost' ? dayCostEur : totalDayTokens;
                const pct = Math.max(Math.min(Math.round((val / maxDayValue) * 100), 100), val > 0 ? 5 : 0);

                const dateParts = day.date.split('-');
                const label = `${dateParts[2]}/${dateParts[1]}`;

                return (
                  <div
                    key={day.date}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}
                    title={`${day.date}\n• Verzoeken: ${day.requests}\n• Tokens: ${fmtNum(totalDayTokens)}\n• Kosten: ${fmtCost(day.costUsd)}`}
                  >
                    {/* Tooltip on hover is native via title */}
                    <div
                      style={{
                        width: '80%',
                        maxWidth: '22px',
                        minWidth: '6px',
                        height: `${pct}%`,
                        backgroundColor: chartMetric === 'cost' ? '#10b981' : '#3b82f6',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s ease',
                        cursor: 'pointer',
                      }}
                    />
                    <span style={{ position: 'absolute', bottom: '-1.5rem', fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Two Column: Context / Module Breakdown & Model Breakdown ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        
        {/* Module / Feature Breakdown */}
        <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>
            🧩 Verdeling naar AI Functie
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {stats.byContext.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Geen data</p>
            ) : (
              stats.byContext.map(c => {
                const costShare = stats.totalCostUsd > 0
                  ? Math.round((c.costUsd / stats.totalCostUsd) * 100)
                  : 0;

                return (
                  <div key={c.context} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text)' }}>
                        <span>{c.icon}</span>
                        <span>{c.label}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          ({fmtNum(c.requests)}x)
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#059669', fontSize: '0.82rem' }}>
                        {fmtCost(c.costUsd)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>({costShare}%)</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${costShare}%`,
                          backgroundColor: c.color || 'var(--primary)',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span>📥 {fmtNum(c.inputTokens)} in</span>
                      <span>📤 {fmtNum(c.outputTokens)} out</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Model Breakdown */}
        <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>
            🤖 Verdeling naar LLM Model
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {stats.byModel.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Geen data</p>
            ) : (
              stats.byModel.map(m => {
                const costShare = stats.totalCostUsd > 0
                  ? Math.round((m.costUsd / stats.totalCostUsd) * 100)
                  : 0;

                return (
                  <div key={`${m.provider}-${m.model}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                        <span>{PROVIDER_ICONS[m.provider] || '🤖'}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)' }}>{m.model}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          ({fmtNum(m.requests)}x)
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: '#059669', fontSize: '0.82rem' }}>
                        {fmtCost(m.costUsd)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>({costShare}%)</span>
                      </div>
                    </div>

                    <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${costShare}%`,
                          backgroundColor: m.provider === 'openai' ? '#10a37f' : m.provider === 'anthropic' ? '#c5601a' : '#1a73e8',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span>📥 {fmtNum(m.inputTokens)} in</span>
                      <span>📤 {fmtNum(m.outputTokens)} out</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* ── User / Team Breakdown ────────────────────────────────────────────── */}
      <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>
          👥 Verdeling per Teamlid
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Gebruiker</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Verzoeken</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Input Tokens</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Output Tokens</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Totaal Tokens</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Geschatte Kosten (€)</th>
              </tr>
            </thead>
            <tbody>
              {stats.byUser.map(u => (
                <tr key={u.userId} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: 'var(--text)' }}>{u.email}</td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>{fmtNum(u.requests)}</td>
                  <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>{fmtNum(u.inputTokens)}</td>
                  <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>{fmtNum(u.outputTokens)}</td>
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{fmtNum(u.inputTokens + u.outputTokens)}</td>
                  <td style={{ padding: '0.6rem 0.75rem', fontWeight: 700, color: '#059669' }}>{fmtCost(u.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Volledig Verzoeken-Logboek (Request Log) ─────────────────────────── */}
      <div className="glass" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              📜 Recent AI Verzoeken-Logboek
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
              Volledige registratie van alle inkomende en uitgaande AI-aanroepen ({filteredLogs.length} gelogd)
            </p>
          </div>

          {/* Filter controls */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Zoek in prompt, model, gebruiker…"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setLogPage(1); }}
              className="input"
              style={{ width: '220px', fontSize: '0.78rem', padding: '0.4rem 0.7rem' }}
            />

            <select
              value={selectedContext}
              onChange={e => { setSelectedContext(e.target.value); setLogPage(1); }}
              className="input"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
            >
              <option value="all">Alle AI functies</option>
              {stats.byContext.map(c => (
                <option key={c.context} value={c.context}>{c.icon} {c.label}</option>
              ))}
            </select>

            <select
              value={selectedModel}
              onChange={e => { setSelectedModel(e.target.value); setLogPage(1); }}
              className="input"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.6rem' }}
            >
              <option value="all">Alle modellen</option>
              {stats.byModel.map(m => (
                <option key={m.model} value={m.model}>{m.model}</option>
              ))}
            </select>
          </div>
        </div>

        {paginatedLogs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Geen gelogde AI-verzoeken gevonden met de huidige filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.5rem 0.6rem', width: '130px' }}>Tijdstip</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Functie</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Model</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Tokens (In / Out)</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Kosten (€)</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Duur</th>
                  <th style={{ padding: '0.5rem 0.6rem' }}>Gebruiker</th>
                  <th style={{ padding: '0.5rem 0.6rem', width: '80px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map(log => {
                  const isExpanded = expandedLogId === log.id;
                  const dateStr = new Date(log.createdAt).toLocaleString('nl-NL', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
                  });

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        style={{
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          cursor: 'pointer',
                          backgroundColor: isExpanded ? 'rgba(0,0,0,0.02)' : 'transparent',
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {dateStr}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            backgroundColor: `${log.contextColor}18`,
                            color: log.contextColor,
                            fontWeight: 600,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                          }}>
                            <span>{log.contextIcon}</span>
                            <span>{log.contextLabel}</span>
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>
                            {log.model}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem' }}>
                          <span style={{ color: '#2563eb' }}>{fmtNum(log.inputTokens)}</span>
                          <span style={{ color: 'var(--text-muted)' }}> / </span>
                          <span style={{ color: '#7c3aed' }}>{fmtNum(log.outputTokens)}</span>
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', fontWeight: 700, color: '#059669' }}>
                          {fmtCost(log.costUsd)}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)' }}>
                          {fmtMs(log.durationMs)}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)' }}>
                          {log.userEmail.split('@')[0]}
                        </td>
                        <td style={{ padding: '0.5rem 0.6rem' }}>
                          {log.success ? (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Gelukt</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>✕ Fout</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={8} style={{ padding: '0.8rem 1rem' }}>
                            <div style={{ backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                                <span><strong>ID:</strong> {log.id}</span>
                                <span><strong>Provider:</strong> {log.provider}</span>
                                <span><strong>Kosten (USD):</strong> ${log.costUsd.toFixed(6)}</span>
                              </div>
                              {log.errorMsg && (
                                <div style={{ color: '#dc2626', fontWeight: 600 }}>
                                  <strong>Foutmelding:</strong> {log.errorMsg}
                                </div>
                              )}
                              {log.promptSnippet && (
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Prompt Snippet:</div>
                                  <pre style={{ margin: 0, padding: '0.5rem', backgroundColor: 'var(--background)', borderRadius: '4px', overflowX: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '120px' }}>
                                    {log.promptSnippet}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalLogPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>
              Pagina {logPage} van {totalLogPages} ({filteredLogs.length} regels)
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setLogPage(p => Math.max(1, p - 1))}
                disabled={logPage <= 1}
                style={{ padding: '0.3rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', cursor: logPage <= 1 ? 'not-allowed' : 'pointer', opacity: logPage <= 1 ? 0.5 : 1 }}
              >
                ← Vorige
              </button>
              <button
                type="button"
                onClick={() => setLogPage(p => Math.min(totalLogPages, p + 1))}
                disabled={logPage >= totalLogPages}
                style={{ padding: '0.3rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', cursor: logPage >= totalLogPages ? 'not-allowed' : 'pointer', opacity: logPage >= totalLogPages ? 0.5 : 1 }}
              >
                Volgende →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
