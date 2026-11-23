import { prisma } from "@/lib/prisma";
import { addPrivateTag } from "@/lib/privateTags";
import { ensureDevUser } from "@/lib/bits";
import { parseTags } from "@/lib/tags";
import { NOTE_TAG, NOTE_THREAD_TITLE, type MonitorStore, type StoredDraw } from "./monitor";
import type { Program } from "./parse";

// MonitorStore의 Prisma 구현. 알림 Bit는 항상 private=true, 태그 #immigration도 비공개 태그로 둔다 (D5).

export function createPrismaMonitorStore(): MonitorStore {
  let threadId: string | null = null;

  async function noteThread(authorId: string): Promise<string> {
    if (threadId) return threadId;
    const found = await prisma.thread.findFirst({ where: { title: NOTE_THREAD_TITLE, authorId }, select: { id: true } });
    threadId = found?.id ?? (await prisma.thread.create({ data: { title: NOTE_THREAD_TITLE, authorId }, select: { id: true } })).id;
    return threadId;
  }

  return {
    async existingKeys(program: Program) {
      const rows = await prisma.immigrationDraw.findMany({ where: { program }, select: { dedupeKey: true } });
      return new Set(rows.map((r) => r.dedupeKey));
    },

    async insertDraws(draws: StoredDraw[]) {
      await prisma.immigrationDraw.createMany({
        data: draws.map((d) => ({
          dedupeKey: d.dedupeKey,
          program: d.program,
          stream: d.stream.slice(0, 300),
          detail: d.detail,
          drawDate: new Date(`${d.drawDate}T00:00:00Z`),
          minScore: d.minScore,
          invitations: d.invitations,
          invitationsText: d.invitationsText.slice(0, 40),
          sourceUrl: d.sourceUrl,
        })),
        skipDuplicates: true,
      });
    },

    async getSnapshot(url: string) {
      return prisma.pageSnapshot.findUnique({ where: { url }, select: { hash: true, text: true } });
    },

    async saveSnapshot(url: string, hash: string, text: string, changed: boolean) {
      const now = new Date();
      await prisma.pageSnapshot.upsert({
        where: { url },
        create: { url, hash, text, checkedAt: now, changedAt: now },
        update: changed ? { hash, text, checkedAt: now, changedAt: now } : { checkedAt: now },
      });
    },

    async postNote(content: string) {
      await addPrivateTag(NOTE_TAG);
      const author = await ensureDevUser();
      await prisma.bit.create({
        data: {
          content,
          tags: parseTags(content),
          aiCollab: "NONE",
          private: true,
          authorId: author.id,
          threadId: await noteThread(author.id),
        },
      });
    },
  };
}

export type DrawRow = {
  id: string;
  program: Program;
  stream: string;
  detail: string;
  drawDate: string;
  minScore: number | null;
  invitationsText: string;
  sourceUrl: string;
};

/** /immigration 화면용 — 프로그램별 최근 선발 */
export async function getRecentDraws(program: Program, take = 40): Promise<DrawRow[]> {
  const rows = await prisma.immigrationDraw.findMany({
    where: { program },
    orderBy: [{ drawDate: "desc" }, { stream: "asc" }],
    take,
    select: { id: true, program: true, stream: true, detail: true, drawDate: true, minScore: true, invitationsText: true, sourceUrl: true },
  });
  return rows.map((r) => ({ ...r, program: r.program as Program, drawDate: r.drawDate.toISOString().slice(0, 10) }));
}

export async function getSnapshots(): Promise<{ url: string; checkedAt: Date; changedAt: Date }[]> {
  return prisma.pageSnapshot.findMany({ select: { url: true, checkedAt: true, changedAt: true } });
}
