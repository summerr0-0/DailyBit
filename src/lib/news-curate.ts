import type { NewsCategory, NewsSource } from "@/lib/news-sources";
import type { FeedEntry, FeedResult } from "@/lib/news-feed";
import { cleanUrl, normalizeUrl } from "@/lib/news-feed";
import type {
  ConceptInput,
  ConceptResult,
  EventNewsInput,
  EventNewsResult,
  EventScoreResult,
  KnownEvent,
  MergeInput,
  MergeResult,
  ScoreInput,
  ScoreOptions,
  SourcePointInput,
  SourcePointResult,
} from "@/lib/news-ai";
import {
  buildConceptThread,
  buildNewsThread,
  buildSourceBit,
  cleanTags,
  checkNumbersMulti,
  findBannedPhrases,
  keepAllowedWikiLinks,
  stripUrls,
} from "@/lib/news-compose";
import { findSplitSuspects, normalizeConceptSlug, normalizeEventKey } from "@/lib/news-events";

// 뉴스 큐레이션 오케스트레이터 (spec: news-curation T5, news-curation-v2 T5).
// 정리 → 수집 → 신선도 → 채점·사건 묶기 → 늦은 출처 → 사건 선정 → 본문 → 종합 작성 → 개념 → 저장.
// DB·네트워크·AI는 모두 deps로 주입한다 — 테스트와 --dry-run은 인메모리 store + 가짜 deps로 돈다.
// 이 모듈은 next/* 를 import하지 않는다 (GitHub Actions의 tsx 스크립트에서 실행).

export const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000; // v1 D6
export const FEED_ITEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // v1 D5
export const KNOWN_EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // v2 D1
export const MIN_SCORE = 6; // v1 D7
/** 보안 뉴스가 너무 많이 와서 기준을 올린다 (2026-11-22 요청: 14일간 초안 24개 중 보안 24, AI 3). */
export const MIN_SCORE_BY_CATEGORY: Partial<Record<NewsCategory, number>> = { security: 8 };
export function minScoreFor(category: NewsCategory | undefined): number {
  return (category && MIN_SCORE_BY_CATEGORY[category]) ?? MIN_SCORE;
}
export const MAX_SCORED_PER_RUN = 60; // v1 D7
export const MAX_EVENTS_PER_RUN = 3; // v2 D2 (사건 작성 시도 수) — AI·보안
/** 개발(Java·Spring·React·Next.js·Node.js) 사건은 AI·보안과 따로, 최근 24시간 기준 최대 5개 (2026-11-20 요청) */
export const MAX_DEV_EVENTS_PER_DAY = 5;
export const DEV_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_SOURCES_PER_EVENT = 3; // v2 D2
export const MAX_LATE_SOURCES_PER_RUN = 3; // v2 D8
export const MAX_CONCEPT_DRAFTS_PER_RUN = 2; // v2 D6
export const MAX_ATTEMPTS = 2; // v1 D14
export const MIN_CONTENT_CHARS = 200; // v1 D8
export const SCORE_FALLBACK_CHUNK = 10;
const RAW_EXTRACT_MAX = 20_000;

/** @deprecated v1 이름 — MAX_EVENTS_PER_RUN 사용 */
export const MAX_DRAFTS_PER_RUN = MAX_EVENTS_PER_RUN;

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
  eventKey: string | null;
};

export type NewFeedItem = Omit<FeedItemRow, "id" | "attempts"> & { skipReason?: string | null };

export type FeedItemPatch = Partial<Pick<FeedItemRow, "status" | "attempts" | "eventKey">> & { skipReason?: string | null };

export type EventStatus = "OPEN" | "PUBLISHED" | "DISCARDED" | "EXPIRED";
export type RecentEvent = { eventKey: string; title: string; status: EventStatus };
export type OpenEventDraft = { draftId: string; updatedAt: Date; sourceCount: number };
export type ConceptRow = {
  id: string;
  slug: string;
  term: string;
  aliases: string[];
  status: "PENDING" | "PUBLISHED" | "REJECTED";
  draftId: string | null;
};

