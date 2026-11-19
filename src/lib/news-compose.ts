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
