import { NextResponse } from "next/server";
import { deleteThread } from "@/lib/threads";
import { requireAuth } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const deleted = await deleteThread(id);
  if (!deleted) {
    return NextResponse.json({ error: "Thread를 찾을 수 없습니다." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
