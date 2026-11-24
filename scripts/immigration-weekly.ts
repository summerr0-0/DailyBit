/**
 * 이민 기사 주간 요약 (spec: specs/immigration-community/spec.md).
 * GitHub Actions 주 1번. CN드림 이민 뉴스에서 새 기사만 읽어 한국어로 요약하고 비공개 Thread "Canada PR weekly"에 남긴다.
 * 원문은 저장하지 않는다. 개인 정보는 AI에 보내지 않는다.
 *
 *   pnpm tsx scripts/immigration-weekly.ts            # 실행 (DB 기록)
 *   pnpm tsx scripts/immigration-weekly.ts --dry-run  # 최근 14일 기사로 요약만 출력, DB는 건드리지 않음
 */
import "dotenv/config";
import { FEED_TIMEOUT_MS, FEED_USER_AGENT } from "@/lib/news-feed";
import { runCommunityDigest, type CommunityStore } from "@/lib/immigration/community";
import { summarizeArticles } from "@/lib/immigration/community-ai";

const MAX_BYTES = 3 * 1024 * 1024;

// 정직한 UA로 요청한다 — 막히면 우회하지 않고 실패로 남긴다
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": FEED_USER_AGENT, Accept: "text/html;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS * 3),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error("response too large");
  return body;
}

function dryRunStore(): CommunityStore {
  return {
    getSeen: async () => null, // 첫 실행처럼 최근 7일 기사를 보여준다
    saveSeen: async (_k, ids) => console.log(`[dry-run] would mark ${ids.length} articles seen`),
    postNote: async (c) => console.log(`[dry-run] note:\n${c}\n`),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const store = dryRun ? dryRunStore() : (await import("@/lib/immigration/store")).createPrismaCommunityStore();
  const result = await runCommunityDigest(fetchText, store, (a) => summarizeArticles(a), {
    pause: () => new Promise((r) => setTimeout(r, 1000)), // 기사 사이 1초 — 사이트에 부담 주지 않게
  });
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun) await (await import("@/lib/prisma")).prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
