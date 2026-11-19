import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDevUser } from "@/lib/bits";
import { parseTags } from "@/lib/tags";

const Schema = z.object({
  content: z.string().trim().min(1).max(500),
  /** 단독 Bit에서 새 Thread를 만들 때의 제목. 없으면 원래 Bit 앞 60자 */
  title: z.string().trim().min(1).max(100).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id: originalBitId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    const titleIssue = parsed.error.issues.some((i) => i.path[0] === "title");
    return NextResponse.json(
      { error: titleIssue ? "Thread 제목은 1~100자여야 합니다." : "내용은 1~500자여야 합니다." },
      { status: 400 },
    );
  }

  const { content, title: requestedTitle } = parsed.data;
  const author = await ensureDevUser();

  // Load original bit
  const originalBit = await prisma.bit.findUnique({
    where: { id: originalBitId },
    select: { id: true, content: true, threadId: true },
  });
  if (!originalBit) {
    return NextResponse.json({ error: "Bit를 찾을 수 없습니다." }, { status: 404 });
  }

  let threadId = originalBit.threadId;

  // Auto-create thread if the original bit is standalone
  if (!threadId) {
    // 서로게이트 쌍이 잘리지 않게 글자 단위로 자르고, 비면 기본 제목 (Gemini #8)
    const fallback = Array.from(originalBit.content.replace(/\s+/g, " ").trim()).slice(0, 60).join("").trim();
    const title = requestedTitle ?? (fallback || "Thread");
    const thread = await prisma.thread.create({
      data: { title, authorId: author.id },
      select: { id: true },
    });
    threadId = thread.id;

    // Link original bit to the new thread
    await prisma.bit.update({
      where: { id: originalBitId },
      data: { threadId },
    });
  }

  const tags = parseTags(content);

  const newBit = await prisma.bit.create({
    data: { content, authorId: author.id, threadId, tags },
    select: { id: true, content: true, createdAt: true },
  });

  return NextResponse.json(newBit, { status: 201 });
}
