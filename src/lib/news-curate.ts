import type { NewsSource } from "@/lib/news-sources";
import type { FeedEntry, FeedResult } from "@/lib/news-feed";
import { cleanUrl, normalizeUrl } from "@/lib/news-feed";
import type { GenerateInput, GenerateResult, ScoreInput, ScoreResult } from "@/lib/news-ai";
import { buildNewsBit, checkNumbers } from "@/lib/news-compose";

// 뉴스 큐레이션 오케스트레이터 (spec: news-curation T5).
// 정리 → 수집 → 신선도 → 채점 → 선정 → 본문 → 생성 → 저장.
// DB·네트워크·AI는 모두 deps로 주입한다 — 테스트와 --dry-run은 인메모리 store + 가짜 deps로 돈다.
// 이 모듈은 next/* 를 import하지 않는다 (GitHub Actions의 tsx 스크립트에서 실행, D3).

export const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000; // D6
export const FEED_ITEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // D5
export const MIN_SCORE = 6; // D7
export const MAX_SCORED_PER_RUN = 60; // D7
export const MAX_DRAFTS_PER_RUN = 3; // D2
export const MAX_ATTEMPTS = 2; // D14
export const MIN_CONTENT_CHARS = 200; // D8
export const SCORE_FALLBACK_CHUNK = 10; // 배치 채점 실패 시 나눠 재시도하는 크기 (Gemini diff review #2)

export type FeedItemStatus = "CANDIDATE" | "SKIPPED" | "FAILED" | "DRAFTED";

export type FeedItemRow = {
  id: string;
  url: string;
  urlNormalized: string;
  sourceId: string;
  title: string;
  summary: string | null;
  publishedAt: Date | null;
  score: number | null;
  status: FeedItemStatus;
  attempts: number;
};

export type NewFeedItem = Omit<FeedItemRow, "id" | "attempts"> & { skipReason?: string | null };

export type FeedItemPatch = Partial<Pick<FeedItemRow, "status" | "attempts">> & { skipReason?: string | null };

export interface CurationStore {
  deleteExpiredNewsDrafts(now: Date): Promise<number>;
  /** publishedAt이 cutoff 이전인 FeedItem 삭제. publishedAt 없는 항목은 지우지 않는다(D5). */
  purgeFeedItemsPublishedBefore(cutoff: Date): Promise<number>;
  findExistingNormalized(urls: string[]): Promise<Set<string>>;
  insertFeedItems(items: NewFeedItem[]): Promise<void>;
  /** CANDIDATE·FAILED 중 publishedAt < cutoff 인 항목을 SKIPPED(stale)로. */
  markStale(cutoff: Date): Promise<number>;
  /** 선정 풀: CANDIDATE + attempts < MAX_ATTEMPTS 인 FAILED. */
  findPool(): Promise<FeedItemRow[]>;
  updateFeedItem(id: string, patch: FeedItemPatch): Promise<void>;
  createNewsDraft(input: {
    feedItemId: string;
    sourceUrl: string;
    sourceTitle: string;
    sourceLabel: string;
    rawExtract: string;
    content: string;
    warnings: string[];
  }): Promise<void>;
}

export type ExtractFn = (url: string) => Promise<{ ok: true; rawExtract: string } | { ok: false }>;

export interface CurationDeps {
  store: CurationStore;
  sources: readonly NewsSource[];
  fetchAll: (sources: readonly NewsSource[]) => Promise<FeedResult[]>;
  extract: ExtractFn;
  score: (items: ScoreInput[]) => Promise<ScoreResult>;
  generate: (input: GenerateInput) => Promise<GenerateResult>;
  now?: () => Date;
  log?: (line: string) => void;
}

export type CurationSummary = {
  expiredDrafts: number;
  purgedItems: number;
  feedsOk: number;
  feedsFailed: number;
  newItems: number;
  skippedNew: number;
  scored: number;
  newCandidates: number;
  staled: number;
  selected: number;
  drafted: number;
  failed: number;
  skippedSelected: number;
};

/** 배치·묶음 채점이 모두 실패 — 인증·한도 같은 시스템 문제로 보고 아무것도 기록하지 않는다. */
export class ScoringUnavailableError extends Error {
  constructor() {
    super("scoring unavailable: every scoring call failed");
    this.name = "ScoringUnavailableError";
  }
}

export class AllFeedsFailedError extends Error {
  constructor() {
    super("all feeds failed");
    this.name = "AllFeedsFailedError";
  }
}

