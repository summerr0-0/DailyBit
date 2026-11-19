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
