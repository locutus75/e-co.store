"use client";
import React, { useState, useEffect, useRef, useTransition, useCallback } from "react";
import {
  getInboxAction,
  getSentAction,
  getThreadAction,
  getUnreadCountAction,
  sendMessageAction,
  markReadAction,
  markUnreadAction,
  deleteMessageAction,
  type MessageEntry,
  type MsgUser,
} from "@/app/actions/messages";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316",
  "#22c55e","#06b6d4","#3b82f6","#a855f7","#f59e0b",
];

function getAvatarColor(email: string, chatColor?: string | null) {
  if (chatColor) return chatColor;
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getInitials(email: string) {
  const n = email.split("@")[0];
  const p = n.split(/[._\-]/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : n.slice(0, 2).toUpperCase();
}

function displayName(email: string) {
  return email.split("@")[0];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Zojuist";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min geleden`;
  if (diff < 86_400_000)
    return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isImageFile(filename: string) {
  return /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(filename);
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
          color: "inherit",
          textDecoration: "underline",
          opacity: 0.85,
          wordBreak: "break-all",
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function Avatar({ user, size = 32 }: { user: MsgUser; size?: number }) {
  const color = getAvatarColor(user.email, user.chatColor);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      backgroundColor: color, color: "white",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.34, fontWeight: 800, flexShrink: 0,
    }}>
      {getInitials(user.email)}
    </div>
  );
}

function RecipientPicker({
  allUsers, selected, onChange,
}: {
  allUsers: MsgUser[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const available = allUsers.filter(
    (u) => !selected.includes(u.id) && u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center",
        border: "1px solid var(--border)", borderRadius: "var(--radius)",
        padding: "0.4rem 0.6rem", backgroundColor: "var(--background)", minHeight: "40px",
      }}>
        {selected.map((id) => {
          const u = allUsers.find((x) => x.id === id);
          if (!u) return null;
          const color = getAvatarColor(u.email, u.chatColor);
          return (
            <span key={id} style={{
              display: "inline-flex", alignItems: "center", gap: "0.3rem",
              backgroundColor: color + "22", color: color,
              border: `1px solid ${color}44`, borderRadius: "1rem",
              padding: "0.1rem 0.5rem 0.1rem 0.4rem", fontSize: "0.78rem", fontWeight: 600,
            }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: color, color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.55rem", fontWeight: 800 }}>
                {getInitials(u.email)}
              </span>
              {displayName(u.email)}
              <button type="button" onClick={() => onChange(selected.filter((s) => s !== id))}
                style={{ background: "none", border: "none", cursor: "pointer", color, fontSize: "0.8rem", lineHeight: 1, padding: 0 }}>✕</button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Selecteer ontvangers..." : "+ Toevoegen"}
          style={{ border: "none", outline: "none", backgroundColor: "transparent", fontSize: "0.85rem", color: "var(--text)", minWidth: 120, flex: 1 }}
        />
      </div>
      {open && available.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          backgroundColor: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
          maxHeight: "220px", overflowY: "auto",
        }}>
          {available.map((u) => (
            <div key={u.id}
              onClick={() => { onChange([...selected, u.id]); setQuery(""); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: "0.6rem",
                padding: "0.6rem 0.8rem", cursor: "pointer",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Avatar user={u} size={26} />
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{displayName(u.email)}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{u.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  initialInbox: MessageEntry[];
  allUsers: MsgUser[];
  currentUserId: string;
  currentUserEmail: string;
  currentUserChatColor: string | null;
}

type Box = "inbox" | "sent";

interface ComposeState {
  toUserIds: string[];
  subject: string;
  body: string;
  files: File[];
  parentId: string | null;
  replySubject: string; // prefilled subject when replying
}

const emptyCompose = (): ComposeState => ({
  toUserIds: [], subject: "", body: "", files: [], parentId: null, replySubject: "",
});

export default function MessagesClient({
  initialInbox, allUsers, currentUserId, currentUserEmail, currentUserChatColor,
}: Props) {
  const [box, setBox] = useState<Box>("inbox");
  const [messages, setMessages] = useState<MessageEntry[]>(initialInbox);
  const [loading, setLoading] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [thread, setThread] = useState<MessageEntry[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [isPending, startT] = useTransition();
  const [sendError, setSendError] = useState("");
  const [unread, setUnread] = useState(0);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the body textarea whenever a reply compose form opens
  useEffect(() => {
    if (compose?.parentId) {
      const t = setTimeout(() => bodyTextareaRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [compose?.parentId]);

  const currentUser: MsgUser = { id: currentUserId, email: currentUserEmail, chatColor: currentUserChatColor };

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadBox = useCallback(async (b: Box, silent = false) => {
    if (!silent) setLoading(true);
    const data = b === "inbox" ? await getInboxAction() : await getSentAction();
    setMessages(data);
    if (!silent) setLoading(false);
  }, []);

  const switchBox = (b: Box) => {
    setBox(b);
    setSelectedMsgId(null);
    setThread([]);
    setCompose(null);
    loadBox(b);
  };

  // Auto-refresh every 10 s
  useEffect(() => {
    const id = setInterval(() => {
      loadBox(box, true);
      getUnreadCountAction().then(setUnread).catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [box, loadBox]);

  // Initial unread count
  useEffect(() => {
    getUnreadCountAction().then(setUnread).catch(() => {});
  }, []);

  // Scroll thread to bottom when it loads
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  // ── Interactions ────────────────────────────────────────────────────────────

  const selectMessage = async (msg: MessageEntry) => {
    setSelectedMsgId(msg.id);
    setCompose(null);
    setSendError("");
    setThreadLoading(true);
    const t = await getThreadAction(msg.id);
    setThread(t);
    setThreadLoading(false);

    // Mark as read (inbox only, if unread)
    if (box === "inbox" && !msg.myReadAt) {
      await markReadAction(msg.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, myReadAt: new Date().toISOString() } : m))
      );
      setUnread((n) => Math.max(0, n - 1));
    }
  };

  const openCompose = () => {
    setCompose(emptyCompose());
    setSelectedMsgId(null);
    setThread([]);
    setSendError("");
  };

  const openReply = (msg: MessageEntry) => {
    const replyTo = [
      msg.fromUser.id,
      ...msg.recipients.map((r) => r.toUser.id),
    ].filter((id) => id !== currentUserId)
      .filter((id, i, arr) => arr.indexOf(id) === i);

    const subject = msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`;
    setCompose({
      toUserIds: replyTo,
      subject,
      body: "",
      files: [],
      parentId: msg.id,
      replySubject: subject,
    });
    setSendError("");
  };

  const handleSend = () => {
    if (!compose) return;
    // Capture current selectedMsgId before async work
    const replyParentId = compose.parentId;
    const currentSelectedId = selectedMsgId;
    setSendError("");
    startT(async () => {
      const fd = new FormData();
      fd.set("subject", compose.subject || compose.replySubject);
      fd.set("body", compose.body);
      if (replyParentId) fd.set("parentId", replyParentId);
      compose.toUserIds.forEach((id) => fd.append("toUserIds", id));
      compose.files.forEach((f) => fd.append("attachments", f));

      const res = await sendMessageAction(fd);
      if (res.error) {
        setSendError(res.error);
        return;
      }

      // Load fresh thread BEFORE closing compose so it renders immediately
      if (replyParentId && currentSelectedId) {
        const t = await getThreadAction(currentSelectedId);
        setThread(t);
      }

      setCompose(null);
      await loadBox(box);
    });
  };

  const handleDelete = (msgId: string) => {
    startT(async () => {
      await deleteMessageAction(msgId, box);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      if (selectedMsgId === msgId) { setSelectedMsgId(null); setThread([]); }
    });
  };

  const handleMarkUnread = (msgId: string) => {
    startT(async () => {
      await markUnreadAction(msgId);
      // Update the list row to show the unread indicator again
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, myReadAt: null } : m))
      );
      // Update the thread bubble (so the button disappears immediately)
      setThread((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, myReadAt: null } : m))
      );
      // Increment the local+badge unread count
      setUnread((n) => n + 1);
    });
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const inboxUnread = messages.filter((m) => box === "inbox" && !m.myReadAt).length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)" }}>Berichten</h1>
        <button
          type="button"
          onClick={openCompose}
          style={{
            padding: "0.65rem 1.4rem", borderRadius: "var(--radius)",
            backgroundColor: "var(--primary)", border: "none",
            color: "#1e293b", fontWeight: 700, fontSize: "0.9rem",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)", transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
        >
          ✏️ Nieuw bericht
        </button>
      </div>

      <div className="glass" style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", display: "flex", minHeight: "calc(100vh - 220px)" }}>

        {/* ── Left: folder + list ───────────────────────────────────────── */}
        <div style={{
          width: "340px", flexShrink: 0, borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Box tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", backgroundColor: "var(--surface)" }}>
            {(["inbox", "sent"] as Box[]).map((b) => (
              <button
                key={b} type="button" onClick={() => switchBox(b)}
                style={{
                  flex: 1, padding: "0.9rem", border: "none", cursor: "pointer",
                  backgroundColor: box === b ? "var(--background)" : "var(--surface)",
                  color: box === b ? "var(--text)" : "var(--text-muted)",
                  fontWeight: box === b ? 700 : 500, fontSize: "0.85rem",
                  borderBottom: box === b ? "2px solid var(--primary)" : "2px solid transparent",
                  transition: "all 0.2s", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: "0.4rem",
                }}
              >
                {b === "inbox" ? "📥 Inbox" : "📤 Verzonden"}
                {b === "inbox" && inboxUnread > 0 && (
                  <span style={{
                    backgroundColor: "#ef4444", color: "white",
                    fontSize: "0.6rem", fontWeight: 800, minWidth: 16, height: 16,
                    borderRadius: "8px", display: "inline-flex", alignItems: "center",
                    justifyContent: "center", padding: "0 0.25rem",
                  }}>{inboxUnread > 99 ? "99+" : inboxUnread}</span>
                )}
              </button>
            ))}
          </div>

          {/* Message list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>Laden...</div>
            )}
            {!loading && messages.length === 0 && (
              <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {box === "inbox" ? "Geen berichten in je inbox." : "Je hebt nog geen berichten verstuurd."}
              </div>
            )}
            {messages.map((msg) => {
              const isUnread = box === "inbox" && !msg.myReadAt;
              const isSelected = selectedMsgId === msg.id;
              const counterpart = box === "inbox" ? msg.fromUser : msg.recipients[0]?.toUser;

              return (
                <div
                  key={msg.id} onClick={() => selectMessage(msg)}
                  style={{
                    padding: "0.85rem 1rem", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    backgroundColor: isSelected ? "rgba(0,0,0,0.04)" : "transparent",
                    borderLeft: isUnread ? "3px solid var(--primary)" : "3px solid transparent",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--surface-hover)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
                    {counterpart && <Avatar user={counterpart} size={36} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: isUnread ? 700 : 500, fontSize: "0.82rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {counterpart ? displayName(counterpart.email) : "—"}
                          {msg.recipients.length > 1 && (
                            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> +{msg.recipients.length - 1}</span>
                          )}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                          {relativeTime(msg.sentAt)}
                        </span>
                      </div>
                      <div style={{ fontWeight: isUnread ? 700 : 500, fontSize: "0.83rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "0.1rem" }}>
                        {msg.subject}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "0.1rem" }}>
                        {msg.body.slice(0, 90)}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
                        {msg.replyCount > 0 && (
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>💬 {msg.replyCount}</span>
                        )}
                        {msg.attachments.length > 0 && (
                          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>📎 {msg.attachments.length}</span>
                        )}
                        {isUnread && (
                          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#ef4444", display: "inline-block", marginTop: 2, flexShrink: 0 }} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: thread or compose ──────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* COMPOSE — always visible when compose !== null */}
          {compose !== null && (
            <div style={{
              padding: "1.5rem",
              display: "flex", flexDirection: "column", gap: "1rem",
              // When reply: fixed height slice so thread is visible below
              ...(compose.parentId
                ? { flexShrink: 0, overflowY: "auto", maxHeight: "52%", borderBottom: "2px solid var(--border)" }
                : { flex: 1, overflowY: "auto" }),
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", flex: 1 }}>
                  {compose.parentId ? "Beantwoorden" : "Nieuw bericht"}
                </h2>
                <button type="button" onClick={handleSend} disabled={isPending}
                  style={{
                    padding: "0.4rem 1rem", borderRadius: "var(--radius)",
                    border: "none", backgroundColor: "var(--primary)", color: "#1e293b",
                    cursor: isPending ? "wait" : "pointer", fontWeight: 700, fontSize: "0.82rem",
                    opacity: isPending ? 0.7 : 1, transition: "opacity 0.2s", whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                  {isPending ? "Versturen..." : "Versturen ➤"}
                </button>
                <button type="button" onClick={() => setCompose(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "var(--text-muted)", flexShrink: 0 }}>
                  ✕
                </button>
              </div>

              {/* Aan */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>Aan</label>
                <RecipientPicker
                  allUsers={allUsers}
                  selected={compose.toUserIds}
                  onChange={(ids) => setCompose((c) => c && { ...c, toUserIds: ids })}
                />
              </div>

              {/* Onderwerp */}
              {!compose.parentId && (
                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>Onderwerp</label>
                  <input
                    className="input"
                    value={compose.subject}
                    onChange={(e) => setCompose((c) => c && { ...c, subject: e.target.value })}
                    placeholder="Onderwerp..."
                  />
                </div>
              )}
              {compose.parentId && (
                <div style={{ padding: "0.5rem 0.8rem", borderRadius: "var(--radius)", backgroundColor: "var(--surface)", border: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Re:</strong> {compose.replySubject.replace(/^Re:\s*/i, "")}
                </div>
              )}

              {/* Berichttekst */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bericht</label>
                <textarea
                  ref={bodyTextareaRef}
                  className="input"
                  value={compose.body}
                  onChange={(e) => setCompose((c) => c && { ...c, body: e.target.value })}
                  placeholder="Schrijf je bericht hier..."
                  style={{ flex: 1, minHeight: compose.parentId ? "120px" : "200px", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
                />
              </div>

              {/* Bijlagen */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>Bijlagen</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                  {compose.files.map((f, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.25rem 0.6rem", fontSize: "0.78rem" }}>
                      📎 {f.name}
                      <button type="button" onClick={() => setCompose((c) => c && { ...c, files: c.files.filter((_, j) => j !== i) })}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)", fontSize: "0.8rem", lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                  <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0.7rem", borderRadius: "var(--radius)", border: "1px dashed var(--border)", fontSize: "0.8rem", color: "var(--text-muted)", transition: "border-color 0.2s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                    📎 Bestand toevoegen
                    <input type="file" multiple ref={fileInputRef} style={{ display: "none" }}
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files ?? []);
                        setCompose((c) => c && { ...c, files: [...c.files, ...newFiles] });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              {sendError && (
                <div style={{ padding: "0.6rem 0.8rem", borderRadius: "var(--radius)", backgroundColor: "rgba(239,68,68,0.08)", color: "var(--error)", fontSize: "0.82rem", fontWeight: 600 }}>
                  {sendError}
                </div>
              )}

            </div>
          )}

          {/* THREAD — shown when: (a) no compose and message selected, or (b) reply compose open */}
          {selectedMsgId && (compose === null || compose.parentId !== null) && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Divider shown when reply compose is open */}
              {compose?.parentId && (
                <div style={{ padding: "0.4rem 1.5rem", backgroundColor: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Voorgaand gesprek</span>
                </div>
              )}
              {threadLoading ? (
                <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>Laden...</div>
              ) : (
                <>
                  <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                    {/* In reply mode: reverse so newest is at top */}
                    {(compose?.parentId ? [...thread].reverse() : thread).map((msg, idx) => {
                      const isMine = msg.fromUser.id === currentUserId;
                      const color = getAvatarColor(msg.fromUser.email, msg.fromUser.chatColor);
                      return (
                        <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          {/* Divider between messages in thread */}
                          {idx > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", opacity: 0.4 }}>
                              <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
                              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{relativeTime(msg.sentAt)}</span>
                              <div style={{ flex: 1, height: 1, backgroundColor: "var(--border)" }} />
                            </div>
                          )}

                          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexDirection: isMine ? "row-reverse" : "row" }}>
                            <Avatar user={msg.fromUser} size={38} />
                            <div style={{ flex: 1, maxWidth: "82%" }}>
                              {/* Header */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexDirection: isMine ? "row-reverse" : "row", marginBottom: "0.4rem", gap: "0.5rem" }}>
                                <span style={{ fontWeight: 700, fontSize: "0.82rem", color }}>
                                  {isMine ? "Jij" : displayName(msg.fromUser.email)}
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{fullDate(msg.sentAt)}</span>
                              </div>

                              {/* To: line */}
                              {idx === 0 && (
                                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.6rem", textAlign: isMine ? "right" : "left" }}>
                                  Aan: {msg.recipients.map((r) => displayName(r.toUser.email)).join(", ")}
                                </div>
                              )}

                              {/* Bubble — own messages in profile color, others get a light tint of their color */}
                              <div style={{
                                backgroundColor: isMine ? color : `${color}1a`,
                                color: isMine ? "white" : "var(--text)",
                                border: isMine ? "none" : `1px solid ${color}40`,
                                borderRadius: isMine ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                                padding: "0.75rem 1rem", whiteSpace: "pre-wrap", lineHeight: 1.65,
                                fontSize: "0.88rem", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                              }}>
                                {renderWithLinks(msg.body)}
                              </div>

                              {/* Attachments */}
                              {msg.attachments.length > 0 && (
                                <div style={{ marginTop: "0.6rem" }}>
                                  {/* Image thumbnails */}
                                  {msg.attachments.filter(a => isImageFile(a.filename)).length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.4rem", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                                      {msg.attachments.filter(a => isImageFile(a.filename)).map((a) => {
                                        const url = `/api/uploads/messages/${msg.id}/${a.filename}`;
                                        return (
                                          <div
                                            key={a.id}
                                            onClick={() => setLightbox({ url, name: a.originalName })}
                                            title={`Bekijken: ${a.originalName}`}
                                            style={{
                                              width: 72, height: 72, borderRadius: "var(--radius)",
                                              overflow: "hidden", border: "1px solid var(--border)",
                                              cursor: "pointer", flexShrink: 0, backgroundColor: "var(--surface-hover)",
                                              transition: "transform 0.15s, border-color 0.15s",
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.borderColor = "var(--primary)"; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = "var(--border)"; }}
                                          >
                                            <img src={url} alt={a.originalName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {/* Non-image file links */}
                                  {msg.attachments.filter(a => !isImageFile(a.filename)).length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                                      {msg.attachments.filter(a => !isImageFile(a.filename)).map((a) => (
                                        <a
                                          key={a.id}
                                          href={`/api/uploads/messages/${msg.id}/${a.filename}`}
                                          download={a.originalName}
                                          style={{
                                            display: "inline-flex", alignItems: "center", gap: "0.3rem",
                                            padding: "0.25rem 0.65rem", borderRadius: "var(--radius)",
                                            backgroundColor: "var(--surface)", border: "1px solid var(--border)",
                                            color: "var(--text)", fontSize: "0.75rem", fontWeight: 600, textDecoration: "none",
                                            transition: "border-color 0.15s",
                                          }}
                                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
                                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                                        >
                                          📎 {a.originalName}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Actions */}
                              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", justifyContent: isMine ? "flex-end" : "flex-start" }}>
                                <button type="button" onClick={() => openReply(msg)}
                                  style={{ padding: "0.2rem 0.7rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color, fontWeight: 600, fontSize: "0.72rem", cursor: "pointer", transition: "border-color 0.15s" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
                                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                                  ↩ Beantwoorden
                                </button>
                                {/* "Mark as unread" — visible only in inbox, on received messages that have already been read */}
                                {box === "inbox" && !isMine && msg.myReadAt !== null && msg.myReadAt !== undefined && (
                                  <button type="button" onClick={() => handleMarkUnread(msg.id)} disabled={isPending}
                                    style={{ padding: "0.2rem 0.7rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.72rem", cursor: "pointer", transition: "all 0.15s" }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                                    ✉ Ongelezen
                                  </button>
                                )}
                                {(isMine || box === "inbox") && (
                                  <button type="button" onClick={() => handleDelete(msg.id)} disabled={isPending}
                                    style={{ padding: "0.2rem 0.7rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--error)", fontWeight: 600, fontSize: "0.72rem", cursor: "pointer", transition: "border-color 0.15s" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--error)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                                    🗑 Verwijderen
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* EMPTY STATE */}
          {compose === null && !selectedMsgId && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", color: "var(--text-muted)", padding: "3rem" }}>
              <div style={{ fontSize: "4rem" }}>✉️</div>
              <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>Selecteer een bericht</div>
              <div style={{ fontSize: "0.85rem", textAlign: "center", maxWidth: "300px" }}>
                Of schrijf een nieuw bericht via de knop rechtsboven.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Attachment Lightbox ─────────────────────────────────────────── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.88)",
            backdropFilter: "blur(6px)", zIndex: 9999,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}
        >
          <img
            src={lightbox.url}
            alt={lightbox.name}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "88vw", maxHeight: "75vh",
              objectFit: "contain", borderRadius: "0.75rem",
              boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            }}
          />
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "1rem" }} onClick={(e) => e.stopPropagation()}>
            <a
              href={lightbox.url}
              download={lightbox.name}
              className="btn btn-primary"
              style={{ textDecoration: "none" }}
            >
              ⬇ Download
            </a>
            <button
              type="button"
              className="btn"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "white", border: "none" }}
              onClick={() => setLightbox(null)}
            >
              Sluiten
            </button>
          </div>
          <p style={{ marginTop: "0.75rem", color: "rgba(255,255,255,0.5)", fontSize: "0.75rem" }}>
            {lightbox.name}
          </p>
        </div>
      )}
    </div>
  );
}
