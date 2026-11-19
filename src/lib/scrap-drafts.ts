import { prisma } from "@/lib/prisma";
import { ensureDevUser, createBit } from "@/lib/bits";
import { createThread } from "@/lib/threads";
import { threadUrl } from "@/lib/site-url";
import {
  appendSourceSegment,
  expiryCutoffs,
  isStale,
  planConceptPublish,
  relatedNewsBit,
  SOURCE_ADDED_LATER,
} from "@/lib/draft-hooks";

// ScrapDraft CRUD + 발행 (spec: tech-scrap T5/T6 / R3, R4).
// segments는 문자열 배열로 저장한다. 각 문자열이 발행 후보 Bit 1개이며, 태그는 본문 인라인 #hashtag로 들어간다.
// 세그먼트 1개면 단일 Bit, 2개 이상이면 Thread로 발행한 뒤 draft를 삭제한다.

const MAX_SEGMENT_CHARS = 500;
const MAX_THREAD_TITLE_CHARS = 100;

export type ScrapSourceType = "URL" | "TEXT" | "YOUTUBE";
export type DraftKind = "MANUAL" | "NEWS" | "CONCEPT";

export type ScrapDraftDTO = {
  id: string;
  sourceType: ScrapSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
  segments: string[];
  suggestedThreadTitle: string | null;
  kind: DraftKind;
  sourceLabel: string | null;
  warnings: string[];
  eventKey: string | null;
  conceptSlugs: string[];
  conceptId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScrapDraftRow = {
  id: string;
  sourceType: ScrapSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
  segments: unknown;
  suggestedThreadTitle: string | null;
  kind: DraftKind;
  sourceLabel: string | null;
  warnings: string[];
  eventKey: string | null;
  conceptSlugs: string[];
  conceptId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const DRAFT_SELECT = {
  id: true,
  sourceType: true,
  sourceUrl: true,
  sourceTitle: true,
  rawExtract: true,
  segments: true,
  suggestedThreadTitle: true,
  kind: true,
  sourceLabel: true,
  warnings: true,
  eventKey: true,
  conceptSlugs: true,
  conceptId: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toSegments(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

function toDraftDTO(row: ScrapDraftRow): ScrapDraftDTO {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    rawExtract: row.rawExtract,
    segments: toSegments(row.segments),
    suggestedThreadTitle: row.suggestedThreadTitle,
    kind: row.kind,
    sourceLabel: row.sourceLabel,
    warnings: row.warnings,
    eventKey: row.eventKey,
    conceptSlugs: row.conceptSlugs,
    conceptId: row.conceptId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createDraft(input: {
  sourceType: ScrapSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
  segments: string[];
  suggestedThreadTitle: string | null;
}): Promise<ScrapDraftDTO> {
  const author = await ensureDevUser();
  const row = await prisma.scrapDraft.create({
    data: {
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      rawExtract: input.rawExtract,
      segments: input.segments,
      suggestedThreadTitle: input.suggestedThreadTitle,
      authorId: author.id,
    },
    select: DRAFT_SELECT,
  });
  return toDraftDTO(row as ScrapDraftRow);
}

/**
 * 자동 뉴스 초안을 저장하고 FeedItem을 DRAFTED로 바꾼다 — 한 트랜잭션 (spec: news-curation D10, R6.6).
 * 수동 스크랩은 createDraft를 그대로 쓴다.
 */
export async function createNewsDraft(input: {
  feedItemId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceLabel: string;
  rawExtract: string;
  content: string;
  warnings: string[];
}): Promise<ScrapDraftDTO> {
  const author = await ensureDevUser();
  const row = await prisma.$transaction(async (tx) => {
    const draft = await tx.scrapDraft.create({
      data: {
        kind: "NEWS",
        sourceType: "URL",
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        sourceLabel: input.sourceLabel,
        rawExtract: input.rawExtract,
        segments: [input.content],
        suggestedThreadTitle: null,
        warnings: input.warnings,
        feedItemId: input.feedItemId,
        authorId: author.id,
      },
      select: DRAFT_SELECT,
    });
    await tx.feedItem.update({ where: { id: input.feedItemId }, data: { status: "DRAFTED" } });
    return draft;
  });
  return toDraftDTO(row as ScrapDraftRow);
}

/** 오너 전용 draft 목록 (최신순). kind를 주면 해당 종류만, 없으면 전체 (R9.1). */
export async function getDrafts(opts: { kind?: DraftKind } = {}): Promise<ScrapDraftDTO[]> {
  const author = await ensureDevUser();
  const rows = await prisma.scrapDraft.findMany({
    where: { authorId: author.id, ...(opts.kind ? { kind: opts.kind } : {}) },
    orderBy: { createdAt: "desc" },
    select: DRAFT_SELECT,
  });
  return rows.map((r) => toDraftDTO(r as ScrapDraftRow));
}

export async function getDraft(id: string): Promise<ScrapDraftDTO | null> {
  const row = await prisma.scrapDraft.findUnique({ where: { id }, select: DRAFT_SELECT });
  return row ? toDraftDTO(row as ScrapDraftRow) : null;
}

// ---------------------------------------------------------------------------
// v2: 사건·개념 초안 (spec: news-curation-v2 D7–D10, D12, D14)
// ---------------------------------------------------------------------------

/** 같은 eventKey의 NewsEvent가 이미 있다 — 아무것도 쓰지 않았다 (R3.5, D14-7). */
export class EventKeyConflictError extends Error {
  constructor(readonly eventKey: string) {
    super(`NewsEvent already exists: ${eventKey}`);
    this.name = "EventKeyConflictError";
  }
}

/** 개념이 이미 초안을 갖고 있거나 PENDING이 아니다 — 초안을 만들지 않았다 (D5). */
export class ConceptNotEligibleError extends Error {
  constructor(readonly slug: string) {
    super(`Concept not eligible for a new draft: ${slug}`);
    this.name = "ConceptNotEligibleError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * 사건 초안 저장 — 한 트랜잭션: NewsEvent(OPEN) + ScrapDraft(NEWS) + NewsEvent.draftId + 출처 FeedItem DRAFTED·eventKey
 * (D9, D14-1, R3.5). eventKey가 이미 있으면 EventKeyConflictError (부분 저장 없음).
 */
export async function createEventDraft(input: {
  eventKey: string;
  title: string;
  segments: string[];
  threadTitle: string;
  sourceFeedItemIds: string[];
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceLabel: string | null;
  rawExtract: string;
  warnings: string[];
  conceptSlugs: string[];
}): Promise<ScrapDraftDTO> {
  const author = await ensureDevUser();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.newsEvent.findUnique({
        where: { eventKey: input.eventKey },
        select: { id: true },
      });
      if (existing) throw new EventKeyConflictError(input.eventKey);

      const event = await tx.newsEvent.create({
        data: { eventKey: input.eventKey, title: input.title, status: "OPEN" },
        select: { id: true },
      });
      const draft = await tx.scrapDraft.create({
        data: {
          kind: "NEWS",
          sourceType: "URL",
          sourceUrl: input.sourceUrl,
          sourceTitle: input.sourceTitle,
          sourceLabel: input.sourceLabel,
          rawExtract: input.rawExtract,
          segments: input.segments,
          suggestedThreadTitle: input.threadTitle.slice(0, MAX_THREAD_TITLE_CHARS),
          warnings: input.warnings,
          eventKey: input.eventKey,
          conceptSlugs: input.conceptSlugs,
          authorId: author.id,
        },
        select: DRAFT_SELECT,
      });
      await tx.newsEvent.update({ where: { id: event.id }, data: { draftId: draft.id } });
      if (input.sourceFeedItemIds.length > 0) {
        await tx.feedItem.updateMany({
          where: { id: { in: input.sourceFeedItemIds } },
          data: { status: "DRAFTED", eventKey: input.eventKey },
        });
      }
      return draft;
    });
    return toDraftDTO(row as ScrapDraftRow);
  } catch (err) {
    // 동시 실행 경합: findUnique 이후 다른 트랜잭션이 같은 eventKey를 만든 경우
    if (isUniqueViolation(err)) throw new EventKeyConflictError(input.eventKey);
    throw err;
  }
}

/**
 * 개념 초안 저장 — 한 트랜잭션: Concept upsert(PENDING) + ScrapDraft(CONCEPT) + Concept.draftId + ConceptEvent upsert
 * (D5, D14-3). 기존 Concept가 PENDING·초안 없음이 아니면 ConceptNotEligibleError.
 */
export async function createConceptDraft(input: {
  slug: string;
  term: string;
  aliases: string[];
  eventKey: string;
  segments: string[];
  threadTitle: string;
}): Promise<ScrapDraftDTO> {
  const author = await ensureDevUser();
  const row = await prisma.$transaction(async (tx) => {
    const concept = await tx.concept.upsert({
      where: { slug: input.slug },
      create: { slug: input.slug, term: input.term, aliases: input.aliases, status: "PENDING" },
      update: {},
      select: { id: true, status: true, draftId: true },
    });
    if (concept.status !== "PENDING" || concept.draftId) throw new ConceptNotEligibleError(input.slug);

    const draft = await tx.scrapDraft.create({
      data: {
        kind: "CONCEPT",
        sourceType: "TEXT",
        sourceTitle: input.term,
        rawExtract: "",
        segments: input.segments,
        suggestedThreadTitle: input.threadTitle.slice(0, MAX_THREAD_TITLE_CHARS),
        conceptId: concept.id,
        eventKey: null,
        authorId: author.id,
      },
      select: DRAFT_SELECT,
    });
    await tx.concept.update({
      where: { id: concept.id },
      data: { draftId: draft.id, aliases: { set: [...new Set(input.aliases.filter(Boolean))] } },
    });
    await tx.conceptEvent.upsert({
      where: { conceptId_eventKey: { conceptId: concept.id, eventKey: input.eventKey } },
      create: { conceptId: concept.id, eventKey: input.eventKey },
      update: {},
    });
    return draft;
  }).catch((err: unknown) => {
    // 동시 실행 경합(Concept.draftId unique 등) → 자격 없음으로 처리 (Gemini diff review #9)
    if (isUniqueViolation(err)) throw new ConceptNotEligibleError(input.slug);
    throw err;
  });
  return toDraftDTO(row as ScrapDraftRow);
}

/**
 * 늦은 출처를 열린 사건 초안 segments 맨 끝에 붙인다 — 낙관적 잠금 (D8, D14-4, D14-6).
 * draft.updatedAt이 expectedUpdatedAt과 다르면(그 사이 변경) 아무것도 쓰지 않고 false.
 */
export async function appendSourceToDraft(
  draftId: string,
  expectedUpdatedAt: Date,
  bit: string,
  feedItemId: string,
  eventKey: string,
  warning: string = SOURCE_ADDED_LATER,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.scrapDraft.findUnique({
      where: { id: draftId },
      select: { segments: true, warnings: true, updatedAt: true },
    });
    if (!draft || isStale(draft.updatedAt, expectedUpdatedAt)) return false;

    const next = appendSourceSegment(toSegments(draft.segments), draft.warnings, bit, warning);
    const { count } = await tx.scrapDraft.updateMany({
      where: { id: draftId, updatedAt: expectedUpdatedAt },
      data: { segments: next.segments, warnings: next.warnings },
    });
    if (count === 0) return false;

    await tx.feedItem.update({ where: { id: feedItemId }, data: { status: "DRAFTED", eventKey } });
    // 사건도 최근 활동으로 표시 — 최근 사건 목록·관련 뉴스 정렬에 반영 (Gemini diff review #9)
    await tx.newsEvent.updateMany({ where: { eventKey, status: "OPEN" }, data: { status: "OPEN" } });
    return true;
  });
}

/**
 * draft를 삭제(폐기)한다 — API·cron 공통 단일 삭제 경로 (D12, D14-9). 대상이 없으면 false.
 * - NEWS(eventKey) → NewsEvent DISCARDED, draftId 비움
 * - CONCEPT → Concept REJECTED, draftId 비움
 * - v1(eventKey 없음)·MANUAL → 삭제만 (R9.1)
 */
export async function deleteDraft(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.scrapDraft.findUnique({
      where: { id },
      select: { kind: true, eventKey: true, conceptId: true },
    });
    if (!draft) return false;
    const { count } = await tx.scrapDraft.deleteMany({ where: { id } });
    if (count === 0) return false;

    if (draft.kind === "NEWS" && draft.eventKey) {
      await tx.newsEvent.updateMany({
        where: { eventKey: draft.eventKey, status: "OPEN" },
        data: { status: "DISCARDED", draftId: null },
      });
    } else if (draft.kind === "CONCEPT" && draft.conceptId) {
      await tx.concept.updateMany({
        where: { id: draft.conceptId, draftId: id, status: "PENDING" },
        data: { status: "REJECTED", draftId: null },
      });
    }
    return true;
  });
}

