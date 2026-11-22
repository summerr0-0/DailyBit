### Findings

No real functional bugs found. Every path that gates on score now goes through `itemMinScore` / `minScoreFor`.

#### Minor / Low-Severity Notes & Test Gaps

1. **[Low] Test gap: mixed-category event group & late-source rejection aren't directly tested end-to-end**
   - **Location:** [news-curate.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.test.ts#L396-L430)
   - **Scenario:** The new tests cover standalone `sec7`, `sec8`, and `ai7` events and an isolated 7-point security pool item, but don't explicitly test:
     1. A shared event key with both a 7-point security item and a $\ge 6$-point AI/dev item (verifying the event is still drafted using only the AI/dev source, and the security source is excluded).
     2. A 7-point security item arriving as a late source for an already-`OPEN` event (mentioned in [worklog.md](file:///Users/jeong-ilin/study/dailybit/specs/security-min-score/worklog.md#L13)) or `minScoreFor(undefined)`.
   - **Fix:** Optional — add assertions in [news-curate.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.test.ts#L396-L430) for a shared `eventKey` across `krebs` (7) + `openai` (7) and for `minScoreFor(undefined) === MIN_SCORE`.

---

### Areas Verified with No Issues

- **Scoring & chunk-fallback event propagation ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L329-L342)):** `score >= itemMinScore(e)` gates both `CANDIDATE` vs `SKIPPED (low_score)` and `newEvents.set(...)`, so a 7-point security item neither enters the pool nor seeds `knownEvents` for later scoring chunks.
- **Pool grouping & pre-existing 7-point security candidates ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L228-L236), [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L385)):** `groupByEvent(await store.findPool(), itemMinScore)` filters each item individually before bucketing by `eventKey`. Legacy 7-point security `CANDIDATE` rows in the DB are ignored until `markStale` transitions them to `SKIPPED (stale)` after 48h.
- **Post-merge re-grouping ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L408)):** Passes `itemMinScore` to the second `groupByEvent(...)` call after `mergeEvents`, rather than falling back to the default `() => MIN_SCORE`.
- **Late sources & concepts ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L417-L465), [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L544-L615)):** Both operate strictly downstream of `groups` / `newEventGroups`, so `< 8` security items cannot be appended to an `OPEN` event draft or trigger concept drafts.
- **Mixed-category event groups ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L231), [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L333)):** Filtering happens per item (`itemMinScore(item)`), not per group max score. In an event with a 9-point AI item and a 7-point security item, the 7-point security item is dropped while the 9-point AI item still forms the group and is drafted.
- **Unknown `sourceId` fallback ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L41-L43), [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L257)):** If `sourceById.get(i.sourceId)` is `undefined`, `minScoreFor(undefined)` safely defaults to `MIN_SCORE` (`6`).
