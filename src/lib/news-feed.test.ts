import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FEED_MAX_BYTES,
  cleanUrl,
  FeedFetchError,
  fetchAllFeeds,
  fetchFeed,
  htmlToText,
  normalizeUrl,
  parseFeed,
  type FetchLike,
} from "./news-feed";
import { NEWS_SOURCES, type NewsSource } from "./news-sources";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__/feeds", name), "utf8");
const RSS = fixture("rss.xml");
const ATOM = fixture("atom.xml");

const src = (id: string, feedUrl = `https://feeds.test/${id}`): NewsSource => ({
  id,
  name: id,
  feedUrl,
  category: "ai",
});

const xmlResponse = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

/** 시그널이 abort되기 전까지 응답하지 않는 fetch */
const hangingFetch: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

/** content-length 없이 1MB 청크를 계속 흘려보내는 응답 (총 sizeBytes) */
function streamingResponse(sizeBytes: number, onPull?: () => void): Response {
  const chunk = new Uint8Array(1024 * 1024).fill(0x61);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull?.();
      if (sent >= sizeBytes) return controller.close();
      const n = Math.min(chunk.byteLength, sizeBytes - sent);
      controller.enqueue(chunk.subarray(0, n));
      sent += n;
    },
  });
  return new Response(stream, { status: 200 });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NEWS_SOURCES (R2.1)", () => {
  it("D4의 11개 소스를 {id, name, feedUrl, category}로 export한다", () => {
    expect(NEWS_SOURCES).toHaveLength(11);
    for (const s of NEWS_SOURCES) {
      expect(Object.keys(s).sort()).toEqual(["category", "feedUrl", "id", "name"]);
      expect(s.feedUrl).toMatch(/^https:\/\//);
      expect(["ai", "security"]).toContain(s.category);
    }
    expect(new Set(NEWS_SOURCES.map((s) => s.id)).size).toBe(11);
    expect(NEWS_SOURCES.filter((s) => s.category === "ai")).toHaveLength(7);
    expect(NEWS_SOURCES.filter((s) => s.category === "security")).toHaveLength(4);
  });
});

describe("normalizeUrl (R2.3)", () => {
  it("스펙 예시를 정규화한다", () => {
    expect(normalizeUrl("https://WWW.Example.com/post/?utm_source=x&id=3&fbclid=y#top")).toBe(
      "https://example.com/post?id=3",
    );
  });

  it("ref·gclid 등 추적 파라미터를 제거하고 나머지 쿼리 순서를 유지한다", () => {
    expect(normalizeUrl("https://example.com/a?b=2&ref=hn&a=1&gclid=z&UTM_Campaign=q")).toBe(
      "https://example.com/a?b=2&a=1",
    );
  });

  it("루트 경로의 끝 슬래시와 빈 쿼리를 제거한다", () => {
    expect(normalizeUrl("https://www.example.com/?utm_medium=rss")).toBe("https://example.com");
  });

  it("utm이 붙은 표기와 아닌 표기가 같은 값이 된다", () => {
    expect(normalizeUrl("https://www.example.com/2026/11/x/?utm_source=rss")).toBe(
      normalizeUrl("https://example.com/2026/11/x"),
    );
  });

  it("파싱 불가 URL은 trim한 원본을 반환한다", () => {
    expect(normalizeUrl("  not a url ")).toBe("not a url");
  });
});

describe("htmlToText", () => {
  it("태그를 제거하고 엔티티를 디코딩한다", () => {
    expect(htmlToText("<p>Tom &amp; Jerry&#8217;s &#x2014; &ldquo;hi&rdquo;</p><script>x()</script>")).toBe(
      "Tom & Jerry’s — “hi”",
    );
  });

  it("이중 이스케이프는 한 단계만 디코딩한다", () => {
    expect(htmlToText("a &amp;lt; b")).toBe("a &lt; b");
  });

  it("20,000자로 절삭한다", () => {
    expect(htmlToText("x".repeat(25_000))).toHaveLength(20_000);
  });
});

