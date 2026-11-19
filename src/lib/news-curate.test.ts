import { describe, expect, it, vi } from "vitest";
import {
  AllFeedsFailedError,
  ScoringUnavailableError,
  createMemoryStore,
  roundRobinBySource,
  runCuration,
  selectForDrafting,
  type CurationDeps,
  type FeedItemRow,
} from "./news-curate";
import type { NewsSource } from "./news-sources";
import type { FeedEntry, FeedResult } from "./news-feed";
import { FeedFetchError } from "./news-feed";

const NOW = new Date("2026-11-18T21:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const BODY = "Long enough article body with 1200 users affected. ".repeat(10);

const SOURCES: NewsSource[] = ["openai", "krebs", "willison", "schneier", "deepmind"].map((id) => ({
  id,
  name: id.toUpperCase(),
  feedUrl: `https://${id}.example/feed`,
  category: id === "krebs" || id === "schneier" ? "security" : "ai",
}));

function entry(slug: string, publishedAt: Date | null, summary = "short summary"): FeedEntry {
  return { url: `https://news.example/${slug}?utm_source=rss`, title: `Title ${slug}`, summary, publishedAt };
}

function row(over: Partial<FeedItemRow> & { id: string; sourceId: string }): FeedItemRow {
  return {
    url: `https://news.example/${over.id}`,
    urlNormalized: `https://news.example/${over.id}`,
    title: `Title ${over.id}`,
    summary: null,
    publishedAt: hoursAgo(5),
    score: 7,
    status: "CANDIDATE",
    attempts: 0,
    ...over,
  };
}

function makeDeps(opts: {
  feeds?: FeedResult[];
  initial?: FeedItemRow[];
  scores?: (keys: string[]) => Record<string, number> | null;
  generate?: CurationDeps["generate"];
  extract?: CurationDeps["extract"];
}) {
  const mem = createMemoryStore(opts.initial);
  const score = vi.fn(async (items: { key: string }[]) => {
    const s = (opts.scores ?? ((keys) => Object.fromEntries(keys.map((k) => [k, 7]))))(items.map((i) => i.key));
    return s ? { ok: true as const, scores: s } : { ok: false as const };
  });
  const generate = vi.fn(
    opts.generate ??
      (async () => ({
        ok: true as const,
        output: { headline: "Headline", bullets: ["Fact one.", "Fact two.", "Fact three."], tags: ["ai"] },
      })),
  );
  const deps: CurationDeps = {
    store: mem.store,
    sources: SOURCES,
    now: () => NOW,
    fetchAll: async () => opts.feeds ?? [],
    extract: opts.extract ?? (async () => ({ ok: true, rawExtract: BODY })),
    score,
    generate,
  };
  return { deps, mem, score, generate };
}

const statusOf = (mem: ReturnType<typeof createMemoryStore>, slug: string) =>
  [...mem.items.values()].find((i) => i.urlNormalized.endsWith(`/${slug}`));

describe("runCuration — happy path (R0.1)", () => {
  it("creates at most 3 drafts, one per source, with the normalized URL in the body", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: [entry("o1", hoursAgo(1)), entry("o2", hoursAgo(2))] },
      { sourceId: "krebs", items: [entry("k1", hoursAgo(3))] },
      { sourceId: "willison", items: [entry("w1", hoursAgo(4))] },
      { sourceId: "schneier", items: [entry("s1", hoursAgo(5))] },
    ];
    const { deps, mem } = makeDeps({ feeds });
    const summary = await runCuration(deps);

    expect(summary.drafted).toBe(3);
    expect(mem.drafts).toHaveLength(3);
    const sources = mem.drafts.map((d) => d.sourceLabel);
    expect(new Set(sources).size).toBe(3);
    expect(mem.drafts[0].content).toContain("https://news.example/o1\n");
    expect(mem.drafts[0].content).not.toContain("utm_source");
  });
});

describe("dedup (R2.4, R3.3)", () => {
  it("ignores URLs already stored in any status, even with tracking params", async () => {
    const initial = [row({ id: "o1", sourceId: "openai", status: "DRAFTED" })];
    const { deps, mem, score } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o1", hoursAgo(1))] }], initial });
    await runCuration(deps);
    expect(score).not.toHaveBeenCalled();
    expect(mem.drafts).toHaveLength(0);
    expect(statusOf(mem, "o1")?.status).toBe("DRAFTED");
  });

  it("dedupes the same URL appearing twice in one run", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: [entry("x", hoursAgo(1))] },
      { sourceId: "krebs", items: [entry("x", hoursAgo(1))] },
    ];
    const { deps, mem } = makeDeps({ feeds });
    await runCuration(deps);
    expect(mem.items.size).toBe(1);
  });
});

