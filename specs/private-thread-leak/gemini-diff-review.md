## Findings Ranked by Severity

### 1. [Medium] Wiki-link target resolution on `/threads/[id]` leaks existence and ID of private-only threads
- **Location:** [src/app/threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L16-L21) → [src/lib/link-targets.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/link-targets.ts#L10-L31) (`getLinkTargets`)
- **Problem:** `ThreadPage` passes `owner` to `getThread(id, owner)`, `getTagCloud(owner)`, and `getBacklinks(thread.id, owner)`, but calls `getLinkTargets()` with **no privacy filter**. Inside `getLinkTargets()`, `prisma.thread.findMany({ select: { id: true, title: true } })` loads every thread—including threads containing only private bits (and `prisma.concept.findMany` loads published concepts even if their target thread is private-only).
- **Concrete failure scenario:**
  1. The owner creates a private-only thread titled `"Project X Acquisition"` (`id: "cpriv123"`).
  2. In any public thread (`MIXED_THREAD`), a public bit contains `[[Project X Acquisition]]` (or an attacker probes known/guessed `[[...]]` titles if any public surface renders wiki links).
  3. On `/threads/[MIXED_THREAD]`, `pickLinks(links, thread.bits.map((b) => b.content))` extracts `"project x acquisition"` and resolves it against the unfiltered `links` dictionary to `"cpriv123"`.
  4. `pageLinks` (`{ "project x acquisition": "cpriv123" }`) is serialized into the Next.js RSC payload as a prop to the client component `EditableBitContent` ([src/components/threads/ThreadEditors.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/threads/ThreadEditors.tsx#L78-L88)), and rendered as `<a href="/threads/cpriv123">Project X Acquisition</a>` instead of an unlinked `<span>`.
  5. A visitor learns that a hidden thread with that exact title exists, sees its `threadId`, and gets a broken link that leads to a `404`.
- **Fix:** Parameterize `getLinkTargets(includePrivate = false)` (note: `React.cache` memoizes per argument value) and filter `prisma.thread.findMany` with `where: includePrivate ? undefined : { bits: { some: { private: false } } }`.

---

### 2. [Medium] `PrivateTag` tags attached to public bits leak on `/threads/[id]` and `GET /api/bits/by-date`
- **Location:** [src/app/threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L122-L142), [src/lib/garden.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/garden.ts#L198) (`getBitsByDateKST`)
- **Problem:** DailyBit has a second privacy mechanism, `PrivateTag` ([src/lib/privateTags.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/privateTags.ts#L1-L23)). While `/threads/[id]` and `/threads` pass `owner` to `getTagCloud(owner)` (which strips `PrivateTag` entries from the sidebar for visitors) and `/tags/[tag]` returns `404` for private tags ([src/app/tags/[tag]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/tags/%5Btag%5D/page.tsx#L23-L24)), neither `getThread` nor `getBitsByDateKST` filters `PrivateTag` values out of `bit.tags` for visitors.
- **Concrete failure scenario:**
  1. The owner marks `#layoffs` as a private tag in `private_tags`, and writes a public bit `" Q4 planning notes #layoffs"` inside a thread.
  2. A visitor opens `/threads/[id]`: the sidebar hides `#layoffs`, **but the bit card still renders the `#layoffs` pill** ([src/app/threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L124-L140)) linking to `/tags/layoffs` (which 404s).
  3. A visitor calls `GET /api/bits/by-date?date=2026-11-22`: the JSON payload returns `"tags": ["layoffs"]` on that bit.

---

### 3. [Medium] `getGarden()` and `getStats()` in `src/lib/garden.ts` still count private bits, leaking private activity metadata and contradicting `GET /api/bits/by-date`
- **Location:** [src/lib/garden.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/garden.ts#L90-L174), [src/app/garden/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/garden/page.tsx#L8), [src/components/profile/ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L44)
- **Problem:** In `src/lib/garden.ts`, only `getBitsByDateKST` was updated with `includePrivate = false`. `getGarden()` (line 101) and `getStats()` (lines 130–132) still query all bits with no `private: false` filter.
- **Concrete failure scenario:**
  1. On `2026-11-22`, the owner posts **only** 1 private bit inside a secret thread (`2 pts`).
  2. A visitor views `/garden` (or `ProfileCard` on `/`): `getGarden()` shows `Today: 2`, a green square with tooltip `"2026-11-22: 2 pts"` (revealing that a private thread bit was written on that date), and `getStats()` increments `total bits` and `day streak`.
  3. The visitor clicks the green `2026-11-22` cell on `/garden`. `GardenGrid` ([src/components/garden/GardenGrid.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/garden/GardenGrid.tsx#L67)) fetches `GET /api/bits/by-date?date=2026-11-22`, which now returns `[]`. The UI displays **`"2026-11-22 · 0 entries — No entries for this day"`** directly beneath a green cell claiming `2 pts`.

---

### 4. [Medium] Midnight KST boundary race condition in `e2e/private-thread.spec.ts`
- **Location:** [e2e/private-thread.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/private-thread.spec.ts#L13-L37)
- **Problem:**
  - Line 13 computes `today` once in Node at module load: `new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)`.
  - Line 30 inserts the public bit in Postgres using `now() - interval '1 minute'`.
- **Concrete failure scenario:**
  - If the test runs during the first minute after KST midnight (`00:00:00`–`00:00:59 KST` / `15:00:00`–`15:00:59 UTC`), `today` evaluates to the new KST date (e.g. `2026-11-23`), while `now() - interval '1 minute'` in Postgres places `PUBLIC_BIT` at `2026-11-22 23:59 KST`.
  - `GET /api/bits/by-date?date=${today}` on line 65 returns `[]`, failing `expect(byDate).toContain(PUBLIC_BIT)`.
- **Fix:** Either anchor the inserted `"createdAt"` timestamps to a deterministic timestamp within `today` (e.g., `${today}T03:00:00+09:00` and `${today}T03:01:00+09:00`) instead of `now() - interval '1 minute'`, or derive `today` from the inserted timestamp returned by Postgres.

---

### 5. [Low] Empty threads (0 bits) are hidden from visitors, and owner has no visual badge for private steps on `/threads/[id]`
- **Location:** [src/lib/threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L30-L97), [src/app/threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L69-L145)
- **Details:**
  - **Empty threads (0 bits):** Because `POST /api/threads` ([src/app/api/threads/route.ts](file:///Users/jeong-ilin/study/dailybit/src/app/api/threads/route.ts#L35)) creates a thread with 0 bits, `bits: { some: { private: false } }` in `getThreads(false)` and `row.bits.length === 0` in `getThread(id, false)` hide 0-bit threads from visitors while keeping them visible to the owner (`includePrivate = true`). Hiding empty threads from visitors is desirable, though `/threads/[id]/page.tsx` line 147 (`thread.bits.length === 0` → `"No entries yet."`) is now only reachable by the logged-in owner.
  - **Missing `private` indicator on `/threads/[id]` for owner:** `getThread` ([src/lib/threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L85-L91)) does not select `private: true` on `bits`, so unlike `BitCard` on `/`, the owner viewing a mixed thread on `/threads/[id]` cannot see which steps are private vs. public.
  - **Duplicate stale JSDoc in `src/lib/garden.ts`:** Line 176 (`/** KST 날짜(yyyy-mm-dd)에 작성된 Bit를 최신순으로 반환한다. */`) was left above the new JSDoc on line 177; also note the query sorts `orderBy: { createdAt: "asc" }` (oldest-first, not newest-first).

---

## Detailed Review by Requested Category

### 1. Prisma Query Correctness (Prisma 7 + PostgreSQL)
- **Relation filter `bits: { some: { private: false } }` ([src/lib/threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L30)):**
  - **Correct.** In [prisma/schema.prisma](file:///Users/jeong-ilin/study/dailybit/prisma/schema.prisma#L88), `Bit.private` is `Boolean @default(false)` (`NOT NULL`). Prisma compiles `{ bits: { some: { private: false } } }` to an `EXISTS` subquery matching threads with at least one row in `bits` where `"private" = false`.
- **Filtered relation count `_count: { select: { bits: includePrivate ? true : { where: { private: false } } } }` ([src/lib/threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L36)):**
  - **Correct.** Prisma 7 supports filtered `_count` selections (`{ select: { bits: { where: ... } } }`), and TypeScript types `r._count.bits` as `number` in both branches of the ternary. Visitors see `bitCount` equal to the number of public bits only (preventing leak of hidden private step counts in mixed threads), while the owner sees total bits.
- **Nested relation filter `bits: { where: includePrivate ? undefined : { private: false } }` ([src/lib/threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L82-L83)):**
  - **Correct.** Passing `where: undefined` in Prisma omits the filter for the owner; passing `{ private: false }` filters the joined `bits` in SQL for visitors. The post-check `if (row && !includePrivate && row.bits.length === 0) return null;` guarantees that private-only threads return `null` → `notFound()` (HTTP 404), indistinguishable from a nonexistent thread ID.

### 2. Behavior Regressions for the Owner
- **No regressions in the modified paths:**
  - All four entry points ([src/app/threads/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/page.tsx#L10-L11), [src/app/threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L14-L16), [src/app/api/threads/route.ts](file:///Users/jeong-ilin/study/dailybit/src/app/api/threads/route.ts#L7), [src/app/api/bits/by-date/route.ts](file:///Users/jeong-ilin/study/dailybit/src/app/api/bits/by-date/route.ts#L13)) pass `await isLoggedIn()` (`true` for the owner).
  - There are no other internal callers of `getThreads`, `getThread`, or `getBitsByDateKST` in `src/` that forgot to pass `includePrivate`.
  - When `includePrivate = true`, the owner still sees private-only threads, mixed thread private bits, accurate total `bitCount` on `/threads` and `GET /api/threads`, and newly created empty threads (0 bits).
  - *(Pre-existing adjacent owner bug to be aware of)*: On the home feed (`/`), `BIT_SELECT` in [src/lib/bits.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/bits.ts#L90) hardcodes `_count: { select: { bits: { where: { private: false } } } }` regardless of `includePrivate`, so a private-only thread's badge on `/` shows `bitCount: 0` even to the logged-in owner.

### 3. Test Gaps in `e2e/private-thread.spec.ts`
1. **Midnight KST flakiness** (see Finding #4 above).
2. **Accidental substring reliance for mixed-thread private bit ([e2e/private-thread.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/private-thread.spec.ts#L35-L67)):**
   - The private bit in `MIXED_THREAD` is seeded as `` `${SECRET_BIT} again` `` (line 35), and the visitor test asserts `expect(page.getByText(SECRET_BIT)).toHaveCount(0)` and `expect(byDate).not.toContain(SECRET_BIT)`. Because `SECRET_BIT` is a prefix of `${SECRET_BIT} again`, it passes by substring match, but using a distinct constant (e.g. `MIXED_SECRET_BIT = "Hidden step in mixed ..."`) and explicitly asserting it is absent for visitors and present for the owner on `/threads/${MIXED_THREAD}` avoids masking bugs where `SECRET_THREAD` is hidden but `MIXED_THREAD` leaks its private bit.
3. **Missing owner assertions in `"owner still sees private threads and bits"` ([e2e/private-thread.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/private-thread.spec.ts#L70-L79)):**
   - Does not check `/threads/${MIXED_THREAD}` as owner (to verify both `PUBLIC_BIT` and `${SECRET_BIT} again` render, along with `"2 steps"`).
   - Does not check `GET /api/threads` as owner (to verify `SECRET_TITLE` is returned with `bitCount: 1` and `MIXED_TITLE` has `bitCount: 2`).
4. **Missing rendered step-count UI assertions:**
   - The visitor tests verify `bitCount === 1` in `GET /api/threads`, but never assert that `/threads` and `/threads/${MIXED_THREAD}` render `"1 step"` (and not `"2 steps"`) in the DOM.
5. **Missing edge-case & unit tests:**
   - No test for an **empty thread (0 bits)**: visitor should get 404 on `/threads/[id]` and not see it on `/threads`; owner should see `"No entries yet."` (200) on `/threads/[id]` and `0 steps` on `/threads`.
   - No test for **toggling the last public bit in a thread to private** (`PATCH /api/bits/[id]` with `{ action: "private" }`) and verifying the thread immediately becomes 404/hidden for visitors.
   - No Vitest unit/integration tests for `getThreads`, `getThread`, or `getBitsByDateKST` ([src/lib/garden.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/garden.test.ts) only tests pure grid functions).

---

## What Is Explicitly Fine

- **Fail-closed defaults:** `getThreads(includePrivate = false)`, `getThread(id, includePrivate = false)`, and `getBitsByDateKST(dateKey, includePrivate = false)` all default to `false`, so any future caller that omits `includePrivate` defaults to visitor visibility.
- **No thread-title leak via `getBitsByDateKST` (`GET /api/bits/by-date`):** Although `getBitsByDateKST` selects `thread: { select: { id: true, title: true } }`, when `includePrivate = false` it only returns bits with `private: false`. Any thread attached to a public bit has at least that public bit, so a private-only thread's title can never be returned by `getBitsByDateKST(date, false)`.
- **No private backlink leak on `/threads/[id]`:** `ThreadPage` passes `owner` to `getBacklinks(thread.id, owner)` ([src/app/threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L19)), and `getBacklinks` ([src/lib/link-targets.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/link-targets.ts#L63)) filters `private: false` in SQL before `take: 500` and before per-thread deduplication (`seenThreads`), so a private bit linking to a public thread neither leaks its snippet/thread title nor masks an older public backlink from the same thread.
- **No cross-request cache poisoning between owner and visitor in Next.js 16:** `/threads` declares `export const dynamic = "force-dynamic"`, and `/threads/[id]`, `GET /api/threads`, and `GET /api/bits/by-date` all invoke `isLoggedIn()` → `await cookies()`, ensuring dynamic per-request evaluation.
- **Parallel promise refactoring in `src/app/threads/page.tsx`:** Awaiting `const owner = await isLoggedIn()` before `Promise.all([getThreads(owner), getTagCloud(owner)])` only reads the request cookie and verifies an in-memory HMAC (`verifySessionToken`), so it does not serialize any database queries.
