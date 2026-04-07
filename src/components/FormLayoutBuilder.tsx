"use client";
import React, { useState, useTransition, useEffect, useRef } from 'react';
import { FormSection, saveFormLayoutAction, FormField } from '@/app/actions/formLayouts';

export default function FormLayoutBuilder({ initialLayout }: { initialLayout: FormSection[] }) {
  const [layout, setLayout] = useState<FormSection[]>(initialLayout);
  const [isPending, startTransition] = useTransition();

  // Drag and Drop state
  const [draggedItem, setDraggedItem] = useState<{ secIdx: number, fieldIdx: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ secIdx: number, fieldIdx: number } | null>(null);

  // Visual Resizing state
  const [resizingItem, setResizingItem] = useState<{ secIdx: number, fieldIdx: number } | null>(null);
  const [resizeStartX, setResizeStartX] = useState<number>(0);
  const [resizeStartSpan, setResizeStartSpan] = useState<number>(0);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Custom Field Modal State
  const [showCustomModal, setShowCustomModal] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState('text');
  const [customOptions, setCustomOptions] = useState('');

  const moveSection = (index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= layout.length) return;
    setLayout(prev => {
      const newLayout = [...prev];
      const temp = newLayout[index];
      newLayout[index] = newLayout[index + direction];
      newLayout[index + direction] = temp;
      return newLayout;
    });
  };

  const updateFieldWidth = (secIdx: number, fieldIdx: number, width: number | undefined) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { ...newLayout[secIdx].fields[fieldIdx], width };
      return newLayout;
    });
  };

  const updateFieldLabel = (secIdx: number, fieldIdx: number, label: string) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { ...newLayout[secIdx].fields[fieldIdx], label };
      return newLayout;
    });
  };

  const updateFieldOptions = (secIdx: number, fieldIdx: number, optionsStr: string) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { 
        ...newLayout[secIdx].fields[fieldIdx], 
        options: optionsStr.split(',').map(o => o.trim()).filter(Boolean)
      };
      return newLayout;
    });
  };

  const updateSectionTitle = (secIdx: number, title: string) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], title };
      return newLayout;
    });
  };

  const removeSection = (secIdx: number) => {
    setLayout(prevLayout => {
      if (prevLayout[secIdx].fields.length > 0) return prevLayout;
      const newLayout = [...prevLayout];
      newLayout.splice(secIdx, 1);
      return newLayout;
    });
  };

  const removeField = (secIdx: number, fieldIdx: number) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      const newFields = [...newLayout[secIdx].fields];
      newFields.splice(fieldIdx, 1);
      newLayout[secIdx] = {
        ...newLayout[secIdx],
        fields: newFields
      };
      return newLayout;
    });
  };

  const addSection = () => {
    setLayout(prevLayout => [
      ...prevLayout,
      {
        id: `sect-custom-${Date.now()}`,
        title: "Nieuwe Sectie",
        color: "var(--primary)",
        fields: []
      }
    ]);
  };

  const addCustomField = () => {
    if (showCustomModal === null) return;
    if (!customName.trim()) return alert("Vul een naam in");
    
    // Generate a unique ID that starts with CUSTOM:
    const randomHex = Math.floor(Math.random()*16777215).toString(16);
    const id = `FIELD:custom_${randomHex}_${Date.now()}`;
    
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      const newField: FormField = {
        id,
        label: customName.trim(),
        type: customType,
        width: 12
      };
      if (customType === 'picklist' && customOptions.trim()) {
        newField.options = customOptions.split(',').map(o => o.trim()).filter(Boolean);
      }
      newLayout[showCustomModal] = {
        ...newLayout[showCustomModal],
        fields: [...newLayout[showCustomModal].fields, newField]
      };
      return newLayout;
    });

    setShowCustomModal(null);
    setCustomName('');
    setCustomType('text');
    setCustomOptions('');
  };

  // Resizing Effect
  useEffect(() => {
    if (!resizingItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!gridContainerRef.current) return;
      
      const deltaX = e.clientX - resizeStartX;
      const gridWidth = gridContainerRef.current.clientWidth;
      const colWidth = gridWidth / 12; // approximate width of one grid span
      
      const deltaCols = Math.round(deltaX / colWidth);
      let newSpan = resizeStartSpan + deltaCols;
      newSpan = Math.max(1, Math.min(12, newSpan)); // between 1 and 12 columns
      
      updateFieldWidth(resizingItem.secIdx, resizingItem.fieldIdx, newSpan);
    };

    const handleMouseUp = () => {
      setResizingItem(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingItem, resizeStartX, resizeStartSpan]);

  // Feedback State
  const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const saveLayout = () => {
    startTransition(async () => {
      const res = await saveFormLayoutAction(layout);
      if (res.success) {
        setFeedback({ message: "✓ Layout succesvol opgeslagen!", type: 'success' });
      } else {
        setFeedback({ message: "✕ Fout bij opslaan: " + res.error, type: 'error' });
      }
      setTimeout(() => setFeedback(null), 4000);
    });
  };

  // Drag and Drop Handlers
  const handleDragStart = (secIdx: number, fieldIdx: number) => (e: React.DragEvent) => {
    if (resizingItem) return; // Prevent drag during resize!
    setDraggedItem({ secIdx, fieldIdx });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverField = (secIdx: number, fieldIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedItem?.secIdx === secIdx && draggedItem?.fieldIdx === fieldIdx) return;
    setDragOverItem({ secIdx, fieldIdx });
  };

  const handleDropOnField = (secIdx: number, fieldIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedItem) return;
    
    if (draggedItem.secIdx === secIdx && draggedItem.fieldIdx === fieldIdx) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    setLayout(prev => {
      const newLayout = [...prev];
      const sourceSection = { ...newLayout[draggedItem.secIdx], fields: [...newLayout[draggedItem.secIdx].fields] };
      const fieldToMove = sourceSection.fields.splice(draggedItem.fieldIdx, 1)[0];
      newLayout[draggedItem.secIdx] = sourceSection;

      const targetSection = newLayout[secIdx] === sourceSection 
        ? { ...sourceSection } 
        : { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
        
      targetSection.fields.splice(fieldIdx, 0, fieldToMove);
      newLayout[secIdx] = targetSection;
      return newLayout;
    });

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDropOnSection = (secIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedItem) return;
    
    setLayout(prev => {
      const newLayout = [...prev];
      const sourceSection = { ...newLayout[draggedItem.secIdx], fields: [...newLayout[draggedItem.secIdx].fields] };
      const fieldToMove = sourceSection.fields.splice(draggedItem.fieldIdx, 1)[0];
      newLayout[draggedItem.secIdx] = sourceSection;

      const targetSection = newLayout[secIdx] === sourceSection 
        ? { ...sourceSection } 
        : { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
        
      targetSection.fields.push(fieldToMove);
      newLayout[secIdx] = targetSection;
      return newLayout;
    });

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleResizeStart = (e: React.MouseEvent, secIdx: number, fieldIdx: number, currentSpan: number) => {
    e.preventDefault();
    e.stopPropagation(); // prevent triggering DnD start
    setResizingItem({ secIdx, fieldIdx });
    setResizeStartX(e.clientX);
    setResizeStartSpan(currentSpan);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
      <div className="glass" style={{ padding: '2rem', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>
            WYSIWYG Product Formulier Builder
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Sleep velden om ze te verplaatsen, en sleep aan de rechterkant van een blok om de breedte visueel te herschalen op het grid!
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {feedback && (
            <span style={{ 
              color: feedback.type === 'success' ? '#10b981' : '#ef4444', 
              fontSize: '0.9rem', 
              fontWeight: 600,
              animation: 'fadeIn 0.3s ease-in-out'
            }}>
              {feedback.message}
            </span>
          )}
          <button onClick={saveLayout} className="btn btn-primary" disabled={isPending} style={{ boxShadow: '0 4px 14px rgba(225, 191, 220, 0.4)' }}>
            {isPending ? 'Opslaan...' : '💾 Definities Opslaan'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }} ref={gridContainerRef}>
        {layout.map((sec, secIdx) => (
          <section key={sec.id} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <input 
                value={sec.title}
                onChange={(e) => updateSectionTitle(secIdx, e.target.value)}
                style={{ fontSize: '1.25rem', fontWeight: 600, color: sec.color, borderBottom: `2px solid ${sec.color}`, paddingBottom: '0.4rem', borderTop: 'none', borderLeft: 'none', borderRight: 'none', outline: 'none', background: 'transparent', margin: 0, minWidth: '300px' }}
              />
              <div style={{ display: 'flex', gap: '0.2rem' }}>
                <button onClick={() => moveSection(secIdx, -1)} disabled={secIdx === 0} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}>↑</button>
                <button onClick={() => moveSection(secIdx, 1)} disabled={secIdx === layout.length - 1} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.4rem' }}>↓</button>
                <button 
                  onClick={() => removeSection(secIdx)} 
                  disabled={sec.fields.length > 0} 
                  style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '4px', cursor: sec.fields.length > 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.4rem', marginLeft: '0.5rem', opacity: sec.fields.length > 0 ? 0.4 : 1 }}
                  title={sec.fields.length > 0 ? "You must remove all fields first" : "Verwijder Sectie"}
                >
                  ⨉ Verwijder
                </button>
                <button 
                  onClick={() => setShowCustomModal(secIdx)} 
                  style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.6rem', marginLeft: '0.5rem' }}
                >
                  + Velden Toevegen
                </button>
              </div>
            </div>

            <div 
              onDragOver={(e) => { e.preventDefault(); setDragOverItem(null); }}
              onDrop={handleDropOnSection(secIdx)}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', 
                gap: '1.5rem', 
                backgroundColor: 'var(--background)', 
                padding: '2rem', 
                borderRadius: 'var(--radius)', 
                border: `1px solid rgba(0,0,0,0.05)`,
                minHeight: '120px'
              }}
            >
              {sec.fields.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.5 }}>
                  Sleep hier velden naartoe...
                </div>
              )}
              
              {sec.fields.map((f, fieldIdx) => {
                let span = f.width ? Number(f.width) : (f.type === 'textarea' || f.type === 'media' ? 12 : 4);
                if (isNaN(span)) span = 12;

                const isDraggedOver = dragOverItem?.secIdx === secIdx && dragOverItem?.fieldIdx === fieldIdx;
                const isBeingDragged = draggedItem?.secIdx === secIdx && draggedItem?.fieldIdx === fieldIdx;
                const isResizing = resizingItem?.secIdx === secIdx && resizingItem?.fieldIdx === fieldIdx;
                
                return (
                  <div 
                    key={f.id} 
                    draggable={!resizingItem} // prevent HTML drag if we happen to be resizing
                    onDragStart={handleDragStart(secIdx, fieldIdx)}
                    onDragOver={handleDragOverField(secIdx, fieldIdx)}
                    onDrop={handleDropOnField(secIdx, fieldIdx)}
                    style={{ 
                      gridColumn: `span ${span}`, 
                      backgroundColor: 'white',
                      border: isDraggedOver ? `2px dashed ${sec.color}` : '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      cursor: isResizing ? 'col-resize' : 'grab',
                      opacity: isBeingDragged ? 0.4 : 1,
                      transform: isDraggedOver ? 'scale(1.02)' : 'none',
                      transition: isResizing ? 'none' : 'transform 0.1s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.8rem',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingRight: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                        <input 
                          value={f.label}
                          onChange={(e) => updateFieldLabel(secIdx, fieldIdx, e.target.value)}
                          style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', border: '1px dashed transparent', background: 'transparent', padding: '0.1rem 0', width: '90%' }}
                          onFocus={(e) => e.target.style.borderBottom = '1px dashed var(--border)'}
                          onBlur={(e) => e.target.style.borderBottom = '1px dashed transparent'}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#999', fontFamily: 'monospace' }}>{f.id}</span>
                          {f.id.startsWith('FIELD:custom_') && (
                            <button 
                              onClick={() => removeField(secIdx, fieldIdx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Verwijder Veld
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: '0.2rem 0.5rem', backgroundColor: 'var(--surface-hover)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--text)', border: '1px solid var(--border)' }}>
                        {f.type || 'text'}
                      </div>
                    </div>

                    {/* Mock Input Field */}
                    <div style={{ 
                      width: '100%', 
                      height: (f.type === 'textarea' || f.type === 'media') ? '80px' : '38px', 
                      backgroundColor: 'rgba(0,0,0,0.02)', 
                      border: '1px dashed rgba(0,0,0,0.1)', 
                      borderRadius: '4px' 
                    }} />

                    {f.type === 'picklist' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '-0.2rem' }}>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>Opties (komma gescheiden):</label>
                        <input
                          defaultValue={f.options?.join(', ') || ''}
                          onBlur={(e) => updateFieldOptions(secIdx, fieldIdx, e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()} // Prevent dragging the layout element when typing inside this field
                          placeholder="Bijv. Optie 1, Optie 2, Optie 3"
                          style={{
                            width: '90%', padding: '0.4rem 0.5rem', border: '1px solid var(--border)', 
                            borderRadius: '4px', fontSize: '0.75rem', backgroundColor: 'white'
                          }}
                        />
                      </div>
                    )}

                    {/* Visual Drag-to-Resize Handle */}
                    <div
                      onMouseDown={(e) => handleResizeStart(e, secIdx, fieldIdx, span)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: '12px',
                        cursor: 'col-resize',
                        backgroundColor: isResizing ? 'var(--primary)' : 'transparent',
                        borderLeft: '1px solid var(--border)',
                        borderTopRightRadius: '8px',
                        borderBottomRightRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isResizing ? 'var(--primary)' : 'transparent' }}
                    >
                      <div style={{
                        height: '20px',
                        width: '4px',
                        borderLeft: '1px solid rgba(0,0,0,0.3)',
                        borderRight: '1px solid rgba(0,0,0,0.3)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
          <button 
            onClick={addSection} 
            className="btn glass" 
            style={{ width: '100%', padding: '1rem', borderStyle: 'dashed', borderRadius: 'var(--radius)', color: 'var(--text-muted)' }}
          >
            + Nieuwe Sectie Toevoegen
          </button>
        </div>
      </div>

      {showCustomModal !== null && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius)', width: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--primary)' }}>Nieuw Aangepast Veld</h3>
            
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Veld Naam</span>
              <input value={customName} onChange={e => setCustomName(e.target.value)} className="input" placeholder="Bijv. Promotie Code" autoFocus />
            </label>
            
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Type Code</span>
              <select value={customType} onChange={e => setCustomType(e.target.value)} className="input">
                <option value="text">Tekst Veld</option>
                <option value="number">Getal (Cijfers)</option>
                <option value="textarea">Lange Tekst (Textarea)</option>
                <option value="checkbox">2-Standen Schakelaar (Ja/Nee)</option>
                <option value="threeway">3-Standen Schakelaar (Ja/Leeg/Nee)</option>
                <option value="picklist">Keuzelijst (Dropdown)</option>
              </select>
            </label>

            {customType === 'picklist' && (
              <label style={{ display: 'block', marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Opties (scheiden met komma)</span>
                <input value={customOptions} onChange={e => setCustomOptions(e.target.value)} className="input" placeholder="Optie 1, Optie 2, Optie 3" />
              </label>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button className="btn ghost" onClick={() => setShowCustomModal(null)}>Annuleren</button>
              <button className="btn btn-primary" onClick={addCustomField}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
