"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { bitId: string };

export function DeleteBitButton({ bitId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("이 Bit를 삭제할까요?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/bits/${bitId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      // 성공 시 목록을 다시 불러오면 이 행이 사라지며 버튼도 함께 언마운트된다.
      router.refresh();
    } catch {
      setDeleting(false);
      window.alert("삭제에 실패했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      aria-label="Bit 삭제"
      className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      {deleting ? "삭제 중..." : "삭제"}
    </button>
  );
}
