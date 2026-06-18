import Link from "next/link";
import { getGarden } from "@/lib/garden";
import type { GardenLevel } from "@/lib/garden";

const LEVEL_CLASS: Record<GardenLevel, string> = {
  0: "bg-muted-foreground/20",
  1: "bg-green-200",
  2: "bg-green-400",
  3: "bg-green-600",
  4: "bg-green-800",
};

export async function GardenMini() {
  const data = await getGarden();
  const recentWeeks = data.weeks.slice(-13);

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Activity</h3>
        <Link href="/garden" className="text-xs text-blue-500 hover:underline">
          See all
        </Link>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-xl font-bold text-green-600">{data.todayCount}</p>
          <p className="text-xs text-muted-foreground">Today</p>
        </div>
        <div>
          <p className="text-xl font-bold">{data.total}</p>
          <p className="text-xs text-muted-foreground">This year</p>
        </div>
      </div>
      <div className="flex gap-0.5">
        {recentWeeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} pts`}
                className={`w-2.5 h-2.5 rounded-sm ${
                  day.inRange ? LEVEL_CLASS[day.level] : "bg-transparent"
                } ${day.isToday ? "ring-1 ring-foreground/60" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
