// 뉴스 자동 큐레이션 실행 스크립트 (spec: news-curation T5, R7, R11).
//   pnpm tsx scripts/curate.ts            — 운영: 피드 수집 → 운영 DB에 NEWS 초안 저장 (GitHub Actions)
//   pnpm tsx scripts/curate.ts --dry-run  — 픽스처 피드 + 가짜 AI + 인메모리 store. DB·네트워크·API 키 불필요 (CI 스모크)
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AllFeedsFailedError, createMemoryStore, runCuration, type CurationDeps } from "@/lib/news-curate";
import { NEWS_SOURCES } from "@/lib/news-sources";
import { fetchAllFeeds, parseFeed, type FeedResult } from "@/lib/news-feed";

const dryRun = process.argv.includes("--dry-run");

async function dryRunDeps(): Promise<{ deps: CurationDeps; report: () => void }> {
  const dir = path.join(process.cwd(), "src/lib/__fixtures__/feeds");
  const rss = parseFeed(readFileSync(path.join(dir, "rss.xml"), "utf8"));
  const atom = parseFeed(readFileSync(path.join(dir, "atom.xml"), "utf8"));
  const all = [...rss, ...atom];
  // 픽스처 기준 "지금" = 가장 최근 기사 + 1시간 → 신선도 판정이 픽스처 날짜와 무관하게 재현된다.
  const latest = Math.max(...all.map((e) => e.publishedAt?.getTime() ?? 0));
  const now = new Date(latest + 60 * 60 * 1000);
  const sources = NEWS_SOURCES.slice(0, 2);
  const results: FeedResult[] = [
    { sourceId: sources[0].id, items: rss },
    { sourceId: sources[1].id, items: atom },
  ];
  const { store, drafts, items } = createMemoryStore();
  const deps: CurationDeps = {
    store,
    sources,
    now: () => now,
    log: (l) => console.log(l),
    fetchAll: async () => results,
    extract: async () => ({ ok: true, rawExtract: "Fixture article body. ".repeat(20) + "Released 2 models." }),
    score: async (input) => ({ ok: true, scores: Object.fromEntries(input.map((i) => [i.key, 7])) }),
    generate: async ({ title }) => ({
      ok: true,
      output: { headline: title, bullets: ["Fixture fact one.", "Fixture fact two.", "Released 2 models."], tags: ["ai"] },
    }),
  };
  return {
    deps,
    report: () => {
      console.log(`dry-run: ${items.size} feed items, ${drafts.length} drafts`);
      for (const d of drafts) console.log(`--- draft (${d.sourceLabel}) warnings=${JSON.stringify(d.warnings)}\n${d.content}`);
      if (drafts.length === 0) throw new Error("dry-run produced no drafts");
    },
  };
}

async function prodDeps(): Promise<CurationDeps> {
  const [{ prismaCurationStore }, { extractSource }, ai] = await Promise.all([
    import("@/lib/news-curate-store"),
    import("@/lib/scrap-extract"),
    import("@/lib/news-ai"),
  ]);
  return {
    store: prismaCurationStore,
    sources: NEWS_SOURCES,
    log: (l) => console.log(l),
    fetchAll: (sources) => fetchAllFeeds(sources),
    extract: async (url) => {
      const r = await extractSource({ sourceType: "URL", url });
      return r.ok ? { ok: true, rawExtract: r.rawExtract } : { ok: false };
    },
    score: (items) => ai.scoreItems(items),
    generate: (input) => ai.generateNews(input),
  };
}

async function main(): Promise<number> {
  if (dryRun) {
    const { deps, report } = await dryRunDeps();
    await runCuration(deps);
    report();
    return 0;
  }
  const { prisma } = await import("@/lib/prisma");
  try {
    await runCuration(await prodDeps());
    return 0;
  } catch (e) {
    console.error(e instanceof AllFeedsFailedError ? "all feeds failed" : e);
    return 1;
  } finally {
    await prisma.$disconnect(); // R7.4: pg Pool이 남아 job이 hang하지 않게
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
