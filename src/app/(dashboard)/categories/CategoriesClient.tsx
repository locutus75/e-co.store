'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  cleanupUnusedCategoriesAction,
  deleteCategoryAction,
  renameCategoryAction,
  syncCategoriesFromEcoPosAction,
} from '@/app/actions/categories';

interface CategoryRecord {
  id: string;
  name: string;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
}

interface ProductItem {
  internalArticleNumber: string;
  title: string;
  status: string;
  readyForImport: string | null;
  webshopActive: boolean;
  systemActive: boolean;
  uitlopend: boolean;
  basePrice: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  category: { id: string; name: string; parentId: string | null } | null;
  subcategory: { id: string; name: string; parentId: string | null } | null;
  brand: { name: string } | null;
  supplier: { name: string } | null;
  customData: any;
}

interface SubcategoryStats {
  id: string | null;
  name: string;
  parentName: string;
  products: ProductItem[];
  totalCount: number;
  doneCount: number;
  checkCount: number;
  editCount: number;
  newCount: number;
  readyCount: number;
  webshopActiveCount: number;
  inStockCount: number;
  empcoIssueCount: number;
}

function isMplusRoot(name?: string | null): boolean {
  return !name || name.trim().toLowerCase() === 'mpluswebshops';
}

export default function CategoriesClient({
  initialCategories,
  initialProducts,
  empcoMap,
  isAdmin,
}: {
  initialCategories: CategoryRecord[];
  initialProducts: ProductItem[];
  empcoMap: Record<string, { status: string; issueCount: number }>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'with_products' | 'empco_issues' | 'uncategorized'>('all');
  const [expandedSubcats, setExpandedSubcats] = useState<Set<string>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  const [syncing, setSyncing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Build hierarchical groups (Main Category -> Subcategory/Group -> Products)
  const {
    parentGroups,
    uncategorizedProducts,
    totalCategorizedProducts,
    totalSubcategories,
    multiGroupProductCount,
  } = useMemo(() => {
    const subcatMap = new Map<
      string,
      {
        id: string | null;
        name: string;
        parentName: string;
        products: ProductItem[];
      }
    >();

    // Register existing DB categories (excluding MplusWebshops)
    const catById = new Map(initialCategories.map((c) => [c.id, c]));
    for (const cat of initialCategories) {
      if (isMplusRoot(cat.name)) continue;
      // If this category is purely a parent container for other categories, don't add it as a leaf unless products point to it
      const hasChildren = initialCategories.some((other) => other.parentId === cat.id && !isMplusRoot(other.name));
      if (!hasChildren) {
        const parentObj = cat.parentId ? catById.get(cat.parentId) : null;
        const parentName =
          parentObj && !isMplusRoot(parentObj.name) ? parentObj.name : 'Overige / Algemeen';
        const key = cat.name.trim().toLowerCase();
        if (!subcatMap.has(key)) {
          subcatMap.set(key, {
            id: cat.id,
            name: cat.name.trim(),
            parentName,
            products: [],
          });
        }
      }
    }

    const uncategorized: ProductItem[] = [];
    let categorizedCount = 0;
    let multiGroupCount = 0;

    for (const p of initialProducts) {
      const rawSubName =
        p.subcategory?.name && !isMplusRoot(p.subcategory.name)
          ? p.subcategory.name.trim()
          : p.category?.name && !isMplusRoot(p.category.name)
            ? p.category.name.trim()
            : '';

      if (!rawSubName) {
        uncategorized.push(p);
        continue;
      }

      categorizedCount++;

      // Determine parent main category name (e.g. "Wonen & Slapen")
      let parentName = 'Overige / Algemeen';
      if (
        p.category?.name &&
        !isMplusRoot(p.category.name) &&
        p.category.name.trim().toLowerCase() !== rawSubName.toLowerCase()
      ) {
        parentName = p.category.name.trim();
      } else if (p.subcategory?.parentId) {
        const parentFromDb = catById.get(p.subcategory.parentId);
        if (parentFromDb && !isMplusRoot(parentFromDb.name)) {
          parentName = parentFromDb.name.trim();
        }
      }

      // Support comma-separated multi-group names if a product belongs to multiple groups
      const groupParts = rawSubName
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (groupParts.length > 1) {
        multiGroupCount++;
      }

      for (const partName of groupParts) {
        const key = partName.toLowerCase();
        let entry = subcatMap.get(key);
        if (!entry) {
          entry = {
            id: groupParts.length === 1 ? (p.subcategory?.id ?? p.category?.id ?? null) : null,
            name: partName,
            parentName,
            products: [],
          };
          subcatMap.set(key, entry);
        } else if (entry.parentName === 'Overige / Algemeen' && parentName !== 'Overige / Algemeen') {
          entry.parentName = parentName;
        }
        entry.products.push(p);
      }
    }

    // Compute stats per subcategory and group by parentName
    const byParent = new Map<string, SubcategoryStats[]>();

    for (const entry of subcatMap.values()) {
      let doneCount = 0;
      let checkCount = 0;
      let editCount = 0;
      let newCount = 0;
      let readyCount = 0;
      let webshopActiveCount = 0;
      let inStockCount = 0;
      let empcoIssueCount = 0;

      for (const p of entry.products) {
        const st = (p.status || 'NEW').toUpperCase();
        if (st === 'DONE') doneCount++;
        else if (st === 'CHECK') checkCount++;
        else if (st === 'EDIT') editCount++;
        else newCount++;

        if ((p.readyForImport || '').toUpperCase() === 'JA') readyCount++;
        if (p.webshopActive) webshopActiveCount++;
        const stockVal = Number(p.customData?.ecoposStock ?? 0);
        if (stockVal > 0) inStockCount++;

        const emp = empcoMap[p.internalArticleNumber];
        if (emp && (emp.status === 'FAIL' || emp.status === 'WARNING')) {
          empcoIssueCount++;
        }
      }

      const stat: SubcategoryStats = {
        id: entry.id,
        name: entry.name,
        parentName: entry.parentName,
        products: entry.products,
        totalCount: entry.products.length,
        doneCount,
        checkCount,
        editCount,
        newCount,
        readyCount,
        webshopActiveCount,
        inStockCount,
        empcoIssueCount,
      };

      const list = byParent.get(entry.parentName) ?? [];
      list.push(stat);
      byParent.set(entry.parentName, list);
    }

    const sortedParents = Array.from(byParent.entries())
      .map(([parentName, subcats]) => ({
        parentName,
        subcats: subcats.sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name)),
        totalProducts: subcats.reduce((acc, s) => acc + s.totalCount, 0),
      }))
      .sort((a, b) => {
        if (a.parentName === 'Overige / Algemeen') return 1;
        if (b.parentName === 'Overige / Algemeen') return -1;
        return a.parentName.localeCompare(b.parentName);
      });

    return {
      parentGroups: sortedParents,
      uncategorizedProducts: uncategorized,
      totalCategorizedProducts: categorizedCount,
      totalSubcategories: subcatMap.size,
      multiGroupProductCount: multiGroupCount,
    };
  }, [initialCategories, initialProducts, empcoMap]);

  // Apply search and filterMode
  const filteredParentGroups = useMemo(() => {
    if (filterMode === 'uncategorized') return [];
    const q = searchQuery.trim().toLowerCase();

    return parentGroups
      .map((pg) => {
        const matchingSubcats = pg.subcats.filter((sc) => {
          if (filterMode === 'with_products' && sc.totalCount === 0) return false;
          if (filterMode === 'empco_issues' && sc.empcoIssueCount === 0) return false;
          if (!q) return true;
          if (sc.name.toLowerCase().includes(q) || pg.parentName.toLowerCase().includes(q)) {
            return true;
          }
          return sc.products.some(
            (p) =>
              p.internalArticleNumber.toLowerCase().includes(q) ||
              p.title.toLowerCase().includes(q) ||
              (p.brand?.name ?? '').toLowerCase().includes(q)
          );
        });
        return {
          ...pg,
          subcats: matchingSubcats,
        };
      })
      .filter((pg) => pg.subcats.length > 0);
  }, [parentGroups, searchQuery, filterMode]);

  const handleSyncFromEcoPos = async () => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await syncCategoriesFromEcoPosAction();
      if (!res.ok) {
        setBanner({ type: 'error', text: res.error || 'Synchronisatie mislukt.' });
      } else {
        setBanner({
          type: 'success',
          text: `Categorieën bijgewerkt vanuit EcoPos: ${res.updatedCount} product(en) geactualiseerd.`,
        });
        router.refresh();
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    setBanner(null);
    try {
      const res = await cleanupUnusedCategoriesAction();
      if (!res.ok) {
        setBanner({ type: 'error', text: res.error || 'Opschonen mislukt.' });
      } else {
        setBanner({
          type: 'success',
          text: `Opschonen voltooid (${res.removedCount} lege/ongebruikte categorieën verwijderd).`,
        });
        router.refresh();
      }
    } finally {
      setCleaning(false);
    }
  };

  const handleSaveRename = async (catId: string) => {
    if (!editingName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await renameCategoryAction(catId, editingName);
      if (!res.ok) {
        alert(res.error || 'Hernoemen mislukt.');
      } else {
        setEditingCatId(null);
        router.refresh();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteCat = async (catId: string, name: string) => {
    if (!confirm(`Weet je zeker dat je categorie "${name}" wilt loskoppelen en verwijderen?`)) return;
    const res = await deleteCategoryAction(catId);
    if (!res.ok) {
      alert(res.error || 'Verwijderen mislukt.');
    } else {
      router.refresh();
    }
  };

  const toggleSubcatExpand = (name: string) => {
    const next = new Set(expandedSubcats);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedSubcats(next);
  };

  const toggleParentCollapse = (parentName: string) => {
    const next = new Set(collapsedParents);
    if (next.has(parentName)) next.delete(parentName);
    else next.add(parentName);
    setCollapsedParents(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Categorieën & Productgroepen
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Overzicht van alle MplusKassa / EcoPos productgroepen, content-voortgang en producten zonder categorie.
          </p>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={handleCleanup}
              disabled={cleaning || syncing}
              style={{
                padding: '0.55rem 1rem',
                fontSize: '0.86rem',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontWeight: 600,
                cursor: cleaning ? 'wait' : 'pointer',
              }}
              title="Verwijder lege categorieën en oude MplusWebshops-hoofdcategorieën"
            >
              {cleaning ? 'Bezig...' : '🧹 Lege categorieën opschonen'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleSyncFromEcoPos}
              disabled={syncing || cleaning}
              style={{
                padding: '0.55rem 1.1rem',
                fontSize: '0.86rem',
                backgroundColor: '#0284c7',
                border: 'none',
                color: 'white',
                fontWeight: 700,
                cursor: syncing ? 'wait' : 'pointer',
              }}
              title="Haal voor alle producten de actuele categorie en subcategorie op uit EcoPos"
            >
              {syncing ? '🔄 Bezig met ophalen...' : '🔄 Categorieën ophalen uit EcoPos'}
            </button>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          style={{
            padding: '0.85rem 1.1rem',
            borderRadius: 'var(--radius)',
            backgroundColor: banner.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${banner.type === 'success' ? '#86efac' : '#fca5a5'}`,
            color: banner.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.88rem',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{banner.type === 'success' ? '✅ ' : '❌ '}{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
        <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Productgroepen (Subcategorieën)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)', marginTop: '0.2rem' }}>
            {totalSubcategories}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Verdeeld over {parentGroups.length} hoofdcategorie{parentGroups.length === 1 ? '' : 'ën'}
          </div>
        </div>

        <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Gecategoriseerde Producten</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0284c7', marginTop: '0.2rem' }}>
            {totalCategorizedProducts}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {initialProducts.length > 0
              ? `${Math.round((totalCategorizedProducts / initialProducts.length) * 100)}% van totaal (${initialProducts.length})`
              : '0%'}
            {multiGroupProductCount > 0 ? ` • ${multiGroupProductCount} in meerdere groepen` : ''}
          </div>
        </div>

        <div
          className="glass"
          onClick={() => setFilterMode(filterMode === 'uncategorized' ? 'all' : 'uncategorized')}
          style={{
            padding: '1.1rem 1.25rem',
            borderRadius: 'var(--radius)',
            border: filterMode === 'uncategorized' ? '2px solid #f59e0b' : '1px solid var(--border)',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>Zonder Categorie</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
            {uncategorizedProducts.length}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Klik om niet-ingedeelde producten te tonen
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        className="glass"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1rem',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          className="input"
          placeholder="🔍 Zoek op categorie, subcategorie of artikel..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: '1 1 280px', maxWidth: '460px', padding: '0.5rem 0.85rem', fontSize: '0.86rem' }}
        />

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `Alle groepen (${totalSubcategories})` },
            { id: 'with_products', label: 'Alleen met producten' },
            { id: 'empco_issues', label: '🚩 Met EmpCo-bevindingen' },
            { id: 'uncategorized', label: `⚠️ Zonder categorie (${uncategorizedProducts.length})` },
          ].map((tab) => {
            const active = filterMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className="btn"
                onClick={() => setFilterMode(tab.id as any)}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  backgroundColor: active ? 'var(--primary)' : 'var(--surface)',
                  color: active ? 'white' : 'var(--text)',
                  border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Category Tree */}
      {filterMode !== 'uncategorized' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredParentGroups.length === 0 ? (
            <div
              className="glass"
              style={{
                padding: '3rem 2rem',
                textAlign: 'center',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              Geen categorieën gevonden voor deze zoekopdracht. Klik rechtsboven op{' '}
              <strong>🔄 Categorieën ophalen uit EcoPos</strong> om de categorieboom in te laden.
            </div>
          ) : (
            filteredParentGroups.map((pg) => {
              const isParentCollapsed = collapsedParents.has(pg.parentName);
              return (
                <div
                  key={pg.parentName}
                  className="glass"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Parent Category Header */}
                  <div
                    onClick={() => toggleParentCollapse(pg.parentName)}
                    style={{
                      padding: '0.9rem 1.25rem',
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      borderBottom: isParentCollapsed ? 'none' : '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          transform: isParentCollapsed ? 'rotate(-90deg)' : 'none',
                          transition: 'transform 0.15s',
                          display: 'inline-block',
                        }}
                      >
                        ▼
                      </span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
                        📁 {pg.parentName}
                      </span>
                      <span
                        style={{
                          fontSize: '0.76rem',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '999px',
                          backgroundColor: 'var(--surface-hover)',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {pg.subcats.length} {pg.subcats.length === 1 ? 'subcategorie' : 'subcategorieën'} • {pg.totalProducts} producten
                      </span>
                    </div>
                  </div>

                  {/* Subcategories List */}
                  {!isParentCollapsed && (
                    <div>
                      {pg.subcats.map((sc) => {
                        const isExpanded = expandedSubcats.has(sc.name);
                        const donePct = sc.totalCount > 0 ? Math.round((sc.doneCount / sc.totalCount) * 100) : 0;
                        const isEditing = editingCatId === sc.id && sc.id !== null;

                        return (
                          <div
                            key={sc.name}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              backgroundColor: isExpanded ? 'rgba(2, 132, 199, 0.02)' : 'transparent',
                            }}
                          >
                            <div
                              style={{
                                padding: '0.85rem 1.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '1rem',
                                flexWrap: 'wrap',
                              }}
                            >
                              {/* Left: Subcategory name + edit */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: '240px', flex: '1 1 240px' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleSubcatExpand(sc.name)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.92rem',
                                    fontWeight: 700,
                                    color: 'var(--text)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    padding: 0,
                                    textAlign: 'left',
                                  }}
                                >
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {isExpanded ? '▼' : '▶'}
                                  </span>
                                  <span>{sc.name}</span>
                                </button>

                                {isEditing ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <input
                                      type="text"
                                      className="input"
                                      value={editingName}
                                      onChange={(e) => setEditingName(e.target.value)}
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.82rem', width: '180px' }}
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      disabled={savingEdit}
                                      onClick={() => handleSaveRename(sc.id!)}
                                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.76rem' }}
                                    >
                                      Opslaan
                                    </button>
                                    <button
                                      type="button"
                                      className="btn"
                                      onClick={() => setEditingCatId(null)}
                                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  isAdmin &&
                                  sc.id && (
                                    <div style={{ display: 'inline-flex', gap: '0.25rem', opacity: 0.65 }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCatId(sc.id);
                                          setEditingName(sc.name);
                                        }}
                                        title="Categorienaam wijzigen"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem' }}
                                      >
                                        ✏️
                                      </button>
                                      {sc.totalCount === 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteCat(sc.id!, sc.name)}
                                          title="Lege categorie verwijderen"
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem' }}
                                        >
                                          🗑
                                        </button>
                                      )}
                                    </div>
                                  )
                                )}
                              </div>

                              {/* Middle: Status breakdown + Progress bar */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: '2 1 320px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '999px',
                                    backgroundColor: '#e0f2fe',
                                    color: '#0369a1',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {sc.totalCount} {sc.totalCount === 1 ? 'product' : 'producten'}
                                </span>

                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  🌐 Webshop: <strong>{sc.webshopActiveCount}</strong>
                                </span>

                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  📦 Op voorraad: <strong>{sc.inStockCount}</strong>
                                </span>

                                <span style={{ fontSize: '0.76rem', color: '#15803d', whiteSpace: 'nowrap' }}>
                                  ✓ Ready: <strong>{sc.readyCount}</strong>
                                </span>

                                {sc.empcoIssueCount > 0 && (
                                  <span
                                    style={{
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      padding: '0.15rem 0.5rem',
                                      borderRadius: '999px',
                                      backgroundColor: '#fef2f2',
                                      color: '#dc2626',
                                      border: '1px solid #fecaca',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    🚩 {sc.empcoIssueCount} EmpCo
                                  </span>
                                )}

                                {/* Progress bar */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: '130px', flex: '1 1 130px' }}>
                                  <div
                                    style={{
                                      flex: 1,
                                      height: '8px',
                                      backgroundColor: 'var(--surface-hover)',
                                      borderRadius: '999px',
                                      overflow: 'hidden',
                                    }}
                                    title={`DONE: ${sc.doneCount}, CHECK: ${sc.checkCount}, EDIT: ${sc.editCount}, NEW: ${sc.newCount}`}
                                  >
                                    <div
                                      style={{
                                        width: `${donePct}%`,
                                        height: '100%',
                                        backgroundColor: '#10b981',
                                        transition: 'width 0.2s',
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', minWidth: '34px' }}>
                                    {donePct}%
                                  </span>
                                </div>
                              </div>

                              {/* Right: Action buttons */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => toggleSubcatExpand(sc.name)}
                                  style={{
                                    padding: '0.35rem 0.7rem',
                                    fontSize: '0.78rem',
                                    backgroundColor: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text)',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {isExpanded ? 'Verberg lijst' : 'Toon artikelen'}
                                </button>
                                <Link
                                  href={`/products?category=${encodeURIComponent(sc.name)}`}
                                  className="btn"
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    fontSize: '0.78rem',
                                    backgroundColor: '#eff6ff',
                                    border: '1px solid #bfdbfe',
                                    color: '#1d4ed8',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  📦 Open in Producten →
                                </Link>
                              </div>
                            </div>

                            {/* Expanded Product Table */}
                            {isExpanded && sc.products.length > 0 && (
                              <div style={{ padding: '0 1.25rem 1rem 2.25rem' }}>
                                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--surface)' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                    <thead>
                                      <tr style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Nummer</th>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Merk</th>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Titel</th>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Prijs</th>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Voorraad</th>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                                        <th style={{ padding: '0.5rem 0.75rem' }}>Webshop</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sc.products.slice(0, 100).map((p) => {
                                        const stock = p.customData?.ecoposStock;
                                        return (
                                          <tr key={p.internalArticleNumber} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700 }}>
                                              #{p.internalArticleNumber}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-muted)' }}>
                                              {p.brand?.name || '—'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.75rem', fontWeight: 500 }}>
                                              {p.title}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.75rem' }}>
                                              {p.basePrice != null ? `€ ${Number(p.basePrice).toFixed(2).replace('.', ',')}` : '—'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.75rem' }}>
                                              {stock !== undefined && stock !== null ? stock : '—'}
                                            </td>
                                            <td style={{ padding: '0.45rem 0.75rem' }}>
                                              <span
                                                style={{
                                                  fontSize: '0.7rem',
                                                  fontWeight: 700,
                                                  padding: '0.15rem 0.45rem',
                                                  borderRadius: '999px',
                                                  backgroundColor: 'var(--surface-hover)',
                                                }}
                                              >
                                                {(p.status || 'NEW').toUpperCase()}
                                              </span>
                                            </td>
                                            <td style={{ padding: '0.45rem 0.75rem' }}>
                                              {p.webshopActive ? '✅ Ja' : 'Nee'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Uncategorized Products Section */}
      {(filterMode === 'uncategorized' || (filterMode === 'all' && uncategorizedProducts.length > 0)) && (
        <div
          className="glass"
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid #fcd34d',
            backgroundColor: '#fffbeb',
            padding: '1.1rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#92400e' }}>
              ⚠️ Producten zonder categorie ({uncategorizedProducts.length})
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#b45309' }}>
              Deze producten zijn in MplusKassa / EcoPos nog niet aan een productgroep gekoppeld (of nog niet gesynchroniseerd).
            </p>
          </div>
          <Link
            href="/products?category=UNCATEGORIZED"
            className="btn"
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.84rem',
              fontWeight: 700,
              backgroundColor: '#d97706',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            📦 Bekijk {uncategorizedProducts.length} producten zonder categorie →
          </Link>
        </div>
      )}
    </div>
  );
}

