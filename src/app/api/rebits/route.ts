import { NextResponse } from "next/server";
import { z } from "zod";
import { addRebit, removeRebit } from "@/lib/rebits";

const RebitSchema = z.object({
  bitId: z.string().min(1),
});

async function parseBitId(request: Request): Promise<string | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  const parsed = RebitSchema.safeParse(body);
  return parsed.success ? parsed.data.bitId : null;
}

export async function POST(request: Request) {
  const bitId = await parseBitId(request);
  if (!bitId) {
    return NextResponse.json({ error: "bitId가 필요합니다." }, { status: 400 });
  }

  try {
    await addRebit(bitId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Rebit에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const bitId = await parseBitId(request);
  if (!bitId) {
    return NextResponse.json({ error: "bitId가 필요합니다." }, { status: 400 });
  }

  try {
    await removeRebit(bitId);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Rebit 취소에 실패했습니다." },
      { status: 500 },
    );
  }
}
