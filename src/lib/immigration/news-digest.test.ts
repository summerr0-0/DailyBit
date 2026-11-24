import { describe, expect, it } from "vitest";
import type { CommunityStore, Summarize } from "./community";
import { NEWS_FEEDS, newsNote, runNewsDigest } from "./news-digest";

// 실제 피드 모양(RSS 2.0 / Atom)만 흉내 낸 작은 피드 — 문구는 지어낸 것
const rss = (n: number) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>CIC News</title>${Array.from(
    { length: n },
    (_, i) => `<item><title>CIC story ${i}</title><link>https://www.cicnews.com/2026/11/story-${i}.html</link><description>Body ${i}</description><pubDate>Tue, 24 Nov 2026 16:00:00 +0000</pubDate></item>`,
  ).join("")}</channel></rss>`;
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Express Entry change</title><id>https://www.canada.ca/en/news/2026/11/ee.html</id><summary type="html">Official text</summary><updated>2026-11-20T10:00:00-05:00</updated><link href="https://www.canada.ca/en/news/2026/11/ee.html"/></entry></feed>`;

function memoryStore(seen: Record<string, string[]> | null = null) {
  const state = { seen: { ...(seen ?? {}) } as Record<string, string[]>, notes: [] as string[], first: seen === null };
  const store: CommunityStore = {
    getSeen: async (k) => (state.first && !(k in state.seen) ? null : (state.seen[k] ?? [])),
    saveSeen: async (k, ids) => void (state.seen[k] = ids),
    postNote: async (c) => void state.notes.push(c),
  };
  return { store, state };
}
const fetchFrom = (cic: string) => async (url: string) => (url === NEWS_FEEDS[0].url ? atom : cic);
const relevantIf = (re: RegExp): Summarize => async (a) => a.map((x) => ({ summary: `요약: ${x.title}`, relevant: re.test(x.title) }));

describe("runNewsDigest (1b)", () => {
  it("first run looks only at the latest 3 per feed and posts only relevant items", async () => {
    const m = memoryStore();
    let asked: string[] = [];
    const r = await runNewsDigest(fetchFrom(rss(10)), m.store, async (a) => ((asked = a.map((x) => x.title)), relevantIf(/Express|story 1$/)(a)));
    expect(asked).toEqual(["Express Entry change", "CIC story 0", "CIC story 1", "CIC story 2"]);
    expect(r).toMatchObject({ relevant: 2, notes: 2 });
    expect(m.state.notes[0]).toMatch(/^★ \[IRCC\] Express Entry change\n요약: Express Entry change\nhttps:\/\/www\.canada\.ca\/en\/news\/2026\/11\/ee\.html\n#immigration$/);
    expect(m.state.seen["news:cicnews"]).toHaveLength(10); // 나머지는 본 것으로
  });

  it("a second run with the same feeds asks the AI nothing and posts nothing", async () => {
    const m = memoryStore();
    await runNewsDigest(fetchFrom(rss(5)), m.store, relevantIf(/./));
    m.state.notes.length = 0;
    let called = false;
    await runNewsDigest(fetchFrom(rss(5)), m.store, async (a) => ((called = a.length > 0), []));
    expect(called).toBe(false);
    expect(m.state.notes).toEqual([]);
  });

  it("does not mark anything seen when the AI fails, so the next run retries", async () => {
    const m = memoryStore({ "news:ircc": [], "news:cicnews": [] });
    const r = await runNewsDigest(fetchFrom(rss(2)), m.store, async () => null);
    expect(r.summarized).toBe(false);
    expect(m.state.seen["news:cicnews"]).toEqual([]);
  });

  it("reports a broken feed and still handles the other one", async () => {
    const m = memoryStore({ "news:ircc": [], "news:cicnews": [] });
    const fetchBroken = async (url: string) => {
      if (url === NEWS_FEEDS[1].url) throw new Error("HTTP 503");
      return atom;
    };
    const r = await runNewsDigest(fetchBroken, m.store, relevantIf(/./));
    expect(r.feeds).toEqual([{ id: "ircc", fresh: 1 }, { id: "cicnews", fresh: 0, error: "HTTP 503" }]);
    expect(r.notes).toBe(1);
  });

  it("keeps the link and tag within 500 chars and escapes # in titles", async () => {
    const m = memoryStore(/* 정규화된 URL로 저장된다 */ { "news:ircc": ["https://canada.ca/en/news/2026/11/ee.html"], "news:cicnews": [] });
    const long = rss(1).replace("CIC story 0", `#tag ${"long title ".repeat(40)}`);
    await runNewsDigest(fetchFrom(long), m.store, async () => [{ summary: "가".repeat(400), relevant: true }]);
    expect(m.state.notes[0].length).toBeLessThanOrEqual(500);
    expect(m.state.notes[0]).toMatch(/story-0\.html\n#immigration$/);
    expect(m.state.notes[0].match(/#[^\s]+/g)).toEqual(["#immigration"]);
  });

  it("retries an item the AI skipped instead of marking it seen (Gemini news #1)", async () => {
    const m = memoryStore({ "news:ircc": ["https://canada.ca/en/news/2026/11/ee.html"], "news:cicnews": [] });
    await runNewsDigest(fetchFrom(rss(2)), m.store, async () => [{ summary: "s", relevant: false }, null]);
    expect(m.state.seen["news:cicnews"]).toEqual(["https://cicnews.com/2026/11/story-0.html"]);
  });

  it("an empty feed on the first run keeps the first-run rule for next time (Gemini news #2)", async () => {
    const m = memoryStore();
    await runNewsDigest(fetchFrom(rss(0)), m.store, relevantIf(/./));
    expect("news:cicnews" in m.state.seen).toBe(false);
  });

  it("handles duplicate links in one feed once (Gemini news #3)", async () => {
    const m = memoryStore({ "news:ircc": ["https://canada.ca/en/news/2026/11/ee.html"], "news:cicnews": [] });
    const dup = rss(1).replace("</channel>", rss(1).match(/<item>.*<\/item>/)![0] + "</channel>");
    let asked = 0;
    await runNewsDigest(fetchFrom(dup), m.store, async (a) => ((asked = a.length), relevantIf(/./)(a)));
    expect(asked).toBe(1);
    expect(m.state.notes).toHaveLength(1);
  });
});

describe("newsNote", () => {
  it("never exceeds 500 chars, even with a very long link (Gemini news #4)", () => {
    const note = newsNote("CIC News", "t".repeat(300), "s".repeat(300), `https://x.org/${"p".repeat(420)}`);
    expect(note.length).toBeLessThanOrEqual(500);
    expect(note.endsWith("#immigration")).toBe(true);
  });
});
