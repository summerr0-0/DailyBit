import { JSDOM, VirtualConsole } from "jsdom";

// 캐나다 영주권 선발 표 파서 (spec: immigration-monitor D2). AI를 쓰지 않고 공식 표를 그대로 읽는다.
// 출처: IRCC Express Entry JSON, WelcomeBC BC PNP 선발 표, alberta.ca AAIP Table 10.

export * from "./sources";
import { type Draw, SOURCES } from "./sources";

// 정부 페이지 CSS를 jsdom이 못 읽을 때 나오는 경고는 버린다 (표·글자만 쓴다)
const quiet = () => ({ virtualConsole: new VirtualConsole() });

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "November 13, 2026" / "Nov. 13, 2026" / "2026-11-13" → "2026-11-13". 못 읽으면 null */
export function parseDrawDate(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return t;
  const m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()] ?? Object.entries(MONTHS).find(([k]) => k.startsWith(m[1].toLowerCase()) && m[1].length >= 3)?.[1];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

/** "1,250" → 1250, "<5"·"N/A"·"" → null */
export function parseCount(text: string): number | null {
  const t = text.replace(/,/g, "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim();

/** <table>을 rowspan·colspan을 펼친 2차원 칸 배열로. 첫 줄(머리)은 제외하지 않는다 */
export function tableGrid(table: Element): string[][] {
  const grid: string[][] = [];
  const carry: { text: string; left: number }[] = []; // 열별로 아래로 이어지는 rowspan
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const row: string[] = [];
    const cells = Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
    let col = 0;
    const fillCarried = () => {
      while (carry[col] && carry[col].left > 0) {
        row[col] = carry[col].text;
        carry[col].left--;
        col++;
      }
    };
    for (const cell of cells) {
      fillCarried();
      const text = clean(cell.textContent);
      const rs = Math.max(1, Number(cell.getAttribute("rowspan")) || 1);
      const cs = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
      for (let k = 0; k < cs; k++) {
        row[col] = text;
        carry[col] = { text, left: rs - 1 };
        col++;
      }
    }
    // 줄 끝: 이 줄에 셀이 모자라도 뒤쪽 rowspan 열은 모두 채우고 줄여 준다 (Gemini imm #3a)
    for (let c = col; c < carry.length; c++) {
      if (carry[c] && carry[c].left > 0) {
        row[c] = carry[c].text;
        carry[c].left--;
      }
    }
    grid.push(Array.from(row, (c) => c ?? ""));
  }
  return grid;
}

function tablesWithHeader(html: string, needle: RegExp): string[][][] {
  const doc = new JSDOM(html, quiet()).window.document;
  return Array.from(doc.querySelectorAll("table"))
    .map(tableGrid)
    .filter((g) => g.length > 0 && needle.test(g[0].join(" | ")));
}

function headerIndex(header: string[], re: RegExp): number {
  return header.findIndex((h) => re.test(h));
}

/** 같은 선발이 rowspan 때문에 여러 줄로 펼쳐지면(선발 조건만 다른 줄) 조건을 " / "로 합친다 */
function mergeSameDraw(draws: Draw[]): Draw[] {
  const out: Draw[] = [];
  for (const d of draws) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.program === d.program &&
      prev.drawDate === d.drawDate &&
      prev.stream === d.stream &&
      prev.minScore === d.minScore &&
      prev.invitationsText === d.invitationsText &&
      prev.detail !== d.detail
    ) {
      prev.detail = [prev.detail, d.detail].filter(Boolean).join(" / ");
      continue;
    }
    out.push({ ...d });
  }
  return out;
}

/**
 * rowspan이 틀려 열이 밀린 줄을 걸러 낸다 (Gemini imm #3b): 스트림 칸에 날짜가 들어 있거나,
 * 점수·인원 칸에 날짜나 긴 글(선발 조건 같은)이 들어 있으면 버린다. "Less than 10"·"<5"·"N/A"는 정상.
 */
function rowLooksSane(stream: string, score: string | undefined, count: string | undefined): boolean {
  const shortValue = (v: string | undefined) => (v ?? "").trim().length <= 20 && parseDrawDate(v ?? "") === null;
  return !!stream && parseDrawDate(stream) === null && shortValue(score) && shortValue(count);
}

type EeRound = { drawNumber?: string; drawDate?: string; drawName?: string; drawSize?: string; drawCRS?: string; drawText2?: string };

