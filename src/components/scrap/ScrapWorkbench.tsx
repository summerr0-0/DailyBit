"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScrapDraftDTO } from "@/lib/scrap-drafts";

const ACCENT = "#C96820";
const MUTED = "#B4AB97";
const CARD_BG = "#FFFDF8";
const CARD_BORDER = "#E8E1D2";
const MAX = 500;

type Phase = "idle" | "extracting" | "summarizing";

export function ScrapWorkbench({ initialDrafts }: { initialDrafts: ScrapDraftDTO[] }) {
  const [drafts, setDrafts] = useState<ScrapDraftDTO[]>(initialDrafts);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function generate() {
    setError(null);
    setNotice(null);

    // 1) 추출: 텍스트 fallback이 열려 있으면 텍스트 우선, 아니면 URL
    let extract: { sourceType: string; sourceUrl: string | null; sourceTitle: string | null; rawExtract: string };
    setPhase("extracting");
    try {
      const payload = showText
        ? { sourceType: "TEXT", rawExtract: text }
        : { sourceType: "URL", url };
      const res = await fetch("/api/scrap/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 422) {
        const data = await res.json();
        setShowText(true);
        setNotice(data.message ?? "본문을 가져오지 못했어요. 원문 텍스트를 붙여넣어 주세요.");
        setPhase("idle");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "extract failed");
      }
      extract = await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추출에 실패했습니다.");
      setPhase("idle");
      return;
    }

    // 2) 요약
    let summary: { segments: string[]; suggestedThreadTitle: string | null };
    setPhase("summarizing");
    try {
      const res = await fetch("/api/scrap/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawExtract: extract.rawExtract, sourceTitle: extract.sourceTitle }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "summarize failed");
      }
      summary = await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 요약에 실패했습니다.");
      setPhase("idle");
      return;
    }

    // 3) draft 저장
    try {
      const res = await fetch("/api/scrap/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: extract.sourceType,
          sourceUrl: extract.sourceUrl,
          sourceTitle: extract.sourceTitle,
          rawExtract: extract.rawExtract,
          segments: summary.segments,
          suggestedThreadTitle: summary.suggestedThreadTitle,
        }),
      });
      if (!res.ok) throw new Error("draft save failed");
      const draft: ScrapDraftDTO = await res.json();
      setDrafts((prev) => [draft, ...prev]);
      setUrl("");
      setText("");
      setShowText(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 저장에 실패했습니다.");
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 입력 */}
      <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 18, padding: "18px 20px" }}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://article-or-youtube-url"
          disabled={busy}
          style={inputStyle}
        />
        {showText && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the original text here (fallback)"
            rows={5}
            disabled={busy}
            style={{ ...inputStyle, marginTop: 10, resize: "vertical" }}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            style={{ background: "none", border: "none", color: MUTED, fontSize: 12.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >
            {showText ? "URL만 사용" : "직접 텍스트 붙여넣기"}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || (showText ? text.trim() === "" : url.trim() === "")}
            style={primaryBtn(!busy && (showText ? text.trim() !== "" : url.trim() !== ""))}
          >
            {phase === "extracting" ? "가져오는 중…" : phase === "summarizing" ? "요약 중…" : "요약 초안 만들기"}
          </button>
        </div>
        {notice && <p style={{ marginTop: 10, fontSize: 12.5, color: "#9C4A1A" }}>{notice}</p>}
        {error && <p style={{ marginTop: 10, fontSize: 12.5, color: "#C0392B" }}>{error}</p>}
      </div>

      {/* draft 목록 */}
      {drafts.length === 0 ? (
        <p style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: "20px 0" }}>
          No pending drafts. Generate one above.
        </p>
      ) : (
        drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            onDone={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
          />
        ))
      )}
    </div>
  );
}

function DraftCard({ draft, onDone }: { draft: ScrapDraftDTO; onDone: () => void }) {
  const router = useRouter();
  const [segments, setSegments] = useState<string[]>(draft.segments);
  const [title, setTitle] = useState(draft.suggestedThreadTitle ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isThread = segments.length >= 2;
  const overLimit = segments.some((s) => s.trim().length === 0 || s.length > MAX);

  function updateSegment(i: number, value: string) {
    setSegments((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }
  function removeSegment(i: number) {
    setSegments((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function publish() {
    if (overLimit || working) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/scrap/drafts/${draft.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments, threadTitle: isThread ? title : null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "publish failed");
      }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "발행에 실패했습니다.");
      setWorking(false);
    }
  }

  async function discard() {
    if (working) return;
    setWorking(true);
    try {
      await fetch(`/api/scrap/drafts/${draft.id}`, { method: "DELETE" });
      onDone();
    } catch {
      setError("폐기에 실패했습니다.");
      setWorking(false);
    }
  }

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 18, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>
          {isThread ? `Thread · ${segments.length} bits` : "Single Bit"}
        </span>
        {draft.sourceUrl && (
          <a href={draft.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: MUTED, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {draft.sourceTitle ?? draft.sourceUrl}
          </a>
        )}
      </div>

      {isThread && (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread title"
          maxLength={100}
          style={{ ...inputStyle, marginBottom: 12, fontWeight: 600 }}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {segments.map((seg, i) => {
          const over = seg.length > MAX;
          return (
            <div key={i} style={{ borderTop: i > 0 ? "1px solid #F0EADC" : "none", paddingTop: i > 0 ? 12 : 0 }}>
              <textarea
                value={seg}
                onChange={(e) => updateSegment(i, e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 11.5, color: over ? "#C0392B" : MUTED }}>{seg.length}/{MAX}</span>
                {segments.length > 1 && (
                  <button type="button" onClick={() => removeSegment(i)} style={{ background: "none", border: "none", color: MUTED, fontSize: 11.5, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                    remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 14, borderTop: "1px solid #F0EADC", paddingTop: 13 }}>
        <button type="button" onClick={() => void discard()} disabled={working} style={ghostBtn}>
          Discard
        </button>
        <button type="button" onClick={() => void publish()} disabled={overLimit || working} style={primaryBtn(!overLimit && !working)}>
          {working ? "Publishing…" : "Publish"}
        </button>
      </div>
      {error && <p style={{ marginTop: 10, fontSize: 12.5, color: "#C0392B" }}>{error}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "1px solid #E0D6C4",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  color: "#3C3220",
  outline: "none",
};

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    padding: "9px 18px",
    borderRadius: 999,
    border: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    background: enabled ? ACCENT : "#E0D6C4",
    color: enabled ? "#fff" : MUTED,
  };
}

const ghostBtn: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: "inherit",
  padding: "8px 14px",
  borderRadius: 999,
  border: "1px solid #E0D6C4",
  background: "transparent",
  color: MUTED,
  cursor: "pointer",
};
