### Findings (Ranked by Severity)

#### 1. [High] Unrelated script committed with an infinite-loop bug
- **Location**: [scripts/.obsidian-import.ts](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L1-L171) (specifically [line 138](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L138) and [line 97](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L97) vs [line 147](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L147))
- **Failure scenario**:
  1. An unrelated one-off personal Obsidian import script (`scripts/.obsidian-import.ts`) is staged in this news-background diff.
  2. In `insert()` at [line 138](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L138), `while (usedDays.has(day)) day = Math.min(days - 1, day + 1);` hangs in an **infinite loop** whenever two items near the end of `ordered` collide on `day === days - 1` (`Math.min(days - 1, days)` stays `days - 1` forever).
  3. In `link()` at [line 97](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L97), `[[${items[r].title}]]` uses the full title while `insert()` at [line 147](file:///Users/jeong-ilin/study/dailybit/scripts/.obsidian-import.ts#L147) saves `it.title.slice(0, 100)`, breaking wiki-link resolution if any title exceeds 80–100 chars or contains `|` / `[` / `]`.
- **Fix**: Unstage `scripts/.obsidian-import.ts` from this commit (and if kept separately, search backward or find the nearest unused day when `day` hits `days - 1`).

---

#### 2. [High] `checkNumbersMulti` runs on `background.what`, causing false-positive `number_not_in_source` warnings when general knowledge is used
- **Location**: [src/lib/news-curate.ts:549-552](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L549-L552), [src/lib/news-ai.ts:342](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L342), [src/lib/news-compose.ts:120-135](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L120-L135)
- **Failure scenario**: The prompt ([src/lib/news-ai.ts:342](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L342)) invites the LLM to use "well-established general knowledge" for `background.what`. However, `NUMBER_TOKEN` (`/\d[\d.,]*\d|\d/gu`) matches *any* digit—even inside technical names and general definitions like `"3D medical imaging"`, `"Layer 2"`, `"S3-compatible"`, `"OAuth 2.0"`, `"HTTP/3"`, `"Web3"`, `"2FA"`, `"Base64"`, `"UTF-8"`. Because `news-curate.ts:550` joins **all** `built.segments` (now including the Background bit) into `checkNumbersMulti`, any digit in a general-knowledge `what` description that does not appear verbatim in `rawExtract` triggers a false-positive `number_not_in_source:<n>` warning badge in the inbox.
- **Fix**: Either exclude `background.what` from the text passed to `checkNumbersMulti` (check only summary, `background.risk`, and source points), or explicitly forbid digits in `background.what` unless present in `<sources>`.

---

#### 3. [High] Prompt self-contradiction and forced-guess hallucination risk on unfamiliar/new products
- **Location**: [src/lib/news-ai.ts:342](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L342) vs [src/lib/news-ai.ts:349](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L349)
- **Failure scenario**:
  1. Line 342 says: *"Use an empty string only if every developer already knows it (e.g. Chrome, GitHub, Linux)."* When an article covers a **brand-new project, newly coined tool, or obscure package** that is post-cutoff / absent from pretraining data and only named (not explained) in the extract—or shares a name with an unrelated project—forbidding `""` except for household names pressures the LLM to guess or hallucinate what the product is from name similarity.
  2. Line 342 (*"You may use well-established general knowledge here"*) directly contradicts line 349 (*"Only state facts found in the sources. Do not invent numbers, names, or claims"*).
- **Fix**: Allow `what: ""` when the sources do not explain what the subject is and the model does not know it with high certainty; qualify line 349 with *"Except for well-known subject context in `background.what`, only state facts found in the sources."*

---

#### 4. [Medium] `"Why it's dangerous"` vs `"Why it matters"` checks only `sources[0].category === "security"`
- **Location**: [src/lib/news-compose.ts:236](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L236) vs [src/lib/news-ai.ts:343](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L343)
- **Failure scenario**: The prompt tells the LLM to write `"For a security story: why it is dangerous — what an attacker can actually do, who is exposed, and what affected users should do"`. However, `buildNewsThread` decides the heading solely from `sources[0].category === "security"`.
  - If a security vulnerability or CVE advisory comes from an official dev/AI blog (`Node.js Blog`, `Spring Blog`, `Next.js Blog`, `React Blog` with `category: "dev"`, or `OpenAI News` / `Simon Willison` with `category: "ai"`), or
  - If a multi-source security event has a `"dev"`/`"ai"` article as `sources[0]` (highest score) and a `"security"` article (`Krebs`, `The Hacker News`, `Schneier`) as `sources[1]` (e.g. the existing `"node-security-release"` test in [src/lib/news-curate.test.ts:525-538](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.test.ts#L525-L538)),
  the LLM writes attacker/exposure/remediation text and tags it `#security`, but the bit heading is rendered as `"Why it matters"` instead of `"Why it's dangerous"`.
- **Fix**: At [src/lib/news-compose.ts:236](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L236), `tags` is already cleaned at line 213. Check `const isSecurity = tags.includes("security") || sources.some((s) => s.category === "security");`.

---

#### 5. [Medium] Premature 220-char clamping in `news-ai.ts` (before `stripUrls`) and tail-only 500-char truncation in `buildBackgroundBit`
- **Location**: [src/lib/news-ai.ts:473](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L473), [src/lib/news-compose.ts:233-236](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L233-L236), [src/lib/news-compose.ts:252-259](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L252-L259)
- **Failure scenario**:
  1. Unlike `headline`, `bullets`, and `sources[].point` (which `generateEventNews` leaves untruncated for `news-compose.ts` per [src/lib/news-ai.ts:416](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L416)), `generateEventNews` clamps `what` and `risk` at 220 chars (`clampText(v.trim(), 220)`) *before* `stripUrls`. If the LLM writes a 235-char two-sentence `what` or `risk` (or includes a URL), `clampText` chops the second sentence mid-clause with `"…"`, even though the combined Background bit (~400–450 chars) easily fits within the 500-char Bit limit (`NEWS_BIT_MAX_CHARS`).
  2. In `buildBackgroundBit` ([src/lib/news-compose.ts:257-258](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L257-L258)), when `buildNewsThread` or `buildBackgroundBit` is called directly with a long `what` (e.g. 475–485 chars) and non-empty `risk`, `truncateAtWord(parts.join("\n\n"), 500)` truncates from the end of the combined string—cutting right inside the second header (`"Background\n...\n\nWhy it's…"`), leaving a dangling heading with no body.
- **Fix**: Remove `clampText(..., BACKGROUND_MAX)` from `generateEventNews` (just `.trim()`), and in `buildBackgroundBit` allocate per-section character budgets when `text.length > NEWS_BIT_MAX_CHARS` so both `what` and `risk` keep complete bodies under their headings.

---

#### 6. [Low] Wiki `[[links]]` can leak into or break inside the Background bit
- **Location**: [src/lib/news-ai.ts:345](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L345), [src/lib/news-curate.ts:545](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L545)
- **Failure scenario**:
  1. [src/lib/news-ai.ts:345](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L345) says *"in the bullets, wrap the FIRST mention... Do not bracket anything else, and never in the headline"*, without mentioning `background` or `sources`. If the LLM brackets a concept in `background.what` or `background.risk`, [src/lib/news-curate.ts:545](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L545) runs `keepAllowedWikiLinks(seg, linkTerms)` with `linkTerms` across **all** segments (preserving duplicate `[[concept]]` links in Bit 2).
  2. If `clampText` or `truncateAtWord` truncates at a space inside `[[multi word concept]]` in `background`, it leaves unclosed `[[multi…` literal brackets that `keepAllowedWikiLinks` does not strip.
- **Fix**: Update [src/lib/news-ai.ts:345](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L345) to `"never in headline, background, or sources"`, and in [src/lib/news-curate.ts:545](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L545) pass `i === 0 ? linkTerms : []` to `keepAllowedWikiLinks` so brackets outside the summary bit are always stripped before truncation.

---

#### 7. [Low] Test gaps in `news-curate.test.ts` and `scripts/curate.ts`
- **Location**: [src/lib/news-curate.test.ts:81](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.test.ts#L81), [scripts/curate.ts:54](file:///Users/jeong-ilin/study/dailybit/scripts/curate.ts#L54)
- **Failure scenario**: Both the default test fixture in `makeDeps` and `--dry-run` in `scripts/curate.ts` hardcode `background: { what: "", risk: "" }`, which causes `buildBackgroundBit` to return `null`. In production, `background.risk` is non-empty for virtually every story ("why it matters to working developers" / "why it is dangerous"). As a result, zero `runCuration` tests exercise the 3+ segment layout (`[summary, background, ...sources]`) through `keepAllowedWikiLinks`, `checkNumbersMulti`, or late-source appending.
- **Fix**: Add at least one `runCuration` test in [src/lib/news-curate.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.test.ts) (and populate `background` in [scripts/curate.ts:54](file:///Users/jeong-ilin/study/dailybit/scripts/curate.ts#L54)) with non-empty `background.what` and `background.risk` followed by a late source append. (Also update the stale JSDoc on [src/lib/news-compose.ts:194](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L194) that still says `segments[1..] = 출처 Bit`.)

---

### Areas Verified With No Issues
- **Late-source append & source cap**: `findOpenEventDraft` counts `FeedItem` rows with `status: "DRAFTED"` ([src/lib/news-curate-store.ts:84](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate-store.ts#L84), [src/lib/news-curate.ts:798](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L798)) rather than `segments.length`, and `appendSourceSegment` ([src/lib/draft-hooks.ts:96-106](file:///Users/jeong-ilin/study/dailybit/src/lib/draft-hooks.ts#L96-L106)) appends to the end of `segments`, placing late sources cleanly after `[summary, background, ...initialSources]`.
- **Publish & concept links**: `publishDraft` / `publishEventDraft` ([src/lib/scrap-drafts.ts:464-529](file:///Users/jeong-ilin/study/dailybit/src/lib/scrap-drafts.ts#L464-L529)) validates every segment against `MAX_SEGMENT_CHARS` (500), uses `threadTitle || segments[0]`, creates one Bit per segment in order, and reconciles `Related news` backlinks on the concept thread without assuming segment indices `1..N` are sources.
- **Inbox source counter**: [src/components/scrap/NewsInbox.tsx:93](file:///Users/jeong-ilin/study/dailybit/src/components/scrap/NewsInbox.tsx#L93) filters by `seg.startsWith("Source: ")`, matching both `Source: {name} — {point}\n{url}` and bare `Source: {name}\n{url}` from `buildSourceBit` while excluding summary and background bits.
- **Structured output JSON schema (`EVENT_WRITE_SCHEMA`)**: [src/lib/news-ai.ts:370-375, 386](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L370-L386) sets `additionalProperties: false` and lists `"background"` in top-level `required` and `["what", "risk"]` in `background.required`, satisfying Anthropic structured outputs constraints while keeping `EventNewsOutput["background"]` optional in TypeScript for existing callers/tests.
- **Banned-phrase and URL stripping**: `buildNewsThread` ([src/lib/news-compose.ts:233-246](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L233-L246)) strips URLs from `what` and `risk`, sets `llm_url_removed`, and includes both in `findBannedPhrases`.
