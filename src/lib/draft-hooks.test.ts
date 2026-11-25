import { describe, expect, it } from "vitest";
import {
  appendSourceSegment,
  conceptLinkBit,
  expiryCutoffs,
  isDraftExpired,
  isStale,
  newsConceptBits,
  planConceptPublish,
  relatedNewsBit,
  threadLink,
} from "./draft-hooks";
import { SITE_URL, threadUrl } from "./site-url";

const DAY = 24 * 60 * 60 * 1000;

describe("site-url", () => {
  it("builds absolute thread URLs without a double slash", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
    expect(threadUrl("T1")).toBe(`${SITE_URL}/threads/T1`);
    expect(threadUrl("T1")).toMatch(/^https?:\/\//);
    expect(threadUrl("T1")).not.toContain("vercel.app");
  });

  it("threadLink uses [[title]] and falls back to an absolute URL only for titles [[ ]] cannot hold", () => {
    expect(threadLink("Finding faster  quantum algorithms", "T1")).toBe("[[Finding faster quantum algorithms]]");
    expect(threadLink("Arrays [a|b]", "T1")).toBe(`Arrays [a|b] → ${threadUrl("T1")}`);
    expect(threadLink("x".repeat(101), "T1")).toMatch(/… → https?:\/\//);
  });
});

describe("conceptLinkBit", () => {
  it("uses the unified one-bit-per-concept format (D14-8)", () => {
    expect(conceptLinkBit("Quantization", "T1")).toBe("New to this? [[Quantization]]");
  });
  it("stays within 500 chars for a huge term", () => {
    expect(conceptLinkBit("x".repeat(1000), "T1").length).toBeLessThanOrEqual(500);
  });
});

describe("newsConceptBits (R6.1, R6.3)", () => {
  const concepts = [
    { slug: "quantization", term: "Quantization", status: "PUBLISHED" as const, threadId: "C1" },
    { slug: "prompt-injection", term: "Prompt injection", status: "PENDING" as const, threadId: null },
    { slug: "rag", term: "RAG", status: "REJECTED" as const, threadId: null },
    { slug: "lora", term: "LoRA", status: "PUBLISHED" as const, threadId: "C2" },
  ];

  it("links only published concepts, one bit each, in slug order", () => {
    expect(newsConceptBits(["lora", "prompt-injection", "quantization", "rag"], concepts)).toEqual([
      conceptLinkBit("LoRA", "C2"),
      conceptLinkBit("Quantization", "C1"),
    ]);
  });
  it("returns nothing for pending or unknown concepts", () => {
    expect(newsConceptBits(["prompt-injection", "missing"], concepts)).toEqual([]);
  });
  it("dedups repeated slugs", () => {
    expect(newsConceptBits(["lora", "lora"], concepts)).toHaveLength(1);
  });
});

describe("relatedNewsBit", () => {
  it("returns null with no events", () => {
    expect(relatedNewsBit([])).toBeNull();
  });
  it("lists up to 3 events with links", () => {
    const events = [1, 2, 3, 4].map((n) => ({ title: `News ${n}`, threadId: `N${n}` }));
    const bit = relatedNewsBit(events)!;
    expect(bit).toBe(
      "Related news:\n- [[News 1]]\n- [[News 2]]\n- [[News 3]]",
    );
  });
  it("stays within 500 chars with long titles", () => {
    const events = [1, 2, 3].map((n) => ({ title: "t".repeat(400), threadId: `N${n}` }));
    expect(relatedNewsBit(events)!.length).toBeLessThanOrEqual(500);
  });
});

describe("planConceptPublish (R6.2)", () => {
  it("adds a related-news bit and backlinks to each published news thread", () => {
    const plan = planConceptPublish({ term: "Quantization", threadId: "C1" }, [
      { title: "GPT-6.2 released", threadId: "N1" },
    ]);
    expect(plan.relatedBit).toBe("Related news:\n- [[GPT-6.2 released]]");
    expect(plan.backlinks).toEqual([{ threadId: "N1", content: conceptLinkBit("Quantization", "C1") }]);
  });
  it("does nothing extra when no news is published", () => {
    expect(planConceptPublish({ term: "Q", threadId: "C1" }, [])).toEqual({ relatedBit: null, backlinks: [] });
  });
  it("caps at 3 distinct threads", () => {
    const events = ["N1", "N1", "N2", "N3", "N4"].map((id) => ({ title: id, threadId: id }));
    const plan = planConceptPublish({ term: "Q", threadId: "C1" }, events);
    expect(plan.backlinks.map((b) => b.threadId)).toEqual(["N1", "N2", "N3"]);
  });
});

describe("appendSourceSegment (D8)", () => {
  it("appends to the end and adds the warning once", () => {
    const first = appendSourceSegment(["summary", "src1"], [], "src2");
    expect(first).toEqual({ segments: ["summary", "src1", "src2"], warnings: ["source_added_later"] });
    const second = appendSourceSegment(first.segments, first.warnings, "src3");
    expect(second.warnings).toEqual(["source_added_later"]);
    expect(second.segments.at(-1)).toBe("src3");
  });
});

describe("isStale (R7.1, R7.2)", () => {
  const u1 = new Date("2026-11-19T10:00:00.000Z");
  it("is stale when the server value moved", () => {
    expect(isStale(new Date("2026-11-19T10:05:00.000Z"), u1)).toBe(true);
  });
  it("is fresh when equal or unchecked", () => {
    expect(isStale(new Date(u1), u1)).toBe(false);
    expect(isStale(u1, undefined)).toBe(false);
    expect(isStale(u1, null)).toBe(false);
  });
});

describe("expiry (R6.5, D14-9)", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  it("expires NEWS after 3 days and CONCEPT after 7 days by updatedAt", () => {
    expect(isDraftExpired({ kind: "NEWS", updatedAt: ago(3.1) }, now)).toBe(true);
    expect(isDraftExpired({ kind: "NEWS", updatedAt: ago(2.9) }, now)).toBe(false);
    expect(isDraftExpired({ kind: "CONCEPT", updatedAt: ago(5) }, now)).toBe(false);
    expect(isDraftExpired({ kind: "CONCEPT", updatedAt: ago(7.1) }, now)).toBe(true);
  });
  it("never expires MANUAL", () => {
    expect(isDraftExpired({ kind: "MANUAL", updatedAt: ago(100) }, now)).toBe(false);
  });
  it("cutoffs match the TTLs", () => {
    expect(expiryCutoffs(now)).toEqual({ news: ago(3), concept: ago(7) });
  });
});

describe("[[title]] only when it reaches that thread", () => {
  it("relatedNewsBit uses a URL when the caller says the title resolves elsewhere", () => {
    expect(relatedNewsBit([{ title: "Lean", threadId: "N1", wiki: false }])).toBe(`Related news:\n- Lean → ${threadUrl("N1")}`);
  });
  it("planConceptPublish turns same-titled news threads into URLs", () => {
    const plan = planConceptPublish({ term: "Lean", threadId: "C1" }, [
      { title: "Same title", threadId: "N1" },
      { title: "same  title", threadId: "N2" },
    ]);
    expect(plan.relatedBit).toBe(`Related news:\n- Same title → ${threadUrl("N1")}\n- same title → ${threadUrl("N2")}`);
  });
});
