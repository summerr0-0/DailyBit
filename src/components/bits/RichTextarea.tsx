"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { insertWikiLink, toggleBold, toggleHeading, toggleStrike, wikiQueryAt, type Edit } from "./text-format";

// Bit 입력창 공용 컴포넌트 (spec: wiki-links D3, D6 + 2026-11-20 굵게 요청).
// 서식 버튼 B · H1 · H2 · H3, 단축키 ⌘/Ctrl+B, `[[` 입력 시 Thread·개념 제목 자동완성.

type Suggestion = { title: string; kind: "thread" | "concept" };

// 1분 캐시, 실패는 캐시하지 않는다 — 새 Thread·개념이 곧 자동완성에 반영되게 (Gemini wiki #8)
let suggestionCache: { at: number; data: Suggestion[] } | null = null;
async function loadSuggestions(): Promise<Suggestion[]> {
  if (suggestionCache && Date.now() - suggestionCache.at < 60_000) return suggestionCache.data;
  try {
    const r = await fetch("/api/link-targets");
    if (!r.ok) return [];
    const data = (await r.json()) as Suggestion[];
    suggestionCache = { at: Date.now(), data };
    return data;
  } catch {
    return [];
  }
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** 서식·자동완성이 처리하지 않은 키 (예: ⌘↵ 제출, Escape 닫기) */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function RichTextarea({ value, onChange, onKeyDown, rows = 6, placeholder, ariaLabel, autoFocus, className, style }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const wantsSuggestions = query !== null;
  useEffect(() => {
    if (wantsSuggestions) void loadSuggestions().then(setSuggestions);
  }, [wantsSuggestions]);

  const matches = query
    ? suggestions.filter((s) => s.title.toLowerCase().includes(query.query.toLowerCase())).slice(0, 8)
    : [];

  function apply(edit: Edit) {
    onChange(edit.value);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }

  function refreshQuery(next: string, cursor: number) {
    const q = wikiQueryAt(next, cursor);
    setQuery(q);
    setActive(0);
  }

  function pick(title: string) {
    const el = ref.current;
    if (!el || !query) return;
    apply(insertWikiLink(value, el.selectionStart, query.start, title));
    setQuery(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (matches.length > 0) {
      if (e.key === "ArrowDown") return (e.preventDefault(), setActive((a) => (a + 1) % matches.length));
      if (e.key === "ArrowUp") return (e.preventDefault(), setActive((a) => (a - 1 + matches.length) % matches.length));
      if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
        e.preventDefault();
        return pick(matches[active].title);
      }
      if (e.key === "Escape") return (e.preventDefault(), setQuery(null));
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      const el = ref.current;
      return apply(toggleStrike(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length));
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      const el = ref.current;
      return apply(toggleBold(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length));
    }
    onKeyDown?.(e);
  }

  const strike = () => {
    const el = ref.current;
    apply(toggleStrike(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length));
  };
  const heading = (level: 1 | 2 | 3) => apply(toggleHeading(value, ref.current?.selectionStart ?? value.length, level));
  const bold = () => {
    const el = ref.current;
    apply(toggleBold(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length));
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }} role="toolbar" aria-label="Formatting">
        <ToolButton label="Bold" title="Bold (⌘/Ctrl+B) — **text**" onClick={bold} weight={800}>
          B
        </ToolButton>
        <ToolButton label="Strikethrough" title="Strikethrough (⌘/Ctrl+Shift+X) — ~~text~~" onClick={strike} strike>
          S
        </ToolButton>
        <ToolButton label="Heading 1" title="Heading 1 — # at line start" onClick={() => heading(1)}>
          H1
        </ToolButton>
        <ToolButton label="Heading 2" title="Heading 2 — ## at line start" onClick={() => heading(2)}>
          H2
        </ToolButton>
        <ToolButton label="Heading 3" title="Heading 3 — ### at line start" onClick={() => heading(3)}>
          H3
        </ToolButton>
        <span style={{ fontSize: 11.5, color: "#B4AB97", alignSelf: "center", marginLeft: 6 }}>Type [[ to link a thread</span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refreshQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => refreshQuery(value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={className}
        style={style}
      />
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Link suggestions"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            zIndex: 20,
            margin: "4px 0 0",
            padding: 4,
            listStyle: "none",
            background: "#FFFDF8",
            border: "1px solid #E0D6C4",
            borderRadius: 10,
            boxShadow: "0 6px 20px rgba(42,38,32,0.12)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {matches.map((m, i) => (
            <li
              key={`${m.kind}:${m.title}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m.title);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13.5,
                background: i === active ? "#FBEBDD" : "transparent",
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span>{m.title}</span>
              <span style={{ fontSize: 11, color: "#B4AB97" }}>{m.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolButton({
  label,
  title,
  onClick,
  weight = 700,
  strike = false,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  weight?: number;
  strike?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        fontSize: 12.5,
        fontWeight: weight,
        minWidth: 30,
        height: 26,
        padding: "0 6px",
        borderRadius: 8,
        border: "1px solid #E0D6C4",
        background: "transparent",
        color: "#3C3220",
        cursor: "pointer",
        fontFamily: "inherit",
        textDecoration: strike ? "line-through" : "none",
      }}
    >
      {children}
    </button>
  );
}
