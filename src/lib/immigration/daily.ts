import { runCommunityDigest, type CommunityStore, type DigestResult, type Summarize } from "./community";
import { runMonitor, type FetchText, type MonitorResult, type MonitorStore } from "./monitor";
import { runNewsDigest, type NewsDigestResult } from "./news-digest";
import { NOTE_TAG } from "./sources";

// 영주권 알림 하루 1번 한 묶음 (spec: immigration-daily).
// 선발 표(AI 없음) → 공식·전문 뉴스(AI) → 월요일엔 CN드림 주간 요약(AI)을 차례로 돌리고,
// 비공개 Thread "Canada PR" 하나에 "오늘 요약" 머리 Bit + 상세 Bit들을 남긴다.
//
// 각 단계는 알림·저장을 바로 하지 않고 큐에 쌓는다. 다 돈 뒤 머리 Bit를 먼저 남기고, 큐를 쌓인 순서대로
// 실행한다 — 각 단계의 "알림을 남긴 뒤에 저장" 순서가 그대로 지켜진다 (알림이 실패하면 그 뒤 저장은 안 된다).

type Op = { note: string } | { save: () => Promise<void> };

export class DailyQueue {
  readonly ops: Op[] = [];
  note(content: string) {
    this.ops.push({ note: content });
  }
  save(run: () => Promise<void>) {
    this.ops.push({ save: run });
  }
  get notes() {
    return this.ops.filter((o) => "note" in o).length;
  }
  /** 쌓인 순서대로. 하나라도 실패하면 거기서 멈추고 throw — 뒤의 저장이 앞의 알림 없이 일어나지 않게 */
  async flush(post: (content: string) => Promise<void>) {
    for (const op of this.ops) {
      if ("note" in op) await post(op.note);
      else await op.save();
    }
  }
}

/** 읽기는 바로, 알림·저장은 큐로 */
export function deferMonitorStore(s: MonitorStore, q: DailyQueue): MonitorStore {
  return {
    existingKeys: (p) => s.existingKeys(p),
    getSnapshot: (u) => s.getSnapshot(u),
    insertDraws: async (d) => q.save(() => s.insertDraws(d)),
    saveSnapshot: async (u, h, t, c) => q.save(() => s.saveSnapshot(u, h, t, c)),
    postNote: async (c) => q.note(c),
  };
}

export function deferCommunityStore(s: CommunityStore, q: DailyQueue): CommunityStore {
  return {
    getSeen: (k) => s.getSeen(k),
    saveSeen: async (k, ids) => q.save(() => s.saveSeen(k, ids)),
    postNote: async (c) => q.note(c),
  };
}

export type DailyResult = {
  monitor: MonitorResult | null;
  news: NewsDigestResult | null;
  weekly: DigestResult | null;
  /** 단계 자체가 예외로 멈춘 경우 (단계별로 따로 잡아 다른 단계는 계속 돈다) */
  errors: string[];
  notes: number;
};

const LABEL: Record<string, string> = { EE: "EE", BC_PNP: "BC PNP", AAIP: "AAIP", ircc: "IRCC", cicnews: "CIC News" };
const BIT_MAX = 500;

/** 머리 Bit에 "못 읽음"으로 보여 줄 실패 (단계가 예외 없이 결과로 돌려준 실패) */
function failures(r: Omit<DailyResult, "notes">) {
  const monitor = r.monitor
    ? [
        ...r.monitor.programs.filter((p) => p.error).map((p) => (p.error === "no draws parsed" ? `${LABEL[p.program]} 표 구조` : LABEL[p.program])),
        ...(r.monitor.pages.some((p) => p.status === "error") ? ["AAIP 공지"] : []),
      ]
    : [];
  const feeds = r.news ? r.news.feeds.filter((f) => f.error).map((f) => LABEL[f.id] ?? f.id) : [];
  return { monitor, feeds };
}

/** 오늘 요약을 남길 만한 실패가 있나. 표 구조 경고는 monitor가 이미 주 1번으로 묶어 알리므로 매일 머리 Bit를 만들지 않는다 */
export function hasFailure(r: Omit<DailyResult, "notes">): boolean {
  return (
    r.errors.length > 0 ||
    !!r.monitor?.programs.some((p) => p.error && p.error !== "no draws parsed") ||
    !!r.monitor?.pages.some((p) => p.status === "error") ||
    !!r.news?.feeds.some((f) => f.error) ||
    r.news?.summarized === false ||
    (r.weekly !== null && (!r.weekly.summarized || r.weekly.listed === 0))
  );
}

