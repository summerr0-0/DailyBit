// 피드 수집·파싱·URL 정규화 (spec news-curation D4, D5, D6, D8 / R2.*)
// scripts/curate.ts(tsx)에서도 실행되므로 next/*·server-only import 금지.
import { XMLParser } from "fast-xml-parser";
import type { NewsSource } from "./news-sources";

export const FEED_USER_AGENT = "DailyBitFeedReader/1.0 (+https://github.com/summerr0-0/DailyBit)";
export const FEED_TIMEOUT_MS = 10_000;
export const FEED_MAX_BYTES = 5 * 1024 * 1024;
export const FEED_CONCURRENCY = 4;
export const MAX_SUMMARY_LENGTH = 20_000;

export interface FeedEntry {
  url: string;
  title: string;
  summary: string;
  publishedAt: Date | null;
}

export type FeedErrorCode = "timeout" | "too_large" | "http" | "network" | "parse";

export class FeedFetchError extends Error {
  constructor(
    readonly code: FeedErrorCode,
    message: string,
    readonly sourceId?: string,
  ) {
    super(message);
    this.name = "FeedFetchError";
  }
}

// ---------------------------------------------------------------------------
// URL 정규화 (D5, R2.3)

const TRACKING_PARAMS = new Set([
  "ref",
  "ref_src",
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
]);

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase();
  return k.startsWith("utm_") || TRACKING_PARAMS.has(k);
}

/**
 * 게시용 URL: 추적 파라미터와 fragment만 제거하고 호스트(www 포함)·경로·끝 슬래시는 그대로 둔다.
 * Bit 본문 링크에 쓴다 — 중복 제거 키(normalizeUrl)는 www/끝 슬래시까지 지워 일부 사이트에서 링크가 깨질 수 있다.
 */
export function cleanUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url.trim();
  }
  for (const key of [...u.searchParams.keys()]) if (isTrackingParam(key)) u.searchParams.delete(key);
  u.hash = "";
  return u.toString();
}

/** http(s) 절대 URL만 피드 항목으로 받는다 — javascript:, 상대 경로 등은 버린다. */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** 소문자 호스트, www. 제거, 추적 파라미터·fragment·끝 슬래시 제거. 파싱 불가 URL은 trim만 해서 반환. */
export function normalizeUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url.trim();
  }
  const host = u.host.toLowerCase().replace(/^www\./, "");
  const params = new URLSearchParams();
  for (const [key, value] of u.searchParams) {
    if (!isTrackingParam(key)) params.append(key, value);
  }
  const search = params.toString();
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${host}${path}${search ? `?${search}` : ""}`;
}

// ---------------------------------------------------------------------------
// HTML → 텍스트 (D8: 태그 제거 + 엔티티 디코딩 + 20,000자 절삭)

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  times: "×",
  euro: "€",
  pound: "£",
};

/** 한 번의 패스로 디코딩 — `&amp;lt;`는 `&lt;`가 되고 `<`까지 가지 않는다. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string, maxLength = MAX_SUMMARY_LENGTH): string {
  const text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  const decoded = decodeHtmlEntities(text)
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return decoded.slice(0, maxLength);
}

// ---------------------------------------------------------------------------
// 파싱 (RSS 2.0 / Atom)

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

type XmlNode = Record<string, unknown>;

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === "object") return textOf((value as XmlNode)["#text"]);
  return "";
}

/** 중첩 노드(Atom type="xhtml")의 텍스트를 모두 이어 붙인다. 속성(@_)은 제외. */
function deepText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(deepText).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as XmlNode)
      .filter(([k]) => !k.startsWith("@_"))
      .map(([, v]) => deepText(v))
      .join(" ");
  }
  return "";
}

/**
 * Atom 텍스트 구성요소(type 속성): html → 태그 제거, xhtml → 중첩 텍스트, text(기본) → 태그 제거 없이 그대로.
 * text 타입은 XML 파서가 이미 &lt; 등을 풀었으므로 `Vec<T>` 같은 내용을 태그로 오인해 지우지 않는다.
 */
function atomText(node: unknown): string {
  if (node == null) return "";
  const type = typeof node === "object" && !Array.isArray(node) ? textOf((node as XmlNode)["@_type"]) : "";
  if (type === "html") return htmlToText(textOf(node));
  if (type === "xhtml") return plainText(deepText(node));
  return plainText(textOf(node));
}

function plainText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY_LENGTH);
}

function parseDate(value: unknown): Date | null {
  const raw = textOf(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const t = textOf(v);
    if (t.trim()) return t;
  }
  return "";
}

function rssLink(item: XmlNode): string {
  const links = (item.link as unknown[] | undefined) ?? [];
  for (const l of links) {
    const t = textOf(l).trim();
    if (t) return t;
  }
  const guid = item.guid;
  const isPermaLink =
    typeof guid === "object" && guid !== null ? (guid as XmlNode)["@_isPermaLink"] !== "false" : true;
  const g = textOf(guid).trim();
  return isPermaLink && /^https?:\/\//i.test(g) ? g : "";
}

function atomLink(entry: XmlNode): string {
  const links = ((entry.link as unknown[] | undefined) ?? []).filter(
    (l): l is XmlNode => typeof l === "object" && l !== null,
  );
  const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate");
  return decodeHtmlEntities(textOf(alt?.["@_href"]).trim());
}

/** RSS 2.0 또는 Atom XML을 항목 목록으로. 날짜: RSS pubDate, Atom <published>만(<updated> 무시, D6). */
export function parseFeed(xml: string): FeedEntry[] {
  let doc: XmlNode;
  try {
    doc = parser.parse(xml) as XmlNode;
  } catch (e) {
    throw new FeedFetchError("parse", `XML parse failed: ${(e as Error).message}`);
  }

  // 항목 없는 피드(<rss><channel/></rss>, <feed/>)는 파서가 빈 문자열을 준다 → 빈 목록
  if (doc.feed === "" || (doc.rss !== undefined && !(doc.rss as XmlNode)?.channel)) return [];

  const rss = doc.rss as XmlNode | undefined;
  const channel = rss?.channel as XmlNode | XmlNode[] | undefined;
  if (channel) {
    const ch = Array.isArray(channel) ? channel[0] : channel;
    const items = (ch.item as XmlNode[] | undefined) ?? [];
    return items
      .map((item) => ({
        url: rssLink(item),
        title: htmlToText(textOf(item.title)),
        summary: htmlToText(firstNonEmpty(item["content:encoded"], item.description)),
        publishedAt: parseDate(item.pubDate),
      }))
      .filter((e) => isHttpUrl(e.url));
  }

  const feed = doc.feed as XmlNode | undefined;
  if (feed) {
    const entries = (feed.entry as XmlNode[] | undefined) ?? [];
    return entries
      .map((entry) => ({
        url: atomLink(entry),
        title: atomText(entry.title),
        summary: atomText(deepText(entry.content).trim() ? entry.content : entry.summary),
        publishedAt: parseDate(entry.published),
      }))
      .filter((e) => isHttpUrl(e.url));
  }

  throw new FeedFetchError("parse", "Not an RSS 2.0 or Atom document");
}

// ---------------------------------------------------------------------------
// 요청 (D8: 정직한 UA, 10s 타임아웃, 5MB 상한, 재시도 없음)

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface FetchFeedOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
  maxBytes?: number;
}

async function readCapped(res: Response, maxBytes: number, controller: AbortController): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    controller.abort();
    throw new FeedFetchError("too_large", `Content-Length ${declared} exceeds ${maxBytes} bytes`);
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      controller.abort();
      await reader.cancel().catch(() => {});
      throw new FeedFetchError("too_large", `Response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(buf);
}

