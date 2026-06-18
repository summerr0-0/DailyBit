"use client";

import { useState } from "react";

const PRE = "liked_";

function getLikeId(bitId: string): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split(";").find((c) => c.trim().startsWith(`${PRE}${bitId}=`));
  if (!entry) return null;
  const val = entry.split("=").slice(1).join("=").trim();
  return val || null;
}

function setLikeCookie(bitId: string, likeId: string) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${PRE}${bitId}=${likeId}; expires=${expires}; path=/; SameSite=Lax`;
}

function clearLikeCookie(bitId: string) {
  document.cookie = `${PRE}${bitId}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

type Props = { bitId: string; likeCount: number };

export function LikeButton({ bitId, likeCount: initialCount }: Props) {
  const [liked, setLiked] = useState(() => !!getLikeId(bitId));
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (liked) {
        const likeId = getLikeId(bitId);
        if (!likeId) { setLiked(false); return; }
        const res = await fetch(`/api/bits/${bitId}/like`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ likeId }),
        });
        if (res.ok) {
          const data = (await res.json()) as { count: number };
          setCount(data.count);
          setLiked(false);
          clearLikeCookie(bitId);
        }
      } else {
        const res = await fetch(`/api/bits/${bitId}/like`, { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as { likeId: string; count: number };
          setCount(data.count);
          setLiked(true);
          setLikeCookie(bitId, data.likeId);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-label={`${liked ? "Unlike" : "Like"}${count > 0 ? ` ${count}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: "12.5px",
        color: liked ? "#C2539B" : "#B4AB97",
        background: "none",
        border: "none",
        cursor: busy ? "default" : "pointer",
        padding: "4px 6px",
        borderRadius: "8px",
        fontFamily: "inherit",
        fontWeight: liked ? 600 : 400,
        transition: "color 0.15s",
      }}
      className={liked ? "hover:!text-[#C2539B] hover:bg-[#FDF0F6]" : "hover:!text-[#C2539B] hover:bg-[#FDF0F6]"}
    >
      <svg width="13" height="13" viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
      </svg>
      {count > 0 && count}
    </button>
  );
}
