import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BitCard } from "./BitCard";
import type { BitWithAuthor } from "@/lib/bits";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const base: BitWithAuthor = {
  id: "test-1",
  content: "테스트 Bit 내용입니다.",
  tags: [],
  aiCollab: "NONE",
  thread: null,
  createdAtLabel: "방금 전",
  author: { id: "user-1", nickname: "testuser", image: null },
};

function bitWith(content: string, tags: string[] = []): BitWithAuthor {
  return { ...base, content, tags };
}

describe("BitCard", () => {
  it("태그 없는 본문을 그대로 렌더하고 링크를 만들지 않는다", () => {
    render(<BitCard bit={base} />);
    expect(screen.getByText("테스트 Bit 내용입니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("작성자 닉네임을 보여준다", () => {
    render(<BitCard bit={base} />);
    expect(screen.getByText("testuser")).toBeInTheDocument();
  });

  it("상대 시간 레이블을 보여준다", () => {
    render(<BitCard bit={base} />);
    expect(screen.getByText("방금 전")).toBeInTheDocument();
  });

  it("본문 속 #태그를 /tags 링크로 렌더한다", () => {
    render(<BitCard bit={bitWith("오늘 #개발 했다", ["개발"])} />);
    expect(screen.getByRole("link", { name: "#개발" })).toHaveAttribute(
      "href",
      "/tags/개발",
    );
  });

  it("공백 없이 붙은 #태그도 분리해 링크화한다", () => {
    const { container } = render(<BitCard bit={bitWith("나의#일상", ["일상"])} />);
    expect(screen.getByRole("link", { name: "#일상" })).toHaveAttribute(
      "href",
      "/tags/일상",
    );
    // "나의"는 링크 밖 일반 텍스트로 유지되고, 본문 전체는 원문 그대로다.
    expect(container.querySelector("p")?.textContent).toBe("나의#일상");
  });

  it("같은 태그가 여러 번 등장하면 각각 링크화한다", () => {
    render(<BitCard bit={bitWith("#a 그리고 #a", ["a"])} />);
    expect(screen.getAllByRole("link", { name: "#a" })).toHaveLength(2);
  });

  it("표시는 원문 케이스, href는 소문자다", () => {
    render(<BitCard bit={bitWith("#React 좋아", ["react"])} />);
    expect(screen.getByRole("link", { name: "#React" })).toHaveAttribute(
      "href",
      "/tags/react",
    );
  });

  it("하단 태그 칩을 렌더하지 않는다", () => {
    // 본문엔 태그가 없고 tags 배열만 채워진 경우, 하단 칩 링크가 없어야 한다.
    render(<BitCard bit={bitWith("그냥 글", ["일상", "개발"])} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("rebit props가 있으면 Rebit 버튼을 보여준다", () => {
    render(<BitCard bit={base} rebit={{ count: 2, byMe: false }} />);
    expect(screen.getByRole("button", { name: /Rebit/ })).toBeInTheDocument();
  });

  it("rebit props가 없으면 Rebit 버튼이 없다", () => {
    render(<BitCard bit={base} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
