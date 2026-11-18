'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { UserActivityItem } from '@/app/api/user/activity/route';

const SOURCE_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  MANUAL:          { label: '✎ Handmatig',       bg: '#e2e8f0', color: '#334155' },
  EMPCO:           { label: '⚖️ EmpCo',           bg: '#ccfbf1', color: '#0f766e' },
  BRAND_EMPCO:     { label: '⚖️ Merk-EmpCo',      bg: '#ccfbf1', color: '#0f766e' },
  RESTORE:         { label: '↺ Hersteld',         bg: '#dbeafe', color: '#1d4ed8' },
  CATEGORY_CHECK:  { label: '🏷️ Categorie-check', bg: '#ede9fe', color: '#6d28d9' },
  FORMATTING_RULE: { label: '✨ Tekstregel',      bg: '#f3e8ff', color: '#7e22ce' },
  ECOPOS:          { label: '🔄 EcoPos',          bg: '#e0f2fe', color: '#0369a1' },
};

const AUDIT_ACTION_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  STATUS_CHANGE:           { label: '🔄 Status gewijzigd',      bg: '#dbeafe', color: '#1e40af' },
  READY_FOR_IMPORT_CHANGE: { label: '📦 Klaar voor import',     bg: '#dcfce7', color: '#166534' },
  UITLOPEND_CHANGE:        { label: '⏳ Uitlopend gewijzigd',   bg: '#fef3c7', color: '#92400e' },
  BULK_UITLOPEND_CHANGE:   { label: '⏳ Bulk uitlopend',        bg: '#fef3c7', color: '#92400e' },
  ASSIGN:                  { label: '👤 Toewijzing',            bg: '#f3e8ff', color: '#6b21a8' },
  UPDATE:                  { label: '💾 Product opgeslagen',    bg: '#f1f5f9', color: '#334155' },
  REMARK:                  { label: '💬 Opmerking geplaatst',   bg: '#fef9c3', color: '#854d0e' },
};

