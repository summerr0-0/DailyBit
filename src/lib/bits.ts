import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";

// auth 도입 전까지 모든 Bit·Rebit는 이 고정 dev 유저로 귀속된다 (spec: bit-compose D1).
export const DEV_USER = {
  email: "dev@dailybit.dev",
  nickname: "devuser",
} as const;

/**
 * 고정 dev 유저를 email 기준 upsert로 확보한다 (시드 실행 여부와 무관, 프로덕션 안전).
 * Bit 작성·Rebit 등 쓰기 주체가 공유한다.
 */
export async function ensureDevUser(): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: {},
    create: { email: DEV_USER.email, nickname: DEV_USER.nickname },
    select: { id: true },
  });
}

export type AiCollabLevel = "NONE" | "HINT" | "LED";

export type BitWithAuthor = {
  id: string;
  content: string;
  tags: string[];
  aiCollab: AiCollabLevel;
  pinned: boolean;
  private: boolean;
  thread: { id: string; title: string; bitCount?: number } | null;
  createdAtLabel: string;
  likeCount: number;
  rebitCount: number;
  commentCount: number;
  author: {
    id: string;
    nickname: string;
    image: string | null;
  };
};

export type FeedItem =
  | { kind: "bit"; bit: BitWithAuthor }
  | { kind: "rebit"; rebitId: string; rebitAtLabel: string; message: string | null; bit: BitWithAuthor };

