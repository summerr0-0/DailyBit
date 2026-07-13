import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { publishDraft } from "@/lib/scrap-drafts";

// POST /api/scrap/drafts/[id]/publish — 편집된 세그먼트로 발행 (spec: tech-scrap R4.2~4.4)
// 세그먼트 1개 → Bit, 2개 이상 → Thread. 서버가 각 세그먼트 1~500자 재검증.

const PublishSchema = z.object({
  segments: z.array(z.string().trim().min(1).max(500)).min(1),
  threadTitle: z.string().trim().max(100).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "각 세그먼트는 1~500자여야 합니다." },
      { status: 400 },
    );
  }

  const result = await publishDraft(id, {
    segments: parsed.data.segments,
    threadTitle: parsed.data.threadTitle,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 });
    }
    if (result.reason === "too_long") {
      return NextResponse.json(
        { error: `${(result.index ?? 0) + 1}번째 세그먼트가 500자를 초과합니다.`, index: result.index },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "발행할 내용이 비어 있습니다." }, { status: 400 });
  }

  return NextResponse.json({ kind: result.kind, id: result.id }, { status: 201 });
}
