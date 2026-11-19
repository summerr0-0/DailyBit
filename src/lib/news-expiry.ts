// NEWS 초안 남은 보관 기간 표시 (spec: news-curation D12, R9.2).
// 서버 컴포넌트에서 계산해 문자열로 내려 hydration 불일치를 막는다.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const NEWS_DRAFT_TTL_MS = 3 * DAY_MS;

/** 24h 이상 남으면 "expires in N days"(내림), 미만이면 "expires in Nh"(최소 1h). */
export function newsExpiryLabel(createdAt: Date, now: Date = new Date()): string {
  const remaining = createdAt.getTime() + NEWS_DRAFT_TTL_MS - now.getTime();
  if (remaining >= DAY_MS) {
    const days = Math.floor(remaining / DAY_MS);
    return `expires in ${days} day${days === 1 ? "" : "s"}`;
  }
  const hours = Math.max(1, Math.floor(remaining / HOUR_MS));
  return `expires in ${hours}h`;
}

/** 보관 기간(3일)이 지났는지. */
export function isNewsDraftExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() >= NEWS_DRAFT_TTL_MS;
}
