import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDevUser } from "@/lib/bits";
import { parseTags } from "@/lib/tags";

const Schema = z.object({
  content: z.string().trim().min(1).max(500),
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
    return NextResponse.json({ error: "내용은 1~500자여야 합니다." }, { status: 400 });
  }

  const { content } = parsed.data;
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
    const title = originalBit.content.slice(0, 60).replace(/\n/g, " ").trim();
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
