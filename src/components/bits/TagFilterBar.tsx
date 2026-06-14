"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

type Props = {
  tags: { tag: string; count: number }[];
  selectedTags: string[];
};

export function TagFilterBar({ tags, selectedTags }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggleTag = useCallback(
    (tag: string) => {
      const next = new Set(selectedTags);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }

      const params = new URLSearchParams(searchParams.toString());
      if (next.size > 0) {
        params.set("tags", Array.from(next).join(","));
      } else {
        params.delete("tags");
      }

      router.push(`${pathname}?${params.toString()}`);
    },
    [selectedTags, pathname, searchParams, router],
  );

  if (tags.length === 0) return null;

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">역량 태그</span>
        {selectedTags.length > 0 && (
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("tags");
              router.push(`${pathname}?${params.toString()}`);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            필터 초기화
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(({ tag, count }) => {
          const active = selectedTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              #{tag}
              <span className="ml-1 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
