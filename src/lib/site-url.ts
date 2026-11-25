// 사이트 기준 절대 URL (spec: news-curation-v2 D7). linkify는 절대 http(s) URL만 링크화하므로
// 개념 링크 Bit는 반드시 이 값으로 조립한다. next/* 금지 (cron 스크립트에서도 import).

// 운영 도메인. daily-bit.vercel.app은 예전(테스트) 주소라 쓰지 않는다 (2026-11-24)
const DEFAULT_SITE_URL = "https://irin-j.com";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, "");

export function threadUrl(threadId: string): string {
  return `${SITE_URL}/threads/${threadId}`;
}
