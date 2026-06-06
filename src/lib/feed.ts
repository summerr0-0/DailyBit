import { prisma } from "@/lib/prisma";
import { DEV_USER, toRelativeLabel, type BitWithAuthor } from "@/lib/bits";

/**
 * 홈 피드 한 항목. 원본 Bit이거나 누군가의 Rebit이다.
 * - kind="rebit"이면 rebitedBy(리포스트한 사람 닉네임)가 채워진다.
 * - rebitCount: 원본 Bit의 총 Rebit 수.
 * - rebitedByMe: 현재(dev) 유저가 이 Bit를 Rebit했는지.
 */
export type FeedItem = {
  key: string;
  kind: "bit" | "rebit";
  bit: BitWithAuthor;
  rebitedBy?: string;
  rebitCount: number;
  rebitedByMe: boolean;
};

type BitForFeed = {
  id: string;
  content: string;
  tags: string[];
  createdAt: Date;
  author: { id: string; nickname: string; image: string | null };
  _count: { rebits: number };
  rebits: { id: string }[];
};

function toFeedBit(b: BitForFeed): BitWithAuthor {
  return {
    id: b.id,
    content: b.content,
    tags: b.tags,
    createdAtLabel: toRelativeLabel(b.createdAt),
    author: b.author,
  };
}

/**
 * 홈 피드를 조회한다. 원본 Bit와 Rebit를 각자의 시각 기준으로 병합해 최신순 정렬한다.
 * 같은 Bit가 원본+Rebit로 함께 등장할 수 있다 (트위터식, spec D4).
 */
export async function getFeed(): Promise<FeedItem[]> {
  const me = await prisma.user.findUnique({
    where: { email: DEV_USER.email },
    select: { id: true },
  });
  // 유저가 없으면 매칭되지 않는 빈 id로 둬서 rebitedByMe가 모두 false가 되게 한다.
  const myId = me?.id ?? "";

  const bitSelect = {
    id: true,
    content: true,
    tags: true,
    createdAt: true,
    author: { select: { id: true, nickname: true, image: true } },
    _count: { select: { rebits: true } },
    rebits: { where: { userId: myId }, select: { id: true } },
  } as const;

  const [bitRows, rebitRows] = await Promise.all([
    prisma.bit.findMany({ orderBy: { createdAt: "desc" }, select: bitSelect }),
    prisma.rebit.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        user: { select: { nickname: true } },
        bit: { select: bitSelect },
      },
    }),
  ]);

  const entries: { sortAt: Date; item: FeedItem }[] = [];

  for (const b of bitRows) {
    entries.push({
      sortAt: b.createdAt,
      item: {
        key: `bit-${b.id}`,
        kind: "bit",
        bit: toFeedBit(b),
        rebitCount: b._count.rebits,
        rebitedByMe: b.rebits.length > 0,
      },
    });
  }

  for (const r of rebitRows) {
    entries.push({
      sortAt: r.createdAt,
      item: {
        key: `rebit-${r.id}`,
        kind: "rebit",
        bit: toFeedBit(r.bit),
        rebitedBy: r.user.nickname,
        rebitCount: r.bit._count.rebits,
        rebitedByMe: r.bit.rebits.length > 0,
      },
    });
  }

  entries.sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());
  return entries.map((e) => e.item);
}
