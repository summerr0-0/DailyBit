import Link from "next/link";
import { getGarden } from "@/lib/garden";
import { GardenGrid } from "@/components/garden/GardenGrid";

export const dynamic = "force-dynamic";

export default async function GardenPage() {
  const data = await getGarden();

  return (
    <main className="max-w-xl mx-auto min-h-screen border-x border-border">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <Link href="/" className="text-xs text-muted-foreground hover:underline">
          ← 홈
        </Link>
        <h1 className="font-bold text-lg mt-1">Garden</h1>
      </header>
      <div className="p-4">
        <p className="text-sm">
          오늘 <span className="font-bold text-green-600">{data.todayCount}점</span>
        </p>
        <p className="text-xs text-muted-foreground mb-1">
          지난 1년 탐구 점수 {data.total}점
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          탐구 줄기 기록 2pt · 독립 메모 1pt
        </p>
        <GardenGrid data={data} />
      </div>
    </main>
  );
}
