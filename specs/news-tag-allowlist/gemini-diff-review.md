### Ranked Findings

1. **`primary` tag bypasses alias resolution and allowlist check (`"dev"` category leak / duplicate alias tags)** — [news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L47-L48), [news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L88), [news-sources.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-sources.ts#L9)
   - **Failure scenario 1 (`"dev"` leaked as tag):** `NewsSource.tag` and `NewsThreadSource.tag` are optional (`tag?: string`), and `NewsItemMeta` ([news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L12)) wasn't given `tag?: string` at all (`buildNewsBit` always passes `meta.category` at line 88). If `buildNewsBit` is called for a `dev` source, or a future `dev` source omits `tag`, `primary` is `"dev"`. Because `head = norm(primary)` is pushed unconditionally without checking `NEWS_TAGS.includes(head)`, the output gets `#dev` (which is not in `NEWS_TAGS`).
   - **Failure scenario 2 (unaliased `primary` duplicate):** If a caller passes an alias as `primary` (e.g. `cleanTags(["nodejs"], "node")` or `cleanTags(["java"], "jdk")`), `head` is pushed as `"node"` without consulting `NEWS_TAG_ALIASES`, and `"nodejs"` is then pushed as a second tag (`["node", "nodejs"]`).
   - **Fix:** Resolve `head` through `NEWS_TAG_ALIASES` (and consider enforcing `NEWS_TAGS.includes(head)` or requiring `tag` on `category: "dev"` sources at the type level).

2. **Prompt "0 to 2 tags" cap collides with primary tag deduplication** — [news-ai.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L176), [news-ai.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L338)
   - **Failure scenario:** The prompt tells the LLM to pick `0 to 2` tags from an allowlist that includes the primary tags (`ai`, `security`, `java`, `spring`, `react`, `nextjs`, `nodejs`), without knowing which primary tag is auto-prepended. When the LLM naturally returns `["ai", "llm"]` for an AI article or `["spring", "java"]` for a Spring Blog post, `cleanTags` deduplicates the primary tag and leaves at most **2 tags** instead of `NEWS_MAX_TAGS` (3).
   - **Fix:** Either instruct the model not to repeat the source's primary tag, or allow `0 to 3` tags in the prompt so 2 secondary tags survive after deduplicating the primary tag.

3. **Underscore `_` is preserved in `norm()`, breaking snake_case tag/alias matching** — [news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L40-L45)
   - **Failure scenario:** No tag in `NEWS_TAGS` or `NEWS_TAG_ALIASES` contains `_`, yet `norm()` strips `[\s-]+` while keeping `_` via `[^\p{L}\p{N}_]`. If the LLM outputs `"spring_boot"`, `"machine_learning"`, `"zero_day"`, `"data_breach"`, or `"node_js"`, `norm()` produces `"spring_boot"` instead of `"springboot"`, failing to match `NEWS_TAG_ALIASES` / `NEWS_TAGS` and dropping the tag.
   - **Fix:** Strip `_` in `norm()` as well (e.g., `.replace(/[^\p{L}\p{N}]/gu, "")`, which also makes `.replace(/^#+/u, "")` and `.replace(/[\s-]+/gu, "")` redundant).

4. **Hardcoded tag allowlist in two prompts can drift from `NEWS_TAGS`** — [news-ai.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L176), [news-ai.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-ai.ts#L338), [news-sources.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-sources.ts#L17-L21)
   - **Failure scenario:** Adding or renaming a tag in `NEWS_TAGS` without manually updating both `WRITE_SYSTEM_PROMPT` and `EVENT_WRITE_SYSTEM_PROMPT` will leave the model unaware of the new tag (or outputting a removed tag that `cleanTags` silently drops).
   - **Fix:** Interpolate `${NEWS_TAGS.join(", ")}` into both prompt templates.

5. **Empty `primary` produces tagless output when all model tags are filtered out** — [news-compose.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.ts#L47-L55)
   - **Failure scenario:** If `primary` is `""` or punctuation-only (e.g. `"###"`) and `tags` contains no allowlisted entry (`cleanTags(["php"], "")`), `cleanTags` returns `[]` and the assembled Bit has no hashtag line. (Reachable only if a caller passes an empty/invalid `category`/`tag`.)

---

### Checked — No Issues
- **Prototype keys (`__proto__`, `constructor`, `toString`):** No issues — `Object.prototype.hasOwnProperty.call(NEWS_TAG_ALIASES, t)` and `NEWS_TAGS.includes(tag)` safely reject all `Object.prototype` keys, and [news-compose.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-compose.test.ts#L103) covers this.
- **Curation wiring & source tests:** No issues in [news-curate.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-curate.ts#L525-L529) or [news-feed.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/news-feed.test.ts#L61-L62).
