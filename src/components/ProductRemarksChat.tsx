"use client";
import React, { useState, useEffect, useRef, useTransition } from 'react';
import {
  getProductRemarksAction,
  addProductRemarkAction,
  deleteProductRemarkAction,
  type RemarkEntry,
} from '@/app/actions/remarks';

// ── helpers ────────────────────────────────────────────────────────────────

function getInitials(email: string) {
  const name = email.split('@')[0];
  const parts = name.split(/[._\-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316',
  '#eab308','#22c55e','#06b6d4','#3b82f6','#a855f7',
];
function getAvatarColor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Always shows full date + time: "13 apr 14:35" */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  articleNumber: string;
  currentUserId: string;
  isAdmin: boolean;
  isOpen: boolean;
  /** Optional fixed height — defaults to 380px. Pass 'auto' to let WYSIWYG grid control it. */
  height?: number | string;
}

export default function ProductRemarksChat({ articleNumber, currentUserId, isAdmin, isOpen, height = 380 }: Props) {
  const [remarks, setRemarks]   = useState<RemarkEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');
  const [isPending, startT]     = useTransition();
  const [hoveredId, setHoveredId]         = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const scrollRef               = useRef<HTMLDivElement>(null);

  // ── data loading ──────────────────────────────────────────────────────
  const load = async () => {
    const data = await getProductRemarksAction(articleNumber);
    setRemarks(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleNumber, isOpen]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [remarks]);

  // ── actions ──────────────────────────────────────────────────────────
  const handleSend = () => {
    if (!message.trim() || isPending) return;
    setError('');
    const optimistic: RemarkEntry = {
      id: '_optimistic_' + Date.now(),
      message: message.trim(),
      createdAt: new Date().toISOString(),
      user: { id: currentUserId, email: 'jij', chatColor: null },
    };
    setRemarks(prev => [...prev, optimistic]);
    const msg = message.trim();
    setMessage('');
    startT(async () => {
      const res = await addProductRemarkAction(articleNumber, msg);
      if (!res.success) {
        setError(res.error || 'Verzenden mislukt.');
        setRemarks(prev => prev.filter(r => r.id !== optimistic.id));
      } else {
        await load();
      }
    });
  };

  const handleDelete = (id: string) => {
    startT(async () => {
      const res = await deleteProductRemarkAction(id);
      if (res.success) setRemarks(prev => prev.filter(r => r.id !== id));
      else setError(res.error || 'Verwijderen mislukt.');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── render ────────────────────────────────────────────────────────────
  const containerHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: containerHeight,
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      backgroundColor: 'var(--background)',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.7rem 1rem',
        fontWeight: 700,
        fontSize: '0.85rem',
        color: 'var(--text)',
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexShrink: 0,
      }}>
        <span>💬</span>
        Interne Communicatie
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--text-muted)',
          backgroundColor: 'var(--border)',
          padding: '0.1rem 0.5rem',
          borderRadius: '1rem',
        }}>
          {remarks.length} {remarks.length === 1 ? 'bericht' : 'berichten'}
        </span>
      </div>

      {/* Messages — scrolls internally */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.75rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem', fontSize: '0.85rem' }}>
            Laden...
          </div>
        )}

        {!loading && remarks.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem', fontSize: '0.85rem' }}>
            Nog geen berichten. Stuur het eerste bericht!
          </div>
        )}

        {remarks.map((r, idx) => {
          const isMine       = r.user.id === currentUserId || r.user.email === 'jij';
          const isOptimistic = r.id.startsWith('_optimistic_');
          const canDelete    = !isOptimistic && (isMine || isAdmin);
          const prevRemark   = remarks[idx - 1];
          const showAvatar   = !prevRemark || prevRemark.user.id !== r.user.id;
          const name         = r.user.email === 'jij' ? 'Jij' : r.user.email.split('@')[0];
          const initials     = getInitials(r.user.email === 'jij' ? (currentUserId + '@x') : r.user.email);
          // Use user's custom chatColor if available, otherwise hash-based color
          const avatarColor  = isMine
            ? (r.user.chatColor || 'var(--primary)')
            : (r.user.chatColor || getAvatarColor(r.user.email));
          const isHovered    = hoveredId === r.id;

          return (
            <div
              key={r.id}
              style={{
                display: 'flex',
                flexDirection: isMine ? 'row-reverse' : 'row',
                alignItems: 'flex-end',
                gap: '0.4rem',
                opacity: isOptimistic ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                backgroundColor: avatarColor, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem', fontWeight: 800, flexShrink: 0,
                visibility: showAvatar ? 'visible' : 'hidden',
              }}>
                {initials}
              </div>

              {/* Bubble column */}
              <div
                style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: isMine ? 'flex-end' : 'flex-start' }}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {showAvatar && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: avatarColor, paddingLeft: isMine ? 0 : '0.35rem', paddingRight: isMine ? '0.35rem' : 0 }}>
                    {name}
                  </span>
                )}

                {/* Bubble + delete button row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexDirection: isMine ? 'row-reverse' : 'row' }}>
                  <div
                    style={{
                      backgroundColor: isMine ? (r.user.chatColor || 'var(--primary)') : 'var(--surface)',
                      color: isMine ? 'white' : 'var(--text)',
                      padding: '0.45rem 0.75rem',
                      borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      fontSize: '0.85rem',
                      lineHeight: 1.45,
                      border: isMine ? 'none' : '1px solid var(--border)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {r.message}
                  </div>

                  {/* Delete / inline confirm — only for own messages (or admin) */}
                  {canDelete && (isHovered || confirmingDeleteId === r.id) && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                    >
                      {confirmingDeleteId === r.id ? (
                        // Inline confirmation buttons
                        <>
                          <button
                            type="button"
                            onClick={() => { setConfirmingDeleteId(null); handleDelete(r.id); }}
                            title="Ja, verwijderen"
                            style={{
                              height: '22px', padding: '0 0.5rem', borderRadius: '4px',
                              border: '1px solid #ef4444', backgroundColor: '#ef4444',
                              color: 'white', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700,
                              display: 'flex', alignItems: 'center',
                            }}
                          >Verwijder</button>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteId(null)}
                            title="Annuleren"
                            style={{
                              height: '22px', padding: '0 0.5rem', borderRadius: '4px',
                              border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
                              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem',
                              display: 'flex', alignItems: 'center',
                            }}
                          >Annuleer</button>
                        </>
                      ) : (
                        // Idle trash icon
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(r.id)}
                          title="Verwijderen"
                          style={{
                            width: '22px', height: '22px', borderRadius: '50%',
                            border: '1px solid var(--border)', backgroundColor: 'var(--surface)',
                            color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            transition: 'opacity 0.15s',
                          }}
                        >🗑</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Date + time — always shown, full format */}
                <span style={{
                  fontSize: '0.62rem', color: 'var(--text-muted)',
                  paddingLeft: isMine ? 0 : '0.35rem',
                  paddingRight: isMine ? '0.35rem' : 0,
                }}>
                  {isOptimistic ? 'Verzenden...' : formatDateTime(r.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '0.35rem 1rem', backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--error)', fontSize: '0.78rem', fontWeight: 600, flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '0.55rem 0.75rem',
        display: 'flex',
        gap: '0.6rem',
        alignItems: 'flex-end',
        backgroundColor: 'var(--surface)',
        flexShrink: 0,
      }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht... (Enter = versturen, Shift+Enter = nieuwe regel)"
          rows={1}
          disabled={isPending}
          style={{
            flex: 1, resize: 'none', borderRadius: '16px',
            border: '1px solid var(--border)',
            padding: '0.45rem 0.85rem',
            fontSize: '0.85rem', outline: 'none',
            backgroundColor: 'var(--background)', color: 'var(--text)',
            fontFamily: 'inherit', lineHeight: 1.4,
            maxHeight: '100px', overflowY: 'auto',
          }}
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 100) + 'px';
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || !message.trim()}
          style={{
            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
            backgroundColor: message.trim() ? 'var(--primary)' : 'var(--border)',
            color: 'white',
            cursor: message.trim() && !isPending ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1rem', flexShrink: 0,
            transition: 'background-color 0.2s, transform 0.1s',
          }}
          onMouseEnter={e => { if (message.trim()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
          title="Versturen (Enter)"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
