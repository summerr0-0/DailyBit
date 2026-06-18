import { getGarden } from "@/lib/garden";
import { GardenGrid } from "@/components/garden/GardenGrid";
import { SiteShell } from "@/components/layout/SiteShell";

export const dynamic = "force-dynamic";

export default async function GardenPage() {
  const data = await getGarden();

  return (
    <SiteShell>
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3">
        <h1 className="font-bold text-lg">Garden</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Thread bit 2pt · Standalone note 1pt
        </p>
      </header>
      <div className="p-4">
        <div className="flex gap-8 mb-4">
          <div>
            <p className="text-2xl font-bold text-green-600">{data.todayCount}</p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{data.total}</p>
            <p className="text-xs text-muted-foreground">This year</p>
          </div>
        </div>
        <GardenGrid data={data} />
      </div>
    </SiteShell>
  );
}
