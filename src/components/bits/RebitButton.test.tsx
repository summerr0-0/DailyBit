import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { RebitButton } from "./RebitButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RebitButton", () => {
  it("비로그인 + count 0이면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<RebitButton bitId="b1" rebitCount={0} isLoggedIn={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("비로그인 + count > 0이면 카운트만 표시한다 (버튼 없음)", () => {
    render(<RebitButton bitId="b1" rebitCount={3} isLoggedIn={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("로그인 상태에서 count 0이면 'Rebit' 텍스트를 표시한다", () => {
    render(<RebitButton bitId="b1" rebitCount={0} isLoggedIn={true} />);
    expect(screen.getByRole("button")).toHaveTextContent("Rebit");
  });

  it("로그인 상태에서 count > 0이면 숫자를 표시한다", () => {
    render(<RebitButton bitId="b1" rebitCount={2} isLoggedIn={true} />);
    expect(screen.getByRole("button")).toHaveTextContent("2");
  });

  it("클릭하면 모달이 열리고 확인하면 POST /api/bits/:id/rebit을 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<RebitButton bitId="b1" rebitCount={0} isLoggedIn={true} />);

    // First click opens the modal
    fireEvent.click(screen.getByRole("button", { name: "Rebit" }));

    // Modal is now open — click the confirm Rebit button (last one with name "Rebit")
    const rebitButtons = screen.getAllByRole("button", { name: /^Rebit$/ });
    fireEvent.click(rebitButtons[rebitButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bits/b1/rebit",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