/** 소스별(최신순) 라운드로빈으로 최대 limit개를 고른다 — 한 소스의 채점 슬롯 독점 방지 (D7, G6). */
export function roundRobinBySource<T extends { sourceId: string; publishedAt: Date | null }>(items: T[], limit: number): T[] {
  const bySource = new Map<string, T[]>();
  for (const item of items) {
    const list = bySource.get(item.sourceId) ?? [];
    list.push(item);
    bySource.set(item.sourceId, list);
  }
  for (const list of bySource.values()) list.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));

  const picked: T[] = [];
  const queues = [...bySource.values()];
  while (picked.length < limit && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) picked.push(next);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

/** 점수 내림차순(동점은 최신 우선) → 소스당 1건 → 상위 limit건 (D7, R4.3). */
export function selectForDrafting(pool: FeedItemRow[], limit: number): FeedItemRow[] {
  const sorted = [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || time(b.publishedAt) - time(a.publishedAt));
  const usedSources = new Set<string>();
  const picked: FeedItemRow[] = [];
  for (const item of sorted) {
    if ((item.score ?? 0) < MIN_SCORE || usedSources.has(item.sourceId)) continue;
    usedSources.add(item.sourceId);
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** 6점 이상을 점수 내림차순(동점은 최신 우선)으로. 소스당 1건 제한은 생성 루프가 건다. */
function rankPool(pool: FeedItemRow[]): FeedItemRow[] {
  return pool
    .filter((i) => (i.score ?? 0) >= MIN_SCORE)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || time(b.publishedAt) - time(a.publishedAt));
}

function time(d: Date | null): number {
  return d ? d.getTime() : 0;
}

type FreshEntry = FeedEntry & { sourceId: string; urlNormalized: string };

export async function runCuration(deps: CurationDeps): Promise<CurationSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => {});
  const { store } = deps;
  const sourceById = new Map(deps.sources.map((s) => [s.id, s]));
  const freshCutoff = new Date(now.getTime() - FRESH_WINDOW_MS);

  const summary: CurationSummary = {
    expiredDrafts: 0,
    purgedItems: 0,
    feedsOk: 0,
    feedsFailed: 0,
    newItems: 0,
    skippedNew: 0,
    scored: 0,
    newCandidates: 0,
    staled: 0,
    selected: 0,
    drafted: 0,
    failed: 0,
    skippedSelected: 0,
  };

  // 1. 정리 (R8)
  summary.expiredDrafts = await store.deleteExpiredNewsDrafts(now);
  summary.purgedItems = await store.purgeFeedItemsPublishedBefore(new Date(now.getTime() - FEED_ITEM_RETENTION_MS));

  // 2. 수집 (R2, R7.1)
  const results = await deps.fetchAll(deps.sources);
  const entries: FreshEntry[] = [];
  const seenThisRun = new Set<string>();
  for (const r of results) {
    if ("error" in r) {
      summary.feedsFailed++;
      log(`feed ${r.sourceId} failed: ${r.error.message}`);
      continue;
    }
    summary.feedsOk++;
    for (const item of r.items) {
      const urlNormalized = normalizeUrl(item.url);
      if (seenThisRun.has(urlNormalized)) continue;
      seenThisRun.add(urlNormalized);
      entries.push({ ...item, sourceId: r.sourceId, urlNormalized });
    }
  }
  if (results.length > 0 && summary.feedsOk === 0) throw new AllFeedsFailedError(); // R7.3

  // 이미 본 URL은 상태와 무관하게 무시 (R2.4)
  const existing = await store.findExistingNormalized(entries.map((e) => e.urlNormalized));
  const unseen = entries.filter((e) => !existing.has(e.urlNormalized));
  summary.newItems = unseen.length;

  // 3. 신선도 (R3.1): 날짜 없음/오래됨은 즉시 SKIPPED로 기록
  const skipped: NewFeedItem[] = [];
  const fresh: FreshEntry[] = [];
  // 보관 기간(30일)보다 오래된 기사는 기록하지 않는다 — 기록하면 정리 단계가 지우고 다음 실행에서 다시 넣는
  // 삭제·재삽입이 매번 반복된다(첫 운영에서 실행당 ~1,450행). 기록하지 않아도 매번 신선도에서 걸러진다.
  const retentionCutoff = new Date(now.getTime() - FEED_ITEM_RETENTION_MS);
  for (const e of unseen) {
    if (!e.publishedAt) skipped.push(toNewItem(e, "SKIPPED", null, "no_date"));
    else if (e.publishedAt < retentionCutoff) continue;
    else if (e.publishedAt < freshCutoff) skipped.push(toNewItem(e, "SKIPPED", null, "stale"));
    else fresh.push(e);
  }
  if (skipped.length) await store.insertFeedItems(skipped);
  summary.skippedNew = skipped.length;

  // 기존 후보의 만료 (R3.2)
  summary.staled = await store.markStale(freshCutoff);

  // 4. 신규 항목 채점 — 보통 실행당 1회, 최대 60개 라운드로빈 (R4.1, R4.2).
  // 배치 전체가 실패하면(한 기사가 refusal을 유발하는 경우 등) 10개씩 나눠 1회 재시도하고,
  // 그래도 실패한 묶음은 SKIPPED(score_failed)로 기록한다 — 같은 기사가 매 실행 배치를 막지 않게 (R4.5 개정).
  const toScore = roundRobinBySource(fresh, MAX_SCORED_PER_RUN);
  if (toScore.length > 0) {
    const scoredItems: NewFeedItem[] = [];
    const record = (e: FreshEntry, s: number | undefined) => {
      if (s === undefined) return; // 모델이 빠뜨림 → 기록하지 않아 다음 실행에서 재채점
      const score = Math.round(s);
      if (score >= MIN_SCORE) {
        scoredItems.push(toNewItem(e, "CANDIDATE", score, null));
        summary.newCandidates++;
      } else {
        scoredItems.push(toNewItem(e, "SKIPPED", score, "low_score"));
      }
    };
    const scoreBatch = (batch: FreshEntry[]) =>
      deps.score(
        batch.map((e) => ({
          key: e.urlNormalized,
          title: e.title,
          summary: e.summary.slice(0, 600),
          sourceName: sourceById.get(e.sourceId)?.name ?? e.sourceId,
        })),
      );

    const whole = await scoreBatch(toScore);
    if (whole.ok) {
      for (const e of toScore) record(e, whole.scores[e.urlNormalized]);
    } else {
      log("batch scoring failed — retrying in chunks");
      const failedChunks: FreshEntry[][] = [];
      let anyChunkOk = false;
      for (let i = 0; i < toScore.length; i += SCORE_FALLBACK_CHUNK) {
        const chunk = toScore.slice(i, i + SCORE_FALLBACK_CHUNK);
        const r = await scoreBatch(chunk);
        if (r.ok) {
          anyChunkOk = true;
          for (const e of chunk) record(e, r.scores[e.urlNormalized]);
        } else {
          failedChunks.push(chunk);
        }
      }
      // 전부 실패 = 기사 탓이 아니라 시스템 문제(인증·한도·장애) → 기록 없이 실패로 끝내 다음 실행에서 재시도.
      if (!anyChunkOk) throw new ScoringUnavailableError();
      // 일부만 실패 = 그 묶음의 기사가 원인일 가능성 → SKIPPED(score_failed)로 막힘 방지.
      for (const chunk of failedChunks) {
        for (const e of chunk) scoredItems.push(toNewItem(e, "SKIPPED", null, "score_failed"));
        log(`chunk scoring failed — ${chunk.length} items skipped`);
      }
    }
    if (scoredItems.length) await store.insertFeedItems(scoredItems);
    summary.scored = scoredItems.filter((i) => i.score !== null).length;
  }

  // 5~7. 선정 → 본문 → 생성 → 저장 (R4.3, R4.4, R5, R6, R7.2)
  // 점수순으로 돌며 소스당 1건, 생성 시도(=Sonnet 호출)가 3건이 되면 멈춘다.
  // 본문 부족(no_content)은 모델을 부르지 않으므로 슬롯을 쓰지 않고 차순위가 대신 들어온다 (Gemini diff review #7).
  const ranked = rankPool(await store.findPool());
  const usedSources = new Set<string>();
  let attemptsThisRun = 0;
  for (const item of ranked) {
    if (attemptsThisRun >= MAX_DRAFTS_PER_RUN) break;
    if (usedSources.has(item.sourceId)) continue;
    const source = sourceById.get(item.sourceId);
    const sourceName = source?.name ?? item.sourceId;
    try {
      const rawExtract = await resolveContent(item, deps.extract);
      if (!rawExtract) {
        await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "no_content" });
        summary.skippedSelected++;
        continue;
      }
      usedSources.add(item.sourceId);
      attemptsThisRun++;
      summary.selected++;

      const gen = await deps.generate({ title: item.title, rawExtract, sourceName });
      const built = gen.ok
        ? buildNewsBit(gen.output, { url: cleanUrl(item.url), category: source?.category ?? "ai" })
        : null;
      if (!gen.ok || !built || !built.ok) {
        await recordFailure(store, item, summary, log, gen.ok ? (built && !built.ok ? built.reason : "build") : gen.reason);
        continue;
      }

      // 숫자 검사는 최종 본문의 headline·불릿 부분만 (500자 절삭·URL 제거 이후, URL·태그 줄 제외) (Gemini diff review #6)
      const numberWarnings = checkNumbers(built.content.split("\n\n")[0], rawExtract);
      await store.createNewsDraft({
        feedItemId: item.id,
        sourceUrl: item.url,
        sourceTitle: item.title,
        sourceLabel: sourceName,
        rawExtract,
        content: built.content,
        warnings: [...built.warnings, ...numberWarnings],
      });
      summary.drafted++;
    } catch (e) {
      await recordFailure(store, item, summary, log, e instanceof Error ? e.message : "error");
    }
  }

  log(
    `curation: feeds ok=${summary.feedsOk} failed=${summary.feedsFailed} | new=${summary.newItems} skipped=${summary.skippedNew} ` +
      `scored=${summary.scored} candidates=${summary.newCandidates} staled=${summary.staled} | selected=${summary.selected} ` +
      `drafted=${summary.drafted} failed=${summary.failed} no_content=${summary.skippedSelected} | ` +
      `expired_drafts=${summary.expiredDrafts} purged=${summary.purgedItems}`,
  );
  return summary;
}