/** 오늘 요약 머리 Bit (500자 이내). weeklyRan: 월요일 단계를 돌렸는지 */
export function dailyHeader(day: string, r: Omit<DailyResult, "notes">, newsNotes: number, weeklyRan: boolean): string {
  const f = failures(r);
  const lines = [`Canada PR — ${day}`];
  if (r.monitor) {
    // 새 선발·추적 시작·공지 변경만 센다 (표 구조 경고 Bit는 "못 읽음"으로) — Gemini daily #3
    const n = r.monitor.programs.filter((p) => p.added > 0).length + r.monitor.pages.filter((p) => p.status === "changed").length;
    lines.push(`- 선발·공지: ${n ? `새 소식 ${n}건` : "변화 없음"}${f.monitor.length ? ` (못 읽음: ${f.monitor.join(", ")})` : ""}`);
  } else lines.push("- 선발·공지: 실행 실패");
  if (r.news) {
    const main = r.news.summarized ? (newsNotes ? `관련 ${newsNotes}건` : "관련 글 없음") : "AI 요약 실패 — 내일 다시 봐요";
    lines.push(`- 뉴스(IRCC·CIC News): ${main}${f.feeds.length ? ` (못 읽음: ${f.feeds.join(", ")})` : ""}`);
  } else lines.push("- 뉴스(IRCC·CIC News): 실행 실패");
  if (r.weekly) {
    const n = r.weekly.fresh;
    lines.push(`- CN드림 주간: ${r.weekly.listed === 0 ? "목록을 못 읽음" : n ? `${n}건${r.weekly.summarized ? "" : " (AI 요약 실패)"}` : "새 기사 없음"}`);
  } else if (weeklyRan) lines.push("- CN드림 주간: 실행 실패");
  const text = [...lines, `#${NOTE_TAG}`].join("\n");
  return text.length <= BIT_MAX ? text : `${text.slice(0, BIT_MAX - NOTE_TAG.length - 3)}…\n#${NOTE_TAG}`;
}

export async function runDaily(deps: {
  fetchText: FetchText;
  monitorStore: MonitorStore;
  communityStore: CommunityStore;
  summarize: Summarize;
  post: (content: string) => Promise<void>;
  weekly: boolean;
  now?: Date;
  pause?: () => Promise<void>;
}): Promise<DailyResult> {
  const now = deps.now ?? new Date();
  const q = new DailyQueue();
  const errors: string[] = [];
  const step = async <T>(name: string, run: () => Promise<T>): Promise<{ value: T | null; notes: number }> => {
    const before = { ops: q.ops.length, notes: q.notes };
    try {
      return { value: await run(), notes: q.notes - before.notes };
    } catch (e) {
      // 중간에 터진 단계가 쌓아 둔 알림·저장은 버린다 — "실행 실패"라고 하면서 일부만 남기지 않게 (Gemini daily #4)
      q.ops.length = before.ops;
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      return { value: null, notes: 0 };
    }
  };

  // 선발 표가 먼저 — AI가 실패해도 이 결과는 그대로 남는다
  const monitor = await step("monitor", () => runMonitor(deps.fetchText, deferMonitorStore(deps.monitorStore, q), now));
  const cstore = deferCommunityStore(deps.communityStore, q);
  const news = await step("news", () => runNewsDigest(deps.fetchText, cstore, deps.summarize));
  const weekly = deps.weekly ? await step("weekly", () => runCommunityDigest(deps.fetchText, cstore, deps.summarize, { now, pause: deps.pause })) : null;

  const r = { monitor: monitor.value, news: news.value, weekly: weekly?.value ?? null, errors };
  // 새 소식도 실패도 없는 날은 머리 Bit를 남기지 않는다. 그래도 저장(본 것·확인 시각)은 한다 (Gemini daily #1·#2)
  const header = q.notes > 0 || hasFailure(r);
  if (header) await deps.post(dailyHeader(now.toISOString().slice(0, 10), r, news.notes, deps.weekly));
  await q.flush(deps.post);
  return { ...r, notes: q.notes + (header ? 1 : 0) };
}
