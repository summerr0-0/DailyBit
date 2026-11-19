"use client";

import { useState } from "react";
import { RichTextarea } from "@/components/bits/RichTextarea";
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

export function DraftCard({
  draft,
  onDone,
  extra,
}: {
  draft: ScrapDraftDTO;
  onDone: () => void;
  /** 카드 상단 추가 정보 (News inbox: 소스·만료·경고). */
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [segments, setSegments] = useState<string[]>(draft.segments);
  const [title, setTitle] = useState(draft.suggestedThreadTitle ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // v2 사건·개념 초안은 서버가 항상 Thread로 발행한다 — 제목 입력도 항상 보여준다 (Gemini diff #7)
  const alwaysThread = draft.kind === "CONCEPT" || (draft.kind === "NEWS" && draft.eventKey !== null);
  const isThread = alwaysThread || segments.length >= 2;
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
        body: JSON.stringify({ segments, threadTitle: isThread ? title : null, expectedUpdatedAt: draft.updatedAt }),
      });
      if (res.status === 409) {
        // 화면을 보는 사이 cron이 출처를 추가했다 (v2 R7.1) — 덮어쓰지 않고 다시 불러오게 한다
        setStale(true);
        setWorking(false);
        return;
      }
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
    <div data-testid="draft-card" style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 18, padding: "18px 20px" }}>
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

      {extra}

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
              <SegmentEditor value={seg} onChange={(v) => updateSegment(i, v)} />
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
      {stale && (
        <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: "#9C4A1A" }}>
          A new source was added to this draft. Reload to see it before publishing.{" "}
          <button type="button" onClick={() => window.location.reload()} style={{ ...ghostBtn, padding: "2px 10px", fontSize: 12 }}>
            Reload
          </button>
        </p>
      )}
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

/** 초안 세그먼트 입력 — 굵게(B, ⌘/Ctrl+B) + 넓은 입력창 (사용자 요청 2026-11-20) */
function SegmentEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <RichTextarea value={value} onChange={onChange} rows={7} style={{ ...inputStyle, resize: "vertical", minHeight: 150 }} />
  );
}
