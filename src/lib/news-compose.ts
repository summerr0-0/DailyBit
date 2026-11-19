import { linkKey } from "./wiki-links";
// 뉴스 초안 조립·린트 (spec: news-curation D9 / R6.1~R6.5).
// LLM의 구조화 출력 {headline, bullets, tags}를 코드가 단일 Bit 본문으로 조립한다.
// 순수 함수만 둔다(I/O 없음) — 스크립트와 테스트에서 그대로 쓴다.

export const NEWS_BIT_MAX_CHARS = 500;
export const NEWS_MAX_TAGS = 3;
const MIN_BULLETS = 2;

export type NewsOutput = { headline: string; bullets: string[]; tags: string[] };
export type NewsItemMeta = { url: string; category: string };

export type BuildNewsBitResult =
  | { ok: true; content: string; warnings: string[] }
  | { ok: false; reason: "empty_headline" | "too_few_bullets" };

// 스킴 있는 URL과 www. 토큰만 제거한다. 스킴 없는 도메인(Node.js 등)은 오탐 때문에 건드리지 않는다(D9).
const URL_TOKEN = /(?:https?:\/\/|www\.)\S+/giu;

function collapseSpaces(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** URL 토큰을 지우고 공백을 정리한다. removed는 하나라도 지웠는지. */
export function stripUrls(text: string): { text: string; removed: boolean } {
  let removed = false;
  const stripped = text.replace(URL_TOKEN, () => {
    removed = true;
    return " ";
  });
  return { text: collapseSpaces(stripped), removed };
}

/** 태그 정제(D9): 소문자, 앞 # 제거, 공백·하이픈 제거, [\p{L}\p{N}_]만 유지, 빈 값·중복 제거, 최대 3개. 0개면 category 태그. */
export function cleanTags(tags: readonly string[], category: string): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw
      .toLowerCase()
      .replace(/^#+/u, "")
      .replace(/[\s-]+/gu, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= NEWS_MAX_TAGS) break;
  }
  if (out.length > 0) return out;
  const fallback = category.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
  return fallback ? [fallback] : [];
}

function assemble(headline: string, bullets: string[], url: string, tags: string[]): string {
  const lines = [headline, ...bullets.map((b) => `- ${b}`), "", url];
  if (tags.length > 0) lines.push(tags.map((t) => `#${t}`).join(" "));
  return lines.join("\n");
}

/**
 * 구조화 출력을 `headline\n- b1\n- b2...\n\n{url}\n#t1 #t2` 로 조립한다.
 * 500자 초과면 마지막 불릿부터 제거하고, 불릿이 2개 미만이 되면 실패한다.
 * 금지어 경고는 조립된 headline·bullets 기준으로 함께 붙인다. 숫자 검사는 rawExtract가 필요하므로 호출자가 checkNumbers로 따로 한다.
 */
export function buildNewsBit(output: NewsOutput, meta: NewsItemMeta): BuildNewsBitResult {
  const warnings: string[] = [];
  let urlRemoved = false;

  const h = stripUrls(output.headline ?? "");
  urlRemoved ||= h.removed;
  const headline = h.text;

  const bullets: string[] = [];
  for (const raw of output.bullets ?? []) {
    // 모델이 불릿 기호를 붙여 보내도 이중 "- - " 가 되지 않게 앞 기호를 떼어낸다.
    const b = stripUrls(raw.replace(/^\s*[-*•]\s+/u, ""));
    urlRemoved ||= b.removed;
    if (b.text) bullets.push(b.text);
  }

  if (!headline) return { ok: false, reason: "empty_headline" };
  if (urlRemoved) warnings.push("llm_url_removed");

  const tags = cleanTags(output.tags ?? [], meta.category);

  let content = assemble(headline, bullets, meta.url, tags);
  while (content.length > NEWS_BIT_MAX_CHARS && bullets.length > 0) {
    bullets.pop();
    content = assemble(headline, bullets, meta.url, tags);
  }
  if (bullets.length < MIN_BULLETS || content.length > NEWS_BIT_MAX_CHARS) {
    return { ok: false, reason: "too_few_bullets" };
  }

  warnings.push(...findBannedPhrases([headline, ...bullets].join("\n")));
  return { ok: true, content, warnings };
}

