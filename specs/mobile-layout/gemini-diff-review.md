### Findings (Ranked by Severity)

#### 1. [HIGH] Comment delete row & unbreakable comment text overflow at 390px
- **Where:** [CommentSection.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/CommentSection.tsx#L213-L256), [CommentSection.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/CommentSection.tsx#L159-L177)
- **Failure scenario:**
  1. At `390px` viewport, a `BitCard`'s inner content width is `320px` (`390 - 2×14 page padding - 2×20 card padding - 2 border`).
  2. In the delete-password prompt ([CommentSection.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/CommentSection.tsx#L232-L255)), the flex row does not wrap (`display: "flex"`). Its children total `140px` (input) + `~62px` (`Delete`) + `~48px` (`Cancel`) + `~115px` (`"Incorrect password."`) + `18px` (gaps) = **`~383px > 320px`**, overflowing the card and page horizontally.
  3. In the comment list ([CommentSection.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/CommentSection.tsx#L213-L218)), the wrapper `<div>` lacks `minWidth: 0` and `<p>` lacks `overflowWrap: "anywhere"`. Any comment containing a long URL or unbroken string pushes the `✕` button off-screen and triggers horizontal page scroll.
  4. In the author/password row ([CommentSection.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/CommentSection.tsx#L159-L177)), `<input style={{ flex: 1 }}>` lacks `minWidth: 0`, so its default intrinsic `size="20"` minimum width (`~170px`) plus `120px` password input + `8px` gap (`~298px`) barely fits at `390px` and overflows under browser font scaling or narrower viewports.
- **Fix:** Add `minWidth: 0` to `<input style={{ flex: 1, minWidth: 0 }}>` (line 166) and the comment body `<div>` (line 214); add `overflowWrap: "anywhere"` to comment `<p>` (line 217); add `flexWrap: "wrap"` to the delete row (line 232).

---

#### 2. [HIGH] Rebit modals & Thread-reply modals clip off-screen when mobile keyboard opens
- **Where:** [ThreadReplyButton.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/ThreadReplyButton.tsx#L89-L192), [RebitButton.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/RebitButton.tsx#L85-L165), [RichTextarea.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/RichTextarea.tsx#L160-L205)
- **Failure scenario:** Both modals use `position: "fixed", inset: 0, display: "flex", alignItems: "center"` without `overflowY: "auto"` on the backdrop or `maxHeight` on the dialog card, and both `autoFocus` their textarea. On a `390×844` phone, focusing opens the virtual keyboard (`~320px`), leaving `~420px` of visible height. `ThreadReplyButton`'s dialog (`~360px` base height with title input + formatting toolbar + 7-row `minHeight: 140px` textarea, plus an absolute `maxHeight: 240px` `[[` autocomplete listbox in [RichTextarea.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/RichTextarea.tsx#L164-L178)) overflows the visible viewport with no ability to scroll to the `Post` button or autocomplete options.
- **Fix:** Add `overflowY: "auto"` to the fixed overlay, `maxHeight: "calc(100dvh - 40px)", overflowY: "auto"` to the modal card, and reduce `minHeight`/`rows` on mobile.

---

#### 3. [MEDIUM] Unbroken text / URLs still overflow in `RebitCard`, thread titles, backlinks, and active tag banner
- **Where:**
  - [RebitCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/RebitCard.tsx#L34-L45) (`message` paragraph)
  - [BitCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/BitCard.tsx#L46-L53) (`Thread: {bit.thread.title}` link — default title is sliced from the first 60 chars of `bit.content`, which can be a URL)
  - [threads/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/page.tsx#L68-L76) (flex child `<div>` has no `minWidth: 0`; `<h2>` has no `overflowWrap: "anywhere"`)
  - [ThreadEditors.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/threads/ThreadEditors.tsx#L43-L44) (`<h1 style={titleStyle}>`) & [threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L169-L180) (backlink title & snippet)
  - [tags/[tag]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/tags/%5Btag%5D/page.tsx#L60-L62) (`<h1>#{normalized}</h1>`) & [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L47-L60) (`Showing #...` banner where `Show all ✕` lacks `flexShrink: 0, whiteSpace: "nowrap"`)
- **Failure scenario:** The diff only added `overflowWrap: "anywhere"` to [BitCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/BitCard.tsx#L55) and [threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L99). Any long unbroken string or URL in a rebit note, auto-generated thread title, or backlink snippet expands past `362px` and causes horizontal page scroll.
- **Fix:** Add `overflowWrap: "anywhere"` (and `minWidth: 0` on flex children like [threads/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/page.tsx#L69)) to those text containers, plus `flexShrink: 0, whiteSpace: "nowrap"` on the `Show all ✕` link in [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L54-L59).

---

#### 4. [MEDIUM] RTL garden scroll trick hides day-of-week labels and leaves `/garden` inconsistent
- **Where:** [globals.css](file:///Users/jeong-ilin/study/dailybit/src/app/globals.css#L174-L175), [ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L121-L163), [GardenGrid.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/garden/GardenGrid.tsx#L78-L79)
- **Failure scenario:**
  1. Setting `.db-garden-scroll { direction: rtl }` starts the ~`880px`-wide graph at the far right edge (`324px` viewport window). Because the `Mon / Wed / Fri` day labels ([ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L134-L140)) are inside the scrolling container on the far left and not sticky, they are scrolled `~550px` off-screen and invisible when viewing recent weeks.
  2. Month labels ([ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L31-L41)) are only placed on the first week of each month; starting at the right edge can clip the leftmost visible month's label off-screen to the left.
  3. `/garden` ([GardenGrid.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/garden/GardenGrid.tsx#L78)) uses `className="overflow-x-auto"` without `.db-garden-scroll`, so on mobile `/` shows newest weeks first while `/garden` still shows 1-year-old weeks first.
- **Fix:** Make the `DAY_LABELS` column `position: "sticky", left: 0, background: "#FFFDF8", zIndex: 1` (or move it outside `.db-garden-scroll`), and apply `.db-garden-scroll` (or a client scroll-to-end effect) to `GardenGrid.tsx:78`.

---

#### 5. [MEDIUM] Accessibility & touch-target issues in the mobile swipeable tag row
- **Where:** [globals.css](file:///Users/jeong-ilin/study/dailybit/src/app/globals.css#L165-L172), [TagSidebarClient.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/TagSidebarClient.tsx#L85-L156), [tags/[tag]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/tags/%5Btag%5D/page.tsx#L89-L140), [threads/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/page.tsx#L89-L127), [threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L187-L227)
- **Failure scenario:**
  1. **Focus/DOM order mismatch (WCAG 1.3.2 / 2.4.3):** `.db-side-first { order: -1; }` visually moves the tag bar above the feed on mobile, while it remains after the entire feed in DOM order. Keyboard/switch/screen-reader users tab through the entire feed before reaching the top filter bar.
  2. **Missing landmark / accessible label:** `.db-tag-card-title { display: none; }` ([globals.css](file:///Users/jeong-ilin/study/dailybit/src/app/globals.css#L168)) hides `"Tags"` from assistive technologies too, and `.db-tag-card` has no `<nav aria-label="Tags">` or `role="region"`.
  3. **Active chip off-screen with no scroll affordance:** With `scrollbar-width: none` and `::-webkit-scrollbar { display: none }`, selecting or navigating to a tag beyond the first ~4 chips on `/tags/[tag]` renders the active `#C96820` chip off-screen to the right (`scrollLeft = 0`) with no `scrollIntoView` or edge fade.
  4. **Accidental privacy toggle when logged in:** In [TagSidebarClient.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/TagSidebarClient.tsx#L136-L151), each chip in the horizontal swipe strip has an adjacent `20×20px` lock toggle button (`padding: "4px"`, `12px` icon) with `4px` gap — easy to fat-finger while swiping and accidentally flip a tag between public and private.
  5. **Inconsistent bottom chip strip on `/threads/[id]`:** [threads/[id]/page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/threads/%5Bid%5D/page.tsx#L187) omits `db-side-first`, so the tag card stays at the bottom of the page on mobile but still loses its `"Tags"` title and becomes an unlabeled horizontal chip row.
- **Fix:** Wrap `.db-tag-card` in `<nav aria-label="Tag filter">`, add `aria-pressed={active}` / `aria-current={active ? "page" : undefined}`, scroll the active chip into view on mount, and either hide or enlarge the lock toggle touch target on mobile.

---

#### 6. [MEDIUM] Flaky & incomplete Playwright mobile E2E test
- **Where:** [e2e/mobile.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/mobile.spec.ts#L6-L30), [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L63-L79)
- **Failure scenario:**
  1. **Suspense race condition (lines 19–29):** `<BitList>` ([page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L63-L69)) and `<TagSidebar>` ([page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L74-L78)) are in independent `<Suspense>` boundaries. Test 2 waits for `.db-tag-card` to be visible and immediately checks `if ((await page.locator("article").count()) > 0)` without waiting for `<BitList>`'s Suspense fallback (`"Loading..."`) to finish. If `<TagSidebar>` resolves first, `count()` is `0` and the position assertion (`expect(tagBox!.y).toBeLessThan(postBox!.y)`) is silently skipped.
  2. **Empty-DB CI blind spot (line 25):** When CI runs against an empty DB, `<BitList>` renders `"No entries yet."` (no `<article>`), so the vertical-order assertion (`order: -1`) is never executed in CI.
  3. **Missing route coverage (line 6):** The diff modifies `/tags/[tag]` and `/threads/[id]`, but the test only visits `["/", "/threads", "/garden"]`.
- **Fix:** Assert the `.db-side-first` bounding box `y` against the main feed column (or wait for `"Loading..."` to detach before checking), and include a `/tags/...` and `/threads/...` route in the loop.

---

#### 7. [LOW] Mermaid SVG shrinks to unreadable size instead of scrolling horizontally at 390px
- **Where:** [MermaidDiagram.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/MermaidDiagram.tsx#L11-L26), [MermaidDiagram.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/MermaidDiagram.tsx#L53-L63)
- **Failure scenario:** The wrapper `<span style={{ overflowX: "auto" }}>` intends for wide diagrams to scroll horizontally, but `mermaid.initialize` leaves `useMaxWidth: true` (default), causing Mermaid to emit `<svg width="100%" style="max-width: ...">`. On a `320px`-wide mobile card, multi-column diagrams scale down into a `320px` box with microscopic text rather than overflowing and scrolling horizontally.
- **Fix:** Either constrain `<svg>` minimum width in CSS (e.g., `.db-mermaid svg { min-width: ... }`) or configure Mermaid / allow natural width when wider than the card.

---

#### 8. [LOW] Minor desktop spacing change on `HomePage`
- **Where:** [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L21), [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L40), [globals.css](file:///Users/jeong-ilin/study/dailybit/src/app/globals.css#L152-L153)
- **Failure scenario:** `HomePage` previously had `padding: "40px 20px 80px"` and grid `gap: "22px"`. Switching to `.db-page` and `.db-grid` changes desktop `HomePage` top padding to `32px` and grid gap to `24px`.
- **Fix:** Keep as-is if the unification with `/threads` and `/tags/[tag]` is intentional; otherwise override on `HomePage`.

---

### Areas with No Issues
- **CSS specificity vs. inline styles on refactored elements:** Inline `padding`, `gap`, `gridTemplateColumns`, `position: sticky`, and `overflowX` were cleanly removed from `.db-page`, `.db-grid`, `.db-side`, `.db-profile`, `.db-stats`, `.db-garden-scroll`, and `.db-tag-list` where media queries take over, and `.db-tag-card` uses `!important` in `@media (max-width: 760px)` to override its remaining inline `padding: "18px"` and `borderRadius: "18px"`.
- **Desktop `TagSidebarClient` button width after removing `width: "100%"` from `ROW_BASE`:** On desktop, `.db-tag-list` is `display: flex; flex-direction: column` with default `align-items: stretch`, so the direct-child `"All"` `<button>` still stretches full width, and tag `<button>` elements have `flex: 1` inside their row `<div>`.
- **`CodeBlock` horizontal scrolling at 390px:** `<code style={{ display: "block", whiteSpace: "pre", overflowX: "auto" }}>` ([MermaidDiagram.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/MermaidDiagram.tsx#L69-L83)) is inside `.db-grid` (`minmax(0, 1fr)`), and `white-space: pre` ignores the ancestor `<p>`'s `overflowWrap: "anywhere"`, so wide code blocks scroll inside their own box without widening the page.
- **Long URLs in `BitCard` body:** `splitByUrls` ([bit-content.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/bit-content.tsx#L80)) renders `<a>` with `wordBreak: "break-all"` and `<p>` in [BitCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/BitCard.tsx#L55) now has `overflowWrap: "anywhere"`.
- **`ProfileCard` identity row at 390px:** Changing `minWidth: "260px"` to `minWidth: "min(260px, 100%)"` ([ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L68)) prevents flex-wrap overflow if container width ever drops below `260px`.
