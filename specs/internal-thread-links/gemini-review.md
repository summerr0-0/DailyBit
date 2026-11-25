# Gemini review — internal thread links (Gemini 4 Argon (High), 2026-11-24)

1. **[scripts/fix-thread-links.ts:19-24](file:///Users/jeong-ilin/study/dailybit/scripts/fix-thread-links.ts#L19-L24) — Wrong link target: ambiguity check ignores `linkKey` normalization, concept `term`/`aliases` priority, oldest-thread precedence, and visitor visibility**
   - **Why**: At render time ([src/lib/link-targets.ts:14-40](file:///Users/jeong-ilin/study/dailybit/src/lib/link-targets.ts#L14-L40)), `[[title]]` is resolved via `linkKey(title)` (`NFC` + lowercase + whitespace collapse), oldest thread (`createdAt: "asc"`) wins on duplicate keys, published `Concept.term`/`aliases` overwrite thread titles, and visitors (`getLinkTargets(false)`) only see threads with at least one public bit. However, the script checks `prisma.thread.groupBy({ by: ["title"], where: { title: { in: titles } } })`, which uses raw case/whitespace-sensitive SQL equality on `Thread.title` only:
     - Threads whose titles differ only in case or whitespace (e.g., `"Lean"` vs `"lean"`) each have `_count._all === 1` in `groupBy`, so the newer thread's URL is rewritten to `[[title]]` and resolves at render time to the **older** thread.
     - A thread whose `linkKey(title)` matches any published concept's `term` or `aliases` (pointing to a different concept `threadId`) has `_count._all === 1` in `thread.groupBy`, so rewriting its URL to `[[title]]` redirects it to the **concept thread**.
     - A linked thread with only private bits (or with an older private-only duplicate) will either fail to resolve for visitors or resolve to different threads for owner vs. visitor.
   - **Fix**: Compare against actual render-time link resolution for both owner and visitor (`getLinkTargets(true)` and `getLinkTargets(false)`):
     ```ts
     import { getLinkTargets } from "@/lib/link-targets";
     import { resolveLink } from "@/lib/wiki-links";
     // ...
     const [ownerTargets, publicTargets] = await Promise.all([getLinkTargets(true), getLinkTargets(false)]);
     const byId = new Map(
       threads
         .filter((t) => resolveLink(ownerTargets, t.title) === t.id && resolveLink(publicTargets, t.title) === t.id)
         .map((t) => [t.id, t.title]),
     );
     ```

2. **[src/lib/thread-link-fix.ts:18-24](file:///Users/jeong-ilin/study/dailybit/src/lib/thread-link-fix.ts#L18-L24) — Regex mistake & data loss in migration: `([^\n]*?)` wipes out prose on bullet/`New to this?` lines and strips ` → ` (duplicating labels) on non-prefixed lines**
   - **Why**:
     - `arrow` (`new RegExp(`([^\\n]*?) → ${SITE_LINK.source}`, "g")`) captures everything from the beginning of the line up to ` → URL` into `label`.
     - Line 22 (`const prefix = label.match(/^(\s*-\s+|New to this\?\s+)/)?.[1] ?? `${label} ``) keeps only the leading `"- "` or `"New to this? "` and **discards the rest of `label`**. Any bullet line containing commentary or an earlier clause before ` → URL` (e.g., `- 배경 설명: Lean → https://irin-j.com/threads/c2` or `- [[A]] 참고, B → https://irin-j.com/threads/c2`) loses all text between `- ` and ` → URL` and becomes `- [[Lean]]`.
     - Conversely, when `label` does *not* start with `^\s*-\s+` or `^New to this\?\s+` (e.g., `Lean → https://irin-j.com/threads/c2`, `Related news: Title → URL`, or a second `label → URL` on the same line), `prefix` falls back to `` `${label} ` ``, deleting ` → ` and leaving `label` in front of `[[title]]` (`"Lean [[Lean]]"`).
   - **Fix**: Anchor step 1 to whole auto-generated lines with `/gm` so only `- <label> → <url>` and `New to this? <label> → <url>` lines replace their label, leaving other inline URLs for step 2:
     ```ts
     const arrow = new RegExp(`^(\\s*-\\s+|New to this\\?\\s+)[^\\n]*? → ${SITE_LINK.source}$`, "gm");
     const once = content.replace(arrow, (m, prefix: string, id: string) => {
       const l = link(id, "");
       return l ? `${prefix}${l}` : m;
     });
     ```

3. **[src/lib/scrap-drafts.ts:562-568](file:///Users/jeong-ilin/study/dailybit/src/lib/scrap-drafts.ts#L562-L568), [src/lib/scrap-drafts.ts:620-629](file:///Users/jeong-ilin/study/dailybit/src/lib/scrap-drafts.ts#L620-L629), [src/lib/draft-hooks.ts:95-99](file:///Users/jeong-ilin/study/dailybit/src/lib/draft-hooks.ts#L95-L99) — Wrong link target & broken dedupe when `[[newsThread.title]]` does not resolve to `newsThread.id`**
   - **Why**:
     - `planConceptPublish` deduplicates `linkedEvents` by `threadId` (`!unique.some((u) => u.threadId === e.threadId)`), and `relatedNewsBit` formats every `WIKI_SAFE` title as `[[${t}]]`. If two linked news threads share the same `linkKey(title)` (or if a news thread's title collides with an older thread's title or a published concept's `term`/`alias`), `[[newsThread.title]]` resolves at render time to the older/concept thread instead of `newsThread.id`, and two same-titled news threads produce duplicate `- [[Same Title]]` lines in `Related news:`.
     - In `reconcileConceptLinks` ([src/lib/scrap-drafts.ts:620-623](file:///Users/jeong-ilin/study/dailybit/src/lib/scrap-drafts.ts#L620-L623)), dedupe checks `extractLinkKeys(b.content).includes(newsKey)` (`newsKey = linkKey(newsThread.title)`). If any bit in the concept thread already contains `[[Same Title]]` (either from another news thread with the same title or an inline concept link in the concept explanation body), `reconcileConceptLinks` falsely treats `newsThread.id` as already linked and skips it.
   - **Fix**: In `publishConceptDraft` and `reconcileConceptLinks`, check whether `[[newsThread.title]]` resolves to `newsThread.id` via `getLinkTargets` (and in `planConceptPublish`, also check for duplicate `linkKey(e.title)`). When a title does not uniquely resolve to `e.threadId`, force the URL fallback (`${clip(t, maxLabel)} → ${threadUrl(e.threadId)}`), and in `reconcileConceptLinks` only treat `extractLinkKeys(b.content).includes(newsKey)` as a match when `newsKey` resolves to `newsThread.id`.

4. **[src/lib/thread-link-fix.ts:11-16](file:///Users/jeong-ilin/study/dailybit/src/lib/thread-link-fix.ts#L11-L16) & [scripts/fix-thread-links.ts:28-32](file:///Users/jeong-ilin/study/dailybit/scripts/fix-thread-links.ts#L28-L32) — Fallback links stay on `daily-bit.vercel.app` and longer replacement titles can overflow `Bit.content` (`VarChar(500)`)**
   - **Why**:
     - When a thread has an ambiguous title (omitted from `byId`) or a title that `[[ ]]` cannot hold (`!WIKI_SAFE.test(t)`, so `threadLink` returns `${clip(t)} → https://irin-j.com/threads/${id}` and `l.startsWith("[[")` is `false`), `rewriteThreadLinks` returns the original match `m` unchanged — leaving broken `https://daily-bit.vercel.app/threads/<id>` URLs in the DB instead of updating their host to `SITE_URL`.
     - Conversely, replacing a short label or bare 52-char URL (`New to this? <short term> → <url>` or `https://irin-j.com/threads/<cuid>`) with `[[<up to 100-char Thread.title>]]` can increase `next.length` past `BIT_MAX_CHARS` (500), causing `prisma.bit.update` ([scripts/fix-thread-links.ts:32](file:///Users/jeong-ilin/study/dailybit/scripts/fix-thread-links.ts#L32)) to fail on `@db.VarChar(500)`.
   - **Fix**: If `next.length > BIT_MAX_CHARS` (or if a thread cannot be rewritten to `[[title]]`), fall back to rewriting `https?:\/\/daily-bit\.vercel\.app\/threads\/([a-z0-9]+)` to `threadUrl(id)` so the old test domain is still migrated without exceeding 500 characters.
