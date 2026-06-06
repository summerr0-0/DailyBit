"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";

type Props = { bitId: string };

export function BitActionsMenu({ bitId }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("이 Bit를 삭제할까요?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/bits/${bitId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.refresh();
    } catch {
      setDeleting(false);
      window.alert("삭제에 실패했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Bit 메뉴"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-20">
          <Menu.Popup className="min-w-28 overflow-hidden rounded-md border border-border bg-background py-1 shadow-md outline-none">
            <Menu.Item
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer select-none px-3 py-2 text-sm text-destructive outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
            >
              삭제
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