describe("freshness (R3.1, R3.2)", () => {
  it("skips items with no date or older than 48h without scoring them", async () => {
    const feeds: FeedResult[] = [{ sourceId: "openai", items: [entry("nodate", null), entry("old", hoursAgo(50))] }];
    const { deps, mem, score } = makeDeps({ feeds });
    await runCuration(deps);
    expect(score).not.toHaveBeenCalled();
    expect(statusOf(mem, "nodate")).toMatchObject({ status: "SKIPPED", skipReason: "no_date" });
    expect(statusOf(mem, "old")).toMatchObject({ status: "SKIPPED", skipReason: "stale" });
  });

  it("stales CANDIDATE and FAILED items published more than 48h ago", async () => {
    const initial = [
      row({ id: "c", sourceId: "openai", publishedAt: hoursAgo(49) }),
      row({ id: "f", sourceId: "krebs", status: "FAILED", attempts: 1, publishedAt: hoursAgo(49) }),
    ];
    const { deps, mem } = makeDeps({ initial });
    const summary = await runCuration(deps);
    expect(summary.staled).toBe(2);
    expect(mem.drafts).toHaveLength(0);
    expect(statusOf(mem, "c")?.status).toBe("SKIPPED");
    expect(statusOf(mem, "f")?.status).toBe("SKIPPED");
  });
});

describe("scoring (R4.1, R4.2, R4.5)", () => {
  it("scores only new items in one call and stores CANDIDATE / SKIPPED(low_score)", async () => {
    const initial = [row({ id: "prev", sourceId: "deepmind", score: 6 })];
    const feeds: FeedResult[] = [{ sourceId: "openai", items: [entry("hi", hoursAgo(1)), entry("lo", hoursAgo(1))] }];
    const { deps, mem, score } = makeDeps({
      feeds,
      initial,
      scores: (keys) => Object.fromEntries(keys.map((k) => [k, k.endsWith("/hi") ? 8 : 3])),
    });
    await runCuration(deps);
    expect(score).toHaveBeenCalledTimes(1);
    expect(score.mock.calls[0][0].map((i) => i.key)).toEqual(["https://news.example/hi", "https://news.example/lo"]);
    expect(statusOf(mem, "lo")).toMatchObject({ status: "SKIPPED", skipReason: "low_score", score: 3 });
    expect(statusOf(mem, "hi")?.status).toBe("DRAFTED");
  });

  it("treats total scoring failure as a system problem: records nothing and throws", async () => {
    const initial = [row({ id: "prev", sourceId: "deepmind" })];
    const { deps, mem } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("new", hoursAgo(1))] }],
      initial,
      scores: () => null,
    });
    await expect(runCuration(deps)).rejects.toBeInstanceOf(ScoringUnavailableError);
    expect(statusOf(mem, "new")).toBeUndefined(); // 다음 실행에서 다시 채점
    expect(mem.drafts).toHaveLength(0);
  });

  it("leaves items the model omitted unrecorded so they are re-scored next run", async () => {
    const { deps, mem } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("a", hoursAgo(1)), entry("b", hoursAgo(1))] }],
      scores: (keys) => ({ [keys[0]]: 2 }),
    });
    await runCuration(deps);
    expect(statusOf(mem, "a")?.status).toBe("SKIPPED");
    expect(statusOf(mem, "b")).toBeUndefined();
  });

  it("caps scoring at 60 items, filled round-robin across sources", () => {
    const items = [
      ...Array.from({ length: 70 }, (_, i) => ({ sourceId: "openai", publishedAt: hoursAgo(i / 10), n: i })),
      ...Array.from({ length: 5 }, (_, i) => ({ sourceId: "krebs", publishedAt: hoursAgo(i), n: 100 + i })),
    ];
    const picked = roundRobinBySource(items, 60);
    expect(picked).toHaveLength(60);
    expect(picked.filter((p) => p.sourceId === "krebs")).toHaveLength(5);
    expect(picked[0].n).toBe(0); // 소스 내 최신순
  });
});

