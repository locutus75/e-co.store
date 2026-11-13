'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AvailableCategoryOption,
  CategoryFeedbackRule,
  ProductCategoryCheck,
  applyCategorySuggestionsAction,
  deleteCategoryFeedbackRuleAction,
  dismissCategoryCheckAction,
  getAvailableCategoriesForCheckAction,
  getCategoryFeedbackRulesAction,
  runCategoryCheckBatchAction,
} from '@/app/actions/categories';

export interface CategoryCheckProductInput {
  internalArticleNumber: string;
  title: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  category?: { id: string; name: string } | null;
  subcategory?: { id: string; name: string } | null;
  brand?: { name: string } | null;
  customData?: any;
}

interface CategoryCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: CategoryCheckProductInput[];
  titleLabel?: string;
  autoStartUnchecked?: boolean;
  onComplete: () => void;
}

export function isCategoryCheckValidForProduct(
  p: CategoryCheckProductInput,
  check?: ProductCategoryCheck | null
): check is ProductCategoryCheck {
  if (!check || !check.status) return false;
  const savedSub = check.checkedSubcategoryId ?? null;
  const savedCat = check.checkedCategoryId ?? null;
  const curSub = p.subcategoryId ?? p.subcategory?.id ?? null;
  const curCat = p.categoryId ?? p.category?.id ?? null;
  if (savedSub !== curSub || savedCat !== curCat) {
    return false;
  }
  return true;
}

