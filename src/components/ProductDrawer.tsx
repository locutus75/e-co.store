"use client";
import React, { useEffect, useState, useTransition } from 'react';
import ProductGallery from './ProductGallery';
import { updateProductAction } from '@/app/actions/product';
import ProductCopyModal from './ProductCopyModal';
import ProductRemarksChat from './ProductRemarksChat';
import ProductAiPanel from './ProductAiPanel';
import AiFieldSuggestion from './AiFieldSuggestion';

/**
 * Builds a Google search URL using fields marked `useForSearch` in the layout.
 * Identical logic to the one in ProductsClient — resolves plain and relation paths.
 */
function buildGoogleSearchUrl(product: any, layout: any[]): string | null {
  const parts: string[] = [];
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (!field.useForSearch) continue;
      let value: any;
      if (field.relationPath) {
        value = field.relationPath.split('.').reduce((obj: any, key: string) => obj?.[key], product);
      } else {
        const key = field.id.replace('FIELD:', '');
        value = key.startsWith('custom_')
          ? product.customData?.[key.replace('custom_', '')]
          : product[key];
      }
      const str = value?.toString().trim();
      if (str) parts.push(str);
    }
  }
  if (parts.length === 0) return null;
  return 'https://www.google.com/search?q=' + parts.map(p => encodeURIComponent(p)).join('+');
}

