"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const MAX_LENGTH = 500;

export function BitComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = content.trim().length === 0;
  const isOverLimit = content.length > MAX_LENGTH;
  const canSubmit = !isEmpty && !isOverLimit && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/bits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error("request failed");

      setContent("");
      router.refresh();
    } catch {
      setError("Bit를 올리지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-b border-border px-4 py-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="무슨 생각을 하고 있나요? #태그 도 써보세요"
        rows={3}
        aria-label="Bit 내용"
        className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-2 flex items-center justify-between">
        <span
          className={
            isOverLimit ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {content.length}/{MAX_LENGTH}
        </span>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitting ? "올리는 중..." : "Bit 올리기"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </form>
  );
}