export function toRelativeLabel(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / 1440)}d ago`;
}

type BitRow = {
  id: string;
  content: string;
  tags: string[];
  aiCollab: AiCollabLevel;
  pinned: boolean;
  private: boolean;
  thread: { id: string; title: string; _count: { bits: number } } | null;
  createdAt: Date;
  author: { id: string; nickname: string; image: string | null };
  _count: { likes: number; rebits: number; comments: number };
};

function toBitWithAuthor({ createdAt, _count, thread, ...rest }: BitRow): BitWithAuthor {
  return {
    ...rest,
    thread: thread ? { id: thread.id, title: thread.title, bitCount: thread._count.bits } : null,
    createdAtLabel: toRelativeLabel(createdAt),
    likeCount: _count.likes,
    rebitCount: _count.rebits,
    commentCount: _count.comments,
  };
}

const BIT_SELECT = {
  id: true,
  content: true,
  tags: true,
  aiCollab: true,
  pinned: true,
  private: true,
  createdAt: true,
  author: { select: { id: true, nickname: true, image: true } },
  // 공개 Bit 수만 센다 — 비공개 Bit의 존재가 방문자에게 드러나지 않게 (Gemini #1)
  thread: { select: { id: true, title: true, _count: { select: { bits: { where: { private: false } } } } } },
  _count: { select: { likes: true, rebits: true, comments: true } },
} as const;

/**
 * 홈 피드에서 Thread는 첫 Bit만 보인다 — 나머지는 Thread 페이지에서 본다 (사용자 요청 2026-11-20).
 * 보이는 행(비공개 필터·태그 필터 적용 후) 중 Thread별 가장 이른 Bit만 남긴다. 단독 Bit는 그대로.
 */
export function keepThreadHeads<T extends { id: string; createdAt: Date; thread: { id: string } | null }>(rows: T[]): T[] {
  const head = new Map<string, T>();
  for (const r of rows) {
    if (!r.thread) continue;
    const cur = head.get(r.thread.id);
    // 같은 시각이면 id로 결정 — 매번 같은 결과 (Gemini #2)
    if (!cur || r.createdAt < cur.createdAt || (r.createdAt.getTime() === cur.createdAt.getTime() && r.id < cur.id)) {
      head.set(r.thread.id, r);
    }
  }
  return rows.filter((r) => !r.thread || head.get(r.thread.id)?.id === r.id);
}

export async function getBits(includePrivate = false): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    where: includePrivate ? undefined : { private: false },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: BIT_SELECT,
  });

  return rows.map(toBitWithAuthor);
}

export async function getBitsByTag(tag: string, includePrivate = false): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    where: {
      tags: { has: tag.toLowerCase() },
      ...(includePrivate ? {} : { private: false }),
    },
    orderBy: { createdAt: "desc" },
    select: BIT_SELECT,
  });

  return rows.map(toBitWithAuthor);
}

/**
 * 피드 아이템(Bit + Rebit 혼합)을 반환한다.
 * - 태그 필터 적용 시 Rebit는 제외(원본 Bit 기준)하고 Bit만 필터링.
 * - 태그 없으면 Bit(핀 우선) + Rebit(최신순) 병합 후 날짜순 정렬.
 */
export async function getBitsFiltered(filterTags: string[], includePrivate = false): Promise<FeedItem[]> {
  const normalized = filterTags.map((t) => t.toLowerCase()).filter(Boolean);
  const privacyFilter = includePrivate ? {} : { private: false };

  if (normalized.length > 0) {
    const rows = await prisma.bit.findMany({
      where: { AND: [privacyFilter, ...normalized.map((tag) => ({ tags: { has: tag } }))] },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      select: BIT_SELECT,
    });
    // 태그가 Thread 중간 Bit에만 있어도 피드에는 그 Thread의 첫 Bit를 보여준다 (Gemini #2)
    const threadIds = [...new Set(rows.filter((r) => r.thread).map((r) => r.thread!.id))];
    const heads =
      threadIds.length > 0
        ? keepThreadHeads(
            await prisma.bit.findMany({
              where: { threadId: { in: threadIds }, ...privacyFilter },
              select: BIT_SELECT,
            }),
          )
        : [];
    const headByThread = new Map(heads.map((h) => [h.thread!.id, h]));
    const seen = new Set<string>();
    const out: typeof rows = [];
    for (const r of rows) {
      const shown = r.thread ? headByThread.get(r.thread.id) ?? r : r;
      if (seen.has(shown.id)) continue;
      seen.add(shown.id);
      out.push(shown);
    }
    return out.map((r) => ({ kind: "bit" as const, bit: toBitWithAuthor(r) }));
  }

  const author = await ensureDevUser();

  const [bitRows, rebitRows] = await Promise.all([
    prisma.bit.findMany({
      where: privacyFilter,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      select: BIT_SELECT,
    }),
    prisma.rebit.findMany({
      where: {
        userId: author.id,
        ...(includePrivate ? {} : { bit: { private: false } }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        message: true,
        createdAt: true,
        bit: { select: BIT_SELECT },
      },
    }),
  ]);

  type RawFeedEntry =
    | { kind: "bit"; sortAt: Date; row: (typeof bitRows)[0] }
    | { kind: "rebit"; sortAt: Date; rebitId: string; message: string | null; row: (typeof rebitRows)[0]["bit"] };

  const headRows = keepThreadHeads(bitRows);
  const pinned: FeedItem[] = headRows
    .filter((r) => r.pinned)
    .map((r) => ({ kind: "bit", bit: toBitWithAuthor(r) }));

  const unpinnedBitEntries: RawFeedEntry[] = headRows
    .filter((r) => !r.pinned)
    .map((r) => ({ kind: "bit", sortAt: r.createdAt, row: r }));

  const rebitEntries: RawFeedEntry[] = rebitRows.map((r) => ({
    kind: "rebit",
    sortAt: r.createdAt,
    rebitId: r.id,
    message: r.message,
    row: r.bit,
  }));

  const merged: FeedItem[] = [...unpinnedBitEntries, ...rebitEntries]
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .map((entry) => {
      if (entry.kind === "bit") {
        return { kind: "bit", bit: toBitWithAuthor(entry.row) };
      }
      return {
        kind: "rebit",
        rebitId: entry.rebitId,
        rebitAtLabel: toRelativeLabel(entry.sortAt),
        message: entry.message,
        bit: toBitWithAuthor(entry.row),
      };
    });

  return [...pinned, ...merged];
}

export async function getTagCloud(
  includePrivate = false,
): Promise<{ tag: string; count: number; isPrivateTag: boolean }[]> {
  const [rows, privateTagRows] = await Promise.all([
    prisma.bit.findMany({
      where: includePrivate ? undefined : { private: false },
      select: { tags: true },
    }),
    prisma.privateTag.findMany({ select: { tag: true } }),
  ]);

  const privateTags = new Set(privateTagRows.map((r) => r.tag));

  const counts = new Map<string, number>();
  for (const { tags } of rows) {
    for (const tag of tags) {
      if (!includePrivate && privateTags.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  // When logged in, also include private tags even if they have 0 public bits
  if (includePrivate) {
    for (const tag of privateTags) {
      if (!counts.has(tag)) counts.set(tag, 0);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count, isPrivateTag: privateTags.has(tag) }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 새 Bit를 생성한다.
 * - 작성자는 고정 dev 유저를 email 기준 upsert로 확보 (시드 실행 여부와 무관, 프로덕션 안전).
 * - 태그는 본문에서 파싱·정규화한다 (parseTags).
 */
export async function createBit(input: {
  content: string;
  threadId?: string;
  aiCollab?: AiCollabLevel;
  private?: boolean;
}): Promise<BitWithAuthor> {
  const author = await ensureDevUser();

  const row = await prisma.bit.create({
    data: {
      content: input.content,
      tags: parseTags(input.content),
      authorId: author.id,
      private: input.private ?? false,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.aiCollab ? { aiCollab: input.aiCollab } : {}),
    },
    select: BIT_SELECT,
  });

  return toBitWithAuthor(row);
}

/**
 * Rebit을 토글한다. 없으면 생성, 있으면 삭제.
 * 반환값: "created" | "deleted" | "not_found"
 */
export async function toggleRebit(
  bitId: string,
  message?: string,
): Promise<"created" | "deleted" | "not_found"> {
  const author = await ensureDevUser();
  const bit = await prisma.bit.findUnique({ where: { id: bitId }, select: { id: true } });
  if (!bit) return "not_found";

  const existing = await prisma.rebit.findUnique({
    where: { userId_bitId: { userId: author.id, bitId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.rebit.delete({ where: { id: existing.id } });
    return "deleted";
  }

  await prisma.rebit.create({
    data: { userId: author.id, bitId, message: message?.trim() || null },
  });
  return "created";
}

/** Bit의 private 상태를 토글한다. 대상이 없으면 false 반환. */
export async function toggleBitPrivate(id: string): Promise<boolean> {
  const bit = await prisma.bit.findUnique({ where: { id }, select: { private: true } });
  if (!bit) return false;
  await prisma.bit.update({ where: { id }, data: { private: !bit.private } });
  return true;
}

/** Bit의 pinned 상태를 토글한다. 대상이 없으면 false 반환. */
export async function toggleBitPin(id: string): Promise<boolean> {
  const bit = await prisma.bit.findUnique({ where: { id }, select: { pinned: true } });
  if (!bit) return false;
  await prisma.bit.update({ where: { id }, data: { pinned: !bit.pinned } });
  return true;
}

/**
 * Bit를 id로 삭제한다.
 * - deleteMany를 써서 대상이 없어도 예외 대신 count=0을 반환받는다.
 * - 반환값은 실제 삭제 여부 (false면 호출부에서 404 처리).
 * - 인증 도입 전이라 소유자 검증은 없다 (전부 DEV_USER 소유).
 */
export async function deleteBit(id: string): Promise<boolean> {
  const { count } = await prisma.bit.deleteMany({ where: { id } });
  return count > 0;
}

export const BIT_MAX_LENGTH = 500;

/** Bit 본문 수정 (오너). 태그는 본문에서 다시 뽑는다. 대상이 없으면 null. */
export async function updateBitContent(id: string, content: string): Promise<{ id: string } | null> {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > BIT_MAX_LENGTH) throw new Error("invalid_length");
  const { count } = await prisma.bit.updateMany({ where: { id }, data: { content: trimmed, tags: parseTags(trimmed) } });
  return count > 0 ? { id } : null;
}
