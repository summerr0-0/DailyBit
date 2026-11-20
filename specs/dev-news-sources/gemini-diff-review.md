### Findings (Ranked by Severity)

#### 1. [High] Classifier vs. store count mismatch when a group's dev item is dropped before saving
- **Location:** [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L465-L504), [news-curate-store.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate-store.ts#L88-L98)
- **Bug:** `isDevGroup(group)` ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L465)) checks **all** items in `group.items` before content extraction and `MAX_SOURCES_PER_EVENT` (`3`) truncation ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L488-L498)). However, only `withContent` items are passed to `createEventDraft` and marked `status: "DRAFTED"`, while `countEventsWithSourcesSince` only counts events that have a `DRAFTED` `FeedItem` from `devSourceIds`.
- **Failure scenarios:**
  1. **Dev source fails content extraction:** A cross-category group has 1 `nodejs` item (score 9) and 1 `schneier` item (score 8). `isDevGroup` is `true` at line 476. At line 491, `resolveContent` returns `null` for the `nodejs` item (marked `SKIPPED` / `no_content`) and succeeds for `schneier`. The draft is saved with only `schneier` as `DRAFTED`. In the current run, an AI/security-only draft consumed a **dev** slot instead of a general slot (allowing 4 AI/security events in one run). In the next run within 24h, `countEventsWithSourcesSince` sees 0 `DRAFTED` dev items for that event, so the rolling 24h dev cap undercounts by 1 and allows a 6th dev event.
  2. **Dev source ranks 4th in a 4-item group:** A group has 3 security items (scores 9, 9, 8) and 1 `nodejs` item (score 8, older `publishedAt`). `isDevGroup` returns `true`, but the loop at line 490 stops at `MAX_SOURCES_PER_EVENT = 3`. Only the 3 security items become `DRAFTED`; the `nodejs` item stays `CANDIDATE` (and is marked `SKIPPED` / `event_full` on the next run). Again, it uses a dev slot in-run and is never counted by `countEventsWithSourcesSince` on later runs.
- **Fix:** Determine `dev` from `withContent` (or ensure at least one dev item is included in `withContent`), or persist the budget bucket (`isDev` / `category`) directly on `NewsEvent`.

---

#### 2. [Medium] Late-arriving dev source retroactively charges an AI/security event against the 24h dev budget
- **Location:** [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L449-L474), [news-curate-store.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate-store.ts#L88-L98)
- **Bug:** Step 5 (late sources) runs before Step 6 (`devBudget` calculation). When a late `dev` item is appended to an existing `OPEN` event via `appendSourceToDraft`, that `FeedItem` is marked `status: "DRAFTED"` with the event's `eventKey`. Step 6 then calls `countEventsWithSourcesSince`, which counts any `NewsEvent` created in the last 24h that currently has any `DRAFTED` dev `FeedItem`.
- **Failure scenario:** In Run 1, `krebs` and `bleepingcomputer` report a Spring CVE before the official blog posts; the group has no dev items, so it consumes 1 of the 3 **AI/security** slots. In Run 2 (12h later), `spring` publishes its advisory, and Step 5 attaches it as a late source (`status: "DRAFTED"`). Step 6 immediately counts that event in `countEventsWithSourcesSince`, deducting 1 from `devBudget`. A single event ends up consuming both an AI/security slot in Run 1 and a dev slot in Run 2.

---

#### 3. [Medium] In-run dev cap counts failed attempts, while cross-run 24h cap counts persisted drafts
- **Location:** [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L477-L478), [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L500-L503)
- **Bug:** The spec defines the dev budget as *"at most 5 new event drafts per rolling 24h"* (unlike AI/security's 3 attempts per run). `countEventsWithSourcesSince` counts persisted `NewsEvent` drafts, but inside the loop the cap checks `summary.devEventsAttempted >= devBudget`, and `summary.devEventsAttempted` is incremented at line 502 **before** `generateEvent`, `buildNewsThread`, and `createEventDraft`.
- **Failure scenario:** `devBudget` is `5` and 6 dev candidate groups are in the pool. Group 1 fails `generateEvent` (or hits `EventKeyConflictError`), and Groups 2–5 succeed. Because `summary.devEventsAttempted` reaches `5`, Group 6 is skipped (`continue`), leaving only 4 dev drafts created in the 24h window even though a valid 5th candidate was ready.

---

#### 4. [Medium] Scoring prompt places routine bug-fix patch releases in `Middle (4-6)`, overlapping `MIN_SCORE = 6`
- **Location:** [news-ai.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L70-L72), [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L37)
- **Bug:** `MIN_SCORE` is `6` (`score >= 6` becomes a `CANDIDATE` and is drafted if budget remains). The prompt defines `Middle (4-6)` and instructs: *"routine patch releases with only bug fixes are Middle"*. The model is not told that `6` is the drafting threshold.
- **Failure scenario:** Spring Blog routinely publishes 3–5 maintenance patch posts on the same release day (e.g., *Spring Boot 3.4.2 available now*, *Spring Boot 3.3.8 available now*, *Spring Framework 6.2.2 available now*). Because dev sources have a dedicated 5/day budget with low competition across only 5 blogs, any routine bug-fix release that Haiku scores `6` (the top of `Middle`) passes `MIN_SCORE = 6` and gets drafted into the inbox.
- **Fix:** Either explicitly cap routine bug-fix patch releases at `4-5` in the prompt (or state that `6+` is selected for drafting), or require `>= 7` for routine framework posts.

---

#### 5. [Low] `countEventsWithSourcesSince` scans all historical `DRAFTED` dev `FeedItem`s before filtering by `since`
- **Location:** [news-curate-store.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate-store.ts#L88-L98)
- **Bug:** The first query (`prisma.feedItem.findMany`) has no date filter and no index on `(sourceId, status)`, scanning all `DRAFTED` dev items across the 30-day retention table and passing every historical `eventKey` into `newsEvent.count({ where: { eventKey: { in: keys }, createdAt: { gte: since } } })`.
- **Failure scenario:** Over 30 days (or longer for any row with `publishedAt: null`, which `purgeFeedItemsPublishedBefore` never deletes), `keys` accumulates up to ~150+ event keys sent in an `IN (...)` clause on every run, whereas querying `newsEvent` with `createdAt: { gte: since }` first touches at most ~8–16 rows in a 24h window.

---

#### 6. [Low / Nit] `NewsInbox` subtitle omits Next.js
- **Location:** [NewsInbox.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/scrap/NewsInbox.tsx#L34)
- **Issue:** Copy says `"Auto-collected AI, security and Java/Spring/React/Node.js news..."`, omitting `Next.js` even though `nextjs` is one of the 5 added sources.

---

### Areas with No Issues
- **Loop `break` / `continue` control flow ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L477-L478)):** No issues. Using `continue` when only one category's budget is full and `break` only when both `generalAttempted >= MAX_EVENTS_PER_RUN` and `summary.devEventsAttempted >= devBudget` prevents high-scoring AI/security groups from starving lower-scored dev groups (and vice versa), including when `devBudget === 0`. Unpicked groups remain `CANDIDATE` in DB and expire after 48h via `markStale(freshCutoff)`.
- **`createMemoryStore` implementation & test coverage ([news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L788-L794), [news-curate.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.test.ts#L473-L545)):** No issues; in-memory `countEventsWithSourcesSince` matches the Prisma store's semantics.