const JaNeeToggle = ({ name, defaultChecked, disabled, onChange }: { name?: string, defaultChecked: boolean, disabled?: boolean, onChange?: () => void }) => {
  const [checked, setChecked] = useState(defaultChecked);

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    setChecked(e.target.checked);
    if (onChange) onChange();
  };

  return (
    <label style={{ display: 'flex', alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, position: 'relative', width: 'fit-content' }}>
      <input 
        type="checkbox" 
        name={name} 
        checked={checked} 
        onChange={handleToggle}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        disabled={disabled}
      />
      <div style={{
        position: 'relative', width: '56px', height: '28px',
        backgroundColor: checked ? '#10b981' : '#ef4444',
        borderRadius: '30px', transition: 'background-color 0.2s',
        display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-start' : 'flex-end',
        padding: '0 6px',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <span style={{ fontSize: '0.65rem', color: 'white', fontWeight: 700, pointerEvents: 'none', zIndex: 1, textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>
          {checked ? 'JA' : 'NEE'}
        </span>
        <div style={{
          position: 'absolute', top: '2px', left: checked ? 'calc(100% - 26px)' : '2px',
          width: '24px', height: '24px', backgroundColor: 'white',
          borderRadius: '50%', transition: 'left 0.2s',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }} />
      </div>
    </label>
  );
};

const ThreeWayToggle = ({ name, defaultValue, disabled, onChange }: { name?: string, defaultValue?: string | null, disabled?: boolean, onChange?: () => void }) => {
  // 'Ja', 'Nee', or null (Leeg)
  const [val, setVal] = useState<'Ja'|'Nee'|'Leeg'>(defaultValue === 'Ja' ? 'Ja' : (defaultValue === 'Nee' ? 'Nee' : 'Leeg'));

  let bg = '#94a3b8'; // Leeg (grey)
  let pos = '50%'; // center
  let transform = 'translate(-50%, 0)';

  if (val === 'Ja') { bg = '#10b981'; pos = 'calc(100% - 2px)'; transform = 'translate(-100%, 0)'; }
  else if (val === 'Nee') { bg = '#ef4444'; pos = '2px'; transform = 'translate(0, 0)'; }

  // Clicking cycles logic
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const third = rect.width / 3;
    let newVal: 'Ja'|'Nee'|'Leeg' = 'Leeg';
    if (x < third) newVal = 'Nee';
    else if (x > third * 2) newVal = 'Ja';
    
    setVal(newVal);
    if (onChange) onChange();
  };

  return (
    <div 
      onClick={handleClick}
      style={{ 
        position: 'relative', width: '84px', height: '28px', backgroundColor: bg, 
        borderRadius: '30px', transition: 'background-color 0.2s', cursor: disabled ? 'not-allowed' : 'pointer', 
        opacity: disabled ? 0.6 : 1, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', padding: '0 8px'
      }}
    >
      <input type="hidden" name={name} value={val} />
      
      {/* Background Labels Context */}
      <div style={{ position: 'absolute', inset: '0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pointerEvents: 'none', zIndex: 0 }}>
        {val === 'Leeg' && (
          <>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>N</span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>J</span>
          </>
        )}
        {val === 'Ja' && (
          <span style={{ fontSize: '0.65rem', color: 'white', fontWeight: 700, textShadow: '0 1px 1px rgba(0,0,0,0.2)', width: '100%', textAlign: 'left', paddingLeft: '4px' }}>JA</span>
        )}
        {val === 'Nee' && (
          <span style={{ fontSize: '0.65rem', color: 'white', fontWeight: 700, textShadow: '0 1px 1px rgba(0,0,0,0.2)', width: '100%', textAlign: 'right', paddingRight: '4px' }}>NEE</span>
        )}
      </div>

      {/* Thumb */}
      <div style={{
        position: 'absolute', top: '2px', left: pos, transform: transform,
        width: '24px', height: '24px', backgroundColor: 'white',
        borderRadius: '50%', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 1
      }} />
    </div>
  );
};


export default function ProductDrawer({ product, isOpen, onClose, fieldPermissions, isAdmin = false, canUseAi = false, layout = [], currentUserId = '', currentUserChatColor = null, userChatColors = {} }: { product: any, isOpen: boolean, onClose: () => void, fieldPermissions?: Record<string, string>, isAdmin?: boolean, canUseAi?: boolean, layout?: any[], currentUserId?: string, currentUserChatColor?: string | null, userChatColors?: Record<string, string> }) {
  const [isPending, startTransition] = useTransition();
  const [statusOverridden, setStatusOverridden] = useState(false);
  const currentStatus = (product?.status || 'NEW').toUpperCase();
  const [activeStatus, setActiveStatus] = useState(currentStatus);

  const lockStatus = (product?.readyForImport || '').toUpperCase();
  const isGloballyLocked = !isAdmin && (lockStatus === 'JA' || lockStatus === 'REVIEW' || lockStatus === 'R' || lockStatus === 'Y');

  // Deep clone data to allow programmatic UI refreshes without mutations
  const [localProductData, setLocalProductData] = useState<any>(product);
  const [formKey, setFormKey] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  // AI field suggestions — narrative loaded from DB when drawer opens
  const [analysisNarrative, setAnalysisNarrative] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveStatus((product?.status || 'NEW').toUpperCase());
      setStatusOverridden(false);
      setLocalProductData(product ? JSON.parse(JSON.stringify(product)) : null);
      setFormKey(k => k + 1);
      setIsDirty(false);
      setShowUnsavedWarning(false);
    }
  }, [product, isOpen]);

  // Load the AI analysis narrative for field suggestions (canUseAi users only)
  useEffect(() => {
    if (!isOpen || !canUseAi || !product?.internalArticleNumber) { setAnalysisNarrative(null); return; }
    fetch(`/api/ai/analysis?article=${encodeURIComponent(product.internalArticleNumber)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.analysis?.response) {
          const raw: string = d.analysis.response;
          const idx = raw.lastIndexOf('```json');
          setAnalysisNarrative(idx >= 0 ? raw.slice(0, idx).trim() : raw.trim());
        } else {
          setAnalysisNarrative(null);
        }
      })
      .catch(() => setAnalysisNarrative(null));
  }, [isOpen, product?.internalArticleNumber, canUseAi]);

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  const handleCopyCommit = (injectedData: any) => {
    const fresh = { ...localProductData, ...injectedData };
    setLocalProductData(fresh);
    setFormKey(k => k + 1);
    setShowCopyModal(false);
    setIsDirty(true);
    
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 4000);
  };

  const getStatusColor = (status: string) => {
    switch ((status || 'NEW').toUpperCase()) {
      case 'NEW': return 'var(--primary)';
      case 'EDIT': return 'var(--color-mustard)';
      case 'CHECK': return '#3b82f6';
      case 'DONE': return '#10b981';
      default: return 'var(--text-muted)';
    }
  };

  // Lock background scroll when drawer is open — prevents double scrollbar
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showUnsavedWarning && !showCopyModal) {
        if (isDirty) {
          setShowUnsavedWarning(true);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, showUnsavedWarning, showCopyModal, onClose]);

  const handleSubmit = (formData: FormData) => {
    // Auto-fallback: if the user did NOT touch the status dropdown during this edit session,
    // we forcibly intercept the form save and tag the product as 'EDIT'.
    if (!statusOverridden && formData.get('status') !== 'EDIT') {
      formData.set('status', 'EDIT');
    }
    
    startTransition(async () => {
      if(product?.internalArticleNumber) {
        await updateProductAction(product.internalArticleNumber, formData);
        onClose();
      }
    });
  };

  // Apply an AI-suggested value directly to the DOM input (non-destructive — no re-mount)
  const applyAiSuggestion = (fieldKey: string, value: string) => {
    const form = formRef.current;
    if (!form) return;
    const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${fieldKey}"]`);
    if (el) { el.value = value; setIsDirty(true); }
  };

  const renderField = (moduleName: string, label: string, val: string, inputComponent: React.ReactNode, isCheckbox: boolean = false, textColor?: string, fieldKey?: string, fieldInstruction?: string) => {
    let action = isAdmin ? 'WRITE' : (fieldPermissions?.[moduleName] ?? 'READ');
    if (isGloballyLocked) action = 'READ';

    // internalArticleNumber is explicitly READ-only even for Admins usually
    if (moduleName === 'FIELD:internalArticleNumber') {
      action = 'READ';
    }

    if (action === 'HIDDEN') return null;
    
    let key = moduleName.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription';
    
    const writeIndicator = action !== 'READ' ? <input type="hidden" name="_present_fields" value={key} /> : null;

    // AI suggestion button — only for writable text-type fields when an analysis is available
    const showAiBtn = canUseAi && analysisNarrative && !isCheckbox && action !== 'READ' && fieldKey;
    const aiBtn = showAiBtn ? (
      <AiFieldSuggestion
        fieldKey={fieldKey!}
        fieldLabel={label}
        currentValue={val}
        analysisNarrative={analysisNarrative!}
        productTitle={localProductData?.title || ''}
        fieldInstruction={fieldInstruction}
        onApply={(suggestion) => applyAiSuggestion(fieldKey!, suggestion)}
      />
    ) : null;
    
    if (isCheckbox) {
      const isCriteria = moduleName.startsWith('FIELD:crit');
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          {writeIndicator}
          {action === 'READ' ? (
            isCriteria ? (
              <ThreeWayToggle defaultValue={val} disabled />
            ) : (
              <JaNeeToggle defaultChecked={val === 'Ja' || val === 'true' || (val as any) === true} disabled />
            )
          ) : (
            React.cloneElement(inputComponent as React.ReactElement<any>, { onChange: () => setIsDirty(true) })
          )}
          <span style={{ fontSize: '0.9rem', color: 'inherit', opacity: action === 'READ' ? 0.6 : 1, fontWeight: 500 }}>
            {label}
          </span>
        </div>
      );
    }

    return (
      <div>
        {writeIndicator}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600, color: 'inherit', opacity: 0.7, marginBottom: '0.4rem' }}>
          {label}{aiBtn}
        </label>
        {action === 'READ' ? (
          <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'inherit', opacity: 0.7, cursor: 'not-allowed', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center' }}>
            {val || '-'}
          </div>
        ) : (
          React.cloneElement(inputComponent as React.ReactElement<any>, { onChange: (e: any) => {
            const originalOnChange = (inputComponent as React.ReactElement<any>).props.onChange;
            if (originalOnChange) originalOnChange(e);
            setIsDirty(true);
          }})
        )}
      </div>
    );
  };

  const renderDataField = (f: any, section: any) => {
    let key = f.id.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription'; // Backward compatibility fix
    
    const effectiveTextColor = f.textColor || section?.textColor || 'var(--text)';
    
    let val;

    // ── Relation fields: resolve dotted path on the product object ───────────
    if (f.type === 'relation' && f.relationPath) {
      const parts = f.relationPath.split('.');
      let resolved: any = localProductData;
      for (const p of parts) { resolved = resolved?.[p]; }
      // For email addresses (assignedUser) strip the domain for brevity
      const displayVal = typeof resolved === 'string' && resolved.includes('@')
        ? resolved.split('@')[0]
        : (resolved?.toString() ?? null);

      let span = f.width ? Number(f.width) : 8;
      if (isNaN(span)) span = 8;

      return (
        <div key={f.id} style={{ gridColumn: `span ${span}`, backgroundColor: f.backgroundColor || 'transparent', padding: f.backgroundColor ? '0.75rem' : '0', borderRadius: 'var(--radius)', color: effectiveTextColor }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'inherit', opacity: 0.7, marginBottom: '0.4rem' }}>{f.label}</label>
          <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'inherit', opacity: 0.75, cursor: 'default', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>🔗</span>
            {displayVal || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>—</span>}
          </div>
        </div>
      );
    }
    // ── Special: article number — show as Google search link when configured ─
    if (f.id === 'FIELD:internalArticleNumber') {
      const googleUrl = buildGoogleSearchUrl(localProductData, layout);
      let span = f.width ? Number(f.width) : 8;
      if (isNaN(span)) span = 8;
      return (
        <div key={f.id} style={{ gridColumn: `span ${span}`, backgroundColor: f.backgroundColor || 'transparent', padding: f.backgroundColor ? '0.75rem' : '0', borderRadius: 'var(--radius)', color: effectiveTextColor }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'inherit', opacity: 0.7, marginBottom: '0.4rem' }}>{f.label}</label>
          <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, color: 'inherit' }}>{localProductData?.internalArticleNumber}</span>
            {googleUrl && (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Google zoeken op basis van gemarkeerde velden"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.75rem', color: '#2563eb', textDecoration: 'none',
                  padding: '0.15rem 0.5rem', borderRadius: '4px',
                  border: '1px solid #bfdbfe', backgroundColor: '#eff6ff',
                  transition: 'opacity 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                🌐
              </a>
            )}
          </div>
        </div>
      );
    }

    if (key.startsWith('custom_')) {
      val = localProductData?.customData ? localProductData.customData[key.replace('custom_', '')] : null;
    } else {
      val = localProductData?.[key];
    }

    let inputComponent;
    let isCheckbox = false;

    let heightMultiplier = f.height || 1;
    if (f.type === 'textarea' && !f.height) heightMultiplier = 3;
    if (f.type === 'media' && !f.height) heightMultiplier = 5;
    const computedHeight = `${Math.max(38, heightMultiplier * 40)}px`;

    if (f.id === 'FIELD:media') {
      inputComponent = <div style={{ minHeight: computedHeight }}><ProductGallery articleNumber={localProductData?.internalArticleNumber} canUseAi={canUseAi} /></div>;
    } else if (f.type === 'chat') {
      // Render the chat panel directly — no wrapping label, no write-indicator.
      // Stop change-event propagation so the form's onChange does NOT flag isDirty
      // just because the user typed a chat message (those save independently).
      const chatHeight = Math.max(280, (f.height || 10) * 40);
      return (
        <div key={f.id} style={{ gridColumn: `span 24` }} onChange={(e) => e.stopPropagation()}>
          <ProductRemarksChat
            articleNumber={localProductData.internalArticleNumber}
            currentUserId={currentUserId}
            currentUserChatColor={currentUserChatColor}
            userChatColors={userChatColors}
            isAdmin={isAdmin}
            isOpen={isOpen}
            height={chatHeight}
            title={f.label}
          />
        </div>
      );
    } else if (f.type === 'checkbox') {
      isCheckbox = true;
      if (f.id.startsWith('FIELD:crit')) {
        inputComponent = <ThreeWayToggle name={key} defaultValue={val} />;
      } else {
        inputComponent = <JaNeeToggle name={key} defaultChecked={(val as any) === true || val === 'Ja'} />;
      }
    } else if (f.type === 'threeway') {
      isCheckbox = true; // Technically a toggle rendering styling
      inputComponent = <ThreeWayToggle name={key} defaultValue={val} />;
    } else if (f.type === 'picklist') {
      const options = f.options || [];
      const datalistId = `datalist_${key}`;
      inputComponent = (
        <div style={{ width: '100%' }}>
          <input 
            type="text" 
            name={key} 
            list={datalistId} 
            className="input" 
            defaultValue={val || ''} 
            placeholder="Selecteer of typ vrij..."
            style={{ width: '100%', minHeight: computedHeight, color: 'inherit' }}
          />
          <datalist id={datalistId}>
            {options.map((opt: string) => <option key={opt} value={opt} />)}
          </datalist>
        </div>
      );
    } else if (f.type === 'number') {
      inputComponent = <input type="number" step="any" name={key} className="input" defaultValue={val ?? ''} style={{ minHeight: computedHeight, color: 'inherit' }} />;
    } else if (f.type === 'textarea') {
      inputComponent = <textarea name={key} className="input" defaultValue={val || ''} style={{ minHeight: computedHeight, resize: 'vertical', color: 'inherit' }} />;
    } else {
      const readOnly = f.id === 'FIELD:internalArticleNumber';
      inputComponent = <input name={key} className="input" defaultValue={val || ''} readOnly={readOnly} style={{ minHeight: computedHeight, backgroundColor: readOnly ? 'rgba(0,0,0,0.02)' : undefined, color: 'inherit' }} />;
    }

    let span = f.width ? Number(f.width) : (f.type === 'textarea' || f.type === 'media' ? 24 : 8);
    if (isNaN(span) || f.width === 'full') span = 24; // Backwards compatibility for exact strings
    if (f.width === '1') span = 8;
    if (f.width === '2') span = 16;
    
    // Only show AI suggestion button for text-compatible, non-system fields
    const isAiEligible = !isCheckbox &&
      f.type !== 'media' && f.type !== 'chat' && f.type !== 'relation' &&
      f.id !== 'FIELD:internalArticleNumber';

    return (
      <div key={f.id} style={{ gridColumn: `span ${span}`, backgroundColor: f.backgroundColor || 'transparent', padding: f.backgroundColor ? '0.75rem' : '0', borderRadius: 'var(--radius)', color: effectiveTextColor }}>
        {renderField(f.id, f.label, val?.toString() ?? '', inputComponent, isCheckbox, effectiveTextColor, isAiEligible ? key : undefined, f.aiInstruction)}
      </div>
    );
  };


  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <div 
          onClick={handleCloseAttempt}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40, backdropFilter: 'blur(2px)' }} 
        />
      )}

      {/* Drawer */}
      <form ref={formRef} key={formKey} action={handleSubmit} onChange={() => setIsDirty(true)} className="glass" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'calc(100vw - 250px)',
        backgroundColor: 'var(--surface)',
        zIndex: 50,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        overflowY: 'auto',
        boxShadow: '-10px 0 30px rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column'
      }}>
        {localProductData && (
          <>
            <div style={{ padding: '2rem 3rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 10, backdropFilter: 'blur(8px)' }}>
              <div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>Edit Product #{localProductData.internalArticleNumber}</h2>
                {/* Last edited info */}
                {(localProductData.updatedAt || localProductData.lastEditedByUser) && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🕐</span>
                    <span>
                      Laatste bewerking:{' '}
                      {localProductData.updatedAt
                        ? new Date(localProductData.updatedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                      {localProductData.lastEditedByUser?.email && (
                        <> door <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{localProductData.lastEditedByUser.email.split('@')[0]}</strong></>
                      )}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>

                  <span style={{ fontSize: '1rem', color: 'var(--color-mustard)', fontWeight: 600 }}>{localProductData.title}</span>
                  <select 
                    name="status"
                    value={activeStatus}
                    disabled={isGloballyLocked}
                    onChange={(e) => {
                      setStatusOverridden(true);
                      setActiveStatus(e.target.value);
                      setIsDirty(true);
                    }}
                    style={{ 
                      padding: '0.25rem 1.75rem 0.25rem 0.75rem', 
                      borderRadius: '4px', 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      backgroundColor: getStatusColor(activeStatus), 
                      color: 'white',
                      border: 'none',
                      outline: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                      backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="white" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 2px center',
                      backgroundSize: '16px',
                      cursor: 'pointer'
                    }}
                  >
                    {['NEW', 'EDIT', 'CHECK', 'DONE'].map(s => (
                      <option key={s} value={s} style={{ color: 'var(--text)', backgroundColor: 'white' }}>{s}</option>
                    ))}
                  </select>
                  
                  {!isGloballyLocked && (
                    <button 
                      type="button"
                      title="Kopieer data van product (zelfde leverancier)"
                      onClick={() => setShowCopyModal(true)}
                      style={{ 
                        padding: '0.25rem 0.6rem', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        backgroundColor: 'transparent', 
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center', gap: '0.3rem',
                        marginLeft: '0.5rem'
                      }}
                    >
                      🖨 Kopieer Data
                    </button>
                  )}
                  {canUseAi && (
                    <ProductAiPanel product={localProductData} layout={layout} isAdmin={isAdmin} />
                  )}
                </div>
              </div>
              <button type="button" onClick={handleCloseAttempt} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.75rem', color: 'var(--text-muted)' }}>✕</button>
            </div>

            <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', gap: '4rem' }}>
              {layout?.map((section) => (
                <section key={section.id}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: section.color, marginBottom: '1rem', borderBottom: `2px solid ${section.color}`, paddingBottom: '0.5rem', display: 'inline-block' }}>{section.title}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: '0.75rem', backgroundColor: section.backgroundColor || 'var(--background)', color: section.textColor || 'var(--text)', padding: '1rem', borderRadius: 'var(--radius)', border: `1px solid rgba(0,0,0,0.05)` }}>
                    {section.fields.map((f: any) => renderDataField(f, section))}
                  </div>
                </section>
              ))}
            </div>

            <div style={{ padding: '2rem 3rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', position: 'sticky', bottom: 0, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', zIndex: 10 }}>
              <button type="button" onClick={handleCloseAttempt} className="btn" style={{ padding: '1rem 2rem', border: '1px solid var(--border)', background: 'transparent' }}>{isGloballyLocked ? 'Sluiten' : 'Annuleren'}</button>
              {isGloballyLocked ? (
                <div style={{ color: 'var(--error)', fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 1rem' }}>
                  🔒 Product is vergrendeld voor review/export
                </div>
              ) : (
                <button type="submit" disabled={isPending} className="btn btn-primary" style={{ padding: '1rem 3rem', boxShadow: '0 4px 14px rgba(225, 191, 220, 0.4)' }}>
                  {isPending ? 'Bezig met opslaan...' : 'Opslaan'}
                </button>
              )}
            </div>
          </>
        )}
      </form>

      {showCopyModal && localProductData?.supplierId && (
        <ProductCopyModal 
          supplierId={localProductData.supplierId}
          currentArticleId={localProductData.internalArticleNumber}
          layout={layout}
          isAdmin={isAdmin}
          fieldPermissions={fieldPermissions}
          onClose={() => setShowCopyModal(false)}
          onCopy={handleCopyCommit}
        />
      )}
      
      {/* Toast Notification */}
      {copySuccess && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '3rem', backgroundColor: '#10b981', color: 'white', padding: '1rem 2rem', borderRadius: 'var(--radius)', boxShadow: '0 10px 40px rgba(16, 185, 129, 0.35)', zIndex: 100, display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, animation: 'slideIn 0.3s ease-out' }}>
          <span style={{ fontSize: '1.25rem' }}>✓</span> 
          <span>Data succesvol gekopieerd! Controleer en klik op Opslaan.</span>
          <style>{`
            @keyframes slideIn {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedWarning && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '20px', width: '90%', maxWidth: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ width: '64px', height: '64px', backgroundColor: '#fff7ed', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '2.5rem' }}>⚠️</span>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#9a3412', fontWeight: 700 }}>Niet Opgeslagen!</h3>
                <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.5' }}>
                  Er zijn wijzigingen gemaakt! Wat wil je met deze aanpassingen doen?
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button 
                onClick={() => { setShowUnsavedWarning(false); formRef.current?.requestSubmit(); }} 
                className="btn btn-primary" 
                style={{ padding: '1.25rem', fontSize: '1.1rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', borderRadius: '12px' }}
              >
                💾 Wijzigingen Opslaan
              </button>
              <button 
                onClick={() => { setShowUnsavedWarning(false); onClose(); }} 
                className="btn" 
                style={{ padding: '1.25rem', fontSize: '1.1rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '12px', fontWeight: 600 }}
              >
                🗑️ Wijzigingen Negeren & Sluiten
              </button>
              <button 
                onClick={() => setShowUnsavedWarning(false)} 
                className="btn ghost" 
                style={{ padding: '1rem', color: 'var(--text-muted)' }}
              >
                Blijf op deze pagina
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
