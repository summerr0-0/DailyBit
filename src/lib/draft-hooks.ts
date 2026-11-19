import { threadUrl } from "@/lib/site-url";

// 초안 발행·폐기·만료 훅의 순수 로직 (spec: news-curation-v2 D7, D8, D10, D12, D14).
// DB 없이 테스트하려고 scrap-drafts.ts에서 분리했다. prisma·next/* import 금지.

const DAY_MS = 24 * 60 * 60 * 1000;
export const BIT_MAX_CHARS = 500;
export const NEWS_EVENT_DRAFT_TTL_MS = 3 * DAY_MS;
export const CONCEPT_DRAFT_TTL_MS = 7 * DAY_MS;
export const MAX_RELATED_NEWS = 3;
export const SOURCE_ADDED_LATER = "source_added_later";

const MAX_TERM_CHARS = 80;
const MAX_RELATED_TITLE_CHARS = 100;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** 개념 링크 Bit — 개념 1개당 Bit 1개, 뉴스·개념 발행 어느 쪽이든 같은 모양 (D14-8). */
export function conceptLinkBit(term: string, conceptThreadId: string): string {
  return `New to this? ${clip(term, MAX_TERM_CHARS)} → ${threadUrl(conceptThreadId)}`;
}

export type RelatedNews = { title: string; threadId: string };

/** 개념 Thread의 `Related news:` Bit. 사건이 없으면 null. 최대 3건, 500자 안에 들어가는 만큼만 (D6, D14-3). */
export function relatedNewsBit(events: readonly RelatedNews[]): string | null {
  let content = "Related news:";
  let added = 0;
  for (const e of events.slice(0, MAX_RELATED_NEWS)) {
    const line = `\n- ${clip(e.title, MAX_RELATED_TITLE_CHARS)} → ${threadUrl(e.threadId)}`;
    if (content.length + line.length > BIT_MAX_CHARS) break;
    content += line;
    added++;
  }
  return added > 0 ? content : null;
}

export type ConceptLinkTarget = {
  slug: string;
  term: string;
  status: "PENDING" | "PUBLISHED" | "REJECTED";
  threadId: string | null;
};

/**
 * 뉴스 발행 시 Thread 끝에 붙일 개념 링크 Bit들 (D7, R6.1, R6.3).
 * conceptSlugs 순서를 따르고, PUBLISHED이며 threadId가 있는 개념만, slug 중복은 1번만.
 */
export function newsConceptBits(
  conceptSlugs: readonly string[],
  concepts: readonly ConceptLinkTarget[],
): string[] {
  const bySlug = new Map(concepts.map((c) => [c.slug, c]));
  const seen = new Set<string>();
  const bits: string[] = [];
  for (const slug of conceptSlugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const c = bySlug.get(slug);
    if (c && c.status === "PUBLISHED" && c.threadId) bits.push(conceptLinkBit(c.term, c.threadId));
  }
  return bits;
}

export type ConceptPublishPlan = {
  /** 개념 Thread 끝에 붙일 Related news Bit (없으면 null). */
  relatedBit: string | null;
  /** 이미 발행된 뉴스 Thread마다 끝에 붙일 백링크 Bit. */
  backlinks: { threadId: string; content: string }[];
};

/**
 * 개념 발행 시 추가할 Bit 계획 (D7, D14-3, R6.2). linkedEvents는 PUBLISHED 사건(최신순)이라고 가정하고
 * 최대 3건만 쓴다. Related news Bit와 백링크는 같은 사건 집합을 대상으로 한다.
 */
export function planConceptPublish(
  concept: { term: string; threadId: string },
  linkedEvents: readonly RelatedNews[],
): ConceptPublishPlan {
  const unique: RelatedNews[] = [];
  for (const e of linkedEvents) {
    if (!unique.some((u) => u.threadId === e.threadId)) unique.push(e);
    if (unique.length === MAX_RELATED_NEWS) break;
  }
  const link = conceptLinkBit(concept.term, concept.threadId);
  return {
    relatedBit: relatedNewsBit(unique),
    backlinks: unique.map((e) => ({ threadId: e.threadId, content: link })),
  };
}

/** 늦은 출처: segments 맨 끝에 Bit를 붙이고 경고를 한 번만 추가 (D8, D14-6). */
export function appendSourceSegment(
  segments: readonly string[],
  warnings: readonly string[],
  bit: string,
  warning: string = SOURCE_ADDED_LATER,
): { segments: string[]; warnings: string[] } {
  return {
    segments: [...segments, bit],
    warnings: warnings.includes(warning) ? [...warnings] : [...warnings, warning],
  };
}

/** 편집 충돌 검사 (D8, R7.1). expected가 없으면 검사하지 않는다. */
export function isStale(actual: Date, expected?: Date | null): boolean {
  return expected != null && actual.getTime() !== expected.getTime();
}

export type ExpirableDraft = { kind: "MANUAL" | "NEWS" | "CONCEPT"; updatedAt: Date };

/** 만료 여부 — updatedAt 기준, NEWS 3일 / CONCEPT 7일, MANUAL은 만료 없음 (D10, D14-9). */
export function isDraftExpired(draft: ExpirableDraft, now: Date): boolean {
  const ttl =
    draft.kind === "NEWS" ? NEWS_EVENT_DRAFT_TTL_MS : draft.kind === "CONCEPT" ? CONCEPT_DRAFT_TTL_MS : null;
  return ttl !== null && now.getTime() - draft.updatedAt.getTime() > ttl;
}

/** 만료 cutoff 시각 (이보다 이전에 갱신된 초안이 만료 대상). */
export function expiryCutoffs(now: Date): { news: Date; concept: Date } {
  return {
    news: new Date(now.getTime() - NEWS_EVENT_DRAFT_TTL_MS),
    concept: new Date(now.getTime() - CONCEPT_DRAFT_TTL_MS),
  };
}
