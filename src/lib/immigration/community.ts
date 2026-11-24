import { JSDOM, VirtualConsole } from "jsdom";
import type { ArticleInput, ArticleSummary } from "./community-ai";
import { NOTE_TAG } from "./sources";

// 이민 기사 주간 요약 (spec: immigration-community). 1단계 표와 달리 정책 뉴스를 한국어로 받는다.
// 출처: CN드림 이민 뉴스 섹션. 원문은 저장하지 않고 요약과 링크만 비공개 Bit로 남긴다.

export const CNDREAMS_BASE = "https://www.cndreams.com";
export const CNDREAMS_LIST = `${CNDREAMS_BASE}/news/news_list.php?code1=5`;
const SEEN_KEY = "community:cndreams";
const SEEN_KEEP = 300;
const MAX_ARTICLES = 8;
const WEEK_DAYS = 7;
/** 첫 실행은 2주 치 — 첫 요약이 비어 있지 않게 */
const FIRST_RUN_DAYS = 14;
const BIT_MAX = 500;

export type ListItem = { idx: string; title: string; date: string; url: string };

const quiet = () => ({ virtualConsole: new VirtualConsole() });
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().replace(/\.\.$/, "…");

/** 이민 섹션(code1=5) 기사만. 같은 기사가 사진·제목 링크로 두 번 나와도 한 번만 */
export function parseCndreamsList(html: string): ListItem[] {
  const doc = new JSDOM(html, quiet()).window.document;
  const out = new Map<string, ListItem>();
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href*="news_read"]')) {
    const q = new URLSearchParams((a.getAttribute("href") ?? "").split("?")[1] ?? "");
    const idx = q.get("idx") ?? "";
    if (q.get("code1") !== "5" || !/^\d+$/.test(idx)) continue;
    const title = clean(a.querySelector("p.font-bold")?.textContent);
    if (!title || out.has(idx)) continue;
    const card = a.closest("div.flex-col") ?? a.parentElement;
    const date = card?.textContent?.match(/기사 등록일:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
    out.set(idx, { idx, title, date, url: `${CNDREAMS_BASE}/news/news_read-d.php?code1=5&code2=0&code3=250&idx=${idx}` });
  }
  return [...out.values()];
}

/** 기사 본문 텍스트 (스크립트 제외). 못 찾으면 "" */
export function articleBody(html: string): string {
  const doc = new JSDOM(html, quiet()).window.document;
  const el = doc.querySelector("#news_content_id");
  if (!el) return "";
  el.querySelectorAll("script,style").forEach((n) => n.remove());
  return clean(el.textContent);
}

export interface CommunityStore {
  getSeen(key: string): Promise<string[] | null>;
  saveSeen(key: string, ids: string[]): Promise<void>;
  postNote(content: string): Promise<void>;
}

export type Summarize = (articles: ArticleInput[]) => Promise<(ArticleSummary | null)[] | null>;
export type DigestResult = { listed: number; fresh: number; summarized: boolean; notes: number; firstRun: boolean };

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);
/** 기사 Bit: 링크와 #immigration은 항상 남기고 제목·요약을 줄인다 (Gemini wk #1). 제목의 #도 전각으로 */
function articleNote(head: string, summary: string, url: string): string {
  const tail = `\n${url}\n#${NOTE_TAG}`;
  const title = cut(head.replace(/#/g, "＃"), 140);
  const room = BIT_MAX - tail.length - title.length - 1;
  return [title, summary ? cut(summary, room) : "", ""].filter(Boolean).join("\n") + tail;
}
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function runCommunityDigest(
  fetchText: (url: string) => Promise<string>,
  store: CommunityStore,
  summarize: Summarize,
  opts: { now?: Date; pause?: () => Promise<void> } = {},
): Promise<DigestResult> {
  const now = opts.now ?? new Date();

  const list = parseCndreamsList(await fetchText(CNDREAMS_LIST)); // 목록을 못 읽으면 throw → exit 1 (D6)
  if (list.length === 0) {
    await store.postNote(`CN드림 이민 뉴스: 목록에서 기사를 하나도 못 읽었어요 — 페이지 구조가 바뀌었을 수 있어요.\n${CNDREAMS_LIST}\n#${NOTE_TAG}`);
    return { listed: 0, fresh: 0, summarized: false, notes: 1, firstRun: false };
  }

  const seenBefore = await store.getSeen(SEEN_KEY);
  const firstRun = seenBefore === null;
  const from = day(new Date(now.getTime() - (firstRun ? FIRST_RUN_DAYS : WEEK_DAYS) * 86_400_000));
  const range = `${from} ~ ${day(now)}`;
  const seen = new Set(seenBefore ?? []);
  // 첫 실행: 최근 14일 기사만 요약하고 나머지는 본 것으로 (D3)
  const candidates = list.filter((i) => !seen.has(i.idx) && (!firstRun || !i.date || i.date >= from));
  const fresh = candidates.slice(0, MAX_ARTICLES);
  // 상한에 걸려 이번에 못 다룬 기사는 본 것으로 두지 않는다 — 다음 주에 다룬다
  const deferred = new Set(candidates.slice(MAX_ARTICLES).map((i) => i.idx));

  const articles: (ListItem & { body: string })[] = [];
  for (const item of fresh) {
    await opts.pause?.();
    let body = "";
    try {
      body = articleBody(await fetchText(item.url));
    } catch {
      // 기사 하나를 못 읽어도 제목·링크는 남긴다
    }
    articles.push({ ...item, body });
  }

  // 본문을 못 읽은 기사는 AI에 제목만 넘기지 않는다 — 제목만으로 지어낸 요약이 나올 수 있다 (Gemini wk #2)
  const readable = articles.filter((a) => a.body);
  const summaries = readable.length ? await summarize(readable.map((a) => ({ title: a.title, body: a.body }))) : [];
  const byIdx = new Map(readable.map((a, i) => [a.idx, summaries?.[i] ?? null]));
  const entries = articles.map((a) => ({ a, s: byIdx.get(a.idx) ?? null }));
  // 관련 높은 기사 먼저, 그다음 최신순
  entries.sort((x, y) => Number(y.s?.relevant ?? false) - Number(x.s?.relevant ?? false) || y.a.date.localeCompare(x.a.date));

  const high = entries.filter((e) => e.s?.relevant).length;
  const head =
    entries.length === 0
      ? `CN드림 이민 뉴스 — ${range}: 이번 주 새 기사 없음.\n#${NOTE_TAG}`
      : `CN드림 이민 뉴스 — ${range}: ${entries.length}건 (개발자 영주권 관련 ${high}건)${summaries ? "" : "\n(AI 요약 실패 — 제목과 링크만)"}\n#${NOTE_TAG}`;
  const notes = [
    head,
    ...entries.map(({ a, s }) => articleNote(`${s?.relevant ? "★ " : ""}${a.date} ${a.title}`.trim(), s?.summary ?? (a.body ? "" : "(본문을 못 읽었어요 — 원문 링크로 확인)"), a.url)),
  ];
  // 머리 Bit가 스레드 맨 위에 오게 먼저 남긴다. 다 남긴 뒤에 본 것을 저장 (D6)
  for (const n of notes) await store.postNote(n);

  const ids = [...list.map((i) => i.idx).filter((id) => !deferred.has(id)), ...(seenBefore ?? [])];
  await store.saveSeen(SEEN_KEY, [...new Set(ids)].slice(0, SEEN_KEEP));
  return { listed: list.length, fresh: entries.length, summarized: summaries !== null, notes: notes.length, firstRun };
}
