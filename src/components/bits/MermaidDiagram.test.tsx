import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// jsdom에서는 mermaid가 레이아웃을 못 하므로 모듈을 흉내 낸다 — 성공 SVG 삽입과 실패 시 원문 표시 분기만 확인.
const renderMock = vi.fn();
vi.mock("mermaid", () => ({ default: { initialize: vi.fn(), render: (...a: unknown[]) => renderMock(...a) } }));

describe("MermaidDiagram", () => {
  it("injects the rendered SVG", async () => {
    renderMock.mockResolvedValueOnce({ svg: '<svg data-x="ok"><text>RSS</text></svg>' });
    const { MermaidDiagram } = await import("./MermaidDiagram");
    render(<MermaidDiagram code="flowchart LR\n A-->B" />);
    await waitFor(() => expect(screen.getByTestId("mermaid-diagram").querySelector("svg[data-x='ok']")).not.toBeNull());
  });

  it("shows the source with a note when rendering fails", async () => {
    renderMock.mockRejectedValueOnce(new Error("Parse error"));
    const { MermaidDiagram } = await import("./MermaidDiagram");
    render(<MermaidDiagram code="not a diagram ((" />);
    await waitFor(() => expect(screen.getByText("Diagram could not be drawn — showing the source.")).toBeTruthy());
    expect(screen.getByText("not a diagram ((")).toBeTruthy();
  });
});
