/**
 * 캐나다 영주권 선발 모니터 (spec: specs/immigration-monitor/spec.md).
 * GitHub Actions 하루 1번. EE JSON, BC PNP·AAIP 선발 표, AAIP 공지 페이지를 읽어 새 선발만 DB에 넣고
 * 비공개 Bit로 알린다. AI·개인 정보는 쓰지 않는다.
 *
 *   pnpm tsx scripts/immigration.ts            # 실행 (DB 기록)
 *   pnpm tsx scripts/immigration.ts --dry-run  # 읽기만, 결과를 출력하고 DB는 건드리지 않음
 */
import "dotenv/config";
import { FEED_TIMEOUT_MS, FEED_USER_AGENT } from "@/lib/news-feed";
import { runMonitor, type MonitorStore } from "@/lib/immigration/monitor";

const MAX_BYTES = 5 * 1024 * 1024;

// 정직한 UA로 요청한다 — 막히면 우회하지 않고 실패로 남긴다 (plan 5-1)
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": FEED_USER_AGENT, Accept: "text/html,application/json;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS * 3),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error("response too large");
  return body;
}

function dryRunStore(): MonitorStore {
  return {
    existingKeys: async () => new Set(["(dry-run: pretend something is stored so new draws are listed)"]),
    insertDraws: async (d) => console.log(`[dry-run] would insert ${d.length} draws`),
    getSnapshot: async () => null,
    saveSnapshot: async () => {},
    postNote: async (c) => console.log(`[dry-run] note:\n${c}\n`),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const store = dryRun ? dryRunStore() : (await import("@/lib/immigration/store")).createPrismaMonitorStore();
  const result = await runMonitor(fetchText, store);
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun) await (await import("@/lib/prisma")).prisma.$disconnect();
  // 하나라도 못 읽었으면 실패로 끝내 Actions 알림 메일이 가게 한다
  const failed = result.programs.filter((p) => p.error).length + result.pages.filter((p) => p.status === "error").length;
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
