import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { BitActionsMenu } from "./BitActionsMenu";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("BitActionsMenu", () => {
  it("⋯ 트리거를 렌더하고 메뉴는 기본 닫혀 있다", () => {
    render(<BitActionsMenu bitId="bit-1" />);
    expect(screen.getByRole("button", { name: "Bit menu" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("트리거 클릭 시 삭제 항목이 열린다", async () => {
    const user = userEvent.setup();
    render(<BitActionsMenu bitId="bit-1" />);
    await user.click(screen.getByRole("button", { name: "Bit menu" }));
    expect(
      await screen.findByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();
  });

  it("confirm 수락 시 DELETE 요청 후 새로고침한다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<BitActionsMenu bitId="bit-1" />);
    await user.click(screen.getByRole("button", { name: "Bit menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/bits/bit-1", {
        method: "DELETE",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("confirm 취소 시 요청하지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<BitActionsMenu bitId="bit-1" />);
    await user.click(screen.getByRole("button", { name: "Bit menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Escape로 메뉴가 닫힌다", async () => {
    const user = userEvent.setup();
    render(<BitActionsMenu bitId="bit-1" />);
    await user.click(screen.getByRole("button", { name: "Bit menu" }));
    expect(
      await screen.findByRole("menuitem", { name: "Delete" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument(),
    );
  });

  it("삭제 실패 시 새로고침하지 않는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<BitActionsMenu bitId="bit-1" />);
    await user.click(screen.getByRole("button", { name: "Bit menu" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
});
