import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteDraft } from "@/lib/scrap-drafts";

// DELETE /api/scrap/drafts/[id] — draft 폐기 (spec: tech-scrap R3.4)

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const deleted = await deleteDraft(id);
  if (!deleted) {
    return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
