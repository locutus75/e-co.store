"use client";
import React, { useState, useTransition, useEffect, useRef } from 'react';
import { FormSection, saveFormLayoutAction, FormField, bulkMigrateInternalRemarksAction } from '@/app/actions/formLayouts';

// ── Product column definitions (derived from Prisma schema) ──────────────────
const PRODUCT_COLUMNS: {
  group: string;
  cols: { label: string; field: string; type: string; isRelation?: boolean; relationPath?: string }[]
}[] = [
  {
    group: 'Identificatie',
    cols: [
      { label: 'Artikelnummer', field: 'internalArticleNumber', type: 'text' },
      { label: 'EAN Code',      field: 'ean',                   type: 'text' },
      { label: 'Titel',         field: 'title',                 type: 'text' },
      { label: 'Status',        field: 'status',                type: 'text' },
      { label: 'Webshop Slug',  field: 'webshopSlug',           type: 'text' },
    ],
  },
  {
    group: 'Relaties',
    cols: [
      { label: 'Merk',           field: 'brand.name',     type: 'relation', isRelation: true, relationPath: 'brand.name' },
      { label: 'Leverancier',    field: 'supplier.name',  type: 'relation', isRelation: true, relationPath: 'supplier.name' },
      { label: 'Categorie',      field: 'category.name',  type: 'relation', isRelation: true, relationPath: 'category.name' },
      { label: 'Subcategorie',   field: 'subcategory.name', type: 'relation', isRelation: true, relationPath: 'subcategory.name' },
      { label: 'Toegewezen Aan', field: 'assignedUser.email', type: 'relation', isRelation: true, relationPath: 'assignedUser.email' },
    ],
  },
  {
    group: 'Omschrijving & Content',
    cols: [
      { label: 'Korte Omschrijving', field: 'shortDescription', type: 'textarea' },
      { label: 'Lange Omschrijving', field: 'longDescription',  type: 'textarea' },
      { label: 'Kleur',             field: 'color',            type: 'text' },
      { label: 'Maat',              field: 'size',             type: 'text' },
      { label: 'Materiaal',         field: 'material',         type: 'text' },
      { label: 'Tags',              field: 'tags',             type: 'text' },
    ],
  },
  {
    group: 'Afmetingen & Gewicht',
    cols: [
      { label: 'Gewicht (gr)',  field: 'weightGr', type: 'number' },
      { label: 'Lengte (cm)',   field: 'lengthCm', type: 'number' },
      { label: 'Breedte (cm)',  field: 'widthCm',  type: 'number' },
      { label: 'Hoogte (cm)',   field: 'heightCm', type: 'number' },
      { label: 'Volume (ml)',   field: 'volumeMl', type: 'number' },
      { label: 'Volume (gr)',   field: 'volumeGr', type: 'number' },
    ],
  },
  {
    group: 'Samenstelling',
    cols: [
      { label: 'Ingrediënten',    field: 'ingredients',   type: 'textarea' },
      { label: 'Allergenen',      field: 'allergens',     type: 'text' },
      { label: 'Hoofdmateriaal',  field: 'mainMaterial',  type: 'text' },
    ],
  },
  {
    group: 'Status & Beheer',
    cols: [
      { label: 'Klaar voor Import',    field: 'readyForImport',      type: 'text' },
      { label: 'Webshop (Actief)',     field: 'webshopActive',       type: 'checkbox' },
      { label: 'Actief (Systeem)',     field: 'systemActive',        type: 'checkbox' },
      { label: 'Leverancier Contact',  field: 'supplierContacted',   type: 'text' },
      { label: 'Kwaliteitscontrole',   field: 'qualityControlStatus', type: 'text' },
      { label: 'Export Status',        field: 'exportStatus',        type: 'text' },
      { label: 'Publicatierijp',       field: 'publicationReady',    type: 'checkbox' },
    ],
  },
  {
    group: 'Prijs',
    cols: [
      { label: 'Basisprijs (€)', field: 'basePrice', type: 'number' },
    ],
  },
  {
    group: 'SEO',
    cols: [
      { label: 'SEO Titel',           field: 'seoTitle',           type: 'text' },
      { label: 'SEO Meta Beschrijving', field: 'seoMetaDescription', type: 'textarea' },
    ],
  },
  {
    group: 'Interne Notities',
    cols: [
      { label: 'Interne Opmerkingen', field: 'internalRemarks', type: 'textarea' },
      { label: 'Interne Notities',    field: 'internalNotes',   type: 'textarea' },
    ],
  },
  {
    group: 'Criteria – Mens',
    cols: [
      { label: 'Veilig Werk',       field: 'critMensSafeWork',  type: 'text' },
      { label: 'Eerlijk Loon',      field: 'critMensFairWage',  type: 'text' },
      { label: 'Sociaal',           field: 'critMensSocial',    type: 'text' },
    ],
  },
  {
    group: 'Criteria – Dier',
    cols: [
      { label: 'Cruelty Free',     field: 'critDierCrueltyFree', type: 'text' },
      { label: 'Diervriendelijk',  field: 'critDierFriendly',    type: 'text' },
    ],
  },
  {
    group: 'Criteria – Milieu',
    cols: [
      { label: 'Verpakkingsvrij',    field: 'critMilieuPackagingFree',    type: 'text' },
      { label: 'Plasticvrij',        field: 'critMilieuPlasticFree',      type: 'text' },
      { label: 'Recyclebaar',        field: 'critMilieuRecyclable',       type: 'text' },
      { label: 'Biologisch Afbreekbaar', field: 'critMilieuBiodegradable', type: 'text' },
      { label: 'Composteerbaar',     field: 'critMilieuCompostable',      type: 'text' },
      { label: 'CO₂ Gecompenseerd',  field: 'critMilieuCarbonCompensated', type: 'text' },
    ],
  },
  {
    group: 'Criteria – Transport & Overig',
    cols: [
      { label: 'Transportafstand',  field: 'critTransportDistance',  type: 'number' },
      { label: 'Transportmiddel',   field: 'critTransportVehicle',   type: 'text' },
      { label: 'Handgemaakt',       field: 'critHandmade',           type: 'text' },
      { label: 'Natuurlijk',        field: 'critNatural',            type: 'text' },
      { label: 'Circulair',         field: 'critCircular',           type: 'text' },
      { label: 'Overige Criteria',  field: 'critOther',              type: 'text' },
    ],
  },
];

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
  
  const [resizingVerticalItem, setResizingVerticalItem] = useState<{ secIdx: number, fieldIdx: number } | null>(null);
  const [resizeStartY, setResizeStartY] = useState<number>(0);
  const [resizeStartHeight, setResizeStartHeight] = useState<number>(0);
  
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Custom Field Modal State
  const [showCustomModal, setShowCustomModal] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState('text');
  const [customOptions, setCustomOptions] = useState('');
  const [columnSearch, setColumnSearch] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  /** When a column is selected from the picker this is set to `FIELD:fieldName`.
   *  When null a new custom_xxx ID is generated instead. */
  const [customFieldId, setCustomFieldId] = useState<string | null>(null);
  /** For relation fields: the dotted path to resolve (e.g. 'brand.name'). */
  const [customRelationPath, setCustomRelationPath] = useState<string | null>(null);

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

  const updateFieldHeight = (secIdx: number, fieldIdx: number, height: number | undefined) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { ...newLayout[secIdx].fields[fieldIdx], height };
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

  const updateFieldType = (secIdx: number, fieldIdx: number, type: string) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { ...newLayout[secIdx].fields[fieldIdx], type };
      return newLayout;
    });
  };

  const updateFieldColors = (secIdx: number, fieldIdx: number, backgroundColor: string, textColor: string) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { ...newLayout[secIdx].fields[fieldIdx], backgroundColor, textColor };
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

  const updateFieldUseForSearch = (secIdx: number, fieldIdx: number, value: boolean) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], fields: [...newLayout[secIdx].fields] };
      newLayout[secIdx].fields[fieldIdx] = { ...newLayout[secIdx].fields[fieldIdx], useForSearch: value };
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

  const updateSectionColors = (secIdx: number, backgroundColor: string, textColor: string, titleColor: string) => {
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      newLayout[secIdx] = { ...newLayout[secIdx], backgroundColor, textColor, color: titleColor };
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
    const field = layout[secIdx].fields[fieldIdx];
    const isLegacyRemarks = field.id === 'FIELD:internalRemarks' && field.type !== 'chat';

    const confirmMsg = isLegacyRemarks
      ? 'Dit verwijdert het oude Opmerkingen tekstveld.\n\nBestaande opmerkingen worden automatisch overgezet naar de nieuwe Interne Communicatie chat wanneer een product wordt geopend.\n\nDoorgaan?'
      : `Veld "${field.label}" verwijderen uit de layout?`;

    if (!confirm(confirmMsg)) return;

    // If removing the legacy remarks textarea, trigger bulk migration
    if (isLegacyRemarks) {
      startTransition(async () => {
        const res = await bulkMigrateInternalRemarksAction();
        if (!res.success) {
          console.warn('[migration] Bulk migrate partial error:', res.error);
        }
      });
    }

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
    
    // If a column was selected from the picker reuse its FIELD: id;
    // otherwise generate a unique custom ID.
    const id = customFieldId
      ? customFieldId
      : `FIELD:custom_${Math.floor(Math.random()*16777215).toString(16)}_${Date.now()}`;
    
    setLayout(prevLayout => {
      const newLayout = [...prevLayout];
      const newField: FormField = {
        id,
        label: customName.trim(),
        type: customType,
        width: 12,
        ...(customRelationPath ? { relationPath: customRelationPath } : {}),
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
    setColumnSearch('');
    setShowColumnPicker(false);
    setCustomFieldId(null);
    setCustomRelationPath(null);
  };

  // Resizing Effect
  useEffect(() => {
    if (!resizingItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!gridContainerRef.current) return;
      
      const deltaX = e.clientX - resizeStartX;
      const gridWidth = gridContainerRef.current.clientWidth;
      const colWidth = gridWidth / 24; // approximate width of one grid span
      
      const deltaCols = Math.round(deltaX / colWidth);
      let newSpan = resizeStartSpan + deltaCols;
      newSpan = Math.max(1, Math.min(24, newSpan)); // between 1 and 24 columns
      
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

  // Vertical Resizing Effect
  useEffect(() => {
    if (!resizingVerticalItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartY;
      const rowHeight = 40; // baseline height unit
      
      const deltaRows = Math.round(deltaY / rowHeight);
      let newHeightMultiplier = resizeStartHeight + deltaRows;
      newHeightMultiplier = Math.max(1, Math.min(20, newHeightMultiplier)); // 1 to 20 units
      
      updateFieldHeight(resizingVerticalItem.secIdx, resizingVerticalItem.fieldIdx, newHeightMultiplier);
    };

    const handleMouseUp = () => {
      setResizingVerticalItem(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingVerticalItem, resizeStartY, resizeStartHeight]);

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

  const handleVerticalResizeStart = (e: React.MouseEvent, secIdx: number, fieldIdx: number, currentHeight: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingVerticalItem({ secIdx, fieldIdx });
    setResizeStartY(e.clientY);
    setResizeStartHeight(currentHeight);
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input 
                value={sec.title}
                onChange={(e) => updateSectionTitle(secIdx, e.target.value)}
                style={{ fontSize: '1.25rem', fontWeight: 600, color: sec.color, borderBottom: `2px solid ${sec.color}`, paddingBottom: '0.4rem', borderTop: 'none', borderLeft: 'none', borderRight: 'none', outline: 'none', background: 'transparent', margin: 0, minWidth: '300px' }}
              />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.5rem', backgroundColor: 'var(--surface-hover)', borderRadius: 'var(--radius)' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Titel:</label>
                <input 
                  type="color" 
                  value={sec.color || '#000000'} 
                  onChange={(e) => updateSectionColors(secIdx, sec.backgroundColor || '', sec.textColor || '', e.target.value)}
                  style={{ width: '20px', height: '20px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  title="Sectie Titelkleur"
                />
                
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Achtergrond:</label>
                <input 
                  type="color" 
                  value={sec.backgroundColor || '#ffffff'} 
                  onChange={(e) => updateSectionColors(secIdx, e.target.value, sec.textColor || '', sec.color)}
                  style={{ width: '20px', height: '20px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  title="Sectie Achtergrondkleur"
                />

                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Tekst:</label>
                <input 
                  type="color" 
                  value={sec.textColor || '#000000'} 
                  onChange={(e) => updateSectionColors(secIdx, sec.backgroundColor || '', e.target.value, sec.color)}
                  style={{ width: '20px', height: '20px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                  title="Sectie Tekstkleur"
                />
              </div>

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
                  + Veld toevoegen
                </button>
              </div>
            </div>

            <div 
              onDragOver={(e) => { e.preventDefault(); setDragOverItem(null); }}
              onDrop={handleDropOnSection(secIdx)}
              style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', 
                gap: '0.75rem', 
                backgroundColor: sec.backgroundColor || 'var(--background)', 
                padding: '1rem', 
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
                let span = f.width ? Number(f.width) : (f.type === 'textarea' || f.type === 'media' || f.type === 'chat' ? 24 : 8);
                if (isNaN(span)) span = 24;
                
                let heightMultiplier = f.height || 1;
                if (f.type === 'textarea' && !f.height) heightMultiplier = 3;
                if (f.type === 'media' && !f.height) heightMultiplier = 5;
                if (f.type === 'chat' && !f.height) heightMultiplier = 10;

                const isDraggedOver = dragOverItem?.secIdx === secIdx && dragOverItem?.fieldIdx === fieldIdx;
                const isBeingDragged = draggedItem?.secIdx === secIdx && draggedItem?.fieldIdx === fieldIdx;
                const isResizing = resizingItem?.secIdx === secIdx && resizingItem?.fieldIdx === fieldIdx;
                const isResizingVertical = resizingVerticalItem?.secIdx === secIdx && resizingVerticalItem?.fieldIdx === fieldIdx;
                
                return (
                  <div 
                    key={f.id} 
                    draggable={!resizingItem && !resizingVerticalItem} // prevent HTML drag if we happen to be resizing
                    onDragStart={handleDragStart(secIdx, fieldIdx)}
                    onDragOver={handleDragOverField(secIdx, fieldIdx)}
                    onDrop={handleDropOnField(secIdx, fieldIdx)}
                    style={{ 
                      gridColumn: `span ${span}`, 
                      backgroundColor: f.backgroundColor || 'white',
                      border: isDraggedOver ? `2px dashed ${sec.color}` : '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: (isResizing || isResizingVertical) ? 'auto' : 'grab',
                      opacity: isBeingDragged ? 0.4 : 1,
                      transform: isDraggedOver ? 'scale(1.02)' : 'none',
                      transition: (isResizing || isResizingVertical) ? 'none' : 'transform 0.1s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      position: 'relative',
                      padding: '0.75rem 0.75rem 0.5rem',
                    }}
                  >
                    {/* ── Zone 1: Label + drag gripper ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ color: '#ccc', fontSize: '0.85rem', userSelect: 'none', flexShrink: 0, cursor: 'grab' }} title="Slepen">⠿⠿</span>
                      <input
                        value={f.label}
                        onChange={(e) => updateFieldLabel(secIdx, fieldIdx, e.target.value)}
                        onMouseDown={e => e.stopPropagation()}
                        style={{
                          flex: 1, minWidth: 0,
                          fontSize: '0.82rem', fontWeight: 700,
                          color: f.textColor || 'var(--text)',
                          border: 'none', background: 'transparent',
                          padding: '0.1rem 0',
                          outline: 'none',
                          borderBottom: '1px dashed transparent',
                          transition: 'border-color 0.15s',
                        }}
                        onFocus={e => (e.target.style.borderBottomColor = 'var(--border)')}
                        onBlur={e => (e.target.style.borderBottomColor = 'transparent')}
                      />
                    </div>

                    {/* Field ID badge */}
                    <div style={{ fontSize: '0.58rem', color: '#bbb', fontFamily: 'monospace', paddingLeft: '1.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '-0.3rem' }}>
                      {f.id}
                    </div>

                    {/* Mock Input Field */}
                    {f.type === 'chat' ? (
                      <div style={{
                        width: '100%',
                        minHeight: `${Math.max(38, heightMultiplier * 40)}px`,
                        backgroundColor: 'rgba(99,102,241,0.05)',
                        border: '1px dashed #6366f1',
                        borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', gap: '0.3rem'
                      }}>
                        <span style={{ fontSize: '1.5rem' }}>💬</span>
                        <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 600 }}>Interne Communicatie Chat</span>
                      </div>
                    ) : (
                      <div style={{
                        width: '100%',
                        minHeight: `${Math.max(38, heightMultiplier * 40)}px`,
                        backgroundColor: 'rgba(0,0,0,0.02)',
                        border: '1px dashed rgba(0,0,0,0.1)',
                        borderRadius: '4px'
                      }} />
                    )}

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

                    {/* ── Zone 3: Bottom control bar ── */}
                    <div
                      onMouseDown={e => e.stopPropagation()}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      <select
                        value={f.type || 'text'}
                        onChange={(e) => updateFieldType(secIdx, fieldIdx, e.target.value)}
                        style={{
                          flex: 1, minWidth: 0,
                          padding: '0.2rem 0.4rem',
                          backgroundColor: 'var(--surface-hover)',
                          borderRadius: '4px',
                          fontSize: '0.68rem',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <option value="text">Tekst</option>
                        <option value="number">Getal</option>
                        <option value="textarea">Lange Tekst</option>
                        <option value="checkbox">Schakelaar (Ja/Nee)</option>
                        <option value="threeway">3-Standen</option>
                        <option value="picklist">Keuzelijst</option>
                        <option value="media">Media</option>
                        <option value="chat">💬 Chat</option>
                      </select>
                      <input type="color" value={f.backgroundColor || '#ffffff'}
                        onChange={(e) => updateFieldColors(secIdx, fieldIdx, e.target.value, f.textColor || '')}
                        style={{ width: '18px', height: '18px', padding: 0, border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }}
                        title="Achtergrondkleur" />
                      <input type="color" value={f.textColor || '#000000'}
                        onChange={(e) => updateFieldColors(secIdx, fieldIdx, f.backgroundColor || '', e.target.value)}
                        style={{ width: '18px', height: '18px', padding: 0, border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', flexShrink: 0 }}
                        title="Tekstkleur" />
                      {/* Google search toggle — not available for chat/media */}
                      {f.type !== 'chat' && f.type !== 'media' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); updateFieldUseForSearch(secIdx, fieldIdx, !f.useForSearch); }}
                          title={f.useForSearch ? 'Wordt gebruikt in Google zoekopdracht — klik om uit te zetten' : 'Niet gebruikt in Google zoekopdracht — klik om aan te zetten'}
                          style={{
                            width: '24px', height: '24px', borderRadius: '4px', flexShrink: 0,
                            border: f.useForSearch ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                            backgroundColor: f.useForSearch ? '#2563eb' : '#f8fafc',
                            color: f.useForSearch ? 'white' : '#cbd5e1',
                            cursor: 'pointer', fontSize: '0.7rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: f.useForSearch ? '0 0 0 2px rgba(37,99,235,0.25)' : 'none',
                            transition: 'all 0.15s',
                          }}
                        >🔍</button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeField(secIdx, fieldIdx); }}
                        title="Veld verwijderen"
                        style={{
                          width: '24px', height: '24px', borderRadius: '4px',
                          border: '1px solid #fca5a5', backgroundColor: '#fef2f2',
                          color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                      >🗑</button>
                    </div>

                    {/* Visual Drag-to-Resize Handle Horizontal */}
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
                        zIndex: 10
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

                    {/* Visual Drag-to-Resize Handle Vertical */}
                    <div
                      onMouseDown={(e) => handleVerticalResizeStart(e, secIdx, fieldIdx, heightMultiplier)}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '12px',
                        cursor: 'row-resize',
                        backgroundColor: isResizingVertical ? 'var(--primary)' : 'transparent',
                        borderTop: '1px solid var(--border)',
                        borderBottomLeftRadius: '8px',
                        borderBottomRightRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background-color 0.1s',
                        zIndex: 10
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isResizingVertical ? 'var(--primary)' : 'transparent' }}
                    >
                      <div style={{
                        width: '20px',
                        height: '4px',
                        borderTop: '1px solid rgba(0,0,0,0.3)',
                        borderBottom: '1px solid rgba(0,0,0,0.3)',
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
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius)', width: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--primary)' }}>Nieuw Aangepast Veld</h3>

            {/* ── Column picker ── */}
            <div style={{ marginBottom: '1.25rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setShowColumnPicker(v => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.55rem 0.85rem', background: 'var(--surface)', border: 'none',
                  cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)',
                }}
              >
                <span>📋 Selecteer uit producttabel</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{showColumnPicker ? '▲ Inklappen' : '▼ Uitklappen'}</span>
              </button>

              {showColumnPicker && (
                <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <input
                    value={columnSearch}
                    onChange={e => setColumnSearch(e.target.value)}
                    placeholder="Filter kolommen..."
                    style={{ padding: '0.4rem 0.65rem', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.8rem', outline: 'none', width: '100%' }}
                  />
                  {PRODUCT_COLUMNS
                    .map(group => ({
                      ...group,
                      cols: group.cols.filter(c =>
                        !columnSearch ||
                        c.label.toLowerCase().includes(columnSearch.toLowerCase()) ||
                        c.field.toLowerCase().includes(columnSearch.toLowerCase())
                      ),
                    }))
                    .filter(g => g.cols.length > 0)
                    .map(group => (
                      <div key={group.group}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                          {group.group}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                          {group.cols.map(col => (
                            <button
                              key={col.field}
                              type="button"
                              onClick={() => {
                                setCustomName(col.label);
                                setCustomType(col.type);
                                // For relation fields use a clean ID; for regular columns use FIELD:fieldName
                                const fieldId = col.isRelation
                                  ? `FIELD:rel_${col.field.split('.')[0]}`
                                  : `FIELD:${col.field}`;
                                setCustomFieldId(fieldId);
                                setCustomRelationPath(col.isRelation ? col.field : null);
                                setShowColumnPicker(false);
                                setColumnSearch('');
                              }}
                              title={col.isRelation
                                ? `Veld: ${col.field} — Let op: toont een intern ID, niet de naam`
                                : `Veld: ${col.field}`
                              }
                              style={{
                                padding: '0.25rem 0.6rem', borderRadius: '1rem',
                                border: `1px solid ${col.isRelation ? '#f97316' : 'var(--border)'}`,
                                background: col.isRelation ? '#fff7ed' : 'var(--surface-hover)',
                                fontSize: '0.75rem', cursor: 'pointer',
                                color: col.isRelation ? '#c2410c' : 'var(--text)',
                                transition: 'border-color 0.15s, background 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary)20'; }}
                              onMouseLeave={e => {
                                e.currentTarget.style.borderColor = col.isRelation ? '#f97316' : 'var(--border)';
                                e.currentTarget.style.background = col.isRelation ? '#fff7ed' : 'var(--surface-hover)';
                              }}
                            >
                              {col.label}
                              <span style={{ marginLeft: '0.3rem', opacity: 0.45, fontSize: '0.65rem' }}>{col.field}</span>
                              {col.isRelation && <span style={{ marginLeft: '0.3rem', fontSize: '0.6rem' }}>⚠</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Veld Naam</span>
              <input value={customName} onChange={e => { setCustomName(e.target.value); setCustomFieldId(null); }} className="input" placeholder="Bijv. Promotie Code" autoFocus />
            </label>
            {customFieldId && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '1rem', padding: '0.3rem 0.6rem', backgroundColor: 'var(--surface)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                🔗 Gekoppeld aan kolom: <code style={{ fontWeight: 700, color: 'var(--primary)' }}>{customFieldId}</code>
                {customFieldId && PRODUCT_COLUMNS.flatMap(g => g.cols).find(c => `FIELD:${c.field}` === customFieldId)?.isRelation && (
                  <span style={{ marginLeft: '0.5rem', color: '#c2410c', fontWeight: 600 }}>⚠ Relatie-veld — toont intern ID, niet de naam</span>
                )}
              </div>
            )}
            
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Type Code</span>
              <select value={customType} onChange={e => setCustomType(e.target.value)} className="input">
                <option value="text">Tekst Veld</option>
                <option value="number">Getal (Cijfers)</option>
                <option value="textarea">Lange Tekst (Textarea)</option>
                <option value="checkbox">2-Standen Schakelaar (Ja/Nee)</option>
                <option value="threeway">3-Standen Schakelaar (Ja/Leeg/Nee)</option>
                <option value="picklist">Keuzelijst (Dropdown)</option>
                <option value="chat">💬 Interne Communicatie Chat</option>
              </select>
            </label>

            {customType === 'picklist' && (
              <label style={{ display: 'block', marginBottom: '1.5rem' }}>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Opties (scheiden met komma)</span>
                <input value={customOptions} onChange={e => setCustomOptions(e.target.value)} className="input" placeholder="Optie 1, Optie 2, Optie 3" />
              </label>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button className="btn ghost" onClick={() => { setShowCustomModal(null); setCustomFieldId(null); setCustomRelationPath(null); }}>Annuleren</button>
              <button className="btn btn-primary" onClick={addCustomField}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
