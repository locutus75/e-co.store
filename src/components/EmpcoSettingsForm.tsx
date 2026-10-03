"use client";

import React, { useEffect, useState, useMemo } from "react";
import { getEmpcoSettingsAction, saveEmpcoSettingsAction } from "@/app/actions/empco";
import { getFormLayoutAction } from "@/app/actions/formLayouts";
import {
  DEFAULT_EMPCO_SETTINGS,
  DEFAULT_EMPCO_GUIDELINE_LINKS,
  DEFAULT_EMPCO_GUIDELINE_NOTES,
  DEFAULT_INCLUDED_EMPCO_FIELDS,
  getAvailableEmpcoFields,
  type EmpcoPolicy,
  type EmpcoSettings,
  type EmpcoGuidelineLink,
  type EmpcoFieldOption,
  EMPCO_RULES,
  EMPCO_ACCENT,
} from "@/lib/empco";

const POLICY_OPTIONS: { value: EmpcoPolicy; label: string }[] = [
  { value: "none", label: "Geen actie" },
  { value: "warn", label: "⚠️ Waarschuwen (gebruiker kan doorgaan)" },
  { value: "block", label: "⛔ Blokkeren" },
];

const POLICY_ROWS: { key: "readyPolicyFail" | "readyPolicyWarning" | "readyPolicyUnchecked"; label: string; hint: string }[] = [
  { key: "readyPolicyFail", label: "Product met EmpCo-overtreding (FAIL)", hint: "Er staan claims in die volgens de wetgeving verboden zijn." },
  { key: "readyPolicyWarning", label: "Product met aandachtspunten (WARNING)", hint: "Claims die mogelijk onvoldoende onderbouwd zijn." },
  { key: "readyPolicyUnchecked", label: "Product zonder (actuele) EmpCo-check", hint: "Nooit gecheckt, of de teksten zijn sinds de laatste check gewijzigd." },
];

const CATEGORY_META: Record<string, { label: string; icon: string; description: string }> = {
  content: { label: "Webshop & SEO Content", icon: "✍️", description: "Klantgerichte titels, omschrijvingen en metadata" },
  properties: { label: "Productinhoud & Eigenschappen", icon: "📦", description: "Materialen, ingrediënten en specificaties" },
  sustainability: { label: "Duurzaamheidskenmerken (Badges)", icon: "🌱", description: "Aan/uit kenmerken voor milieu, mens, dier en bewerking" },
  custom: { label: "Aangepaste velden (Layout)", icon: "⚙️", description: "Extra velden toegevoegd via de formulier layout" },
};

/**
 * Admin settings for EmpCo:
 * 1. Field & component selection (what to include in check)
 * 2. Guidelines & official legislation references (EUR-Lex, ACM, notes)
 * 3. Enforcement & Webshop Ready policy
 */
