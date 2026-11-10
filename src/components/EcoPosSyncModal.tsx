'use client';

import React, { useEffect, useState } from 'react';
import {
  DEFAULT_ECOPOS_FIELD_MODES,
  ECOPOS_CATEGORIES,
  ECOPOS_FIELDS,
  EcoPosCategoryKey,
  EcoPosFieldMode,
  EcoPosProductDiff,
  EcoPosUitlopendFilterOption,
  EcoPosWebshopFilterOption,
  formatEcoPosValue,
} from '@/lib/ecopos';
import {
  EcoPosArticleInspectionResult,
  EcoPosExecuteResult,
  EcoPosPreviewResult,
  executeEcoPosSyncAction,
  getAvailableUitlopendReasonsAction,
  getEcoPosSettingsAction,
  inspectEcoPosArticleAction,
  previewEcoPosSyncAction,
} from '@/app/actions/ecopos';
import { useBackdropClose } from '@/hooks/useBackdropClose';

interface EcoPosSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional list of specific articleNumbers (for selection sync or single product sync) */
  articleNumbers?: string[];
  /** When true, opens directly in single-product field comparison mode (for ProductDrawer) */
  singleProductMode?: boolean;
  onComplete?: (result: EcoPosExecuteResult) => void;
}

export default function EcoPosSyncModal({
  isOpen,
  onClose,
  articleNumbers,
  singleProductMode = false,
  onComplete,
}: EcoPosSyncModalProps) {
  const [step, setStep] = useState<'config' | 'preview' | 'done'>('config');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [fieldModes, setFieldModes] = useState<Record<string, EcoPosFieldMode>>({
    ...DEFAULT_ECOPOS_FIELD_MODES,
  });
  const [createNewProducts, setCreateNewProducts] = useState(false);
  const [onlyActiveInSystem, setOnlyActiveInSystem] = useState(false);
  const [webshopFilter, setWebshopFilter] = useState<EcoPosWebshopFilterOption[]>(['JA', 'NEE', 'LEEG']);
  const [uitlopendFilter, setUitlopendFilter] = useState<EcoPosUitlopendFilterOption>('ALL');
  const [uitlopendReasonsFilter, setUitlopendReasonsFilter] = useState<string[]>([]);
  const [availableReasons, setAvailableReasons] = useState<string[]>([]);
  const [customReasonInput, setCustomReasonInput] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<EcoPosCategoryKey | null>('status');

  const [customArticleInput, setCustomArticleInput] = useState('');
  const [articleInspection, setArticleInspection] = useState<EcoPosArticleInspectionResult | null>(null);
  const [showRawInspectionJson, setShowRawInspectionJson] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [previewData, setPreviewData] = useState<EcoPosPreviewResult | null>(null);
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  // For singleProductMode: which specific fields to apply
  const [selectedSingleFields, setSelectedSingleFields] = useState<Set<string>>(new Set());
  const [executeResult, setExecuteResult] = useState<EcoPosExecuteResult | null>(null);

  const backdropProps = useBackdropClose(onClose);
  const articleNumbersKey = (articleNumbers ?? []).join(',');

  // Close EcoPosSyncModal on Escape key before any parent drawer handles it
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !executing) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, executing, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const targetArticles = articleNumbersKey ? articleNumbersKey.split(',') : undefined;
    setError(null);
    setExecuteResult(null);
    setPreviewData(null);
    setArticleInspection(null);
    setShowRawInspectionJson(false);

    setLoadingSettings(true);
        Promise.all([getEcoPosSettingsAction(), getAvailableUitlopendReasonsAction()])
          .then(async ([s, reasons]) => {
            setFieldModes(s.fieldModes || { ...DEFAULT_ECOPOS_FIELD_MODES });
            setCreateNewProducts(s.createNewProducts ?? false);
            setOnlyActiveInSystem(s.onlyActiveInSystem ?? false);
            setWebshopFilter(
              Array.isArray(s.webshopFilter) && s.webshopFilter.length > 0
                ? s.webshopFilter
                : ['JA', 'NEE', 'LEEG']
            );
            setUitlopendFilter(s.uitlopendFilter ?? 'ALL');
            setUitlopendReasonsFilter(Array.isArray(s.uitlopendReasonsFilter) ? s.uitlopendReasonsFilter : []);
            setAvailableReasons(reasons || []);

            if (singleProductMode && targetArticles && targetArticles.length === 1) {
              // In single product mode, immediately fetch all available EcoPos fields so user can pick
              setStep('preview');
              setLoadingPreview(true);
              const allOverwriteModes: Record<string, EcoPosFieldMode> = Object.fromEntries(
                ECOPOS_FIELDS.map((f) => [f.key, 'overwrite'])
              );
              const [res, inspectRes] = await Promise.all([
                previewEcoPosSyncAction({
                  articleNumbers: targetArticles,
                  fieldModes: allOverwriteModes,
                  createNewProducts: false,
                  onlyActiveInSystem: false,
                  webshopFilter: ['JA', 'NEE', 'LEEG'],
                  uitlopendFilter: 'ALL',
                  uitlopendReasonsFilter: [],
                }),
                inspectEcoPosArticleAction(targetArticles[0], s.fieldModes || { ...DEFAULT_ECOPOS_FIELD_MODES }),
              ]);
              setLoadingPreview(false);
              if (inspectRes.ok) {
                setArticleInspection(inspectRes);
              }
              if (!res.ok) {
                setError(res.error || 'Kon gegevens niet ophalen uit EcoPos.');
              } else {
                setPreviewData(res);
                const firstDiff = res.changedProducts[0];
                if (firstDiff) {
                  // Pre-select fields that are configured as non-ignore AND have a difference
                  const preselected = new Set<string>();
                  for (const ch of firstDiff.changes) {
                    if ((s.fieldModes?.[ch.fieldKey] ?? 'overwrite') !== 'ignore') {
                      preselected.add(ch.fieldKey);
                    }
                  }
                  setSelectedSingleFields(preselected);
                }
              }
            } else {
              setStep('config');
            }
          })
          .finally(() => setLoadingSettings(false));
      }, [isOpen, singleProductMode, articleNumbersKey]);

    if (!isOpen) return null;

    const parsedCustomArticles = customArticleInput
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const effectiveTargetArticles =
      parsedCustomArticles.length > 0 ? parsedCustomArticles : articleNumbers;

    const isSingleTestArticle = parsedCustomArticles.length === 1;

    const toggleWebshopOption = (opt: EcoPosWebshopFilterOption) => {
      setWebshopFilter((prev) => {
        if (prev.includes(opt)) {
          // Prevent deselecting all 3 options
          if (prev.length === 1) return prev;
          return prev.filter((x) => x !== opt);
        }
        return [...prev, opt];
      });
    };

    const addReasonFilter = (reason: string) => {
      const trimmed = reason.trim();
      if (!trimmed) return;
      setUitlopendReasonsFilter((prev) => {
        const cleaned = prev.filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__');
        if (cleaned.some((r) => r.toLowerCase() === trimmed.toLowerCase())) return cleaned;
        return [...cleaned, trimmed];
      });
      setCustomReasonInput('');
    };

    const handleRunPreview = async (overrideArticles?: string[]) => {
      const targetList = overrideArticles ?? effectiveTargetArticles;
      const isTestingSpecific = Boolean(overrideArticles && overrideArticles.length > 0);
      setLoadingPreview(true);
      setError(null);
      setArticleInspection(null);
      setShowRawInspectionJson(false);
      try {
        const [res, inspectRes] = await Promise.all([
          previewEcoPosSyncAction({
            articleNumbers: targetList,
            fieldModes,
            createNewProducts,
            onlyActiveInSystem: isTestingSpecific ? false : onlyActiveInSystem,
            webshopFilter: isTestingSpecific ? ['JA', 'NEE', 'LEEG'] : webshopFilter,
            uitlopendFilter: isTestingSpecific ? 'ALL' : uitlopendFilter,
            uitlopendReasonsFilter: isTestingSpecific ? [] : uitlopendReasonsFilter,
          }),
          targetList && targetList.length === 1
            ? inspectEcoPosArticleAction(targetList[0], fieldModes)
            : Promise.resolve(null),
        ]);
        if (inspectRes && inspectRes.ok) {
          setArticleInspection(inspectRes);
        }
        if (!res.ok) {
          setError(res.error || 'Fout bij ophalen van EcoPos preview.');
          return;
        }
        setPreviewData(res);
        const allToSelect = new Set<string>();
        res.changedProducts.forEach((p) => allToSelect.add(p.internalArticleNumber));
        res.newProducts.forEach((p) => allToSelect.add(p.internalArticleNumber));
        setSelectedArticles(allToSelect);
        setStep('preview');
      } finally {
        setLoadingPreview(false);
      }
    };

    const handleExecuteSync = async () => {
      setExecuting(true);
      setError(null);
      try {
        if (singleProductMode && articleNumbers?.length === 1) {
          const res = await executeEcoPosSyncAction({
            articleNumbers,
            allowedFieldKeys: Array.from(selectedSingleFields),
            createNewProducts: false,
            webshopFilter: ['JA', 'NEE', 'LEEG'],
            uitlopendFilter: 'ALL',
            uitlopendReasonsFilter: [],
          });
          if (!res.ok) {
            setError(res.error || 'Synchronisatie mislukt.');
            return;
          }
          setExecuteResult(res);
          setStep('done');
          onComplete?.(res);
          return;
        }

        const res = await executeEcoPosSyncAction({
          articleNumbers: effectiveTargetArticles,
          fieldModes,
          createNewProducts,
          onlyActiveInSystem: isSingleTestArticle ? false : onlyActiveInSystem,
          webshopFilter: isSingleTestArticle ? ['JA', 'NEE', 'LEEG'] : webshopFilter,
          uitlopendFilter: isSingleTestArticle ? 'ALL' : uitlopendFilter,
          uitlopendReasonsFilter: isSingleTestArticle ? [] : uitlopendReasonsFilter,
          selectedArticlesToApply: Array.from(selectedArticles),
        });
        if (!res.ok) {
          setError(res.error || 'Synchronisatie mislukt.');
          return;
        }
        setExecuteResult(res);
        setStep('done');
        onComplete?.(res);
      } finally {
        setExecuting(false);
      }
    };

    const setCategoryMode = (cat: EcoPosCategoryKey, mode: EcoPosFieldMode) => {
      const next = { ...fieldModes };
      ECOPOS_FIELDS.filter((f) => f.category === cat).forEach((f) => {
        next[f.key] = mode;
      });
      setFieldModes(next);
    };

    const allPreviewItems: EcoPosProductDiff[] = previewData
      ? [...previewData.changedProducts, ...previewData.newProducts]
      : [];

    return (
      <div
        {...backdropProps}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '18px',
            width: '100%',
            maxWidth: singleProductMode ? '780px' : '980px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '1.25rem 1.75rem',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--background)',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>🔄</span>
                {singleProductMode
                  ? `EcoPos Synchronisatie — Artikel #${articleNumbers?.[0]}`
                  : articleNumbers && articleNumbers.length > 0
                    ? `EcoPos Synchronisatie (${articleNumbers.length} geselecteerde producten)`
                    : 'EcoPos / MplusKassa Bulk Synchronisatie'}
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {singleProductMode
                  ? 'Vergelijk de actuele waarden uit EcoPos met PCM en kies welke velden je wilt overnemen.'
                  : 'Kies zelf welke statussen en productvelden je wilt ophalen en bekijk vooraf alle wijzigingen.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div
                style={{
                  padding: '0.9rem 1.15rem',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {loadingSettings || loadingPreview ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                ⏳ Bezig met ophalen en vergelijken van gegevens uit EcoPos…
              </div>
            ) : step === 'config' ? (
              <>
                {/* Single / Specific Article Test & Preview Box */}
                <div
                  style={{
                    padding: '0.85rem 1.1rem',
                    borderRadius: '12px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 260px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>🔎</span>
                      <span>Specifiek artikel als Preview testen (optioneel)</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Geef een artikelnummer op (bijv. <code>15504</code>) om direct alle ruwe en verwerkte velden (zoals Leverancier en Bontekst/Omschrijving) te bekijken.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: '1 1 280px' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="Artikelnummer (bijv. 15504)..."
                      value={customArticleInput}
                      onChange={(e) => setCustomArticleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && parsedCustomArticles.length > 0) {
                          e.preventDefault();
                          handleRunPreview(parsedCustomArticles);
                        }
                      }}
                      style={{ flex: 1, fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}
                    />
                    {customArticleInput && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setCustomArticleInput('')}
                        title="Wissen"
                        style={{ padding: '0.4rem 0.65rem', fontSize: '0.8rem', backgroundColor: 'white', border: '1px solid var(--border)' }}
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      disabled={parsedCustomArticles.length === 0 || loadingPreview}
                      onClick={() => handleRunPreview(parsedCustomArticles)}
                      style={{
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        backgroundColor: parsedCustomArticles.length > 0 ? '#0284c7' : '#e2e8f0',
                        color: parsedCustomArticles.length > 0 ? 'white' : '#64748b',
                        border: 'none',
                        whiteSpace: 'nowrap',
                        cursor: parsedCustomArticles.length > 0 ? 'pointer' : 'not-allowed',
                      }}
                    >
                      🔍 Test Artikel
                    </button>
                  </div>
                </div>

                {/* Product Selection Conditions / Filters ("Waar moeten producten aan voldoen?") */}
                <div
                  style={{
                    padding: '1rem 1.2rem',
                    borderRadius: '12px',
                    backgroundColor: 'var(--background)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span>🎯</span>
                        <span>Waar moeten producten aan voldoen? (Selectievoorwaarden)</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        Filter vooraf welke artikelen uit EcoPos/MplusKassa worden meegenomen in de synchronisatie.
                      </div>
                    </div>
                    {(webshopFilter.length < 3 ||
                      uitlopendFilter !== 'ALL' ||
                      uitlopendReasonsFilter.length > 0 ||
                      onlyActiveInSystem) && (
                        <button
                          type="button"
                          onClick={() => {
                            setWebshopFilter(['JA', 'NEE', 'LEEG']);
                            setUitlopendFilter('ALL');
                            setUitlopendReasonsFilter([]);
                            setOnlyActiveInSystem(false);
                          }}
                          style={{
                            fontSize: '0.74rem',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--surface)',
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          ↺ Filters wissen
                        </button>
                      )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                    {/* 1. Webshop Filter (Leeg / Nee / Ja) */}
                    <div
                      style={{
                        padding: '0.75rem 0.9rem',
                        borderRadius: '10px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
                          🌐 Webshop status (MplusKassa)
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {webshopFilter.length === 3 ? 'Alle 3 actief' : `${webshopFilter.length} van 3 gekozen`}
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
                          const active = webshopFilter.includes(opt.key);
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => toggleWebshopOption(opt.key)}
                              style={{
                                flex: 1,
                                padding: '0.4rem 0.5rem',
                                borderRadius: '8px',
                                border: active ? '1.5px solid #0284c7' : '1px solid var(--border)',
                                backgroundColor: active ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                                color: active ? '#0369a1' : 'var(--text-muted)',
                                fontWeight: active ? 700 : 600,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              <span>{active ? '☑' : '☐'}</span>
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Uitlopend Filter (Alle / Nee / Ja) */}
                    <div
                      style={{
                        padding: '0.75rem 0.9rem',
                        borderRadius: '10px',
                        backgroundColor: 'var(--surface)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
                          📉 Uitlopend (Ja / Nee)
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {uitlopendFilter === 'ALL'
                            ? 'Alle artikelen'
                            : uitlopendFilter === 'JA'
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
                          const active = uitlopendFilter === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setUitlopendFilter(opt.key)}
                              style={{
                                flex: 1,
                                padding: '0.4rem 0.5rem',
                                borderRadius: '8px',
                                border: active ? '1.5px solid #0284c7' : '1px solid var(--border)',
                                backgroundColor: active ? '#0284c7' : 'var(--background)',
                                color: active ? 'white' : 'var(--text-muted)',
                                fontWeight: active ? 700 : 600,
                                fontSize: '0.78rem',
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

                  {/* 3. Reden / uitlopend selector */}
                  <div
                    style={{
                      padding: '0.75rem 0.9rem',
                      borderRadius: '10px',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>
                        🏷️ Reden / uitlopend filteren
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setUitlopendReasonsFilter([])}
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            border: uitlopendReasonsFilter.length === 0 ? '1.5px solid #0284c7' : '1px solid var(--border)',
                            backgroundColor: uitlopendReasonsFilter.length === 0 ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                            color: uitlopendReasonsFilter.length === 0 ? '#0369a1' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Alle (geen filter)
                        </button>
                        <button
                          type="button"
                          onClick={() => setUitlopendReasonsFilter(['__NON_EMPTY__'])}
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            border: uitlopendReasonsFilter.includes('__NON_EMPTY__') ? '1.5px solid #0284c7' : '1px solid var(--border)',
                            backgroundColor: uitlopendReasonsFilter.includes('__NON_EMPTY__') ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                            color: uitlopendReasonsFilter.includes('__NON_EMPTY__') ? '#0369a1' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Met reden ingevuld
                        </button>
                        <button
                          type="button"
                          onClick={() => setUitlopendReasonsFilter(['__EMPTY__'])}
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '6px',
                            fontSize: '0.73rem',
                            fontWeight: 600,
                            border: uitlopendReasonsFilter.includes('__EMPTY__') ? '1.5px solid #0284c7' : '1px solid var(--border)',
                            backgroundColor: uitlopendReasonsFilter.includes('__EMPTY__') ? 'rgba(2, 132, 199, 0.1)' : 'var(--background)',
                            color: uitlopendReasonsFilter.includes('__EMPTY__') ? '#0369a1' : 'var(--text-muted)',
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
                            if (e.target.value) addReasonFilter(e.target.value);
                          }}
                          style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', width: 'auto', minWidth: '210px' }}
                        >
                          <option value="">+ Kies bekende Reden/uitlopend…</option>
                          {availableReasons.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      )}
                      <div style={{ display: 'flex', gap: '0.35rem', flex: '1 1 220px' }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="Specifieke Reden/uitlopend typen (bijv. Uit collectie)…"
                          value={customReasonInput}
                          onChange={(e) => setCustomReasonInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && customReasonInput.trim()) {
                              e.preventDefault();
                              addReasonFilter(customReasonInput);
                            }
                          }}
                          style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn"
                          disabled={!customReasonInput.trim()}
                          onClick={() => addReasonFilter(customReasonInput)}
                          style={{
                            padding: '0.35rem 0.7rem',
                            fontSize: '0.76rem',
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

                    {uitlopendReasonsFilter.filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__').length > 0 && (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
                        {uitlopendReasonsFilter
                          .filter((r) => r !== '__EMPTY__' && r !== '__NON_EMPTY__')
                          .map((reason) => (
                            <span
                              key={reason}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.2rem 0.55rem',
                                borderRadius: '999px',
                                backgroundColor: '#e0f2fe',
                                border: '1px solid #7dd3fc',
                                color: '#0369a1',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                              }}
                            >
                              <span>{reason}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setUitlopendReasonsFilter((prev) => prev.filter((x) => x !== reason))
                                }
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  color: '#0369a1',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                  padding: 0,
                                  fontSize: '0.75rem',
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* 4. Systeemstatus & Nieuwe Artikelen */}
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', paddingTop: '0.15rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={onlyActiveInSystem}
                        onChange={(e) => setOnlyActiveInSystem(e.target.checked)}
                      />
                      <span>🚦 Alleen systeem-actieve artikelen (`Actief in systeem = Ja`)</span>
                    </label>
                    {(!articleNumbers || articleNumbers.length === 0) && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={createNewProducts}
                          onChange={(e) => setCreateNewProducts(e.target.checked)}
                        />
                        <span>➕ Nieuwe artikelen uit EcoPos ook aanmaken in PCM</span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Snelkeuze profiel:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const m: Record<string, EcoPosFieldMode> = {};
                      ECOPOS_FIELDS.forEach((f) => {
                        m[f.key] = f.category === 'status' ? 'overwrite' : 'ignore';
                      });
                      setFieldModes(m);
                    }}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    🚦 Alleen Statussen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const m: Record<string, EcoPosFieldMode> = {};
                      ECOPOS_FIELDS.forEach((f) => {
                        m[f.key] = f.category === 'status' || f.key === 'basePrice' || f.category === 'stock' ? 'overwrite' : 'ignore';
                      });
                      setFieldModes(m);
                    }}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    💶 Statussen + Prijs + Voorraad
                  </button>
                  <button
                    type="button"
                    onClick={() => setFieldModes({ ...DEFAULT_ECOPOS_FIELD_MODES })}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ⭐ Aanbevolen Mix (Status/Prijs overschrijven + Rest aanvullen)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const m: Record<string, EcoPosFieldMode> = {};
                      ECOPOS_FIELDS.forEach((f) => {
                        m[f.key] = 'overwrite';
                      });
                      setFieldModes(m);
                    }}
                    style={{ padding: '0.35rem 0.75rem', borderRadius: '999px', border: '1px solid #86efac', backgroundColor: '#dcfce7', color: '#15803d', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    🔄 Alles Overschrijven ({ECOPOS_FIELDS.length} velden)
                  </button>
                </div>

                {/* Category Accordion */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(Object.keys(ECOPOS_CATEGORIES) as EcoPosCategoryKey[]).map((catKey) => {
                    const cat = ECOPOS_CATEGORIES[catKey];
                    const fields = ECOPOS_FIELDS.filter((f) => f.category === catKey);
                    const activeInCat = fields.filter((f) => (fieldModes[f.key] ?? 'ignore') !== 'ignore').length;
                    const isExpanded = expandedCategory === catKey;

                    return (
                      <div
                        key={catKey}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          backgroundColor: 'var(--background)',
                        }}
                      >
                        <div
                          onClick={() => setExpandedCategory(isExpanded ? null : catKey)}
                          style={{
                            padding: '0.85rem 1.15rem',
                            backgroundColor: 'var(--surface)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            gap: '1rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isExpanded ? '▼' : '▶'}</span>
                            <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                                {cat.label}{' '}
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: activeInCat > 0 ? '#0284c7' : 'var(--text-muted)' }}>
                                  ({activeInCat}/{fields.length} geselecteerd)
                                </span>
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cat.description}</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setCategoryMode(catKey, 'overwrite')}
                              style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderRadius: '6px', border: '1px solid #86efac', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Alles overschrijven
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

                        {isExpanded && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 1.15rem', display: 'flex', flexDirection: 'column' }}>
                            {fields.map((f, idx) => (
                              <div
                                key={f.key}
                                style={{
                                  padding: '0.55rem 0',
                                  borderBottom: idx < fields.length - 1 ? '1px solid var(--border)' : 'none',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '1rem',
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{f.label}</div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{f.description}</div>
                                </div>
                                <select
                                  className="input"
                                  style={{ width: '250px', fontSize: '0.82rem', fontWeight: 600 }}
                                  value={fieldModes[f.key] ?? 'ignore'}
                                  onChange={(e) =>
                                    setFieldModes((prev) => ({
                                      ...prev,
                                      [f.key]: e.target.value as EcoPosFieldMode,
                                    }))
                                  }
                                >
                                  <option value="ignore">🚫 Niet ophalen</option>
                                  <option value="fill_empty">➕ Alleen aanvullen indien leeg</option>
                                  <option value="overwrite">🔄 Altijd overschrijven</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : step === 'preview' && previewData ? (
              singleProductMode ? (
                /* Single Product Comparison View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {previewData.totalFetched === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Artikel <strong>#{articleNumbers?.[0]}</strong> is niet gevonden in EcoPos.
                    </div>
                  ) : previewData.changedProducts.length === 0 ? (
                    <div
                      style={{
                        padding: '2rem',
                        textAlign: 'center',
                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid #a7f3d0',
                        borderRadius: '12px',
                        color: '#065f46',
                        fontWeight: 600,
                      }}
                    >
                      ✅ Alle waardes in PCM voor artikel <strong>#{articleNumbers?.[0]}</strong> zijn al volledig gelijk aan EcoPos!
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Hieronder zie je de velden waarbij EcoPos een andere waarde heeft dan PCM. Vink aan welke velden je wilt bijwerken:
                      </div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                              <th style={{ padding: '0.65rem 0.9rem', width: '40px' }}>
                                <input
                                  type="checkbox"
                                  checked={
                                    selectedSingleFields.size === previewData.changedProducts[0].changes.length &&
                                    previewData.changedProducts[0].changes.length > 0
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedSingleFields(
                                        new Set(previewData.changedProducts[0].changes.map((c) => c.fieldKey))
                                      );
                                    } else {
                                      setSelectedSingleFields(new Set());
                                    }
                                  }}
                                />
                              </th>
                              <th style={{ padding: '0.65rem 0.9rem' }}>Veld</th>
                              <th style={{ padding: '0.65rem 0.9rem' }}>Huidig in PCM</th>
                              <th style={{ padding: '0.65rem 0.9rem' }}>Nieuw uit EcoPos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.changedProducts[0].changes.map((ch) => {
                              const def = ECOPOS_FIELDS.find((f) => f.key === ch.fieldKey);
                              const isChecked = selectedSingleFields.has(ch.fieldKey);
                              return (
                                <tr
                                  key={ch.fieldKey}
                                  onClick={() => {
                                    const next = new Set(selectedSingleFields);
                                    if (next.has(ch.fieldKey)) next.delete(ch.fieldKey);
                                    else next.add(ch.fieldKey);
                                    setSelectedSingleFields(next);
                                  }}
                                  style={{
                                    borderBottom: '1px solid var(--border)',
                                    cursor: 'pointer',
                                    backgroundColor: isChecked ? 'rgba(2, 132, 199, 0.05)' : 'transparent',
                                  }}
                                >
                                  <td style={{ padding: '0.65rem 0.9rem' }} onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        const next = new Set(selectedSingleFields);
                                        if (next.has(ch.fieldKey)) next.delete(ch.fieldKey);
                                        else next.add(ch.fieldKey);
                                        setSelectedSingleFields(next);
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.65rem 0.9rem', fontWeight: 600 }}>{ch.fieldLabel}</td>
                                  <td style={{ padding: '0.65rem 0.9rem', color: 'var(--text-muted)' }}>
                                    {formatEcoPosValue(ch.oldValue, def?.type, ch.fieldKey)}
                                  </td>
                                  <td style={{ padding: '0.65rem 0.9rem', fontWeight: 700, color: '#0369a1' }}>
                                    {formatEcoPosValue(ch.newValue, def?.type, ch.fieldKey)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Bulk / Multi-Product Preview View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.85rem' }}>
                    <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Voldoet aan voorwaarden</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{previewData.totalFetched}</div>
                      {typeof previewData.filteredOutCount === 'number' && previewData.filteredOutCount > 0 && (
                        <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          ({previewData.filteredOutCount} uitgefilterd van {previewData.rawTotalFetched})
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}>
                      <div style={{ fontSize: '0.74rem', color: '#0369a1', fontWeight: 600 }}>Te updaten producten</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0284c7' }}>{previewData.changedProducts.length}</div>
                    </div>
                    <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '0.74rem', color: '#15803d', fontWeight: 600 }}>Nieuwe producten</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a' }}>{previewData.newProducts.length}</div>
                    </div>
                    <div style={{ padding: '0.85rem 1rem', borderRadius: '10px', backgroundColor: 'var(--background)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Al up-to-date</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{previewData.unchangedCount}</div>
                    </div>
                  </div>

                  {allPreviewItems.length === 0 ? (
                    <div
                      style={{
                        padding: '2.5rem',
                        textAlign: 'center',
                        backgroundColor: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid #a7f3d0',
                        borderRadius: '12px',
                        color: '#065f46',
                        fontWeight: 600,
                      }}
                    >
                      ✅ Geen verschillen gevonden! Alle geselecteerde velden zijn al actueel in PCM.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                      <div
                        style={{
                          padding: '0.65rem 1rem',
                          backgroundColor: 'var(--background)',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.82rem',
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedArticles.size === allPreviewItems.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedArticles(new Set(allPreviewItems.map((i) => i.internalArticleNumber)));
                              } else {
                                setSelectedArticles(new Set());
                              }
                            }}
                          />
                          <span>
                            Selecteer producten ({selectedArticles.size} van {allPreviewItems.length} geselecteerd)
                          </span>
                        </label>
                      </div>

                      <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                        {allPreviewItems.slice(0, 250).map((item) => {
                          const isSelected = selectedArticles.has(item.internalArticleNumber);
                          return (
                            <div
                              key={item.internalArticleNumber}
                              style={{
                                padding: '0.75rem 1rem',
                                borderBottom: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.8rem',
                                backgroundColor: isSelected ? 'transparent' : 'rgba(0,0,0,0.02)',
                                opacity: isSelected ? 1 : 0.6,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const next = new Set(selectedArticles);
                                  if (next.has(item.internalArticleNumber)) next.delete(item.internalArticleNumber);
                                  else next.add(item.internalArticleNumber);
                                  setSelectedArticles(next);
                                }}
                                style={{ marginTop: '0.25rem' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>#{item.internalArticleNumber}</span>
                                  <span style={{ fontSize: '0.86rem', color: 'var(--text)' }}>{item.title}</span>
                                  {item.isNew && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#15803d' }}>
                                      NIEUW
                                    </span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.45rem' }}>
                                  {item.changes.map((ch) => {
                                    const def = ECOPOS_FIELDS.find((f) => f.key === ch.fieldKey);
                                    return (
                                      <span
                                        key={ch.fieldKey}
                                        style={{
                                          fontSize: '0.74rem',
                                          padding: '0.2rem 0.55rem',
                                          borderRadius: '6px',
                                          backgroundColor: 'var(--background)',
                                          border: '1px solid var(--border)',
                                        }}
                                      >
                                        <strong>{ch.fieldLabel}:</strong>{' '}
                                        {!item.isNew && (
                                          <>
                                            <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                                              {formatEcoPosValue(ch.oldValue, def?.type, ch.fieldKey)}
                                            </span>{' '}
                                            →{' '}
                                          </>
                                        )}
                                        <span style={{ fontWeight: 700, color: '#0284c7' }}>
                                          {formatEcoPosValue(ch.newValue, def?.type, ch.fieldKey)}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Detailed Single-Article Inspection when testing 1 article */}
                  {articleInspection && articleInspection.ok && (
                    <div
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: '12px',
                        backgroundColor: '#f8fafc',
                        padding: '1rem 1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                            🔎 Volledige Artikel-inspectie — Artikel #{articleInspection.articleNumber}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            Alle {ECOPOS_FIELDS.length} velden uit EcoPos vergeleken met PCM (inclusief gelijke en genegeerde velden).
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => setShowRawInspectionJson((v) => !v)}
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.3rem 0.7rem',
                            backgroundColor: 'white',
                            border: '1px solid var(--border)',
                            fontWeight: 600,
                          }}
                        >
                          {showRawInspectionJson ? '▲ Ruwe JSON verbergen' : '{ } Ruwe EcoPos JSON bekijken'}
                        </button>
                      </div>

                      {/* Highlight Box for Leverancier & Bontekst/Omschrijving */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: 'white', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                            Leverancier (MplusKassa → PCM)
                          </div>
                          <div style={{ marginTop: '0.25rem' }}>
                            Ruw: <strong>{articleInspection.rawSupplier || '—'}</strong>
                            {' → '}
                            Schoon: <strong style={{ color: '#0284c7' }}>{articleInspection.cleanedSupplier || '—'}</strong>
                          </div>
                        </div>
                        <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', backgroundColor: 'white', border: '1px solid var(--border)', fontSize: '0.8rem' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                            Titel (Bontekst leidend boven Omschrijving)
                          </div>
                          <div style={{ marginTop: '0.25rem' }}>
                            Bontekst: <strong>{articleInspection.rawBontekst || '— (leeg)'}</strong> • Omschrijving: <strong>{articleInspection.rawOmschrijving || '—'}</strong>
                            <div style={{ marginTop: '0.15rem', color: '#0284c7', fontWeight: 700 }}>
                              Gekozen titel: {articleInspection.effectiveTitle || '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {showRawInspectionJson && (
                        <pre
                          style={{
                            margin: 0,
                            padding: '0.85rem',
                            borderRadius: '8px',
                            backgroundColor: '#0f172a',
                            color: '#e2e8f0',
                            fontSize: '0.75rem',
                            maxHeight: '240px',
                            overflow: 'auto',
                          }}
                        >
                          {JSON.stringify(articleInspection.rawJson, null, 2)}
                        </pre>
                      )}

                      <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                              <th style={{ padding: '0.5rem 0.75rem' }}>Veld</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>Uit EcoPos (genormaliseerd)</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>Huidig in PCM</th>
                              <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {articleInspection.rows.map((row) => (
                              <tr key={row.fieldKey} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '0.45rem 0.75rem' }}>
                                  <div style={{ fontWeight: 600 }}>{row.fieldLabel}</div>
                                  {row.rawDetail && (
                                    <div style={{ fontSize: '0.7rem', color: '#0369a1', marginTop: '0.1rem' }}>
                                      ℹ️ {row.rawDetail}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: '#0284c7' }}>
                                  {row.ecoPosFormatted}
                                </td>
                                <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-muted)' }}>
                                  {row.pcmFormatted}
                                </td>
                                <td style={{ padding: '0.45rem 0.75rem' }}>
                                  {row.wouldApply ? (
                                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.7rem' }}>
                                      Wordt bijgewerkt
                                    </span>
                                  ) : row.isDifferent ? (
                                    <span style={{ padding: '0.15rem 0.45rem', borderRadius: '999px', backgroundColor: '#fef9c3', color: '#854d0e', fontWeight: 600, fontSize: '0.7rem' }}>
                                      Afwijkend ({row.configuredMode === 'ignore' ? 'niet ophalen' : 'alleen indien leeg'})
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Gelijk</span>
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
              )
            ) : step === 'done' && executeResult ? (
              <div
                style={{
                  padding: '2.5rem 2rem',
                  textAlign: 'center',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid #a7f3d0',
                  borderRadius: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <div style={{ fontSize: '2.4rem' }}>✅</div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#065f46' }}>
                  EcoPos Synchronisatie Voltooid!
                </h3>
                <p style={{ margin: 0, fontSize: '0.92rem', color: '#047857' }}>
                  <strong>{executeResult.updatedCount}</strong> product(en) bijgewerkt •{' '}
                  <strong>{executeResult.createdCount}</strong> nieuw aangemaakt •{' '}
                  <strong>{executeResult.totalFieldsChanged}</strong> veld(en) geactualiseerd.
                </p>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '1rem 1.75rem',
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--background)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              {step === 'preview' && !singleProductMode && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setStep('config')}
                  style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  ← Terug naar veldkiezer
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {step === 'done' ? 'Sluiten' : 'Annuleren'}
              </button>

              {step === 'config' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleRunPreview()}
                  disabled={loadingPreview}
                  style={{ fontWeight: 700, padding: '0.55rem 1.35rem' }}
                >
                  {loadingPreview
                    ? '⏳ Ophalen…'
                    : parsedCustomArticles.length > 0
                      ? `🔍 Preview (${parsedCustomArticles.length} artikel${parsedCustomArticles.length === 1 ? '' : 'en'})`
                      : '🔍 Wijzigingen Ophalen & Previewen'}
                </button>
              )}

              {step === 'preview' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExecuteSync}
                  disabled={
                    executing ||
                    (singleProductMode
                      ? selectedSingleFields.size === 0
                      : selectedArticles.size === 0)
                  }
                  style={{ fontWeight: 700, padding: '0.55rem 1.35rem' }}
                >
                  {executing
                    ? '⏳ Doorvoeren…'
                    : singleProductMode
                      ? `✅ ${selectedSingleFields.size} Veld(en) Overnemen`
                      : `✅ Synchronisatie Doorvoeren (${selectedArticles.size})`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

