import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteBit = vi.fn();
vi.mock("@/lib/bits", () => ({
  deleteBit: (...args: unknown[]) => deleteBit(...args),
}));

import { DELETE } from "./route";

beforeEach(() => {
  deleteBit.mockReset();
});

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/bits/[id]", () => {
  it("삭제 성공 시 204를 반환한다", async () => {
    deleteBit.mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx("bit-1"));
    expect(res.status).toBe(204);
    expect(deleteBit).toHaveBeenCalledWith("bit-1");
  });

  it("대상이 없으면 404를 반환한다", async () => {
    deleteBit.mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("내부 오류 시 500을 반환한다", async () => {
    deleteBit.mockRejectedValue(new Error("db down"));
    const res = await DELETE(new Request("http://test"), ctx("bit-1"));
    expect(res.status).toBe(500);
  });
});
