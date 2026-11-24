/**
 * 이민 뉴스 요약 (spec: specs/immigration-news/spec.md, specs/immigration-community/spec.md).
 * GitHub Actions 하루 1번.
 *   - 매일: IRCC 보도자료·CIC News RSS의 새 글 중 개발자 영주권에 관련 있는 글만 → 비공개 Thread "Canada PR news"
 *   - 월요일: CN드림 이민 뉴스 주간 요약 → 비공개 Thread "Canada PR weekly"
 * 원문은 저장하지 않는다. 개인 정보는 AI에 보내지 않는다.
 *
 *   pnpm tsx scripts/immigration-news.ts             # 실행 (DB 기록)
 *   pnpm tsx scripts/immigration-news.ts --weekly    # 요일과 상관없이 CN드림 주간 요약도
 *   pnpm tsx scripts/immigration-news.ts --dry-run   # 첫 실행처럼 읽고 요약만 출력, DB는 건드리지 않음
 */
import "dotenv/config";
import { FEED_TIMEOUT_MS, FEED_USER_AGENT } from "@/lib/news-feed";
import { runCommunityDigest, type CommunityStore } from "@/lib/immigration/community";
import { runNewsDigest } from "@/lib/immigration/news-digest";
import { summarizeArticles } from "@/lib/immigration/community-ai";
import { NEWS_THREAD_TITLE, WEEKLY_THREAD_TITLE } from "@/lib/immigration/sources";

const MAX_BYTES = 3 * 1024 * 1024;

// 정직한 UA로 요청한다 — 막히면 우회하지 않고 실패로 남긴다
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": FEED_USER_AGENT, Accept: "text/html,application/xml;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS * 3),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error("response too large");
  return body;
}

function dryRunStore(label: string): CommunityStore {
  return {
    getSeen: async () => null,
    saveSeen: async (k, ids) => console.log(`[dry-run] ${k}: would mark ${ids.length} seen`),
    postNote: async (c) => console.log(`[dry-run] ${label} note:\n${c}\n`),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const weekly = process.argv.includes("--weekly") || new Date().getUTCDay() === 1;
  const storeFor = async (title: string) =>
    dryRun ? dryRunStore(title) : (await import("@/lib/immigration/store")).createPrismaCommunityStore(title);
  const summarize = (a: Parameters<typeof summarizeArticles>[0]) => summarizeArticles(a);

  const news = await runNewsDigest(fetchText, await storeFor(NEWS_THREAD_TITLE), summarize);
  console.log(JSON.stringify({ news }, null, 2));

  let weeklyFailed = false;
  if (weekly) {
    const digest = await runCommunityDigest(fetchText, await storeFor(WEEKLY_THREAD_TITLE), summarize, {
      pause: () => new Promise((r) => setTimeout(r, 1000)), // 기사 사이 1초 — 사이트에 부담 주지 않게
    });
    console.log(JSON.stringify({ digest }, null, 2));
    weeklyFailed = !digest.summarized || digest.listed === 0; // Gemini news #5
  }
  if (!dryRun) await (await import("@/lib/prisma")).prisma.$disconnect();
  // 피드를 못 읽었거나 AI가 실패하면 실패로 끝내 Actions 알림 메일이 가게 한다
  if (news.feeds.some((f) => f.error) || !news.summarized || weeklyFailed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