export interface CurationStore {
  /** NEWS(3일)·CONCEPT(7일) 만료 + 사건/개념 상태 갱신 (v2 D12, D14-9). */
  expireDrafts(now: Date): Promise<number>;
  /** publishedAt이 cutoff 이전인 FeedItem 삭제. publishedAt 없는 항목은 지우지 않는다. */
  purgeFeedItemsPublishedBefore(cutoff: Date): Promise<number>;
  findExistingNormalized(urls: string[]): Promise<Set<string>>;
  insertFeedItems(items: NewFeedItem[]): Promise<void>;
  /** CANDIDATE·FAILED 중 publishedAt < cutoff 인 항목을 SKIPPED(stale)로. */
  markStale(cutoff: Date): Promise<number>;
  /** 선정 풀: CANDIDATE + attempts < MAX_ATTEMPTS 인 FAILED. */
  findPool(): Promise<FeedItemRow[]>;
  updateFeedItem(id: string, patch: FeedItemPatch): Promise<void>;
  /** updatedAt이 since 이후인 NewsEvent (상태 무관). */
  findRecentEvents(since: Date): Promise<RecentEvent[]>;
  /** 기간과 무관하게 사건 키의 현재 상태 (없으면 null) — 7일 목록 밖의 오래된 사건과의 충돌 방지 (Gemini diff #3). */
  findEventStatus(eventKey: string): Promise<EventStatus | null>;
  /** OPEN 사건의 초안 정보 — 출처 수는 FeedItem(DRAFTED, eventKey) 기준 (D14-4). */
  findOpenEventDraft(eventKey: string): Promise<OpenEventDraft | null>;
  /** since 이후 만들어진 사건 중 sourceIds 출처의 기사(DRAFTED)를 하나라도 가진 사건 수 — 개발 뉴스 일일 상한용. */
  countEventsWithSourcesSince(since: Date, sourceIds: string[]): Promise<number>;
  /** 한 트랜잭션: NewsEvent + ScrapDraft + FeedItem DRAFTED. 같은 키가 있으면 EventKeyConflictError. */
  createEventDraft(input: {
    eventKey: string;
    title: string;
    segments: string[];
    threadTitle: string;
    sourceFeedItemIds: string[];
    sourceUrl: string;
    sourceTitle: string;
    sourceLabel: string;
    rawExtract: string;
    warnings: string[];
    conceptSlugs: string[];
  }): Promise<void>;
  /** 낙관적 잠금 — 0행이면 false (D14-4). */
  appendSourceToDraft(draftId: string, expectedUpdatedAt: Date, bit: string, feedItemId: string, eventKey: string): Promise<boolean>;
  findConcepts(): Promise<ConceptRow[]>;
  /** Concept(PENDING) 확보 + ConceptEvent 연결. 있으면 연결만. */
  ensureConceptLinked(input: { slug: string; term: string; aliases: string[]; eventKey: string }): Promise<void>;
  /** 한 트랜잭션: ScrapDraft(CONCEPT) + Concept.draftId. 자격이 없으면 ConceptNotEligibleError. */
  createConceptDraft(input: {
    slug: string;
    term: string;
    aliases: string[];
    eventKey: string;
    segments: string[];
    threadTitle: string;
  }): Promise<void>;
}

export type ExtractFn = (url: string) => Promise<{ ok: true; rawExtract: string } | { ok: false }>;

export interface CurationDeps {
  store: CurationStore;
  sources: readonly NewsSource[];
  fetchAll: (sources: readonly NewsSource[]) => Promise<FeedResult[]>;
  extract: ExtractFn;
  score: (items: ScoreInput[], opts: ScoreOptions) => Promise<EventScoreResult>;
  generateEvent: (input: EventNewsInput) => Promise<EventNewsResult>;
  generateConcept: (input: ConceptInput) => Promise<ConceptResult>;
  generateSourcePoint: (input: SourcePointInput) => Promise<SourcePointResult>;
  /** 작성 전 사건 병합 확인 (Haiku 1회). 없으면 건너뛴다. */
  mergeEvents?: (input: MergeInput) => Promise<MergeResult>;
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
  lateSourcesAdded: number;
  eventsAttempted: number;
  /** 그중 개발 카테고리 사건 */
  devEventsAttempted: number;
  drafted: number;
  failed: number;
  skippedSelected: number;
  conceptDrafts: number;
  /** v1 호환 이름 */
  selected: number;
};

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

/** store가 사건 키 충돌을 알리는 오류 이름 (scrap-drafts의 EventKeyConflictError와 이름으로 맞춘다). */
function isEventKeyConflict(e: unknown): boolean {
  return e instanceof Error && e.name === "EventKeyConflictError";
}
function isConceptNotEligible(e: unknown): boolean {
  return e instanceof Error && e.name === "ConceptNotEligibleError";
}

/** 소스별(최신순) 라운드로빈으로 최대 limit개를 고른다 — 한 소스의 채점 슬롯 독점 방지. */
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

