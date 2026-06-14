import { prisma } from "@/lib/prisma";
import { DEV_USER, toRelativeLabel, type BitWithAuthor } from "@/lib/bits";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 53;

export type GardenLevel = 0 | 1 | 2 | 3 | 4;

export type GardenDay = {
  date: string; // KST yyyy-mm-dd
  count: number;
  level: GardenLevel;
  isToday: boolean;
  inRange: boolean; // 미래 칸이면 false (렌더에서 비워둔다)
};

export type GardenData = {
  weeks: GardenDay[][]; // 각 주 = 일~토 7칸
  todayCount: number;
  total: number; // 그리드 범위 내 총 활동 수
};

/** UTC Date를 KST 기준 yyyy-mm-dd 키로 변환한다. */
export function toKstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 일별 활동 수를 고정 임계 0~4 강도로 매핑한다. */
export function activityLevel(count: number): GardenLevel {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function keyToUtc(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/**
 * todayKey(KST yyyy-mm-dd)를 기준으로 지난 53주 그리드를 만든다.
 * 마지막 열이 오늘이 속한 주, 각 열은 일요일 시작. 오늘 이후(미래) 칸은 inRange=false.
 */
export function buildGardenGrid(
  countByDate: Map<string, number>,
  todayKey: string,
): GardenData {
  const today = keyToUtc(todayKey);
  const dow = today.getUTCDay(); // 0=일
  const lastSat = new Date(today.getTime() + (6 - dow) * DAY_MS);
  const start = new Date(lastSat.getTime() - (WEEKS * 7 - 1) * DAY_MS);

  const weeks: GardenDay[][] = [];
  let cursor = start.getTime();

  for (let w = 0; w < WEEKS; w++) {
    const week: GardenDay[] = [];
    for (let d = 0; d < 7; d++) {
      const key = new Date(cursor).toISOString().slice(0, 10);
      const isFuture = cursor > today.getTime();
      const count = isFuture ? 0 : (countByDate.get(key) ?? 0);
      week.push({
        date: key,
        count,
        level: activityLevel(count),
        isToday: key === todayKey,
        inRange: !isFuture,
      });
      cursor += DAY_MS;
    }
    weeks.push(week);
  }

  let total = 0;
  for (const week of weeks) {
    for (const day of week) total += day.count;
  }

  return { weeks, todayCount: countByDate.get(todayKey) ?? 0, total };
}

/**
 * dev 유저의 지난 1년 Bit를 탐구 깊이 가중치로 집계해 잔디 그리드를 반환한다.
 * - Thread Bit(탐구 이어쓰기): 2점
 * - 독립 메모: 1점
 * Rebit는 소셜 상호작용이므로 제외한다.
 */
export async function getGarden(): Promise<GardenData> {
  const todayKey = toKstDateKey(new Date());

  const me = await prisma.user.findUnique({
    where: { email: DEV_USER.email },
    select: { id: true },
  });
  if (!me) return buildGardenGrid(new Map(), todayKey);

  const since = new Date(Date.now() - (WEEKS * 7 + 2) * DAY_MS);

  const bits = await prisma.bit.findMany({
    where: { authorId: me.id, createdAt: { gte: since } },
    select: { createdAt: true, threadId: true },
  });

  const scoreByDate = new Map<string, number>();
  for (const { createdAt, threadId } of bits) {
    const key = toKstDateKey(createdAt);
    const pts = threadId ? 2 : 1;
    scoreByDate.set(key, (scoreByDate.get(key) ?? 0) + pts);
  }

  return buildGardenGrid(scoreByDate, todayKey);
}

/** KST 날짜(yyyy-mm-dd)에 작성된 Bit를 최신순으로 반환한다. */
export async function getBitsByDateKST(dateKey: string): Promise<BitWithAuthor[]> {
  const me = await prisma.user.findUnique({
    where: { email: DEV_USER.email },
    select: { id: true },
  });
  if (!me) return [];

  const startUTC = new Date(new Date(`${dateKey}T00:00:00Z`).getTime() - KST_OFFSET_MS);
  const endUTC = new Date(startUTC.getTime() + DAY_MS);

  const rows = await prisma.bit.findMany({
    where: {
      authorId: me.id,
      createdAt: { gte: startUTC, lt: endUTC },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      content: true,
      tags: true,
      aiCollab: true,
      createdAt: true,
      author: { select: { id: true, nickname: true, image: true } },
      thread: { select: { id: true, title: true } },
    },
  });

  return rows.map(({ createdAt, ...rest }) => ({
    ...rest,
    createdAtLabel: toRelativeLabel(createdAt),
  }));
}