export default function CategoryCheckModal({
  isOpen,
  onClose,
  products,
  titleLabel,
  autoStartUnchecked = false,
  onComplete,
}: CategoryCheckModalProps) {
  const [availableCategories, setAvailableCategories] = useState<AvailableCategoryOption[]>([]);
  const [feedbackRules, setFeedbackRules] = useState<CategoryFeedbackRule[]>([]);
  const [showFeedbackRulesPanel, setShowFeedbackRulesPanel] = useState(false);

  const [resultsMap, setResultsMap] = useState<Record<string, ProductCategoryCheck>>({});
  const [selectedTargets, setSelectedTargets] = useState<Record<string, string>>({});
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, string>>({});
  const [manualOverrideArticles, setManualOverrideArticles] = useState<Set<string>>(new Set());
  const [checkedArticles, setCheckedArticles] = useState<Set<string>>(new Set());
  const [onlyShowIssues, setOnlyShowIssues] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const abortRef = useRef(false);
  const initializedKeyRef = useRef<string | null>(null);

  const productsKey = useMemo(
    () => products.map((p) => p.internalArticleNumber).join(','),
    [products]
  );

  // Load existing categories, learned feedback rules, and initialize state ONLY when modal opens
  // or when the actual selection of article numbers changes (ignoring background router.refresh() re-renders)
  useEffect(() => {
    if (!isOpen) {
      initializedKeyRef.current = null;
      return;
    }
    if (initializedKeyRef.current === productsKey) {
      return;
    }
    initializedKeyRef.current = productsKey;

    setErrorMsg(null);
    setSuccessMsg(null);
    abortRef.current = false;

    const initialMap: Record<string, ProductCategoryCheck> = {};
    const initialTargets: Record<string, string> = {};
    const initialChecked = new Set<string>();

    for (const p of products) {
      const saved = p.customData?._categoryCheck as ProductCategoryCheck | undefined;
      if (isCategoryCheckValidForProduct(p, saved)) {
        initialMap[p.internalArticleNumber] = saved;
        if (
          !saved.dismissed &&
          (saved.status === 'MISMATCH' || saved.status === 'WARNING') &&
          saved.suggestedCategoryId
        ) {
          initialTargets[p.internalArticleNumber] = saved.suggestedCategoryId;
          initialChecked.add(p.internalArticleNumber);
        }
      }
    }

    setResultsMap(initialMap);
    setSelectedTargets(initialTargets);
    setFeedbackReasons({});
    setManualOverrideArticles(new Set());
    setCheckedArticles(initialChecked);

    getAvailableCategoriesForCheckAction().then((cats) => {
      if (Array.isArray(cats)) {
        setAvailableCategories(cats);
      }
    });

    getCategoryFeedbackRulesAction().then((rules) => {
      if (Array.isArray(rules)) {
        setFeedbackRules(rules);
      }
    });
  }, [isOpen, productsKey, products]);

  const uncheckedProducts = useMemo(() => {
    return products.filter((p) => !resultsMap[p.internalArticleNumber]);
  }, [products, resultsMap]);

  const startBatchCheck = async (targetProducts: CategoryCheckProductInput[]) => {
    if (targetProducts.length === 0 || running) return;
    setRunning(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    abortRef.current = false;
    setProgress({ done: 0, total: targetProducts.length });

    const batchSize = 8;
    const batchSize = 12;
    let processed = 0;
    let newIssuesFound = 0;
    const sessionExamples: { articleNumber: string; title: string; chosenCategory: string }[] = [];

    try {
      for (let i = 0; i < targetProducts.length; i += batchSize) {
        if (abortRef.current) break;
        const chunk = targetProducts.slice(i, i + batchSize);
        const articleNumbers = chunk.map((p) => p.internalArticleNumber);
        const res = await runCategoryCheckBatchAction(articleNumbers);
        const res = await runCategoryCheckBatchAction(
          articleNumbers,
          sessionExamples.length > 0 ? sessionExamples : undefined
        );

        if (!res.ok) {
          setErrorMsg(res.error || 'Er is een fout opgetreden tijdens de categorie-check.');
          break;
        }

        const entries = Object.entries(res.results || {});

        if (sessionExamples.length < 4) {
          for (const [articleNumber, check] of entries) {
            if (sessionExamples.length >= 4) break;
            const prod = chunk.find((p) => p.internalArticleNumber === articleNumber);
            const chosen = check.suggestedCategoryName
              ? check.suggestedParentName && check.suggestedParentName !== 'Overige / Algemeen'
                ? `${check.suggestedParentName} › ${check.suggestedCategoryName}`
                : check.suggestedCategoryName
              : check.currentCategory;
            if (prod && chosen) {
              sessionExamples.push({ articleNumber, title: prod.title, chosenCategory: chosen });
            }
          }
        }

        setResultsMap((prev) => {
          const next = { ...prev };
          for (const [articleNumber, check] of entries) {
            next[articleNumber] = check;
          }
          return next;
        });

        setSelectedTargets((prev) => {
          const next = { ...prev };
          for (const [articleNumber, check] of entries) {
            if (
              (check.status === 'MISMATCH' || check.status === 'WARNING') &&
              check.suggestedCategoryId
            ) {
              next[articleNumber] = check.suggestedCategoryId;
            }
          }
          return next;
        });

        setCheckedArticles((prev) => {
          const next = new Set(prev);
          for (const [articleNumber, check] of entries) {
            if (
              (check.status === 'MISMATCH' || check.status === 'WARNING') &&
              check.suggestedCategoryId
            ) {
              next.add(articleNumber);
              newIssuesFound++;
            }
          }
          return next;
        });

        processed += chunk.length;
        setProgress({ done: processed, total: targetProducts.length });
      }

      if (!abortRef.current) {
        setSuccessMsg(
          `Controle afgerond voor ${processed} product(en). ${newIssuesFound > 0
            ? `${newIssuesFound} product(en) met een categorie-advies gevonden.`
            : 'Alle gecontroleerde producten staan volgens de check in een passende categorie. Je kunt hieronder altijd handmatig een categorie corrigeren en een reden meegeven.'
          }`
        );
        onComplete();
      }
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen && autoStartUnchecked && uncheckedProducts.length > 0 && uncheckedProducts.length <= 25 && !running) {
      if (Object.keys(resultsMap).length === 0) {
        startBatchCheck(uncheckedProducts);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoStartUnchecked]);

  const stats = useMemo(() => {
    let mismatchCount = 0;
    let warningCount = 0;
    let okCount = 0;
    let uncheckedCount = 0;

    for (const p of products) {
      const check = resultsMap[p.internalArticleNumber];
      if (!check) {
        uncheckedCount++;
      } else if (check.dismissed || check.status === 'OK') {
        okCount++;
      } else if (check.status === 'MISMATCH') {
        mismatchCount++;
      } else if (check.status === 'WARNING') {
        warningCount++;
      }
    }

    return {
      mismatchCount,
      warningCount,
      issueCount: mismatchCount + warningCount,
      okCount,
      uncheckedCount,
    };
  }, [products, resultsMap]);

  const displayedProducts = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return products.filter((p) => {
      const check = resultsMap[p.internalArticleNumber];
      const isIssue =
        (check && !check.dismissed && (check.status === 'MISMATCH' || check.status === 'WARNING')) ||
        manualOverrideArticles.has(p.internalArticleNumber);
      if (onlyShowIssues && stats.issueCount > 0 && !isIssue) {
        return false;
      }
      if (!q) return true;
      return (
        p.internalArticleNumber.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        (p.brand?.name ?? '').toLowerCase().includes(q) ||
        (check?.currentCategory ?? '').toLowerCase().includes(q) ||
        (check?.suggestedCategoryName ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, resultsMap, manualOverrideArticles, onlyShowIssues, stats.issueCount, searchFilter]);

  const handleToggleSelect = (articleNumber: string) => {
    setCheckedArticles((prev) => {
      const next = new Set(prev);
      if (next.has(articleNumber)) next.delete(articleNumber);
      else next.add(articleNumber);
      return next;
    });
  };

  const handleSelectAllIssues = () => {
    const next = new Set<string>();
    for (const p of displayedProducts) {
      const check = resultsMap[p.internalArticleNumber];
      const isManual = manualOverrideArticles.has(p.internalArticleNumber);
      const targetId = selectedTargets[p.internalArticleNumber] || check?.suggestedCategoryId;
      if (
        targetId &&
        (isManual || (check && !check.dismissed && (check.status === 'MISMATCH' || check.status === 'WARNING')))
      ) {
        next.add(p.internalArticleNumber);
      }
    }
    setCheckedArticles(next);
  };

  const refreshFeedbackRules = async () => {
    const rules = await getCategoryFeedbackRulesAction();
    if (Array.isArray(rules)) {
      setFeedbackRules(rules);
    }
  };

  const handleApplySelected = async () => {
    const itemsToApply: { articleNumber: string; targetCategoryId: string; feedbackReason?: string }[] = [];
    for (const artNo of checkedArticles) {
      const targetId = selectedTargets[artNo] || resultsMap[artNo]?.suggestedCategoryId;
      if (targetId) {
        itemsToApply.push({
          articleNumber: artNo,
          targetCategoryId: targetId,
          feedbackReason: feedbackReasons[artNo],
        });
      }
    }

    if (itemsToApply.length === 0) return;

    setApplying(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await applyCategorySuggestionsAction(itemsToApply);
      if (!res.ok) {
        setErrorMsg(res.error || 'Doorvoeren van categorieën mislukt.');
      } else {
        const catLookup = new Map(availableCategories.map((c) => [c.id, c]));
        setResultsMap((prev) => {
          const next = { ...prev };
          for (const item of itemsToApply) {
            const targetCat = catLookup.get(item.targetCategoryId);
            const prevCheck = next[item.articleNumber];
            const reasonText = (item.feedbackReason || '').trim();
            next[item.articleNumber] = {
              status: 'OK',
              currentCategory: targetCat ? targetCat.fullLabel : prevCheck?.currentCategory || '',
              suggestedCategoryId: null,
              suggestedCategoryName: null,
              suggestedParentName: null,
              explanation: reasonText
                ? `Ingedeeld in: ${targetCat?.fullLabel ?? 'gekozen categorie'} (Geleerde feedback: "${reasonText}")`
                : `Ingedeeld in: ${targetCat?.fullLabel ?? 'gekozen categorie'}`,
              checkedAt: new Date().toISOString(),
              checkedSubcategoryId: item.targetCategoryId,
              checkedCategoryId: targetCat?.parentId || item.targetCategoryId,
              dismissed: false,
            };
          }
          return next;
        });
        setManualOverrideArticles((prev) => {
          const next = new Set(prev);
          for (const item of itemsToApply) next.delete(item.articleNumber);
          return next;
        });
        setCheckedArticles(new Set());
        await refreshFeedbackRules();
        setSuccessMsg(
          `Categorie succesvol bijgewerkt voor ${res.updatedCount} product(en)${res.learnedRulesCount > 0
            ? ` én ${res.learnedRulesCount} feedback-regel(s) opgeslagen voor toekomstige controles!`
            : '!'
          }`
        );
        onComplete();
      }
    } finally {
      setApplying(false);
    }
  };

  const handleApplySingle = async (articleNumber: string) => {
    const targetId = selectedTargets[articleNumber] || resultsMap[articleNumber]?.suggestedCategoryId;
    if (!targetId) return;
    const reasonText = (feedbackReasons[articleNumber] || '').trim();

    setApplying(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await applyCategorySuggestionsAction([
        { articleNumber, targetCategoryId: targetId, feedbackReason: reasonText },
      ]);
      if (!res.ok) {
        setErrorMsg(res.error || 'Doorvoeren mislukt.');
      } else {
        const targetCat = availableCategories.find((c) => c.id === targetId);
        setResultsMap((prev) => {
          const prevCheck = prev[articleNumber];
          return {
            ...prev,
            [articleNumber]: {
              status: 'OK',
              currentCategory: targetCat ? targetCat.fullLabel : prevCheck?.currentCategory || '',
              suggestedCategoryId: null,
              suggestedCategoryName: null,
              suggestedParentName: null,
              explanation: reasonText
                ? `Ingedeeld in: ${targetCat?.fullLabel ?? 'gekozen categorie'} (Geleerde feedback: "${reasonText}")`
                : `Ingedeeld in: ${targetCat?.fullLabel ?? 'gekozen categorie'}`,
              checkedAt: new Date().toISOString(),
              checkedSubcategoryId: targetId,
              checkedCategoryId: targetCat?.parentId || targetId,
              dismissed: false,
            },
          };
        });
        setManualOverrideArticles((prev) => {
          const next = new Set(prev);
          next.delete(articleNumber);
          return next;
        });
        setCheckedArticles((prev) => {
          const next = new Set(prev);
          next.delete(articleNumber);
          return next;
        });
        if (reasonText) {
          await refreshFeedbackRules();
          setSuccessMsg(
            `Product #${articleNumber} ingedeeld in "${targetCat?.fullLabel}" en feedback opgeslagen voor toekomstige checks!`
          );
        }
        onComplete();
      }
    } finally {
      setApplying(false);
    }
  };

  const handleDismiss = async (articleNumbers: string[], singleFeedbackReason?: string) => {
    if (articleNumbers.length === 0) return;
    setApplying(true);
    setErrorMsg(null);
    try {
      const res = await dismissCategoryCheckAction(articleNumbers, singleFeedbackReason);
      if (!res.ok) {
        setErrorMsg(res.error || 'Bevestigen mislukt.');
      } else {
        setResultsMap((prev) => {
          const next = { ...prev };
          for (const artNo of articleNumbers) {
            if (next[artNo]) {
              next[artNo] = {
                ...next[artNo],
                status: 'OK',
                dismissed: true,
                explanation: singleFeedbackReason?.trim()
                  ? `Huidige categorie bevestigd (${singleFeedbackReason.trim()}).`
                  : 'Huidige categorie handmatig bevestigd als correct.',
              };
            }
          }
          return next;
        });
        setCheckedArticles((prev) => {
          const next = new Set(prev);
          for (const artNo of articleNumbers) next.delete(artNo);
          return next;
        });
        if (singleFeedbackReason?.trim()) {
          await refreshFeedbackRules();
        }
        onComplete();
      }
    } finally {
      setApplying(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    const res = await deleteCategoryFeedbackRuleAction(ruleId);
    if (res.ok) {
      setFeedbackRules(res.rules);
    }
  };

  if (!isOpen) return null;

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.15rem 1.5rem',
            background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
            color: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🏷️ Categorie-indeling Controle</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', opacity: 0.9 }}>
              {titleLabel || `${products.length} geselecteerde producten`} • Controleert uitsluitend tegen bestaande categorieën en leert van jouw correcties
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: 'white',
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              cursor: running ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {/* Control & Action Bar */}
        <div
          style={{
            padding: '0.9rem 1.5rem',
            backgroundColor: 'var(--background)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Stats Badges */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                backgroundColor: stats.mismatchCount > 0 ? '#fef2f2' : 'var(--surface)',
                color: stats.mismatchCount > 0 ? '#dc2626' : 'var(--text-muted)',
                border: `1px solid ${stats.mismatchCount > 0 ? '#fecaca' : 'var(--border)'}`,
              }}
            >
              ❌ Verkeerd ingedeeld: {stats.mismatchCount}
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                backgroundColor: stats.warningCount > 0 ? '#fffbeb' : 'var(--surface)',
                color: stats.warningCount > 0 ? '#d97706' : 'var(--text-muted)',
                border: `1px solid ${stats.warningCount > 0 ? '#fde68a' : 'var(--border)'}`,
              }}
            >
              ⚠️ Betere categorie: {stats.warningCount}
            </span>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
              }}
            >
              ✅ Juist ingedeeld: {stats.okCount}
            </span>
            {stats.uncheckedCount > 0 && (
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '0.25rem 0.65rem',
                  borderRadius: '999px',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                ⏳ Nog niet gecontroleerd: {stats.uncheckedCount}
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowFeedbackRulesPanel((v) => !v)}
              style={{
                fontSize: '0.76rem',
                fontWeight: 700,
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                backgroundColor: showFeedbackRulesPanel ? '#7c3aed' : '#f5f3ff',
                color: showFeedbackRulesPanel ? 'white' : '#6d28d9',
                border: '1px solid #ddd6fe',
                cursor: 'pointer',
              }}
              title="Bekijk en beheer de geleerde feedback-regels voor toekomstige controles"
            >
              🧠 Geleerde feedback ({feedbackRules.length})
            </button>
          </div>

          {/* Run Check Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {running ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  abortRef.current = true;
                }}
                style={{
                  padding: '0.45rem 0.9rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                }}
              >
                ⏹ Stoppen ({progress.done}/{progress.total})
              </button>
            ) : (
              <>
                {uncheckedProducts.length > 0 && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => startBatchCheck(uncheckedProducts)}
                    style={{
                      padding: '0.45rem 0.95rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      backgroundColor: '#0284c7',
                      color: 'white',
                      border: 'none',
                    }}
                  >
                    🔍 Controleer {uncheckedProducts.length} niet-gecontroleerde producten
                  </button>
                )}
                <button
                  type="button"
                  className="btn"
                  onClick={() => startBatchCheck(products)}
                  style={{
                    padding: '0.45rem 0.9rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    backgroundColor: uncheckedProducts.length === 0 ? '#0284c7' : 'var(--surface)',
                    color: uncheckedProducts.length === 0 ? 'white' : 'var(--text)',
                    border: uncheckedProducts.length === 0 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  🔄 {uncheckedProducts.length === 0 ? `Alle ${products.length} producten opnieuw controleren` : `Alles opnieuw (${products.length})`}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Collapsible Learned Feedback Rules Panel */}
        {showFeedbackRulesPanel && (
          <div
            style={{
              padding: '0.85rem 1.5rem',
              backgroundColor: '#faf5ff',
              borderBottom: '1px solid #e9d5ff',
              maxHeight: '190px',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <strong style={{ fontSize: '0.82rem', color: '#581c87' }}>
                🧠 Geleerde feedback & indelingsregels (worden automatisch meegegeven bij elke nieuwe categorie-check):
              </strong>
              <button
                type="button"
                onClick={() => setShowFeedbackRulesPanel(false)}
                style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: '#6b21a8', cursor: 'pointer', fontWeight: 600 }}
              >
                Verbergen ▲
              </button>
            </div>
            {feedbackRules.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#6b21a8' }}>
                Nog geen feedback-regels opgeslagen. Wanneer je hieronder bij een product de categorie wijzigt en een reden invult (bijv. <em>&quot;Bevat het woord Zeep, hoort daarom in Douche &amp; bad&quot;</em>), onthoudt het systeem dit voor toekomstige checks.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {feedbackRules.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.35rem 0.65rem',
                      backgroundColor: 'white',
                      border: '1px solid #e9d5ff',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div>
                      <strong>#{rule.articleNumber} {rule.productTitle}</strong>:{' '}
                      <span style={{ color: 'var(--text-muted)' }}>{rule.fromCategory}</span> →{' '}
                      <strong style={{ color: '#15803d' }}>{rule.targetCategoryLabel}</strong>{' '}
                      <span style={{ color: '#581c87', fontStyle: 'italic' }}>— &ldquo;{rule.reason}&rdquo;</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.id)}
                      title="Verwijder deze geleerde regel"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progress Bar when running */}
        {running && (
          <div style={{ padding: '0.75rem 1.5rem', backgroundColor: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', marginBottom: '0.35rem' }}>
              <span>
                🤖 AI Categorie-check bezig (vergelijkt met {availableCategories.length} bestaande categorieën
                {feedbackRules.length > 0 ? ` + ${feedbackRules.length} geleerde feedback-regels` : ''})...
              </span>
              <span>
                {progress.done} / {progress.total} ({progressPct}%)
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', backgroundColor: '#e0f2fe', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  backgroundColor: '#0284c7',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Messages */}
        {errorMsg && (
          <div style={{ padding: '0.75rem 1.5rem', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.84rem', fontWeight: 600, borderBottom: '1px solid #fecaca' }}>
            ❌ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ padding: '0.75rem 1.5rem', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '0.84rem', fontWeight: 600, borderBottom: '1px solid #bbf7d0' }}>
            ✅ {successMsg}
          </div>
        )}

        {/* Filter & Selection Toolbar */}
        <div
          style={{
            padding: '0.65rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            backgroundColor: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={onlyShowIssues && stats.issueCount > 0}
                disabled={stats.issueCount === 0}
                onChange={(e) => setOnlyShowIssues(e.target.checked)}
              />
              <span>Alleen afwijkingen & voorstellen tonen ({stats.issueCount})</span>
            </label>

            <input
              type="text"
              className="input"
              placeholder="🔍 Filter op artikel, titel of categorie..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem', width: '250px' }}
            />
          </div>

          {(stats.issueCount > 0 || manualOverrideArticles.size > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.8rem' }}>
              <button
                type="button"
                onClick={handleSelectAllIssues}
                style={{ background: 'none', border: 'none', color: '#0284c7', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Alles selecteren
              </button>
              <span style={{ color: 'var(--border)' }}>•</span>
              <button
                type="button"
                onClick={() => setCheckedArticles(new Set())}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Alles deselecteren
              </button>
            </div>
          )}
        </div>

        {/* Product List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {displayedProducts.length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {stats.uncheckedCount === products.length
                ? 'Nog geen producten gecontroleerd in deze selectie. Klik hierboven op "🔍 Controleer niet-gecontroleerde producten" om te starten.'
                : 'Geen producten gevonden voor dit filter.'}
            </div>
          ) : (
            displayedProducts.map((p) => {
              const check = resultsMap[p.internalArticleNumber];
              const isAiIssue = check && !check.dismissed && (check.status === 'MISMATCH' || check.status === 'WARNING');
              const isManualOverride = manualOverrideArticles.has(p.internalArticleNumber);
              const showEditor = isAiIssue || isManualOverride;

              const isSelected = checkedArticles.has(p.internalArticleNumber);
              const currentTargetId =
                selectedTargets[p.internalArticleNumber] ??
                check?.suggestedCategoryId ??
                p.subcategoryId ??
                p.categoryId ??
                availableCategories[0]?.id ??
                '';

              const curCatDisplay =
                check?.currentCategory ||
                (p.subcategory?.name
                  ? p.category?.name && p.category.name !== p.subcategory.name
                    ? `${p.category.name} › ${p.subcategory.name}`
                    : p.subcategory.name
                  : p.category?.name || 'Zonder categorie');

              const reasonValue = feedbackReasons[p.internalArticleNumber] ?? '';
              const targetChangedFromAi =
                isAiIssue &&
                check?.suggestedCategoryId &&
                currentTargetId &&
                currentTargetId !== check.suggestedCategoryId;

              return (
                <div
                  key={p.internalArticleNumber}
                  style={{
                    border: `1px solid ${isManualOverride
                      ? '#a78bfa'
                      : isAiIssue
                        ? check.status === 'MISMATCH'
                          ? '#fca5a5'
                          : '#fcd34d'
                        : 'var(--border)'
                      }`,
                    backgroundColor: isManualOverride
                      ? 'rgba(245, 243, 255, 0.55)'
                      : isAiIssue
                        ? check.status === 'MISMATCH'
                          ? 'rgba(254, 242, 242, 0.45)'
                          : 'rgba(255, 251, 235, 0.45)'
                        : 'var(--surface)',
                    borderRadius: '10px',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                  }}
                >
                  {/* Top row: checkbox, article, title, status badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 300px' }}>
                      {showEditor && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(p.internalArticleNumber)}
                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                      )}
                      <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#0284c7' }}>
                        #{p.internalArticleNumber}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>
                        {p.title}
                      </span>
                      {p.brand?.name && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.1rem 0.45rem',
                            borderRadius: '4px',
                            backgroundColor: 'var(--background)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {p.brand.name}
                        </span>
                      )}
                    </div>

                    {/* Status Badge + Manual Override button for OK rows */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {!showEditor && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualOverrideArticles((prev) => new Set(prev).add(p.internalArticleNumber));
                            if (!selectedTargets[p.internalArticleNumber] && availableCategories.length > 0) {
                              const defaultCat =
                                availableCategories.find(
                                  (c) => c.id !== (p.subcategoryId ?? p.categoryId)
                                ) || availableCategories[0];
                              if (defaultCat) {
                                setSelectedTargets((prev) => ({
                                  ...prev,
                                  [p.internalArticleNumber]: defaultCat.id,
                                }));
                              }
                            }
                            setCheckedArticles((prev) => new Set(prev).add(p.internalArticleNumber));
                          }}
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.22rem 0.6rem',
                            borderRadius: '6px',
                            backgroundColor: '#f5f3ff',
                            color: '#6d28d9',
                            border: '1px solid #ddd6fe',
                            cursor: 'pointer',
                          }}
                          title="Toch een andere bestaande categorie kiezen en uitleggen waarom (zodat toekomstige checks hiervan leren)"
                        >
                          ✏️ Toch andere categorie kiezen
                        </button>
                      )}

                      {isManualOverride && !isAiIssue ? (
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            backgroundColor: '#ede9fe',
                            color: '#5b21b6',
                          }}
                        >
                          ✏️ Handmatige correctie & feedback
                        </span>
                      ) : !check ? (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Nog niet gecontroleerd
                        </span>
                      ) : check.dismissed || check.status === 'OK' ? (
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                          }}
                        >
                          ✅ Juiste categorie
                        </span>
                      ) : check.status === 'MISMATCH' ? (
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                          }}
                        >
                          ❌ Verkeerde categorie
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            padding: '0.2rem 0.55rem',
                            borderRadius: '999px',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                          }}
                        >
                          ⚠️ Betere categorie beschikbaar
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Category comparison & selector */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: showEditor ? '1fr auto 1.3fr auto' : '1fr',
                      gap: '0.75rem',
                      alignItems: 'center',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.45rem 0.7rem',
                        borderRadius: '6px',
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Huidige categorie
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: '0.1rem' }}>
                        {curCatDisplay}
                      </div>
                    </div>

                    {showEditor && (
                      <>
                        <div style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: '1rem' }}>→</div>

                        <div
                          style={{
                            padding: '0.45rem 0.7rem',
                            borderRadius: '6px',
                            backgroundColor: isManualOverride && !isAiIssue ? '#f5f3ff' : '#f0fdf4',
                            border: `1px solid ${isManualOverride && !isAiIssue ? '#c4b5fd' : '#86efac'} `,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: isManualOverride && !isAiIssue ? '#5b21b6' : '#166534',
                              textTransform: 'uppercase',
                            }}
                          >
                            {isManualOverride && !isAiIssue
                              ? 'Kies juiste bestaande categorie'
                              : 'Voorgestelde bestaande categorie'}
                          </div>
                          <select
                            className="input"
                            value={currentTargetId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedTargets((prev) => ({ ...prev, [p.internalArticleNumber]: val }));
                              if (val) {
                                setCheckedArticles((prev) => new Set(prev).add(p.internalArticleNumber));
                              }
                            }}
                            style={{
                              marginTop: '0.2rem',
                              width: '100%',
                              padding: '0.28rem 0.5rem',
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: isManualOverride && !isAiIssue ? '#4c1d95' : '#14532d',
                              backgroundColor: 'white',
                              border: `1px solid ${isManualOverride && !isAiIssue ? '#c4b5fd' : '#86efac'} `,
                            }}
                          >
                            {availableCategories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.fullLabel}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn"
                            disabled={applying || !currentTargetId}
                            onClick={() => handleApplySingle(p.internalArticleNumber)}
                            style={{
                              padding: '0.4rem 0.7rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              backgroundColor: '#16a34a',
                              color: 'white',
                              border: 'none',
                              whiteSpace: 'nowrap',
                            }}
                            title="Pas deze categorie direct toe en sla eventuele feedback op voor toekomstige checks"
                          >
                            ✓ Overnemen
                          </button>
                          {isManualOverride && !isAiIssue ? (
                            <button
                              type="button"
                              className="btn"
                              disabled={applying}
                              onClick={() => {
                                setManualOverrideArticles((prev) => {
                                  const next = new Set(prev);
                                  next.delete(p.internalArticleNumber);
                                  return next;
                                });
                                setCheckedArticles((prev) => {
                                  const next = new Set(prev);
                                  next.delete(p.internalArticleNumber);
                                  return next;
                                });
                              }}
                              style={{
                                padding: '0.4rem 0.65rem',
                                fontSize: '0.76rem',
                                fontWeight: 600,
                                backgroundColor: 'var(--surface)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Annuleren
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn"
                              disabled={applying}
                              onClick={() => handleDismiss([p.internalArticleNumber], reasonValue)}
                              style={{
                                padding: '0.4rem 0.65rem',
                                fontSize: '0.76rem',
                                fontWeight: 600,
                                backgroundColor: 'var(--surface)',
                                color: 'var(--text-muted)',
                                border: '1px solid var(--border)',
                                whiteSpace: 'nowrap',
                              }}
                              title="Huidige categorie klopt wel (negeer dit voorstel)"
                            >
                              ✕ Klopt wel
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Explanation from AI */}
                  {check?.explanation && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      💡 {check.explanation}
                    </div>
                  )}

                  {/* Feedback / Reasoning input when editing or overriding */}
                  {showEditor && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                        backgroundColor:
                          isManualOverride || targetChangedFromAi || reasonValue.trim()
                            ? '#faf5ff'
                            : 'rgba(248, 250, 252, 0.8)',
                        border: `1px solid ${isManualOverride || targetChangedFromAi || reasonValue.trim()
                          ? '#d8b4fe'
                          : 'var(--border)'
                          } `,
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#6d28d9', whiteSpace: 'nowrap' }}>
                        🧠 Feedback voor toekomstige checks:
                      </span>
                      <input
                        type="text"
                        className="input"
                        placeholder="Waarom hoort dit product in deze categorie? (bijv. 'Bevat het woord Zeep, hoort daarom in Douche & bad')"
                        value={reasonValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFeedbackReasons((prev) => ({
                            ...prev,
                            [p.internalArticleNumber]: val,
                          }));
                        }}
                        style={{
                          flex: 1,
                          padding: '0.28rem 0.55rem',
                          fontSize: '0.78rem',
                          backgroundColor: 'white',
                          border: '1px solid #d8b4fe',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.9rem 1.5rem',
            backgroundColor: 'var(--background)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Wijzigingen worden direct opgeslagen in de 🕒 Historie. Ingevulde feedback wordt onthouden voor toekomstige checks.
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            {checkedArticles.size > 0 && (
              <button
                type="button"
                className="btn"
                disabled={applying || running}
                onClick={() => handleDismiss(Array.from(checkedArticles))}
                style={{
                  padding: '0.5rem 0.9rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                ✕ Geselecteerde kloppen wel ({checkedArticles.size})
              </button>
            )}

            <button
              type="button"
              className="btn"
              onClick={onClose}
              disabled={running}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.84rem',
                fontWeight: 600,
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              Sluiten
            </button>

            <button
              type="button"
              className="btn"
              disabled={applying || running || checkedArticles.size === 0}
              onClick={handleApplySelected}
              style={{
                padding: '0.5rem 1.15rem',
                fontSize: '0.84rem',
                fontWeight: 700,
                backgroundColor: checkedArticles.size > 0 ? '#16a34a' : '#94a3b8',
                color: 'white',
                border: 'none',
                cursor: checkedArticles.size > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              {applying ? 'Bezig met opslaan...' : `✓ ${checkedArticles.size} voorstellen doorvoeren`}
            </button>
          </div>
        </div>
      </div >
    </div >
  );
}
