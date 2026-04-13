"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getUnreadCountAction } from "@/app/actions/messages";

interface Props {
  initialCount: number;
}

export default function MessagesNavBadge({ initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();

  // Poll every 15 s — same cadence as the products auto-refresh
  useEffect(() => {
    const poll = async () => {
      try {
        const c = await getUnreadCountAction();
        setCount(c);
      } catch { /* silently ignore */ }
    };
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, []);

  // Re-poll immediately when navigating away from /messages (user may have read)
  useEffect(() => {
    if (!pathname.startsWith("/messages")) {
      getUnreadCountAction().then(setCount).catch(() => {});
    }
  }, [pathname]);

  const isActive = pathname.startsWith("/messages");

  return (
    <Link
      href="/messages"
      style={{
        padding: "0.75rem 1rem",
        borderRadius: "var(--radius)",
        color: isActive ? "var(--text)" : "var(--text-muted)",
        fontWeight: isActive ? 700 : 500,
        transition: "all 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5rem",
        backgroundColor: isActive ? "rgba(0,0,0,0.04)" : "transparent",
        textDecoration: "none",
      }}
    >
      <span>Berichten</span>
      {count > 0 && (
        <span
          style={{
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "0.65rem",
            fontWeight: 800,
            minWidth: "18px",
            height: "18px",
            borderRadius: "9px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 0.3rem",
            animation: "chat-pulse 2s ease-in-out infinite",
            flexShrink: 0,
          }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