/**
 * 만료 정리 (D10, D14-9) — updatedAt 기준 NEWS 3일 / CONCEPT 7일. 초안마다 한 트랜잭션.
 * - NEWS(eventKey) → NewsEvent EXPIRED, draftId 비움 / v1 NEWS → 삭제만
 * - CONCEPT → Concept PENDING 유지, draftId 비움 (다음 등장 시 재생성 가능)
 * - MANUAL → 건드리지 않음
 * 삭제 직전 updatedAt을 다시 확인해 그 사이 cron이 출처를 붙인 초안은 건너뛴다.
 */
export async function expireDrafts(now: Date = new Date()): Promise<number> {
  const cutoff = expiryCutoffs(now);
  const candidates = await prisma.scrapDraft.findMany({
    where: {
      OR: [
        { kind: "NEWS", updatedAt: { lt: cutoff.news } },
        { kind: "CONCEPT", updatedAt: { lt: cutoff.concept } },
      ],
    },
    select: { id: true, kind: true, eventKey: true, conceptId: true },
  });

  let expired = 0;
  for (const d of candidates) {
    const deleted = await prisma.$transaction(async (tx) => {
      const { count } = await tx.scrapDraft.deleteMany({
        where: { id: d.id, updatedAt: { lt: d.kind === "CONCEPT" ? cutoff.concept : cutoff.news } },
      });
      if (count === 0) return false;
      if (d.kind === "NEWS" && d.eventKey) {
        await tx.newsEvent.updateMany({
          where: { eventKey: d.eventKey, status: "OPEN" },
          data: { status: "EXPIRED", draftId: null },
        });
      } else if (d.kind === "CONCEPT" && d.conceptId) {
        await tx.concept.updateMany({ where: { id: d.conceptId }, data: { draftId: null } });
      }
      return true;
    });
    if (deleted) expired++;
  }
  return expired;
}

