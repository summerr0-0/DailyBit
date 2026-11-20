// Obsidian식 [[링크]] 파싱 (spec: wiki-links D1, D2). 순수 함수 — 서버·클라이언트 공용.

import { withoutFences } from "./code-fence";

export type WikiToken = { type: "text"; value: string } | { type: "link"; target: string; label: string; raw: string };

const WIKI_PATTERN = /\[\[([^\[\]\n|]{1,100})(?:\|([^\[\]\n]{1,100}))?\]\]/g;

/** 링크 대상 비교 키: 소문자, 공백 하나로, 양끝 공백 제거 */
export function linkKey(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function splitWikiLinks(text: string): WikiToken[] {
  const out: WikiToken[] = [];
  let last = 0;
  for (const m of text.matchAll(WIKI_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ type: "text", value: text.slice(last, start) });
    const target = m[1].trim();
    out.push({ type: "link", target, label: (m[2] ?? m[1]).trim(), raw: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

/** 본문이 가리키는 링크 대상 키 목록 (중복 제거) */
export function extractLinkKeys(text: string): string[] {
  // ``` 코드 블록 안의 [[ ]] (Mermaid 서브루틴 모양 등)는 링크가 아니다
  return [...new Set(splitWikiLinks(withoutFences(text)).flatMap((t) => (t.type === "link" ? [linkKey(t.target)] : [])))];
}

/** 링크 대상 사전: linkKey → threadId */
export type LinkTargets = Record<string, string>;

/** 프로토타입 키(constructor 등)에 걸리지 않는 조회 (Gemini wiki #2) */
export function resolveLink(links: LinkTargets | undefined, target: string): string | undefined {
  if (!links) return undefined;
  const k = linkKey(target);
  return Object.prototype.hasOwnProperty.call(links, k) ? links[k] : undefined;
}

/** 주어진 본문들이 실제로 가리키는 대상만 남긴 사전 — 클라이언트로 넘길 때 전체 목록 노출 방지 (Gemini wiki #1) */
export function pickLinks(links: LinkTargets, contents: readonly string[]): LinkTargets {
  const out: LinkTargets = {};
  for (const c of contents) {
    for (const k of extractLinkKeys(c)) {
      if (Object.prototype.hasOwnProperty.call(links, k)) out[k] = links[k];
    }
  }
  return out;
}
