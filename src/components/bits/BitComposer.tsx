"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseTags } from "@/lib/tags";

const MAX_LENGTH = 500;
// 한계 임박 시각 경고. 남은 50자부터 카운터 색을 바꿔 사용자에게 미리 알린다.
const WARN_THRESHOLD = MAX_LENGTH - 50;

export function BitComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = content.trim().length === 0;
  const isOverLimit = content.length > MAX_LENGTH;
  const isNearLimit = !isOverLimit && content.length >= WARN_THRESHOLD;
  const canSubmit = !isEmpty && !isOverLimit && !submitting;
  // 본문에서 파싱되는 태그를 입력 중 미리 보여준다. 저장 시 parseTags 결과와 동일하다.
  const tags = parseTags(content);

  async function submit() {
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  // Cmd/Ctrl+Enter 제출 (textarea 줄바꿈은 일반 Enter로 유지).
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  const counterClass = isOverLimit
    ? "text-xs text-destructive"
    : isNearLimit
      ? "text-xs text-amber-500"
      : "text-xs text-muted-foreground";

  return (
    <form onSubmit={handleSubmit} className="border-b border-border px-4 py-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="무슨 생각을 하고 있나요? #태그 도 써보세요"
        rows={3}
        aria-label="Bit 내용"
        className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="태그 미리보기">
          {tags.map((tag) => (
            <span key={tag} className="text-xs text-blue-500">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className={counterClass}>
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
