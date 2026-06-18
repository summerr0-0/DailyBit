"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { parseTags } from "@/lib/tags";

const MAX_LENGTH = 500;
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
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#FFFDF8",
        border: "1px solid #E8E1D2",
        borderRadius: "18px",
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(60,50,30,0.04)",
      }}
    >
      <div className="space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you learning today? Try #tags too"
            rows={3}
            aria-label="Bit content"
            className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          {/* Counter + submit */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px", borderTop: "1px solid #F0EADC", paddingTop: "13px" }}>
            <span style={{ fontSize: "12.5px", color: "#B4AB97" }}>
              Type <span style={{ color: "#C96820", fontWeight: 600 }}>#tag</span>
              {" "}· <span className={counterClass}>{content.length}/{MAX_LENGTH}</span>
            </span>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "inherit",
                padding: "9px 20px",
                borderRadius: "999px",
                border: "none",
                cursor: canSubmit ? "pointer" : "not-allowed",
                background: canSubmit ? "#C96820" : "#E0D6C4",
                color: canSubmit ? "#fff" : "#B4AB97",
                transition: "background 0.15s, opacity 0.15s",
              }}
            >
              {submitting ? "Posting..." : "Post"}
            </button>
          </div>

          {error && <p className="text-xs" style={{ color: "#C0392B" }}>{error}</p>}
      </div>
    </form>
  );
}