describe("parseFeed (R2.2, R2.2c)", () => {
  it("RSS 2.0을 파싱한다 — content:encoded 우선, 엔티티 디코딩, pubDate", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      url: "https://www.example.com/2026/11/patch-tuesday/?utm_source=rss&utm_medium=feed&id=42",
      title: "Patch Tuesday & the Researcher’s Dilemma",
      summary: "Microsoft fixed 63 flaws & one zero-day.\nIt’s “critical”.",
      publishedAt: new Date("2026-11-17T14:30:00Z"),
    });
    expect(normalizeUrl(items[0].url)).toBe("https://example.com/2026/11/patch-tuesday?id=42");
    expect(items[1].summary).toBe("Plain HTML description");
    expect(items[1].publishedAt).toEqual(new Date("2026-11-16T08:00:00Z"));
  });

  it("RSS: link가 없으면 permalink guid를 쓰고, pubDate가 없으면 null", () => {
    const item = parseFeed(RSS)[2];
    expect(item.url).toBe("https://example.com/no-date");
    expect(item.publishedAt).toBeNull();
  });

  it("Atom을 파싱한다 — alternate 링크, content 우선, <published>", () => {
    const [first] = parseFeed(ATOM);
    expect(first).toEqual({
      url: "https://example.org/2026/Nov/18/model/",
      title: "New model release & benchmarks",
      summary: "The model scores 91.2% — up from 88%.",
      publishedAt: new Date("2026-11-18T09:15:00Z"),
    });
  });

  it("Atom: <updated>만 있는 항목은 publishedAt=null", () => {
    const second = parseFeed(ATOM)[1];
    expect(second.url).toBe("https://example.org/2024/Jan/02/old/");
    expect(second.summary).toBe("Only an updated timestamp");
    expect(second.publishedAt).toBeNull();
  });

  it("RSS/Atom이 아니면 parse 에러", () => {
    expect(() => parseFeed("<html><body>nope</body></html>")).toThrow(FeedFetchError);
  });
});

