import { NOTE_TAG, isTechRelevant, type Program } from "./sources";

// 영주권 "이번 주 정리" (spec: immigration-daily D6~D8). 월요일에 지난 7일의 선발·알림을 모아
// 이민 제도를 잘 모르는 사람도 읽을 수 있게 AI가 쉬운 한국어로 정리한다. /scrap 맨 위 카드로 보인다.
// 이 파일은 jsdom을 쓰지 않는다 — /scrap 화면이 parseBriefing을 쓴다.

export const BRIEFING_KEY = "briefing:weekly";
const WEEK_MS = 7 * 86_400_000;
const NOTES_MAX_CHARS = 12_000;
const BIT_MAX = 500;

export type BriefingPoint = { title: string; body: string };
export type BriefingTerm = { term: string; meaning: string };
export type BriefingText = { headline: string; points: BriefingPoint[]; terms: BriefingTerm[]; watch: string };
export type WeeklyBriefing = BriefingText & { from: string; to: string; generatedAt: string };

export type BriefingDraw = { program: Program; stream: string; detail: string; drawDate: string; minScore: number | null; invitationsText: string };
export type BriefingInput = { from: string; to: string; draws: (BriefingDraw & { tech: boolean })[]; notes: string[] };

export interface BriefingStore {
  /** 이번 주에 들어온 선발 (drawDate·createdAt 기준, 호출자가 정함) */
  recentDraws(since: Date): Promise<BriefingDraw[]>;
  /** 영주권 스레드의 비공개 Bit 본문, 오래된 것 먼저 */
  recentNotes(since: Date): Promise<string[]>;
  saveBriefing(b: WeeklyBriefing): Promise<void>;
  postNote(content: string): Promise<void>;
}

export type WriteBriefing = (input: BriefingInput) => Promise<BriefingText | null>;

const day = (d: Date) => d.toISOString().slice(0, 10);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** 저장된 JSON → 정리. 모양이 틀리면 null (화면은 카드를 숨긴다) */
export function parseBriefing(text: string | null | undefined): WeeklyBriefing | null {
  if (!text) return null;
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const headline = str(o.headline);
  if (!headline || !str(o.from) || !str(o.to)) return null;
  const list = <T>(v: unknown, f: (x: Record<string, unknown>) => T | null): T[] =>
    Array.isArray(v) ? v.flatMap((x) => (x && typeof x === "object" ? [f(x as Record<string, unknown>)] : [])).filter((x): x is T => x !== null) : [];
  return {
    from: str(o.from),
    to: str(o.to),
    generatedAt: str(o.generatedAt),
    headline,
    points: list(o.points, (x) => (str(x.title) && str(x.body) ? { title: str(x.title), body: str(x.body) } : null)),
    terms: list(o.terms, (x) => (str(x.term) && str(x.meaning) ? { term: str(x.term), meaning: str(x.meaning) } : null)),
    watch: str(o.watch),
  };
}

/**
 * AI 입력에서 빼는 Bit: 하루 머리 Bit, 지난 정리 알림, CN드림 주간 머리 Bit(월요일엔 기사가 없어도 남는다),
 * 표 구조 경고·추적 시작 같은 상태 Bit — 소식이 아니다. 조용한 주에 AI를 부르지 않게 (Gemini brief #1)
 */
export const isStatusNote = (n: string) =>
  /^(Canada PR — |이번 주 정리|CN드림 이민 뉴스( — |: 목록에서))|: (no draws found on the page|started tracking — )/.test(n);

export async function runWeeklyBriefing(store: BriefingStore, write: WriteBriefing, now: Date = new Date()): Promise<WeeklyBriefing | null> {
  const since = new Date(now.getTime() - WEEK_MS);
  const range = { from: day(since), to: day(new Date(now.getTime() - 86_400_000)) };
  const draws = (await store.recentDraws(since)).map((d) => ({ ...d, tech: isTechRelevant(d) }));
  // 최근 알림부터 글자 수 상한까지 — 넘치면 오래된 것을 버린다
  const notes: string[] = [];
  let size = 0;
  for (const n of (await store.recentNotes(since)).filter((n) => !isStatusNote(n)).reverse()) {
    if (size + n.length > NOTES_MAX_CHARS) break;
    notes.unshift(n);
    size += n.length;
  }

  const text: BriefingText | null =
    draws.length === 0 && notes.length === 0
      ? { headline: "이번 주는 새 선발도, 개발자 영주권에 관련된 새 소식도 없었어요.", points: [], terms: [], watch: "" }
      : await write({ ...range, draws, notes });
  if (!text) return null; // AI 실패 — 저장하지 않고 호출자가 실패로 끝낸다

  const briefing: WeeklyBriefing = { ...range, generatedAt: now.toISOString(), ...text };
  await store.saveBriefing(briefing);
  const head = `이번 주 정리 (${range.from} ~ ${range.to})\n`;
  const tail = `\n자세히: https://irin-j.com/scrap\n#${NOTE_TAG}`;
  const room = BIT_MAX - head.length - tail.length;
  const headline = text.headline.replace(/#/g, "＃");
  await store.postNote(`${head}${headline.length > room ? `${headline.slice(0, room - 1)}…` : headline}${tail}`);
  return briefing;
}
