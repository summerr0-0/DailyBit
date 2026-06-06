// 본문 렌더(BitCard)와 태그 추출(parseTags)이 동일 규칙을 쓰도록 단일 출처로 공유한다.
// g 플래그가 있어 lastIndex 부작용이 있으므로, 사용처에서 매번 새 RegExp를 만들거나 split/matchAll로 안전하게 쓴다.
export const TAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const MAX_TAGS = 10;

/**
 * 본문에서 #태그를 추출한다.
 * - 소문자로 정규화 (#React → react)
 * - 중복 제거 (등장 순서 유지)
 * - 최대 10개 (초과분 절삭)
 *
 * 본문 텍스트 자체는 변형하지 않는다. 반환값은 tags 배열뿐이다.
 */
export function parseTags(content: string): string[] {
  const seen = new Set<string>();

  for (const match of content.matchAll(TAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      if (seen.size >= MAX_TAGS) break;
    }
  }

  return Array.from(seen).slice(0, MAX_TAGS);
}
