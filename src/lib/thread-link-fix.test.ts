import { describe, expect, it } from "vitest";
import { rewriteThreadLinks } from "./thread-link-fix";

const titles = new Map([
  ["cmwvi4hbr000007l9bj9ehhdz", "Finding faster quantum algorithms with agents and formal verification"],
  ["c2", "Lean"],
]);

describe("rewriteThreadLinks", () => {
  it("turns 'Related news' lines into [[title]]", () => {
    const before = "Related news:\n- Finding faster quantum algorithms with agents and formal verification → https://daily-bit.vercel.app/threads/cmwvi4hbr000007l9bj9ehhdz";
    expect(rewriteThreadLinks(before, titles)).toBe("Related news:\n- [[Finding faster quantum algorithms with agents and formal verification]]");
  });
  it("turns 'New to this?' and bare site URLs into [[title]]", () => {
    expect(rewriteThreadLinks("New to this? Lean → https://irin-j.com/threads/c2", titles)).toBe("New to this? [[Lean]]");
    expect(rewriteThreadLinks("see https://daily-bit.vercel.app/threads/c2 too", titles)).toBe("see [[Lean]] too");
  });
  it("unknown threads keep a URL but move off the old test domain; other sites are untouched", () => {
    const t = "- Gone → https://daily-bit.vercel.app/threads/zzz\nhttps://example.com/threads/c2";
    expect(rewriteThreadLinks(t, titles)).toBe("- Gone → https://irin-j.com/threads/zzz\nhttps://example.com/threads/c2");
  });
  it("keeps prose around inline links", () => {
    expect(rewriteThreadLinks("- 배경 설명: Lean → https://irin-j.com/threads/c2 참고", titles)).toBe("- 배경 설명: Lean → [[Lean]] 참고");
    expect(rewriteThreadLinks("Lean → https://irin-j.com/threads/c2", titles)).toBe("Lean → [[Lean]]");
  });
  it("falls back to the host swap when [[title]] would push the bit past 500 chars", () => {
    const long = new Map([["c3", "T".repeat(100)]]);
    const t = `${"x".repeat(440)} https://daily-bit.vercel.app/threads/c3`;
    expect(rewriteThreadLinks(t, long)).toBe(`${"x".repeat(440)} https://irin-j.com/threads/c3`);
  });
});
