"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

const MAX_LENGTH = 500;

type Props = { bitId: string };

export function ThreadReplyButton({ bitId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = content.trim().length > 0 && content.length <= MAX_LENGTH && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/bits/${bitId}/thread-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      setContent("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div style={{ display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: "12.5px",
          color: open ? "#C96820" : "#B4AB97",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 6px",
          borderRadius: "8px",
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontWeight: open ? 600 : 400,
        }}
        className={open ? "" : "hover:bg-[#FEF3E8] hover:!text-[#C96820]"}
        aria-label="Continue thread"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 10 20 15 15 20"/>
          <path d="M4 4v7a4 4 0 004 4h12"/>
        </svg>
        Thread
      </button>

      {open && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,38,32,0.35)",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            background: "#FFFDF8",
            border: "1px solid #E8E1D2",
            borderRadius: "18px",
            padding: "20px",
            width: "100%",
            maxWidth: "520px",
            boxShadow: "0 8px 32px rgba(42,38,32,0.12)",
          }}>
            <p style={{ fontSize: "12.5px", color: "#C96820", fontWeight: 600, marginBottom: "12px" }}>
              ↳ Continue thread
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write your next step... (⌘↵ to post)"
              rows={4}
              autoFocus
              style={{
                width: "100%",
                fontSize: "15px",
                lineHeight: 1.65,
                border: "none",
                outline: "none",
                background: "transparent",
                resize: "none",
                fontFamily: "inherit",
                color: "#33302A",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #F0EADC" }}>
              <span style={{ fontSize: "12px", color: content.length > MAX_LENGTH ? "#C0392B" : "#B4AB97" }}>
                {content.length}/{MAX_LENGTH}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{ fontSize: "13px", color: "#B4AB97", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 600,
                    padding: "8px 18px",
                    borderRadius: "999px",
                    border: "none",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    background: canSubmit ? "#C96820" : "#E0D6C4",
                    color: canSubmit ? "#fff" : "#B4AB97",
                    fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  {submitting ? "..." : "Post"}
                </button>
              </div>
            </div>
            {error && <p style={{ fontSize: "12px", color: "#C0392B", marginTop: "8px" }}>{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
