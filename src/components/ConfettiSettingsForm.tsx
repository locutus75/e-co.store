"use client";

import React, { useEffect, useState } from "react";
import { ConfettiSettings, getConfettiSettings, saveConfettiSettings, getUsersForConfetti } from "@/app/actions/confetti";

export default function ConfettiSettingsForm() {
  const [settings, setSettings] = useState<ConfettiSettings>({
    active: false,
    soundEnabled: true,
    triggers: {
      statusCount: { active: false, status: "Gepubliceerd", count: 100, message: "Gefeliciteerd met de status mijlpaal!", surpriseType: "confetti", userIds: [], viewedBy: [] },
      datetime: { active: false, targetDate: new Date().toISOString(), message: "Gefeliciteerd op deze speciale dag!", surpriseType: "confetti", userIds: [], viewedBy: [] },
      editCount: { active: false, count: 1000, message: "Gefeliciteerd met dit aantal bewerkingen!", surpriseType: "confetti", userIds: [], viewedBy: [] },
    }
  });
  const [users, setUsers] = useState<{id: string, email: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });

  useEffect(() => {
    Promise.all([
      getConfettiSettings(),
      getUsersForConfetti()
    ]).then(([s, u]) => {
      setSettings(s);
      setUsers(u);
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: "", type: "" });
    const res = await saveConfettiSettings(settings);
    if (res.success) {
      setMsg({ text: "Opgeslagen!", type: "success" });
    } else {
      setMsg({ text: "Fout bij opslaan: " + res.error, type: "error" });
    }
    setSaving(false);
  };

  const handleTestConfetti = () => {
    window.dispatchEvent(
      new CustomEvent("test-confetti", { detail: { messages: ["Dit is een testbericht voor confetti!"], soundEnabled: settings.soundEnabled, surpriseType: "confetti" } })
    );
  };

  const handleTestFireworks = () => {
    window.dispatchEvent(
      new CustomEvent("test-confetti", { detail: { messages: ["Dit is een testbericht voor vuurwerk!"], soundEnabled: settings.soundEnabled, surpriseType: "fireworks" } })
    );
  };

  const renderUserChecklist = (triggerKey: keyof ConfettiSettings["triggers"]) => {
    const trigger = settings.triggers[triggerKey];
    const isAllSelected = trigger.userIds.length === 0 || trigger.userIds.length === users.length;

    const toggleUser = (userId: string) => {
      let newUserIds = [...trigger.userIds];
      // Als de lijst leeg was, stonden ze in theorie allemaal aan. 
      // Als ze nu eentje uitsluiten, moeten de rest aan.
      if (trigger.userIds.length === 0) {
        newUserIds = users.map(u => u.id).filter(id => id !== userId);
      } else {
        if (newUserIds.includes(userId)) {
          newUserIds = newUserIds.filter(id => id !== userId);
        } else {
          newUserIds.push(userId);
        }
      }
      // Als iedereen is geselecteerd, maken we de lijst leeg (leeg = iedereen)
      if (newUserIds.length === users.length) newUserIds = [];
      
      setSettings({
        ...settings,
        triggers: {
          ...settings.triggers,
          [triggerKey]: { ...trigger, userIds: newUserIds }
        }
      });
    };

    const toggleAll = () => {
      setSettings({
        ...settings,
        triggers: {
          ...settings.triggers,
          [triggerKey]: { ...trigger, userIds: isAllSelected ? [] : [] } // actually if all is selected and they click, we deselect all by passing an array that isn't everyone... wait, empty = all. So to select NONE, we can't easily do it since empty = all. Let's make a special state? Or just let them uncheck. 
          // If isAllSelected is true, clicking 'Deselect All' should make none selected. But empty array means all. Let's fix that logic: empty array = all. To select none, don't use this trigger.
        }
      });
    };

    return (
      <div style={{ marginTop: "1rem", backgroundColor: "var(--background-alt)", padding: "1rem", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>
            Geldt voor gebruikers ({trigger.userIds.length === 0 ? "Iedereen" : trigger.userIds.length})
          </label>
          <button type="button" className="btn btn-sm" onClick={() => {
            setSettings({
              ...settings,
              triggers: { ...settings.triggers, [triggerKey]: { ...trigger, userIds: [] } }
            });
          }}>
            Selecteer Iedereen
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem", maxHeight: "150px", overflowY: "auto", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius)", backgroundColor: "var(--background)" }}>
          {users.map(u => {
            const isChecked = trigger.userIds.length === 0 || trigger.userIds.includes(u.id);
            return (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleUser(u.id)}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.email}>{u.email}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ padding: "2rem", color: "var(--text-muted)" }}>Laden...</div>;

  return (
    <div className="glass" style={{ borderRadius: "var(--radius-lg)", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text)", margin: 0 }}>🎉 Verrassingen</h2>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "0.3rem" }}>Stel een verrassing in voor gebruikers wanneer één of meerdere doelen worden bereikt.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleTestConfetti}
            className="btn"
            style={{ backgroundColor: "var(--background)", display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span style={{ fontSize: "1.1rem" }}>🎉</span> Test Confetti
          </button>
          <button
            type="button"
            onClick={handleTestFireworks}
            className="btn"
            style={{ backgroundColor: "var(--background)", display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span style={{ fontSize: "1.1rem" }}>🎆</span> Test Vuurwerk
          </button>
        </div>
      </div>

      {msg.text && (
        <div style={{ padding: "1rem", backgroundColor: msg.type === "success" ? "rgba(50,255,50,0.1)" : "rgba(255,50,50,0.1)", color: msg.type === "success" ? "var(--success)" : "var(--error)", borderRadius: "var(--radius)", marginBottom: "1.5rem", fontWeight: 500 }}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <input
            type="checkbox"
            id="active-confetti"
            checked={settings.active}
            onChange={(e) => setSettings({ ...settings, active: e.target.checked })}
            style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
          />
          <label htmlFor="active-confetti" style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
            Verrassingen Inschakelen (Hoofdschakelaar)
          </label>
        </div>

        {settings.active && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "-0.5rem", marginBottom: "0.5rem" }}>
            <input
              type="checkbox"
              id="active-sound"
              checked={!!settings.soundEnabled}
              onChange={(e) => setSettings({ ...settings, soundEnabled: e.target.checked })}
              style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
            />
            <label htmlFor="active-sound" style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
              Geluidseffecten inschakelen
            </label>
          </div>
        )}

        {settings.active && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            
            {/* 1. Status Count Trigger */}
            <div style={{ padding: "1.5rem", backgroundColor: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="active-status"
                  checked={settings.triggers.statusCount.active}
                  onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, statusCount: { ...settings.triggers.statusCount, active: e.target.checked } } })}
                  style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
                />
                <label htmlFor="active-status" style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                  1. Product status mijlpaal
                </label>
              </div>

              {settings.triggers.statusCount.active && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: "800px", paddingLeft: "2rem" }}>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Product Status</label>
                      <input
                        className="input"
                        type="text"
                        value={settings.triggers.statusCount.status}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, statusCount: { ...settings.triggers.statusCount, status: e.target.value } } })}
                        placeholder="Bijv. Gepubliceerd"
                        required
                      />
                    </div>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Aantal Bereikt</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={settings.triggers.statusCount.count}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, statusCount: { ...settings.triggers.statusCount, count: parseInt(e.target.value) } } })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Type Verrassing</label>
                      <select
                        className="input"
                        value={settings.triggers.statusCount.surpriseType}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, statusCount: { ...settings.triggers.statusCount, surpriseType: e.target.value as any } } })}
                        required
                      >
                        <option value="confetti">🎉 Confetti</option>
                        <option value="fireworks">🎆 Vuurwerk</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Bericht</label>
                      <input
                        className="input"
                        type="text"
                        value={settings.triggers.statusCount.message}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, statusCount: { ...settings.triggers.statusCount, message: e.target.value } } })}
                        required
                      />
                    </div>
                  </div>
                  <div style={{ paddingLeft: "2rem" }}>
                    {renderUserChecklist("statusCount")}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Datetime Trigger */}
            <div style={{ padding: "1.5rem", backgroundColor: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="active-datetime"
                  checked={settings.triggers.datetime.active}
                  onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, datetime: { ...settings.triggers.datetime, active: e.target.checked } } })}
                  style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
                />
                <label htmlFor="active-datetime" style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                  2. Specifieke Datum & Tijd
                </label>
              </div>

              {settings.triggers.datetime.active && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: "800px", paddingLeft: "2rem" }}>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Datum en Tijd</label>
                      <input
                        className="input"
                        type="datetime-local"
                        value={settings.triggers.datetime.targetDate ? new Date(new Date(settings.triggers.datetime.targetDate).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, datetime: { ...settings.triggers.datetime, targetDate: new Date(e.target.value).toISOString() } } })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Type Verrassing</label>
                      <select
                        className="input"
                        value={settings.triggers.datetime.surpriseType}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, datetime: { ...settings.triggers.datetime, surpriseType: e.target.value as any } } })}
                        required
                      >
                        <option value="confetti">🎉 Confetti</option>
                        <option value="fireworks">🎆 Vuurwerk</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Bericht</label>
                      <input
                        className="input"
                        type="text"
                        value={settings.triggers.datetime.message}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, datetime: { ...settings.triggers.datetime, message: e.target.value } } })}
                        required
                      />
                    </div>
                  </div>
                  <div style={{ paddingLeft: "2rem" }}>
                    {renderUserChecklist("datetime")}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Edits Trigger */}
            <div style={{ padding: "1.5rem", backgroundColor: "var(--background)", borderRadius: "var(--radius)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  id="active-edits"
                  checked={settings.triggers.editCount.active}
                  onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, editCount: { ...settings.triggers.editCount, active: e.target.checked } } })}
                  style={{ width: "1.2rem", height: "1.2rem", cursor: "pointer" }}
                />
                <label htmlFor="active-edits" style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                  3. Totaal aantal bewerkingen in systeem (Edits)
                </label>
              </div>

              {settings.triggers.editCount.active && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", maxWidth: "800px", paddingLeft: "2rem" }}>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Aantal Bewerkingen (Totaal)</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        value={settings.triggers.editCount.count}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, editCount: { ...settings.triggers.editCount, count: parseInt(e.target.value) } } })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Type Verrassing</label>
                      <select
                        className="input"
                        value={settings.triggers.editCount.surpriseType}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, editCount: { ...settings.triggers.editCount, surpriseType: e.target.value as any } } })}
                        required
                      >
                        <option value="confetti">🎉 Confetti</option>
                        <option value="fireworks">🎆 Vuurwerk</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="label" style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.4rem" }}>Bericht</label>
                      <input
                        className="input"
                        type="text"
                        value={settings.triggers.editCount.message}
                        onChange={(e) => setSettings({ ...settings, triggers: { ...settings.triggers, editCount: { ...settings.triggers.editCount, message: e.target.value } } })}
                        required
                      />
                    </div>
                  </div>
                  <div style={{ paddingLeft: "2rem" }}>
                    {renderUserChecklist("editCount")}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Opslaan..." : "Instellingen Opslaan"}
          </button>
        </div>
      </form>
    </div>
  );
}
