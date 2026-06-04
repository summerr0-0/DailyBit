import { Suspense } from "react";

export const dynamic = "force-dynamic";
import { BitList } from "@/components/bits/BitList";

export default function HomePage() {
  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-border">
      <header className="sticky top-0 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="font-bold text-lg">DailyBit</h1>
      </header>
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}>
        <BitList />
      </Suspense>
    </main>
  );
}