describe("fetchFeed (R2.2, R2.2b)", () => {
  it("UA DailyBitFeedReader/1.0으로 요청하고 항목을 반환한다", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => xmlResponse(ATOM));
    const items = await fetchFeed(src("atom"), { fetch: fetchMock });

    expect(items).toHaveLength(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://feeds.test/atom");
    const ua = new Headers(init?.headers).get("user-agent");
    expect(ua).toMatch(/^DailyBitFeedReader\/1\.0/);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("10초 동안 응답이 없으면 timeout 에러", async () => {
    vi.useFakeTimers();
    const p = fetchFeed(src("slow"), { fetch: hangingFetch });
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout", sourceId: "slow" });
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    p.catch(() => {}).finally(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("6MB 스트리밍 응답은 5MB를 넘는 순간 too_large로 중단한다", async () => {
    let pulls = 0;
    const p = fetchFeed(src("big"), { fetch: async () => streamingResponse(6 * 1024 * 1024, () => pulls++) });
    await expect(p).rejects.toMatchObject({ code: "too_large", sourceId: "big" });
    expect(pulls).toBeLessThanOrEqual(Math.ceil(FEED_MAX_BYTES / (1024 * 1024)) + 2);
  });

  it("Content-Length가 5MB를 넘으면 본문을 읽지 않고 too_large", async () => {
    const res = new Response("<rss/>", { status: 200, headers: { "content-length": String(6 * 1024 * 1024) } });
    await expect(fetchFeed(src("cl"), { fetch: async () => res })).rejects.toMatchObject({ code: "too_large" });
  });

  it("HTTP 에러 상태는 http 에러", async () => {
    await expect(
      fetchFeed(src("403"), { fetch: async () => new Response("no", { status: 403 }) }),
    ).rejects.toMatchObject({ code: "http", message: "HTTP 403" });
  });

  it("네트워크 실패는 network 에러", async () => {
    await expect(
      fetchFeed(src("down"), {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    ).rejects.toMatchObject({ code: "network" });
  });
});

describe("fetchAllFeeds (R2.2b)", () => {
  it("실패한 피드만 에러로 끝나고 나머지는 동시 4개 이하로 계속 처리한다", async () => {
    vi.useFakeTimers();
    let active = 0;
    let maxActive = 0;
    const sources = [
      src("ok1"),
      src("hang"),
      src("big"),
      src("ok2"),
      src("ok3"),
      src("ok4"),
      src("ok5"),
      src("rss"),
    ];
    const fetchMock: FetchLike = async (url, init) => {
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (url.endsWith("/hang")) return await hangingFetch(url, init);
        if (url.endsWith("/big")) return streamingResponse(6 * 1024 * 1024);
        await new Promise((r) => setTimeout(r, 50));
        return xmlResponse(url.endsWith("/rss") ? RSS : ATOM);
      } finally {
        active--;
      }
    };

    const p = fetchAllFeeds(sources, { fetch: fetchMock, concurrency: 4 });
    await vi.advanceTimersByTimeAsync(10_000);
    const results = await p;

    expect(maxActive).toBeLessThanOrEqual(4);
    expect(results.map((r) => r.sourceId)).toEqual(sources.map((s) => s.id));
    const byId = Object.fromEntries(results.map((r) => [r.sourceId, r]));
    expect(byId.hang).toMatchObject({ error: { code: "timeout" } });
    expect(byId.big).toMatchObject({ error: { code: "too_large" } });
    for (const id of ["ok1", "ok2", "ok3", "ok4", "ok5"]) {
      expect(byId[id]).toHaveProperty("items");
      expect((byId[id] as { items: unknown[] }).items).toHaveLength(2);
    }
    expect((byId.rss as { items: unknown[] }).items).toHaveLength(3);
  });
});

describe("Gemini diff review fixes (news-feed)", () => {
  it("drops non-http(s) and relative item links", () => {
    const xml = `<rss><channel>
      <item><title>a</title><link>javascript:alert(1)</link><pubDate>Tue, 17 Nov 2026 14:30:00 +0000</pubDate></item>
      <item><title>b</title><link>/posts/1</link></item>
      <item><title>c</title><link>https://ok.example/c</link></item>
    </channel></rss>`;
    expect(parseFeed(xml).map((e) => e.url)).toEqual(["https://ok.example/c"]);
  });

  it("returns [] for feeds with no items instead of throwing", () => {
    expect(parseFeed("<rss><channel/></rss>")).toEqual([]);
    expect(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"/>')).toEqual([]);
  });

  it("keeps escaped angle brackets in Atom text constructs", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Why Vec&lt;T&gt; grows</title><link href="https://a.example/v"/>
      <published>2026-11-18T09:00:00Z</published><summary>x &lt; y &amp;&amp; y &gt; z</summary></entry></feed>`;
    const [e] = parseFeed(xml);
    expect(e.title).toBe("Why Vec<T> grows");
    expect(e.summary).toBe("x < y && y > z");
  });

  it("reads Atom type=xhtml content and decodes html content", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title type="html">A &amp;amp; B</title><link href="https://a.example/x?a=1&amp;b=2"/>
      <published>2026-11-18T09:00:00Z</published>
      <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hello <b>world</b></p></div></content></entry></feed>`;
    const [e] = parseFeed(xml);
    expect(e.title).toBe("A & B");
    expect(e.url).toBe("https://a.example/x?a=1&b=2");
    expect(e.summary).toContain("Hello");
    expect(e.summary).toContain("world");
  });
});

describe("cleanUrl", () => {
  it("drops tracking params and fragment but keeps www and trailing slash", () => {
    expect(cleanUrl("https://www.a.example/post/?utm_source=x&id=3#top")).toBe("https://www.a.example/post/?id=3");
  });
});
