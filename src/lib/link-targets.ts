import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { extractLinkKeys, linkKey, type LinkTargets } from "@/lib/wiki-links";

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// [[링크]] 대상 사전과 백링크 (spec: wiki-links D1, D2, D4).

/**
 * linkKey → threadId. Thread 제목 + 발행된 개념의 이름·별칭. 요청당 한 번만 조회.
 * 방문자용(includePrivate=false)에는 공개 Bit가 있는 Thread만 넣는다 — 비공개 Thread의 제목·id가
 * 링크로 새지 않게 (2026-11-22 비공개 노출 수정).
 */
export const getLinkTargets = cache(async (includePrivate = false): Promise<LinkTargets> => {
  const [threads, concepts] = await Promise.all([
    prisma.thread.findMany({
      where: includePrivate ? undefined : { bits: { some: { private: false } } },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.concept.findMany({
      where: { status: "PUBLISHED", threadId: { not: null } },
      select: { term: true, aliases: true, threadId: true },
    }),
  ]);
  const targets: LinkTargets = {};
  const visible = new Set(threads.map((t) => t.id));
  for (const t of threads) {
    const k = linkKey(t.title);
    if (k && !has(targets, k)) targets[k] = t.id;
  }
  // 개념 이름·별칭이 Thread 제목보다 우선 ("gadget chain" → "What is gadget chain?" Thread)
  for (const c of concepts) {
    for (const name of [c.term, ...c.aliases]) {
      const k = linkKey(name);
      if (k && c.threadId && visible.has(c.threadId)) targets[k] = c.threadId;
    }
  }
  return targets;
});

/** 자동완성 목록: 내 Thread 제목 + 발행된 개념 이름 (중복 제거) */
export async function getLinkSuggestions(): Promise<{ title: string; kind: "thread" | "concept" }[]> {
  const [threads, concepts] = await Promise.all([
    prisma.thread.findMany({ select: { title: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
    prisma.concept.findMany({ where: { status: "PUBLISHED", threadId: { not: null } }, select: { term: true, aliases: true } }),
  ]);
  const seen = new Set<string>();
  const out: { title: string; kind: "thread" | "concept" }[] = [];
  const add = (title: string, kind: "thread" | "concept") => {
    const k = linkKey(title);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ title, kind });
  };
  for (const c of concepts) for (const name of [c.term, ...c.aliases]) add(name, "concept");
  for (const t of threads) add(t.title, "thread");
  return out;
}

export type Backlink = { threadId: string | null; title: string; bitId: string; snippet: string };

/** 이 Thread를 [[ ]]로 가리키는 공개 Bit들 (같은 Thread 안의 Bit 제외, Thread당 1건). */
export async function getBacklinks(threadId: string, includePrivate = false): Promise<Backlink[]> {
  // 이 Thread를 가리키는 키를 찾는 용도라 전체 사전을 쓴다. 결과 Bit는 아래에서 공개 여부로 거른다.
  const targets = await getLinkTargets(true);
  const keys = new Set(Object.entries(targets).filter(([, id]) => id === threadId).map(([k]) => k));
  if (keys.size === 0) return [];
  const rows = await prisma.bit.findMany({
    where: {
      // 이 Thread를 가리키는 키로 DB에서 먼저 거른다 — 최신 N건만 보고 놓치지 않게 (Gemini wiki #4)
      OR: [...keys].map((k) => ({ content: { contains: `[[${k}`, mode: "insensitive" as const } })),
      ...(includePrivate ? {} : { private: false }),
      NOT: { threadId },
    },
    select: { id: true, content: true, threadId: true, thread: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const out: Backlink[] = [];
  const seenThreads = new Set<string>();
  for (const r of rows) {
    if (!extractLinkKeys(r.content).some((k) => keys.has(k))) continue;
    if (r.threadId) {
      if (seenThreads.has(r.threadId)) continue;
      seenThreads.add(r.threadId);
    }
    const snippet = r.content.replace(/\s+/g, " ").trim();
    out.push({
      threadId: r.threadId,
      title: r.thread?.title ?? snippet.slice(0, 60),
      bitId: r.id,
      snippet: snippet.slice(0, 140),
    });
  }
  return out;
}
