import { describe, it, expect } from "vitest";
import { findSplitSuspects, normalizeConceptSlug, normalizeEventKey, titleOverlap } from "./news-events";

describe("normalizeEventKey", () => {
  it("소문자 kebab으로 정규화한다 (R1.2)", () => {
    expect(normalizeEventKey("OpenAI GPT_6.2 Release!!")).toBe("openai-gpt-6-2-release");
  });
  it("대시를 합치고 앞뒤를 다듬는다", () => {
    expect(normalizeEventKey("--a  --  b--")).toBe("a-b");
    expect(normalizeEventKey("already-ok")).toBe("already-ok");
  });
  it("60자 이하, 잘린 끝 대시 제거", () => {
    const k = normalizeEventKey(`${"a".repeat(59)} bbbb`);
    expect(k).toBe("a".repeat(59));
    expect(normalizeEventKey("x".repeat(100))).toHaveLength(60);
  });
  it("쓸 글자가 없으면 빈 문자열, 악센트는 벗긴다", () => {
    expect(normalizeEventKey("!!! 한글")).toBe("");
    expect(normalizeEventKey("Café Release")).toBe("cafe-release");
  });
});

describe("titleOverlap", () => {
  it("짧은 쪽 단어 기준 겹침 비율, 불용어·대소문자 무시", () => {
    expect(titleOverlap("OpenAI releases GPT-6.2", "The OpenAI GPT-6.2 releases are here")).toBe(1);
    expect(titleOverlap("p q r s", "p q x y")).toBe(0.5);
    expect(titleOverlap("Apple", "Banana")).toBe(0);
    expect(titleOverlap("", "anything")).toBe(0);
  });
});

describe("findSplitSuspects", () => {
  it("다른 키인데 제목이 70% 이상 겹치는 쌍만 돌려준다 (R1.4)", () => {
    const groups = [
      { eventKey: "openai-gpt-6-2", title: "OpenAI releases GPT-6.2 model" },
      { eventKey: "gpt-6-2-launch", title: "OpenAI GPT-6.2 model released" },
      { eventKey: "openai-gpt-6-2", title: "OpenAI GPT-6.2 model" },
      { eventKey: "xz-backdoor", title: "Backdoor found in xz utils" },
    ];
    expect(findSplitSuspects(groups)).toEqual([{ a: "gpt-6-2-launch", b: "openai-gpt-6-2", overlap: 1 }]);
  });
  it("threshold를 바꿀 수 있고, 같은 키끼리는 비교하지 않는다", () => {
    const groups = [
      { eventKey: "a", title: "one two three four" },
      { eventKey: "b", title: "one two five six" },
      { eventKey: "a", title: "one two five six" },
    ];
    expect(findSplitSuspects(groups)).toEqual([{ a: "a", b: "b", overlap: 1 }]);
    expect(findSplitSuspects(groups.slice(0, 2), 0.5)).toEqual([{ a: "a", b: "b", overlap: 0.5 }]);
    expect(findSplitSuspects(groups.slice(0, 2))).toEqual([]);
  });
});

describe("normalizeConceptSlug", () => {
  it("소문자, 공백·하이픈·밑줄·기호 제거", () => {
    expect(normalizeConceptSlug("4-bit Quantization")).toBe("4bitquantization");
    expect(normalizeConceptSlug("Prompt Injection")).toBe("promptinjection");
    expect(normalizeConceptSlug("prompt_injection")).toBe("promptinjection");
    expect(normalizeConceptSlug("RAG (Retrieval-Augmented)")).toBe("ragretrievalaugmented");
  });
});
