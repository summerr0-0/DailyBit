"use client";

import { useState, useEffect, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseTags } from "@/lib/tags";
import type { AiCollabLevel } from "@/lib/bits";
import type { ThreadSummary } from "@/lib/threads";

const MAX_LENGTH = 500;
const WARN_THRESHOLD = MAX_LENGTH - 50;

const AI_COLLAB_OPTIONS: { value: AiCollabLevel; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "HINT", label: "Hint" },
  { value: "LED", label: "Led" },
];

type Mode = "standalone" | "thread";

export function BitComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("standalone");
  const [aiCollab, setAiCollab] = useState<AiCollabLevel>("NONE");

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState("");

  const isEmpty = content.trim().length === 0;
  const isOverLimit = content.length > MAX_LENGTH;
  const isNearLimit = !isOverLimit && content.length >= WARN_THRESHOLD;
  const canSubmit =
    !isEmpty &&
    !isOverLimit &&
    !submitting &&
    (mode === "standalone" || !!selectedThreadId);
  const tags = parseTags(content);

  useEffect(() => {
    if (mode === "thread") {
      fetch("/api/threads")
        .then((r) => r.json())
        .then((data: ThreadSummary[]) => {
          setThreads(data);
          if (data.length > 0 && !selectedThreadId) {
            setSelectedThreadId(data[0].id);
          }
        })
        .catch(() => {});
    }
  }, [mode]);

  async function handleCreateThread() {
    if (!newThreadTitle.trim()) return;
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newThreadTitle.trim() }),
      });
      if (!res.ok) throw new Error();
      const created: ThreadSummary = await res.json();
      setThreads((prev) => [created, ...prev]);
      setSelectedThreadId(created.id);
      setNewThreadTitle("");
      setShowNewThread(false);
    } catch {
      setError("Failed to create thread.");
    }
  }

  async function submit() {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/bits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ...(mode === "thread" ? { threadId: selectedThreadId } : {}),
          ...(aiCollab !== "NONE" ? { aiCollab } : {}),
        }),
      });

      if (!res.ok) throw new Error("request failed");

      setContent("");
      router.refresh();
    } catch {
      setError("Failed to post. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

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
    <form onSubmit={handleSubmit} className="border-b border-border px-4 py-3 space-y-2">
      {/* 작성 모드 선택 */}
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("standalone")}
          className={`px-2 py-1 rounded border transition-colors ${
            mode === "standalone"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Standalone Note
        </button>
        <button
          type="button"
          onClick={() => setMode("thread")}
          className={`px-2 py-1 rounded border transition-colors ${
            mode === "thread"
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Continue a Thread
        </button>
      </div>

      {/* 탐구 줄기 선택 */}
      {mode === "thread" && (
        <div className="space-y-1">
          {threads.length > 0 ? (
            <select
              value={selectedThreadId}
              onChange={(e) => setSelectedThreadId(e.target.value)}
              className="w-full text-xs bg-transparent border border-border rounded px-2 py-1 outline-none"
            >
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.bitCount} stages)
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">No threads yet.</p>
          )}

          {showNewThread ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={newThreadTitle}
                onChange={(e) => setNewThreadTitle(e.target.value)}
                placeholder="Thread title (e.g. Next.js caching deep-dive)"
                maxLength={100}
                className="flex-1 text-xs bg-transparent border border-border rounded px-2 py-1 outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateThread();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void handleCreateThread()}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowNewThread(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewThread(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              + New thread
            </button>
          )}
        </div>
      )}

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          mode === "thread"
            ? "What did you discover in this step? Try #tags too"
            : "What are you thinking about? Try #tags too"
        }
        rows={3}
        aria-label="Bit content"
        className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Tag preview">
          {tags.map((tag) => (
            <span key={tag} className="text-xs text-blue-500">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">AI collab:</span>
        {AI_COLLAB_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setAiCollab(opt.value)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              aiCollab === opt.value
                ? "border-blue-500 text-blue-500 bg-blue-500/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className={counterClass}>
          {content.length}/{MAX_LENGTH}
        </span>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitting ? "Posting..." : "Post Bit"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
