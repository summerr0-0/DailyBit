import { describe, it, expect } from "vitest";
import {
  buildConceptThread,
  buildNewsThread,
  buildSourceBit,
  checkNumbersMulti,
  truncateAtWord,
  NEWS_BIT_MAX_CHARS,
  THREAD_TITLE_MAX_CHARS,
} from "./news-compose";

const srcA = { name: "OpenAI Blog", url: "https://openai.com/index/gpt-6", category: "ai" };
const srcB = { name: "The Verge", url: "https://www.theverge.com/ai/gpt-6", category: "tech" };

const words = (n: number, w = "word") => Array.from({ length: n }, () => w).join(" ");

describe("truncateAtWord", () => {
  it("짧으면 그대로", () => expect(truncateAtWord("abc def", 7)).toBe("abc def"));
  it("단어 경계에서 자르고 …를 붙인다", () => expect(truncateAtWord("alpha beta gamma", 12)).toBe("alpha beta…"));
  it("다음 글자가 공백이면 그 단어까지 살린다", () => expect(truncateAtWord("alpha beta gamma", 11)).toBe("alpha beta…"));
  it("공백이 없으면 글자 단위로 자른다", () => expect(truncateAtWord("abcdefghij", 5)).toBe("abcd…"));
});

describe("buildNewsThread — 조립 (R3.1)", () => {
  const output = {
    headline: "OpenAI ships GPT-6",
    bullets: ["b1", "b2", "b3", "b4"],
    sources: [
      { index: 0, point: "Official launch post" },
      { index: 1, point: "Hands-on impressions" },
    ],
    tags: ["AI", "#openai"],
  };

  it("요약 Bit(URL 없음, 태그) + 출처 순서대로 출처 Bit", () => {
    const r = buildNewsThread(output, [srcA, srcB]);
    expect(r).toEqual({
      ok: true,
      segments: [
        "OpenAI ships GPT-6\n- b1\n- b2\n- b3\n- b4\n\n#ai",
        `Source: OpenAI Blog — Official launch post\n${srcA.url}`,
        `Source: The Verge — Hands-on impressions\n${srcB.url}`,
      ],
      threadTitle: "OpenAI ships GPT-6",
      warnings: [],
    });
  });

  it("출처 Bit 순서는 output.sources 순서가 아니라 입력 출처 순서", () => {
    const r = buildNewsThread({ ...output, sources: [...output.sources].reverse() }, [srcA, srcB]);
    expect(r.ok && r.segments.slice(1).map((s) => s.split(" — ")[0])).toEqual(["Source: OpenAI Blog", "Source: The Verge"]);
  });

  it("LLM 출력 속 URL을 제거하고 llm_url_removed 경고", () => {
    const r = buildNewsThread(
      {
        headline: "See https://x.example now",
        bullets: ["www.evil.example b1", "b2"],
        sources: [{ index: 0, point: "point http://a.example" }],
        tags: [],
      },
      [srcA],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[0]).not.toMatch(/https?:\/\/|www\./);
    expect(r.segments[1]).toBe(`Source: OpenAI Blog — point\n${srcA.url}`);
    expect(r.warnings).toContain("llm_url_removed");
  });

  it("태그가 비면 첫 출처 대표 태그로 대체 — 목록 밖 category면 태그 줄 없음", () => {
    const r = buildNewsThread({ ...output, tags: [] }, [srcA, srcB]);
    expect(r.ok && r.segments[0].endsWith("\n\n#ai")).toBe(true);
    const off = buildNewsThread({ ...output, tags: [] }, [srcB, srcA]);
    expect(off.ok && off.segments[0].includes("#")).toBe(false);
  });

  it("포인트 없는 출처는 이름만", () => {
    const r = buildNewsThread({ ...output, sources: [{ index: 0, point: "p" }, { index: 9, point: "bad" }] }, [srcA, srcB]);
    expect(r.ok && r.segments[2]).toBe(`Source: The Verge\n${srcB.url}`);
  });

  it("포인트의 줄바꿈·여분 공백을 정리한다", () => {
    const r = buildNewsThread({ ...output, sources: [{ index: 0, point: "  a \n  b  " }] }, [srcA]);
    expect(r.ok && r.segments[1]).toBe(`Source: OpenAI Blog — a b\n${srcA.url}`);
  });

  it("빈 headline → empty_headline, 불릿 2개 미만 → too_few_bullets, 출처 없음 → no_sources", () => {
    expect(buildNewsThread({ ...output, headline: "  " }, [srcA])).toEqual({ ok: false, reason: "empty_headline" });
    expect(buildNewsThread({ ...output, bullets: ["only", "  "] }, [srcA])).toEqual({ ok: false, reason: "too_few_bullets" });
    expect(buildNewsThread(output, [])).toEqual({ ok: false, reason: "no_sources" });
  });

  it("금지어는 headline·불릿·포인트 전체에서 찾는다", () => {
    const r = buildNewsThread(
      { ...output, bullets: ["a game-changer", "b2"], sources: [{ index: 0, point: "truly revolutionary" }] },
      [srcA],
    );
    expect(r.ok && r.warnings).toEqual(["banned:game-changer", "banned:revolutionary"]);
  });

  it("threadTitle은 headline을 단어 경계에서 100자 이하로 자른다", () => {
    const r = buildNewsThread({ ...output, headline: words(30, "headline") }, [srcA]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.threadTitle.length).toBeLessThanOrEqual(THREAD_TITLE_MAX_CHARS);
    expect(r.threadTitle).toMatch(/^(headline )+headline…$/);
  });
});