export async function fetchFeed(source: NewsSource, opts: FetchFeedOptions = {}): Promise<FeedEntry[]> {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? FEED_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? FEED_MAX_BYTES;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let xml: string;
    try {
      const res = await doFetch(source.feedUrl, {
        headers: {
          "User-Agent": FEED_USER_AGENT,
          Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!res.ok) {
        controller.abort();
        throw new FeedFetchError("http", `HTTP ${res.status}`, source.id);
      }
      xml = await readCapped(res, maxBytes, controller);
    } catch (e) {
      if (timedOut) throw new FeedFetchError("timeout", `Timed out after ${timeoutMs}ms`, source.id);
      if (e instanceof FeedFetchError) throw new FeedFetchError(e.code, e.message, source.id);
      throw new FeedFetchError("network", (e as Error)?.message ?? String(e), source.id);
    }
    try {
      return parseFeed(xml);
    } catch (e) {
      const err = e as FeedFetchError;
      throw new FeedFetchError("parse", err.message, source.id);
    }
  } finally {
    clearTimeout(timer);
  }
}

export type FeedResult =
  | { sourceId: string; items: FeedEntry[] }
  | { sourceId: string; error: FeedFetchError };

export interface FetchAllOptions extends FetchFeedOptions {
  concurrency?: number;
}

/** 소스별 결과를 입력 순서대로 반환. 한 피드의 실패는 다른 피드에 영향 없음, throw하지 않음. */
export async function fetchAllFeeds(
  sources: readonly NewsSource[],
  opts: FetchAllOptions = {},
): Promise<FeedResult[]> {
  const { concurrency = FEED_CONCURRENCY, ...fetchOpts } = opts;
  const results: FeedResult[] = new Array(sources.length);
  let next = 0;

  async function worker() {
    while (next < sources.length) {
      const i = next++;
      const source = sources[i];
      try {
        results[i] = { sourceId: source.id, items: await fetchFeed(source, fetchOpts) };
      } catch (e) {
        const error =
          e instanceof FeedFetchError ? e : new FeedFetchError("network", String(e), source.id);
        results[i] = { sourceId: source.id, error };
      }
    }
  }

  const n = Math.max(1, Math.min(concurrency, sources.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
