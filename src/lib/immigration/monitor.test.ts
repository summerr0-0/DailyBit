import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNote, runMonitor, sha256, type MonitorStore, type StoredDraw } from "./monitor";
import { SOURCES, WATCHED_PAGES, drawKey, type Program } from "./parse";

const fixture = (name: string) => readFileSync(join(__dirname, "../__fixtures__/immigration", name), "utf8");

function memoryStore(seed: StoredDraw[] = []) {
  const draws = [...seed];
  const snapshots = new Map<string, { hash: string; text: string }>();
  const notes: string[] = [];
  const store: MonitorStore = {
    existingKeys: async (p: Program) => new Set(draws.filter((d) => d.program === p).map((d) => d.dedupeKey)),
    insertDraws: async (d) => void draws.push(...d),
    getSnapshot: async (url) => snapshots.get(url) ?? null,
    saveSnapshot: async (url, hash, text) => void snapshots.set(url, { hash, text }),
    postNote: async (c) => void notes.push(c),
  };
  return { store, draws, notes, snapshots };
}

const pages: Record<string, string> = {
  [SOURCES.EE]: fixture("ee-rounds.json"),
  [SOURCES.BC_PNP]: fixture("bc-invitations.html"),
  [SOURCES.AAIP]: fixture("aaip-processing.html"),
  [WATCHED_PAGES[0]]: "<main><h2>Updates</h2><p>Intake for the Accelerated Tech Pathway continues.</p></main>",
};
const fetchFrom = (map: Record<string, string>) => async (url: string) => {
  if (!(url in map)) throw new Error("HTTP 404");
  return map[url];
};

describe("runMonitor", () => {
  it("first run saves past draws quietly: one 'started tracking' note per program, no per-draw lines", async () => {
    const m = memoryStore();
    const r = await runMonitor(fetchFrom(pages), m.store);
    expect(r.programs.map((p) => [p.program, p.backfill, p.added > 0])).toEqual([
      ["EE", true, true],
      ["BC_PNP", true, true],
      ["AAIP", true, true],
    ]);
    expect(m.notes).toHaveLength(3);
    expect(m.notes.every((n) => n.includes("started tracking") && n.endsWith("#immigration"))).toBe(true);
    expect(r.pages[0].status).toBe("new"); // 첫 스냅샷은 알리지 않는다
  });

  it("a second run with the same pages adds nothing and posts nothing", async () => {
    const m = memoryStore();
    await runMonitor(fetchFrom(pages), m.store);
    const before = m.draws.length;
    m.notes.length = 0;
    const r = await runMonitor(fetchFrom(pages), m.store);
    expect(m.draws.length).toBe(before);
    expect(m.notes).toEqual([]);
    expect(r.pages[0].status).toBe("same");
  });

  it("a new AAIP draw becomes one note with the draw line, tech draws starred", async () => {
    const m = memoryStore();
    await runMonitor(fetchFrom(pages), m.store);
    m.notes.length = 0;
    const newRow = `<tr><td>November 20, 2026</td><td>Alberta Express Entry Stream – Accelerated Tech Pathway</td><td>58</td><td>120</td></tr>`;
    const updated = { ...pages, [SOURCES.AAIP]: pages[SOURCES.AAIP].replace(/(<tr>\s*<td[^>]*>\s*November 13)/, `${newRow}$1`) };
    expect(updated[SOURCES.AAIP]).not.toBe(pages[SOURCES.AAIP]);
    const r = await runMonitor(fetchFrom(updated), m.store);
    expect(r.programs.find((p) => p.program === "AAIP")).toMatchObject({ added: 1, backfill: false });
    expect(m.notes).toHaveLength(1);
    expect(m.notes[0]).toContain("Alberta AAIP: new draw\n- ★ 2026-11-20 Alberta Express Entry Stream – Accelerated Tech Pathway — min 58 · 120 invites");
    expect(m.notes[0]).toContain(SOURCES.AAIP);
  });

  it("a changed notice page posts only the new lines", async () => {
    const m = memoryStore();
    await runMonitor(fetchFrom(pages), m.store);
    m.notes.length = 0;
    const changed = { ...pages, [WATCHED_PAGES[0]]: pages[WATCHED_PAGES[0]].replace("</main>", "<p>New Tech draw criteria from Dec 1.</p></main>") };
    const r = await runMonitor(fetchFrom(changed), m.store);
    expect(r.pages[0].status).toBe("changed");
    expect(m.notes).toEqual([expect.stringContaining("+ New Tech draw criteria from Dec 1.")]);
    expect(m.notes[0]).not.toContain("Intake for the Accelerated");
  });

  it("reports fetch errors without notes, and warns once when a page has no readable table", async () => {
    const m = memoryStore();
    const broken = { ...pages, [SOURCES.BC_PNP]: "<main><p>Maintenance</p></main>" };
    delete (broken as Record<string, string>)[SOURCES.EE];
    const r = await runMonitor(fetchFrom(broken), m.store);
    expect(r.programs.find((p) => p.program === "EE")?.error).toBe("HTTP 404");
    expect(r.programs.find((p) => p.program === "BC_PNP")?.error).toBe("no draws parsed");
    expect(m.notes.filter((n) => n.includes("layout may have changed"))).toHaveLength(1);
    expect(m.notes.some((n) => n.startsWith("Express Entry"))).toBe(false);
  });

  it("does not re-add an EE round already stored, even if IRCC rewords its text", async () => {
    // 저장 때와 문구가 달라도 회차 번호(453)가 같으면 같은 선발 (Gemini imm #4)
    const d = { program: "EE" as const, stream: "Transport occupations (old wording)", detail: "old text", drawDate: "2026-10-28", ref: "453" };
    const m = memoryStore([{ ...d, minScore: 477, invitations: 150, invitationsText: "150", sourceUrl: SOURCES.EE, dedupeKey: sha256(drawKey(d)) }]);
    const r = await runMonitor(fetchFrom(pages), m.store);
    expect(r.programs.find((p) => p.program === "EE")).toMatchObject({ found: 3, added: 2, backfill: false });
    expect(m.notes.find((n) => n.startsWith("Express Entry"))).not.toContain("Transport");
  });
});

