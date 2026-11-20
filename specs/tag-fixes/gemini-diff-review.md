### Findings (Ranked)

#### 1. [Low / Truncation Edge Case] Long `term` can starve `definition` to `""`, leaving a triple newline before the tag
- **Location:** [news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L254-L261)
- **Why:** `head` is given a budget of `NEWS_BIT_MAX_CHARS - 1 - suffix.length` (the entire 500-char limit minus `\n` and `suffix`). No minimum room is reserved for `body` (`definition`).
- **Failure scenario:** If `term` is unusually long (`title.length >= 500 - 1 - suffix.length`), `head` consumes the full budget, `room` becomes `0`, `truncateAtWord(body, 0)` returns `""`, and `segments[0]` renders with no definition and an extra blank line:
  ```text
  What is <truncated title>…


  #security
  ```
- **Fix:** Cap `head` (e.g., to `THREAD_TITLE_MAX_CHARS` or a reasonable header limit) so `definition` always gets the remaining space.

---

#### 2. [Low / Correctness Edge Case] Concept thread drops the primary tag when a source relies on LLM tags (e.g. `category: "dev"` without `source.tag`)
- **Location:** [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L587-L592)
- **Why:** `buildNewsThread` computes story tags via `cleanTags(output.tags ?? [], sources[0].tag ?? sources[0].category)`, whereas `buildConceptThread` is called with `cleanTags([], sourceById.get(lead.sourceId)?.tag ?? sourceById.get(lead.sourceId)?.category ?? "ai")`. Because `"dev"` is intentionally excluded from `NEWS_TAGS`, `cleanTags([], "dev")` returns `[]`.
- **Failure scenario:** All current `dev` sources in [news-sources.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-sources.ts#L46-L50) define an explicit `tag`, so they work today. However, if a general `category: "dev"` source without a fixed `tag` is added later, the news story will get the first valid tag from `gen.output.tags` (e.g. `#backend`), while its concept explainer thread will get `tags: []` (no tag).
- **Fix:** Pass `cleanTags(gen.output.tags ?? [], sourceById.get(lead.sourceId)?.tag ?? sourceById.get(lead.sourceId)?.category ?? "ai").slice(0, 1)`.

---

#### 3. [Low / Input Edge Case] `buildConceptThread` does not ignore empty or pre-prefixed `#` tags
- **Location:** [news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L256-L257)
- **Why:** `(input.tags ?? []).map((t) => `#${t}`).join(" ")` assumes callers already ran `cleanTags`.
- **Failure scenario:** A direct caller passing `tags: [""]` or `tags: ["#security"]` produces a trailing `\n\n#` or `\n\n##security` (and if `tags` itself exceeded 499 chars, `room` would go negative and `first` would exceed 500 chars).

---

### Checked & Fine

- **Privacy leaks / Next.js 16 Server Components ([threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L14-L16), [threads/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/page.tsx#L10)):** **No issues.**
  - `isLoggedIn()` reads `await cookies()`, which opts `/threads/[id]` into per-request dynamic rendering in Next.js 16 (and `/threads` also has `dynamic = "force-dynamic"`), preventing cross-request cache leaks between the logged-in owner and anonymous visitors.
  - When `owner === false`, [getTagCloud(false)](file:///Users/jeong-ilin/study/dailybit/src/lib/bits.ts#L234-L265) queries only `{ private: false }` bits and filters out all `PrivateTag` entries.
- **500-char limit with valid tags ([news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L256-L261)):** **No issues.** `head.length + 1 + truncateAtWord(body, room).length + suffix.length <= NEWS_BIT_MAX_CHARS` holds for all normal tag lengths (`suffix.length <= 499`), and `\n\n#tag` is never truncated off the end.