function truncateVal(val: string | null | undefined, max = 110): string {
  if (!val) return '(leeg)';
  const s = val.trim();
  if (!s) return '(leeg)';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

interface Props {
  userId?: string;
  userEmail?: string;
  showUserColumn?: boolean;
  maxHeight?: string;
}

export default function UserProductActivityPanel({
  userId,
  userEmail,
  showUserColumn = false,
  maxHeight = '540px',
}: Props) {
  const [articleQuery, setArticleQuery] = useState('');
  const [debouncedArticle, setDebouncedArticle] = useState('');
  const [textFilter, setTextFilter] = useState('');
  const [items, setItems] = useState<UserActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedArticle(articleQuery.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [articleQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: '120' });
    if (userId) params.set('userId', userId);
    if (debouncedArticle) params.set('articleNumber', debouncedArticle);

    fetch(`/api/user/activity?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Kon activiteit niet ophalen.');
        return data;
      })
      .then((data) => {
        if (!cancelled) {
          setItems(Array.isArray(data.items) ? data.items : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Fout bij ophalen.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, debouncedArticle]);

  const filteredItems = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      return (
        it.articleNumber.toLowerCase().includes(q) ||
        (it.productTitle || '').toLowerCase().includes(q) ||
        (it.fieldLabel || '').toLowerCase().includes(q) ||
        (it.oldValue || '').toLowerCase().includes(q) ||
        (it.newValue || '').toLowerCase().includes(q) ||
        (it.summary || '').toLowerCase().includes(q) ||
        (it.userEmail || '').toLowerCase().includes(q)
      );
    });
  }, [items, textFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Search & Filter Row */}
      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '320px' }}>
          <input
            type="text"
            className="input"
            placeholder="🔢 Zoek op artikelnummer (bijv. 9919)..."
            value={articleQuery}
            onChange={(e) => setArticleQuery(e.target.value)}
            style={{ width: '100%', paddingRight: articleQuery ? '2rem' : undefined, fontSize: '0.86rem' }}
          />
          {articleQuery && (
            <button
              type="button"
              onClick={() => setArticleQuery('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontWeight: 700,
              }}
              title="Wis artikelnummer"
            >
              ✕
            </button>
          )}
        </div>

        <input
          type="text"
          className="input"
          placeholder="🔍 Filter op veld, tekst of titel..."
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          style={{ flex: '1 1 220px', maxWidth: '300px', fontSize: '0.86rem' }}
        />

        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          {loading
            ? 'Laden...'
            : `${filteredItems.length} ${filteredItems.length === 1 ? 'activiteit' : 'activiteiten'}${userEmail ? ` voor ${userEmail.split('@')[0]}` : ''}`}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.84rem' }}>
          ❌ {error}
        </div>
      )}

      {/* Results List */}
      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          backgroundColor: 'var(--surface)',
        }}
      >
        {loading ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            Productactiviteit laden...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            {debouncedArticle
              ? `Geen wijzigingen of acties gevonden voor artikelnummer "${debouncedArticle}".`
              : 'Nog geen productwijzigingen of acties gevonden.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredItems.map((it, idx) => {
              const dt = new Date(it.timestamp).toLocaleString('nl-NL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              const srcMeta = it.source ? SOURCE_LABELS[it.source] ?? SOURCE_LABELS.MANUAL : null;
              const auditMeta = AUDIT_ACTION_LABELS[it.action] ?? {
                label: it.action,
                bg: '#f1f5f9',
                color: '#334155',
              };

              return (
                <div
                  key={it.id}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: idx < filteredItems.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  {/* Top metadata row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                      🕒 {dt}
                    </span>

                    {showUserColumn && it.userEmail && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.08rem 0.45rem',
                          borderRadius: '999px',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                        }}
                      >
                        👤 {it.userEmail.split('@')[0]}
                      </span>
                    )}

                    <Link
                      href={`/products?search=${encodeURIComponent(it.articleNumber)}`}
                      style={{ fontWeight: 800, color: '#0284c7', textDecoration: 'none' }}
                      title="Open dit product in Producten"
                    >
                      #{it.articleNumber}
                    </Link>

                    {it.productTitle && (
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                        {it.productTitle}
                      </span>
                    )}

                    <div style={{ flex: 1 }} />

                    {it.type === 'FIELD_CHANGE' ? (
                      <>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.5rem',
                            borderRadius: '999px',
                            backgroundColor: '#f1f5f9',
                            color: '#0f172a',
                          }}
                        >
                          {it.fieldLabel || it.fieldKey}
                        </span>
                        {srcMeta && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.1rem 0.45rem',
                              borderRadius: '999px',
                              backgroundColor: srcMeta.bg,
                              color: srcMeta.color,
                            }}
                          >
                            {srcMeta.label}
                          </span>
                        )}
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.5rem',
                          borderRadius: '999px',
                          backgroundColor: auditMeta.bg,
                          color: auditMeta.color,
                        }}
                      >
                        {auditMeta.label}
                      </span>
                    )}
                  </div>

                  {/* Change detail row */}
                  {it.type === 'FIELD_CHANGE' ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        flexWrap: 'wrap',
                        fontSize: '0.77rem',
                        paddingLeft: '0.2rem',
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: '#fef2f2',
                          color: '#991b1b',
                          padding: '0.12rem 0.45rem',
                          borderRadius: '5px',
                          border: '1px solid #fecaca',
                          textDecoration: it.oldValue ? 'line-through' : 'none',
                        }}
                        title={it.oldValue || '(leeg)'}
                      >
                        {truncateVal(it.oldValue)}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>→</span>
                      <span
                        style={{
                          backgroundColor: '#f0fdf4',
                          color: '#166534',
                          padding: '0.12rem 0.45rem',
                          borderRadius: '5px',
                          border: '1px solid #bbf7d0',
                          fontWeight: 600,
                        }}
                        title={it.newValue || '(leeg)'}
                      >
                        {truncateVal(it.newValue)}
                      </span>
                    </div>
                  ) : (
                    it.summary && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', paddingLeft: '0.2rem' }}>
                        {it.summary}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
