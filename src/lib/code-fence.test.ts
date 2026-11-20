import { describe, expect, it } from "vitest";
import { splitFences, withoutFences } from "./code-fence";
import { parseTags } from "./tags";
import { extractLinkKeys } from "./wiki-links";

const DIAGRAM = "Pipeline:\n```mermaid\nflowchart LR\n  A[[RSS]] --> B[Score]\n  style A fill:#f9f\n```\nDone #crawler";

describe("splitFences", () => {
  it("splits a mermaid block from the surrounding text", () => {
    const segs = splitFences(DIAGRAM);
    expect(segs.map((s) => s.type)).toEqual(["text", "code", "text"]);
    expect(segs[1]).toMatchObject({ lang: "mermaid", code: "flowchart LR\n  A[[RSS]] --> B[Score]\n  style A fill:#f9f" });
  });

  it("leaves an unclosed fence as plain text", () => {
    expect(splitFences("```mermaid\nflowchart LR")).toEqual([{ type: "text", value: "```mermaid\nflowchart LR" }]);
  });

  it("handles CRLF and a block at the very start", () => {
    const segs = splitFences("```js\r\nconst a = 1;\r\n```");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ type: "code", lang: "js", code: "const a = 1;" });
  });

  it("does not treat inline ``` in the middle of a line as a fence", () => {
    expect(splitFences("use ```mermaid\nx\n``` here").every((s) => s.type === "text")).toBe(true);
  });
});

describe("splitFences edge cases (Gemini mermaid #2)", () => {
  it("does not let an unclosed fence swallow text up to a later fence", () => {
    const segs = splitFences("```mermaid\nunclosed\n#crawler [[RSS]]\n```js\nconst a = 1;\n```");
    expect(segs.filter((s) => s.type === "code")).toEqual([{ type: "code", lang: "js", code: "const a = 1;", raw: "```js\nconst a = 1;\n```" }]);
    expect(parseTags("```mermaid\nunclosed\n#crawler\n```js\nx\n```")).toEqual(["crawler"]);
  });

  it("supports empty blocks and several blocks in one bit", () => {
    expect(splitFences("```\n```")).toEqual([{ type: "code", lang: "", code: "", raw: "```\n```" }]);
    const segs = splitFences("a\n```\n```\n#tag\n```mermaid\nflowchart LR\n```\nb");
    expect(segs.map((s) => s.type)).toEqual(["text", "code", "text", "code", "text"]);
    expect(parseTags("```\n```\n#tag\n```\ncode #no\n```")).toEqual(["tag"]);
  });
});

describe("code blocks are not tags or links", () => {
  it("ignores #colors and [[shapes]] inside a fence", () => {
    expect(parseTags(DIAGRAM)).toEqual(["crawler"]);
    expect(extractLinkKeys(DIAGRAM)).toEqual([]);
    expect(withoutFences(DIAGRAM)).not.toContain("flowchart");
  });
});
