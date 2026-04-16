"use client";
import React, { useState, useEffect, useRef, useTransition } from 'react';
import {
  getProductRemarksAction,
  addProductRemarkAction,
  deleteProductRemarkAction,
  updateProductRemarkAction,
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

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function isWithin5Min(iso: string) {
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}

/**
 * Splits plain text on URLs and returns a React node array where every URL
 * is wrapped in a clickable <a> that opens in a new tab.
 */
function renderWithLinks(text: string): React.ReactNode[] {
  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: 'inherit',
          textDecoration: 'underline',
          opacity: 0.85,
          wordBreak: 'break-all',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** localStorage key for tracking when this user last read this chat. */
function lastSeenKey(userId: string, articleNumber: string) {
  return `chat_last_seen_${userId}_${articleNumber}`;
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  articleNumber: string;
  currentUserId: string;
  currentUserChatColor?: string | null;
  userChatColors?: Record<string, string>;
  isAdmin: boolean;
  isOpen: boolean;
  height?: number | string;
  /** Label from the WYSIWYG layout — default "Interne Communicatie" */
  title?: string;
}

export default function ProductRemarksChat({
  articleNumber, currentUserId, currentUserChatColor, userChatColors = {},
  isAdmin, isOpen, height = 380, title = 'Interne Communicatie'
}: Props) {
  const [remarks, setRemarks]   = useState<RemarkEntry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');
  const [isPending, startT]     = useTransition();

  // hover / delete confirm / edit
  const [hoveredId, setHoveredId]                   = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId]                   = useState<string | null>(null);
  const [editValue, setEditValue]                   = useState('');

  // "new message" indicator
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [newCount, setNewCount]             = useState(0);
  const dismissTimerRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── helpers ───────────────────────────────────────────────────────────
  const markAsSeen = () => {
    try {
      localStorage.setItem(lastSeenKey(currentUserId, articleNumber), new Date().toISOString());
    } catch { /* storage unavailable */ }
  };

  // ── data loading ──────────────────────────────────────────────────────
  const load = async () => {
    const data = await getProductRemarksAction(articleNumber);
    setRemarks(data);
    setLoading(false);

    // Check for new messages from other users since last seen
    try {
      const seen = localStorage.getItem(lastSeenKey(currentUserId, articleNumber));
      const seenDate = seen ? new Date(seen) : null;

      const newFromOthers = data.filter(r =>
        r.user.id !== currentUserId &&
        r.user.email !== 'jij' &&
        (!seenDate || new Date(r.createdAt) > seenDate)
      );

      if (newFromOthers.length > 0) {
        setHasNewMessages(true);
        setNewCount(newFromOthers.length);
      } else {
        setHasNewMessages(false);
        setNewCount(0);
      }
    } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    if (!isOpen) {
      // Update "last seen" when the drawer closes
      markAsSeen();
      return;
    }
    setLoading(true);
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleNumber, isOpen]);

  // Auto-scroll to bottom when remarks change
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [remarks]);

  // 3-second auto-dismiss of new-message indicator
  useEffect(() => {
    if (!isOpen || !hasNewMessages) return;

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setHasNewMessages(false);
      setNewCount(0);
      markAsSeen();
    }, 3000);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasNewMessages]);

  // ── actions ──────────────────────────────────────────────────────────
  const handleSend = () => {
    if (!message.trim() || isPending) return;
    setError('');
    const myColor = currentUserChatColor || null;
    const optimistic: RemarkEntry = {
      id: '_optimistic_' + Date.now(),
      message: message.trim(),
      createdAt: new Date().toISOString(),
      user: { id: currentUserId, email: 'jij', chatColor: myColor },
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
        markAsSeen(); // own message → update "last seen" so it doesn't show as new
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

  const startEdit = (r: RemarkEntry) => {
    setEditingId(r.id);
    setEditValue(r.message);
    setConfirmingDeleteId(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditValue(''); };

  const handleSaveEdit = (id: string) => {
    if (!editValue.trim() || isPending) return;
    startT(async () => {
      const res = await updateProductRemarkAction(id, editValue.trim());
      if (res.success) {
        setRemarks(prev => prev.map(r => r.id === id ? { ...r, message: editValue.trim() } : r));
        cancelEdit();
      } else {
        setError(res.error || 'Bewerken mislukt.');
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── render ────────────────────────────────────────────────────────────
  const containerHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: containerHeight,
      borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      overflow: 'hidden', backgroundColor: 'var(--background)',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.7rem 1rem', fontWeight: 700, fontSize: '0.85rem',
        color: 'var(--text)', backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
      }}>
        <span>💬</span>
        {title}

        {/* New message badge — pulses for 3 seconds */}
        {hasNewMessages && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            backgroundColor: '#ef4444', color: 'white',
            fontSize: '0.65rem', fontWeight: 800,
            padding: '0.15rem 0.55rem', borderRadius: '1rem',
            animation: 'chat-pulse 1s ease-in-out infinite',
            marginLeft: '0.2rem',
          }}>
            🔔 {newCount} nieuw{newCount === 1 ? '' : 'e'} bericht{newCount === 1 ? '' : 'en'}
          </span>
        )}

        <span style={{
          marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 600,
          color: 'var(--text-muted)', backgroundColor: 'var(--border)',
          padding: '0.1rem 0.5rem', borderRadius: '1rem',
        }}>
          {remarks.length} {remarks.length === 1 ? 'bericht' : 'berichten'}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      >
        {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem', fontSize: '0.85rem' }}>Laden...</div>}
        {!loading && remarks.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem', fontSize: '0.85rem' }}>
            Nog geen berichten. Stuur het eerste bericht!
          </div>
        )}

        {remarks.map((r, idx) => {
          const isMine       = r.user.id === currentUserId || r.user.email === 'jij';
          const isOptimistic = r.id.startsWith('_optimistic_');
          const canDelete    = !isOptimistic && (isMine || isAdmin);
          const canEdit      = !isOptimistic && isMine && isWithin5Min(r.createdAt);
          const prevRemark   = remarks[idx - 1];
          const showAvatar   = !prevRemark || prevRemark.user.id !== r.user.id;
          const name         = r.user.email === 'jij' ? 'Jij' : r.user.email.split('@')[0];
          const initials     = getInitials(r.user.email === 'jij' ? (currentUserId + '@x') : r.user.email);

          const resolvedColor = isMine
            ? (currentUserChatColor || r.user.chatColor || 'var(--primary)')
            : (userChatColors[r.user.id] || r.user.chatColor || getAvatarColor(r.user.email));

          const isHovered = hoveredId === r.id;
          const isEditing = editingId === r.id;

          return (
            <div
              key={r.id}
              style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: '0.4rem', opacity: isOptimistic ? 0.6 : 1, transition: 'opacity 0.2s' }}
            >
              {/* Avatar */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                backgroundColor: resolvedColor, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem', fontWeight: 800, flexShrink: 0,
                visibility: showAvatar ? 'visible' : 'hidden',
              }}>{initials}</div>

              {/* Bubble column */}
              <div
                style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '0.1rem', alignItems: isMine ? 'flex-end' : 'flex-start' }}
                onMouseEnter={() => setHoveredId(r.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {showAvatar && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: resolvedColor, paddingLeft: isMine ? 0 : '0.35rem', paddingRight: isMine ? '0.35rem' : 0 }}>
                    {name}
                  </span>
                )}

                {/* Bubble + action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexDirection: isMine ? 'row-reverse' : 'row' }}>

                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: '220px' }}>
                      <textarea
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
                        autoFocus rows={3}
                        style={{ width: '100%', resize: 'vertical', borderRadius: '8px', border: `2px solid ${resolvedColor}`, padding: '0.45rem 0.75rem', fontSize: '0.85rem', outline: 'none', backgroundColor: 'var(--background)', color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.4 }}
                      />
                      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                        <button type="button" onClick={() => handleSaveEdit(r.id)} disabled={isPending} style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', border: 'none', backgroundColor: resolvedColor, color: 'white', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>✓ Opslaan</button>
                        <button type="button" onClick={cancelEdit} style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}>Annuleer</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      backgroundColor: resolvedColor,
                      color: 'white',
                      padding: '0.45rem 0.75rem',
                      borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      fontSize: '0.85rem', lineHeight: 1.45,
                      border: 'none',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {renderWithLinks(r.message)}
                    </div>
                  )}

                  {/* Action buttons: edit + delete */}
                  {!isEditing && (isHovered || confirmingDeleteId === r.id) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <button type="button" onClick={() => startEdit(r)} title="Bewerken (binnen 5 min)"
                          style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: resolvedColor, cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >✏️</button>
                      )}
                      {canDelete && (
                        confirmingDeleteId === r.id ? (
                          <>
                            <button type="button" onClick={() => { setConfirmingDeleteId(null); handleDelete(r.id); }}
                              style={{ height: '22px', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid #ef4444', backgroundColor: '#ef4444', color: 'white', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center' }}
                            >Verwijder</button>
                            <button type="button" onClick={() => setConfirmingDeleteId(null)}
                              style={{ height: '22px', padding: '0 0.5rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center' }}
                            >Annuleer</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmingDeleteId(r.id)} title="Verwijderen"
                            style={{ width: '22px', height: '22px', borderRadius: '50%', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: '#ef4444', cursor: 'pointer', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >🗑</button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', paddingLeft: isMine ? 0 : '0.35rem', paddingRight: isMine ? '0.35rem' : 0 }}>
                  {isOptimistic ? 'Verzenden...' : formatDateTime(r.createdAt)}
                  {canEdit && !isEditing && <span style={{ marginLeft: '0.3rem', opacity: 0.6 }}>· nog te bewerken</span>}
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
      <div style={{ borderTop: '1px solid var(--border)', padding: '0.55rem 0.75rem', display: 'flex', gap: '0.6rem', alignItems: 'flex-end', backgroundColor: 'var(--surface)', flexShrink: 0 }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht... (Enter = versturen, Shift+Enter = nieuwe regel)"
          rows={1} disabled={isPending}
          style={{ flex: 1, resize: 'none', borderRadius: '16px', border: '1px solid var(--border)', padding: '0.45rem 0.85rem', fontSize: '0.85rem', outline: 'none', backgroundColor: 'var(--background)', color: 'var(--text)', fontFamily: 'inherit', lineHeight: 1.4, maxHeight: '100px', overflowY: 'auto' }}
          onInput={e => {
            const t = e.currentTarget;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 100) + 'px';
          }}
        />
        <button
          type="button" onClick={handleSend}
          disabled={isPending || !message.trim()}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', backgroundColor: message.trim() ? 'var(--primary)' : 'var(--border)', color: 'white', cursor: message.trim() && !isPending ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0, transition: 'background-color 0.2s, transform 0.1s' }}
          onMouseEnter={e => { if (message.trim()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
          title="Versturen (Enter)"
        >➤</button>
      </div>
    </div>
  );
}