export default function EmpcoSettingsForm() {
  const [settings, setSettings] = useState<EmpcoSettings>(DEFAULT_EMPCO_SETTINGS);
  const [layout, setLayout] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [activeTab, setActiveTab] = useState<'fields' | 'guidelines' | 'policy'>('fields');

  // Fields tab state
  const [fieldSearch, setFieldSearch] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  // Guidelines link add/edit state
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<{ title: string; url: string; description: string; category: string }>({
    title: "",
    url: "",
    description: "",
    category: "other",
  });
  const [isAddingNewLink, setIsAddingNewLink] = useState(false);

  useEffect(() => {
    Promise.all([getEmpcoSettingsAction(), getFormLayoutAction()])
      .then(([s, l]) => {
        setSettings(s);
        setLayout(l);
      })
      .finally(() => setLoading(false));
  }, []);

  const availableFields: EmpcoFieldOption[] = useMemo(() => {
    return getAvailableEmpcoFields(layout);
  }, [layout]);

  const includedKeys = useMemo(() => {
    return new Set(settings.includedFieldKeys ?? DEFAULT_INCLUDED_EMPCO_FIELDS);
  }, [settings.includedFieldKeys]);

  const toggleField = (key: string) => {
    const next = new Set(includedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSettings({ ...settings, includedFieldKeys: Array.from(next) });
  };

  const selectAllFields = () => {
    setSettings({ ...settings, includedFieldKeys: availableFields.map(f => f.key) });
  };

  const deselectAllFields = () => {
    setSettings({ ...settings, includedFieldKeys: [] });
  };

  const resetToDefaultFields = () => {
    setSettings({ ...settings, includedFieldKeys: DEFAULT_INCLUDED_EMPCO_FIELDS });
  };

  const toggleCategory = (cat: string, selectAll: boolean) => {
    const catKeys = availableFields.filter(f => f.category === cat).map(f => f.key);
    const next = new Set(includedKeys);
    catKeys.forEach(k => {
      if (selectAll) next.add(k);
      else next.delete(k);
    });
    setSettings({ ...settings, includedFieldKeys: Array.from(next) });
  };

  // Guidelines link actions
  const handleSaveLink = () => {
    if (!linkForm.title.trim() || !linkForm.url.trim()) return;
    const currentLinks = settings.guidelineLinks ?? DEFAULT_EMPCO_GUIDELINE_LINKS;

    if (editingLinkId) {
      // Update
      const updated = currentLinks.map(l => l.id === editingLinkId ? {
        ...l,
        title: linkForm.title.trim(),
        url: linkForm.url.trim(),
        description: linkForm.description.trim() || undefined,
        category: linkForm.category as any,
      } : l);
      setSettings({ ...settings, guidelineLinks: updated });
    } else {
      // Add
      const newEntry: EmpcoGuidelineLink = {
        id: 'link_' + Math.random().toString(36).slice(2, 9),
        title: linkForm.title.trim(),
        url: linkForm.url.trim(),
        description: linkForm.description.trim() || undefined,
        category: linkForm.category as any,
      };
      setSettings({ ...settings, guidelineLinks: [...currentLinks, newEntry] });
    }

    setEditingLinkId(null);
    setIsAddingNewLink(false);
    setLinkForm({ title: "", url: "", description: "", category: "other" });
  };

  const startEditLink = (l: EmpcoGuidelineLink) => {
    setEditingLinkId(l.id);
    setIsAddingNewLink(false);
    setLinkForm({
      title: l.title,
      url: l.url,
      description: l.description || "",
      category: l.category || "other",
    });
  };

  const removeLink = (id: string) => {
    const updated = (settings.guidelineLinks ?? []).filter(l => l.id !== id);
    setSettings({ ...settings, guidelineLinks: updated });
  };

  const resetDefaultLinks = () => {
    setSettings({ ...settings, guidelineLinks: DEFAULT_EMPCO_GUIDELINE_LINKS });
  };

  const resetDefaultNotes = () => {
    setSettings({ ...settings, guidelineNotes: DEFAULT_EMPCO_GUIDELINE_NOTES });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: "", type: "" });
    const res = await saveEmpcoSettingsAction(settings);
    setMsg(res.success ? { text: "✓ EmpCo-instellingen succesvol opgeslagen!", type: "success" } : { text: "✕ Fout bij opslaan: " + res.error, type: "error" });
    setSaving(false);
  };

  const filteredFields = useMemo(() => {
    return availableFields.filter(f => {
      if (activeCategoryFilter !== "all" && f.category !== activeCategoryFilter) return false;
      if (fieldSearch) {
        const q = fieldSearch.toLowerCase();
        return f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) || (f.description && f.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [availableFields, activeCategoryFilter, fieldSearch]);

  const fieldsByCategory = useMemo(() => {
    const grouped: Record<string, EmpcoFieldOption[]> = {};
    filteredFields.forEach(f => {
      const cat = f.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    });
    return grouped;
  }, [filteredFields]);

  if (loading) {
    return (
      <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
        EmpCo-instellingen laden…
      </div>
    );
  }

  const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" };

  return (
    <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: "2rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1.2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>⚖️</span> EmpCo Richtlijnen & Toetsing
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.35rem", lineHeight: 1.5 }}>
              Beheer de regels, gecontroleerde velden en officiële wetgevingsbronnen van de Richtlijn (EU) 2024/825 en de ACM Leidraad Duurzaamheidsclaims.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", backgroundColor: "#f0fdfa", border: "1px solid #ccfbf1", padding: "0.4rem 0.8rem", borderRadius: "999px", fontSize: "0.82rem", color: EMPCO_ACCENT, fontWeight: 700 }}>
            <span>✓ {includedKeys.size} velden actief</span>
          </div>
        </div>
      </div>

      {msg.text && (
        <div style={{ padding: "0.85rem 1.25rem", backgroundColor: msg.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: msg.type === "success" ? "#065f46" : "#991b1b", border: `1px solid ${msg.type === "success" ? "#a7f3d0" : "#fecaca"}`, borderRadius: "10px", marginBottom: "1.5rem", fontWeight: 600, fontSize: "0.9rem" }}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", marginBottom: "1.75rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab('fields')}
          style={{
            padding: "0.75rem 1.25rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === 'fields' ? `3px solid ${EMPCO_ACCENT}` : "3px solid transparent",
            color: activeTab === 'fields' ? EMPCO_ACCENT : "var(--text-muted)",
            fontWeight: activeTab === 'fields' ? 700 : 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            transition: "all 0.15s",
          }}
        >
          <span>📋</span> Te controleren velden & onderdelen
          <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "999px", backgroundColor: activeTab === 'fields' ? "#ccfbf1" : "var(--surface-hover)", color: activeTab === 'fields' ? EMPCO_ACCENT : "var(--text-muted)", fontWeight: 700 }}>
            {includedKeys.size}/{availableFields.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('guidelines')}
          style={{
            padding: "0.75rem 1.25rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === 'guidelines' ? `3px solid ${EMPCO_ACCENT}` : "3px solid transparent",
            color: activeTab === 'guidelines' ? EMPCO_ACCENT : "var(--text-muted)",
            fontWeight: activeTab === 'guidelines' ? 700 : 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            transition: "all 0.15s",
          }}
        >
          <span>📖</span> Richtlijnen & Wetgevingsbronnen
          <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "999px", backgroundColor: activeTab === 'guidelines' ? "#ccfbf1" : "var(--surface-hover)", color: activeTab === 'guidelines' ? EMPCO_ACCENT : "var(--text-muted)", fontWeight: 700 }}>
            {(settings.guidelineLinks ?? []).length} bronnen
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policy')}
          style={{
            padding: "0.75rem 1.25rem",
            background: "none",
            border: "none",
            borderBottom: activeTab === 'policy' ? `3px solid ${EMPCO_ACCENT}` : "3px solid transparent",
            color: activeTab === 'policy' ? EMPCO_ACCENT : "var(--text-muted)",
            fontWeight: activeTab === 'policy' ? 700 : 500,
            fontSize: "0.9rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            transition: "all 0.15s",
          }}
        >
          <span>🛡️</span> Handhaving & Webshop Ready
        </button>
      </div>

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {/* ================================================================= */}
        {/* TAB 1: FIELDS & COMPONENTS SELECTION                              */}
        {/* ================================================================= */}
        {activeTab === 'fields' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Filter & Action Toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", backgroundColor: "var(--background)", padding: "1rem 1.25rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setActiveCategoryFilter("all")}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    border: activeCategoryFilter === "all" ? `1px solid ${EMPCO_ACCENT}` : "1px solid var(--border)",
                    backgroundColor: activeCategoryFilter === "all" ? "#f0fdfa" : "white",
                    color: activeCategoryFilter === "all" ? EMPCO_ACCENT : "var(--text)",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Alles ({availableFields.length})
                </button>
                {Object.entries(CATEGORY_META).map(([catKey, meta]) => {
                  const count = availableFields.filter(f => f.category === catKey).length;
                  if (count === 0) return null;
                  const isSel = activeCategoryFilter === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setActiveCategoryFilter(catKey)}
                      style={{
                        padding: "0.35rem 0.75rem",
                        borderRadius: "6px",
                        border: isSel ? `1px solid ${EMPCO_ACCENT}` : "1px solid var(--border)",
                        backgroundColor: isSel ? "#f0fdfa" : "white",
                        color: isSel ? EMPCO_ACCENT : "var(--text)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {meta.icon} {meta.label} ({count})
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={selectAllFields}
                  className="btn btn-sm"
                  style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  title="Selecteer alle beschikbare velden voor de EmpCo check"
                >
                  ✓ Alles aanzetten
                </button>
                <button
                  type="button"
                  onClick={resetToDefaultFields}
                  className="btn btn-sm"
                  style={{ fontSize: "0.78rem", fontWeight: 600 }}
                  title="Herstel de aanbevolen standaardselectie"
                >
                  ↺ Standaard selectie
                </button>
                <button
                  type="button"
                  onClick={deselectAllFields}
                  className="btn btn-sm"
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-muted)" }}
                  title="Deselecteer alle velden"
                >
                  ✕ Alles uit
                </button>
              </div>
            </div>

            {/* Field Search */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="input"
                placeholder="Zoek veld op naam of veldsleutel (bijv. omschrijving, ingrediënten, plastic, vegan)..."
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
                style={{ paddingLeft: "2.2rem" }}
              />
              <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.95rem" }}>🔍</span>
              {fieldSearch && (
                <button
                  type="button"
                  onClick={() => setFieldSearch("")}
                  style={{ position: "absolute", right: "0.85rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.9rem" }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Categorized Fields Grid */}
            {Object.keys(fieldsByCategory).length === 0 ? (
              <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", backgroundColor: "var(--background)", borderRadius: "12px", border: "1px dashed var(--border)" }}>
                Geen velden gevonden die voldoen aan de zoekopdracht.
              </div>
            ) : (
              Object.entries(fieldsByCategory).map(([catKey, fields]) => {
                const meta = CATEGORY_META[catKey] ?? { label: catKey, icon: "📁", description: "" };
                const catIncludedCount = fields.filter(f => includedKeys.has(f.key)).length;
                const allInCatSelected = catIncludedCount === fields.length;

                return (
                  <div key={catKey} style={{ backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", overflow: "hidden" }}>
                    {/* Category Header */}
                    <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", backgroundColor: "rgba(0,0,0,0.015)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                          <span>{meta.icon}</span> {meta.label}
                          <span style={{ fontSize: "0.75rem", padding: "0.1rem 0.5rem", borderRadius: "999px", backgroundColor: catIncludedCount > 0 ? "#ccfbf1" : "var(--surface-hover)", color: catIncludedCount > 0 ? EMPCO_ACCENT : "var(--text-muted)", fontWeight: 700 }}>
                            {catIncludedCount} / {fields.length} geselecteerd
                          </span>
                        </div>
                        {meta.description && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{meta.description}</div>}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleCategory(catKey, !allInCatSelected)}
                        style={{
                          background: "none",
                          border: "none",
                          color: EMPCO_ACCENT,
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: "0.2rem 0.4rem",
                        }}
                      >
                        {allInCatSelected ? "Categorie uitzetten" : "Categorie aanzetten"}
                      </button>
                    </div>

                    {/* Fields List */}
                    <div style={{ padding: "1rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: "0.75rem" }}>
                      {fields.map(f => {
                        const isChecked = includedKeys.has(f.key);
                        const isClaim = f.category === 'sustainability';

                        return (
                          <div
                            key={f.key}
                            onClick={() => toggleField(f.key)}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "0.75rem",
                              padding: "0.75rem 0.9rem",
                              borderRadius: "10px",
                              backgroundColor: isChecked ? "#f0fdfa" : "white",
                              border: isChecked ? "1px solid #99f6e4" : "1px solid var(--border)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                              boxShadow: isChecked ? "0 2px 6px rgba(15,118,110,0.06)" : "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent onClick
                              style={{ width: "1.15rem", height: "1.15rem", marginTop: "0.15rem", cursor: "pointer", accentColor: EMPCO_ACCENT }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem", marginBottom: "0.2rem" }}>
                                <span style={{ fontWeight: 700, fontSize: "0.86rem", color: isChecked ? "#0f766e" : "var(--text)" }}>
                                  {f.label}
                                </span>
                                <span style={{ fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "4px", backgroundColor: isClaim ? "#fef3c7" : "#e2e8f0", color: isClaim ? "#92400e" : "#475569", fontWeight: 700, textTransform: "uppercase" }}>
                                  {isClaim ? "Badge" : "Tekst"}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "#64748b", marginBottom: "0.15rem" }}>
                                {f.key}
                              </div>
                              {f.description && (
                                <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.35 }}>
                                  {f.description}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            <div style={{ padding: "0.85rem 1.1rem", borderRadius: "10px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "0.82rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ fontSize: "1.1rem" }}>💡</span>
              <span>
                <strong>Hoe werkt dit?</strong> Alleen aangevinkte velden worden door de EmpCo-controle geëxtraheerd en getoetst. Uitgeschakelde velden worden niet gecontroleerd en leiden niet tot overtredingen of verouderde statussen.
              </span>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: GUIDELINES & LEGISLATION REFERENCES                        */}
        {/* ================================================================= */}
        {activeTab === 'guidelines' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
            {/* Legislation Links Card */}
            <div style={{ backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span>🔗</span> Officiële Wetgeving & Externe Bronnen
                  </h3>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Verwijzingen naar relevante wetgeving en richtlijnenportalen. Medewerkers kunnen deze direct aanklikken om de wetgeving te raadplegen.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewLink(true);
                      setEditingLinkId(null);
                      setLinkForm({ title: "", url: "https://", description: "", category: "other" });
                    }}
                    className="btn btn-sm btn-primary"
                    style={{ fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <span>+</span> Bron Toevoegen
                  </button>
                  <button
                    type="button"
                    onClick={resetDefaultLinks}
                    className="btn btn-sm"
                    style={{ fontSize: "0.8rem", fontWeight: 600 }}
                    title="Herstel de standaardlijst met EUR-Lex en ACM links"
                  >
                    ↺ Standaard herstellen
                  </button>
                </div>
              </div>

              {/* Add / Edit Form Modal / Box */}
              {(isAddingNewLink || editingLinkId) && (
                <div style={{ backgroundColor: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: "12px", padding: "1.25rem", marginBottom: "1.25rem", animation: "slideIn 0.2s ease" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.92rem", color: EMPCO_ACCENT, marginBottom: "0.75rem" }}>
                    {editingLinkId ? "Wetgevingsbron bewerken" : "Nieuwe wetgevingsbron toevoegen"}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div>
                      <label style={labelStyle}>Titel / Naam *</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Bijv. ACM Leidraad Duurzaamheidsclaims"
                        value={linkForm.title}
                        onChange={e => setLinkForm({ ...linkForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>URL (website) *</label>
                      <input
                        type="url"
                        className="input"
                        placeholder="https://..."
                        value={linkForm.url}
                        onChange={e => setLinkForm({ ...linkForm, url: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "0.75rem" }}>
                    <label style={labelStyle}>Toelichting (wat staat in deze wetgeving?) *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Bijv. De 5 vuistregels van de ACM voor duidelijke, juiste en onderbouwde claims..."
                      value={linkForm.description}
                      onChange={e => setLinkForm({ ...linkForm, description: e.target.value })}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setIsAddingNewLink(false);
                        setEditingLinkId(null);
                      }}
                    >
                      Annuleren
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleSaveLink}
                      disabled={!linkForm.title.trim() || !linkForm.url.trim()}
                    >
                      {editingLinkId ? "Wijziging toepassen" : "Toevoegen aan lijst"}
                    </button>
                  </div>
                </div>
              )}

              {/* Links Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {(settings.guidelineLinks ?? []).length === 0 ? (
                  <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    Nog geen wetgevingsbronnen ingesteld. Klik op &quot;+ Bron Toevoegen&quot; of &quot;↺ Standaard herstellen&quot;.
                  </div>
                ) : (
                  (settings.guidelineLinks ?? []).map((link) => (
                    <div
                      key={link.id}
                      style={{
                        padding: "0.85rem 1rem",
                        backgroundColor: "white",
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: "260px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text)" }}>
                            {link.title}
                          </span>
                          <span style={{ fontSize: "0.68rem", padding: "0.1rem 0.45rem", borderRadius: "999px", backgroundColor: "#e0f2fe", color: "#0369a1", fontWeight: 700 }}>
                            {link.category === 'eu_law' ? 'EU-Wet' : link.category === 'national_authority' ? 'Toezichthouder' : 'Richtlijn'}
                          </span>
                        </div>
                        {link.description && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.35rem", lineHeight: 1.4 }}>
                            {link.description}
                          </div>
                        )}
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "0.76rem",
                            color: EMPCO_ACCENT,
                            textDecoration: "none",
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <span>🔗</span> {link.url} <span>↗</span>
                        </a>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm"
                          style={{
                            fontSize: "0.76rem",
                            padding: "0.3rem 0.65rem",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            backgroundColor: "#f0fdfa",
                            color: EMPCO_ACCENT,
                            border: "1px solid #ccfbf1",
                            fontWeight: 600,
                          }}
                        >
                          Openen ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => startEditLink(link)}
                          className="btn btn-sm"
                          style={{ fontSize: "0.76rem", padding: "0.3rem 0.5rem" }}
                          title="Bewerken"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLink(link.id)}
                          className="btn btn-sm"
                          style={{ fontSize: "0.76rem", padding: "0.3rem 0.5rem", color: "#ef4444" }}
                          title="Verwijderen"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Core Guidelines & Summary */}
            <div style={{ backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", padding: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                    <span>📜</span> Kernprincipes & Toelichting van de Wetgeving
                  </h3>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Deze richtlijnen worden gebruikt door de AI compliance-assistent én getoond aan medewerkers bij het beoordelen van overtredingen.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetDefaultNotes}
                  className="btn btn-sm"
                  style={{ fontSize: "0.78rem" }}
                  title="Herstel de standaard toelichting van de EmpCo-richtlijn"
                >
                  ↺ Standaard herstellen
                </button>
              </div>

              <textarea
                id="empco-guideline-notes"
                className="input"
                rows={7}
                value={settings.guidelineNotes ?? DEFAULT_EMPCO_GUIDELINE_NOTES}
                onChange={e => setSettings({ ...settings, guidelineNotes: e.target.value })}
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.85rem", lineHeight: 1.55 }}
              />
            </div>

            {/* Extra House Rules */}
            <div style={{ backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", padding: "1.5rem" }}>
              <label htmlFor="empco-extra" style={{ ...labelStyle, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.25rem" }}>
                🏠 Aanvullende interne huisregels voor de webshop (optioneel)
              </label>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.6rem" }}>
                Interne uitzonderingen of specifieke afspraken binnen jouw winkel (bijv. &quot;GOTS certificaat is door ons geverifieerd voor merk X en mag genoemd worden&quot;).
              </div>
              <textarea
                id="empco-extra"
                className="input"
                rows={4}
                value={settings.extraInstructions}
                onChange={e => setSettings({ ...settings, extraInstructions: e.target.value })}
                placeholder={'Bijv. "Het keurmerk GOTS is door ons geverifieerd en mag genoemd worden."'}
                style={{ resize: "vertical", fontFamily: "inherit", fontSize: "0.85rem" }}
              />
            </div>

            {/* 9 Legal Rules Overview */}
            <div style={{ backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", padding: "1.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.6rem" }}>
                ⚖️ De 9 officiële EmpCo-toetsingsregels:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.65rem" }}>
                {Object.entries(EMPCO_RULES).map(([code, r]) => (
                  <div key={code} style={{ padding: "0.65rem 0.8rem", borderRadius: "8px", backgroundColor: "white", border: "1px solid var(--border)", fontSize: "0.78rem" }}>
                    <div style={{ fontWeight: 700, color: EMPCO_ACCENT, marginBottom: "0.15rem" }}>
                      {r.label} <span style={{ fontSize: "0.68rem", color: "#64748b", fontFamily: "monospace" }}>({code})</span>
                    </div>
                    <div style={{ color: "var(--text-muted)", lineHeight: 1.4 }}>{r.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ENFORCEMENT & WEBSHOP READY POLICY                         */}
        {/* ================================================================= */}
        {activeTab === 'policy' && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ padding: "1.5rem", backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>Webshop Ready-beleid</div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Bepaal wat er gebeurt wanneer een gebruiker een product in bulk of individueel op &quot;Webshop Ready = JA&quot; probeert te zetten.
              </p>

              {POLICY_ROWS.map(row => (
                <div key={row.key} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 320px)", gap: "1rem", alignItems: "center", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                  <div>
                    <label htmlFor={`empco-${row.key}`} style={{ ...labelStyle, color: "var(--text)", marginBottom: "0.15rem" }}>{row.label}</label>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{row.hint}</div>
                  </div>
                  <select
                    id={`empco-${row.key}`}
                    className="input"
                    value={settings[row.key]}
                    onChange={e => setSettings({ ...settings, [row.key]: e.target.value as EmpcoPolicy })}
                  >
                    {POLICY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ padding: "1.25rem", backgroundColor: "var(--background)", borderRadius: "14px", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.85rem" }}>
              <input
                type="checkbox"
                id="empco-include-default"
                checked={settings.includeInAnalysisByDefault}
                onChange={e => setSettings({ ...settings, includeInAnalysisByDefault: e.target.checked })}
                style={{ width: "1.25rem", height: "1.25rem", cursor: "pointer", accentColor: EMPCO_ACCENT }}
              />
              <div>
                <label htmlFor="empco-include-default" style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text)", cursor: "pointer" }}>
                  EmpCo-check standaard meenemen in productanalyses
                </label>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                  Wanneer actief staat de EmpCo-controle standaard aangevinkt bij batch-analyses en individuele productscans.
                </div>
              </div>
            </div>

            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, padding: "0.5rem 0.75rem", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              ⚠️ <strong>Juridische disclaimer:</strong> De EmpCo-check is een geavanceerd AI-hulpmiddel en vormt geen juridisch advies. Bij twijfelgevallen dient altijd een compliance-expert of jurist te worden geraadpleegd.
            </p>
          </div>
        )}

        {/* Form Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {includedKeys.size} velden geselecteerd · {(settings.guidelineLinks ?? []).length} wetgevingsbronnen
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{
              padding: "0.6rem 1.6rem",
              background: "linear-gradient(135deg, #0f766e 0%, #065f46 100%)",
              boxShadow: "0 4px 14px rgba(15,118,110,0.35)",
              fontWeight: 700,
              fontSize: "0.9rem",
            }}
          >
            {saving ? "Opslaan..." : "✓ Instellingen Opslaan"}
          </button>
        </div>
      </form>
    </div>
  );
}
