import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";

// auth 도입 전까지 모든 Bit는 이 고정 dev 유저로 귀속된다 (spec: bit-compose D1).
const DEV_USER = {
  email: "dev@dailybit.dev",
  nickname: "devuser",
} as const;

export type BitWithAuthor = {
  id: string;
  content: string;
  tags: string[];
  createdAtLabel: string;
  author: {
    id: string;
    nickname: string;
    image: string | null;
  };
};

const formatter = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

function toRelativeLabel(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 60) return formatter.format(-diffMin, "minute");
  if (diffMin < 1440) return formatter.format(-Math.floor(diffMin / 60), "hour");
  return formatter.format(-Math.floor(diffMin / 1440), "day");
}

export async function getBits(): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      tags: true,
      createdAt: true,
      author: {
        select: { id: true, nickname: true, image: true },
      },
    },
  });

  return rows.map((row) => ({
    ...row,
    createdAtLabel: toRelativeLabel(row.createdAt),
  }));
}

/**
 * 새 Bit를 생성한다.
 * - 작성자는 고정 dev 유저를 email 기준 upsert로 확보 (시드 실행 여부와 무관, 프로덕션 안전).
 * - 태그는 본문에서 파싱·정규화한다 (parseTags).
 */
export async function createBit(input: { content: string }): Promise<BitWithAuthor> {
  const author = await prisma.user.upsert({
    where: { email: DEV_USER.email },
    update: {},
    create: { email: DEV_USER.email, nickname: DEV_USER.nickname },
    select: { id: true },
  });

  const row = await prisma.bit.create({
    data: {
      content: input.content,
      tags: parseTags(input.content),
      authorId: author.id,
    },
    select: {
      id: true,
      content: true,
      tags: true,
      createdAt: true,
      author: {
        select: { id: true, nickname: true, image: true },
      },
    },
  });

  return {
    ...row,
    createdAtLabel: toRelativeLabel(row.createdAt),
  };
}
