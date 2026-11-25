/**
 * 캐나다 영주권 알림 하루 1번 (spec: specs/immigration-daily/spec.md).
 * 선발 표(EE·BC PNP·AAIP, AI 없음) → IRCC·CIC News 관련 글(AI) → 월요일엔 CN드림 주간 요약(AI).
 * 결과는 비공개 Thread "Canada PR" 하나에 "오늘 요약" 머리 Bit + 상세 Bit로. 원문 저장·개인 정보 전송 없음.
 * 월요일엔 지난 7일을 쉬운 한국어 "이번 주 정리"로 만들어 /scrap 맨 위 카드에 보인다.
 *
 *   pnpm tsx scripts/immigration.ts             # 실행 (DB 기록)
 *   pnpm tsx scripts/immigration.ts --weekly    # 요일과 상관없이 CN드림 주간 요약도
 *   pnpm tsx scripts/immigration.ts --dry-run   # 읽고 요약만 출력, DB는 건드리지 않음
 */
import "dotenv/config";
import { FEED_TIMEOUT_MS, FEED_USER_AGENT } from "@/lib/news-feed";
import type { CommunityStore } from "@/lib/immigration/community";
import { summarizeArticles } from "@/lib/immigration/community-ai";
import { runDaily } from "@/lib/immigration/daily";
import { runWeeklyBriefing } from "@/lib/immigration/briefing";
import { writeBriefing } from "@/lib/immigration/briefing-ai";
import type { MonitorStore } from "@/lib/immigration/monitor";

const MAX_BYTES = 5 * 1024 * 1024;

// 정직한 UA로 요청한다 — 막히면 우회하지 않고 실패로 남긴다 (plan 5-1)
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": FEED_USER_AGENT, Accept: "text/html,application/json,application/xml;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS * 3),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error("response too large");
  return body;
}

const dryMonitor: MonitorStore = {
  existingKeys: async () => new Set(["(dry-run: pretend something is stored so new draws are listed)"]),
  insertDraws: async (d) => console.log(`[dry-run] would insert ${d.length} draws`),
  getSnapshot: async () => null,
  saveSnapshot: async () => {},
  postNote: async () => {},
};
const dryCommunity: CommunityStore = {
  getSeen: async () => null,
  saveSeen: async (k, ids) => console.log(`[dry-run] ${k}: would mark ${ids.length} seen`),
  postNote: async () => {},
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const weekly = process.argv.includes("--weekly") || new Date().getUTCDay() === 1;
  const store = dryRun ? null : await import("@/lib/immigration/store");

  const result = await runDaily({
    fetchText,
    monitorStore: store ? store.createPrismaMonitorStore() : dryMonitor,
    communityStore: store ? store.createPrismaCommunityStore() : dryCommunity,
    summarize: (a) => summarizeArticles(a),
    post: store ? store.privateNotePoster() : async (c) => console.log(`[dry-run] note:\n${c}\n`),
    weekly,
    pause: () => new Promise((r) => setTimeout(r, 1000)), // CN드림 기사 사이 1초 — 사이트에 부담 주지 않게
  });
  console.log(JSON.stringify(result, null, 2));

  // 이번 주 정리 — 오늘 알림까지 다 남긴 뒤 DB에서 지난 7일을 모은다. dry-run은 DB를 안 읽으니 건너뛴다
  let briefingFailed = false;
  if (weekly && store) {
    const briefing = await runWeeklyBriefing(store.createPrismaBriefingStore(), (i) => writeBriefing(i)).catch((e) => {
      console.error("briefing:", e);
      return null;
    });
    console.log(JSON.stringify({ briefing }, null, 2));
    briefingFailed = briefing === null;
  } else if (weekly) console.log("[dry-run] weekly briefing skipped (needs DB)");
  if (store) await (await import("@/lib/prisma")).prisma.$disconnect();

  // 하나라도 못 읽었거나 AI가 실패하면 실패로 끝내 Actions 알림 메일이 가게 한다 (알림은 이미 남긴 뒤)
  const m = result.monitor;
  const n = result.news;
  const w = result.weekly;
  const failed =
    result.errors.length > 0 ||
    !m ||
    m.programs.some((p) => p.error) ||
    m.pages.some((p) => p.status === "error") ||
    !n ||
    n.feeds.some((f) => f.error) ||
    !n.summarized ||
    (weekly && (!w || !w.summarized || w.listed === 0)) ||
    briefingFailed;
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
