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
  it("카운트를 함께 표시한다", () => {
    render(<RebitButton bitId="b1" count={3} active={false} />);
    expect(screen.getByRole("button")).toHaveTextContent("Rebit 3");
  });

  it("카운트가 0이면 숫자를 표시하지 않는다", () => {
    render(<RebitButton bitId="b1" count={0} active={false} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Rebit");
    expect(button).not.toHaveTextContent("0");
  });

  it("active면 aria-pressed가 true다", () => {
    render(<RebitButton bitId="b1" count={1} active={true} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("미Rebit 상태에서 클릭하면 POST를 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<RebitButton bitId="b1" count={0} active={false} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rebits",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("Rebit 상태에서 클릭하면 DELETE를 보낸다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<RebitButton bitId="b1" count={1} active={true} />);

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rebits",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
