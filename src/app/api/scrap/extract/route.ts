import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { extractSource } from "@/lib/scrap-extract";

// POST /api/scrap/extract — 소스에서 요약용 원문 추출 (spec: tech-scrap R1.1~1.5, R5.1)
// 성공: 200 { sourceType, sourceUrl, sourceTitle, rawExtract }
// fetch 실패/자막 없음: 422 { reason, message } → UI가 텍스트 fallback 유도
// 잘못된 입력: 400

const ExtractSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("URL"), url: z.string().trim().min(1) }),
  z.object({ sourceType: z.literal("TEXT"), rawExtract: z.string().trim().min(1) }),
]);

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExtractSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "URL 또는 텍스트를 입력해 주세요." }, { status: 400 });
  }

  const result = await extractSource(parsed.data);
  if (!result.ok) {
    const status = result.reason === "invalid_input" ? 400 : 422;
    return NextResponse.json({ reason: result.reason, message: result.message }, { status });
  }

  return NextResponse.json({
    sourceType: result.sourceType,
    sourceUrl: result.sourceUrl,
    sourceTitle: result.sourceTitle,
    rawExtract: result.rawExtract,
  });
}