/** 1단계 호환 이름 — expireDrafts로 위임 (news-curate-store가 사용). */
export async function deleteExpiredNewsDrafts(now: Date = new Date()): Promise<number> {
  return expireDrafts(now);
}

export type PublishResult =
  | { ok: true; kind: "bit" | "thread"; id: string }
  | { ok: false; reason: "not_found" | "empty" | "too_long" | "stale"; index?: number };

/** 발행된 draft를 지운다 (발행 경로 — 폐기 훅 없음). */
async function removePublishedDraft(id: string): Promise<void> {
  await prisma.scrapDraft.deleteMany({ where: { id } });
}

async function createThreadWithBits(title: string, segments: string[]): Promise<string> {
  const thread = await createThread(title.slice(0, MAX_THREAD_TITLE_CHARS));
  try {
    for (const content of segments) {
      await createBit({ content, threadId: thread.id, aiCollab: "LED" });
    }
  } catch (e) {
    // 중간 실패 시 반쯤 만들어진 Thread를 남기지 않는다 (Gemini diff review #2)
    await prisma.bit.deleteMany({ where: { threadId: thread.id } }).catch(() => {});
    await prisma.thread.deleteMany({ where: { id: thread.id } }).catch(() => {});
    throw e;
  }
  return thread.id;
}

