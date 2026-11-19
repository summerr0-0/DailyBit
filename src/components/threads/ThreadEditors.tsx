"use client";

import { useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { renderBitContent } from "@/components/bits/bit-content";
import { FormatToolbar, handleBoldShortcut } from "@/components/bits/FormatToolbar";

// Thread 페이지 오너 편집 (사용자 요청 2026-11-20): 제목 수정, 각 Bit 본문 수정.
// 비로그인 방문자에게는 편집 버튼이 렌더되지 않고, API도 requireAuth로 막혀 있다.

const MAX_BIT = 500;
const MAX_TITLE = 100;
const ACCENT = "#C96820";
const MUTED = "#A89E89";

export function ThreadTitle({ threadId, title, editable }: { threadId: string; title: string; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    const t = value.trim();
    if (!t || t.length > MAX_TITLE) return setError(`Title must be 1–${MAX_TITLE} characters.`);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError("Failed to save the title.");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <h1 style={titleStyle}>{title}</h1>
        {editable && (
          <button type="button" onClick={() => { setValue(title); setError(null); setEditing(true); }} style={linkBtn} aria-label="Edit thread title">
            Edit title
          </button>
        )}
      </div>
    );
  }
  return (
    <div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX_TITLE}
        aria-label="Thread title"
        autoFocus
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter는 무시 (Gemini #6)
          if (e.key === "Enter") void save();
          if (e.key === "Escape") { setValue(title); setEditing(false); }
        }}
        style={{ ...titleStyle, width: "100%", border: "1px solid #E0D6C4", borderRadius: 10, padding: "6px 10px", background: "transparent", outline: "none" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: MUTED }}>{value.length}/{MAX_TITLE}</span>
        <button type="button" onClick={() => { setValue(title); setEditing(false); }} style={linkBtn}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving} style={primaryBtn}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {error && <p style={{ color: "#C0392B", fontSize: 12.5, marginTop: 6 }}>{error}</p>}
    </div>
  );
}

export function EditableBitContent({ bitId, content, editable }: { bitId: string; content: string; editable: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function save() {
    if (saving) return;
    const c = value.trim();
    if (!c || c.length > MAX_BIT) return setError(`Content must be 1–${MAX_BIT} characters.`);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/bits/${bitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", content: c }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError("Failed to save.");
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <>
        <p style={{ fontSize: 15, lineHeight: 1.68, color: "#33302A", whiteSpace: "pre-wrap", margin: 0 }}>
          {renderBitContent(content)}
        </p>
        {editable && (
          <button type="button" onClick={() => { setValue(content); setError(null); setEditing(true); }} style={{ ...linkBtn, marginTop: 8 }} aria-label="Edit this bit">
            Edit
          </button>
        )}
      </>
    );
  }
  return (
    <div>
      <FormatToolbar textareaRef={ref} value={value} onChange={setValue} />
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (handleBoldShortcut(e, ref, value, setValue)) return;
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === "Escape") { setValue(content); setEditing(false); }
        }}
        rows={8}
        aria-label="Bit content"
        autoFocus
        style={{ width: "100%", minHeight: 160, fontSize: 15, lineHeight: 1.65, border: "1px solid #E0D6C4", borderRadius: 10, padding: "10px 12px", background: "transparent", outline: "none", resize: "vertical", fontFamily: "inherit", color: "#33302A" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: value.trim().length > MAX_BIT ? "#C0392B" : MUTED }}>{value.trim().length}/{MAX_BIT}</span>
        <button type="button" onClick={() => { setValue(content); setEditing(false); }} style={linkBtn}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || value.trim().length > MAX_BIT} style={primaryBtn}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p style={{ color: "#C0392B", fontSize: 12.5, marginTop: 6 }}>{error}</p>}
    </div>
  );
}

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-newsreader), serif",
  fontSize: 22,
  fontWeight: 500,
  color: "#2A2620",
  margin: 0,
  letterSpacing: "-0.3px",
  lineHeight: 1.3,
};
const linkBtn: CSSProperties = { background: "none", border: "none", color: MUTED, fontSize: 12.5, cursor: "pointer", padding: 0, fontFamily: "inherit", whiteSpace: "nowrap" };
const primaryBtn: CSSProperties = { fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 999, border: "none", background: ACCENT, color: "#fff", cursor: "pointer", fontFamily: "inherit" };