describe("selection (R4.3, R4.4)", () => {
  it("picks by score, one per source, ties broken by recency", () => {
    const pool = [
      row({ id: "o9", sourceId: "openai", score: 9 }),
      row({ id: "o8", sourceId: "openai", score: 8 }),
      row({ id: "k7", sourceId: "krebs", score: 7, publishedAt: hoursAgo(10) }),
      row({ id: "w7", sourceId: "willison", score: 7, publishedAt: hoursAgo(2) }),
      row({ id: "s6", sourceId: "schneier", score: 6 }),
      row({ id: "d8", sourceId: "deepmind", score: 8, status: "FAILED", attempts: 1 }),
    ];
    expect(selectForDrafting(pool, 3).map((r) => r.id)).toEqual(["o9", "d8", "w7"]);
  });

  it("does not fill up with sub-threshold items", () => {
    const pool = [row({ id: "a", sourceId: "openai", score: 6 }), row({ id: "b", sourceId: "krebs", score: 5 })];
    expect(selectForDrafting(pool, 3).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("content resolution (R5)", () => {
  it("falls back to the RSS summary when extraction fails", async () => {
    // parseFeed가 이미 정제한 summary가 들어온다 — resolveContent는 다시 htmlToText를 돌리지 않는다
    const summary = "RSS body & details about Vec<T>. ".repeat(10);
    const generate = vi.fn(async () => ({
      ok: true as const,
      output: { headline: "H", bullets: ["One.", "Two."], tags: [] },
    }));
    const { deps, mem } = makeDeps({
      feeds: [{ sourceId: "krebs", items: [entry("k", hoursAgo(1), summary)] }],
      extract: async () => ({ ok: false }),
      generate,
    });
    await runCuration(deps);
    const raw = (generate.mock.calls[0] as unknown as [{ rawExtract: string }])[0].rawExtract;
    expect(raw).toContain("RSS body & details about Vec<T>.");
    expect(mem.drafts[0].content).toContain("#security"); // 태그 없으면 카테고리 태그
  });

  it("skips with no_content and never calls the model when both sources are too short", async () => {
    const { deps, mem, generate } = makeDeps({
      feeds: [{ sourceId: "krebs", items: [entry("k", hoursAgo(1), "x".repeat(120))] }],
      extract: async () => ({ ok: false }),
    });
    await runCuration(deps);
    expect(generate).not.toHaveBeenCalled();
    expect(statusOf(mem, "k")).toMatchObject({ status: "SKIPPED", skipReason: "no_content" });
  });
});

describe("failures and retries (R7.1–R7.3)", () => {
  it("continues when one feed fails", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", error: new FeedFetchError("http", "HTTP 403", "openai") },
      { sourceId: "krebs", items: [entry("k", hoursAgo(1))] },
    ];
    const { deps, mem } = makeDeps({ feeds });
    const summary = await runCuration(deps);
    expect(summary.feedsFailed).toBe(1);
    expect(mem.drafts).toHaveLength(1);
  });

  it("throws AllFeedsFailedError when every feed fails", async () => {
    const feeds: FeedResult[] = [{ sourceId: "openai", error: new FeedFetchError("timeout", "timeout", "openai") }];
    const { deps } = makeDeps({ feeds });
    await expect(runCuration(deps)).rejects.toBeInstanceOf(AllFeedsFailedError);
  });

  it("marks FAILED on first generation failure, then SKIPPED(gave_up) on the retry", async () => {
    const generate = vi.fn(async () => ({ ok: false as const, reason: "ai_failed" as const }));
    const { deps, mem } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }], generate });

    await runCuration(deps);
    expect(statusOf(mem, "o")).toMatchObject({ status: "FAILED", attempts: 1 });

    await runCuration(deps);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(statusOf(mem, "o")).toMatchObject({ status: "SKIPPED", skipReason: "gave_up", attempts: 2 });
  });

  it("treats a too-short assembled bit as a failure", async () => {
    const generate = vi.fn(async () => ({
      ok: true as const,
      output: { headline: "H", bullets: ["only one"], tags: [] },
    }));
    const { deps, mem } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }], generate });
    await runCuration(deps);
    expect(statusOf(mem, "o")?.status).toBe("FAILED");
  });

  it("counts retries toward the per-run cap of 3", async () => {
    const initial = ["a", "b", "c"].map((id, i) =>
      row({ id, sourceId: SOURCES[i].id, status: "FAILED", attempts: 1, score: 9 }),
    );
    const { deps, generate } = makeDeps({
      initial,
      feeds: [{ sourceId: "schneier", items: [entry("s", hoursAgo(1))] }],
    });
    await runCuration(deps);
    expect(generate).toHaveBeenCalledTimes(3);
  });
});

describe("draft warnings (R6.5)", () => {
  it("adds number_not_in_source warnings from the headline and bullets only", async () => {
    const generate = vi.fn(async () => ({
      ok: true as const,
      output: { headline: "40% faster", bullets: ["1,200 users hit.", "Second fact."], tags: ["ai"] },
    }));
    const { deps, mem } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }], generate });
    await runCuration(deps);
    expect(mem.drafts[0].warnings).toEqual(["number_not_in_source:40"]);
  });
});

