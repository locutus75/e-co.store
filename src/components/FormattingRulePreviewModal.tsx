'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import {
  FormattingRule,
  ProductRulePreview,
  previewFormattingRuleAction,
  applyFormattingRuleAction,
  getFormattingRulesAction,
  stageFormattingRuleProposalsAction,
  getStagedFormattingProposalsAction,
  dismissStagedFormattingProposalsAction,
} from '@/app/actions/formattingRules';
import { LlmProvider } from '@/app/actions/llm';
import { useBackdropClose } from '@/hooks/useBackdropClose';

export interface AppliedFormattingChange {
  articleNumber: string;
  changes: { fieldKey: string; newValue: string }[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  articleNumbers: string[];
  initialRuleId?: string;
  initialSectionId?: string;
  initialMode?: 'configure' | 'review';
  canUseAi?: boolean;
  onComplete?: (appliedItems?: AppliedFormattingChange[]) => void;
}

function getSavedProvider(): LlmProvider {
  try {
    const raw = localStorage.getItem('ai_panel_prefs_v1');
    if (raw) {
      const p = JSON.parse(raw).provider;
      if (p) return p;
    }
  } catch {}
  return 'openai';
}

export default function FormattingRulePreviewModal({
  isOpen,
  onClose,
  articleNumbers,
  initialRuleId,
  initialSectionId,
  initialMode = 'configure',
  canUseAi = true,
  onComplete,
}: Props) {
  const [rules, setRules] = useState<FormattingRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>(initialRuleId || '');
  const [customNote, setCustomNote] = useState<string>('');
  const [provider, setProvider] = useState<LlmProvider>('openai');

  const [phase, setPhase] = useState<'configure' | 'loading' | 'preview' | 'applying' | 'staging' | 'done' | 'staged_done'>('configure');
  const [loadingMsg, setLoadingMsg] = useState('Bezig met genereren van previews...');
  const [previews, setPreviews] = useState<ProductRulePreview[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<ProductRulePreview[]>([]);
  const [stagedTotalCount, setStagedTotalCount] = useState<number>(0);
  const [isReviewingStaged, setIsReviewingStaged] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const backdropProps = useBackdropClose(onClose, phase === 'loading' || phase === 'applying' || phase === 'staging');

  // Selected changes: set of `${articleNumber}::${fieldKey}`
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Edited values: map of `${articleNumber}::${fieldKey}` -> edited text
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  // Editing state: which field is currently in inline-edit mode
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [onlyChangedFilter, setOnlyChangedFilter] = useState(true);
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [appliedCount, setAppliedCount] = useState(0);
  const [stagedCount, setStagedCount] = useState({ products: 0, fields: 0 });

  const [, startTransition] = useTransition();

  const populatePreviewState = (list: ProductRulePreview[], reviewingStaged: boolean) => {
    setPreviews(list);
    setIsReviewingStaged(reviewingStaged);
    const sel = new Set<string>();
    const edits: Record<string, string> = {};
    const exp = new Set<string>();

    list.forEach((p) => {
      exp.add(p.articleNumber);
      p.fields.forEach((f) => {
        const k = `${p.articleNumber}::${f.fieldKey}`;
        edits[k] = f.suggestedValue;
        if (f.hasChanged || reviewingStaged) {
          sel.add(k);
        }
      });
    });

    setSelectedKeys(sel);
    setEditedValues(edits);
    setExpandedArticles(exp);
    setOnlyChangedFilter(!reviewingStaged);
    setPhase('preview');
  };

  // Load rules and any staged proposals on open
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setEditingKey(null);
    setProvider(getSavedProvider());

    const shouldStartInReview = !canUseAi || initialMode === 'review';
    if (shouldStartInReview) {
      setPhase('loading');
      setLoadingMsg('Klaargezette formateringsvoorstellen ophalen...');
    } else {
      setPhase('configure');
    }

    getFormattingRulesAction().then((loadedRules) => {
      setRules(loadedRules);

      if (initialRuleId && loadedRules.some(r => r.id === initialRuleId)) {
        setSelectedRuleId(initialRuleId);
      } else if (initialSectionId) {
        const matching = loadedRules.find(r => r.sectionId === initialSectionId && r.enabled);
        if (matching) setSelectedRuleId(matching.id);
        else if (loadedRules.length > 0) setSelectedRuleId(loadedRules[0].id);
      } else if (loadedRules.length > 0 && !selectedRuleId) {
        const firstActive = loadedRules.find(r => r.enabled) || loadedRules[0];
        setSelectedRuleId(firstActive.id);
      }
    });

    getStagedFormattingProposalsAction({ articleNumbers }).then((res) => {
      if (res.success) {
        setStagedPreviews(res.previews);
        setStagedTotalCount(res.totalProposalCount);
        if (shouldStartInReview) {
          populatePreviewState(res.previews, true);
        }
      } else if (shouldStartInReview) {
        setError(res.error || 'Kon klaargezette voorstellen niet laden.');
        populatePreviewState([], true);
      }
    });
  }, [isOpen, initialRuleId, initialSectionId, initialMode, canUseAi]);

