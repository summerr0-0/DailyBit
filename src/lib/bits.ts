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
  thread: { id: string; title: string } | null;
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
  thread: { id: string; title: string } | null;
  createdAt: Date;
  author: { id: string; nickname: string; image: string | null };
  _count: { likes: number; rebits: number; comments: number };
};

function toBitWithAuthor({ createdAt, _count, ...rest }: BitRow): BitWithAuthor {
  return {
    ...rest,
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
  createdAt: true,
  author: { select: { id: true, nickname: true, image: true } },
  thread: { select: { id: true, title: true } },
  _count: { select: { likes: true, rebits: true, comments: true } },
} as const;

export async function getBits(): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: BIT_SELECT,
  });

  return rows.map(toBitWithAuthor);
}

/**
 * 특정 태그가 달린 Bit를 최신순으로 조회한다.
 * 태그는 소문자로 정규화되어 저장되므로 입력도 소문자화해 매칭한다.
 */
export async function getBitsByTag(tag: string): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    where: { tags: { has: tag.toLowerCase() } },
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
export async function getBitsFiltered(filterTags: string[]): Promise<FeedItem[]> {
  const normalized = filterTags.map((t) => t.toLowerCase()).filter(Boolean);

  if (normalized.length > 0) {
    const rows = await prisma.bit.findMany({
      where: { AND: normalized.map((tag) => ({ tags: { has: tag } })) },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      select: BIT_SELECT,
    });
    return rows.map((r) => ({ kind: "bit" as const, bit: toBitWithAuthor(r) }));
  }

  const author = await ensureDevUser();

  const [bitRows, rebitRows] = await Promise.all([
    prisma.bit.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      select: BIT_SELECT,
    }),
    prisma.rebit.findMany({
      where: { userId: author.id },
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

  const pinned: FeedItem[] = bitRows
    .filter((r) => r.pinned)
    .map((r) => ({ kind: "bit", bit: toBitWithAuthor(r) }));

  const unpinnedBitEntries: RawFeedEntry[] = bitRows
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

/** 전체 Bit에서 태그 사용 빈도를 내림차순으로 반환한다. */
export async function getTagCloud(): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.bit.findMany({ select: { tags: true } });

  const counts = new Map<string, number>();
  for (const { tags } of rows) {
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
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
}): Promise<BitWithAuthor> {
  const author = await ensureDevUser();

  const row = await prisma.bit.create({
    data: {
      content: input.content,
      tags: parseTags(input.content),
      authorId: author.id,
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
