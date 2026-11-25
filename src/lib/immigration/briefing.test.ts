import { describe, expect, it } from "vitest";
import { parseBriefing, runWeeklyBriefing, type BriefingDraw, type BriefingInput, type BriefingStore, type WeeklyBriefing } from "./briefing";

const now = new Date("2026-11-30T01:00:00Z"); // 월요일

function memory(draws: BriefingDraw[], notes: string[]) {
  const state = { saved: null as WeeklyBriefing | null, posts: [] as string[], since: null as Date | null };
  const store: BriefingStore = {
    recentDraws: async (since) => ((state.since = since), draws),
    recentNotes: async () => notes,
    saveBriefing: async (b) => void (state.saved = b),
    postNote: async (c) => void state.posts.push(c),
  };
  return { store, state };
}
const draw: BriefingDraw = { program: "AAIP", stream: "Alberta Express Entry Stream – Accelerated Tech Pathway", detail: "", drawDate: "2026-11-25", minScore: 59, invitationsText: "100" };
const text = { headline: "알버타 테크 선발이 있었어요.", points: [{ title: "AAIP 테크", body: "100명 초대." }], terms: [{ term: "AAIP", meaning: "알버타 주정부 이민" }], watch: "" };

describe("runWeeklyBriefing", () => {
  it("sends the week's draws (tech flagged) and detail notes to the AI, saves the result, posts a short pointer bit", async () => {
    const m = memory([draw], ["Canada PR — 2026-11-25\n- 선발·공지: 새 소식 1건\n#immigration", "★ [IRCC] Express Entry change\n요약\nhttps://x\n#immigration"]);
    let input: BriefingInput | null = null;
    const b = await runWeeklyBriefing(m.store, async (i) => ((input = i), text), now);
    expect(m.state.since?.toISOString()).toBe("2026-11-23T01:00:00.000Z");
    expect(input!).toMatchObject({ from: "2026-11-23", to: "2026-11-29", draws: [{ tech: true }] });
    expect(input!.notes).toEqual(["★ [IRCC] Express Entry change\n요약\nhttps://x\n#immigration"]); // 머리 Bit는 뺀다
    expect(m.state.saved).toEqual(b);
    expect(m.state.posts).toEqual(["이번 주 정리 (2026-11-23 ~ 2026-11-29)\n알버타 테크 선발이 있었어요.\n자세히: https://irin-j.com/scrap\n#immigration"]);
  });

  it("a quiet week skips the AI and still saves a 'quiet' briefing", async () => {
    const m = memory([], [
      "Canada PR — 2026-11-25\n- 뉴스: 관련 글 없음\n#immigration",
      "CN드림 이민 뉴스 — 2026-11-23 ~ 2026-11-30: 이번 주 새 기사 없음.\n#immigration",
      "BC PNP: no draws found on the page — the page layout may have changed.\nhttps://x\n#immigration",
      "Alberta AAIP: started tracking — 99 past draws saved (2025-01-01 – 2026-11-20).\nhttps://x\n#immigration",
    ]);
    let called = false;
    const b = await runWeeklyBriefing(m.store, async () => ((called = true), text), now);
    expect(called).toBe(false);
    expect(b?.headline).toMatch(/없었어요/);
    expect(m.state.posts).toHaveLength(1);
  });

  it("AI failure saves and posts nothing", async () => {
    const m = memory([draw], []);
    expect(await runWeeklyBriefing(m.store, async () => null, now)).toBeNull();
    expect(m.state.saved).toBeNull();
    expect(m.state.posts).toEqual([]);
  });

  it("keeps the newest notes when they exceed the size cap", async () => {
    const big = (i: number) => `${i}`.padEnd(5000, "x");
    const m = memory([], [big(1), big(2), big(3)]);
    let notes: string[] = [];
    await runWeeklyBriefing(m.store, async (i) => ((notes = i.notes), text), now);
    expect(notes.map((n) => n[0])).toEqual(["2", "3"]);
  });

  it("the pointer bit stays within 500 characters and keeps the tag", async () => {
    const m = memory([draw], []);
    await runWeeklyBriefing(m.store, async () => ({ ...text, headline: "가".repeat(600) }), now);
    expect(m.state.posts[0].length).toBeLessThanOrEqual(500);
    expect(m.state.posts[0].endsWith("#immigration")).toBe(true);
  });
});

describe("parseBriefing", () => {
  it("round-trips a saved briefing and drops malformed items", () => {
    const b = { from: "2026-11-23", to: "2026-11-29", generatedAt: "x", ...text, points: [...text.points, { title: "", body: "no title" }, 3] };
    expect(parseBriefing(JSON.stringify(b))?.points).toEqual(text.points);
  });
  it.each(["", "not json", "[]", JSON.stringify({ from: "a", to: "b" })])("returns null for %j", (t) => {
    expect(parseBriefing(t)).toBeNull();
  });
});
