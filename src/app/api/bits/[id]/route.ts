import { NextResponse } from "next/server";
import { deleteBit, toggleBitPin, toggleBitPrivate, updateBitContent, BIT_MAX_LENGTH } from "@/lib/bits";
import { requireAuth } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;

  let action = "pin";
  let content: unknown;
  try {
    const body = (await request.json()) as { action?: string; content?: unknown };
    if (body.action) action = body.action;
    content = body.content;
  } catch { /* no body — default to "pin" for backwards compat */ }

  // 본문 수정 (Thread 편집, 사용자 요청 2026-11-20)
  if (action === "edit") {
    if (typeof content !== "string" || content.trim().length === 0 || content.trim().length > BIT_MAX_LENGTH) {
      return NextResponse.json({ error: `Content must be 1–${BIT_MAX_LENGTH} characters.` }, { status: 400 });
    }
    const updated = await updateBitContent(id, content);
    if (!updated) return NextResponse.json({ error: "Bit not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "private") {
    const found = await toggleBitPrivate(id);
    if (!found) return NextResponse.json({ error: "Bit not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const found = await toggleBitPin(id);
  if (!found) {
    return NextResponse.json({ error: "Bit를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  try {
    const deleted = await deleteBit(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Bit를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error(`Bit 삭제 실패 (id=${id}):`, error);
    return NextResponse.json(
      { error: "Bit 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
