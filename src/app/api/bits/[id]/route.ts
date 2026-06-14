import { NextResponse } from "next/server";
import { deleteBit, toggleBitPin } from "@/lib/bits";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
