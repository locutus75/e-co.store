"use client";
import React, { useEffect, useState, useTransition, useRef, useCallback } from 'react';
import ProductGallery from './ProductGallery';
import { updateProductAction, updateProductStatusAction, updateReadyForImportAction, getProductDataAction } from '@/app/actions/product';
import ProductCopyModal from './ProductCopyModal';
import ProductRemarksChat from './ProductRemarksChat';
import ProductAiPanel from './ProductAiPanel';
import AiFieldSuggestion from './AiFieldSuggestion';
import AiSectionSuggestion from './AiSectionSuggestion';
import AiAnalysisViewer from './AiAnalysisViewer';
import ProductWebEnrichModal from './ProductWebEnrichModal';
import ProductEmpcoPanel, { ApplyFixResult } from './ProductEmpcoPanel';
import ProductFieldHistoryModal from './ProductFieldHistoryModal';
import TransferSupplierModal from './TransferSupplierModal';
import FormattingRulePreviewModal, { AppliedFormattingChange } from './FormattingRulePreviewModal';
import EcoPosSyncModal from './EcoPosSyncModal';
import { confirmEmpcoReady } from '@/lib/empcoGateClient';
import { replaceEmpcoFragment } from '@/lib/empco';
import { isReadOnlyProductField } from '@/lib/constants';

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
  const [val, setVal] = useState<'Ja' | 'Nee' | 'Leeg'>(defaultValue === 'Ja' ? 'Ja' : (defaultValue === 'Nee' ? 'Nee' : 'Leeg'));

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
    let newVal: 'Ja' | 'Nee' | 'Leeg' = 'Leeg';
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

function DrawerReadyToggle({ readyMode, internalArticleNumber, isAdmin, onChange }: { readyMode: string, internalArticleNumber: string, isAdmin: boolean, onChange: (val: string) => void }) {
  const [isPending, startTransition] = useTransition();

  const btnStyle = (val: string, color: string) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '26px', height: '26px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem',
    cursor: !isAdmin ? 'not-allowed' : (isPending ? 'wait' : 'pointer'),
    backgroundColor: readyMode === val ? color : 'var(--surface)',
    color: readyMode === val ? 'white' : (!isAdmin ? 'var(--border)' : 'var(--text-muted)'),
    border: readyMode === val ? 'none' : '1px solid var(--border)',
    transition: 'all 0.2s',
    opacity: (!isAdmin && readyMode !== val) ? 0.3 : (isPending ? 0.5 : 1)
  });

  const handleUpdate = (val: string) => {
    if (!isAdmin || readyMode === val) return;
    const previous = readyMode;
    startTransition(async () => {
      // EmpCo policy (warn / block) before marking as webshop-ready
      if (val === 'JA' && !(await confirmEmpcoReady([internalArticleNumber]))) return;
      onChange(val);
      const res = await updateReadyForImportAction(internalArticleNumber, val);
      if (!res.success) {
        alert(res.error ?? 'Bijwerken mislukt');
        onChange(previous);
      }
    });
  };

  return (
    <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem', alignItems: 'center', borderLeft: '1px solid var(--border)', paddingLeft: '0.75rem' }} title="Webshop Ready Status (direct opgeslagen)">
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.2rem' }}>Ready:</span>
      <div style={btnStyle('NEE', 'var(--error)')} onClick={() => handleUpdate('NEE')} title="No (N)">N</div>
      <div style={btnStyle('REVIEW', '#3b82f6')} onClick={() => handleUpdate('REVIEW')} title="Review (R)">R</div>
      <div style={btnStyle('JA', 'var(--success)')} onClick={() => handleUpdate('JA')} title="Yes (Y)">Y</div>
      <input type="hidden" name="_present_fields" value="readyForImport" />
      <input type="hidden" name="readyForImport" value={readyMode} />
    </div>
  );
}