// 금지어(D9 + 흔한 과장 표현). label은 warning에 그대로 쓰인다.
const BANNED_PHRASES: { label: string; pattern: RegExp }[] = [
  { label: "game-changer", pattern: /\bgame[\s-]?chang(?:er|ers|ing)\b/iu },
  { label: "revolutionary", pattern: /\brevolutioni[sz]e[sd]?\b|\brevolutionary\b/iu },
  { label: "groundbreaking", pattern: /\bground[\s-]?breaking\b/iu },
  { label: "unlock", pattern: /\bunlock(?:s|ed|ing)?\b/iu },
  { label: "supercharge", pattern: /\bsupercharg(?:e|es|ed|ing)\b/iu },
  { label: "remains to be seen", pattern: /\bremains to be seen\b/iu },
  { label: "paradigm shift", pattern: /\bparadigm[\s-]shift\b/iu },
  { label: "secret sauce", pattern: /\bsecret sauce\b/iu },
  { label: "cutting-edge", pattern: /\bcutting[\s-]edge\b/iu },
  { label: "next-level", pattern: /\bnext[\s-]level\b/iu },
  { label: "mind-blowing", pattern: /\bmind[\s-]?blowing\b/iu },
  { label: "seismic", pattern: /\bseismic\b/iu },
];

/** 금지어가 있으면 `banned:<phrase>` 경고 목록을 반환한다. */
export function findBannedPhrases(text: string): string[] {
  return BANNED_PHRASES.filter(({ pattern }) => pattern.test(text)).map(({ label }) => `banned:${label}`);
}

const NUMBER_TOKEN = /\d[\d.,]*\d|\d/gu;

/**
 * 숫자 검사(D9): output의 숫자 토큰에서 쉼표를 빼고, 쉼표를 뺀 rawExtract에 문자열로 있는지 본다.
 * 없으면 `number_not_in_source:<n>` 경고(발행 차단 아님). output에는 headline·bullets만 넣는다(본문 URL 숫자 제외).
 */
export function checkNumbers(output: string, rawExtract: string): string[] {
  const source = rawExtract.replace(/,/gu, "");
  const warnings: string[] = [];
  for (const match of output.matchAll(NUMBER_TOKEN)) {
    const n = match[0].replace(/,/gu, "");
    const w = `number_not_in_source:${n}`;
    if (!source.includes(n) && !warnings.includes(w)) warnings.push(w);
  }
  return warnings;
}

// ── v2: 사건별 Thread 조립 (spec: news-curation-v2 D3, D4, D6, D7, D14-6/8, R3.1~R3.4) ──

export const THREAD_TITLE_MAX_CHARS = 100;
const ELLIPSIS = "…";

/** max자 이하로 단어 경계에서 자르고 "…"를 붙인다. 공백이 없으면 글자 단위로 자른다. */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= ELLIPSIS.length) return text.slice(0, Math.max(0, max));
  const room = max - ELLIPSIS.length;
  const head = text.slice(0, room + 1); // 다음 글자가 공백이면 바로 앞이 단어 경계
  const cut = head.lastIndexOf(" ");
  const body = (cut > 0 ? head.slice(0, cut) : text.slice(0, room)).trimEnd();
  return body + ELLIPSIS;
}

export type NewsThreadOutput = {
  headline: string;
  bullets: string[];
  sources: { index: number; point: string }[];
  tags: string[];
};
export type NewsThreadSource = { name: string; url: string; category: string };

export type BuildNewsThreadResult =
  | { ok: true; segments: string[]; threadTitle: string; warnings: string[] }
  | { ok: false; reason: "empty_headline" | "too_few_bullets" | "no_sources" };

function assembleSummary(headline: string, bullets: string[], tags: string[]): string {
  const lines = [headline, ...bullets.map((b) => `- ${b}`)];
  if (tags.length > 0) lines.push("", tags.map((t) => `#${t}`).join(" "));
  return lines.join("\n");
}

/** 출처 Bit: `Source: {name} — {point}\n{url}`. point가 비면 `Source: {name}\n{url}`. point는 500자에 맞게 단어 경계로 자른다. */
export function buildSourceBit(input: { name: string; url: string; point?: string | null }): string {
  const name = collapseSpaces(input.name);
  const url = input.url.trim();
  const point = stripUrls(input.point ?? "").text;
  const bare = `Source: ${name}\n${url}`;
  if (!point) return bare;
  const prefix = `Source: ${name} — `;
  const room = NEWS_BIT_MAX_CHARS - prefix.length - 1 - url.length;
  if (room <= ELLIPSIS.length) return bare;
  return `${prefix}${truncateAtWord(point, room)}\n${url}`;
}

