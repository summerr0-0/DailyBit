### Critical — Data Exposure

1. **Private notes & `"Canada PR draws"` thread are publicly readable on `/threads` and `/threads/[id]`** ([store.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/store.ts#L13-L18), [threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L23-L89))
   - **Bug:** `postNote` sets `private: true` on each `Bit` and registers `#immigration` as a private tag, but attaches the Bit to a `Thread` (`"Canada PR draws"`). `Thread` has no `private` flag, `getThreads()` lists all threads with total `_count.bits` (including private bits), `getThread(id)` fetches all bits without `where: { private: false }`, and `getLinkTargets()` exposes the thread title to wiki-links.
   - **Scenario:** As soon as the cron posts the first backfill note, any anonymous visitor opening `/threads` sees `"Canada PR draws (3 steps)"` and clicking it renders every `private: true` immigration note in full.

---

### High — Rowspan Parsing, Dedupe & Silent Data Corruption

2. **Unchecked `headerIndex` (`-1`) silently writes `null` scores/invites and permanently poisons dedupe keys** ([parse.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/parse.ts#L86-L88), [parse.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/parse.ts#L140-L184))
   - **Bug:** `parseBcPnp` and `parseAaip` never validate that `iScore >= 0` and `iCount >= 0`. If `iScore` or `iCount` is `-1`, `row[-1] ?? ""` evaluates to `""`, producing `minScore: null, invitations: null, invitationsText: ""`. Because `drawKey` excludes `minScore` and `invitationsText`, those broken rows still compute the real `dedupeKey` and are inserted with `skipDuplicates: true`.
   - **Scenario:** WelcomeBC or AAIP renames `"Minimum score"` to `"Score"` or `"Number of invitations"` to `"Invitations issued"`. Instead of triggering `"no draws parsed"`, the monitor stores every new draw with `null` score/invites; even after fixing the regex, `existingKeys` / `skipDuplicates` blocks repairing those rows.

3. **`tableGrid` leaks `carry` across rows and misaligns columns on imperfect `rowspan`** ([parse.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/parse.ts#L46-L76))
   - **Bug:** (a) Trailing `fillCarried()` stops at the first column where `carry[col].left === 0`, failing to decrement `carry[c].left` for any carried column `c > col` if a row has fewer `<td>`s than the table width. (b) If a `Date` cell's `rowspan` is off by +1 (common in WelcomeBC CMS edits), `fillCarried()` injects the old date into `col 0` of the next draw date's 5-cell row, shifting its real date into `col 1` (`stream`), stream into `detail`, and `detail` into `minScore`.
   - **Scenario:** WelcomeBC sets `rowspan="6"` instead of `"5"` on `November 13, 2026`. The following `October 29, 2026` row is parsed as a bogus `2026-11-13` draw with `stream: "October 29, 2026"`, while the real Oct 29 draw is corrupted and dropped.

4. **`drawKey` omits score/invites/round number — drops same-day draws and re-adds historical rounds on wording edits** ([parse.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/parse.ts#L117-L135), [parse.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/parse.ts#L204-L206))
   - **Bug:** `drawKey` only hashes `program|drawDate|stream|detail`. `parseAaip` always sets `detail: ""` and `parseExpressEntry` discards `drawNumber`. Additionally, `mergeSameDraw` merges adjacent rows by value equality rather than actual `rowspan` provenance.
   - **Scenario (Drop):** AAIP runs two draws on the same date for the same stream name (e.g., two targeted sub-draws with different scores) — the second draw gets the identical `dedupeKey` and is silently dropped by `seen.has(dedupeKey)`.
   - **Scenario (Re-add):** IRCC updates `drawText2` wording across older rounds in `ee_rounds_123_en.json`. Since `known.size > 0` (`backfill = false`), hundreds of historical rounds get new `dedupeKey`s, are re-inserted as duplicates, and trigger a false `"Express Entry: new draws"` alert.

---

### Medium — Note Formatting, Partial Failures & Backfill

5. **Single long BC PNP draw line is completely dropped by `buildNote` (`"(+1 more)"` with 0 lines shown)** ([monitor.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/monitor.ts#L45-L67))
   - **Bug:** Unlike `checkPage` (which truncates lines to 160 chars), `drawLine` never truncates `d.stream` or `d.detail` (which in BC PNP joins multi-row selection factors via `" / "`). If a single draw's `head + drawLine + url + #immigration > 500`, `buildNote` falls back to `n = 0`. Also, if `footer.length > NOTE_MAX - 2`, `head.slice(0, negative)` slices from the end instead of clamping to `0`, exceeding 500 chars and crashing Prisma (`VarChar(500)`).
   - **Scenario:** A single new BC PNP draw has ~350 chars of merged `Selection factors`. `fit(1)` is >500 chars, so the posted Bit reads `"BC PNP: new draw\n(+1 more)\nhttps://...\n#immigration"`, hiding the only draw.

6. **DB state is committed before `postNote`, losing notifications on transient failure and breaking backfill recovery** ([monitor.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/monitor.ts#L98-L148))
   - **Bug:** `insertDraws` and `saveSnapshot` commit inside `checkProgram`/`checkPage` before `runMonitor` calls `store.postNote(note)`. Also, `backfill` is only `known.size === 0`.
   - **Scenario:** `insertDraws` commits a new draw (or partial initial seed), then `postNote` fails on a transient Supabase pooler error. The workflow exits 1, and on re-run `existingKeys` already contains the draw (`known.size > 0`), so the notification is permanently skipped.

7. **`pageText` duplicates nested block text and `parseTags` can drop `#immigration`** ([parse.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/parse.ts#L187-L195), [tags.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/tags.ts#L7-L33))
   - **Bug:** `querySelectorAll("h1, h2, h3, h4, p, li, td, th")` matches both an outer `<li>`/`<td>` and its inner `<p>`/nested `<li>`, emitting duplicate lines in `addedLines` when one bullet changes. Also, `parseTags` caps at `MAX_TAGS = 10` (and strips content inside ```` ``` ````), so if added notice lines contain 10 `#...` tokens before the trailing `#immigration`, the `immigration` tag is truncated from `Bit.tags`.

8. **No deduplication on `"no draws parsed"` warning notes** ([monitor.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/immigration/monitor.ts#L79-L85), [immigration.ts](file:///Users/jeong-ilin/study/dailybit/scripts/immigration.ts#L45-L47))
   - **Scenario:** If WelcomeBC returns a 200 HTML maintenance page or changes table headers, every daily cron run (and manual workflow retry) posts another duplicate `"layout may have changed"` Bit before exiting 1.
