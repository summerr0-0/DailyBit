import { Suspense } from "react";
import Link from "next/link";
import { BitList } from "@/components/bits/BitList";
import { BitComposer } from "@/components/bits/BitComposer";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-border">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="font-bold text-lg">DailyBit</h1>
        <Link href="/garden" className="text-xs text-muted-foreground hover:underline">
          Garden
        </Link>
      </header>
      <BitComposer />
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}>
        <BitList />
      </Suspense>
    </main>
  );
}
