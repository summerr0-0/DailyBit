import { BIT_MAX_CHARS, threadLink } from "./draft-hooks";
import { threadUrl } from "./site-url";

// 옛 Bit의 사이트 안 절대 링크 → [[제목]] (scripts/fix-thread-links.ts). 순수 함수 — DB 없이 테스트.
const SITE_LINK = /https?:\/\/(?:daily-bit\.vercel\.app|(?:www\.)?irin-j\.com)\/threads\/([a-z0-9]+)/g;

/**
 * 자동으로 만든 줄("- 제목 → URL", "New to this? 이름 → URL")은 줄째 "- [[제목]]"으로, 그 밖의 URL은 "[[제목]]"으로.
 * titles에는 [[제목]]이 정확히 그 Thread로 풀리는 것만 넣는다(호출자가 확인). 없는 Thread·바꾸면 500자를 넘는 Bit는
 * 주소만 운영 도메인으로 바꾼다 — 예전 테스트 주소가 남지 않게 (Gemini links #2, #4).
 */
export function rewriteThreadLinks(content: string, titles: ReadonlyMap<string, string>): string {
  const wiki = (id: string) => {
    const title = titles.get(id);
    if (!title) return null;
    const l = threadLink(title, id);
    return l.startsWith("[[") ? l : null;
  };
  const arrow = new RegExp(`^(\\s*-\\s+|New to this\\?\\s+)[^\\n]*? → ${SITE_LINK.source}$`, "gm");
  const linked = content
    .replace(arrow, (m, prefix: string, id: string) => {
      const l = wiki(id);
      return l ? `${prefix}${l}` : m;
    })
    .replace(SITE_LINK, (m, id: string) => wiki(id) ?? m);
  const hostOnly = (t: string) => t.replace(SITE_LINK, (_m, id: string) => threadUrl(id));
  return hostOnly(linked.length <= BIT_MAX_CHARS ? linked : content);
}