/**
 * 편집된 세그먼트로 draft를 발행한다.
 * - 버전 확인(D8, R7.1): expectedUpdatedAt이 DB 값과 다르면 { stale } (아무것도 발행 안 함).
 * - 서버 재검증(D13): 각 세그먼트 1~500자. 초과 시 { too_long, index } 반환(아무것도 발행 안 함).
 * - v1(MANUAL·eventKey 없는 NEWS): 세그먼트 1개 → 단일 Bit, 2개 이상 → Thread + Bit들 (R9.1).
 * - v2 NEWS(eventKey): 항상 Thread, 끝에 발행된 개념 링크 Bit, NewsEvent PUBLISHED·threadId (D7, D12, R6.1).
 * - CONCEPT: 항상 Thread, Related news Bit + 발행된 뉴스 Thread 백링크, Concept PUBLISHED (D7, D12, R6.2).
 * - 모든 Bit aiCollab=LED. 성공 시 draft 삭제.
 */
export async function publishDraft(
  id: string,
  input: { segments: string[]; threadTitle?: string | null; expectedUpdatedAt?: Date | null },
): Promise<PublishResult> {
  const draft = await prisma.scrapDraft.findUnique({
    where: { id },
    select: { id: true, kind: true, eventKey: true, conceptSlugs: true, conceptId: true, updatedAt: true },
  });
  if (!draft) return { ok: false, reason: "not_found" };
  if (isStale(draft.updatedAt, input.expectedUpdatedAt)) return { ok: false, reason: "stale" };

  const segments = input.segments.map((s) => s.trim());
  if (segments.length === 0 || segments.every((s) => s.length === 0)) {
    return { ok: false, reason: "empty" };
  }
  const overIndex = segments.findIndex((s) => s.length === 0 || s.length > MAX_SEGMENT_CHARS);
  if (overIndex !== -1) return { ok: false, reason: "too_long", index: overIndex };

  const title = input.threadTitle?.trim() || segments[0];

  // 원자적 선점: 읽은 updatedAt 그대로일 때만 한 요청이 가져간다(updatedAt이 바뀜). 더블 클릭·동시 요청·
  // 그 사이 cron 출처 추가는 0행 → stale (Gemini diff review #2). @updatedAt은 아무 필드나 갱신하면 바뀐다.
  const claimed = await prisma.scrapDraft.updateMany({
    where: { id, updatedAt: draft.updatedAt },
    data: { kind: draft.kind },
  });
  if (claimed.count === 0) return { ok: false, reason: "stale" };

  if (draft.kind === "CONCEPT" && draft.conceptId) {
    return publishConceptDraft(draft.id, draft.conceptId, title, segments);
  }
  if (draft.kind === "NEWS" && draft.eventKey) {
    return publishEventDraft(draft.id, draft.eventKey, draft.conceptSlugs, title, segments);
  }

  // v1 — 1단계와 동일
  if (segments.length === 1) {
    const bit = await createBit({ content: segments[0], aiCollab: "LED" });
    await removePublishedDraft(id);
    return { ok: true, kind: "bit", id: bit.id };
  }
  const threadId = await createThreadWithBits(title, segments);
  await removePublishedDraft(id);
  return { ok: true, kind: "thread", id: threadId };
}