/** headline을 Thread 제목(≤100자)으로 만든다. */
function toThreadTitle(text: string): string {
  return truncateAtWord(collapseSpaces(text), THREAD_TITLE_MAX_CHARS);
}

/**
 * 구조화 출력 + 출처 목록 → Thread segments.
 * segments[0] = 요약 Bit(URL 없음, 태그 포함; 500자 초과면 뒤 불릿부터 제거, 2개 미만이면 실패).
 * segments[1..] = 출처 입력 순서대로 출처 Bit. output.sources[].index는 sources 배열 인덱스.
 * 숫자 검사는 호출자가 checkNumbersMulti로 따로 한다.
 */
export function buildNewsThread(output: NewsThreadOutput, sources: readonly NewsThreadSource[]): BuildNewsThreadResult {
  let urlRemoved = false;

  const h = stripUrls(output.headline ?? "");
  urlRemoved ||= h.removed;
  const headline = h.text;
  if (!headline) return { ok: false, reason: "empty_headline" };
  if (sources.length === 0) return { ok: false, reason: "no_sources" };

  const bullets: string[] = [];
  for (const raw of output.bullets ?? []) {
    const b = stripUrls(raw.replace(/^\s*[-*•]\s+/u, ""));
    urlRemoved ||= b.removed;
    if (b.text) bullets.push(b.text);
  }

  const tags = cleanTags(output.tags ?? [], sources[0].category);
  let summary = assembleSummary(headline, bullets, tags);
  while (summary.length > NEWS_BIT_MAX_CHARS && bullets.length > 0) {
    bullets.pop();
    summary = assembleSummary(headline, bullets, tags);
  }
  if (bullets.length < MIN_BULLETS || summary.length > NEWS_BIT_MAX_CHARS) {
    return { ok: false, reason: "too_few_bullets" };
  }

  // index → point (첫 번째 값 우선, 범위 밖 index는 무시)
  const points = new Map<number, string>();
  for (const s of output.sources ?? []) {
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= sources.length || points.has(s.index)) continue;
    const p = stripUrls(s.point ?? "");
    urlRemoved ||= p.removed;
    if (p.text) points.set(s.index, p.text);
  }

  const segments = [summary, ...sources.map((src, i) => buildSourceBit({ ...src, point: points.get(i) }))];

  const warnings: string[] = [];
  if (urlRemoved) warnings.push("llm_url_removed");
  warnings.push(...findBannedPhrases([headline, ...bullets, ...points.values()].join("\n")));

  return { ok: true, segments, threadTitle: toThreadTitle(headline), warnings };
}

function withBody(prefixLine: string, body: string): string {
  const room = NEWS_BIT_MAX_CHARS - prefixLine.length - 1;
  return `${prefixLine}\n${truncateAtWord(body, Math.max(0, room))}`;
}

/** 개념 Thread 앞 Bit 2개(D6 ①②). ③ 관련 뉴스 Bit는 발행 시점에 draft-hooks의 relatedNewsBit로 붙인다. */
export function buildConceptThread(input: { term: string; definition: string; whyItMatters: string }): {
  ok: true;
  segments: [string, string];
  threadTitle: string;
} {
  const term = stripUrls(input.term).text;
  const title = `What is ${term}?`;
  const first = withBody(truncateAtWord(title, NEWS_BIT_MAX_CHARS - 1), stripUrls(input.definition).text);
  const second = withBody("Why it matters", stripUrls(input.whyItMatters).text);
  return { ok: true, segments: [first, second], threadTitle: toThreadTitle(title) };
}

/** checkNumbers와 같은 규칙을 여러 출처 본문 합본 기준으로 적용한다(D4, R3.4). */
export function checkNumbersMulti(text: string, rawExtracts: readonly string[]): string[] {
  return checkNumbers(text, rawExtracts.join("\n"));
}

/**
 * 허용된 개념어만 [[링크]]로 남기고 나머지 [[...]]는 괄호를 벗긴다 (spec wiki-links D5).
 * 모델이 개념 목록에 없는 말을 괄호로 감싸는 실수를 막는다.
 */
export function keepAllowedWikiLinks(text: string, allowedTerms: readonly string[]): string {
  const allowed = new Set(allowedTerms.map(linkKey));
  return text.replace(/\[\[([^\[\]\n|]{1,100})(\|[^\[\]\n]{1,100})?\]\]/g, (raw, target: string, label?: string) =>
    allowed.has(linkKey(target)) ? raw : (label ? label.slice(1) : target),
  );
}
