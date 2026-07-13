import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createDraft, getDrafts } from "@/lib/scrap-drafts";

// /api/scrap/drafts — 오너 전용 draft 목록/생성 (spec: tech-scrap R3.1, R3.2, R5.1)

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  const drafts = await getDrafts();
  return NextResponse.json(drafts);
}

const CreateDraftSchema = z.object({
  sourceType: z.enum(["URL", "TEXT", "YOUTUBE"]),
  sourceUrl: z.string().trim().nullable().optional(),
  sourceTitle: z.string().trim().nullable().optional(),
  rawExtract: z.string().trim().min(1),
  segments: z.array(z.string().trim().min(1)).min(1),
  suggestedThreadTitle: z.string().trim().nullable().optional(),
});

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "초안 데이터가 올바르지 않습니다." }, { status: 400 });
  }

  const draft = await createDraft({
    sourceType: parsed.data.sourceType,
    sourceUrl: parsed.data.sourceUrl ?? null,
    sourceTitle: parsed.data.sourceTitle ?? null,
    rawExtract: parsed.data.rawExtract,
    segments: parsed.data.segments,
    suggestedThreadTitle: parsed.data.suggestedThreadTitle ?? null,
  });

  return NextResponse.json(draft, { status: 201 });
}