describe("buildNewsThread — 500자 처리 (R3.2)", () => {
  it("요약 620자 → 뒤 불릿부터 제거해 ≤500", () => {
    const bullet = "x".repeat(150);
    const r = buildNewsThread({ headline: "H", bullets: [bullet, bullet, bullet, bullet], sources: [], tags: ["ai"] }, [srcA]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[0].length).toBeLessThanOrEqual(NEWS_BIT_MAX_CHARS);
    expect(r.segments[0].split("\n").filter((l) => l.startsWith("- "))).toHaveLength(3);
  });

  it("정확히 500자 요약은 그대로 둔다", () => {
    // "H\n- " + b1 + "\n- " + b2 + "\n\n#ai" = 4 + b1 + 3 + b2 + 5
    const b1 = "a".repeat(244);
    const b2 = "b".repeat(244);
    const r = buildNewsThread({ headline: "H", bullets: [b1, b2], sources: [], tags: ["ai"] }, [srcA]);
    expect(r.ok && r.segments[0].length).toBe(500);
  });

  it("불릿 2개로도 500자 초과면 실패", () => {
    const b = "a".repeat(245);
    expect(buildNewsThread({ headline: "H", bullets: [b, b], sources: [], tags: ["ai"] }, [srcA])).toEqual({
      ok: false,
      reason: "too_few_bullets",
    });
  });

  it("출처 point 600자 → 단어 경계로 잘라 URL 줄 포함 ≤500", () => {
    const point = words(120, "lorem"); // 719자
    const r = buildNewsThread({ headline: "H", bullets: ["a", "b"], sources: [{ index: 0, point }], tags: [] }, [srcA]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bit = r.segments[1];
    expect(bit.length).toBeLessThanOrEqual(NEWS_BIT_MAX_CHARS);
    expect(bit.endsWith(`lorem…\n${srcA.url}`)).toBe(true);
    expect(bit.startsWith("Source: OpenAI Blog — lorem lorem")).toBe(true);
  });
});

describe("buildNewsThread — 단일 출처 (R3.3)", () => {
  it("출처 1개여도 segments 2개", () => {
    const r = buildNewsThread({ headline: "H", bullets: ["a", "b", "c"], sources: [{ index: 0, point: "p" }], tags: [] }, [srcA]);
    expect(r.ok && r.segments).toHaveLength(2);
  });
});

describe("checkNumbersMulti (R3.4)", () => {
  it("모든 출처 본문 합본 어디에도 없으면 경고", () => {
    expect(checkNumbersMulti("Accuracy up 40%", ["improved by 30%", "nothing here"])).toEqual(["number_not_in_source:40"]);
  });
  it("어느 한 출처에라도 있으면 통과(쉼표 무시)", () => {
    expect(checkNumbersMulti("1,200 users and 40%", ["no", "about 1200 users, 40 percent"])).toEqual([]);
  });
  it("출처 경계를 가로질러 숫자를 이어 붙이지 않는다", () => {
    expect(checkNumbersMulti("12", ["1", "2"])).toEqual(["number_not_in_source:12"]);
  });
});

describe("buildSourceBit (늦은 출처, D14-6)", () => {
  it("형식은 buildNewsThread의 출처 Bit와 같다", () => {
    expect(buildSourceBit({ name: "HN", url: "https://n.example/1", point: "Discussion https://x.example" })).toBe(
      "Source: HN — Discussion\nhttps://n.example/1",
    );
    expect(buildSourceBit({ name: "HN", url: "https://n.example/1", point: "" })).toBe("Source: HN\nhttps://n.example/1");
  });
  it("정확히 500자가 되는 point는 자르지 않는다", () => {
    const url = "https://n.example/1";
    const prefix = "Source: HN — ";
    const point = "p".repeat(NEWS_BIT_MAX_CHARS - prefix.length - 1 - url.length);
    const bit = buildSourceBit({ name: "HN", url, point });
    expect(bit.length).toBe(500);
    expect(bit).not.toContain("…");
    const over = buildSourceBit({ name: "HN", url, point: `${point.slice(0, -10)} ${"q".repeat(10)}` });
    expect(over.length).toBeLessThanOrEqual(500);
    expect(over).toContain("…");
  });
});

describe("buildConceptThread (D6)", () => {
  it("Bit 2개와 제목", () => {
    expect(buildConceptThread({ term: "Quantization", definition: "Def.", whyItMatters: "Why." })).toEqual({
      ok: true,
      segments: ["What is Quantization?\nDef.", "Why it matters\nWhy."],
      threadTitle: "What is Quantization?",
    });
  });
  it("뉴스 대표 태그를 첫 Bit 끝에 붙이고 500자를 지킨다", () => {
    const r = buildConceptThread({ term: "use-after-free", definition: "Def.", whyItMatters: "Why.", tags: ["security"] });
    expect(r.segments[0]).toBe("What is use-after-free?\nDef.\n\n#security");
    const long = buildConceptThread({ term: "x", definition: words(150, "def"), whyItMatters: "w", tags: ["security"] });
    expect(long.segments[0].length).toBeLessThanOrEqual(NEWS_BIT_MAX_CHARS);
    expect(long.segments[0].endsWith("\n\n#security")).toBe(true);
    const longTerm = buildConceptThread({ term: words(120, "term"), definition: "Def here.", whyItMatters: "w", tags: ["security"] });
    expect(longTerm.segments[0]).toContain("Def here.");
    expect(buildConceptThread({ term: "x", definition: "d", whyItMatters: "w", tags: ["", "#bad", "ok"] }).segments[0]).toBe("What is x?\nd\n\n#ok");
  });
  it("URL 제거, 각 Bit ≤500, 제목 ≤100", () => {
    const r = buildConceptThread({
      term: words(30, "term"),
      definition: `${words(150, "def")} https://x.example`,
      whyItMatters: words(150, "why"),
    });
    for (const s of r.segments) {
      expect(s.length).toBeLessThanOrEqual(NEWS_BIT_MAX_CHARS);
      expect(s).not.toMatch(/https?:\/\//);
    }
    expect(r.segments[1].startsWith("Why it matters\nwhy why")).toBe(true);
    expect(r.segments[1].endsWith("why…")).toBe(true);
    expect(r.threadTitle.length).toBeLessThanOrEqual(THREAD_TITLE_MAX_CHARS);
  });
});


import { keepAllowedWikiLinks } from "./news-compose";

describe("keepAllowedWikiLinks (wiki-links D5)", () => {
  it("keeps brackets only around allowed concept terms", () => {
    expect(keepAllowedWikiLinks("needs a [[Gadget Chain]] and [[PHP]] [[x|shown]]", ["gadget chain"])).toBe(
      "needs a [[Gadget Chain]] and PHP shown",
    );
  });
});
