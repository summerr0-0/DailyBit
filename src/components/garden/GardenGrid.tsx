import type { GardenData, GardenLevel } from "@/lib/garden";

const LEVEL_CLASS: Record<GardenLevel, string> = {
  0: "bg-muted",
  1: "bg-green-200",
  2: "bg-green-400",
  3: "bg-green-600",
  4: "bg-green-800",
};

/**
 * GitHub 잔디 스타일 그리드. 주(열)×요일(행), 칸은 강도 레벨 색.
 * 미래 칸은 비우고, 오늘 칸은 ring으로 표시한다. 상호작용 없으므로 RSC.
 */
export function GardenGrid({ data }: { data: GardenData }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1" data-testid="garden-grid">
        {data.weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count}개`}
                aria-label={`${day.date} ${day.count}개`}
                className={`h-3 w-3 rounded-sm ${
                  day.inRange ? LEVEL_CLASS[day.level] : "bg-transparent"
                } ${day.isToday ? "ring-1 ring-foreground" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
