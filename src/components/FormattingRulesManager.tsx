'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  FormattingRule,
  getFormattingRulesAction,
  saveFormattingRuleAction,
  deleteFormattingRuleAction,
  toggleFormattingRuleAction,
} from '@/app/actions/formattingRules';
import { getFormLayoutAction, FormSection } from '@/app/actions/formLayouts';
import ConfirmationModal from './ConfirmationModal';
import FormattingRulePreviewModal from './FormattingRulePreviewModal';
import { useBackdropClose } from '@/hooks/useBackdropClose';

const AVAILABLE_TEXT_FIELDS = [
  { key: 'title', label: 'Titel / Omschrijving', section: 'sect-basis' },
  { key: 'shortDescription', label: 'Korte Omschrijving', section: 'sect-basis' },
  { key: 'longDescription', label: 'Lange Omschrijving', section: 'sect-basis' },
  { key: 'color', label: 'Kleur', section: 'sect-fysiek' },
  { key: 'size', label: 'Maat', section: 'sect-fysiek' },
  { key: 'material', label: 'Materiaal', section: 'sect-fysiek' },
  { key: 'mainMaterial', label: 'Hoofdmateriaal', section: 'sect-fysiek' },
  { key: 'ingredients', label: 'Ingrediënten', section: 'sect-fysiek' },
  { key: 'allergens', label: 'Allergenen', section: 'sect-fysiek' },
  { key: 'internalRemarks', label: 'Interne Communicatie', section: 'sect-basis' },
  { key: 'critCircular', label: 'Hergebruik / Circulair', section: 'sect-bewerk' },
];

