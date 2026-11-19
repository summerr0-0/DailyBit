import { describe, expect, it, vi } from "vitest";
import {
  AllFeedsFailedError,
  ScoringUnavailableError,
  createMemoryStore,
  groupByEvent,
  planConcepts,
  roundRobinBySource,
  runCuration,
  type ConceptRow,
  type CurationDeps,
  type FeedItemRow,
} from "./news-curate";
import type { NewsSource } from "./news-sources";
import type { FeedEntry, FeedResult } from "./news-feed";
import { FeedFetchError } from "./news-feed";
import type { EventNewsInput } from "./news-ai";

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
    eventKey: null,
    ...over,
  };
}

type Opts = {
  feeds?: FeedResult[];
  initial?: FeedItemRow[];
  seed?: Parameters<typeof createMemoryStore>[1];
  /** key → [score, event]. 기본: 7점, 기사마다 다른 사건 */
  scores?: (keys: string[]) => Record<string, [number, string]> | null;
  concepts?: { term: string; aliases: string[] }[];
  generateEvent?: CurationDeps["generateEvent"];
  generateConcept?: CurationDeps["generateConcept"];
  extract?: CurationDeps["extract"];
};

function makeDeps(opts: Opts) {
  const mem = createMemoryStore(opts.initial, opts.seed);
  const score = vi.fn(async (items: { key: string }[], _o: { knownEvents?: { eventKey: string }[] }) => {
    void _o;
    const def = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, [7, `ev-${k.split("/").pop()}`] as [number, string]]));
    const s = (opts.scores ?? def)(items.map((i) => i.key));
    if (!s) return { ok: false as const };
    const results = Object.fromEntries(Object.entries(s).map(([k, [score, event]]) => [k, { score, event }]));
    const scores = Object.fromEntries(Object.entries(s).map(([k, [score]]) => [k, score]));
    return { ok: true as const, results, scores };
  });
  const generateEvent = vi.fn(
    opts.generateEvent ??
      (async (input: EventNewsInput) => ({
        ok: true as const,
        output: {
          headline: `Headline ${input.eventTitle}`,
          bullets: ["Fact one.", "Fact two.", "Fact three."],
          sources: input.sources.map((_, index) => ({ index, point: `Point ${index}.` })),
          tags: ["ai"],
          concepts: opts.concepts ?? [],
        },
      })),
  );
  const generateConcept = vi.fn(
    opts.generateConcept ??
      (async ({ term }: { term: string }) => ({
        ok: true as const,
        output: { definition: `${term} defined.`, whyItMatters: "Because.", aliases: [] },
      })),
  );
  const generateSourcePoint = vi.fn(async () => ({ ok: true as const, point: "Late point." }));
  const deps: CurationDeps = {
    store: mem.store,
    sources: SOURCES,
    now: () => NOW,
    fetchAll: async () => opts.feeds ?? [],
    extract: opts.extract ?? (async () => ({ ok: true, rawExtract: BODY })),
    score,
    generateEvent,
    generateConcept,
    generateSourcePoint,
  };
  return { deps, mem, score, generateEvent, generateConcept, generateSourcePoint };
}

const itemOf = (mem: ReturnType<typeof createMemoryStore>, slug: string) =>
  [...mem.items.values()].find((i) => i.urlNormalized.endsWith(`/${slug}`));
const newsDrafts = (mem: ReturnType<typeof createMemoryStore>) => mem.drafts.filter((d) => d.kind === "NEWS");

