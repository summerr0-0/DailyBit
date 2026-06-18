"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useOptimistic, useTransition } from "react";

type Tag = { tag: string; count: number; isPrivateTag: boolean };

type Props = {
  tags: Tag[];
  totalCount: number;
  selectedTags: string[];
  isLoggedIn?: boolean;
};

const ROW_BASE: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  padding: "8px 11px",
  borderRadius: "10px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 500,
  border: "none",
  textAlign: "left",
  background: "transparent",
};

function LockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  );
}

export function TagSidebarClient({ tags, totalCount, selectedTags, isLoggedIn = false }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Optimistic local toggle so the UI responds instantly
  const [optimisticTags, addOptimistic] = useOptimistic(
    tags,
    (state, { tag, makePrivate }: { tag: string; makePrivate: boolean }) =>
      state.map((t) => (t.tag === tag ? { ...t, isPrivateTag: makePrivate } : t)),
  );

  const setTag = useCallback(
    (tag: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tag === null) {
        params.delete("tags");
      } else {
        params.set("tags", tag);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, searchParams, router],
  );

  async function togglePrivateTag(tag: string, currentlyPrivate: boolean) {
    startTransition(() => {
      addOptimistic({ tag, makePrivate: !currentlyPrivate });
    });

    if (currentlyPrivate) {
      await fetch(`/api/tags/private/${encodeURIComponent(tag)}`, { method: "DELETE" });
    } else {
      await fetch("/api/tags/private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
    }
    router.refresh();
  }

  const activeTag = selectedTags[0] ?? null;
  const allActive = activeTag === null;

  return (
    <div style={{
      background: "#FFFDF8",
      border: "1px solid #E8E1D2",
      borderRadius: "18px",
      padding: "18px",
      boxShadow: "0 1px 2px rgba(60,50,30,0.04)",
    }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#8A8170", letterSpacing: "0.4px", marginBottom: "13px" }}>
        Tags
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        <button
          onClick={() => setTag(null)}
          style={{
            ...ROW_BASE,
            background: allActive ? "#FEF3E8" : "transparent",
            color: allActive ? "#9C4A1A" : "#4A4438",
            fontWeight: allActive ? 700 : 500,
          }}
        >
          <span>All</span>
          <span style={{ fontSize: "12.5px", color: "#B4AB97" }}>{totalCount}</span>
        </button>

        {optimisticTags.map(({ tag, count, isPrivateTag }) => {
          const active = activeTag === tag;
          return (
            <div key={tag} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <button
                onClick={() => setTag(tag)}
                style={{
                  ...ROW_BASE,
                  flex: 1,
                  background: active ? "#C96820" : "transparent",
                  color: active
                    ? "#fff"
                    : isPrivateTag
                      ? "#9C6A2A"
                      : "#4A4438",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  {isPrivateTag && <LockIcon />}
                  #{tag}
                </span>
                <span style={{ fontSize: "12.5px", color: active ? "#F5D5B0" : "#B4AB97" }}>
                  {count}
                </span>
              </button>

              {/* Lock toggle — only visible to Irin */}
              {isLoggedIn && (
                <button
                  type="button"
                  title={isPrivateTag ? "Make tag public" : "Make tag private"}
                  onClick={() => void togglePrivateTag(tag, isPrivateTag)}
                  style={{
                    flexShrink: 0, padding: "4px", borderRadius: "6px", border: "none",
                    background: "none", cursor: "pointer",
                    color: isPrivateTag ? "#C96820" : "#D0C9BC",
                    display: "flex", alignItems: "center",
                  }}
                  className="hover:bg-[#FEF3E8]"
                >
                  <LockIcon size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
