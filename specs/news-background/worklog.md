# News background bit — worklog (2026-11-22)

Request: "MONAI Label이 뭔지 같은 백그라운드 설명이 더 필요할 거 같아. 보안이면 왜 위험한지 그런 것도"

## Problem
The MONAI Label zero-day draft said what happened but not what MONAI Label is
(an open-source server research teams use to label medical scans) or why the bug is dangerous.

## Change
- Writer (`news-ai.ts`): new required `background: { what, risk }` (each ≤220 chars).
  - `what`: what the product/project/tech is, what it's for and who uses it. Well-established general knowledge is allowed; no numbers or claims beyond the sources. Empty only when every developer knows it.
  - `risk`: for security, what an attacker can do, who is exposed and what to do; otherwise, why it matters to developers. Specifics only from the sources.
- Thread (`news-compose.ts`): a new bit right after the summary:
  `Background\n<what>\n\nWhy it's dangerous\n<risk>` (security lead source), or `Why it matters` otherwise.
  Empty parts are skipped. URLs are stripped (sets `llm_url_removed`). Banned-phrase check covers it. ≤500 chars.
- Inbox: "N sources" now counts only `Source:` bits (it was `segments - 1`).

## Not changed
- Score-dependent behaviour: every event draft gets the bit (high-score ones are the ones drafted anyway).
- Existing drafts in the inbox are not rewritten.

## Verify
- tsc, eslint, vitest 299/299 (news-ai parse + clamp; 4 thread builder tests).
- `e2e/news-inbox.spec.ts` fixture now has a background bit and still expects "2 sources". It needs the CI test DB (local run has no DB, by design).

## Gemini review — what was done
1. The unrelated `scripts/.obsidian-import.ts` was staged by mistake → unstaged (not in the PR).
2. Number warnings on background → kept on purpose as a hallucination flag; the prompt now forbids digits/versions in `what` unless in the sources.
3. Prompt contradiction / guessing → `what` may be empty when the sources don't explain it and the model isn't sure ("never guess from the name"); the facts rule names the one exception.
4. Heading by `sources[0]` only → "Why it's dangerous" when tagged `security` or any source is a security outlet.
5. Early 220-char clamp / tail truncation → parser keeps up to 400; the builder splits the 500-char budget between the two bodies.
6. `[[links]]` in background → prompt says links only in bullets.
7. Test gaps → runCuration test (background stays 2nd, late source appended after it); builder tests for split truncation and security heading; JSDoc updated.

Re-verify: tsc, eslint, vitest 301/301.
