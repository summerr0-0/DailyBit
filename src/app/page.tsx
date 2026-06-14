import { Suspense } from "react";
import Link from "next/link";
import { BitList } from "@/components/bits/BitList";
import { BitComposer } from "@/components/bits/BitComposer";
import { TagFilterSection } from "@/components/bits/TagFilterSection";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tags?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const { tags } = await searchParams;
  const selectedTags = tags ? tags.split(",").filter(Boolean) : [];

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-border">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="font-bold text-lg">DailyBit</h1>
        <Link href="/garden" className="text-xs text-muted-foreground hover:underline">
          Garden
        </Link>
      </header>
      <BitComposer />
      <Suspense fallback={<div className="px-4 py-3 text-xs text-muted-foreground">태그 로딩...</div>}>
        <TagFilterSection selectedTags={selectedTags} />
      </Suspense>
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">로딩 중...</div>}>
        <BitList filterTags={selectedTags} />
      </Suspense>
    </main>
  );
}
