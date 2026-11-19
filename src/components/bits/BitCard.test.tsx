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
  pinned: false,
  private: false,
  thread: null,
  createdAtLabel: "방금 전",
  likeCount: 0,
  rebitCount: 0,
  commentCount: 0,
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

  it("상대 시간 레이블을 보여준다", () => {
    render(<BitCard bit={base} />);
    expect(screen.getByText(/방금 전/)).toBeInTheDocument();
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

  it("카드에 액션 버튼(좋아요·댓글)이 있다", () => {
    render(<BitCard bit={base} />);
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });

  describe("URL 링크화 (R10)", () => {
    it("R10.1: URL은 새 탭 링크, 끝 마침표는 밖, #ai는 태그 링크", () => {
      const { container } = render(<BitCard bit={bitWith("see https://a.com/x. #ai", ["ai"])} />);
      const link = screen.getByRole("link", { name: "https://a.com/x" });
      expect(link).toHaveAttribute("href", "https://a.com/x");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
      expect(screen.getByRole("link", { name: "#ai" })).toHaveAttribute("href", "/tags/ai");
      expect(container.querySelector("p")?.textContent).toBe("see https://a.com/x. #ai");
    });

    it("R10.2: 바깥 괄호는 링크에서 제외한다", () => {
      render(<BitCard bit={bitWith("(https://a.com/x)")} />);
      expect(screen.getByRole("link")).toHaveAttribute("href", "https://a.com/x");
    });

    it("R10.2: URL 안의 _(b)는 링크에 포함한다", () => {
      render(<BitCard bit={bitWith("https://en.wikipedia.org/wiki/A_(b)")} />);
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://en.wikipedia.org/wiki/A_(b)",
      );
    });

    it("R10.2: 괄호로 감싼 위키 URL은 _(b)까지 링크, 바깥 ) 제외", () => {
      render(<BitCard bit={bitWith("(https://en.wikipedia.org/wiki/A_(b))")} />);
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "https://en.wikipedia.org/wiki/A_(b)",
      );
    });

    it("R10.3: URL fragment는 태그가 아니라 URL 링크의 일부다", () => {
      render(<BitCard bit={bitWith("https://a.com/p#frag #ai", ["ai"])} />);
      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute("href", "https://a.com/p#frag");
      expect(links[1]).toHaveAttribute("href", "/tags/ai");
    });

    it("R10.4: javascript:와 ftp://는 일반 텍스트다", () => {
      render(<BitCard bit={bitWith("javascript:alert(1) ftp://x")} />);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByText("javascript:alert(1) ftp://x")).toBeInTheDocument();
    });
  });
});

describe("bold formatting", () => {
  it("renders **text** as <strong> and keeps tags and links working", async () => {
    const { renderBitContent } = await import("./bit-content");
    const { render } = await import("@testing-library/react");
    const { container } = render(<p>{renderBitContent("see **important #ai note** at https://a.com/x.")}</p>);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("important #ai note");
    expect(strong?.querySelector("a")?.getAttribute("href")).toBe("/tags/ai");
    expect(container.querySelector('a[href="https://a.com/x"]')).not.toBeNull();
  });
  it("leaves unmatched ** as text", async () => {
    const { renderBitContent } = await import("./bit-content");
    const { render } = await import("@testing-library/react");
    const { container } = render(<p>{renderBitContent("2 ** 3 is power")}</p>);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toBe("2 ** 3 is power");
  });
});

describe("strikethrough", () => {
  it("renders ~~text~~ as <del>, also nested with bold", async () => {
    const { renderBitContent } = await import("./bit-content");
    const { render } = await import("@testing-library/react");
    const { container } = render(<p>{renderBitContent("~~old~~ and **~~both~~**")}</p>);
    const dels = container.querySelectorAll("del");
    expect([...dels].map((d) => d.textContent)).toEqual(["old", "both"]);
    expect(container.querySelector("strong del")?.textContent).toBe("both");
  });
});

describe("strikethrough flanking rules", () => {
  it("ignores casual tildes and stray marker runs", async () => {
    const { renderBitContent } = await import("./bit-content");
    const { render } = await import("@testing-library/react");
    const a = render(<p>{renderBitContent("반가워~~ 오늘 ~~일정~~ 취소")}</p>).container;
    expect([...a.querySelectorAll("del")].map((d) => d.textContent)).toEqual(["일정"]);
    const b = render(<p>{renderBitContent("~~~~ 안녕 ~~취소~~")}</p>).container;
    expect([...b.querySelectorAll("del")].map((d) => d.textContent)).toEqual(["취소"]);
  });
});
