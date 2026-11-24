import { normalizeUrl, parseFeed } from "@/lib/news-feed";
import type { CommunityStore, Summarize } from "./community";
import { NOTE_TAG } from "./sources";

// 이민 공식·전문 뉴스 매일 확인 (spec: immigration-news, 1b단계).
// IRCC 보도자료와 CIC News RSS에서 새 글만 읽어, 개발자 영주권에 관련 있는 글만 한국어 요약으로 남긴다.
// 원문은 저장하지 않는다. 본문은 RSS 요약만 쓴다(페이지를 따로 열지 않음).

export const NEWS_FEEDS = [
  {
    id: "ircc",
    name: "IRCC",
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=20&format=atom",
  },
  { id: "cicnews", name: "CIC News", url: "https://www.cicnews.com/feed" },
] as const;

const SEEN_KEEP = 300;
/** 첫 실행은 출처마다 최신 3개만 보고 나머지는 본 것으로 */
const FIRST_RUN_LATEST = 3;
const MAX_ITEMS = 15;
const BIT_MAX = 500;

export type NewsDigestResult = { feeds: { id: string; fresh: number; error?: string }[]; relevant: number; summarized: boolean; notes: number };

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s);

/** 링크와 #immigration을 먼저 확보하고, 남는 자리에 제목·요약을 줄여 넣는다. 결과는 항상 500자 이하 (Gemini news #4) */
export function newsNote(source: string, title: string, summary: string, url: string): string {
  const tail = `\n${url}\n#${NOTE_TAG}`;
  const room = BIT_MAX - tail.length;
  const head = cut(`★ [${source}] ${title}`.replace(/#/g, "＃"), Math.min(160, room));
  const left = room - head.length - 1;
  const body = left >= 20 ? `\n${cut(summary, left)}` : "";
  return `${head}${body}${tail}`.slice(0, BIT_MAX);
}

export async function runNewsDigest(
  fetchText: (url: string) => Promise<string>,
  store: CommunityStore,
  summarize: Summarize,
): Promise<NewsDigestResult> {
  const out: NewsDigestResult = { feeds: [], relevant: 0, summarized: true, notes: 0 };
  type Item = { source: string; title: string; summary: string; url: string; key: string };
  const retry = new Set<string>();
  const fresh: Item[] = [];
  const pending: (() => Promise<void>)[] = [];

  for (const feed of NEWS_FEEDS) {
    let entries;
    try {
      entries = parseFeed(await fetchText(feed.url));
    } catch (e) {
      out.feeds.push({ id: feed.id, fresh: 0, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const key = `news:${feed.id}`;
    const before = await store.getSeen(key);
    const seen = new Set(before ?? []);
    // 같은 피드 안의 중복 URL은 하나만 (Gemini news #3). url은 본 것 비교용(정규화), 알림에는 원래 링크
    const unique = [...new Map(entries.map((e) => [normalizeUrl(e.url), e])).entries()].map(([url, e]) => ({ e, url }));
    const urls = unique.map((x) => x.url);
    const candidates = unique.filter((x, i) => !seen.has(x.url) && (before !== null || i < FIRST_RUN_LATEST));
    const taken = candidates.slice(0, Math.max(0, MAX_ITEMS - fresh.length));
    const deferred = new Set(candidates.slice(taken.length).map((x) => x.url));
    for (const { e, url } of taken) fresh.push({ source: feed.name, title: e.title, summary: e.summary, url: e.url, key: url });
    out.feeds.push({ id: feed.id, fresh: taken.length });
    // 빈 피드는 저장하지 않는다 — 첫 실행 규칙(최신 3개)이 다음 실행까지 유지되게 (Gemini news #2)
    if (unique.length === 0) continue;
    // 본 것 저장은 알림을 다 남긴 뒤에. AI가 답하지 않은 글도 다음 실행에서 다시 본다 (Gemini news #1)
    pending.push(() =>
      store.saveSeen(key, [...new Set([...urls.filter((u) => !deferred.has(u) && !retry.has(u)), ...(before ?? [])])].slice(0, SEEN_KEEP)),
    );
  }

  const summaries = fresh.length ? await summarize(fresh.map((f) => ({ title: f.title, body: f.summary || f.title }))) : [];
  if (summaries === null) {
    // AI가 실패하면 관련도를 모른다 — 본 것으로 저장하지 않고 다음 실행에서 다시 본다
    out.summarized = false;
    return out;
  }
  fresh.forEach((f, i) => {
    if (!summaries[i]) retry.add(f.key);
  });
  const relevant = fresh.map((f, i) => ({ f, s: summaries[i] })).filter((x) => x.s?.relevant);
  for (const { f, s } of relevant) {
    await store.postNote(newsNote(f.source, f.title, s!.summary, f.url));
    out.notes++;
  }
  out.relevant = relevant.length;
  for (const save of pending) await save();
  return out;
}
