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
          오늘 <span className="font-bold text-green-600">{data.todayCount}개</span>
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          지난 1년 활동 {data.total}개
        </p>
        <GardenGrid data={data} />
      </div>
    </main>
  );
}
