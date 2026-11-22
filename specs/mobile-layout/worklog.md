# Mobile layout pass — worklog (2026-11-22)

Request: "daily bit 모바일최적화좀"

## Before (production, iPhone 13 / 390px)
- `/`, `/threads`, `/threads/[id]`, `/tags/[tag]` scrolled sideways (scrollWidth 397–481px):
  pages used inline `gridTemplateColumns: "1fr 220px|252px"`, which cannot change by width.
- On thread pages the 220px tag column squeezed bits into a ~120px column (one word per line).
- Profile card padding 30/32px; garden graph started at the oldest weeks.

## Change
- `globals.css`: layout classes `.db-page`, `.db-grid` (`--db-side`), `.db-side`, `.db-side-first`,
  `.db-tag-card`, `.db-tag-list`, `.db-garden-scroll`, `.db-profile`, `.db-stats`, with a `max-width: 760px` query:
  - one column; sidebar not sticky
  - home / threads / tag pages: tag card moves above the feed and becomes one swipeable chip row
  - thread detail: tags stay below the bits
  - garden graph scrolls from the newest weeks (rtl container trick)
  - smaller page and profile padding
- Bit cards: `minWidth: 0` + `overflowWrap: "anywhere"` so long URLs/words never widen the page.
- Desktop layout is unchanged (same column widths and sticky sidebar).

## Gotcha
- Appending the block right after `}` with no blank line: the dev server served CSS without the new rules
  until the file was touched again (likely a stale Turbopack cache). Verified the classes are in the served CSS.

## Verify
- tsc, eslint, vitest 295/295
- new `e2e/mobile.spec.ts` (390px): no horizontal scroll on `/`, `/threads`, `/garden`; tag row above the feed — 4/4
- local screenshots after: all six pages scrollWidth == 390

## Gemini review (gemini-diff-review.md) — what was done
1. Comment rows overflowing → fixed (`minWidth: 0`, wrap, delete row wraps).
2. Rebit / thread-reply modals cut off when the phone keyboard opens → overlay scrolls (`safe center`), card `maxHeight: 100dvh - 32px`.
3. Long unbroken text elsewhere → `.db-page { overflow-wrap: anywhere }` covers every page that uses the class; "Show all ✕" no longer squeezes.
4. Garden: day labels are sticky while scrolled to recent weeks; `/garden` uses the same newest-first scroll.
5. Tag row a11y: `role="navigation" aria-label="Tags"`, the "Tags" title is visually hidden (still read), `aria-pressed` on chips,
   the active chip scrolls into view horizontally, the owner-only lock toggle is hidden on phones (use desktop to toggle).
   Not done: DOM order vs. `order: -1` — the tag row is a secondary filter; moving it in DOM would change desktop too.
6. e2e race / empty-DB blind spot → waits for Suspense, compares against the feed column, adds `/tags/ai`.
7. Not done: wide Mermaid diagrams scale down instead of scrolling (low; would need per-diagram width logic).
8. Home desktop: top padding 40→32px, gap 22→24px — intentional, matches the other pages.

Re-verify: tsc, eslint, vitest 295/295, e2e mobile + feed 10/10.