async function publishEventDraft(
  draftId: string,
  eventKey: string,
  conceptSlugs: string[],
  title: string,
  segments: string[],
): Promise<PublishResult> {
  // 개념 링크는 본문 [[ ]] 인라인으로 (spec wiki-links D5) — 끝에 "New to this?" Bit를 붙이지 않는다
  const threadId = await createThreadWithBits(title, segments);

  await prisma.$transaction([
    prisma.newsEvent.updateMany({
      where: { eventKey },
      data: { status: "PUBLISHED", threadId, draftId: null },
    }),
    prisma.scrapDraft.deleteMany({ where: { id: draftId } }),
  ]);
  await reconcileConceptLinks(eventKey);
  return { ok: true, kind: "thread", id: threadId };
}

async function publishConceptDraft(
  draftId: string,
  conceptId: string,
  title: string,
  segments: string[],
): Promise<PublishResult> {
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { term: true, events: { select: { eventKey: true } } },
  });
  const eventKeys = concept?.events.map((e) => e.eventKey) ?? [];
  const linked =
    eventKeys.length > 0
      ? await prisma.newsEvent.findMany({
          where: { eventKey: { in: eventKeys }, status: "PUBLISHED", threadId: { not: null } },
          orderBy: { updatedAt: "desc" },
          select: { title: true, threadId: true },
        })
      : [];
  // 오너가 뉴스 Thread를 지웠을 수 있다 — 남아 있는 Thread에만 링크
  const alive = new Set(
    (
      await prisma.thread.findMany({
        where: { id: { in: linked.map((e) => e.threadId as string) } },
        select: { id: true },
      })
    ).map((t) => t.id),
  );

  const threadId = await createThreadWithBits(title, segments);
  const plan = planConceptPublish(
    { term: concept?.term ?? title, threadId },
    linked
      .filter((e) => e.threadId && alive.has(e.threadId))
      .map((e) => ({ title: e.title, threadId: e.threadId as string })),
  );
  if (plan.relatedBit) await createBit({ content: plan.relatedBit, threadId, aiCollab: "LED" });
  // 뉴스 Thread에 백링크 Bit를 붙이지 않는다 — Thread 페이지의 Linked from이 대신 보여준다 (wiki-links D5)

  await prisma.$transaction([
    prisma.concept.updateMany({
      where: { id: conceptId },
      data: { status: "PUBLISHED", threadId, draftId: null },
    }),
    prisma.scrapDraft.deleteMany({ where: { id: draftId } }),
  ]);
  for (const key of eventKeys) await reconcileConceptLinks(key);
  return { ok: true, kind: "thread", id: threadId };
}

