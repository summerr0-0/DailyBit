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
  thread: { id: string; title: string } | null;
  createdAtLabel: string;
  author: {
    id: string;
    nickname: string;
    image: string | null;
  };
};

const formatter = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });

export function toRelativeLabel(date: Date): string {
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 60) return formatter.format(-diffMin, "minute");
  if (diffMin < 1440) return formatter.format(-Math.floor(diffMin / 60), "hour");
  return formatter.format(-Math.floor(diffMin / 1440), "day");
}

type BitRow = {
  id: string;
  content: string;
  tags: string[];
  aiCollab: AiCollabLevel;
  thread: { id: string; title: string } | null;
  createdAt: Date;
  author: { id: string; nickname: string; image: string | null };
};

function toBitWithAuthor({ createdAt, ...rest }: BitRow): BitWithAuthor {
  return { ...rest, createdAtLabel: toRelativeLabel(createdAt) };
}

const BIT_SELECT = {
  id: true,
  content: true,
  tags: true,
  aiCollab: true,
  createdAt: true,
  author: { select: { id: true, nickname: true, image: true } },
  thread: { select: { id: true, title: true } },
} as const;

export async function getBits(): Promise<BitWithAuthor[]> {
  const rows = await prisma.bit.findMany({
    orderBy: { createdAt: "desc" },
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
 * Bit를 id로 삭제한다.
 * - deleteMany를 써서 대상이 없어도 예외 대신 count=0을 반환받는다.
 * - 반환값은 실제 삭제 여부 (false면 호출부에서 404 처리).
 * - 인증 도입 전이라 소유자 검증은 없다 (전부 DEV_USER 소유).
 */
export async function deleteBit(id: string): Promise<boolean> {
  const { count } = await prisma.bit.deleteMany({ where: { id } });
  return count > 0;
}
