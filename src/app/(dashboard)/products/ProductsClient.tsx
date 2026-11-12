"use client";
import { useRouter } from 'next/navigation';
import React, { useState, useMemo, useTransition, useEffect, useCallback } from 'react';
import ProductDrawer from '@/components/ProductDrawer';
import ExcelImportWizard from '@/components/ExcelImportWizard';
import AiAnalysisViewer from '@/components/AiAnalysisViewer';
import BatchAnalyzeModal, { BatchMode } from '@/components/BatchAnalyzeModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import EmpcoViewer from '@/components/EmpcoCheck';
import EmpcoBulkFixModal from '@/components/EmpcoBulkFixModal';
import TransferSupplierModal from '@/components/TransferSupplierModal';
import FormattingRulePreviewModal from '@/components/FormattingRulePreviewModal';
import EcoPosSyncModal from '@/components/EcoPosSyncModal';
import { triggerAutoEcoPosSyncIfDueAction } from '@/app/actions/ecopos';
import { confirmEmpcoReady } from '@/lib/empcoGateClient';
import { deleteProductsAction, updateReadyForImportAction, updateProductStatusAction, bulkUpdateProductStatusAction, bulkAssignAction, bulkUpdateReadyForImportAction } from '@/app/actions/product';

export interface EmpcoMapEntry { status: string; stale: boolean; issueCount: number }

// ── Completeness helpers ────────────────────────────────────────────────────
const BASIS_TEXT_TYPES = new Set(['text', 'textarea']);
const ATTR_TYPES = new Set(['text', 'textarea', 'number', 'picklist']);
const SKIP_BASIS_FIELDS = new Set(['FIELD:internalArticleNumber', 'FIELD:internalRemarks', 'FIELD:ean']);

// Mirrors the alias in ProductDrawer.tsx (line 281): FIELD:description → longDescription
const FIELD_KEY_ALIAS: Record<string, string> = {
  'description': 'longDescription',
};


function computeCompleteness(product: any, layout: any[], imageCount: number) {
  let basisTotal = 0, basisFilled = 0;
  let attrTotal = 0, attrFilled = 0;
  let critTotal = 0, critFilled = 0;

  for (const section of layout) {
    const fields: any[] = section.fields ?? [];
    const isBasisSection = fields.some((f: any) => f.id === 'FIELD:title');
    const isCritSection = fields.some((f: any) => f.id.replace('FIELD:', '').startsWith('crit'));

    for (const field of fields) {
      const key = field.id.replace('FIELD:', '');
      const isCritField = key.startsWith('crit');

      // ── Basis text section ──────────────────────────────────────────────
      if (isBasisSection && !SKIP_BASIS_FIELDS.has(field.id) && BASIS_TEXT_TYPES.has(field.type)) {
        basisTotal++;
        const modelKey = FIELD_KEY_ALIAS[key] || key;
        const val = product[modelKey];
        if (val != null && String(val).trim()) basisFilled++;
        continue;
      }

      // ── Criteria fields ─────────────────────────────────────────────────
      if (isCritField) {
        critTotal++;
        const modelKey = FIELD_KEY_ALIAS[key] || key;
        const val = product[modelKey];
        if (field.type === 'checkbox') {
          if (val !== null && val !== undefined) critFilled++;
        } else {
          if (val != null && String(val).trim() && String(val) !== 'Leeg') critFilled++;
        }
        continue;
      }

      // ── Physical / attribute fields (non-basis, non-criteria) ───────────
      if (!isBasisSection && !isCritSection && ATTR_TYPES.has(field.type) && key !== 'custom_ecoposStock' && key !== 'custom_ecoposVatRate') {
        attrTotal++;
        const modelKey = FIELD_KEY_ALIAS[key] || key;
        let val: any;
        if (key.startsWith('custom_')) {
          val = product.customData?.[key.replace('custom_', '')];
        } else {
          val = product[modelKey];
        }
        if (val != null && String(val).trim()) attrFilled++;
      }
    }
  }

  return {
    photos: imageCount,
    basisPct: basisTotal > 0 ? Math.round((basisFilled / basisTotal) * 100) : -1,
    attrPct: attrTotal > 0 ? Math.round((attrFilled / attrTotal) * 100) : -1,
    critPct: critTotal > 0 ? Math.round((critFilled / critTotal) * 100) : -1,
    basisTotal, attrTotal, critTotal,
    basisFilled, attrFilled, critFilled,
  };
}

function pctStyle(pct: number): React.CSSProperties {
  if (pct < 0) return { backgroundColor: '#f3f4f6', color: '#9ca3af' }; // not applicable
  if (pct >= 75) return { backgroundColor: '#dcfce7', color: '#15803d' };
  if (pct >= 50) return { backgroundColor: '#fef9c3', color: '#92400e' };
  return { backgroundColor: '#fee2e2', color: '#b91c1c' };
}

function Pip({ label, value, bg, color, title }: { label: string; value: string; bg: string; color: string; title: string }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: '1px',
      padding: '2px 5px', borderRadius: '4px',
      backgroundColor: bg, color, fontSize: '0.62rem', fontWeight: 700,
      lineHeight: 1, whiteSpace: 'nowrap', cursor: 'default',
    }}>
      <span>{label}</span><span>{value}</span>
    </span>
  );
}

function CompletenessCell({ product, layout, imageCount }: { product: any; layout: any[]; imageCount: number }) {
  const c = computeCompleteness(product, layout, imageCount);
  const photoStyle = c.photos >= 2
    ? { bg: '#dcfce7', color: '#15803d' }
    : c.photos === 1
      ? { bg: '#fef9c3', color: '#92400e' }
      : { bg: '#fee2e2', color: '#b91c1c' };
  const bs = pctStyle(c.basisPct);
  const as_ = pctStyle(c.attrPct);
  const cs = pctStyle(c.critPct);
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '3px', alignItems: 'center' }}>
      <Pip label="📷" value={String(c.photos)}
        bg={photoStyle.bg} color={photoStyle.color}
        title={`${c.photos} foto${c.photos !== 1 ? "'s" : ''}`} />
      {c.basisTotal > 0 && <Pip label="T" value={`${c.basisPct}%`}
        bg={bs.backgroundColor as string} color={bs.color as string}
        title={`Tekst: ${c.basisFilled}/${c.basisTotal} velden gevuld (${c.basisPct}%)`} />}
      {c.attrTotal > 0 && <Pip label="F" value={`${c.attrPct}%`}
        bg={as_.backgroundColor as string} color={as_.color as string}
        title={`Fysiek: ${c.attrFilled}/${c.attrTotal} velden gevuld (${c.attrPct}%)`} />}
      {c.critTotal > 0 && <Pip label="C" value={`${c.critPct}%`}
        bg={cs.backgroundColor as string} color={cs.color as string}
        title={`Criteria: ${c.critFilled}/${c.critTotal} beoordeeld (${c.critPct}%)`} />}
    </div>
  );
}

