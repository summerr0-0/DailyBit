import { NextResponse } from "next/server";
import { z } from "zod";
import { getThreads, createThread } from "@/lib/threads";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const threads = await getThreads();
  return NextResponse.json(threads);
}

const CreateThreadSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateThreadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "줄기 제목은 1~100자여야 합니다." },
      { status: 400 },
    );
  }

  try {
    const thread = await createThread(parsed.data.title);
    return NextResponse.json(thread, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "탐구 줄기 생성에 실패했습니다." },
      { status: 500 },
    );
  }
}
