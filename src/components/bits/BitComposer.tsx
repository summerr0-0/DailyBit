"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
const MAX_LENGTH = 500;
const WARN_THRESHOLD = MAX_LENGTH - 50;

export function BitComposer() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = content.trim().length === 0;
  const isOverLimit = content.length > MAX_LENGTH;
  const isNearLimit = !isOverLimit && content.length >= WARN_THRESHOLD;
  const canSubmit = !isEmpty && !isOverLimit && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, private: isPrivate }),
      });
      if (!res.ok) throw new Error("request failed");
      setContent("");
      setIsPrivate(false);
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

          {/* Counter + controls + submit */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px", borderTop: "1px solid #F0EADC", paddingTop: "13px", gap: "8px" }}>
            <span style={{ fontSize: "12.5px", color: "#B4AB97" }}>
              Type <span style={{ color: "#C96820", fontWeight: 600 }}>#tag</span>
              {" "}· <span className={counterClass}>{content.length}/{MAX_LENGTH}</span>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsPrivate((v) => !v)}
                title={isPrivate ? "Private — only you can see this" : "Public — visible to everyone"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "4px",
                  fontSize: "12px", fontWeight: 600, padding: "5px 10px",
                  borderRadius: "999px", border: "1px solid",
                  cursor: "pointer", fontFamily: "inherit",
                  background: isPrivate ? "#FEF3E8" : "transparent",
                  borderColor: isPrivate ? "#E8A56A" : "#E0D6C4",
                  color: isPrivate ? "#9C4A1A" : "#B4AB97",
                  transition: "all 0.15s",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  {isPrivate
                    ? <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                    : <path d="M12 1C8.676 1 6 3.676 6 7v1H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/>
                  }
                </svg>
                {isPrivate ? "Private" : "Public"}
              </button>
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
          </div>

          {error && <p className="text-xs" style={{ color: "#C0392B" }}>{error}</p>}
      </div>
    </form>
  );
}
