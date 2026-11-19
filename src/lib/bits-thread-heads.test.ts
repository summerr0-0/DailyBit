import { describe, expect, it } from "vitest";
import { keepThreadHeads } from "./bits";

const at = (m: number) => new Date(Date.UTC(2026, 10, 20, 0, m));

describe("keepThreadHeads (home feed shows only a thread's first bit)", () => {
  it("keeps standalone bits and only the earliest visible bit of each thread", () => {
    const rows = [
      { id: "t1-3", createdAt: at(3), thread: { id: "t1" } },
      { id: "solo", createdAt: at(2), thread: null },
      { id: "t1-1", createdAt: at(1), thread: { id: "t1" } },
      { id: "t2-2", createdAt: at(5), thread: { id: "t2" } },
      { id: "t1-2", createdAt: at(2), thread: { id: "t1" } },
    ];
    expect(keepThreadHeads(rows).map((r) => r.id)).toEqual(["solo", "t1-1", "t2-2"]);
  });
});
