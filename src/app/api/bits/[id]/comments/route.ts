import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getComments, createComment } from "@/lib/comments";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const comments = await getComments(id);
  return NextResponse.json(comments);
}

const CreateCommentSchema = z.object({
  content: z.string().trim().min(1).max(300),
  author: z.string().trim().max(50).optional(),
  password: z.string().min(1, "Password is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Spam cooldown
  const cooldownCookie = request.cookies.get("comment_cooldown");
  if (cooldownCookie?.value === "1") {
    return NextResponse.json({ error: "Please wait 60 seconds before posting again." }, { status: 429 });
  }

  const bit = await prisma.bit.findUnique({ where: { id }, select: { id: true } });
  if (!bit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Content (1–300 chars) and password are required." }, { status: 400 });
  }

  const comment = await createComment(id, parsed.data.content, parsed.data.author ?? "", parsed.data.password);

  const response = NextResponse.json(comment, { status: 201 });
  response.cookies.set("comment_cooldown", "1", { maxAge: 60, httpOnly: true, sameSite: "strict", path: "/" });
  return response;
}
