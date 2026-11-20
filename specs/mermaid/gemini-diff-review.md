### Findings (Ranked by Severity)

1. **[High] Broken Mermaid diagrams leak detached error SVGs onto `document.body`** — [MermaidDiagram.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/MermaidDiagram.tsx#L12), [MermaidDiagram.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/MermaidDiagram.tsx#L26-L28)
   - **Why**: `m.default.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "inherit" })` omits `suppressErrorRendering: true` (default is `false` in Mermaid 12.3.0). When `mermaid.render(id, code)` is called without a container element, Mermaid appends a temporary `<div id="d${id}"><svg id="${id}">…</svg></div>` to `document.body`. When parsing fails and `suppressErrorRendering` is `false`, Mermaid draws its built-in bomb-icon `"Syntax error in text"` SVG into `#d${id}` and throws `parseEncounteredException` *before* calling `removeTempElements()`.
   - **Failure scenario**: Viewing any bit with an invalid ` ```mermaid ` block (including the broken block in [mermaid.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/mermaid.spec.ts#L8)) renders the fallback `<CodeBlock>` inside the card, **and** permanently leaves `<div id="dmmd-…">` with Mermaid's large error diagram attached to the bottom of `document.body`.
   - **Fix**: Pass `suppressErrorRendering: true` in `m.default.initialize(...)`.

2. **[High] Fence regex swallows outside text across unclosed or empty fences** — [code-fence.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/code-fence.ts#L7)
   - **Why**: `FENCE_PATTERN` (`/^```([A-Za-z0-9_-]*)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm`) allows `[\s\S]*?` to match across lines starting with ```` ``` ````, and requires two newlines (`\n...\n`), so an empty fence (` ```\n``` `) cannot match its own closing fence.
   - **Failure scenario**:
     1. *Unclosed fence before another fence*: In ```` "```mermaid\nunclosed\n#crawler [[RSS]]\n```js\nconst a = 1;\n```" ````, the unclosed ` ```mermaid ` matches all the way to the closing ` ``` ` of the `js` block (or the opening ` ``` ` of a subsequent unlabelled fence). The normal text `#crawler [[RSS]]` is swallowed into the Mermaid block—silently dropping `#crawler` from `parseTags`, dropping `[[RSS]]` from `extractLinkKeys`/backlinks, and rendering the whole span as a broken diagram.
     2. *Empty fence*: ```` "```\n```" ```` has only one newline and fails to match (rendering raw backticks). In ```` "```\n```\n#crawler\n```\ncode\n```" ````, line 1 pairs with line 4, turning `#crawler` into a code block and dropping the tag.
   - **Fix**: Parse fences line-by-line, or disallow fence lines inside the body and allow empty blocks (`/^```([A-Za-z0-9_-]*)[ \t]*\n((?:(?!```)[\s\S])*?)\n?```[ \t]*$/gm`).

3. **[Low] Transient failure in dynamic `import("mermaid")` permanently breaks diagrams for the session** — [MermaidDiagram.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/MermaidDiagram.tsx#L9-L16)
   - **Why**: `ready ??= import("mermaid").then(...)` caches the promise without clearing `ready = null` on rejection.
   - **Failure scenario**: If the dynamic chunk fails to load once during a brief network drop, `ready` remains a rejected promise and every subsequent `MermaidDiagram` mounted during the session immediately fails without retrying.

4. **[Low] Test gaps** — [BitCard.test.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/BitCard.test.tsx#L172-L194), [code-fence.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/code-fence.test.ts#L8-L28), [mermaid.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/mermaid.spec.ts#L28-L36)
   - **Unit test doesn't exercise `MermaidDiagram` effect states** ([BitCard.test.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/BitCard.test.tsx#L173-L185)): Only inspects the synchronous initial render (`svg === null`), leaving the async SVG injection branch (`data-testid="mermaid-diagram"`) and error note branch (`"Diagram could not be drawn…"`) untested in Vitest.
   - **E2E test misses leaked DOM nodes** ([mermaid.spec.ts](file:///Users/jeong-ilin/study/dailybit/e2e/mermaid.spec.ts#L30-L36)): All locators are scoped to `card = page.locator("article", ...)`, so the leaked `#dmmd-*` container on `document.body` goes undetected (add `await expect(page.locator("[id^='dmmd-']")).toHaveCount(0)`).
   - **Fence unit tests only test single fences** ([code-fence.test.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/code-fence.test.ts#L8-L28)): No test covers multiple fences in one bit, empty fences, or an unclosed fence preceding a valid fence.

---

### Fine Areas

- **XSS / security of the SVG injection**: No issues. Mermaid 12 `securityLevel: "strict"` sanitizes node labels and the final serialized SVG via DOMPurify, disables click handlers, and locks `securityLevel` in `siteConfig.secure` so in-diagram directives (`%%{init: ...}%%` or frontmatter) cannot override it.
- **Hydration / SSR issues**: No issues. `renderBitContent` passes serializable `{ code: string }` props to the client components, `MermaidDiagram` renders the identical `<CodeBlock>` fallback during SSR and initial client hydration before `useEffect` runs, and `useId()` is only read inside `useEffect`.
- **Invalid HTML nesting inside `<p>`**: No issues. `MermaidDiagram` and `CodeBlock` render `<span style={{ display: "block" }}>` and `<code>` (valid phrasing content inside `<p>`), and `dangerouslySetInnerHTML` parses the `<svg>` with the `<span>` as context element so `<foreignObject>` HTML labels do not auto-close the ancestor `<p>`.
- **Offset / key collisions**: No issues. `splitFences` normalizes CRLF up front, every `"text"` segment adjacent to a fence has its boundary `\n` stripped (`text.length < seg.value.length`), and `offset` advances by the full `seg.raw.length` / `seg.value.length`, keeping all React keys disjoint across segments and lines.
- **Mermaid render ID collisions**: No issues. `useId().replace(/[^a-zA-Z0-9_-]/g, "")` produces a unique valid ID per mounted component instance, and Mermaid 12 serializes all `mermaid.render` calls through an internal `executionQueue`, preventing concurrent temporary DOM ID collisions under React 19 StrictMode double-effects.
