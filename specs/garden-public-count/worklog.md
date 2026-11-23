# 가든 잔디·통계 공개 기준 (2026-11-23)
- 사용자 결정("ㅇㅇ해줘"): 방문자에게는 공개 Bit만 잔디·총 개수·연속 일수에 센다. 오너는 전부.
- `getGarden(includePrivate)`, `getStats(includePrivate)` — 호출부 4곳 모두 `isLoggedIn()` 전달.
- Gemini: 버그 없음 (gemini-diff-review.md). tsc, eslint, vitest 336.