  // Selected rule object
  const currentRule = useMemo(() => {
    return rules.find(r => r.id === selectedRuleId) || null;
  }, [rules, selectedRuleId]);

  // Start generating preview
  const handleGeneratePreview = async () => {
    if (!selectedRuleId) {
      setError('Selecteer eerst een formateringsregel.');
      return;
    }

    setError('');
    setPhase('loading');
    setLoadingMsg(`Bezig met genereren van geformatteerde teksten voor ${articleNumbers.length} product(en)...`);

    try {
      const res = await previewFormattingRuleAction({
        ruleId: selectedRuleId,
        articleNumbers,
        provider,
        customInstruction: customNote.trim() || undefined,
      });

      if (!res.success || !res.previews) {
        setError(res.error || 'Er is een fout opgetreden bij het genereren.');
        setPhase('configure');
        return;
      }

      populatePreviewState(res.previews, false);
    } catch (err: any) {
      setError(err?.message || 'Verbindingsfout tijdens preview generatie.');
      setPhase('configure');
    }
  };

  // Toggle selection of a single field
  const toggleKey = (k: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  // Toggle all fields for a product
  const toggleProductAll = (p: ProductRulePreview, select: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      p.fields.forEach((f) => {
        const k = `${p.articleNumber}::${f.fieldKey}`;
        if (select) next.add(k);
        else next.delete(k);
      });
      return next;
    });
  };

  // Master toggle: select/deselect all changed fields
  const toggleAll = (select: boolean) => {
    if (select) {
      const all = new Set<string>();
      previews.forEach((p) => {
        p.fields.forEach((f) => {
          if (!onlyChangedFilter || f.hasChanged) {
            all.add(`${p.articleNumber}::${f.fieldKey}`);
          }
        });
      });
      setSelectedKeys(all);
    } else {
      setSelectedKeys(new Set());
    }
  };

  // Toggle card expansion
  const toggleExpand = (artNum: string) => {
    setExpandedArticles((prev) => {
      const next = new Set(prev);
      if (next.has(artNum)) next.delete(artNum);
      else next.add(artNum);
      return next;
    });
  };

  // Build selected items payload from current preview state
  const buildSelectedItemsPayload = () => {
    const items: {
      articleNumber: string;
      changes: {
        fieldKey: string;
        fieldLabel: string;
        oldValue: string;
        newValue: string;
        ruleId?: string;
        ruleName?: string;
      }[];
    }[] = [];

    previews.forEach((p) => {
      const productChanges: {
        fieldKey: string;
        fieldLabel: string;
        oldValue: string;
        newValue: string;
        ruleId?: string;
        ruleName?: string;
      }[] = [];

      p.fields.forEach((f) => {
        const k = `${p.articleNumber}::${f.fieldKey}`;
        if (selectedKeys.has(k)) {
          const finalVal = editedValues[k] !== undefined ? editedValues[k] : f.suggestedValue;
          productChanges.push({
            fieldKey: f.fieldKey,
            fieldLabel: f.fieldLabel,
            oldValue: f.originalValue,
            newValue: finalVal,
            ruleId: f.ruleId || currentRule?.id,
            ruleName: f.ruleName || currentRule?.name || 'Formateringsregel',
          });
        }
      });

      if (productChanges.length > 0) {
        items.push({
          articleNumber: p.articleNumber,
          changes: productChanges,
        });
      }
    });

    return items;
  };

  // Stage selected changes for Editor review ("Klaarzetten voor review")
  const handleStageForReview = () => {
    if (selectedKeys.size === 0) {
      setError('Selecteer minimaal één voorstel om klaar te zetten voor review.');
      return;
    }

    setPhase('staging');
    setError('');

    startTransition(async () => {
      const itemsToStage = buildSelectedItemsPayload();
      const res = await stageFormattingRuleProposalsAction({
        items: itemsToStage,
        ruleId: currentRule?.id,
        ruleName: currentRule?.name || 'Formateringsregel',
        sectionId: currentRule?.sectionId || initialSectionId,
      });

      if (res.success) {
        setStagedCount({ products: res.stagedProductCount, fields: res.stagedFieldCount });
        setPhase('staged_done');
        onComplete?.();
      } else {
        setError(res.error || 'Fout bij klaarzetten voor review.');
        setPhase('preview');
      }
    });
  };

  // Dismiss selected staged proposals ("Voorstellen afwijzen / wissen")
  const handleDismissStaged = () => {
    if (selectedKeys.size === 0) {
      setError('Selecteer minimaal één voorstel om te wissen.');
      return;
    }

    setPhase('applying');
    setError('');

    startTransition(async () => {
      const itemsToDismiss: { articleNumber: string; fieldKeys: string[] }[] = [];
      previews.forEach((p) => {
        const fks = p.fields
          .filter(f => selectedKeys.has(`${p.articleNumber}::${f.fieldKey}`))
          .map(f => f.fieldKey);
        if (fks.length > 0) {
          itemsToDismiss.push({ articleNumber: p.articleNumber, fieldKeys: fks });
        }
      });

      const res = await dismissStagedFormattingProposalsAction({ items: itemsToDismiss });
      if (res.success) {
        const refreshed = await getStagedFormattingProposalsAction({ articleNumbers });
        setStagedPreviews(refreshed.previews);
        setStagedTotalCount(refreshed.totalProposalCount);
        if (refreshed.previews.length === 0) {
          onComplete?.();
          onClose();
        } else {
          populatePreviewState(refreshed.previews, true);
        }
      } else {
        setError(res.error || 'Fout bij wissen van voorstellen.');
        setPhase('preview');
      }
    });
  };

  // Apply approved changes
  const handleApplyChanges = () => {
    if (selectedKeys.size === 0) {
      setError('Selecteer minimaal één wijziging om door te voeren.');
      return;
    }

    setPhase('applying');
    setError('');

    startTransition(async () => {
      const itemsToApply = buildSelectedItemsPayload();

      const res = await applyFormattingRuleAction({
        items: itemsToApply,
        ruleName: currentRule?.name || itemsToApply[0]?.changes[0]?.ruleName || 'Formateringsregel',
      });

      if (res.success) {
        setAppliedCount(res.updatedCount);
        setPhase('done');
        onComplete?.(itemsToApply.map(i => ({
          articleNumber: i.articleNumber,
          changes: i.changes.map(c => ({ fieldKey: c.fieldKey, newValue: c.newValue })),
        })));
      } else {
        setError(res.error || 'Fout bij opslaan van de wijzigingen.');
        setPhase('preview');
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(5px)',
        padding: '1rem',
      }}
      onMouseDown={backdropProps.onMouseDown}
      onClick={backdropProps.onClick}
    >
      <div
        className="glass"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius)',
          width: '1040px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                color: 'white',
              }}
            >
              ✨
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                  Tekst- en Formateringsregels
                </h2>
                {phase === 'preview' && isReviewingStaged && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.18rem 0.55rem',
                      borderRadius: '999px',
                      backgroundColor: '#f3e8ff',
                      color: '#6d28d9',
                      border: '1px solid #d8b4fe',
                    }}
                  >
                    📋 Klaargezette voorstellen beoordelen
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                {isReviewingStaged
                  ? `Beoordeel, wijzig desnoods en accordeer klaargezette tekstvoorstellen (${previews.length} ${previews.length === 1 ? 'product' : 'producten'})`
                  : `Uniforme teksten en vaste standaarden voor ${articleNumbers.length} ${articleNumbers.length === 1 ? 'product' : 'producten'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'loading' || phase === 'applying' || phase === 'staging'}
            style={{
              background: 'none',
              border: 'none',
              cursor: phase === 'loading' || phase === 'applying' || phase === 'staging' ? 'not-allowed' : 'pointer',
              fontSize: '1.2rem',
              color: 'var(--text-muted)',
              padding: '0.25rem 0.5rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body based on phase */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid var(--error)',
                borderRadius: 'var(--radius)',
                color: 'var(--error)',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* PHASE 1: Configure Rule */}
          {phase === 'configure' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {stagedPreviews.length > 0 && (
                <div
                  style={{
                    padding: '0.9rem 1.15rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: '#f5f3ff',
                    border: '1.5px solid #c4b5fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>📋</span>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#4c1d95' }}>
                        Er staan al {stagedTotalCount} klaargezette voorstellen klaar voor review ({stagedPreviews.length} {stagedPreviews.length === 1 ? 'product' : 'producten'})
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#5b21b6' }}>
                        Je kunt deze klaargezette voorstellen direct openen om te beoordelen, aan te passen of door te voeren.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => populatePreviewState(stagedPreviews, true)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      backgroundColor: '#7c3aed',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    👁️ Klaargezette voorstellen bekijken ({stagedTotalCount})
                  </button>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
                  Kies een formateringsregel
                </label>
                <select
                  className="input"
                  value={selectedRuleId}
                  onChange={(e) => setSelectedRuleId(e.target.value)}
                  style={{ fontWeight: 600, fontSize: '0.95rem', borderColor: '#7c3aed' }}
                >
                  <option value="" disabled>-- Selecteer een regel --</option>
                  {rules.map((r) => (
                    <option key={r.id} value={r.id} disabled={!r.enabled}>
                      {r.name} {!r.enabled ? '(Uitgeschakeld)' : ''} [{r.sectionTitle || 'Algemeen'}]
                    </option>
                  ))}
                </select>
              </div>

              {currentRule && (
                <div
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(124, 58, 237, 0.1)',
                          color: '#7c3aed',
                        }}
                      >
                        📂 {currentRule.sectionTitle || 'Algemeen'}
                      </span>
                      {currentRule.toneOfVoice && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(51, 133, 140, 0.1)',
                            color: 'var(--color-teal)',
                          }}
                        >
                          🎭 Toon: {currentRule.toneOfVoice}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Doelvelden: <strong>{currentRule.targetFields.join(', ')}</strong>
                    </span>
                  </div>

                  {currentRule.description && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text)', margin: 0 }}>
                      {currentRule.description}
                    </p>
                  )}

                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Actieve Richtlijnen & Formatering:
                    </span>
                    <pre
                      style={{
                        marginTop: '0.35rem',
                        padding: '0.75rem',
                        backgroundColor: 'var(--surface)',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        fontSize: '0.8rem',
                        color: 'var(--text)',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                        maxHeight: '160px',
                        overflowY: 'auto',
                      }}
                    >
                      {currentRule.instruction}
                    </pre>
                  </div>
                </div>
              )}

              {/* Optional custom tweak */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                  Aanvullende instructie voor deze batch (optioneel)
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Bijv. Leg extra nadruk op het biologische materiaal of beperk tot 30 woorden..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* Products summary */}
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>ℹ️</span>
                <span>
                  Er wordt een <strong>preview</strong> berekend voor <strong>{articleNumbers.length}</strong> product(en). U kunt daarna elke wijziging per veld bekijken, aanpassen, <strong>klaarzetten voor review door een Editor</strong> of direct doorvoeren.
                </span>
              </div>
            </div>
          )}

          {/* PHASE 2: Loading / Generating / Applying / Staging */}
          {(phase === 'loading' || phase === 'applying' || phase === 'staging') && (
            <div style={{ padding: '3.5rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  border: '4px solid #7c3aed',
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                {phase === 'applying'
                  ? 'Wijzigingen opslaan...'
                  : phase === 'staging'
                    ? 'Voorstellen klaarzetten voor review...'
                    : loadingMsg}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '400px', margin: 0 }}>
                {phase === 'applying'
                  ? 'De gevalideerde teksten worden opgeslagen in de database en vastgelegd in de veldhistorie.'
                  : phase === 'staging'
                    ? 'De geselecteerde formateringsvoorstellen worden klaargezet zodat een Editor ze kan beoordelen, aanpassen en accorderen.'
                    : 'AI past de vaste standaarden en formateringsregels toe op elk product...'}
              </p>
            </div>
          )}

          {/* PHASE 3: Interactive Preview & Validation */}
          {phase === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {previews.length === 0 ? (
                <div
                  style={{
                    padding: '3rem 1.5rem',
                    textAlign: 'center',
                    backgroundColor: 'var(--surface-hover)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ fontSize: '2rem' }}>📋</div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    Geen klaargezette formateringsvoorstellen gevonden
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '460px', margin: 0 }}>
                    Er zijn voor de geselecteerde product(en) momenteel geen klaargezette tekst- of formateringsvoorstellen die wachten op beoordeling.
                  </p>
                  {canUseAi && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setPhase('configure')}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 1.1rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        backgroundColor: '#7c3aed',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                      }}
                    >
                      ✨ Nieuwe formateringsregel toepassen
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      backgroundColor: 'var(--surface-hover)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={onlyChangedFilter}
                          onChange={(e) => setOnlyChangedFilter(e.target.checked)}
                        />
                        <span>Alleen gewijzigde velden tonen</span>
                      </label>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>|</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                        <strong>{selectedKeys.size}</strong> velden geselecteerd
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => toggleAll(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-teal)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Alles selecteren
                      </button>
                      <span style={{ color: 'var(--border)' }}>•</span>
                      <button
                        type="button"
                        onClick={() => toggleAll(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Alles deselecteren
                      </button>
                    </div>
                  </div>

                  {/* Product preview cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {previews.map((prod) => {
                      const isExpanded = expandedArticles.has(prod.articleNumber);
                      const displayFields = prod.fields.filter(f => !onlyChangedFilter || f.hasChanged);
                      const changedCount = prod.fields.filter(f => f.hasChanged).length;
                      const selectedForThis = prod.fields.filter(f => selectedKeys.has(`${prod.articleNumber}::${f.fieldKey}`)).length;

                      return (
                        <div
                          key={prod.articleNumber}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            backgroundColor: 'var(--surface)',
                            overflow: 'hidden',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                          }}
                        >
                          {/* Product header bar */}
                          <div
                            style={{
                              padding: '0.75rem 1rem',
                              backgroundColor: 'var(--surface-hover)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              cursor: 'pointer',
                              borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
                            }}
                            onClick={() => toggleExpand(prod.articleNumber)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                              <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.9rem' }}>
                                #{prod.articleNumber}
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '350px' }}>
                                {prod.title}
                              </span>
                              {prod.brand && (
                                <span style={{ fontSize: '0.72rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', padding: '0.15rem 0.45rem', borderRadius: '4px', color: 'var(--text-muted)' }}>
                                  Merk: {prod.brand}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                              <span
                                style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: changedCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface)',
                                  color: changedCount > 0 ? '#059669' : 'var(--text-muted)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                {changedCount} {changedCount === 1 ? 'veld gewijzigd' : 'velden gewijzigd'} ({selectedForThis} gekozen)
                              </span>

                              <button
                                type="button"
                                onClick={() => toggleProductAll(prod, selectedForThis < prod.fields.length)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-teal)',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                }}
                              >
                                {selectedForThis < prod.fields.length ? 'Alles van product selecteren' : 'Product deselecteren'}
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleExpand(prod.articleNumber)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  fontSize: '0.9rem',
                                  cursor: 'pointer',
                                  padding: '0 0.25rem',
                                }}
                              >
                                {isExpanded ? '▲' : '▼'}
                              </button>
                            </div>
                          </div>

                          {/* Product field comparisons */}
                          {isExpanded && (
                            <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {displayFields.length === 0 ? (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                  Geen gewijzigde velden voor dit product volgens de regel.
                                </div>
                              ) : (
                                displayFields.map((field) => {
                                  const k = `${prod.articleNumber}::${field.fieldKey}`;
                                  const isChecked = selectedKeys.has(k);
                                  const currentProposedVal = editedValues[k] !== undefined ? editedValues[k] : field.suggestedValue;
                                  const isEditing = editingKey === k;

                                  return (
                                    <div
                                      key={field.fieldKey}
                                      style={{
                                        border: isChecked ? '1px solid rgba(124, 58, 237, 0.3)' : '1px solid var(--border)',
                                        borderRadius: 'var(--radius)',
                                        backgroundColor: isChecked ? 'rgba(124, 58, 237, 0.02)' : 'var(--surface)',
                                        padding: '0.75rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      {/* Field top bar */}
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', flexWrap: 'wrap' }}>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleKey(k)}
                                          />
                                          <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                                            {field.fieldLabel}
                                          </strong>
                                          <code style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({field.fieldKey})</code>
                                          {field.hasChanged ? (
                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '3px', backgroundColor: '#dcfce7', color: '#15803d' }}>
                                              GEWIJZIGD
                                            </span>
                                          ) : (
                                            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: '3px', backgroundColor: '#f1f5f9', color: '#64748b' }}>
                                              ONGEWIJZIGD
                                            </span>
                                          )}
                                          {field.ruleName && (
                                            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.1rem 0.45rem', borderRadius: '4px', backgroundColor: '#f3e8ff', color: '#6d28d9' }}>
                                              ✨ {field.ruleName}
                                            </span>
                                          )}
                                        </label>

                                        <button
                                          type="button"
                                          onClick={() => setEditingKey(isEditing ? null : k)}
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            color: isEditing ? '#7c3aed' : 'var(--text-muted)',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textDecoration: 'underline',
                                          }}
                                        >
                                          {isEditing ? '✓ Sluit bewerking' : '✏️ Zelf aanpassen'}
                                        </button>
                                      </div>

                                      {/* Diff view */}
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        {/* Original */}
                                        <div
                                          style={{
                                            padding: '0.6rem 0.75rem',
                                            backgroundColor: '#fff1f2',
                                            borderRadius: 'var(--radius)',
                                            border: '1px solid #fecdd3',
                                            fontSize: '0.82rem',
                                            color: '#881337',
                                          }}
                                        >
                                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                                            Huidige tekst:
                                          </div>
                                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '140px', overflowY: 'auto' }}>
                                            {field.originalValue || <em style={{ opacity: 0.5 }}>[Leeg]</em>}
                                          </div>
                                        </div>

                                        {/* Suggested / Formatted */}
                                        <div
                                          style={{
                                            padding: '0.6rem 0.75rem',
                                            backgroundColor: '#f0fdf4',
                                            borderRadius: 'var(--radius)',
                                            border: '1px solid #bbf7d0',
                                            fontSize: '0.82rem',
                                            color: '#14532d',
                                          }}
                                        >
                                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Nieuwe formatering (Regel):</span>
                                            {editedValues[k] !== field.suggestedValue && (
                                              <span style={{ color: '#7c3aed', fontWeight: 700 }}>Handmatig gewijzigd</span>
                                            )}
                                          </div>

                                          {isEditing ? (
                                            <textarea
                                              className="input"
                                              value={currentProposedVal}
                                              onChange={(e) => {
                                                const newVal = e.target.value;
                                                setEditedValues(prev => ({ ...prev, [k]: newVal }));
                                                setSelectedKeys(prev => {
                                                  if (prev.has(k)) return prev;
                                                  const next = new Set(prev);
                                                  next.add(k);
                                                  return next;
                                                });
                                              }}
                                              rows={4}
                                              style={{ fontSize: '0.82rem', width: '100%', fontFamily: 'inherit' }}
                                              autoFocus
                                            />
                                          ) : (
                                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '140px', overflowY: 'auto', fontWeight: 500 }}>
                                              {currentProposedVal || <em style={{ opacity: 0.5 }}>[Leeg]</em>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PHASE 4A: Done (Applied) */}
          {phase === 'done' && (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                }}
              >
                ✓
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Formateringsregels succesvol doorgevoerd!
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '450px', margin: 0 }}>
                De teksten van <strong>{appliedCount}</strong> product(en) zijn geüniformeerd en opgeslagen. Eerdere waarden zijn veilig bewaard in de veldhistorie.
              </p>
            </div>
          )}

          {/* PHASE 4B: Staged Done ("Klaargezet voor review") */}
          {phase === 'staged_done' && (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#f3e8ff',
                  color: '#6d28d9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.8rem',
                }}
              >
                📋
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Klaargezet voor review door Editor!
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '480px', margin: 0 }}>
                Er zijn <strong>{stagedCount.fields}</strong> tekstvoorstel(len) klaargezet bij <strong>{stagedCount.products}</strong> product(en). Een gebruiker met de rol <strong>Editor</strong> kan deze voorstellen nu bekijken, eventueel aanpassen via <em>Zelf aanpassen</em> en accorderen.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface-hover)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {phase === 'preview' && canUseAi && (
              <button
                type="button"
                className="btn"
                onClick={() => setPhase('configure')}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                ← Andere regel kiezen
              </button>
            )}
            {phase === 'preview' && isReviewingStaged && previews.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={handleDismissStaged}
                disabled={selectedKeys.size === 0}
                title="Verwijder de geselecteerde klaargezette voorstellen zonder de producttekst te wijzigen"
                style={{
                  padding: '0.5rem 0.9rem',
                  fontSize: '0.82rem',
                  backgroundColor: '#fff1f2',
                  border: '1px solid #fecdd3',
                  color: '#be123c',
                  fontWeight: 600,
                  cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedKeys.size === 0 ? 0.5 : 1,
                }}
              >
                🗑️ Voorstellen afwijzen ({selectedKeys.size})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {phase !== 'done' && phase !== 'staged_done' && (
              <button
                type="button"
                className="btn"
                onClick={onClose}
                disabled={phase === 'loading' || phase === 'applying' || phase === 'staging'}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.85rem',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: phase === 'loading' || phase === 'applying' || phase === 'staging' ? 'not-allowed' : 'pointer',
                }}
              >
                Annuleren
              </button>
            )}

            {phase === 'configure' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGeneratePreview}
                disabled={!selectedRuleId}
                style={{
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  cursor: !selectedRuleId ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                ✨ Genereer Preview ({articleNumbers.length})
              </button>
            )}

            {phase === 'preview' && previews.length > 0 && canUseAi && (
              <button
                type="button"
                className="btn"
                onClick={handleStageForReview}
                disabled={selectedKeys.size === 0}
                title="Zet de geselecteerde voorstellen klaar zodat een Editor ze kan beoordelen, eventueel wijzigen en accorderen"
                style={{
                  padding: '0.5rem 1.15rem',
                  fontSize: '0.85rem',
                  backgroundColor: 'white',
                  border: '1.5px solid #7c3aed',
                  color: '#6d28d9',
                  cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedKeys.size === 0 ? 0.5 : 1,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                📋 {isReviewingStaged ? 'Voorstellen bijwerken' : 'Klaarzetten voor review'} ({selectedKeys.size})
              </button>
            )}

            {phase === 'preview' && previews.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={handleApplyChanges}
                disabled={selectedKeys.size === 0}
                style={{
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.85rem',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  cursor: selectedKeys.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedKeys.size === 0 ? 0.5 : 1,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                ✓ Wijzigingen doorvoeren ({selectedKeys.size})
              </button>
            )}

            {(phase === 'done' || phase === 'staged_done') && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
                style={{
                  padding: '0.5rem 1.5rem',
                  fontSize: '0.85rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  fontWeight: 600,
                }}
              >
                Sluiten
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
