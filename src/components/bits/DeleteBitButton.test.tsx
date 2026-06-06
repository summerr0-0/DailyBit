import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DeleteBitButton } from "./DeleteBitButton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("DeleteBitButton", () => {
  it("삭제 버튼을 렌더링한다", () => {
    render(<DeleteBitButton bitId="bit-1" />);
    expect(screen.getByRole("button", { name: "Bit 삭제" })).toBeInTheDocument();
  });

  it("확인 후 DELETE 요청을 보내고 목록을 새로고침한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<DeleteBitButton bitId="bit-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Bit 삭제" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bits/bit-1", {
        method: "DELETE",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("확인을 취소하면 요청을 보내지 않는다", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DeleteBitButton bitId="bit-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Bit 삭제" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("요청이 실패하면 새로고침하지 않고 버튼을 다시 활성화한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<DeleteBitButton bitId="bit-1" />);
    const btn = screen.getByRole("button", { name: "Bit 삭제" });
    fireEvent.click(btn);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(btn).toBeEnabled();
  });
});
