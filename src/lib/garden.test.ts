import { describe, it, expect } from "vitest";
import { toKstDateKey, activityLevel, buildGardenGrid } from "./garden";

describe("toKstDateKey", () => {
  it("UTC를 KST(+9) 날짜로 변환한다", () => {
    // 2026-06-06T15:30Z = KST 2026-06-07 00:30 → 다음 날
    expect(toKstDateKey(new Date("2026-06-06T15:30:00Z"))).toBe("2026-06-07");
  });

  it("KST 자정 직전은 같은 날로 유지된다", () => {
    // 2026-06-06T14:59Z = KST 2026-06-06 23:59
    expect(toKstDateKey(new Date("2026-06-06T14:59:00Z"))).toBe("2026-06-06");
  });
});

describe("activityLevel", () => {
  it("고정 임계 0 / 1-2 / 3-4 / 5-6 / 7+ 로 매핑한다", () => {
    expect(activityLevel(0)).toBe(0);
    expect(activityLevel(1)).toBe(1);
    expect(activityLevel(2)).toBe(1);
    expect(activityLevel(3)).toBe(2);
    expect(activityLevel(4)).toBe(2);
    expect(activityLevel(5)).toBe(3);
    expect(activityLevel(6)).toBe(3);
    expect(activityLevel(7)).toBe(4);
    expect(activityLevel(99)).toBe(4);
  });
});

describe("buildGardenGrid", () => {
  it("53주 × 7일 그리드를 만든다", () => {
    const grid = buildGardenGrid(new Map(), "2026-06-06");
    expect(grid.weeks).toHaveLength(53);
    expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("마지막 주에 오늘이 포함된다", () => {
    const grid = buildGardenGrid(new Map(), "2026-06-06");
    const lastWeek = grid.weeks[grid.weeks.length - 1];
    expect(lastWeek.some((d) => d.isToday)).toBe(true);
  });

  it("오늘 카운트와 강도를 채운다", () => {
    const grid = buildGardenGrid(new Map([["2026-06-06", 3]]), "2026-06-06");
    expect(grid.todayCount).toBe(3);
    const today = grid.weeks.flat().find((d) => d.isToday);
    expect(today?.count).toBe(3);
    expect(today?.level).toBe(2); // 3 → L2
  });

  it("범위 내 총 활동 수를 합산한다", () => {
    const grid = buildGardenGrid(
      new Map([
        ["2026-06-06", 3],
        ["2026-06-05", 1],
      ]),
      "2026-06-06",
    );
    expect(grid.total).toBe(4);
  });

  it("활동 없는 날은 level 0이다", () => {
    const grid = buildGardenGrid(new Map(), "2026-06-06");
    const inRange = grid.weeks.flat().filter((d) => d.inRange);
    expect(inRange.every((d) => d.level === 0)).toBe(true);
  });

  it("오늘 이후 칸은 inRange=false다", () => {
    const grid = buildGardenGrid(new Map(), "2026-06-06");
    const future = grid.weeks.flat().filter((d) => d.date > "2026-06-06");
    expect(future.every((d) => d.inRange === false)).toBe(true);
  });
});