describe("event threads (v2 R0.1, R3)", () => {
  it("merges two sources about the same event into one Thread draft (D13a)", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: [entry("o1", hoursAgo(1))] },
      { sourceId: "willison", items: [entry("w1", hoursAgo(2))] },
    ];
    const { deps, mem, generateEvent } = makeDeps({
      feeds,
      scores: (keys) => Object.fromEntries(keys.map((k, i) => [k, [9 - i, "OpenAI GPT 6.2"]])),
    });
    const summary = await runCuration(deps);

    expect(summary.drafted).toBe(1);
    expect(generateEvent).toHaveBeenCalledTimes(1);
    const [draft] = newsDrafts(mem);
    expect(draft.eventKey).toBe("openai-gpt-6-2");
    expect(draft.segments).toHaveLength(3);
    expect(draft.segments[0]).not.toContain("https://");
    expect(draft.segments[1]).toContain("Source: OPENAI — Point 0.");
    expect(draft.segments[1]).toContain("https://news.example/o1");
    expect(draft.segments[1]).not.toContain("utm_source");
    expect(draft.segments[2]).toContain("Source: WILLISON");
    expect(mem.events.get("openai-gpt-6-2")?.status).toBe("OPEN");
    expect(itemOf(mem, "o1")).toMatchObject({ status: "DRAFTED", eventKey: "openai-gpt-6-2" });
    expect(itemOf(mem, "w1")).toMatchObject({ status: "DRAFTED", eventKey: "openai-gpt-6-2" });
  });

  it("publishes a single-source event as a Thread too (R3.3)", async () => {
    const { deps, mem } = makeDeps({ feeds: [{ sourceId: "krebs", items: [entry("k", hoursAgo(1))] }] });
    await runCuration(deps);
    expect(newsDrafts(mem)[0].segments).toHaveLength(2);
  });

  it("caps at 3 events and 3 sources per event (R2.1)", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: ["a1", "a2", "a3", "a4"].map((s) => entry(s, hoursAgo(1))) },
      { sourceId: "krebs", items: ["b", "c", "d", "e"].map((s) => entry(s, hoursAgo(1))) },
    ];
    const { deps, mem, generateEvent } = makeDeps({
      feeds,
      scores: (keys) =>
        Object.fromEntries(
          keys.map((k) => {
            const slug = k.split("/").pop()!;
            return [k, [slug === "e" ? 5 : 8, slug.startsWith("a") ? "event-a" : `event-${slug}`]];
          }),
        ),
    });
    await runCuration(deps);
    expect(generateEvent).toHaveBeenCalledTimes(3);
    expect(generateEvent.mock.calls[0][0].sources.length).toBeLessThanOrEqual(3);
    expect(newsDrafts(mem).find((d) => d.eventKey === "event-a")?.segments).toHaveLength(4); // 요약 + 출처 3
  });

  it("skips an event whose sources all lack content without using a slot (R2.3)", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: [entry("thin", hoursAgo(1))] },
      { sourceId: "krebs", items: ["k1", "k2", "k3"].map((s) => entry(s, hoursAgo(1))) },
    ];
    const { deps, generateEvent, mem } = makeDeps({
      feeds,
      scores: (keys) => Object.fromEntries(keys.map((k) => [k, [k.endsWith("/thin") ? 9 : 7, `ev-${k.split("/").pop()}`]])),
      extract: async (url) => (url.includes("/thin") ? { ok: false } : { ok: true, rawExtract: BODY }),
    });
    await runCuration(deps);
    expect(itemOf(mem, "thin")).toMatchObject({ status: "SKIPPED", skipReason: "no_content" });
    expect(generateEvent).toHaveBeenCalledTimes(3);
  });

  it("spends the slot on a failed event write and marks its sources FAILED (R2.4)", async () => {
    const generateEvent = vi.fn(async () => ({ ok: false as const, reason: "ai_failed" as const }));
    const feeds: FeedResult[] = [{ sourceId: "openai", items: ["x", "y", "z", "w"].map((s) => entry(s, hoursAgo(1))) }];
    const { deps, mem } = makeDeps({ feeds, generateEvent });
    await runCuration(deps);
    expect(generateEvent).toHaveBeenCalledTimes(3);
    expect([...mem.items.values()].filter((i) => i.status === "FAILED")).toHaveLength(3);
  });

  it("adds number warnings against the combined source text (R3.4)", async () => {
    const { deps, mem } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }],
      generateEvent: async () => ({
        ok: true,
        output: { headline: "40% faster", bullets: ["1,200 users hit.", "Second fact."], sources: [], tags: ["ai"], concepts: [] },
      }),
    });
    await runCuration(deps);
    expect(newsDrafts(mem)[0].warnings).toContain("number_not_in_source:40");
    expect(newsDrafts(mem)[0].warnings).not.toContain("number_not_in_source:1200");
  });
});

