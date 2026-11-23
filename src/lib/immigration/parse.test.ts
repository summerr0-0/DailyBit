import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  addedLines,
  drawKey,
  isTechRelevant,
  pageText,
  parseAaip,
  parseBcPnp,
  parseCount,
  parseDrawDate,
  parseExpressEntry,
  tableGrid,
} from "./parse";

// 픽스처는 2026-11-22 실제 페이지에서 표 몇 줄만 잘라 둔 것
const fixture = (name: string) => readFileSync(join(__dirname, "../__fixtures__/immigration", name), "utf8");

describe("parseDrawDate / parseCount", () => {
  it("reads the date formats the three sites use", () => {
    expect(parseDrawDate("November 13, 2026")).toBe("2026-11-13");
    expect(parseDrawDate("Sept. 3, 2026")).toBe("2026-09-03");
    expect(parseDrawDate("2026-10-28")).toBe("2026-10-28");
    expect(parseDrawDate("Draw date")).toBeNull();
  });
  it("keeps only plain numbers", () => {
    expect(parseCount("1,250")).toBe(1250);
    expect(parseCount("<5")).toBeNull();
    expect(parseCount("N/A")).toBeNull();
  });
});

describe("tableGrid", () => {
  it("spreads rowspan cells down into the rows they cover", () => {
    const doc = new JSDOM(
      `<table><tr><th>D</th><th>T</th><th>S</th></tr>
       <tr><td rowspan="2">Nov 1, 2026</td><td>A</td><td rowspan="2">9</td></tr>
       <tr><td>B</td></tr></table>`,
    ).window.document;
    expect(tableGrid(doc.querySelector("table")!)).toEqual([
      ["D", "T", "S"],
      ["Nov 1, 2026", "A", "9"],
      ["Nov 1, 2026", "B", "9"],
    ]);
  });
});

describe("parseExpressEntry", () => {
  it("maps IRCC rounds to draws", () => {
    const draws = parseExpressEntry(JSON.parse(fixture("ee-rounds.json")));
    expect(draws).toHaveLength(3);
    expect(draws[0]).toMatchObject({
      program: "EE",
      stream: "Transport Occupations, 2026-Version 2",
      drawDate: "2026-10-28",
      minScore: 477,
      invitations: 150,
    });
  });
  it("returns nothing for an unexpected shape instead of throwing", () => {
    expect(parseExpressEntry({ foo: 1 })).toEqual([]);
    expect(parseExpressEntry(null)).toEqual([]);
  });
});

describe("parseBcPnp", () => {
  const draws = parseBcPnp(fixture("bc-invitations.html"));

  it("fills the shared date into every row of a draw day", () => {
    const nov13 = draws.filter((d) => d.drawDate === "2026-11-13");
    expect(nov13.map((d) => d.stream)).toEqual([
      "Care: Childcare",
      "Care: Health",
      "Care: Veterinary Care",
      "Build: Construction Trades",
    ]);
  });

  it("merges a draw whose selection factors span two rows", () => {
    const vet = draws.find((d) => d.stream === "Care: Veterinary Care")!;
    expect(vet.detail).toMatch(/veterinary care occupations \/ Animal health technologists/);
    expect(vet).toMatchObject({ minScore: 100, invitations: null, invitationsText: "<5" });
  });

  it("keeps the two Innovate draws (wage and points) apart", () => {
    const innovate = draws.filter((d) => d.stream === "Innovate: High Economic Impact");
    expect(innovate).toHaveLength(2);
    expect(innovate[0]).toMatchObject({ drawDate: "2026-10-29", minScore: null, invitations: 524 });
    expect(innovate[0].detail).toContain("$49/hour");
    expect(innovate[1]).toMatchObject({ detail: "Points", minScore: 131, invitations: 248 });
  });

  it("ignores the registration pool and entrepreneur tables", () => {
    expect(draws.every((d) => !/base|regional|150\+/i.test(d.stream))).toBe(true);
  });
});