export type EventGroup = { eventKey: string; items: FeedItemRow[]; score: number };

/** 6점 이상 풀을 사건 키로 묶고 사건 점수(최고점)순 정렬. 키 없는 v1 후보는 제목으로 키를 만든다 (v2 D2, R9.1). */
export function groupByEvent(pool: FeedItemRow[], minScore: (item: FeedItemRow) => number = () => MIN_SCORE): EventGroup[] {
  const groups = new Map<string, FeedItemRow[]>();
  for (const item of pool) {
    if ((item.score ?? 0) < minScore(item)) continue;
    const key = item.eventKey || normalizeEventKey(item.title) || `item-${item.id}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([eventKey, items]) => {
      const sorted = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || time(b.publishedAt) - time(a.publishedAt));
      return { eventKey, items: sorted, score: sorted[0].score ?? 0 };
    })
    .sort((a, b) => b.score - a.score || time(b.items[0].publishedAt) - time(a.items[0].publishedAt));
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
  const sourceName = (id: string) => sourceById.get(id)?.name ?? id;
  const itemMinScore = (i: { sourceId: string }) => minScoreFor(sourceById.get(i.sourceId)?.category);
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
    lateSourcesAdded: 0,
    eventsAttempted: 0,
    devEventsAttempted: 0,
    drafted: 0,
    failed: 0,
    skippedSelected: 0,
    conceptDrafts: 0,
    selected: 0,
  };

  // 1. 정리
  summary.expiredDrafts = await store.expireDrafts(now);
  summary.purgedItems = await store.purgeFeedItemsPublishedBefore(new Date(now.getTime() - FEED_ITEM_RETENTION_MS));

  // 2. 수집
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
  if (results.length > 0 && summary.feedsOk === 0) throw new AllFeedsFailedError();

  const existing = await store.findExistingNormalized(entries.map((e) => e.urlNormalized));
  const unseen = entries.filter((e) => !existing.has(e.urlNormalized));
  summary.newItems = unseen.length;

  // 3. 신선도 — 30일 넘은 기사는 저장하지 않는다(삭제·재삽입 반복 방지)
  const skipped: NewFeedItem[] = [];
  const fresh: FreshEntry[] = [];
  const retentionCutoff = new Date(now.getTime() - FEED_ITEM_RETENTION_MS);
  for (const e of unseen) {
    if (!e.publishedAt) skipped.push(toNewItem(e, "SKIPPED", null, "no_date"));
    else if (e.publishedAt < retentionCutoff) continue;
    else if (e.publishedAt < freshCutoff) skipped.push(toNewItem(e, "SKIPPED", null, "stale"));
    else fresh.push(e);
  }
  if (skipped.length) await store.insertFeedItems(skipped);
  summary.skippedNew = skipped.length;
  summary.staled = await store.markStale(freshCutoff);

  // 4. 채점 + 사건 묶기 (v2 D1, D14-2): 최근 7일 사건 목록을 주고, 청크 모드에선 앞 청크의 새 사건을 누적한다.
  const recentEvents = await store.findRecentEvents(new Date(now.getTime() - KNOWN_EVENT_WINDOW_MS));
  const knownEvents: KnownEvent[] = recentEvents.map((e) => ({ eventKey: e.eventKey, title: e.title }));
  const toScore = roundRobinBySource(fresh, MAX_SCORED_PER_RUN);
  if (toScore.length > 0) {
    const scoredItems: NewFeedItem[] = [];
    const newEvents = new Map<string, string>(); // key → title (이번 실행에서 처음 나온 사건)
    const record = (e: FreshEntry, r: { score: number; event: string } | undefined) => {
      if (!r) return; // 모델이 빠뜨림 → 다음 실행에서 재채점
      const score = Math.round(r.score);
      const eventKey = normalizeEventKey(r.event) || normalizeEventKey(e.title) || null;
      if (score >= itemMinScore(e)) {
        scoredItems.push({ ...toNewItem(e, "CANDIDATE", score, null), eventKey });
        summary.newCandidates++;
        if (eventKey && !knownEvents.some((k) => k.eventKey === eventKey) && !newEvents.has(eventKey)) {
          newEvents.set(eventKey, e.title);
        }
      } else {
        scoredItems.push({ ...toNewItem(e, "SKIPPED", score, "low_score"), eventKey });
      }
    };
    const scoreBatch = (batch: FreshEntry[]) =>
      deps.score(
        batch.map((e) => ({
          key: e.urlNormalized,
          title: e.title,
          summary: e.summary.slice(0, 600),
          sourceName: sourceName(e.sourceId),
        })),
        { knownEvents: [...knownEvents, ...[...newEvents].map(([eventKey, title]) => ({ eventKey, title }))] },
      );

    const whole = await scoreBatch(toScore);
    if (whole.ok) {
      for (const e of toScore) record(e, whole.results[e.urlNormalized]);
    } else {
      log("batch scoring failed — retrying in chunks");
      const failedChunks: FreshEntry[][] = [];
      let anyChunkOk = false;
      for (let i = 0; i < toScore.length; i += SCORE_FALLBACK_CHUNK) {
        const chunk = toScore.slice(i, i + SCORE_FALLBACK_CHUNK);
        const r = await scoreBatch(chunk); // 앞 청크에서 나온 새 사건이 knownEvents에 누적돼 들어간다
        if (r.ok) {
          anyChunkOk = true;
          for (const e of chunk) record(e, r.results[e.urlNormalized]);
        } else {
          failedChunks.push(chunk);
        }
      }
      if (!anyChunkOk) throw new ScoringUnavailableError();
      for (const chunk of failedChunks) {
        for (const e of chunk) scoredItems.push(toNewItem(e, "SKIPPED", null, "score_failed"));
        log(`chunk scoring failed — ${chunk.length} items skipped`);
      }
    }
    if (scoredItems.length) await store.insertFeedItems(scoredItems);
    summary.scored = scoredItems.filter((i) => i.score !== null).length;

    for (const s of findSplitSuspects([...newEvents].map(([eventKey, title]) => ({ eventKey, title })))) {
      log(`event_split_suspect ${s.a} ${s.b} (${s.overlap.toFixed(2)})`);
    }
  }

  let groups = groupByEvent(await store.findPool(), itemMinScore);
  const eventStatus = new Map(recentEvents.map((e) => [e.eventKey, e.status]));

  // 4.5 작성 전 병합 확인: 채점 때 따로 키가 붙은 같은 사건(예: 같은 패치의 다른 CVE 기사)을 합친다.
  // 새 사건 후보 상위 15개 + 인박스의 열린 사건을 Haiku 1회로 확인. 실패하면 그대로 진행한다.
  const newCandidates = groups.filter((g) => !eventStatus.has(g.eventKey)).slice(0, 15);
  const openEvents = recentEvents.filter((e) => e.status === "OPEN").map((e) => ({ eventKey: e.eventKey, title: e.title }));
  if (deps.mergeEvents && newCandidates.length > 0 && newCandidates.length + openEvents.length >= 2) {
    const merged = await deps.mergeEvents({
      candidates: newCandidates.map((g) => ({ eventKey: g.eventKey, titles: g.items.map((i) => i.title) })),
      openEvents,
    });
    if (merged.ok && merged.merges.length > 0) {
      const into = new Map(merged.merges.map((m) => [m.from, m.into]));
      for (const g of groups) {
        const target = into.get(g.eventKey);
        if (!target) continue;
        log(`event merge ${g.eventKey} -> ${target}`);
        for (const item of g.items) {
          item.eventKey = target;
          await store.updateFeedItem(item.id, { eventKey: target });
        }
      }
      groups = groupByEvent(groups.flatMap((g) => g.items), itemMinScore);
    } else if (!merged.ok) {
      log("event merge check failed — continuing without it");
    }
  }

  // 5. 늦은 출처 (v2 D8, D14-4/6/7): 사건 슬롯을 쓰지 않는다. 이미 있는 사건 키는 새 사건으로 쓰지 않는다.
  let lateCalls = 0;
  const newEventGroups: EventGroup[] = [];
  for (const group of groups) {
    const status = eventStatus.get(group.eventKey);
    if (!status) {
      newEventGroups.push(group);
      continue;
    }
    if (status !== "OPEN") {
      for (const item of group.items) await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "event_closed" });
      continue;
    }
    for (const item of group.items) {
      const open = await store.findOpenEventDraft(group.eventKey);
      if (!open) {
        await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "event_closed" });
        continue;
      }
      if (open.sourceCount >= MAX_SOURCES_PER_EVENT) {
        await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "event_full" });
        continue;
      }
      if (lateCalls >= MAX_LATE_SOURCES_PER_RUN) break; // 나머지는 CANDIDATE로 다음 실행
      const rawExtract = await resolveContent(item, deps.extract);
      if (!rawExtract) {
        await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "no_content" });
        summary.skippedSelected++;
        continue;
      }
      lateCalls++;
      const eventTitle = recentEvents.find((e) => e.eventKey === group.eventKey)?.title ?? item.title;
      const point = await deps.generateSourcePoint({
        eventTitle,
        source: { name: sourceName(item.sourceId), title: item.title, rawExtract },
      });
      if (!point.ok) {
        await recordFailure(store, item, summary, log, "source_point_failed");
        continue;
      }
      const cleanedPoint = stripUrls(point.point).text;
      const bit = buildSourceBit({ name: sourceName(item.sourceId), url: cleanUrl(item.url), point: cleanedPoint });
      const appended = await store.appendSourceToDraft(open.draftId, open.updatedAt, bit, item.id, group.eventKey);
      if (appended) {
        summary.lateSourcesAdded++;
        const banned = findBannedPhrases(cleanedPoint);
        if (banned.length) log(`late source for ${group.eventKey} has ${banned.join(",")}`);
      } else {
        log(`late source for ${group.eventKey} deferred: draft changed during run`);
      }
    }
  }

  // 6. 새 사건 작성 (v2 D2~D7): AI·보안은 실행당 3회, 개발은 최근 24시간 5개까지 — 슬롯을 따로 쓴다.
  // 본문 부족으로 모델을 안 부른 사건은 슬롯을 쓰지 않는다. 상한에 밀린 사건은 CANDIDATE로 남아 다음 실행에서 다시 경쟁한다.
  let concepts = await store.findConcepts();
  let conceptDraftsThisRun = 0;
  const devSourceIds = deps.sources.filter((s) => s.category === "dev").map((s) => s.id);
  const isDevItem = (i: FeedItemRow) => sourceById.get(i.sourceId)?.category === "dev";
  const devBudget =
    devSourceIds.length === 0
      ? 0
      : Math.max(
          0,
          MAX_DEV_EVENTS_PER_DAY -
            (await store.countEventsWithSourcesSince(new Date(now.getTime() - DEV_EVENT_WINDOW_MS), devSourceIds)),
        );
  let generalAttempted = 0;
  for (const group of newEventGroups) {
    const generalFull = generalAttempted >= MAX_EVENTS_PER_RUN;
    const devFull = summary.devEventsAttempted >= devBudget;
    if (generalFull && devFull) break;
    // 개발 출처가 하나도 없으면 개발 슬롯을 쓸 수 없다 — 본문 추출 전에 거른다
    if (generalFull && !group.items.some(isDevItem)) continue;

    // 7일 목록 밖의 오래된 사건과 키가 같으면 모델을 부르기 전에 정리한다 (Gemini diff #3, D14-7)
    const priorStatus = await store.findEventStatus(group.eventKey);
    if (priorStatus) {
      for (const item of group.items) await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "event_closed" });
      log(`event ${group.eventKey} already exists (${priorStatus}) — skipped`);
      continue;
    }

    const withContent: { item: FeedItemRow; rawExtract: string }[] = [];
    for (const item of group.items) {
      if (withContent.length >= MAX_SOURCES_PER_EVENT) break; // 본문 부족은 건너뛰고 다음 후보로 채운다 (Gemini diff #10)
      const rawExtract = await resolveContent(item, deps.extract);
      if (rawExtract) withContent.push({ item, rawExtract });
      else {
        await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "no_content" });
        summary.skippedSelected++;
      }
    }
    if (withContent.length === 0) continue;
    // 개발 사건 판정은 실제로 초안에 들어갈 출처 기준 — 저장소 집계(DRAFTED 개발 출처)와 일치시킨다 (Gemini dev #1)
    const dev = withContent.some((w) => isDevItem(w.item));
    if (dev ? devFull : generalFull) continue; // 남은 출처는 CANDIDATE로 다음 실행

    summary.eventsAttempted++;
    summary.selected++;
    if (dev) summary.devEventsAttempted++;
    else generalAttempted++;
    const items = withContent.map((w) => w.item);
    const lead = items[0];
    let draftedThisEvent = false;
    try {
      const gen = await deps.generateEvent({
        eventTitle: lead.title,
        sources: withContent.map((w) => ({ name: sourceName(w.item.sourceId), title: w.item.title, rawExtract: w.rawExtract })),
        knownConcepts: concepts.filter((c) => c.status !== "REJECTED").map((c) => c.term),
      });
      if (!gen.ok) {
        for (const item of items) await recordFailure(store, item, summary, log, gen.reason);
        continue;
      }
      const built = buildNewsThread(
        gen.output,
        items.map((i) => ({
          name: sourceName(i.sourceId),
          url: cleanUrl(i.url),
          category: sourceById.get(i.sourceId)?.category ?? "ai",
          tag: sourceById.get(i.sourceId)?.tag,
        })),
      );
      if (!built.ok) {
        for (const item of items) await recordFailure(store, item, summary, log, built.reason);
        continue;
      }

      // 개념 정리 (v2 D5, D14-5): 기존 개념 매칭 → 재사용 / 새 개념은 실행당 2개까지만
      const plan = planConcepts(gen.output.concepts, concepts, MAX_CONCEPT_DRAFTS_PER_RUN - conceptDraftsThisRun);
      // 본문 [[개념]] 링크: 이번 사건에 연결되는 개념어(+별칭)만 남긴다 (spec wiki-links D5)
      // 상한에 걸린 개념도 괄호는 남긴다 — 나중에 그 개념이 생기면 자동으로 링크가 된다 (Gemini wiki #6, D2)
      const linkTerms = [
        ...concepts.filter((c) => c.status !== "REJECTED").flatMap((c) => [c.term, ...c.aliases]),
        ...gen.output.concepts.flatMap((c) => [c.term, ...c.aliases]),
      ];
      built.segments = built.segments.map((seg) => keepAllowedWikiLinks(seg, linkTerms));

      const warnings = [
        ...built.warnings,
        ...checkNumbersMulti(
          built.segments.map((seg) => seg.split("\n").filter((line) => !/^https?:\/\//.test(line)).join("\n")).join("\n"),
          withContent.map((w) => w.rawExtract),
        ),
      ];
      try {
        await store.createEventDraft({
          eventKey: group.eventKey,
          title: lead.title,
          segments: built.segments,
          threadTitle: built.threadTitle,
          sourceFeedItemIds: items.map((i) => i.id),
          sourceUrl: lead.url,
          sourceTitle: lead.title,
          sourceLabel: items.map((i) => sourceName(i.sourceId)).join(" + "),
          rawExtract: withContent.map((w) => w.rawExtract).join("\n\n---\n\n").slice(0, RAW_EXTRACT_MAX),
          warnings: [...new Set(warnings)],
          conceptSlugs: plan.slugs,
        });
      } catch (e) {
        if (!isEventKeyConflict(e)) throw e;
        // 경합으로 같은 키가 방금 생겼다 — 반복 소모를 막기 위해 SKIPPED (Gemini diff #3)
        for (const item of items) await store.updateFeedItem(item.id, { status: "SKIPPED", skipReason: "event_key_conflict" });
        log(`event ${group.eventKey} conflicted on save — items skipped`);
        continue;
      }
      summary.drafted++;
      draftedThisEvent = true;

      for (const c of plan.link) await store.ensureConceptLinked({ ...c, eventKey: group.eventKey });
      for (const c of plan.draft) {
        await store.ensureConceptLinked({ ...c, eventKey: group.eventKey });
        conceptDraftsThisRun++;
        const cg = await deps.generateConcept({ term: c.term, contextTitle: built.threadTitle });
        if (!cg.ok) {
          log(`concept ${c.slug} draft failed — stays PENDING without a draft`);
          continue;
        }
        const ct = buildConceptThread({
          term: c.term,
          definition: cg.output.definition,
          whyItMatters: cg.output.whyItMatters,
          // 뉴스 요약과 같은 규칙의 첫 태그 — 대표 태그가 목록 밖이어도 모델 태그로 채운다 (Gemini tag-fix #2)
          tags: cleanTags(gen.output.tags ?? [], sourceById.get(lead.sourceId)?.tag ?? sourceById.get(lead.sourceId)?.category ?? "ai").slice(0, 1),
        });
        try {
          await store.createConceptDraft({
            slug: c.slug,
            term: c.term,
            aliases: [...new Set([...c.aliases, ...cg.output.aliases])],
            eventKey: group.eventKey,
            segments: ct.segments,
            threadTitle: ct.threadTitle,
          });
          summary.conceptDrafts++;
        } catch (e) {
          if (!isConceptNotEligible(e)) throw e;
          log(`concept ${c.slug} not eligible for a new draft`);
        }
      }
      if (plan.draft.length) concepts = await store.findConcepts();
    } catch (e) {
      // 초안이 이미 저장된 뒤(개념 처리 중) 난 에러는 기사 상태를 되돌리지 않는다 (Gemini diff #1)
      if (draftedThisEvent) log(`concept step failed for ${group.eventKey}: ${e instanceof Error ? e.message : e}`);
      else for (const item of items) await recordFailure(store, item, summary, log, e instanceof Error ? e.message : "error");
    }
  }

  log(
    `curation: feeds ok=${summary.feedsOk} failed=${summary.feedsFailed} | new=${summary.newItems} skipped=${summary.skippedNew} ` +
      `scored=${summary.scored} candidates=${summary.newCandidates} staled=${summary.staled} | late_sources=${summary.lateSourcesAdded} ` +
      `events=${summary.eventsAttempted} (dev=${summary.devEventsAttempted}/${devBudget}) drafted=${summary.drafted} failed=${summary.failed} no_content=${summary.skippedSelected} ` +
      `concept_drafts=${summary.conceptDrafts} | expired_drafts=${summary.expiredDrafts} purged=${summary.purgedItems}`,
  );
  return summary;
}

export type ConceptPlan = {
  /** 뉴스 초안에 남길 slug (기존 개념 slug 또는 새로 만들 slug) */
  slugs: string[];
  /** 기존 개념 — 사건 연결만 */
  link: { slug: string; term: string; aliases: string[] }[];
  /** 개념 초안을 만들 것 (새 개념, 또는 PENDING·초안 없음) */
  draft: { slug: string; term: string; aliases: string[] }[];
};

/**
 * 추출된 개념을 기존 개념과 대조한다 (v2 D5, D14-5, R4.1~R4.5).
 * - slug·별칭 정규화 일치 → 기존 개념. PUBLISHED는 링크, PENDING·초안 없음은 초안 재생성, PENDING·초안 있음은 링크, REJECTED는 버림
 * - 일치 없음 → 새 개념. 남은 상한(budget) 안에서만 초안, 넘치면 slug도 버린다
 */
export function planConcepts(
  extracted: { term: string; aliases: string[] }[],
  existing: ConceptRow[],
  budget: number,
): ConceptPlan {
  const plan: ConceptPlan = { slugs: [], link: [], draft: [] };
  let remaining = Math.max(0, budget);
  for (const c of extracted) {
    const slug = normalizeConceptSlug(c.term);
    if (!slug || plan.slugs.includes(slug)) continue;
    const candidates = [slug, ...c.aliases.map(normalizeConceptSlug)].filter(Boolean);
    const match = existing.find(
      (e) =>
        candidates.includes(e.slug) ||
        e.aliases.some((a) => {
          const n = normalizeConceptSlug(a);
          return n !== "" && candidates.includes(n);
        }),
    );
    if (match) {
      if (match.status === "REJECTED" || plan.slugs.includes(match.slug)) continue;
      const entry = { slug: match.slug, term: match.term, aliases: match.aliases };
      if (match.status === "PENDING" && !match.draftId && remaining > 0) {
        plan.draft.push(entry);
        remaining--;
      } else {
        plan.link.push(entry);
      }
      plan.slugs.push(match.slug);
      continue;
    }
    if (remaining <= 0) continue; // 상한 초과 — Concept 행도 slug도 만들지 않는다
    plan.draft.push({ slug, term: c.term, aliases: c.aliases });
    plan.slugs.push(slug);
    remaining--;
  }
  return plan;
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
    eventKey: null,
  };
}

/** readability 우선, 실패/부족하면 RSS summary(이미 정제됨). 둘 다 200자 미만이면 null. */
async function resolveContent(item: FeedItemRow, extract: ExtractFn): Promise<string | null> {
  const extracted = await extract(item.url).catch(() => ({ ok: false as const }));
  if (extracted.ok && extracted.rawExtract.length >= MIN_CONTENT_CHARS) return extracted.rawExtract;
  const fallback = (item.summary ?? "").trim();
  return fallback.length >= MIN_CONTENT_CHARS ? fallback : null;
}

/** 생성 실패: attempts+1, MAX_ATTEMPTS에 닿으면 즉시 SKIPPED(gave_up). */
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

/** createdAt 없음 = 이 store에서 방금 만든 사건 (개발 일일 상한 계산 시 "지금"으로 본다) */
type MemEvent = RecentEvent & { draftId: string | null; updatedAt: Date; createdAt?: Date };
type MemDraft = {
  id: string;
  kind: "NEWS" | "CONCEPT";
  eventKey: string;
  segments: string[];
  threadTitle: string;
  warnings: string[];
  conceptSlugs: string[];
  sourceLabel: string;
  updatedAt: Date;
};

/** 인메모리 store — 테스트와 --dry-run 용. */
export function createMemoryStore(initial: FeedItemRow[] = [], seed: { events?: MemEvent[]; concepts?: ConceptRow[] } = {}) {
  const items = new Map<string, FeedItemRow & { skipReason?: string | null }>(
    initial.map((i) => [i.id, { ...i, eventKey: i.eventKey ?? null }]),
  );
  const events = new Map<string, MemEvent>((seed.events ?? []).map((e) => [e.eventKey, { ...e }]));
  const concepts = new Map<string, ConceptRow>((seed.concepts ?? []).map((c) => [c.slug, { ...c }]));
  const conceptEvents = new Set<string>();
  const drafts: MemDraft[] = [];
  let seq = 0;
  let clock = 0;
  const tick = () => new Date(Date.UTC(2026, 0, 1) + ++clock);

  const store: CurationStore = {
    async expireDrafts() {
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
    async findRecentEvents() {
      return [...events.values()].map(({ eventKey, title, status }) => ({ eventKey, title, status }));
    },
    async findEventStatus(eventKey) {
      return events.get(eventKey)?.status ?? null;
    },
    async findOpenEventDraft(eventKey) {
      const ev = events.get(eventKey);
      if (!ev || ev.status !== "OPEN" || !ev.draftId) return null;
      const draft = drafts.find((d) => d.id === ev.draftId);
      if (!draft) return null;
      const sourceCount = [...items.values()].filter((i) => i.eventKey === eventKey && i.status === "DRAFTED").length;
      return { draftId: draft.id, updatedAt: draft.updatedAt, sourceCount };
    },
    async countEventsWithSourcesSince(since, sourceIds) {
      const ids = new Set(sourceIds);
      const keys = new Set(
        [...items.values()].filter((i) => i.status === "DRAFTED" && i.eventKey && ids.has(i.sourceId)).map((i) => i.eventKey),
      );
      return [...events.values()].filter((e) => keys.has(e.eventKey) && (!e.createdAt || e.createdAt >= since)).length;
    },
    async createEventDraft(input) {
      if (events.has(input.eventKey)) {
        const err = new Error(`event ${input.eventKey} exists`);
        err.name = "EventKeyConflictError";
        throw err;
      }
      const id = `draft_${++seq}`;
      drafts.push({
        id,
        kind: "NEWS",
        eventKey: input.eventKey,
        segments: [...input.segments],
        threadTitle: input.threadTitle,
        warnings: input.warnings,
        conceptSlugs: input.conceptSlugs,
        sourceLabel: input.sourceLabel,
        updatedAt: tick(),
      });
      events.set(input.eventKey, { eventKey: input.eventKey, title: input.title, status: "OPEN", draftId: id, updatedAt: tick() });
      for (const fid of input.sourceFeedItemIds) {
        const i = items.get(fid);
        if (i) Object.assign(i, { status: "DRAFTED", eventKey: input.eventKey });
      }
    },
    async appendSourceToDraft(draftId, expectedUpdatedAt, bit, feedItemId, eventKey) {
      const d = drafts.find((x) => x.id === draftId);
      if (!d || d.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return false;
      d.segments.push(bit);
      if (!d.warnings.includes("source_added_later")) d.warnings.push("source_added_later");
      d.updatedAt = tick();
      const i = items.get(feedItemId);
      if (i) Object.assign(i, { status: "DRAFTED", eventKey });
      return true;
    },
    async findConcepts() {
      return [...concepts.values()].map((c) => ({ ...c }));
    },
    async ensureConceptLinked({ slug, term, aliases, eventKey }) {
      if (!concepts.has(slug)) concepts.set(slug, { id: `concept_${++seq}`, slug, term, aliases, status: "PENDING", draftId: null });
      conceptEvents.add(`${slug}|${eventKey}`);
    },
    async createConceptDraft(input) {
      const c = concepts.get(input.slug);
      if (!c || c.status !== "PENDING" || c.draftId) {
        const err = new Error(`concept ${input.slug} not eligible`);
        err.name = "ConceptNotEligibleError";
        throw err;
      }
      const id = `draft_${++seq}`;
      drafts.push({
        id,
        kind: "CONCEPT",
        eventKey: input.eventKey,
        segments: input.segments,
        threadTitle: input.threadTitle,
        warnings: [],
        conceptSlugs: [input.slug],
        sourceLabel: input.term,
        updatedAt: tick(),
      });
      c.draftId = id;
      c.aliases = input.aliases;
    },
  };
  return { store, items, drafts, events, concepts, conceptEvents };
}
