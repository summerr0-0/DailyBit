import { render, screen, fireEvent } from "@testing-library/react";
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
});