describe("parser guards (Gemini imm #2, #3)", () => {
  it("returns nothing when a needed column header was renamed", () => {
    const html = `<table><tr><th>Draw date</th><th>Stream</th><th>Score</th><th>Number of invitations</th></tr>
      <tr><td>November 1, 2026</td><td>Alberta Opportunity Stream</td><td>55</td><td>100</td></tr></table>`;
    expect(parseAaip(html)).toEqual([]);
  });
  it("drops a row shifted by a wrong rowspan instead of storing garbage", () => {
    const html = `<table><tr><th>Date</th><th>ITA type</th><th>Selection factors</th><th>Minimum score</th><th>Number of invitations</th></tr>
      <tr><td rowspan="3">November 13, 2026</td><td>Care: Health</td><td>All</td><td>72</td><td>103</td></tr>
      <tr><td>Build: Construction Trades</td><td>All</td><td>94</td><td>128</td></tr>
      <tr><td>October 29, 2026</td><td>Innovate: High Economic Impact</td><td>Points</td><td>131</td><td>248</td></tr></table>`;
    const draws = parseBcPnp(html);
    expect(draws.map((d) => d.stream)).toEqual(["Care: Health", "Build: Construction Trades"]);
  });
  it("keeps 'Less than 10' rows (alberta.ca writes small counts that way)", () => {
    const html = `<table><tr><th>Draw date</th><th>Worker stream</th><th>Minimum score</th><th>Number of invitations</th></tr>
      <tr><td>October 16, 2026</td><td>Alberta Express Entry Stream – Law Enforcement Pathway</td><td>49</td><td>Less than 10</td></tr></table>`;
    expect(parseAaip(html)).toEqual([expect.objectContaining({ minScore: 49, invitations: null, invitationsText: "Less than 10" })]);
  });
  it("keeps rowspan columns after a short row in step", () => {
    const doc = new JSDOM(
      `<table><tr><td>a</td><td rowspan="3">x</td></tr><tr></tr><tr><td>c</td></tr><tr><td>d</td><td>y</td></tr></table>`,
    ).window.document;
    expect(tableGrid(doc.querySelector("table")!)).toEqual([["a", "x"], ["", "x"], ["c", "x"], ["d", "y"]]);
  });
  it("does not repeat text of nested blocks in page text", () => {
    expect(pageText("<main><ul><li><p>One</p></li><li>Two</li></ul></main>")).toBe("One\nTwo");
  });
});

describe("parseAaip", () => {
  it("reads Table 10 and skips the other tables", () => {
    const draws = parseAaip(fixture("aaip-processing.html"));
    expect(draws).toHaveLength(5);
    expect(draws[0]).toMatchObject({
      program: "AAIP",
      stream: "Alberta Opportunity Stream",
      drawDate: "2026-11-13",
      minScore: 55,
      invitations: 241,
    });
  });
});

describe("page change helpers", () => {
  it("ignores 'Last updated' lines and scripts", () => {
    const a = pageText("<main><p>Last updated: Nov 1</p><p>Intake opens.</p><script>x()</script></main>");
    const b = pageText("<main><p>Last updated: Nov 9</p><p>Intake opens.</p></main>");
    expect(a).toBe(b);
    expect(a).toBe("Intake opens.");
  });
  it("lists only the lines that are new", () => {
    expect(addedLines("a\nb", "a\nb\nc")).toEqual(["c"]);
  });
});

describe("drawKey / isTechRelevant", () => {
  it("is case-insensitive on stream and detail", () => {
    const base = { program: "AAIP" as const, drawDate: "2026-09-22", detail: "", minScore: 59, invitationsText: "100" };
    expect(drawKey({ ...base, stream: "Accelerated Tech Pathway" })).toBe(drawKey({ ...base, stream: "accelerated tech pathway" }));
  });
  it("flags tech draws, not health, trades or general priority sectors", () => {
    const pnp = (stream: string, detail = "") => isTechRelevant({ program: "AAIP", stream, detail });
    expect(pnp("Alberta Express Entry Stream – Accelerated Tech Pathway")).toBe(true);
    expect(isTechRelevant({ program: "BC_PNP", stream: "Innovate: High Economic Impact", detail: "Points" })).toBe(true);
    expect(pnp("Care: Health", "All priority health care occupations")).toBe(false);
    expect(pnp("Build: Construction Trades")).toBe(false);
    expect(pnp("Care: Veterinary Care", "Animal health technologists and veterinary technicians")).toBe(false);
    expect(pnp("Alberta Express Entry Stream – Priority Sectors (General)")).toBe(false);
  });
  it("judges Express Entry by the draw name only", () => {
    const detail = "Federal Skilled Worker Program, Canadian Experience Class and Federal Skilled Trades Program";
    expect(isTechRelevant({ program: "EE", stream: "Canadian Experience Class", detail })).toBe(true);
    expect(isTechRelevant({ program: "EE", stream: "STEM occupations (2026-Version 1)", detail })).toBe(true);
    expect(isTechRelevant({ program: "EE", stream: "Transport Occupations, 2026-Version 2", detail })).toBe(false);
    expect(isTechRelevant({ program: "EE", stream: "French-Language proficiency 2026-Version 2", detail })).toBe(false);
  });
});
