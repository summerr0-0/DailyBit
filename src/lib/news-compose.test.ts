import { describe, it, expect } from "vitest";
import { buildNewsBit, checkNumbers, cleanTags, findBannedPhrases, stripUrls, NEWS_BIT_MAX_CHARS } from "./news-compose";

const meta = { url: "https://openai.com/index/gpt-6", category: "ai" };

describe("buildNewsBit — 조립 (R6.1)", () => {
  it("headline, 불릿, 빈 줄, URL, 태그 순서로 조립한다", () => {
    const r = buildNewsBit({ headline: "OpenAI ships GPT-6", bullets: ["b1", "b2", "b3", "b4"], tags: ["ai", "openai"] }, meta);
    expect(r).toEqual({
      ok: true,
      content: "OpenAI ships GPT-6\n- b1\n- b2\n- b3\n- b4\n\nhttps://openai.com/index/gpt-6\n#ai #openai",
      warnings: [],
    });
  });

  it("본문의 URL은 정규화 URL 하나뿐이다", () => {
    const r = buildNewsBit(
      { headline: "Read www.example.com now", bullets: ["see https://evil.example", "b2", "b3"], tags: ["ai"] },
      meta,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.match(/https?:\/\/|www\./g)).toHaveLength(1);
    expect(r.content).toContain(meta.url);
  });

  it("불릿 앞의 '- ' 기호와 줄바꿈·여분 공백을 정리한다", () => {
    const r = buildNewsBit({ headline: "  H \n line ", bullets: ["- one", "*  two", "three\nlines"], tags: ["x"] }, meta);
    expect(r.ok && r.content.split("\n").slice(0, 4)).toEqual(["H line", "- one", "- two", "- three lines"]);
  });

  it("빈 불릿은 버린다", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["a", "  ", "b"], tags: ["x"] }, meta);
    expect(r.ok && r.content).toBe(`H\n- a\n- b\n\n${meta.url}\n#x`);
  });

  it("headline이 비면 실패한다", () => {
    expect(buildNewsBit({ headline: "   ", bullets: ["a", "b", "c"], tags: [] }, meta)).toEqual({
      ok: false,
      reason: "empty_headline",
    });
  });

  it("headline이 URL뿐이면 제거 후 비어 실패한다", () => {
    expect(buildNewsBit({ headline: "https://x.example/a", bullets: ["a", "b"], tags: [] }, meta)).toEqual({
      ok: false,
      reason: "empty_headline",
    });
  });

  it("불릿이 처음부터 2개 미만이면 실패한다", () => {
    expect(buildNewsBit({ headline: "H", bullets: ["only"], tags: [] }, meta)).toEqual({
      ok: false,
      reason: "too_few_bullets",
    });
  });
});

describe("LLM URL 제거 (R6.2)", () => {
  it("bullet의 URL을 지우고 llm_url_removed 경고를 단다", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["see https://evil.example for more", "b2", "b3"], tags: ["ai"] }, meta);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content).not.toContain("evil.example");
    expect(r.content).toContain("- see for more");
    expect(r.warnings).toEqual(["llm_url_removed"]);
  });

  it("headline의 www. 토큰도 지운다", () => {
    const r = buildNewsBit({ headline: "Visit www.foo.com today", bullets: ["a", "b"], tags: [] }, meta);
    expect(r.ok && r.content.split("\n")[0]).toBe("Visit today");
    expect(r.ok && r.warnings).toContain("llm_url_removed");
  });

  it("스킴 없는 도메인 모양(Node.js)은 지우지 않는다", () => {
    expect(stripUrls("Node.js 24 and Next.js 16")).toEqual({ text: "Node.js 24 and Next.js 16", removed: false });
  });

  it("http/HTTPS 대소문자 무관", () => {
    expect(stripUrls("a HTTP://X.COM/y b").text).toBe("a b");
  });
});

describe("태그 정제 (R6.2b)", () => {
  it("스펙 예시: #ai #opensource #redteam", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["a", "b"], tags: ["#AI", "open-source", "red team", "ai", "llm", "x"] }, meta);
    expect(r.ok && r.content.split("\n").at(-1)).toBe("#ai #opensource #redteam");
  });

  it("tags가 []이면 소스 category 태그 1개", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["a", "b"], tags: [] }, { url: "u", category: "security" });
    expect(r.ok && r.content.split("\n").at(-1)).toBe("#security");
  });

  it("허용 문자 외 제거, 정제 후 빈 값은 버린다", () => {
    expect(cleanTags(["c++", "node.js", "###", "!!", "gpt_5", "한국어"], "ai")).toEqual(["c", "nodejs", "gpt_5"]);
    expect(cleanTags(["한국어", "Ünïcode"], "ai")).toEqual(["한국어", "ünïcode"]);
  });

  it("정제 후 모두 비면 category로 대체한다", () => {
    expect(cleanTags(["#", "--", " "], "AI")).toEqual(["ai"]);
  });

  it("여러 개의 앞 # 제거", () => {
    expect(cleanTags(["##LLM"], "ai")).toEqual(["llm"]);
  });
});

