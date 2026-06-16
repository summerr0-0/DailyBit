import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GardenGrid } from "./GardenGrid";
import { buildGardenGrid } from "@/lib/garden";

describe("GardenGrid", () => {
  it("53주 열을 렌더한다", () => {
    const data = buildGardenGrid(new Map(), "2026-06-06");
    const { container } = render(<GardenGrid data={data} />);
    const grid = container.querySelector('[data-testid="garden-grid"]');
    expect(grid?.children).toHaveLength(53);
  });

  it("오늘 칸에만 ring 표식을 준다", () => {
    const data = buildGardenGrid(new Map(), "2026-06-06");
    const { container } = render(<GardenGrid data={data} />);
    expect(container.querySelectorAll(".ring-1")).toHaveLength(1);
  });

  it("활동 수에 맞는 강도 색 클래스를 준다", () => {
    // 2026-06-06에 3건 → L2 → bg-green-400
    const data = buildGardenGrid(new Map([["2026-06-06", 3]]), "2026-06-06");
    const { container } = render(<GardenGrid data={data} />);
    expect(container.querySelector(".bg-green-400")).toBeTruthy();
  });

  it("빈 잔디도 에러 없이 렌더한다", () => {
    const data = buildGardenGrid(new Map(), "2026-06-06");
    const { container } = render(<GardenGrid data={data} />);
    expect(
      container.querySelector('[data-testid="garden-grid"]'),
    ).toBeTruthy();
  });
});