export default function FormattingRulesManager() {
  const [rules, setRules] = useState<FormattingRule[]>([]);
  const [sections, setSections] = useState<FormSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal create/edit state
  const [editingRule, setEditingRule] = useState<Partial<FormattingRule> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Delete confirm state
  const [ruleToDelete, setRuleToDelete] = useState<FormattingRule | null>(null);

  // Quick test preview state
  const [testRuleId, setTestRuleId] = useState<string | null>(null);
  const [testArticleNumber, setTestArticleNumber] = useState<string>('16815');
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  const [isPending, startTransition] = useTransition();
  const editModalBackdrop = useBackdropClose(() => setIsModalOpen(false), isPending);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [loadedRules, loadedLayout] = await Promise.all([
        getFormattingRulesAction().catch(err => {
          console.error('getFormattingRulesAction error:', err);
          return [];
        }),
        getFormLayoutAction().catch(err => {
          console.error('getFormLayoutAction error:', err);
          return [];
        }),
      ]);
      setRules(Array.isArray(loadedRules) && loadedRules.length > 0 ? loadedRules : []);
      setSections(Array.isArray(loadedLayout) ? loadedLayout : []);
    } catch (e: any) {
      console.error('Failed to load rules in FormattingRulesManager:', e);
      setErrorMsg(e?.message || 'Fout bij laden van formateringsregels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingRule({
      name: '',
      description: '',
      sectionId: 'sect-basis',
      sectionTitle: 'Webshop Content (Basis)',
      targetFields: ['title', 'shortDescription'],
      instruction: '',
      toneOfVoice: 'Warm, deskundig en uitnodigend',
      enabled: true,
    });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (rule: FormattingRule) => {
    setEditingRule({ ...rule });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const handleDuplicate = (rule: FormattingRule) => {
    setEditingRule({
      ...rule,
      id: undefined,
      name: `${rule.name} (Kopie)`,
      enabled: true,
    });
    setErrorMsg('');
    setSuccessMsg('');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    if (!editingRule.name?.trim()) {
      alert('Vul a.u.b. een regelnaam in.');
      return;
    }
    if (!editingRule.instruction?.trim()) {
      alert('Vul a.u.b. de instructies / formateringsstandaarden in.');
      return;
    }
    if (!editingRule.targetFields || editingRule.targetFields.length === 0) {
      alert('Selecteer minimaal één doelveld.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveFormattingRuleAction(editingRule);
        if (res.success) {
          setIsModalOpen(false);
          setEditingRule(null);
          setSuccessMsg('Formateringsregel succesvol opgeslagen.');
          loadData();
          setTimeout(() => setSuccessMsg(''), 4000);
        } else {
          alert(res.error || 'Fout bij opslaan.');
        }
      } catch (err: any) {
        console.error('Error saving formatting rule:', err);
        alert(err?.message || 'Onverwachte fout bij opslaan van de formateringsregel.');
      }
    });
  };

  const handleToggle = (rule: FormattingRule) => {
    startTransition(async () => {
      try {
        const nextState = !rule.enabled;
        const res = await toggleFormattingRuleAction(rule.id, nextState);
        if (res.success) {
          setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: nextState } : r));
        } else {
          alert(res.error || 'Fout bij wijzigen status.');
        }
      } catch (err: any) {
        console.error('Error toggling formatting rule:', err);
        alert(err?.message || 'Onverwachte fout bij wijzigen status.');
      }
    });
  };

  const confirmDelete = () => {
    if (!ruleToDelete) return;
    startTransition(async () => {
      try {
        const res = await deleteFormattingRuleAction(ruleToDelete.id);
        if (res.success) {
          setRuleToDelete(null);
          setSuccessMsg('Formateringsregel verwijderd.');
          loadData();
          setTimeout(() => setSuccessMsg(''), 4000);
        } else {
          alert(res.error || 'Fout bij verwijderen.');
        }
      } catch (err: any) {
        console.error('Error deleting formatting rule:', err);
        alert(err?.message || 'Onverwachte fout bij verwijderen.');
      }
    });
  };

  const toggleFieldSelection = (fieldKey: string) => {
    if (!editingRule) return;
    const current = new Set(editingRule.targetFields || []);
    if (current.has(fieldKey)) current.delete(fieldKey);
    else current.add(fieldKey);
    setEditingRule({ ...editingRule, targetFields: Array.from(current) });
  };

  return (
    <div id="formatting-rules" className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem' }}>✨</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Tekst- &amp; Formateringsregels
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.3rem', margin: 0 }}>
            Stel uniforme standaarden en schrijfregels in per sectie. Selecteerbaar bij losse of meerdere producten met een live diff preview.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={openCreateModal}
          style={{
            padding: '0.55rem 1.2rem',
            fontSize: '0.9rem',
            backgroundColor: '#7c3aed',
            color: 'white',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            borderRadius: 'var(--radius)',
          }}
        >
          ➕ Nieuwe Regel Toevoegen
        </button>
      </div>

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#065f46', border: '1px solid #10b981', borderRadius: 'var(--radius)', marginBottom: '1.25rem', fontSize: '0.88rem', fontWeight: 600 }}>
          ✓ {successMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: '1px solid var(--error)', borderRadius: 'var(--radius)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Regels laden...
        </div>
      ) : rules.length === 0 ? (
        <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius)', border: '1px dashed var(--border)' }}>
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>Nog geen formateringsregels ingesteld.</p>
          <p style={{ fontSize: '0.85rem' }}>Klik op &quot;Nieuwe Regel Toevoegen&quot; om een standaard aan te maken voor een sectie.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: '1.25rem' }}>
          {rules.map((rule) => (
            <div
              key={rule.id}
              style={{
                backgroundColor: 'var(--surface)',
                border: rule.enabled ? '1px solid var(--border)' : '1px solid rgba(0,0,0,0.06)',
                borderRadius: 'var(--radius)',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                opacity: rule.enabled ? 1 : 0.65,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                {/* Card Top */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                      {rule.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(124, 58, 237, 0.1)',
                          color: '#7c3aed',
                        }}
                      >
                        📂 {rule.sectionTitle || 'Algemeen'}
                      </span>
                      {rule.toneOfVoice && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(51, 133, 140, 0.1)',
                            color: 'var(--color-teal)',
                          }}
                        >
                          🎭 {rule.toneOfVoice}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle active switch */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: rule.enabled ? '#059669' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                    title={rule.enabled ? 'Regel is actief' : 'Regel is uitgeschakeld'}
                  >
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => handleToggle(rule)}
                    />
                    <span>{rule.enabled ? 'Actief' : 'Inactief'}</span>
                  </label>
                </div>

                {/* Description */}
                {rule.description && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.4rem 0 0.75rem 0', lineHeight: 1.4 }}>
                    {rule.description}
                  </p>
                )}

                {/* Target fields chips */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                    Doelvelden:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {rule.targetFields.map(f => {
                      const found = AVAILABLE_TEXT_FIELDS.find(x => x.key === f);
                      return (
                        <span
                          key={f}
                          style={{
                            fontSize: '0.75rem',
                            backgroundColor: 'var(--surface-hover)',
                            border: '1px solid var(--border)',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            color: 'var(--text)',
                            fontWeight: 500,
                          }}
                        >
                          {found ? found.label : f}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Instruction preview */}
                <div style={{ backgroundColor: 'var(--surface-hover)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', maxHeight: '90px', overflowY: 'auto' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                    Richtlijn:
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                    {rule.instruction}
                  </p>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTestRuleId(rule.id);
                      setIsTestModalOpen(true);
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: '#7c3aed',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                    title="Test deze regel met live preview"
                  >
                    🧪 Testen
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicate(rule)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                    title="Dupliceer regel"
                  >
                    Dupliceren
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => openEditModal(rule)}
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
                    Bewerken
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleToDelete(rule)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--error)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT RULE MODAL */}
      {isModalOpen && editingRule && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)',
            padding: '1rem',
          }}
          onMouseDown={editModalBackdrop.onMouseDown}
          onClick={editModalBackdrop.onClick}
        >
          <div
            className="glass"
            style={{
              backgroundColor: 'var(--surface)',
              borderRadius: 'var(--radius)',
              width: '780px',
              maxWidth: '96vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                {editingRule.id ? 'Formateringsregel Bewerken' : 'Nieuwe Formateringsregel Aanmaken'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Rule Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                    Regelnaam *
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Bijv. Uniforme Titelopbouw & Korte Omschrijving"
                    value={editingRule.name || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                    required
                    style={{ fontWeight: 600 }}
                  />
                </div>

                {/* Section selection & Tone */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                      Doelsectie *
                    </label>
                    <select
                      className="input"
                      value={editingRule.sectionId || 'all'}
                      onChange={(e) => {
                        const secId = e.target.value;
                        const found = sections.find(s => s.id === secId);
                        setEditingRule({
                          ...editingRule,
                          sectionId: secId,
                          sectionTitle: found ? found.title : 'Alle secties',
                        });
                      }}
                      style={{ fontWeight: 600 }}
                    >
                      <option value="all">🌐 Algemeen (Alle secties)</option>
                      {sections.map(sec => (
                        <option key={sec.id} value={sec.id}>
                          📂 {sec.title}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                      Koppelt deze regel aan een specifieke formuliersectie.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                      Toon van de tekst (Tone of Voice)
                    </label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Bijv. Warm, deskundig en uitnodigend"
                      value={editingRule.toneOfVoice || ''}
                      onChange={(e) => setEditingRule({ ...editingRule, toneOfVoice: e.target.value })}
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                    Korte omschrijving / doel van de regel
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Waarom bestaat deze regel en wat voor resultaat levert het op?"
                    value={editingRule.description || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  />
                </div>

                {/* Target Fields Multi-select */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                    Doelvelden om te formateren *
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface-hover)' }}>
                    {AVAILABLE_TEXT_FIELDS.map((f) => {
                      const isChecked = (editingRule.targetFields || []).includes(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => toggleFieldSelection(f.key)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '4px',
                            border: isChecked ? '1.5px solid #7c3aed' : '1px solid var(--border)',
                            backgroundColor: isChecked ? '#7c3aed' : 'var(--surface)',
                            color: isChecked ? 'white' : 'var(--text)',
                            fontSize: '0.8rem',
                            fontWeight: isChecked ? 700 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span>{isChecked ? '✓' : '+'}</span>
                          <span>{f.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Selecteer de velden die door deze regel herschreven en geüniformeerd moeten worden.
                  </span>
                </div>

                {/* Instruction / Format Prompt */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.4rem' }}>
                    Formateringsregels &amp; Instructies voor AI *
                  </label>
                  <textarea
                    className="input"
                    rows={6}
                    placeholder={`Beschrijf de exacte standaarden, bijv.:\n1. Titel: [Producttype] [Model] - [Kleur] | [Merk]. Geen ALL CAPS.\n2. Korte omschrijving: Exact 2 zinnen, max 40 woorden.\n3. Opsomming met 3 duidelijke voordelen.`}
                    value={editingRule.instruction || ''}
                    onChange={(e) => setEditingRule({ ...editingRule, instruction: e.target.value })}
                    required
                    style={{ fontSize: '0.85rem', fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Deze richtlijnen worden strikt meegegeven aan het AI-model om de teksten van de geselecteerde velden uniform op te bouwen.
                  </span>
                </div>

                {/* Enabled Toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={editingRule.enabled ?? true}
                    onChange={(e) => setEditingRule({ ...editingRule, enabled: e.target.checked })}
                  />
                  <span>Regel direct activeren voor selectie in productoverzichten en drawers</span>
                </label>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', backgroundColor: 'var(--surface-hover)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', backgroundColor: '#7c3aed', color: 'white', fontWeight: 600 }}
                >
                  {isPending ? 'Opslaan...' : 'Regel Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={!!ruleToDelete}
        title="Formateringsregel Verwijderen"
        message={`Weet je zeker dat je de formateringsregel "${ruleToDelete?.name}" wilt verwijderen?`}
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => setRuleToDelete(null)}
      />

      {/* QUICK TEST MODAL */}
      {isTestModalOpen && testRuleId && (
        <FormattingRulePreviewModal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          articleNumbers={[testArticleNumber]}
          initialRuleId={testRuleId}
          onComplete={() => {
            setIsTestModalOpen(false);
            setSuccessMsg('Testwijzigingen succesvol doorgevoerd.');
            setTimeout(() => setSuccessMsg(''), 4000);
          }}
        />
      )}
    </div>
  );
}
