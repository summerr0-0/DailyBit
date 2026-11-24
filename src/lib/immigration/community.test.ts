import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CNDREAMS_LIST, articleBody, parseCndreamsList, runCommunityDigest, type CommunityStore, type Summarize } from "./community";

const fixture = (name: string) => readFileSync(join(__dirname, "../__fixtures__/immigration", name), "utf8");
const LIST = fixture("cndreams-list.html");
const ARTICLE = fixture("cndreams-article.html");
const NOW = new Date(Date.UTC(2026, 10, 23, 1)); // 2026-11-23 → 첫 실행 창은 11-09 ~ 11-23 (14일)

function memoryStore(seen: string[] | null = null) {
  const state = { seen, notes: [] as string[] };
  const store: CommunityStore = {
    getSeen: async () => state.seen,
    saveSeen: async (_k, ids) => void (state.seen = ids),
    postNote: async (c) => void state.notes.push(c),
  };
  return { store, state };
}
const fetchFrom = (list: string) => async (url: string) => (url === CNDREAMS_LIST ? list : ARTICLE);
const summarizeAll: Summarize = async (arts) => arts.map((_, i) => ({ summary: `요약 ${i}`, relevant: i === 0 }));

describe("CN드림 parser (R1)", () => {
  it("reads only immigration-section articles with idx, title and date", () => {
    expect(parseCndreamsList(LIST)).toEqual([
      expect.objectContaining({ idx: "39616", title: "농어촌 이민 파일럿 새 제도 출범…", date: "2026-11-16" }),
      expect.objectContaining({ idx: "39576", date: "2026-11-10" }),
      expect.objectContaining({ idx: "39444", title: "고임금 전문직 이민 문턱 낮춘다…익스프레스 엔트리 가산점", date: "2026-10-02" }),
    ]);
  });

  it("extracts the article body without scripts", () => {
    const body = articleBody(ARTICLE);
    expect(body).toContain("새 지역 이민 파일럿");
    expect(body).not.toContain("var x");
    expect(body).not.toContain("나도 한마디");
    expect(articleBody("<p>no body</p>")).toBe("");
  });
});

describe("runCommunityDigest (R2~R4)", () => {
  it("first run summarizes only the last 14 days and marks the rest as seen", async () => {
    const m = memoryStore();
    const r = await runCommunityDigest(fetchFrom(LIST), m.store, summarizeAll, { now: NOW });
    expect(r).toMatchObject({ firstRun: true, listed: 3, fresh: 2, notes: 3 });
    expect(m.state.notes[0]).toContain("2026-11-09 ~ 2026-11-23: 2건 (개발자 영주권 관련 1건)");
    expect(m.state.notes[1]).toContain("★ 2026-11-16 농어촌 이민 파일럿");
    expect(m.state.notes[1]).toContain("idx=39616");
    expect(m.state.notes.every((n) => n.length <= 500 && n.endsWith("#immigration"))).toBe(true);
    expect(m.state.seen?.sort()).toEqual(["39444", "39576", "39616"]);
  });

  it("a week with nothing new still posts one 'no new articles' note", async () => {
    const m = memoryStore(["39616", "39576", "39444"]);
    let called = false;
    const r = await runCommunityDigest(fetchFrom(LIST), m.store, async () => ((called = true), []), { now: NOW });
    expect(r.notes).toBe(1);
    expect(m.state.notes[0]).toContain("이번 주 새 기사 없음");
    expect(called).toBe(false);
  });

  it("new articles after the first run are summarized regardless of date, relevant first", async () => {
    const m = memoryStore(["39616"]);
    const r = await runCommunityDigest(fetchFrom(LIST), m.store, async (a) => a.map((_, i) => ({ summary: `s${i}`, relevant: i === 1 })), { now: NOW });
    expect(r.fresh).toBe(2);
    expect(m.state.notes[1]).toMatch(/^★ 2026-10-02 고임금/);
    expect(m.state.notes[2]).toMatch(/^2026-11-10 /);
  });

  it("keeps titles and links when the AI fails (R3)", async () => {
    const m = memoryStore(["39616"]);
    await runCommunityDigest(fetchFrom(LIST), m.store, async () => null, { now: NOW });
    expect(m.state.notes[0]).toContain("AI 요약 실패");
    expect(m.state.notes[1]).toContain("idx=");
  });

  it("does not mark articles seen when posting fails (R4)", async () => {
    const m = memoryStore(["39616"]);
    m.store.postNote = async () => {
      throw new Error("db down");
    };
    await expect(runCommunityDigest(fetchFrom(LIST), m.store, summarizeAll, { now: NOW })).rejects.toThrow("db down");
    expect(m.state.seen).toEqual(["39616"]);
  });

  it("warns when the list page has no readable articles", async () => {
    const m = memoryStore([]);
    const r = await runCommunityDigest(fetchFrom("<main>maintenance</main>"), m.store, summarizeAll, { now: NOW });
    expect(r.notes).toBe(1);
    expect(m.state.notes[0]).toContain("구조가 바뀌었을 수");
  });

  it("escapes # from the AI summary so #immigration stays the only tag", async () => {
    const m = memoryStore(["39616", "39576"]);
    await runCommunityDigest(fetchFrom(LIST), m.store, async () => [{ summary: "＃eh 요약", relevant: false }], { now: NOW });
    expect(m.state.notes[1].match(/#[^\s]+/g)).toEqual(["#immigration"]);
  });

  it("keeps the link and #immigration even when the title and summary are very long (Gemini wk #1)", async () => {
    const longTitle = `#hot ${"아주 긴 제목 ".repeat(40)}`;
    const list = LIST.replace("저임금 외국인 근로자 고용기간 2년으로 연장", longTitle);
    const m = memoryStore(["39616", "39444"]);
    await runCommunityDigest(fetchFrom(list), m.store, async () => [{ summary: "요약 ".repeat(200), relevant: true }], { now: NOW });
    const note = m.state.notes[1];
    expect(note.length).toBeLessThanOrEqual(500);
    expect(note).toMatch(/idx=39576\n#immigration$/);
    expect(note.match(/#[^\s]+/g)).toEqual(["#immigration"]);
  });

  it("does not ask the AI about an article whose body could not be read (Gemini wk #2)", async () => {
    const m = memoryStore(["39616", "39444"]);
    const fetchNoBody = async (url: string) => (url === CNDREAMS_LIST ? LIST : "<html>moved</html>");
    let asked = -1;
    await runCommunityDigest(fetchNoBody, m.store, async (a) => ((asked = a.length), []), { now: NOW });
    expect(asked).toBe(-1);
    expect(m.state.notes[1]).toContain("본문을 못 읽었어요");
  });

  it("includes undated articles on the first run instead of silently skipping them (Gemini wk #3)", async () => {
    const list = LIST.replace("기사 등록일: 2026-10-02", "");
    const m = memoryStore();
    const r = await runCommunityDigest(fetchFrom(list), m.store, summarizeAll, { now: NOW });
    expect(r.fresh).toBe(3);
  });
});