describe("known events and late sources (v2 D1, D8, R5)", () => {
  it("passes recent events to the scorer (R1.1)", async () => {
    const { deps, score } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("n", hoursAgo(1))] }],
      seed: { events: [{ eventKey: "old-event", title: "Old", status: "PUBLISHED", draftId: null, updatedAt: hoursAgo(10) }] },
    });
    await runCuration(deps);
    expect(score.mock.calls[0][1].knownEvents?.map((e) => e.eventKey)).toContain("old-event");
  });

  it("appends a late source to an open event draft without using an event slot (R5.1)", async () => {
    const first = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o1", hoursAgo(3))] }], scores: (k) => ({ [k[0]]: [9, "gpt"] }) });
    await runCuration(first.deps);
    const { mem } = first;
    const second = {
      ...first.deps,
      fetchAll: async () => [{ sourceId: "willison", items: [entry("w1", hoursAgo(1))] }] as FeedResult[],
    };
    await runCuration(second);
    const draft = newsDrafts(mem)[0];
    expect(draft.segments).toHaveLength(3);
    expect(draft.segments[2]).toContain("Source: WILLISON — Late point.");
    expect(draft.warnings).toContain("source_added_later");
    expect(first.generateEvent).toHaveBeenCalledTimes(1);
    expect(first.generateSourcePoint).toHaveBeenCalledTimes(1);
  });

  it("skips late articles of a closed event (R5.2, D13e)", async () => {
    const { deps, mem, generateEvent } = makeDeps({
      feeds: [{ sourceId: "willison", items: [entry("w1", hoursAgo(1))] }],
      scores: (k) => ({ [k[0]]: [8, "gpt"] }),
      seed: { events: [{ eventKey: "gpt", title: "GPT", status: "PUBLISHED", draftId: null, updatedAt: hoursAgo(5) }] },
    });
    await runCuration(deps);
    expect(itemOf(mem, "w1")).toMatchObject({ status: "SKIPPED", skipReason: "event_closed" });
    expect(generateEvent).not.toHaveBeenCalled();
  });

  it("skips late articles when the event already has 3 sources (R5.2)", async () => {
    const feeds: FeedResult[] = [{ sourceId: "openai", items: ["s1", "s2", "s3"].map((s) => entry(s, hoursAgo(2))) }];
    const first = makeDeps({ feeds, scores: (keys) => Object.fromEntries(keys.map((k) => [k, [8, "big"]])) });
    await runCuration(first.deps);
    await runCuration({
      ...first.deps,
      fetchAll: async () => [{ sourceId: "krebs", items: [entry("s4", hoursAgo(1))] }] as FeedResult[],
    });
    expect(itemOf(first.mem, "s4")).toMatchObject({ status: "SKIPPED", skipReason: "event_full" });
  });
});

describe("concepts (v2 R4)", () => {
  const published: ConceptRow = {
    id: "c1",
    slug: "quantization",
    term: "Quantization",
    aliases: ["4-bit quantization"],
    status: "PUBLISHED",
    draftId: null,
  };

  it("reuses an existing concept via alias without a new draft (R4.1)", async () => {
    const { deps, mem, generateConcept } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }],
      concepts: [{ term: "4-bit Quantization", aliases: [] }],
      seed: { concepts: [published] },
    });
    await runCuration(deps);
    expect(generateConcept).not.toHaveBeenCalled();
    expect(newsDrafts(mem)[0].conceptSlugs).toEqual(["quantization"]);
    expect(mem.conceptEvents.size).toBe(1);
  });

  it("creates one concept draft and does not repeat it on the next run (R4.2, R4.3, D13d)", async () => {
    const { deps, mem, generateConcept } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }],
      concepts: [{ term: "Prompt Injection", aliases: [] }],
    });
    await runCuration(deps);
    await runCuration({
      ...deps,
      fetchAll: async () => [{ sourceId: "krebs", items: [entry("k", hoursAgo(1))] }] as FeedResult[],
    });
    expect(generateConcept).toHaveBeenCalledTimes(1);
    expect(mem.drafts.filter((d) => d.kind === "CONCEPT")).toHaveLength(1);
    expect(mem.concepts.get("promptinjection")?.status).toBe("PENDING");
  });

  it("leaves a failed concept PENDING without a draft while the news draft is created (R4.6)", async () => {
    const { deps, mem } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }],
      concepts: [{ term: "Distillation", aliases: [] }],
      generateConcept: async () => ({ ok: false, reason: "ai_failed" }),
    });
    await runCuration(deps);
    expect(newsDrafts(mem)).toHaveLength(1);
    expect(mem.concepts.get("distillation")).toMatchObject({ status: "PENDING", draftId: null });
  });

  it("planConcepts: rejected ignored, pending-without-draft regenerated, budget enforced (R4.4, R4.5)", () => {
    const existing: ConceptRow[] = [
      { ...published },
      { id: "c2", slug: "rag", term: "RAG", aliases: [], status: "REJECTED", draftId: null },
      { id: "c3", slug: "lora", term: "LoRA", aliases: [], status: "PENDING", draftId: null },
      { id: "c4", slug: "moe", term: "MoE", aliases: [], status: "PENDING", draftId: "d9" },
    ];
    const plan = planConcepts(
      [
        { term: "Quantization", aliases: [] },
        { term: "RAG", aliases: [] },
        { term: "LoRA", aliases: [] },
        { term: "MoE", aliases: [] },
        { term: "Speculative decoding", aliases: [] },
        { term: "KV cache", aliases: [] },
      ],
      existing,
      2,
    );
    expect(plan.slugs).toEqual(["quantization", "lora", "moe", "speculativedecoding"]);
    expect(plan.link.map((c) => c.slug)).toEqual(["quantization", "moe"]);
    expect(plan.draft.map((c) => c.slug)).toEqual(["lora", "speculativedecoding"]);
  });
});

