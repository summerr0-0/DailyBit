"use client";

import { useState } from "react";
import type { CommentItem } from "@/lib/comments";

type Props = {
  bitId: string;
  commentCount: number;
  isLoggedIn: boolean;
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

function hasCooldown(): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith("comment_cooldown="));
}

function isMyComment(commentId: string): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith(`cm_${commentId}=`));
}

function markMyComment(commentId: string) {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `cm_${commentId}=1; expires=${expires}; path=/; SameSite=Lax`;
}

export function CommentSection({ bitId, commentCount, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(commentCount);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function openComments() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (comments !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/bits/${bitId}/comments`);
      const data = (await res.json()) as CommentItem[];
      setComments(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!content.trim() || submitting) return;
    if (hasCooldown()) { setFormError("Please wait 60 seconds before posting again."); return; }
    if (!password.trim()) { setFormError("Password is required."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bits/${bitId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, author, password }),
      });
      if (res.status === 429) { setFormError("Please wait 60 seconds before posting again."); return; }
      if (res.status === 403) { setFormError("Incorrect password."); return; }
      if (res.ok) {
        const created = (await res.json()) as CommentItem;
        setComments((prev) => (prev ? [created, ...prev] : [created]));
        setDisplayCount((n) => n + 1);
        setContent("");
        setAuthor("");
        setPassword("");
        markMyComment(created.id);
        document.cookie = "comment_cooldown=1; max-age=60; path=/; SameSite=Strict";
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string, withPassword?: string) {
    const body: Record<string, string> = {};
    if (withPassword) body.password = withPassword;
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setComments((prev) => (prev ? prev.filter((c) => c.id !== commentId) : []));
      setDisplayCount((n) => Math.max(0, n - 1));
      setDeletingId(null);
      setDeletePassword("");
      setDeleteError(null);
    } else if (res.status === 401) {
      setDeleteError("Incorrect password.");
    }
  }

  function startDelete(commentId: string) {
    if (isLoggedIn) {
      if (window.confirm("Delete this comment?")) void handleDelete(commentId);
    } else {
      setDeletingId(commentId);
      setDeletePassword("");
      setDeleteError(null);
    }
  }

  // ✕ visible only to: owner (Irin) OR the commenter (has cookie)
  function canDelete(commentId: string): boolean {
    return isLoggedIn || isMyComment(commentId);
  }

  return (
    <>
      {/* Toggle button — lives inside the flex action bar */}
      <button
        type="button"
        onClick={() => void openComments()}
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
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        {displayCount > 0 ? displayCount : "Comment"}
      </button>

      {/* Expanded panel — flex-basis:100% pushes it to its own row */}
      {open && (
        <div style={{ flexBasis: "100%", marginTop: "12px" }}>
          {/* Comment form */}
          <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Name (optional)"
                maxLength={50}
                style={{ flex: 1, fontSize: "13px", border: "1px solid #E8E1D2", borderRadius: "8px", padding: "6px 10px", background: "#FDFBF7", outline: "none", fontFamily: "inherit", color: "#33302A" }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deletion password"
                maxLength={50}
                required
                style={{ width: "120px", fontSize: "13px", border: "1px solid #E8E1D2", borderRadius: "8px", padding: "6px 10px", background: "#FDFBF7", outline: "none", fontFamily: "inherit", color: "#33302A" }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a comment..."
                maxLength={300}
                rows={2}
                style={{ flex: 1, fontSize: "13.5px", border: "1px solid #E8E1D2", borderRadius: "10px", padding: "8px 12px", background: "#FDFBF7", outline: "none", resize: "none", fontFamily: "inherit", color: "#33302A" }}
              />
              <button
                type="submit"
                disabled={!content.trim() || submitting}
                style={{
                  fontSize: "13px", fontWeight: 600, padding: "0 16px", borderRadius: "10px", border: "none",
                  cursor: !content.trim() || submitting ? "not-allowed" : "pointer",
                  background: content.trim() ? "#C96820" : "#E0D6C4",
                  color: content.trim() ? "#fff" : "#B4AB97",
                  fontFamily: "inherit", height: "36px", flexShrink: 0,
                }}
              >
                {submitting ? "..." : "Post"}
              </button>
            </div>
            {formError && <p style={{ fontSize: "12px", color: "#C0392B", margin: 0 }}>{formError}</p>}
          </form>

          {/* Comment list */}
          {loading ? (
            <p style={{ fontSize: "13px", color: "#B4AB97" }}>Loading...</p>
          ) : comments === null || comments.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#B4AB97" }}>No comments yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {comments.map((c) => (
                <div key={c.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                    <div>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#4A4438" }}>{c.author}</span>
                      <span style={{ fontSize: "11.5px", color: "#C0B9A9", marginLeft: "6px" }}>{timeAgo(c.createdAt)}</span>
                      <p style={{ margin: "3px 0 0", fontSize: "13.5px", color: "#33302A", lineHeight: 1.55 }}>{c.content}</p>
                    </div>
                    {canDelete(c.id) && (
                      <button
                        type="button"
                        onClick={() => startDelete(c.id)}
                        style={{ fontSize: "11px", color: "#C0B9A9", background: "none", border: "none", cursor: "pointer", flexShrink: 0, paddingTop: "2px" }}
                        aria-label="Delete comment"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {deletingId === c.id && (
                    <div style={{ marginTop: "8px", display: "flex", gap: "6px", alignItems: "center" }}>
                      <input
                        type="password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder="Enter password"
                        maxLength={50}
                        style={{ fontSize: "12.5px", border: "1px solid #E8E1D2", borderRadius: "7px", padding: "5px 9px", background: "#FDFBF7", outline: "none", fontFamily: "inherit", width: "140px", color: "#33302A" }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleDelete(c.id, deletePassword);
                          if (e.key === "Escape") { setDeletingId(null); setDeleteError(null); }
                        }}
                        autoFocus
                      />
                      <button type="button" onClick={() => void handleDelete(c.id, deletePassword)}
                        style={{ fontSize: "12px", fontWeight: 600, padding: "5px 12px", borderRadius: "7px", border: "none", background: "#C96820", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                        Delete
                      </button>
                      <button type="button" onClick={() => { setDeletingId(null); setDeleteError(null); }}
                        style={{ fontSize: "12px", color: "#B4AB97", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                        Cancel
                      </button>
                      {deleteError && <span style={{ fontSize: "12px", color: "#C0392B" }}>{deleteError}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
