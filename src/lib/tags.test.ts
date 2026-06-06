import { describe, it, expect } from "vitest";
import { parseTags } from "./tags";

describe("parseTags", () => {
  it("본문에서 #태그를 추출한다", () => {
    expect(parseTags("오늘 #개발 하는 중 #dailybit")).toEqual(["개발", "dailybit"]);
  });

  it("태그를 소문자로 정규화한다", () => {
    expect(parseTags("#React #GraphQL")).toEqual(["react", "graphql"]);
  });

  it("대소문자만 다른 중복을 제거한다", () => {
    expect(parseTags("#React #react #REACT")).toEqual(["react"]);
  });

  it("한글 태그를 지원한다", () => {
    expect(parseTags("#일상 #개발일기")).toEqual(["일상", "개발일기"]);
  });

  it("10개를 초과하면 앞 10개만 남긴다", () => {
    const content = Array.from({ length: 12 }, (_, i) => `#tag${i}`).join(" ");
    const result = parseTags(content);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("tag0");
    expect(result[9]).toBe("tag9");
  });

  it("태그가 없으면 빈 배열을 반환한다", () => {
    expect(parseTags("그냥 평범한 글입니다")).toEqual([]);
  });
});
