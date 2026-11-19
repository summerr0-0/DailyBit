import { describe, expect, it } from "vitest";
import { toggleBold } from "./text-format";

describe("toggleBold", () => {
  it("wraps the selection and keeps it selected", () => {
    expect(toggleBold("hello world", 6, 11)).toEqual({ value: "hello **world**", selectionStart: 8, selectionEnd: 13 });
  });
  it("inserts an empty pair with the cursor inside when nothing is selected", () => {
    expect(toggleBold("ab", 1, 1)).toEqual({ value: "a****b", selectionStart: 3, selectionEnd: 3 });
  });
  it("unwraps when the selection is already surrounded by **", () => {
    expect(toggleBold("hello **world**", 8, 13)).toEqual({ value: "hello world", selectionStart: 6, selectionEnd: 11 });
  });
  it("unwraps when the selection itself is **…**", () => {
    expect(toggleBold("x **bold** y", 2, 10)).toEqual({ value: "x bold y", selectionStart: 2, selectionEnd: 6 });
  });
});

describe("toggleBold across several bold spans", () => {
  it("wraps instead of breaking markup when two bold spans are selected", () => {
    const v = "**a** and **b**";
    expect(toggleBold(v, 0, v.length).value).toBe("****a** and **b****");
  });
});

import { insertWikiLink, toggleHeading, wikiQueryAt } from "./text-format";

describe("toggleHeading", () => {
  it("adds, switches and removes heading on the cursor line", () => {
    expect(toggleHeading("intro\ntitle\nend", 8, 2).value).toBe("intro\n## title\nend");
    expect(toggleHeading("intro\n## title\nend", 10, 1).value).toBe("intro\n# title\nend");
    expect(toggleHeading("# title", 3, 1).value).toBe("title");
  });
});

describe("wiki autocomplete helpers", () => {
  it("detects the [[ query before the cursor", () => {
    expect(wikiQueryAt("see [[gad", 9)).toEqual({ query: "gad", start: 4 });
    expect(wikiQueryAt("see [[done]] x", 14)).toBeNull();
  });
  it("replaces the partial with a complete link", () => {
    expect(insertWikiLink("see [[gad", 9, 4, "gadget chain")).toEqual({
      value: "see [[gadget chain]]",
      selectionStart: 20,
      selectionEnd: 20,
    });
  });
});

describe("toggleHeading edge (Gemini wiki #3)", () => {
  it("handles a leading empty line with the cursor at 0", () => {
    expect(toggleHeading("\nsecond", 0, 1).value).toBe("# \nsecond");
  });
});
