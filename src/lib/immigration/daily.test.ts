import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CommunityStore, Summarize } from "./community";
import { runDaily } from "./daily";
import type { MonitorStore, StoredDraw } from "./monitor";
import { NEWS_FEEDS } from "./news-digest";
import { SOURCES, WATCHED_PAGES, type Program } from "./parse";

const fixture = (name: string) => readFileSync(join(__dirname, "../__fixtures__/immigration", name), "utf8");

// 모든 저장·알림을 한 줄로 기록해 순서를 본다
function world() {
  const log: string[] = [];
  const draws: StoredDraw[] = [];
  const snapshots = new Map<string, { hash: string; text: string }>();
  const seen: Record<string, string[]> = {};
  const monitorStore: MonitorStore = {
    existingKeys: async (p: Program) => new Set(draws.filter((d) => d.program === p).map((d) => d.dedupeKey)),
    insertDraws: async (d) => void (draws.push(...d), log.push(`save draws ${d[0].program}`)),
    getSnapshot: async (u) => snapshots.get(u) ?? null,
    saveSnapshot: async (u, hash, text) => void (snapshots.set(u, { hash, text }), log.push(`save snapshot ${u}`)),
    postNote: async () => {
      throw new Error("must not post directly");
    },
  };
  const communityStore: CommunityStore = {
    getSeen: async (k) => (k in seen ? seen[k] : null),
    saveSeen: async (k, ids) => void ((seen[k] = ids), log.push(`save ${k}`)),
    postNote: async () => {
      throw new Error("must not post directly");
    },
  };
  const posts: string[] = [];
  const post = async (c: string) => void (posts.push(c), log.push(`post ${c.split("\n")[0]}`));
  return { log, draws, seen, monitorStore, communityStore, posts, post };
}

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>CIC</title><item><title>Tech draw rule change</title><link>https://www.cicnews.com/2026/11/a.html</link><description>Body</description></item></channel></rss>`;
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`;
const pages: Record<string, string> = {
  [SOURCES.EE]: fixture("ee-rounds.json"),
  [SOURCES.BC_PNP]: fixture("bc-invitations.html"),
  [SOURCES.AAIP]: fixture("aaip-processing.html"),
  [WATCHED_PAGES[0]]: "<main><p>Intake continues.</p></main>",
  [NEWS_FEEDS[0].url]: atom,
  [NEWS_FEEDS[1].url]: rss,
};
const fetchFrom = (map: Record<string, string>) => async (url: string) => {
  if (!(url in map)) throw new Error("HTTP 404");
  return map[url];
};
const allRelevant: Summarize = async (a) => a.map((x) => ({ summary: `요약: ${x.title}`, relevant: true }));
const now = new Date("2026-11-24T01:00:00Z");

describe("runDaily", () => {
  it("posts one header first, then every detail in one thread, saving only after each note", async () => {
    const w = world();
    const r = await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: allRelevant, weekly: false, now });
    expect(w.posts[0]).toBe(
      "Canada PR — 2026-11-24\n- 선발·공지: 새 소식 3건\n- 뉴스(IRCC·CIC News): 관련 1건\n#immigration",
    );
    expect(w.posts).toHaveLength(5); // 머리 + 프로그램 3개 시작 알림 + 뉴스 1
    expect(r.notes).toBe(5);
    // 각 프로그램: 알림 → 저장 순서. 뉴스 본 것도 뉴스 알림 뒤
    const i = (s: string) => w.log.findIndex((l) => l.startsWith(s));
    expect(i("post Canada PR")).toBe(0);
    expect(i("post Express Entry")).toBeLessThan(i("save draws EE"));
    expect(i("post ★ [CIC News]")).toBeLessThan(i("save news:cicnews"));
  });

  it("AI failure leaves draws posted and saved, marks the news line failed, saves no news seen", async () => {
    const w = world();
    const r = await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: async () => null, weekly: false, now });
    expect(r.news?.summarized).toBe(false);
    expect(w.posts[0]).toContain("- 뉴스(IRCC·CIC News): AI 요약 실패");
    expect(w.draws.length).toBeGreaterThan(0);
    expect(w.seen["news:cicnews"]).toBeUndefined();
  });

  it("a quiet day posts nothing", async () => {
    const w = world();
    await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: async (a) => a.map(() => ({ summary: "x", relevant: false })), weekly: false, now });
    w.posts.length = 0;
    const r = await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: allRelevant, weekly: false, now });
    expect(r.notes).toBe(0);
    expect(w.posts).toEqual([]);
  });

  it("a quiet day still saves what it saw — irrelevant news is not re-sent to the AI tomorrow", async () => {
    const w = world();
    await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: allRelevant, weekly: false, now });
    w.seen["news:cicnews"] = []; // 본 것 없음(첫 실행 아님) → CIC 글 1개가 새 글
    w.posts.length = 0;
    const r = await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: async (a) => a.map(() => ({ summary: "x", relevant: false })), weekly: false, now });
    expect(w.posts).toEqual([]);
    expect(r.notes).toBe(0);
    expect(w.seen["news:cicnews"]).toEqual(["https://cicnews.com/2026/11/a.html"]);
  });

  it("a quiet day with a read failure still posts the header", async () => {
    const w = world();
    await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: allRelevant, weekly: false, now });
    w.posts.length = 0;
    const broken = { ...pages };
    delete broken[NEWS_FEEDS[1].url];
    await runDaily({ fetchText: fetchFrom(broken), ...w, summarize: allRelevant, weekly: false, now });
    expect(w.posts).toEqual(["Canada PR — 2026-11-24\n- 선발·공지: 변화 없음\n- 뉴스(IRCC·CIC News): 관련 글 없음 (못 읽음: CIC News)\n#immigration"]);
  });

  it("a step that throws midway drops what it had queued", async () => {
    const w = world();
    let calls = 0;
    const existingKeys = w.monitorStore.existingKeys;
    w.monitorStore.existingKeys = async (p) => {
      if (++calls === 2) throw new Error("db read failed");
      return existingKeys(p);
    };
    const r = await runDaily({ fetchText: fetchFrom(pages), ...w, summarize: allRelevant, weekly: false, now });
    expect(r.errors).toEqual(["monitor: db read failed"]);
    expect(w.draws).toEqual([]); // EE가 먼저 쌓였지만 버려짐
    expect(w.posts[0]).toContain("- 선발·공지: 실행 실패");
    expect(w.posts.some((c) => c.startsWith("Express Entry"))).toBe(false);
  });

  it("a failed post stops the queue — nothing after it is saved", async () => {
    const w = world();
    const post = async (c: string) => {
      if (c.startsWith("Express Entry")) throw new Error("db down");
      await w.post(c);
    };
    await expect(runDaily({ fetchText: fetchFrom(pages), ...w, post, summarize: allRelevant, weekly: false, now })).rejects.toThrow("db down");
    expect(w.draws).toEqual([]);
    expect(w.seen).toEqual({});
  });

  it("on Mondays a weekly step that throws is reported in the header, other steps still post", async () => {
    const w = world();
    const fetchText = async (url: string) => {
      if (url.includes("cndreams")) throw new Error("HTTP 503");
      return fetchFrom(pages)(url);
    };
    const r = await runDaily({ fetchText, ...w, summarize: allRelevant, weekly: true, now });
    expect(r.errors).toEqual(["weekly: HTTP 503"]);
    expect(w.posts[0]).toContain("- CN드림 주간: 실행 실패");
    expect(w.posts.length).toBe(5);
  });
});
