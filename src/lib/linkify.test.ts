import { describe, it, expect } from "vitest";
import { splitByUrls } from "./linkify";

const urls = (content: string) =>
  splitByUrls(content)
    .filter((s) => s.type === "url")
    .map((s) => s.value);

describe("splitByUrls", () => {
  it("끝의 마침표는 URL 밖에 둔다", () => {
    expect(splitByUrls("see https://a.com/x. #ai")).toEqual([
      { type: "text", value: "see ", start: 0 },
      { type: "url", value: "https://a.com/x", start: 4 },
      { type: "text", value: ". #ai", start: 19 },
    ]);
  });

  it("끝 문장부호 .,;:!? 를 모두 제거한다", () => {
    expect(urls("https://a.com/x?!,;:.")).toEqual(["https://a.com/x"]);
  });

  it("URL을 감싼 바깥 괄호는 제외한다", () => {
    expect(urls("(https://a.com/x)")).toEqual(["https://a.com/x"]);
  });

  it("URL 안의 짝이 맞는 괄호는 포함한다", () => {
    expect(urls("https://en.wikipedia.org/wiki/A_(b)")).toEqual([
      "https://en.wikipedia.org/wiki/A_(b)",
    ]);
  });

  it("괄호로 감싼 위키 URL은 _(b)까지 포함하고 바깥 ) 는 제외한다", () => {
    expect(splitByUrls("(https://en.wikipedia.org/wiki/A_(b))")).toEqual([
      { type: "text", value: "(", start: 0 },
      { type: "url", value: "https://en.wikipedia.org/wiki/A_(b)", start: 1 },
      { type: "text", value: ")", start: 36 },
    ]);
  });

  it("괄호와 마침표가 섞여도 정리한다", () => {
    expect(urls("(see https://a.com/x).")).toEqual(["https://a.com/x"]);
  });

  it("URL fragment의 # 은 URL에 포함된다", () => {
    expect(urls("https://a.com/p#frag #ai")).toEqual(["https://a.com/p#frag"]);
  });

  it("http 스킴도 링크로 본다", () => {
    expect(urls("http://a.com")).toEqual(["http://a.com"]);
  });

  it("javascript: 와 ftp: 는 링크가 아니다", () => {
    expect(urls("javascript:alert(1)")).toEqual([]);
    expect(urls("ftp://x")).toEqual([]);
  });

  it("스킴만 있는 것은 링크가 아니다", () => {
    expect(urls("https://.")).toEqual([]);
  });

  it("구간을 이어 붙이면 원문과 같다", () => {
    const content = "a https://a.com/x) b (http://b.com/y_(z)). c";
    expect(splitByUrls(content).map((s) => s.value).join("")).toBe(content);
  });

  it("URL이 없으면 텍스트 한 구간이다", () => {
    expect(splitByUrls("평범한 글")).toEqual([{ type: "text", value: "평범한 글", start: 0 }]);
  });
});