describe("runMonitor — failure handling (Gemini imm #6, #8)", () => {
  it("posts the note before saving draws, so a failed note is retried next run", async () => {
    const m = memoryStore();
    m.store.postNote = async () => {
      throw new Error("pooler hiccup");
    };
    await expect(runMonitor(fetchFrom(pages), m.store)).rejects.toThrow("pooler hiccup");
    expect(m.draws).toHaveLength(0);
  });

  it("warns about an unreadable page at most once a week", async () => {
    const m = memoryStore();
    const broken = { ...pages, [SOURCES.BC_PNP]: "<main><p>Maintenance</p></main>" };
    const day = (n: number) => new Date(Date.UTC(2026, 10, 22 + n));
    await runMonitor(fetchFrom(broken), m.store, day(0));
    await runMonitor(fetchFrom(broken), m.store, day(1));
    await runMonitor(fetchFrom(broken), m.store, day(8));
    expect(m.notes.filter((n) => n.includes("layout may have changed"))).toHaveLength(2);
  });

  it("shows a draw even when its selection factors are very long", async () => {
    const m = memoryStore();
    await runMonitor(fetchFrom(pages), m.store);
    m.notes.length = 0;
    const longFactors = "Very long selection factor text ".repeat(15);
    const row = `<tr><td>November 20, 2026</td><td>Innovate: High Economic Impact</td><td>${longFactors}</td><td>120</td><td>300</td></tr>`;
    const updated = { ...pages, [SOURCES.BC_PNP]: pages[SOURCES.BC_PNP].replace(/(<tr>\s*<td[^>]*>\s*November 13)/, `${row}$1`) };
    expect(updated[SOURCES.BC_PNP]).not.toBe(pages[SOURCES.BC_PNP]);
    await runMonitor(fetchFrom(updated), m.store);
    const note = m.notes.find((n) => n.startsWith("BC PNP"))!;
    expect(note.length).toBeLessThanOrEqual(500);
    expect(note).toContain("★ 2026-11-20 Innovate: High Economic Impact");
    expect(note).not.toContain("(+1 more)");
  });

  it("escapes # in notice lines so #immigration stays the only tag source", async () => {
    const m = memoryStore();
    await runMonitor(fetchFrom(pages), m.store);
    m.notes.length = 0;
    const changed = { ...pages, [WATCHED_PAGES[0]]: pages[WATCHED_PAGES[0]].replace("</main>", "<p>Use #a #b #c #d #e #f #g #h #i #j #k now.</p></main>") };
    await runMonitor(fetchFrom(changed), m.store);
    expect(m.notes[0]).toContain("＃a");
    expect(m.notes[0].match(/#[a-z]/g)).toEqual(["#i"]); // #immigration 하나만
  });
});

describe("buildNote", () => {
  it("stays within 500 chars and says how many lines were cut", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `- 2026-11-${String(i + 1).padStart(2, "0")} Some long stream name for draw number ${i}`);
    const note = buildNote("BC PNP: new draws", lines, ["https://example.org/page"]);
    expect(note.length).toBeLessThanOrEqual(500);
    expect(note).toMatch(/\(\+\d+ more\)/);
    expect(note.endsWith("https://example.org/page\n#immigration")).toBe(true);
  });
});
