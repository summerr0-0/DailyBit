import { prisma } from "@/lib/prisma";
import { ensureDevUser, createBit } from "@/lib/bits";
import { createThread } from "@/lib/threads";

// ScrapDraft CRUD + 발행 (spec: tech-scrap T5/T6 / R3, R4).
// segments는 문자열 배열로 저장한다. 각 문자열이 발행 후보 Bit 1개이며, 태그는 본문 인라인 #hashtag로 들어간다.
// 세그먼트 1개면 단일 Bit, 2개 이상이면 Thread로 발행한 뒤 draft를 삭제한다.

const MAX_SEGMENT_CHARS = 500;
const MAX_THREAD_TITLE_CHARS = 100;

export type ScrapSourceType = "URL" | "TEXT" | "YOUTUBE";

export type ScrapDraftDTO = {
  id: string;
  sourceType: ScrapSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
  segments: string[];
  suggestedThreadTitle: string | null;
  createdAt: string;
};

type ScrapDraftRow = {
  id: string;
  sourceType: ScrapSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
  segments: unknown;
  suggestedThreadTitle: string | null;
  createdAt: Date;
};

const DRAFT_SELECT = {
  id: true,
  sourceType: true,
  sourceUrl: true,
  sourceTitle: true,
  rawExtract: true,
  segments: true,
  suggestedThreadTitle: true,
  createdAt: true,
} as const;

function toSegments(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

function toDraftDTO(row: ScrapDraftRow): ScrapDraftDTO {
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    rawExtract: row.rawExtract,
    segments: toSegments(row.segments),
    suggestedThreadTitle: row.suggestedThreadTitle,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createDraft(input: {
  sourceType: ScrapSourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  rawExtract: string;
  segments: string[];
  suggestedThreadTitle: string | null;
}): Promise<ScrapDraftDTO> {
  const author = await ensureDevUser();
  const row = await prisma.scrapDraft.create({
    data: {
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle,
      rawExtract: input.rawExtract,
      segments: input.segments,
      suggestedThreadTitle: input.suggestedThreadTitle,
      authorId: author.id,
    },
    select: DRAFT_SELECT,
  });
  return toDraftDTO(row as ScrapDraftRow);
}

/** 오너 전용 draft 목록 (최신순). */
export async function getDrafts(): Promise<ScrapDraftDTO[]> {
  const author = await ensureDevUser();
  const rows = await prisma.scrapDraft.findMany({
    where: { authorId: author.id },
    orderBy: { createdAt: "desc" },
    select: DRAFT_SELECT,
  });
  return rows.map((r) => toDraftDTO(r as ScrapDraftRow));
}

export async function getDraft(id: string): Promise<ScrapDraftDTO | null> {
  const row = await prisma.scrapDraft.findUnique({ where: { id }, select: DRAFT_SELECT });
  return row ? toDraftDTO(row as ScrapDraftRow) : null;
}

/** draft를 삭제(폐기)한다. 대상이 없으면 false. */
export async function deleteDraft(id: string): Promise<boolean> {
  const { count } = await prisma.scrapDraft.deleteMany({ where: { id } });
  return count > 0;
}

export type PublishResult =
  | { ok: true; kind: "bit" | "thread"; id: string }
  | { ok: false; reason: "not_found" | "empty" | "too_long"; index?: number };

/**
 * 편집된 세그먼트로 draft를 발행한다.
 * - 서버 재검증(D13): 각 세그먼트 1~500자. 초과 시 { too_long, index } 반환(아무것도 발행 안 함).
 * - 세그먼트 1개 → 단일 Bit, 2개 이상 → Thread + Bit들. 모두 aiCollab=LED.
 * - 성공 시 draft 삭제.
 */
export async function publishDraft(
  id: string,
  input: { segments: string[]; threadTitle?: string | null },
): Promise<PublishResult> {
  const existing = await prisma.scrapDraft.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, reason: "not_found" };

  const segments = input.segments.map((s) => s.trim());
  if (segments.length === 0 || segments.every((s) => s.length === 0)) {
    return { ok: false, reason: "empty" };
  }
  const overIndex = segments.findIndex((s) => s.length === 0 || s.length > MAX_SEGMENT_CHARS);
  if (overIndex !== -1) return { ok: false, reason: "too_long", index: overIndex };

  if (segments.length === 1) {
    const bit = await createBit({ content: segments[0], aiCollab: "LED" });
    await deleteDraft(id);
    return { ok: true, kind: "bit", id: bit.id };
  }

  const title = (input.threadTitle?.trim() || segments[0]).slice(0, MAX_THREAD_TITLE_CHARS);
  const thread = await createThread(title);
  for (const content of segments) {
    await createBit({ content, threadId: thread.id, aiCollab: "LED" });
  }
  await deleteDraft(id);
  return { ok: true, kind: "thread", id: thread.id };
}
