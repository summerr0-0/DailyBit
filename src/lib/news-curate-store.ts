import { prisma } from "@/lib/prisma";
import { createNewsDraft, deleteExpiredNewsDrafts } from "@/lib/scrap-drafts";
import { MAX_ATTEMPTS, type CurationStore } from "@/lib/news-curate";

// news-curate의 CurationStore Prisma 구현 (spec: news-curation T5). next/* import 금지(D3).

export const prismaCurationStore: CurationStore = {
  deleteExpiredNewsDrafts: (now) => deleteExpiredNewsDrafts(now),

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
      where: {
        OR: [{ status: "CANDIDATE" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }],
      },
      select: {
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
      },
    }),

  async updateFeedItem(id, patch) {
    await prisma.feedItem.update({ where: { id }, data: patch });
  },

  async createNewsDraft(input) {
    await createNewsDraft(input);
  },
};