export const getStatusColor = (status: string) => {
  switch (status.toUpperCase()) {
    case 'NEW': return 'var(--primary)';
    case 'EDIT': return 'var(--color-mustard)';
    case 'CHECK': return '#3b82f6';
    case 'DONE': return '#10b981';
    default: return 'var(--text-muted)';
  }
};

/**
 * Builds a Google search URL for a product using the fields marked `useForSearch`
 * in the form layout. Resolves both plain fields (product.title) and relation
 * fields via a dotted relationPath (product.brand.name).
 */
function buildGoogleSearchUrl(product: any, layout: any[]): string | null {
  const parts: string[] = [];
  for (const section of layout) {
    for (const field of (section.fields ?? [])) {
      if (!field.useForSearch) continue;
      let value: any;
      if (field.relationPath) {
        // e.g. 'brand.name' → product.brand?.name
        value = field.relationPath.split('.').reduce((obj: any, key: string) => obj?.[key], product);
      } else {
        const key = field.id.replace('FIELD:', '');
        if (key.startsWith('custom_')) {
          value = product.customData?.[key.replace('custom_', '')];
        } else {
          value = product[key];
        }
      }
      const str = value?.toString().trim();
      if (str) parts.push(str);
    }
  }
  if (parts.length === 0) return null;
  return 'https://www.google.com/search?q=' + parts.map(p => encodeURIComponent(p)).join('+');
}

function InlineStatusToggle({
  product,
  isAdmin,
  selectedIds,
  onBulkStatusChange,
}: {
  product: any;
  isAdmin: boolean;
  selectedIds?: Set<string>;
  onBulkStatusChange?: (status: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const currentStatus = (product.status || 'NEW').toUpperCase();

  const lockStatus = (product.readyForImport || '').toUpperCase();
  const isGloballyLocked = !isAdmin && (lockStatus === 'JA' || lockStatus === 'REVIEW' || lockStatus === 'R' || lockStatus === 'Y');

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isGloballyLocked) return;
    const nextStatus = e.target.value;
    if (selectedIds && selectedIds.size > 1 && selectedIds.has(product.internalArticleNumber) && onBulkStatusChange) {
      onBulkStatusChange(nextStatus);
      return;
    }
    startTransition(async () => {
      await updateProductStatusAction(product.internalArticleNumber, nextStatus);
    });
  }

  return (
    <select
      value={currentStatus}
      onChange={handleSelect}
      onClick={(e) => e.stopPropagation()}
      disabled={isPending || isGloballyLocked}
      style={{
        padding: '0.35rem 1.75rem 0.35rem 0.85rem',
        borderRadius: '1rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: getStatusColor(currentStatus),
        color: 'white',
        cursor: (isPending || isGloballyLocked) ? 'not-allowed' : 'pointer',
        opacity: (isPending || isGloballyLocked) ? 0.6 : 1,
        transition: 'all 0.2s',
        display: 'inline-block',
        border: 'none',
        outline: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="white" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>')`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 2px center',
        backgroundSize: '16px'
      }}>
      {['NEW', 'EDIT', 'CHECK', 'DONE'].map(s => (
        <option key={s} value={s} style={{ color: 'var(--text)', backgroundColor: 'white' }}>{s}</option>
      ))}
    </select>
  );
}



function InlineReadyToggle({ product, isAdmin }: { product: any, isAdmin: boolean }) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (val: string) => {
    if (!isAdmin) return; // Enforce authorization
    if (product.readyForImport === val) return;
    startTransition(async () => {
      // EmpCo policy (warn / block) before marking as webshop-ready
      if (val === 'JA' && !(await confirmEmpcoReady([product.internalArticleNumber]))) return;
      const res = await updateReadyForImportAction(product.internalArticleNumber, val);
      if (!res.success) alert(res.error ?? 'Bijwerken mislukt');
    });
  }

  const readyMode = product.readyForImport?.toUpperCase() || 'NEE';

  const btnStyle = (val: string, color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '4px',
    fontWeight: 'bold',
    fontSize: '0.85rem',
    cursor: !isAdmin ? 'not-allowed' : (isPending ? 'wait' : 'pointer'),
    backgroundColor: readyMode === val ? color : 'var(--surface)',
    color: readyMode === val ? 'white' : (!isAdmin ? 'var(--border)' : 'var(--text-muted)'),
    border: readyMode === val ? 'none' : '1px solid var(--border)',
    transition: 'all 0.2s',
    opacity: (!isAdmin && readyMode !== val) ? 0.3 : (isPending ? 0.5 : 1)
  });

  return (
    <div style={{ display: 'flex', gap: '0.4rem' }} onClick={e => e.stopPropagation()}>
      <div style={btnStyle('NEE', 'var(--error)')} onClick={() => handleUpdate('NEE')} title="No">N</div>
      <div style={btnStyle('REVIEW', '#3b82f6')} onClick={() => handleUpdate('REVIEW')} title="Review">R</div>
      <div style={btnStyle('JA', 'var(--success)')} onClick={() => handleUpdate('JA')} title="Yes">Y</div>
    </div>
  );
}

function getPageNumbers(currentPage: number, totalPages: number) {
  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) {
      pages.push('...');
    }
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) {
      pages.push('...');
    }
    pages.push(totalPages);
  }
  return pages;
}