export default function ProductDrawer({ product, isOpen, onClose, fieldPermissions, isAdmin = false, canAssignProducts = false, canEditRolePeers = false, canUseAi = false, canApproveEmpco = true, layout = [], currentUserId = '', currentUserChatColor = null, currentUserAutoMarkRemarksAsRead = true, userChatColors = {}, onPrev, onNext, aiScore = null, onEmpcoCheck, allSuppliers = [] }: { product: any, isOpen: boolean, onClose: () => void, fieldPermissions?: Record<string, string>, isAdmin?: boolean, canAssignProducts?: boolean, canEditRolePeers?: boolean, canUseAi?: boolean, canApproveEmpco?: boolean, layout?: any[], currentUserId?: string, currentUserChatColor?: string | null, currentUserAutoMarkRemarksAsRead?: boolean, userChatColors?: Record<string, string>, onPrev?: () => void, onNext?: () => void, aiScore?: number | null, onEmpcoCheck?: (articleNumber: string, status: string, stale: boolean, issueCount: number) => void, allSuppliers?: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const [pendingNavigation, setPendingNavigation] = useState<'prev' | 'next' | null>(null);
  const [statusOverridden, setStatusOverridden] = useState(false);
  const currentStatus = (product?.status || 'NEW').toUpperCase();
  const [activeStatus, setActiveStatus] = useState(currentStatus);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [chatUnreadCount, setChatUnreadCount] = useState<number>(0);
  const initializedProductId = useRef<string | null>(null);
  const saveModeRef = useRef<'save' | 'save_close'>('save_close');

  // Deep clone data to allow programmatic UI refreshes without mutations
  const [localProductData, setLocalProductData] = useState<any>(product);
  const [formKey, setFormKey] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showTransferSupplierModal, setShowTransferSupplierModal] = useState(false);

  const lockStatus = (product?.readyForImport || '').toUpperCase();
  const isPeerReadOnly = !isAdmin && !canAssignProducts && !canEditRolePeers && Boolean(currentUserId) && (product?.assignedUserId ?? localProductData?.assignedUserId) !== currentUserId;
  const isGloballyLocked = (!isAdmin && (lockStatus === 'JA' || lockStatus === 'REVIEW' || lockStatus === 'R' || lockStatus === 'Y')) || isPeerReadOnly;

  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [showWebEnrichModal, setShowWebEnrichModal] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  // AI field suggestions — narrative loaded from DB when drawer opens
  const [analysisNarrative, setAnalysisNarrative] = useState<string | null>(null);

  // EmpCo + field history
  const [empcoFields, setEmpcoFields] = useState<Set<string>>(new Set());     // fields changed via EmpCo suggestion
  const [restoreFields, setRestoreFields] = useState<Set<string>>(new Set()); // fields restored from history
  const [empcoRefreshKey, setEmpcoRefreshKey] = useState(0);                  // bump after save → reload EmpCo status
  const [showHistory, setShowHistory] = useState(false);
  const [formattingModalSection, setFormattingModalSection] = useState<string | null>(null);
  const [formattingModalMode, setFormattingModalMode] = useState<'configure' | 'review'>('configure');
  const [showEcoPosModal, setShowEcoPosModal] = useState(false);

  const pendingFormattingCount =
    localProductData?.customData?._pendingFormatting &&
      typeof localProductData.customData._pendingFormatting === 'object'
      ? Object.keys(localProductData.customData._pendingFormatting).length
      : 0;

  useEffect(() => {
    if (isOpen && product?.internalArticleNumber !== initializedProductId.current) {
      initializedProductId.current = product?.internalArticleNumber || null;
      setActiveStatus((product?.status || 'NEW').toUpperCase());
      setStatusOverridden(false);
      setLocalProductData(product ? JSON.parse(JSON.stringify(product)) : null);
      setFormKey(k => k + 1);
      setIsDirty(false);
      setShowUnsavedWarning(false);
      setEmpcoFields(new Set());
      setRestoreFields(new Set());
      setShowHistory(false);
      setChatUnreadCount(0);

      const initialCollapsed: Record<string, boolean> = {};
      layout.forEach(s => {
        if (s.fields?.some((f: any) => f.type === 'chat')) {
          initialCollapsed[s.id] = true;
        }
      });
      setCollapsedSections(initialCollapsed);
    } else if (!isOpen) {
      initializedProductId.current = null;
    }
  }, [product, isOpen, layout]);

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
      setPendingNavigation(null);
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  const handleNavigateAttempt = (direction: 'prev' | 'next') => {
    if (isDirty) {
      setPendingNavigation(direction);
      setShowUnsavedWarning(true);
    } else {
      if (direction === 'prev' && onPrev) onPrev();
      if (direction === 'next' && onNext) onNext();
    }
  };

  const handleCopyCommit = (injectedData: any) => {
    const fresh = { ...localProductData, ...injectedData };
    if (injectedData.customData) {
      fresh.customData = {
        ...(localProductData?.customData || {}),
        ...injectedData.customData
      };
    }
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

  // Handle escape key and navigation arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || showUnsavedWarning) return;
      const isLightboxOpen = !!document.querySelector('[data-lightbox="true"]');

      if (e.key === 'Escape') {
        if (isLightboxOpen) return;
        if (showEcoPosModal) {
          e.preventDefault();
          setShowEcoPosModal(false);
          return;
        }
        if (formattingModalSection) {
          e.preventDefault();
          setFormattingModalSection(null);
          return;
        }
        if (showTransferSupplierModal) {
          e.preventDefault();
          setShowTransferSupplierModal(false);
          return;
        }
        if (showHistory) {
          e.preventDefault();
          setShowHistory(false);
          return;
        }
        if (showWebEnrichModal) {
          e.preventDefault();
          setShowWebEnrichModal(false);
          return;
        }
        if (showCopyModal) {
          e.preventDefault();
          setShowCopyModal(false);
          return;
        }
        if (isDirty) {
          setPendingNavigation(null);
          setShowUnsavedWarning(true);
        } else {
          onClose();
        }
      } else if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !showCopyModal &&
        !showEcoPosModal &&
        !formattingModalSection &&
        !showTransferSupplierModal &&
        !showHistory &&
        !showWebEnrichModal
      ) {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || (active as HTMLElement).isContentEditable);
        if (!isInput && !isLightboxOpen) {
          e.preventDefault();
          const direction = e.key === 'ArrowLeft' ? 'prev' : 'next';
          if (direction === 'prev' && !onPrev) return;
          if (direction === 'next' && !onNext) return;

          if (isDirty) {
            setPendingNavigation(direction);
            setShowUnsavedWarning(true);
          } else {
            if (direction === 'prev') onPrev!();
            if (direction === 'next') onNext!();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    isDirty,
    showUnsavedWarning,
    showCopyModal,
    showEcoPosModal,
    formattingModalSection,
    showTransferSupplierModal,
    showHistory,
    showWebEnrichModal,
    onClose,
    onPrev,
    onNext,
  ]);

  const handleSubmit = (formData: FormData) => {
    if (isGloballyLocked) return;
    // Auto-fallback: if the user did NOT touch the status dropdown during this edit session,
    // we forcibly intercept the form save and tag the product as 'EDIT'.
    // If the status is already 'DONE', we keep it 'DONE'.
    if (!statusOverridden && currentStatus !== 'DONE' && formData.get('status') !== 'EDIT') {
      formData.set('status', 'EDIT');
    }

    // Always use the header's readyForImport value if multiple exist in the DOM
    const readyVal = formData.getAll('readyForImport')[0];
    if (readyVal) {
      formData.set('readyForImport', readyVal);
    }

    startTransition(async () => {
      if (product?.internalArticleNumber) {
        await updateProductAction(product.internalArticleNumber, formData);
        setIsDirty(false);
        setEmpcoFields(new Set());
        setRestoreFields(new Set());
        setEmpcoRefreshKey(k => k + 1);

        if (pendingNavigation === 'prev' && onPrev) { onPrev(); setPendingNavigation(null); }
        else if (pendingNavigation === 'next' && onNext) { onNext(); setPendingNavigation(null); }
        else if (saveModeRef.current === 'save_close') { onClose(); }
      }
    });
  };

  // Apply an AI-suggested value directly to the DOM input (non-destructive — no re-mount)
  const applyAiSuggestion = (fieldKey: string, value: string) => {
    const form = formRef.current;
    if (!form) return;
    let el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${fieldKey}"]`);
    if (!el && fieldKey === 'longDescription') {
      el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="description"]`);
    }
    if (!el && fieldKey === 'description') {
      el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="longDescription"]`);
    }
    if (el) { el.value = value; setIsDirty(true); }
  };

  const applyAiSectionSuggestions = (suggestions: Record<string, string>) => {
    Object.entries(suggestions).forEach(([key, value]) => {
      applyAiSuggestion(key, value);
    });
  };

  const handleFormattingComplete = async (appliedItems?: AppliedFormattingChange[]) => {
    setFormattingModalSection(null);
    const artNum = localProductData?.internalArticleNumber;
    if (appliedItems && appliedItems.length > 0 && localProductData) {
      const thisProduct = appliedItems.find(i => i.articleNumber === localProductData.internalArticleNumber);
      if (thisProduct) {
        const patch: Record<string, any> = {};
        thisProduct.changes.forEach(c => {
          patch[c.fieldKey] = c.newValue;
          applyAiSuggestion(c.fieldKey, c.newValue);
        });
        setLocalProductData((prev: any) => ({ ...prev, ...patch }));
        setFormKey(k => k + 1);
        setIsDirty(false);
        setEmpcoRefreshKey(k => k + 1);
      }
    }
    if (artNum) {
      const fresh = await getProductDataAction(artNum);
      if (fresh) {
        setLocalProductData((prev: any) => ({
          ...prev,
          ...fresh,
        }));
      }
    }
  };

  // ── EmpCo helpers ───────────────────────────────────────────────────────────
  const findFormField = (fieldKey: string) => {
    const form = formRef.current;
    if (!form) return null;
    const q = (n: string) =>
      form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${n}"]:not([type="hidden"])`) ??
      form.querySelector<HTMLInputElement>(`input[data-empco-fallback="true"][name="${n}"]`);
    let el = q(fieldKey);
    if (!el && fieldKey === 'longDescription') el = q('description');
    if (!el && fieldKey === 'description') el = q('longDescription');
    if (!el && fieldKey === 'shortDescription') el = q('seoTitle');
    return el;
  };

  /** Current (possibly unsaved) values of all form inputs, keyed by form key */
  const getLiveFormValues = useCallback((): Record<string, string> => {
    const out: Record<string, string> = {};
    const form = formRef.current;
    if (!form) return out;
    for (const [k, v] of new FormData(form).entries()) {
      if (typeof v !== 'string' || k.startsWith('_')) continue;
      if (out[k] === undefined) out[k] = v; // first occurrence wins (header vs. body duplicates)
    }
    if (out.description !== undefined && out.longDescription === undefined) out.longDescription = out.description;
    return out;
  }, []);

  /** Replace an offending fragment in a form field with the EmpCo-compliant suggestion */
  const applyEmpcoFix = (fieldKey: string, original: string, replacement: string): ApplyFixResult => {
    if (isGloballyLocked) return { ok: false, message: 'Product is alleen-lezen / vergrendeld' };
    const el = findFormField(fieldKey);
    if (!el || el.readOnly || el.disabled) return { ok: false, message: 'Veld niet bewerkbaar' };
    const current = el.value || (localProductData?.[fieldKey] != null ? String(localProductData[fieldKey]) : '');

    const next = replaceEmpcoFragment(current, original, replacement);
    if (next === null) return { ok: false, message: 'Tekst niet (meer) gevonden — pas handmatig aan' };

    el.value = next;
    const canonicalKey = fieldKey === 'description' ? 'longDescription' : fieldKey;
    setLocalProductData((prev: any) => (prev ? { ...prev, [canonicalKey]: next } : prev));
    setIsDirty(true);
    setEmpcoFields(prev => new Set(prev).add(canonicalKey));
    return { ok: true };
  };

  /** Put a previous value (from history) back into the form */
  const restoreFieldValue = (fieldKey: string, value: string): boolean => {
    if (isGloballyLocked) return false;
    const el = findFormField(fieldKey);
    if (!el || el.readOnly || el.disabled) return false;
    el.value = value;
    setIsDirty(true);
    setRestoreFields(prev => new Set(prev).add(fieldKey));
    setEmpcoFields(prev => { const n = new Set(prev); n.delete(fieldKey); return n; });
    return true;
  };

  /** Save the current form directly from within the EmpCo panel */
  const handleSaveFromEmpco = useCallback(async () => {
    if (isGloballyLocked) return;
    const artNum = product?.internalArticleNumber || localProductData?.internalArticleNumber;
    if (!formRef.current || !artNum) return;
    saveModeRef.current = 'save';
    const formData = new FormData(formRef.current);

    if (!statusOverridden && currentStatus !== 'DONE' && formData.get('status') !== 'EDIT') {
      formData.set('status', 'EDIT');
    }
    const readyVal = formData.getAll('readyForImport')[0];
    if (readyVal) {
      formData.set('readyForImport', readyVal);
    }

    await new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          await updateProductAction(artNum, formData);
          setIsDirty(false);
          setEmpcoFields(new Set());
          setRestoreFields(new Set());
          setEmpcoRefreshKey(k => k + 1);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }, [product, localProductData, statusOverridden, currentStatus, isGloballyLocked]);

  // Extract current product specifications and form values to provide rich context to AI suggestions
  const getLiveProductContext = useCallback(() => {
    const data: Record<string, any> = { ...(localProductData || {}) };
    const form = formRef.current;
    if (form) {
      const formData = new FormData(form);
      for (const [k, v] of formData.entries()) {
        if (typeof v === 'string' && v.trim() && !k.startsWith('_')) {
          data[k] = v.trim();
        }
      }
    }

    const lines: string[] = [];
    if (data.title) lines.push(`- Titel / Omschrijving: ${data.title}`);
    if (data.brand?.name || (typeof data.brand === 'string' && data.brand)) lines.push(`- Merk: ${data.brand?.name || data.brand}`);
    if (data.supplier?.name || (typeof data.supplier === 'string' && data.supplier)) lines.push(`- Leverancier: ${data.supplier?.name || data.supplier}`);
    if (data.category?.name || (typeof data.category === 'string' && data.category)) lines.push(`- Categorie: ${data.category?.name || data.category}`);
    if (data.subcategory?.name || (typeof data.subcategory === 'string' && data.subcategory)) lines.push(`- Subcategorie: ${data.subcategory?.name || data.subcategory}`);
    if (data.volumeMl) lines.push(`- Inhoud (ml): ${data.volumeMl} ml`);
    if (data.volumeGr) lines.push(`- Inhoud (gr): ${data.volumeGr} gr`);
    if (data.mainMaterial) lines.push(`- Hoofdmateriaal: ${data.mainMaterial}`);
    if (data.material) lines.push(`- Materiaal: ${data.material}`);

    const dims = [
      data.lengthCm ? `L: ${data.lengthCm}cm` : null,
      data.widthCm ? `B: ${data.widthCm}cm` : null,
      data.heightCm ? `H: ${data.heightCm}cm` : null,
    ].filter(Boolean);
    if (dims.length > 0) lines.push(`- Afmetingen: ${dims.join(' x ')}`);

    if (data.weightGr) lines.push(`- Gewicht (gr): ${data.weightGr} gr`);
    if (data.color) lines.push(`- Kleur: ${data.color}`);
    if (data.size) lines.push(`- Maat: ${data.size}`);
    if (data.ingredients) lines.push(`- Ingrediënten: ${data.ingredients}`);
    if (data.allergens) lines.push(`- Allergenen: ${data.allergens}`);
    if (data.shortDescription) lines.push(`- Korte omschrijving: ${data.shortDescription}`);
    if (data.longDescription) lines.push(`- Lange omschrijving: ${data.longDescription}`);
    if (data.tags) lines.push(`- Tags: ${data.tags}`);

    if (data.customData && typeof data.customData === 'object') {
      Object.entries(data.customData).forEach(([k, v]) => {
        if (!k.startsWith('_') && v != null && v !== '') lines.push(`- ${k}: ${v}`);
      });
    }

    return lines.join('\n');
  }, [localProductData]);

  const renderField = (moduleName: string, label: string, val: string, inputComponent: React.ReactNode, isCheckbox: boolean = false, textColor?: string, fieldKey?: string, fieldInstruction?: string, sectionInstruction?: string) => {
    let action = isAdmin ? 'WRITE' : (fieldPermissions?.[moduleName] ?? 'READ');
    if (isGloballyLocked) action = 'READ';

    // internalArticleNumber is explicitly READ-only even for Admins usually
    if (isReadOnlyProductField(moduleName)) {
      action = 'READ';
    }

    if (action === 'HIDDEN') return null;

    let key = moduleName.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription';
    if (key === 'price') key = 'basePrice';

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
        sectionInstruction={sectionInstruction}
        getProductContext={getLiveProductContext}
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
          <>
            {canApproveEmpco && !isGloballyLocked && !isReadOnlyProductField(moduleName) && (
              <input type="hidden" data-empco-fallback="true" name={key} defaultValue={val || ''} />
            )}
            <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'inherit', opacity: 0.7, cursor: 'not-allowed', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center' }}>
              {val || '-'}
            </div>
          </>
        ) : (
          React.cloneElement(inputComponent as React.ReactElement<any>, {
            onChange: (e: any) => {
              const originalOnChange = (inputComponent as React.ReactElement<any>).props.onChange;
              if (originalOnChange) originalOnChange(e);
              setIsDirty(true);
            }
          })
        )}
      </div>
    );
  };

  const renderDataField = (f: any, section: any) => {
    let key = f.id.replace('FIELD:', '');
    if (key === 'description') key = 'longDescription'; // Backward compatibility fix
    if (key === 'price') key = 'basePrice';

    const effectiveTextColor = f.textColor || section?.textColor || 'var(--text)';

    let val;

    // ── Relation fields: resolve dotted path on the product object ───────────
    if (f.type === 'relation' && f.relationPath) {
      let resolved: any = null;
      if (f.relationPath === 'category.name' || f.relationPath === 'subcategory.name') {
        const subName = localProductData?.subcategory?.name;
        const catName = localProductData?.category?.name;
        if (subName && subName.trim().toLowerCase() !== 'mpluswebshops') {
          resolved = subName;
        } else if (catName && catName.trim().toLowerCase() !== 'mpluswebshops') {
          resolved = catName;
        }
      } else {
        const parts = f.relationPath.split('.');
        resolved = localProductData;
        for (const p of parts) { resolved = resolved?.[p]; }
      }
      // For email addresses (assignedUser) strip the domain for brevity
      const displayVal = typeof resolved === 'string' && resolved.includes('@')
        ? resolved.split('@')[0]
        : (resolved?.toString() ?? null);

      let span = f.width ? Number(f.width) : 8;
      if (isNaN(span)) span = 8;

      const isSupplierField = f.relationPath === 'supplier.name' || f.id === 'FIELD:supplierId' || f.id === 'FIELD:supplier.name';

      if (isSupplierField && isAdmin && !isGloballyLocked) {
        return (
          <div key={f.id} style={{ gridColumn: `span ${span}`, backgroundColor: f.backgroundColor || 'transparent', padding: f.backgroundColor ? '0.75rem' : '0', borderRadius: 'var(--radius)', color: effectiveTextColor }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'inherit', opacity: 0.7 }}>
                {f.label} <span style={{ fontSize: '0.72rem', color: 'var(--color-teal)', fontWeight: 700 }}>(Admin)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowTransferSupplierModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-teal)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                🏢 Omzetten via wizard
              </button>
            </div>
            <input type="hidden" name="_present_fields" value="supplierId" />
            <select
              name="supplierId"
              value={localProductData?.supplierId || ''}
              onChange={(e) => {
                const newSuppId = e.target.value;
                const newSuppObj = allSuppliers.find(s => s.id === newSuppId) || null;
                setLocalProductData((prev: any) => ({
                  ...prev,
                  supplierId: newSuppId || null,
                  supplier: newSuppObj,
                }));
                setIsDirty(true);
              }}
              className="input"
              style={{ fontWeight: 600 }}
            >
              <option value="">-- Geen leverancier gekoppeld --</option>
              {allSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        );
      }

      const isCategoryRelation = f.relationPath === 'category.name' || f.relationPath === 'subcategory.name';
      const categoryParts =
        isCategoryRelation && displayVal
          ? displayVal
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => Boolean(s) && s.toLowerCase() !== 'mpluswebshops')
          : [];

      return (
        <div key={f.id} style={{ gridColumn: `span ${span}`, backgroundColor: f.backgroundColor || 'transparent', padding: f.backgroundColor ? '0.75rem' : '0', borderRadius: 'var(--radius)', color: effectiveTextColor }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'inherit', opacity: 0.7, marginBottom: '0.4rem' }}>{f.label}</label>
          <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'inherit', opacity: 0.75, cursor: 'default', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'inherit', opacity: 0.7, marginBottom: '0.4rem' }}>
              {f.label}
              {categoryParts.length > 1 && (
                <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8' }}>
                  ({categoryParts.length} subcategorieën)
                </span>
              )}
            </label>
            <div className="input" style={{ backgroundColor: 'rgba(0,0,0,0.02)', color: 'inherit', opacity: 0.85, cursor: 'default', border: '1px solid rgba(0,0,0,0.05)', minHeight: '38px', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', padding: '0.35rem 0.6rem' }}>
              <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>🔗</span>
              {displayVal || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>—</span>}
              {categoryParts.length > 1 ? (
                categoryParts.map((catName: string) => (
                  <span
                    key={catName}
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      padding: '0.12rem 0.5rem',
                      borderRadius: '999px',
                      backgroundColor: '#eff6ff',
                      color: '#1e40af',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    {catName}
                  </span>
                ))
              ) : (
                displayVal || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>—</span>
              )}
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
          if (key === 'custom_ecoposVatRate' && val !== null && val !== undefined && val !== '') {
          const n = Number(String(val).replace('%', '').replace(',', '.'));
          if (!Number.isNaN(n)) val = `${Math.round(n)}%`;
        }
      } else {
            val = localProductData?.[key];
          if (key === 'shortDescription' && (val === null || val === undefined || val === '')) {
            val = localProductData?.seoTitle;
        }
      }

          let inputComponent;
          let isCheckbox = false;

          let heightMultiplier = f.height || 1;
          if (f.type === 'textarea' && !f.height) heightMultiplier = 3;
          if (f.type === 'media' && !f.height) heightMultiplier = 5;
          const computedHeight = `${Math.max(38, heightMultiplier * 40)}px`;

          if (f.id === 'FIELD:media' || f.type === 'media') {
        const action = isGloballyLocked ? 'READ' : (isAdmin ? 'WRITE' : (fieldPermissions?.[f.id] ?? 'READ'));
          if (action === 'HIDDEN') return null;
          let mediaSpan = f.width ? Number(f.width) : 7;
          if (isNaN(mediaSpan) || f.width === 'full') mediaSpan = 24;
          return (
          <div
            key={f.id}
            style={{
              gridColumn: `span ${mediaSpan}`,
              backgroundColor: f.backgroundColor || 'transparent',
              padding: f.backgroundColor ? '0.75rem' : '0',
              borderRadius: 'var(--radius)',
              color: effectiveTextColor,
            }}
            onChange={(e) => e.stopPropagation()}
          >
            <ProductGallery articleNumber={localProductData?.internalArticleNumber} canUseAi={canUseAi && !isGloballyLocked} readOnly={action === 'READ'} />
          </div>
          );
      } else if (f.type === 'chat') {
        // Render the chat panel directly — no wrapping label, no write-indicator.
        // Stop change-event propagation so the form's onChange does NOT flag isDirty
        // just because the user typed a chat message (those save independently).
        const chatHeight = Math.max(280, (f.height || 10) * 40);
          const isSectionCollapsed = section?.id ? (collapsedSections[section.id] ?? false) : false;
          return (
          <div key={f.id} style={{ gridColumn: `span 24` }} onChange={(e) => e.stopPropagation()}>
            <ProductRemarksChat
              articleNumber={localProductData.internalArticleNumber}
              currentUserId={currentUserId}
              currentUserChatColor={currentUserChatColor}
              currentUserAutoMarkRemarksAsRead={currentUserAutoMarkRemarksAsRead}
              userChatColors={userChatColors}
              isAdmin={isAdmin}
              isOpen={isOpen}
              isSectionOpen={isOpen && !isSectionCollapsed}
              height={chatHeight}
              title={f.label}
              onUnreadCountChange={setChatUnreadCount}
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
        const readOnly = isReadOnlyProductField(f.id);
          inputComponent = <input name={key} className="input" defaultValue={val || ''} readOnly={readOnly} style={{ minHeight: computedHeight, backgroundColor: readOnly ? 'rgba(0,0,0,0.02)' : undefined, color: 'inherit' }} />;
      }

          let span = f.width ? Number(f.width) : (f.type === 'textarea' || f.type === 'media' ? 24 : 8);
          if (isNaN(span) || f.width === 'full') span = 24; // Backwards compatibility for exact strings
          if (f.width === '1') span = 8;
          if (f.width === '2') span = 16;

          // Only show AI suggestion button for text-compatible, non-system fields
          const isAiEligible = !isCheckbox &&
          f.type !== 'media' && f.type !== 'chat' && f.type !== 'relation' &&
          !isReadOnlyProductField(f.id);

          const normalizedFieldLabel =
          f.id === 'FIELD:webshopActive' && f.label === 'Webshop (Actief)'
          ? 'Op Webshop'
          : f.id === 'FIELD:systemActive' && f.label === 'Actief (Systeem)'
          ? 'Actief in Systeem'
          : f.id === 'FIELD:uitlopend' && f.label === 'Uitlopend (Uitl.)'
          ? 'Uitlopend'
          : f.label;

          return (
          <div key={f.id} style={{ gridColumn: `span ${span}`, backgroundColor: f.backgroundColor || 'transparent', padding: f.backgroundColor ? '0.75rem' : '0', borderRadius: 'var(--radius)', color: effectiveTextColor }}>
            {renderField(f.id, normalizedFieldLabel, val?.toString() ?? '', inputComponent, isCheckbox, effectiveTextColor, isAiEligible ? key : undefined, f.aiInstruction, section?.aiInstruction)}
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
            <form ref={formRef} key={formKey} onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(new FormData(e.currentTarget));
            }} onChange={() => setIsDirty(true)} className="glass" style={{
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
                  {/* Marks fields changed via EmpCo / history-restore so the save action can label the history entries */}
                  {Array.from(empcoFields).map(k => (
                    <React.Fragment key={`empco_${k}`}>
                      <input type="hidden" name="_empco_fields" value={k} />
                      <input type="hidden" name="_present_fields" value={k} />
                    </React.Fragment>
                  ))}
                  {Array.from(restoreFields).map(k => (
                    <React.Fragment key={`restore_${k}`}>
                      <input type="hidden" name="_restore_fields" value={k} />
                      <input type="hidden" name="_present_fields" value={k} />
                    </React.Fragment>
                  ))}
                  {/* Fallback inputs for EmpCo-checked fields not currently placed in the visual layout */}
                  {(() => {
                    const layoutKeys = new Set<string>();
                    for (const sec of layout ?? []) {
                      for (const fld of sec?.fields ?? []) {
                        let fk = String(fld.id ?? '').replace('FIELD:', '');
                        if (fk === 'description') fk = 'longDescription';
                        layoutKeys.add(fk);
                      }
                    }
                    const fallbackKeys = ['title', 'shortDescription', 'longDescription', 'mainMaterial', 'ingredients', 'allergens', 'color', 'critOther'];
                    return fallbackKeys
                      .filter(k => !layoutKeys.has(k))
                      .map(k => (
                        <React.Fragment key={`empco_fb_${k}`}>
                          <input type="hidden" name="_present_fields" value={k} />
                          <input type="hidden" data-empco-fallback="true" name={k} defaultValue={localProductData?.[k] ?? ''} />
                        </React.Fragment>
                      ));
                  })()}
                  <div style={{ padding: '2rem 3rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'rgba(255,255,255,0.95)', zIndex: 10, backdropFilter: 'blur(8px)' }}>
                    <div>
                      <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text)' }}>
                        {isPeerReadOnly ? 'Bekijk Product' : 'Edit Product'} #{localProductData.internalArticleNumber}
                      </h2>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1rem', color: 'var(--color-mustard)', fontWeight: 600 }}>{localProductData.title}</span>
                        {/* Supplier info pill */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--surface-hover)', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                          <span style={{ opacity: 0.6 }}>🏢 Leverancier:</span>
                          <strong style={{ color: 'var(--text)' }}>{localProductData.supplier?.name || 'Geen'}</strong>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setShowTransferSupplierModal(true)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-teal)',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                textDecoration: 'underline',
                                marginLeft: '0.35rem',
                                padding: 0,
                              }}
                              title="Zet dit product om naar een andere leverancier"
                            >
                              Omzetten
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>

                      {/* Top Row: Controls + Navigation + Close */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <select
                            name="status"
                            value={activeStatus}
                            disabled={isGloballyLocked}
                            onChange={(e) => {
                              if (isGloballyLocked) return;
                              const newStatus = e.target.value;
                              setStatusOverridden(true);
                              setActiveStatus(newStatus);
                              startTransition(async () => {
                                await updateProductStatusAction(localProductData.internalArticleNumber, newStatus);
                              });
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
                              cursor: isGloballyLocked ? 'not-allowed' : 'pointer',
                              opacity: isGloballyLocked ? 0.65 : 1,
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
                                alignItems: 'center', gap: '0.3rem'
                              }}
                            >
                              🖨 Kopieer Data
                            </button>
                          )}
                          {/* EmpCo check + field history */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.75rem' }}>
                            {(canApproveEmpco || canUseAi) && (
                              <ProductEmpcoPanel
                                articleNumber={localProductData.internalArticleNumber}
                                productTitle={localProductData.title}
                                getLiveValues={getLiveFormValues}
                                applyFix={applyEmpcoFix}
                                canEdit={!isGloballyLocked && canApproveEmpco}
                                canRunCheck={canUseAi && !isPeerReadOnly}
                                isAdmin={isAdmin}
                                onOpenHistory={() => setShowHistory(true)}
                                refreshKey={empcoRefreshKey}
                                brandId={localProductData?.brandId ?? localProductData?.brand?.id}
                                brandName={localProductData?.brand?.name}
                                onSave={handleSaveFromEmpco}
                                isSaving={isPending}
                                isDirty={isDirty}
                                onChecked={(status, stale, issueCount) => {
                                  onEmpcoCheck?.(localProductData.internalArticleNumber, status, stale, issueCount);
                                }}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setShowHistory(true)}
                              title="Wijzigingshistorie: eerdere teksten bekijken en terugzetten"
                              style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              🕘 Historie
                            </button>
                            {(canUseAi || canApproveEmpco) && !isGloballyLocked && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFormattingModalMode(!canUseAi || pendingFormattingCount > 0 ? 'review' : 'configure');
                                  setFormattingModalSection('ALL');
                                }}
                                title={
                                  pendingFormattingCount > 0
                                    ? `Er staan ${pendingFormattingCount} klaargezette formateringsvoorstellen klaar voor review`
                                    : canUseAi
                                      ? 'Formatteer productteksten volgens vaste regels'
                                      : 'Bekijk klaargezette formateringsvoorstellen'
                                }
                                style={{
                                  padding: '0.25rem 0.6rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  backgroundColor: pendingFormattingCount > 0 ? '#f3e8ff' : '#eff6ff',
                                  color: pendingFormattingCount > 0 ? '#6d28d9' : '#1d4ed8',
                                  border: pendingFormattingCount > 0 ? '1.5px solid #c4b5fd' : '1px solid #bfdbfe',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                ✨ Regels{pendingFormattingCount > 0 ? ` (${pendingFormattingCount})` : ''}
                              </button>
                            )}
                            {isAdmin && !isGloballyLocked && (
                              <button
                                type="button"
                                onClick={() => setShowEcoPosModal(true)}
                                title="Haal actuele status, prijs, voorraad en productinfo op uit EcoPos / MplusKassa"
                                style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#f0f9ff', color: '#0369a1', border: '1px solid #7dd3fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                🔄 EcoPos
                              </button>
                            )}
                          </div>
                          {canUseAi && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.75rem' }}>
                              <AiAnalysisViewer
                                articleNumber={localProductData.internalArticleNumber}
                                productTitle={localProductData.title}
                                score={aiScore}
                                canUseAi={canUseAi && !isPeerReadOnly}
                                fallbackIcon={true}
                              />
                              {!isPeerReadOnly && (
                                <>
                                  <ProductAiPanel product={localProductData} layout={layout} isAdmin={isAdmin} />
                                  <button
                                    type="button"
                                    onClick={() => setShowWebEnrichModal(true)}
                                    title="Online productinformatie zoeken en automatisch invullen"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                      padding: '0.4rem 0.85rem', borderRadius: 'var(--radius)',
                                      border: '1px solid #93c5fd', backgroundColor: '#eff6ff',
                                      color: '#2563eb', fontWeight: 600, fontSize: '0.8rem',
                                      cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
                                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                  >
                                    🌐 Web Info
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          <DrawerReadyToggle
                            readyMode={(localProductData.readyForImport || 'NEE').toUpperCase()}
                            internalArticleNumber={localProductData.internalArticleNumber}
                            isAdmin={isAdmin}
                            onChange={(val) => {
                              setLocalProductData((prev: any) => ({ ...prev, readyForImport: val }));
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', height: '32px' }}>
                          {/* Navigation arrows */}
                          {(onPrev || onNext) && (
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button type="button" onClick={() => handleNavigateAttempt('prev')} disabled={!onPrev} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onPrev ? 'pointer' : 'not-allowed', opacity: onPrev ? 1 : 0.3, fontSize: '1.2rem', color: 'var(--text)' }} title="Vorige (Arrow Left)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                              </button>
                              <button type="button" onClick={() => handleNavigateAttempt('next')} disabled={!onNext} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onNext ? 'pointer' : 'not-allowed', opacity: onNext ? 1 : 0.3, fontSize: '1.2rem', color: 'var(--text)' }} title="Volgende (Arrow Right)">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                              </button>
                            </div>
                          )}
                          <button type="button" onClick={handleCloseAttempt} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>✕</button>
                        </div>
                      </div>

                      {/* Bottom Row: Save Buttons */}
                      {
                        isPeerReadOnly ? (
                          <div style={{ color: '#475569', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 600, fontSize: '0.8rem', padding: '0.3rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} >
                            👁️ Alleen lezen (toegewezen aan {localProductData.assignedUser?.email?.split('@')[0] || 'collega'})
                          </div>
                        ) : isGloballyLocked ? (
                          <div style={{ color: 'var(--error)', fontWeight: 600, fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}>
                            🔒 Vergrendeld voor review/export
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button type="submit" disabled={isPending} onClick={() => saveModeRef.current = 'save'} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', opacity: 0.8, boxShadow: '0 2px 8px rgba(225, 191, 220, 0.2)' }}>
                              {isPending && saveModeRef.current === 'save' ? 'Bezig...' : 'Opslaan'}
                            </button>
                            <button type="submit" disabled={isPending} onClick={() => saveModeRef.current = 'save_close'} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(225, 191, 220, 0.4)' }}>
                              {isPending && saveModeRef.current === 'save_close' ? 'Bezig...' : 'Opslaan & Sluiten'}
                            </button>
                          </div>
                        )}
                    </div>
                  </div>

                  <div style={{ padding: '3rem', display: 'flex', flexDirection: 'column', gap: '4rem' }}>
                    {layout?.map((section) => {
                      const sectionAiFields = section.fields
                        .filter((f: any) => f.includeInSectionAi)
                        .map((f: any) => {
                          let key = f.id.replace('FIELD:', '');
                          if (key === 'description') key = 'longDescription';
                          return {
                            id: f.id,
                            key,
                            label: f.label,
                            currentValue: key.startsWith('custom_')
                              ? localProductData?.customData?.[key.replace('custom_', '')] || ''
                              : localProductData?.[key] || '',
                            instruction: f.aiInstruction
                          };
                        });
                      const isCollapsed = collapsedSections[section.id] || false;
                      const hasChat = section.fields?.some((f: any) => f.type === 'chat');

                      return (
                        <section key={section.id}>
                          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => setCollapsedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: section.color, borderBottom: `2px solid ${section.color}`, paddingBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                              <span style={{ fontSize: '0.85rem', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block', opacity: 0.8 }}>▼</span>
                              {section.title}
                            </h3>
                            {hasChat && isCollapsed && chatUnreadCount > 0 && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.65rem',
                                borderRadius: '1rem',
                                marginLeft: '0.75rem',
                                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.35)',
                                animation: 'chat-pulse 1.2s ease-in-out infinite',
                              }}>
                                🔔 {chatUnreadCount} nieuw{chatUnreadCount === 1 ? '' : 'e'} {chatUnreadCount === 1 ? 'bericht' : 'berichten'}
                              </span>
                            )}
                            {(canUseAi || (canApproveEmpco && pendingFormattingCount > 0)) && !isGloballyLocked && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFormattingModalMode(!canUseAi || pendingFormattingCount > 0 ? 'review' : 'configure');
                                  setFormattingModalSection(section.id);
                                }}
                                title={`Formatteer velden in "${section.title}" volgens een standaardregel`}
                                style={{
                                  marginLeft: '0.75rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: 'var(--radius)',
                                  border: '1px solid var(--border)',
                                  backgroundColor: 'var(--surface)',
                                  color: 'var(--text-muted)',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--primary)';
                                  e.currentTarget.style.color = 'var(--text)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = 'var(--border)';
                                  e.currentTarget.style.color = 'var(--text-muted)';
                                }}
                              >
                                ✨ Regels
                              </button>
                            )}
                            {canUseAi && !isGloballyLocked && analysisNarrative && sectionAiFields.length > 0 && (
                              <AiSectionSuggestion
                                sectionTitle={section.title}
                                fields={sectionAiFields}
                                analysisNarrative={analysisNarrative}
                                productTitle={localProductData?.title || ''}
                                sectionInstruction={section.aiInstruction}
                                getProductContext={getLiveProductContext}
                                onApply={applyAiSectionSuggestions}
                              />
                            )}
                          </div>
                          <div style={{ display: isCollapsed ? 'none' : 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: '0.75rem', backgroundColor: section.backgroundColor || 'var(--background)', color: section.textColor || 'var(--text)', padding: '1rem', borderRadius: 'var(--radius)', border: `1px solid rgba(0,0,0,0.05)` }}>
                            {section.fields.map((f: any) => renderDataField(f, section))}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </>
              )}
            </form >

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
            )
            }

            {
              showWebEnrichModal && (
                <ProductWebEnrichModal
                  product={localProductData}
                  isOpen={showWebEnrichModal}
                  onClose={() => setShowWebEnrichModal(false)}
                  onApplyFields={(fields) => {
                    applyAiSectionSuggestions(fields);
                  }}
                />
              )
            }

            {
              showHistory && localProductData && (
                <ProductFieldHistoryModal
                  articleNumber={localProductData.internalArticleNumber}
                  productTitle={localProductData.title}
                  onClose={() => setShowHistory(false)}
                  onRestore={isGloballyLocked ? undefined : restoreFieldValue}
                />
              )
            }

            {
              showTransferSupplierModal && localProductData && (
                <TransferSupplierModal
                  isOpen={showTransferSupplierModal}
                  onClose={() => setShowTransferSupplierModal(false)}
                  products={[{
                    internalArticleNumber: localProductData.internalArticleNumber,
                    title: localProductData.title,
                    supplier: localProductData.supplier
                  }]}
                  allSuppliers={allSuppliers}
                  preselectedSupplierId={localProductData?.supplierId || ''}
                  onSuccess={(targetSupplier) => {
                    setLocalProductData((prev: any) => ({
                      ...prev,
                      supplierId: targetSupplier.id,
                      supplier: targetSupplier,
                    }));
                    setShowTransferSupplierModal(false);
                    setEmpcoRefreshKey(k => k + 1);
                  }}
                />
              )
            }

            {
              formattingModalSection && localProductData && (
                <FormattingRulePreviewModal
                  isOpen={Boolean(formattingModalSection)}
                  onClose={() => setFormattingModalSection(null)}
                  articleNumbers={[localProductData.internalArticleNumber]}
                  initialSectionId={formattingModalSection === 'ALL' ? undefined : formattingModalSection}
                  initialMode={formattingModalMode}
                  canUseAi={canUseAi}
                  onComplete={handleFormattingComplete}
                />
              )
            }

            {/* Toast Notification */}
            {
              copySuccess && (
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
              )
            }
            {/* Unsaved Changes Confirmation Modal */}
            {
              showUnsavedWarning && (
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
                        onClick={() => {
                          setShowUnsavedWarning(false);
                          if (pendingNavigation === 'prev' && onPrev) { onPrev(); setPendingNavigation(null); }
                          else if (pendingNavigation === 'next' && onNext) { onNext(); setPendingNavigation(null); }
                          else { onClose(); setPendingNavigation(null); }
                        }}
                        className="btn"
                        style={{ padding: '1.25rem', fontSize: '1.1rem', backgroundColor: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '12px', fontWeight: 600 }}
                      >
                        {pendingNavigation ? '🗑️ Wijzigingen Negeren & Verdergaan' : '🗑️ Wijzigingen Negeren & Sluiten'}
                      </button>
                      <button
                        onClick={() => { setShowUnsavedWarning(false); setPendingNavigation(null); }}
                        className="btn ghost"
                        style={{ padding: '1rem', color: 'var(--text-muted)' }}
                      >
                        Blijf op deze pagina
                      </button>
                    </div>
                  </div>
                </div>
              )
            }

            {
              showEcoPosModal && localProductData?.internalArticleNumber && (
                <EcoPosSyncModal
                  isOpen={showEcoPosModal}
                  onClose={() => setShowEcoPosModal(false)}
                  articleNumbers={[localProductData.internalArticleNumber]}
                  singleProductMode={true}
                  onComplete={(result) => {
                    if (result?.updatedProducts && result.updatedProducts.length > 0) {
                      const updated = result.updatedProducts[0];
                      setLocalProductData((prev: any) => ({
                        ...prev,
                        ...updated,
                      }));
                      setActiveStatus((updated.status || 'NEW').toUpperCase());
                      setFormKey((k) => k + 1);
                      setEmpcoRefreshKey((k) => k + 1);
                    }
                  }}
                />
              )
            }
          </>
          );
  }
