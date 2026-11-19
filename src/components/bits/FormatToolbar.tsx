"use client";

import type { RefObject } from "react";
import { toggleBold } from "./text-format";

// 입력창 위 서식 버튼 — 지금은 굵게(B)만. Cmd/Ctrl+B 단축키는 onBoldShortcut으로 textarea에 연결한다.
export function FormatToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
      <button
        type="button"
        aria-label="Bold"
        title="Bold (⌘/Ctrl+B) — wraps the selection in **…**"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyBold(textareaRef, value, onChange)}
        style={{
          fontSize: 13,
          fontWeight: 800,
          width: 28,
          height: 26,
          borderRadius: 8,
          border: "1px solid #E0D6C4",
          background: "transparent",
          color: "#3C3220",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        B
      </button>
    </div>
  );
}

export function applyBold(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
) {
  const el = textareaRef.current;
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const edit = toggleBold(value, start, end);
  onChange(edit.value);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  });
}

/** textarea onKeyDown에서 호출: Cmd/Ctrl+B면 굵게 적용하고 true. */
export function handleBoldShortcut(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void },
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
): boolean {
  if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B")) {
    e.preventDefault();
    applyBold(textareaRef, value, onChange);
    return true;
  }
  return false;
}