export default function ProductsClient({
  initialProducts, systemUsers = [], isAdmin = false, canAssignProducts = false, canUseAi = false, canApproveEmpco = true, fieldPermissions = {}, layout = [], currentUserId = '', currentUserChatColor = null, currentUserAutoMarkRemarksAsRead = true, aiScoreMap = {}, imageCountMap = {}, empcoMap = {}, allSuppliers = []
}: { initialProducts: any[], systemUsers ?: any[], isAdmin ?: boolean, canAssignProducts ?: boolean, canUseAi ?: boolean, canApproveEmpco ?: boolean, fieldPermissions ?: Record<string, string>, layout ?: any[], currentUserId ?: string, currentUserChatColor ?: string | null, currentUserAutoMarkRemarksAsRead ?: boolean, aiScoreMap ?: Record<string, number | null>, imageCountMap ?: Record<string, number>, empcoMap ?: Record<string, EmpcoMapEntry>, allSuppliers ?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showBatchAnalyze, setShowBatchAnalyze] = useState(false);
  const [batchMode, setBatchMode] = useState<BatchMode | undefined>(undefined);
  const [bulkFixIds, setBulkFixIds] = useState<string[] | null>(null); // EmpCo bulk-fix modal (stable id list)
  const [isDeleting, startTransition] = useTransition();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFormattingModal, setShowFormattingModal] = useState(false);
  const [showEcoPosModal, setShowEcoPosModal] = useState(false);
  const [ecoPosArticles, setEcoPosArticles] = useState<string[] | undefined>(undefined);

  // ── Suppliers state & transfer modal (Admin only) ────────────────────────
  const [suppliersList, setSuppliersList] = useState<{ id: string; name: string }[]>(allSuppliers);
  const [showTransferSupplierModal, setShowTransferSupplierModal] = useState(false);
  const [preselectedTransferSupplierId, setPreselectedTransferSupplierId] = useState<string>('');
  const [transferSuccessMessage, setTransferSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (allSuppliers) setSuppliersList(allSuppliers);
  }, [allSuppliers]);

  const handleSupplierTransferSuccess = (targetSupplier: { id: string; name: string }, count: number) => {
    setSuppliersList(prev => {
      if (prev.some(s => s.id === targetSupplier.id)) return prev;
      return [...prev, targetSupplier].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelectedIds(new Set());
    setTransferSuccessMessage(`${count} product(en) succesvol omgezet naar leverancier "${targetSupplier.name}".`);
    setTimeout(() => setTransferSuccessMessage(null), 6000);
    router.refresh();
  };

  // ── Unread messages indicator ──────────────────────────────────────────
  const [unreadProducts, setUnreadProducts] = useState<Set<string>>(new Set());

  // Memoised so it re-creates (and re-fires effects) when initialProducts
  // changes — i.e. after every router.refresh() cycle below.
  const checkUnreadProducts = useCallback(() => {
    if (typeof window === 'undefined') return;
    const unread = new Set<string>();
    for (const product of initialProducts) {
      const latestRemark = product.remarks?.[0];
      if (!latestRemark) continue;
      if (latestRemark.userId === currentUserId) continue; // own message
      const key = `chat_last_seen_${currentUserId}_${product.internalArticleNumber}`;
      const lastSeen = localStorage.getItem(key);
      const seenDate = lastSeen ? new Date(lastSeen) : null;
      if (!seenDate || new Date(latestRemark.createdAt) > seenDate) {
        unread.add(product.internalArticleNumber);
      }
    }
    setUnreadProducts(unread);
  }, [initialProducts, currentUserId]);

  // Runs on mount AND whenever initialProducts is refreshed by the auto-sync below
  useEffect(() => { checkUnreadProducts(); }, [checkUnreadProducts]);

  // Re-check when drawer closes (chat has updated localStorage)
  useEffect(() => {
    if (!selectedProduct) checkUnreadProducts();
  }, [selectedProduct, checkUnreadProducts]);

  // Real-time synchronization when a chat is marked read or unread
  useEffect(() => {
    const handleSeenUpdated = () => checkUnreadProducts();
    window.addEventListener('chat_seen_updated', handleSeenUpdated);
    window.addEventListener('storage', handleSeenUpdated);
    return () => {
      window.removeEventListener('chat_seen_updated', handleSeenUpdated);
      window.removeEventListener('storage', handleSeenUpdated);
    };
  }, [checkUnreadProducts]);

  const getLayoutLabel = (fieldId: string, defaultLabel: string) => {
    if (!layout) return defaultLabel;
    for (const section of layout) {
      if (!section.fields) continue;
      const field = section.fields.find((f: any) => f.id === fieldId);
      if (field && field.label) return field.label;
    }
    return defaultLabel;
  };

  // Auto-Sync Background Engine — also triggers checkUnreadProducts via the
  // useCallback dependency chain when fresh initialProducts arrive.
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 10000); // 10 seconds — balanced for near-real-time badge updates
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    triggerAutoEcoPosSyncIfDueAction().then(res => {
      if (res.triggered && res.result?.ok) router.refresh();
    }).catch(() => { });
    const ecoInterval = setInterval(() => {
      triggerAutoEcoPosSyncIfDueAction().then(res => {
        if (res.triggered && res.result?.ok) router.refresh();
      }).catch(() => { });
    }, 60000);
    return () => clearInterval(ecoInterval);
  }, [router]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [webshopActiveFilter, setWebshopActiveFilter] = useState('');
  const [webshopReadyFilter, setWebshopReadyFilter] = useState('');
  const [assignedUserFilter, setAssignedUserFilter] = useState('');
  const [aiScoreFilter, setAiScoreFilter] = useState('');
  const [unreadFilter, setUnreadFilter] = useState('');
  const [empcoFilter, setEmpcoFilter] = useState('');
  const [liveEmpcoMap, setLiveEmpcoMap] = useState<Record<string, EmpcoMapEntry>>(empcoMap);
  useEffect(() => { setLiveEmpcoMap(empcoMap); }, [empcoMap]);

  // Read ?category= query parameter on mount (e.g. when navigating from /categories)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const catParam = params.get('category');
      if (catParam) setCategoryFilter(catParam);
    }
  }, []);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'ALL'>(50);

  // Reset page to 1 when filters or search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, supplierFilter, brandFilter, categoryFilter, statusFilter, webshopActiveFilter, webshopReadyFilter, assignedUserFilter, aiScoreFilter, unreadFilter, empcoFilter]);

  // Multi-select State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Extract subcategory/group names for a product (ignoring MplusWebshops root)
  const getProductSubcategoryNames = useCallback((p: any): string[] => {
    const rawSub = p.subcategory?.name?.trim() || '';
    const rawCat = p.category?.name?.trim() || '';
    const effective = (rawSub && rawSub.toLowerCase() !== 'mpluswebshops')
      ? rawSub
      : (rawCat && rawCat.toLowerCase() !== 'mpluswebshops' ? rawCat : '');
    if (!effective) return [];
    return effective.split(',').map((s: string) => s.trim()).filter(Boolean);
  }, []);

  // Unique Lists for Dropdowns
  // Helper match functions for each filter (reused for dynamic option filtering)
  const matchSearch = useCallback((p: any) => searchQuery === '' ||
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.internalArticleNumber.toLowerCase().includes(searchQuery.toLowerCase()), [searchQuery]);

  const matchSupplier = useCallback((p: any) => supplierFilter === '' || p.supplier?.name === supplierFilter, [supplierFilter]);
  const matchBrand = useCallback((p: any) => brandFilter === '' || p.brand?.name === brandFilter, [brandFilter]);
  const matchCategory = useCallback((p: any) => {
    if (categoryFilter === '') return true;
    const names = getProductSubcategoryNames(p);
    if (categoryFilter === 'UNCATEGORIZED') return names.length === 0;
    return names.includes(categoryFilter) || p.category?.name === categoryFilter;
  }, [categoryFilter, getProductSubcategoryNames]);
  const matchStatus = useCallback((p: any) => statusFilter === '' || (p.status || 'NEW').toUpperCase() === statusFilter, [statusFilter]);
  const matchWebshopActive = useCallback((p: any) => {
    if (webshopActiveFilter === '') return true;
    return webshopActiveFilter === 'JA' ? Boolean(p.webshopActive) : !p.webshopActive;
  }, [webshopActiveFilter]);
  const matchReady = useCallback((p: any) => webshopReadyFilter === '' || (p.readyForImport || 'NEE').toUpperCase() === webshopReadyFilter, [webshopReadyFilter]);
  const matchAssigned = useCallback((p: any) => assignedUserFilter === '' || (assignedUserFilter === 'UNASSIGNED' ? !p.assignedUserId : p.assignedUserId === assignedUserFilter), [assignedUserFilter]);
  const matchScore = useCallback((p: any) => aiScoreFilter === '' || (aiScoreFilter === 'WITH_SCORE' ? aiScoreMap[p.internalArticleNumber] != null : aiScoreMap[p.internalArticleNumber] == null), [aiScoreFilter, aiScoreMap]);
  const matchUnread = useCallback((p: any) => unreadFilter === '' || (unreadFilter === 'UNREAD' ? unreadProducts.has(p.internalArticleNumber) : !unreadProducts.has(p.internalArticleNumber)), [unreadFilter, unreadProducts]);
  const empcoStateOf = useCallback((p: any): string => {
    const e = liveEmpcoMap[p.internalArticleNumber];
    if (!e) return 'NONE';
    return e.stale ? 'STALE' : e.status;
  }, [liveEmpcoMap]);
  const matchEmpco = useCallback((p: any) => {
    if (empcoFilter === '') return true;
    const s = empcoStateOf(p);
    if (empcoFilter === 'TODO') return s === 'NONE' || s === 'STALE'; // needs (re)check
    if (empcoFilter === 'ISSUES') return s === 'FAIL' || s === 'WARNING';
    return s === empcoFilter;
  }, [empcoFilter, empcoStateOf]);

  // Unique Lists for Dropdowns based on "all other filters except itself" (faceted search)
  const uniqueSuppliers = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchBrand(p) &&
      matchStatus(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchScore(p) &&
      matchUnread(p)
    );
    const names = subset.map(p => p.supplier?.name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [initialProducts, matchSearch, matchBrand, matchStatus, matchReady, matchAssigned, matchScore, matchUnread]);

  const uniqueBrands = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchStatus(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchScore(p) &&
      matchUnread(p)
    );
    const names = subset.map(p => p.brand?.name).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [initialProducts, matchSearch, matchSupplier, matchStatus, matchReady, matchAssigned, matchScore, matchUnread]);

  const availableStatuses = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchScore(p) &&
      matchUnread(p)
    );
    const statuses = subset.map(p => (p.status || 'NEW').toUpperCase());
    return Array.from(new Set(statuses));
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchReady, matchAssigned, matchScore, matchUnread]);

  const availableReadiness = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchStatus(p) &&
      matchAssigned(p) &&
      matchScore(p) &&
      matchUnread(p)
    );
    const readyValues = subset.map(p => (p.readyForImport || 'NEE').toUpperCase());
    return Array.from(new Set(readyValues));
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchStatus, matchAssigned, matchScore, matchUnread]);

  const availableAiScores = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchStatus(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchUnread(p)
    );
    const scores = new Set<string>();
    subset.forEach(p => {
      if (aiScoreMap[p.internalArticleNumber] != null) {
        scores.add('WITH_SCORE');
      } else {
        scores.add('WITHOUT_SCORE');
      }
    });
    return Array.from(scores);
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchStatus, matchReady, matchAssigned, matchUnread, aiScoreMap]);

  const availableUnreadFilters = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchStatus(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchScore(p)
    );
    const unreadOpts = new Set<string>();
    subset.forEach(p => {
      if (unreadProducts.has(p.internalArticleNumber)) {
        unreadOpts.add('UNREAD');
      } else {
        unreadOpts.add('READ');
      }
    });
    return Array.from(unreadOpts);
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchStatus, matchReady, matchAssigned, matchScore, unreadProducts]);

  const availableAssignedUsers = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchStatus(p) &&
      matchReady(p) &&
      matchScore(p) &&
      matchUnread(p)
    );
    const userIds = new Set<string>();
    let hasUnassigned = false;
    subset.forEach(p => {
      if (p.assignedUserId) {
        userIds.add(p.assignedUserId);
      } else {
        hasUnassigned = true;
      }
    });
    return {
      userIds: Array.from(userIds),
      hasUnassigned
    };
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchStatus, matchReady, matchScore, matchUnread]);

  const uniqueCategories = useMemo(() => {
    const subset = initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchStatus(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchScore(p) &&
      matchUnread(p)
    );
    const catSet = new Set<string>();
    let hasUncategorized = false;
    subset.forEach(p => {
      const names = getProductSubcategoryNames(p);
      if (names.length === 0) {
        hasUncategorized = true;
      } else {
        names.forEach(n => catSet.add(n));
      }
    });
    return {
      names: Array.from(catSet).sort((a, b) => a.localeCompare(b, 'nl')),
      hasUncategorized,
    };
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchStatus, matchReady, matchAssigned, matchScore, matchUnread, getProductSubcategoryNames]);

  // Filtered resulting list (uses all filters)
  const filteredProducts = useMemo(() => {
    return initialProducts.filter(p =>
      matchSearch(p) &&
      matchSupplier(p) &&
      matchBrand(p) &&
      matchCategory(p) &&
      matchStatus(p) &&
      matchWebshopActive(p) &&
      matchReady(p) &&
      matchAssigned(p) &&
      matchScore(p) &&
      matchUnread(p) &&
      matchEmpco(p)
    );
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchCategory, matchStatus, matchWebshopActive, matchReady, matchAssigned, matchScore, matchUnread, matchEmpco]);

  // EmpCo filter option counts (based on all other filters)
  const empcoCounts = useMemo(() => {
    const c: Record<string, number> = { NONE: 0, STALE: 0, PASS: 0, WARNING: 0, FAIL: 0 };
    initialProducts.forEach(p => {
      if (matchSearch(p) && matchSupplier(p) && matchBrand(p) && matchCategory(p) && matchStatus(p) && matchReady(p) && matchAssigned(p) && matchScore(p) && matchUnread(p)) {
        const s = empcoStateOf(p);
        c[s] = (c[s] ?? 0) + 1;
      }
    });
    return c;
  }, [initialProducts, matchSearch, matchSupplier, matchBrand, matchCategory, matchStatus, matchReady, matchAssigned, matchScore, matchUnread, empcoStateOf]);

  const totalPages = useMemo(() => {
    if (pageSize === 'ALL') return 1;
    return Math.ceil(filteredProducts.length / pageSize) || 1;
  }, [filteredProducts.length, pageSize]);

  const paginatedProducts = useMemo(() => {
    if (pageSize === 'ALL') return filteredProducts;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredProducts.slice(startIndex, startIndex + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Auto-sync currentPage when selectedProduct changes to a product on another page
  useEffect(() => {
    if (selectedProduct && pageSize !== 'ALL') {
      const idx = filteredProducts.findIndex(p => p.internalArticleNumber === selectedProduct.internalArticleNumber);
      if (idx !== -1) {
        const expectedPage = Math.floor(idx / pageSize) + 1;
        if (expectedPage !== currentPage) {
          setCurrentPage(expectedPage);
        }
      }
    }
  }, [selectedProduct, filteredProducts, pageSize, currentPage]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length && filteredProducts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.internalArticleNumber)));
    }
  };

  const toggleSelect = (id: string, e?: React.ChangeEvent) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const executeBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setShowDeleteConfirm(true);
  };

  const confirmDeleteProducts = () => {
    setShowDeleteConfirm(false);
    startTransition(async () => {
      const idsArray = Array.from(selectedIds);
      const res = await deleteProductsAction(idsArray);
      if (res.success) {
        setSelectedIds(new Set());
      } else {
        alert("Fout bij verwijderen: " + res.error);
      }
    });
  };

  const handleBulkAssign = (userId: string) => {
    if (selectedIds.size === 0) return;
    startTransition(async () => {
      const idsArray = Array.from(selectedIds);
      const res = await bulkAssignAction(idsArray, userId);
      if (res.success) {
        setSelectedIds(new Set());
      } else {
        alert("Fout bij toewijzen: " + res.error);
      }
    });
  };

  const handleBulkReadyForImport = (val: string) => {
    if (selectedIds.size === 0) return;
    startTransition(async () => {
      const idsArray = Array.from(selectedIds);
      // EmpCo policy (warn / block) before marking as webshop-ready
      if (val === 'JA' && !(await confirmEmpcoReady(idsArray))) return;
      const res = await bulkUpdateReadyForImportAction(idsArray, val);
      if (res.success) {
        setSelectedIds(new Set());
      } else {
        alert("Fout bij bijwerken: " + res.error);
      }
    });
  };

  const handleBulkStatusChange = (val: string) => {
    if (selectedIds.size === 0 || !val) return;
    startTransition(async () => {
      const idsArray = Array.from(selectedIds);
      const res = await bulkUpdateProductStatusAction(idsArray, val);
      if (res.success) {
        setSelectedIds(new Set());
      } else {
        alert("Fout bij status wijzigen: " + res.error);
      }
    });
  };

  const currentIndex = selectedProduct ? filteredProducts.findIndex(p => p.internalArticleNumber === selectedProduct.internalArticleNumber) : -1;
  const handlePrev = currentIndex > 0 ? () => setSelectedProduct(filteredProducts[currentIndex - 1]) : undefined;
  const handleNext = currentIndex >= 0 && currentIndex < filteredProducts.length - 1 ? () => setSelectedProduct(filteredProducts[currentIndex + 1]) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '1600px' }}>
      {showImportWizard && (
        <ExcelImportWizard onClose={(shouldRefresh) => {
          setShowImportWizard(false);
          if (shouldRefresh) {
            window.location.reload();
          }
        }} />
      )}
      {showBatchAnalyze && (
        <BatchAnalyzeModal
          products={filteredProducts.filter(p => selectedIds.has(p.internalArticleNumber))}
          layout={layout}
          canUseAi={canUseAi}
          initialMode={batchMode}
          onClose={() => { setShowBatchAnalyze(false); setSelectedIds(new Set()); }}
          onComplete={() => router.refresh()}
        />
      )}
      {bulkFixIds && (
        <EmpcoBulkFixModal
          articleNumbers={bulkFixIds}
          onClose={() => { setBulkFixIds(null); setSelectedIds(new Set()); }}
          onComplete={() => router.refresh()}
        />
      )}
      {showTransferSupplierModal && (
        <TransferSupplierModal
          isOpen={showTransferSupplierModal}
          onClose={() => setShowTransferSupplierModal(false)}
          products={filteredProducts.filter(p => selectedIds.has(p.internalArticleNumber))}
          allSuppliers={suppliersList}
          preselectedSupplierId={preselectedTransferSupplierId}
          onSuccess={handleSupplierTransferSuccess}
        />
      )}
      {showEcoPosModal && (
        <EcoPosSyncModal
          isOpen={showEcoPosModal}
          onClose={() => setShowEcoPosModal(false)}
          articleNumbers={ecoPosArticles}
          onComplete={() => {
            setSelectedIds(new Set());
            router.refresh();
          }}
        />
      )}
      {showFormattingModal && (
        <FormattingRulePreviewModal
          isOpen={showFormattingModal}
          onClose={() => setShowFormattingModal(false)}
          articleNumbers={Array.from(selectedIds)}
          onComplete={() => {
            setSelectedIds(new Set());
            router.refresh();
          }}
        />
      )}
      {transferSuccessMessage && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'rgba(51, 133, 140, 0.12)',
            border: '1.5px solid var(--color-teal)',
            borderRadius: 'var(--radius)',
            color: 'var(--text)',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 12px rgba(51, 133, 140, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>✅</span>
            <span>{transferSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setTransferSuccessMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Row: Title + Global Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text)', margin: 0, whiteSpace: 'nowrap' }}>Products Database</h1>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && (
            <button
              type="button"
              className="btn"
              style={{
                padding: '0.55rem 1rem',
                fontSize: '0.88rem',
                backgroundColor: '#f0f9ff',
                border: '1px solid #7dd3fc',
                cursor: 'pointer',
                color: '#0369a1',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              onClick={() => {
                setEcoPosArticles(undefined);
                setShowEcoPosModal(true);
              }}
              title="Synchroniseer producten en statussen vanuit EcoPos / MplusKassa"
            >
              🔄 EcoPos Sync
            </button>
          )}
          {isAdmin && (
            <button
              className="btn"
              style={{ padding: '0.55rem 1rem', fontSize: '0.88rem', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }}
              onClick={() => setShowImportWizard(true)}
            >
              📥 Import Excel
            </button>
          )}
          <button className="btn btn-primary" style={{ padding: '0.55rem 1rem', fontSize: '0.88rem', whiteSpace: 'nowrap' }}>+ New Product</button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', padding: '0.75rem 0.9rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <input
          type="text"
          placeholder="🔍 Zoek Artikel of ID..."
          className="input"
          style={{ flex: '2 1 190px', minWidth: '170px', padding: '0.45rem 0.75rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="input"
          style={{ flex: '1 1 125px', minWidth: '115px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
        >
          <option value="">-- Leveranciers --</option>
          {uniqueSuppliers.map(sup => (
            <option key={sup} value={sup as string}>{sup}</option>
          ))}
        </select>
        <select
          className="input"
          style={{ flex: '1 1 115px', minWidth: '105px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
        >
          <option value="">-- Merken --</option>
          {uniqueBrands.map(b => (
            <option key={b} value={b as string}>{b}</option>
          ))}
        </select>
        <select
          className="input"
          style={{ flex: '1 1 130px', minWidth: '115px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">-- Categorie --</option>
          {(uniqueCategories.hasUncategorized || categoryFilter === 'UNCATEGORIZED') && (
            <option value="UNCATEGORIZED">[ Geen Categorie ]</option>
          )}
          {uniqueCategories.names.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
          {categoryFilter && categoryFilter !== 'UNCATEGORIZED' && !uniqueCategories.names.includes(categoryFilter) && (
            <option value={categoryFilter}>{categoryFilter}</option>
          )}
        </select>
        <select
          className="input"
          style={{ flex: '1 1 100px', minWidth: '95px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">-- Status --</option>
          {(availableStatuses.includes('NEW') || statusFilter === 'NEW') && <option value="NEW">NEW</option>}
          {(availableStatuses.includes('EDIT') || statusFilter === 'EDIT') && <option value="EDIT">EDIT</option>}
          {(availableStatuses.includes('CHECK') || statusFilter === 'CHECK') && <option value="CHECK">CHECK</option>}
          {(availableStatuses.includes('DONE') || statusFilter === 'DONE') && <option value="DONE">DONE</option>}
        </select>
        <select
          className="input"
          style={{ flex: '1 1 130px', minWidth: '120px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={webshopActiveFilter}
          onChange={(e) => setWebshopActiveFilter(e.target.value)}
        >
          <option value="">-- Op Webshop --</option>
          <option value="JA">✅ Op Webshop (Ja)</option>
          <option value="NEE">🚫 Niet op Webshop (Nee)</option>
        </select>
        <select
          className="input"
          style={{ flex: '1 1 130px', minWidth: '120px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={webshopReadyFilter}
          onChange={(e) => setWebshopReadyFilter(e.target.value)}
        >
          <option value="">-- Webshop Ready --</option>
          {(availableReadiness.includes('NEE') || webshopReadyFilter === 'NEE') && <option value="NEE">No (N)</option>}
          {(availableReadiness.includes('REVIEW') || webshopReadyFilter === 'REVIEW') && <option value="REVIEW">Review (R)</option>}
          {(availableReadiness.includes('JA') || webshopReadyFilter === 'JA') && <option value="JA">Yes (Y)</option>}
        </select>
        {canUseAi && (
          <select
            className="input"
            style={{ flex: '1 1 115px', minWidth: '105px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
            value={aiScoreFilter}
            onChange={(e) => setAiScoreFilter(e.target.value)}
          >
            <option value="">-- AI Score --</option>
            {(availableAiScores.includes('WITH_SCORE') || aiScoreFilter === 'WITH_SCORE') && <option value="WITH_SCORE">Met score</option>}
            {(availableAiScores.includes('WITHOUT_SCORE') || aiScoreFilter === 'WITHOUT_SCORE') && <option value="WITHOUT_SCORE">Zonder score</option>}
          </select>
        )}
        <select
          className="input"
          style={{ flex: '1 1 115px', minWidth: '105px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={unreadFilter}
          onChange={(e) => setUnreadFilter(e.target.value)}
        >
          <option value="">-- Berichten --</option>
          {(availableUnreadFilters.includes('UNREAD') || unreadFilter === 'UNREAD') && <option value="UNREAD">Ongelezen (💬)</option>}
          {(availableUnreadFilters.includes('READ') || unreadFilter === 'READ') && <option value="READ">Geen ongelezen</option>}
        </select>
        <select
          id="empco-filter"
          className="input"
          style={{ flex: '1 1 130px', minWidth: '115px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
          value={empcoFilter}
          onChange={(e) => setEmpcoFilter(e.target.value)}
        >
          <option value="">-- EmpCo --</option>
          <option value="TODO">⚖️ Te checken ({empcoCounts.NONE + empcoCounts.STALE})</option>
          <option value="NONE"> Niet gecheckt ({empcoCounts.NONE})</option>
          <option value="STALE"> 🕓 Verouderd ({empcoCounts.STALE})</option>
          <option value="ISSUES">🚩 Met bevindingen ({empcoCounts.FAIL + empcoCounts.WARNING})</option>
          <option value="FAIL"> ⛔ Overtreding ({empcoCounts.FAIL})</option>
          <option value="WARNING"> ⚠️ Aandachtspunten ({empcoCounts.WARNING})</option>
          <option value="PASS">✅ EmpCo OK ({empcoCounts.PASS})</option>
        </select>
        {(isAdmin || canAssignProducts) && (
          <select
            className="input"
            style={{ flex: '1 1 125px', minWidth: '115px', padding: '0.45rem 0.5rem', fontSize: '0.85rem', borderRadius: 'var(--radius)' }}
            value={assignedUserFilter}
            onChange={(e) => setAssignedUserFilter(e.target.value)}
          >
            <option value="">-- Toegewezen --</option>
            {(availableAssignedUsers.hasUnassigned || assignedUserFilter === 'UNASSIGNED') && <option value="UNASSIGNED">[ Niet Toegewezen ]</option>}
            {systemUsers.map(su => {
              const hasUser = availableAssignedUsers.userIds.includes(su.id);
              const isSelected = assignedUserFilter === su.id;
              if (hasUser || isSelected) {
                return <option key={su.id} value={su.id}>{su.email.split('@')[0]}</option>;
              }
              return null;
            })}
          </select>
        )}
      </div>

      {/* Dedicated Bulk Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div
          className="glass"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            padding: '0.65rem 0.9rem',
            borderRadius: 'var(--radius)',
            border: '1px solid #c7d2fe',
            backgroundColor: '#f8fafc',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
          }}
        >
          {/* Left group: Selection count + Bulk property dropdowns */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.7rem',
                borderRadius: '999px',
                backgroundColor: '#e0e7ff',
                color: '#3730a3',
                fontSize: '0.8rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              ✓ {selectedIds.size} geselecteerd
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                title="Selectie wissen"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#4338ca',
                  cursor: 'pointer',
                  padding: '0 0.15rem',
                  fontSize: '0.85rem',
                  lineHeight: 1,
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </span>

            {(isAdmin || canAssignProducts) && (
              <select
                className="input"
                style={{
                  width: 'auto',
                  minWidth: '155px',
                  height: '34px',
                  padding: '0 0.65rem',
                  cursor: isDeleting ? 'wait' : 'pointer',
                  backgroundColor: 'white',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  borderRadius: 'var(--radius)',
                }}
                disabled={isDeleting}
                value=""
                onChange={(e) => handleBulkAssign(e.target.value)}
              >
                <option value="" disabled>👤 Toewijzen aan...</option>
                <option value="NONE">-- Ontkoppelen (Unassign) --</option>
                {systemUsers.map(su => (
                  <option key={su.id} value={su.id}>{su.email.split('@')[0]}</option>
                ))}
              </select>
            )}

            <select
              className="input"
              style={{
                width: 'auto',
                minWidth: '150px',
                height: '34px',
                padding: '0 0.65rem',
                cursor: isDeleting ? 'wait' : 'pointer',
                backgroundColor: 'white',
                border: '1px solid var(--border)',
                fontWeight: 600,
                fontSize: '0.82rem',
                borderRadius: 'var(--radius)',
              }}
              disabled={isDeleting}
              value=""
              onChange={(e) => handleBulkStatusChange(e.target.value)}
            >
              <option value="" disabled>🏷️ Status wijzigen...</option>
              <option value="NEW">NEW</option>
              <option value="EDIT">EDIT</option>
              <option value="CHECK">CHECK</option>
              <option value="DONE">DONE</option>
            </select>

            {isAdmin && (
              <select
                className="input"
                style={{
                  width: 'auto',
                  minWidth: '150px',
                  height: '34px',
                  padding: '0 0.65rem',
                  cursor: isDeleting ? 'wait' : 'pointer',
                  backgroundColor: 'white',
                  border: '1px solid var(--border)',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  borderRadius: 'var(--radius)',
                }}
                disabled={isDeleting}
                value=""
                onChange={(e) => handleBulkReadyForImport(e.target.value)}
              >
                <option value="" disabled>🌐 Webshop Ready...</option>
                <option value="NEE">Nee (N)</option>
                <option value="REVIEW">Review (R)</option>
                <option value="JA">Ja (Y)</option>
              </select>
            )}

            {isAdmin && (
              <button
                type="button"
                className="btn"
                style={{
                  height: '34px',
                  padding: '0 0.75rem',
                  fontSize: '0.82rem',
                  backgroundColor: 'white',
                  border: '1px solid var(--border)',
                  cursor: isDeleting ? 'wait' : 'pointer',
                  color: 'var(--text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  setPreselectedTransferSupplierId('');
                  setShowTransferSupplierModal(true);
                }}
                disabled={isDeleting}
                title={`Zet ${selectedIds.size} geselecteerde product(en) om naar een andere leverancier`}
              >
                🏢 Leverancier omzetten
              </button>
            )}
          </div>

          {/* Right group: Batch tools + Delete */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem' }}>
            {canUseAi && (
              <button
                type="button"
                className="btn"
                onClick={() => { setBatchMode(undefined); setShowBatchAnalyze(true); }}
                style={{
                  height: '34px',
                  padding: '0 0.75rem',
                  fontSize: '0.82rem',
                  backgroundColor: '#7c3aed',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                }}
                title={`Analyseer ${selectedIds.size} geselecteerde producten`}
              >
                🤖 Analyseer ({selectedIds.size})
              </button>
            )}

            {canUseAi && (
              <button
                type="button"
                className="btn"
                onClick={() => { setBatchMode('empco'); setShowBatchAnalyze(true); }}
                style={{
                  height: '34px',
                  padding: '0 0.75rem',
                  fontSize: '0.82rem',
                  background: 'linear-gradient(135deg,#0f766e,#065f46)',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                }}
                title={`EmpCo-check voor ${selectedIds.size} geselecteerde producten`}
              >
                ⚖️ EmpCo-check ({selectedIds.size})
              </button>
            )}

            {canApproveEmpco && (
              <button
                id="empco-bulk-fix-btn"
                type="button"
                className="btn"
                onClick={() => setBulkFixIds(Array.from(selectedIds))}
                style={{
                  height: '34px',
                  padding: '0 0.75rem',
                  fontSize: '0.82rem',
                  backgroundColor: 'white',
                  border: '1.5px solid #0f766e',
                  color: '#0f766e',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                }}
                title={`EmpCo-voorstellen bekijken en doorvoeren voor ${selectedIds.size} geselecteerde producten`}
              >
                ✍️ EmpCo-voorstellen ({selectedIds.size})
              </button>
            )}

            {canUseAi && (
              <button
                id="formatting-bulk-btn"
                type="button"
                className="btn"
                onClick={() => setShowFormattingModal(true)}
                style={{
                  height: '34px',
                  padding: '0 0.75rem',
                  fontSize: '0.82rem',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                }}
                title={`Formatteer ${selectedIds.size} geselecteerde producten met standaard regels`}
              >
                ✨ Formateren ({selectedIds.size})
              </button>
            )}

            <button
              type="button"
              className="btn"
              onClick={() => {
                setEcoPosArticles(Array.from(selectedIds));
                setShowEcoPosModal(true);
              }}
              style={{
                height: '34px',
                padding: '0 0.75rem',
                fontSize: '0.82rem',
                backgroundColor: '#0284c7',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600,
                borderRadius: 'var(--radius)',
                whiteSpace: 'nowrap',
              }}
              title={`Haal actuele status & productinfo uit EcoPos op voor ${selectedIds.size} geselecteerde producten`}
            >
              🔄 EcoPos ({selectedIds.size})
            </button>

            {isAdmin && (
              <button
                type="button"
                className="btn"
                style={{
                  height: '34px',
                  padding: '0 0.75rem',
                  fontSize: '0.82rem',
                  backgroundColor: 'var(--error)',
                  border: 'none',
                  cursor: isDeleting ? 'wait' : 'pointer',
                  color: 'white',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius)',
                  whiteSpace: 'nowrap',
                }}
                onClick={executeBulkDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '...' : '🗑 Verwijder'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1.25rem 0.75rem 1.25rem 1.25rem', width: '48px', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredProducts.length}
                    ref={input => {
                      if (input) {
                        input.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredProducts.length;
                      }
                    }}
                    onChange={toggleSelectAll}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: 'var(--primary)',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:internalArticleNumber', 'Article ID')}</th>
              {(isAdmin || canAssignProducts) && <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toewijzing</th>}
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:supplierId', 'Leverancier')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:brandId', 'Merk')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:title', 'Title')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getLayoutLabel('FIELD:status', 'Status')}</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compleet</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EmpCo</th>
              <th style={{ padding: '1.25rem', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Webshop Ready</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.map(product => (
              <tr
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background-color 0.2s', backgroundColor: selectedIds.has(product.internalArticleNumber) ? 'var(--primary-glow)' : 'transparent' }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = selectedIds.has(product.internalArticleNumber) ? 'var(--primary-glow)' : 'var(--surface-hover)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedIds.has(product.internalArticleNumber) ? 'var(--primary-glow)' : 'transparent'}
              >
                <td
                  style={{ padding: '1rem 0.75rem 1rem 1.25rem', width: '48px', textAlign: 'center', verticalAlign: 'middle', cursor: 'pointer' }}
                  onClick={e => {
                    e.stopPropagation();
                    toggleSelect(product.internalArticleNumber);
                  }}
                  title="Selecteer product"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.internalArticleNumber)}
                      onChange={e => {
                        e.stopPropagation();
                        toggleSelect(product.internalArticleNumber);
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        accentColor: 'var(--primary)',
                        borderRadius: '4px'
                      }}
                    />
                  </div>
                </td>
                <td style={{ padding: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>
                  {(() => {
                    const googleUrl = buildGoogleSearchUrl(product, layout);
                    if (!googleUrl) return product.internalArticleNumber;
                    return (
                      <a
                        href={googleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title="Google zoeken op basis van gemarkeerde velden"
                        style={{
                          color: 'var(--primary)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          borderBottom: '1px dashed var(--primary)',
                          paddingBottom: '1px',
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                      >
                        {product.internalArticleNumber}
                        <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>🌐</span>
                      </a>
                    );
                  })()}
                </td>
                {(isAdmin || canAssignProducts) && (
                  <td style={{ padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
                    <select
                      value={product.assignedUserId || 'NONE'}
                      onChange={(e) => {
                        startTransition(async () => { await bulkAssignAction([product.internalArticleNumber], e.target.value); });
                      }}
                      style={{ border: 'none', backgroundColor: 'transparent', color: product.assignedUserId ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      <option value="NONE">-</option>
                      {systemUsers.map(su => (
                        <option key={su.id} value={su.id}>{su.email.split('@')[0]}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>{product.supplier?.name || '-'}</td>
                <td style={{ padding: '1.25rem', color: 'var(--text-muted)' }}>{product.brand?.name || '-'}</td>
                <td style={{ padding: '1.25rem', color: 'var(--text)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{product.title}</span>
                    {unreadProducts.has(product.internalArticleNumber) && (
                      <span
                        title="Ongelezen berichten in interne communicatie"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                          backgroundColor: '#ef4444', color: 'white',
                          fontSize: '0.6rem', fontWeight: 800,
                          padding: '0.1rem 0.45rem', borderRadius: '1rem',
                          flexShrink: 0, animation: 'chat-unread-pulse 2s ease-in-out infinite',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        💬 nieuw
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '1.25rem' }}>
                  <InlineStatusToggle
                    product={product}
                    isAdmin={isAdmin}
                    selectedIds={selectedIds}
                    onBulkStatusChange={handleBulkStatusChange}
                  />
                </td>
                <td style={{ padding: '0.6rem 1.25rem' }}>
                  <CompletenessCell product={product} layout={layout} imageCount={imageCountMap[product.internalArticleNumber] ?? 0} />
                </td>
                <td style={{ padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
                  <AiAnalysisViewer
                    articleNumber={product.internalArticleNumber}
                    productTitle={product.title}
                    score={aiScoreMap[product.internalArticleNumber] ?? null}
                    canUseAi={canUseAi}
                  />
                </td>
                <td style={{ padding: '1.25rem' }} onClick={e => e.stopPropagation()}>
                  <EmpcoViewer
                    articleNumber={product.internalArticleNumber}
                    productTitle={product.title}
                    status={liveEmpcoMap[product.internalArticleNumber]?.status ?? null}
                    stale={liveEmpcoMap[product.internalArticleNumber]?.stale ?? false}
                    issueCount={liveEmpcoMap[product.internalArticleNumber]?.issueCount ?? 0}
                    onOpenProduct={() => setSelectedProduct(product)}
                    canApprove={canApproveEmpco}
                    isAdmin={isAdmin}
                  />
                </td>
                <td style={{ padding: '1.25rem' }}>
                  <InlineReadyToggle product={product} isAdmin={isAdmin} />
                </td>
              </tr>
            ))}
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Geen producten gevonden die voldoen aan je filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredProducts.length > 0 && (
        <div className="glass" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.5rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          {/* Left section: Items per page */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span>Producten per pagina:</span>
            <select
              className="input"
              style={{ width: 'auto', padding: '0.35rem 1.75rem 0.35rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer', minWidth: '85px' }}
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value;
                setPageSize(val === 'ALL' ? 'ALL' : Number(val));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value="ALL">Alles</option>
            </select>
          </div>

          {/* Middle section: Page buttons */}
          {pageSize !== 'ALL' && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <button
                className="btn"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text)',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1
                }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                Vorige
              </button>

              {getPageNumbers(currentPage, totalPages).map((p, idx) => {
                if (p === '...') {
                  return (
                    <span key={`dots-${idx}`} style={{ padding: '0.25rem 0.5rem', color: 'var(--text-muted)' }}>
                      ...
                    </span>
                  );
                }
                const isSelected = p === currentPage;
                return (
                  <button
                    key={p}
                    className="btn"
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.875rem',
                      minWidth: '35px',
                      backgroundColor: isSelected ? 'var(--primary)' : 'transparent',
                      color: isSelected ? '#1e293b' : 'var(--text)',
                      border: isSelected ? 'none' : '1px solid transparent',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'all 0.15s ease'
                    }}
                    onClick={() => setCurrentPage(p as number)}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                className="btn"
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text)',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1
                }}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                Volgende
              </button>
            </div>
          )}

          {/* Right section: Info text */}
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Weergave {Math.min(filteredProducts.length, (currentPage - 1) * (pageSize === 'ALL' ? filteredProducts.length : pageSize) + 1)}-
            {Math.min(filteredProducts.length, currentPage * (pageSize === 'ALL' ? filteredProducts.length : pageSize))} van{' '}
            <strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? 'product' : 'producten'}
          </div>
        </div>
      )}

      <ProductDrawer
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        fieldPermissions={isAdmin ? undefined : fieldPermissions}
        isAdmin={isAdmin}
        canUseAi={canUseAi}
        canApproveEmpco={canApproveEmpco}
        layout={layout}
        currentUserId={currentUserId}
        currentUserChatColor={currentUserChatColor}
        currentUserAutoMarkRemarksAsRead={currentUserAutoMarkRemarksAsRead}
        userChatColors={Object.fromEntries(
          systemUsers.filter((u: any) => u.chatColor).map((u: any) => [u.id, u.chatColor])
        )}
        onPrev={handlePrev}
        onNext={handleNext}
        aiScore={selectedProduct ? (aiScoreMap[selectedProduct.internalArticleNumber] ?? null) : null}
        onEmpcoCheck={(artNum, status, stale, issueCount) => {
          setLiveEmpcoMap(prev => ({ ...prev, [artNum]: { status, stale, issueCount } }));
        }}
        allSuppliers={suppliersList}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Producten verwijderen"
        message={`Weet je zeker dat je de ${selectedIds.size} geselecteerde producten permanent wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        confirmLabel="Verwijderen"
        cancelLabel="Annuleren"
        type="danger"
        onConfirm={confirmDeleteProducts}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
