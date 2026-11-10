'use client';

import React, { useEffect, useState } from 'react';
import {
  DEFAULT_ECOPOS_FIELD_MODES,
  DEFAULT_ECOPOS_SETTINGS,
  ECOPOS_CATEGORIES,
  ECOPOS_FIELDS,
  EcoPosCategoryKey,
  EcoPosFieldMode,
  EcoPosSettings,
  EcoPosUitlopendFilterOption,
  EcoPosWebshopFilterOption,
} from '@/lib/ecopos';
import {
  EcoPosArticleInspectionResult,
  getAvailableUitlopendReasonsAction,
  getEcoPosSettingsAction,
  inspectEcoPosArticleAction,
  saveEcoPosSettingsAction,
  testEcoPosConnectionAction,
} from '@/app/actions/ecopos';

const MODE_OPTIONS: { value: EcoPosFieldMode; label: string; badgeBg: string; badgeColor: string }[] = [
  { value: 'ignore', label: '🚫 Niet ophalen', badgeBg: '#f1f5f9', badgeColor: '#64748b' },
  { value: 'fill_empty', label: '➕ Alleen aanvullen indien leeg', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
  { value: 'overwrite', label: '🔄 Altijd overschrijven (EcoPos leidend)', badgeBg: '#dcfce7', badgeColor: '#15803d' },
];

export default function EcoPosSettingsForm() {
  const [settings, setSettings] = useState<EcoPosSettings>(DEFAULT_ECOPOS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'connection' | 'fields' | 'autosync' | 'preview'>('connection');
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    application?: string;
    lastMplusSyncAt?: string | null;
    totalProducts?: number | null;
    latencyMs?: number;
  } | null>(null);

  const [previewArticleNum, setPreviewArticleNum] = useState('');
  const [inspectingArticle, setInspectingArticle] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<EcoPosArticleInspectionResult | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [availableReasons, setAvailableReasons] = useState<string[]>([]);
  const [customReasonInput, setCustomReasonInput] = useState('');

  const handleInspectArticle = async () => {
    if (!previewArticleNum.trim()) return;
    setInspectingArticle(true);
    setInspectionResult(null);
    setShowRawJson(false);
    try {
      const res = await inspectEcoPosArticleAction(previewArticleNum.trim(), settings.fieldModes);
      setInspectionResult(res);
    } finally {
      setInspectingArticle(false);
    }
  };

  useEffect(() => {
    Promise.all([getEcoPosSettingsAction(), getAvailableUitlopendReasonsAction()])
      .then(([s, reasons]) => {
        setSettings(s);
        setAvailableReasons(reasons || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setMsg({ text: '', type: '' });
    try {
      const res = await testEcoPosConnectionAction(settings.baseUrl, settings.apiKey);
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });
    const res = await saveEcoPosSettingsAction(settings);
    if (res.success && res.settings) {
      setSettings(res.settings);
      setMsg({ text: '✓ EcoPos-instellingen succesvol opgeslagen!', type: 'success' });
    } else {
      setMsg({ text: '✕ Fout bij opslaan: ' + (res.error || 'Onbekende fout'), type: 'error' });
    }
    setSaving(false);
  };

  const setFieldMode = (key: string, mode: EcoPosFieldMode) => {
    setSettings((prev) => ({
      ...prev,
      fieldModes: {
        ...prev.fieldModes,
        [key]: mode,
      },
    }));
  };

  const setCategoryMode = (cat: EcoPosCategoryKey, mode: EcoPosFieldMode) => {
    const nextModes = { ...settings.fieldModes };
    ECOPOS_FIELDS.filter((f) => f.category === cat).forEach((f) => {
      nextModes[f.key] = mode;
    });
    setSettings((prev) => ({ ...prev, fieldModes: nextModes }));
  };

  const resetDefaultFieldModes = () => {
    setSettings((prev) => ({ ...prev, fieldModes: { ...DEFAULT_ECOPOS_FIELD_MODES } }));
  };

  if (loading) {
    return (
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        EcoPos-instellingen laden…
      </div>
    );
  }

  const activeFieldCount = ECOPOS_FIELDS.filter((f) => (settings.fieldModes[f.key] ?? 'ignore') !== 'ignore').length;

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🔄</span> EcoPos / MplusKassa Koppeling
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
              Haal actuele productstatussen, verkoopprijzen, voorraadstanden en basisgegevens rechtstreeks op uit EcoPos.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                backgroundColor: settings.enabled ? '#dcfce7' : '#f1f5f9',
                color: settings.enabled ? '#15803d' : '#64748b',
                border: `1px solid ${settings.enabled ? '#86efac' : '#cbd5e1'}`,
              }}
            >
              {settings.enabled ? `● Actief (${activeFieldCount} velden)` : '○ Uitgeschakeld'}
            </span>
          </div>
        </div>
      </div>

      {msg.text && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: msg.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            color: msg.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${msg.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            borderRadius: '10px',
            marginBottom: '1.5rem',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        {[
          { id: 'connection' as const, label: '🔌 Verbinding & API' },
          { id: 'fields' as const, label: `🎛️ Standaard Veldkiezer (${activeFieldCount}/${ECOPOS_FIELDS.length})` },
          { id: 'autosync' as const, label: '⏱️ Automatische Sync' },
          { id: 'preview' as const, label: '🔍 Artikel Preview & Test' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0.75rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '3px solid #0284c7' : '3px solid transparent',
              color: activeTab === t.id ? '#0284c7' : 'var(--text-muted)',
              fontWeight: activeTab === t.id ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {activeTab === 'connection' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: '#0284c7' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                  EcoPos-koppeling inschakelen in PCM
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Toont de &ldquo;🔄 EcoPos Sync&rdquo; knoppen in het productenoverzicht en in de ProductDrawer.
                </div>
              </div>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  EcoPos Base URL
                </label>
                <input
                  type="url"
                  className="input"
                  placeholder="bijv. http://localhost:3001 of https://ecopos.domein.nl"
                  value={settings.baseUrl}
                  onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                  required
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  PCM roept <code>{settings.baseUrl.replace(/\/+$/, '') || '<url>'}/api/v1/pcm/products/query</code> aan.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  API Sleutel (Bearer / X-API-Key)
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="Plak hier de API-key uit EcoPos"
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                  Wordt ook gebruikt om eventuele directe push-notificaties van EcoPos naar PCM te verifiëren.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={handleTest}
                disabled={testing || !settings.baseUrl.trim()}
                style={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                  padding: '0.55rem 1.1rem',
                }}
              >
                {testing ? '⏳ Verbinding testen…' : '🔌 Test verbinding met EcoPos'}
              </button>

              {testResult && (
                <div
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: testResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${testResult.ok ? '#86efac' : '#fecaca'}`,
                    color: testResult.ok ? '#065f46' : '#991b1b',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  {testResult.ok ? (
                    <>
                      ✅ Verbonden met <strong>{testResult.application}</strong> ({testResult.latencyMs}ms)
                      {testResult.totalProducts != null && ` • ${testResult.totalProducts} producten beschikbaar`}
                      {testResult.lastMplusSyncAt &&
                        ` • Laatste Mplus-sync: ${new Date(testResult.lastMplusSyncAt).toLocaleString('nl-NL')}`}
                    </>
                  ) : (
                    <>✕ {testResult.error}</>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'fields' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Kies het standaardgedrag per veld wanneer je synchroniseert vanuit EcoPos. Bij een handmatige sync kun je dit altijd per sessie nog aanpassen.
              </p>
              <button
                type="button"
                className="btn"
                onClick={resetDefaultFieldModes}
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', backgroundColor: 'var(--background)' }}
              >
                ↺ Herstel aanbevolen standaardwaarden
              </button>
            </div>

            {(Object.keys(ECOPOS_CATEGORIES) as EcoPosCategoryKey[]).map((catKey) => {
              const catMeta = ECOPOS_CATEGORIES[catKey];
              const catFields = ECOPOS_FIELDS.filter((f) => f.category === catKey);

              return (
                <div
                  key={catKey}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--background)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '0.85rem 1.15rem',
                      backgroundColor: 'var(--surface)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{catMeta.icon}</span>
                        <span>{catMeta.label}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {catMeta.description}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>Hele groep:</span>
                      <button
                        type="button"
                        onClick={() => setCategoryMode(catKey, 'overwrite')}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderRadius: '6px', border: '1px solid #86efac', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Overschrijven
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryMode(catKey, 'fill_empty')}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderRadius: '6px', border: '1px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Alleen leeg
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoryMode(catKey, 'ignore')}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Uit
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {catFields.map((field, idx) => {
                      const currentMode = settings.fieldModes[field.key] ?? field.defaultMode;
                      return (
                        <div
                          key={field.key}
                          style={{
                            padding: '0.7rem 1.15rem',
                            borderBottom: idx < catFields.length - 1 ? '1px solid var(--border)' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '1rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ flex: '1 1 260px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>
                              {field.label}{' '}
                              <code style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                                ({field.key})
                              </code>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{field.description}</div>
                          </div>

                          <select
                            className="input"
                            value={currentMode}
                            onChange={(e) => setFieldMode(field.key, e.target.value as EcoPosFieldMode)}
                            style={{ width: '270px', fontSize: '0.83rem', fontWeight: 600 }}
                          >
                            {MODE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'autosync' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem 1.25rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={settings.autoSyncEnabled}
                onChange={(e) => setSettings({ ...settings, autoSyncEnabled: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: '#0284c7' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                  Periodieke automatische achtergrond-synchronisatie inschakelen
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Werkt op de achtergrond automatisch de geconfigureerde velden (zoals statussen, prijs en voorraad) bij.
                </div>
              </div>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div
                style={{
                  padding: '1.15rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
              >
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Synchronisatie-interval (minuten)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  className="input"
                  value={settings.autoSyncIntervalMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      autoSyncIntervalMinutes: Math.max(5, parseInt(e.target.value || '60', 10)),
                    })
                  }
                />
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Standaard: 60 minuten. Minimaal 5 minuten.
                </div>
              </div>

              <div
                style={{
                  padding: '1.15rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  justifyContent: 'center',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={settings.createNewProducts}
                    onChange={(e) => setSettings({ ...settings, createNewProducts: e.target.checked })}
                  />
                  <span>Nieuwe artikelen uit EcoPos automatisch aanmaken in PCM</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={settings.onlyActiveInSystem}
                    onChange={(e) => setSettings({ ...settings, onlyActiveInSystem: e.target.checked })}
                  />
                  <span>Alleen artikelen ophalen die actief zijn in het kassasysteem</span>
                </label>
              </div>
            </div>

            {/* Standaard Productselectie & Voorwaarden (Webshop / Uitlopend / Reden) */}
            <div
              style={{
                padding: '1.2rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.9rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                  🎯 Standaard Productvoorwaarden (Filters voor Sync)
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Geef aan waar producten standaard aan moeten voldoen bij een bulk-synchronisatie of automatische achtergrond-sync.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                {/* Webshop Filter: Leeg / Nee / Ja */}
                <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>🌐 Webshop (Leeg / Nee / Ja)</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {settings.webshopFilter.length === 3 ? 'Alle 3 actief' : `${settings.webshopFilter.length} gekozen`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {(
                      [
                        { key: 'LEEG' as EcoPosWebshopFilterOption, label: 'Leeg' },
                        { key: 'NEE' as EcoPosWebshopFilterOption, label: 'Nee' },
                        { key: 'JA' as EcoPosWebshopFilterOption, label: 'Ja' },
                      ]
                    ).map((opt) => {
                      const active = settings.webshopFilter.includes(opt.key);
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            const curr = settings.webshopFilter;
                            if (curr.includes(opt.key)) {
                              if (curr.length === 1) return;
                              setSettings({ ...settings, webshopFilter: curr.filter((x) => x !== opt.key) });
                            } else {
                              setSettings({ ...settings, webshopFilter: [...curr, opt.key] });
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '0.4rem 0.55rem',
                            borderRadius: '8px',
                            border: active ? '1.5px solid #0284c7' : '1px solid var(--border)',
                            backgroundColor: active ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                            color: active ? '#0369a1' : 'var(--text-muted)',
                            fontWeight: active ? 700 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {active ? '☑ ' : '☐ '}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Uitlopend Filter: Alle / Nee / Ja */}
                <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>📉 Uitlopend (Ja / Nee)</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {settings.uitlopendFilter === 'ALL'
                        ? 'Alle artikelen'
                        : settings.uitlopendFilter === 'JA'
                          ? 'Alleen uitlopend'
                          : 'Alleen niet-uitlopend'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {(
                      [
                        { key: 'ALL' as EcoPosUitlopendFilterOption, label: 'Alle' },
                        { key: 'NEE' as EcoPosUitlopendFilterOption, label: 'Nee' },
                        { key: 'JA' as EcoPosUitlopendFilterOption, label: 'Ja' },
                      ]
                    ).map((opt) => {
                      const active = settings.uitlopendFilter === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setSettings({ ...settings, uitlopendFilter: opt.key })}
                          style={{
                            flex: 1,
                            padding: '0.4rem 0.55rem',
                            borderRadius: '8px',
                            border: active ? '1.5px solid #0284c7' : '1px solid var(--border)',
                            backgroundColor: active ? '#0284c7' : 'var(--background)',
                            color: active ? 'white' : 'var(--text-muted)',
                            fontWeight: active ? 700 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Reden / uitlopend Filter */}
              <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>🏷️ Reden / uitlopend selectie</span>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, uitlopendReasonsFilter: [] })}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: settings.uitlopendReasonsFilter.length === 0 ? '1.5px solid #0284c7' : '1px solid var(--border)',
                        backgroundColor: settings.uitlopendReasonsFilter.length === 0 ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                        color: settings.uitlopendReasonsFilter.length === 0 ? '#0369a1' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Alle (geen filter)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, uitlopendReasonsFilter: ['__NON_EMPTY__'] })}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: settings.uitlopendReasonsFilter.includes('__NON_EMPTY__') ? '1.5px solid #0284c7' : '1px solid var(--border)',
                        backgroundColor: settings.uitlopendReasonsFilter.includes('__NON_EMPTY__') ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                        color: settings.uitlopendReasonsFilter.includes('__NON_EMPTY__') ? '#0369a1' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Met reden ingevuld
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, uitlopendReasonsFilter: ['__EMPTY__'] })}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: settings.uitlopendReasonsFilter.includes('__EMPTY__') ? '1.5px solid #0284c7' : '1px solid var(--border)',
                        backgroundColor: settings.uitlopendReasonsFilter.includes('__EMPTY__') ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                        color: settings.uitlopendReasonsFilter.includes('__EMPTY__') ? '#0369a1' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Zonder reden (Leeg)
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {availableReasons.length > 0 && (
                    <select
                      className="input"
                      value=""
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (!val) return;
                        const cleaned = settings.uitlopendReasonsFilter.filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__');
                        if (!cleaned.some((r) => r.toLowerCase() === val.toLowerCase())) {
                          setSettings({ ...settings, uitlopendReasonsFilter: [...cleaned, val] });
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', width: 'auto', minWidth: '220px' }}
                    >
                      <option value="">+ Kies bekende Reden/uitlopend…</option>
                      {availableReasons.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem', flex: '1 1 240px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Specifieke Reden/uitlopend typen…"
                      value={customReasonInput}
                      onChange={(e) => setCustomReasonInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customReasonInput.trim()) {
                          e.preventDefault();
                          const val = customReasonInput.trim();
                          const cleaned = settings.uitlopendReasonsFilter.filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__');
                          if (!cleaned.some((r) => r.toLowerCase() === val.toLowerCase())) {
                            setSettings({ ...settings, uitlopendReasonsFilter: [...cleaned, val] });
                          }
                          setCustomReasonInput('');
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn"
                      disabled={!customReasonInput.trim()}
                      onClick={() => {
                        const val = customReasonInput.trim();
                        if (!val) return;
                        const cleaned = settings.uitlopendReasonsFilter.filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__');
                        if (!cleaned.some((r) => r.toLowerCase() === val.toLowerCase())) {
                          setSettings({ ...settings, uitlopendReasonsFilter: [...cleaned, val] });
                        }
                        setCustomReasonInput('');
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        backgroundColor: customReasonInput.trim() ? '#0284c7' : '#e2e8f0',
                        color: customReasonInput.trim() ? 'white' : '#64748b',
                        border: 'none',
                      }}
                    >
                      + Toevoegen
                    </button>
                  </div>
                </div>

                {settings.uitlopendReasonsFilter.filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__').length > 0 && (
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                    {settings.uitlopendReasonsFilter
                      .filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__')
                      .map((reason) => (
                        <span
                          key={reason}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '999px',
                            backgroundColor: '#e0f2fe',
                            border: '1px solid #7dd3fc',
                            color: '#0369a1',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                          }}
                        >
                          <span>{reason}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                uitlopendReasonsFilter: settings.uitlopendReasonsFilter.filter((x) => x !== reason),
                              })
                            }
                            style={{ border: 'none', background: 'none', color: '#0369a1', cursor: 'pointer', fontWeight: 800, padding: 0 }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {settings.lastSyncAt && (
              <div
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: settings.lastSyncStatus === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(2,132,199,0.08)',
                  border: `1px solid ${settings.lastSyncStatus === 'error' ? '#fecaca' : '#bae6fd'}`,
                  fontSize: '0.85rem',
                }}
              >
                <strong>Laatste synchronisatie:</strong>{' '}
                {new Date(settings.lastSyncAt).toLocaleString('nl-NL')} —{' '}
                <span>{settings.lastSyncSummary || 'Voltooid'}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                padding: '1.25rem',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--background)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                  🔎 Test een specifiek artikelnummer vanuit EcoPos
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Geef een artikelnummer op (bijv. <code>15504</code> of <code>16966</code>) om live te controleren hoe PCM het <strong>Leverancier</strong>-veld (zonder nummer tussen haakjes zoals <code>(67)</code>) en <strong>Bontekst vs. Omschrijving</strong> verwerkt.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', maxWidth: '520px' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Artikelnummer (bijv. 15504)..."
                  value={previewArticleNum}
                  onChange={(e) => setPreviewArticleNum(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInspectArticle();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!previewArticleNum.trim() || inspectingArticle}
                  onClick={handleInspectArticle}
                  style={{ whiteSpace: 'nowrap', fontWeight: 700, padding: '0.55rem 1.2rem' }}
                >
                  {inspectingArticle ? '⏳ Ophalen…' : '🔍 Artikel Previewen'}
                </button>
              </div>
            </div>

            {inspectionResult && !inspectionResult.ok && (
              <div
                style={{
                  padding: '0.9rem 1.15rem',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                }}
              >
                ✕ {inspectionResult.error}
              </div>
            )}

            {inspectionResult && inspectionResult.ok && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  backgroundColor: 'var(--background)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                      Artikel #{inspectionResult.articleNumber}{' '}
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        — {inspectionResult.effectiveTitle || inspectionResult.pcmTitle || 'Onbekend'}
                      </span>
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Status in PCM:{' '}
                      <strong style={{ color: inspectionResult.existsInPcm ? '#15803d' : '#d97706' }}>
                        {inspectionResult.existsInPcm ? 'Bestaand product in PCM' : 'Nog niet aanwezig in PCM'}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowRawJson((v) => !v)}
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.75rem',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      fontWeight: 600,
                    }}
                  >
                    {showRawJson ? '▲ Ruwe JSON verbergen' : '{ } Ruwe EcoPos JSON bekijken'}
                  </button>
                </div>

                {/* Highlight cards for Leverancier and Bontekst/Omschrijving */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      🏢 Leverancier verwerking
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                      <div>
                        Ruw uit MplusKassa: <strong>{inspectionResult.rawSupplier || '—'}</strong>
                      </div>
                      <div style={{ marginTop: '0.2rem' }}>
                        Opgeschoond voor PCM:{' '}
                        <strong style={{ color: '#0284c7' }}>{inspectionResult.cleanedSupplier || '—'}</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      📝 Titel (Bontekst vs. Omschrijving)
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
                      <div>
                        Bontekst: <strong>{inspectionResult.rawBontekst || '— (niet apart meegegeven / leeg)'}</strong>
                      </div>
                      <div style={{ marginTop: '0.15rem' }}>
                        Omschrijving: <strong>{inspectionResult.rawOmschrijving || '—'}</strong>
                      </div>
                      <div style={{ marginTop: '0.25rem', color: '#0284c7', fontWeight: 700 }}>
                        Leidende titel in PCM: {inspectionResult.effectiveTitle || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {showRawJson && (
                  <pre
                    style={{
                      margin: 0,
                      padding: '1rem',
                      borderRadius: '10px',
                      backgroundColor: '#0f172a',
                      color: '#e2e8f0',
                      fontSize: '0.78rem',
                      maxHeight: '280px',
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(inspectionResult.rawJson, null, 2)}
                  </pre>
                )}

                <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'var(--surface)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '0.6rem 0.85rem' }}>Veld</th>
                        <th style={{ padding: '0.6rem 0.85rem' }}>Waarde uit EcoPos (verwerkt)</th>
                        <th style={{ padding: '0.6rem 0.85rem' }}>Huidig in PCM</th>
                        <th style={{ padding: '0.6rem 0.85rem' }}>Actie bij Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionResult.rows.map((r) => (
                        <tr key={r.fieldKey} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.55rem 0.85rem' }}>
                            <div style={{ fontWeight: 600 }}>{r.fieldLabel}</div>
                            {r.rawDetail && (
                              <div style={{ fontSize: '0.72rem', color: '#0369a1', marginTop: '0.1rem' }}>
                                ℹ️ {r.rawDetail}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.55rem 0.85rem', fontWeight: 700, color: '#0284c7' }}>
                            {r.ecoPosFormatted}
                          </td>
                          <td style={{ padding: '0.55rem 0.85rem', color: 'var(--text-muted)' }}>
                            {r.pcmFormatted}
                          </td>
                          <td style={{ padding: '0.55rem 0.85rem' }}>
                            {r.wouldApply ? (
                              <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.74rem' }}>
                                Wordt overgenomen
                              </span>
                            ) : r.isDifferent ? (
                              <span style={{ padding: '0.2rem 0.55rem', borderRadius: '999px', backgroundColor: '#fef9c3', color: '#854d0e', fontWeight: 600, fontSize: '0.74rem' }}>
                                Afwijkend ({r.configuredMode === 'ignore' ? 'uitgeschakeld' : 'alleen indien leeg'})
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Gelijk</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '0.6rem 1.5rem', fontWeight: 600 }}>
            {saving ? 'Opslaan…' : 'EcoPos-instellingen opslaan'}
          </button>
        </div>
      </form>
    </div>
  );
}