describe("collection, freshness and scoring (v1 behaviour kept)", () => {
  it("ignores URLs already stored", async () => {
    const initial = [row({ id: "o1", sourceId: "openai", status: "DRAFTED" })];
    const { deps, score } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o1", hoursAgo(1))] }], initial });
    await runCuration(deps);
    expect(score).not.toHaveBeenCalled();
  });

  it("skips undated / stale items and does not store items older than 30 days", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: [entry("nodate", null), entry("old", hoursAgo(50)), entry("ancient", hoursAgo(40 * 24))] },
    ];
    const { deps, mem, score } = makeDeps({ feeds });
    await runCuration(deps);
    expect(score).not.toHaveBeenCalled();
    expect(itemOf(mem, "nodate")).toMatchObject({ status: "SKIPPED", skipReason: "no_date" });
    expect(itemOf(mem, "old")).toMatchObject({ status: "SKIPPED", skipReason: "stale" });
    expect(itemOf(mem, "ancient")).toBeUndefined();
  });

  it("treats total scoring failure as a system problem: records nothing and throws", async () => {
    const { deps, mem } = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("n", hoursAgo(1))] }], scores: () => null });
    await expect(runCuration(deps)).rejects.toBeInstanceOf(ScoringUnavailableError);
    expect(itemOf(mem, "n")).toBeUndefined();
  });

  it("passes new events from earlier chunks to later chunks (D14-2)", async () => {
    const items = Array.from({ length: 12 }, (_, i) => entry(`n${i}`, hoursAgo(1)));
    const { deps, score } = makeDeps({
      feeds: [{ sourceId: "openai", items }],
      scores: (keys) => (keys.length > 10 ? null : Object.fromEntries(keys.map((k) => [k, [7, "shared-event"]]))),
    });
    await runCuration(deps);
    expect(score).toHaveBeenCalledTimes(3);
    expect(score.mock.calls[2][1].knownEvents?.map((e) => e.eventKey)).toContain("shared-event");
  });

  it("throws AllFeedsFailedError when every feed fails", async () => {
    const feeds: FeedResult[] = [{ sourceId: "openai", error: new FeedFetchError("timeout", "timeout", "openai") }];
    const { deps } = makeDeps({ feeds });
    await expect(runCuration(deps)).rejects.toBeInstanceOf(AllFeedsFailedError);
  });

  it("caps scoring at 60 items, filled round-robin across sources", () => {
    const items = [
      ...Array.from({ length: 70 }, (_, i) => ({ sourceId: "openai", publishedAt: hoursAgo(i / 10), n: i })),
      ...Array.from({ length: 5 }, (_, i) => ({ sourceId: "krebs", publishedAt: hoursAgo(i), n: 100 + i })),
    ];
    const picked = roundRobinBySource(items, 60);
    expect(picked).toHaveLength(60);
    expect(picked.filter((p) => p.sourceId === "krebs")).toHaveLength(5);
  });

  it("groupByEvent: ranks events by top score and gives v1 candidates a title-based key (R9.1)", () => {
    const groups = groupByEvent([
      row({ id: "a", sourceId: "openai", score: 7, eventKey: "e1" }),
      row({ id: "b", sourceId: "krebs", score: 9, eventKey: "e1" }),
      row({ id: "c", sourceId: "willison", score: 8, eventKey: null, title: "Old v1 Item" }),
      row({ id: "d", sourceId: "schneier", score: 5, eventKey: "e3" }),
    ]);
    expect(groups.map((g) => g.eventKey)).toEqual(["e1", "old-v1-item"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("Gemini diff review regressions", () => {
  it("keeps sources DRAFTED when the concept step throws after the event draft was saved (#1)", async () => {
    const { deps, mem } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }],
      concepts: [{ term: "Boom", aliases: [] }],
    });
    deps.store.ensureConceptLinked = async () => {
      throw new Error("db hiccup");
    };
    await runCuration(deps);
    expect(newsDrafts(mem)).toHaveLength(1);
    expect(itemOf(mem, "o")?.status).toBe("DRAFTED");
  });

  it("skips an event whose key exists outside the 7-day window without calling the model (#3)", async () => {
    const { deps, mem, generateEvent } = makeDeps({
      feeds: [{ sourceId: "openai", items: [entry("o", hoursAgo(1))] }],
      scores: (k) => ({ [k[0]]: [9, "ancient-event"] }),
    });
    deps.store.findRecentEvents = async () => [];
    deps.store.findEventStatus = async (key) => (key === "ancient-event" ? "PUBLISHED" : null);
    await runCuration(deps);
    expect(generateEvent).not.toHaveBeenCalled();
    expect(itemOf(mem, "o")).toMatchObject({ status: "SKIPPED", skipReason: "event_closed" });
  });

  it("does not match concepts through empty normalized aliases (#8)", () => {
    const plan = planConcepts(
      [{ term: "Brand new idea", aliases: ["—"] }],
      [{ id: "x", slug: "other", term: "Other", aliases: ["…"], status: "REJECTED", draftId: null }],
      1,
    );
    expect(plan.draft.map((c) => c.slug)).toEqual(["brandnewidea"]);
  });
});

