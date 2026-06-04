import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BitCard } from "./BitCard";
import type { BitWithAuthor } from "@/lib/bits";

const mockBit: BitWithAuthor = {
  id: "test-1",
  content: "테스트 Bit 내용입니다.",
  tags: ["test", "dailybit"],
  createdAtLabel: "방금 전",
  author: {
    id: "user-1",
    nickname: "testuser",
    image: null,
  },
};

describe("BitCard", () => {
  it("내용을 렌더링한다", () => {
    render(<BitCard bit={mockBit} />);
    expect(screen.getByText("테스트 Bit 내용입니다.")).toBeInTheDocument();
  });

  it("작성자 닉네임을 보여준다", () => {
    render(<BitCard bit={mockBit} />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("태그를 # 접두사와 함께 보여준다", () => {
    render(<BitCard bit={mockBit} />);
    expect(screen.getByText("#test")).toBeInTheDocument();
    expect(screen.getByText("#dailybit")).toBeInTheDocument();
  });

  it("상대 시간 레이블을 보여준다", () => {
    render(<BitCard bit={mockBit} />);
    expect(screen.getByText("방금 전")).toBeInTheDocument();
  });
});
