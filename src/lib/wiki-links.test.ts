import { describe, expect, it } from "vitest";
import { extractLinkKeys, linkKey, splitWikiLinks } from "./wiki-links";

describe("wiki links", () => {
  it("splits [[target]] and [[target|label]]", () => {
    expect(splitWikiLinks("see [[Gadget Chain]] and [[PHP release|the PHP fix]].")).toEqual([
      { type: "text", value: "see " },
      { type: "link", target: "Gadget Chain", label: "Gadget Chain", raw: "[[Gadget Chain]]" },
      { type: "text", value: " and " },
      { type: "link", target: "PHP release", label: "the PHP fix", raw: "[[PHP release|the PHP fix]]" },
      { type: "text", value: "." },
    ]);
  });
  it("ignores unclosed or multi-line brackets", () => {
    expect(splitWikiLinks("a [[b\nc]] d [[e")).toEqual([{ type: "text", value: "a [[b\nc]] d [[e" }]);
  });
  it("normalizes keys", () => {
    expect(linkKey("  Gadget   CHAIN ")).toBe("gadget chain");
    expect(extractLinkKeys("[[A b]] [[a  B]] [[C|x]]")).toEqual(["a b", "c"]);
  });
});

import { pickLinks, resolveLink } from "./wiki-links";

describe("resolveLink / pickLinks", () => {
  it("does not resolve prototype keys", () => {
    expect(resolveLink({}, "constructor")).toBeUndefined();
    expect(resolveLink({ "gadget chain": "t1" }, "Gadget  Chain")).toBe("t1");
  });
  it("keeps only targets referenced by the given contents", () => {
    expect(pickLinks({ a: "1", b: "2", c: "3" }, ["see [[A]]", "and [[c|x]]"])).toEqual({ a: "1", c: "3" });
  });
});
