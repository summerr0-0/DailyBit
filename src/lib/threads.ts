import { prisma } from "@/lib/prisma";
import { ensureDevUser } from "@/lib/bits";

export type ThreadSummary = {
  id: string;
  title: string;
  bitCount: number;
  updatedAt: string;
};

export type ThreadWithBits = {
  id: string;
  title: string;
  bits: {
    id: string;
    content: string;
    tags: string[];
    aiCollab: "NONE" | "HINT" | "LED";
    createdAt: Date;
  }[];
};

export async function getThreads(): Promise<ThreadSummary[]> {
  const author = await ensureDevUser();
  const rows = await prisma.thread.findMany({
    where: { authorId: author.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { bits: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    bitCount: r._count.bits,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createThread(title: string): Promise<ThreadSummary> {
  const author = await ensureDevUser();
  const row = await prisma.thread.create({
    data: { title, authorId: author.id },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { bits: true } },
    },
  });

  return {
    id: row.id,
    title: row.title,
    bitCount: row._count.bits,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteThread(id: string): Promise<boolean> {
  const { count } = await prisma.thread.deleteMany({ where: { id } });
  return count > 0;
}

export async function getThread(id: string): Promise<ThreadWithBits | null> {
  const row = await prisma.thread.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      bits: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          tags: true,
          aiCollab: true,
          createdAt: true,
        },
      },
    },
  });

  return row;
}

/** Thread 제목 수정 (오너). 대상이 없으면 false. */
export async function updateThreadTitle(id: string, title: string): Promise<boolean> {
  const t = title.trim();
  if (t.length === 0 || t.length > 100) throw new Error("invalid_title");
  const { count } = await prisma.thread.updateMany({ where: { id }, data: { title: t } });
  return count > 0;
}
