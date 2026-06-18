"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bitId: string;
  rebitCount: number;
  isLoggedIn: boolean;
};

export function RebitButton({ bitId, rebitCount, isLoggedIn }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const disabled = busy || isPending;

  const alreadyRebitted = rebitCount > 0;

  async function doRebit(msg?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/bits/${bitId}/rebit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) {
        setOpen(false);
        setMessage("");
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    if (rebitCount === 0) return null;
    return (
      <span style={{ fontSize: "12.5px", color: "#B4AB97", display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <RebitIcon />
        {rebitCount}
      </span>
    );
  }

  return (
    <div style={{ display: "inline-block" }}>
      <button
        type="button"
        onClick={() => {
          if (alreadyRebitted) {
            void doRebit();
          } else {
            setOpen(true);
          }
        }}
        disabled={disabled}
        aria-label={`Rebit${rebitCount > 0 ? ` ${rebitCount}` : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "12.5px",
          color: alreadyRebitted ? "#C96820" : "#B4AB97",
          background: "none",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          padding: "4px 6px",
          borderRadius: "8px",
          fontFamily: "inherit",
          opacity: disabled ? 0.6 : 1,
          fontWeight: alreadyRebitted ? 600 : 400,
        }}
        className="hover:bg-[#FEF3E8] hover:!text-[#C96820]"
      >
        <RebitIcon />
        {rebitCount > 0 ? rebitCount : "Rebit"}
      </button>

      {open && (
        <div
          style={{
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
            maxWidth: "480px",
            boxShadow: "0 8px 32px rgba(42,38,32,0.12)",
          }}>
            <p style={{ fontSize: "12.5px", color: "#C96820", fontWeight: 600, marginBottom: "12px" }}>
              Rebit
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note... (optional)"
              rows={3}
              maxLength={300}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void doRebit(message);
              }}
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
              <span style={{ fontSize: "12px", color: "#B4AB97" }}>{message.length}/300</span>
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
                  onClick={() => void doRebit(message)}
                  disabled={busy}
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 600,
                    padding: "8px 18px",
                    borderRadius: "999px",
                    border: "none",
                    cursor: busy ? "not-allowed" : "pointer",
                    background: "#C96820",
                    color: "#fff",
                    fontFamily: "inherit",
                  }}
                >
                  {busy ? "..." : "Rebit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RebitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/>
      <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
    </svg>
  );
}
