"use client";

import { useState } from "react";
import Link from "next/link";
import type { GardenData, GardenLevel } from "@/lib/garden";
import type { BitWithAuthor } from "@/lib/bits";

const LEVEL_CLASS: Record<GardenLevel, string> = {
  0: "bg-muted",
  1: "bg-green-200",
  2: "bg-green-400",
  3: "bg-green-600",
  4: "bg-green-800",
};

function DayPanel({ date, bits, loading }: { date: string; bits: BitWithAuthor[]; loading: boolean }) {
  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-medium">{date}</span>
        <span className="text-xs text-muted-foreground ml-2">
          {loading ? "Loading..." : `${bits.length} entries`}
        </span>
      </div>
      {!loading && bits.length === 0 && (
        <p className="text-xs text-muted-foreground px-3 py-4 text-center">
          No entries for this day.
        </p>
      )}
      <ol className="divide-y divide-border">
        {bits.map((bit) => (
          <li key={bit.id} className="px-3 py-2">
            {bit.thread && (
              <Link
                href={`/threads/${bit.thread.id}`}
                className="text-xs text-blue-500 hover:underline block mb-0.5"
              >
                {bit.thread.title}
              </Link>
            )}
            <p className="text-xs text-muted-foreground mb-0.5">{bit.createdAtLabel}</p>
            <p className="text-xs leading-relaxed line-clamp-2">{bit.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GardenGrid({ data }: { data: GardenData }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayBits, setDayBits] = useState<BitWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);

  function handleDayClick(date: string, inRange: boolean) {
    if (!inRange) return;
    if (selectedDate === date) {
      setSelectedDate(null);
      setDayBits([]);
      return;
    }

    setSelectedDate(date);
    setLoading(true);
    setDayBits([]);

    fetch(`/api/bits/by-date?date=${date}`)
      .then((r) => r.json())
      .then((bits: BitWithAuthor[]) => {
        setDayBits(bits);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex gap-1" data-testid="garden-grid">
          {data.weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day) => (
                <button
                  key={day.date}
                  onClick={() => handleDayClick(day.date, day.inRange)}
                  title={`${day.date}: ${day.count} pts`}
                  aria-label={`${day.date} ${day.count} pts`}
                  disabled={!day.inRange}
                  className={`h-3 w-3 rounded-sm transition-transform ${
                    day.inRange ? LEVEL_CLASS[day.level] : "bg-transparent"
                  } ${day.isToday ? "ring-1 ring-foreground" : ""} ${
                    selectedDate === day.date ? "ring-2 ring-foreground scale-125" : ""
                  } ${day.inRange ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {selectedDate && (
        <DayPanel date={selectedDate} bits={dayBits} loading={loading} />
      )}
    </div>
  );
}
