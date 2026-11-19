// Bit 본문에서 http(s) URL 구간을 찾는 토크나이저 (spec D13).
// 본문 렌더(BitCard)와 태그 추출(parseTags)이 같은 규칙으로 URL 구간을 제외하도록 단일 출처로 둔다.
// 다른 스킴(javascript:, ftp: 등)은 절대 링크가 되지 않는다.

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCT = ".,;:!?";

export type TextSegment =
  | { type: "text"; value: string; start: number }
  | { type: "url"; value: string; start: number };

function count(str: string, ch: string): number {
  let n = 0;
  for (const c of str) if (c === ch) n++;
  return n;
}

/** 매치된 URL 후보의 끝에서 문장부호와 짝이 맞지 않는 `)`를 떼어낸다. */
function trimUrl(candidate: string): string {
  let url = candidate;
  for (;;) {
    const last = url.at(-1);
    if (last !== undefined && TRAILING_PUNCT.includes(last)) {
      url = url.slice(0, -1);
    } else if (last === ")" && count(url, ")") > count(url, "(")) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

/** 본문을 text/url 구간으로 나눈다. 구간을 이어 붙이면 원문과 같다. */
export function splitByUrls(content: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(new RegExp(URL_PATTERN))) {
    const start = match.index ?? 0;
    const url = trimUrl(match[0]);
    // 스킴만 남은 경우(`https://.`)는 링크로 보지 않는다.
    if (/^https?:\/\/$/.test(url)) continue;

    if (start > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, start), start: lastIndex });
    }
    segments.push({ type: "url", value: url, start });
    lastIndex = start + url.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex), start: lastIndex });
  }
  return segments;
}
