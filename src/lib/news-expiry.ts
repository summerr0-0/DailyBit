// NEWS 초안 남은 보관 기간 표시 (spec: news-curation D12, R9.2).
// 서버 컴포넌트에서 계산해 문자열로 내려 hydration 불일치를 막는다.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// TTL은 draft-hooks가 단일 출처 (cron 만료와 화면 표시가 같은 값·같은 경계를 쓴다)
export { NEWS_EVENT_DRAFT_TTL_MS as NEWS_DRAFT_TTL_MS, CONCEPT_DRAFT_TTL_MS } from "./draft-hooks";
import { NEWS_EVENT_DRAFT_TTL_MS as NEWS_DRAFT_TTL_MS } from "./draft-hooks";

/** 24h 이상 남으면 "expires in N days"(내림), 미만이면 "expires in Nh"(최소 1h). 기준 시각은 v2부터 updatedAt. */
export function newsExpiryLabel(since: Date, now: Date = new Date(), ttlMs: number = NEWS_DRAFT_TTL_MS): string {
  const remaining = since.getTime() + ttlMs - now.getTime();
  if (remaining >= DAY_MS) {
    const days = Math.floor(remaining / DAY_MS);
    return `expires in ${days} day${days === 1 ? "" : "s"}`;
  }
  const hours = Math.max(1, Math.floor(remaining / HOUR_MS));
  return `expires in ${hours}h`;
}

/** 보관 기간이 지났는지 (기본 NEWS 3일). */
export function isNewsDraftExpired(since: Date, now: Date = new Date(), ttlMs: number = NEWS_DRAFT_TTL_MS): boolean {
  return now.getTime() - since.getTime() > ttlMs; // cron: updatedAt < now - ttl 와 같은 경계
}