describe("purge (R8.2)", () => {
  it("purges items published over 30 days ago but keeps undated ones", async () => {
    const initial = [
      row({ id: "old", sourceId: "openai", status: "SKIPPED", publishedAt: hoursAgo(31 * 24) }),
      row({ id: "nodate", sourceId: "openai", status: "SKIPPED", publishedAt: null }),
    ];
    const { deps, mem } = makeDeps({ initial, feeds: [{ sourceId: "openai", items: [entry("nodate", null)] }] });
    const summary = await runCuration(deps);
    expect(summary.purgedItems).toBe(1);
    expect(statusOf(mem, "old")).toBeUndefined();
    expect(mem.items.size).toBe(1); // undated item not re-inserted
  });
});

describe("Gemini diff review fixes", () => {
  it("retries scoring in chunks after a whole-batch failure and skips chunks that still fail", async () => {
    const items = Array.from({ length: 12 }, (_, i) => entry(`n${i}`, hoursAgo(1)));
    const mem = createMemoryStore();
    let call = 0;
    const score = vi.fn(async (batch: { key: string }[]) => {
      call++;
      if (call === 1) return { ok: false as const }; // 전체 배치 실패
      if (batch.some((b) => b.key.endsWith("/n0"))) return { ok: false as const }; // 첫 묶음(10개) 계속 실패
      return { ok: true as const, scores: Object.fromEntries(batch.map((b) => [b.key, 3])) };
    });
    const deps: CurationDeps = {
      store: mem.store,
      sources: SOURCES,
      now: () => NOW,
      fetchAll: async () => [{ sourceId: "openai", items }],
      extract: async () => ({ ok: true, rawExtract: BODY }),
      score,
      generate: async () => ({ ok: false, reason: "ai_failed" }),
    };
    await runCuration(deps);
    expect(score).toHaveBeenCalledTimes(3); // 1 batch + 2 chunks
    const statuses = [...mem.items.values()].map((i) => (i as { skipReason?: string }).skipReason);
    expect(statuses.filter((r) => r === "score_failed")).toHaveLength(10);
    expect(statuses.filter((r) => r === "low_score")).toHaveLength(2);
  });

  it("replaces a no_content pick with the next candidate without spending a model call", async () => {
    const initial = [
      row({ id: "top", sourceId: "openai", score: 9 }),
      row({ id: "next", sourceId: "openai", score: 8 }),
      row({ id: "k", sourceId: "krebs", score: 7 }),
      row({ id: "w", sourceId: "willison", score: 7 }),
      row({ id: "s", sourceId: "schneier", score: 6 }),
    ];
    const { deps, mem, generate } = makeDeps({
      initial,
      extract: async (url) => (url.endsWith("/top") ? { ok: false } : { ok: true, rawExtract: BODY }),
    });
    await runCuration(deps);
    expect(statusOf(mem, "top")).toMatchObject({ status: "SKIPPED", skipReason: "no_content" });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(statusOf(mem, "next")?.status).toBe("DRAFTED"); // 같은 소스 차순위가 대신 들어옴
    expect(statusOf(mem, "s")?.status).toBe("CANDIDATE");
  });

  it("links the clean URL (keeps www and trailing slash, drops tracking params)", async () => {
    const feeds: FeedResult[] = [
      {
        sourceId: "krebs",
        items: [{ url: "https://www.krebs.example/2026/11/post/?utm_source=rss#c", title: "T", summary: "", publishedAt: hoursAgo(1) }],
      },
    ];
    const { deps, mem } = makeDeps({ feeds });
    await runCuration(deps);
    expect(mem.drafts[0].content).toContain("\nhttps://www.krebs.example/2026/11/post/\n");
  });

  it("checks numbers only in bullets that survived the 500-char trim", async () => {
    const long = "x".repeat(150);
    const generate = vi.fn(async () => ({
      ok: true as const,
      output: { headline: "H", bullets: [`${long} a.`, `${long} b.`, `${long} 999 c.`], tags: ["ai"] },
    }));
    const { deps, mem } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }], generate });
    await runCuration(deps);
    expect(mem.drafts[0].content).not.toContain("999");
    expect(mem.drafts[0].warnings).not.toContain("number_not_in_source:999");
  });
});

describe("retention churn", () => {
  it("does not store items older than the 30-day retention window, so purge and re-insert don't loop", async () => {
    const feeds: FeedResult[] = [{ sourceId: "openai", items: [entry("ancient", hoursAgo(40 * 24)), entry("week", hoursAgo(7 * 24))] }];
    const { deps, mem } = makeDeps({ feeds });
    const first = await runCuration(deps);
    expect(statusOf(mem, "ancient")).toBeUndefined();
    expect(statusOf(mem, "week")).toMatchObject({ status: "SKIPPED", skipReason: "stale" });
    const second = await runCuration(deps);
    expect(first.skippedNew).toBe(1);
    expect(second.skippedNew).toBe(0);
    expect(second.purgedItems).toBe(0);
  });
});
