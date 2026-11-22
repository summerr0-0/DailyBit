# Security score bar — worklog (2026-11-22)

Request: "security가 너무 과하게 오는데 기준 score좀 높여줘라"

## Data (last 14 days, production)
- Drafted sources: thehackernews 12, bleepingcomputer 12, simonwillison 2, openai 1, spring 1 → security is ~85%.
- Security scores ≥5: thehackernews 7×12, 8×16; bleepingcomputer 7×8, 8×9, 9×1 — most drafted security news was 7.

## Change
- `MIN_SCORE_BY_CATEGORY = { security: 8 }`, `minScoreFor(category)`; AI and dev stay at 6.
- Applied in both places a score bar exists: scoring (`CANDIDATE` vs `SKIPPED low_score`) and `groupByEvent`
  (so 7-point security candidates already in the pool are not drafted; they go stale after 48h).
- Late sources go through `groupByEvent`, so a 7-point security article is not appended to an open event either.

## Expected effect
- Security items scoring exactly 7 (about 20 of 47 in 14 days) are no longer drafted.

## Verify
- tsc, eslint, vitest 298/298 (3 new tests: scoring bar, pool bar, `minScoreFor`).

## Gemini review
No bugs found. Added the suggested mixed-event test (7-point security source dropped, AI source drafted) and `minScoreFor(undefined)`. vitest 299/299.
