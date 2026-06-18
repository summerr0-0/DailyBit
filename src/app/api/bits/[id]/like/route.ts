import { NextResponse } from "next/server";
import { addLike, removeLike } from "@/lib/likes";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const bit = await prisma.bit.findUnique({ where: { id }, select: { id: true } });
  if (!bit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id: likeId, count } = await addLike(id);
  return NextResponse.json({ likeId, count }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let likeId = "";
  try {
    const body = (await request.json()) as { likeId?: string };
    likeId = body.likeId ?? "";
  } catch { /* no body */ }

  if (!likeId) return NextResponse.json({ error: "likeId required" }, { status: 400 });

  const count = await removeLike(likeId, id);
  return NextResponse.json({ count });
}