export type ConceptStatusDTO = { slug: string; term: string; status: "PENDING" | "PUBLISHED" | "REJECTED"; hasDraft: boolean };

/** 인박스 뉴스 카드의 개념 표시용 (v2 R8.1). */
export async function getConceptStatuses(slugs: string[]): Promise<ConceptStatusDTO[]> {
  if (slugs.length === 0) return [];
  const rows = await prisma.concept.findMany({
    where: { slug: { in: [...new Set(slugs)] } },
    select: { slug: true, term: true, status: true, draftId: true },
  });
  return rows.map((r) => ({ slug: r.slug, term: r.term, status: r.status, hasDraft: r.draftId !== null }));
}

/**
 * 사건 ↔ 개념 링크를 맞춘다 — 발행이 끝날 때마다 호출 (2026-11-20 운영에서 발견한 동시 발행 경합 수정).
 * 사건이 발행됐고 연결된 개념도 발행됐다면: 뉴스 Thread에 개념 링크 Bit, 개념 Thread에 관련 뉴스 Bit가
 * 없을 때만 추가한다(URL 포함 여부로 중복 방지). 두 발행이 겹쳐도 나중에 끝나는 쪽이 빠진 링크를 채운다.
 */
export async function reconcileConceptLinks(eventKey: string): Promise<{ added: number }> {
  const event = await prisma.newsEvent.findUnique({
    where: { eventKey },
    select: { status: true, threadId: true, title: true },
  });
  if (!event || event.status !== "PUBLISHED" || !event.threadId) return { added: 0 };
  const newsThread = await prisma.thread.findUnique({ where: { id: event.threadId }, select: { id: true, title: true } });
  if (!newsThread) return { added: 0 };

  const links = await prisma.conceptEvent.findMany({
    where: { eventKey },
    select: { concept: { select: { term: true, status: true, threadId: true } } },
  });
  let added = 0;
  for (const { concept } of links) {
    if (concept.status !== "PUBLISHED" || !concept.threadId) continue;
    const conceptThread = await prisma.thread.findUnique({ where: { id: concept.threadId }, select: { id: true } });
    if (!conceptThread) continue;

    // 뉴스 → 개념 링크는 본문 [[ ]]가 맡는다 (wiki-links D5). 개념 → 뉴스 "Related news"만 보장.
    const newsUrl = threadUrl(newsThread.id);
    const conceptBits = await prisma.bit.findMany({ where: { threadId: conceptThread.id }, select: { content: true } });
    if (!conceptBits.some((b) => b.content.includes(newsUrl))) {
      const related = relatedNewsBit([{ title: newsThread.title, threadId: newsThread.id }]);
      if (related) {
        await createBit({ content: related, threadId: conceptThread.id, aiCollab: "LED" });
        added++;
      }
    }
  }
  return { added };
}
