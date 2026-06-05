const TAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
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