describe("500자 초과 축약 (R6.3)", () => {
  const long = (c: string) => c.repeat(95);

  it("마지막 불릿부터 제거해 500자 이하로 만든다", () => {
    const bullets = [long("a"), long("b"), long("c"), long("d"), long("e")];
    const r = buildNewsBit({ headline: "Headline", bullets, tags: ["ai"] }, meta);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.length).toBeLessThanOrEqual(NEWS_BIT_MAX_CHARS);
    expect(r.content).toContain(long("a"));
    expect(r.content).not.toContain(long("e"));
    // 앞쪽 불릿은 남고 URL·태그는 유지된다
    expect(r.content.endsWith(`${meta.url}\n#ai`)).toBe(true);
  });

  it("정확히 500자는 그대로 둔다", () => {
    const base = buildNewsBit({ headline: "H", bullets: ["a", "b"], tags: ["ai"] }, meta);
    if (!base.ok) throw new Error("unexpected");
    const pad = NEWS_BIT_MAX_CHARS - base.content.length;
    const r = buildNewsBit({ headline: "H", bullets: ["a", "b" + "x".repeat(pad)], tags: ["ai"] }, meta);
    expect(r.ok && r.content.length).toBe(NEWS_BIT_MAX_CHARS);
  });

  it("불릿 2개 미만이 되면 실패한다", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["x".repeat(300), "y".repeat(300), "z"], tags: ["ai"] }, meta);
    expect(r).toEqual({ ok: false, reason: "too_few_bullets" });
  });

  it("불릿 2개로도 500자를 넘으면 실패한다", () => {
    const r = buildNewsBit({ headline: "H".repeat(480), bullets: ["a", "b"], tags: ["ai"] }, meta);
    expect(r).toEqual({ ok: false, reason: "too_few_bullets" });
  });
});

describe("금지어 경고 (R6.4)", () => {
  it("bullet의 game-changer는 경고만 달고 초안은 생성된다", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["This is a game-changer for agents", "b"], tags: ["ai"] }, meta);
    expect(r.ok).toBe(true);
    expect(r.ok && r.warnings).toEqual(["banned:game-changer"]);
  });

  it("D9 목록과 과장어를 대소문자 무관하게 찾는다", () => {
    expect(findBannedPhrases("A Revolutionary, GROUNDBREAKING release")).toEqual([
      "banned:revolutionary",
      "banned:groundbreaking",
    ]);
    expect(findBannedPhrases("It unlocks new uses and supercharges devs")).toEqual(["banned:unlock", "banned:supercharge"]);
    expect(findBannedPhrases("Whether it holds remains to be seen")).toEqual(["banned:remains to be seen"]);
    expect(findBannedPhrases("a paradigm shift")).toEqual(["banned:paradigm shift"]);
    expect(findBannedPhrases("a game changer")).toEqual(["banned:game-changer"]);
  });

  it("부분 단어는 걸지 않는다", () => {
    expect(findBannedPhrases("The unlockable door; the fix was released")).toEqual([]);
  });

  it("URL/태그 줄이 아닌 headline·bullets만 검사한다", () => {
    const r = buildNewsBit({ headline: "H", bullets: ["a", "b"], tags: ["unlock"] }, meta);
    expect(r.ok && r.warnings).toEqual([]);
  });
});

describe("숫자 검사 (R6.5)", () => {
  it("스펙 예시: 1,200은 통과, 40은 경고", () => {
    expect(checkNumbers("Usage rose 40% to 1,200 users", "There are 1200 users")).toEqual(["number_not_in_source:40"]);
  });

  it("3x는 3을 검사한다", () => {
    expect(checkNumbers("3x faster", "about 3 times faster")).toEqual([]);
    expect(checkNumbers("4x faster", "about 3 times faster")).toEqual(["number_not_in_source:4"]);
  });

  it("CVE-2026-1234는 2026과 1234를 각각 검사한다", () => {
    expect(checkNumbers("CVE-2026-1234", "published in 2026, bug 1234")).toEqual([]);
    expect(checkNumbers("CVE-2026-1234", "CVE 2026 only")).toEqual(["number_not_in_source:1234"]);
  });

  it("1.2M vs 원문 1,200,000은 경고(오탐 허용)", () => {
    expect(checkNumbers("1.2M downloads", "1,200,000 downloads")).toEqual(["number_not_in_source:1.2"]);
  });

  it("원문의 쉼표도 제거하고 비교한다", () => {
    expect(checkNumbers("12000 stars", "12,000 stars")).toEqual([]);
  });

  it("문장 끝 마침표는 숫자에 붙이지 않는다", () => {
    expect(checkNumbers("Released in 2026.", "2026")).toEqual([]);
  });

  it("같은 숫자 경고는 한 번만", () => {
    expect(checkNumbers("7 and 7", "none")).toEqual(["number_not_in_source:7"]);
  });

  it("숫자가 없으면 빈 배열", () => {
    expect(checkNumbers("no numbers", "")).toEqual([]);
  });
});
