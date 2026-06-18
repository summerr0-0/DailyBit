import { NextResponse } from "next/server";
import { toggleRebit } from "@/lib/bits";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;

  let message: string | undefined;
  try {
    const body = (await request.json()) as { message?: string };
    message = body.message;
  } catch {
    // no body — fine
  }

  const result = await toggleRebit(id, message);

  if (result === "not_found") {
    return NextResponse.json({ error: "Bit를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ result }, { status: result === "created" ? 201 : 200 });
}