function toNewItem(e: FreshEntry, status: FeedItemStatus, score: number | null, skipReason: string | null): NewFeedItem {
  return {
    url: e.url,
    urlNormalized: e.urlNormalized,
    sourceId: e.sourceId,
    title: e.title.slice(0, 500),
    summary: e.summary || null,
    publishedAt: e.publishedAt,
    score,
    status,
    skipReason,
  };
}

/**
 * readability 우선, 실패/부족하면 RSS summary. summary는 parseFeed에서 이미 태그 제거·엔티티 디코딩·절삭됐으므로
 * 다시 htmlToText를 돌리지 않는다(이중 디코딩·`<T>` 유실 방지). 둘 다 200자 미만이면 null (R5).
 */
async function resolveContent(item: FeedItemRow, extract: ExtractFn): Promise<string | null> {
  const extracted = await extract(item.url).catch(() => ({ ok: false as const }));
  if (extracted.ok && extracted.rawExtract.length >= MIN_CONTENT_CHARS) return extracted.rawExtract;
  const fallback = (item.summary ?? "").trim();
  return fallback.length >= MIN_CONTENT_CHARS ? fallback : null;
}

/** 생성 실패: attempts+1, MAX_ATTEMPTS에 닿으면 즉시 SKIPPED(gave_up) (D14, D15). */
async function recordFailure(
  store: CurationStore,
  item: FeedItemRow,
  summary: CurationSummary,
  log: (line: string) => void,
  reason: string,
): Promise<void> {
  const attempts = item.attempts + 1;
  summary.failed++;
  log(`draft failed for ${item.urlNormalized}: ${reason} (attempt ${attempts})`);
  if (attempts >= MAX_ATTEMPTS) {
    await store.updateFeedItem(item.id, { status: "SKIPPED", attempts, skipReason: "gave_up" });
  } else {
    await store.updateFeedItem(item.id, { status: "FAILED", attempts });
  }
}