export function parseExpressEntry(json: unknown): Draw[] {
  const rounds = (json as { rounds?: EeRound[] })?.rounds;
  if (!Array.isArray(rounds)) return [];
  const out: Draw[] = [];
  for (const r of rounds) {
    const drawDate = parseDrawDate(r.drawDate ?? "");
    const stream = clean(r.drawName);
    if (!drawDate || !stream) continue;
    out.push({
      program: "EE",
      stream,
      detail: clean(r.drawText2),
      drawDate,
      minScore: parseCount(r.drawCRS ?? ""),
      invitations: parseCount(r.drawSize ?? ""),
      invitationsText: clean(r.drawSize),
      sourceUrl: SOURCES.EE,
      ref: clean(r.drawNumber) || undefined,
    });
  }
  return out;
}

/** WelcomeBC Skills Immigration 선발 표 (머리: Date | ITA type | Selection factors | Minimum score | Number of invitations) */
export function parseBcPnp(html: string): Draw[] {
  const out: Draw[] = [];
  for (const grid of tablesWithHeader(html, /ITA type/i)) {
    const h = grid[0];
    const iDate = headerIndex(h, /date/i);
    const iType = headerIndex(h, /ITA type/i);
    const iFactors = headerIndex(h, /selection/i);
    const iScore = headerIndex(h, /minimum/i);
    const iCount = headerIndex(h, /number/i);
    // 머리 이름이 바뀌어 열을 못 찾으면 빈 값으로 저장하지 말고 표 전체를 못 읽은 것으로 (Gemini imm #2)
    if ([iDate, iType, iScore, iCount].some((i) => i < 0)) continue;
    for (const row of grid.slice(1)) {
      const drawDate = parseDrawDate(row[iDate] ?? "");
      const stream = row[iType] ?? "";
      if (!drawDate || !rowLooksSane(stream, row[iScore], row[iCount])) continue;
      out.push({
        program: "BC_PNP",
        stream,
        detail: iFactors >= 0 ? (row[iFactors] ?? "") : "",
        drawDate,
        minScore: parseCount(row[iScore] ?? ""),
        invitations: parseCount(row[iCount] ?? ""),
        invitationsText: row[iCount] ?? "",
        sourceUrl: SOURCES.BC_PNP,
      });
    }
  }
  return mergeSameDraw(out);
}

/** alberta.ca Table 10 (머리: Draw date | Worker stream, pathway… | Minimum score… | Number of invitations) */
export function parseAaip(html: string): Draw[] {
  const out: Draw[] = [];
  for (const grid of tablesWithHeader(html, /draw date/i)) {
    const h = grid[0];
    const iDate = headerIndex(h, /date/i);
    const iStream = headerIndex(h, /stream|pathway/i);
    const iScore = headerIndex(h, /minimum/i);
    const iCount = headerIndex(h, /number/i);
    if ([iDate, iStream, iScore, iCount].some((i) => i < 0)) continue;
    for (const row of grid.slice(1)) {
      const drawDate = parseDrawDate(row[iDate] ?? "");
      const stream = row[iStream] ?? "";
      if (!drawDate || !rowLooksSane(stream, row[iScore], row[iCount])) continue;
      out.push({
        program: "AAIP",
        stream,
        detail: "",
        drawDate,
        minScore: parseCount(row[iScore] ?? ""),
        invitations: parseCount(row[iCount] ?? ""),
        invitationsText: row[iCount] ?? "",
        sourceUrl: SOURCES.AAIP,
      });
    }
  }
  return mergeSameDraw(out);
}

/** 변경 감지용 본문: <main>의 글자만, 공백 정리. "Last updated" 같은 날짜 줄은 빼서 날짜만 바뀐 걸 변경으로 보지 않는다 */
export function pageText(html: string): string {
  const doc = new JSDOM(html, quiet()).window.document;
  doc.querySelectorAll("script, style, noscript, nav, header, footer").forEach((n) => n.remove());
  const root = doc.querySelector("main") ?? doc.body;
  const BLOCKS = "h1, h2, h3, h4, p, li, td, th";
  // 안에 다른 블록이 있는 바깥 블록(예: <li><p>…</p></li>)은 빼서 같은 글이 두 줄로 나오지 않게 (Gemini imm #7)
  const blocks = Array.from(root.querySelectorAll(BLOCKS))
    .filter((n) => !n.querySelector(BLOCKS))
    .map((n) => clean(n.textContent))
    .filter((t) => t && !/^(last updated|updated|published)\b/i.test(t));
  return [...new Set(blocks)].join("\n");
}

/** 새 본문에만 있는 줄 (공지 페이지 변경 알림에 쓴다) */
export function addedLines(before: string, after: string): string[] {
  const old = new Set(before.split("\n"));
  return after.split("\n").filter((l) => l && !old.has(l));
}
