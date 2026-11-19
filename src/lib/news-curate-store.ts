import { prisma } from "@/lib/prisma";
import {
  appendSourceToDraft,
  createConceptDraft,
  createEventDraft,
  expireDrafts,
} from "@/lib/scrap-drafts";
import { MAX_ATTEMPTS, type CurationStore } from "@/lib/news-curate";

// news-curate의 CurationStore Prisma 구현 (spec: news-curation T5, v2 T5). next/* import 금지.

const FEED_ITEM_SELECT = {
  id: true,
  url: true,
  urlNormalized: true,
  sourceId: true,
  title: true,
  summary: true,
  publishedAt: true,
  score: true,
  status: true,
  attempts: true,
  eventKey: true,
} as const;

export const prismaCurationStore: CurationStore = {
  expireDrafts: (now) => expireDrafts(now),

  async purgeFeedItemsPublishedBefore(cutoff) {
    const { count } = await prisma.feedItem.deleteMany({ where: { publishedAt: { lt: cutoff } } });
    return count;
  },

  async findExistingNormalized(urls) {
    if (urls.length === 0) return new Set();
    const rows = await prisma.feedItem.findMany({
      where: { urlNormalized: { in: urls } },
      select: { urlNormalized: true },
    });
    return new Set(rows.map((r) => r.urlNormalized));
  },

  async insertFeedItems(items) {
    if (items.length === 0) return;
    await prisma.feedItem.createMany({ data: items, skipDuplicates: true });
  },

  async markStale(cutoff) {
    const { count } = await prisma.feedItem.updateMany({
      where: { status: { in: ["CANDIDATE", "FAILED"] }, publishedAt: { lt: cutoff } },
      data: { status: "SKIPPED", skipReason: "stale" },
    });
    return count;
  },

  findPool: () =>
    prisma.feedItem.findMany({
      where: { OR: [{ status: "CANDIDATE" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }] },
      select: FEED_ITEM_SELECT,
    }),

  async updateFeedItem(id, patch) {
    await prisma.feedItem.update({ where: { id }, data: patch });
  },

  findRecentEvents: (since) =>
    prisma.newsEvent.findMany({
      where: { updatedAt: { gte: since } },
      select: { eventKey: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),

  async findEventStatus(eventKey) {
    const ev = await prisma.newsEvent.findUnique({ where: { eventKey }, select: { status: true } });
    return ev?.status ?? null;
  },

  async findOpenEventDraft(eventKey) {
    const ev = await prisma.newsEvent.findUnique({ where: { eventKey }, select: { status: true, draftId: true } });
    if (!ev || ev.status !== "OPEN" || !ev.draftId) return null;
    const draft = await prisma.scrapDraft.findUnique({ where: { id: ev.draftId }, select: { id: true, updatedAt: true } });
    if (!draft) return null;
    const sourceCount = await prisma.feedItem.count({ where: { eventKey, status: "DRAFTED" } });
    return { draftId: draft.id, updatedAt: draft.updatedAt, sourceCount };
  },

  async createEventDraft(input) {
    await createEventDraft(input);
  },

  appendSourceToDraft: (draftId, expectedUpdatedAt, bit, feedItemId, eventKey) =>
    appendSourceToDraft(draftId, expectedUpdatedAt, bit, feedItemId, eventKey),

  findConcepts: () =>
    prisma.concept.findMany({ select: { id: true, slug: true, term: true, aliases: true, status: true, draftId: true } }),

  async ensureConceptLinked({ slug, term, aliases, eventKey }) {
    const concept = await prisma.concept.upsert({
      where: { slug },
      create: { slug, term, aliases, status: "PENDING" },
      update: {},
      select: { id: true, aliases: true },
    });
    // 새로 들어온 별칭을 병합해 다음 매칭에 쓰이게 한다 (Gemini diff #4)
    const merged = [...new Set([...concept.aliases, ...aliases].filter(Boolean))];
    if (merged.length !== concept.aliases.length) {
      await prisma.concept.update({ where: { id: concept.id }, data: { aliases: { set: merged } } });
    }
    await prisma.conceptEvent.upsert({
      where: { conceptId_eventKey: { conceptId: concept.id, eventKey } },
      create: { conceptId: concept.id, eventKey },
      update: {},
    });
  },

  async createConceptDraft(input) {
    await createConceptDraft(input);
  },
};
