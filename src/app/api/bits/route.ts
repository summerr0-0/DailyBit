import { NextResponse } from "next/server";
import { z } from "zod";
import { getBits, createBit } from "@/lib/bits";

export async function GET() {
  const bits = await getBits();
  return NextResponse.json(bits);
}

const CreateBitSchema = z.object({
  content: z.string().trim().min(1).max(500),
  threadId: z.string().optional(),
  aiCollab: z.enum(["NONE", "HINT", "LED"]).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateBitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "내용은 1~500자여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const bit = await createBit({
      content: parsed.data.content,
      threadId: parsed.data.threadId,
      aiCollab: parsed.data.aiCollab,
    });
    return NextResponse.json(bit, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Bit 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