/** 인메모리 store — 테스트와 --dry-run 용. */
export function createMemoryStore(initial: FeedItemRow[] = []) {
  const items = new Map<string, FeedItemRow & { skipReason?: string | null }>(initial.map((i) => [i.id, { ...i }]));
  const drafts: { feedItemId: string; content: string; warnings: string[]; createdAt: Date; sourceLabel: string }[] = [];
  let seq = 0;

  const store: CurationStore = {
    async deleteExpiredNewsDrafts() {
      return 0;
    },
    async purgeFeedItemsPublishedBefore(cutoff) {
      let n = 0;
      for (const [id, i] of items) if (i.publishedAt && i.publishedAt < cutoff && items.delete(id)) n++;
      return n;
    },
    async findExistingNormalized(urls) {
      const all = new Set([...items.values()].map((i) => i.urlNormalized));
      return new Set(urls.filter((u) => all.has(u)));
    },
    async insertFeedItems(newItems) {
      for (const n of newItems) {
        if ([...items.values()].some((i) => i.urlNormalized === n.urlNormalized)) continue;
        const id = `mem_${++seq}`;
        items.set(id, { ...n, id, attempts: 0 });
      }
    },
    async markStale(cutoff) {
      let n = 0;
      for (const i of items.values()) {
        if ((i.status === "CANDIDATE" || i.status === "FAILED") && i.publishedAt && i.publishedAt < cutoff) {
          i.status = "SKIPPED";
          i.skipReason = "stale";
          n++;
        }
      }
      return n;
    },
    async findPool() {
      return [...items.values()].filter(
        (i) => i.status === "CANDIDATE" || (i.status === "FAILED" && i.attempts < MAX_ATTEMPTS),
      );
    },
    async updateFeedItem(id, patch) {
      const i = items.get(id);
      if (i) Object.assign(i, patch);
    },
    async createNewsDraft(input) {
      drafts.push({ ...input, createdAt: new Date() });
      const i = items.get(input.feedItemId);
      if (i) i.status = "DRAFTED";
    },
  };
  return { store, items, drafts };
}
