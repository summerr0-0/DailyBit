import { prisma } from "@/lib/prisma";
import { addPrivateTag } from "@/lib/privateTags";
import { ensureDevUser } from "@/lib/bits";
import { parseTags } from "@/lib/tags";
import type { MonitorStore, StoredDraw } from "./monitor";
import { NOTE_TAG, NOTE_THREAD_TITLE, WATCHED_PAGES, WEEKLY_THREAD_TITLE, type Program } from "./sources";
import type { CommunityStore } from "./community";

// MonitorStore의 Prisma 구현. 알림 Bit는 항상 private=true, 태그 #immigration도 비공개 태그로 둔다 (D5).

/** 비공개 Thread(제목으로 찾거나 만듦)에 비공개 Bit를 남기는 함수 — 1단계 알림과 주간 요약이 같이 쓴다 (D5) */
function privateNotePoster(threadTitle: string) {
  let threadId: string | null = null;
  return async (content: string) => {
    await addPrivateTag(NOTE_TAG);
    const author = await ensureDevUser();
    if (!threadId) {
      const found = await prisma.thread.findFirst({ where: { title: threadTitle, authorId: author.id }, select: { id: true } });
      threadId = found?.id ?? (await prisma.thread.create({ data: { title: threadTitle, authorId: author.id }, select: { id: true } })).id;
    }
    await prisma.bit.create({
      data: { content, tags: parseTags(content), aiCollab: "NONE", private: true, authorId: author.id, threadId },
    });
  };
}

async function upsertSnapshot(url: string, hash: string, text: string, changed: boolean) {
  const now = new Date();
  await prisma.pageSnapshot.upsert({
    where: { url },
    create: { url, hash, text, checkedAt: now, changedAt: now },
    update: changed ? { hash, text, checkedAt: now, changedAt: now } : { checkedAt: now },
  });
}

export function createPrismaMonitorStore(): MonitorStore {
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

    saveSnapshot: upsertSnapshot,
    postNote: privateNotePoster(NOTE_THREAD_TITLE),
  };
}

/** 주간 요약용 (spec: immigration-community D3·D5). 본 기사 번호는 PageSnapshot에 JSON으로 둔다 — 스키마 추가 없음 */
export function createPrismaCommunityStore(threadTitle: string = WEEKLY_THREAD_TITLE): CommunityStore {
  return {
    async getSeen(key: string) {
      const row = await prisma.pageSnapshot.findUnique({ where: { url: key }, select: { text: true } });
      if (!row) return null;
      // 깨진 값이면 첫 실행처럼(14일 창) 다룬다 — 빈 목록으로 보면 옛 기사가 전부 "새 기사"가 된다 (Gemini wk #4)
      try {
        const ids = JSON.parse(row.text);
        return Array.isArray(ids) ? ids.map(String) : null;
      } catch {
        return null;
      }
    },
    saveSeen: (key: string, ids: string[]) => upsertSnapshot(key, "seen", JSON.stringify(ids), true),
    postNote: privateNotePoster(threadTitle),
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
  // 같은 표를 쓰는 내부 기록(warning:*, community:*)은 화면에 안 보이게 감시 페이지만 (Gemini wk #5)
  return prisma.pageSnapshot.findMany({ where: { url: { in: [...WATCHED_PAGES] } }, select: { url: true, checkedAt: true, changedAt: true } });
}
