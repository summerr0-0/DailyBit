import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { summarize } from "@/lib/scrap-ai";

// POST /api/scrap/summarize — 추출 원문을 AI 요약 세그먼트로 변환 (spec: tech-scrap R2)
// 성공: 200 { segments, suggestedThreadTitle }
// AI 실패/빈 출력: 502 { message } (부분 draft 없음)

const SummarizeSchema = z.object({
  rawExtract: z.string().trim().min(1),
  sourceTitle: z.string().trim().optional().nullable(),
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

  const parsed = SummarizeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "요약할 원문이 필요합니다." }, { status: 400 });
  }

  const result = await summarize(parsed.data.rawExtract, parsed.data.sourceTitle);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 502 });
  }

  return NextResponse.json({
    segments: result.segments,
    suggestedThreadTitle: result.suggestedThreadTitle,
  });
}
