import { createHash } from "node:crypto";
import {
  SOURCES,
  WATCHED_PAGES,
  addedLines,
  drawKey,
  isTechRelevant,
  pageText,
  parseAaip,
  parseBcPnp,
  parseExpressEntry,
  type Draw,
  type Program,
} from "./parse";

// 캐나다 영주권 선발 모니터 한 번 실행 (spec: immigration-monitor). AI 없음 — 공식 표·JSON만 읽는다.
// 새 선발과 공지 변경은 비공개 Thread "Canada PR draws"에 비공개 Bit(#immigration)로 남긴다.

export const NOTE_TAG = "immigration";
export const NOTE_THREAD_TITLE = "Canada PR draws";
const NOTE_MAX = 500;

export type StoredDraw = Draw & { dedupeKey: string };

export interface MonitorStore {
  /** 이 프로그램에 이미 있는 dedupeKey 전체 */
  existingKeys(program: Program): Promise<Set<string>>;
  insertDraws(draws: StoredDraw[]): Promise<void>;
  getSnapshot(url: string): Promise<{ hash: string; text: string } | null>;
  saveSnapshot(url: string, hash: string, text: string, changed: boolean): Promise<void>;
  /** 비공개 Bit 하나 (본문 500자 이내) */
  postNote(content: string): Promise<void>;
}

export type FetchText = (url: string) => Promise<string>;

export type ProgramResult = { program: Program; found: number; added: number; backfill: boolean; error?: string };
export type MonitorResult = { programs: ProgramResult[]; pages: { url: string; status: "new" | "same" | "changed" | "error" }[]; notes: number };

const LABEL: Record<Program, string> = { EE: "Express Entry", BC_PNP: "BC PNP", AAIP: "Alberta AAIP" };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function drawLine(d: Draw): string {
  const parts = [
    d.minScore !== null ? `min ${d.minScore}` : null,
    d.invitationsText ? `${d.invitationsText} invites` : null,
  ].filter(Boolean);
  // 한 줄이 너무 길면 줄 하나도 못 담는 일이 없게 자른다 (Gemini imm #5)
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const detail = d.detail && d.program === "BC_PNP" ? ` (${cut(d.detail, 90)})` : "";
  return `- ${isTechRelevant(d) ? "★ " : ""}${d.drawDate} ${cut(d.stream, 90)}${detail} — ${parts.join(" · ") || "no numbers"}`;
}

/** 머리·줄·꼬리를 500자 안에 담는다. 넘치는 줄은 "(+N more)"로 */
export function buildNote(head: string, lines: string[], tail: string[]): string {
  const footer = [...tail, `#${NOTE_TAG}`].join("\n");
  const fit = (n: number) => {
    const more = lines.length - n > 0 ? [`(+${lines.length - n} more)`] : [];
    return [head, ...lines.slice(0, n), ...more, footer].join("\n");
  };
  for (let n = lines.length; n >= 0; n--) {
    const text = fit(n);
    if (text.length <= NOTE_MAX) return text;
  }
  // 줄 없이도 넘치면(머리가 아주 긴 경우) 머리를 자른다
  return [head.slice(0, Math.max(0, NOTE_MAX - footer.length - 1)), footer].join("\n").slice(0, NOTE_MAX);
}

function parseFor(program: Program, body: string): Draw[] {
  if (program === "EE") return parseExpressEntry(JSON.parse(body));
  if (program === "BC_PNP") return parseBcPnp(body);
  return parseAaip(body);
}

/** 같은 "표를 못 읽음" 경고는 이 기간에 한 번만 (Gemini imm #8). 기록은 PageSnapshot에 `warning:<program>` 키로 */
const WARN_EVERY_MS = 7 * 24 * 3600_000;

type Pending = { result: ProgramResult; note?: string; commit?: () => Promise<void> };

