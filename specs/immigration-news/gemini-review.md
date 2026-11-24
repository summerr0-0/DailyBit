1. **Per-item AI omission (`summaries[i] === null`) silently marks the article as seen instead of retrying** — [news-digest.ts:67-79](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/news-digest.ts#L67-L79), [community-ai.ts:62-71](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/community-ai.ts#L62-L71)
   `summarizeArticles()` returns `(ArticleSummary | null)[] | null`, leaving `out[id] = null` whenever the model omits an item `id` or returns an empty `summary`. `runNewsDigest` only checks `if (summaries === null)`; any item where `summaries[i]` is `null` fails `x.s?.relevant` and is still recorded in `saveSeen`, permanently dropping it without evaluation or retry.

2. **Empty feed response on first run permanently consumes the `FIRST_RUN_LATEST` guard** — [news-digest.ts:47-64](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/news-digest.ts#L47-L64), [news-feed.ts:262](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.ts#L262)
   If a feed returns 0 entries on the first run (`before === null`), `parseFeed` returns `[]` without throwing and `pending` saves `[]` to `PageSnapshot`. On the next run, `before` is `[]` (`!== null`), bypassing `i < FIRST_RUN_LATEST` (3) and sending up to `MAX_ITEMS` (15) historical entries to Claude.

3. **Duplicate URLs in a feed can be posted twice or excluded from `saveSeen`** — [news-digest.ts:55-64](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/news-digest.ts#L55-L64)
   `seen` is not updated as `entries` are filtered, so duplicate normalized URLs within the same feed are both added to `candidates`. Worse, if the first occurrence is in `taken` and the duplicate lands in `deferred`, `urls.filter((u) => !deferred.has(u))` drops the URL from `saveSeen`, causing an already-posted article to be re-processed on the next run.

4. **`newsNote()` can exceed `Bit.content`'s `VarChar(500)` limit when URLs are long or `n <= 0` in `cut()`** — [news-digest.ts:26-32](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/news-digest.ts#L26-L32), [schema.prisma:84](file:///Users/jeong-ilin/study/dailybit/prisma/schema.prisma#L84)
   When `n = BIT_MAX - tail.length - head.length - 1 <= 0`, `cut(summary, n)` still returns `"…"` (1 char) whenever `summary` is non-empty, and `head` (up to 160 chars) is never shortened to accommodate a long `tail` (raw `e.url` is not cleaned via `cleanUrl()`). A total length > 500 throws a Prisma `P2000` error in `postNote` before `saveSeen` runs, wedging subsequent runs on the same item.

5. **Weekly CNDreams digest failures do not fail the job on Mondays** — [immigration-news.ts:49-60](file:///Users/jeong-ilin/study/dailybit/scripts/immigration-news.ts#L49-L60)
   Line 60 only checks `news.feeds.some((f) => f.error) || !news.summarized` and ignores `!digest.summarized` and `digest.listed === 0` when `weekly` is true, so CNDreams AI or parser failures exit `0` without triggering a workflow failure notification.

6. **Unbounded response buffering before `MAX_BYTES` check** — [immigration-news.ts:29-30](file:///Users/jeong-ilin/study/dailybit/scripts/immigration-news.ts#L29-L30)
   `await res.text()` buffers the entire response into memory before checking `body.length > MAX_BYTES` (unlike streaming `readCapped` in [news-feed.ts:306-335](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.ts#L306-L335)).

7. **Unrelated one-off local script committed with an infinite-loop bug** — [.obsidian-import.ts:1-171](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L1-L171)
   `scripts/.obsidian-import.ts` appears to be an accidental inclusion of a local one-off Obsidian import script. In addition, [`.obsidian-import.ts:138`](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L138) (`while (usedDays.has(day)) day = Math.min(days - 1, day + 1);`) loops infinitely whenever a date collision reaches `days - 1`.
(Background reference check completed — no remaining code references to `immigration-weekly.ts`.)
