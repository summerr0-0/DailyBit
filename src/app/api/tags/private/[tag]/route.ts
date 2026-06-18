import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { removePrivateTag } from "@/lib/privateTags";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tag: string }> },
) {
  const authError = await requireAuth();
  if (authError) return authError;
  const { tag } = await params;
  await removePrivateTag(tag);
  return new NextResponse(null, { status: 204 });
}
