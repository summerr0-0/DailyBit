"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

type Tag = { tag: string; count: number };

type Props = {
  tags: Tag[];
  totalCount: number;
  selectedTags: string[];
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

export function TagSidebarClient({ tags, totalCount, selectedTags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

        {tags.map(({ tag, count }) => {
          const active = activeTag === tag;
          return (
            <button
              key={tag}
              onClick={() => setTag(tag)}
              style={{
                ...ROW_BASE,
                background: active ? "#C96820" : "transparent",
                color: active ? "#fff" : "#4A4438",
              }}
            >
              <span>#{tag}</span>
              <span style={{ fontSize: "12.5px", color: active ? "#F5D5B0" : "#B4AB97" }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