describe("event merge check (fix/event-grouping)", () => {
  it("merges candidate events the checker says are the same release into one Thread", async () => {
    const feeds: FeedResult[] = [
      { sourceId: "openai", items: [entry("php-a", hoursAgo(1))] },
      { sourceId: "krebs", items: [entry("php-b", hoursAgo(2))] },
    ];
    const { deps, mem, generateEvent } = makeDeps({
      feeds,
      scores: (keys) => Object.fromEntries(keys.map((k) => [k, [8, k.endsWith("/php-a") ? "phpaftershell-cve" : "php-fixes-7"]])),
    });
    deps.mergeEvents = vi.fn(async () => ({ ok: true as const, merges: [{ from: "php-fixes-7", into: "phpaftershell-cve" }] }));
    await runCuration(deps);
    expect(generateEvent).toHaveBeenCalledTimes(1);
    expect(newsDrafts(mem)).toHaveLength(1);
    expect(newsDrafts(mem)[0].segments).toHaveLength(3);
    expect(itemOf(mem, "php-b")?.eventKey).toBe("phpaftershell-cve");
  });

  it("routes a candidate merged into an open inbox event through the late-source path", async () => {
    const first = makeDeps({ feeds: [{ sourceId: "openai", items: [entry("o1", hoursAgo(3))] }], scores: (k) => ({ [k[0]]: [9, "php-release"] }) });
    await runCuration(first.deps);
    const second = {
      ...first.deps,
      fetchAll: async () => [{ sourceId: "krebs", items: [entry("k1", hoursAgo(1))] }] as FeedResult[],
      score: async (items: { key: string }[]) => ({
        ok: true as const,
        results: Object.fromEntries(items.map((i) => [i.key, { score: 8, event: "php-single-cve" }])),
        scores: Object.fromEntries(items.map((i) => [i.key, 8])),
      }),
      mergeEvents: async () => ({ ok: true as const, merges: [{ from: "php-single-cve", into: "php-release" }] }),
    };
    await runCuration(second);
    expect(first.generateEvent).toHaveBeenCalledTimes(1);
    expect(newsDrafts(first.mem)[0].segments).toHaveLength(3);
    expect(newsDrafts(first.mem)[0].warnings).toContain("source_added_later");
  });

  it("continues unchanged when the merge check fails", async () => {
    const feeds: FeedResult[] = [{ sourceId: "openai", items: [entry("a", hoursAgo(1)), entry("b", hoursAgo(1))] }];
    const { deps, generateEvent } = makeDeps({ feeds });
    deps.mergeEvents = async () => ({ ok: false as const });
    await runCuration(deps);
    expect(generateEvent).toHaveBeenCalledTimes(2);
  });
});
