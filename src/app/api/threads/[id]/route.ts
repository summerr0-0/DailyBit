import { NextResponse } from "next/server";
import { deleteThread, updateThreadTitle } from "@/lib/threads";
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

/** Thread 제목 수정 (오너, 사용자 요청 2026-11-20). body: { title } 1~100자 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  let title: unknown;
  try {
    title = ((await request.json()) as { title?: unknown }).title;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof title !== "string" || title.trim().length === 0 || title.trim().length > 100) {
    return NextResponse.json({ error: "Title must be 1–100 characters." }, { status: 400 });
  }
  const updated = await updateThreadTitle(id, title);
  if (!updated) return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
