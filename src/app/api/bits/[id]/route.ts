import { NextResponse } from "next/server";
import { deleteBit } from "@/lib/bits";

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
  } catch {
    return NextResponse.json(
      { error: "Bit 삭제에 실패했습니다." },
      { status: 500 },
    );
  }
}
