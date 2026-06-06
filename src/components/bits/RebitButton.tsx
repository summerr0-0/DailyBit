"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  bitId: string;
  count: number;
  active: boolean;
};

/**
 * Rebit 토글 버튼. active면 DELETE(취소), 아니면 POST(생성) 후 피드를 refresh한다.
 */
export function RebitButton({ bitId, count, active }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const disabled = busy || isPending;

  async function toggle() {
    if (disabled) return;
    setBusy(true);
    try {
      const res = await fetch("/api/rebits", {
        method: active ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitId }),
      });
      if (res.ok) {
        startTransition(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={active}
      className={`mt-2 text-xs hover:underline disabled:opacity-50 ${
        active ? "font-semibold text-green-600" : "text-muted-foreground"
      }`}
    >
      Rebit{count > 0 ? ` ${count}` : ""}
    </button>
  );
}
