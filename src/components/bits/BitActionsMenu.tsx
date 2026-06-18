"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";

type Props = { bitId: string; pinned?: boolean; isPrivate?: boolean };

export function BitActionsMenu({ bitId, pinned = false, isPrivate = false }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [privating, setPrivating] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Delete this Bit?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/bits/${bitId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      router.refresh();
    } catch {
      setDeleting(false);
      window.alert("Failed to delete. Please try again.");
    }
  }

  async function handlePin() {
    if (pinning) return;
    setPinning(true);
    try {
      const res = await fetch(`/api/bits/${bitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pin" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setPinning(false);
    }
  }

  async function handlePrivate() {
    if (privating) return;
    setPrivating(true);
    try {
      const res = await fetch(`/api/bits/${bitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "private" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setPrivating(false);
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Bit menu"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-20">
          <Menu.Popup className="min-w-32 overflow-hidden rounded-md border border-border bg-background py-1 shadow-md outline-none">
            <Menu.Item
              onClick={handlePrivate}
              disabled={privating}
              className="cursor-pointer select-none px-3 py-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
            >
              {isPrivate ? "Make public" : "Make private"}
            </Menu.Item>
            <Menu.Item
              onClick={handlePin}
              disabled={pinning}
              className="cursor-pointer select-none px-3 py-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
            >
              {pinned ? "Unpin" : "Pin"}
            </Menu.Item>
            <Menu.Item
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer select-none px-3 py-2 text-sm text-destructive outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
            >
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