async function checkProgram(program: Program, fetchText: FetchText, store: MonitorStore, now: Date): Promise<Pending> {
  let draws: Draw[];
  try {
    draws = parseFor(program, await fetchText(SOURCES[program]));
  } catch (e) {
    return { result: { program, found: 0, added: 0, backfill: false, error: e instanceof Error ? e.message : String(e) } };
  }
  if (draws.length === 0) {
    // 페이지는 열렸는데 표를 못 읽음 → 구조가 바뀌었을 가능성 (plan 7장)
    const result: ProgramResult = { program, found: 0, added: 0, backfill: false, error: "no draws parsed" };
    const key = `warning:${program}`;
    const last = await store.getSnapshot(key);
    if (last && now.getTime() - Number(last.text) < WARN_EVERY_MS) return { result };
    return {
      result,
      note: buildNote(`${LABEL[program]}: no draws found on the page — the page layout may have changed.`, [], [SOURCES[program]]),
      commit: () => store.saveSnapshot(key, "warning", String(now.getTime()), true),
    };
  }

  const known = await store.existingKeys(program);
  const seen = new Set<string>();
  const fresh: StoredDraw[] = [];
  for (const d of draws) {
    const dedupeKey = sha256(drawKey(d));
    if (known.has(dedupeKey) || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    fresh.push({ ...d, dedupeKey });
  }
  const backfill = known.size === 0;
  const result: ProgramResult = { program, found: draws.length, added: fresh.length, backfill };
  if (fresh.length === 0) return { result };

  // 저장은 알림을 남긴 뒤에 한다 — 알림이 실패하면 다음 실행에서 다시 "새 선발"로 잡히게 (Gemini imm #6)
  const commit = () => store.insertDraws(fresh);
  if (backfill) {
    const dates = fresh.map((d) => d.drawDate).sort();
    return { result, commit, note: buildNote(`${LABEL[program]}: started tracking — ${fresh.length} past draws saved (${dates[0]} – ${dates[dates.length - 1]}).`, [], [SOURCES[program]]) };
  }
  // 최신 선발 먼저, 개발자 관련(★) 줄이 잘리지 않게 앞으로
  const ordered = [...fresh].sort((a, b) => Number(isTechRelevant(b)) - Number(isTechRelevant(a)) || b.drawDate.localeCompare(a.drawDate));
  return { result, commit, note: buildNote(`${LABEL[program]}: new draw${fresh.length > 1 ? "s" : ""}`, ordered.map(drawLine), [SOURCES[program]]) };
}

async function checkPage(url: string, fetchText: FetchText, store: MonitorStore): Promise<{ status: MonitorResult["pages"][number]["status"]; note?: string; commit?: () => Promise<void> }> {
  let text: string;
  try {
    text = pageText(await fetchText(url));
  } catch {
    return { status: "error" };
  }
  if (!text) return { status: "error" };
  const hash = sha256(text);
  const prev = await store.getSnapshot(url);
  if (!prev) {
    await store.saveSnapshot(url, hash, text, true);
    return { status: "new" };
  }
  if (prev.hash === hash) {
    await store.saveSnapshot(url, hash, text, false);
    return { status: "same" };
  }
  // 공지 글의 "#단어"가 태그로 잡혀 #immigration을 밀어내지 않게 전각 ＃로 바꾼다 (Gemini imm #7)
  const added = addedLines(prev.text, text)
    .map((l) => l.replace(/#/g, "＃"))
    .map((l) => `+ ${l.length > 160 ? `${l.slice(0, 157)}…` : l}`);
  const head = added.length > 0 ? "AAIP updates page changed — new lines:" : "AAIP updates page changed (lines removed only).";
  return { status: "changed", note: buildNote(head, added, [url]), commit: () => store.saveSnapshot(url, hash, text, true) };
}

export async function runMonitor(fetchText: FetchText, store: MonitorStore, now: Date = new Date()): Promise<MonitorResult> {
  const out: MonitorResult = { programs: [], pages: [], notes: 0 };
  const settle = async (p: { note?: string; commit?: () => Promise<void> }) => {
    if (p.note) {
      await store.postNote(p.note);
      out.notes++;
    }
    await p.commit?.();
  };
  for (const program of Object.keys(SOURCES) as Program[]) {
    const p = await checkProgram(program, fetchText, store, now);
    out.programs.push(p.result);
    await settle(p);
  }
  for (const url of WATCHED_PAGES) {
    const p = await checkPage(url, fetchText, store);
    out.pages.push({ url, status: p.status });
    await settle(p);
  }
  return out;
}
