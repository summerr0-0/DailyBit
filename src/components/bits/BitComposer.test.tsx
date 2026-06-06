import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BitComposer } from "./BitComposer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("BitComposer", () => {
  it("textarea와 제출 버튼을 렌더링한다", () => {
    render(<BitComposer />);
    expect(screen.getByLabelText("Bit 내용")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bit 올리기/ })).toBeInTheDocument();
  });

  it("내용이 비어있으면 제출 버튼이 비활성화된다", () => {
    render(<BitComposer />);
    expect(screen.getByRole("button", { name: /Bit 올리기/ })).toBeDisabled();
  });

  it("공백만 입력하면 제출 버튼이 비활성화된다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: /Bit 올리기/ })).toBeDisabled();
  });

  it("내용을 입력하면 제출 버튼이 활성화된다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "안녕하세요 #dailybit" },
    });
    expect(screen.getByRole("button", { name: /Bit 올리기/ })).toBeEnabled();
  });

  it("글자 수 카운터를 보여준다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "hello" },
    });
    expect(screen.getByText("5/500")).toBeInTheDocument();
  });

  it("Cmd+Enter로 제출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<BitComposer />);
    const textarea = screen.getByLabelText("Bit 내용");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bits",
      expect.objectContaining({ method: "POST" }),
    );
    vi.unstubAllGlobals();
  });

  it("Ctrl+Enter로 제출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<BitComposer />);
    const textarea = screen.getByLabelText("Bit 내용");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    vi.unstubAllGlobals();
  });

  it("일반 Enter는 제출하지 않는다 (줄바꿈 유지)", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<BitComposer />);
    const textarea = screen.getByLabelText("Bit 내용");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("입력 중 #태그를 소문자·중복제거하여 미리보기로 보여준다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "공부 중 #React #react #DevLog" },
    });
    const preview = screen.getByLabelText("태그 미리보기");
    expect(within(preview).getAllByText("#react")).toHaveLength(1);
    expect(within(preview).getByText("#devlog")).toBeInTheDocument();
  });

  it("태그가 없으면 미리보기를 렌더링하지 않는다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "태그 없는 본문" },
    });
    expect(screen.queryByLabelText("태그 미리보기")).not.toBeInTheDocument();
  });

  it("한계 임박(450자 이상)이면 카운터에 경고색을 적용한다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "a".repeat(460) },
    });
    expect(screen.getByText("460/500").className).toContain("text-amber-500");
  });

  it("500자 초과면 위험색을 적용하고 제출을 막는다", () => {
    render(<BitComposer />);
    fireEvent.change(screen.getByLabelText("Bit 내용"), {
      target: { value: "a".repeat(501) },
    });
    expect(screen.getByText("501/500").className).toContain("text-destructive");
    expect(screen.getByRole("button", { name: /Bit 올리기/ })).toBeDisabled();
  });
});
