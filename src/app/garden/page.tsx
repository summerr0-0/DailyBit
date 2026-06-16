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
          &larr; Home
        </Link>
        <h1 className="font-bold text-lg mt-1">Garden</h1>
      </header>
      <div className="p-4">
        <p className="text-sm">
          Today <span className="font-bold text-green-600">{data.todayCount} pts</span>
        </p>
        <p className="text-xs text-muted-foreground mb-1">
          Last year total: {data.total} pts
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Thread bit 2pt · Standalone note 1pt
        </p>
        <GardenGrid data={data} />
      </div>
    </main>
  );
}
